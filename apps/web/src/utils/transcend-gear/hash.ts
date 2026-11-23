import { canonicalGearString, TRANSCEND_GEAR_HASH_PREFIX, type TranscendGearItemConfig } from "@/data"
import { sha256 } from "@/utils/sha256"

/**
 * 升华装备物品 hash：`tg3` 规范化字符串（排序词条行 + 排序孔位 + 装备级 craft 状态）的前 16 位 hex。
 * 排除装备位 / 角色 / 库存行 id / 时间戳 / 展示快照；同一物品在任何槽位得到相同 hash。
 */

/** hash 前缀（与 data 层 `canonicalGearString` 共用同一常量） */
export { TRANSCEND_GEAR_HASH_PREFIX }

/** hash 取规范化摘要的前 16 位 hex（64-bit 前缀） */
const HASH_LENGTH = 16

/**
 * 计算装备物品 hash。
 * @param item 装备物品配置
 * @returns 16 位十六进制摘要
 */
export function hashGearItem(item: TranscendGearItemConfig): string {
    return sha256(canonicalGearString(item)).slice(0, HASH_LENGTH)
}

/** 元数据比较：双方都有值时必须相等；任一方缺失（旧存档）视为通配 */
function sameOptionalMeta(left: number | undefined, right: number | undefined): boolean {
    return left === undefined || right === undefined || left === right
}

/**
 * 判断两件物品是否是同一库存身份：hash 相同（词条 / 孔位 / 暗金 id 一致）后，
 * 再比较双方都有值的品质 / 强度 / 基础名 / 赛季 / 已开孔数。hash 不含这些元数据，
 * 若只看 hash，同词条的白色 / 金色或不同基础名会被误判为同一件。
 * @param left 物品
 * @param right 物品
 * @returns 同一库存身份为 true
 */
export function isSameGearItem(left: TranscendGearItemConfig, right: TranscendGearItemConfig): boolean {
    if (hashGearItem(left) !== hashGearItem(right)) return false
    return (
        sameOptionalMeta(left.rarityId, right.rarityId) &&
        sameOptionalMeta(left.equipBaseScore, right.equipBaseScore) &&
        sameOptionalMeta(left.iconId, right.iconId) &&
        sameOptionalMeta(left.seasonId, right.seasonId) &&
        sameOptionalMeta(left.socketCount, right.socketCount)
    )
}

export { canonicalGearString }
