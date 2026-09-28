import Fuse from "fuse.js"
import i18next from "i18next"
import { npcMap } from "@/data/d"
import achievementData from "@/data/d/achievement.data"
import { booksData } from "@/data/d/book.data"
import charData from "@/data/d/char.data"
import { getCachedCharExtData, resolveCharExtLocaleBySetting } from "@/data/d/charext-locale"
import { getCachedCharVoiceData, resolveCharVoiceLocaleBySetting } from "@/data/d/charvoice-locale"
import dungeonsData from "@/data/d/dungeon.data"
import { eventData } from "@/data/d/event.data"
import { fishs } from "@/data/d/fish.data"
import modData from "@/data/d/mod.data"
import monsterData from "@/data/d/monster.data"
import { musicData, musicScoreData } from "@/data/d/music.data"
import { npcData } from "@/data/d/npc.data"
import petData from "@/data/d/pet.data"
import type { Dialogue, QuestItem, QuestStory } from "@/data/d/quest.data"
import questChainData, { type QuestChain, questChain2Version } from "@/data/d/questchain.data"
import { resourceData } from "@/data/d/resource.data"
import { getQuestDataByLocale } from "@/data/d/story-locale"
import { storySummaryData } from "@/data/d/storysummary.data"
import { titleData } from "@/data/d/title.data"
import walnutData from "@/data/d/walnut.data"
import weaponData from "@/data/d/weapon.data"
import { DAMAGE_MODES, DAMAGE_TERMS } from "@/data/damage-mechanics"
import { Faction } from "@/data/game-const"
import { RAG_PROFILE_MODULE } from "@/data/rag/types"
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
import { type DBMapGroup, resolveDBMapGroups } from "@/utils/db-map-utils"
import { getDungeonName, getDungeonRewardNames, getDungeonType } from "@/utils/dungeon-utils"
import { getGlobalSearchService } from "@/utils/global-search"
import { formatModLimit } from "@/utils/mod-limit"
import { getMonsterTagGroupsByMonster } from "@/utils/monster-tag-utils"
import { getNpcDisplayText, hasNpcDialogue, hasNpcImprCheck, hasNpcImprIncrease } from "@/utils/npc-utils"
import { formatParamText } from "@/utils/param-text"
import { getPetQualityName, getPetTypeName } from "@/utils/pet-labels"
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
     * 隐藏检索词：只参与关键词匹配、不随条目返回的补充文本。
     *
     * 用于把「只在详情页出现、列表页看不到」的字段纳入关键词检索
     * （角色生日 / 出生地 / 势力 / CV、武器与资源的描述等），
     * 同时避免这些字段把列表结果的体积撑大。取详情字段请用 readEntry。
     */
    searchText?: string
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
    /**
     * 整条任务链的 AI 剧情总结（`storysummary.data.ts`，只有中文；无总结时不返回）。
     *
     * 只在关键词检索的结果里附带：模型问「这条剧情讲了什么」时一次调用就能拿到脉络，
     * 不必再用 read_story 逐段翻原文。纯筛选列举（无关键词）不带，避免刷屏。
     */
    summary?: string
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
 * 把内部条目投影成对外摘要：本地化展示字段，并剥掉只用于检索的隐藏检索词。
 *
 * `searchText` 必须剥掉——它是给关键词匹配用的（含生日、CV 等详情页字段），
 * 留在返回结构里既撑大工具结果，也会让模型误以为这些字段已经拿到了。
 * @param entry 内部条目
 * @param lang 目标语言
 * @returns 对外摘要
 */
function toEntrySummary(entry: DBEntrySummary, lang: DBAgentLang): DBEntrySummary {
    const localized = localizeEntry(entry, lang)

    return {
        id: localized.id,
        name: localized.name,
        subtitle: localized.subtitle,
        version: localized.version,
        path: localized.path,
        facets: localized.facets,
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
                // 生日 / 出生地 / 势力 / CV 只出现在角色详情页，放进隐藏检索词后
                // 「谁的生日是 11-11」「XX 的日配是谁」这类问法才能在条目检索阶段命中
                searchText: joinParts([
                    item.别名,
                    item.阵营,
                    item.出生地,
                    item.势力,
                    item.生日,
                    item.中文CV,
                    item.日文CV,
                    item.英文CV,
                    item.韩文CV,
                ]),
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
        id: RAG_PROFILE_MODULE,
        labelKey: "database.charprofile",
        /** 档案在角色详情页的「档案」标签下展示，没有独立列表页 */
        path: "/db/char",
        versioned: false,
        facets: [{ id: "char", label: "角色", kind: "enum", values: [] }],
        list: lang => buildCharProfileEntries(lang ?? "zh"),
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
                // 武器描述只在详情页出现，放进隐藏检索词以支持「哪把武器提到了 XX」这类问法
                searchText: item.描述,
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
                // 任务链简介与详情只在详情页出现，放进隐藏检索词便于按剧情梗概检索
                searchText: joinParts([item.desc, item.detail]),
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
        id: "npc",
        labelKey: "database.npc",
        path: "/db/npc",
        versioned: false,
        /**
         * 与 NPC 列表页一致：印象检定 / 印象增加 / 有对话（列表页上的三个开关）。
         *
         * 这三个是布尔筛选项，条目上必须有对应取值才筛得出来——`matchFacetFilters`
         * 对布尔条件是「取值集合为空即不命中」。
         */
        facets: [
            { id: "imprCheck", label: "印象检定", kind: "boolean", values: [], description: "只保留含印象检定选项的 NPC" },
            { id: "imprIncrease", label: "印象增加", kind: "boolean", values: [], description: "只保留含印象增加选项的 NPC" },
            { id: "dialogue", label: "有对话", kind: "boolean", values: [], description: "只保留有分支对话的 NPC" },
        ],
        list: () =>
            npcData.map(item => ({
                id: item.id,
                name: getNpcDisplayText(item),
                // 「有坐标」是回答「XX 在哪」的前提：这类 NPC 才能在 DBMapLink 里跳转
                subtitle: joinParts([
                    item.camp,
                    item.type,
                    item.talks?.length ? `${item.talks.length} 条对话` : undefined,
                    item.pos && item.srId ? "有坐标" : undefined,
                ]),
                path: `/db/npc/${item.id}`,
                facets: {
                    // 布尔筛选项只看取值集合是否为空，取值本身不展示
                    imprCheck: hasNpcImprCheck(item) ? [facetValue(1)] : [],
                    imprIncrease: hasNpcImprIncrease(item) ? [facetValue(1)] : [],
                    dialogue: hasNpcDialogue(item) ? [facetValue(1)] : [],
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
                // 资源描述（用途、设定文案）只在详情页出现，放进隐藏检索词便于按描述检索
                searchText: joinParts([item.desc, item.desc2]),
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
 * 构建角色档案模块的条目。
 *
 * 档案与语音一样是「按语言切分的独立数据集」，因此条目内容取决于 lang（六种语言齐备）；
 * 条目挂到角色详情页（档案在该页的「档案」标签下展示）。
 * @param lang 数据语言
 * @returns 该模块的条目列表
 */
function buildCharProfileEntries(lang: DBAgentLang): DBEntrySummary[] {
    const data = getCachedCharExtData(resolveCharExtLocaleBySetting(lang))
    const cached = localizedEntryCache.get(data)

    if (cached) {
        return cached
    }

    const entries = data.map(item => {
        const charName = charNameMap.get(item.charId) ?? ""
        const text = cleanDialogueContent(item.text)

        return {
            id: item.id,
            name: item.name,
            // 档案名在各角色间高度重复（如「见证·其一」被多个角色共用），副信息里必须带上角色名，
            // 否则条目列表看起来全是同名条目，模型也无法判断这条档案属于谁
            subtitle: joinParts([charName, oneLine(cleanDialogueContent(item.unlock)), summarizeText(text)]),
            path: `/db/char/${item.charId}`,
            // 正文进隐藏检索词：「哪条档案提到过 X」这类问法要在条目检索阶段就能命中，
            // 而正文会撑大条目摘要，因此只参与匹配、不随条目返回（取全文用 readEntry）
            searchText: joinParts([charName, text]),
            facets: {
                char: charName ? [facetValue(charName), facetValue(item.charId)] : [facetValue(item.charId)],
            },
        }
    })

    localizedEntryCache.set(data, entries)

    return entries
}

/**
 * 把多行文本压成单行：档案解锁条件里带换行（如「角色等级达到50级\n完成任务：…」），
 * 直接放进条目副信息会在列表里断成两行。
 * @param text 原始文本
 * @returns 单行文本
 */
function oneLine(text: string): string {
    return text.replace(/\s+/g, " ").trim()
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

        const haystack = [entry.name, entry.subtitle, entry.searchText, entry.version, entry.id].filter(Boolean).join(" ")

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
        entries: matched.slice(0, limit).map(entry => toEntrySummary(entry, lang)),
        total: matched.length,
        appliedFilters: Object.keys(filters).length ? filters : undefined,
    }
}

/**
 * 条目详情里单个字段的取值：短标量或短列表。
 *
 * 比例类字段一律在读取时折算成百分比文本（0.25 → 25%），避免模型把小数当绝对数值引用。
 */
export type DBEntryFieldValue = string | number | Array<string | number>

/** 条目详情字段表：键为资料库详情页上的字段名 */
export type DBEntryFields = Record<string, DBEntryFieldValue>

/** 单条资料的完整字段（{@link readEntry} 的返回值） */
export interface DBEntryDetail {
    /** 条目 id */
    id: number | string
    /** 条目名称 */
    name: string
    /** 副信息（与列表页展示一致） */
    subtitle?: string
    /** 版本号 */
    version?: string
    /** 详情页路由 */
    path: string
    /** 详情页上的字段：键为页面上的字段名，值为可读文本 */
    fields: DBEntryFields
}

/** 详情字段规格：字符串表示「展示名与数据键同名」，元组表示「展示名 + 数据键」 */
type DBDetailFieldSpec = string | readonly [label: string, key: string]

/** 模块详情字段读取器：按条目 id 取该模块详情页上的字段 */
type DBEntryDetailReader = (id: string, lang: DBAgentLang) => DBEntryFields | undefined

/** 详情字段里说明类文本的截断长度 */
const DETAIL_TEXT_LIMIT = 240

/** 详情字段里正文类字段（台词、技能描述、溯源等）的截断长度 */
const DETAIL_LONG_TEXT_LIMIT = 600

/**
 * 截断详情字段里的文本。
 * @param text 原始文本
 * @param limit 长度上限
 * @returns 截断后的文本；空文本返回 undefined
 */
function summarizeDetailText(text: string | undefined, limit = DETAIL_TEXT_LIMIT): string | undefined {
    const trimmed = text?.trim()

    if (!trimmed) {
        return undefined
    }

    return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed
}

/**
 * 归一化字段取值：只保留短标量与同类短列表，长文本按上限截断，空值丢弃。
 *
 * 丢弃空值是必须的：工具结果里出现一串空字段，模型会读成「该字段在资料库里是空的」，
 * 而实际含义是「这条资料没有这个字段」。
 * @param value 原始取值
 * @param lang 数据语言（字符串取值按它翻译，未收录译文时保留原文）
 * @returns 归一化后的取值
 */
function normalizeFieldValue(value: unknown, lang: DBAgentLang): DBEntryFieldValue | undefined {
    if (typeof value === "string") {
        const text = summarizeDetailText(value)

        return text === undefined ? undefined : (translateDBAgentText(text, lang) ?? text)
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined
    }

    if (Array.isArray(value)) {
        const parts = value
            .map(item => {
                if (typeof item === "number") {
                    return Number.isFinite(item) ? item : undefined
                }

                if (typeof item === "string") {
                    const text = summarizeDetailText(item)

                    return text === undefined ? undefined : (translateDBAgentText(text, lang) ?? text)
                }

                return undefined
            })
            .filter((item): item is string | number => item !== undefined)

        return parts.length ? parts : undefined
    }

    return undefined
}

/**
 * 从原始条目上摘取字段。
 * @param item 原始条目
 * @param specs 字段规格
 * @param lang 数据语言
 * @returns 字段表（取不到值的字段不会出现）
 */
function pickFields(item: object, specs: readonly DBDetailFieldSpec[], lang: DBAgentLang): DBEntryFields {
    const source = item as Record<string, unknown>
    const fields: DBEntryFields = {}

    for (const spec of specs) {
        const [label, key] = typeof spec === "string" ? [spec, spec] : spec
        const value = normalizeFieldValue(source[key], lang)

        if (value !== undefined) {
            fields[label] = value
        }
    }

    return fields
}

/**
 * 把小数形式的比例写成百分比文本。
 * @param value 比例（0.25 → 25%）
 * @returns 百分比文本
 */
function formatPercent(value: number): string {
    return `${Number((value * 100).toFixed(2))}%`
}

/**
 * 摘取「名称 → 数量」表里的条目（突破材料、成就奖励等）。
 * @param record 名称与数量的映射
 * @returns 「名称×数量」列表
 */
function formatCountRecord(record: Record<string, number | undefined> | undefined): string[] | undefined {
    const parts = Object.entries(record ?? {})
        .filter(([, count]) => typeof count === "number" && Number.isFinite(count) && count > 0)
        .map(([name, count]) => `${name}×${count}`)

    return parts.length ? parts : undefined
}

/**
 * 摘取「属性名 → 数值」表里的条目（角色 / 武器的加成、魔之楔的词条属性）。
 *
 * 数值一律按带符号的百分比呈现（0.15 → +15%）：这类字段在数据里是比例，
 * 直接给小数会让模型把 0.15 读成绝对数值。
 * @param record 属性表
 * @returns 「属性名 +数值%」列表
 */
function formatBonusRecord(record: Record<string, number | undefined> | undefined): string[] | undefined {
    const parts = Object.entries(record ?? {})
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value !== 0)
        .map(([name, value]) => {
            const amount = value as number

            return `${name} ${amount >= 0 ? "+" : ""}${formatPercent(amount)}`
        })

    return parts.length ? parts : undefined
}

/** 突破阶段的罗马数字序号（与资料库武器详情页的写法一致） */
const BREAKTHROUGH_STAGE_LABELS = ["I", "II", "III", "IV", "V", "VI"]

/**
 * 摘取突破材料表。
 * @param stages 各突破阶段的材料（下标即阶段）
 * @returns 「突破 I：材料×数量、…」列表
 */
function formatBreakthroughStages(stages: Array<Record<string, number>> | undefined): string[] | undefined {
    if (!stages?.length) {
        return undefined
    }

    return stages.map(
        (stage, index) => `突破 ${BREAKTHROUGH_STAGE_LABELS[index] ?? index + 1}：${formatCountRecord(stage)?.join("、") ?? "无"}`
    )
}

/**
 * 格式化技能行：`名称（类型）：描述`。
 * @param skill 技能（角色技能 / 武器技能 / 同律武器技能）
 * @param lang 数据语言
 * @returns 技能行文本
 */
function formatSkillLine(skill: { 名称?: string; 类型?: string; 描述?: string }, lang: DBAgentLang): string {
    const name = translateDBAgentText(skill.名称, lang) ?? skill.名称 ?? ""
    const type = translateDBAgentText(skill.类型, lang) ?? skill.类型 ?? ""
    const desc = summarizeDetailText(translateDBAgentText(skill.描述, lang) ?? skill.描述, DETAIL_LONG_TEXT_LIMIT)
    const head = name && type ? `${name}（${type}）` : name || type

    return desc ? `${head}：${desc}` : head
}

/**
 * 详情字段里位置清单的条数上限。
 *
 * 同名资源可能有数十个子区域（`resource.source`），全部展开会把工具结果撑爆；
 * 超出的部分只在末项上报数量。跳转与逐点查看交给 `DBMapLink` 组件。
 */
const MAX_LOCATION_ITEMS = 20

/**
 * 把地图位置折成可读文本行。
 *
 * 与 `DBMapLink` 共用 `resolveDBMapGroups` 的分组口径，因此文字位置与卡片上的
 * 跳转行一一对应：读物按页拆分，资源按子区域聚合。
 * @param groups 位置分组
 * @param lang 数据语言
 * @param withLabel 是否在行首带上位置归属名（读物的页名）
 * @returns 文本行列表；没有位置时返回 undefined
 */
function formatMapLocations(groups: DBMapGroup[], lang: DBAgentLang, withLabel = false): string[] | undefined {
    if (!groups.length) {
        return undefined
    }

    const items: string[] = []

    for (const group of groups.slice(0, MAX_LOCATION_ITEMS)) {
        const point = group.points[0]

        if (!point) {
            continue
        }

        const region = translateDBAgentText(group.regionName, lang) ?? group.regionName
        const subRegion = translateDBAgentText(group.subRegionName, lang) ?? group.subRegionName
        const place = region === subRegion ? region : `${region}·${subRegion}`
        const count = group.points.length > 1 ? `（共 ${group.points.length} 处）` : ""

        items.push(
            `${withLabel ? `${translateDBAgentText(group.label, lang) ?? group.label}：` : ""}${place} (${point[0]}, ${point[1]})${count}`
        )
    }

    const hidden = groups.length - items.length

    if (hidden > 0) {
        items.push(`另有 ${hidden} 处未列出`)
    }

    return items.length ? items : undefined
}

/**
 * 角色详情字段：档案（生日 / 出生地 / 势力 / 四国 CV 等）、面板基础值、技能与特质、突破材料。
 * @param id 角色 id
 * @param lang 数据语言
 * @returns 字段表；角色不存在时返回 undefined
 */
function readCharDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const char = charData.find(item => `${item.id}` === id)

    if (!char) {
        return undefined
    }

    const fields = pickFields(
        char,
        [
            "别名",
            "版本",
            "属性",
            "阵营",
            "势力",
            "出生地",
            "生日",
            "中文CV",
            "日文CV",
            "英文CV",
            "韩文CV",
            "精通",
            "额外精通",
            "标签",
            "基础攻击",
            "基础生命",
            "基础防御",
            "基础护盾",
            "基础神智",
        ],
        lang
    )

    const bonus = formatBonusRecord(char.加成)
    if (bonus) {
        fields.加成 = bonus
    }

    const breakthrough = formatBreakthroughStages(char.突破)
    if (breakthrough) {
        fields.突破材料 = breakthrough
    }

    if (char.技能?.length) {
        fields.技能 = char.技能.map(skill => formatSkillLine(skill, lang))
    }

    if (char.特质?.length) {
        fields.特质 = char.特质.map(trait => {
            const name = translateDBAgentText(trait.名称, lang) ?? trait.名称
            const desc = summarizeDetailText(translateDBAgentText(trait.描述, lang) ?? trait.描述)
            const level = trait.等级 > 1 ? `（${trait.等级} 级）` : ""

            return desc ? `${name}${level}：${desc}` : `${name}${level}`
        })
    }

    if (char.同律武器?.length) {
        fields.同律武器 = char.同律武器.map(weapon => translateDBAgentText(weapon.名称, lang) ?? weapon.名称)
    }

    const traces = (char.溯源 ?? [])
        .map(text => summarizeDetailText(translateDBAgentText(text, lang) ?? text, DETAIL_LONG_TEXT_LIMIT))
        .filter((text): text is string => !!text)

    if (traces.length) {
        fields.溯源 = traces
    }

    const exclusive = char.专武 === undefined ? undefined : weaponData.find(weapon => weapon.id === char.专武)
    if (exclusive) {
        fields.专武 = `${translateDBAgentText(exclusive.名称, lang) ?? exclusive.名称}（/db/weapon/${exclusive.id}）`
    }

    // 角色碎片即「思绪片段·XXX」资源，获取方式挂在资源详情页上
    const fragment = char.碎片 === undefined ? undefined : resourceData.find(item => item.id === char.碎片)
    if (fragment) {
        fields.碎片 = `${translateDBAgentText(fragment.name, lang) ?? fragment.name}（/db/resource/${fragment.id}）`
    }

    // 档案条目挂在角色详情页的「档案」标签下（不在本模块的字段里）：这里只列清单与 id，
    // 正文用 read_entry 取 charprofile 模块，避免把几万字档案塞进角色详情
    const profiles = getCachedCharExtData(resolveCharExtLocaleBySetting(lang)).filter(item => item.charId === char.id)

    if (profiles.length) {
        fields.档案条目 = profiles.map(item => `${item.name}（id ${item.id}）`)
    }

    return fields
}

/**
 * 武器详情字段：描述、面板数值（暴击 / 暴伤 / 触发折算成百分比）、技能、熔炼文案与突破材料。
 * @param id 武器 id
 * @param lang 数据语言
 * @returns 字段表；武器不存在时返回 undefined
 */
function readWeaponDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const weapon = weaponData.find(item => `${item.id}` === id)

    if (!weapon) {
        return undefined
    }

    const fields = pickFields(
        weapon,
        ["版本", "描述", "类型", "伤害类型", "攻击", "弹匣", "最大弹药", "弹药转化率", "最大射程", "射击间隔", "弹道类型", "装填"],
        lang
    )

    // 暴击 / 暴伤 / 触发在数据里是小数，写成百分比才能与游戏面板对上（0.25 → 25%）
    fields.暴击 = formatPercent(weapon.暴击)
    fields.暴伤 = formatPercent(weapon.暴伤)
    fields.触发 = formatPercent(weapon.触发)

    const bonus = formatBonusRecord(weapon.加成)
    if (bonus) {
        fields.加成 = bonus
    }

    const breakthrough = formatBreakthroughStages(weapon.突破)
    if (breakthrough) {
        fields.突破材料 = breakthrough
    }

    if (weapon.技能?.length) {
        fields.技能 = weapon.技能.map(skill => formatSkillLine(skill, lang))
    }

    const translate = (text: string) => translateDBAgentText(text, lang) ?? text
    const firstRefine = summarizeDetailText(formatParamText(weapon.熔炼, 0, translate), DETAIL_LONG_TEXT_LIMIT)
    const maxRefine = summarizeDetailText(formatParamText(weapon.熔炼, 999, translate), DETAIL_LONG_TEXT_LIMIT)

    if (firstRefine) {
        fields["熔炼（精炼1）"] = firstRefine
    }

    if (maxRefine && maxRefine !== firstRefine) {
        fields["熔炼（满精炼）"] = maxRefine
    }

    return fields
}

/** 魔之楔条目上的元信息键：其余键即词条属性（与 `LeveledMod._exclude_properties` 同口径） */
const MOD_META_KEYS = new Set([
    "id",
    "icon",
    "名称",
    "版本",
    "系列",
    "品质",
    "极性",
    "属性",
    "耐受",
    "类型",
    "限定",
    "描述",
    "效果",
    "消耗",
    "技能替换",
    "buff",
    "生效",
])

/**
 * 魔之楔详情字段：分类信息、满级词条属性、效果文案（1 级与满级）与技能替换。
 * @param id 魔之楔 id
 * @param lang 数据语言
 * @returns 字段表；魔之楔不存在时返回 undefined
 */
function readModDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const mod = modData.find(item => `${item.id}` === id)

    if (!mod) {
        return undefined
    }

    const fields = pickFields(mod, ["版本", "系列", "类型", "品质", "极性", "属性", "耐受", "消耗"], lang)

    const limit = formatModLimit(mod.限定)
    if (limit) {
        fields.限定 = translateDBAgentText(limit, lang) ?? limit
    }

    // 词条属性直接挂在条目上；数据里的取值是满级数值，小数即比例
    const attributes = Object.fromEntries(
        Object.entries(mod as Record<string, unknown>).filter(([key, value]) => !MOD_META_KEYS.has(key) && typeof value === "number")
    ) as Record<string, number>
    const attrText = formatBonusRecord(attributes)

    if (attrText) {
        fields["词条属性（满级）"] = attrText
    }

    const translate = (text: string) => translateDBAgentText(text, lang) ?? text
    const effectFirst = summarizeDetailText(formatParamText(mod.效果, 0, translate), DETAIL_LONG_TEXT_LIMIT)
    const effectMax = summarizeDetailText(formatParamText(mod.效果, 999, translate), DETAIL_LONG_TEXT_LIMIT)

    if (effectFirst) {
        fields["效果（1级）"] = effectFirst
    }

    if (effectMax && effectMax !== effectFirst) {
        fields["效果（满级）"] = effectMax
    }

    if (mod.技能替换) {
        fields.技能替换 = Object.values(mod.技能替换).map(skill => translateDBAgentText(skill.名称, lang) ?? skill.名称)
    }

    // 条件属性（`生效`）只在条件成立时计入面板，它的数值不包含在上面的词条属性里
    const condition = mod.生效?.条件 as Array<[string, string, number]> | undefined
    if (condition?.length) {
        const conditionSource = mod.生效 as Record<string, number | undefined>
        const conditionalProps: Record<string, number | undefined> = {}

        for (const [key, value] of Object.entries(conditionSource)) {
            if (key !== "条件" && typeof value === "number") {
                conditionalProps[key] = value
            }
        }

        const conditionText = condition.map(([attribute, operator, value]) => `${attribute} ${operator} ${value}`).join(" 且 ")
        const propText = formatBonusRecord(conditionalProps)?.join("、")

        fields.条件属性 = propText ? `${conditionText} 时：${propText}` : conditionText
    }

    return fields
}

/**
 * 成就详情字段：分类、品质、达成条件（描述）与奖励。
 * @param id 成就 id
 * @param lang 数据语言
 * @returns 字段表；成就不存在时返回 undefined
 */
function readAchievementDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const achievement = achievementData.find(item => `${item.id}` === id)

    if (!achievement) {
        return undefined
    }

    const fields = pickFields(achievement, ["版本", "分类", "品质", "描述"], lang)
    const reward = formatCountRecord(achievement.奖励)

    if (reward) {
        fields.奖励 = reward
    }

    return fields
}

/**
 * 任务链详情字段：篇章 / 章节 / 类型 / 版本等列表页字段，加上简介、详情与奖励组。
 *
 * 台词原文不在这一层：那部分由 read_story 提供。
 * @param id 任务链 id
 * @param lang 数据语言
 * @returns 字段表；任务链不存在时返回 undefined
 */
function readQuestChainDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const chain = questChainData.find(item => `${item.id}` === id)

    if (!chain) {
        return undefined
    }

    const fields = pickFields(
        chain,
        [
            ["简介", "desc"],
            ["详情", "detail"],
        ],
        lang
    )

    fields.篇章 = facetLabel(chain.chapterName, lang)
    fields.章节 = facetLabel(chain.episode, lang)
    fields.任务类型 = facetLabel(getQuestName(resolveQuestTypeGroup(chain.type)), lang)
    fields.任务数 = chain.quests.length
    fields.任务id = chain.quests.map(quest => quest.id)

    if (chain.chapterNumber) {
        fields.章节号 = facetLabel(chain.chapterNumber, lang)
    }

    const version = getQuestChainVersion(chain)
    if (version) {
        fields.版本 = version
    }

    const timeRange = chain.startTime ? formatTimeRange(chain.startTime, chain.endTime ?? null) : ""
    if (timeRange) {
        fields.活动时间 = timeRange
    }

    if (chain.reward?.length) {
        fields.奖励组 = [...chain.reward]
    }

    const npc = chain.npc === undefined ? undefined : npcMap.get(chain.npc)
    if (npc?.name) {
        fields.关联NPC = replaceStoryPlaceholders(npc.name, DEFAULT_STORY_TEXT_CONFIG)
    }

    return fields
}

/**
 * 活动详情字段：起止时间、描述、规则与玩法规模。
 * @param id 活动 id
 * @param lang 数据语言
 * @returns 字段表；活动不存在时返回 undefined
 */
function readEventDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const event = eventData.find(item => `${item.id}` === id)

    if (!event) {
        return undefined
    }

    const fields = pickFields(
        event,
        [
            ["描述", "desc"],
            ["规则", "rule"],
        ],
        lang
    )

    const timeRange = formatTimeRange(event.startTime, event.endTime ?? null)
    if (timeRange) {
        fields.活动时间 = timeRange
    }

    if (event.signIn) {
        fields.签到天数 = event.signIn.duration
    }

    if (event.onlineTime?.length) {
        fields.在线奖励档位 = event.onlineTime.map(entry => `累计 ${entry.target} 分钟：奖励组 ${entry.reward}`)
    }

    if (event.photoTasks?.length) {
        fields.拍照任务数 = event.photoTasks.length
    }

    if (event.boxDrop) {
        fields.宝箱玩法 = `每日上限 ${event.boxDrop.boxPerDay} 个、单箱 ${event.boxDrop.coinPerBox} 代币，奖励组 ${event.boxDrop.rewardId.join("、")}`
    }

    return fields
}

/**
 * 副本详情字段：副本类型、等级、波次、描述与掉落概览。
 * @param id 副本 id
 * @param lang 数据语言
 * @returns 字段表；副本不存在时返回 undefined
 */
function readDungeonDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const dungeon = dungeonsData.find(item => `${item.id}` === id)

    if (!dungeon) {
        return undefined
    }

    const fields = pickFields(
        dungeon,
        [
            ["等级", "lv"],
            ["元素", "e"],
            ["波次", "waves"],
            ["描述", "desc"],
        ],
        lang
    )

    fields.副本类型 = facetLabel(getDungeonType(dungeon.t).label, lang)

    if (dungeon.rush) {
        fields.精英副本 = "是"
    }

    const rewards = getDungeonRewardNames(dungeon)
    if (rewards) {
        fields.掉落 = facetLabel(rewards, lang)
    }

    return fields
}

/**
 * 怪物详情字段：类型、阵营、四维数值与号令者词条。
 * @param id 怪物 id
 * @param lang 数据语言
 * @returns 字段表；怪物不存在时返回 undefined
 */
function readMonsterDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const monster = monsterData.find(item => `${item.id}` === id)

    if (!monster) {
        return undefined
    }

    const fields = pickFields(
        monster,
        [
            ["攻击", "atk"],
            ["防御", "def"],
            ["生命", "hp"],
            ["护盾", "es"],
            ["韧性", "tn"],
        ],
        lang
    )

    fields.类型 = MONSTER_TYPE_LABELS[monster.t ?? ""] ?? "普通"

    if (monster.f !== undefined) {
        fields.阵营 = facetLabel(Faction[monster.f] ?? `${monster.f}`, lang)
    }

    const tagNames = getMonsterTagGroupsByMonster(monster).map(group => group.name)
    if (tagNames.length) {
        fields.号令者词条 = tagNames.map(name => facetLabel(name, lang))
    }

    return fields
}

/**
 * NPC 详情字段：阵营、类型、关联角色、分支对话数与所在坐标。
 *
 * 坐标来自 `NPC.pos` / `NPC.srId`（与资料库 NPC 详情页的「坐标」一格同源），
 * 是「某个 NPC 在哪」类提问的答案来源；没有坐标的 NPC 不产出该字段。
 * @param id NPC id
 * @param lang 数据语言
 * @returns 字段表；NPC 不存在时返回 undefined
 */
function readNpcDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const npc = npcData.find(item => `${item.id}` === id)

    if (!npc) {
        return undefined
    }

    const fields = pickFields(
        npc,
        [
            ["阵营", "camp"],
            ["类型", "type"],
            ["角色id", "charId"],
            ["图标", "icon"],
        ],
        lang
    )

    if (npc.talks?.length) {
        fields.分支对话 = `${npc.talks.length} 条`
    }

    const locations = formatMapLocations(resolveDBMapGroups({ kind: "npc", id: npc.id }), lang, true)

    if (locations) {
        fields.坐标 = locations
    }

    return fields
}

/**
 * 资源详情字段：稀有度、描述与采集位置。
 *
 * 采集位置是「这东西在哪」类提问唯一的答案来源：`resource.source[].pos` 是世界坐标，
 * 按子区域聚合后与 `DBMapLink` 的跳转行一致。
 * @param id 资源 id
 * @param lang 数据语言
 * @returns 字段表；资源不存在时返回 undefined
 */
function readResourceDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const resource = resourceData.find(item => `${item.id}` === id)

    if (!resource) {
        return undefined
    }

    const fields = pickFields(
        resource,
        [
            ["稀有度", "rarity"],
            ["描述", "desc"],
            ["描述2", "desc2"],
        ],
        lang
    )

    const locations = formatMapLocations(resolveDBMapGroups({ kind: "resource", id: resource.id }), lang)

    if (locations) {
        fields.采集位置 = locations
    }

    return fields
}

/**
 * 魔灵详情字段：品质 / 类型（折算成展示名）、成长数值与技能文案。
 * @param id 魔灵 id
 * @param lang 数据语言
 * @returns 字段表；魔灵不存在时返回 undefined
 */
function readPetDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const pet = petData.find(item => `${item.id}` === id)

    if (!pet) {
        return undefined
    }

    const fields = pickFields(pet, ["描述", "最大等级", "捕获经验", "经验"], lang)

    fields.品质 = facetLabel(getPetQualityName(pet.品质), lang)
    fields.类型 = facetLabel(getPetTypeName(pet.类型), lang)

    /** 把魔灵技能折成一行：技能名（cd）+ 描述 */
    for (const [label, skill] of [
        ["主动技能", pet.主动],
        ["被动技能", pet.被动],
    ] as const) {
        if (!skill?.描述) {
            continue
        }

        const cd = skill.cd ? `（CD ${skill.cd} 秒）` : ""
        const desc = summarizeDetailText(translateDBAgentText(skill.描述, lang) ?? skill.描述, DETAIL_LONG_TEXT_LIMIT)

        fields[label] = `${cd}${desc}`
    }

    return fields
}

/**
 * 委托密函详情字段：稀有度、类型、获取途径与奖励。
 * @param id 密函 id
 * @param lang 数据语言
 * @returns 字段表；密函不存在时返回 undefined
 */
function readWalnutDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const walnut = walnutData.find(item => `${item.id}` === id)

    if (!walnut) {
        return undefined
    }

    const fields = pickFields(walnut, ["稀有度", "类型", "模式", "获取途径"], lang)
    const rewards = walnut.奖励
        ?.filter(item => Number.isFinite(item.count) && item.count > 0)
        .map(item => `${translateDBAgentText(item.name, lang) ?? item.name}×${item.count}`)

    if (rewards?.length) {
        fields.奖励 = rewards
    }

    return fields
}

/**
 * 称号详情字段：来源与摆放位置（前缀 / 后缀）。
 * @param id 称号 id
 * @param lang 数据语言
 * @returns 字段表；称号不存在时返回 undefined
 */
function readTitleDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const title = titleData.find(item => `${item.id}` === id)

    if (!title) {
        return undefined
    }

    const fields = pickFields(title, [["来源", "src"]], lang)
    fields.位置 = title.suf ? "后缀" : "前缀"

    return fields
}

/**
 * 读物详情字段：描述、收录内容清单与各页的位置。
 *
 * 读物正文在详情页阅读，这里不给全文；但「收录内容」里的每一页都有书页坐标与藏宝点坐标
 * （`BookResource.pos` / `treasurePos`），是「这本书/这页在哪」类提问的答案来源。
 * @param id 读物 id
 * @param lang 数据语言
 * @returns 字段表；读物不存在时返回 undefined
 */
function readBookDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const book = booksData.find(item => `${item.id}` === id)

    if (!book) {
        return undefined
    }

    const fields = pickFields(book, ["描述"], lang)

    if (book.res?.length) {
        fields.收录内容 = book.res.map(item => {
            const name = translateDBAgentText(item.name ?? book.name, lang) ?? item.name ?? book.name

            return item.type ? `${name}（${item.type}）` : name
        })
    }

    const pages = formatMapLocations(resolveDBMapGroups({ kind: "book", id: book.id, part: "page" }), lang, true)
    const treasures = formatMapLocations(resolveDBMapGroups({ kind: "book", id: book.id, part: "treasure" }), lang, true)

    if (pages) {
        fields.书页位置 = pages
    }

    if (treasures) {
        fields.宝藏位置 = treasures
    }

    return fields
}

/**
 * 乐谱详情字段：描述与所属专辑。
 * @param id 乐谱 id
 * @param lang 数据语言
 * @returns 字段表；乐谱不存在时返回 undefined
 */
function readMusicDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const music = musicData.find(item => `${item.id}` === id)

    if (!music) {
        return undefined
    }

    const fields = pickFields(music, ["描述"], lang)
    const album = musicScoreData.find(score => score.id === music.scoreId)

    if (album) {
        fields.专辑 = translateDBAgentText(album.name, lang) ?? album.name
    }

    return fields
}

/** 鱼的出现时段（1 上午 / 2 下午 / 3 夜晚） */
const FISH_PERIOD_LABELS: Record<number, string> = {
    1: "上午",
    2: "下午",
    3: "夜晚",
}

/**
 * 鱼详情字段：等级、稀有度、长度 / 价格区间、出现时段与变异信息。
 * @param id 鱼 id
 * @param lang 数据语言
 * @returns 字段表；鱼不存在时返回 undefined
 */
function readFishDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const fish = fishs.find(item => `${item.id}` === id)

    if (!fish) {
        return undefined
    }

    const fields = pickFields(
        fish,
        [
            ["等级", "level"],
            ["稀有度", "rarity"],
        ],
        lang
    )

    fields.类型 = fish.type === 3 ? "稀有鱼" : "普通鱼"

    if (fish.length?.length >= 2) {
        fields.长度 = `${fish.length[0]}~${fish.length[1]}`
    }

    if (typeof fish.price?.[0] === "number") {
        fields.参考价格 = fish.price[0]
    }

    if (fish.appear?.length) {
        fields.出现时间 = fish.appear.map(period => FISH_PERIOD_LABELS[period] ?? `${period}`)
    }

    if (typeof fish.varProb === "number") {
        fields.变异概率 = formatPercent(fish.varProb)
    }

    return fields
}

/**
 * 角色语音详情字段：所属角色与完整台词（列表页只给台词摘要）。
 * @param id 语音 id
 * @param lang 数据语言
 * @returns 字段表；语音不存在时返回 undefined
 */
function readCharVoiceDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const voice = getCachedCharVoiceData(resolveCharVoiceLocaleBySetting(lang)).find(item => `${item.id}` === id)

    if (!voice) {
        return undefined
    }

    const charName = charNameMap.get(voice.charId)
    const text = summarizeDetailText(voice.text, DETAIL_LONG_TEXT_LIMIT)
    const fields: DBEntryFields = { 语音: voice.name }

    if (charName) {
        fields.角色 = `${charName}（/db/char/${voice.charId}）`
    }

    if (text) {
        fields.台词 = text
    }

    return fields
}

/**
 * 角色档案详情字段：所属角色、档案名、解锁条件与整篇档案正文。
 *
 * 正文**不截断**：档案本身就是这一条目的全部内容（实测 517 条里最长的 2,877 字），
 * 按其他长文本的 600 字口径截断会把叙事拦腰砍断，而 read_entry 是模型专门为它发起的调用。
 * @param id 档案 id
 * @param lang 数据语言
 * @returns 字段表；档案不存在时返回 undefined
 */
function readCharProfileDetailFields(id: string, lang: DBAgentLang): DBEntryFields | undefined {
    const profile = getCachedCharExtData(resolveCharExtLocaleBySetting(lang)).find(item => `${item.id}` === id)

    if (!profile) {
        return undefined
    }

    const fields: DBEntryFields = { 档案: profile.name }
    const charName = charNameMap.get(profile.charId)

    if (charName) {
        fields.角色 = `${charName}（/db/char/${profile.charId}）`
    }

    const unlock = cleanDialogueContent(profile.unlock)

    if (unlock) {
        fields.解锁条件 = unlock
    }

    // 正文与角色详情页「档案」标签同口径清洗（去样式标签、替换昵称与性别占位符）
    const text = cleanDialogueContent(profile.text)

    if (text) {
        fields.正文 = text
    }

    return fields
}

/** 伤害机制条目里术语条目的 id 前缀 */
const DAMAGE_TERM_PREFIX = "term:"
/**
 * 伤害机制详情字段：结算步骤给出所属模式、分组与公式，机制术语给出别名与解释。
 * @param id 步骤 / 术语 id（形如 `skill:expectedDamage` 或 `term:充盈`）
 * @returns 字段表；条目不存在时返回 undefined
 */
function readDamageDetailFields(id: string): DBEntryFields | undefined {
    const mode = DAMAGE_MODES.find(item => id.startsWith(`${item.id}:`))

    if (mode) {
        const stepId = id.slice(mode.id.length + 1)
        const step = mode.steps.find(item => item.id === stepId)

        if (!step) {
            return undefined
        }

        const fields: DBEntryFields = {
            结算模式: mode.label,
            分组: step.group,
            公式: step.formula,
        }

        if (mode.resultStepId === step.id) {
            fields.结果步骤 = "该步骤即此结算模式的最终结果"
        }

        return fields
    }

    if (id.startsWith(DAMAGE_TERM_PREFIX)) {
        const term = DAMAGE_TERMS.find(item => item.term === id.slice(DAMAGE_TERM_PREFIX.length))

        if (!term) {
            return undefined
        }

        const fields: DBEntryFields = {
            术语: term.term,
            说明: term.description,
        }

        if (term.aliases?.length) {
            fields.别名 = [...term.aliases]
        }

        return fields
    }

    return undefined
}

/** 资料库模块 id → 详情字段读取器 */
const MODULE_DETAIL_READERS: Record<string, DBEntryDetailReader> = {
    char: readCharDetailFields,
    charvoice: readCharVoiceDetailFields,
    [RAG_PROFILE_MODULE]: readCharProfileDetailFields,
    weapon: readWeaponDetailFields,
    mod: readModDetailFields,
    achievement: readAchievementDetailFields,
    questchain: readQuestChainDetailFields,
    event: readEventDetailFields,
    dungeon: readDungeonDetailFields,
    monster: readMonsterDetailFields,
    npc: readNpcDetailFields,
    resource: readResourceDetailFields,
    pet: readPetDetailFields,
    walnut: readWalnutDetailFields,
    title: readTitleDetailFields,
    book: readBookDetailFields,
    music: readMusicDetailFields,
    fish: readFishDetailFields,
    // 伤害机制条目没有原始数据表，字段从步骤 / 术语定义里现取
    damage: id => readDamageDetailFields(id),
}

/**
 * 读取单条资料的完整字段（详情页上的档案、面板与说明）。
 *
 * 与 {@link queryModule} 的分工：queryModule 只给条目摘要（名称 / 副信息 / 路径），
 * 用于定位条目；本函数按 id 或名称取该条目的完整字段，用于回答「某某的生日是什么」
 * 「这把武器的面板数值」这类需要详情字段的提问。
 *
 * 名称匹配会先精确命中，再退回关键词检索：后者让其他语言的名称（译文）与只记得一半的
 * 名称也能命中，但只在唯一命中时才直接返回详情，否则给出候选列表让模型自己确认。
 * @param moduleId 模块标识，见 listModules
 * @param options 查询条件：条目 id 或名称（至少给一个）、数据语言
 * @returns 模块信息与条目详情；未命中或无法唯一确定时给出候选与提示
 */
export function readEntry(
    moduleId: string,
    options: { id?: string | number; name?: string; lang?: DBAgentLang } = {}
): { module?: DBModuleSummary; entry?: DBEntryDetail; candidates?: DBEntrySummary[]; error?: string } {
    const adapter = MODULE_ADAPTER_MAP.get(moduleId)

    if (!adapter) {
        return {}
    }

    const lang = options.lang ?? resolveCurrentDBAgentLang()
    const id = options.id === undefined || options.id === null ? "" : `${options.id}`.trim()
    const name = options.name?.trim() ?? ""
    const all = adapter.list(lang)
    const module: DBModuleSummary = {
        id: adapter.id,
        label: moduleLabel(adapter.labelKey, lang),
        path: adapter.path,
        versioned: adapter.versioned,
        count: all.length,
    }

    if (!id && !name) {
        return {
            module,
            error: `需要给出条目 id 或名称（可先用 query_module_entries、search_data 定位条目）。模块 ${adapter.id} 共 ${all.length} 条。`,
        }
    }

    const reader = MODULE_DETAIL_READERS[adapter.id]

    /** 按条目摘要取详情：读取器取不到字段时视为该条目没有详情可给 */
    const detailOf = (summary: DBEntrySummary): DBEntryDetail | undefined => {
        const fields = reader?.(`${summary.id}`, lang)

        if (!fields) {
            return undefined
        }

        const localized = localizeEntry(summary, lang)

        return {
            id: localized.id,
            name: localized.name,
            subtitle: localized.subtitle,
            version: localized.version,
            path: localized.path,
            fields,
        }
    }

    const exact = id ? all.find(entry => `${entry.id}` === id) : all.find(entry => entry.name === name)
    const entry = exact ? detailOf(exact) : undefined

    if (entry) {
        return { module, entry }
    }

    // 精确没命中（或该模块没有详情读取器）时退回关键词检索：唯一命中就直接给详情，
    // 否则把候选交给模型，由它决定换关键词还是把候选呈现给用户
    const { entries: candidates } = queryModule(moduleId, { keyword: name || id, limit: 8, lang })

    if (candidates.length === 1) {
        const unique = detailOf(candidates[0]!)

        if (unique) {
            return { module, entry: unique }
        }
    }

    const keyword = name || id
    const reason = exact ? `条目「${keyword}」没有可读取的详情字段。` : `未找到条目「${keyword}」。`

    return {
        module,
        candidates,
        error: candidates.length
            ? `${reason}以下为关键词命中的候选条目，请确认后再取详情。`
            : `${reason}资料库的 ${adapter.id} 模块中没有相近条目。`,
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
    /** 整链 AI 剧情总结（storysummary.data.ts，已按剧情文本口径清洗；无则空串） */
    summary: string
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
        // 总结与对话正文同一套清洗口径（占位符替换 + 去标签），保证引用的文本与详情页一致
        const summary = cleanDialogueContent(storySummaryData[chain.id])
        // 总结正文也进检索文本：它概括了整链的人与事，是「哪条剧情提到过 X」最省事的一路召回
        const searchText = [chain.name, chapter, chain.episode, summary, ...lines.map(line => `${line.speaker} ${line.text}`)]
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
            summary,
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
 * @param withSummary 是否附带整链 AI 总结（关键词检索时带，纯筛选列举时不带）
 * @returns 剧情命中
 */
function toStoryHit(entry: StoryChainIndex, keywords: string[], snippetLimit: number, withSummary: boolean): DBStoryHit {
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
        summary: withSummary ? entry.summary || undefined : undefined,
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
            hits: picked.map(entry => toStoryHit(entry, [], snippetLimit, false)),
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

    // 关键词检索的结果附带整链 AI 总结：模型据此可直接回答「这条剧情讲了什么」，
    // 省掉一次 read_story 往返（纯筛选列举不带，见上面的分支）
    notes.push("命中结果里的 summary 是该任务链的整链剧情总结（中文），可用于直接概括剧情；需要逐句原文再用 read_story。")

    return {
        hits: ordered.map(entry => toStoryHit(entry, keywords, snippetLimit, true)),
        total: exact.length + fuzzyHits.filter(entry => !exact.includes(entry)).length,
        note: notes.join(" "),
    }
}

/**
 * 读取指定任务链的剧情原文（可限定单个任务）。
 *
 * 返回里始终带上该链的整链 AI 总结（summary）：它是这条链最省 token 的上下文，
 * 模型补上下文时先看总结、再决定要不要翻下面的逐行原文。
 * @param chainId 任务链 ID
 * @param options 查询条件：任务 ID、起始行号、行数上限、数据语言
 * @returns 任务链信息与对话行
 */
export async function readStory(
    chainId: number,
    options: { questId?: number; offset?: number; limit?: number; lang?: DBAgentLang } = {}
): Promise<{ chain?: Omit<DBStoryHit, "snippets">; lines: DBStorySnippet[]; total: number; note?: string }> {
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
            summary: entry.summary || undefined,
            path: entry.path,
        },
        lines: scoped.slice(offset, offset + limit).map(line => ({
            questId: line.questId,
            questName: line.questName,
            speaker: line.speaker,
            text: line.text,
        })),
        total: scoped.length,
        note: entry.summary ? "chain.summary 是该任务链的整链剧情总结（中文）；lines 是逐行原文，用于核对细节。" : undefined,
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
