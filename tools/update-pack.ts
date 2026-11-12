#!/usr/bin/env bun

/**
 * 生成桌面端 exe 差量更新包与 feed。
 *
 *   bun tools/update-pack.ts <exe> <outDir> <version> [notes] [baseUrl]
 *   bun tools/update-pack.ts - <outDir> <version> --full-install <installerUrl>
 *   bun tools/update-pack.ts <exe> <outDir> <version> --delta-base 1.6.0 --installer <installerUrl>
 *
 * 产物：`<outDir>/dna-builder-x64.exe.zip` 与 `<outDir>/latest.json`。
 * feed 使用 tauri latest.json 的外层结构，exe 包放在 `windows-x86_64-exe` 键下，
 * 旧客户端仍然只认 `windows-x86_64` 的 MSI，互不影响。
 * 带 `--full-install` 时跳过压缩，只写一个指向完整安装包的 feed（DLL / resources 有变化的版本）。
 * 带 `--delta-base` 时 feed 标出差量基线，低于该版本的客户端会改走 `--installer` 提供的完整安装包。
 *
 * 本地联调：
 *   bun tools/update-pack.ts apps/web/src-tauri/target/release/dna-builder.exe \
 *       .tmp/update-server 1.5.3 "test" http://127.0.0.1:8791
 *   bun tools/update-server.ts .tmp/update-server 8791
 */

import fs from "node:fs"
import path from "node:path"
import { zipSync } from "fflate"

/** 更新包内 exe 的文件名（解压时优先匹配它） */
const EXE_ENTRY_NAME = "dna-builder.exe"
/** release / CDN 上统一的资产名 */
export const EXE_ZIP_NAME = "dna-builder-x64.exe.zip"
/** exe 在 feed 里的 platform key */
const EXE_PLATFORM_KEY = "windows-x86_64-exe"

export interface ExeAssetInfo {
    size: number
    sha256: string
}

/**
 * 计算文件 SHA-256（流式，避免整文件读入内存）。
 * @param filePath 文件路径
 * @returns 小写十六进制摘要
 */
export async function sha256File(filePath: string): Promise<string> {
    const hasher = new Bun.CryptoHasher("sha256")
    const stream = Bun.file(filePath).stream()
    for await (const chunk of stream) {
        hasher.update(chunk)
    }
    return hasher.digest("hex")
}

/**
 * 把 exe 压成单文件 zip（包内只有 dna-builder.exe）。
 * @param exePath 源 exe
 * @param zipPath 目标 zip
 * @returns 压缩包大小与 SHA-256
 */
export async function packExeZip(exePath: string, zipPath: string): Promise<ExeAssetInfo> {
    const bytes = new Uint8Array(await Bun.file(exePath).arrayBuffer())
    const zipped = zipSync({ [EXE_ENTRY_NAME]: bytes }, { level: 6 })
    fs.mkdirSync(path.dirname(zipPath), { recursive: true })
    fs.writeFileSync(zipPath, zipped)
    return {
        size: zipped.byteLength,
        sha256: await sha256File(zipPath),
    }
}

/** updater feed 的可选发布信息 */
interface FeedOptions {
    /** 设置后生成「必须完整安装」的 feed，忽略 exe 包 */
    fullInstallerUrl?: string
    /** 差量包可安全套用的最低已安装版本（不带 v） */
    deltaBase?: string
    /** exe 差量 feed 附带的完整安装包地址（低于 deltaBase 的客户端回退用） */
    installerUrl?: string
}

/**
 * 生成 updater feed。
 * @param version 版本号（不带 v）
 * @param notes 更新说明
 * @param asset exe 包信息；full install feed 传 null
 * @param baseUrl exe 包的公开基址
 * @param options 完整安装 / 差量基线 / 回退安装包信息
 */
function buildUpdateFeed(version: string, notes: string, asset: ExeAssetInfo | null, baseUrl: string, options: FeedOptions = {}): object {
    if (options.fullInstallerUrl) {
        return {
            version,
            notes,
            pub_date: new Date().toISOString(),
            requires_full_install: true,
            installer_url: options.fullInstallerUrl,
        }
    }
    if (!asset) {
        throw new Error("exe 包信息缺失")
    }
    return {
        version,
        notes,
        pub_date: new Date().toISOString(),
        platforms: {
            [EXE_PLATFORM_KEY]: {
                url: `${baseUrl.replace(/\/+$/, "")}/${EXE_ZIP_NAME}`,
                size: asset.size,
                sha256: asset.sha256,
            },
        },
        ...(options.installerUrl ? { installer_url: options.installerUrl } : {}),
        ...(options.deltaBase ? { delta_base: options.deltaBase } : {}),
    }
}

/**
 * 取出 `--name <value>` 形式的参数。
 * @param args 命令行参数（会被原地删除命中项）
 * @param name 参数名
 * @returns 参数值；未提供时 undefined
 */
function takeOption(args: string[], name: string): string | undefined {
    const index = args.indexOf(name)

    if (index < 0) {
        return undefined
    }

    const value = args[index + 1]

    if (!value || value.startsWith("--")) {
        console.error(`${name} 需要参数值`)
        process.exit(1)
    }

    args.splice(index, 2)
    return value
}

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    const fullInstallerUrl = takeOption(args, "--full-install")
    const installerUrl = takeOption(args, "--installer")
    const deltaBase = takeOption(args, "--delta-base")?.replace(/^v/, "")

    if (deltaBase && !/^\d+\.\d+\.\d+$/.test(deltaBase)) {
        console.error("--delta-base 需要不带 v 的 semver，如 1.6.0")
        process.exit(1)
    }
    if (deltaBase && !installerUrl) {
        console.error("--delta-base 需要同时提供 --installer <完整安装包地址>")
        process.exit(1)
    }

    const [exePath, outDir, version, notes = "", baseUrl = "http://127.0.0.1:8791"] = args
    if (!exePath || !outDir || !version) {
        console.error(
            "用法: bun tools/update-pack.ts <exe> <outDir> <version> [notes] [baseUrl] [--full-install <installerUrl>] [--delta-base <version> --installer <installerUrl>]"
        )
        process.exit(1)
    }

    const feedPath = path.resolve(outDir, "latest.json")
    if (fullInstallerUrl) {
        const feed = buildUpdateFeed(version.replace(/^v/, ""), notes, null, baseUrl, { fullInstallerUrl })
        fs.mkdirSync(path.dirname(feedPath), { recursive: true })
        fs.writeFileSync(feedPath, JSON.stringify(feed, null, 4))
        console.log(`✅ full-install feed: ${feedPath} (installer=${fullInstallerUrl})`)
        return
    }

    const absoluteExe = path.resolve(exePath)
    if (!fs.existsSync(absoluteExe)) {
        throw new Error(`exe 不存在: ${absoluteExe}`)
    }

    const zipPath = path.resolve(outDir, EXE_ZIP_NAME)
    console.log(`📦 压缩 ${absoluteExe} -> ${zipPath}`)
    const asset = await packExeZip(absoluteExe, zipPath)
    const feed = buildUpdateFeed(version.replace(/^v/, ""), notes, asset, baseUrl, { deltaBase, installerUrl })
    fs.writeFileSync(feedPath, JSON.stringify(feed, null, 4))
    console.log(`✅ 更新包: ${zipPath} (${(asset.size / 1024 / 1024).toFixed(2)} MB, sha256=${asset.sha256})`)
    console.log(`✅ feed: ${feedPath}`)
    console.log(`   启动本地服务器: bun tools/update-server.ts ${path.resolve(outDir)} 8791`)
}

if (import.meta.main) {
    main().catch(error => {
        console.error("生成更新包失败:", error)
        process.exit(1)
    })
}
