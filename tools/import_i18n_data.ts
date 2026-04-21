#!/usr/bin/env bun

import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import * as ts from "typescript"

const SOURCE_ROOT = path.resolve("..", "DuetNightAbyssData2", "final", "i18n")
const OUT_ROOT = path.resolve("..", "DuetNightAbyssData2", "out")
const TARGET_DIR = path.resolve("src", "data", "d")
const LOCALES = ["cn", "en", "fr", "jp", "kr", "tc"] as const
type Locale = (typeof LOCALES)[number]

type Mapping = {
    source: string | (() => Promise<GeneratedReplacement[]> | GeneratedReplacement[])
    targetStem: string
    targetVar: string
    locales?: readonly string[]
    targetVars?: Partial<Record<Locale, string>>
}

type GeneratedReplacement = {
    targetVar: string
    text: string
}

const MAPPINGS: Mapping[] = [
    { source: "AbyssBuff", targetStem: "abyss", targetVar: "abyssBuffs", locales: ["cn"] },
    { source: "AbyssDungeon", targetStem: "abyss", targetVar: "abyssDungeons", locales: ["cn"] },
    { source: "Achievement", targetStem: "achievement", targetVar: "t", locales: ["cn"] },
    { source: "BackpackPuzzleItem", targetStem: "backpackpuzzle", targetVar: "backpackPuzzleItems", locales: ["cn"] },
    { source: "BackpackPuzzleLevel", targetStem: "backpackpuzzle", targetVar: "backpackPuzzleLevels", locales: ["cn"] },
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
    { source: "Dispatch", targetStem: "dynquest", targetVar: "t", locales: ["cn"] },
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
    { source: "ExtractionTreasureMechanism", targetStem: "solotreasure", targetVar: "extractionTreasureMechanismData", locales: ["cn"] },
    { source: "ExtractionTreasure", targetStem: "solotreasure", targetVar: "extractionTreasureData", locales: ["cn"] },
    { source: "ExtractionTreasureBag", targetStem: "solotreasure", targetVar: "extractionTreasureBagData", locales: ["cn"] },
    { source: "SoloTreasure", targetStem: "solotreasure", targetVar: "soloTreasureData", locales: ["cn"] },
    { source: "SoloTreasureGamePlay", targetStem: "solotreasure", targetVar: "soloTreasureGamePlayData", locales: ["cn"] },
    { source: "TreasureHuntProgress", targetStem: "solotreasure", targetVar: "treasureHuntProgressData", locales: ["cn"] },
    { source: "TreasureHuntRepeatDungeon", targetStem: "solotreasure", targetVar: "treasureHuntRepeatDungeonData", locales: ["cn"] },
    { source: "TreasureHuntStoryDungeon", targetStem: "solotreasure", targetVar: "treasureHuntStoryDungeonData", locales: ["cn"] },
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
    {
        source: async () => {
            const { seasonText, levelText } = await loadAbyssOutTables(OUT_ROOT)
            const seasons = JSON.parse(seasonText) as Record<string, AbyssSeasonRow>
            const levels = JSON.parse(levelText) as Record<string, AbyssLevelRow>

            const seasonRows = Object.values(seasons)
                .filter(row => row.AbyssType === 3)
                .sort((a, b) => a.AbyssStartTime - b.AbyssStartTime)

            if (!seasonRows.length) {
                throw new Error("没有找到不朽剧目赛季数据")
            }

            const rules: Record<number, { abyssId: number; levelIds: number[]; initLevels: number[]; levelAddOn: number }> = {}
            for (const season of seasonRows) {
                const levelIds = season.AbyssLevelId
                const levelRows = levelIds.map(levelId => {
                    const levelRow = levels[String(levelId)]
                    if (!levelRow) {
                        throw new Error(`赛季 ${season.AbyssSeasonId} 找不到 AbyssLevel[${levelId}]`)
                    }
                    return levelRow
                })
                const levelAddOns = [...new Set(levelRows.map(row => row.LevelAddOn ?? 0))]
                if (levelAddOns.length !== 1) {
                    throw new Error(`赛季 ${season.AbyssSeasonId} 的 LevelAddOn 不一致: ${levelAddOns.join(",")}`)
                }

                rules[season.AbyssSeasonId] = {
                    abyssId: season.AbyssId,
                    levelIds: [...levelIds],
                    initLevels: levelRows.map(row => row.InitLevel),
                    levelAddOn: levelAddOns[0],
                }
            }

            const defaultSeasonId = seasonRows[seasonRows.length - 1].AbyssSeasonId
            return [
                {
                    targetVar: "immortalMonsterLevelRules",
                    text: formatTsValue(rules, 0),
                },
                {
                    targetVar: "defaultImmortalSeasonId",
                    text: String(defaultSeasonId),
                },
            ]
        },
        targetStem: "abyss",
        targetVar: "immortalMonsterLevelRules",
    },
    {
        source: async () => {
            const sourceRoot = OUT_ROOT
            const [costRuleText, itemText, poolText] = await Promise.all([
                readFile(path.join(sourceRoot, "LimitedPrizeCostRule.json"), "utf8"),
                readFile(path.join(sourceRoot, "LimitedPrizeItem.json"), "utf8"),
                readFile(path.join(sourceRoot, "LimitedPrizePool.json"), "utf8"),
            ])

            return [
                {
                    targetVar: "limitedPrizeCostRules",
                    text: formatTsValue(JSON.parse(costRuleText), 0),
                },
                {
                    targetVar: "limitedPrizeItems",
                    text: formatTsValue(JSON.parse(itemText), 0),
                },
                {
                    targetVar: "limitedPrizePools",
                    text: formatTsValue(JSON.parse(poolText), 0),
                },
            ]
        },
        targetStem: "limitedprize",
        targetVar: "limitedPrizeCostRules",
    },
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
 * 在变量初始化表达式中寻找第一个数组或对象字面量。
 */
function findFirstCollectionLiteral(node: ts.Node): ts.ArrayLiteralExpression | ts.ObjectLiteralExpression | null {
    if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) {
        return node
    }
    let found: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression | null = null
    ts.forEachChild(node, child => {
        if (found) {
            return
        }
        const candidate = findFirstCollectionLiteral(child)
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
            const collectionNode =
                ts.isArrayLiteralExpression(declaration.initializer) || ts.isObjectLiteralExpression(declaration.initializer)
                    ? declaration.initializer
                    : findFirstCollectionLiteral(declaration.initializer)
            if (!collectionNode) {
                throw new Error(`在 ${sourceFile.fileName} 中找不到 ${targetVar} 的数组或对象字面量`)
            }
            return {
                start: collectionNode.getStart(sourceFile),
                end: collectionNode.getEnd(),
            }
        }
    }
    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

/**
 * 根据变量名定位变量初始化表达式区间。
 */
function findVariableInitializerSpan(sourceFile: ts.SourceFile, targetVar: string): { start: number; end: number } {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) {
                continue
            }
            return {
                start: declaration.initializer.getStart(sourceFile),
                end: declaration.initializer.getEnd(),
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

type AbyssSeasonRow = {
    AbyssEndTime: number
    AbyssId: number
    AbyssLevelId: number[]
    AbyssSeasonId: number
    AbyssStartTime: number
    AbyssType: number
}

type AbyssLevelRow = {
    AbyssType: number
    InitLevel: number
    LevelAddOn?: number
}

/**
 * 从 out 目录自动识别不朽剧目赛季和等级表文件。
 * @param sourceRoot out 目录。
 * @returns 赛季表与等级表内容。
 */
async function loadAbyssOutTables(sourceRoot: string): Promise<{ seasonText: string; levelText: string }> {
    const entries = await readdir(sourceRoot, { withFileTypes: true })
    let seasonText: string | null = null
    let levelText: string | null = null

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
            continue
        }

        const fileText = await readFile(path.join(sourceRoot, entry.name), "utf8")
        let parsed: Record<string, unknown>
        try {
            parsed = JSON.parse(fileText) as Record<string, unknown>
        } catch {
            continue
        }

        const rows = Object.values(parsed)
        if (!seasonText && rows.some(row => isAbyssSeasonRow(row))) {
            seasonText = fileText
        }
        if (!levelText && rows.some(row => isAbyssLevelRow(row))) {
            levelText = fileText
        }

        if (seasonText && levelText) {
            break
        }
    }

    if (!seasonText || !levelText) {
        throw new Error(`无法在 ${sourceRoot} 中自动识别 AbyssSeason/AbyssLevel`)
    }

    return { seasonText, levelText }
}

/**
 * 判断是否为 AbyssSeason 行。
 * @param value 待判断的值。
 * @returns 是否匹配。
 */
function isAbyssSeasonRow(value: unknown): value is AbyssSeasonRow {
    if (!value || typeof value !== "object") {
        return false
    }

    const row = value as Record<string, unknown>
    return (
        typeof row.AbyssSeasonId === "number" &&
        typeof row.AbyssId === "number" &&
        typeof row.AbyssType === "number" &&
        Array.isArray(row.AbyssLevelId)
    )
}

/**
 * 判断是否为 AbyssLevel 行。
 * @param value 待判断的值。
 * @returns 是否匹配。
 */
function isAbyssLevelRow(value: unknown): value is AbyssLevelRow {
    if (!value || typeof value !== "object") {
        return false
    }

    const row = value as Record<string, unknown>
    return typeof row.InitLevel === "number" && typeof row.AbyssType === "number" && "LevelAddOn" in row
}

/**
 * 执行导入。
 */
async function main() {
    const grouped = new Map<string, Mapping[]>()
    for (const mapping of MAPPINGS) {
        if (typeof mapping.source === "function") {
            continue
        }
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

    for (const mapping of MAPPINGS) {
        if (typeof mapping.source !== "function") {
            continue
        }

        const targetFile = path.join(TARGET_DIR, `${mapping.targetStem}.data.ts`)
        const originalText = await readFile(targetFile, "utf-8")
        const sourceFile = ts.createSourceFile(targetFile, originalText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
        const generatedReplacements = await mapping.source()
        const replacements = generatedReplacements.map(replacement => {
            const span = findVariableInitializerSpan(sourceFile, replacement.targetVar)
            return {
                start: span.start,
                end: span.end,
                text: replacement.text,
            }
        })

        if (replacements.length === 0) {
            continue
        }

        const nextText = applyReplacements(originalText, replacements)
        if (nextText !== originalText) {
            await writeFile(targetFile, nextText, "utf-8")
            updatedFiles.push(path.relative(process.cwd(), targetFile))
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
