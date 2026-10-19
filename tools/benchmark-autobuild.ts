/**
 * TS autoBuild 基线（Agent E 所有，spec §12.1/§12.5/Q6）：真实候选集 + 起始构筑固定 + 解质量记录。
 *
 * 起始构筑：黎瑟·浴火（id 4103）★推荐构筑 PXQvFiw-m2（线上 fixture，
 * `sdk/python/tests/golden/online/PXQvFiw-m2.json`，TS 夹具 `packages/data/tests/fixtures/liseFireBuild.ts`）。
 * 本地复算 target 与作者标注一致：28053254998.1983（约 280.53 亿），作为解质量的固定锚点。
 *
 * 候选集：全量数据包（与配装页无背包口径同源：`inv.getModsWithCount(false)` 即全部 MOD ×8 件、满级），
 * 角色 343 + 近战 92 + 远程 75，三类槽位全搜（8+8+8）。武器固定（已是 BiS：
 * 近战无解谜题 / 远程活着的重量，满精炼），只度量 MOD 搜索。
 *
 * 不同律槽：该角色无同律武器（`char.同律武器` 为空 → `skillWeapon` 缺失，同律楔无载体），
 * 88 个同律候选实测可装 64 件但收益恒为 0。搜它只给 best 注水、不携带任何解质量信息，故不列入。
 * 旧基线 12 个候选 × 角色槽位的搜索量与真实场景差两个数量级，best 没有参考价值，故扩到此口径。
 *
 * 种子方案（Q6）：`Math.random` 不可播种（仅同收益并列时随机取一），基线脚本用「实现无关的输入指纹」代替——
 * 候选集固定 + 起始构筑固定 + 打分函数固定，记录解质量（目标函数值/槽位占用/耗时 best），
 * Rust 侧以「同等候选集 + 同等解质量」为 1000x 口径（spec §12.1），不对随机流。
 *
 * 解质量构成（bestTarget vs 推荐BD 锚点 28053M，供解读，不做断言；2026-10-19 实测）：
 * 全量搜索 33801M（+20.5%）；剔除不息 51316 + 警觉 42321 后 31654M（+12.9%）；
 * 再剔除倾力 32301 后 30279M（+8.0%）。三者都是条件缺失 effect 被模型按无条件计入：
 * 不息（文本限委托复苏，effect 纯 攻击+0.77）、警觉（文本限震荡触发，effect 纯 近战暴伤）、
 * 倾力（文本限连击等级，effect 纯 近战暴击；且本角色无连击机制，实战为 0 层），
 * `生效.条件` 均为 null，木桩口径下是免费午餐，合计约 12pp。剩余约 8pp 是真优化：
 * 叠影系多重 3.71 超封顶 3.33 后的冗余修剪（系数 2→1.9 换暴击 1.63→1.93 喂技术磨炼）、
 * 雷鸣·燎原、箭雨/厚重、裂变剑域等。兼容性不在此列：autoBuild 经
 * filterEquipableMods → isModEquipable → isModSlotCompatible 同一链路过滤，结果 24 槽逐件复核全过。
 * ⚠ 若日后给上述 effect 补齐条件，bestTarget 会回落，须重采本基线；
 * 连击等级等角色机制限定的 effect 目前无通用建模概念，补条件需先补机制，不在本基线范围内。
 *
 * 运行：bun tools/benchmark-autobuild.ts（约 1~2 分钟，单轮全量搜索约十几秒，best-of-5）
 */
import type { CharBuild, ModTypeKey } from "../packages/data/CharBuild"
import { modData } from "../packages/data/index"
import { LeveledModWithCount } from "../packages/data/leveled/LeveledMod"
import { createLiseFireBuild } from "../packages/data/tests/fixtures/liseFireBuild"

/** 有载体的三类槽位：角色 / 近战 / 远程（同律槽无载体，见文件头）。 */
type SearchSlot = "charMods" | "meleeMods" | "rangedMods"
const INCLUDE_TYPES: ModTypeKey[] = ["charMods", "meleeMods", "rangedMods"]

/**
 * 真实候选集：全量 MOD（配装页无背包口径：全部 ×8 件、满级、buffLv 缺省 0）。
 * @returns 按槽位类型分组的候选项
 */
function candidatePools(): Record<SearchSlot, LeveledModWithCount[]> {
    const prefix: Record<SearchSlot, string> = { charMods: "角色", meleeMods: "近战", rangedMods: "远程" }
    const pools: Record<SearchSlot, LeveledModWithCount[]> = { charMods: [], meleeMods: [], rangedMods: [] }
    for (const mod of modData) {
        if (typeof mod.类型 !== "string") continue
        const key = (Object.keys(prefix) as SearchSlot[]).find(k => mod.类型!.startsWith(prefix[k]))
        if (key) pools[key].push(new LeveledModWithCount(mod.id, 10, undefined, 8))
    }
    return pools
}

/** 推荐 BD 锚点：搜索前的 target（作者标注 28053254998.1983，本地复算一致）。 */
function anchorTarget(): number {
    return createLiseFireBuild().calculate()
}

/**
 * 全量搜索采样：每轮全新起始构筑 + 单次 autoBuild 到收敛，取耗时 best。
 * @param samples 采样轮数
 * @returns 耗时 best/median、解质量 best、各槽位占用
 */
function benchAutoBuild(samples = 5): {
    bestMs: number
    medianMs: number
    bestTarget: number
    medianTarget: number
    anchor: number
    slots: Record<SearchSlot, number>
} {
    const pools = candidatePools()
    const modOptions = [...pools.charMods, ...pools.meleeMods, ...pools.rangedMods]
    console.log(
        `候选池: 角色=${pools.charMods.length} 近战=${pools.meleeMods.length} ` +
            `远程=${pools.rangedMods.length} 合计=${modOptions.length}（无同律槽，见文件头）`
    )
    const times: number[] = []
    const targets: number[] = []
    let slots: Record<SearchSlot, number> = { charMods: 0, meleeMods: 0, rangedMods: 0 }
    for (let sample = 0; sample < samples; sample++) {
        const build: CharBuild = createLiseFireBuild()
        const start = performance.now()
        const result = build.autoBuild({
            includeTypes: INCLUDE_TYPES,
            modOptions,
            fixedMelee: true,
            fixedRanged: true,
            enableLog: false,
        })
        const elapsed = performance.now() - start
        times.push(elapsed)
        const target = result.newBuild.calculate()
        targets.push(target)
        slots = {
            charMods: result.newBuild.charMods.filter(mod => mod !== null).length,
            meleeMods: result.newBuild.meleeMods.filter(mod => mod !== null).length,
            rangedMods: result.newBuild.rangedMods.filter(mod => mod !== null).length,
        }
        console.log(
            `  sample ${sample + 1}: ${elapsed.toFixed(0)}ms iter=${result.iter} ` +
                `target=${target} slots=${slots.charMods}/${slots.meleeMods}/${slots.rangedMods}`
        )
    }
    const sortedTimes = [...times].sort((left, right) => left - right)
    const sortedTargets = [...targets].sort((left, right) => left - right)
    const median = (values: number[]): number => values[Math.floor(values.length / 2)]!
    return {
        bestMs: sortedTimes[0]!,
        medianMs: median(sortedTimes),
        bestTarget: sortedTargets[sortedTargets.length - 1]!,
        medianTarget: median(sortedTargets),
        anchor: anchorTarget(),
        slots,
    }
}

const { bestMs, medianMs, bestTarget, medianTarget, anchor, slots } = benchAutoBuild()
const gap = (((bestTarget - anchor) / anchor) * 100).toFixed(2)
console.log(
    `autobuild baseline: best=${bestMs.toFixed(0)}ms/round median=${medianMs.toFixed(0)}ms ` +
        `anchor=${anchor} bestTarget=${bestTarget} medianTarget=${medianTarget} (vs推荐BD ${gap}%) ` +
        `slots=${slots.charMods}/${slots.meleeMods}/${slots.rangedMods}`
)
