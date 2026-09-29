#!/usr/bin/env bun

/**
 * 安卓安装包发布：构建（可选）→ 改名 `v<版本>.apk` → 上传安装包与 `apk/latest.json` 到 R2。
 *
 *   pnpm apk build upload -v 1.0.1        # 把 pubspec 版本写成 1.0.1 → 构建 → 发布
 *   pnpm apk build -v 1.0.1               # 只构建，清单快照留在本地 .tmp/apk-latest.json
 *   pnpm apk upload                       # 只上传已有产物，版本取 pubspec 现值
 *   pnpm apk build upload -v 1.0.1 -m 描述 # 附加更新说明（写进清单的 notes）
 *
 * 不传 -v 就不动 pubspec；传了则写回并保留改动，发布后自行提交。
 */

import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { $ } from "bun"
import { assertStorageConfig, envConfig, getPublicUrl, putFile } from "./object-storage"

/** 安装包与发布清单在 R2 上的存放前缀（清单只在 apk 目录内，不动桌面端的根 latest.json） */
const APK_PREFIX = "apk"

/** 发布清单的键名：与数据包的 versions.json 不同，安卓只保留最新一版，故为单个对象 */
const APK_MANIFEST_KEY = `${APK_PREFIX}/latest.json`

/** 发布版本号格式：三段数字，可带 -预发布 / +构建号 后缀（构建号可选，只喂 Android 的 versionCode） */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

/** pubspec.yaml 里 version 那一行（行尾注释不吞） */
const PUBSPEC_VERSION_PATTERN = /^version:\s*([^\s#]+)/m

/** apk/latest.json 的内容：只描述最新一版安装包 */
export type ApkLatest = {
    /** 版本号（pubspec 的 version，去掉 +build 后缀） */
    version: string
    /** 对象存储上的文件名 */
    fileName: string
    /** 下载地址 */
    url: string
    /** 安装包字节数 */
    size: number
    /** 安装包 sha256，供客户端下载后校验 */
    sha256: string
    /** 发布时刻（ISO 8601） */
    builtAt: string
    /** 更新说明 */
    notes?: string
}

const args = process.argv.slice(2)
// build 与 upload 互相独立：`apk upload` 只上传已有产物，`apk build upload` 先构建再上传
const shouldBuild = args.includes("build")
const shouldUpload = args.includes("upload")
const isDryRun = args.includes("--dry-run") || args.includes("--dry")
const versionArgIndex = args.findIndex(arg => arg === "-v" || arg === "--version")
const versionArg = versionArgIndex >= 0 ? (args[versionArgIndex + 1] ?? "").trim() : ""
const notesArgIndex = args.findIndex(arg => arg === "-m" || arg === "--msg")
const notes = notesArgIndex >= 0 ? args[notesArgIndex + 1] : undefined

const rootDir = path.resolve(".")
const tmpDir = path.resolve(rootDir, ".tmp")
const localManifestPath = path.resolve(tmpDir, "apk-latest.json")

/**
 * 读取 server/.env 中的 APP_TARGET，解析为安装包绝对路径。
 * @returns 安装包绝对路径
 */
function resolveAppTarget(): string {
    const raw = (envConfig.APP_TARGET || "").trim()
    if (!raw) {
        throw new Error("server/.env 中缺少 APP_TARGET")
    }

    return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw)
}

/**
 * 自安装包所在目录向上查找 flutter 工程根目录（含 pubspec.yaml 的目录），
 * 用它的 pubspec 版本号命名产物，并在该目录执行构建。
 * @param apkPath 安装包路径
 * @returns flutter 工程根目录
 */
function resolveFlutterProject(apkPath: string): string {
    let dir = path.dirname(apkPath)
    while (true) {
        if (fs.existsSync(path.join(dir, "pubspec.yaml"))) {
            return dir
        }

        const parent = path.dirname(dir)
        if (parent === dir) {
            throw new Error(`未能自 ${apkPath} 向上找到 pubspec.yaml，无法确定 flutter 工程目录`)
        }

        dir = parent
    }
}

/**
 * 读取 flutter 工程版本号，去掉 pubspec 中的 +build 后缀。
 * @param projectRoot flutter 工程根目录
 * @returns 版本号
 */
function readProjectVersion(projectRoot: string): string {
    const pubspec = fs.readFileSync(path.join(projectRoot, "pubspec.yaml"), "utf8")
    const matched = pubspec.match(PUBSPEC_VERSION_PATTERN)
    if (!matched) {
        throw new Error(`${path.join(projectRoot, "pubspec.yaml")} 中未找到 version 字段`)
    }

    return matched[1].split("+")[0]
}

/**
 * 校验 -v 传入的版本号，返回去掉 +build 后缀的版本名。
 * 版本名要同时写进 pubspec 与发布清单：客户端只按版本名判断新旧，构建号不参与比较。
 * @param raw 命令行传入的版本号
 * @returns 版本名
 */
function assertVersionArg(raw: string): string {
    if (!VERSION_PATTERN.test(raw)) {
        throw new Error(`版本号格式不对: ${raw || "(空)"}（应形如 1.0.1 或 1.0.1-rc.1，可带 +构建号 后缀）`)
    }

    return raw.split("+")[0]
}

/**
 * 把版本号写回 pubspec.yaml（`flutter build` 从这里取 versionName / versionCode）。
 * 只在传了 -v 时调用；写坏不自动回滚，发布前看一眼 git diff 即可。
 * @param projectRoot flutter 工程根目录
 * @param version 要写入的版本号（含可选的 +构建号）
 * @returns 是否真的改动了内容
 */
function writeProjectVersion(projectRoot: string, version: string): boolean {
    const pubspecPath = path.join(projectRoot, "pubspec.yaml")
    const pubspec = fs.readFileSync(pubspecPath, "utf8")
    if (!PUBSPEC_VERSION_PATTERN.test(pubspec)) {
        throw new Error(`${pubspecPath} 中未找到 version 字段`)
    }

    const updated = pubspec.replace(PUBSPEC_VERSION_PATTERN, `version: ${version}`)
    if (updated === pubspec) {
        return false
    }

    fs.writeFileSync(pubspecPath, updated)
    return true
}

/**
 * 生成安装包改名后的文件名。
 * @param version 版本号
 * @returns 文件名
 */
export function formatApkFileName(version: string): string {
    return `v${version}.apk`
}

/**
 * 计算文件 sha256。
 * @param filePath 文件路径
 * @returns 十六进制摘要
 */
async function hashFile(filePath: string): Promise<string> {
    const hash = createHash("sha256")
    // 安装包有数十 MB，流式读取避免整包进内存
    for await (const chunk of fs.createReadStream(filePath)) {
        hash.update(chunk as Buffer)
    }

    return hash.digest("hex")
}

/**
 * 把构建产物按版本号改名落盘，返回可上传的路径与元信息。
 * @param sourcePath 原始安装包路径
 * @param version 版本号
 * @returns 版本化安装包路径、字节数与 sha256
 */
async function stageVersionedApk(sourcePath: string, version: string): Promise<{ apkPath: string; size: number; sha256: string }> {
    const apkPath = path.join(path.dirname(sourcePath), formatApkFileName(version))
    if (path.resolve(sourcePath) !== path.resolve(apkPath)) {
        fs.copyFileSync(sourcePath, apkPath)
    }

    return { apkPath, size: fs.statSync(apkPath).size, sha256: await hashFile(apkPath) }
}

/**
 * 上传文件到 R2，超过 1MB 时打印进度（进度逻辑在共用存储模块里）。
 * @param filePath 本地文件路径
 * @param objectKey 对象键名
 */
async function uploadToStorage(filePath: string, objectKey: string): Promise<void> {
    console.log(`📤 上传到 R2: ${objectKey}`)
    await putFile(objectKey, filePath)
    console.log(`✅ 上传成功: ${objectKey}`)
}

async function main(): Promise<void> {
    if (!shouldBuild && !shouldUpload) {
        throw new Error("请指定 build（先构建）或 upload（仅上传）")
    }

    assertStorageConfig()

    const appTarget = resolveAppTarget()
    const projectRoot = resolveFlutterProject(appTarget)
    const version = versionArg ? assertVersionArg(versionArg) : readProjectVersion(projectRoot)
    const versionedPath = path.join(path.dirname(appTarget), formatApkFileName(version))

    if (shouldBuild) {
        // `-v` 是版本的唯一来源：先写回 pubspec，构建出来的包才带着新 versionName。
        // 客户端只按版本名判断新旧，pubspec 不改就等于发了个同版本的包。
        if (versionArg && writeProjectVersion(projectRoot, versionArg)) {
            console.log(`✏️  pubspec.yaml 版本号 -> ${versionArg}`)
        }

        // 先自己跑 pub get，别让构建代劳：构建触发的 pub get 会把「带 dev 依赖
        // （integration_test）」的 GeneratedPluginRegistrant.java 覆盖在 release 版之后，
        // 紧接着的 javac 找不到测试插件类，整个 release 构建会失败。
        console.log("📦 flutter pub get ...")
        await $`flutter pub get`.cwd(projectRoot)

        // 显式写 --release：`flutter build apk` 默认就是 release，但不写明容易被误读成 debug 包
        console.log(`🔨 在 ${projectRoot} 执行 flutter build apk --release（v${version}）...`)
        await $`flutter build apk --release`.cwd(projectRoot)
    } else {
        if (versionArg) {
            console.log(`⚠️  未构建：确认 ${path.basename(appTarget)} 内部的 versionName 就是 ${version}`)
        }
        console.log("⏭️  跳过构建，直接使用已有安装包")
    }

    // 优先使用刚构建出来的 APP_TARGET；上一次运行已改过名时回退到版本化文件
    const sourcePath = fs.existsSync(appTarget) ? appTarget : fs.existsSync(versionedPath) ? versionedPath : null
    if (!sourcePath) {
        throw new Error(`安装包不存在: ${appTarget}（也未找到 ${versionedPath}）`)
    }

    const staged = await stageVersionedApk(sourcePath, version)
    const fileName = path.basename(staged.apkPath)
    console.log(`🏷️  已改名为 ${fileName}（源文件 ${sourcePath}，${(staged.size / 1024 / 1024).toFixed(2)} MB）`)

    const apkKey = `${APK_PREFIX}/${fileName}`
    const latest: ApkLatest = {
        version,
        fileName,
        url: getPublicUrl(apkKey),
        size: staged.size,
        sha256: staged.sha256,
        builtAt: new Date().toISOString(),
        notes,
    }

    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(localManifestPath, JSON.stringify(latest, null, 2))

    console.log(`\n📦 Android 安装包 v${version}`)
    console.log(`   本地文件: ${staged.apkPath}`)
    console.log(`   R2 键名: ${apkKey}`)
    console.log(`   下载地址: ${latest.url}`)
    console.log(`\n📋 ${APK_MANIFEST_KEY}`)
    console.log(JSON.stringify(latest, null, 2))
    console.log(`   本地快照: ${localManifestPath}`)

    if (shouldUpload && !isDryRun) {
        await uploadToStorage(staged.apkPath, apkKey)
        await uploadToStorage(localManifestPath, APK_MANIFEST_KEY)
        console.log(`\n✅ 已发布 ${fileName} -> ${latest.url}`)
        console.log(`✅ 已发布 ${APK_MANIFEST_KEY} -> ${getPublicUrl(APK_MANIFEST_KEY)}`)
        return
    }

    console.log(`\n⏭️  ${isDryRun ? "dry-run" : "未指定 upload"}：跳过上传，仅生成安装包与本地清单`)
}

if (import.meta.main) {
    main().catch(error => {
        console.error(error)
        process.exit(1)
    })
}
