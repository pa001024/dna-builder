#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const executablePath = resolve(__dirname, "dob-script.exe")

/**
 * 输出平台不支持提示。
 */
function printUnsupportedPlatformMessage() {
    console.error("dob-script 当前仅支持 Windows 平台。")
}

/**
 * 执行本地 Rust 可执行文件，并透传退出码。
 */
function runExecutable() {
    if (!existsSync(executablePath)) {
        console.error(`未找到可执行文件: ${executablePath}`)
        console.error("请重新安装，或联系发布者确认 npm 包中包含 dob-script.exe。")
        process.exit(1)
    }

    const result = spawnSync(executablePath, process.argv.slice(2), {
        stdio: "inherit",
        windowsHide: false,
    })

    if (result.error) {
        console.error(`启动 dob-script.exe 失败: ${result.error.message}`)
        process.exit(1)
    }

    process.exit(typeof result.status === "number" ? result.status : 1)
}

if (process.platform !== "win32") {
    printUnsupportedPlatformMessage()
    process.exit(1)
}

runExecutable()
