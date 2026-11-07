#!/usr/bin/env bun

/**
 * 云游戏原生客户端发布：编译 + UPX 压缩 + 直传 exe 到对象存储（OSS + R2 双写）。
 *
 *   bun tools/cloudgame-upload.ts build upload   # 完整链路：编译 → upx → 上传
 *   bun tools/cloudgame-upload.ts build          # 只编译 + UPX，不上传
 *   bun tools/cloudgame-upload.ts upload         # 只 UPX + 上传现有产物（不编译）
 *   bun tools/cloudgame-upload.ts -v 1.0.3       # 指定对象版本号（默认 1.0.2）
 *   bun tools/cloudgame-upload.ts --exe <path>   # 指定要压缩上传的 exe（默认 release 产物）
 *   bun tools/cloudgame-upload.ts --skip-upx     # 跳过 UPX，直接上传现有 exe
 *
 * 产物：`cloudgame/cloudgame-client-v<版本>.exe`（UPX 压缩后的单文件，前端下载后直接启动）。
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"
import { getActiveBackends, getPublicUrlOn, putFile } from "./object-storage"

/** 仓库根：本文件位于 `<root>/tools/` 下，与调用方 cwd 无关 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CLIENT_DIR = path.resolve(REPO_ROOT, "crates", "cloudgame-client")
const EXE_PATH = path.resolve(CLIENT_DIR, "target", "release", "cloudgame-client.exe")
const DEFAULT_VERSION = "1.0.3"
const OBJECT_PREFIX = "cloudgame"
const EXE_CONTENT_TYPE = "application/vnd.microsoft.portable-executable"

const args = process.argv.slice(2)
const shouldBuild = args.includes("build")
const shouldUpload = args.includes("upload")
const skipUpx = args.includes("--skip-upx")
/** 已知的 vcvars64.bat 位置（按需自适应初始化 MSVC 编译环境） */
const VCVARS_CANDIDATES = [
    process.env.VCVARS64_BAT ?? "",
    "C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat",
    "C:/Program Files/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat",
    "C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Auxiliary/Build/vcvars64.bat",
].filter(Boolean)

/**
 * 当前 shell 是否已初始化 MSVC 环境（vcvars）：cc-rs 编译 C 依赖需要它。
 * @returns INCLUDE 指向 Windows SDK/VC 头文件时为 true
 */
function isMsvcEnvActive(): boolean {
    return /Windows Kits/i.test(process.env.INCLUDE ?? "")
}

/**
 * cargo build --release；若当前 shell 缺 MSVC 环境则自动经 vcvars64 初始化后再编。
 */
async function cargoBuildRelease(): Promise<void> {
    const manifest = path.join(CLIENT_DIR, "Cargo.toml")
    if (process.platform === "win32" && !isMsvcEnvActive()) {
        const vcvars = VCVARS_CANDIDATES.find(candidate => fs.existsSync(candidate))
        if (!vcvars) {
            throw new Error("缺 MSVC 编译环境：请在 x64 Native Tools 命令提示符里运行，或设置 VCVARS64_BAT")
        }
        console.log(`🔧 初始化 MSVC 环境: ${vcvars}`)
        // Bun 的参数转义与 cmd 引号规则互斥（含空格路径必被误解析），故把命令
        // 落到临时 .bat 再执行：文件内部是纯 cmd 语法，无转义问题。
        const toWinPath = (p: string): string => p.replace(/\//g, "\\")
        const batPath = toWinPath(path.resolve(REPO_ROOT, ".tmp", "cloudgame-build.bat"))
        fs.mkdirSync(path.dirname(batPath), { recursive: true })
        fs.writeFileSync(
            batPath,
            `@echo off\r\ncall "${toWinPath(vcvars)}" >NUL\r\ncargo build --release --manifest-path "${toWinPath(manifest)}"\r\n`
        )
        try {
            await $`cmd /s /c ${batPath}`.cwd(CLIENT_DIR)
        } finally {
            fs.rmSync(batPath, { force: true })
        }
        return
    }
    console.log("🔨 cargo build --release")
    await $`cargo build --release --manifest-path ${manifest}`.cwd(CLIENT_DIR)
}
const versionIndex = args.findIndex(arg => arg === "-v" || arg === "--version")
const version = versionIndex >= 0 ? (args[versionIndex + 1] ?? "").trim() : DEFAULT_VERSION
const exeIndex = args.indexOf("--exe")
const customExePath = exeIndex >= 0 ? (args[exeIndex + 1] ?? "").trim() : ""
const exePath = customExePath ? path.resolve(REPO_ROOT, customExePath) : EXE_PATH

if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`版本号格式不对: ${version || "(空)"}（应形如 1.0.0）`)
    process.exit(1)
}

/** 带版本号的 exe 对象 key */
const objectKey = `${OBJECT_PREFIX}/cloudgame-client-v${version}.exe`

/**
 * 计算文件 SHA-256（流式，避免整文件读入内存）。
 * @param filePath 文件路径
 * @returns 小写十六进制摘要
 */
async function sha256File(filePath: string): Promise<string> {
    const hasher = new Bun.CryptoHasher("sha256")
    for await (const chunk of Bun.file(filePath).stream()) {
        hasher.update(chunk)
    }
    return hasher.digest("hex")
}

/**
 * 判断 exe 是否已是 UPX 压缩产物（UPX 存根含 `UPX!` 魔数），已压缩则跳过重复压缩。
 * @param filePath 待判断的 exe 路径
 */
async function isUpxPacked(filePath: string): Promise<boolean> {
    const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer())
    for (let i = 0; i + 4 <= bytes.length; i++) {
        if (bytes[i] === 0x55 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x58 && bytes[i + 3] === 0x21) return true
    }
    return false
}

/**
 * 用 UPX 就地压缩 exe（`--best --lzma`，效果：10MB → 3.6MB）；已压缩过则跳过。
 * @param filePath 待压缩的 exe 路径
 */
async function compressWithUpx(filePath: string): Promise<void> {
    try {
        await $`upx --version`.quiet()
    } catch {
        throw new Error("找不到 upx（scoop install upx），或改用 --skip-upx 跳过压缩")
    }
    const before = fs.statSync(filePath).size
    if (await isUpxPacked(filePath)) {
        console.log(`🗜️ 已是 UPX 产物，跳过压缩 (${(before / 1024 / 1024).toFixed(1)} MB)`)
        return
    }
    await $`upx --best --lzma ${filePath}`
    const after = fs.statSync(filePath).size
    console.log(`🗜️ UPX 压缩: ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB`)
}

/**
 * 对每个后端各下载一次产物并比对 SHA-256，确认公网可访问且内容就是本次上传的文件。
 * @param key 对象 key
 * @param expectedSha256 本地文件的 SHA-256
 */
async function verifyPublicUrls(key: string, expectedSha256: string): Promise<void> {
    const backends = getActiveBackends()
    await Promise.all(
        backends.map(async backend => {
            const url = getPublicUrlOn(backend, key)
            try {
                const response = await fetch(url)
                if (!response.ok) {
                    console.log(`⚠️ ${backend.label} ${url} (HTTP ${response.status})`)
                    return
                }
                const bytes = new Uint8Array(await response.arrayBuffer())
                const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
                const ok = hash === expectedSha256
                console.log(`${ok ? "✅" : "⚠️"} ${backend.label} ${url} (${bytes.byteLength} bytes, sha256 ${ok ? "一致" : hash})`)
            } catch (error) {
                console.log(`⚠️ ${backend.label} ${url} 探测失败: ${(error as Error).message}`)
            }
        })
    )
}

async function main(): Promise<void> {
    if (!shouldBuild && !shouldUpload) {
        throw new Error("请指定 build（编译+UPX）、upload（UPX+上传）或两者，如：bun tools/cloudgame-upload.ts build upload")
    }
    if (shouldBuild) {
        await cargoBuildRelease()
    }

    if (!fs.existsSync(exePath)) {
        throw new Error(`找不到 release 产物: ${exePath}（先运行 build 或用 --exe 指定）`)
    }

    if (!skipUpx) {
        await compressWithUpx(exePath)
    }

    if (!shouldUpload) {
        console.log(`✅ 构建完成（未上传）: ${path.relative(REPO_ROOT, exePath)}`)
        return
    }

    const exeSize = fs.statSync(exePath).size
    const sha256 = await sha256File(exePath)
    console.log(`📦 上传 ${path.relative(REPO_ROOT, exePath)} (${(exeSize / 1024 / 1024).toFixed(1)} MB, sha256 ${sha256})`)
    console.log(`📤 上传对象存储: ${objectKey}`)
    await putFile(objectKey, exePath, EXE_CONTENT_TYPE)
    console.log("✅ 上传完成")

    await verifyPublicUrls(objectKey, sha256)
}

main().catch(error => {
    console.error(`❌ 发布失败: ${(error as Error).message}`)
    process.exit(1)
})
