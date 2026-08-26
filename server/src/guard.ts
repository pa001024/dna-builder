import { realpathSync } from "node:fs"
import { resolve } from "node:path"

// 防呆: 必须在 server 目录下运行, 避免相对路径 (.env 加载、data.db 文件读取等) 错位
// 必须作为 index.ts 的第一个 import, 这样它先于所有有副作用的模块执行
// 用 realpath 做比较: 本机 D:\dev\dna-builder 是指向 E:\dev\dna-builder 的符号链接,
// 直接比较字符串会把"同一个目录的两种写法"误判为"不在 server 目录下"
const SERVER_DIR = realpathSync(resolve(import.meta.dir, ".."))
if (realpathSync(process.cwd()) !== SERVER_DIR) {
    console.error(`[dna-builder] 请在 server 目录下运行本服务(当前目录: ${process.cwd()})`)
    console.error(`[dna-builder] 正确用法: cd server && bun src/index.ts`)
    process.exit(1)
}
