import Fuse from "fuse.js"
import { t } from "i18next"
import achievementData from "@/data/d/achievement.data"
import { booksData } from "@/data/d/book.data"
import charData from "@/data/d/char.data"
import dungeonsData from "@/data/d/dungeon.data"
import { eventData } from "@/data/d/event.data"
import { fishs } from "@/data/d/fish.data"
import modData from "@/data/d/mod.data"
import monsterData from "@/data/d/monster.data"
import { musicData } from "@/data/d/music.data"
import { npcMap } from "@/data/d/npc.data"
import petData from "@/data/d/pet.data"
import type { Dialogue, QuestItem, QuestStory } from "@/data/d/quest.data"
import questChainData, { type QuestChain, questChain2Version } from "@/data/d/questchain.data"
import { resourceData } from "@/data/d/resource.data"
import { getLocalizedQuestDataByLanguage, resolveStoryLocaleBySetting, type StoryLocale } from "@/data/d/story-locale"
import { titleData } from "@/data/d/title.data"
import walnutData from "@/data/d/walnut.data"
import weaponData from "@/data/d/weapon.data"
import { DNA_SAFE_VERSION_LIMIT } from "@/data/versionGate"
import { getDungeonName, getDungeonType } from "@/utils/dungeon-utils"
import { GlobalSearchService } from "@/utils/global-search"
import { matchPinyin } from "@/utils/pinyin-utils"
import { DEFAULT_STORY_TEXT_CONFIG, replaceStoryPlaceholders, stripStoryTextTags } from "@/utils/story-text"

/**
 * 资料库检索层。
 *
 * 为「资料检索 Agent」提供可调用的结构化查询能力，是 agent 工具的唯一数据出口：
 * - 模块清单与模块内条目检索（角色/武器/魔之楔/成就/任务链/活动/副本/怪物/资源/魔灵/密函/称号/读物/乐谱/鱼）
 * - 按版本汇总新增内容
 * - 剧情全文检索与剧情原文读取（支撑「某某剧情里谁做了什么」这类提问）
 *
 * 与 UI 的 GlobalSearchService（全库模糊检索，只返回标题与跳转路径）互补：
 * 这里补足「按模块 / 按版本 / 按剧情正文」的结构化查询，并给出可直接引用的条目明细。
 */

/** 模块检索摘要：供模型了解有哪些模块、各自规模与是否支持版本过滤 */
export interface DBModuleSummary {
    /** 模块标识，作为 queryModule 的入参 */
    id: string
    /** 模块展示名 */
    label: string
    /** 列表页路由 */
    path: string
    /** 是否支持按版本查询 */
    versioned: boolean
    /** 条目总数 */
    count: number
}

/** 模块内单条资料的摘要 */
export interface DBEntrySummary {
    /** 条目 ID */
    id: number | string
    /** 条目名称 */
    name: string
    /** 副信息（属性/类型/品质等） */
    subtitle?: string
    /** 版本号 */
    version?: string
    /** 详情页路由 */
    path: string
}

/** 剧情检索命中的对话片段 */
export interface DBStorySnippet {
    /** 所属任务 ID */
    questId: number
    /** 所属任务名称 */
    questName: string
    /** 说话人（无则空串） */
    speaker: string
    /** 对话正文 */
    text: string
}

/** 剧情检索命中的任务链 */
export interface DBStoryHit {
    chainId: number
    chainName: string
    /** 章节（篇章 + 章节号） */
    chapter: string
    episode: string
    version?: string
    /** 命中的对话片段 */
    snippets: DBStorySnippet[]
    /** 该任务链在资料库中的详情路由 */
    path: string
}

/** 某个版本在一个模块下新增的内容 */
export interface DBVersionAddition {
    module: string
    label: string
    count: number
    /** 条目名称样例（最多 20 条） */
    samples: string[]
}

/** 单个模块的检索适配器 */
interface DBModuleAdapter {
    id: string
    /** 模块名 i18n key（沿用资料库首页的 database.* 键） */
    labelKey: string
    path: string
    versioned: boolean
    /** 详情页路由构造 */
    /** 模块条目清单（懒执行，避免无用开销） */
    list: () => DBEntrySummary[]
}

/** 拼接副信息，空值自动跳过 */
function joinParts(parts: Array<string | number | undefined | null>): string | undefined {
    const text = parts
        .filter(part => part !== undefined && part !== null && `${part}`.trim() !== "")
        .map(part => `${part}`.trim())
        .join(" · ")

    return text || undefined
}

/** 怪物类型展示名 */
const MONSTER_TYPE_LABELS: Record<string, string> = {
    Boss: "首领",
    Elite_Monster: "精英",
    Rescue_Elite_Monster: "救援精英",
}

/**
 * 资料库模块适配器清单。
 * 只登记能给出结构化字段（名称/版本/分类）的模块；其余模块仍可通过全库检索命中。
 */
const MODULE_ADAPTERS: DBModuleAdapter[] = [
    {
        id: "char",
        labelKey: "database.char",
        path: "/db/char",
        versioned: true,
        list: () =>
            charData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([item.属性, item.精通?.[0]]),
                version: item.版本,
                path: `/db/char/${item.id}`,
            })),
    },
    {
        id: "weapon",
        labelKey: "database.weapon",
        path: "/db/weapon",
        versioned: true,
        list: () =>
            weaponData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([item.类型?.[0], item.伤害类型]),
                version: item.版本,
                path: `/db/weapon/${item.id}`,
            })),
    },
    {
        id: "mod",
        labelKey: "database.mod",
        path: "/db/mod",
        versioned: true,
        list: () =>
            modData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([item.系列, item.类型, item.品质]),
                version: item.版本,
                path: `/db/mod/${item.id}`,
            })),
    },
    {
        id: "achievement",
        labelKey: "database.achievement",
        path: "/db/achievement",
        versioned: true,
        list: () =>
            achievementData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([item.分类, item.描述]),
                version: item.版本,
                path: `/db/achievement/${item.id}`,
            })),
    },
    {
        id: "questchain",
        labelKey: "database.questchain",
        path: "/db/questchain",
        versioned: true,
        list: () =>
            questChainData.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: joinParts([`${item.chapterName} ${item.chapterNumber || ""}`, item.episode]),
                version: getQuestChainVersion(item),
                path: `/db/questchain/${item.id}`,
            })),
    },
    {
        id: "event",
        labelKey: "database.event",
        path: "/db/event",
        versioned: false,
        list: () =>
            eventData.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: joinParts([formatTimeRange(item.startTime, item.endTime), item.desc]),
                path: `/db/event/${item.id}`,
            })),
    },
    {
        id: "dungeon",
        labelKey: "database.dungeon",
        path: "/db/dungeon",
        versioned: false,
        list: () =>
            dungeonsData.map(item => ({
                id: item.id,
                name: getDungeonName(item),
                subtitle: joinParts([getDungeonType(item.t).label, `Lv.${item.lv}`]),
                path: `/db/dungeon/${item.id}`,
            })),
    },
    {
        id: "monster",
        labelKey: "database.monster",
        path: "/db/monster",
        versioned: false,
        list: () =>
            monsterData.map(item => ({
                id: item.id,
                name: item.n,
                subtitle: joinParts([item.t ? MONSTER_TYPE_LABELS[item.t] || item.t : undefined, `HP ${item.hp}`]),
                path: `/db/monster/${item.id}`,
            })),
    },
    {
        id: "resource",
        labelKey: "database.resource",
        path: "/db/resource",
        versioned: false,
        list: () =>
            resourceData.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: joinParts([`稀有度 ${item.rarity}`]),
                path: `/db/resource/${item.id}`,
            })),
    },
    {
        id: "pet",
        labelKey: "database.pet",
        path: "/db/pet",
        versioned: false,
        list: () =>
            petData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([`品质 ${item.品质}`, item.描述]),
                path: `/db/pet/${item.id}`,
            })),
    },
    {
        id: "walnut",
        labelKey: "database.walnut",
        path: "/db/walnut",
        versioned: false,
        list: () =>
            walnutData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([`稀有度 ${item.稀有度}`, item.获取途径?.join("/")]),
                path: `/db/walnut/${item.id}`,
            })),
    },
    {
        id: "title",
        labelKey: "database.title_data",
        path: "/db/title",
        versioned: false,
        list: () =>
            titleData.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: item.src,
                path: `/db/title/${item.id}`,
            })),
    },
    {
        id: "book",
        labelKey: "database.book",
        path: "/db/book",
        versioned: false,
        list: () =>
            booksData.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: item.desc,
                path: `/db/book/${item.id}`,
            })),
    },
    {
        id: "music",
        labelKey: "database.music",
        path: "/db/music",
        versioned: false,
        list: () =>
            musicData.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: item.desc,
                path: `/db/music/${item.id}`,
            })),
    },
    {
        id: "fish",
        labelKey: "database.fish",
        path: "/db/fish",
        versioned: false,
        list: () =>
            fishs.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: joinParts([`Lv.${item.level}`, `稀有度 ${item.rarity}`]),
                path: `/db/fish/${item.id}`,
            })),
    },
]

const MODULE_ADAPTER_MAP = new Map(MODULE_ADAPTERS.map(adapter => [adapter.id, adapter]))

/** 全库检索服务：与首页共用同一份索引实现 */
let globalSearchService: GlobalSearchService | null = null

/**
 * 懒加载全库检索服务（索引构建有开销，首次调用时才创建）。
 * @returns 全局检索服务实例
 */
function getGlobalSearchService(): GlobalSearchService {
    if (!globalSearchService) {
        globalSearchService = new GlobalSearchService()
    }

    return globalSearchService
}

/**
 * 格式化时间戳为 YYYY-MM-DD。
 * @param timestamp 秒级或毫秒级时间戳
 * @returns 日期文本
 */
function formatTimestamp(timestamp?: number | null): string {
    if (!timestamp) {
        return ""
    }

    const ms = timestamp > 1e12 ? timestamp : timestamp * 1000
    const date = new Date(ms)

    if (Number.isNaN(date.getTime())) {
        return ""
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/**
 * 格式化活动的起止时间。
 * @param startTime 开始时间
 * @param endTime 结束时间
 * @returns 时间区间文本
 */
function formatTimeRange(startTime: number, endTime: number | null): string {
    const start = formatTimestamp(startTime)
    const end = formatTimestamp(endTime)

    if (!start) {
        return ""
    }

    return end ? `${start} ~ ${end}` : `${start} 起`
}

/**
 * 读取任务链版本号：优先使用导出器的版本映射表，其次回退到数据自带字段。
 * @param chain 任务链
 * @returns 版本号（可能为空）
 */
function getQuestChainVersion(chain: QuestChain): string | undefined {
    return questChain2Version[chain.id] || chain.版本
}

/**
 * 归一化版本号，便于「1.6」与「1.60」这类写法互相匹配。
 * @param version 版本号
 * @returns 归一化后的版本号
 */
function normalizeVersion(version: string | number | undefined): string {
    if (version === undefined || version === null) {
        return ""
    }

    return `${version}`.trim()
}

/**
 * 列出所有可用于版本过滤的版本号（升序）。
 * @returns 版本号列表
 */
export function listVersions(): string[] {
    const versionSet = new Set<string>()

    for (const moduleId of ["char", "weapon", "mod", "achievement", "questchain"]) {
        for (const entry of MODULE_ADAPTER_MAP.get(moduleId)?.list() ?? []) {
            if (entry.version) {
                versionSet.add(entry.version)
            }
        }
    }

    return [...versionSet].sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b) || a.localeCompare(b))
}

/**
 * 列出可结构化查询的模块清单。
 * @returns 模块摘要列表
 */
export function listModules(): DBModuleSummary[] {
    return MODULE_ADAPTERS.map(adapter => ({
        id: adapter.id,
        label: t(adapter.labelKey),
        path: adapter.path,
        versioned: adapter.versioned,
        count: adapter.list().length,
    }))
}

/**
 * 判断文本是否命中关键词（支持中文包含与拼音全拼/首字母）。
 * @param text 待匹配文本
 * @param keyword 关键词
 * @returns 是否命中
 */
function matchKeyword(text: string, keyword: string): boolean {
    if (!text || !keyword) {
        return false
    }

    if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return true
    }

    return matchPinyin(text, keyword).match
}

/**
 * 按模块查询条目明细。
 * @param moduleId 模块标识
 * @param options 查询条件：关键词、版本、条数上限
 * @returns 命中的条目（关键词缺失时返回该模块前若干条）
 */
export function queryModule(
    moduleId: string,
    options: { keyword?: string; version?: string | number; limit?: number } = {}
): { module?: DBModuleSummary; entries: DBEntrySummary[]; total: number } {
    const adapter = MODULE_ADAPTER_MAP.get(moduleId)

    if (!adapter) {
        return { entries: [], total: 0 }
    }

    const keyword = options.keyword?.trim() ?? ""
    const version = normalizeVersion(options.version)
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 80)

    const all = adapter.list()
    const matched = all.filter(entry => {
        if (version && normalizeVersion(entry.version) !== version) {
            return false
        }

        if (!keyword) {
            return true
        }

        return matchKeyword([entry.name, entry.subtitle, entry.version, entry.id].filter(Boolean).join(" "), keyword)
    })

    return {
        module: {
            id: adapter.id,
            label: t(adapter.labelKey),
            path: adapter.path,
            versioned: adapter.versioned,
            count: all.length,
        },
        entries: matched.slice(0, limit),
        total: matched.length,
    }
}

/**
 * 全库关键词检索（覆盖首页模块卡片之外的长尾内容）。
 * @param keyword 关键词
 * @param options 查询条件：条数上限、路由前缀过滤（如 /db/char）
 * @returns 命中的检索项
 */
export function searchAll(
    keyword: string,
    options: { limit?: number; pathPrefix?: string } = {}
): Array<{ title: string; subtitle?: string; typeLabel: string; path: string }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
    const results = getGlobalSearchService().search(keyword, options.pathPrefix ? 120 : limit * 3)

    const filtered = options.pathPrefix ? results.filter(item => item.path.startsWith(options.pathPrefix!)) : results

    return filtered.slice(0, limit).map(({ title, subtitle, typeLabel, path }) => ({ title, subtitle, typeLabel, path }))
}

/**
 * 汇总某个版本在全部可查模块中新增的内容。
 * @param version 版本号
 * @returns 各模块的新增条目统计
 */
export function listVersionAdditions(version: string | number): { version: string; modules: DBVersionAddition[]; note: string } {
    const target = normalizeVersion(version)

    const modules = MODULE_ADAPTERS.filter(adapter => adapter.versioned).map(adapter => {
        const matched = adapter.list().filter(entry => normalizeVersion(entry.version) === target)

        return {
            module: adapter.id,
            label: t(adapter.labelKey),
            count: matched.length,
            samples: matched.slice(0, 20).map(entry => entry.name),
        }
    })

    const safeNote =
        Number.parseFloat(target) > DNA_SAFE_VERSION_LIMIT
            ? `注意：当前安全模式（版本门限 ${DNA_SAFE_VERSION_LIMIT}）已过滤掉更高版本的数据，检索结果可能不完整。`
            : ""

    return { version: target, modules, note: safeNote }
}

/** 剧情索引中的一行对话 */
interface StoryLine {
    questId: number
    questName: string
    speaker: string
    text: string
}

/** 剧情索引：以任务链为单位聚合全部对话，供全文检索使用 */
interface StoryChainIndex {
    chain: QuestChain
    chainId: number
    chainName: string
    chapter: string
    episode: string
    version?: string
    path: string
    lines: StoryLine[]
    searchText: string
}

/** 剧情索引缓存：按语言缓存，避免重复构建 */
const storyIndexCache = new Map<StoryLocale, StoryChainIndex[]>()

/**
 * 解析界面语言对应的剧情数据语言。
 * @returns 剧情数据语言
 */
function resolveStoryLocale(): StoryLocale {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("setting_lang") : ""
    const language = stored || (typeof navigator !== "undefined" ? navigator.language : "zh-CN")

    return resolveStoryLocaleBySetting(language)
}

/**
 * 读取对话说话人：优先导出器提供的 speakerName，缺失时回退 NPC 查表。
 * @param dialogue 对话条目
 * @returns 说话人名称（可能为空串）
 */
function getDialogueSpeaker(dialogue: Dialogue): string {
    if (dialogue.speakerName) {
        return replaceStoryPlaceholders(dialogue.speakerName, DEFAULT_STORY_TEXT_CONFIG)
    }

    if (dialogue.npc === undefined) {
        return ""
    }

    return replaceStoryPlaceholders(npcMap.get(dialogue.npc)?.name || "", DEFAULT_STORY_TEXT_CONFIG)
}

/**
 * 清洗对话正文：剥离富文本标签并替换玩家昵称占位符。
 * @param content 原始正文
 * @returns 清洗后的正文
 */
function cleanDialogueContent(content: string | undefined): string {
    if (!content) {
        return ""
    }

    return replaceStoryPlaceholders(stripStoryTextTags(content), DEFAULT_STORY_TEXT_CONFIG).trim()
}

/**
 * 收集单个任务链的全部对话行（含选项分支）。
 * @param chain 任务链
 * @param questItemMap 任务详情映射
 * @returns 对话行列表
 */
function collectChainStoryLines(chain: QuestChain, questItemMap: Map<number, QuestItem>): StoryLine[] {
    const lines: StoryLine[] = []

    const pushDialogue = (questId: number, questName: string, dialogue: Dialogue) => {
        const text = cleanDialogueContent(dialogue.content)

        if (!text) {
            return
        }

        lines.push({ questId, questName, speaker: getDialogueSpeaker(dialogue), text })

        for (const option of dialogue.options ?? []) {
            const optionText = cleanDialogueContent(option.content)

            if (optionText) {
                lines.push({ questId, questName, speaker: getDialogueSpeaker(option), text: optionText })
            }
        }
    }

    for (const chainItem of chain.quests) {
        const questItem = questItemMap.get(chainItem.id)

        if (!questItem) {
            continue
        }

        const questName = replaceStoryPlaceholders(questItem.name || "", DEFAULT_STORY_TEXT_CONFIG)

        for (const node of questItem.nodes ?? []) {
            for (const dialogue of node.dialogues ?? []) {
                pushDialogue(questItem.id, questName, dialogue)
            }
        }
    }

    return lines
}

/**
 * 构建剧情索引（按任务链聚合对话正文），结果按语言缓存。
 * @param locale 剧情数据语言
 * @returns 剧情索引
 */
async function buildStoryIndex(locale: StoryLocale): Promise<StoryChainIndex[]> {
    const cached = storyIndexCache.get(locale)

    if (cached) {
        return cached
    }

    const questStories = (await getLocalizedQuestDataByLanguage(locale)) as QuestStory[]
    const questItemMap = new Map<number, QuestItem>()

    for (const story of questStories) {
        for (const questItem of story.quests) {
            questItemMap.set(questItem.id, questItem)
        }
    }

    const index = questChainData.map(chain => {
        const chapter = `${chain.chapterName} ${chain.chapterNumber || ""}`.trim()
        const lines = collectChainStoryLines(chain, questItemMap)
        const searchText = [chain.name, chapter, chain.episode, ...lines.map(line => `${line.speaker} ${line.text}`)]
            .filter(Boolean)
            .join(" ")

        return {
            chain,
            chainId: chain.id,
            chainName: chain.name,
            chapter,
            episode: chain.episode,
            version: getQuestChainVersion(chain),
            path: `/db/questchain/${chain.id}`,
            lines,
            searchText,
        }
    })

    storyIndexCache.set(locale, index)
    return index
}

/**
 * 在命中任务链中定位包含关键词的对话行，用于给出「谁说了什么」的上下文。
 * @param entry 命中的任务链
 * @param keyword 关键词
 * @param limit 片段数量上限
 * @returns 对话片段
 */
function pickStorySnippets(entry: StoryChainIndex, keyword: string, limit: number): DBStorySnippet[] {
    const matched = entry.lines.filter(line => matchKeyword(`${line.speaker} ${line.text}`, keyword))

    // 关键词是模糊命中（例如只命中任务链标题）时，退回该任务链开头的对话，保证回答有上下文
    const picked = matched.length ? matched : entry.lines.slice(0, limit)

    return picked.slice(0, limit).map(line => ({
        questId: line.questId,
        questName: line.questName,
        speaker: line.speaker,
        text: line.text,
    }))
}

/**
 * 剧情全文检索：先按任务链标题/章节/对话正文做模糊检索，再在命中任务链中定位相关对话行。
 * @param keyword 关键词（人名、事件、地点等）
 * @param options 查询条件：返回任务链数量、每个任务链的片段数量
 * @returns 命中的任务链与对话片段
 */
export async function searchStory(
    keyword: string,
    options: { limit?: number; snippetLimit?: number } = {}
): Promise<{ hits: DBStoryHit[]; note: string }> {
    const trimmed = keyword.trim()

    if (!trimmed) {
        return { hits: [], note: "关键词为空。" }
    }

    const locale = resolveStoryLocale()
    const index = await buildStoryIndex(locale)

    const fuse = new Fuse(index, {
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 1,
        keys: [
            { name: "chainName", weight: 2.4 },
            { name: "chainId", weight: 2.0 },
            { name: "chapter", weight: 1.2 },
            { name: "episode", weight: 1.0 },
            { name: "searchText", weight: 1.4 },
        ],
    })

    const limit = Math.min(Math.max(options.limit ?? 5, 1), 12)
    const snippetLimit = Math.min(Math.max(options.snippetLimit ?? 6, 1), 20)

    // 精确包含优先：先挑出对话正文里真的出现关键词的任务链，再用模糊检索补齐
    const exact = index.filter(entry => matchKeyword(entry.searchText, trimmed))
    const fuzzy = fuse.search(trimmed, { limit }).map(result => result.item)
    const ordered = [...exact, ...fuzzy.filter(entry => !exact.includes(entry))].slice(0, limit)

    return {
        hits: ordered.map(entry => ({
            chainId: entry.chainId,
            chainName: entry.chainName,
            chapter: entry.chapter,
            episode: entry.episode,
            version: entry.version,
            snippets: pickStorySnippets(entry, trimmed, snippetLimit),
            path: entry.path,
        })),
        note: locale === "zh" ? "" : `剧情数据语言：${locale}`,
    }
}

/**
 * 读取指定任务链的剧情原文（可限定单个任务）。
 * @param chainId 任务链 ID
 * @param options 查询条件：任务 ID、起始行号、行数上限
 * @returns 任务链信息与对话行
 */
export async function readStory(
    chainId: number,
    options: { questId?: number; offset?: number; limit?: number } = {}
): Promise<{ chain?: Omit<DBStoryHit, "snippets">; lines: DBStorySnippet[]; total: number }> {
    const index = await buildStoryIndex(resolveStoryLocale())
    const entry = index.find(item => item.chainId === chainId)

    if (!entry) {
        return { lines: [], total: 0 }
    }

    const scoped = options.questId ? entry.lines.filter(line => line.questId === options.questId) : entry.lines
    const offset = Math.max(options.offset ?? 0, 0)
    const limit = Math.min(Math.max(options.limit ?? 60, 1), 200)

    return {
        chain: {
            chainId: entry.chainId,
            chainName: entry.chainName,
            chapter: entry.chapter,
            episode: entry.episode,
            version: entry.version,
            path: entry.path,
        },
        lines: scoped.slice(offset, offset + limit).map(line => ({
            questId: line.questId,
            questName: line.questName,
            speaker: line.speaker,
            text: line.text,
        })),
        total: scoped.length,
    }
}
