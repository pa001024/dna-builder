/**
 * dna-builder-skill-sim 公共 API。
 *
 * 推荐入口：
 * - `ingestSkillAsset` → `buildSkillBehaviorDoc` → `createManifest`（导出器 → manifest）；
 * - `checkManifest`（引用 / 门禁）、`verifyParity`（CharBuild parity）。
 */

export * from "./core/index.ts"
export * from "./pipeline"
export * from "./schema"
