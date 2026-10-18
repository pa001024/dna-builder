export type SkinColorizeType = "Char" | "Hair" | "Weapon"

export interface SkinColorizeCode {
    type: SkinColorizeType
    skinId: number
    colorIds: number[]
}

export interface SkinColorizeSwatch {
    id: number
    name: string
    rgb: [number, number, number]
    resourceId: number
    hairResourceId: number
    hairResourceName: string
    sort?: number
}

export interface SkinColorizeSpecialSwatch {
    id: number
    name: string
    resourceId: number
    materialName: string
    materialPath: string
}

export interface SkinColorizePart {
    id: number
    colorIds?: number[]
}

const TYPE_TO_PREFIX: Record<SkinColorizeType, string> = { Char: "C", Hair: "H", Weapon: "W" }
const PREFIX_TO_TYPE: Record<string, SkinColorizeType | undefined> = { C: "Char", H: "Hair", W: "Weapon" }

/** 将十进制 ID 转为游戏社区码使用的固定长度 Base36。 */
function toBase36(value: number, length: number): string {
    if (!Number.isInteger(value) || value < 0 || value >= 36 ** length) {
        throw new Error(`ID 超出 ${length} 位 Base36 编码范围`)
    }
    return value.toString(36).toUpperCase().padStart(length, "0")
}

/** 解析游戏社区码中的 Base36 片段。 */
function fromBase36(value: string): number {
    if (!/^[0-9A-Z]+$/.test(value)) throw new Error("染色码含有非法字符")
    return Number.parseInt(value, 36)
}

/** 按游戏 ModModel_DyePlanCopyModeComp.lua 的规则生成社区染色码。 */
export function encodeSkinColorizeCode(code: SkinColorizeCode): string {
    const prefix = TYPE_TO_PREFIX[code.type]
    if (!prefix) throw new Error("不支持的染色类型")
    return `${prefix}${toBase36(code.skinId, 10)}${code.colorIds.map(colorId => toBase36(Math.max(colorId, 0), 2)).join("")}`
}

/** 按游戏 ModModel_DyePlanCopyModeComp.lua 的规则解析社区染色码。 */
export function decodeSkinColorizeCode(value: string): SkinColorizeCode {
    const code = value.trim().toUpperCase()
    if (code.length < 11 || (code.length - 11) % 2 !== 0) throw new Error("染色码长度不符合游戏格式")
    const type = PREFIX_TO_TYPE[code[0]]
    if (!type) throw new Error("染色码类型必须为 C、H 或 W")
    const skinId = fromBase36(code.slice(1, 11))
    const colorIds: number[] = []
    for (let index = 11; index < code.length; index += 2) {
        colorIds.push(fromBase36(code.slice(index, index + 2)))
    }
    return { type, skinId, colorIds }
}

/** 将色板的游戏 RGB 数值转换为 CSS 颜色。 */
export function formatSkinColorizeRgb(rgb: [number, number, number]): string {
    return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`
}
