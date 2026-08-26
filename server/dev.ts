import { realpathSync } from "node:fs"

// 防呆: dev 启动器必须在 server 目录下运行(与 src/guard.ts 同理, 用 realpath 比较以兼容盘符符号链接)
const SERVER_DIR = realpathSync(import.meta.dir)
if (realpathSync(process.cwd()) !== SERVER_DIR) {
    console.error(`[dna-builder] 请在 server 目录下运行本服务(当前目录: ${process.cwd()})`)
    console.error(`[dna-builder] 正确用法: cd server && bun run dev`)
    process.exit(1)
}

/**
 * 先执行数据库迁移, 失败则退出(保持与旧脚本 `bun mig && ...` 一致语义)
 */
const mig = Bun.spawn(["bun", "run", "mig"], { cwd: SERVER_DIR, stdout: "inherit", stderr: "inherit" })
await mig.exited
if (mig.exitCode !== 0) process.exit(mig.exitCode ?? 1)

/**
 * bun --watch 在进程启动时就把"项目目录"快照为启动时的 cwd:
 * 从符号链接路径(如 D:\dev\dna-builder\server)启动时, 模块的真实路径(E:\...)会被判定为
 * "不在项目目录内"而放弃监听(热更新失效)。
 * 这里以真实路径作为 cwd 重新派生子进程, 即可让 watch 对盘符符号链接路径同样生效。
 */
const server = Bun.spawn(["bun", "run", "--watch", "src/index.ts"], {
    cwd: SERVER_DIR,
    stdout: "inherit",
    stderr: "inherit",
})
await server.exited
process.exit(server.exitCode ?? 1)
