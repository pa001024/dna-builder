// pnpm 与 npm 不同：`pnpm run test -- <args>` 会把 `--` 原样传给命令，
// 而 vitest 的 CLI 解析器（cac）把 `--` 之后的参数收进 options["--"] 而非文件过滤器，
// 导致 `pnpm test -- <file>` 静默跑全量。这里剥掉 `--` 再以 `run` 子命令转发给 vitest。
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(join(process.cwd(), "package.json"))
const vitestCli = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs")
const args = process.argv.slice(2).filter(arg => arg !== "--")

const { error, status } = spawnSync(process.execPath, [vitestCli, "run", ...args], { stdio: "inherit" })
if (error) throw error
process.exit(status ?? 1)
