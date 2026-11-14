import { srgbChannelToLinear } from "./color"

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

/** 虹膜在图集每格内的位置：圆心与角膜缘外缘半径，都是 0~1 的 UV。导出时从贴图量得。 */
export interface EyeAtlas {
    center: [number, number]
    radius: number
    /** 虹膜图集画在哪套 UV 上：V10/V11 材质在 UV0，V14 在 UV1。导出时按网格实测。 */
    channel: 0 | 1
    /** 瞳孔中心与等效半径。着色器不读：瞳孔形态按「相对暗度 × 半径」从贴图直接取。 */
    pupil?: { center: [number, number]; radius: number }
}

/**
 * 虹膜图集画在哪套 UV 上的兜底规则：实测 202 个皮肤，`M_Player_Eye_V10`/`V11` 全部画在
 * UV0（187 个），`V14` 分画在 UV1 的 0~1 / 1~2 两格（15 个）。旧导出包既没有 `eyeAtlas`
 * 又丢了 UV1 时只能按这个判。
 */
export function eyeUvChannelFromParent(parent: string | undefined): 0 | 1 {
    return /M_Player_Eye_V14/.test(parent ?? "") ? 1 : 0
}

export interface SkinMaterialMetadata {
    version: 1
    kind: "packed" | "stocking" | "hair" | "hairPart" | "weapon" | "base" | "shadow" | "eye"
    role: "character" | "weapon"
    parent: string
    vectors: Record<string, LinearRgb>
    scalars: Record<string, number>
    textures: Record<string, number>
    /** 仅 kind === "eye"：虹膜图集参数，缺失时渲染器退回内置默认值。 */
    eyeAtlas?: EyeAtlas
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
        throw new Error("This GLB does not contain the skin dye metadata. Use tools/skin-model/export-skin.ts.")
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

/** 数据包色板表转渲染器索引表：旧版数据包没有 `linear`，直接把 0–255 当线性值会整片发白。 */
export function swatchTable(swatches: SwatchSource[]): Record<string, { linear: LinearRgb; fresnel?: number }> {
    const result: Record<string, { linear: LinearRgb; fresnel?: number }> = {}
    for (const swatch of swatches) {
        const linear: LinearRgb = swatch.linear ?? ([...swatch.rgb.map(srgbChannelToLinear)] as LinearRgb)
        result[String(swatch.id)] = swatch.fresnel === undefined ? { linear } : { linear, fresnel: swatch.fresnel }
    }
    return result
}

/** 发型码 1–6 依次映射到头发 1–2、头饰 3–5 与头饰自发光 6。 */
export function resolveHairModelDye(metadata: SkinModelMetadata, ids: number[], fallbacks: SkinHairDye): SkinHairDye {
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
