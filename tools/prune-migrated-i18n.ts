#!/usr/bin/env bun
/**
 * prune-migrated-i18n.ts — 清理已迁移进数据包的翻译条目。
 *
 * 游戏内零散文案（角色名、物品名、成就名等）已由 tools/import-i18n-data.ts 生成
 * `src/data/d/translations.data.ts` 随数据包下发，内置翻译文件里对应的中文键条目即为冗余，
 * 本工具把它们从 public/i18n/<locale>/translation.json 移除。
 *
 * 判据：语言在数据包承载范围内（tc/en/jp/kr/fr）
 *   **且** 键含中日韩汉字
 *   **且** 键在上游该语言的 translation.json 里存在（即确实进了数据包）
 * 三条同时成立才删。因此：
 *   - 界面文案命名空间（`char-build.*`、`database.*` 等英文点号键）不受影响
 *   - 角色特质、属性名与属性说明（上游没有这些文案，前端自己维护）保留
 *   - zh-CN 整体不动（它是 fallbackLng，不进数据包）
 *
 * 用法:
 *   bun tools/prune-migrated-i18n.ts            # 执行清理
 *   bun tools/prune-migrated-i18n.ts --check    # 只报告会删多少条，不写文件
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/** 上游数据仓库根目录候选（与 import-i18n-data.ts 保持一致） */
const UPSTREAM_CANDIDATES = [path.resolve("..", "DuetNightAbyssData2"), "D:/dev/DuetNightAbyssData2"]
/** 上游 i18n 目录（相对上游根目录） */
const UPSTREAM_I18N_DIR = path.join("final", "i18n")
/** 内置翻译文件目录 */
const I18N_DIR = path.resolve("public", "i18n")

/** 应用语言 → 上游语言目录 */
const LOCALE_DIRS = [
    { locale: "en", upstream: "en" },
    { locale: "ja", upstream: "jp" },
    { locale: "ko", upstream: "kr" },
    { locale: "fr", upstream: "fr" },
    { locale: "zh-TW", upstream: "tc" },
] as const

/** 上游承载零散文案对照表的文件名（与 import-i18n-data.ts 的 TRANSLATION_SOURCE_FILE 一致） */
const TRANSLATION_SOURCE_FILE = "translation.json"

/**
 * 判断键是否为「游戏原文」形式的键。
 * @param key 翻译键
 * @returns 是否含中日韩汉字
 */
function isOriginalTextKey(key: string): boolean {
    return /[\u4e00-\u9fff]/.test(key)
}

/**
 * 解析上游仓库根目录。
 * @returns 可用的上游根目录
 */
async function resolveUpstreamRoot(): Promise<string> {
    const specified = process.env.DNA_UPSTREAM
    const candidates = specified ? [specified] : UPSTREAM_CANDIDATES

    for (const candidate of candidates) {
        const root = path.resolve(candidate)
        try {
            await readFile(path.join(root, UPSTREAM_I18N_DIR, "en", TRANSLATION_SOURCE_FILE), "utf-8")
            return root
        } catch {
            // 继续尝试下一个候选
        }
    }

    throw new Error(
        `找不到可用的上游数据目录，已尝试：\n${candidates.map(item => `  - ${path.resolve(item)}`).join("\n")}\n` +
            "请用环境变量 DNA_UPSTREAM 指定 DuetNightAbyssData2 仓库根目录。"
    )
}

/**
 * 执行清理。
 */
async function main() {
    const checkOnly = Bun.argv.includes("--check")
    const upstreamRoot = await resolveUpstreamRoot()
    console.log(`上游目录：${upstreamRoot}`)

    let totalRemoved = 0

    for (const { locale, upstream } of LOCALE_DIRS) {
        const upstreamPath = path.join(upstreamRoot, UPSTREAM_I18N_DIR, upstream, TRANSLATION_SOURCE_FILE)
        const upstreamTable = JSON.parse(await readFile(upstreamPath, "utf-8")) as Record<string, unknown>
        const migratedKeys = new Set(Object.keys(upstreamTable).filter(isOriginalTextKey))

        const filePath = path.join(I18N_DIR, locale, "translation.json")
        const originalText = await readFile(filePath, "utf-8")
        const translations = JSON.parse(originalText) as Record<string, unknown>

        const removed: string[] = []
        for (const key of Object.keys(translations)) {
            if (typeof translations[key] !== "string") {
                continue
            }
            if (!isOriginalTextKey(key)) {
                continue
            }
            if (!migratedKeys.has(key)) {
                continue
            }
            removed.push(key)
        }

        if (removed.length === 0) {
            console.log(`${locale}: 无需清理`)
            continue
        }

        for (const key of removed) {
            delete translations[key]
        }

        totalRemoved += removed.length

        if (checkOnly) {
            console.log(`${locale}: 将移除 ${removed.length} 条（未落盘）`)
            continue
        }

        await writeFile(filePath, `${JSON.stringify(translations, null, 4)}\n`, "utf-8")
        console.log(`${locale}: 已移除 ${removed.length} 条`)
    }

    console.log(checkOnly ? `\n共将移除 ${totalRemoved} 条（--check 模式，未写文件）` : `\n共移除 ${totalRemoved} 条`)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
