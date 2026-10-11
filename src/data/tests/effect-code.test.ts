import { describe, expect, it } from "vitest"
import { CharBuild } from "../CharBuild"
import { weaponEffectMap } from "../d"
import type { Buff, Mod } from "../data-types"
import { LeveledBuff, LeveledChar, LeveledMod } from "../leveled"
import { LeveledBuffHelper, LeveledWeaponHelper } from "../leveled/LeveledHelpers"

/**
 * 构造携带特效 code 的测试构筑。
 * @param charMods 角色槽 MOD 列表
 * @param buffs 用户勾选 BUFF 列表
 * @param melee 近战武器（默认无特效，避免干扰）
 * @returns 构筑实例
 */
function createCodeEffectBuild(
    charMods: (LeveledMod | null)[] = [],
    buffs: LeveledBuff[] = [],
    melee = LeveledWeaponHelper.fromId(10601, 5, 80, 1)
) {
    return new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 1,
        resonanceGain: 0,
        charMods,
        buffs,
        melee,
        ranged: LeveledWeaponHelper.fromId(20601, 5, 80, 0),
        baseName: "普通攻击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        targetFunction: "伤害",
        extraMastery: "单手剑",
    })
}

/** 无数值、仅带 code 的合成特效：隔离“code 是否执行”，不受静态属性干扰 */
function fakeEffect(code: string): Buff {
    return { 名称: "码效测试特效", mx: 1, code } as Buff
}

function fakeMod(): Mod {
    return { id: 999001, 名称: "码效测试", 系列: "测试", 品质: "金", 耐受: 0, 类型: "角色" } as Mod
}

describe("特效 code（effect.data 的 code 字段）", () => {
    it("MOD 特效 code 随装备生效", () => {
        const on = createCodeEffectBuild([new LeveledMod(fakeMod(), 10, 1, fakeEffect("增伤+=0.5"))])
        const off = createCodeEffectBuild([new LeveledMod(fakeMod(), 10, 0, fakeEffect("增伤+=0.5"))])
        expect(on.calculateAttributes().增伤 - off.calculateAttributes().增伤).toBeCloseTo(0.5, 10)
    })

    it("特效等级为 0（关闭）时 code 不执行", () => {
        const base = createCodeEffectBuild()
        const off = createCodeEffectBuild([new LeveledMod(fakeMod(), 10, 0, fakeEffect("增伤+=0.5"))])
        expect(off.calculateAttributes().增伤).toBeCloseTo(base.calculateAttributes().增伤, 10)
    })

    it("特效 code 可在克隆体上单独关闭以归因来源（静态属性不受影响）", () => {
        const build = createCodeEffectBuild(
            [],
            [new LeveledBuff({ 名称: "测速", code: "技能速度+=3" } as Buff, 1)],
            LeveledWeaponHelper.fromId(10199, 0, 80, 6)
        )
        const full = build.calculateWeaponAttributes()
        const clone = build.clone()
        clone.meleeWeapon.buff!.code = ""
        const without = clone.calculateWeaponAttributes()
        // code 贡献可单独剥离：技能无视防御 +0.3 全部来自 code
        expect(full.技能无视防御 - without.技能无视防御).toBeCloseTo(0.3, 10)
        // 静态特效属性（技能速度）不受 code 开关影响
        expect(without.技能速度).toBeCloseTo(full.技能速度, 10)
        // 原构筑未被污染
        expect(build.meleeWeapon.buff?.code).toContain("技能无视防御")
    })

    it("武器特效 code 随装备生效，熔炼失效时关闭", () => {
        const effect = weaponEffectMap.get(10199)!
        expect(effect.code).toContain("技能伤害")
        const speedBuff = new LeveledBuff({ 名称: "测速", code: "技能速度+=3" } as Buff, 1)
        const build = createCodeEffectBuild([], [speedBuff], LeveledWeaponHelper.fromId(10199, 0, 80, 6))
        expect(build.meleeWeapon.forgeEffective).toBe(true)
        const withCode = build.calculateAttributes().技能伤害

        // 同一构筑关闭用户测速 BUFF：技能速度回落到阈值下，code 条件不再成立
        const control = createCodeEffectBuild([], [], LeveledWeaponHelper.fromId(10199, 0, 80, 6))
        expect(withCode - control.calculateAttributes().技能伤害).toBeCloseTo(0.9, 10)

        // 熔炼未生效（未精通）时 code 不执行
        const ineffective = createCodeEffectBuild(
            [],
            [new LeveledBuff({ 名称: "测速", code: "技能速度+=3" } as Buff, 1)],
            LeveledWeaponHelper.fromId(10199, 0, 80, 6)
        )
        ineffective.meleeWeapon.setForgeEffective(false)
        expect(ineffective.calculateAttributes().技能伤害).toBeCloseTo(control.calculateAttributes().技能伤害, 10)
    })
})

describe("全局 code 与技能限定 attr 共存", () => {
    /** 全局 code 与技能限定 attr 型 BUFF 共存时，基线计算重入本函数必须终止而非栈溢出 */
    function createScopedCodeBuild(buffs: LeveledBuff[]) {
        return new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            buffs,
            melee: LeveledWeaponHelper.fromId(10601, 5, 80, 1),
            ranged: LeveledWeaponHelper.fromId(20601, 5, 80, 0),
            baseName: "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "伤害",
        })
    }

    it("共存时结算终止且结果有限", () => {
        const build = createScopedCodeBuild([LeveledBuffHelper.fromName("黎瑟·浴火2溯", 1)!, LeveledBuffHelper.fromName("无解谜题5熔", 1)!])
        const attrs = build.calculateAttributes()
        expect(Number.isFinite(attrs.技能伤害)).toBe(true)
        expect(Number.isFinite(build.calculate())).toBe(true)
    })

    it("条件满足时全局 code 进入技能独立增伤且武器池不吃", () => {
        // 动态 code 单遍按序执行：先跑提供技能速度的BUFF，2溯才能看到阈值以上的速度
        const control = createScopedCodeBuild([new LeveledBuff({ 名称: "测速", code: "技能速度+=3" } as Buff, 1)])
        const build = createScopedCodeBuild([
            new LeveledBuff({ 名称: "测速", code: "技能速度+=3" } as Buff, 1),
            LeveledBuffHelper.fromName("黎瑟·浴火2溯", 1)!,
        ])
        // 技能速度 0+3=3>2，X=3×0.15=0.45
        expect(build.calculateAttributes().技能独立增伤).toBeCloseTo(0.45, 10)
        // 技能伤害吃到技能独立增伤
        const ratio = build.calculateTargetFunction(undefined, "E::伤害") / control.calculateTargetFunction(undefined, "E::伤害")
        expect(ratio).toBeCloseTo(1.45, 6)
        // 武器伤害吃不到技能独立增伤
        const wratio =
            build.calculateTargetFunction(undefined, "普通攻击::一段伤害") /
            control.calculateTargetFunction(undefined, "普通攻击::一段伤害")
        expect(wratio).toBeCloseTo(1, 6)
    })
})

describe("[求索]伤害的技能触发折算", () => {
    /**
     * 触发按 bonus 模型结算：未触发部分按 1 倍，触发部分按 (1 + bonus)，期望 = base × (1 + bonus × 覆盖率)，
     * 覆盖率 = min(1, 技能触发 + 武器面板触发)。求索为灾厄伤害且抗性存在时 bonus = 1 + 触发倍率，
     * 以下构筑均无触发倍率来源故 bonus = 1（触发 2 倍、不触发 1 倍）。
    /**
     * 求索伤害触发概率 = 武器面板触发 + 技能触发后封顶（技能触发是固定加值）。
     * 充盈·巧力（41317，紫）的技能触发随 MOD 等级变化，其他词条不影响求索结算，可做对照。
     */
    function qiusuoBuild(charMods: (LeveledMod | null)[] = [], buffs: LeveledBuff[] = [], meleeMods: (LeveledMod | null)[] = []) {
        const build = new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            charMods,
            buffs,
            meleeMods,
            melee: LeveledWeaponHelper.fromId(10199, 0, 80, 6),
            ranged: LeveledWeaponHelper.fromId(20601, 5, 80, 0),
            baseName: "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0.5,
            targetFunction: "求索::[求索]伤害",
            extraMastery: "单手剑",
        })
        // 护盾溢出分支非线性会扭曲比例，置零护盾保证线性可比
        build.enemy.currentShield = 0
        return build
    }

    it("求索伤害触发概率 = 武器面板触发 + 技能触发后封顶", () => {
        const hi = qiusuoBuild([new LeveledMod(41317, 5)])
        const lo = qiusuoBuild([new LeveledMod(41317, 0)])
        const stHi = hi.calculateAttributes().技能触发
        const stLo = lo.calculateAttributes().技能触发
        const wtHi = hi.calculateWeaponAttributes().weapon!.触发
        const wtLo = lo.calculateWeaponAttributes().weapon!.触发
        const cover = (st: number, wt: number) => Math.min(1, Math.max(0, st + wt))
        // bonus 模型：期望比 = (1 + coverHi) / (1 + coverLo)（bonus = 1）
        expect(hi.calculateOneTime() / lo.calculateOneTime()).toBeCloseTo((1 + cover(stHi, wtHi)) / (1 + cover(stLo, wtLo)), 5)
    })

    it("无技能触发来源时按武器面板触发结算（非零）", () => {
        const build = qiusuoBuild()
        expect(build.calculateAttributes().技能触发).toBe(0)
        const capped = qiusuoBuild([], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        const wt = build.calculateWeaponAttributes().weapon!.触发
        // bonus 模型：无技能触发时按 (1 + 武器面板触发) 结算，封顶对照为全额 2 倍
        expect(build.calculateOneTime() / capped.calculateOneTime()).toBeCloseTo((1 + Math.min(1, Math.max(0, wt))) / 2, 5)
    })

    it("技能触发封顶 100%：浴火E下为全额伤害", () => {
        const full = qiusuoBuild([], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        const hi = qiusuoBuild([new LeveledMod(41317, 5)])
        const stHi = hi.calculateAttributes().技能触发
        const wt = hi.calculateWeaponAttributes().weapon!.触发
        expect(full.calculateOneTime() / hi.calculateOneTime()).toBeCloseTo(2 / (1 + Math.min(1, stHi + wt)), 4)
    })

    it("浴火E收益有限：移除后回落到武器面板触发", () => {
        const build = qiusuoBuild([], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        const buff = build.buffs.find(b => b.名称 === "黎瑟·浴火E")!
        const wt = Math.min(1, build.calculateWeaponAttributes().weapon!.触发)
        // bonus 模型下浴火E收益 = (1 + b) / (1 + b × wt) - 1，b = 1 时恒 ≤ 100%
        expect(build.calcIncome(buff, true)).toBeCloseTo(2 / (1 + wt) - 1, 4)
    })

    it("零基线收益保护：总伤害为 0 时收益为 0 而非 NaN/无限", () => {
        const build = qiusuoBuild([], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        const buff = build.buffs.find(b => b.名称 === "黎瑟·浴火E")!
        build.calculate = () => 0
        expect(build.calcIncome(buff, true)).toBe(0)
        expect(build.calcIncome(buff, false)).toBe(0)
    })

    it("封顶后武器触发不再影响求索伤害：连环·缠缚收益为 0", () => {
        // 浴火E 已把触发概率封顶（1+面板恒为 1），武器触发部分被封顶溢出
        const base = qiusuoBuild([new LeveledMod(41317, 5)], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!], []).calculateOneTime()
        const withLianhuan = qiusuoBuild(
            [new LeveledMod(41317, 5)],
            [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!],
            [new LeveledMod(52203, 10)]
        ).calculateOneTime()
        expect(withLianhuan / base - 1).toBeCloseTo(0, 10)
    })

    it("未封顶时武器触发提高求索伤害（加法模型）", () => {
        const lo = qiusuoBuild()
        const hi = qiusuoBuild([], [], [new LeveledMod(52203, 10)])
        const wtLo = lo.calculateWeaponAttributes().weapon!.触发
        const wtHi = hi.calculateWeaponAttributes().weapon!.触发
        expect(hi.calculateOneTime() / lo.calculateOneTime()).toBeCloseTo((1 + Math.min(1, wtHi)) / (1 + Math.min(1, wtLo)), 4)
    })

    it("求索伤害吃技能伤害/技能无视防御/双爆，不吃武器伤害/武器追伤", () => {
        const mk = (加成: Record<string, number>, 类型 = "角色") =>
            new LeveledMod({ id: 999002, 名称: "测", 系列: "测试", 品质: "金", 耐受: 0, 类型, 加成 } as unknown as Mod, 10)
        // 浴火E 把技能触发封顶，隔离覆盖因子，只看乘区归属
        const base = qiusuoBuild([new LeveledMod(41317, 5)], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!]).calculateOneTime()
        const ratio = (mod: LeveledMod, slot: "char" | "melee" = "char") => {
            const charMods = slot === "char" ? [new LeveledMod(41317, 5), mod] : [new LeveledMod(41317, 5)]
            const meleeMods = slot === "melee" ? [mod] : []
            return qiusuoBuild(charMods, [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!], meleeMods).calculateOneTime() / base
        }
        expect(ratio(mk({ 技能伤害: 1 }))).toBeCloseTo(2, 5)
        expect(ratio(mk({ 技能无视防御: 0.3 }))).toBeGreaterThan(1)
        expect(ratio(mk({ 暴伤: 1 }))).toBeGreaterThan(1)
        expect(ratio(mk({ 武器伤害: 1 }))).toBeCloseTo(1, 10)
        expect(ratio(mk({ 追加伤害: 1 }, "melee"))).toBeCloseTo(1, 10)
    })
})
