import { dungeonMap, monsterMap } from "@/data/d"
import type { DnaSeasonRiftFloor, DnaSeasonRiftGlobals } from "@/data/d/dnaseasonrift.data"
import { eliteMonsterIds, spawnUnits } from "@/data/d/dnaseasonrift.data"

/** 刷怪组：spawnId 展开后的怪物 UnitId 与名称（名称是游戏原文，调用方再过 gt） */
export interface RiftSpawnGroup {
    spawnId: number
    unitIds: number[]
    names: (string | undefined)[]
}

/** 楼层行的预计算结果：join 全部在构建期做一次，行内不再查表 */
export interface RiftFloorRow {
    id: number
    floor: number
    floorType: number
    monsterLevel: number
    completeTime: number
    bosses: { id: number; name?: string; type?: string; icon?: string }[]
    normalGroups: RiftSpawnGroup[]
    normalKinds: number
    eliteGroups: RiftSpawnGroup[]
    eliteFromFloor: boolean
    eliteKinds: number
    dungeons: { id: number; name?: string }[]
    rewardId?: number
    jumps: { floor: number; time: number }[]
    tierIds: number[]
    challengeIds: number[]
    scoreRuleIds: number[]
}

/** 主角占位 RoleId → 本体的 RoleId：上游 Char.json 不导出占位 id，归并后仍可展示 */
const ROLE_PLACEHOLDER_MAP: Record<number, number> = {
    120101: 1201,
    160101: 1601,
    220101: 2201,
}

/** 刷怪组缓存：500 层共用同一批 spawnId，展开只做一次 */
const spawnGroupCache = new Map<number, RiftSpawnGroup>()

/** 顶层精英池（328 组）的展开结果 */
let elitePoolGroups: RiftSpawnGroup[] | null = null
/** 顶层精英池的去重怪物种数 */
let elitePoolKinds = 0

/**
 * 展开单个刷怪组：同一 spawnId 的 UnitId 去重后逐个 join monsterMap。
 * @param spawnId 刷怪组 id（MonsterSpawn.UnitSpawnId）
 * @returns 展开结果（进程内缓存）
 */
export function getSpawnGroup(spawnId: number): RiftSpawnGroup {
    const cached = spawnGroupCache.get(spawnId)

    if (cached) {
        return cached
    }

    const unitIds = [...new Set(spawnUnits[spawnId] ?? [])]
    const group: RiftSpawnGroup = {
        spawnId,
        unitIds,
        names: unitIds.map(unitId => monsterMap.get(unitId)?.n),
    }
    spawnGroupCache.set(spawnId, group)

    return group
}

/**
 * 批量展开刷怪组（按 spawnId 去重，保持原顺序）。
 * @param spawnIds 刷怪组 id 列表
 * @returns 展开后的组列表
 */
export function getSpawnGroups(spawnIds: number[] | undefined): RiftSpawnGroup[] {
    if (!spawnIds?.length) {
        return []
    }

    return [...new Set(spawnIds)].map(getSpawnGroup)
}

/**
 * 统计一组刷怪组里去重后的怪物种数。
 * @param groups 刷怪组列表
 * @returns 去重后的 UnitId 数量
 */
export function countSpawnKinds(groups: RiftSpawnGroup[]): number {
    const units = new Set<number>()

    for (const group of groups) {
        for (const unitId of group.unitIds) {
            units.add(unitId)
        }
    }

    return units.size
}

/**
 * 顶层精英池：每层没有 `eliteMonsterIds` 时使用。
 * @returns 精英池刷怪组（328 组，进程内只展开一次）
 */
export function getElitePoolGroups(): RiftSpawnGroup[] {
    if (!elitePoolGroups) {
        elitePoolGroups = getSpawnGroups(eliteMonsterIds)
        elitePoolKinds = countSpawnKinds(elitePoolGroups)
    }

    return elitePoolGroups
}

/**
 * 顶层精英池的去重怪物种数。
 * @returns 怪物种数
 */
export function getElitePoolKinds(): number {
    getElitePoolGroups()

    return elitePoolKinds
}

/**
 * 楼层使用的精英池：层内 `eliteMonsterIds` 优先，否则回退顶层池。
 * @param floor 楼层
 * @returns 精英刷怪组与来源
 */
export function resolveFloorEliteGroups(floor: DnaSeasonRiftFloor): { groups: RiftSpawnGroup[]; fromFloor: boolean } {
    if (floor.eliteMonsterIds?.length) {
        return { groups: getSpawnGroups(floor.eliteMonsterIds), fromFloor: true }
    }

    return { groups: getElitePoolGroups(), fromFloor: false }
}

/**
 * 构建楼层行：Boss / 普通怪组 / 精英池 / 副本全部在此 join 一次。
 * @param floor 楼层记录
 * @returns 预计算行
 */
export function buildRiftFloorRow(floor: DnaSeasonRiftFloor): RiftFloorRow {
    const normalGroups = getSpawnGroups(floor.normalMonsterIds)
    const elite = resolveFloorEliteGroups(floor)

    return {
        id: floor.id,
        floor: floor.floor,
        floorType: floor.floorType,
        monsterLevel: floor.monsterLevel,
        completeTime: floor.completeTime,
        bosses: (floor.bossUnitIds ?? []).map(unitId => {
            const monster = monsterMap.get(unitId)

            return { id: unitId, name: monster?.n, type: monster?.t, icon: monster?.icon }
        }),
        normalGroups,
        normalKinds: countSpawnKinds(normalGroups),
        eliteGroups: elite.groups,
        eliteFromFloor: elite.fromFloor,
        eliteKinds: elite.fromFloor ? countSpawnKinds(elite.groups) : getElitePoolKinds(),
        dungeons: (floor.dungeonIds ?? []).map(dungeonId => ({ id: dungeonId, name: dungeonMap.get(dungeonId)?.n })),
        rewardId: floor.passReward,
        jumps: floor.jumps ?? [],
        tierIds: floor.unlockTierIds ?? [],
        challengeIds: floor.challengeIds ?? [],
        scoreRuleIds: floor.scoreRuleIds ?? [],
    }
}

/**
 * 把秒数格式化成 `分:秒`（如 480 → 8:00）。
 * @param seconds 秒数
 * @returns 时长文本
 */
export function formatRiftDuration(seconds: number): string {
    const safe = Math.max(0, Math.round(seconds))
    const minutes = Math.floor(safe / 60)
    const rest = safe % 60

    return `${minutes}:${String(rest).padStart(2, "0")}`
}

/**
 * 螺旋子赛季的展示文案键：上游 `displayName` 是本地派生中文，按 subSeasonNum 参数化渲染
 */
export const RIFT_SEASON_LABEL_KEY = "db-transcendence.rift.season"

/**
 * 楼层类型（1/2）→ 界面文案键。
 * @param floorType 楼层类型
 * @returns i18n 文案键
 */
export function getRiftTypeLabelKey(floorType: number): string {
    return floorType === 1 || floorType === 2 ? `db-transcendence.rift.floor_type_${floorType}` : "db-transcendence.rift.floor_type_unknown"
}

/**
 * 排位类型 id → 界面文案键（1 单人 / 2 角色 / 3 团队）。
 * @param rankType 排位类型
 * @returns i18n 文案键
 */
export function getRankTypeLabelKey(rankType: number): string {
    return rankType >= 1 && rankType <= 3 ? `db-transcendence.rift.rank_type_${rankType}` : "db-transcendence.rift.rank_type_unknown"
}

/** 全局参数 → 界面文案键；未映射的字段不展示，禁止把上游字段名直接输出 */
const GLOBAL_LABEL_KEYS: Record<keyof DnaSeasonRiftGlobals, string> = {
    RiftInitUnlockLayer: "db-transcendence.rift.global_init_unlock",
    RiftMaxLayer: "db-transcendence.rift.global_max_layer",
    RiftRankDeathInitialPenalty: "db-transcendence.rift.global_death_initial",
    RiftRankDeathPenalty: "db-transcendence.rift.global_death_penalty",
    RiftRankRewardTime: "db-transcendence.rift.global_reward_time",
    RiftReviveCountdown: "db-transcendence.rift.global_revive",
}

/**
 * 全局参数名 → 界面文案键。
 * @param key 上游字段名
 * @returns i18n 文案键；未收录返回空串
 */
export function getRiftGlobalLabelKey(key: string): string {
    return GLOBAL_LABEL_KEYS[key as keyof DnaSeasonRiftGlobals] ?? ""
}

/**
 * 名次区间格式化。
 * @param range 起止名次
 * @returns 展示文本
 */
export function formatRankRange(range: [number, number]): string {
    return `${range[0]}–${range[1]}`
}

/**
 * 解析 RoleId：主角占位 id 归并到本体 id。
 * @param roleId 原始 RoleId
 * @returns 归并后的 id 与是否发生归并
 */
export function resolveRiftRole(roleId: number): { id: number; merged: boolean } {
    const resolved = ROLE_PLACEHOLDER_MAP[roleId]

    return resolved === undefined ? { id: roleId, merged: false } : { id: resolved, merged: true }
}

/**
 * 怪物头像地址（与 LeveledMonster.url 同口径）。
 * @param icon 上游图标名
 * @returns 图标地址
 */
export function getMonsterIconUrl(icon: string | undefined): string {
    return icon ? `/imgs/webp/T_Head_${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 资源图标地址。
 * @param icon 上游图标名
 * @returns 图标地址
 */
export function getResourceIconUrl(icon: string | undefined): string {
    return icon ? `/imgs/res/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}
