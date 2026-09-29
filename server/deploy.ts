#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"
import { $ } from "bun"
import { parse } from "dotenv"
import { getPublicObjectUrl, isObjectStorageConfigured, putObjectFromFile } from "./src/util/r2-storage"

const args = process.argv.slice(2)
const isAppMode = args.includes("app")
const isAllMode = args.includes("all")
const skipBuild = args.includes("skip-build")
const printJson = args.includes("-v")
const generateOnly = args.includes("json")

const envPath = path.resolve("server/.env")
const envConfig = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath)) : {}
// r2-storage 从 process.env 读配置，这里把 server/.env 注入进程环境，保持单一配置来源
Object.assign(process.env, envConfig)

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
    },
}

/**
 * 上传文件到 R2（S3 语义下同名 PUT 直接覆盖，无需先删）。
 * @param filePath 本地文件路径
 * @param objectKey 对象键名
 */
async function uploadToStorage(filePath: string, objectKey: string): Promise<void> {
    console.log(`📤 上传文件到 R2: ${objectKey}`)
    await putObjectFromFile(objectKey, filePath)
    console.log(`✅ 上传成功: ${objectKey}`)
}

/**
 * 生成tauri updater格式的latest.json
 * @param version 版本号
 * @param signature 签名
 * @param msiUrl MSI文件下载链接
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

async function deployApp() {
    try {
        console.log("=== 开始App部署流程 ===")

        if (!isObjectStorageConfigured()) {
            throw new Error("对象存储配置不完整，请检查 .env 中的 R2 配置")
        }

        if (!skipBuild) {
            console.log("1. 执行pnpm tb命令构建Tauri应用...")
            await $`pnpm tb`
        } else {
            console.log("1. 跳过构建，使用现有文件")
        }

        const msiAbsPath = path.resolve(CONFIG.app.msiPath)
        const sigAbsPath = path.resolve(CONFIG.app.sigPath)

        if (!fs.existsSync(msiAbsPath)) {
            throw new Error(`MSI文件不存在: ${msiAbsPath}`)
        }

        console.log("2. 上传MSI文件到R2...")
        const msiKey = `msi/${path.basename(msiAbsPath)}`
        await uploadToStorage(msiAbsPath, msiKey)

        console.log("3. 读取签名文件...")
        if (!fs.existsSync(sigAbsPath)) {
            throw new Error(`签名文件不存在: ${sigAbsPath}`)
        }
        const signature = fs.readFileSync(sigAbsPath, "utf-8").trim()
        const msiUrl = getPublicObjectUrl(msiKey)

        console.log("4. 生成latest.json...")
        const latestJson = generateLatestJson(version, signature, msiUrl)

        // 如果指定了--print-json参数，则输出生成的json内容到控制台
        if (printJson) {
            console.log("\n📋 生成的latest.json内容:")
            console.log(JSON.stringify(latestJson, null, 2))
        }

        const newLatestJsonPath = path.resolve("./latest.json")
        fs.writeFileSync(newLatestJsonPath, JSON.stringify(latestJson, null, 2))

        console.log("5. 上传latest.json到R2根目录...")
        await uploadToStorage(newLatestJsonPath, "latest.json")

        fs.unlinkSync(newLatestJsonPath)

        console.log("=== App部署流程完成 ===")
        console.log(`MSI下载链接: ${msiUrl.replace(/ /g, "%20")}`)
    } catch (error) {
        console.error("部署失败:", error)
        process.exit(1)
    }
}

async function main() {
    if (generateOnly) {
        // 只生成json，不执行构建上传或任何其他操作
        console.log("=== 开始仅生成JSON流程 ===")

        // 从package.json获取版本号
        const packageJsonPath = path.resolve("./package.json")
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
        const version = packageJson.version

        const sigAbsPath = path.resolve(CONFIG.app.sigPath)

        // 检查文件是否存在，如果不存在则使用模拟数据
        let signature = "mock-signature-for-testing"
        if (fs.existsSync(sigAbsPath)) {
            signature = fs.readFileSync(sigAbsPath, "utf-8").trim()
        } else {
            console.log("⚠️  未找到签名文件，使用模拟签名")
        }

        // 生成MSI文件名与对象 key，下载地址与服务端 latest.json 里的口径一致
        const msiKey = `msi/DNA Builder_${version}_x64_zh-CN.msi`
        const msiUrl = getPublicObjectUrl(msiKey)

        // 生成latest.json
        const latestJson = generateLatestJson(version, signature, msiUrl)

        // 输出生成的json内容到控制台
        console.log("\n📋 生成的latest.json内容:")
        console.log(JSON.stringify(latestJson, null, 2))
    } else {
        // 原有的部署逻辑
        if (isAllMode || !isAppMode) await deployWeb()
        if (isAllMode || isAppMode) await deployApp()
    }
}

main()
