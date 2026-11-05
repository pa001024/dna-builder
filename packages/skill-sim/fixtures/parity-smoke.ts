/**
 * U3 parity smoke：直接复用 packages/data 的线上构筑夹具，期望值由同一 `calculate()` 现算。
 *
 * 目的只验证「fixture → 注入/默认 calculate → 漂移比较」这条链路（漂移必然为 0）；
 * U7 会把 `expectedDps` 换成冻结基线并覆盖 liseFireBuild / shardBuild1 / 线上 charSettings。
 */

import { createLiseFireBuild, liseFireBuildCharId, liseFireBuildSettings } from "../../data/tests/fixtures/liseFireBuild"
import type { ParityFixture } from "../src/pipeline/verify"

export const fixtures: ParityFixture[] = [
    {
        id: "liseFireBuild-smoke",
        charId: liseFireBuildCharId,
        settings: liseFireBuildSettings,
        expectedDps: createLiseFireBuild().calculate(),
        note: "U3 自比对 smoke；U7 替换为冻结基线",
    },
]
