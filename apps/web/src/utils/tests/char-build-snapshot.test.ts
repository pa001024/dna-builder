import { describe, expect, it } from "vitest"
import { ref } from "vue"
import { createDefaultCharSettings, normalizeCharSettings } from "@/composables/useCharSettings"
import { CharBuild, LeveledChar, LeveledWeapon } from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { createBuildFromSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { calculateSnapshotDamage } from "@/utils/transcend-gear/income-core"

/**
 * 快照跨线程前的 JSON 洗消回归：配装页设置是深层 ref，customVariables 等数组按引用
 * 存进构筑实例，深层代理的数组直接 structuredClone/postMessage 会抛 DataCloneError
 *（`build.current` 在线上真实构筑上 30s 超时即此原因）。用非空变量表复现该形态。
 */
function buildFromReactiveSettings() {
    const settings = ref(
        normalizeCharSettings({
            ...createDefaultCharSettings(),
            baseName: "潜入夜色",
            customVariables: [
                ["[迸发射击]用时", "1.2"],
                ["[校准]用时", "[迸发射击]用时/2"],
            ],
        })
    ).value
    return createCharBuildFromSettings(3104, settings, undefined as never)
}

describe("createWorkerSnapshot", () => {
    it("响应式设置下的快照可结构化克隆", () => {
        const snapshot = createWorkerSnapshot(buildFromReactiveSettings())
        expect(() => structuredClone(snapshot)).not.toThrow()
    })

    it("洗消后的快照重建伤害一致", () => {
        const build = buildFromReactiveSettings()
        const snapshot = createWorkerSnapshot(build)
        expect(createBuildFromSnapshot(snapshot).calculate()).toBe(build.calculate())
    })
})

/** 含 310201 升华替换的构筑：E 技能伤害改写为 903.552% */
function buildWithSkillReplacement() {
    return new CharBuild({
        char: new LeveledChar("希尔妲"),
        skillLevel: [10, 10, 10],
        hpPercent: 1,
        resonanceGain: 0,
        buffs: [],
        melee: new LeveledWeapon(10302),
        ranged: new LeveledWeapon(20201),
        baseName: "高温清扫",
        skillReplacements: { 310201: { id: 310212, 名称: "高温清扫", 类型: "伤害", 字段改写: { 伤害: { 值: 9.03552 } } } },
    })
}

describe("升华技能替换快照（U83b-fix）", () => {
    it("快照携带替换载荷，重建后的角色技能仍是替换后的字段", () => {
        const build = buildWithSkillReplacement()
        const snapshot = createWorkerSnapshot(build)
        expect(snapshot.skillReplacements?.[310201]).toMatchObject({ id: 310212, 字段改写: { 伤害: { 值: 9.03552 } } })
        expect(() => structuredClone(snapshot)).not.toThrow()

        const restored = createBuildFromSnapshot(snapshot)
        expect(restored.charSkills.find(skill => skill.id === 310212)?.字段.find(field => field.名称 === "伤害")?.值).toBeCloseTo(
            9.03552,
            9
        )
        expect(restored.calculate()).toBeCloseTo(build.calculate(), 9)
    })

    it("worker 快照伤害与主线程一致（calculateSnapshotDamage）", () => {
        const build = buildWithSkillReplacement()
        const result = calculateSnapshotDamage(createWorkerSnapshot(build))
        expect(result.error).toBeUndefined()
        expect(result.damage).toBeCloseTo(build.calculate(), 8)
    })
})
