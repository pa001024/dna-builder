import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { CharBuild } from "../src/data/CharBuild"
import { initializeCharBuildSimd, resetCharBuildSimdForTest } from "../src/data/charbuild-simd"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../src/data/leveled"

/** 创建与 CharBuild 单元测试相同规模的可重复基准构筑。 */
function createBuild(): CharBuild {
    return new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 0.5,
        resonanceGain: 2,
        charMods: [new LeveledMod(41324), new LeveledMod(51313), new LeveledMod(41001), new LeveledMod(42002)],
        buffs: [new LeveledBuff("黎瑟E")],
        melee: new LeveledWeapon(10302),
        ranged: new LeveledWeapon(20601),
        baseName: "快速出击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0.5,
        targetFunction: "伤害",
    })
}

/** 返回样本排序后的中位数，降低单次运行抖动对基准结论的影响。 */
function median(samples: number[]): number {
    const sorted = [...samples].sort((left, right) => left - right)
    return sorted[Math.floor(sorted.length / 2)]
}

/** 测量指定 CharBuild 计算的吞吐量，并返回五个热样本的中位数。 */
function benchmark(label: string, iterations: number, calculate: (build: CharBuild) => number) {
    const samples: { milliseconds: number; checksum: number }[] = []
    for (let sample = 0; sample < 5; sample++) {
        const build = createBuild()
        for (let index = 0; index < 2000; index++) calculate(build)

        const start = performance.now()
        let checksum = 0
        for (let index = 0; index < iterations; index++) {
            checksum += calculate(build)
        }
        samples.push({ milliseconds: performance.now() - start, checksum })
    }

    const milliseconds = median(samples.map(sample => sample.milliseconds))
    return {
        label,
        samples: samples.length,
        iterations,
        milliseconds,
        opsPerSecond: (iterations * 1000) / milliseconds,
        checksum: samples[0].checksum,
    }
}

const wasmUrl = new URL("../public/wasm/charbuild_simd_wasm.wasm", import.meta.url).toString()
;(globalThis as Record<string, unknown>).__CHARBUILD_SIMD_WASM_READER__ = async (url: string) => {
    const bytes = await readFile(fileURLToPath(url))
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

resetCharBuildSimdForTest()
const scalarAttributes = benchmark("scalar calculateAttributes(true)", 50000, build => build.calculateAttributes(true).攻击)
const scalarTotal = benchmark("scalar calculate()", 10000, build => build.calculate())
await initializeCharBuildSimd(wasmUrl)
const simdAttributes = benchmark("wasm-simd calculateAttributes(true)", 50000, build => build.calculateAttributes(true).攻击)
const simdTotal = benchmark("wasm-simd calculate()", 10000, build => build.calculate())

console.table([scalarAttributes, simdAttributes, scalarTotal, simdTotal])
console.log(`calculateAttributes(true) speedup: ${(simdAttributes.opsPerSecond / scalarAttributes.opsPerSecond).toFixed(2)}x`)
console.log(`calculate() speedup: ${(simdTotal.opsPerSecond / scalarTotal.opsPerSecond).toFixed(2)}x`)
