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
    postProcess?: (value: unknown) => unknown
}

type GeneratedReplacement = {
    targetVar: string
    /** 原始 JS 值，写入前才序列化，便于与文件现有值做语义 diff */
    value: unknown
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
    {
        source: "Event",
        targetStem: "event",
        targetVar: "eventData",
        locales: ["cn"],
        postProcess: value => {
            if (!Array.isArray(value)) {
                throw new Error("Event 后处理只支持数组源")
            }
            const event = value.find(row => isRecord(row) && row.id === 1030031)
            if (!isRecord(event)) {
                throw new Error("后处理找不到 Event[1030031]")
            }
            event.startTime = 1785142800
            return value
        },
    },
    {
        source: async () => {
            const convertText = await readFile(path.join(OUT_ROOT, "ModConvertId2ModId.json"), "utf8")

            return [
                {
                    targetVar: "modConvertData",
                    value: JSON.parse(convertText),
                },
            ]
        },
        targetStem: "convert",
        targetVar: "modConvertData",
    },
    {
        source: async () => {
            const dynamicRewardText = await readFile(path.join(OUT_ROOT, "DynamicReward.json"), "utf8")

            return [
                {
                    targetVar: "dynamicRewardMap",
                    value: JSON.parse(dynamicRewardText),
                },
            ]
        },
        targetStem: "hardboss",
        targetVar: "dynamicRewardMap",
    },
    { source: "Fish", targetStem: "fish", targetVar: "fishs", locales: ["cn"] },
    { source: "FishingSpot", targetStem: "fish", targetVar: "fishingSpots", locales: ["cn"] },
    { source: "HardBoss", targetStem: "hardboss", targetVar: "hardBossMap", locales: ["cn"] },
    { source: "Hair", targetStem: "accessory", targetVar: "hairData", locales: ["cn"] },
    { source: "IronTicket", targetStem: "iconticket", targetVar: "iconticketData", locales: ["cn"] },
    { source: "HeadSculpture", targetStem: "headsculpture", targetVar: "headSculptureData", locales: ["cn"] },
    { source: "HeadFrame", targetStem: "accessory", targetVar: "headFrameData", locales: ["cn"] },
    { source: "ImpressionShop", targetStem: "shop", targetVar: "imprShopData", locales: ["cn"] },
    { source: "Mod", targetStem: "mod", targetVar: "t", locales: ["cn"] },
    { source: "Monster", targetStem: "monster", targetVar: "monsterData", locales: ["cn"] },
    { source: "MonsterStrongAffixes", targetStem: "monstertag", targetVar: "monsterTagData", locales: ["cn"] },
    { source: "Mount", targetStem: "mount", targetVar: "mountData", locales: ["cn"] },
    { source: "Music", targetStem: "music", targetVar: "musicData", locales: ["cn"] },
    { source: "MusicScore", targetStem: "music", targetVar: "musicScoreData", locales: ["cn"] },
    { source: "Npc", targetStem: "npc", targetVar: "npcData", locales: ["cn"] },
    { source: "OptReward", targetStem: "optreward", targetVar: "optRewardData", locales: ["cn"] },
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
    {
        source: async () => {
            const [raidCalculationText, raidDungeonText, raidSeasonText] = await Promise.all([
                readFile(path.join(OUT_ROOT, "RaidCalculation.json"), "utf8"),
                readFile(path.join(OUT_ROOT, "RaidDungeon.json"), "utf8"),
                readFile(path.join(OUT_ROOT, "RaidSeason.json"), "utf8"),
            ])

            return [
                {
                    targetVar: "RaidCalculation",
                    value: JSON.parse(raidCalculationText),
                },
                {
                    targetVar: "RaidDungeon",
                    value: JSON.parse(raidDungeonText),
                },
                {
                    targetVar: "RaidSeason",
                    value: JSON.parse(raidSeasonText),
                },
            ]
        },
        targetStem: "raid",
        targetVar: "RaidCalculation",
    },
    {
        source: "RaidBuff",
        targetStem: "raid",
        targetVar: "RaidBuff",
        locales: ["cn"],
        postProcess: value => {
            if (!Array.isArray(value)) {
                throw new Error("RaidBuff 后处理只支持数组源")
            }
            const raidBuff = value.map(v => {
                const { RaidBuffParameter, ...rest } = v
                return rest
            })
            return raidBuff
        },
    },
    {
        source: "Region",
        targetStem: "region",
        targetVar: "t",
        locales: ["cn"],
        postProcess: value => {
            if (!Array.isArray(value)) {
                throw new Error("Region 后处理只支持数组源")
            }
            const nextValue = value.filter(row => !isRecord(row) || row.id !== 3001)
            if (nextValue.length === value.length) {
                throw new Error("后处理找不到 Region[3001]")
            }
            return nextValue
        },
    },
    { source: "RegionReputation", targetStem: "reputation", targetVar: "reputationData", locales: ["cn"] },
    { source: "Resource", targetStem: "resource", targetVar: "resourceData", locales: ["cn"] },
    { source: "Reward", targetStem: "reward", targetVar: "t", locales: ["cn"] },
    { source: "RobotEquip", targetStem: "autochess", targetVar: "robotEquips", locales: ["cn"] },
    {
        source: "RougeLikeBlessing",
        targetStem: "rouge",
        targetVar: "rougeLikeBlessings",
        locales: ["cn"],
    },
    {
        source: "RougeLikeBlessingGroup",
        targetStem: "rouge",
        targetVar: "rougeLikeBlessingGroups",
        locales: ["cn"],
    },
    {
        source: "RougeLikeTalentBranch",
        targetStem: "rouge",
        targetVar: "rougeLikeTalentBranches",
        locales: ["cn"],
    },
    {
        source: "RougeLikeTreasureGroup",
        targetStem: "rouge",
        targetVar: "rougeLikeTreasureGroups",
        locales: ["cn"],
    },
    {
        source: "RougeLikeContract",
        targetStem: "rouge",
        targetVar: "rougeLikeContracts",
        locales: ["cn"],
    },
    {
        source: "RougeLikeRoom",
        targetStem: "rouge",
        targetVar: "rougeLikeRooms",
        locales: ["cn"],
    },
    {
        source: "RougeLikeStoryEvent",
        targetStem: "rouge",
        targetVar: "rougeLikeStoryEvents",
        locales: ["cn"],
    },
    {
        source: "RougeLikeTalent",
        targetStem: "rouge",
        targetVar: "rougeLikeTalents",
        locales: ["cn"],
    },
    {
        source: "RougeLikeTreasure",
        targetStem: "rouge",
        targetVar: "rougeLikeTreasures",
        locales: ["cn"],
    },
    {
        source: "RougePro_Event",
        targetStem: "rouge",
        targetVar: "rougeProEvents",
        locales: ["cn"],
    },
    {
        source: "RougePro_Room",
        targetStem: "rouge",
        targetVar: "rougeProRooms",
        locales: ["cn"],
    },
    {
        source: "RougeProClass",
        targetStem: "rouge",
        targetVar: "rougeProClasses",
        locales: ["cn"],
    },
    {
        source: "RougeProContract",
        targetStem: "rouge",
        targetVar: "rougeProContracts",
        locales: ["cn"],
    },
    {
        source: "RougeProDifficulty",
        targetStem: "rouge",
        targetVar: "rougeProDifficulties",
        locales: ["cn"],
    },
    {
        source: "RougeProEffect",
        targetStem: "rouge",
        targetVar: "rougeProEffects",
        locales: ["cn"],
    },
    {
        source: "RougeProSeason",
        targetStem: "rouge",
        targetVar: "rougeProSeasons",
        locales: ["cn"],
    },
    {
        source: "RougeProTalent",
        targetStem: "rouge",
        targetVar: "rougeProTalents",
        locales: ["cn"],
    },
    {
        source: "RougeProTreasure",
        targetStem: "rouge",
        targetVar: "rougeProTreasures",
        locales: ["cn"],
    },
    {
        source: "RougeProTreasureGroup",
        targetStem: "rouge",
        targetVar: "rougeProTreasureGroups",
        locales: ["cn"],
    },
    { source: "ShopItem", targetStem: "shop", targetVar: "shopData_i", locales: ["cn"] },
    { source: "Skin", targetStem: "accessory", targetVar: "skinData", locales: ["cn"] },
    { source: "SkinGacha", targetStem: "skingacha", targetVar: "skinGachaData", locales: ["cn"] },
    { source: "SkinGachaItem", targetStem: "skingacha", targetVar: "skinGachaItems", locales: ["cn"] },
    { source: "SkinGachaTab", targetStem: "skingacha", targetVar: "skinGachaTabs", locales: ["cn"] },
    { source: "SkinGachaType", targetStem: "skingacha", targetVar: "skinGachaTypes", locales: ["cn"] },
    { source: "SkinGachaCumulative", targetStem: "skingacha", targetVar: "skinGachaCumulative", locales: ["cn"] },
    {
        source: async () => {
            const probabilityText = await readFile(path.join(OUT_ROOT, "GachaProbability.json"), "utf8")

            return [
                {
                    targetVar: "gachaProbabilities",
                    value: JSON.parse(probabilityText),
                },
            ]
        },
        targetStem: "skingacha",
        targetVar: "gachaProbabilities",
    },
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
                    value: rules,
                },
                {
                    targetVar: "defaultImmortalSeasonId",
                    value: defaultSeasonId,
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
                    value: JSON.parse(costRuleText),
                },
                {
                    targetVar: "limitedPrizeItems",
                    value: JSON.parse(itemText),
                },
                {
                    targetVar: "limitedPrizePools",
                    value: JSON.parse(poolText),
                },
            ]
        },
        targetStem: "limitedprize",
        targetVar: "limitedPrizeCostRules",
    },
    {
        source: async () => {
            const conditionText = await readFile(path.join(OUT_ROOT, "Condition.json"), "utf8")
            const rows = JSON.parse(conditionText) as Record<string, RougeConditionRow>
            const conditions = Object.values(rows).map((row): RougeRoomCondition => {
                const { ConditionId, ConditionLogic, ConditionMap, IsNot, Remark } = row
                return {
                    id: ConditionId,
                    logic: ConditionLogic,
                    map: ConditionMap,
                    isNot: IsNot,
                    remark: Remark,
                }
            })
            conditions.sort((a, b) => a.id - b.id)
            const record: Record<number, RougeRoomCondition> = {}
            for (const condition of conditions) {
                const row: RougeRoomCondition = {
                    id: condition.id,
                    logic: condition.logic,
                    map: condition.map,
                }
                if (condition.isNot !== undefined) {
                    row.isNot = condition.isNot
                }
                if (condition.remark !== undefined) {
                    row.remark = condition.remark
                }
                record[condition.id] = row
            }
            return [
                {
                    targetVar: "conditionsMap",
                    value: record,
                },
            ]
        },
        targetStem: "condition",
        targetVar: "conditionsMap",
    },
    {
        source: async () => {
            const [ironSurvivalText, ironSurvivalDungeonText] = await Promise.all([
                readFile(path.join(OUT_ROOT, "IronSurvival.json"), "utf8"),
                readFile(path.join(OUT_ROOT, "IronSurvivalDungeon.json"), "utf8"),
            ])

            return [
                {
                    targetVar: "ironSurvivalData",
                    value: JSON.parse(ironSurvivalText),
                },
                {
                    targetVar: "ironSurvivalDungeonData",
                    value: JSON.parse(ironSurvivalDungeonText),
                },
            ]
        },
        targetStem: "ironsurvival",
        targetVar: "ironSurvivalData",
    },
    {
        source: async () => {
            const dropText = await readFile(path.join(OUT_ROOT, "MonsterLevelDrop.json"), "utf8")
            const drops = JSON.parse(dropText) as Record<string, MonsterLevelDropRow>
            const record: Record<number, MonsterLevelDropRow> = {}
            for (const [key, row] of Object.entries(drops)) {
                record[Number(key)] = row
            }

            return [
                {
                    targetVar: "monsterLevelDropData",
                    value: record,
                },
            ]
        },
        targetStem: "ironsurvival",
        targetVar: "monsterLevelDropData",
    },
    {
        source: async () => {
            const [swatchText, specialSwatchText, textMapText, resourceText, globalConstantText] = await Promise.all([
                readFile(path.join(OUT_ROOT, "Swatch.json"), "utf8"),
                readFile(path.join(OUT_ROOT, "SpecialSwatch.json"), "utf8"),
                readFile(path.join(OUT_ROOT, "TextMap_I18n.json"), "utf8"),
                readFile(path.join(OUT_ROOT, "Resource.json"), "utf8"),
                readFile(path.join(OUT_ROOT, "GlobalConstant.json"), "utf8"),
            ])
            const textMap = JSON.parse(textMapText) as Record<string, { TextMapContent?: string }>
            const resources = recordValues(JSON.parse(resourceText))
            const resourceNames = new Map(
                resources.map(resource => [String(resource.ResourceId ?? resource.id), String(resource.ResourceName ?? "")])
            )
            const swatches = recordValues(JSON.parse(swatchText))
                .filter(swatch => Array.isArray(swatch.ColorNumber))
                .map(swatch => {
                    const resourceId = Number(swatch.ResourceID)
                    const hairResourceId = Number(swatch.HairResourceID)
                    return {
                        id: Number(swatch.ColorID),
                        name: translateTextMap(textMap, resourceNames.get(String(resourceId)) || ""),
                        rgb: swatch.ColorNumber,
                        resourceId,
                        hairResourceId,
                        hairResourceName: translateTextMap(textMap, resourceNames.get(String(hairResourceId)) || ""),
                        sort: Number(swatch.Sort) || 0,
                    }
                })
                .sort((left, right) => left.sort - right.sort)
            const specialSwatches = recordValues(JSON.parse(specialSwatchText))
                .map(swatch => {
                    const resourceId = Number(swatch.ResourceID)
                    return {
                        id: Number(swatch.SepcialColorID),
                        name: translateTextMap(textMap, resourceNames.get(String(resourceId)) || ""),
                        resourceId,
                        materialName: String(swatch.LinkedMaterial ?? ""),
                        materialPath: String(swatch.MaterialPath ?? ""),
                    }
                })
                .sort((left, right) => left.id - right.id)
            const globalConstant = JSON.parse(globalConstantText) as Record<string, { ConstantValue?: unknown }>
            const maxColorParts = Number(globalConstant.CharColorPart?.ConstantValue) || 0
            const defaultColorId = Number(globalConstant.CharDefaultColor?.ConstantValue) || 0
            return [
                {
                    targetVar: "skinColorizeSwatches",
                    value: swatches,
                },
                {
                    targetVar: "skinColorizeSpecialSwatches",
                    value: specialSwatches,
                },
                {
                    targetVar: "skinColorizeMaxColorParts",
                    value: maxColorParts,
                },
                {
                    targetVar: "skinColorizeDefaultColorId",
                    value: defaultColorId,
                },
            ]
        },
        targetStem: "skin-colorize",
        targetVar: "skinColorizeSwatches",
    },
    {
        source: async () => {
            const [defenceText, ironSurvivalDungeonText] = await Promise.all([
                readFile(path.join(OUT_ROOT, "Defence.json"), "utf8"),
                readFile(path.join(OUT_ROOT, "IronSurvivalDungeon.json"), "utf8"),
            ])
            const defence = JSON.parse(defenceText) as Record<string, Record<string, unknown>>
            const dungeonIds = new Set(Object.keys(JSON.parse(ironSurvivalDungeonText) as Record<string, unknown>))
            const calamity: Record<number, Record<string, unknown>> = {}
            for (const [key, row] of Object.entries(defence)) {
                if (dungeonIds.has(key)) {
                    calamity[Number(key)] = row
                }
            }

            return [
                {
                    targetVar: "defenceData",
                    value: calamity,
                },
            ]
        },
        targetStem: "ironsurvival",
        targetVar: "defenceData",
    },
]

/**
 * 解析指定导出的 i18n 源模块。
 *
 * @returns 未指定时返回 null，指定时返回模块名集合
 */
function parseFileTypes(): Set<string> | null {
    const fileTypeIndex = Bun.argv.findIndex(arg => arg === "-f" || arg === "--file-types")
    if (fileTypeIndex < 0) {
        return null
    }

    const fileTypes: string[] = []
    for (const arg of Bun.argv.slice(fileTypeIndex + 1)) {
        if (arg.startsWith("-")) {
            break
        }
        fileTypes.push(arg)
    }
    if (fileTypes.length === 0) {
        throw new Error("-f 需要至少指定一个模块名，例如：-f Weapon")
    }

    const availableFileTypes = new Set(
        MAPPINGS.flatMap(mapping => (typeof mapping.source === "string" ? [mapping.source] : [mapping.targetStem]))
    )
    const unknownFileTypes = fileTypes.filter(fileType => !availableFileTypes.has(fileType))
    if (unknownFileTypes.length > 0) {
        throw new Error(`未知模块：${unknownFileTypes.join(", ")}`)
    }
    return new Set(fileTypes)
}

/**
 * 判断映射是否命中指定的源模块。
 *
 * @param mapping 数据映射
 * @param fileTypes 指定的模块名集合
 * @returns 是否应执行该映射
 */
function shouldProcessMapping(mapping: Mapping, fileTypes: Set<string> | null): boolean {
    if (fileTypes === null) {
        return true
    }
    // 字符串源按源模块名匹配，函数源按目标文件 stem 匹配
    if (typeof mapping.source === "string") {
        return fileTypes.has(mapping.source)
    }
    return fileTypes.has(mapping.targetStem)
}

type MonsterLevelDropRow = {
    BaseProbability: number[]
    EndTime: number
    MonsterLevel: number[]
    MonsterLevelDropId: number
    MonsterLevelDropView: number
    ProbabilityUp: number[]
    RewardId: number[]
    StartTime: number
}

type RougeConditionRow = {
    ConditionId: number
    ConditionLogic: "AND" | "OR"
    ConditionMap: Record<string, unknown>
    IsNot?: boolean
    Remark?: string
}

type RougeRoomCondition = {
    id: number
    logic: "AND" | "OR"
    map: Record<string, unknown>
    isNot?: boolean
    remark?: string
}

const SKIPPED_SOURCES = ["RegionPoint", "RewardView", "translation"]

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
 * 判断任意值是否为普通对象。
 * @param value 待判断的值。
 * @returns 是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * 将游戏导出的对象索引或对象数组统一为行数组。
 * @param value 游戏导出的 JSON 值。
 * @returns 对象行数组。
 */
function recordValues(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.filter(isRecord)
    return isRecord(value) ? Object.values(value).filter(isRecord) : []
}

/**
 * 读取本地化文本，缺失时保留原始 key。
 * @param textMap 本地化文本表。
 * @param key 文本 key。
 * @returns 本地化文本。
 */
function translateTextMap(textMap: Record<string, { TextMapContent?: string }>, key: string): string {
    return textMap[key]?.TextMapContent || key
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
 * 深度比较两个 JSON 兼容值是否完全一致（区分键顺序，保证文件向导出数据收敛）。
 * @param left 现有值。
 * @param right 导出值。
 * @returns 是否一致。
 */
function deepEqual(left: unknown, right: unknown): boolean {
    if (left === right) {
        return true
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]))
    }
    if (isRecord(left) && isRecord(right)) {
        const leftKeys = Object.keys(left)
        const rightKeys = Object.keys(right)
        // 键顺序也参与比较：顺序变化同样视为变更，避免文件长期与导出数据不同序
        return (
            leftKeys.length === rightKeys.length &&
            leftKeys.join("\u0000") === rightKeys.join("\u0000") &&
            leftKeys.every(key => deepEqual(left[key], right[key]))
        )
    }
    return false
}

/**
 * 从 AST 字面量节点还原 JS 值，用于与导出数据做语义比较。
 *
 * 目标文件由本工具生成并经 Biome 格式化，仅包含纯 JSON 数据字面量，
 * 遇到其他语法即视为无法比较并抛错。
 *
 * @param node 字面量表达式节点。
 * @returns 还原后的 JS 值。
 */
function literalToValue(node: ts.Node): unknown {
    if (ts.isArrayLiteralExpression(node)) {
        return node.elements.map(element => {
            if (ts.isOmittedExpression(element)) {
                throw new Error("数组字面量包含省略元素，无法还原值")
            }
            return literalToValue(element)
        })
    }
    if (ts.isObjectLiteralExpression(node)) {
        const result: Record<string, unknown> = {}
        for (const property of node.properties) {
            if (!ts.isPropertyAssignment(property)) {
                throw new Error(`对象字面量包含不支持的属性形式: ${ts.SyntaxKind[property.kind]}`)
            }
            const { name } = property
            if (!ts.isIdentifier(name) && !ts.isStringLiteral(name) && !ts.isNumericLiteral(name)) {
                throw new Error(`对象字面量包含不支持的属性名: ${ts.SyntaxKind[name.kind]}`)
            }
            result[name.text] = literalToValue(property.initializer)
        }
        return result
    }
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
        return ts.isNumericLiteral(node) ? Number(node.text) : node.text
    }
    // 负数字面量（如 -1）
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
        const operand = node.operand
        if (ts.isNumericLiteral(operand)) {
            return -Number(operand.text)
        }
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
        return true
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
        return false
    }
    if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.UndefinedKeyword) {
        return null
    }
    throw new Error(`不支持的字面量语法: ${ts.SyntaxKind[node.kind]}`)
}

/**
 * 根据变量名定位目标数组的替换区间对应的字面量节点。
 */
function findReplacementNode(sourceFile: ts.SourceFile, targetVar: string): ts.ArrayLiteralExpression | ts.ObjectLiteralExpression {
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
            return collectionNode
        }
    }
    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

/**
 * 根据变量名定位变量初始化表达式节点。
 */
function findVariableInitializerNode(sourceFile: ts.SourceFile, targetVar: string): ts.Expression {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) {
                continue
            }
            return declaration.initializer
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
 * 仅对本次实际写入的文件执行 Biome 格式化，避免全仓库扫描。
 * @param files 本次变更文件的相对路径列表。
 * @returns Biome 非零退出时抛出错误。
 */
async function formatWithBiome(files: string[]): Promise<void> {
    if (files.length === 0) {
        return
    }
    // 通过 process.execPath（即当前 bun 可执行文件）调用 `bun x biome`，规避 Windows 下 .cmd 垫片问题
    const proc = Bun.spawn([process.execPath, "x", "biome", "check", "--write", "--linter-enabled=false", ...files], {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
        throw new Error(`Biome 格式化失败，退出码 ${exitCode}`)
    }
}

/**
 * 执行导入。
 */
async function main() {
    const fileTypes = parseFileTypes()
    const grouped = new Map<string, Mapping[]>()
    for (const mapping of MAPPINGS) {
        if (typeof mapping.source === "function" || !shouldProcessMapping(mapping, fileTypes)) {
            continue
        }
        const list = grouped.get(mapping.targetStem) ?? []
        list.push(mapping)
        grouped.set(mapping.targetStem, list)
    }

    const updatedFiles: string[] = []
    // 因数据无变化而跳过的变量数量
    let skippedCount = 0

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
                const sourceValue = JSON.parse(jsonText)
                const parsed = mapping.postProcess?.(sourceValue) ?? sourceValue
                const targetVar = mapping.targetVars?.[locale] ?? mapping.targetVar
                const node = findReplacementNode(sourceFile, targetVar)
                // 语义 diff：文件现有值与导出数据一致时跳过
                if (deepEqual(literalToValue(node), parsed)) {
                    skippedCount++
                    continue
                }
                replacements.push({
                    start: node.getStart(sourceFile),
                    end: node.getEnd(),
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
        if (typeof mapping.source !== "function" || !shouldProcessMapping(mapping, fileTypes)) {
            continue
        }

        const targetFile = path.join(TARGET_DIR, `${mapping.targetStem}.data.ts`)
        const originalText = await readFile(targetFile, "utf-8")
        const sourceFile = ts.createSourceFile(targetFile, originalText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
        const generatedReplacements = await mapping.source()
        const replacements: Array<{ start: number; end: number; text: string }> = []
        for (const replacement of generatedReplacements) {
            const node = findVariableInitializerNode(sourceFile, replacement.targetVar)
            // 语义 diff：文件现有值与导出数据一致时跳过
            if (deepEqual(literalToValue(node), replacement.value)) {
                skippedCount++
                continue
            }
            replacements.push({
                start: node.getStart(sourceFile),
                end: node.getEnd(),
                text: formatTsValue(replacement.value, 0),
            })
        }

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
    if (skippedCount > 0) {
        console.log(`已跳过 ${skippedCount} 个无变化的变量（未落盘）`)
    }
    for (const file of updatedFiles) {
        console.log(`- ${file}`)
    }

    await formatWithBiome(updatedFiles)

    if (SKIPPED_SOURCES.length > 0) {
        console.log(`已跳过未对应到现有 data 文件的源表：${SKIPPED_SOURCES.join(", ")}`)
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
