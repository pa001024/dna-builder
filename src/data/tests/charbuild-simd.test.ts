import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import { CharBuild } from "../CharBuild"
import { initializeCharBuildSimd, resetCharBuildSimdForTest, sumCharBuildBonusContributions } from "../charbuild-simd"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../leveled"

const wasmUrl = new URL("../../../public/wasm/charbuild_simd_wasm.wasm", import.meta.url).toString()
const globalState = globalThis as Record<string, unknown>
globalState.__CHARBUILD_SIMD_WASM_READER__ = async (url: string) => {
    try {
        const bytes = await readFile(fileURLToPath(url))
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    } catch {
        return null
    }
}

/** 创建覆盖 MOD、BUFF 与装备加成的可重复测试构筑。 */
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

describe("CharBuild Wasm SIMD", () => {
    let simdReady = false

    beforeAll(async () => {
        resetCharBuildSimdForTest()
        simdReady = Boolean(await initializeCharBuildSimd(wasmUrl))
    })

    it("应按列归约双精度贡献矩阵", () => {
        if (!simdReady) return
        const totals = sumCharBuildBonusContributions(new Float64Array([1.5, -1, 2, 3.5, 4, -2]), 2, 3)
        expect(totals).toEqual(new Float64Array([5, 3, 0]))
    })

    it("SIMD 公共加成结果应与标量计算完全一致", async () => {
        resetCharBuildSimdForTest()
        const scalar = createBuild().calculateAttributes(true)
        simdReady = Boolean(await initializeCharBuildSimd(wasmUrl))
        if (!simdReady) return

        expect(createBuild().calculateAttributes(true)).toEqual(scalar)
    })
})
