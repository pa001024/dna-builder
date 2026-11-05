/**
 * 编译期清单来源。
 *
 * 现阶段（U6）：web 侧开发回退（黎瑟 E / 赛琪 E,Q）+ U5 的黎瑟 Q fixture。
 * U7 产出 `packages/skill-sim/generated/manifest.json` 后，把它的静态 import 追加到
 * `DEV_SOURCES` 末尾即可覆盖同名技能（合并顺序 = 后者优先），无需改 loader / 运行时。
 */

import liseQFixture from "../../../../../packages/skill-sim/fixtures/lise-q-behavior.json"
import devManifest from "../manifest/dev-manifest.json"
import { type CompiledManifest, compileManifest, type ManifestSource } from "./manifest-loader"

const DEV_SOURCES: readonly ManifestSource[] = [
    { id: "web-dev-fallback", doc: devManifest },
    { id: "u5-fixture:lise-q", doc: liseQFixture },
]

/** `extra` 供 U8 注入生成清单 / 用户自定义覆盖（排在最后，优先级最高） */
export function loadSkillManifest(extra: readonly ManifestSource[] = []): CompiledManifest {
    return compileManifest([...DEV_SOURCES, ...extra])
}
