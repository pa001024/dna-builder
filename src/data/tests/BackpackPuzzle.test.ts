import { describe, expect, it } from "vitest"
import { backpackPuzzleLevels, backpackPuzzleSolutionPresets } from "@/data/d"

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
})
