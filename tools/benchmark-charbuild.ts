// 真实构筑性能基准：以线上实配（莉兹贝尔 shardBuild1）度量 CharBuild 计算热路径。
// 用于验证计算重构（派生缓存 / 作用域属性表）的收益，也是重构前后的校验和比对基准。
//
// 关于 Wasm SIMD：`getCharacterBonusVector` 曾把「来源 × 属性」矩阵交给 Wasm 做列求和。
// 同一进程内交替采样 9 轮（用 best 而非 median 作统计量）实测 Wasm/纯 JS 比值 ≈ 1.000（0.93~1.03 噪声）：
// 矩阵构造（每来源逐属性取值并写入 f64）与跨 Wasm 内存搬运的成本远高于被向量化的加法本身。
// 该路径连同其 Wasm 模块、crate、基准工具已整体移除，因此本工具也不按「Wasm 就绪与否」分场景。
// 如日后复用此结论，务必沿用「同进程交替 + best 统计量」的测法，跨批次比较会被加载顺序污染 ±30%。
//
// 运行：bun tools/benchmark-charbuild.ts（或 pnpm bench:charbuild:real）
import type { CharBuild } from "../src/data/CharBuild"
import { LeveledWeapon } from "../src/data/leveled"
import { createShardBuild1 } from "../src/data/tests/fixtures/shardBuild1"

/**
 * 构造基准用的真实构筑实例（莉兹贝尔，同律武器「萨麦尔」）。
 * 直接复用测试夹具的装配链路，保证基准与线上路径、回归测试三者同源。
 * @returns 全新的 CharBuild 实例
 */
function createBuild(): CharBuild {
    return createShardBuild1()
}

/**
 * 取样本中位数，降低单次运行抖动对基准结论的影响。
 * @param values 耗时样本（毫秒）
 * @returns 中位数
 */
function median(values: number[]): number {
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.floor(sorted.length / 2)]
}

/**
 * 测量被测函数的吞吐量。
 * @param label 展示名
 * @param iterations 单轮迭代次数
 * @param fn 被测函数，返回一个参与校验和累加的数值
 * @param samples 取样轮数
 * @returns 单行基准结果
 */
function bench(label: string, iterations: number, fn: (build: CharBuild) => number, samples = 9) {
    const build = createBuild()
    for (let index = 0; index < 500; index++) fn(build)

    const times: number[] = []
    let checksum = 0
    for (let sample = 0; sample < samples; sample++) {
        const start = performance.now()
        checksum = 0
        for (let index = 0; index < iterations; index++) checksum += fn(build)
        times.push(performance.now() - start)
    }
    const sorted = [...times].sort((left, right) => left - right)
    return {
        label,
        // 最小值代表「最少外界干扰」的一轮：跨版本对比比中位数更稳定（后者受 GC / 调频影响可达 ±30%）
        best: Number(((sorted[0] * 1000) / iterations).toFixed(3)),
        median: Number(((median(times) * 1000) / iterations).toFixed(3)),
        iterations,
        checksum,
    }
}

/**
 * 测量「主计算拆到各阶段」的耗时，用于定位剩余热点。
 * @returns 各阶段单次耗时（微秒）
 */
function benchStages() {
    const build = createBuild()
    const stages: { label: string; iterations: number; run: () => void }[] = [
        { label: "calculateAttributes", iterations: 400, run: () => build.calculateAttributes() },
        { label: "calculateWeaponAttributes", iterations: 400, run: () => build.calculateWeaponAttributes() },
        { label: "calculateTargetFunction", iterations: 400, run: () => build.calculateTargetFunction(undefined, build.targetFunction) },
        { label: "createBuild", iterations: 400, run: () => createBuild() },
    ]
    return stages.map(({ label, iterations, run }) => {
        for (let index = 0; index < 200; index++) run()
        const times: number[] = []
        for (let sample = 0; sample < 7; sample++) {
            const start = performance.now()
            for (let index = 0; index < iterations; index++) run()
            times.push(performance.now() - start)
        }
        return { label, best: Number(((Math.min(...times) * 1000) / iterations).toFixed(3)) }
    })
}

const probe = createBuild()
console.log(
    `构筑: ${probe.char.名称} | 同律: ${probe.baseName} | 目标函数: ${probe.targetFunction}\n` +
        `charMods=${probe.charMods.length} meleeMods=${probe.meleeMods.length} rangedMods=${probe.rangedMods.length} ` +
        `skillMods=${probe.skillMods.length} buffs=${probe.buffs.length} dynamicBuffs=${probe.dynamicBuffs.length} ` +
        `customVars=${probe.customVariables.length}\n` +
        `calculate() = ${probe.calculate()}\n`
)

console.table([
    bench("calculate()", 200, build => build.calculate()),
    bench("calculateAttributes()", 500, build => build.calculateAttributes().攻击),
    bench("calculateWeaponAttributes()", 500, build => build.calculateWeaponAttributes().攻击),
    bench("calculateTargetFunction()", 500, build => build.calculateTargetFunction(undefined, build.targetFunction)),
    bench("getTotalBonus(攻击)", 20000, build => build.getTotalBonus("攻击")),
    bench("getTotalBonus(近战攻击)", 20000, build => build.getTotalBonus("近战攻击", "近战")),
    bench("clone()", 2000, build => build.clone().hpPercent),
    bench("calcIncome(mod)", 200, build => build.calcIncome(build.meleeMods[0]!)),
    bench("createBuild()", 500, () => createBuild().hpPercent),
    bench("new LeveledWeapon(10399)", 2000, () => new LeveledWeapon(10399).id),
])
console.table(benchStages())
