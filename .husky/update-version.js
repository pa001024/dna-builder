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
const newVersion = version || packageJson.version // incrementPatchVersion(packageJson.version)
packageJson.version = newVersion
tauriConf.version = newVersion

// 写入更新后的文件
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n")
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 4) + "\n")

// console.log(`Version updated to ${newVersion}`)

// sort JSON
function sortJson(obj) {
    if (typeof obj !== "object" || obj === null) return obj
    if (Array.isArray(obj)) return obj.map(sortJson)
    return Object.fromEntries(
        Object.entries(obj)
            .map(([key, value]) => [key, sortJson(value)])
            .sort(([a], [b]) => a.localeCompare(b)),
    )
}

const langs = ["en", "zh-CN", "zh-TW", "ja", "ko"]
for (const lang of langs) {
    const i18nPath = path.join(import.meta.url.replace("file:///", ""), "..", "..", "public", "i18n", lang, `translation.json`)
    let i18n = JSON.parse(fs.readFileSync(i18nPath, "utf8"))
    i18n = sortJson(i18n)
    fs.writeFileSync(i18nPath, JSON.stringify(i18n, null, 4) + "\n")
}
