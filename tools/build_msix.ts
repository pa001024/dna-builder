#!/usr/bin/env bun

/**
 * MSIX打包脚本
 * 使用Windows SDK标准的makeappx.exe工具生成MSIX安装包
 */

import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * 打包配置
 */
const CONFIG = {
    // 包标识
    identityName: "pa001024.DNABuilder",
    // 发布者
    publisher: "CN=C21F0FE3-67AF-43C3-A412-51014CF129FA",
    description: "DNA Builder 应用",
    // 版本
    version: "1.0.1.0",
    // 显示名称
    displayName: "DNA Builder",
    // 发布者显示名称
    publisherDisplayName: "pa001024",
    // Logo路径
    logo: resolve(__dirname, "../src-tauri/icons/StoreLogo.png"),
    // 不同尺寸的图标路径
    icons: {
        square44x44: resolve(__dirname, "../src-tauri/icons/Square44x44Logo.png"),
        square150x150: resolve(__dirname, "../src-tauri/icons/Square150x150Logo.png"),
        square310x310: resolve(__dirname, "../src-tauri/icons/Square310x310Logo.png"),
        square71x71: resolve(__dirname, "../src-tauri/icons/Square71x71Logo.png"),
        wide310x150: resolve(__dirname, "../src-tauri/icons/Square310x310Logo.png"),
        splashScreen: resolve(__dirname, "../src-tauri/icons/128x128@2x.png"),
        lockScreenBadge: resolve(__dirname, "../src-tauri/icons/Square44x44Logo.png"),
    },
    // 语言
    language: "zh-CN",
    // 输出文件夹
    binFolder: resolve(__dirname, "../src-tauri/target/release"),
    exeFileName: "dna-builder.exe",
    // 输出文件夹
    outputFolder: resolve(__dirname, "../src-tauri/target/release/msix"),
    // 构建文件名称
    fileName: "DNA Builder.msix",
    // 打包目录
    packageDir: resolve(__dirname, "../src-tauri/target/release/msix/package-content"),
    // makeappx工具路径
    makeappxPath: "makeappx",
}

/**
 * 检查文件是否存在
 */
function checkFileExists(filePath: string): void {
    if (!existsSync(filePath)) {
        console.error(`错误: 文件不存在: ${filePath}`)
        process.exit(1)
    }
}

/**
 * 检查目录是否存在，不存在则创建
 */
function ensureDirExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true })
        console.log(`创建目录: ${dirPath}`)
    }
}

/**
 * 执行命令并返回输出
 */
async function runCommand(cmd: string) {
    try {
        console.log(`执行命令: ${cmd}`)
        const result = spawnSync(cmd, { shell: true })
        if (result.status !== 0) {
            console.error(`命令执行失败: ${cmd}`)
            console.error(result.stderr.toString().trim())
            process.exit(1)
        }
        return result.stdout.toString().trim()
    } catch (error) {
        console.error(`命令执行失败: ${cmd}`)
        console.error((error as Error).message)
        process.exit(1)
    }
}

/**
 * 生成AppxManifest.xml文件
 */
function generateAppxManifest(): void {
    console.log("生成AppxManifest.xml文件...")

    const manifestContent = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:uap2="http://schemas.microsoft.com/appx/manifest/uap/windows10/2"
         xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
         xmlns:uap4="http://schemas.microsoft.com/appx/manifest/uap/windows10/4"
         xmlns:uap6="http://schemas.microsoft.com/appx/manifest/uap/windows10/6"
         xmlns:uap7="http://schemas.microsoft.com/appx/manifest/uap/windows10/7"
         xmlns:uap8="http://schemas.microsoft.com/appx/manifest/uap/windows10/8"
         xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
         xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
         xmlns:desktop2="http://schemas.microsoft.com/appx/manifest/desktop/windows10/2"
         xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
         xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
         xmlns:desktop6="http://schemas.microsoft.com/appx/manifest/desktop/windows10/6"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         xmlns:rescap3="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/3"
         xmlns:rescap6="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/6"
         IgnorableNamespaces="uap3 desktop">
  <Identity Name="${CONFIG.identityName}"
            Version="${CONFIG.version}"
            Publisher="${CONFIG.publisher}"
            ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>${CONFIG.displayName}</DisplayName>
    <PublisherDisplayName>${CONFIG.publisherDisplayName}</PublisherDisplayName>
    <Logo>StoreLogo.png</Logo>
    <Description>${CONFIG.description}</Description>
  </Properties>
  <Resources>
    <Resource Language="${CONFIG.language}"/>
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.2506" />
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust"/>
  </Capabilities>
  <Applications>
    <Application Id="DNABuilder"
                 Executable="${CONFIG.exeFileName}"
                 EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements BackgroundColor="transparent"
                          DisplayName="${CONFIG.displayName}"
                          Square150x150Logo="Square150x150Logo.png"
                          Square44x44Logo="Square44x44Logo.png"
                          Description="${CONFIG.description}">
        <uap:DefaultTile ShortName="${CONFIG.displayName.length > 40 ? `${CONFIG.displayName.substring(0, 37)}...` : CONFIG.displayName}"
                         Square310x310Logo="Square310x310Logo.png"
                         Square71x71Logo="Square71x71Logo.png"
                         Wide310x150Logo="Square310x310Logo.png">
          <uap:ShowNameOnTiles>
            <uap:ShowOn Tile="square150x150Logo"/>
            <uap:ShowOn Tile="square310x310Logo"/>
            <uap:ShowOn Tile="wide310x150Logo"/>
          </uap:ShowNameOnTiles>
        </uap:DefaultTile>
        <uap:SplashScreen Image="128x128@2x.png"/>
        <uap:LockScreen BadgeLogo="Square44x44Logo.png" Notification="badge"/>
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>`

    writeFileSync(resolve(CONFIG.packageDir, "AppxManifest.xml"), manifestContent)
    console.log(`✓ 生成AppxManifest.xml: ${resolve(CONFIG.packageDir, "AppxManifest.xml")}`)
}

/**
 * 准备打包内容
 */
function preparePackageContent(): void {
    console.log("准备打包内容...")

    // 确保打包目录存在
    ensureDirExists(CONFIG.packageDir)

    // 确保输出目录存在
    ensureDirExists(CONFIG.outputFolder)

    // 复制所有需要的图标文件到打包目录
    const iconFiles = [
        { src: CONFIG.logo, dest: "StoreLogo.png" },
        { src: CONFIG.icons.square44x44, dest: "Square44x44Logo.png" },
        { src: CONFIG.icons.square150x150, dest: "Square150x150Logo.png" },
        { src: CONFIG.icons.square310x310, dest: "Square310x310Logo.png" },
        { src: CONFIG.icons.square71x71, dest: "Square71x71Logo.png" },
        { src: CONFIG.icons.splashScreen, dest: "128x128@2x.png" },
    ]

    for (const icon of iconFiles) {
        const destPath = resolve(CONFIG.packageDir, icon.dest)
        copyFileSync(icon.src, destPath)
        console.log(`复制文件: ${icon.src} -> ${destPath}`)
    }

    // 复制应用程序文件到打包目录
    const appExePath = resolve(CONFIG.binFolder, CONFIG.exeFileName)
    checkFileExists(appExePath)
    const appExeDest = resolve(CONFIG.packageDir, CONFIG.exeFileName)
    copyFileSync(appExePath, appExeDest)
    console.log(`复制文件: ${appExePath} -> ${appExeDest}`)

    console.log("✓ 打包内容准备完成")
}

/**
 * 使用makeappx.exe生成MSIX包
 */
async function buildWithMakeAppx(): Promise<void> {
    console.log("开始使用makeappx.exe打包MSIX...")

    // 执行打包命令
    const cmd = `${CONFIG.makeappxPath}.exe pack /d "${CONFIG.packageDir}" /p "${resolve(CONFIG.outputFolder, CONFIG.fileName)}" /v /o`
    await runCommand(cmd)

    console.log("✓ MSIX打包完成")
    console.log(`✓ 生成文件: ${resolve(CONFIG.outputFolder, CONFIG.fileName)}`)
}

/**
 * 主函数
 */
async function main(): Promise<void> {
    console.log("=== MSIX打包脚本 ===")
    console.log(`项目: ${CONFIG.displayName}`)
    console.log(`版本: ${CONFIG.version}`)

    try {
        // 生成AppxManifest.xml
        generateAppxManifest()

        // 准备打包内容
        preparePackageContent()

        // 执行打包
        await buildWithMakeAppx()

        console.log("=== 打包完成 ===")
        console.log(`输出文件: ${resolve(CONFIG.outputFolder, CONFIG.fileName)}`)
    } catch (error) {
        console.error("✗ 打包失败:", (error as Error).message)
        process.exit(1)
    }
}

// 执行主函数
main()
