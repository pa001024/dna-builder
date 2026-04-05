import { describe, expect, it } from "vitest"
import { solveBestSolution } from "@/components/BackpackPuzzle.worker"
import { backpackPuzzleItems, backpackPuzzleLevels, backpackPuzzleSolutionPresets } from "@/data/d"

/**
 * 根据关卡初始物品 ID 构建真实测试道具列表。
 * @param level 关卡
 * @returns 关卡道具
 */
function buildLevelItems(level: (typeof backpackPuzzleLevels)[number]) {
    return (level.levelInitialItem ?? [])
        .map(id => backpackPuzzleItems.find(item => item.id === id))
        .filter((item): item is (typeof backpackPuzzleItems)[number] => Boolean(item))
}

describe("BackpackPuzzle", () => {
    it("默认关卡应优先命中缓存最优摆法", () => {
        const failures: string[] = []

        for (const level of backpackPuzzleLevels) {
            const preset = backpackPuzzleSolutionPresets[level.id]
            if (!preset) {
                failures.push(`${level.id} 缺少预设`)
                continue
            }
            if (preset.score <= 0) {
                failures.push(`${level.id} 预设分数无效`)
            }
            if (!preset.placements.length) {
                failures.push(`${level.id} 预设摆法为空`)
            }
        }

        expect(failures).toEqual([])
    })

    it("出现手动摆放后 worker 仍应在 2 秒内返回结果", () => {
        const failures: string[] = []

        for (const level of backpackPuzzleLevels) {
            const items = buildLevelItems(level)
            const firstNonAmmoItemIndex = items.findIndex(item => item.type !== "Ammo")
            const lockedPlacements =
                firstNonAmmoItemIndex >= 0
                    ? [
                          {
                              itemIndex: firstNonAmmoItemIndex,
                              x: 0,
                              y: 0,
                              rotationIndex: 0,
                          },
                      ]
                    : []
            const startedAt = performance.now()
            const result = solveBestSolution(level, items, lockedPlacements, [])
            const durationMs = performance.now() - startedAt

            if (durationMs >= 2000) {
                failures.push(`${level.id} 超时 ${durationMs.toFixed(2)}ms`)
            }
            if (result.score < 0 || Number.isNaN(result.score)) {
                failures.push(`${level.id} 分数无效 ${result.score}`)
            }
        }

        expect(failures).toEqual([])
    })
})
