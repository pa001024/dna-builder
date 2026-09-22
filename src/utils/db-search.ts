import Fuse from "fuse.js"
import i18next from "i18next"
import achievementData from "@/data/d/achievement.data"
import { booksData } from "@/data/d/book.data"
import charData from "@/data/d/char.data"
import { getCachedCharVoiceData, resolveCharVoiceLocaleBySetting } from "@/data/d/charvoice-locale"
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
import { getQuestDataByLocale } from "@/data/d/story-locale"
import { titleData } from "@/data/d/title.data"
import walnutData from "@/data/d/walnut.data"
import weaponData from "@/data/d/weapon.data"
import { DAMAGE_MODES, DAMAGE_TERMS } from "@/data/damage-mechanics"
import { DNA_SAFE_VERSION_LIMIT } from "@/data/versionGate"
import {
    type DBAgentLang,
    expandDBAgentKeyword,
    resolveCurrentDBAgentLang,
    resolveDBAgentValue,
    toI18nLanguage,
    translateDBAgentParts,
    translateDBAgentText,
} from "@/utils/db-locale"
import { getDungeonName, getDungeonType } from "@/utils/dungeon-utils"
import { getGlobalSearchService } from "@/utils/global-search"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getQuestName } from "@/utils/quest-utils"
import { DEFAULT_STORY_TEXT_CONFIG, replaceStoryPlaceholders, stripStoryTextTags } from "@/utils/story-text"

/**
 * 资料库检索层。
 *
 * 为「资料检索 Agent」提供可调用的结构化查询能力，是 agent 工具的唯一数据出口：
 * - 模块清单与模块内条目检索（角色/武器/魔之楔/成就/任务链/活动/副本/怪物/资源/魔灵/密函/称号/读物/乐谱/鱼）
 * - 伤害机制索引（技能伤害 / 武器伤害 / DOT 伤害的结算步骤与机制术语，来源同「伤害公式」页面）
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
    /**
     * 该条目在各筛选项上的取值（key 为筛选项 id，value 为该条目命中的取值集合）。
     *
     * 取值集合统一用数组表达，是为了让「一个条目同时属于多个分类」（如武器同时是
     * 近战 / 单手剑）与「数值区间命中」（如品质 3 命中 `ql:3`）走同一套匹配逻辑。
     */
    facets?: Record<string, string[]>
}

/** 筛选项可选值的单项 */
export interface DBFacetValue {
    /** 取值（过滤时传这个字符串） */
    value: string
    /** 展示名 */
    label: string
    /** 该取值下的条目数 */
    count: number
}

/** 某个模块可用的一个筛选项（对应列表页上的一行筛选按钮） */
export interface DBFacetDefinition {
    /** 筛选项 id，作为过滤参数的键 */
    id: string
    /** 展示名，例如「分类」「品质」 */
    label: string
    /** 类型：枚举（离散取值）/ 数值区间（按品质或等级过滤）/ 布尔开关（如「仅看有印象检定的」） */
    kind: "enum" | "range" | "boolean"
    /** 可选值（kind 为 enum / range 时有意义） */
    values: DBFacetValue[]
    /** bool 类型的说明，例如「只保留包含印象检定的任务链」 */
    description?: string
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
    /** 任务类型展示名（主线任务 / 支线任务 / 限时任务 / 活动任务） */
    questType?: string
    /** 是否包含印象检定选项 */
    imprCheck?: boolean
    /** 是否包含印象增加选项 */
    imprIncrease?: boolean
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
    /** 本模块可用的筛选项定义（对应列表页上的筛选行） */
    facets?: DBFacetDefinition[]
    /** 模块条目清单（懒执行，避免无用开销）；需要按语言切分数据集的模块用 lang 决定取哪一套 */
    list: (lang?: DBAgentLang) => DBEntrySummary[]
}

/** 拼接副信息，空值自动跳过 */
function joinParts(parts: Array<string | number | undefined | null>): string | undefined {
    const text = parts
        .filter(part => part !== undefined && part !== null && `${part}`.trim() !== "")
        .map(part => `${part}`.trim())
        .join(" · ")

    return text || undefined
}

/**
 * 取模块展示名。
 *
 * labelKey 指向界面文案，必须直接按目标语言取：这一类文案不在「游戏原文 → 译文」的词条表里
 * （两者是不同的命名空间），把它当游戏原文再翻一遍会查不到词条而回落中文。
 * @param labelKey 模块名 i18n key
 * @param lang 目标语言
 * @returns 模块展示名
 */
function moduleLabel(labelKey: string, lang: DBAgentLang): string {
    const localized = i18next.t(labelKey, { lng: toI18nLanguage(lang), defaultValue: "" })

    return localized || i18next.t(labelKey, { lng: "zh-CN", defaultValue: labelKey })
}

/**
 * 本地化条目的展示字段（名称与副信息）。
 *
 * 只动展示字段：`facets` 是筛选用的机器可读取值，必须保持原文，
 * 否则模型回传的取值无法与列表页口径对齐。
 * @param entry 模块条目
 * @param lang 目标语言
 * @returns 本地化后的条目
 */
function localizeEntry(entry: DBEntrySummary, lang: DBAgentLang): DBEntrySummary {
    if (lang === "zh") {
        return entry
    }

    return {
        ...entry,
        name: translateDBAgentText(entry.name, lang) ?? entry.name,
        subtitle: translateDBAgentParts(entry.subtitle, lang),
    }
}

/**
 * 把关键词扩展成「用户语言写法 + 可反查到的游戏原文写法」。
 * @param keyword 关键词
 * @param lang 提问使用的语言
 * @returns 关键词列表（去重，首个为原关键词）
 */
function expandKeywords(keyword: string, lang: DBAgentLang): string[] {
    const trimmed = keyword.trim()

    return trimmed ? expandDBAgentKeyword(trimmed, lang) : []
}

/** 怪物类型展示名 */
const MONSTER_TYPE_LABELS: Record<string, string> = {
    Boss: "首领",
    Elite_Monster: "精英",
    Rescue_Elite_Monster: "救援精英",
}

/** 模块筛选取值的前缀，保证不同模块的同名分类不会互相干扰 */
const FACET_PREFIX = "f:"

/**
 * 把筛选取值编码成给模型看的字符串。
 *
 * 取值一律带 `f:` 前缀，是为了和「模块本身的值」（如版本号 `1.6`）区分开：
 * 模型在 `filters` 参数里写 `{ "type": "f:主线任务" }` 一眼能看出是筛选项而非别的含义。
 * @param value 原始取值
 * @returns 编码后的筛选取值
 */
function facetValue(value: string | number): string {
    return `${FACET_PREFIX}${value}`
}

/** 模块级 facet 取值的展示名：游戏内文案多为硬编码中文，能查到词条时给出对应语言 */
function facetLabel(value: string | number, lang: DBAgentLang = "zh"): string {
    const text = `${value}`.trim()

    return translateDBAgentText(text, lang) ?? text
}

/**
 * 任务类型分组映射，与剧情列表页的 `QUEST_TYPE_GROUP_MAP` 保持一致。
 *
 * 游戏原始 type 有 1/2/3/4/5/6 六种，但 1 与 2 都是主线、3 与 4 都是支线，
 * 列表页因此把它们并成同一组展示。这里复用同一口径，保证 Agent 说「主线任务」
 * 与用户在列表页点「主线任务」得到的集合完全一致。
 */
const QUEST_TYPE_GROUP_MAP: Record<number, number> = {
    1: 1,
    2: 1,
    3: 3,
    4: 3,
    5: 5,
    6: 6,
}

/**
 * 解析任务类型所属的筛选组。
 * @param type 原始任务类型
 * @returns 分组后的类型取值
 */
function resolveQuestTypeGroup(type: number): number {
    return QUEST_TYPE_GROUP_MAP[type] || type
}

/**
 * 根据分组后的类型取值统计其包含的原始类型集合。
 * @param group 分组后的类型取值
 * @returns 原始类型列表
 */
function resolveQuestRawTypes(group: number): number[] {
    const rawTypes = Object.keys(QUEST_TYPE_GROUP_MAP)
        .map(key => Number(key))
        .filter(rawType => QUEST_TYPE_GROUP_MAP[rawType] === group)

    return rawTypes.length ? rawTypes : [group]
}

/**
 * 构建「枚举取值 → 条目数」的计数表。
 * @param entries 模块条目
 * @param facetId 筛选项 id
 * @returns 取值计数表
 */
function countFacetValues(entries: DBEntrySummary[], facetId: string): Map<string, number> {
    const counts = new Map<string, number>()

    for (const entry of entries) {
        for (const value of entry.facets?.[facetId] ?? []) {
            counts.set(value, (counts.get(value) ?? 0) + 1)
        }
    }

    return counts
}

/**
 * 把计数表按字典序（数值优先）转成 facet 可选值列表。
 * @param counts 取值计数表
 * @param sort 排序方式
 * @param lang 取值的展示语言
 * @returns facet 可选值列表
 */
function toFacetValues(counts: Map<string, number>, sort: "numeric" | "locale" = "locale", lang: DBAgentLang = "zh"): DBFacetValue[] {
    const compare = (a: string, b: string) => {
        if (sort === "numeric") {
            const [left, right] = [Number.parseFloat(storyFacetRawValue(a)), Number.parseFloat(storyFacetRawValue(b))]

            if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
                return left - right
            }
        }

        return storyFacetRawValue(a).localeCompare(storyFacetRawValue(b), "zh-CN", { numeric: true })
    }

    return [...counts.entries()]
        .sort(([a], [b]) => compare(a, b))
        .map(([value, count]) => ({ value, label: facetLabel(storyFacetRawValue(value), lang), count }))
}

/**
 * 剥离筛选取值的编码前缀，得到可读原文。
 * @param value 编码后的筛选取值
 * @returns 原始取值
 */
function storyFacetRawValue(value: string): string {
    return value.startsWith(FACET_PREFIX) ? value.slice(FACET_PREFIX.length) : value
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
        /** 与角色列表页一致：元素 / 标签 / 精通 / 势力 */
        facets: [
            { id: "element", label: "属性", kind: "enum", values: [] },
            { id: "tag", label: "标签", kind: "enum", values: [] },
            { id: "proficiency", label: "精通", kind: "enum", values: [] },
            { id: "faction", label: "阵营", kind: "enum", values: [] },
        ],
        list: () =>
            charData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([item.属性, item.精通?.[0]]),
                version: item.版本,
                path: `/db/char/${item.id}`,
                facets: {
                    element: [facetValue(item.属性)].filter(() => !!item.属性),
                    tag: (item.标签 ?? []).map(tag => facetValue(tag)),
                    proficiency: (item.精通 ?? []).map(prof => facetValue(prof)),
                    faction: item.阵营 ? [facetValue(item.阵营)] : [],
                },
            })),
    },
    {
        id: "charvoice",
        labelKey: "database.charvoice",
        /** 语音在角色详情页的「语音」标签下展示，没有独立列表页 */
        path: "/db/char",
        versioned: false,
        facets: [{ id: "char", label: "角色", kind: "enum", values: [] }],
        list: lang => buildCharVoiceEntries(lang ?? "zh"),
    },
    {
        id: "weapon",
        labelKey: "database.weapon",
        path: "/db/weapon",
        versioned: true,
        /** 与武器列表页一致：分类 / 伤害类型 */
        facets: [
            { id: "category", label: "分类", kind: "enum", values: [] },
            { id: "damageType", label: "伤害类型", kind: "enum", values: [] },
        ],
        list: () =>
            weaponData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([item.类型?.[0], item.伤害类型]),
                version: item.版本,
                path: `/db/weapon/${item.id}`,
                facets: {
                    category: (item.类型 ?? []).map(category => facetValue(category)),
                    damageType: item.伤害类型 ? [facetValue(item.伤害类型)] : [],
                },
            })),
    },
    {
        id: "mod",
        labelKey: "database.mod",
        path: "/db/mod",
        versioned: true,
        /** 与魔之楔列表页一致：类型 / 系列 / 品质 / 元素 */
        facets: [
            { id: "type", label: "类型", kind: "enum", values: [] },
            { id: "series", label: "系列", kind: "enum", values: [] },
            { id: "quality", label: "品质", kind: "enum", values: [] },
        ],
        list: () =>
            modData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([item.系列, item.类型, item.品质]),
                version: item.版本,
                path: `/db/mod/${item.id}`,
                facets: {
                    type: item.类型 ? [facetValue(item.类型)] : [],
                    series: item.系列 ? [facetValue(item.系列)] : [],
                    quality: item.品质 ? [facetValue(item.品质)] : [],
                },
            })),
    },
    {
        id: "achievement",
        labelKey: "database.achievement",
        path: "/db/achievement",
        versioned: true,
        /** 与成就列表页一致：分类 / 品质 */
        facets: [
            { id: "category", label: "分类", kind: "enum", values: [] },
            { id: "quality", label: "品质", kind: "range", values: [] },
        ],
        list: () =>
            achievementData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([item.分类, item.描述]),
                version: item.版本,
                path: `/db/achievement/${item.id}`,
                facets: {
                    category: item.分类 ? [facetValue(item.分类)] : [],
                    quality: item.品质 === undefined ? [] : [facetValue(item.品质)],
                },
            })),
    },
    {
        id: "questchain",
        labelKey: "database.questchain",
        path: "/db/questchain",
        versioned: true,
        /**
         * 与剧情列表页一致：任务类型 / 印象检定 / 印象增加。
         *
         * 类型按分组口径给出（主线 / 支线 / 限时 / 活动），章节不做成筛选项——
         * 章节名是 3 个固定值，用关键词检索就够，做成 facet 反而占满取值空间。
         */
        facets: [
            { id: "type", label: "任务类型", kind: "enum", values: [] },
            { id: "imprCheck", label: "印象检定", kind: "boolean", values: [], description: "只保留含印象检定选项的任务链" },
            { id: "imprIncrease", label: "印象增加", kind: "boolean", values: [], description: "只保留含印象增加选项的任务链" },
        ],
        list: () =>
            questChainData.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: joinParts([
                    `${item.chapterName} ${item.chapterNumber || ""}`,
                    item.episode,
                    getQuestName(resolveQuestTypeGroup(item.type)),
                ]),
                version: getQuestChainVersion(item),
                path: `/db/questchain/${item.id}`,
                facets: {
                    type: [facetValue(getQuestName(resolveQuestTypeGroup(item.type)))],
                    main: item.main === undefined ? [] : [facetValue(item.main)],
                },
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
        /** 与副本列表页一致：类型 / 等级 */
        facets: [
            { id: "type", label: "副本类型", kind: "enum", values: [] },
            { id: "level", label: "等级", kind: "range", values: [] },
        ],
        list: () =>
            dungeonsData.map(item => ({
                id: item.id,
                name: getDungeonName(item),
                subtitle: joinParts([getDungeonType(item.t).label, `Lv.${item.lv}`]),
                path: `/db/dungeon/${item.id}`,
                facets: {
                    type: [facetValue(getDungeonType(item.t).label)],
                    level: [facetValue(item.lv)],
                },
            })),
    },
    {
        id: "monster",
        labelKey: "database.monster",
        path: "/db/monster",
        versioned: false,
        /** 与怪物列表页一致：类型（普通 / 精英 / 首领） */
        facets: [{ id: "type", label: "怪物类型", kind: "enum", values: [] }],
        list: () =>
            monsterData.map(item => ({
                id: item.id,
                name: item.n,
                subtitle: joinParts([item.t ? MONSTER_TYPE_LABELS[item.t] || item.t : undefined, `HP ${item.hp}`]),
                path: `/db/monster/${item.id}`,
                facets: {
                    type: [facetValue(item.t ? MONSTER_TYPE_LABELS[item.t] || item.t : "普通")],
                },
            })),
    },
    {
        id: "resource",
        labelKey: "database.resource",
        path: "/db/resource",
        versioned: false,
        /** 与资源列表页一致：稀有度 */
        facets: [{ id: "rarity", label: "稀有度", kind: "range", values: [] }],
        list: () =>
            resourceData.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: joinParts([`稀有度 ${item.rarity}`]),
                path: `/db/resource/${item.id}`,
                facets: {
                    rarity: item.rarity === undefined ? [] : [facetValue(item.rarity)],
                },
            })),
    },
    {
        id: "pet",
        labelKey: "database.pet",
        path: "/db/pet",
        versioned: false,
        /** 与魔灵列表页一致：品质 / 类型 */
        facets: [
            { id: "quality", label: "品质", kind: "range", values: [] },
            { id: "type", label: "类型", kind: "range", values: [] },
        ],
        list: () =>
            petData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([`品质 ${item.品质}`, item.描述]),
                path: `/db/pet/${item.id}`,
                facets: {
                    quality: [facetValue(item.品质)],
                    type: [facetValue(item.类型)],
                },
            })),
    },
    {
        id: "walnut",
        labelKey: "database.walnut",
        path: "/db/walnut",
        versioned: false,
        /** 与委托密函列表页一致：类型 / 稀有度 */
        facets: [
            { id: "type", label: "类型", kind: "range", values: [] },
            { id: "rarity", label: "稀有度", kind: "range", values: [] },
        ],
        list: () =>
            walnutData.map(item => ({
                id: item.id,
                name: item.名称,
                subtitle: joinParts([`稀有度 ${item.稀有度}`, item.获取途径?.join("/")]),
                path: `/db/walnut/${item.id}`,
                facets: {
                    type: [facetValue(item.类型)],
                    rarity: [facetValue(item.稀有度)],
                },
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
        /** 与钓鱼列表页一致：等级 / 稀有度 */
        facets: [
            { id: "level", label: "等级", kind: "range", values: [] },
            { id: "rarity", label: "稀有度", kind: "range", values: [] },
        ],
        list: () =>
            fishs.map(item => ({
                id: item.id,
                name: item.name,
                subtitle: joinParts([`Lv.${item.level}`, `稀有度 ${item.rarity}`]),
                path: `/db/fish/${item.id}`,
                facets: {
                    level: [facetValue(item.level)],
                    rarity: [facetValue(item.rarity)],
                },
            })),
    },
    {
        id: "damage",
        labelKey: "database.damage",
        path: "/db/damage",
        versioned: false,
        /**
         * 伤害机制模块：条目不是游戏数据，而是伤害公式页面（`/db/damage`）的结算步骤与机制术语。
         *
         * 页面上的结算模式（技能伤害 / 武器伤害 / DOT 伤害）作为筛选项，内容类型（结算步骤 / 名词解释）
         * 用于把「某一步怎么算」与「某个名词是什么意思」分开取。
         */
        facets: [
            { id: "mode", label: "结算模式", kind: "enum", values: [] },
            { id: "kind", label: "内容类型", kind: "enum", values: [] },
        ],
        list: () => buildDamageEntries(),
    },
]

/** 伤害机制条目的内容类型取值 */
const DAMAGE_KIND_STEP = "结算步骤"
const DAMAGE_KIND_TERM = "名词解释"

/** 角色 id → 角色名，用于语音 / 档案条目的副信息与按角色筛选 */
const charNameMap = new Map(charData.map(item => [item.id, item.名称]))

/**
 * 语音 / 档案条目缓存。
 *
 * 以「数据集数组本身」为键：同一语言的数据集是同一个数组引用，
 * 未预加载时回退到的中文数据也是稳定引用，因此不会把回退数据错记成目标语言的结果。
 */
const localizedEntryCache = new WeakMap<object, DBEntrySummary[]>()

/** 副信息里的正文摘要长度上限 */
const ENTRY_TEXT_LIMIT = 80

/**
 * 截断正文摘要。
 * @param text 正文
 * @returns 摘要
 */
function summarizeText(text: string): string {
    return text.length > ENTRY_TEXT_LIMIT ? `${text.slice(0, ENTRY_TEXT_LIMIT)}…` : text
}

/**
 * 构建角色语音模块的条目。
 *
 * 语音是「按语言切分的独立数据集」，因此条目内容取决于 lang；
 * 条目挂到角色详情页（语音在该页的「语音」标签下展示）。
 * @param lang 数据语言
 * @returns 该模块的条目列表
 */
function buildCharVoiceEntries(lang: DBAgentLang): DBEntrySummary[] {
    const data = getCachedCharVoiceData(resolveCharVoiceLocaleBySetting(lang))
    const cached = localizedEntryCache.get(data)

    if (cached) {
        return cached
    }

    const entries = data.map(item => {
        const charName = charNameMap.get(item.charId) ?? ""

        return {
            id: item.id,
            name: item.name,
            subtitle: joinParts([charName, summarizeText(item.text)]),
            path: `/db/char/${item.charId}`,
            facets: {
                char: charName ? [facetValue(charName), facetValue(item.charId)] : [facetValue(item.charId)],
            },
        }
    })

    localizedEntryCache.set(data, entries)

    return entries
}

/**
 * 构建伤害机制模块的条目：每个结算步骤一条，每个机制术语一条。
 * 数据源是 `src/data/damage-mechanics.ts`，与伤害公式页面的步骤定义保持逐字一致。
 * @returns 该模块的条目列表
 */
function buildDamageEntries(): DBEntrySummary[] {
    const entries: DBEntrySummary[] = []

    for (const mode of DAMAGE_MODES) {
        for (const step of mode.steps) {
            entries.push({
                id: `${mode.id}:${step.id}`,
                name: step.title,
                subtitle: joinParts([mode.label, step.group, step.formula]),
                path: `/db/damage?mode=${mode.id}`,
                facets: {
                    mode: [facetValue(mode.label)],
                    kind: [facetValue(DAMAGE_KIND_STEP)],
                },
            })
        }
    }

    for (const term of DAMAGE_TERMS) {
        entries.push({
            id: `term:${term.term}`,
            name: term.term,
            subtitle: term.description,
            path: "/db/damage",
            facets: {
                kind: [facetValue(DAMAGE_KIND_TERM)],
            },
        })
    }

    return entries
}

const MODULE_ADAPTER_MAP = new Map(MODULE_ADAPTERS.map(adapter => [adapter.id, adapter]))

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
 * @param lang 数据语言（影响模块名与按语言切分数据集的条目数）
 * @returns 模块摘要列表
 */
export function listModules(lang: DBAgentLang = resolveCurrentDBAgentLang()): DBModuleSummary[] {
    return MODULE_ADAPTERS.map(adapter => ({
        id: adapter.id,
        label: moduleLabel(adapter.labelKey, lang),
        path: adapter.path,
        versioned: adapter.versioned,
        count: adapter.list(lang).length,
    }))
}

/**
 * 列出某个模块可用的筛选项（对应列表页上的筛选行）与各取值的条目数。
 *
 * 单独暴露这层是为了让模型「先查再筛」：取值的原始文案（如 `Boss` / `Elite_Monster`、
 * 任务类型的中文名）不适合让模型凭记忆猜，查一次就能拿到准确取值。
 *
 * 剧情模块（questchain）走 `listStoryFilters`：印象检定 / 印象增加需要读对话选项才能统计，
 * 而这两个值不在模块条目上，只能从剧情正文索引里算。
 * @param moduleId 模块标识
 * @param lang 数据语言
 * @returns 模块信息与筛选项；模块不支持筛选时 facets 为空数组
 */
export async function listModuleFilters(
    moduleId: string,
    lang: DBAgentLang = resolveCurrentDBAgentLang()
): Promise<{ module?: DBModuleSummary; facets: DBFacetDefinition[]; note?: string }> {
    const adapter = MODULE_ADAPTER_MAP.get(moduleId)

    if (!adapter) {
        return { facets: [] }
    }

    const entries = adapter.list(lang)
    const module: DBModuleSummary = {
        id: adapter.id,
        label: moduleLabel(adapter.labelKey, lang),
        path: adapter.path,
        versioned: adapter.versioned,
        count: entries.length,
    }

    if (adapter.id === "questchain") {
        const { facets, total } = await listStoryFilters(lang)

        return { module: { ...module, count: total }, facets }
    }

    if (!adapter.facets?.length) {
        return { module, facets: [], note: `模块 ${adapter.id} 没有额外筛选项，可用关键词与版本过滤。` }
    }

    const facets = adapter.facets.map(facet => {
        const counts = countFacetValues(entries, facet.id)
        const sort = facet.id === "rarity" || facet.id === "quality" || facet.id === "level" ? "numeric" : "locale"

        // range 类筛选项同样列出实际出现过的取值：让模型知道能填哪些数，
        // 不必去猜「品质」到底是 1~5 还是 1~6。
        // label 只是展示，value 保持原文口径，匹配时两种写法都能命中。
        return { ...facet, label: facetLabel(facet.label, lang), values: toFacetValues(counts, sort, lang) }
    })

    return { module, facets }
}

/**
 * 判断条目是否命中全部筛选条件。
 * @param entry 模块条目
 * @param filters 筛选条件（筛选项 id → 目标取值）
 * @param lang 提问使用的语言（用于把译文取值还原成原文）
 * @returns 是否命中
 */
function matchFacetFilters(entry: DBEntrySummary, filters: Record<string, string | number | boolean>, lang: DBAgentLang): boolean {
    for (const [facetId, rawTarget] of Object.entries(filters)) {
        if (rawTarget === undefined || rawTarget === null || `${rawTarget}`.trim() === "") {
            continue
        }

        const actualValues = entry.facets?.[facetId] ?? []

        // 布尔开关：true 表示「只要具备该特征的条目」，false / 缺省不参与过滤
        if (typeof rawTarget === "boolean") {
            if (rawTarget && actualValues.length === 0) {
                return false
            }

            continue
        }

        const target = resolveDBAgentValue(storyFacetRawValue(`${rawTarget}`.trim()), lang)
        const matched = actualValues.some(value => {
            const raw = storyFacetRawValue(value)

            // 数组型取值（如武器类型「近战 / 单手剑」）允许按其中任意一个命中
            return raw === target || raw.split(/[/、,，]/).some(part => part.trim() === target)
        })

        if (!matched) {
            return false
        }
    }

    return true
}

/**
 * 按模块查询条目明细。
 * @param moduleId 模块标识
 * @param options 查询条件：关键词、版本、筛选项、条数上限、数据语言
 * @returns 命中的条目（关键词与筛选项都缺失时返回该模块前若干条）
 */
export function queryModule(
    moduleId: string,
    options: {
        keyword?: string
        version?: string | number
        limit?: number
        /** 筛选项条件：筛选项 id → 目标取值（取值见 listModuleFilters） */
        filters?: Record<string, string | number | boolean>
        /** 数据语言：决定条目来自哪套数据集，以及名称以哪种语言返回 */
        lang?: DBAgentLang
    } = {}
): { module?: DBModuleSummary; entries: DBEntrySummary[]; total: number; appliedFilters?: Record<string, string | number | boolean> } {
    const adapter = MODULE_ADAPTER_MAP.get(moduleId)

    if (!adapter) {
        return { entries: [], total: 0 }
    }

    const lang = options.lang ?? resolveCurrentDBAgentLang()
    const keyword = options.keyword?.trim() ?? ""
    const version = normalizeVersion(options.version)
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 80)
    const filters = options.filters ?? {}

    const all = adapter.list(lang)
    // 关键词先扩展成「提问语言写法 + 可反查到的原文写法」，其他语言提问才能命中仍是中文原文的数据
    const keywords = expandKeywords(keyword, lang)

    const matched = all.filter(entry => {
        if (version && normalizeVersion(entry.version) !== version) {
            return false
        }

        if (!matchFacetFilters(entry, filters, lang)) {
            return false
        }

        if (!keywords.length) {
            return true
        }

        const haystack = [entry.name, entry.subtitle, entry.version, entry.id].filter(Boolean).join(" ")

        return keywords.some(item => matchKeyword(haystack, item))
    })

    return {
        module: {
            id: adapter.id,
            label: moduleLabel(adapter.labelKey, lang),
            path: adapter.path,
            versioned: adapter.versioned,
            count: all.length,
        },
        entries: matched.slice(0, limit).map(entry => localizeEntry(entry, lang)),
        total: matched.length,
        appliedFilters: Object.keys(filters).length ? filters : undefined,
    }
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
 * 全库关键词检索（覆盖首页模块卡片之外的长尾内容）。
 *
 * 全库索引按界面语言输出标题、且只收录原文与拼音，因此其他语言提问时
 * 要先把词换成原文再检索（否则英文名匹配不到仍是中文的数据），最后把标题翻成目标语言。
 * @param keyword 关键词
 * @param options 查询条件：条数上限、路由前缀过滤（如 /db/char）、数据语言
 * @returns 命中的检索项
 */
export function searchAll(
    keyword: string,
    options: { limit?: number; pathPrefix?: string; lang?: DBAgentLang } = {}
): Array<{ title: string; subtitle?: string; typeLabel: string; path: string }> {
    const lang = options.lang ?? resolveCurrentDBAgentLang()
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
    const service = getGlobalSearchService()
    /** 扩展关键词只取最相关的前几个：每次检索都是全库扫描，不值得为长尾候选反复扫 */
    const keywords = expandKeywords(keyword, lang).slice(0, 4)

    const collected: Array<{ title: string; subtitle?: string; typeLabel: string; path: string }> = []
    const seen = new Set<string>()

    for (const item of keywords) {
        for (const hit of service.search(item, options.pathPrefix ? 120 : limit * 3)) {
            const key = `${hit.path}|${hit.title}`

            if (seen.has(key)) {
                continue
            }

            seen.add(key)
            collected.push(hit)
        }

        if (collected.length >= limit * 3) {
            break
        }
    }

    const filtered = options.pathPrefix ? collected.filter(item => item.path.startsWith(options.pathPrefix!)) : collected

    return filtered.slice(0, limit).map(({ title, subtitle, typeLabel, path }) => ({
        title: translateDBAgentText(title, lang) ?? title,
        subtitle,
        typeLabel,
        path,
    }))
}

/**
 * 汇总某个版本在全部可查模块中新增的内容。
 * @param version 版本号
 * @param lang 数据语言
 * @returns 各模块的新增条目统计
 */
export function listVersionAdditions(
    version: string | number,
    lang: DBAgentLang = resolveCurrentDBAgentLang()
): { version: string; modules: DBVersionAddition[]; note: string } {
    const target = normalizeVersion(version)

    const modules = MODULE_ADAPTERS.filter(adapter => adapter.versioned).map(adapter => {
        const matched = adapter.list(lang).filter(entry => normalizeVersion(entry.version) === target)

        return {
            module: adapter.id,
            label: moduleLabel(adapter.labelKey, lang),
            count: matched.length,
            samples: matched.slice(0, 20).map(entry => translateDBAgentText(entry.name, lang) ?? entry.name),
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
    /** 分组后的任务类型（1/3/5/6，对应主线 / 支线 / 限时 / 活动） */
    questType: number
    /** 任务类型展示名，直接给模型看 */
    questTypeName: string
    /** 篇章名（夜航篇 / 泊暮篇 / 世界纪游），用于按章节过滤 */
    chapterName: string
    /** 主线篇章编号（1 夜航篇、2 泊暮篇），无则 undefined */
    main?: number
    /** 任务链内是否存在印象检定选项 */
    imprCheck: boolean
    /** 任务链内是否存在印象增加选项 */
    imprIncrease: boolean
}

/** 剧情索引缓存：按数据语言缓存，避免重复构建 */
const storyIndexCache = new Map<DBAgentLang, StoryChainIndex[]>()

/**
 * 解析本次检索使用的数据语言：显式指定优先，否则取当前界面语言。
 * @param lang 显式指定的数据语言
 * @returns 数据语言
 */
function resolveSearchLang(lang?: DBAgentLang): DBAgentLang {
    return lang ?? resolveCurrentDBAgentLang()
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
 * 收集单个任务链的全部对话行（含选项分支），同时记录印象检定 / 印象增加的命中情况。
 *
 * 印象标记的判定口径与剧情列表页完全一致：
 * 遍历 `quests[].nodes[].dialogues[].options[]`，选项带 `imprCheck` 即算印象检定，
 * 选项的 `impr[2] > 0` 即算印象增加；只要任务链内任意一个任务命中，整条链就标记为命中。
 * @param chain 任务链
 * @param questItemMap 任务详情映射
 * @returns 对话行列表与印象标记
 */
function collectChainStoryLines(
    chain: QuestChain,
    questItemMap: Map<number, QuestItem>
): { lines: StoryLine[]; imprCheck: boolean; imprIncrease: boolean } {
    const lines: StoryLine[] = []
    let imprCheck = false
    let imprIncrease = false

    const pushDialogue = (questId: number, questName: string, dialogue: Dialogue) => {
        const text = cleanDialogueContent(dialogue.content)

        if (text) {
            lines.push({ questId, questName, speaker: getDialogueSpeaker(dialogue), text })
        }

        for (const option of dialogue.options ?? []) {
            if (option.imprCheck) {
                imprCheck = true
            }
            if (option.impr && option.impr[2] > 0) {
                imprIncrease = true
            }

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

    return { lines, imprCheck, imprIncrease }
}

/**
 * 构建剧情索引（按任务链聚合对话正文），结果按数据语言缓存。
 * @param lang 数据语言
 * @returns 剧情索引
 */
async function buildStoryIndex(lang: DBAgentLang): Promise<StoryChainIndex[]> {
    const cached = storyIndexCache.get(lang)

    if (cached) {
        return cached
    }

    const questStories = (await getQuestDataByLocale(lang)) as QuestStory[]
    const questItemMap = new Map<number, QuestItem>()

    for (const story of questStories) {
        for (const questItem of story.quests) {
            questItemMap.set(questItem.id, questItem)
        }
    }

    const index = questChainData.map(chain => {
        const chapter = `${chain.chapterName} ${chain.chapterNumber || ""}`.trim()
        const { lines, imprCheck, imprIncrease } = collectChainStoryLines(chain, questItemMap)
        const searchText = [chain.name, chapter, chain.episode, ...lines.map(line => `${line.speaker} ${line.text}`)]
            .filter(Boolean)
            .join(" ")
        const questType = resolveQuestTypeGroup(chain.type)

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
            questType,
            questTypeName: getQuestName(questType),
            chapterName: chain.chapterName,
            main: chain.main,
            imprCheck,
            imprIncrease,
        }
    })

    storyIndexCache.set(lang, index)
    return index
}

/**
 * 构建剧情筛选口径下的取值定义（任务类型 / 篇章 / 版本 / 印象标记）。
 *
 * 剧情是 Agent 里唯一「正文检索 + 列表页筛选」双向都要支持的模块：
 * `search_story` 传 `filters` 时按这里的定义匹配，`list_filter_options` 也复用同一份取值。
 * @param index 剧情索引
 * @param lang 取值的展示语言
 * @returns 筛选项定义
 */
function buildStoryFacets(index: StoryChainIndex[], lang: DBAgentLang = "zh"): DBFacetDefinition[] {
    const typeCounts = new Map<string, number>()
    const chapterCounts = new Map<string, number>()
    let imprCheckCount = 0
    let imprIncreaseCount = 0

    for (const entry of index) {
        const typeValue = facetValue(entry.questTypeName)
        typeCounts.set(typeValue, (typeCounts.get(typeValue) ?? 0) + 1)

        const chapterValue = facetValue(entry.chapterName)
        chapterCounts.set(chapterValue, (chapterCounts.get(chapterValue) ?? 0) + 1)

        if (entry.imprCheck) {
            imprCheckCount++
        }
        if (entry.imprIncrease) {
            imprIncreaseCount++
        }
    }

    const typeOrder = [1, 3, 5, 6]
    const values = typeOrder
        .map(group => facetValue(getQuestName(group)))
        .filter(value => (typeCounts.get(value) ?? 0) > 0)
        .map(value => ({ value, label: facetLabel(storyFacetRawValue(value), lang), count: typeCounts.get(value) ?? 0 }))

    return [
        { id: "type", label: facetLabel("任务类型", lang), kind: "enum", values },
        { id: "chapter", label: facetLabel("篇章", lang), kind: "enum", values: toFacetValues(chapterCounts, "locale", lang) },
        {
            id: "imprCheck",
            label: facetLabel("印象检定", lang),
            kind: "boolean",
            values: [],
            description: `只保留含印象检定选项的任务链（当前共 ${imprCheckCount} 条）`,
        },
        {
            id: "imprIncrease",
            label: facetLabel("印象增加", lang),
            kind: "boolean",
            values: [],
            description: `只保留含印象增加选项的任务链（当前共 ${imprIncreaseCount} 条）`,
        },
    ]
}

/**
 * 判断剧情索引条目是否命中筛选条件。
 *
 * 取值容错做得比较宽：类型既接受「主线任务」这样的展示名，也接受 `1` / `3` 这样的原始分组号，
 * 还接受 `1,2` 这种原始类型写法，避免模型因为口径不确定而检索失败。
 * @param entry 剧情索引条目
 * @param filters 筛选条件
 * @param lang 提问使用的语言（用于把译文取值还原成原文）
 * @returns 是否命中
 */
function matchStoryFilters(entry: StoryChainIndex, filters: Record<string, string | number | boolean>, lang: DBAgentLang): boolean {
    for (const [facetId, rawTarget] of Object.entries(filters)) {
        if (rawTarget === undefined || rawTarget === null || `${rawTarget}`.trim() === "") {
            continue
        }

        if (typeof rawTarget === "boolean") {
            if (rawTarget && !(facetId === "imprCheck" ? entry.imprCheck : entry.imprIncrease)) {
                return false
            }

            continue
        }

        const target = resolveDBAgentValue(storyFacetRawValue(`${rawTarget}`.trim()), lang)

        if (facetId === "type") {
            const numeric = Number(target)
            const asGroup = Number.isFinite(numeric) ? resolveQuestTypeGroup(numeric) : Number.NaN

            const matched =
                entry.questTypeName === target ||
                (Number.isFinite(asGroup) && entry.questType === asGroup) ||
                resolveQuestRawTypes(entry.questType).some(rawType => `${rawType}` === target)

            if (!matched) {
                return false
            }

            continue
        }

        if (facetId === "chapter") {
            if (entry.chapterName !== target && entry.chapter !== target) {
                return false
            }

            continue
        }

        if (facetId === "version") {
            if (normalizeVersion(entry.version) !== normalizeVersion(target)) {
                return false
            }

            continue
        }

        // 其余筛选项（main 等）一律按「条目取值等于目标」处理，取不到值即视为不命中
        const actualValues = facetId === "main" ? (entry.main === undefined ? [] : [`${entry.main}`]) : []

        if (!actualValues.includes(target)) {
            return false
        }
    }

    return true
}

/**
 * 把剧情索引条目转成对外返回的命中结构。
 * @param entry 剧情索引条目
 * @param keywords 用于挑选片段的关键词列表（空列表表示不做片段定位）
 * @param snippetLimit 片段数量上限
 * @returns 剧情命中
 */
function toStoryHit(entry: StoryChainIndex, keywords: string[], snippetLimit: number): DBStoryHit {
    const snippets: DBStorySnippet[] = []

    for (const keyword of keywords) {
        if (snippets.length >= snippetLimit) {
            break
        }

        snippets.push(...pickStorySnippets(entry, keyword, snippetLimit - snippets.length))
    }

    return {
        chainId: entry.chainId,
        chainName: entry.chainName,
        chapter: entry.chapter,
        episode: entry.episode,
        version: entry.version,
        questType: entry.questTypeName,
        imprCheck: entry.imprCheck,
        imprIncrease: entry.imprIncrease,
        snippets,
        path: entry.path,
    }
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
 * 剧情检索：按任务链标题/章节/对话正文做模糊检索，再在命中任务链中定位相关对话行。
 *
 * 支持两种调用形态：
 * - 有关键词：按关键词检索，命中后挑选相关台词片段；
 * - 无关键词但带 filters（或只按类型列举）：退化为「按列表页筛选规则列举任务链」，
 *   例如「主线任务有哪些」，此时不返回台词片段。
 * @param keyword 关键词（人名、事件、地点等），可为空串
 * @param options 查询条件：返回任务链数量、每个任务链的片段数量、筛选项条件、数据语言
 * @returns 命中的任务链与对话片段
 */
export async function searchStory(
    keyword: string,
    options: {
        limit?: number
        snippetLimit?: number
        /** 筛选项条件：筛选项 id → 目标取值，取值见 listModuleFilters("questchain") */
        filters?: Record<string, string | number | boolean>
        /** 数据语言：决定读哪一套剧情数据集（中文 / 英文 / 日文 / 韩文 / 法文 / 繁中） */
        lang?: DBAgentLang
    } = {}
): Promise<{ hits: DBStoryHit[]; total: number; note: string }> {
    const trimmed = keyword.trim()
    const filters = options.filters ?? {}
    const hasFilters = Object.keys(filters).length > 0

    if (!trimmed && !hasFilters) {
        return { hits: [], total: 0, note: "关键词与筛选条件都为空，请至少给出关键词或一个筛选项（如 type=主线任务）。" }
    }

    const lang = resolveSearchLang(options.lang)
    const index = await buildStoryIndex(lang)

    const limit = Math.min(Math.max(options.limit ?? 5, 1), 12)
    const snippetLimit = Math.min(Math.max(options.snippetLimit ?? 6, 1), 20)

    // 先把筛选条件收窄成候选集，再在候选集内做关键词检索，避免「筛选后被 limit 截断」造成的漏检
    const scoped = hasFilters ? index.filter(entry => matchStoryFilters(entry, filters, lang)) : index

    const notes: string[] = []

    if (lang !== "zh") {
        notes.push(`剧情数据语言：${lang}`)
    }
    if (hasFilters) {
        notes.push(`已按筛选条件收窄：${JSON.stringify(filters)}，候选任务链 ${scoped.length} 条。`)
    }

    if (!trimmed) {
        const picked = scoped.slice(0, limit)

        return {
            hits: picked.map(entry => toStoryHit(entry, [], snippetLimit)),
            total: scoped.length,
            note: notes.join(" "),
        }
    }

    // 其他语言提问时，关键词与剧情正文可能分属两套语言（任务链名仍是中文原文），
    // 因此扩展成「提问语言写法 + 可反查到的原文写法」后逐个匹配。
    const keywords = expandKeywords(trimmed, lang)

    const fuse = new Fuse(scoped, {
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

    // 精确包含优先：先挑出对话正文里真的出现关键词的任务链，再用模糊检索补齐
    const exact = scoped.filter(entry => keywords.some(item => matchKeyword(entry.searchText, item)))
    const fuzzyHits: StoryChainIndex[] = []

    for (const item of keywords) {
        for (const result of fuse.search(item, { limit })) {
            if (!fuzzyHits.includes(result.item)) {
                fuzzyHits.push(result.item)
            }
        }
    }

    const ordered = [...exact, ...fuzzyHits.filter(entry => !exact.includes(entry))].slice(0, limit)

    return {
        hits: ordered.map(entry => toStoryHit(entry, keywords, snippetLimit)),
        total: exact.length + fuzzyHits.filter(entry => !exact.includes(entry)).length,
        note: notes.join(" "),
    }
}

/**
 * 读取指定任务链的剧情原文（可限定单个任务）。
 * @param chainId 任务链 ID
 * @param options 查询条件：任务 ID、起始行号、行数上限、数据语言
 * @returns 任务链信息与对话行
 */
export async function readStory(
    chainId: number,
    options: { questId?: number; offset?: number; limit?: number; lang?: DBAgentLang } = {}
): Promise<{ chain?: Omit<DBStoryHit, "snippets">; lines: DBStorySnippet[]; total: number }> {
    const index = await buildStoryIndex(resolveSearchLang(options.lang))
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
            questType: entry.questTypeName,
            imprCheck: entry.imprCheck,
            imprIncrease: entry.imprIncrease,
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

/**
 * 列出剧情检索可用的筛选项与取值（对应剧情列表页的筛选行）。
 *
 * 与 `listModuleFilters("questchain")` 的区别：这里给出的是**按剧情正文索引统计**的取值，
 * 包含印象检定 / 印象增加这类需要读对话选项才能得出的筛选项。
 * @param lang 数据语言
 * @returns 剧情筛选项定义
 */
export async function listStoryFilters(
    lang: DBAgentLang = resolveCurrentDBAgentLang()
): Promise<{ facets: DBFacetDefinition[]; total: number }> {
    const index = await buildStoryIndex(lang)

    return { facets: buildStoryFacets(index, lang), total: index.length }
}
