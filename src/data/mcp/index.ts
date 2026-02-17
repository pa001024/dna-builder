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
import * as convertModule from "../d/convert.data"
import * as draftModule from "../d/draft.data"
import * as dungeonModule from "../d/dungeon.data"
import * as dynquestModule from "../d/dynquest.data"
import * as effectModule from "../d/effect.data"
import * as fishModule from "../d/fish.data"
import * as hardbossModule from "../d/hardboss.data"
import * as headsculptureModule from "../d/headsculpture.data"
import * as levelupModule from "../d/levelup.data"
import * as modModule from "../d/mod.data"
import * as monsterModule from "../d/monster.data"
import * as monstertagModule from "../d/monstertag.data"
import * as mountModule from "../d/mount.data"
import * as npcModule from "../d/npc.data"
import * as partytopicModule from "../d/partytopic.data"
import * as petModule from "../d/pet.data"
import * as playerModule from "../d/player.data"
import * as questModule from "../d/quest.data"
import * as questchainModule from "../d/questchain.data"
import * as raidModule from "../d/raid.data"
import * as regionModule from "../d/region.data"
import * as reputationModule from "../d/reputation.data"
import * as resourceModule from "../d/resource.data"
import * as rewardModule from "../d/reward.data"
import * as shopModule from "../d/shop.data"
import * as subregionModule from "../d/subregion.data"
import * as titleModule from "../d/title.data"
import * as walnutModule from "../d/walnut.data"
import * as weaponModule from "../d/weapon.data"

const SERVER_VERSION = "0.2.0"
const DEFAULT_GRAPHQL_ENDPOINT = "https://api.dna-builder.cn/graphql"
const MISSION_GROUP_LABELS = ["角色", "武器", "魔之楔"] as const

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
    levelup: [
        ...fromObjectExport(levelupModule.levelUpResource, "levelup.levelUpResource"),
        ...fromArrayExport(levelupModule.weaponLevelUpExpCost, "levelup.weaponLevelUpExpCost"),
        ...fromArrayExport(levelupModule.charLevelUpExpCost, "levelup.charLevelUpExpCost"),
        { __sourceTag: "levelup.CashToExpRate", value: levelupModule.CashToExpRate },
    ],
    map: [],
    mod: fromArrayExport(modModule.default, "mod.default"),
    monster: fromArrayExport(monsterModule.default, "monster.default"),
    monstertag: fromArrayExport(monstertagModule.monsterTagData, "monstertag.monsterTagData"),
    mount: fromArrayExport(mountModule.mountData, "mount.mountData"),
    npc: fromArrayExport(npcModule.npcData, "npc.npcData"),
    partytopic: fromArrayExport(partytopicModule.partyTopicData, "partytopic.partyTopicData"),
    pet: [...fromArrayExport(petModule.default, "pet.default"), ...fromArrayExport(petModule.petEntrys, "pet.petEntrys")],
    player: [
        ...fromArrayExport(playerModule.PlayerLevelMaxExp, "player.PlayerLevelMaxExp"),
        ...fromObjectExport(playerModule.ExpPerReason, "player.ExpPerReason"),
        ...fromObjectExport(playerModule.ExtraExpInputMax, "player.ExtraExpInputMax"),
    ],
    quest: fromArrayExport(questModule.questData, "quest.questData"),
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

const datasetDocumentCache = new Map<DatasetName, SearchDocument[]>()
let moduleResolverFuseCache: Fuse<ModuleResolveDocument> | null = null
let rewardGroupMapCache: Map<number, Record<string, unknown>> | null = null
const rewardDetailsCache = new Map<number, Record<string, unknown> | null>()
let monsterNameMapCache: Map<number, string> | null = null
let charNameMapCache: Map<number, string> | null = null
let abyssBuffMapCache: Map<number, Record<string, unknown>> | null = null
let abyssPairBaseSetCache: Set<number> | null = null

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
        const rawResults = docs.slice(0, safeLimit).map(doc => ({
            dataset: doc.dataset,
            index: doc.index,
            id: doc.primaryId,
            name: doc.primaryName,
            score: null,
            preview: createRecordPreview(doc.record),
            record: doc.record,
            rawRecord: includeRaw ? doc.rawRecord : undefined,
        }))
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
        results: hits.map(hit => ({
            dataset: hit.item.dataset,
            index: hit.item.index,
            id: hit.item.primaryId,
            name: hit.item.primaryName,
            score: hit.score ?? null,
            preview: createRecordPreview(hit.item.record),
            record: hit.item.record,
            rawRecord: includeRaw ? hit.item.rawRecord : undefined,
        })),
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
            "本地数据使用两步流程：先调用 resolve-data-module 解析模块，再调用 query-data-module 在单模块内检索；密函请使用独立工具 query-missions。",
    }
)

server.registerTool(
    "resolve-data-module",
    {
        title: "解析数据模块",
        description: `将模块名称解析为可查询模块 ID（类似 Context7 的 resolve-library-id）。

你应先调用此工具，再调用 query-data-module。

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
    "query-data-module",
    {
        title: "查询数据模块",
        description: `在指定 moduleId 内执行查询（类似 Context7 的 query-docs）。

必须先通过 resolve-data-module 获取 moduleId，除非你已明确知道模块 ID。`,
        inputSchema: {
            moduleId: z.string().describe("模块 ID，例如 /local/char、/local/weapon。"),
            query: z.string().optional().describe("模糊查询关键词。"),
            exactId: z.string().optional().describe("可选精确 ID 匹配（先过滤后搜索）。"),
            fields: z.array(z.string()).optional().describe('本地模块字段白名单（如 ["名称", "技能.名称"]），用于降噪。'),
            limit: z.number().int().min(1).max(50).optional().describe("返回条数，默认 10。"),
            threshold: z.number().min(0).max(1).optional().describe("本地模块 Fuse 阈值，默认 0.3。"),
            includeRaw: z.boolean().optional().describe("本地模块是否额外返回原始压缩记录（rawRecord）。默认 false。"),
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    async ({ moduleId, query, exactId, fields, limit, threshold, includeRaw }) => {
        const selected = parseModuleId(moduleId)
        const safeLimit = limit ?? 10

        const payload = queryLocalModule(
            selected.dataset,
            query,
            exactId,
            (fields || []).map(item => item.trim()).filter(Boolean),
            safeLimit,
            threshold ?? 0.3,
            includeRaw ?? false
        )
        return toMcpText(payload)
    }
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
