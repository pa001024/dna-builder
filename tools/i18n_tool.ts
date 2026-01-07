#!/usr/bin/env bun

import { readdir, readFile, writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"

const I18N_DIR = "public/i18n"
const DIFF_FILE = "tools/i18n_diff.json"

function flattenKeys(obj: Record<string, any>, prefix = ""): Map<string, string> {
    const result = new Map<string, string>()
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key
        if (typeof value === "object" && value !== null) {
            const nested = flattenKeys(value, fullKey)
            nested.forEach((v, k) => result.set(k, v))
        } else {
            result.set(fullKey, value)
        }
    }
    return result
}

async function getLanguageFiles(): Promise<Map<string, Record<string, any>>> {
    const locales = await readdir(I18N_DIR)
    const langFiles = new Map<string, Record<string, any>>()

    for (const locale of locales) {
        const filePath = join(I18N_DIR, locale, "translation.json")
        try {
            const content = await readFile(filePath, "utf-8")
            langFiles.set(locale, JSON.parse(content))
        } catch (error) {
            console.error(`Error reading ${locale}:`, error)
        }
    }

    return langFiles
}

async function exportDiff() {
    console.log("Exporting i18n differences...")
    const langFiles = await getLanguageFiles()

    const allKeys = new Set<string>()
    const localeKeysMap = new Map<string, Map<string, string>>()

    for (const [locale, translations] of langFiles) {
        const keys = flattenKeys(translations)
        localeKeysMap.set(locale, keys)
        keys.forEach((_, key) => allKeys.add(key))
    }

    const diff: Record<string, Record<string, string>> = {}

    for (const key of allKeys) {
        const keyData: Record<string, string> = {}
        let hasMissing = false

        for (const [locale, keys] of localeKeysMap) {
            const value = keys.get(key) ?? ""
            keyData[locale] = value
            if (locale !== "zh-CN" && !value) {
                hasMissing = true
            }
        }

        if (hasMissing) {
            diff[key] = keyData
        }
    }

    await writeFile(DIFF_FILE, JSON.stringify(diff, null, 4), "utf-8")
    console.log(`Differences exported to ${DIFF_FILE}`)
    console.log(`Found ${Object.keys(diff).length} keys with missing translations`)
}

function setNestedValue(obj: Record<string, any>, path: string, value: string): void {
    const keys = path.split(".")
    let current = obj
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        if (!current[key]) {
            current[key] = {}
        }
        current = current[key]
    }
    current[keys[keys.length - 1]] = value
}

async function importDiff() {
    console.log("Importing i18n differences...")
    try {
        const diffContent = await readFile(DIFF_FILE, "utf-8")
        const diff: Record<string, Record<string, string>> = JSON.parse(diffContent)
        const langFiles = await getLanguageFiles()

        for (const [key, translations] of Object.entries(diff)) {
            for (const [locale, value] of Object.entries(translations)) {
                if (value && langFiles.has(locale)) {
                    const normalizedKey = key.replace(/"/g, "")
                    const normalizedValue = value.replace(/"/g, "")
                    if (normalizedKey !== normalizedValue) {
                        setNestedValue(langFiles.get(locale)!, key, value)
                    }
                }
            }
        }

        for (const [locale, translations] of langFiles) {
            const filePath = join(I18N_DIR, locale, "translation.json")
            await writeFile(filePath, JSON.stringify(translations, null, 4), "utf-8")
        }

        await unlink(DIFF_FILE)
        console.log(`Differences imported successfully`)
        console.log(`${DIFF_FILE} has been deleted`)
    } catch (error) {
        console.error("Error importing differences:", error)
        process.exit(1)
    }
}

async function main() {
    const args = process.argv.slice(2)
    const command = args[0]

    if (command === "export") {
        await exportDiff()
    } else if (command === "import") {
        await importDiff()
    } else {
        console.log("Usage: bun tools/i18n_tool.ts [export|import]")
        console.log("  export - Export missing translation differences to tools/i18n_diff.json")
        console.log("  import  - Import differences from tools/i18n_diff.json and delete the file")
        process.exit(1)
    }
}

main()
