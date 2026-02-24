import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import Fuse from "fuse.js"
import { z } from "zod"
import * as abyssModule from "../d/abyss.data"
import * as accessoryModule from "../d/accessory.data"
import * as achievementModule from "../d/achievement.data"
import * as autochessModule from "../d/autochess.data"
import * as buffModule from "../d/buff.data"
import * as charModule from "../d/char.data"
import * as charextEnModule from "../d/charext.en.data"
import * as charextFrModule from "../d/charext.fr.data"
import * as charextJpModule from "../d/charext.jp.data"
import * as charextKrModule from "../d/charext.kr.data"
import * as charextTcModule from "../d/charext.tc.data"
import * as charextModule from "../d/charext.data"
import * as charvoiceEnModule from "../d/charvoice.en.data"
import * as charvoiceJpModule from "../d/charvoice.jp.data"
import * as charvoiceKrModule from "../d/charvoice.kr.data"
import * as charvoiceModule from "../d/charvoice.data"
import * as convertModule from "../d/convert.data"
import * as draftModule from "../d/draft.data"
import * as dungeonModule from "../d/dungeon.data"
import * as dynquestModule from "../d/dynquest.data"
import * as effectModule from "../d/effect.data"
import * as fishModule from "../d/fish.data"
import * as hardbossModule from "../d/hardboss.data"
import * as headsculptureModule from "../d/headsculpture.data"
import * as jargonModule from "../d/jargon.data"
import * as levelupModule from "../d/levelup.data"
import * as mapModule from "../d/map.data"
import * as modModule from "../d/mod.data"
import * as monsterModule from "../d/monster.data"
import * as monstertagModule from "../d/monstertag.data"
import * as mountModule from "../d/mount.data"
import * as npcModule from "../d/npc.data"
import * as partytopicEnModule from "../d/partytopic.en.data"
import * as partytopicFrModule from "../d/partytopic.fr.data"
import * as partytopicJpModule from "../d/partytopic.jp.data"
import * as partytopicKrModule from "../d/partytopic.kr.data"
import * as partytopicTcModule from "../d/partytopic.tc.data"
import * as partytopicModule from "../d/partytopic.data"
import * as petModule from "../d/pet.data"
import * as playerModule from "../d/player.data"
import * as questEnModule from "../d/quest.en.data"
import * as questFrModule from "../d/quest.fr.data"
import * as questJpModule from "../d/quest.jp.data"
import * as questKrModule from "../d/quest.kr.data"
import * as questTcModule from "../d/quest.tc.data"
import * as questModule from "../d/quest.data"
import * as questchainModule from "../d/questchain.data"
import * as raidModule from "../d/raid.data"
import * as regionModule from "../d/region.data"
import * as reputationModule from "../d/reputation.data"
import * as resourceModule from "../d/resource.data"
import * as rewardModule from "../d/reward.data"
import * as shopModule from "../d/shop.data"
import * as storyLocaleModule from "../d/story-locale"
import * as subregionModule from "../d/subregion.data"
import * as titleModule from "../d/title.data"
import * as walnutModule from "../d/walnut.data"
import * as weaponModule from "../d/weapon.data"
import { DATA_TYPE_INTERFACE_DEFINITION_MAP } from "./type-definition-map"

const SERVER_VERSION = "0.2.0"
const DEFAULT_GRAPHQL_ENDPOINT = "https://api.dna-builder.cn/graphql"
const MISSION_GROUP_LABELS = ["角色", "武器", "魔之楔"] as const
const STORY_LOCALE_SAMPLES = ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "zh-TW"] as const
const DATA_TYPE_ENUM_VALUES = [
    "AbyssDungeon",
    "Buff",
    "Char",
    "CharExt",
    "CharVoice",
    "DBMap",
    "Draft",
    "Dungeon",
    "HardBoss",
    "Jargon",
    "Mod",
    "NPC",
    "PartyTopic",
    "Pet",
    "QuestStory",
    "Reward",
    "SubRegion",
    "Weapon",
] as const
const WHAT_IS_THIS_NAME_FIELDS = ["名称", "name", "title", "n"] as const
const WHAT_IS_THIS_DATASET_FIELD_CONFIG: Record<string, readonly string[]> = {
    mod: ["名称", "系列"],
    jargon: ["name", "alias", "desc", "type", "ref"],
}
const WHAT_IS_THIS_ALIAS_LIBRARY = {
    角色: { moduleIds: ["/local/char"], typeNames: ["Char"] },
    人物: { moduleIds: ["/local/char"], typeNames: ["Char"] },
    角色档案: { moduleIds: ["/local/charext"], typeNames: ["CharExt"] },
    角色语音: { moduleIds: ["/local/charvoice"], typeNames: ["CharVoice"] },
    武器: { moduleIds: ["/local/weapon"], typeNames: ["Weapon"] },
    魔之楔: { moduleIds: ["/local/mod"], typeNames: ["Mod"] },
    模组: { moduleIds: ["/local/mod"], typeNames: ["Mod"] },
    副本: { moduleIds: ["/local/dungeon"], typeNames: ["Dungeon"] },
    深渊: { moduleIds: ["/local/abyss"], typeNames: ["AbyssDungeon"] },
    任务: { moduleIds: ["/local/quest"], typeNames: ["QuestStory"] },
    光阴集: { moduleIds: ["/local/partytopic"], typeNames: ["PartyTopic"] },
    npc: { moduleIds: ["/local/npc"], typeNames: ["NPC"] },
    地图: { moduleIds: ["/local/map"], typeNames: ["DBMap"] },
    魔灵: { moduleIds: ["/local/pet"], typeNames: ["Pet"] },
    奖励: { moduleIds: ["/local/reward"], typeNames: ["Reward"] },
    buff: { moduleIds: ["/local/buff"], typeNames: ["Buff"] },
} as const
const WHAT_IS_THIS_VALUE_ALIAS_LIBRARY = {
    魔之楔: ["mod", "mods", "模组"],
    角色: ["角"],
    角色档案: ["档案"],
    角色语音: ["语音"],
    地图: ["地图点位"],
    丽蓓卡: ["水母"],
    琳恩: ["女枪"],
} as const

/**
 * 将数组导出转换为标准记录数组，并打上来源标签。
 * @param value 数组导出
 * @param tag 数据来源标签
 * @returns 标准化记录数组
 */
function fromArrayExport(value: unknown, tag: string): Record<string, unknown>[] {
    if (!Array.isArray(value)) return []

    return value.map((item, index) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
            return { __sourceTag: tag, ...(item as Record<string, unknown>) }
        }
        return { __sourceTag: tag, __index: index, value: item }
    })
}

/**
 * 将对象导出转换为标准记录数组。
 * @param value 对象导出
 * @param tag 数据来源标签
 * @returns 标准化记录数组
 */
function fromObjectExport(value: unknown, tag: string): Record<string, unknown>[] {
    if (!value || typeof value !== "object") return []
    if (Array.isArray(value)) return fromArrayExport(value, tag)

    return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
            return { __sourceTag: tag, __key: key, ...(item as Record<string, unknown>) }
        }
        return { __sourceTag: tag, __key: key, value: item }
    })
}

/**
 * 将 Map 导出转换为标准记录数组。
 * @param value Map 导出
 * @param tag 数据来源标签
 * @returns 标准化记录数组
 */
function fromMapExport(value: unknown, tag: string): Record<string, unknown>[] {
    if (!(value instanceof Map)) return []

    return Array.from(value.entries()).map(([key, item]) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
            return { __sourceTag: tag, __key: key, ...(item as Record<string, unknown>) }
        }
        return { __sourceTag: tag, __key: key, value: item }
    })
}

const LOCAL_DATASETS = {
    abyss: fromArrayExport(abyssModule.abyssDungeons, "abyss.dungeons"),
    accessory: [
        ...fromArrayExport(accessoryModule.charAccessoryData, "accessory.char"),
        ...fromArrayExport(accessoryModule.weaponAccessoryData, "accessory.weapon"),
        ...fromArrayExport(accessoryModule.weaponSkinData, "accessory.weaponSkin"),
    ],
    achievement: fromArrayExport(achievementModule.default, "achievement.default"),
    autochess: fromArrayExport(autochessModule.robotEquips, "autochess.robotEquips"),
    buff: fromArrayExport(buffModule.default, "buff.default"),
    char: fromArrayExport(charModule.default, "char.default"),
    charext: fromArrayExport(charextModule.charExtData, "charext.charExtData"),
    charext_en: fromArrayExport(charextEnModule.charExtData_en, "charext.en"),
    charext_fr: fromArrayExport(charextFrModule.charExtData_fr, "charext.fr"),
    charext_jp: fromArrayExport(charextJpModule.charExtData_jp, "charext.jp"),
    charext_kr: fromArrayExport(charextKrModule.charExtData_kr, "charext.kr"),
    charext_tc: fromArrayExport(charextTcModule.charExtData_tc, "charext.tc"),
    charvoice: fromArrayExport(charvoiceModule.charVoiceData, "charvoice.charVoiceData"),
    charvoice_en: fromArrayExport(charvoiceEnModule.charVoiceData_en, "charvoice.en"),
    charvoice_jp: fromArrayExport(charvoiceJpModule.charVoiceData_jp, "charvoice.jp"),
    charvoice_kr: fromArrayExport(charvoiceKrModule.charVoiceData_kr, "charvoice.kr"),
    convert: fromArrayExport(convertModule.modConvertData, "convert.modConvertData"),
    draft: fromArrayExport(draftModule.default, "draft.default"),
    dungeon: fromArrayExport(dungeonModule.default, "dungeon.default"),
    dynquest: fromArrayExport(dynquestModule.default, "dynquest.default"),
    effect: fromArrayExport(effectModule.default, "effect.default"),
    fish: [...fromArrayExport(fishModule.fishs, "fish.fishs"), ...fromArrayExport(fishModule.fishingSpots, "fish.fishingSpots")],
    hardboss: [
        ...fromMapExport(hardbossModule.hardBossMap, "hardboss.hardBossMap"),
        ...fromObjectExport(hardbossModule.dynamicRewardMap, "hardboss.dynamicRewardMap"),
    ],
    headsculpture: fromArrayExport(headsculptureModule.headSculptureData, "headsculpture.headSculptureData"),
    jargon: fromArrayExport(jargonModule.jargonData, "jargon.jargonData"),
    levelup: [
        ...fromObjectExport(levelupModule.levelUpResource, "levelup.levelUpResource"),
        ...fromArrayExport(levelupModule.weaponLevelUpExpCost, "levelup.weaponLevelUpExpCost"),
        ...fromArrayExport(levelupModule.charLevelUpExpCost, "levelup.charLevelUpExpCost"),
        { __sourceTag: "levelup.CashToExpRate", value: levelupModule.CashToExpRate },
    ],
    map: [...fromArrayExport(mapModule.mapLocalData, "map.mapLocalData"), ...fromObjectExport(mapModule.mapCache, "map.mapCache")],
    mod: fromArrayExport(modModule.default, "mod.default"),
    monster: fromArrayExport(monsterModule.default, "monster.default"),
    monstertag: fromArrayExport(monstertagModule.monsterTagData, "monstertag.monsterTagData"),
    mount: fromArrayExport(mountModule.mountData, "mount.mountData"),
    npc: fromArrayExport(npcModule.npcData, "npc.npcData"),
    partytopic: fromArrayExport(partytopicModule.partyTopicData, "partytopic.partyTopicData"),
    partytopic_en: fromArrayExport(partytopicEnModule.partyTopicData_en, "partytopic.en"),
    partytopic_fr: fromArrayExport(partytopicFrModule.partyTopicData_fr, "partytopic.fr"),
    partytopic_jp: fromArrayExport(partytopicJpModule.partyTopicData_jp, "partytopic.jp"),
    partytopic_kr: fromArrayExport(partytopicKrModule.partyTopicData_kr, "partytopic.kr"),
    partytopic_tc: fromArrayExport(partytopicTcModule.partyTopicData_tc, "partytopic.tc"),
    pet: [...fromArrayExport(petModule.default, "pet.default"), ...fromArrayExport(petModule.petEntrys, "pet.petEntrys")],
    player: [
        ...fromArrayExport(playerModule.PlayerLevelMaxExp, "player.PlayerLevelMaxExp"),
        ...fromObjectExport(playerModule.ExpPerReason, "player.ExpPerReason"),
        ...fromObjectExport(playerModule.ExtraExpInputMax, "player.ExtraExpInputMax"),
    ],
    quest: fromArrayExport(questModule.questData, "quest.questData"),
    quest_en: fromArrayExport(questEnModule.questData_en, "quest.en"),
    quest_fr: fromArrayExport(questFrModule.questData_fr, "quest.fr"),
    quest_jp: fromArrayExport(questJpModule.questData_jp, "quest.jp"),
    quest_kr: fromArrayExport(questKrModule.questData_kr, "quest.kr"),
    quest_tc: fromArrayExport(questTcModule.questData_tc, "quest.tc"),
    questchain: fromArrayExport(questchainModule.questChainData, "questchain.questChainData"),
    raid: [
        ...fromArrayExport(raidModule.RaidCalculation, "raid.RaidCalculation"),
        ...fromObjectExport(raidModule.RaidBuff, "raid.RaidBuff"),
        ...fromObjectExport(raidModule.RaidDungeon, "raid.RaidDungeon"),
        ...fromObjectExport(raidModule.RaidSeason, "raid.RaidSeason"),
        ...fromObjectExport(raidModule.PreRaidRank, "raid.PreRaidRank"),
    ],
    region: fromArrayExport(regionModule.default, "region.default"),
    reputation: fromArrayExport(reputationModule.default, "reputation.default"),
    resource: fromArrayExport(resourceModule.resourceData, "resource.resourceData"),
    reward: fromArrayExport(rewardModule.default, "reward.default"),
    shop: [
        ...fromArrayExport(shopModule.shopData, "shop.shopData"),
        ...fromMapExport(shopModule.modShopSourceMap, "shop.modShopSourceMap"),
        ...fromMapExport(shopModule.weaponShopSourceMap, "shop.weaponShopSourceMap"),
        ...fromMapExport(shopModule.draftShopSourceMap, "shop.draftShopSourceMap"),
    ],
    story_locale: fromArrayExport(
        STORY_LOCALE_SAMPLES.map(language => {
            const locale = storyLocaleModule.resolveStoryLocaleBySetting(language)
            const suffix = locale === "zh" ? "" : `_${locale}`
            return {
                language,
                locale,
                partytopicModuleId: `/local/partytopic${suffix}`,
                questModuleId: `/local/quest${suffix}`,
            }
        }),
        "story-locale.mapping"
    ),
    subregion: fromArrayExport(subregionModule.subRegionData, "subregion.subRegionData"),
    title: fromArrayExport(titleModule.titleData, "title.titleData"),
    walnut: [
        ...fromArrayExport(walnutModule.default, "walnut.default"),
        ...fromMapExport(walnutModule.walnutMap, "walnut.walnutMap"),
        ...fromMapExport(walnutModule.walnutRewardMap, "walnut.walnutRewardMap"),
    ],
    weapon: fromArrayExport(weaponModule.default, "weapon.default"),
} as const

type DatasetName = keyof typeof LOCAL_DATASETS
type ModuleSource = "local"

type NodeProcessLike = {
    argv?: string[]
    env?: Record<string, string | undefined>
    exit?: (code?: number) => never
}

type CliOptions = {
    graphqlEndpoint: string
}

type SearchDocument = {
    dataset: DatasetName
    index: number
    rawRecord: Record<string, unknown>
    record: Record<string, unknown>
    searchText: string
    primaryName: string
    primaryId: string
}

type ScopedSearchDocument = SearchDocument & {
    scopedText: string
}

type ModuleMeta = {
    moduleId: string
    source: ModuleSource
    name: string
    description: string
    tags: string[]
    recordCount?: number
}

type ModuleResolveDocument = ModuleMeta & {
    searchText: string
}

type ModuleSelection = {
    source: "local"
    dataset: DatasetName
}

type QueryResultItem = {
    dataset: DatasetName
    index: number
    id: string
    name: string
    score: number | null
    preview: Record<string, unknown>
    record: Record<string, unknown>
    rawRecord?: Record<string, unknown>
}

type AllModuleQueryResultItem = QueryResultItem & {
    moduleId: string
}

type AllModuleSearchDocument = SearchDocument & {
    scopedText: string
}

type DataTypeName = (typeof DATA_TYPE_ENUM_VALUES)[number]

type DataTypeDefinitionMeta = {
    filePath: string
    interfaceName: string
    moduleIds: string[]
    description: string
}

type WhatIsThisAliasEntry = {
    moduleIds: readonly string[]
    typeNames?: readonly DataTypeName[]
}

type WhatIsThisDocument = {
    dataset: DatasetName
    moduleId: string
    typeNames: DataTypeName[]
    keyword: string
    searchText: string
    source: "alias" | "name" | "module"
}

type WhatIsThisCandidate = {
    moduleId: string
    dataset: DatasetName
    typeNames: DataTypeName[]
    score: number | null
    hitCount: number
    sources: Array<WhatIsThisDocument["source"]>
    matchedKeywords: string[]
}

type GraphQLMissionRecord = {
    id: number
    server: string
    missions: string[][]
    createdAt?: string | null
}

type GraphQLMissionsLatestResult = {
    latest: GraphQLMissionRecord | null
}

type StructuredMissions = {
    角色: string[]
    武器: string[]
    魔之楔: string[]
}

const DATA_TYPE_DEFINITION_META: Record<DataTypeName, DataTypeDefinitionMeta> = {
    AbyssDungeon: {
        filePath: "src/data/d/abyss.data.ts",
        interfaceName: "AbyssDungeon",
        moduleIds: ["/local/abyss"],
        description: "深渊副本结构定义",
    },
    Buff: {
        filePath: "src/data/data-types.ts",
        interfaceName: "Buff",
        moduleIds: ["/local/buff"],
        description: "Buff 数据结构定义",
    },
    Char: {
        filePath: "src/data/data-types.ts",
        interfaceName: "Char",
        moduleIds: ["/local/char"],
        description: "角色基础数据结构定义",
    },
    CharExt: {
        filePath: "src/data/d/charext.data.ts",
        interfaceName: "CharExt",
        moduleIds: [
            "/local/charext",
            "/local/charext_en",
            "/local/charext_fr",
            "/local/charext_jp",
            "/local/charext_kr",
            "/local/charext_tc",
        ],
        description: "角色档案数据结构定义",
    },
    CharVoice: {
        filePath: "src/data/d/charvoice.data.ts",
        interfaceName: "CharVoice",
        moduleIds: ["/local/charvoice", "/local/charvoice_en", "/local/charvoice_jp", "/local/charvoice_kr"],
        description: "角色语音数据结构定义",
    },
    DBMap: {
        filePath: "src/data/d/map.data.ts",
        interfaceName: "DBMap",
        moduleIds: ["/local/map"],
        description: "地图结构定义",
    },
    Draft: {
        filePath: "src/data/d/draft.data.ts",
        interfaceName: "Draft",
        moduleIds: ["/local/draft"],
        description: "图纸数据结构定义",
    },
    Dungeon: {
        filePath: "src/data/d/dungeon.data.ts",
        interfaceName: "Dungeon",
        moduleIds: ["/local/dungeon", "/local/raid"],
        description: "副本数据结构定义",
    },
    HardBoss: {
        filePath: "src/data/d/hardboss.data.ts",
        interfaceName: "HardBoss",
        moduleIds: ["/local/hardboss"],
        description: "梦魇残声（周本）结构定义",
    },
    Jargon: {
        filePath: "src/data/d/jargon.data.ts",
        interfaceName: "Jargon",
        moduleIds: ["/local/jargon"],
        description: "术语词条结构定义",
    },
    Mod: {
        filePath: "src/data/data-types.ts",
        interfaceName: "Mod",
        moduleIds: ["/local/mod"],
        description: "魔之楔数据结构定义",
    },
    NPC: {
        filePath: "src/data/d/npc.data.ts",
        interfaceName: "NPC",
        moduleIds: ["/local/npc"],
        description: "NPC 数据结构定义",
    },
    PartyTopic: {
        filePath: "src/data/d/partytopic.data.ts",
        interfaceName: "PartyTopic",
        moduleIds: [
            "/local/partytopic",
            "/local/partytopic_en",
            "/local/partytopic_fr",
            "/local/partytopic_jp",
            "/local/partytopic_kr",
            "/local/partytopic_tc",
        ],
        description: "光阴集数据结构定义",
    },
    Pet: {
        filePath: "src/data/d/pet.data.ts",
        interfaceName: "Pet",
        moduleIds: ["/local/pet"],
        description: "魔灵数据结构定义",
    },
    QuestStory: {
        filePath: "src/data/d/quest.data.ts",
        interfaceName: "QuestStory",
        moduleIds: ["/local/quest", "/local/quest_en", "/local/quest_fr", "/local/quest_jp", "/local/quest_kr", "/local/quest_tc"],
        description: "任务剧情结构定义",
    },
    Reward: {
        filePath: "src/data/data-types.ts",
        interfaceName: "Reward",
        moduleIds: ["/local/reward"],
        description: "奖励组结构定义",
    },
    SubRegion: {
        filePath: "src/data/d/subregion.data.ts",
        interfaceName: "SubRegion",
        moduleIds: ["/local/subregion"],
        description: "子区域结构定义",
    },
    Weapon: {
        filePath: "src/data/data-types.ts",
        interfaceName: "Weapon",
        moduleIds: ["/local/weapon"],
        description: "武器结构定义",
    },
}

const datasetDocumentCache = new Map<DatasetName, SearchDocument[]>()
let moduleResolverFuseCache: Fuse<ModuleResolveDocument> | null = null
let rewardGroupMapCache: Map<number, Record<string, unknown>> | null = null
const rewardDetailsCache = new Map<number, Record<string, unknown> | null>()
let monsterNameMapCache: Map<number, string> | null = null
let charNameMapCache: Map<number, string> | null = null
let abyssBuffMapCache: Map<number, Record<string, unknown>> | null = null
let abyssPairBaseSetCache: Set<number> | null = null
let whatIsThisFuseCache: Fuse<WhatIsThisDocument> | null = null
let whatIsThisDocumentsCache: WhatIsThisDocument[] | null = null

/**
 * 获取 Node.js 进程对象（避免依赖 Node 类型定义）。
 * @returns 轻量级 process 对象或 undefined
 */
function getNodeProcess(): NodeProcessLike | undefined {
    return (globalThis as { process?: NodeProcessLike }).process
}

/**
 * 读取命令行参数，并允许通过环境变量覆盖 GraphQL 地址。
 * @param argv 命令行参数数组
 * @param env 环境变量集合
 * @returns 解析后的 CLI 配置
 */
function parseCliOptions(argv: string[], env: Record<string, string | undefined>): CliOptions {
    let graphqlEndpoint = env.DNA_MCP_GRAPHQL_ENDPOINT || DEFAULT_GRAPHQL_ENDPOINT

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] !== "--graphql-endpoint" && argv[i] !== "--graphqlEndpoint") {
            continue
        }
        const value = argv[i + 1]
        if (!value || value.startsWith("--")) {
            continue
        }
        graphqlEndpoint = value
        i++
    }

    return { graphqlEndpoint }
}

/**
 * 将任意值转换为普通字符串。
 * @param value 输入值
 * @returns 字符串值
 */
function toSimpleString(value: unknown): string {
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    return ""
}

/**
 * 递归提取对象中的可搜索文本。
 * @param value 当前值
 * @param depth 当前递归层数
 * @param visited 循环引用去重集合
 * @returns 文本片段数组
 */
function collectSearchText(value: unknown, depth = 0, visited: Set<unknown> = new Set()): string[] {
    if (value === null || value === undefined) return []
    if (depth > 4) return []

    const simple = toSimpleString(value)
    if (simple) return [simple]

    if (typeof value !== "object") return []
    if (visited.has(value)) return []
    visited.add(value)

    if (Array.isArray(value)) {
        return value.slice(0, 80).flatMap(item => collectSearchText(item, depth + 1, visited))
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(0, 100)
    return entries.flatMap(([key, item]) => [key, ...collectSearchText(item, depth + 1, visited)])
}

/**
 * 解析数字数组，忽略非法值。
 * @param value 原始值
 * @returns 数字数组
 */
function toNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return []
    return value.map(item => (typeof item === "number" ? item : Number(item))).filter(item => Number.isFinite(item))
}

/**
 * 获取奖励类型的中文文本。
 * @param type 奖励类型
 * @returns 中文类型文本
 */
function getRewardTypeText(type: string): string {
    const typeMap: Record<string, string> = {
        Char: "角色",
        CharAccessory: "角色饰品",
        Drop: "掉落物",
        HeadFrame: "头像框",
        HeadSculpture: "头像",
        Mod: "魔之楔",
        Mount: "载具",
        Draft: "图纸",
        Pet: "魔灵",
        Resource: "资源",
        Reward: "奖励组",
        Skin: "角色皮肤",
        Title: "称号",
        TitleFrame: "称号框",
        Walnut: "密函",
        Weapon: "武器",
        WeaponAccessory: "武器饰品",
        WeaponSkin: "武器皮肤",
    }
    return typeMap[type] || type
}

/**
 * 获取掉落模式的中文文本。
 * @param mode 掉落模式
 * @returns 中文模式文本
 */
function getDropModeText(mode: string): string {
    const modeMap: Record<string, string> = {
        Independent: "独立",
        Weight: "权重",
        Fixed: "固定",
        Gender: "性别",
        Level: "等级",
        Once: "一次",
        Sequence: "序列",
    }
    return modeMap[mode] || mode
}

/**
 * 获取动态奖励状态文本（对齐 DB 页面逻辑）。
 * @param startTime 开始时间（秒级时间戳）
 * @param endTime 结束时间（秒级时间戳）
 * @returns 状态文本
 */
function getRewardStatusText(startTime: number, endTime: number): string {
    const now = Math.floor(Date.now() / 1000)
    if (now < startTime) return "未开始"
    if (now > endTime) return "已结束"
    return "进行中"
}

/**
 * 判断对象是否为周本动态奖励项。
 * @param value 待判断值
 * @returns 是否为动态奖励项
 */
function isHardbossDynamicRewardItem(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const item = value as Record<string, unknown>
    return (
        Number.isFinite(Number(item.DynamicRewardId)) &&
        Number.isFinite(Number(item.RewardView)) &&
        Number.isFinite(Number(item.StartTime)) &&
        Number.isFinite(Number(item.EndTime))
    )
}

/**
 * 合并周本动态奖励时间段（相同 RewardId 连续项合并）。
 * @param rewards 动态奖励列表
 * @returns 合并后的奖励列表
 */
function mergeHardbossDynamicRewards(rewards: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    if (rewards.length === 0) return []

    const sortedRewards = [...rewards].sort((a, b) => Number(a.Index) - Number(b.Index))
    const merged: Array<Record<string, unknown>> = []
    let current: Record<string, unknown> = { ...sortedRewards[0] }

    for (let i = 1; i < sortedRewards.length; i++) {
        const next = sortedRewards[i]
        if (Number(next.RewardId) === Number(current.RewardId)) {
            current.EndTime = next.EndTime
        } else {
            merged.push(current)
            current = { ...next }
        }
    }
    merged.push(current)

    return merged
}

/**
 * 根据周本动态奖励组 ID 提取并合并动态奖励列表。
 * @param dynamicRewardId 动态奖励组 ID
 * @returns 合并后的动态奖励列表
 */
function getHardbossMergedDynamicRewards(dynamicRewardId: number): Array<Record<string, unknown>> {
    const dynamicRewardMapRaw = hardbossModule.dynamicRewardMap as unknown
    if (!dynamicRewardMapRaw || typeof dynamicRewardMapRaw !== "object") return []

    const group = (dynamicRewardMapRaw as Record<string, unknown>)[String(dynamicRewardId)]
    if (!group || typeof group !== "object" || Array.isArray(group)) return []

    const rewards = Object.values(group)
        .filter(isHardbossDynamicRewardItem)
        .map(item => ({ ...item }))
    return mergeHardbossDynamicRewards(rewards)
}

/**
 * 构建奖励组映射表，用于递归展开 Reward 类型。
 * @returns 奖励组映射
 */
function getRewardGroupMap(): Map<number, Record<string, unknown>> {
    if (rewardGroupMapCache) return rewardGroupMapCache

    const map = new Map<number, Record<string, unknown>>()
    const rewardRecords = toRecordList(LOCAL_DATASETS.reward)
    rewardRecords.forEach(record => {
        const id = Number(record.id)
        if (Number.isFinite(id)) {
            map.set(id, record)
        }
    })
    rewardGroupMapCache = map
    return map
}

/**
 * 递归展开奖励树（与 DB 页面逻辑保持一致）。
 * @param rewardId 奖励组 ID
 * @param visited 已访问奖励 ID，防止循环
 * @param parentProbability 父节点概率
 * @param isRoot 是否根节点
 * @returns 展开的奖励树
 */
function getRewardDetails(
    rewardId: number,
    visited: Set<number> = new Set(),
    parentProbability = 1,
    isRoot = true
): Record<string, unknown> | null {
    if (rewardDetailsCache.has(rewardId) && isRoot && visited.size === 0) {
        return rewardDetailsCache.get(rewardId) || null
    }

    if (visited.has(rewardId)) return null
    visited.add(rewardId)

    const rewardGroup = getRewardGroupMap().get(rewardId)
    if (!rewardGroup) return null

    const currentDropMode = toSimpleString(rewardGroup.m)
    const childSource = Array.isArray(rewardGroup.child) ? (rewardGroup.child as Array<Record<string, unknown>>) : []
    const childRewards: Array<Record<string, unknown>> = []

    childSource.forEach(item => {
        const itemType = toSimpleString(item.t)
        const itemId = Number(item.id)
        if (itemType === "Reward" && Number.isFinite(itemId)) {
            const nested = getRewardDetails(itemId, visited, Number(item.p ?? 1), false)
            if (nested) {
                childRewards.push(nested)
            }
            return
        }

        const entry: Record<string, unknown> = {
            id: item.id,
            t: item.t,
            typeText: getRewardTypeText(toSimpleString(item.t)),
            c: item.c,
            p: item.p ?? 0,
            m: currentDropMode,
            dropModeText: getDropModeText(currentDropMode),
            n: item.n,
        }
        if (item.d) entry.d = item.d
        if (item.dp) entry.dp = item.dp
        childRewards.push(entry)
    })

    const result: Record<string, unknown> = {
        id: rewardId,
        t: "Reward",
        typeText: "奖励组",
        p: parentProbability,
        m: currentDropMode,
        dropModeText: getDropModeText(currentDropMode),
        child: childRewards,
    }

    if (isRoot) {
        const totalP = childRewards.reduce((sum, child) => sum + Number(child.p || 0), 0)
        if (currentDropMode === "Sequence") result.totalP = totalP

        /**
         * 递归计算实际概率与期望次数。
         * @param node 当前节点
         * @param parentPP 父级概率
         */
        function calculatePP(node: Record<string, unknown>, parentPP: number): void {
            const nodeChild = Array.isArray(node.child) ? (node.child as Array<Record<string, unknown>>) : []
            if (nodeChild.length === 0) {
                node.times = parentPP > 0 ? 1 / parentPP : null
                return
            }

            const childTotalP = nodeChild.reduce((sum, child) => sum + Number(child.p || 0), 0)
            if (currentDropMode === "Sequence") node.totalP = childTotalP
            nodeChild.forEach(child => {
                const currentPP = childTotalP > 0 ? parentPP * (Number(child.p || 0) / childTotalP) : 0
                child.pp = currentPP
                calculatePP(child, currentPP)
            })
        }

        childRewards.forEach(child => {
            const pp = totalP > 0 ? Number(child.p || 0) / totalP : 0
            child.pp = pp
            calculatePP(child, pp)
        })
    }

    if (isRoot && visited.size === 1) {
        rewardDetailsCache.set(rewardId, result)
    }

    return result
}

/**
 * 递归收集奖励树中的叶子奖励名称。
 * @param reward 奖励树节点
 * @param names 名称集合
 * @returns 名称列表
 */
function collectRewardLeafNames(reward: Record<string, unknown> | null, names: Set<string> = new Set()): string[] {
    if (!reward) return []
    const child = Array.isArray(reward.child) ? (reward.child as Array<Record<string, unknown>>) : []
    child.forEach(item => {
        const itemType = toSimpleString(item.t)
        if (itemType === "Reward") {
            collectRewardLeafNames(item, names)
            return
        }
        const name = toSimpleString(item.n)
        if (name) {
            names.add(name)
        }
    })
    return [...names]
}

/**
 * 构建怪物名称索引。
 * @returns 怪物 ID 到名称映射
 */
function getMonsterNameMap(): Map<number, string> {
    if (monsterNameMapCache) return monsterNameMapCache

    const map = new Map<number, string>()
    toRecordList(LOCAL_DATASETS.monster).forEach(record => {
        const id = Number(record.id)
        const name = toSimpleString(record.n || record.name)
        if (Number.isFinite(id) && name) {
            map.set(id, name)
        }
    })
    monsterNameMapCache = map
    return map
}

/**
 * 构建角色名称索引。
 * @returns 角色 ID 到名称映射
 */
function getCharNameMap(): Map<number, string> {
    if (charNameMapCache) return charNameMapCache

    const map = new Map<number, string>()
    toRecordList(LOCAL_DATASETS.char).forEach(record => {
        const id = Number(record.id)
        const name = toSimpleString(record.名称 || record.name)
        if (Number.isFinite(id) && name) {
            map.set(id, name)
        }
    })
    charNameMapCache = map
    return map
}

/**
 * 构建深渊 Buff 索引。
 * @returns Buff ID 到 Buff 对象映射
 */
function getAbyssBuffMap(): Map<number, Record<string, unknown>> {
    if (abyssBuffMapCache) return abyssBuffMapCache

    const map = new Map<number, Record<string, unknown>>()
    const abyssBuffs = Array.isArray(abyssModule.abyssBuffs) ? (abyssModule.abyssBuffs as unknown as Array<Record<string, unknown>>) : []
    abyssBuffs.forEach(buff => {
        const id = Number(buff.id)
        if (Number.isFinite(id)) {
            map.set(id, buff)
        }
    })
    abyssBuffMapCache = map
    return map
}

/**
 * 构建深渊双边关卡基准集合（用于左右标记）。
 * @returns 基准 ID 集合
 */
function getAbyssPairBaseSet(): Set<number> {
    if (abyssPairBaseSetCache) return abyssPairBaseSetCache

    const set = new Set<number>()
    const abyssDungeons = Array.isArray(abyssModule.abyssDungeons)
        ? (abyssModule.abyssDungeons as unknown as Array<Record<string, unknown>>)
        : []
    abyssDungeons.forEach(item => {
        const id = Number(item.id)
        if (Number.isFinite(id)) {
            set.add(id - (id % 10))
        }
    })
    abyssPairBaseSetCache = set
    return set
}

/**
 * 获取深渊奖励分组文本。
 * @param art 奖励标题
 * @returns 分组文本
 */
function getAbyssGroupName(art: string): string {
    const map: Record<string, string> = {
        奖励进度·经典剧目: "经典剧目",
        奖励进度·热映剧目: "热映剧目",
        奖励进度·不朽剧目: "不朽剧目",
    }
    return map[art] || "经典剧目"
}

/**
 * 计算深渊关卡文本等级（含左右侧）。
 * @param abyssId 深渊关卡 ID
 * @returns 等级文本
 */
function getAbyssLevelLabel(abyssId: number): string {
    if (!Number.isFinite(abyssId)) return ""

    const base = abyssId - (abyssId % 10)
    const hasRight = getAbyssPairBaseSet().has(base + 2)
    const level = Math.trunc((abyssId / 10) % 10)
    if (!hasRight) return String(level)
    return `${level}${abyssId % 10 === 2 ? " 右" : " 左"}`
}

/**
 * 将任意数据统一为记录列表。
 * @param raw 原始数据
 * @returns 记录对象数组
 */
function toRecordList(raw: unknown): Record<string, unknown>[] {
    if (Array.isArray(raw)) {
        return raw.map((item, index) => {
            if (item && typeof item === "object" && !Array.isArray(item)) {
                return item as Record<string, unknown>
            }
            return { value: item, __index: index }
        })
    }

    if (raw && typeof raw === "object") {
        return Object.entries(raw as Record<string, unknown>).map(([key, value]) => {
            if (value && typeof value === "object" && !Array.isArray(value)) {
                return { __key: key, ...(value as Record<string, unknown>) }
            }
            return { __key: key, value }
        })
    }

    return [{ value: raw }]
}

/**
 * 获取数据集的原始记录列表（按模块定制）。
 * @param dataset 数据集名
 * @returns 原始记录数组
 */
function getDatasetRawRecords(dataset: DatasetName): Record<string, unknown>[] {
    return [...LOCAL_DATASETS[dataset]]
}

/**
 * 生成副本奖励名称摘要（对齐 DB 页面逻辑）。
 * @param record 副本记录
 * @returns 奖励名称摘要
 */
function getDungeonRewardSummary(record: Record<string, unknown>): string {
    const rewardIds = toNumberArray(record.r)
    const specialRewardIds = toNumberArray(record.sr)
    const specialNames = specialRewardIds.flatMap(id => collectRewardLeafNames(getRewardDetails(id)))
    const normalNames = rewardIds.flatMap(id => collectRewardLeafNames(getRewardDetails(id)))

    const result: string[] = []
    if (specialNames.length > 0) {
        result.push(specialNames[0]!)
    }
    const neededNormals = specialNames.length > 0 ? 2 : 3
    for (let i = 0; i < neededNormals && i < normalNames.length; i++) {
        result.push(normalNames[i]!)
    }
    const summary = result.slice(0, 3).join("、")
    const hasMore = result.length > 3 || specialNames.length > 1 || normalNames.length > neededNormals
    return hasMore ? `${summary}等` : summary
}

/**
 * 解压并补充 Reward 记录。
 * @param record 原始记录
 * @returns 解析后记录
 */
function normalizeRewardRecord(record: Record<string, unknown>): Record<string, unknown> {
    const id = Number(record.id)
    const details = Number.isFinite(id) ? getRewardDetails(id) : null
    return {
        ...record,
        typeText: getRewardTypeText(toSimpleString(record.t)),
        dropModeText: getDropModeText(toSimpleString(record.m)),
        details,
        leafRewardNames: collectRewardLeafNames(details),
    }
}

/**
 * 解压并补充 Dungeon 记录。
 * @param record 原始记录
 * @returns 解析后记录
 */
function normalizeDungeonRecord(record: Record<string, unknown>): Record<string, unknown> {
    const monsterMap = getMonsterNameMap()
    const rewardIds = toNumberArray(record.r)
    const specialRewardIds = toNumberArray(record.sr)
    const monsterIds = toNumberArray(record.m)
    const specialMonsterIds = toNumberArray(record.sm)

    return {
        ...record,
        monsterNames: monsterIds.map(id => monsterMap.get(id) || `ID:${id}`),
        specialMonsterNames: specialMonsterIds.map(id => monsterMap.get(id) || `ID:${id}`),
        rewardsResolved: rewardIds.map(id => ({
            id,
            details: getRewardDetails(id),
        })),
        specialRewardsResolved: specialRewardIds.map(id => ({
            id,
            details: getRewardDetails(id),
        })),
        rewardSummary: getDungeonRewardSummary(record),
    }
}

/**
 * 解压并补充 Abyss 记录。
 * @param record 原始记录
 * @returns 解析后记录
 */
function normalizeAbyssRecord(record: Record<string, unknown>): Record<string, unknown> {
    const monsterMap = getMonsterNameMap()
    const charMap = getCharNameMap()
    const buffMap = getAbyssBuffMap()

    const abyssId = Number(record.id)
    const monsterIds = toNumberArray(record.m)
    const buffIds = toNumberArray(record.b)
    const rewardList = Array.isArray(record.arl) ? (record.arl as Array<Record<string, unknown>>) : []
    const cid = Number(record.cid)
    const art = toSimpleString(record.art)

    return {
        ...record,
        dungeonName: `${getAbyssGroupName(art)} ${getAbyssLevelLabel(abyssId)}`.trim(),
        groupName: getAbyssGroupName(art),
        levelLabel: getAbyssLevelLabel(abyssId),
        cname: Number.isFinite(cid) ? charMap.get(cid) || record.cname : record.cname,
        monsterNames: monsterIds.map(id => monsterMap.get(id) || `ID:${id}`),
        buffsResolved: buffIds.map(id => buffMap.get(id)).filter(Boolean),
        rewardsResolved: rewardList.map(item => {
            const rewardId = Number(item.r)
            const addonId = Number(item.a)
            const rewardDetails = Number.isFinite(rewardId) ? getRewardDetails(rewardId) : null
            return {
                ...item,
                rewardDetails,
                addonDetails: Number.isFinite(addonId) ? getRewardDetails(addonId) : null,
                dropModeText: getDropModeText(toSimpleString(rewardDetails?.m)),
            }
        }),
    }
}

/**
 * 解压并补充 HardBoss（周本）记录。
 * @param record 原始记录
 * @returns 解析后记录
 */
function normalizeHardbossRecord(record: Record<string, unknown>): Record<string, unknown> {
    const sourceTag = toSimpleString(record.__sourceTag)
    const monsterMap = getMonsterNameMap()

    /**
     * 将动态奖励列表补充奖励树展开、掉落模式与状态文本。
     * @param rewards 动态奖励列表
     * @returns 补充后的动态奖励列表
     */
    function enrichDynamicRewards(rewards: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
        return rewards.map(item => {
            const rewardView = Number(item.RewardView)
            const rewardDetails = Number.isFinite(rewardView) ? getRewardDetails(rewardView) : null
            return {
                ...item,
                rewardDetails,
                dropModeText: getDropModeText(toSimpleString(rewardDetails?.m)),
                rewardStatus: getRewardStatusText(Number(item.StartTime), Number(item.EndTime)),
            }
        })
    }

    // Boss 主记录：展开每个难度的动态奖励。
    if (sourceTag === "hardboss.hardBossMap" || Array.isArray(record.diff)) {
        const diff = Array.isArray(record.diff) ? (record.diff as Array<Record<string, unknown>>) : []
        const diffResolved = diff.map(item => {
            const dynamicRewardId = Number(item.r)
            const dynamicRewards = Number.isFinite(dynamicRewardId) ? getHardbossMergedDynamicRewards(dynamicRewardId) : []
            return {
                ...item,
                dynamicRewards: enrichDynamicRewards(dynamicRewards),
            }
        })

        const mid = Number(record.mid)
        return {
            ...record,
            monsterName: Number.isFinite(mid) ? monsterMap.get(mid) || `ID:${mid}` : null,
            diffResolved,
        }
    }

    // 动态奖励组记录：将对象值还原为奖励列表并展开。
    if (sourceTag === "hardboss.dynamicRewardMap") {
        const dynamicRewards = Object.values(record)
            .filter(isHardbossDynamicRewardItem)
            .map(item => ({ ...item }))
        const mergedDynamicRewards = mergeHardbossDynamicRewards(dynamicRewards)
        return {
            ...record,
            dynamicRewards: enrichDynamicRewards(mergedDynamicRewards),
        }
    }

    return record
}

/**
 * 按数据集类型对记录做业务解压。
 * @param dataset 数据集名
 * @param record 原始记录
 * @returns 解析后的记录
 */
function normalizeLocalRecordByDataset(dataset: DatasetName, record: Record<string, unknown>): Record<string, unknown> {
    if (dataset === "reward") {
        return normalizeRewardRecord(record)
    }
    if (dataset === "dungeon") {
        return normalizeDungeonRecord(record)
    }
    if (dataset === "abyss") {
        return normalizeAbyssRecord(record)
    }
    if (dataset === "raid") {
        return normalizeDungeonRecord(record)
    }
    if (dataset === "hardboss") {
        return normalizeHardbossRecord(record)
    }
    return record
}

/**
 * 提取记录的主名称。
 * @param record 数据记录
 * @returns 主名称
 */
function pickPrimaryName(record: Record<string, unknown>): string {
    const candidates = ["名称", "name", "title", "n", "desc", "description"]
    for (const key of candidates) {
        const value = toSimpleString(record[key])
        if (value) return value
    }
    return "(无名称)"
}

/**
 * 提取记录主键。
 * @param record 数据记录
 * @param index 当前序号
 * @returns 主键字符串
 */
function pickPrimaryId(record: Record<string, unknown>, index: number): string {
    const candidates = ["id", "ID", "编号", "__key", "名称", "name", "title"]
    for (const key of candidates) {
        const value = toSimpleString(record[key])
        if (value) return value
    }
    return String(index)
}

/**
 * 生成记录预览，避免输出过大。
 * @param record 数据记录
 * @returns 预览对象
 */
function createRecordPreview(record: Record<string, unknown>): Record<string, unknown> {
    const preferredKeys = ["id", "名称", "name", "title", "type", "品质", "职业", "武器类型", "元素", "desc", "description"]
    const preview: Record<string, unknown> = {}

    for (const key of preferredKeys) {
        if (key in record && preview[key] === undefined) {
            preview[key] = record[key]
        }
    }

    for (const [key, value] of Object.entries(record)) {
        if (Object.keys(preview).length >= 12) break
        if (preview[key] !== undefined) continue
        if (value === null || value === undefined) continue
        if (typeof value === "object") continue
        preview[key] = value
    }

    return preview
}

/**
 * 构建单个数据集文档缓存。
 * @param dataset 数据集名
 * @returns 文档数组
 */
function getDatasetDocuments(dataset: DatasetName): SearchDocument[] {
    const cached = datasetDocumentCache.get(dataset)
    if (cached) return cached

    const rawRecords = getDatasetRawRecords(dataset)
    const documents = rawRecords.map((rawRecord, index) => {
        const record = normalizeLocalRecordByDataset(dataset, rawRecord)
        const fragments = collectSearchText(record)
        return {
            dataset,
            index,
            rawRecord,
            record,
            searchText: fragments.join(" "),
            primaryName: pickPrimaryName(record),
            primaryId: pickPrimaryId(record, index),
        } satisfies SearchDocument
    })

    datasetDocumentCache.set(dataset, documents)
    return documents
}

/**
 * 限制数值范围。
 * @param value 输入值
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的数值
 */
function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/**
 * 解析字段路径字符串。
 * @param path 字段路径（如 a.b.c）
 * @returns 路径片段数组
 */
function splitFieldPath(path: string): string[] {
    return path
        .split(".")
        .map(item => item.trim())
        .filter(Boolean)
}

/**
 * 根据路径从任意数据中提取所有匹配值。
 * @param value 当前值
 * @param path 字段路径片段
 * @returns 匹配到的值数组
 */
function extractPathValues(value: unknown, path: string[]): unknown[] {
    if (path.length === 0) {
        return [value]
    }

    if (Array.isArray(value)) {
        return value.flatMap(item => extractPathValues(item, path))
    }

    if (!value || typeof value !== "object") {
        return []
    }

    const [head, ...rest] = path
    if (!Object.hasOwn(value as object, head)) {
        return []
    }

    return extractPathValues((value as Record<string, unknown>)[head], rest)
}

/**
 * 按字段白名单构建搜索文本。
 * @param record 原始记录
 * @param fields 字段列表
 * @returns 搜索文本
 */
function buildScopedSearchText(record: Record<string, unknown>, fields: string[]): string {
    if (fields.length === 0) {
        return collectSearchText(record).join(" ")
    }

    const fragments = fields.flatMap(field => {
        const path = splitFieldPath(field)
        if (path.length === 0) return []
        const values = extractPathValues(record, path)
        return values.flatMap(value => collectSearchText(value))
    })
    return fragments.join(" ")
}

/**
 * 判断记录是否命中精确 ID。
 * @param doc 数据文档
 * @param exactId 精确 ID 字符串
 * @returns 是否命中
 */
function matchExactId(doc: SearchDocument, exactId: string): boolean {
    const target = exactId.trim().toLowerCase()
    if (!target) return true
    if (doc.primaryId.toLowerCase() === target) return true

    const candidates = ["id", "ID", "编号", "__key", "名称", "name", "title"]
    for (const key of candidates) {
        const value = toSimpleString(doc.record[key]).trim().toLowerCase()
        if (value && value === target) return true
    }
    return false
}

/**
 * 构建本地模块列表。
 * @returns 本地模块元数据
 */
function getLocalModules(): ModuleMeta[] {
    return (Object.keys(LOCAL_DATASETS) as DatasetName[]).map(dataset => ({
        moduleId: `/local/${dataset}`,
        source: "local",
        name: dataset,
        description: `查询本地数据模块 ${dataset}`,
        tags: [dataset, "local", "data", "静态数据"],
        recordCount: getDatasetDocuments(dataset).length,
    }))
}

/**
 * 返回全部模块元数据。
 * @returns 全部模块
 */
function getAllModules(): ModuleMeta[] {
    return [...getLocalModules()]
}

/**
 * 获取模块解析用 Fuse 实例。
 * @returns Fuse 实例
 */
function getModuleResolverFuse(): Fuse<ModuleResolveDocument> {
    if (moduleResolverFuseCache) return moduleResolverFuseCache

    const docs = getAllModules().map(item => ({
        ...item,
        searchText: `${item.moduleId} ${item.name} ${item.description} ${item.tags.join(" ")}`,
    }))
    moduleResolverFuseCache = new Fuse(docs, {
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.35,
        keys: ["searchText", "moduleId", "name", "description", "tags"],
    })
    return moduleResolverFuseCache
}

/**
 * 解析模块名，返回候选模块列表。
 * @param moduleName 模块名关键词
 * @param query 可选上下文查询
 * @returns 候选列表
 */
function resolveDataModule(moduleName: string, query: string | undefined) {
    const keyword = [moduleName, query].filter(Boolean).join(" ").trim()
    const allModules = getAllModules()

    if (!keyword) {
        return allModules.slice(0, 10).map(item => ({ ...item, score: null }))
    }

    const fuse = getModuleResolverFuse()
    return fuse.search(keyword, { limit: 10 }).map(hit => ({ ...hit.item, score: hit.score ?? null }))
}

/**
 * 解析模块 ID。
 * @param moduleId 模块 ID
 * @returns 解析后的模块选择
 * @throws 当模块 ID 非法时抛出异常
 */
function parseModuleId(moduleId: string): ModuleSelection {
    const normalized = moduleId.trim().toLowerCase()

    if (normalized.startsWith("/local/")) {
        const dataset = normalized.slice("/local/".length) as DatasetName
        if (!Object.hasOwn(LOCAL_DATASETS, dataset)) {
            throw new Error(`未知本地模块: ${moduleId}`)
        }
        return { source: "local", dataset }
    }

    if (Object.hasOwn(LOCAL_DATASETS, normalized as DatasetName)) {
        return { source: "local", dataset: normalized as DatasetName }
    }

    throw new Error(`未知模块 ID: ${moduleId}`)
}

/**
 * 根据数据集推导对应的数据类型枚举列表。
 * @param dataset 数据集名
 * @returns 类型枚举列表
 */
function getDatasetTypeNames(dataset: DatasetName): DataTypeName[] {
    const moduleId = `/local/${dataset}`
    return [...DATA_TYPE_ENUM_VALUES].filter(typeName => DATA_TYPE_DEFINITION_META[typeName].moduleIds.includes(moduleId))
}

/**
 * 读取并标准化 what-is-this 的别名库配置。
 * @returns 标准化别名条目列表
 */
function getWhatIsThisAliasEntries(): Array<{ alias: string; entry: WhatIsThisAliasEntry }> {
    const entries = Object.entries(WHAT_IS_THIS_ALIAS_LIBRARY) as Array<[string, WhatIsThisAliasEntry]>
    return entries
        .map(([alias, entry]) => ({
            alias: alias.trim(),
            entry: {
                moduleIds: entry.moduleIds.map(item => item.trim()).filter(Boolean),
                typeNames: entry.typeNames,
            },
        }))
        .filter(item => item.alias && item.entry.moduleIds.length > 0)
}

/**
 * 获取 what-is-this 的数据集字段配置。
 * @param dataset 数据集名
 * @returns 字段列表
 */
function getWhatIsThisFieldsByDataset(dataset: DatasetName): string[] {
    const configured = WHAT_IS_THIS_DATASET_FIELD_CONFIG[dataset]
    if (configured && configured.length > 0) {
        return [...configured]
    }
    return [...WHAT_IS_THIS_NAME_FIELDS]
}

/**
 * 展开 what-is-this 的值别名（配置格式：标准名 -> 别名列表）。
 * @param keyword 原始关键词
 * @returns 展开后的关键词列表（包含原词）
 */
function expandWhatIsThisKeywords(keyword: string): string[] {
    const raw = keyword.trim()
    if (!raw) return []

    const results: string[] = []
    const queue: string[] = [raw]
    const visited = new Set<string>()

    while (queue.length > 0 && results.length < 20) {
        const current = queue.shift()
        if (!current) continue

        const normalized = current.toLowerCase()
        if (visited.has(normalized)) continue
        visited.add(normalized)
        results.push(current)

        Object.entries(WHAT_IS_THIS_VALUE_ALIAS_LIBRARY).forEach(([canonical, aliasList]) => {
            const canonicalText = canonical.trim()
            const canonicalNormalized = canonicalText.toLowerCase()
            const aliases = aliasList.map(item => item.trim()).filter(Boolean)

            // 命中标准名时，扩展到它的别名。
            if (normalized === canonicalNormalized) {
                aliases.forEach(alias => {
                    const aliasNormalized = alias.toLowerCase()
                    if (!visited.has(aliasNormalized)) {
                        queue.push(alias)
                    }
                })
                return
            }

            // 命中别名时，回推到标准名（满足“搜 A 出 B”）。
            if (aliases.some(alias => alias.toLowerCase() === normalized) && !visited.has(canonicalNormalized)) {
                queue.push(canonicalText)
            }
        })
    }

    return results
}

/**
 * 构建 what-is-this 检索文档（别名 + 模块 + 名称全文）。
 * @returns 检索文档列表
 */
function getWhatIsThisDocuments(): WhatIsThisDocument[] {
    if (whatIsThisDocumentsCache) return whatIsThisDocumentsCache

    const docs: WhatIsThisDocument[] = []

    getWhatIsThisAliasEntries().forEach(({ alias, entry }) => {
        entry.moduleIds.forEach(moduleId => {
            try {
                const parsed = parseModuleId(moduleId)
                const dataset = parsed.dataset
                docs.push({
                    dataset,
                    moduleId: `/local/${dataset}`,
                    typeNames: entry.typeNames?.length ? [...entry.typeNames] : getDatasetTypeNames(dataset),
                    keyword: alias,
                    searchText: alias,
                    source: "alias",
                })
            } catch (_error) {
                // 忽略别名库中的非法模块配置，避免影响主流程。
            }
        })
    })

    getAllModules().forEach(moduleMeta => {
        const parsed = parseModuleId(moduleMeta.moduleId)
        const dataset = parsed.dataset
        docs.push({
            dataset,
            moduleId: `/local/${dataset}`,
            typeNames: getDatasetTypeNames(dataset),
            keyword: moduleMeta.name,
            searchText: `${moduleMeta.name} ${moduleMeta.description} ${moduleMeta.tags.join(" ")}`.trim(),
            source: "module",
        })
    })
    ;(Object.keys(LOCAL_DATASETS) as DatasetName[]).forEach(dataset => {
        const moduleId = `/local/${dataset}`
        const defaultTypeNames = getDatasetTypeNames(dataset)
        const fields = getWhatIsThisFieldsByDataset(dataset)
        getDatasetDocuments(dataset).forEach(doc => {
            const refDataset = toSimpleString(doc.record.ref).trim().toLowerCase()
            const resolvedDataset =
                dataset === "jargon" && refDataset && Object.hasOwn(LOCAL_DATASETS, refDataset as DatasetName)
                    ? (refDataset as DatasetName)
                    : dataset
            const resolvedModuleId = `/local/${resolvedDataset}`
            const typeNames = getDatasetTypeNames(resolvedDataset)
            const nameText = buildScopedSearchText(doc.record, fields)
            const searchText = [doc.primaryName, nameText].filter(Boolean).join(" ")
            if (!searchText.trim()) return

            docs.push({
                dataset: resolvedDataset,
                moduleId: resolvedModuleId || moduleId,
                typeNames: typeNames.length > 0 ? typeNames : defaultTypeNames,
                keyword: doc.primaryName,
                searchText,
                source: "name",
            })
        })
    })

    whatIsThisDocumentsCache = docs
    return docs
}

/**
 * 获取 what-is-this 的 Fuse 检索实例。
 * @returns Fuse 实例
 */
function getWhatIsThisFuse(): Fuse<WhatIsThisDocument> {
    if (whatIsThisFuseCache) return whatIsThisFuseCache

    whatIsThisFuseCache = new Fuse(getWhatIsThisDocuments(), {
        includeScore: true,
        ignoreLocation: true,
        threshold: 1,
        keys: ["keyword", "searchText", "moduleId", "typeNames"],
    })
    return whatIsThisFuseCache
}

/**
 * 识别关键词所属模块与数据类型。
 * @param keyword 关键词
 * @param moduleIds 可选模块路径过滤
 * @param limit 返回条数
 * @param threshold 模糊匹配阈值
 * @returns 识别结果
 */
function whatIsThis(
    keyword: string,
    moduleIds: string[] | undefined,
    limit: number,
    threshold: number
): {
    keyword: string
    expandedKeywords: string[]
    selected: WhatIsThisCandidate | null
    candidates: WhatIsThisCandidate[]
    scopedModuleIds: string[]
    nextTools: { moduleSearch: string; typeDefinition: string }
} {
    const trimmedKeyword = keyword.trim()
    const safeLimit = clampNumber(limit, 1, 30)
    const safeThreshold = clampNumber(threshold, 0, 1)
    const datasets = resolveDatasetList(moduleIds)
    const scopedModuleIds = datasets.map(dataset => `/local/${dataset}`)
    const scopedModuleSet = new Set(scopedModuleIds)
    const expandedKeywords = trimmedKeyword ? expandWhatIsThisKeywords(trimmedKeyword) : []

    const docs = getWhatIsThisDocuments().filter(doc => scopedModuleSet.has(doc.moduleId))
    const hits = expandedKeywords.length
        ? expandedKeywords
              .flatMap(searchKeyword =>
                  getWhatIsThisFuse()
                      .search(searchKeyword, { limit: safeLimit * 16 })
                      .map(hit => ({ ...hit, searchKeyword }))
              )
              .filter(hit => scopedModuleSet.has(hit.item.moduleId) && (hit.score ?? 0) <= safeThreshold)
        : docs.slice(0, safeLimit * 8).map(item => ({ item, score: null }))

    const candidateMap = new Map<string, WhatIsThisCandidate>()
    hits.forEach(hit => {
        const moduleKey = hit.item.moduleId
        const existing = candidateMap.get(moduleKey)
        const score = hit.score ?? null
        const mergedTypeNames = [...new Set(hit.item.typeNames)]
        if (!existing) {
            candidateMap.set(moduleKey, {
                moduleId: hit.item.moduleId,
                dataset: hit.item.dataset,
                typeNames: mergedTypeNames,
                score,
                hitCount: 1,
                sources: [hit.item.source],
                matchedKeywords: [hit.item.keyword],
            })
            return
        }

        existing.hitCount += 1
        existing.typeNames = [...new Set([...existing.typeNames, ...mergedTypeNames])]
        if (score !== null && (existing.score === null || score < existing.score)) {
            existing.score = score
        }
        if (!existing.sources.includes(hit.item.source)) {
            existing.sources.push(hit.item.source)
        }
        if (hit.item.keyword && !existing.matchedKeywords.includes(hit.item.keyword) && existing.matchedKeywords.length < 8) {
            existing.matchedKeywords.push(hit.item.keyword)
        }
    })

    const candidates = [...candidateMap.values()]
        .sort((a, b) => {
            const scoreA = a.score ?? Number.MAX_SAFE_INTEGER
            const scoreB = b.score ?? Number.MAX_SAFE_INTEGER
            if (scoreA !== scoreB) return scoreA - scoreB
            return b.hitCount - a.hitCount
        })
        .slice(0, safeLimit)

    return {
        keyword: trimmedKeyword,
        expandedKeywords,
        selected: candidates[0] || null,
        candidates,
        scopedModuleIds,
        nextTools: {
            moduleSearch: "query-all-data-modules",
            typeDefinition: "query-data-type-definition",
        },
    }
}

/**
 * 将文档转换为标准查询结果项。
 * @param doc 文档记录
 * @param score 相似度分数
 * @param includeRaw 是否包含原始记录
 * @returns 标准结果项
 */
function toQueryResultItem(doc: SearchDocument, score: number | null, includeRaw: boolean): QueryResultItem {
    return {
        dataset: doc.dataset,
        index: doc.index,
        id: doc.primaryId,
        name: doc.primaryName,
        score,
        preview: createRecordPreview(doc.record),
        record: doc.record,
        rawRecord: includeRaw ? doc.rawRecord : undefined,
    }
}

/**
 * 解析模块 ID 列表，转换为数据集集合。
 * @param moduleIds 模块 ID 列表
 * @returns 去重后的数据集列表
 */
function resolveDatasetList(moduleIds: string[] | undefined): DatasetName[] {
    if (!moduleIds || moduleIds.length === 0) {
        return Object.keys(LOCAL_DATASETS) as DatasetName[]
    }
    return [...new Set(moduleIds.map(moduleId => parseModuleId(moduleId).dataset))]
}

/**
 * 查询本地模块数据。
 * @param dataset 数据集名
 * @param query 查询关键词
 * @param exactId 精确 ID
 * @param fields 字段白名单
 * @param limit 返回条数
 * @param threshold Fuse 阈值
 * @param includeRaw 是否包含完整记录
 * @returns 查询结果
 */
function queryLocalModule(
    dataset: DatasetName,
    query: string | undefined,
    exactId: string | undefined,
    fields: string[],
    limit: number,
    threshold: number,
    includeRaw: boolean
) {
    const safeLimit = clampNumber(limit, 1, 50)
    const safeThreshold = clampNumber(threshold, 0, 1)
    const keyword = query?.trim() || ""

    let docs = getDatasetDocuments(dataset)
    if (exactId?.trim()) {
        docs = docs.filter(doc => matchExactId(doc, exactId))
    }

    if (!keyword) {
        const rawResults = docs.slice(0, safeLimit).map(doc => toQueryResultItem(doc, null, includeRaw))
        return {
            moduleId: `/local/${dataset}`,
            totalCandidates: docs.length,
            fields: fields.length ? fields : "all",
            results: rawResults,
        }
    }

    const scopedDocs: ScopedSearchDocument[] = docs.map(doc => ({
        ...doc,
        scopedText: buildScopedSearchText(doc.record, fields),
    }))
    const fuse = new Fuse(scopedDocs, {
        includeScore: true,
        ignoreLocation: true,
        threshold: safeThreshold,
        keys: ["scopedText", "primaryName", "primaryId"],
    })
    const hits = fuse.search(keyword, { limit: safeLimit })

    return {
        moduleId: `/local/${dataset}`,
        totalCandidates: docs.length,
        fields: fields.length ? fields : "all",
        results: hits.map(hit => toQueryResultItem(hit.item, hit.score ?? null, includeRaw)),
    }
}

/**
 * 在全部模块中执行统一模糊检索。
 * @param query 查询关键词
 * @param exactId 精确 ID
 * @param moduleIds 可选模块 ID 列表（用于范围过滤）
 * @param fields 字段白名单
 * @param limit 返回条数
 * @param threshold Fuse 阈值
 * @param includeRaw 是否包含完整记录
 * @returns 全模块查询结果
 */
function queryAllLocalModules(
    query: string | undefined,
    exactId: string | undefined,
    moduleIds: string[] | undefined,
    fields: string[],
    limit: number,
    threshold: number,
    includeRaw: boolean
) {
    const safeLimit = clampNumber(limit, 1, 200)
    const safeThreshold = clampNumber(threshold, 0, 1)
    const keyword = query?.trim() || ""
    const datasets = resolveDatasetList(moduleIds)
    if (datasets.length === 1) {
        const payload = queryLocalModule(datasets[0], query, exactId, fields, safeLimit, safeThreshold, includeRaw)
        return {
            moduleIds: [`/local/${datasets[0]}`],
            totalCandidates: payload.totalCandidates,
            fields: payload.fields,
            results: payload.results.map(item => ({
                ...item,
                moduleId: payload.moduleId,
            })),
        }
    }

    let docs = datasets.flatMap(dataset => getDatasetDocuments(dataset))
    if (exactId?.trim()) {
        docs = docs.filter(doc => matchExactId(doc, exactId))
    }

    if (!keyword) {
        const results: AllModuleQueryResultItem[] = docs.slice(0, safeLimit).map(doc => ({
            ...toQueryResultItem(doc, null, includeRaw),
            moduleId: `/local/${doc.dataset}`,
        }))
        return {
            moduleIds: datasets.map(dataset => `/local/${dataset}`),
            totalCandidates: docs.length,
            fields: fields.length ? fields : "all",
            results,
        }
    }

    const scopedDocs: AllModuleSearchDocument[] = docs.map(doc => ({
        ...doc,
        scopedText: buildScopedSearchText(doc.record, fields),
    }))
    const fuse = new Fuse(scopedDocs, {
        includeScore: true,
        ignoreLocation: true,
        threshold: safeThreshold,
        keys: ["scopedText", "primaryName", "primaryId", "dataset"],
    })
    const hits = fuse.search(keyword, { limit: safeLimit })
    const results: AllModuleQueryResultItem[] = hits.map(hit => ({
        ...toQueryResultItem(hit.item, hit.score ?? null, includeRaw),
        moduleId: `/local/${hit.item.dataset}`,
    }))

    return {
        moduleIds: datasets.map(dataset => `/local/${dataset}`),
        totalCandidates: docs.length,
        fields: fields.length ? fields : "all",
        results,
    }
}

/**
 * 获取指定数据类型的 interface 定义。
 * @param typeName 类型枚举名
 * @returns interface 定义；若快照中不存在则返回 null
 */
function getDataTypeInterfaceDefinition(typeName: DataTypeName): string | null {
    return DATA_TYPE_INTERFACE_DEFINITION_MAP[typeName] ?? null
}

/**
 * 将模块路径标准化为 /local/<dataset> 形式。
 * @param moduleId 模块路径
 * @returns 标准化模块路径
 */
function normalizeLocalModuleId(moduleId: string): string {
    const parsed = parseModuleId(moduleId)
    return `/local/${parsed.dataset}`
}

/**
 * 根据模块路径筛选数据类型枚举。
 * @param moduleId 可选模块路径
 * @returns 归一化模块路径与类型枚举列表
 */
function getTypeNamesByModuleId(moduleId: string | undefined): { normalizedModuleId: string | null; typeNames: DataTypeName[] } {
    if (!moduleId?.trim()) {
        return {
            normalizedModuleId: null,
            typeNames: [...DATA_TYPE_ENUM_VALUES],
        }
    }

    const normalizedModuleId = normalizeLocalModuleId(moduleId.trim())
    const typeNames = [...DATA_TYPE_ENUM_VALUES].filter(typeName =>
        DATA_TYPE_DEFINITION_META[typeName].moduleIds.includes(normalizedModuleId)
    )
    return {
        normalizedModuleId,
        typeNames,
    }
}

/**
 * 构建数据类型定义响应。
 * @param typeName 可选类型名
 * @param moduleId 可选模块路径
 * @returns 类型定义响应对象
 */
function queryDataTypeDefinitions(typeName: DataTypeName | undefined, moduleId: string | undefined) {
    const { normalizedModuleId, typeNames } = getTypeNamesByModuleId(moduleId)

    if (!typeName) {
        return {
            moduleId: normalizedModuleId,
            typeNames,
            definitions: typeNames.map(name => {
                const meta = DATA_TYPE_DEFINITION_META[name]
                return {
                    typeName: name,
                    interfaceName: meta.interfaceName,
                    moduleIds: meta.moduleIds,
                    description: meta.description,
                    hasDefinition: Boolean(getDataTypeInterfaceDefinition(name)),
                }
            }),
        }
    }

    if (normalizedModuleId && !typeNames.includes(typeName)) {
        return {
            moduleId: normalizedModuleId,
            typeName,
            hasDefinition: false,
            message: `模块 ${normalizedModuleId} 不包含类型 ${typeName}`,
            availableTypeNames: typeNames,
        }
    }

    const meta = DATA_TYPE_DEFINITION_META[typeName]
    const definition = getDataTypeInterfaceDefinition(typeName)
    return {
        moduleId: normalizedModuleId,
        typeName,
        interfaceName: meta.interfaceName,
        moduleIds: meta.moduleIds,
        description: meta.description,
        hasDefinition: Boolean(definition),
        interfaceDefinition: definition,
    }
}

/**
 * 将任意值转换为密函名称数组。
 * @param value 原始值
 * @returns 名称数组
 */
function toMissionNameArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.map(item => toSimpleString(item)).filter(Boolean)
}

/**
 * 将密函二维数组转换为结构化分组。
 * @param missions 原始 missions 二维数组
 * @param keyword 可选过滤关键词
 * @returns 结构化密函数据
 */
function toStructuredMissions(missions: unknown, keyword: string): StructuredMissions {
    const groups = Array.isArray(missions) ? missions : []
    const filterMissions = (names: string[]) => (keyword ? names.filter(name => name.includes(keyword)) : names)

    return {
        角色: filterMissions(toMissionNameArray(groups[0])),
        武器: filterMissions(toMissionNameArray(groups[1])),
        魔之楔: filterMissions(toMissionNameArray(groups[2])),
    }
}

/**
 * 调用 GraphQL 后端查询实时密函信息（missionsIngame）。
 * @param endpoint GraphQL 端点
 * @param server 服务器标识
 * @returns 最新密函数据
 * @throws 当请求失败时抛出异常
 */
async function fetchMissionIngame(endpoint: string, server: string): Promise<GraphQLMissionsLatestResult> {
    const query = `
        query ($server: String!) {
            latest: missionsIngame(server: $server) {
                id
                server
                missions
                createdAt
            }
        }
    `

    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            query,
            variables: {
                server,
            },
        }),
    })

    if (!response.ok) {
        throw new Error(`GraphQL 请求失败: ${response.status} ${response.statusText}`)
    }

    const payload = (await response.json()) as {
        data?: GraphQLMissionsLatestResult
        errors?: Array<{ message?: string }>
    }

    if (payload.errors?.length) {
        const message = payload.errors.map(item => item.message || "unknown error").join("; ")
        throw new Error(`GraphQL 错误: ${message}`)
    }
    if (!payload.data) {
        throw new Error("GraphQL 返回为空")
    }
    return payload.data
}

/**
 * 查询在线密函并转换为结构化字段。
 * @param endpoint GraphQL 端点
 * @param server 服务器标识
 * @param query 可选关键词过滤
 * @returns 查询结果
 */
async function queryMissionIngame(endpoint: string, server: string, query: string | undefined) {
    const data = await fetchMissionIngame(endpoint, server)
    const latest = data.latest
    const keyword = query?.trim() || ""

    if (!latest) {
        return {
            moduleId: "/online/missions",
            endpoint,
            server,
            latest: null,
        }
    }

    return {
        moduleId: "/online/missions",
        endpoint,
        server: latest.server || server,
        latest: {
            id: latest.id,
            server: latest.server,
            createdAt: latest.createdAt ?? null,
            missions: toStructuredMissions(latest.missions, keyword),
            missionGroupOrder: [...MISSION_GROUP_LABELS],
        },
    }
}

/**
 * 将对象序列化为 MCP 文本响应。
 * @param payload 任意响应对象
 * @returns MCP content 结构
 */
function toMcpText(payload: unknown) {
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(payload, null, 2),
            },
        ],
    }
}

const nodeProcess = getNodeProcess()
const cli = parseCliOptions(nodeProcess?.argv?.slice(2) ?? [], nodeProcess?.env ?? {})

const server = new McpServer(
    {
        name: "DNA Builder Data MCP",
        version: SERVER_VERSION,
    },
    {
        instructions:
            "本地数据建议先用 what-is-this 识别关键词所属模块和类型，再调用 query-all-data-modules 检索数据。类型定义用 query-data-type-definition，实时密函用 query-missions。",
    }
)

server.registerTool(
    "resolve-data-module",
    {
        title: "解析数据模块",
        description: `将模块名称解析为可查询模块 ID（类似 Context7 的 resolve-library-id）。

模块格式：
- 本地模块：/local/<dataset>`,
        inputSchema: {
            moduleName: z.string().describe("模块关键词，例如 char、weapon、walnut。"),
            query: z.string().optional().describe("可选上下文查询，用于提升匹配精度。"),
            source: z.enum(["local"]).optional().describe("可选来源过滤（当前仅支持 local）。"),
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    async ({ moduleName, query, source }) => {
        const candidates = resolveDataModule(moduleName, query)
        const selected = candidates[0] || null
        return toMcpText({
            selected,
            candidates,
            source: source ?? "local",
        })
    }
)

server.registerTool(
    "what-is-this",
    {
        title: "识别关键词所属模块与类型",
        description: `通过“可配置别名库 + 值别名扩展 + 名称全文模糊搜索”识别关键词归属的模块与数据类型，供下一步查询使用。

建议后续结合 query-all-data-modules 与 query-data-type-definition 使用。`,
        inputSchema: {
            keyword: z.string().describe("要识别的关键词（角色名、别名、模块名等）。"),
            moduleIds: z.array(z.string()).optional().describe("可选模块路径范围（例如 /local/char、/local/weapon）。"),
            limit: z.number().int().min(1).max(30).optional().describe("返回候选数量，默认 10。"),
            threshold: z.number().min(0).max(1).optional().describe("模糊匹配阈值，默认 0.35。"),
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    async ({ keyword, moduleIds, limit, threshold }) =>
        toMcpText(whatIsThis(keyword, (moduleIds || []).map(item => item.trim()).filter(Boolean), limit ?? 10, threshold ?? 0.35))
)

server.registerTool(
    "query-all-data-modules",
    {
        title: "全模块模糊搜索",
        description: `在多个本地模块（默认全模块）中执行统一模糊搜索。

支持关键词检索、精确 ID 过滤与字段白名单降噪。`,
        inputSchema: {
            query: z.string().optional().describe("可选模糊查询关键词。"),
            exactId: z.string().optional().describe("可选精确 ID 匹配（先过滤后搜索）。"),
            moduleIds: z.array(z.string()).optional().describe("可选模块 ID 列表（例如 /local/char、/local/weapon）。不传则搜索全部模块。"),
            fields: z.array(z.string()).optional().describe('字段白名单（如 ["名称", "技能.名称"]），用于降噪。'),
            limit: z.number().int().min(1).max(200).optional().describe("返回条数，默认 20，最大 200。"),
            threshold: z.number().min(0).max(1).optional().describe("Fuse 阈值，默认 0.35。"),
            includeRaw: z.boolean().optional().describe("是否额外返回原始压缩记录（rawRecord）。默认 false。"),
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    async ({ query, exactId, moduleIds, fields, limit, threshold, includeRaw }) => {
        const payload = queryAllLocalModules(
            query,
            exactId,
            (moduleIds || []).map(item => item.trim()).filter(Boolean),
            (fields || []).map(item => item.trim()).filter(Boolean),
            limit ?? 20,
            threshold ?? 0.35,
            includeRaw ?? false
        )
        return toMcpText(payload)
    }
)

server.registerTool(
    "query-data-type-definition",
    {
        title: "查询数据类型定义",
        description: "返回数据类型的 interface 定义；支持传入 moduleId（模块路径）筛选可用类型。",
        inputSchema: {
            moduleId: z.string().optional().describe("可选模块路径，例如 /local/char。"),
            typeName: z.enum(DATA_TYPE_ENUM_VALUES).optional().describe("数据类型枚举名；不传时返回全部类型。"),
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    async ({ typeName, moduleId }) => toMcpText(queryDataTypeDefinitions(typeName, moduleId))
)

server.registerTool(
    "query-missions",
    {
        title: "查询实时密函",
        description:
            '独立查询实时密函（missionsIngame）。默认查询 `missionsIngame(server: "cn")`，并转换为 `角色/武器/魔之楔` 三组结构化字段。',
        inputSchema: {
            query: z.string().optional().describe("可选关键词过滤（对每组任务名做 includes 匹配）。"),
            server: z.string().optional().describe('服务器标识，默认 "cn"。'),
            endpoint: z.string().url().optional().describe("可选 GraphQL 端点覆盖。"),
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    async ({ query, server: serverId, endpoint }) => {
        const payload = await queryMissionIngame(endpoint || cli.graphqlEndpoint, (serverId || "cn").trim() || "cn", query)
        return toMcpText(payload)
    }
)

/**
 * 启动 stdio MCP 服务。
 * @returns Promise<void>
 */
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error(`[dna-builder-data-mcp] running on stdio, graphql endpoint: ${cli.graphqlEndpoint}`)
}

main().catch(error => {
    console.error("[dna-builder-data-mcp] fatal:", error)
    nodeProcess?.exit?.(1)
})
