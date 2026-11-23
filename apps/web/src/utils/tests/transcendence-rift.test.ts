import { describe, expect, it } from "vitest"
import type { DnaSeasonRiftFloor } from "@/data/d/dnaseasonrift.data"
import { buildRiftFloorRow, getElitePoolGroups, resolveFloorEliteGroups } from "@/utils/transcendence-rift"

/**
 * u81-fix Missing Test：覆盖全部 500 层数据中永不出现的 `eliteFromFloor = true` 分支。
 * 构造楼层时只填精英池字段，其余字段用最小占位；spawnId 取自真实数据，保证展开逻辑可执行。
 */

/**
 * 构造最小楼层记录。
 * @param overrides 需要覆盖的字段
 * @returns 楼层记录
 */
function createFloor(overrides: Partial<DnaSeasonRiftFloor>): DnaSeasonRiftFloor {
    return {
        id: 1,
        floor: 1,
        floorType: 1,
        seasonId: 1,
        monsterLevel: 100,
        completeTime: 300,
        isNodeLayer: 0,
        dsEnable: false,
        ...overrides,
    }
}

describe("resolveFloorEliteGroups", () => {
    it("本层带精英池时优先使用并标记 fromFloor", () => {
        const result = resolveFloorEliteGroups(createFloor({ eliteMonsterIds: [88801010, 88801012] }))

        expect(result.fromFloor).toBe(true)
        expect(result.groups.map(group => group.spawnId)).toEqual([88801010, 88801012])
        expect(result.groups[0]?.unitIds.length).toBeGreaterThan(0)
    })

    it("本层没有精英池时回退顶层池", () => {
        const result = resolveFloorEliteGroups(createFloor({}))

        expect(result.fromFloor).toBe(false)
        expect(result.groups).toBe(getElitePoolGroups())
    })
})

describe("buildRiftFloorRow 精英池口径", () => {
    it("本层精英池：eliteFromFloor=true，eliteKinds 按本层去重", () => {
        const row = buildRiftFloorRow(createFloor({ eliteMonsterIds: [88801010, 88801012] }))

        expect(row.eliteFromFloor).toBe(true)
        expect(row.eliteGroups.map(group => group.spawnId)).toEqual([88801010, 88801012])
        expect(row.eliteKinds).toBe(new Set(row.eliteGroups.flatMap(group => group.unitIds)).size)
    })
})
