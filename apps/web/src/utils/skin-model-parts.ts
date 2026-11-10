import { appendBinary, type GlbDocument } from "./skin-model-glb"

/**
 * 从导出的完整皮肤 GLB 里切出单个部件网格。
 *
 * 系列皮肤是「公共体型 + 角色头发/脸」拼出来的，同一个体型会被几十个皮肤复用；
 * 若每个皮肤各存一份完整模型，公共体型的几何与贴图会被重复打包几十次。
 * 这里按网格名切出独立 GLB，运行期再用 `mergeGlbs` 按 `PartModelsId` 拼回去。
 */

export interface PartSplit {
    /** 部件名（网格节点名，例如 `QNF00_TP01_SM`） */
    name: string
    /** 独立 GLB */
    glb: GlbDocument
}

/**
 * @description 列出文档里所有网格节点名。
 * 导出器的网格名放在 `meshes[i].name` 上，节点本身可能没有名字。
 * 没有图元的网格（效果网格里贴片全被剔除）也跳过，否则会发布一个空部件。
 * @param document 完整皮肤 GLB
 * @returns 网格名列表
 */
export function meshNames(document: GlbDocument): string[] {
    const json = document.json as Record<string, any>
    return (json.nodes ?? [])
        .filter((node: Record<string, any>) => node.mesh !== undefined)
        .map((node: Record<string, any>) => node.mesh)
        .filter((meshIndex: number) => (json.meshes?.[meshIndex]?.primitives ?? []).length > 0)
        .map((meshIndex: number) => meshName(json, meshIndex))
        .filter((name: string | undefined): name is string => typeof name === "string")
}

/** 取网格节点对应的网格名：优先节点名，其次网格名。 */
function meshName(json: Record<string, any>, meshIndex: number): string | undefined {
    return json.meshes?.[meshIndex]?.name
}

/**
 * @description 按网格名切出独立 GLB：保留该网格的节点、蒙皮、材质、贴图与它引用的骨架。
 * @param document 完整皮肤 GLB
 * @param name 网格名
 * @returns 只含该部件的 GLB；名字不存在时 undefined
 */
export function splitMesh(document: GlbDocument, name: string): GlbDocument | undefined {
    const json = document.json as Record<string, any>
    const nodes = (json.nodes ?? []) as Record<string, any>[]
    const target = nodes.find(node => node.mesh !== undefined && meshName(json, node.mesh) === name)
    if (!target) return undefined

    // 需要保留的节点：网格节点本身 + 它的骨架关节 + 关节的父链
    const keep = new Set<number>()
    const queue = [nodes.indexOf(target)]
    while (queue.length) {
        const index = queue.pop()!
        if (keep.has(index)) continue
        keep.add(index)
        for (const child of nodes[index].children ?? []) queue.push(child)
    }
    // 蒙皮关节及其父链。父链必须一路保留到根：骨骼树要挂在场景根下，
    // 否则节点存在但不在场景里，动画按名字找不到骨骼、蒙皮也不会更新。
    const skin = target.skin !== undefined ? json.skins[target.skin] : undefined
    const roots = new Set<number>()
    if (skin) {
        for (const joint of skin.joints as number[]) {
            let cursor: number | undefined = joint
            while (cursor !== undefined) {
                keep.add(cursor)
                const parent = parentOf(nodes, cursor)
                if (parent === undefined) roots.add(cursor)
                cursor = parent
            }
        }
    }
    // 场景根：网格节点所在的最顶层祖先
    let top: number | undefined = nodes.indexOf(target)
    while (true) {
        const parent = parentOf(nodes, top)
        if (parent === undefined) break
        top = parent
    }
    if (top !== undefined) {
        keep.add(top)
        roots.add(top)
    }
    return extractNodes(document, keep, roots.size ? roots : new Set([nodes.indexOf(target)]))
}

/**
 * @description 保留指定节点集合，重建索引表。用于部件拆分与运行期合并前的裁剪。
 * @param document 源文档
 * @param keep 要保留的节点索引
 * @param roots 场景根节点（必须都在 keep 里）
 * @returns 裁剪后的 GLB
 */
export function extractNodes(document: GlbDocument, keep: Set<number>, roots: Set<number>): GlbDocument {
    const source = structuredClone(document.json) as Record<string, any>
    const nodes = (source.nodes ?? []) as Record<string, any>[]
    const order = [...keep].sort((a, b) => a - b)
    const nodeRemap = new Map<number, number>()
    order.forEach((index, position) => nodeRemap.set(index, position))

    const meshes = new Set<number>()
    const skins = new Set<number>()
    const materials = new Set<number>()
    for (const index of order) {
        const node = nodes[index]
        if (node.mesh !== undefined) meshes.add(node.mesh)
        if (node.skin !== undefined) skins.add(node.skin)
    }
    for (const meshIndex of meshes) {
        for (const primitive of (source.meshes[meshIndex].primitives ?? []) as Record<string, any>[]) {
            if (primitive.material !== undefined) materials.add(primitive.material)
        }
    }

    const accessors = new Set<number>()
    const images = new Set<number>()
    for (const meshIndex of meshes) {
        for (const primitive of (source.meshes[meshIndex].primitives ?? []) as Record<string, any>[]) {
            for (const key of Object.keys(primitive.attributes ?? {})) accessors.add(primitive.attributes[key])
            if (primitive.indices !== undefined) accessors.add(primitive.indices)
            for (const target of primitive.targets ?? []) for (const key of Object.keys(target)) accessors.add(target[key])
        }
    }
    for (const skinIndex of skins) {
        const skin = source.skins[skinIndex]
        if (skin.inverseBindMatrices !== undefined) accessors.add(skin.inverseBindMatrices)
    }
    for (const materialIndex of materials) {
        const material = source.materials[materialIndex]
        walkTextures(material, textureIndex => {
            const image = source.textures[textureIndex]?.source
            if (image !== undefined) images.add(image)
        })
        // 染色着色器要用的贴图（混合/丝绸混合/法线…）只登记在 dnaColorize.textures 里，
        // glTF 材质字段只引用底图；不把这些一起带上，拆分后着色器会缺贴图。
        for (const textureIndex of Object.values(material.extras?.dnaColorize?.textures ?? {})) {
            if (typeof textureIndex !== "number") continue
            const image = source.textures[textureIndex]?.source
            if (image !== undefined) images.add(image)
        }
    }

    const accessorRemap = remap(accessors)
    const meshRemap = remap(meshes)
    const skinRemap = remap(skins)
    const materialRemap = remap(materials)
    const imageRemap = remap(images)
    const textureRemap = new Map<number, number>()
    const keptTextures: Record<string, any>[] = []
    for (const [textureIndex, texture] of (source.textures ?? []).entries()) {
        if (texture.source === undefined || !imageRemap.has(texture.source)) continue
        textureRemap.set(textureIndex, keptTextures.length)
        keptTextures.push({ ...texture, source: imageRemap.get(texture.source) })
    }

    // 视图：几何/逆绑定矩阵的 accessor 视图 + 保留贴图的视图
    const views = new Set<number>()
    for (const accessorIndex of accessorRemap.keys()) {
        const view = source.accessors[accessorIndex]?.bufferView
        if (view !== undefined) views.add(view)
    }
    for (const imageIndex of imageRemap.keys()) {
        const view = source.images[imageIndex]?.bufferView
        if (view !== undefined) views.add(view)
    }
    const viewRemap = remap(views)

    const keptAccessors = [...accessorRemap.keys()].map(index => {
        const accessor = structuredClone(source.accessors[index]) as Record<string, any>
        if (accessor.bufferView !== undefined) accessor.bufferView = viewRemap.get(accessor.bufferView)!
        return accessor
    })
    const keptNodes = order.map(index => {
        const node = structuredClone(nodes[index]) as Record<string, any>
        if (node.mesh !== undefined) node.mesh = meshRemap.get(node.mesh)!
        if (node.skin !== undefined) node.skin = skinRemap.get(node.skin)!
        if (node.children)
            node.children = node.children.filter((child: number) => nodeRemap.has(child)).map((child: number) => nodeRemap.get(child)!)
        return node
    })
    const keptMeshes = [...meshRemap.keys()].map(index => {
        const mesh = structuredClone(source.meshes[index]) as Record<string, any>
        for (const primitive of mesh.primitives) {
            for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = accessorRemap.get(primitive.attributes[key])!
            if (primitive.indices !== undefined) primitive.indices = accessorRemap.get(primitive.indices)!
            if (primitive.material !== undefined) primitive.material = materialRemap.get(primitive.material)!
        }
        return mesh
    })
    const keptSkins = [...skinRemap.keys()].map(index => {
        const skin = structuredClone(source.skins[index]) as Record<string, any>
        skin.joints = skin.joints.map((joint: number) => nodeRemap.get(joint)!)
        if (skin.skeleton !== undefined) skin.skeleton = nodeRemap.get(skin.skeleton)!
        if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorRemap.get(skin.inverseBindMatrices)!
        return skin
    })
    const keptMaterials = [...materialRemap.keys()].map(index => {
        const material = structuredClone(source.materials[index]) as Record<string, any>
        remapMaterialTextures(material, textureIndex => textureRemap.get(textureIndex))
        // 染色元数据里的贴图槽是数字索引，拆分后贴图表被重排，必须一起改；
        // 被裁掉的贴图槽直接删掉，否则前端会去取不存在的纹理。
        remapDyeTextureSlots(material.extras?.dnaColorize?.textures, textureIndex => textureRemap.get(textureIndex))
        return material
    })

    // 只重打包用到的视图：拆分后若仍挂着整块二进制，每个部件都会带上全量几何
    const parts: Uint8Array[] = []
    let cursor = 0
    const keptViews = [...viewRemap.keys()].map(index => {
        const view = source.bufferViews[index] as Record<string, any>
        const start = view.byteOffset ?? 0
        const bytes = document.binary.subarray(start, start + view.byteLength)
        const offset = Math.ceil(cursor / 4) * 4
        parts.push(bytes)
        cursor = offset + bytes.length
        return { ...view, buffer: 0, byteOffset: offset }
    })
    const binary = new Uint8Array(cursor)
    let write = 0
    for (const [index, bytes] of parts.entries()) {
        write = keptViews[index].byteOffset
        binary.set(bytes, write)
    }

    const out: Record<string, any> = {
        ...source,
        scenes: [{ nodes: [...roots].map(index => nodeRemap.get(index)!) }],
        scene: 0,
        nodes: keptNodes,
        meshes: keptMeshes,
        skins: keptSkins,
        materials: keptMaterials,
        accessors: keptAccessors,
        textures: keptTextures,
        images: [...imageRemap.keys()].map(index => ({
            ...source.images[index],
            bufferView: viewRemap.get(source.images[index].bufferView)!,
        })),
        bufferViews: keptViews,
        buffers: [{ byteLength: binary.length }],
    }
    // 动画不属于单个部件，拆分时不带走
    delete out.animations
    delete out.samplers
    return { json: out, binary }
}

/** 节点索引 → 父节点索引 */
function parentOf(nodes: Record<string, any>[], index: number): number | undefined {
    for (let parent = 0; parent < nodes.length; parent++) {
        if ((nodes[parent].children ?? []).includes(index)) return parent
    }
    return undefined
}

/** 把集合重排成 0..n-1 的映射 */
function remap(indices: Set<number>): Map<number, number> {
    const result = new Map<number, number>()
    for (const index of [...indices].sort((a, b) => a - b)) result.set(index, result.size)
    return result
}

/** 遍历材质里所有贴图引用 */
function walkTextures(value: any, visit: (index: number) => void): void {
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
        if (key.endsWith("Texture") && child && typeof child === "object" && "index" in child) visit((child as { index: number }).index)
        else walkTextures(child, visit)
    }
}

/**
 * @description 重写 `dnaColorize.textures` 里的贴图索引（槽名 → 数字索引）。
 * @param slots 槽位表
 * @param map 旧索引 → 新索引；返回 undefined 表示该贴图被裁掉
 */
export function remapDyeTextureSlots(slots: Record<string, number> | undefined, map: (index: number) => number | undefined): void {
    if (!slots) return
    for (const [name, index] of Object.entries(slots)) {
        const next = map(index)
        if (next === undefined) delete slots[name]
        else slots[name] = next
    }
}

/** 重写材质里的贴图索引，找不到（被裁掉）的引用直接删除 */
function remapMaterialTextures(value: any, map: (index: number) => number | undefined): void {
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
        if (key.endsWith("Texture") && child && typeof child === "object" && "index" in child) {
            const next = map((child as { index: number }).index)
            if (next === undefined) delete value[key]
            else (child as { index: number }).index = next
        } else remapMaterialTextures(child, map)
    }
}

/**
 * @description 从完整皮肤 GLB 里抽出展示动画，保留所有绑定到骨骼名的通道。
 *
 * 动画通道按节点索引指向骨骼；部件拆分后每个部件只剩自己那套骨架的节点索引，
 * 所以动画必须单独抽出来、在运行期合并完成后再按名字重新绑定。
 * @param document 完整皮肤 GLB
 * @returns 只含动画的 GLB（无网格、无节点）；没有动画时 undefined
 */
export function extractAnimation(document: GlbDocument): GlbDocument | undefined {
    const json = document.json as Record<string, any>
    if (!json.animations?.length) return undefined
    const nodes = (json.nodes ?? []) as Record<string, any>[]

    // 收集动画引用到的 accessor，其余几何数据不带
    const accessors = new Set<number>()
    for (const animation of json.animations) {
        for (const sampler of animation.samplers ?? []) {
            if (sampler.input !== undefined) accessors.add(sampler.input)
            if (sampler.output !== undefined) accessors.add(sampler.output)
        }
    }
    const order = [...accessors].sort((a, b) => a - b)
    const accessorRemap = new Map(order.map((index, position) => [index, position]))
    const views = new Set<number>()
    for (const index of order) {
        const view = json.accessors[index]?.bufferView
        if (view !== undefined) views.add(view)
    }
    const viewOrder = [...views].sort((a, b) => a - b)
    const viewRemap = new Map(viewOrder.map((index, position) => [index, position]))

    const parts: Uint8Array[] = []
    let cursor = 0
    const keptViews = viewOrder.map(index => {
        const view = json.bufferViews[index] as Record<string, any>
        const start = view.byteOffset ?? 0
        const bytes = document.binary.subarray(start, start + view.byteLength)
        const offset = Math.ceil(cursor / 4) * 4
        parts.push(bytes)
        cursor = offset + bytes.length
        return { ...view, buffer: 0, byteOffset: offset }
    })
    const binary = new Uint8Array(cursor)
    parts.forEach((bytes, index) => binary.set(bytes, keptViews[index].byteOffset))

    const keptAccessors = order.map(index => {
        const accessor = structuredClone(json.accessors[index]) as Record<string, any>
        if (accessor.bufferView !== undefined) accessor.bufferView = viewRemap.get(accessor.bufferView)!
        return accessor
    })
    const keptAnimations = json.animations.map((animation: Record<string, any>) => ({
        name: animation.name,
        samplers: (animation.samplers ?? []).map((sampler: Record<string, any>) => ({
            input: accessorRemap.get(sampler.input)!,
            output: accessorRemap.get(sampler.output)!,
            interpolation: sampler.interpolation,
        })),
        // 通道仍按「骨骼名」记，运行期合并后按名字找节点重新绑定
        channels: (animation.channels ?? []).map((channel: Record<string, any>) => ({
            sampler: channel.sampler,
            target: { nodeName: nodes[channel.target?.node]?.name, path: channel.target?.path },
        })),
    }))
    return {
        json: {
            asset: { version: "2.0", generator: "dna-builder flora exporter" },
            scenes: [{ nodes: [] }],
            scene: 0,
            nodes: [],
            meshes: [],
            skins: [],
            materials: [],
            textures: [],
            images: [],
            samplers: [],
            accessors: keptAccessors,
            bufferViews: keptViews,
            buffers: [{ byteLength: binary.length }],
            animations: keptAnimations,
        },
        binary,
    }
}

/**
 * @description 把按骨骼名记录的动画通道重新绑定到合并后模型的节点索引上。
 * @param document 已合并的模型
 * @param animation 来自 `extractAnimation` 的文档
 */
export function rebindAnimation(document: GlbDocument, animation: GlbDocument): void {
    const json = document.json as Record<string, any>
    const nodes = (json.nodes ?? []) as Record<string, any>[]
    const byName = new Map<string, number>()
    for (const [index, node] of nodes.entries()) {
        if (typeof node.name === "string" && !byName.has(node.name)) byName.set(node.name, index)
    }
    // 动画的 accessor 并进模型
    const accessorOffset = json.accessors.length
    const viewOffset = json.bufferViews.length
    const binOffset = appendBinary(document, animation.binary)
    for (const view of animation.json.bufferViews ?? [])
        json.bufferViews.push({ ...view, buffer: 0, byteOffset: (view.byteOffset ?? 0) + binOffset })
    for (const accessor of animation.json.accessors ?? []) {
        json.accessors.push(accessor.bufferView === undefined ? accessor : { ...accessor, bufferView: accessor.bufferView + viewOffset })
    }
    json.animations = json.animations ?? []
    for (const source of animation.json.animations ?? []) {
        const channels = source.channels
            .map((channel: Record<string, any>) => {
                const node = byName.get(channel.target?.nodeName)
                if (node === undefined) return undefined
                return { sampler: channel.sampler, target: { node, path: channel.target.path } }
            })
            .filter(Boolean)
        if (!channels.length) continue
        json.animations.push({
            name: source.name,
            samplers: source.samplers.map((sampler: Record<string, any>) => ({
                input: sampler.input + accessorOffset,
                output: sampler.output + accessorOffset,
                ...(sampler.interpolation ? { interpolation: sampler.interpolation } : {}),
            })),
            channels,
        })
    }
}

export type { GlbDocument }
