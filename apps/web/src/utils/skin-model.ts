export type LinearRgb = [number, number, number]

export interface SkinModelMetadata {
    version: 1
    skinId: number
    charId: number
    hairId: number
    /**
     * 色板表。发布包与导出 GLB 都不再内嵌（各皮肤完全一致），渲染器加载时从数据包
     * （`skin-colorize.data.ts`）补齐；校验要求它存在，缺表由渲染器负责先补。
     */
    swatches: Record<string, { linear: LinearRgb; fresnel?: number }>
    allowedStockingIds: number[]
    parts: string[]
    captureVerified: boolean
}

export interface SkinMaterialMetadata {
    version: 1
    kind: "packed" | "stocking" | "hair" | "hairPart" | "weapon" | "base" | "shadow"
    role: "character" | "weapon"
    parent: string
    vectors: Record<string, LinearRgb>
    scalars: Record<string, number>
    textures: Record<string, number>
}

export interface SkinHairDyeFallbacks {
    hair: [LinearRgb, LinearRgb, LinearRgb]
    hairPart: [LinearRgb, LinearRgb, LinearRgb]
    hairPartEmission: LinearRgb
}

export interface SkinHairDye {
    hair: [LinearRgb, LinearRgb, LinearRgb]
    hairPart: [LinearRgb, LinearRgb, LinearRgb]
    hairPartEmission: LinearRgb
}

export function validateSkinModelMetadata(value: unknown): SkinModelMetadata {
    const data = value as SkinModelMetadata | undefined
    if (
        data?.version !== 1 ||
        !Number.isInteger(data.skinId) ||
        !Number.isInteger(data.charId) ||
        !Array.isArray(data.parts) ||
        data.parts.length !== 9 ||
        !Array.isArray(data.allowedStockingIds) ||
        !data.swatches ||
        typeof data.swatches !== "object"
    )
        throw new Error("This GLB does not contain the skin dye metadata. Use tools/skin-model/export-flora.ts.")
    for (const swatch of Object.values(data.swatches)) {
        if (!Array.isArray(swatch.linear) || swatch.linear.length !== 3 || swatch.linear.some(v => !Number.isFinite(v) || v < 0)) {
            throw new Error("Invalid linear dye color in GLB")
        }
        if (swatch.fresnel !== undefined && !Number.isFinite(swatch.fresnel)) throw new Error("Invalid dye Fresnel")
    }
    return data
}

export function resolveSkinModelColor(metadata: SkinModelMetadata, ids: number[], part: number, fallback: LinearRgb): LinearRgb {
    const id = ids[part - 1]
    if (!id || id === -1 || (part === 8 && !metadata.allowedStockingIds.includes(id))) return [...fallback]
    return [...(metadata.swatches[id]?.linear ?? fallback)]
}

export function resolveSkinModelFresnel(metadata: SkinModelMetadata, ids: number[], fallback: number): number {
    const id = ids[7]
    if (!metadata.allowedStockingIds.includes(id)) return fallback
    return metadata.swatches[id]?.fresnel ?? fallback
}

/** 数据包色板行：`rgb` 是 sRGB 0–255，`linear` 是着色器用的线性值。 */
export interface SwatchSource {
    id: number
    rgb: [number, number, number]
    linear?: [number, number, number]
    fresnel?: number
}

/** sRGB（0–255）转线性。 */
function toLinear(value: number): number {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** 数据包色板表转渲染器索引表：旧版数据包没有 `linear`，直接把 0–255 当线性值会整片发白。 */
export function swatchTable(swatches: SwatchSource[]): Record<string, { linear: LinearRgb; fresnel?: number }> {
    const result: Record<string, { linear: LinearRgb; fresnel?: number }> = {}
    for (const swatch of swatches) {
        const linear: LinearRgb = swatch.linear ?? ([...swatch.rgb.map(toLinear)] as LinearRgb)
        result[String(swatch.id)] = swatch.fresnel === undefined ? { linear } : { linear, fresnel: swatch.fresnel }
    }
    return result
}

/** 发型码 1–6 依次映射到头发 1–2、头饰 3–5 与头饰自发光 6。 */
export function resolveHairModelDye(metadata: SkinModelMetadata, ids: number[], fallbacks: SkinHairDyeFallbacks): SkinHairDye {
    return {
        hair: [
            resolveSkinModelColor(metadata, ids, 1, fallbacks.hair[0]),
            resolveSkinModelColor(metadata, ids, 2, fallbacks.hair[1]),
            [...fallbacks.hair[2]],
        ],
        hairPart: fallbacks.hairPart.map((fallback, index) => resolveSkinModelColor(metadata, ids, index + 3, fallback)) as [
            LinearRgb,
            LinearRgb,
            LinearRgb,
        ],
        hairPartEmission: resolveSkinModelColor(metadata, ids, 6, fallbacks.hairPartEmission),
    }
}

/** MF_BIA6Tint_Color 的 CPU 对照：G 为色区编码，R 为明度，法线 B 为染色权重。 */
export function decodePackedSkinColor(encoded: LinearRgb, weight: number, colors: LinearRgb[], quantize = 0): LinearRgb {
    if (colors.length !== 6) throw new Error("Packed skin requires six colors")
    const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const g = encoded[1] + quantize * (Math.floor(encoded[1] * 6) / 6 - encoded[1])
    let tint: LinearRgb = [...colors[0]]
    for (let i = 1; i < 6; i++) {
        const blend = Math.min(1, Math.max(0, g * (5 + quantize) - (i - 1)))
        tint = tint.map((v, c) => v + blend * (colors[i][c] - v)) as LinearRgb
    }
    return encoded.map((v, c) => {
        const base = srgbToLinear(v)
        return base + weight * (encoded[0] * tint[c] - base)
    }) as LinearRgb
}
