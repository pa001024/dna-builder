import { inflateSync } from "node:zlib"
import { MeshoptSimplifier } from "meshoptimizer"
import {
    appendAccessors,
    appendBufferView,
    COMPONENT_SIZE,
    type GlbDocument,
    type GltfMeshPrimitive,
    readAccessorBytes,
    TYPE_COMPONENTS,
} from "../../apps/web/src/utils/skin-model-glb"

export interface OptimizeOptions {
    textureQuality?: number
    lossless?: (name: string) => boolean
    /** 默认对遮罩/混合/SDF 走无损；法线有损 90 已看不出差异，改无损会让体积接近翻倍。 */
    losslessDefaults?: boolean
    simplifyRatio?: number
    simplifyRatios?: Record<string, number>
    simplifySkip?: (mesh: string, material: string) => boolean
    simplifyError?: number
    convertTextures?: boolean
    /** 贴图编码器，默认走 Bun.Image 的 WebP；测试里替换掉以避开运行时依赖。 */
    encodeTexture?: (bytes: Uint8Array, lossless: boolean) => Promise<Uint8Array>
    dropTangent?: boolean
    dropExtraUvs?: boolean
}

export interface OptimizeReport {
    textures: { name: string; before: number; after: number }[]
    geometry: { mesh: string; before: number; after: number }[]
    bytes: { before: number; after: number }
}

const TRIANGLES = 34962
const INDICES = 34963
const MASK = "COLOR_0"

function floats(document: GlbDocument, index: number): Float32Array {
    const bytes = readAccessorBytes(document, index)
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}

/** 把数值型 accessor 归一化成 float 采样，供简化误差权重使用。 */
function attributeFloats(document: GlbDocument, index: number): Float32Array {
    const accessor = document.json.accessors[index]
    const bytes = readAccessorBytes(document, index)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    if (accessor.componentType === 5126) return new Float32Array(buffer)
    const count = accessor.count * TYPE_COMPONENTS[accessor.type]
    const output = new Float32Array(count)
    const scale =
        accessor.componentType === 5121
            ? 1 / 255
            : accessor.componentType === 5123
              ? 1 / 65535
              : accessor.componentType === 5120
                ? 1 / 127
                : accessor.componentType === 5122
                  ? 1 / 32767
                  : 1
    const raw = bytes
    for (let index = 0; index < count; index++) {
        const offset = index * COMPONENT_SIZE[accessor.componentType]
        const value =
            accessor.componentType === 5121
                ? raw[offset]
                : accessor.componentType === 5123
                  ? raw[offset] | (raw[offset + 1] << 8)
                  : accessor.componentType === 5120
                    ? new Int8Array(buffer)[offset]
                    : accessor.componentType === 5122
                      ? new Int16Array(buffer)[index]
                      : raw[offset]
        output[index] = accessor.normalized ? value * scale : value
    }
    return output
}

function indices(document: GlbDocument, index: number): Uint32Array {
    const accessor = document.json.accessors[index]
    const bytes = readAccessorBytes(document, index)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    if (accessor.componentType === 5121) return Uint32Array.from(new Uint8Array(buffer))
    if (accessor.componentType === 5123) return Uint32Array.from(new Uint16Array(buffer))
    if (accessor.componentType === 5125) return new Uint32Array(buffer)
    throw new Error(`Unsupported index component type ${accessor.componentType}`)
}

function narrow(values: Uint32Array): { data: Uint8Array | Uint16Array | Uint32Array; componentType: number } {
    const max = values.reduce((value, current) => Math.max(value, current), 0)
    if (max <= 0xff) return { data: Uint8Array.from(values), componentType: 5121 }
    if (max <= 0xffff) return { data: Uint16Array.from(values), componentType: 5123 }
    return { data: values, componentType: 5125 }
}

interface Simplification {
    attributes: Record<string, { data: ArrayBufferView; type: string; componentType: number; normalized?: boolean; count: number }>
    indices: Uint32Array
}

/** 用位置、法线、UV0、顶点遮罩联合误差简化单个 primitive，并压实成独立顶点流。 */
async function simplify(
    document: GlbDocument,
    primitive: GltfMeshPrimitive,
    ratio: number,
    error: number
): Promise<Simplification | undefined> {
    if (primitive.indices === undefined || primitive.attributes.POSITION === undefined) return undefined
    const index = indices(document, primitive.indices)
    if (index.length < 30) return undefined
    const position = floats(document, primitive.attributes.POSITION)
    if (new Set(position).size < 4) return undefined
    await MeshoptSimplifier.ready
    if (!MeshoptSimplifier.supported) return undefined
    const vertexCount = position.length / 3
    const sources: { name: string; components: number; weight: number; data: Float32Array }[] = []
    if (primitive.attributes.TEXCOORD_0 !== undefined)
        sources.push({ name: "TEXCOORD_0", components: 2, weight: 2, data: attributeFloats(document, primitive.attributes.TEXCOORD_0) })
    if (primitive.attributes.NORMAL !== undefined)
        sources.push({ name: "NORMAL", components: 3, weight: 2, data: attributeFloats(document, primitive.attributes.NORMAL) })
    if (primitive.attributes[MASK] !== undefined)
        sources.push({ name: MASK, components: 4, weight: 8, data: attributeFloats(document, primitive.attributes[MASK]) })
    const stride = sources.reduce((sum, source) => sum + source.components, 0)
    const attributes = new Float32Array(vertexCount * stride)
    for (let vertex = 0; vertex < vertexCount; vertex++) {
        let offset = vertex * stride
        for (const source of sources)
            for (let channel = 0; channel < source.components; channel++)
                attributes[offset++] = source.data[vertex * source.components + channel] ?? 0
    }
    const target = Math.max(3, Math.floor((index.length * ratio) / 3) * 3)
    const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
        Uint32Array.from(index),
        position,
        3,
        attributes,
        stride,
        sources.map(source => source.weight),
        null,
        target,
        error,
        ["LockBorder"]
    )
    if (simplified.length >= index.length) return undefined
    const [remap, unique] = MeshoptSimplifier.compactMesh(simplified)
    const sourceOf = new Uint32Array(unique)
    for (let vertex = 0; vertex < vertexCount; vertex++) {
        const target = remap[vertex]
        if (target !== 0xffffffff && target < unique) sourceOf[target] = vertex
    }
    const compacted: Simplification["attributes"] = {}
    for (const [name, accessor] of Object.entries(primitive.attributes)) {
        const meta = document.json.accessors[accessor]
        const size = TYPE_COMPONENTS[meta.type]
        if (meta.componentType === 5126) {
            const source = floats(document, accessor)
            const data = new Float32Array(unique * size)
            for (let vertex = 0; vertex < unique; vertex++)
                for (let channel = 0; channel < size; channel++) data[vertex * size + channel] = source[sourceOf[vertex] * size + channel]
            compacted[name] = { data, type: meta.type, componentType: 5126, count: unique }
            continue
        }
        const source = readAccessorBytes(document, accessor)
        const element = COMPONENT_SIZE[meta.componentType] * size
        const data = new Uint8Array(unique * element)
        for (let vertex = 0; vertex < unique; vertex++)
            data.set(source.subarray(sourceOf[vertex] * element, (sourceOf[vertex] + 1) * element), vertex * element)
        compacted[name] = { data, type: meta.type, componentType: meta.componentType, normalized: !!meta.normalized, count: unique }
    }
    // compactMesh 已原地把索引重排为紧凑编号，remap 只用于重排顶点属性。
    return { attributes: compacted, indices: Uint32Array.from(simplified) }
}

function maskBytes(document: GlbDocument, index: number): { data: Uint8Array; normalized: boolean; count: number } {
    const accessor = document.json.accessors[index]
    const bytes = readAccessorBytes(document, index)
    if (accessor.componentType === 5126) {
        const source = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
        const data = new Uint8Array(source.length)
        for (let i = 0; i < source.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(source[i] * 255)))
        return { data, normalized: true, count: accessor.count }
    }
    return { data: bytes, normalized: !!accessor.normalized, count: accessor.count }
}

/** 还原 PNG 的行滤波，返回去掉滤波字节后的像素。 */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
    const stride = width * bpp
    const pixels = new Uint8Array(height * stride)
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)]
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
        const current = pixels.subarray(y * stride, (y + 1) * stride)
        const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : undefined
        for (let x = 0; x < stride; x++) {
            const left = x >= bpp ? current[x - bpp] : 0
            const up = previous === undefined ? 0 : previous[x]
            const upLeft = previous === undefined || x < bpp ? 0 : previous[x - bpp]
            let value = line[x]
            if (filter === 1) value += left
            else if (filter === 2) value += up
            else if (filter === 3) value += (left + up) >> 1
            else if (filter === 4) {
                const estimate = left + up - upLeft
                const toLeft = Math.abs(estimate - left)
                const toUp = Math.abs(estimate - up)
                const toUpLeft = Math.abs(estimate - upLeft)
                value += toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft
            }
            current[x] = value & 255
        }
    }
    return pixels
}

/** 遮罩/混合/SDF 类贴图默认无损；命名约定与游戏资产一致。 */
export function isMaskTexture(name: string): boolean {
    return /_[MA]$|Mask$|SDF$/.test(name)
}

/**
 * 底图 B 通道被当作剪影遮罩的材质：Wing 系列（裙摆/披风）和丝绸层（丝袜藤蔓、手套、鞋）。
 * 这些贴图的 RGB 参与裁切，有损压缩会让阈值附近的纹素翻转，多裁或少裁，必须无损。
 */
export function cutoutBaseNames(document: GlbDocument): Set<string> {
    const names = new Set<string>()
    for (const material of document.json.materials ?? []) {
        const data = material.extras?.dnaColorize
        if (!data || data.kind === "shadow") continue
        const silk = data.textures?.丝绸混合贴图 !== undefined
        if (!silk && !(data.parent ?? "").includes("M_Player_Wing_ShopSkin")) continue
        const texture = data.textures?.时装BaseClor ?? data.textures?.颜色贴图
        if (texture === undefined) continue
        const image = document.json.images?.[document.json.textures?.[texture]?.source]
        if (image?.name) names.add(image.name)
    }
    return names
}

/** 解 PNG 求 alpha 均值：返回 255 表示整张不透明（或不是可解析的 8 位 PNG）。 */
export function averageAlpha(png: Uint8Array): number {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    let offset = 8
    let width = 0
    let height = 0
    let depth = 0
    let colorType = 0
    let interlace = 0
    const chunks: Buffer[] = []
    while (offset + 8 <= png.length) {
        const length = view.getUint32(offset)
        const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7])
        if (type === "IHDR") {
            width = view.getUint32(offset + 8)
            height = view.getUint32(offset + 12)
            depth = png[offset + 16]
            colorType = png[offset + 17]
            interlace = png[offset + 20]
        } else if (type === "IDAT") chunks.push(Buffer.from(png.subarray(offset + 8, offset + 8 + length)))
        if (type === "IEND") break
        offset += 12 + length
    }
    const bpp = colorType === 6 ? 4 : colorType === 4 ? 2 : 0
    if (bpp === 0 || depth !== 8 || interlace !== 0) return 255
    const pixels = unfilter(new Uint8Array(inflateSync(Buffer.concat(chunks))), width, height, bpp)
    let total = 0
    for (let i = bpp - 1; i < pixels.length; i += bpp) total += pixels[i]
    return total / (width * height)
}

/** 重打包 GLB：WebP 贴图、删除渲染器不采样的 TANGENT/UV1..7、可选的面数精简与紧凑顶点流。 */
export async function optimizeGlb(document: GlbDocument, options: OptimizeOptions = {}): Promise<OptimizeReport> {
    const quality = options.textureQuality ?? 95
    const ratio = options.simplifyRatio ?? 1
    const before = document.binary.length + new TextEncoder().encode(JSON.stringify(document.json)).length
    const views = document.json.bufferViews
    const accessors = document.json.accessors
    const binary = document.binary
    const source: GlbDocument = { json: { ...document.json, bufferViews: views, accessors }, binary }
    const report: OptimizeReport = { textures: [], geometry: [], bytes: { before, after: 0 } }
    document.json.bufferViews = []
    document.json.accessors = []
    document.binary = new Uint8Array(0)

    for (const [index, image] of (document.json.images ?? []).entries()) {
        // 导出器产出的贴图必带 bufferView；外来文档缺视图时与之前一致直接抛错。
        const sourceView = views[image.bufferView!]
        const start = sourceView.byteOffset ?? 0
        const original = binary.subarray(start, start + sourceView.byteLength)
        let encoded = original
        if (options.convertTextures !== false) {
            const lossless = options.lossless?.(image.name ?? "") ?? (options.losslessDefaults !== false && isMaskTexture(image.name ?? ""))
            // WebP 会把透明像素的 RGB 清零（Bun 没有暴露 libwebp 的 exact 开关），而遮罩贴图的
            // 剪影恰好写在 alpha=0 的区域里：转码后 RGB 全毁，整件衣服会被裁没，必须原样保留 PNG。
            if (!lossless || averageAlpha(original) > 250) {
                // exact 保留透明像素的 RGB，避免 alpha 边缘在 WebP 压缩后渗色；bun-types 尚未收录该选项。
                const webp = { quality, lossless: false, exact: true } as { quality?: number; lossless?: boolean }
                const encode =
                    options.encodeTexture ?? (async (bytes, alpha) => new Bun.Image(bytes).webp(alpha ? { lossless: true } : webp).bytes())
                encoded = new Uint8Array(await encode(original, lossless))
                image.mimeType = "image/webp"
            }
        }
        if (image.name === undefined) image.name = `texture_${index}`
        image.bufferView = appendBufferView(document, encoded)
        report.textures.push({ name: image.name ?? "", before: original.length, after: encoded.length })
    }

    for (const mesh of document.json.meshes ?? []) {
        for (const primitive of mesh.primitives) {
            const attributeIndices = { ...primitive.attributes }
            const triangles = primitive.indices === undefined ? 0 : indices(source, primitive.indices).length / 3
            let result: Simplification | undefined
            const meshRatio = options.simplifyRatios?.[mesh.name ?? ""] ?? ratio
            const material = document.json.materials?.[primitive.material]?.name ?? ""
            if (meshRatio < 1 && !options.simplifySkip?.(mesh.name ?? "", material))
                result = await simplify(source, primitive, meshRatio, options.simplifyError ?? 0.005)
            const attributes: Record<string, number> = {}
            for (const [name, accessor] of Object.entries(attributeIndices)) {
                if (options.dropTangent !== false && name === "TANGENT") continue
                // UV2 以上游戏侧也只在特效里用，染色只认 UV0/UV1：UV1 按选项保留，UV2+ 一律丢掉。
                if (/^TEXCOORD_[2-9]$/.test(name)) continue
                if (options.dropExtraUvs !== false && name === "TEXCOORD_1") continue
                const meta = accessors[accessor]
                if (result) {
                    const data = result.attributes[name]
                    if (!data) continue
                    const [index] = appendAccessors(document, [{ ...data, target: TRIANGLES }])
                    attributes[name] = index
                    continue
                }
                if (name === MASK) {
                    const mask = maskBytes(source, accessor)
                    const [index] = appendAccessors(document, [
                        { data: mask.data, type: meta.type, componentType: 5121, normalized: true, count: mask.count, target: TRIANGLES },
                    ])
                    attributes[name] = index
                    continue
                }
                const [index] = appendAccessors(document, [
                    {
                        data: readAccessorBytes(source, accessor),
                        type: meta.type,
                        componentType: meta.componentType,
                        count: meta.count,
                        normalized: meta.normalized,
                        min: meta.min,
                        max: meta.max,
                        target: TRIANGLES,
                    },
                ])
                attributes[name] = index
            }
            primitive.attributes = attributes
            // 简化没跑（ratio>=1 或被跳过）时直接复用原索引；几何 primitive 必带 indices，与之前一致。
            const geometry = result?.indices ?? indices(source, primitive.indices!)
            const narrowed = narrow(geometry)
            const [index] = appendAccessors(document, [
                { data: narrowed.data, type: "SCALAR", componentType: narrowed.componentType, count: geometry.length, target: INDICES },
            ])
            document.json.accessors[index].min = [0]
            document.json.accessors[index].max = [geometry.reduce((value, current) => Math.max(value, current), 0)]
            primitive.indices = index
            report.geometry.push({ mesh: mesh.name ?? "", before: triangles, after: geometry.length / 3 })
        }
    }

    for (const skin of document.json.skins ?? []) {
        if (skin.inverseBindMatrices === undefined) continue
        const meta = accessors[skin.inverseBindMatrices]
        skin.inverseBindMatrices = appendAccessors(document, [
            {
                data: readAccessorBytes(source, skin.inverseBindMatrices),
                type: meta.type,
                componentType: meta.componentType,
                count: meta.count,
            },
        ])[0]
    }
    for (const animation of document.json.animations ?? []) {
        for (const sampler of animation.samplers) {
            for (const key of ["input", "output"]) {
                const accessor = sampler[key]
                if (accessor === undefined) continue
                const meta = accessors[accessor]
                sampler[key] = appendAccessors(document, [
                    {
                        data: readAccessorBytes(source, accessor),
                        type: meta.type,
                        componentType: meta.componentType,
                        count: meta.count,
                        min: meta.min,
                        max: meta.max,
                    },
                ])[0]
            }
        }
    }
    report.bytes.after = document.binary.length + new TextEncoder().encode(JSON.stringify(document.json)).length
    return report
}
