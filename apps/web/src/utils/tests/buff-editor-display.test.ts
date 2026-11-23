import { describe, expect, it } from "vitest"
import { buffMap, type CharSettings, charMap, createDefaultCharSettings, LeveledBuff, normalizeCharSettings } from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { applyTraceBuffOverrides, collectTraceEffects, FEINA_PASSIVE_SELF_BUFF, FEINA_PASSIVE_TEAM_BUFF } from "@/data/traceEffects"
import { resolveSelectedDisplayBuff } from "@/utils/buff-editor"

const FEINA_ID = 1801

/** 菲娜主控配置：满溯源 + Q / 团队被动 / 自身被动 */
function feinaSettings(patch: Partial<CharSettings> = {}): CharSettings {
    const feina = charMap.get(FEINA_ID)!
    return normalizeCharSettings({
        ...createDefaultCharSettings(),
        baseName: feina.技能[1].名称,
        meleeWeapon: 10206,
        rangedWeapon: 20102,
        auraMod: 0,
        buffs: [
            ["菲娜Q", 10],
            [FEINA_PASSIVE_TEAM_BUFF, 1],
            [FEINA_PASSIVE_SELF_BUFF, 1],
        ],
        ...patch,
    })
}

/** 候选实例（buffOptions 口径）：数据基础值 */
function baseBuff(label: string): LeveledBuff {
    return new LeveledBuff(buffMap.get(label)!, 1)
}

/** 已选实例（selectedBuffs 口径）：手动 BUFF + 溯源规则覆盖后的字段 */
function selectedBuffsOf(settings: CharSettings): LeveledBuff[] {
    const overrides = collectTraceEffects(settings, "main", { charId: FEINA_ID }).buffOverrides
    const manual = settings.buffs.map(([name, level, coverage]) => {
        const buff = new LeveledBuff(buffMap.get(name)!, level)
        if (coverage !== undefined && coverage !== 1) buff.coverage = coverage
        return buff
    })
    return applyTraceBuffOverrides(manual, overrides)
}

/** 已选卡片的展示数值 */
function displayValue(settings: CharSettings, label: string, key: string): number {
    const build = createCharBuildFromSettings(FEINA_ID, settings)
    const displayed = resolveSelectedDisplayBuff(label, baseBuff(label), selectedBuffsOf(settings), build)
    return displayed.values[key]
}

describe("已选 BUFF 展示值（U116-fix）", () => {
    it("菲娜满溯源：已选 菲娜被动(团队) 展示 0.45；关闭 2 根源回落 0.30", () => {
        expect(displayValue(feinaSettings(), FEINA_PASSIVE_TEAM_BUFF, "增伤")).toBeCloseTo(0.45, 10)
        expect(displayValue(feinaSettings({ traceOffRoots: [2] }), FEINA_PASSIVE_TEAM_BUFF, "增伤")).toBeCloseTo(0.3, 10)
    })

    it("菲娜被动(自身)：展示光追伤与 45 层探针一致；关闭 2 根源为 30 层值", () => {
        const openSettings = feinaSettings()
        const openBuild = createCharBuildFromSettings(FEINA_ID, openSettings)
        const probeValue = (build: ReturnType<typeof createCharBuildFromSettings>, layers: number) =>
            build.prepareBuff(
                new LeveledBuff(
                    {
                        名称: "探针",
                        attr: {
                            光属性追伤: `(坏巫师最怕阳光了::永续追加伤害倍率 + ${layers}*坏巫师最怕阳光了::[梦笔生花]每层追加伤害倍率)`,
                        },
                    },
                    1
                )
            ).values.光属性追伤
        const openDisplay = resolveSelectedDisplayBuff(
            FEINA_PASSIVE_SELF_BUFF,
            baseBuff(FEINA_PASSIVE_SELF_BUFF),
            selectedBuffsOf(openSettings),
            openBuild
        )
        expect(openDisplay.values.光属性追伤).toBeCloseTo(probeValue(openBuild, 45), 10)

        const closedSettings = feinaSettings({ traceOffRoots: [2] })
        const closedBuild = createCharBuildFromSettings(FEINA_ID, closedSettings)
        const closedDisplay = resolveSelectedDisplayBuff(
            FEINA_PASSIVE_SELF_BUFF,
            baseBuff(FEINA_PASSIVE_SELF_BUFF),
            selectedBuffsOf(closedSettings),
            closedBuild
        )
        expect(closedDisplay.values.光属性追伤).toBeCloseTo(probeValue(closedBuild, 30), 10)
        expect(openDisplay.values.光属性追伤).toBeGreaterThan(closedDisplay.values.光属性追伤)
    })

    it("未选中：返回候选实例的基础值（不显示未生效的覆盖）", () => {
        const settings = feinaSettings()
        const build = createCharBuildFromSettings(FEINA_ID, settings)
        expect(resolveSelectedDisplayBuff(FEINA_PASSIVE_TEAM_BUFF, baseBuff(FEINA_PASSIVE_TEAM_BUFF), [], build).values.增伤).toBeCloseTo(
            0.3,
            10
        )
        // 已选列表里有别的 BUFF，同名目标仍未选中
        const otherOnly = selectedBuffsOf(settings).filter(buff => buff.名称 === "菲娜Q")
        expect(
            resolveSelectedDisplayBuff(FEINA_PASSIVE_TEAM_BUFF, baseBuff(FEINA_PASSIVE_TEAM_BUFF), otherOnly, build).values.增伤
        ).toBeCloseTo(0.3, 10)
    })

    it("同名不同挂载点按 pt/pid 精确匹配；匹配不到回落基础值", () => {
        const mounted = (pid: number, value: number) => {
            const buff = new LeveledBuff({ 名称: "同名特效", attr: { 增伤: value } }, 1)
            buff.pt = "Mod"
            buff.pid = pid
            return buff
        }
        const first = mounted(1, 0.1)
        const second = mounted(2, 0.2)
        const selected = [first, second]

        expect(resolveSelectedDisplayBuff("同名特效", mounted(1, 0.5), selected, undefined).values.增伤).toBeCloseTo(0.1, 10)
        expect(resolveSelectedDisplayBuff("同名特效", mounted(2, 0.5), selected, undefined).values.增伤).toBeCloseTo(0.2, 10)
        // 未挂载的同名条目不是同一实例：回落候选基础值
        expect(resolveSelectedDisplayBuff("同名特效", mounted(3, 0.5), selected, undefined).values.增伤).toBeCloseTo(0.5, 10)
    })
})
