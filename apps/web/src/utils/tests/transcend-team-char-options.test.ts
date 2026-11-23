import { describe, expect, it } from "vitest"
import { charData, charMap } from "@/data"
import { buildTeamCharOptions } from "@/utils/transcend-build"

/**
 * U82 回归：协战候选必须以角色条目数组构造。
 * `charMap` 同时按名称与 id 建键，遍历其 values() 会让每个角色出现两次。
 */
describe("buildTeamCharOptions", () => {
    const expected = charData.filter(char => char.id > 0)

    it("每个角色只出现一次（value 唯一，数量 = charData 中 id>0 的条数）", () => {
        const options = buildTeamCharOptions(charData)
        expect(options).toHaveLength(expected.length)
        expect(new Set(options.map(option => option.value)).size).toBe(expected.length)
    })

    it("与角色表逐条同序且字段一致", () => {
        const options = buildTeamCharOptions(charData)
        expect(options.map(option => option.value)).toEqual(expected.map(char => char.id))
        expect(options.map(option => option.label)).toEqual(expected.map(char => char.名称))
        expect(options.map(option => option.elm)).toEqual(expected.map(char => char.属性))
    })

    it("charMap 双键仍产生 2×（候选源的根因证据，不得从其 values() 构造）", () => {
        const viaMap = [...charMap.values()]
        expect(viaMap.length).toBe(expected.length * 2)
        expect(new Set(viaMap.map(char => char.id)).size).toBe(expected.length)
        expect(buildTeamCharOptions(charData).length).toBe(viaMap.length / 2)
    })

    it("charData 自身 id 唯一（纯函数不做去重，数据契约由数据层保证）", () => {
        expect(new Set(charData.map(char => char.id)).size).toBe(charData.length)
    })
})
