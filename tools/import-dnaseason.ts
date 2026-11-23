#!/usr/bin/env bun
/**
 * 用法：
 *   bun tools/import-dnaseason.ts               # 只重导 4 个升华数据文件
 *   bun tools/import-dnaseason.ts --upstream …  # 透传给 importdata（含 -v）
 *
 * 真正落盘仍走 `import-i18n-data.ts` 的函数源（AST 定位 + 语义 diff + Biome 格式化），
 * 这里只负责把 `-f` 固定到这 4 个 stem，避免绕过既有写入管线。
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { DNASEASON_TARGET_STEMS } from "./dnaseason"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const importDataPath = path.join(REPO_ROOT, "tools", "import-i18n-data.ts")
const passthrough = Bun.argv.slice(2)

const proc = Bun.spawn([process.execPath, "run", importDataPath, "-f", ...DNASEASON_TARGET_STEMS, ...passthrough], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
})
process.exit(await proc.exited)
