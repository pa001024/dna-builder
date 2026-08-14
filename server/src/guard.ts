import { resolve } from "node:path"

// 防呆: 必须在 server 目录下运行, 避免相对路径 (.env 加载、data.db 文件读取等) 错位
// 必须作为 index.ts 的第一个 import, 这样它先于所有有副作用的模块执行
const SERVER_DIR = resolve(import.meta.dir, "..")
if (resolve(process.cwd()) !== SERVER_DIR) {
    console.error(`[dna-builder] 请在 server 目录下运行本服务(当前目录: ${process.cwd()})`)
    console.error(`[dna-builder] 正确用法: cd server && bun src/index.ts`)
    process.exit(1)
}
