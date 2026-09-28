/**
 * 游戏数据模块注册表。
 *
 * 统一登记 `src/data/d/*.data.ts` 的全部数据模块，供 GraphQL 数据接口按需懒加载：
 * 只有真正被查询到的模块才会 import，未命中的模块不会进入内存。
 *
 * 口径说明：
 * - 模块 id = 文件名去掉 `.data` 后缀（`char` / `charext.en`），语言后缀（en/fr/jp/kr/tc）用于识别本地化变体；
 * - 数据集 id = 模块 id（主导出）或 `模块 id:导出名`（其余导出），主导出优先取 `default`，
 *   没有 `default` 时若只有一个可查询导出则直接占用模块 id；
 * - 与主导出引用相同的具名导出会被跳过，避免同一张表出现两个 id。
 */

import { resolveFieldValues } from "./gameDataQuery"

/** 数据模块注册项 */
export type DataModuleEntry = {
    /** 模块 id（= 文件名去掉 .data 后缀） */
    id: string
    /** 中文名称 */
    label: string
    /** 源文件路径（相对仓库根目录） */
    file: string
    /** 懒加载该模块的命名空间 */
    load: () => Promise<Record<string, unknown>>
}

/** 数据模块的对外元信息 */
export type DataModuleInfo = {
    id: string
    label: string
    file: string
    /** 所属基准模块 id（去掉语言后缀） */
    baseId: string
    /** 语言码，默认 zh */
    locale: string
    /** 同一基准模块下可用的全部模块 id（含自身） */
    variants: string[]
}

/** 数据集导出形态 */
export type DataSetKind = "array" | "object" | "map"

/** 数据集对外元信息 */
export type DataSetInfo = {
    /** 数据集 id（用于查询接口的 dataset 参数） */
    id: string
    /** 所属模块 id */
    module: string
    /** 导出名（default 或具名导出） */
    exportName: string
    file: string
    label: string
    baseId: string
    locale: string
    variants: string[]
    kind: DataSetKind
    /** 记录数 */
    count: number
}

/** 标准化记录：键 + 主体 */
export type DataRecord = {
    /** 记录键：id / 名称 / name，取不到时回退为序号或 Map 键 */
    key: string
    /** 记录主体；导出值是原始值时包装为 `{ value }` */
    data: Record<string, unknown>
}

/** 字段取值（facet）统计项 */
export type FieldValueCount = {
    value: unknown
    count: number
}

/** 语言后缀 → 语言码 */
const LOCALE_BY_SUFFIX: Record<string, string> = {
    en: "en",
    fr: "fr",
    jp: "jp",
    kr: "kr",
    tc: "tc",
}

/** 默认语言码（无语言后缀的模块） */
const DEFAULT_LOCALE = "zh"

/** 记录键的候选字段，按优先级排列 */
const KEY_FIELDS = ["id", "Id", "ID", "名称", "name", "Name", "n", "key"] as const

/** 数据集列表的最大字段扫描条数（超大数据集只按前若干条归纳字段，避免整表扫描） */
export const FIELD_SCAN_LIMIT = 200

/**
 * 全部数据模块登记表。
 *
 * 每项都是显式 import，拼错文件名会在类型检查阶段暴露；`load` 只在被查询时调用。
 */
export const DATA_MODULES: DataModuleEntry[] = [
    { id: "abyss", label: "深渊", file: "src/data/d/abyss.data.ts", load: () => import("../../../../src/data/d/abyss.data") },
    {
        id: "accessory",
        label: "饰品与皮肤",
        file: "src/data/d/accessory.data.ts",
        load: () => import("../../../../src/data/d/accessory.data"),
    },
    {
        id: "achievement",
        label: "成就",
        file: "src/data/d/achievement.data.ts",
        load: () => import("../../../../src/data/d/achievement.data"),
    },
    { id: "autochess", label: "自走棋", file: "src/data/d/autochess.data.ts", load: () => import("../../../../src/data/d/autochess.data") },
    {
        id: "backpackpuzzle",
        label: "背包解谜",
        file: "src/data/d/backpackpuzzle.data.ts",
        load: () => import("../../../../src/data/d/backpackpuzzle.data"),
    },
    { id: "book", label: "书籍", file: "src/data/d/book.data.ts", load: () => import("../../../../src/data/d/book.data") },
    { id: "buff", label: "BUFF", file: "src/data/d/buff.data.ts", load: () => import("../../../../src/data/d/buff.data") },
    { id: "char", label: "角色", file: "src/data/d/char.data.ts", load: () => import("../../../../src/data/d/char.data") },
    { id: "charext", label: "角色档案", file: "src/data/d/charext.data.ts", load: () => import("../../../../src/data/d/charext.data") },
    {
        id: "charext.en",
        label: "角色档案（英语）",
        file: "src/data/d/charext.en.data.ts",
        load: () => import("../../../../src/data/d/charext.en.data"),
    },
    {
        id: "charext.fr",
        label: "角色档案（法语）",
        file: "src/data/d/charext.fr.data.ts",
        load: () => import("../../../../src/data/d/charext.fr.data"),
    },
    {
        id: "charext.jp",
        label: "角色档案（日语）",
        file: "src/data/d/charext.jp.data.ts",
        load: () => import("../../../../src/data/d/charext.jp.data"),
    },
    {
        id: "charext.kr",
        label: "角色档案（韩语）",
        file: "src/data/d/charext.kr.data.ts",
        load: () => import("../../../../src/data/d/charext.kr.data"),
    },
    {
        id: "charext.tc",
        label: "角色档案（繁中）",
        file: "src/data/d/charext.tc.data.ts",
        load: () => import("../../../../src/data/d/charext.tc.data"),
    },
    {
        id: "charvoice",
        label: "角色语音",
        file: "src/data/d/charvoice.data.ts",
        load: () => import("../../../../src/data/d/charvoice.data"),
    },
    {
        id: "charvoice.en",
        label: "角色语音（英语）",
        file: "src/data/d/charvoice.en.data.ts",
        load: () => import("../../../../src/data/d/charvoice.en.data"),
    },
    {
        id: "charvoice.jp",
        label: "角色语音（日语）",
        file: "src/data/d/charvoice.jp.data.ts",
        load: () => import("../../../../src/data/d/charvoice.jp.data"),
    },
    {
        id: "charvoice.kr",
        label: "角色语音（韩语）",
        file: "src/data/d/charvoice.kr.data.ts",
        load: () => import("../../../../src/data/d/charvoice.kr.data"),
    },
    {
        id: "condition",
        label: "条件配置",
        file: "src/data/d/condition.data.ts",
        load: () => import("../../../../src/data/d/condition.data"),
    },
    { id: "const", label: "数值常量", file: "src/data/d/const.data.ts", load: () => import("../../../../src/data/d/const.data") },
    { id: "convert", label: "魔之楔转化", file: "src/data/d/convert.data.ts", load: () => import("../../../../src/data/d/convert.data") },
    { id: "cutoff", label: "限时售卖", file: "src/data/d/cutoff.data.ts", load: () => import("../../../../src/data/d/cutoff.data") },
    { id: "draft", label: "设计稿", file: "src/data/d/draft.data.ts", load: () => import("../../../../src/data/d/draft.data") },
    { id: "dungeon", label: "副本", file: "src/data/d/dungeon.data.ts", load: () => import("../../../../src/data/d/dungeon.data") },
    { id: "dynquest", label: "动态委托", file: "src/data/d/dynquest.data.ts", load: () => import("../../../../src/data/d/dynquest.data") },
    { id: "effect", label: "特效词条", file: "src/data/d/effect.data.ts", load: () => import("../../../../src/data/d/effect.data") },
    { id: "event", label: "活动", file: "src/data/d/event.data.ts", load: () => import("../../../../src/data/d/event.data") },
    { id: "fish", label: "钓鱼", file: "src/data/d/fish.data.ts", load: () => import("../../../../src/data/d/fish.data") },
    { id: "forge", label: "锻造", file: "src/data/d/forge.data.ts", load: () => import("../../../../src/data/d/forge.data") },
    { id: "hardboss", label: "强敌", file: "src/data/d/hardboss.data.ts", load: () => import("../../../../src/data/d/hardboss.data") },
    {
        id: "headsculpture",
        label: "头像雕塑",
        file: "src/data/d/headsculpture.data.ts",
        load: () => import("../../../../src/data/d/headsculpture.data"),
    },
    {
        id: "iconticket",
        label: "头像票券",
        file: "src/data/d/iconticket.data.ts",
        load: () => import("../../../../src/data/d/iconticket.data"),
    },
    {
        id: "ironsurvival",
        label: "铁血生存",
        file: "src/data/d/ironsurvival.data.ts",
        load: () => import("../../../../src/data/d/ironsurvival.data"),
    },
    { id: "jargon", label: "术语", file: "src/data/d/jargon.data.ts", load: () => import("../../../../src/data/d/jargon.data") },
    { id: "levelup", label: "升级消耗", file: "src/data/d/levelup.data.ts", load: () => import("../../../../src/data/d/levelup.data") },
    {
        id: "limitedprize",
        label: "限定奖池",
        file: "src/data/d/limitedprize.data.ts",
        load: () => import("../../../../src/data/d/limitedprize.data"),
    },
    { id: "map", label: "地图", file: "src/data/d/map.data.ts", load: () => import("../../../../src/data/d/map.data") },
    { id: "mod", label: "魔之楔", file: "src/data/d/mod.data.ts", load: () => import("../../../../src/data/d/mod.data") },
    { id: "monster", label: "怪物", file: "src/data/d/monster.data.ts", load: () => import("../../../../src/data/d/monster.data") },
    {
        id: "monstertag",
        label: "怪物标签",
        file: "src/data/d/monstertag.data.ts",
        load: () => import("../../../../src/data/d/monstertag.data"),
    },
    { id: "mount", label: "坐骑", file: "src/data/d/mount.data.ts", load: () => import("../../../../src/data/d/mount.data") },
    { id: "music", label: "音乐", file: "src/data/d/music.data.ts", load: () => import("../../../../src/data/d/music.data") },
    { id: "npc", label: "NPC", file: "src/data/d/npc.data.ts", load: () => import("../../../../src/data/d/npc.data") },
    {
        id: "optreward",
        label: "可选奖励",
        file: "src/data/d/optreward.data.ts",
        load: () => import("../../../../src/data/d/optreward.data"),
    },
    {
        id: "partytopic",
        label: "光阴集",
        file: "src/data/d/partytopic.data.ts",
        load: () => import("../../../../src/data/d/partytopic.data"),
    },
    {
        id: "partytopic.en",
        label: "光阴集（英语）",
        file: "src/data/d/partytopic.en.data.ts",
        load: () => import("../../../../src/data/d/partytopic.en.data"),
    },
    {
        id: "partytopic.fr",
        label: "光阴集（法语）",
        file: "src/data/d/partytopic.fr.data.ts",
        load: () => import("../../../../src/data/d/partytopic.fr.data"),
    },
    {
        id: "partytopic.jp",
        label: "光阴集（日语）",
        file: "src/data/d/partytopic.jp.data.ts",
        load: () => import("../../../../src/data/d/partytopic.jp.data"),
    },
    {
        id: "partytopic.kr",
        label: "光阴集（韩语）",
        file: "src/data/d/partytopic.kr.data.ts",
        load: () => import("../../../../src/data/d/partytopic.kr.data"),
    },
    {
        id: "partytopic.tc",
        label: "光阴集（繁中）",
        file: "src/data/d/partytopic.tc.data.ts",
        load: () => import("../../../../src/data/d/partytopic.tc.data"),
    },
    { id: "pet", label: "魔灵", file: "src/data/d/pet.data.ts", load: () => import("../../../../src/data/d/pet.data") },
    { id: "player", label: "玩家成长", file: "src/data/d/player.data.ts", load: () => import("../../../../src/data/d/player.data") },
    { id: "quest", label: "任务", file: "src/data/d/quest.data.ts", load: () => import("../../../../src/data/d/quest.data") },
    {
        id: "quest.en",
        label: "任务（英语）",
        file: "src/data/d/quest.en.data.ts",
        load: () => import("../../../../src/data/d/quest.en.data"),
    },
    {
        id: "quest.fr",
        label: "任务（法语）",
        file: "src/data/d/quest.fr.data.ts",
        load: () => import("../../../../src/data/d/quest.fr.data"),
    },
    {
        id: "quest.jp",
        label: "任务（日语）",
        file: "src/data/d/quest.jp.data.ts",
        load: () => import("../../../../src/data/d/quest.jp.data"),
    },
    {
        id: "quest.kr",
        label: "任务（韩语）",
        file: "src/data/d/quest.kr.data.ts",
        load: () => import("../../../../src/data/d/quest.kr.data"),
    },
    {
        id: "quest.tc",
        label: "任务（繁中）",
        file: "src/data/d/quest.tc.data.ts",
        load: () => import("../../../../src/data/d/quest.tc.data"),
    },
    {
        id: "questchain",
        label: "任务链",
        file: "src/data/d/questchain.data.ts",
        load: () => import("../../../../src/data/d/questchain.data"),
    },
    {
        id: "race-lottery",
        label: "竞速抽奖",
        file: "src/data/d/race-lottery.data.ts",
        load: () => import("../../../../src/data/d/race-lottery.data"),
    },
    { id: "raid", label: "掠夺副本", file: "src/data/d/raid.data.ts", load: () => import("../../../../src/data/d/raid.data") },
    { id: "region", label: "区域", file: "src/data/d/region.data.ts", load: () => import("../../../../src/data/d/region.data") },
    {
        id: "reputation",
        label: "声望",
        file: "src/data/d/reputation.data.ts",
        load: () => import("../../../../src/data/d/reputation.data"),
    },
    { id: "resource", label: "资源", file: "src/data/d/resource.data.ts", load: () => import("../../../../src/data/d/resource.data") },
    { id: "reward", label: "奖励", file: "src/data/d/reward.data.ts", load: () => import("../../../../src/data/d/reward.data") },
    { id: "rouge", label: "轮回玩法", file: "src/data/d/rouge.data.ts", load: () => import("../../../../src/data/d/rouge.data") },
    { id: "shop", label: "商店", file: "src/data/d/shop.data.ts", load: () => import("../../../../src/data/d/shop.data") },
    {
        id: "skin-colorize",
        label: "皮肤染色",
        file: "src/data/d/skin-colorize.data.ts",
        load: () => import("../../../../src/data/d/skin-colorize.data"),
    },
    {
        id: "skingacha",
        label: "皮肤抽奖",
        file: "src/data/d/skingacha.data.ts",
        load: () => import("../../../../src/data/d/skingacha.data"),
    },
    {
        id: "solotreasure",
        label: "单人寻宝",
        file: "src/data/d/solotreasure.data.ts",
        load: () => import("../../../../src/data/d/solotreasure.data"),
    },
    {
        id: "storysummary",
        label: "剧情概要",
        file: "src/data/d/storysummary.data.ts",
        load: () => import("../../../../src/data/d/storysummary.data"),
    },
    { id: "subregion", label: "子区域", file: "src/data/d/subregion.data.ts", load: () => import("../../../../src/data/d/subregion.data") },
    {
        id: "template",
        label: "角色与武器模板",
        file: "src/data/d/template.data.ts",
        load: () => import("../../../../src/data/d/template.data"),
    },
    { id: "title", label: "称号", file: "src/data/d/title.data.ts", load: () => import("../../../../src/data/d/title.data") },
    {
        id: "titleframe",
        label: "称号框",
        file: "src/data/d/titleframe.data.ts",
        load: () => import("../../../../src/data/d/titleframe.data"),
    },
    {
        id: "translations",
        label: "多语言翻译表",
        file: "src/data/d/translations.data.ts",
        load: () => import("../../../../src/data/d/translations.data"),
    },
    { id: "walnut", label: "密函", file: "src/data/d/walnut.data.ts", load: () => import("../../../../src/data/d/walnut.data") },
    {
        id: "weapon-verify",
        label: "武器试炼",
        file: "src/data/d/weapon-verify.data.ts",
        load: () => import("../../../../src/data/d/weapon-verify.data"),
    },
    { id: "weapon", label: "武器", file: "src/data/d/weapon.data.ts", load: () => import("../../../../src/data/d/weapon.data") },
]

/** 模块 id → 注册项 */
const MODULE_INDEX = new Map(DATA_MODULES.map(entry => [entry.id, entry]))

/** 已加载的模块命名空间缓存（按模块 id 去重，避免重复 import 与重复解析） */
const moduleCache = new Map<string, Promise<Record<string, unknown>>>()

/** 已解析的数据集元信息缓存（按请求 id，含别名写法） */
const dataSetInfoCache = new Map<string, DataSetInfo>()

/** 已读取的原始导出值缓存（按数据集规范 id） */
const dataSetValueCache = new Map<string, unknown>()

/** 已构建的记录缓存（按数据集规范 id） */
const recordCache = new Map<string, Promise<DataRecord[]>>()

/**
 * 解析模块 id 的语言信息。
 * @param moduleId 模块 id
 * @returns 基准模块 id 与语言码
 */
function parseModuleId(moduleId: string): { baseId: string; locale: string } {
    const dotIndex = moduleId.lastIndexOf(".")
    if (dotIndex < 0) {
        return { baseId: moduleId, locale: DEFAULT_LOCALE }
    }
    const suffix = moduleId.slice(dotIndex + 1)
    const locale = LOCALE_BY_SUFFIX[suffix]
    if (!locale) {
        return { baseId: moduleId, locale: DEFAULT_LOCALE }
    }
    return { baseId: moduleId.slice(0, dotIndex), locale }
}

/** 基准模块 id → 该基准下全部模块 id（含自身） */
const VARIANTS_BY_BASE = (() => {
    const map = new Map<string, string[]>()
    for (const entry of DATA_MODULES) {
        const { baseId } = parseModuleId(entry.id)
        const list = map.get(baseId)
        if (list) {
            list.push(entry.id)
        } else {
            map.set(baseId, [entry.id])
        }
    }
    return map
})()

/**
 * 列出全部数据模块（不加载任何数据）。
 * @returns 模块元信息列表
 */
export function listDataModules(): DataModuleInfo[] {
    return DATA_MODULES.map(entry => {
        const { baseId, locale } = parseModuleId(entry.id)
        return {
            id: entry.id,
            label: entry.label,
            file: entry.file,
            baseId,
            locale,
            variants: [...(VARIANTS_BY_BASE.get(baseId) ?? [entry.id])],
        }
    })
}

/**
 * 判断导出值是否可作为数据集（数组 / Map / 普通对象）。
 * @param value 导出值
 * @returns 是否为可查询的数据集
 */
function isDataSetValue(value: unknown): value is unknown[] | Map<unknown, unknown> | Record<string, unknown> {
    if (Array.isArray(value) || value instanceof Map) {
        return true
    }
    if (!value || typeof value !== "object") {
        return false
    }
    // 排除类实例（如 Set / Date），只认字面量对象
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

/**
 * 判定数据集导出形态。
 * @param value 导出值
 * @returns 导出形态
 */
function kindOf(value: unknown): DataSetKind {
    if (Array.isArray(value)) return "array"
    if (value instanceof Map) return "map"
    return "object"
}

/**
 * 取导出值的记录条数。
 * @param value 导出值
 * @returns 记录条数
 */
function countOf(value: unknown): number {
    if (Array.isArray(value)) return value.length
    if (value instanceof Map) return value.size
    if (value && typeof value === "object") return Object.keys(value).length
    return 0
}

/**
 * 懒加载数据模块的命名空间。
 * @param moduleId 模块 id
 * @returns 模块命名空间
 * @throws 模块未登记时抛出错误
 */
export function loadDataModule(moduleId: string): Promise<Record<string, unknown>> {
    const cached = moduleCache.get(moduleId)
    if (cached) {
        return cached
    }
    const entry = MODULE_INDEX.get(moduleId)
    if (!entry) {
        throw new Error(`未知数据模块: ${moduleId}`)
    }
    const pending = entry.load()
    moduleCache.set(moduleId, pending)
    return pending
}

/**
 * 枚举一个模块里的全部数据集。
 * @param entry 模块注册项
 * @returns 数据集元信息列表（按导出顺序）
 */
async function collectDataSets(entry: DataModuleEntry): Promise<DataSetInfo[]> {
    const namespace = await loadDataModule(entry.id)
    const { baseId, locale } = parseModuleId(entry.id)
    const variants = VARIANTS_BY_BASE.get(baseId) ?? [entry.id]
    const candidates = Object.entries(namespace).filter(([, value]) => isDataSetValue(value))

    // 主导出：优先 default；没有 default 且只有一个可查询导出时，该导出直接占用模块 id
    const primary = candidates.find(([name]) => name === "default") ?? (candidates.length === 1 ? candidates[0] : undefined)
    const primaryValue = primary?.[1]

    const result: DataSetInfo[] = []
    for (const [exportName, value] of candidates) {
        const isPrimary = primary?.[0] === exportName
        // 与主导出引用相同的具名导出是同一张表，跳过以免重复
        if (!isPrimary && primaryValue !== undefined && value === primaryValue) {
            continue
        }
        result.push({
            id: isPrimary ? entry.id : `${entry.id}:${exportName}`,
            module: entry.id,
            exportName,
            file: entry.file,
            label: isPrimary ? entry.label : `${entry.label} · ${exportName}`,
            baseId,
            locale,
            variants: [...variants],
            kind: kindOf(value),
            count: countOf(value),
        })
    }
    return result
}

/**
 * 列出数据集。
 * @param moduleId 可选，限定单个数据模块；省略时枚举全部模块（会加载全部数据，较慢）
 * @returns 数据集元信息列表
 * @throws 指定模块未登记时抛出错误
 */
export async function listDataSets(moduleId?: string | null): Promise<DataSetInfo[]> {
    const entries = moduleId ? [MODULE_INDEX.get(moduleId)] : DATA_MODULES
    if (moduleId && !entries[0]) {
        throw new Error(`未知数据模块: ${moduleId}`)
    }
    const nested = await Promise.all(entries.map(entry => collectDataSets(entry as DataModuleEntry)))
    return nested.flat()
}

/**
 * 解析数据集 id。
 *
 * 除精确匹配外，还接受「模块 id:导出名」的写法（例如 `resource:resourceData`），
 * 以便调用方按导出名定位与主导出同源的表（这类导出会被去重，需要按导出值反查规范 id）。
 * @param dataSetId 数据集 id
 * @returns 数据集元信息
 * @throws 数据集不存在时抛出错误
 */
export async function resolveDataSet(dataSetId: string): Promise<DataSetInfo> {
    const cached = dataSetInfoCache.get(dataSetId)
    if (cached) {
        return cached
    }

    const colonIndex = dataSetId.indexOf(":")
    const moduleId = colonIndex < 0 ? dataSetId : dataSetId.slice(0, colonIndex)
    const exportName = colonIndex < 0 ? null : dataSetId.slice(colonIndex + 1)

    // 数据集接口统一报「未知数据集」，模块不存在只是其中一种成因
    let dataSets: DataSetInfo[]
    try {
        dataSets = await listDataSets(moduleId)
    } catch {
        throw new Error(`未知数据集: ${dataSetId}`)
    }
    let matched = dataSets.find(item => (exportName ? item.exportName === exportName : item.id === dataSetId))

    if (!matched && exportName) {
        // 与主导出同源的具名导出不会单独登记，这里按导出值反查它归属的数据集
        const namespace = await loadDataModule(moduleId)
        const value = namespace[exportName]
        if (value !== undefined) {
            matched = dataSets.find(item => namespace[item.exportName] === value)
        }
    }

    if (!matched) {
        throw new Error(`未知数据集: ${dataSetId}`)
    }
    dataSetInfoCache.set(dataSetId, matched)
    dataSetInfoCache.set(matched.id, matched)
    return matched
}

/**
 * 按数据集元信息取出原始导出值（带缓存）。
 * @param info 数据集元信息
 * @returns 原始导出值
 */
async function loadDataSetValue(info: DataSetInfo): Promise<unknown> {
    if (dataSetValueCache.has(info.id)) {
        return dataSetValueCache.get(info.id)
    }
    const namespace = await loadDataModule(info.module)
    const value = namespace[info.exportName]
    dataSetValueCache.set(info.id, value)
    return value
}

/**
 * 取记录键：优先 id 类字段，其次名称类字段。
 * @param value 记录原始值
 * @param fallback 兜底键（序号或 Map 键）
 * @returns 记录键
 */
function pickRecordKey(value: unknown, fallback: string): string {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>
        for (const field of KEY_FIELDS) {
            const candidate = record[field]
            if (candidate !== undefined && candidate !== null && candidate !== "") {
                return String(candidate)
            }
        }
    }
    return fallback
}

/**
 * 把导出值标准化为记录数组。
 * @param value 导出值
 * @returns 记录数组
 */
function toRecords(value: unknown): DataRecord[] {
    if (Array.isArray(value)) {
        return value.map((item, index) => ({
            key: pickRecordKey(item, String(index)),
            data: item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : { value: item },
        }))
    }
    if (value instanceof Map) {
        return [...value.entries()].map(([mapKey, item]) => ({
            key: String(mapKey),
            data: item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : { value: item },
        }))
    }
    if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
            key,
            data: item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : { value: item },
        }))
    }
    return []
}

/**
 * 取数据集的全部记录（带缓存）。
 * @param dataSetId 数据集 id
 * @returns 记录数组
 * @throws 数据集不存在时抛出错误
 */
export async function getDataSetRecords(dataSetId: string): Promise<DataRecord[]> {
    const cached = recordCache.get(dataSetId)
    if (cached) {
        return cached
    }
    const info = await resolveDataSet(dataSetId)
    const pending = loadDataSetValue(info).then(value => toRecords(value))
    recordCache.set(dataSetId, pending)
    return pending
}

/**
 * 取数据集的顶层字段名（按首次出现顺序）。
 * @param dataSetId 数据集 id
 * @param sampleLimit 最多扫描多少条记录来归纳字段，默认 FIELD_SCAN_LIMIT
 * @returns 字段名列表
 * @throws 数据集不存在时抛出错误
 */
export async function getDataSetFields(dataSetId: string, sampleLimit = FIELD_SCAN_LIMIT): Promise<string[]> {
    const records = await getDataSetRecords(dataSetId)
    const fields: string[] = []
    const seen = new Set<string>()
    for (const record of records.slice(0, sampleLimit)) {
        for (const key of Object.keys(record.data)) {
            if (!seen.has(key)) {
                seen.add(key)
                fields.push(key)
            }
        }
    }
    return fields
}

/**
 * 统计某字段的去重取值与出现次数（facet）。
 * @param dataSetId 数据集 id
 * @param field 字段名（支持 `a.b` 路径）
 * @param limit 最多返回多少个取值，默认 100
 * @returns 取值统计列表，按出现次数降序
 * @throws 数据集不存在时抛出错误
 */
export async function getDataSetFieldValues(dataSetId: string, field: string, limit = 100): Promise<FieldValueCount[]> {
    const records = await getDataSetRecords(dataSetId)
    const buckets = new Map<string, FieldValueCount>()

    for (const record of records) {
        for (const value of resolveFieldValues(record.data, field)) {
            if (value === undefined || value === null) continue
            // 数组值按元素分别计数，便于直接作为筛选项
            const items = Array.isArray(value) ? value : [value]
            for (const item of items) {
                if (item === undefined || item === null) continue
                const bucketKey = typeof item === "object" ? JSON.stringify(item) : `${typeof item}:${String(item)}`
                const bucket = buckets.get(bucketKey)
                if (bucket) {
                    bucket.count += 1
                } else {
                    buckets.set(bucketKey, { value: item, count: 1 })
                }
            }
        }
    }

    return [...buckets.values()].sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value))).slice(0, limit)
}

/**
 * 按记录键查找单条记录。
 *
 * 先按标准化记录键精确匹配，未命中再按 id / 名称 / name 字段匹配。
 * @param dataSetId 数据集 id
 * @param key 记录键
 * @returns 命中的记录，未命中返回 null
 * @throws 数据集不存在时抛出错误
 */
export async function findDataSetRecord(dataSetId: string, key: string): Promise<DataRecord | null> {
    const records = await getDataSetRecords(dataSetId)
    const exact = records.find(record => record.key === key)
    if (exact) {
        return exact
    }
    return (
        records.find(record =>
            KEY_FIELDS.some(field => {
                const value = record.data[field]
                return value !== undefined && value !== null && String(value) === key
            })
        ) ?? null
    )
}
