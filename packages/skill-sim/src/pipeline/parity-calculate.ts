/**
 * 默认 parity 计算：委托 packages/data 的 CharBuild（数值权威，不重写公式）。
 * 单独成文件，避免测试 / ingest / build 间接加载 100MB+ 数据集。
 */

import { type CharBuildSettingsInput, createCharBuildFromSettings } from "dna-builder-data/CharBuildHelper"
import type { ParityFixture } from "./verify"

export function defaultCalculate(fixture: ParityFixture): number {
    const build = createCharBuildFromSettings(fixture.charId, fixture.settings as CharBuildSettingsInput)
    return build.calculate()
}
