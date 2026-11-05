/**
 * 编译期清单来源（合并顺序 = 后者优先）。
 *
 * 1. `web-dev-fallback`：**临时**回退，仅供 U7 生成清单缺席时让黎瑟 E / 赛琪 E,Q 可玩；
 * 2. `u5-fixture:lise-q`：U5 的黎瑟 Q 行为 fixture；
 * 3. `generated:skill-sim`：U7 产出 `packages/skill-sim/generated/manifest.json`（存在时最后合并，
 *    覆盖回退里的同名技能）；
 * 4. `extra`：调用方注入（U8 集成 / 测试）。
 *
 * 生成清单用 `import.meta.glob` 条件读取：文件不存在时返回空对象；非 Vite 运行时（bun test）
 * 没有 glob，`try/catch` 落到回退清单。U8 合并 U7 分支后无需改这里。
 */

import liseQFixture from "../../../../../packages/skill-sim/fixtures/lise-q-behavior.json"
import devManifest from "../manifest/dev-manifest.json"
import { type CompiledManifest, compileManifest, type ManifestSource } from "./manifest-loader"

/** web 侧临时回退：U7 生成清单就位后只用于补缺，不要在这里新增行为 */
const FALLBACK_SOURCES: readonly ManifestSource[] = [
    { id: "web-dev-fallback", doc: devManifest },
    { id: "u5-fixture:lise-q", doc: liseQFixture },
]

const GENERATED_SOURCE_ID = "generated:skill-sim"

function discoverGeneratedManifest(): unknown | undefined {
    try {
        const modules = import.meta.glob("../../../../../packages/skill-sim/generated/manifest.json", {
            eager: true,
        }) as Record<string, { default?: unknown }>
        for (const module of Object.values(modules)) {
            if (module.default) return module.default
        }
    } catch {
        // 非 Vite 运行时（bun test / node）没有 import.meta.glob：只使用回退清单
    }
    return undefined
}

/** 供测试断言合并顺序；`generated` 缺省时自动探测 U7 产物 */
export function resolveManifestSources(generated: unknown = discoverGeneratedManifest()): ManifestSource[] {
    const sources: ManifestSource[] = [...FALLBACK_SOURCES]
    if (generated) sources.push({ id: GENERATED_SOURCE_ID, doc: generated })
    return sources
}

export function loadSkillManifest(extra: readonly ManifestSource[] = [], generated?: unknown): CompiledManifest {
    return compileManifest([...resolveManifestSources(generated === undefined ? discoverGeneratedManifest() : generated), ...extra])
}
