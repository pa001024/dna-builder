#!/usr/bin/env bun

/**
 * 发布脚本：Web 端部署（打包 dist → scp → 远端解压）与桌面端 App 发布（MSI + latest.json + 夸克网盘）。
 *
 * latest.json 需要内嵌 MSI 的下载地址，而两个存储端各有自己的公开域名，
 * 因此**按端分别生成**：写入 OSS 的清单指向 CDN_URL，写入 R2 的指向 R2_URL，
 * 这样任一端的客户端都能从自己那一端直接下载，不会跨端回源。
 *
 * 桌面端发布最后还会把 MSI 传到夸克网盘（`QUARK_APP_DIR` 目录，默认 `Duet Night Abyss Builder`），
 * 并把同目录下的历史版本 MSI 移进 `老版本` 子目录。夸克令牌未配置时跳过该步（`--skip-quark` 强制跳过）。
 *
 *   pnpm deploy                   # Web 部署
 *   pnpm deploy app               # 桌面端发布（构建 + 上传 + 生成清单 + 夸克网盘）
 *   pnpm deploy app skip-build    # 跳过构建，直接用现有产物
 *   pnpm deploy app -v            # 额外把每端清单内容打印出来
 *   pnpm deploy app --skip-quark  # 跳过夸克网盘上传与归档
 *   pnpm deploy json              # 只生成 latest.json 内容，不做任何上传
 */

import fs from "node:fs"
import path from "node:path"
import { $ } from "bun"
import { isQuarkConfigured, QuarkClient, readQuarkConfig, resolveDirFid } from "../server/src/util/quark"
import { envConfig, getActiveBackends, getPublicUrlOn, isObjectStorageConfigured, putFile, putGenerated } from "./object-storage"

const args = process.argv.slice(2)
const isAppMode = args.includes("app")
const isAllMode = args.includes("all")
const skipBuild = args.includes("skip-build")
const skipQuark = args.includes("--skip-quark")
const printJson = args.includes("-v")
const generateOnly = args.includes("json")

const packageJsonPath = path.resolve("./package.json")
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
const version = packageJson.version

const CONFIG = {
    ssh: {
        host: "dev",
    },
    local: {
        buildCommand: "pnpm build",
        distDir: "./dist",
        zipFile: "dist.zip",
        serverDir: "/var/www",
    },
    server: {
        commands: ["rm -rf /var/www/dna-builder", "unzip -o /var/www/dist.zip -d /var/www/dna-builder"],
    },
    app: {
        msiPath: `./src-tauri/target/release/bundle/msi/DNA Builder_${version}_x64_zh-CN.msi`,
        sigPath: `./src-tauri/target/release/bundle/msi/DNA Builder_${version}_x64_zh-CN.msi.sig`,
        /** 夸克网盘投放目录：fid 或路径（server/.env 的 QUARK_APP_DIR 覆盖，缺省 `Duet Night Abyss Builder`） */
        quarkDir: envConfig.QUARK_APP_DIR || "Duet Night Abyss Builder",
        /** 历史版本归档子目录名 */
        quarkOldDirName: "老版本",
        /** MSI 文件名模式：同目录下命中但版本不同的包视为老版本（早期包为小写 dna-builder 开头，故忽略大小写） */
        quarkMsiPattern: /^DNA Builder_.+_x64_zh-CN\.msi$/i,
    },
}

/**
 * 上传文件到对象存储（各端内容一致：S3 语义下同名 PUT 直接覆盖，无需先删）。
 * @param filePath 本地文件路径
 * @param objectKey 对象键名
 */
async function uploadToStorage(filePath: string, objectKey: string): Promise<void> {
    console.log(`📤 上传文件到对象存储: ${objectKey}`)
    await putFile(objectKey, filePath)
    console.log(`✅ 上传成功: ${objectKey}`)
}

/**
 * 生成 tauri updater 格式的 latest.json 内容。
 * @param version 版本号
 * @param signature 签名
 * @param msiUrl MSI 文件下载链接（由调用方按存储端给出）
 * @returns 清单对象
 */
function generateLatestJson(version: string, signature: string, msiUrl: string): object {
    const versionsPath = path.resolve("./public/versions.json")
    const versionsData = JSON.parse(fs.readFileSync(versionsPath, "utf-8"))
    const versionInfo = versionsData.find((v: { version: string }) => v.version === `v${version}`)
    const notes = versionInfo ? `更新内容: ${versionInfo.msg}` : ""

    return {
        version: version,
        notes,
        pub_date: new Date().toISOString(),
        platforms: {
            "windows-x86_64": {
                signature: signature,
                url: msiUrl,
            },
            "windows-x86_64-msi": {
                signature: signature,
                url: msiUrl,
            },
        },
    }
}

/**
 * 读取 MSI 签名文件。
 * @param options.allowMock 缺签名时是否用模拟值兜底
 * @returns 签名内容
 * @throws 不允许兜底且签名缺失时抛错
 */
function readSignature(options: { allowMock: boolean }): string {
    const sigAbsPath = path.resolve(CONFIG.app.sigPath)
    if (fs.existsSync(sigAbsPath)) {
        return fs.readFileSync(sigAbsPath, "utf-8").trim()
    }
    if (!options.allowMock) {
        throw new Error(`签名文件不存在: ${sigAbsPath}`)
    }
    console.log("⚠️  未找到签名文件，使用模拟签名")
    return "mock-signature-for-testing"
}

/**
 * 按存储端生成并上传 latest.json：每端清单里的 MSI 地址指向该端自己的公开域名。
 * @param msiKey MSI 的对象 key
 * @param signature 签名内容
 * @param options.print 是否打印每端生成的清单
 */
async function uploadLatestJsonPerBackend(msiKey: string, signature: string, options: { print: boolean }): Promise<void> {
    console.log("4. 按存储端生成并上传 latest.json...")
    const backends = getActiveBackends()

    await putGenerated(
        "latest.json",
        backend => {
            const latestJson = generateLatestJson(version, signature, getPublicUrlOn(backend, msiKey))
            if (options.print) {
                console.log(`\n📋 [${backend.label}] latest.json:`)
                console.log(JSON.stringify(latestJson, null, 2))
            }
            return JSON.stringify(latestJson, null, 2)
        },
        "application/json"
    )

    for (const backend of backends) {
        console.log(`✅ 已上传 latest.json -> ${getPublicUrlOn(backend, "latest.json")}`)
        console.log(`   [${backend.label}] MSI 下载链接: ${getPublicUrlOn(backend, msiKey).replace(/ /g, "%20")}`)
    }
}

/**
 * Web 端部署：构建 → 打包 → scp → 远端解压。
 */
async function deployWeb() {
    try {
        console.log("=== 开始Web部署流程 ===")

        console.log("1. 执行本地构建命令...")
        const buildCmdParts = CONFIG.local.buildCommand.split(" ")
        await $`${buildCmdParts[0]} ${buildCmdParts.slice(1).join(" ")}`

        // 2. 检查dist目录是否存在
        if (!fs.existsSync(CONFIG.local.distDir)) {
            throw new Error(`构建失败，未找到${CONFIG.local.distDir}目录`)
        }

        // 3. 打包dist目录为zip文件
        console.log("2. 打包dist目录为zip文件...")
        const zipPath = path.resolve(CONFIG.local.zipFile)
        const distPath = path.resolve(CONFIG.local.distDir)

        // 使用 PowerShell 的 Compress-Archive 命令创建zip文件
        await $`pwsh -Command "Compress-Archive -Path ${distPath}\* -DestinationPath ${zipPath} -Force"`

        // 检查zip文件是否创建成功
        if (!fs.existsSync(zipPath)) {
            throw new Error("创建zip文件失败")
        }

        // 获取zip文件大小
        const stats = fs.statSync(zipPath)
        console.log(`✓ 已创建zip文件，大小：${stats.size} 字节`)

        // 4. 通过SSH上传zip文件到服务器
        console.log("3. 通过SSH上传zip文件到服务器...")
        await $`scp ${zipPath} ${CONFIG.ssh.host}:${CONFIG.local.serverDir}`

        // 5. 在服务器上执行指定命令
        console.log("4. 在服务器上执行指定命令...")
        const serverCommands = CONFIG.server.commands.join("; ")
        await $`ssh ${CONFIG.ssh.host} "${serverCommands}"`

        // 6. 清理本地zip文件
        console.log("5. 清理本地zip文件...")
        fs.unlinkSync(zipPath)
        console.log("=== Web部署流程完成 ===")
    } catch (error) {
        console.error("部署失败:", error)
        process.exit(1)
    }
}

/**
 * 桌面端发布到夸克网盘：上传新版 MSI → 把同目录下其他版本 MSI 移进 `老版本`。
 * 未配置夸克令牌或带 `--skip-quark` 时跳过，不中断对象存储发布流程。
 * @param msiAbsPath 本地 MSI 绝对路径
 */
async function deployQuarkMsi(msiAbsPath: string): Promise<void> {
    if (skipQuark) {
        console.log("⏭️  跳过夸克网盘发布（--skip-quark）")
        return
    }
    if (!isQuarkConfigured(envConfig)) {
        console.log("⚠️  未配置夸克令牌（server/.env 缺 QUARK_ACCESS_TOKEN），跳过网盘发布")
        return
    }
    const client = new QuarkClient(readQuarkConfig(envConfig))
    const fileName = path.basename(msiAbsPath)
    const dirFid = await resolveDirFid(client, CONFIG.app.quarkDir)
    console.log(`📤 上传MSI到夸克网盘: ${fileName}`)
    const bytes = new Uint8Array(await Bun.file(msiAbsPath).arrayBuffer())
    const uploaded = await client.uploadBuffer(fileName, bytes, dirFid)
    console.log(`✅ 网盘上传成功: ${fileName}（fid=${uploaded.fid}）`)

    const oldDir = await client.createDir(CONFIG.app.quarkOldDirName, dirFid)
    const dirName = await resolveDeployDirName(client, CONFIG.app.quarkDir, dirFid)
    const candidates = await client.searchFiles("DNA Builder", 100)
    const oldIds: string[] = []
    for (const item of candidates) {
        if (item.file_type !== 1 || item.filename === fileName || !CONFIG.app.quarkMsiPattern.test(item.filename)) {
            continue
        }
        // 搜索结果自带 full_path（数组形态），有则直接用，缺失才调详情接口（搜索回的 parent_fid 是复合 token，对不上目录 fid）
        const fullPath = item.full_path ?? (await client.getFileInfo(item.fid)).full_path
        if (dirName && !isPathUnderDir(fullPath, dirName)) {
            console.log(`⏭️  跳过非投放目录文件: ${item.filename}`)
            continue
        }
        if (isPathUnderDir(fullPath, CONFIG.app.quarkOldDirName)) {
            continue
        }
        oldIds.push(item.fid)
    }
    if (!oldIds.length) {
        console.log("✅ 没有需要归档的老版本")
        return
    }
    console.log(`📦 归档 ${oldIds.length} 个老版本到 ${CONFIG.app.quarkOldDirName}...`)
    await client.moveFilesAndWait(oldIds, oldDir.fid)
    console.log("✅ 老版本归档完成")
}

/**
 * 解析投放目录名（路径配置取末段；fid 配置查目录详情）。查不到时返回 null，调用方降级为仅按文件名归档。
 * @param client 夸克客户端
 * @param dirConfig 目录配置原文
 * @param dirFid 已解析的目录 fid
 */
async function resolveDeployDirName(client: QuarkClient, dirConfig: string, dirFid: string): Promise<string | null> {
    const trimmed = (dirConfig || "").trim()
    if (trimmed && !/^[0-9a-f]{32}$/i.test(trimmed)) {
        const segments = trimmed.replace(/^\/+/, "").split("/")
        return segments[segments.length - 1] || null
    }
    try {
        const info = await client.getFileInfo(dirFid)
        return info.filename || null
    } catch {
        return null
    }
}

/**
 * 判断文件详情的完整路径是否位于指定目录下（详情路径可能是字符串或数组形态）。
 * @param fullPath 详情接口的 full_path 字段
 * @param dirName 目录名
 */
function isPathUnderDir(fullPath: unknown, dirName: string): boolean {
    if (typeof fullPath === "string") {
        return fullPath.split("/").includes(dirName)
    }
    if (Array.isArray(fullPath)) {
        return fullPath.some(segment =>
            typeof segment === "string"
                ? segment.split("/").includes(dirName)
                : typeof segment === "object" && segment !== null
                  ? Object.values(segment as Record<string, unknown>).some(value =>
                        typeof value === "string" ? value.split("/").includes(dirName) : value === dirName
                    )
                  : segment === dirName
        )
    }
    return false
}

/**
 * 桌面端发布：构建（可选）→ 上传 MSI → 按端生成并上传 latest.json → 夸克网盘。
 */
async function deployApp() {
    try {
        console.log("=== 开始App部署流程 ===")

        if (!isObjectStorageConfigured()) {
            throw new Error("对象存储配置不完整，请检查 .env 中的 OSS / R2 配置")
        }

        if (!skipBuild) {
            console.log("1. 执行pnpm tb命令构建Tauri应用...")
            await $`pnpm tb`
        } else {
            console.log("1. 跳过构建，使用现有文件")
        }

        const msiAbsPath = path.resolve(CONFIG.app.msiPath)
        if (!fs.existsSync(msiAbsPath)) {
            throw new Error(`MSI文件不存在: ${msiAbsPath}`)
        }

        console.log("2. 上传MSI文件到对象存储...")
        const msiKey = `msi/${path.basename(msiAbsPath)}`
        await uploadToStorage(msiAbsPath, msiKey)

        console.log("3. 读取签名文件...")
        const signature = readSignature({ allowMock: false })

        // latest.json 内嵌的 MSI 地址必须与所在端的域名一致，故按端分别生成
        await uploadLatestJsonPerBackend(msiKey, signature, { print: printJson })

        console.log("5. 上传MSI到夸克网盘并归档老版本...")
        await deployQuarkMsi(msiAbsPath)

        console.log("=== App部署流程完成 ===")
    } catch (error) {
        console.error("部署失败:", error)
        process.exit(1)
    }
}

/**
 * 仅生成 latest.json 内容并打印，不做任何上传。
 */
function generateJsonOnly(): void {
    console.log("=== 开始仅生成JSON流程 ===")

    const signature = readSignature({ allowMock: true })
    const msiKey = `msi/DNA Builder_${version}_x64_zh-CN.msi`

    for (const backend of getActiveBackends()) {
        const latestJson = generateLatestJson(version, signature, getPublicUrlOn(backend, msiKey))
        console.log(`\n📋 [${backend.label}] 生成的latest.json内容:`)
        console.log(JSON.stringify(latestJson, null, 2))
    }
}

/**
 * 入口：按参数选择「仅生成 JSON」或对应端的部署流程。
 */
async function main() {
    if (generateOnly) {
        generateJsonOnly()
        return
    }

    if (isAllMode || !isAppMode) await deployWeb()
    if (isAllMode || isAppMode) await deployApp()
}

main()
