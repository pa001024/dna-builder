import { base36Pad } from "@/util"

/**
 * 社区魔之楔导入码的槽位排列：第 i 个槽位占据代码中的第 SLOT_CODE_POSITIONS[i] 组。
 * 与 CharBuild.codeSwapR 的交换表一致。
 */
const SLOT_CODE_POSITIONS = [0, 2, 3, 1, 4, 6, 7, 5]

/** 解析后的魔之楔导入码 */
export interface ParsedModCode {
    /** 代码类型：C 角色 / W 武器 */
    flag: "C" | "W"
    /** 代码携带的持有者 id（角色或武器） */
    ownerId: number
    /** 按槽位顺序还原的 MOD id，未携带的槽位为 0 */
    mods: number[]
    /** 中枢（光环）MOD id，仅角色代码有值 */
    auraMod: number
    /** 代码实际携带的槽位数量（角色 / 普通武器 8，同律 4） */
    slotCount: number
}

/**
 * 把一套魔之楔按游戏社区导入码格式编码。
 * 角色组为 C + 角色 id + 8 槽 + 中枢，武器组为 W + 武器 id + 8 槽。
 * @param flag 代码类型（C 角色 / W 武器）
 * @param ownerId 角色 id 或武器 id
 * @param slots 槽位数组（只读取每项的 MOD id）
 * @param auraId 中枢魔之楔 id（仅角色组使用）
 * @returns 社区导入码
 */
export function encodeModCode(flag: "C" | "W", ownerId: number, slots: readonly (readonly [number, number] | null)[], auraId = 0) {
    const groups = Array.from({ length: 8 }, () => "0000")
    for (let index = 0; index < 8; index += 1) {
        groups[SLOT_CODE_POSITIONS[index]] = base36Pad(slots[index]?.[0] ?? 0)
    }
    return `${flag}${base36Pad(ownerId)}${groups.join("")}${flag === "C" ? base36Pad(auraId) : ""}`
}

/**
 * 解析游戏社区魔之楔导入码。
 * 只接受完整的 8 槽（角色另带中枢）或 4 槽（同律武器）代码，避免把普通文本误判成导入码。
 * 旧代码可能把中枢顶进普通槽位：与 CharBuild.importCode 一样，普通槽位里与中枢相同的 id 会被清除。
 * @param input 剪贴板文本（允许夹杂空白 / 换行）
 * @returns 解析结果；不是合法导入码时返回 null
 */
export function parseModCode(input: string): ParsedModCode | null {
    const compact = input.replace(/\s+/g, "")
    const match = /^([cCwW])([0-9a-zA-Z]{4})([0-9a-zA-Z]{16}|[0-9a-zA-Z]{32}|[0-9a-zA-Z]{36})$/.exec(compact)
    if (!match) return null
    const flag = match[1].toUpperCase() as "C" | "W"
    const body = match[3]
    // 角色代码必须带中枢（9 组），武器代码只能是 8 槽或 4 槽
    if (flag === "C" && body.length !== 36) return null
    if (flag === "W" && body.length !== 32 && body.length !== 16) return null
    const ownerId = parseInt(match[2], 36)
    if (ownerId <= 0) return null
    const groups = body.match(/.{4}/g)!
    const slotCount = flag === "C" ? 8 : groups.length
    const encoded = groups.slice(0, slotCount).map(group => parseInt(group, 36))
    const mods = Array.from({ length: 8 }, (_, index) => (index < slotCount ? encoded[SLOT_CODE_POSITIONS[index]] : 0))
    const auraMod = flag === "C" ? parseInt(groups[8], 36) : 0
    if (auraMod) {
        const leaked = mods.indexOf(auraMod)
        if (leaked !== -1) mods[leaked] = 0
    }
    return { flag, ownerId, mods, auraMod, slotCount }
}
