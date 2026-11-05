import { readFileSync } from "node:fs"

/**
 * 读取 U7 生成的 `packages/skill-sim/generated/manifest.json`。
 *
 * 不走 `import.meta.glob`：bun test 没有 Vite transform，显式读文件让两个 runner 看到同一份数据。
 */
export const generatedManifest: unknown = JSON.parse(
    readFileSync(new URL("../../../../../packages/skill-sim/generated/manifest.json", import.meta.url), "utf8")
)
