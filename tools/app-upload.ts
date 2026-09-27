#!/usr/bin/env bun

import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import OSS from "ali-oss"
import { $ } from "bun"
import { parse } from "dotenv"

/** 安装包与发布清单在 OSS 上的存放前缀（清单只在 apk 目录内，不动桌面端的根 latest.json） */
const OSS_APK_PREFIX = "apk"

/** 发布清单的键名：与数据包的 versions.json 不同，安卓只保留最新一版，故为单个对象 */
const OSS_MANIFEST_KEY = `${OSS_APK_PREFIX}/latest.json`

/** 超过该体积走分片上传，便于输出进度 */
const MULTIPART_THRESHOLD = 1024 * 1024

/** apk/latest.json 的内容：只描述最新一版安装包 */
export type ApkLatest = {
    /** 版本号（pubspec 的 version，去掉 +build 后缀） */
    version: string
    /** OSS 上的文件名 */
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
const versionOverride = versionArgIndex >= 0 ? args[versionArgIndex + 1] : null
const notesArgIndex = args.findIndex(arg => arg === "-m" || arg === "--msg")
const notes = notesArgIndex >= 0 ? args[notesArgIndex + 1] : undefined

const rootDir = path.resolve(".")
const envPath = path.resolve(rootDir, "server", ".env")
const tmpDir = path.resolve(rootDir, ".tmp")
const localManifestPath = path.resolve(tmpDir, "apk-latest.json")
const envConfig = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath)) : {}
const ossConfig = {
    endpoint: envConfig.OSS_ACC_ENDPOINT || envConfig.OSS_ENDPOINT || "",
    bucket: envConfig.OSS_BUCKET || "",
    accessKeyId: envConfig.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: envConfig.OSS_ACCESS_KEY_SECRET || "",
    cdn: envConfig.CDN_URL || "",
}

/**
 * 创建 OSS 客户端。
 * @returns OSS 客户端
 */
function createOssClient(): OSS {
    return new OSS({
        region: ossConfig.endpoint.replace(".aliyuncs.com", "") || "oss-cn-hongkong",
        endpoint: ossConfig.endpoint,
        accessKeyId: ossConfig.accessKeyId,
        accessKeySecret: ossConfig.accessKeySecret,
        bucket: ossConfig.bucket,
    })
}

/**
 * 获取 OSS 对象的公网 URL（优先 CDN）。
 * @param ossKey OSS 键名
 * @returns 公网 URL
 */
function getPublicUrl(ossKey: string): string {
    return ossConfig.cdn ? `${ossConfig.cdn.replace(/\/$/, "")}/${ossKey}` : `https://${ossConfig.bucket}.${ossConfig.endpoint}/${ossKey}`
}

/**
 * 校验 OSS 配置完整性。
 */
function assertOssConfig(): void {
    if (!ossConfig.endpoint || !ossConfig.bucket || !ossConfig.accessKeyId || !ossConfig.accessKeySecret) {
        throw new Error("缺少必要的 OSS 环境变量")
    }
}

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
    const matched = pubspec.match(/^version:\s*([^\s#]+)/m)
    if (!matched) {
        throw new Error(`${path.join(projectRoot, "pubspec.yaml")} 中未找到 version 字段`)
    }

    return matched[1].split("+")[0]
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
 * 上传文件到 OSS，大文件分片上传并打印进度。
 * @param client OSS 客户端
 * @param filePath 本地文件路径
 * @param ossKey OSS 键名
 */
async function uploadToOss(client: OSS, filePath: string, ossKey: string): Promise<void> {
    console.log(`📤 上传到 OSS: ${ossKey}`)

    if (fs.statSync(filePath).size > MULTIPART_THRESHOLD) {
        let lastPercent = -1
        await client.multipartUpload(ossKey, filePath, {
            partSize: 1024 * 1024,
            progress: (percent: number) => {
                const current = Math.round(percent * 100)
                if (current === lastPercent) {
                    return
                }
                lastPercent = current
                // 用 \r 覆盖同一行，避免进度刷屏
                process.stdout.write(`\r📊 上传进度: ${current}%`)
            },
        })
        process.stdout.write("\n")
    } else {
        await client.put(ossKey, fs.readFileSync(filePath))
    }

    console.log(`✅ 上传成功: ${ossKey}`)
}

async function main(): Promise<void> {
    if (!shouldBuild && !shouldUpload) {
        throw new Error("请指定 build（先构建）或 upload（仅上传）")
    }

    assertOssConfig()

    const appTarget = resolveAppTarget()
    const projectRoot = resolveFlutterProject(appTarget)
    const version = versionOverride || readProjectVersion(projectRoot)
    const versionedPath = path.join(path.dirname(appTarget), formatApkFileName(version))

    if (shouldBuild) {
        console.log(`🔨 在 ${projectRoot} 执行 flutter build apk ...`)
        await $`flutter build apk`.cwd(projectRoot)
    } else {
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

    const apkKey = `${OSS_APK_PREFIX}/${fileName}`
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
    console.log(`   OSS 键名: ${apkKey}`)
    console.log(`   下载地址: ${latest.url}`)
    console.log(`\n📋 ${OSS_MANIFEST_KEY}`)
    console.log(JSON.stringify(latest, null, 2))
    console.log(`   本地快照: ${localManifestPath}`)

    if (shouldUpload && !isDryRun) {
        const client = createOssClient()
        await uploadToOss(client, staged.apkPath, apkKey)
        await uploadToOss(client, localManifestPath, OSS_MANIFEST_KEY)
        console.log(`\n✅ 已发布 ${fileName} -> ${latest.url}`)
        console.log(`✅ 已发布 ${OSS_MANIFEST_KEY} -> ${getPublicUrl(OSS_MANIFEST_KEY)}`)
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
