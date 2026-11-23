/**
 * `MonsterSpawn.lua` → `spawnId → UnitId[]` 索引。
 *
 * 螺旋层的 `normalMonsterIds` / 顶层 `eliteMonsterIds` 是刷怪组 id（UnitSpawnId），
 * 不是 Monster.Id；导入期把组内 `MonsterSpawnInfos[].UnitId` 展平，DB 再按 UnitId join monsterMap。
 */

export interface SpawnUnitBuild {
    spawnUnits: Record<number, number[]>
    warnings: string[]
}

type SpawnInfo = { UnitId?: unknown }

/** 展平一组 MonsterSpawnInfos（支持对象数组、嵌套数组与单对象三种上游形状）。 */
function collectUnits(infos: unknown, spawnId: number, warnings: string[]): number[] {
    const units: number[] = []
    const pushUnit = (info: unknown) => {
        if (Array.isArray(info)) {
            for (const item of info) {
                pushUnit(item)
            }
            return
        }
        if (!info || typeof info !== "object") {
            return
        }
        const unitId = (info as SpawnInfo).UnitId
        if (typeof unitId === "number" && unitId > 0) {
            units.push(unitId)
        }
    }

    if (Array.isArray(infos)) {
        for (const info of infos) {
            pushUnit(info)
        }
    } else if (infos && typeof infos === "object") {
        pushUnit(infos)
    } else {
        warnings.push(`刷怪组 ${spawnId} 没有 MonsterSpawnInfos`)
    }
    return [...new Set(units)].sort((left, right) => left - right)
}

/**
 * 按需解析刷怪组。
 * @param table 上游 MonsterSpawn 表（键为 UnitSpawnId）
 * @param ids 需要解析的刷怪组 id
 * @returns 刷怪组索引与告警（缺组不在结果中，由调用方决定是否报错）
 */
export function buildSpawnUnits(table: unknown, ids: Iterable<number>): SpawnUnitBuild {
    const source = (table ?? {}) as Record<string, { MonsterSpawnInfos?: unknown } | undefined>
    const spawnUnits: Record<number, number[]> = {}
    const warnings: string[] = []
    for (const id of [...ids].sort((left, right) => left - right)) {
        const entry = source[String(id)]
        if (!entry) {
            warnings.push(`MonsterSpawn 中不存在刷怪组 ${id}`)
            continue
        }
        spawnUnits[id] = collectUnits(entry.MonsterSpawnInfos, id, warnings)
    }
    return { spawnUnits, warnings }
}
