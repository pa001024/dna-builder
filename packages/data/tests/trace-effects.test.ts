import { describe, expect, it } from "vitest"
import { createCharBuildFromSettings } from "../CharBuildHelper"
import {
    type CharSettings,
    type CharSkillLevels,
    createDefaultAssistSideSettings,
    createDefaultCharSettings,
    normalizeCharSettings,
    serializeCharSettings,
    serializeCharSettingsForShare,
} from "../charSettings"
import { buffMap, charMap } from "../d"
import { LeveledBuff } from "../leveled"
import {
    applyTraceBuffOverrides,
    buildTraceRootCards,
    clampTraceLevel,
    collectTraceEffects,
    deriveSkillLevelFromTraceText,
    evaluateTraceConditions,
    FEINA_PASSIVE_SELF_BUFF,
    FEINA_PASSIVE_TEAM_BUFF,
    getMaxTraceLevel,
    getTraceEffects,
    isMappedLegacyTraceBuff,
    normalizeTraceOffRoots,
    normalizeTraceStacks,
    parseTraceSkillLevelText,
    resolveTraceAttrValue,
    resolveTraceLayers,
    resolveTraceOffRoots,
    resolveTraceStackValue,
    setTraceRootActive,
    setTraceStackCoverage,
    setTraceStackLevel,
    TRACE_BUFF_SOURCE,
    type TraceBuffRule,
} from "../traceEffects"
import { buildWasmTranscendPayload, withWasmTranscendPayload } from "../transcend-wasm"

const FEINA_ID = 1801
const LISE_ID = charMap.get("黎瑟")!.id
const SUYI_ID = charMap.get("苏乙")!.id

/** 技能在角色技能树顶层槽位（0=E / 1=Q / 2+=被动） */
function skillSlotOf(charId: number, skillName: string): number {
    const index = charMap.get(charId)!.技能.findIndex(skill => skill.名称 === skillName)
    if (index < 0) throw new Error(`缺少技能 ${skillName}`)
    return Math.min(index, 2)
}

/** 技能等级增量按技能树实际槽位汇总 */
function bonusBySlot(charId: number, entries: readonly { skillId: number; add: number }[]): number[] {
    const skills = charMap.get(charId)!.技能
    const bonus = [0, 0, 0]
    for (const entry of entries) {
        const index = skills.findIndex(skill => skill.id === entry.skillId)
        if (index < 0) throw new Error(`缺少技能 id ${entry.skillId}`)
        bonus[Math.min(index, 2)] += entry.add
    }
    return bonus
}

/** 溯源效果集中「溯源技能等级」合成 BUFF 的三键数值 */
function traceSkillAttrs(effects: ReturnType<typeof collectTraceEffects>): CharSkillLevels {
    const buff = effects.buffs.find(item => item.名称 === "溯源技能等级")
    if (!buff) return [0, 0, 0]
    return [buff.values.E技能等级 ?? 0, buff.values.Q技能等级 ?? 0, buff.values.P技能等级 ?? 0]
}

/** 根源卡片 attrs 中的三键技能等级 */
function cardSkillAttrs(card: ReturnType<typeof buildTraceRootCards>[number]): CharSkillLevels {
    return [card.attrs.E技能等级 ?? 0, card.attrs.Q技能等级 ?? 0, card.attrs.P技能等级 ?? 0]
}

/** 菲娜技能名（数据表 `Skill.名称` 为可选字段） */
function skillName(index: number): string {
    const name = charMap.get(FEINA_ID)?.技能?.[index]?.名称
    if (!name) throw new Error(`菲娜缺少第 ${index} 个技能`)
    return name
}

/** 归一化的菲娜主控配置：可指定溯级 / 手动 BUFF / 协战 */
function feinaSettings(patch: Partial<CharSettings> = {}): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = skillName(1)
    settings.meleeWeapon = 10206
    settings.rangedWeapon = 20102
    settings.auraMod = 0
    return normalizeCharSettings({ ...settings, ...patch })
}

/** 从构筑里取某条溯源派生 BUFF */
function traceBuff(settings: CharSettings, charId: number, name: string) {
    const build = createCharBuildFromSettings(charId, settings)
    return build.buffs.find(buff => buff.pt === TRACE_BUFF_SOURCE && buff.名称 === name)
}

describe("溯源结构化（U99d/U116）", () => {
    it("菲娜 1 溯：持有 Q 追加伤害时全属性穿透 0.24（4 元素 × 6%），无 Q 为 0", () => {
        const withQ = feinaSettings({ buffs: [["菲娜Q", 10]] })
        expect(traceBuff(withQ, FEINA_ID, "菲娜1溯")?.values.属性穿透).toBeCloseTo(0.24, 10)
        expect(createCharBuildFromSettings(FEINA_ID, withQ).calculateAttributes().属性穿透).toBeCloseTo(0.24, 10)

        const withoutQ = feinaSettings()
        expect(traceBuff(withoutQ, FEINA_ID, "菲娜1溯")?.values.属性穿透 ?? 0).toBe(0)
        expect(createCharBuildFromSettings(FEINA_ID, withoutQ).calculateAttributes().属性穿透).toBe(0)
    })

    it("菲娜 2 溯：梦笔生花层数上限 30→45，4 溯按层数取 0.02/0.01", () => {
        expect(resolveTraceLayers(FEINA_ID, 1)).toBe(30)
        expect(resolveTraceLayers(FEINA_ID, 2)).toBe(45)
        // 效果层的 30 层口径（纯求值，不受溯级累积影响）
        expect(resolveTraceAttrValue("0.02*{层数}", { 层数: 30, 元素数: 4, 额外触发数: 5, 溯级: 4 })).toBeCloseTo(0.6, 10)
        expect(resolveTraceAttrValue("0.01*{层数}", { 层数: 30, 元素数: 4, 额外触发数: 5, 溯级: 4 })).toBeCloseTo(0.3, 10)
        // 4 溯（含 2 溯）→ 45 层
        const settings = feinaSettings({ traceLevel: 4 })
        const buff = traceBuff(settings, FEINA_ID, "菲娜4溯")!
        expect(buff.values.技能威力).toBeCloseTo(0.9, 10)
        expect(buff.values.技能范围).toBeCloseTo(0.45, 10)
    })

    it("菲娜 6 溯：属性额外触发暴击 0.24 × 5 = 1.2", () => {
        const settings = feinaSettings({ traceLevel: 6 })
        const buff = traceBuff(settings, FEINA_ID, "菲娜6溯")!
        expect(buff.values.暴击).toBeCloseTo(1.2, 10)
    })

    it("菲娜 3/5 溯：E+2 / Q+2 / 被动+2 进入有效技能等级并联动 Q 数组与被动", () => {
        const base = feinaSettings({
            traceLevel: 2,
            buffs: [
                ["菲娜Q", 10],
                ["菲娜被动(自身)", 1],
            ],
        })
        const baseBuild = createCharBuildFromSettings(FEINA_ID, base)
        expect(baseBuild.skillLevel).toEqual([10, 10, 10])
        expect(baseBuild.calculateAttributes().E技能等级).toBe(0)

        const full = feinaSettings({
            traceLevel: 6,
            buffs: [
                ["菲娜Q", 10],
                ["菲娜被动(自身)", 1],
            ],
        })
        const fullBuild = createCharBuildFromSettings(FEINA_ID, full)
        // E +2（3 溯）/ Q +2（5 溯）/ 被动 +1 +1（3、5 溯），经「溯源技能等级」合成 BUFF 进入标准属性池
        const fullAttrs = fullBuild.calculateAttributes()
        expect([fullAttrs.E技能等级, fullAttrs.Q技能等级, fullAttrs.P技能等级]).toEqual([2, 2, 2])
        expect(fullBuild.skillLevel).toEqual([12, 12, 12])
        // Q 等级 10 → 12：单元素追加伤害 0.15 → 0.172
        const qBuff = fullBuild.buffs.find(buff => buff.名称 === "菲娜Q")!
        expect(qBuff.等级).toBe(12)
        expect(fullBuild.prepareBuff(qBuff).values.水属性追伤).toBeCloseTo(0.172, 10)
    })

    it("队友注入：协战菲娜的团队溯源进入主控且 ownerSide 正确；停用协战不注入", () => {
        const settings = feinaSettings({
            traceLevel: 0,
            buffs: [["菲娜Q", 12]],
            team1: FEINA_ID,
            team1Weapon: 10302,
            assist1: {
                ...createDefaultCharSettings().assist1,
                charSkillLevel: [10, 10, 10],
                traceLevel: 6,
                baseName: skillName(1),
                enabled: true,
            },
        })
        const effects = collectTraceEffects(settings, "main", { charId: LISE_ID })
        const penetration = effects.buffs.find(buff => buff.名称 === "菲娜1溯")!
        expect(penetration.values.属性穿透).toBeCloseTo(0.24, 10)
        expect(penetration.source?.ownerSide).toBe("assist1")
        expect(penetration.source?.grade).toBe(1)
        // 6 溯的自身效果不会跨侧进入主控
        expect(effects.buffs.some(buff => buff.名称 === "菲娜6溯")).toBe(false)

        const disabled = { ...settings, assist1: { ...settings.assist1, enabled: false } }
        expect(collectTraceEffects(disabled, "main", { charId: LISE_ID }).buffs.some(buff => buff.名称 === "菲娜1溯")).toBe(false)
    })

    it("每侧溯级独立：主控 0 溯不产生自身效果，协战满溯照常注入队友", () => {
        const settings = feinaSettings({
            traceLevel: 0,
            buffs: [["菲娜Q", 12]],
            team1: FEINA_ID,
            team1Weapon: 10302,
            assist1: {
                ...createDefaultCharSettings().assist1,
                traceLevel: 6,
                baseName: skillName(1),
                enabled: true,
            },
        })
        const mainEffects = collectTraceEffects(settings, "main", { charId: FEINA_ID })
        // 主控自身（菲娜）0 溯：没有自身效果；协战同名角色按队伍约束本不应重复，这里只验证不越级注入
        expect(mainEffects.buffs.every(buff => buff.source?.ownerSide === "assist1")).toBe(true)
        const assistEffects = collectTraceEffects(settings, "assist1", { charId: FEINA_ID })
        expect(assistEffects.buffs.some(buff => buff.名称 === "菲娜6溯")).toBe(true)
    })

    it("旧存档迁移：`*溯` 手写 BUFF 转溯级并从列表移除，菲娜被动+1溯 只补团队增伤载体", () => {
        const settings = feinaSettings({
            traceLevel: 0,
            buffs: [
                ["菲娜Q", 12],
                ["菲娜4溯", 1],
                ["菲娜6溯", 5],
                ["菲娜被动+1溯", 1],
            ],
        })
        // 主控归一化期不知道角色 id：条目保留、溯级写入，由构筑工厂按 id 跳过注入（防双计）；
        // `菲娜被动+1溯` 迁移为 `菲娜被动(团队)`，45% / 24% 由溯源规则与 1 溯源效果提供
        expect(settings.buffs.map(entry => entry[0])).toEqual(["菲娜Q", "菲娜4溯", "菲娜6溯", FEINA_PASSIVE_TEAM_BUFF])
        expect(settings.traceLevel).toBe(6)
        expect(isMappedLegacyTraceBuff("菲娜4溯")).toBe(true)
        expect(isMappedLegacyTraceBuff("扶疏被动(4溯)")).toBe(false)
        // 旧存档兼容条目已删除：数据表不再提供
        expect(buffMap.has("菲娜被动(团队·旧)")).toBe(false)
        expect(buffMap.has("菲娜1溯(旧)")).toBe(false)

        // 已知角色 id 的协战侧：属于本角色的旧条目直接移除
        const assistSettings = normalizeCharSettings({
            ...feinaSettings({ traceLevel: 0 }),
            team1: FEINA_ID,
            team1Weapon: 10302,
            assist1: {
                ...createDefaultCharSettings().assist1,
                traceLevel: 0,
                buffs: [
                    ["菲娜4溯", 1],
                    ["菲娜6溯", 5],
                ],
            },
        })
        expect(assistSettings.assist1.buffs).toEqual([])
        expect(assistSettings.assist1.traceLevel).toBe(6)

        const build = createCharBuildFromSettings(FEINA_ID, settings)
        // 迁移后同一效果只从溯源区产生：手动列表里不再有 `*溯` 条目
        expect(build.buffs.filter(buff => buff.名称 === "菲娜4溯")).toHaveLength(1)
        expect(build.buffs.some(buff => buff.名称.includes("旧"))).toBe(false)
    })

    it("旧存档迁移：单独的 菲娜被动+1溯 → 菲娜被动(团队)，并启用 1、2 根源", () => {
        const settings = feinaSettings({ traceLevel: 0, buffs: [["菲娜被动+1溯", 1]] })
        expect(settings.buffs).toEqual([[FEINA_PASSIVE_TEAM_BUFF, 1]])
        expect(settings.traceOffRoots).not.toContain(1)
        expect(settings.traceOffRoots).not.toContain(2)
        expect(settings.traceLevel).toBe(2)
        const build = createCharBuildFromSettings(FEINA_ID, settings)
        expect(build.buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!.values.增伤).toBeCloseTo(0.45, 10)
    })

    it("旧 `*旧` 载体在迁移中直接丢弃：补 菲娜被动(团队)、启用 1、2 根源，数值不回退", () => {
        const settings = feinaSettings({
            traceLevel: 0,
            buffs: [
                ["菲娜Q", 10],
                ["菲娜被动(团队·旧)", 1],
                ["菲娜1溯(旧)", 1],
            ],
        })
        expect(settings.buffs.map(([name]) => name)).toEqual(["菲娜Q", FEINA_PASSIVE_TEAM_BUFF])
        expect(settings.traceOffRoots).not.toContain(1)
        expect(settings.traceOffRoots).not.toContain(2)
        const build = createCharBuildFromSettings(FEINA_ID, settings)
        expect(build.buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!.values.增伤).toBeCloseTo(0.45, 10)
        expect(build.calculateAttributes().属性穿透).toBeCloseTo(0.24, 10)
    })

    it("默认溯级：旧档缺字段取最大（菲娜 6），显式 0 保持关闭，越界钳制", () => {
        const settings = createDefaultCharSettings()
        expect(normalizeCharSettings(settings).traceLevel).toBe(7)
        expect(clampTraceLevel(undefined, FEINA_ID)).toBe(6)
        expect(getMaxTraceLevel(FEINA_ID)).toBe(6)
        expect(clampTraceLevel(99, FEINA_ID)).toBe(6)
        expect(clampTraceLevel(0, FEINA_ID)).toBe(0)
        expect(normalizeCharSettings({ ...settings, traceLevel: 0 }).traceLevel).toBe(0)
    })

    it("旧手写 BUFF 派生溯源：其他角色按默认等级数值迁入（数值不丢失）", () => {
        // 希尔妲2溯：mx 5、增伤 0.18/级 → 默认 5 级 = 0.9
        const xierda = charMap.get("希尔妲")!.id
        const derived = collectTraceEffects(feinaSettings({ traceLevel: 2 }), "main", { charId: xierda })
        const buff = derived.buffs.find(item => item.名称 === "希尔妲2溯")!
        expect(buff.values.增伤).toBeCloseTo(0.9, 10)
        expect(buff.source?.kind).toBe("trace")
    })

    it("跨角色借用 `菲娜被动+1溯`：迁移为 `菲娜被动(团队)` 并启用本侧 1、2 根源，不再产生旧兼容数值", () => {
        const xierda = charMap.get("希尔妲")!.id
        const settings = feinaSettings({ traceLevel: 0, buffs: [["菲娜被动+1溯", 1]] })
        const build = createCharBuildFromSettings(xierda, settings)
        // 无菲娜队友时规则不生效：团队增伤停在 30 层基准，也不再借出 1 溯穿透
        expect(build.buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!.values.增伤).toBeCloseTo(0.3, 10)
        expect(build.calculateAttributes().属性穿透).toBe(0)
        // 迁移启用本侧 1、2 根源：希尔妲 2 溯（0.18/层 × 5 层）随之生效
        expect(build.buffs.find(buff => buff.名称 === "希尔妲2溯")!.values.增伤).toBeCloseTo(0.9, 10)
        expect(build.buffs.some(buff => buff.名称.includes("旧"))).toBe(false)
    })

    it("wasm 载荷与 TS 同值：溯源 BUFF 与技能等级增量随请求下发", () => {
        const settings = feinaSettings({ buffs: [["菲娜Q", 10]] })
        const payload = buildWasmTranscendPayload(FEINA_ID, settings)!
        const names = payload.main.buffs.map(buff => buff.data.名称)
        expect(names).toContain("菲娜1溯")
        expect(names).toContain("菲娜4溯")
        expect(names).toContain("溯源技能等级")
        // U126b：三键随溯源合成 BUFF 原样下发（Rust 标准属性管线二次装配等级）
        expect(payload.main).not.toHaveProperty("skillLevelBonus")
        const skillLevelBuff = payload.main.buffs.find(buff => buff.data.名称 === "溯源技能等级")!
        expect(skillLevelBuff.data.attr).toEqual({ E技能等级: 2, Q技能等级: 2, P技能等级: 2 })
        const penetration = payload.main.buffs.find(buff => buff.data.名称 === "菲娜1溯")!
        expect(penetration.data.attr?.属性穿透).toBeCloseTo(0.24, 10)
        expect(penetration.level).toBe(1)

        // TS 侧同值（属性穿透 0.24 / 技能威力 0.9）
        const build = createCharBuildFromSettings(FEINA_ID, settings)
        const tsPenetration = build.buffs.find(buff => buff.名称 === "菲娜1溯")!
        const wasmLeveled = new LeveledBuff(penetration.data, penetration.level)
        expect(tsPenetration.values).toEqual(wasmLeveled.values)
    })
})

describe("溯源原文技能等级（U114）", () => {
    it("苏乙 3/5 根源原文解析：3 根源 E+2 / P+1，5 根源 Q+2 / P+1，并进入有效技能等级与卡片", () => {
        const effects = getTraceEffects(SUYI_ID)
        const root3 = effects.find(effect => effect.grade === 3)!
        const root5 = effects.find(effect => effect.grade === 5)!
        expect(root3.name).toBe("第3根源")
        expect(root5.name).toBe("第5根源")
        expect(root3.attrs).toBeUndefined()

        const root3Expected = bonusBySlot(SUYI_ID, [
            { skillId: charMap.get(SUYI_ID)!.技能.find(skill => skill.名称 === "逐日")!.id!, add: 2 },
            { skillId: charMap.get(SUYI_ID)!.技能.find(skill => skill.名称 === "蓄势待发")!.id!, add: 1 },
        ])
        expect(bonusBySlot(SUYI_ID, root3.skillLevel!)).toEqual(root3Expected)
        const root5Expected = bonusBySlot(SUYI_ID, [
            { skillId: charMap.get(SUYI_ID)!.技能.find(skill => skill.名称 === "歼星模式")!.id!, add: 2 },
            { skillId: charMap.get(SUYI_ID)!.技能.find(skill => skill.名称 === "蓄势待发")!.id!, add: 1 },
        ])
        expect(bonusBySlot(SUYI_ID, root5.skillLevel!)).toEqual(root5Expected)

        // 满根源：3 + 5 叠加（被动 +2）
        const settings = normalizeCharSettings({
            ...createDefaultCharSettings(),
            meleeWeapon: 10206,
            rangedWeapon: 20102,
            auraMod: 0,
            baseName: "逐日",
        })
        const combined = root3Expected.map((value, index) => value + root5Expected[index])
        expect(traceSkillAttrs(collectTraceEffects(settings, "main", { charId: SUYI_ID }))).toEqual(combined)
        expect(cardSkillAttrs(buildTraceRootCards(settings, "main", { charId: SUYI_ID }).find(card => card.root === 3)!)).toEqual(
            root3Expected
        )
        const build = createCharBuildFromSettings(SUYI_ID, settings)
        const attrs = build.calculateAttributes()
        expect([attrs.E技能等级, attrs.Q技能等级, attrs.P技能等级]).toEqual(combined)
        expect(build.skillLevel).toEqual(combined.map(value => 10 + value))
        expect(skillSlotOf(SUYI_ID, "逐日")).toBe(0)
    })

    it("菲娜 1801：精确表不被派生解析覆盖", () => {
        const effects = getTraceEffects(FEINA_ID)
        expect(effects.find(effect => effect.grade === 3)!.skillLevel).toEqual([
            { skillId: 180101, add: 2 },
            { skillId: 180103, add: 1 },
        ])
        expect(effects.find(effect => effect.grade === 5)!.skillLevel).toEqual([
            { skillId: 180102, add: 2 },
            { skillId: 180103, add: 1 },
        ])
        expect(effects.some(effect => effect.name === "第3根源" || effect.name === "第5根源")).toBe(false)
    })

    it("条件性条款不被采纳：释放X时 / 同时 整句跳过", () => {
        expect(deriveSkillLevelFromTraceText(SUYI_ID, "释放[逐日]时，[逐日]等级+2")).toEqual([])
        expect(deriveSkillLevelFromTraceText(SUYI_ID, "同时[蓄势待发]等级+1")).toEqual([])
    })

    it("无法解析的技能名被跳过并计数", () => {
        const rizhiId = charMap.get(SUYI_ID)!.技能.find(skill => skill.名称 === "逐日")!.id
        const parsed = parseTraceSkillLevelText(SUYI_ID, "[不存在的技能]等级+2，[逐日]等级+1")
        expect(parsed.skillLevel).toEqual([{ skillId: rizhiId, add: 1 }])
        expect(parsed.unresolved).toEqual(["不存在的技能"])
    })

    it("同一根源重复条款按技能 + 增量去重；括号归一化与技能名内逗号", () => {
        const rizhiId = charMap.get(SUYI_ID)!.技能.find(skill => skill.名称 === "逐日")!.id
        expect(deriveSkillLevelFromTraceText(SUYI_ID, "[逐日]等级+2，[逐日]等级+2。")).toEqual([{ skillId: rizhiId, add: 2 }])
        expect(deriveSkillLevelFromTraceText(SUYI_ID, "「逐日」等级+1")).toEqual([{ skillId: rizhiId, add: 1 }])
        // [你好，世界] 的技能名内含逗号：括号感知切分后仍能整段解析
        const yive = charMap.get("伊薇")!
        expect(getTraceEffects(yive.id).find(effect => effect.grade === 3)!.skillLevel).toHaveLength(2)
    })
})

describe("根源开关（U113）", () => {
    it("关闭列表归一化与旧溯级迁移：整数去重升序、越界丢弃；traceLevel 0 迁移为全部关闭", () => {
        expect(normalizeTraceOffRoots([3, 1, 3, 9, 0, -1, 2.7], FEINA_ID)).toEqual([1, 3])
        expect(resolveTraceOffRoots(undefined, 4, FEINA_ID)).toEqual([5, 6])
        expect(resolveTraceOffRoots(undefined, 0, FEINA_ID)).toEqual([1, 2, 3, 4, 5, 6])
        expect(resolveTraceOffRoots(undefined, undefined, FEINA_ID)).toEqual([])
        // 显式列表优先（迁移只在字段缺失 / 空列表时兜底）
        expect(resolveTraceOffRoots([2], 0, FEINA_ID)).toEqual([2])

        const migrated = normalizeCharSettings({ ...createDefaultCharSettings(), traceLevel: 4 })
        expect(migrated.traceOffRoots).toEqual([5, 6, 7])
        expect(migrated.traceLevel).toBe(4)
        const closed = normalizeCharSettings({ ...createDefaultCharSettings(), traceLevel: 0 })
        expect(closed.traceOffRoots).toEqual([1, 2, 3, 4, 5, 6, 7])
        expect(closed.traceLevel).toBe(0)
        expect(normalizeCharSettings(createDefaultCharSettings()).traceOffRoots).toEqual([])
    })

    it("翻转根源：写回关闭列表", () => {
        const settings = feinaSettings()
        expect(setTraceRootActive(settings, 3, false, FEINA_ID)).toEqual([3])
        expect(setTraceRootActive({ ...settings, traceOffRoots: [3, 5] }, 3, true, FEINA_ID)).toEqual([5])
    })

    it("存档往返：关闭状态经序列化 → 归一化保持；全开时主控省略空列表仍为全开", () => {
        const settings = feinaSettings({ buffs: [["菲娜Q", 10]] })
        settings.traceOffRoots = [2, 5]
        const restored = normalizeCharSettings(JSON.parse(serializeCharSettings(settings)))
        expect(restored.traceOffRoots).toEqual([2, 5])

        settings.traceOffRoots = []
        const allOn = JSON.parse(serializeCharSettings(settings))
        expect(allOn.traceOffRoots).toBeUndefined()
        expect(normalizeCharSettings(allOn).traceOffRoots).toEqual([])
    })

    it("关闭根源后：attrs / 技能等级增量 / 队友注入全部消失，层数按激活集合重算", () => {
        const withQ = feinaSettings({
            buffs: [
                ["菲娜Q", 10],
                ["菲娜被动(自身)", 1],
                [FEINA_PASSIVE_TEAM_BUFF, 1],
            ],
        })
        const all = collectTraceEffects(withQ, "main", { charId: FEINA_ID })
        expect(traceSkillAttrs(all)).toEqual([2, 2, 2])
        expect(all.buffs.find(buff => buff.名称 === "菲娜4溯")!.values.技能威力).toBeCloseTo(0.9, 10)
        expect(all.buffs.find(buff => buff.名称 === "菲娜1溯")!.values.属性穿透).toBeCloseTo(0.24, 10)

        // 2 根源关闭：4 根源回到 30 层；3、5 根源关闭：技能等级增量归零
        const off = collectTraceEffects({ ...withQ, traceOffRoots: [2, 3, 5] }, "main", { charId: FEINA_ID })
        expect(traceSkillAttrs(off)).toEqual([0, 0, 0])
        expect(off.buffs.find(buff => buff.名称 === "菲娜4溯")!.values.技能威力).toBeCloseTo(0.6, 10)
        expect(off.buffs.some(buff => buff.名称 === "菲娜1溯")).toBe(true)

        // 1 根源关闭：穿透消失，其余保持
        const offRoot1 = collectTraceEffects({ ...withQ, traceOffRoots: [1] }, "main", { charId: FEINA_ID })
        expect(offRoot1.buffs.some(buff => buff.名称 === "菲娜1溯")).toBe(false)
        expect(traceSkillAttrs(offRoot1)).toEqual([2, 2, 2])
    })

    it("旧 *溯 迁移不得改写显式关闭列表（主控 / 协战，含序列化往返）", () => {
        const withOff = feinaSettings({ traceOffRoots: [1, 2, 3, 4], buffs: [["菲娜4溯", 1]] })
        expect(withOff.traceOffRoots).toEqual([1, 2, 3, 4])
        expect(withOff.traceLevel).toBe(7)
        const partial = feinaSettings({ traceOffRoots: [2], buffs: [["菲娜4溯", 1]] })
        expect(partial.traceOffRoots).toEqual([2])
        expect(partial.traceLevel).toBe(7)
        // 存档往返后仍尊重显式关闭（P1 回归）
        expect(normalizeCharSettings(JSON.parse(serializeCharSettings(partial))).traceOffRoots).toEqual([2])
        // 带团队 BUFF 的构筑：关闭 2 根源后数值为 0.30，重载不会回到 0.45
        const buildSettings = feinaSettings({
            traceOffRoots: [2],
            buffs: [
                ["菲娜4溯", 1],
                [FEINA_PASSIVE_TEAM_BUFF, 1],
            ],
        })
        expect(
            createCharBuildFromSettings(FEINA_ID, buildSettings).buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!.values.增伤
        ).toBeCloseTo(0.3, 10)

        const assist = normalizeCharSettings({
            ...feinaSettings({ traceOffRoots: [7] }),
            team1: FEINA_ID,
            team1Weapon: 10302,
            assist1: {
                ...createDefaultAssistSideSettings(),
                traceOffRoots: [2],
                buffs: [["菲娜4溯", 1]],
                baseName: skillName(1),
            },
        })
        expect(assist.assist1.traceOffRoots).toEqual([2])
        expect(assist.assist1.traceLevel).toBe(6)
        const restoredAssist = normalizeCharSettings(JSON.parse(serializeCharSettings(assist)))
        expect(restoredAssist.assist1.traceOffRoots).toEqual([2])
    })

    it("旧档（无 traceOffRoots）首次迁移仍启用迁移出的根源", () => {
        const legacy = feinaSettings({ traceLevel: 1, buffs: [["菲娜4溯", 1]] })
        // 旧溯级 1 → 关闭 2..7；迁移出 4 溯源 → 1..4 生效
        expect(legacy.traceOffRoots).toEqual([5, 6, 7])
        expect(legacy.traceLevel).toBe(4)
    })

    it("分享序列化往返：主控 / 协战关闭列表保持", () => {
        const settings = feinaSettings({
            buffs: [["菲娜Q", 10]],
            traceOffRoots: [2],
            team1: FEINA_ID,
            team1Weapon: 10302,
            assist1: {
                ...createDefaultAssistSideSettings(),
                traceOffRoots: [1],
                baseName: skillName(1),
                enabled: true,
            },
        })
        const restored = normalizeCharSettings(JSON.parse(serializeCharSettingsForShare(settings)))
        expect(restored.traceOffRoots).toEqual([2])
        expect(restored.assist1.traceOffRoots).toEqual([1])
        expect(restored.assist1.traceLevel).toBe(6)
    })

    it("跨侧根源卡按受益侧（主控）上下文求值：协战菲娜 1 根源", () => {
        const base = {
            traceLevel: 0,
            team1: FEINA_ID,
            team1Weapon: 10302,
            assist1: {
                ...createDefaultAssistSideSettings(),
                traceLevel: 6,
                traceOffRoots: [],
                baseName: skillName(1),
                enabled: true,
            },
        }
        const withQ = feinaSettings({ ...base, buffs: [["菲娜Q", 12]] })
        const card = buildTraceRootCards(withQ, "assist1", { charId: LISE_ID }).find(item => item.root === 1)!
        expect(card.conditionMet).toBe(true)
        expect(card.contextSide).toBe("main")
        expect(card.attrs.属性穿透).toBeCloseTo(0.24, 10)
        const injected = collectTraceEffects(withQ, "main", { charId: LISE_ID }).buffs.find(buff => buff.名称 === "菲娜1溯")!
        expect(injected.values.属性穿透).toBeCloseTo(card.attrs.属性穿透!, 10)

        const withoutQ = feinaSettings({ ...base })
        const closed = buildTraceRootCards(withoutQ, "assist1", { charId: LISE_ID }).find(item => item.root === 1)!
        expect(closed.conditionMet).toBe(false)
        expect(closed.note).toBe("菲娜Q")
        expect(closed.attrs.属性穿透 ?? 0).toBe(0)
    })

    it("协战侧关闭根源后不再向主控注入团队效果", () => {
        const settings = feinaSettings({
            traceLevel: 0,
            buffs: [["菲娜Q", 12]],
            team1: FEINA_ID,
            team1Weapon: 10302,
            assist1: {
                ...createDefaultAssistSideSettings(),
                traceLevel: 6,
                traceOffRoots: [],
                baseName: skillName(1),
                enabled: true,
            },
        })
        expect(collectTraceEffects(settings, "main", { charId: LISE_ID }).buffs.some(buff => buff.名称 === "菲娜1溯")).toBe(true)
        const closed = { ...settings, assist1: { ...settings.assist1, traceOffRoots: [1] } }
        expect(collectTraceEffects(closed, "main", { charId: LISE_ID }).buffs.some(buff => buff.名称 === "菲娜1溯")).toBe(false)
    })

    it("根源卡片：每个根源一张（含关闭根源），收益数值按当前激活集合求值", () => {
        const settings = feinaSettings({
            buffs: [
                ["菲娜Q", 10],
                ["菲娜被动(自身)", 1],
                [FEINA_PASSIVE_TEAM_BUFF, 1],
            ],
            traceOffRoots: [2],
        })
        const cards = buildTraceRootCards(settings, "main", { charId: FEINA_ID })
        expect(cards.map(card => card.root)).toEqual([1, 2, 3, 4, 5, 6])
        expect(cards[1].active).toBe(false)
        // 2 溯源不再有增量属性：数值联动由规则覆盖目标 BUFF 表达
        expect(cards[1].attrs).toEqual({})
        expect(cards[2].attrs.E技能等级).toBe(2)
        expect(cards[2].attrs.P技能等级).toBe(1)
        expect(cards[3].attrs.技能威力).toBeCloseTo(0.6, 10)
        expect(cards[4].attrs.Q技能等级).toBe(2)
        expect(cards[4].attrs.P技能等级).toBe(1)
        expect(cards[5].attrs.暴击).toBeCloseTo(1.2, 10)

        // 未持有 Q 追加伤害：1 根源条件不满足，不产出数值
        const withoutQ = buildTraceRootCards(feinaSettings({ traceOffRoots: [2] }), "main", { charId: FEINA_ID })
        expect(withoutQ[0].conditionMet).toBe(false)
        expect(withoutQ[0].note).toBe("菲娜Q")
        expect(withoutQ[0].attrs.属性穿透 ?? 0).toBe(0)
        // 未配置的协战侧不产出卡片
        expect(buildTraceRootCards(settings, "assist1", { charId: FEINA_ID })).toEqual([])
    })
})

describe("溯源等级与覆盖率（U115）", () => {
    const berenika = charMap.get("贝蕾妮卡")!
    const BERENIKA_ID = berenika.id

    /** 贝蕾妮卡主控配置：可指定层数设置 */
    function berenikaSettings(patch: Partial<CharSettings> = {}): CharSettings {
        return normalizeCharSettings({
            ...createDefaultCharSettings(),
            meleeWeapon: 10206,
            rangedWeapon: 20102,
            auraMod: 0,
            baseName: berenika.技能[1].名称,
            ...patch,
        })
    }

    /** 某根源派生 BUFF 的数值 */
    function rootValues(settings: CharSettings, name: string) {
        return traceBuff(settings, BERENIKA_ID, name)?.values
    }

    /** 某根源卡片 */
    function rootCard(settings: CharSettings, root: number) {
        return buildTraceRootCards(settings, "main", { charId: BERENIKA_ID }).find(card => card.root === root)!
    }

    it("派生表保留每层数值与 mx：1 根源 0.08/层 × 3 层，默认满层 0.24", () => {
        const effect = getTraceEffects(BERENIKA_ID).find(item => item.grade === 1)!
        expect(effect.mx).toBe(3)
        expect(effect.attrs).toEqual({ 技能效益: 0.08 })
        expect(rootValues(berenikaSettings(), "贝蕾妮卡1溯")!.技能效益).toBeCloseTo(0.24, 10)
        expect(rootCard(berenikaSettings(), 1)).toMatchObject({ mx: 3, level: 3, coverage: 1 })
        expect(rootCard(berenikaSettings(), 1).attrs.技能效益).toBeCloseTo(0.24, 10)
    })

    it("等级缩放：level 1 → 0.08，level 2 → 0.16；覆盖率 0.5 × level 3 → 0.12", () => {
        expect(rootValues(berenikaSettings({ traceStacks: [[1, 1]] }), "贝蕾妮卡1溯")!.技能效益).toBeCloseTo(0.08, 10)
        expect(rootValues(berenikaSettings({ traceStacks: [[1, 2]] }), "贝蕾妮卡1溯")!.技能效益).toBeCloseTo(0.16, 10)
        expect(rootValues(berenikaSettings({ traceStacks: [[1, 3, 0.5]] }), "贝蕾妮卡1溯")!.技能效益).toBeCloseTo(0.12, 10)

        const card = rootCard(berenikaSettings({ traceStacks: [[1, 2]] }), 1)
        expect(card).toMatchObject({ level: 2, coverage: 1 })
        expect(card.attrs.技能效益).toBeCloseTo(0.16, 10)
        const half = rootCard(berenikaSettings({ traceStacks: [[1, 3, 0.5]] }), 1)
        expect(half).toMatchObject({ level: 3, coverage: 0.5 })
        expect(half.attrs.技能效益).toBeCloseTo(0.12, 10)
    })

    it("无 mx 的固定效果：等级恒 1，仅覆盖率生效", () => {
        const leveled = berenikaSettings({ traceStacks: [[2, 4]] })
        expect(rootValues(leveled, "贝蕾妮卡2溯")!.增伤).toBeCloseTo(0.3, 10)
        expect(rootCard(leveled, 2)).toMatchObject({ mx: 1, level: 1, coverage: 1 })
        const half = berenikaSettings({ traceStacks: [[2, 4, 0.5]] })
        expect(rootValues(half, "贝蕾妮卡2溯")!.增伤).toBeCloseTo(0.15, 10)
        expect(rootCard(half, 2)).toMatchObject({ mx: 1, level: 1, coverage: 0.5 })
    })

    it("技能等级根源不受等级 / 覆盖率影响", () => {
        const base = normalizeCharSettings({
            ...createDefaultCharSettings(),
            meleeWeapon: 10206,
            rangedWeapon: 20102,
            auraMod: 0,
            baseName: "逐日",
        })
        const scaled = normalizeCharSettings({ ...base, traceStacks: [[3, 1, 0.5]] })
        const baseBonus = traceSkillAttrs(collectTraceEffects(base, "main", { charId: SUYI_ID }))
        expect(baseBonus.some(Boolean)).toBe(true)
        expect(traceSkillAttrs(collectTraceEffects(scaled, "main", { charId: SUYI_ID }))).toEqual(baseBonus)
        expect(cardSkillAttrs(buildTraceRootCards(scaled, "main", { charId: SUYI_ID }).find(card => card.root === 3)!)).toEqual(
            cardSkillAttrs(buildTraceRootCards(base, "main", { charId: SUYI_ID }).find(card => card.root === 3)!)
        )
    })

    it("关闭的根源保留 level / coverage，重新打开后恢复缩放", () => {
        const closed = berenikaSettings({ traceOffRoots: [1], traceStacks: [[1, 2, 0.5]] })
        expect(rootCard(closed, 1)).toMatchObject({ active: false, level: 2, coverage: 0.5 })
        expect(collectTraceEffects(closed, "main", { charId: BERENIKA_ID }).buffs.some(buff => buff.名称 === "贝蕾妮卡1溯")).toBe(false)
        const reopened = { ...closed, traceOffRoots: [] }
        expect(rootValues(reopened, "贝蕾妮卡1溯")!.技能效益).toBeCloseTo(0.08, 10)
    })

    it("traceStacks 归一化：去重取最后、升序、越界 / 非法丢弃，等级钳 1..99、覆盖率钳 0..1 保留 6 位", () => {
        expect(normalizeTraceStacks([[3, 2], [1, 5], [1, 2], [9, 1], [2.7, 3.2], ["x", 1], [4, Number.NaN], "bad"], BERENIKA_ID)).toEqual([
            [1, 2],
            [3, 3],
        ])
        expect(
            normalizeTraceStacks(
                [
                    [1, 0],
                    [2, 999],
                ],
                BERENIKA_ID
            )
        ).toEqual([
            [1, 1],
            [2, 99],
        ])
        expect(
            normalizeTraceStacks(
                [
                    [1, 1, 0.123456789],
                    [2, 1, 1],
                    [3, 1, 2],
                    [4, 1, -1],
                ],
                BERENIKA_ID
            )
        ).toEqual([
            [1, 1, 0.123457],
            [2, 1],
            [3, 1],
            [4, 1, 0],
        ])
        expect(normalizeTraceStacks(undefined, BERENIKA_ID)).toEqual([])
        expect(resolveTraceStackValue([[1, 2, 0.5]], 1, 3)).toEqual({ level: 2, coverage: 0.5 })
        expect(resolveTraceStackValue(undefined, 1, 3)).toEqual({ level: 3, coverage: 1 })
        expect(resolveTraceStackValue([[1, 99]], 1, 3)).toEqual({ level: 3, coverage: 1 })
    })

    it("写入等级 / 覆盖率：保留另一维，缺省条目按 mx 建档，覆盖率 1 时省第三项", () => {
        expect(setTraceStackLevel({ traceStacks: [[1, 2, 0.5]] }, 1, 3, BERENIKA_ID)).toEqual([[1, 3, 0.5]])
        expect(setTraceStackCoverage({ traceStacks: [[1, 2]] }, 1, 0.25, BERENIKA_ID)).toEqual([[1, 2, 0.25]])
        expect(setTraceStackCoverage({ traceStacks: [] }, 1, 0.5, BERENIKA_ID)).toEqual([[1, 3, 0.5]])
        expect(setTraceStackCoverage({ traceStacks: [[1, 2, 0.5]] }, 1, 1, BERENIKA_ID)).toEqual([[1, 2]])
    })

    it("存档 / 分享往返：主控省略空设置，协战侧完整携带", () => {
        const settings = berenikaSettings({
            traceStacks: [
                [1, 1],
                [2, 1, 0.5],
            ],
        })
        const restored = normalizeCharSettings(JSON.parse(serializeCharSettings(settings)))
        expect(restored.traceStacks).toEqual([
            [1, 1],
            [2, 1, 0.5],
        ])

        const empty = JSON.parse(serializeCharSettings(berenikaSettings()))
        expect(empty.traceStacks).toBeUndefined()
        expect(normalizeCharSettings(empty).traceStacks).toEqual([])

        const assist = normalizeCharSettings({
            ...createDefaultCharSettings(),
            team1: BERENIKA_ID,
            team1Weapon: 10302,
            assist1: {
                ...createDefaultAssistSideSettings(),
                baseName: berenika.技能[0].名称,
                traceStacks: [
                    [1, 2],
                    [4, 1, 0.5],
                ],
            },
        })
        expect(assist.assist1.traceStacks).toEqual([
            [1, 2],
            [4, 1, 0.5],
        ])
        const shared = normalizeCharSettings(JSON.parse(serializeCharSettingsForShare(assist)))
        expect(shared.assist1.traceStacks).toEqual([
            [1, 2],
            [4, 1, 0.5],
        ])
        const assistEffects = collectTraceEffects(assist, "assist1", { charId: BERENIKA_ID })
        expect(assistEffects.buffs.find(buff => buff.名称 === "贝蕾妮卡1溯")!.values.技能效益).toBeCloseTo(0.16, 10)
    })
})

describe("溯源数值条件与字段覆盖（U116）", () => {
    /** 黎瑟主控配置：可指定手动 BUFF / 协战；主控自身溯源默认关闭，隔离菲娜联动 */
    function liseSettings(patch: Partial<CharSettings> = {}): CharSettings {
        const lise = charMap.get("黎瑟")!
        return normalizeCharSettings({
            ...createDefaultCharSettings(),
            baseName: lise.技能?.[1]?.名称 ?? "",
            meleeWeapon: 10206,
            rangedWeapon: 20102,
            auraMod: 0,
            traceLevel: 0,
            ...patch,
        })
    }

    /** 黎瑟主控 + 满溯源菲娜协战 */
    function feinaTeam(patch: Partial<CharSettings> = {}): CharSettings {
        return liseSettings({
            buffs: [
                ["菲娜Q", 10],
                [FEINA_PASSIVE_TEAM_BUFF, 1],
            ],
            team1: FEINA_ID,
            team1Weapon: 20509,
            assist1: {
                ...createDefaultAssistSideSettings(),
                enabled: true,
                baseName: skillName(1),
            },
            ...patch,
        })
    }

    it("条件求值：溯级 / 技能等级来源与全部运算符；attr 来源暂不支持按未命中", () => {
        const context = { traceLevel: 3, skillLevel: [10, 12, 5] as [number, number, number] }
        const traceLevel = (op: ">=" | ">" | "<=" | "<" | "==" | "!=", value: number) =>
            evaluateTraceConditions([{ source: { kind: "traceLevel" }, op, value }], context)
        expect(traceLevel(">=", 3)).toBe(true)
        expect(traceLevel(">=", 4)).toBe(false)
        expect(traceLevel(">", 2)).toBe(true)
        expect(traceLevel(">", 3)).toBe(false)
        expect(traceLevel("<=", 3)).toBe(true)
        expect(traceLevel("<=", 2)).toBe(false)
        expect(traceLevel("<", 4)).toBe(true)
        expect(traceLevel("<", 3)).toBe(false)
        expect(traceLevel("==", 3)).toBe(true)
        expect(traceLevel("==", 2)).toBe(false)
        expect(traceLevel("!=", 2)).toBe(true)
        expect(traceLevel("!=", 3)).toBe(false)

        // 技能等级按槽位取有效等级；多条件需全部命中
        expect(
            evaluateTraceConditions(
                [
                    { source: { kind: "skillLevel", slot: 1 }, op: ">=", value: 12 },
                    { source: { kind: "traceLevel" }, op: ">=", value: 2 },
                ],
                context
            )
        ).toBe(true)
        expect(evaluateTraceConditions([{ source: { kind: "skillLevel", slot: 2 }, op: ">", value: 5 }], context)).toBe(false)
        // 空条件恒为 true；attr 来源暂不支持 → 未命中
        expect(evaluateTraceConditions([], context)).toBe(true)
        expect(evaluateTraceConditions([{ source: { kind: "attr", key: "增伤", side: "source" }, op: ">=", value: 0 }], context)).toBe(
            false
        )
    })

    it("菲娜 2 溯源规则：开启时把 菲娜被动(团队) 覆盖为 0.45、关闭 2 根源回落到 0.30", () => {
        const settings = feinaSettings({
            buffs: [
                ["菲娜Q", 10],
                [FEINA_PASSIVE_TEAM_BUFF, 1],
                ["菲娜被动(自身)", 1],
            ],
        })
        const open = createCharBuildFromSettings(FEINA_ID, settings)
        expect(open.buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!.values.增伤).toBeCloseTo(0.45, 10)
        // 覆盖只改字段：同名条目仍只有一条
        expect(open.buffs.filter(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)).toHaveLength(1)

        const closed = createCharBuildFromSettings(FEINA_ID, { ...settings, traceOffRoots: [2] })
        expect(closed.buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!.values.增伤).toBeCloseTo(0.3, 10)
        // 规则所属根源关闭：不产出覆盖
        expect(collectTraceEffects({ ...settings, traceOffRoots: [2] }, "main", { charId: FEINA_ID }).buffOverrides).toEqual([])
        // 团队 / 自身各一条规则：受益侧都持有目标 BUFF
        expect(collectTraceEffects(settings, "main", { charId: FEINA_ID }).buffOverrides).toHaveLength(2)
    })

    it("菲娜 2 溯源规则：菲娜被动(自身) 光追伤按 45 层，关闭 2 根源按 30 层", () => {
        const settings = feinaSettings({ buffs: [["菲娜被动(自身)", 1]] })
        const open = createCharBuildFromSettings(FEINA_ID, settings)
        const closed = createCharBuildFromSettings(FEINA_ID, { ...settings, traceOffRoots: [2] })
        const readValue = (build: ReturnType<typeof createCharBuildFromSettings>) => {
            const buff = build.buffs.find(item => item.名称 === "菲娜被动(自身)")!
            return build.prepareBuff(buff).values.光属性追伤
        }
        // 探针按同一构筑上下文求值（每层倍率受 4 溯技能威力影响，2 根源关闭时同步回落）
        const expectedValue = (build: ReturnType<typeof createCharBuildFromSettings>, layers: number) => {
            const probe = new LeveledBuff(
                {
                    名称: "探针",
                    attr: {
                        光属性追伤: `(坏巫师最怕阳光了::永续追加伤害倍率 + ${layers}*坏巫师最怕阳光了::[梦笔生花]每层追加伤害倍率)`,
                    },
                },
                1
            )
            return build.prepareBuff(probe).values.光属性追伤
        }
        expect(readValue(open)).toBeCloseTo(expectedValue(open, 45), 10)
        expect(readValue(closed)).toBeCloseTo(expectedValue(closed, 30), 10)
        // 45 层高于 30 层
        expect(readValue(open)).toBeGreaterThan(readValue(closed))
    })

    it("跨角色：协战菲娜满溯源时把主控 菲娜被动(团队) 覆盖为 0.45，穿透 0.24；未持有则不覆盖", () => {
        const settings = feinaTeam()
        const build = createCharBuildFromSettings(LISE_ID, settings)
        const team = build.buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!
        expect(team.values.增伤).toBeCloseTo(0.45, 10)
        expect(build.calculateAttributes().属性穿透).toBeCloseTo(0.24, 10)
        const overrides = collectTraceEffects(settings, "main", { charId: LISE_ID }).buffOverrides
        expect(overrides).toEqual([expect.objectContaining({ target: FEINA_PASSIVE_TEAM_BUFF, ownerSide: "assist1", grade: 2 })])

        // 主控未持有目标 BUFF：不产生覆盖（穿透仍由 1 溯源提供）
        const withoutTeam = feinaTeam({ buffs: [["菲娜Q", 10]] })
        expect(collectTraceEffects(withoutTeam, "main", { charId: LISE_ID }).buffOverrides).toEqual([])
        expect(createCharBuildFromSettings(LISE_ID, withoutTeam).calculateAttributes().属性穿透).toBeCloseTo(0.24, 10)
    })

    it("TS / wasm 一致：请求副本移除被覆盖的手动 BUFF，载荷携带同名覆盖后 BUFF", () => {
        const settings = feinaTeam()
        const payload = buildWasmTranscendPayload(LISE_ID, settings)!
        const carried = payload.main.buffs.find(buff => buff.data.名称 === FEINA_PASSIVE_TEAM_BUFF)!
        expect(carried.data.attr?.增伤).toBeCloseTo(0.45, 10)
        // 协战载荷不含主控持有的目标 BUFF
        expect(payload.assist1?.buffs.some(buff => buff.data.名称 === FEINA_PASSIVE_TEAM_BUFF)).toBe(false)

        const request = withWasmTranscendPayload(LISE_ID, settings)
        expect(request.buffs.map(([name]) => name)).not.toContain(FEINA_PASSIVE_TEAM_BUFF)
        expect(request.buffs.map(([name]) => name)).toContain("菲娜Q")
        // 原配置不被修改
        expect(settings.buffs.map(([name]) => name)).toContain(FEINA_PASSIVE_TEAM_BUFF)

        // TS 构筑同值
        const build = createCharBuildFromSettings(LISE_ID, settings)
        const tsValue = build.buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!.values.增伤
        expect(new LeveledBuff(carried.data, carried.level).values.增伤).toBeCloseTo(tsValue, 10)
    })

    it("协战菲娜关闭 2 根源：主控 菲娜被动(团队) 回落 0.30", () => {
        const base = feinaTeam()
        const teamValue = (settings: CharSettings) =>
            createCharBuildFromSettings(LISE_ID, settings).buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!.values.增伤
        expect(teamValue(base)).toBeCloseTo(0.45, 10)
        const closed = { ...base, assist1: { ...base.assist1!, traceOffRoots: [2] } }
        expect(teamValue(closed)).toBeCloseTo(0.3, 10)
    })

    it("wasm parity：菲娜被动(自身) 表达式覆盖按 45 层求值，团队覆盖保留覆盖率", () => {
        const settings = feinaSettings({
            buffs: [
                ["菲娜Q", 10],
                [FEINA_PASSIVE_TEAM_BUFF, 1, 0.5],
                [FEINA_PASSIVE_SELF_BUFF, 1],
            ],
        })
        const build = createCharBuildFromSettings(FEINA_ID, settings)
        const payload = buildWasmTranscendPayload(FEINA_ID, settings)!

        // 团队 BUFF：覆盖后字段 + 覆盖率 0.5 进入载荷，与 TS 同值
        const carriedTeam = payload.main.buffs.find(buff => buff.data.名称 === FEINA_PASSIVE_TEAM_BUFF)!
        expect(carriedTeam.data.attr?.增伤).toBeCloseTo(0.45, 10)
        expect(carriedTeam.coverage).toBe(0.5)
        const carriedTeamBuff = new LeveledBuff(carriedTeam.data, carriedTeam.level)
        carriedTeamBuff.coverage = carriedTeam.coverage ?? 1
        const tsTeam = build.buffs.find(buff => buff.名称 === FEINA_PASSIVE_TEAM_BUFF)!
        expect(carriedTeamBuff.values.增伤).toBeCloseTo(tsTeam.values.增伤, 10)

        // 自身 BUFF：表达式按 45 层覆盖，等级取 P 有效等级
        const carriedSelf = payload.main.buffs.find(buff => buff.data.名称 === FEINA_PASSIVE_SELF_BUFF)!
        expect(String(carriedSelf.data.attr?.光属性追伤)).toContain("45*")
        expect(carriedSelf.level).toBe(build.skillLevel[2])
        const tsSelf = build.buffs.find(buff => buff.名称 === FEINA_PASSIVE_SELF_BUFF)!
        expect(build.prepareBuff(new LeveledBuff(carriedSelf.data, carriedSelf.level)).values.光属性追伤).toBeCloseTo(
            build.prepareBuff(tsSelf).values.光属性追伤,
            10
        )

        // 请求副本移除两条被覆盖的手动条目
        expect(withWasmTranscendPayload(FEINA_ID, settings).buffs.map(([name]) => name)).toEqual(["菲娜Q"])
    })

    it("collect 级 skillLevel 条件：溯源 / 升华技能等级增量参与规则判定", () => {
        const rule = (value: number): TraceBuffRule => ({
            charId: FEINA_ID,
            grade: 2,
            target: "色散成霓",
            when: [{ source: { kind: "skillLevel", slot: 2 }, op: ">=", value }],
            attrs: { 增伤: 0.44 },
        })
        const settings = feinaSettings({
            buffs: [
                ["菲娜Q", 10],
                ["色散成霓", 10],
            ],
        })
        const overridesOf = (patch: Partial<CharSettings>, threshold: number, transcend?: CharSkillLevels) =>
            collectTraceEffects({ ...settings, ...patch }, "main", {
                charId: FEINA_ID,
                extraRules: [rule(threshold)],
                ...(transcend ? { transcendSkillLevelBonus: (side): CharSkillLevels => (side === "main" ? transcend : [0, 0, 0]) } : {}),
            }).buffOverrides

        // 满溯源：3/5 溯源给被动 +2 → P = 12
        expect(overridesOf({}, 12)[0]?.attrs.增伤).toBeCloseTo(0.44, 10)
        expect(overridesOf({}, 13)).toEqual([])
        // 关闭 3、5 根源：P = 10，阈值 11 未命中；注入升华 +1 后命中
        expect(overridesOf({ traceOffRoots: [3, 5] }, 11)).toEqual([])
        expect(overridesOf({ traceOffRoots: [3, 5] }, 11, [0, 0, 1])[0]?.attrs.增伤).toBeCloseTo(0.44, 10)
        // 升华 +1 也只能到 11：阈值 12 仍未命中
        expect(overridesOf({ traceOffRoots: [3, 5] }, 12, [0, 0, 1])).toEqual([])
    })

    it("applyTraceBuffOverrides：字段覆盖保留名称 / 等级 / 覆盖率 / 挂载点，未命中返回原实例", () => {
        const original = new LeveledBuff({ 名称: "同名特效", attr: { 增伤: 0.1 }, mx: 10 }, 3)
        original.pt = "Mod"
        original.pid = 42
        original.coverage = 0.5
        const [next] = applyTraceBuffOverrides([original], [{ target: "同名特效", attrs: { 增伤: 0.4 } }])
        expect(next).not.toBe(original)
        expect(next.名称).toBe("同名特效")
        expect(next.等级).toBe(3)
        expect(next.coverage).toBe(0.5)
        expect(next.pt).toBe("Mod")
        expect(next.pid).toBe(42)
        expect(next._originalBuffData.attr?.增伤).toBeCloseTo(0.4, 10)

        const untouched = new LeveledBuff({ 名称: "其他", attr: { 增伤: 0.2 } }, 1)
        expect(applyTraceBuffOverrides([untouched], [{ target: "同名特效", attrs: { 增伤: 0.4 } }])[0]).toBe(untouched)
        expect(applyTraceBuffOverrides([untouched], [])[0]).toBe(untouched)
    })

    it("派生 BUFF 命名与合并：每个来源侧 + 根源一条 `角色N溯`，技能等级按侧合成一条三键 BUFF", () => {
        const settings = feinaSettings({
            buffs: [
                ["菲娜Q", 10],
                ["菲娜被动(自身)", 1],
            ],
        })
        const effects = collectTraceEffects(settings, "main", { charId: FEINA_ID })
        expect(effects.buffs.map(buff => buff.名称).sort()).toEqual(["溯源技能等级", "菲娜1溯", "菲娜4溯", "菲娜6溯"])
        expect(effects.buffs.every(buff => buff.source?.kind === "trace")).toBe(true)
        expect(effects.buffs.map(buff => buff.source?.stackKey)).toEqual([
            "trace:main:1801:1",
            "trace:main:1801:4",
            "trace:main:1801:6",
            "trace:main:1801:skillLevel",
        ])
        // 纯层数 / 纯规则根源不生成空展示行；技能等级行带三键数值
        expect(effects.buffs.some(buff => Object.keys(buff.values).length === 0)).toBe(false)
        expect(effects.buffs.find(buff => buff.名称 === "溯源技能等级")!.values).toEqual({ E技能等级: 2, Q技能等级: 2, P技能等级: 2 })
        expect(effects.buffs.some(buff => buff.名称 === "梦笔生花层数上限 30→45")).toBe(false)
    })
})
