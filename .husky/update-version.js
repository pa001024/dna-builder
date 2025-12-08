#!/usr/bin/env node
import fs from "fs"
import path from "path"

// 从环境变量中读取VERSION
const version = (process.env.VERSION || "").trim()

// 读取package.json文件
const packageJsonPath = path.join(import.meta.url.replace("file:///", ""), "..", "..", "package.json")
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))

// 读取tauri.conf.json文件
const tauriConfPath = path.join(import.meta.url.replace("file:///", ""), "..", "..", "src-tauri", "tauri.conf.json")
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"))

// 递增小版本号
function incrementPatchVersion(version) {
    const [major, minor, patch] = version.split(".").map(Number)
    return `${major}.${minor}.${patch + 1}`
}

// 更新版本号
const newVersion = version || incrementPatchVersion(packageJson.version)
packageJson.version = newVersion
tauriConf.version = newVersion

// 写入更新后的文件
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n")
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 4) + "\n")

// console.log(`Version updated to ${newVersion}`)
