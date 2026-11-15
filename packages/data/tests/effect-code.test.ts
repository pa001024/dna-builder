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
        // 技能速度 1+3=4>2，X=4×0.15=0.6
        expect(build.calculateAttributes().技能独立增伤).toBeCloseTo(0.6, 10)
        // 技能伤害吃到技能独立增伤
        const ratio = build.calculateTargetFunction(undefined, "E::伤害") / control.calculateTargetFunction(undefined, "E::伤害")
        expect(ratio).toBeCloseTo(1.6, 6)
        // 武器伤害吃不到技能独立增伤
        const wratio =
            build.calculateTargetFunction(undefined, "普通攻击::一段伤害") /
            control.calculateTargetFunction(undefined, "普通攻击::一段伤害")
        expect(wratio).toBeCloseTo(1, 6)
    })
})

describe("[求索]伤害按角色面板结算（基础: 角色）", () => {
    /**
     * 求索字段标注 `基础: "角色"`（对应上游 BaseAttr ATK_Char）：按无武器归属的技能伤害链路结算。
     * 基数 = 35 × 角色攻击（不含近战武器攻击）；增伤池吃技能伤害、追伤吃技能追伤；
     * 没有暴击/触发档位（近战双爆、武器面板触发、技能触发均不影响）；防御按技能口径（吃技能无视防御）。
     * 充盈·巧力（41317，紫）的技能触发随 MOD 等级变化，其他词条（充盈威力）不影响求索结算，可做对照。
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

    it("无武器归属的转灾厄依然结算灾厄触发（按技能触发率）", () => {
        const lo = qiusuoBuild()
        const hi = qiusuoBuild([new LeveledMod(41317, 5)])
        const stHi = hi.calculateAttributes().技能触发
        // 角色口径无武器面板：转震荡/转切割类不结算触发，转灾厄按技能触发率结算灾厄触发
        expect(hi.evaluateAST("角色::[攻击]{转灾厄:1}") / lo.evaluateAST("角色::[攻击]{转灾厄:1}")).toBeCloseTo(1 + Math.min(1, stHi), 5)
    })

    it("武器面板触发与技能触发均不影响求索伤害", () => {
        const base = qiusuoBuild().calculateOneTime()
        // 技能触发（充盈·巧力 0→5 级）无收益：直接灾厄伤害按技能链路没有触发档位
        expect(qiusuoBuild([new LeveledMod(41317, 5)]).calculateOneTime() / base).toBeCloseTo(1, 10)
        // 技能触发封顶（浴火E）无收益
        const capped = qiusuoBuild([], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        expect(capped.calculateOneTime() / base).toBeCloseTo(1, 10)
        // 近战触发（连环·缠缚）无收益
        const withLianhuan = qiusuoBuild([], [], [new LeveledMod(52203, 10)])
        expect(withLianhuan.calculateOneTime() / base).toBeCloseTo(1, 10)
    })

    it("零基线收益保护：总伤害为 0 时收益为 0 而非 NaN/无限", () => {
        const build = qiusuoBuild([], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        const buff = build.buffs.find(b => b.名称 === "黎瑟·浴火E")!
        build.calculate = () => 0
        expect(build.calcIncome(buff, true)).toBe(0)
        expect(build.calcIncome(buff, false)).toBe(0)
    })

    it("封顶/未封顶武器触发均不影响求索伤害：连环·缠缚收益为 0", () => {
        // 技能链路无触发档位：无论是否封顶，武器触发部分都不参与结算
        const base = qiusuoBuild([new LeveledMod(41317, 5)], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!], []).calculateOneTime()
        const withLianhuan = qiusuoBuild(
            [new LeveledMod(41317, 5)],
            [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!],
            [new LeveledMod(52203, 10)]
        ).calculateOneTime()
        expect(withLianhuan / base - 1).toBeCloseTo(0, 10)
    })

    it("求索基数只吃角色攻击：近战面板攻击/双爆加成均无收益", () => {
        const mk = (加成: Record<string, number>, 类型 = "角色") =>
            new LeveledMod({ id: 999002, 名称: "测", 系列: "测试", 品质: "金", 耐受: 0, 类型, 加成 } as unknown as Mod, 10)
        const base = qiusuoBuild().calculateOneTime()
        const ratio = (mod: LeveledMod, slot: "char" | "melee" = "char") => {
            const charMods = slot === "char" ? [mod] : []
            const meleeMods = slot === "melee" ? [mod] : []
            return qiusuoBuild(charMods, [], meleeMods).calculateOneTime() / base
        }
        // 角色攻击变化 → 求索伤害严格同比例变化（基数 = 35 × 角色攻击）
        const b0 = qiusuoBuild()
        const b1 = qiusuoBuild([mk({ 攻击: 1 })])
        expect(b1.calculateOneTime() / b0.calculateOneTime()).toBeCloseTo(b1.calculateAttributes().攻击 / b0.calculateAttributes().攻击, 4)
        // 近战武器面板整体不参与结算
        expect(ratio(mk({ 攻击: 1 }, "近战"), "melee")).toBeCloseTo(1, 10)
        expect(ratio(mk({ 暴击: 1 }, "近战"), "melee")).toBeCloseTo(1, 10)
        expect(ratio(mk({ 暴伤: 1 }, "近战"), "melee")).toBeCloseTo(1, 10)
        expect(ratio(mk({ 触发: 1 }, "近战"), "melee")).toBeCloseTo(1, 10)
    })

    it("角色没有暴击属性：求索伤害取暴击档位等于期望伤害", () => {
        const build = qiusuoBuild()
        // 无武器归属时暴击倍率为 1，.暴击 成员与裸伤害完全一致
        expect(build.evaluateAST("求索::[求索]伤害.暴击")).toBeCloseTo(build.calculateOneTime(), 10)
        expect(build.evaluateAST("求索::[求索]伤害.未暴击")).toBeCloseTo(build.calculateOneTime(), 10)
    })

    it("求索伤害吃技能伤害/技能追伤/技能独立增伤/技能无视防御，不吃武器伤害/武器追伤/双爆", () => {
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
        // 追伤/独立增伤按各自乘区成正比（基线自带武器 10199 的 0.5 技能追伤，不假设翻倍）
        const chaseBase = qiusuoBuild([new LeveledMod(41317, 5)], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        const chaseAttrs = chaseBase.calculateAttributes()
        const chaseHi = qiusuoBuild([new LeveledMod(41317, 5), mk({ 技能追伤: 1 })], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        expect(chaseHi.calculateOneTime() / chaseBase.calculateOneTime()).toBeCloseTo(
            (1 + chaseHi.calculateAttributes().技能追伤) / (1 + chaseAttrs.技能追伤),
            8
        )
        const indepBase = chaseBase
        const indepAttrs = chaseAttrs
        const indepHi = qiusuoBuild([new LeveledMod(41317, 5), mk({ 技能独立增伤: 1 })], [LeveledBuffHelper.fromName("黎瑟·浴火E", 1)!])
        const indepHiAttrs = indepHi.calculateAttributes()
        expect(indepHi.calculateOneTime() / indepBase.calculateOneTime()).toBeCloseTo(
            ((1 + indepHiAttrs.独立增伤) * (1 + indepHiAttrs.技能独立增伤)) / ((1 + indepAttrs.独立增伤) * (1 + indepAttrs.技能独立增伤)),
            8
        )
        expect(ratio(mk({ 技能无视防御: 0.3 }))).toBeGreaterThan(1)
        // 技能链路没有暴击档位：角色/近战双爆加成均无收益
        expect(ratio(mk({ 暴击: 1 }))).toBeCloseTo(1, 10)
        expect(ratio(mk({ 暴伤: 1 }))).toBeCloseTo(1, 10)
        expect(ratio(mk({ 暴伤: 1 }, "近战"), "melee")).toBeCloseTo(1, 10)
        expect(ratio(mk({ 武器伤害: 1 }))).toBeCloseTo(1, 10)
        expect(ratio(mk({ 追加伤害: 1 }, "melee"))).toBeCloseTo(1, 10)
    })
})
