#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import * as ts from "typescript"

const SOURCE_ROOT = path.resolve("..", "DuetNightAbyssData2", "final", "i18n")
const TARGET_DIR = path.resolve("src", "data", "d")
const LOCALES = ["cn", "en", "fr", "jp", "kr", "tc"] as const
type Locale = (typeof LOCALES)[number]

type Mapping = {
    source: string
    targetStem: string
    targetVar: string
    locales?: readonly string[]
    targetVars?: Partial<Record<Locale, string>>
}

const MAPPINGS: Mapping[] = [
    { source: "AbyssBuff", targetStem: "abyss", targetVar: "abyssBuffs", locales: ["cn"] },
    { source: "AbyssDungeon", targetStem: "abyss", targetVar: "abyssDungeons", locales: ["cn"] },
    { source: "Achievement", targetStem: "achievement", targetVar: "t", locales: ["cn"] },
    { source: "BookSeriesArchive", targetStem: "book", targetVar: "booksData", locales: ["cn"] },
    { source: "Char", targetStem: "char", targetVar: "t", locales: ["cn"] },
    { source: "CharAccessory", targetStem: "accessory", targetVar: "charAccessoryData", locales: ["cn"] },
    {
        source: "CharDataTarget",
        targetStem: "charext",
        targetVar: "charExtData",
        targetVars: {
            en: "charExtData_en",
            fr: "charExtData_fr",
            jp: "charExtData_jp",
            kr: "charExtData_kr",
            tc: "charExtData_tc",
        },
        locales: ["cn", "en", "fr", "jp", "kr", "tc"],
    },
    {
        source: "CharVoice",
        targetStem: "charvoice",
        targetVar: "charVoiceData",
        targetVars: {
            en: "charVoiceData_en",
            jp: "charVoiceData_jp",
            kr: "charVoiceData_kr",
        },
        locales: ["cn", "en", "jp", "kr"],
    },
    { source: "Draft", targetStem: "draft", targetVar: "t", locales: ["cn"] },
    { source: "Dungeon", targetStem: "dungeon", targetVar: "dungeonsData", locales: ["cn"] },
    { source: "DynQuest", targetStem: "dynquest", targetVar: "t", locales: ["cn"] },
    { source: "Cutoff", targetStem: "cutoff", targetVar: "cutoffData", locales: ["cn"] },
    { source: "Event", targetStem: "event", targetVar: "eventData", locales: ["cn"] },
    { source: "Fish", targetStem: "fish", targetVar: "fishs", locales: ["cn"] },
    { source: "FishingSpot", targetStem: "fish", targetVar: "fishingSpots", locales: ["cn"] },
    { source: "HardBoss", targetStem: "hardboss", targetVar: "hardBossMap", locales: ["cn"] },
    { source: "Hair", targetStem: "accessory", targetVar: "hairData", locales: ["cn"] },
    { source: "HeadSculpture", targetStem: "headsculpture", targetVar: "headSculptureData", locales: ["cn"] },
    { source: "HeadFrame", targetStem: "accessory", targetVar: "headFrameData", locales: ["cn"] },
    { source: "ImpressionShop", targetStem: "shop", targetVar: "imprShopData", locales: ["cn"] },
    { source: "Mod", targetStem: "mod", targetVar: "t", locales: ["cn"] },
    { source: "Monster", targetStem: "monster", targetVar: "monsterData", locales: ["cn"] },
    { source: "MonsterStrongAffixes", targetStem: "monstertag", targetVar: "monsterTagData", locales: ["cn"] },
    { source: "Mount", targetStem: "mount", targetVar: "mountData", locales: ["cn"] },
    { source: "Npc", targetStem: "npc", targetVar: "npcData", locales: ["cn"] },
    {
        source: "PartyTopic",
        targetStem: "partytopic",
        targetVar: "partyTopicData",
        targetVars: {
            en: "partyTopicData_en",
            fr: "partyTopicData_fr",
            jp: "partyTopicData_jp",
            kr: "partyTopicData_kr",
            tc: "partyTopicData_tc",
        },
        locales: ["cn", "en", "fr", "jp", "kr", "tc"],
    },
    { source: "Pet", targetStem: "pet", targetVar: "t", locales: ["cn"] },
    { source: "PetEntry", targetStem: "pet", targetVar: "petEntrys", locales: ["cn"] },
    { source: "QuestChain", targetStem: "questchain", targetVar: "questChainDataRaw", locales: ["cn"] },
    {
        source: "QuestStory",
        targetStem: "quest",
        targetVar: "questData",
        targetVars: {
            en: "questData_en",
            fr: "questData_fr",
            jp: "questData_jp",
            kr: "questData_kr",
            tc: "questData_tc",
        },
        locales: ["cn", "en", "fr", "jp", "kr", "tc"],
    },
    { source: "RaidBuff", targetStem: "raid", targetVar: "RaidBuff", locales: ["cn"] },
    { source: "Region", targetStem: "region", targetVar: "t", locales: ["cn"] },
    { source: "RegionReputation", targetStem: "reputation", targetVar: "reputationData", locales: ["cn"] },
    { source: "Resource", targetStem: "resource", targetVar: "resourceData", locales: ["cn"] },
    { source: "Reward", targetStem: "reward", targetVar: "t", locales: ["cn"] },
    { source: "RobotEquip", targetStem: "autochess", targetVar: "robotEquips", locales: ["cn"] },
    { source: "ShopItem", targetStem: "shop", targetVar: "shopData_i", locales: ["cn"] },
    { source: "Skin", targetStem: "accessory", targetVar: "skinData", locales: ["cn"] },
    { source: "SubRegion", targetStem: "subregion", targetVar: "subRegionData", locales: ["cn", "en", "fr", "jp", "kr", "tc"] },
    { source: "Title", targetStem: "title", targetVar: "titleData", locales: ["cn"] },
    { source: "Walnut", targetStem: "walnut", targetVar: "t", locales: ["cn"] },
    { source: "Weapon", targetStem: "weapon", targetVar: "t", locales: ["cn"] },
    { source: "WeaponAccessory", targetStem: "accessory", targetVar: "weaponAccessoryData", locales: ["cn"] },
    { source: "WeaponSkin", targetStem: "accessory", targetVar: "weaponSkinData", locales: ["cn"] },
]

const SKIPPED_SOURCES = [
    "RegionPoint",
    "RewardView",
    "RougeLikeBlessing",
    "RougeLikeContract",
    "RougeLikeRoom",
    "RougeLikeStoryEvent",
    "RougeLikeTalent",
    "RougeLikeTreasure",
    "translation",
]

/**
 * 判断属性名是否可以直接作为标识符输出。
 */
function isIdentifierKey(key: string): boolean {
    return /^[$_\p{ID_Start}][$\u200C\p{ID_Continue}]*$/u.test(key)
}

/**
 * 将任意 JSON 值序列化为 TypeScript 语法。
 */
function formatTsValue(value: unknown, indent = 0): string {
    const pad = "    ".repeat(indent)
    const nextPad = "    ".repeat(indent + 1)

    if (value === null) {
        return "null"
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return "[]"
        }
        const items = value.map(item => `${nextPad}${formatTsValue(item, indent + 1)}`).join(",\n")
        return `[\n${items}\n${pad}]`
    }
    switch (typeof value) {
        case "string":
            return JSON.stringify(value)
        case "number":
        case "boolean":
            return String(value)
        case "object": {
            const entries = Object.entries(value as Record<string, unknown>)
            if (entries.length === 0) {
                return "{}"
            }
            const items = entries
                .map(([key, entryValue]) => {
                    const formattedKey = isIdentifierKey(key) ? key : JSON.stringify(key)
                    return `${nextPad}${formattedKey}: ${formatTsValue(entryValue, indent + 1)}`
                })
                .join(",\n")
            return `{\n${items}\n${pad}}`
        }
        default:
            throw new Error(`不支持的 JSON 值类型: ${String(value)}`)
    }
}

/**
 * 在变量初始化表达式中寻找第一个数组字面量。
 */
function findFirstArrayLiteral(node: ts.Node): ts.ArrayLiteralExpression | null {
    if (ts.isArrayLiteralExpression(node)) {
        return node
    }
    let found: ts.ArrayLiteralExpression | null = null
    ts.forEachChild(node, child => {
        if (found) {
            return
        }
        const candidate = findFirstArrayLiteral(child)
        if (candidate) {
            found = candidate
        }
    })
    return found
}

/**
 * 根据变量名定位目标数组的替换区间。
 */
function findReplacementSpan(sourceFile: ts.SourceFile, targetVar: string): { start: number; end: number } {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) {
                continue
            }
            const arrayNode = ts.isArrayLiteralExpression(declaration.initializer)
                ? declaration.initializer
                : findFirstArrayLiteral(declaration.initializer)
            if (!arrayNode) {
                throw new Error(`在 ${sourceFile.fileName} 中找不到 ${targetVar} 的数组字面量`)
            }
            return {
                start: arrayNode.getStart(sourceFile),
                end: arrayNode.getEnd(),
            }
        }
    }
    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

/**
 * 将单个目标文件中的多个数组替换应用到文本上。
 */
function applyReplacements(fileText: string, replacements: Array<{ start: number; end: number; text: string }>): string {
    let result = fileText
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
        result = `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`
    }
    return result
}

/**
 * 执行导入。
 */
async function main() {
    const grouped = new Map<string, Mapping[]>()
    for (const mapping of MAPPINGS) {
        const list = grouped.get(mapping.targetStem) ?? []
        list.push(mapping)
        grouped.set(mapping.targetStem, list)
    }

    const updatedFiles: string[] = []

    for (const [targetStem, mappings] of grouped) {
        for (const locale of LOCALES) {
            const targetFile = locale === "cn" ? `${targetStem}.data.ts` : `${targetStem}.${locale}.data.ts`
            const filePath = path.join(TARGET_DIR, targetFile)
            let originalText: string
            try {
                originalText = await readFile(filePath, "utf-8")
            } catch {
                continue
            }

            const sourceFile = ts.createSourceFile(filePath, originalText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
            const replacements: Array<{ start: number; end: number; text: string }> = []

            for (const mapping of mappings) {
                const supportedLocales = mapping.locales ?? ["cn"]
                if (!supportedLocales.includes(locale)) {
                    continue
                }

                const sourcePath = path.join(SOURCE_ROOT, locale, `${mapping.source}.json`)
                const jsonText = await readFile(sourcePath, "utf-8")
                const parsed = JSON.parse(jsonText)
                const targetVar = mapping.targetVars?.[locale] ?? mapping.targetVar
                const span = findReplacementSpan(sourceFile, targetVar)
                replacements.push({
                    start: span.start,
                    end: span.end,
                    text: formatTsValue(parsed, 0),
                })
            }

            if (replacements.length === 0) {
                continue
            }

            const nextText = applyReplacements(originalText, replacements)
            if (nextText !== originalText) {
                await writeFile(filePath, nextText, "utf-8")
                updatedFiles.push(path.relative(process.cwd(), filePath))
            }
        }
    }

    console.log(`已更新 ${updatedFiles.length} 个文件`)
    for (const file of updatedFiles) {
        console.log(`- ${file}`)
    }

    if (SKIPPED_SOURCES.length > 0) {
        console.log(`已跳过未对应到现有 data 文件的源表：${SKIPPED_SOURCES.join(", ")}`)
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
