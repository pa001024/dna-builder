import { dungeonMap, monsterMap, resourceMap } from "@/data/d"
import { commissionTiers, nestBosses } from "@/data/d/dnaseason.data"
import { hardBossData } from "@/data/d/hardboss.data"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import { buildSeasonTierRows, getTranscendenceDungeonTypeKey, type SeasonTierRow } from "@/utils/transcendence-journey"
import { getMonsterIconUrl, getResourceIconUrl } from "@/utils/transcendence-rift"

type Translate = (key: string, options?: Record<string, unknown>) => string
type GameText = (text: string | undefined | null) => string

/** 梦魇卡里的钥匙资源 */
export interface NestKeyRow {
    id: number
    name: string
    iconUrl: string
    rarity: number
    desc: string
}

/** 梦魇卡里的档位奖励（与委托共用同一份档位行结构） */
export type NestTierRow = SeasonTierRow

/** 6 张梦魇卡的完整行数据：左栏摘要与右侧详情共用（怪物由副本页签展示，不在此行展开） */
export interface NestRow {
    dungeonId: number
    name: string
    type: string
    difficulty: number
    level?: number
    hardBossName?: string
    hardBossId?: number
    iconUrl: string
    key: NestKeyRow
    tiers: NestTierRow[]
}

/** HardBoss 按名称匹配：NestBossConfig 没有 HardBoss id，只有 seasonDifficulty（等级档） */
const hardBossByName = new Map(hardBossData.map(boss => [boss.name, boss]))

/** seasonDifficulty（1001–1006）→ 推荐等级：取 hardBoss.diff[].lv */
const difficultyLevels = new Map<number, number>()
for (const boss of hardBossData) {
    for (const diff of boss.diff ?? []) {
        difficultyLevels.set(diff.id, diff.lv)
    }
}

/**
 * 副本类型展示名：`NestBoss` 用界面的「梦魇副本」口径，其余赛季副本映射到 TextMap 官方短名。
 * @param type 上游副本类型
 * @param t 界面文案翻译
 * @returns 展示文本；未收录的类型返回空串
 */
function dungeonTypeLabel(type: string | undefined, t: Translate): string {
    if (!type) {
        return ""
    }

    if (type === "NestBoss") {
        return t("db-transcendence.nest.type")
    }

    const key = getTranscendenceDungeonTypeKey(type)

    return key ? t(key) : ""
}

/**
 * 取副本名里「·」后的怪物名，用于与 HardBoss 名称交叉核对。
 * @param dungeonName 副本名
 * @returns 候选怪物名
 */
function bossNameOf(dungeonName: string | undefined): string {
    if (!dungeonName) {
        return ""
    }

    const parts = dungeonName.split("·")

    return (parts[parts.length - 1] ?? "").trim()
}

/**
 * 构建 6 张梦魇卡的动态行数据：副本 / 钥匙 / 等级 / 16 档奖励全部 join 一次。
 * @param gt 游戏原文翻译
 * @param t 界面文案翻译
 * @returns 梦魇行
 */
export function buildNestRows(gt: GameText, t: Translate): NestRow[] {
    return nestBosses.map(boss => {
        const dungeon = dungeonMap.get(boss.dungeonId)
        const key = resourceMap.get(boss.keyId)
        const hardBoss = hardBossByName.get(bossNameOf(dungeon?.n))
        const tierGroup = commissionTiers.find(group => group.ruleId === boss.seasonDifficulty)
        const fallbackMonsterIcon = dungeon?.m?.length ? monsterMap.get(dungeon.m[0])?.icon : undefined

        return {
            dungeonId: boss.dungeonId,
            name: gt(dungeon?.n) || t("db-transcendence.unknown_entity", { id: boss.dungeonId }),
            type: dungeonTypeLabel(dungeon?.t, t),
            difficulty: boss.seasonDifficulty,
            level: difficultyLevels.get(boss.seasonDifficulty),
            hardBossName: hardBoss?.name,
            hardBossId: hardBoss?.id,
            iconUrl: hardBoss?.icon ? `/imgs/webp/${hardBoss.icon}.webp` : getMonsterIconUrl(fallbackMonsterIcon),
            key: key
                ? {
                      id: boss.keyId,
                      name: gt(key.name),
                      iconUrl: getResourceIconUrl(key.icon),
                      rarity: key.rarity,
                      desc: cleanGameMarkup(gt(key.desc)),
                  }
                : {
                      id: boss.keyId,
                      name: t("db-transcendence.unknown_entity", { id: boss.keyId }),
                      iconUrl: getResourceIconUrl(undefined),
                      rarity: 1,
                      desc: "",
                  },
            tiers: buildSeasonTierRows(tierGroup, 3),
        }
    })
}
