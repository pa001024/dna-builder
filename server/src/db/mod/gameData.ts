/**
 * 游戏数据查询接口。
 *
 * 把 `src/data/d/*.data.ts` 的全部数据集收敛到统一的 GraphQL 入口，供外部（MCP、脚本、
 * 第三方工具）按需查询，无需为每张表单独定义 GraphQL 类型：
 *
 * - `gameDataModules` 列出数据模块（不加载数据，纯静态清单）；
 * - `gameDataSets` 列出数据集（记录数 / 字段 / 本地化变体）；
 * - `gameData` 统一查询（过滤 / 全文匹配 / 排序 / 字段投影 / 分页）；
 * - `gameDataRecord` 按记录键取单条；`gameDataFieldValues` 取字段去重取值（筛选项）。
 *
 * 记录主体结构随数据集而异（中文键、嵌套对象、数组），无法静态建模，因此统一用 JSON 标量透传；
 * 元信息（数据集 id / 记录数 / 分页信封）仍是强类型，便于客户端做类型化调用。
 *
 * 版本门限：服务端没有 localStorage，`applyVersionGate` 取到的是「不设门限」，
 * 因此这里返回全部版本的数据；需要按版本筛选时用 `版本` 字段过滤。
 */

import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { GraphQLScalarType } from "graphql"
import { createGraphQLError } from "graphql-yoga"
import type { Context } from "../yoga"
import { runDataQuery } from "./gameDataQuery"
import {
    FIELD_SCAN_LIMIT,
    findDataSetRecord,
    getDataSetFields,
    getDataSetFieldValues,
    getDataSetRecords,
    listDataModules,
    listDataSets,
    resolveDataSet,
} from "./gameDataRegistry"

/** 字段取值统计的默认条数上限 */
const DEFAULT_FIELD_VALUE_LIMIT = 100

/** 字段取值统计的条数上限 */
const MAX_FIELD_VALUE_LIMIT = 1000

/** 字段归纳的扫描条数上限 */
const MAX_FIELD_SCAN_LIMIT = 2000

/**
 * 包装解析逻辑，把数据层抛出的普通错误转成 GraphQL 错误。
 *
 * graphql-yoga 会把非 GraphQLError 折叠成 "Unexpected error."，
 * 而「未知数据集 / 未知数据模块」这类调用方错误需要原样透出。
 * @param run 解析逻辑
 * @returns 解析结果
 */
async function withGraphQLError<T>(run: () => Promise<T> | T): Promise<T> {
    try {
        return await run()
    } catch (error) {
        throw createGraphQLError(error instanceof Error ? error.message : String(error))
    }
}

/**
 * 把任意值深拷贝成 JSON 安全形态。
 *
 * Map → 对象、Set → 数组、Date → ISO 文本、函数 / Symbol / undefined → 丢弃，
 * 同时用祖先链检测环引用，避免脏数据把序列化打成栈溢出。
 * @param value 任意值
 * @param ancestors 当前祖先链（用于环检测）
 * @returns JSON 安全值
 */
function toJsonSafe(value: unknown, ancestors: Set<object> = new Set()): unknown {
    if (value === undefined || value === null) return null
    if (typeof value === "function" || typeof value === "symbol") return null
    if (typeof value === "bigint") return String(value)
    if (typeof value !== "object") return value
    if (value instanceof Date) return value.toISOString()
    if (ancestors.has(value)) return "[Circular]"

    ancestors.add(value)
    try {
        if (Array.isArray(value)) {
            return value.map(item => toJsonSafe(item, ancestors))
        }
        if (value instanceof Map) {
            const result: Record<string, unknown> = {}
            for (const [key, item] of value) {
                result[String(key)] = toJsonSafe(item, ancestors)
            }
            return result
        }
        if (value instanceof Set) {
            return [...value].map(item => toJsonSafe(item, ancestors))
        }
        const result: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            const safe = toJsonSafe(item, ancestors)
            if (safe !== null || item === null) {
                result[key] = safe
            }
        }
        return result
    } finally {
        ancestors.delete(value)
    }
}

/**
 * JSON 标量。
 *
 * 输入侧原样接受对象 / 数组 / 标量（过滤条件的 `value` 需要传字面量对象）；
 * 输出侧统一走 `toJsonSafe` 深拷贝，保证交给序列化层的是干净 JSON。
 *
 * 只给 v17 的新名（`coerceOutputValue` / `coerceInputValue`）：构造器会把它们同步到旧名
 * `serialize` / `parseValue`（graphql-jit、graphql-tools 读的是旧名），`parseLiteral`
 * 也由默认实现按 `valueFromASTUntyped` 处理字面量（含字面量里的变量替换）。
 */
export const jsonScalar = new GraphQLScalarType({
    name: "JSON",
    description: "任意 JSON 值：对象 / 数组 / 字符串 / 数字 / 布尔",
    coerceOutputValue: value => toJsonSafe(value),
    coerceInputValue: value => toJsonSafe(value),
})

export const typeDefs = /* GraphQL */ `
    "任意 JSON 值（数据集记录主体结构随数据集而异，无法静态建模）"
    scalar JSON

    type Query {
        "可查询的数据模块列表（对应 src/data/d/*.data.ts），不加载任何数据"
        gameDataModules: [GameDataModule!]!
        "数据集列表（含记录数 / 字段 / 本地化变体）；省略 module 时枚举全部模块（会加载全部数据，较慢）"
        gameDataSets(module: String): [GameDataSet!]!
        "统一数据查询：过滤 / 全文匹配 / 排序 / 字段投影 / 分页"
        gameData(input: GameDataQuery!): GameDataPage!
        "按记录键（id / 名称 / name / Map 键）取单条记录，未命中返回 null"
        gameDataRecord(dataset: String!, key: String!): GameDataRecord
        "取数据集的顶层字段名（按首次出现顺序）"
        gameDataFields(dataset: String!, limit: Int): [String!]!
        "取某字段的去重取值与出现次数（筛选项），按出现次数降序"
        gameDataFieldValues(dataset: String!, field: String!, limit: Int): [GameDataFieldValue!]!
    }

    "数据模块（= 一个数据文件）"
    type GameDataModule {
        "模块 id（如 char / charext.en）"
        id: String!
        "中文名称"
        label: String!
        "源文件路径"
        file: String!
        "去掉语言后缀的基准模块 id"
        baseId: String!
        "语言码：zh / en / fr / jp / kr / tc"
        locale: String!
        "同一基准模块下可用的全部模块 id（含自身）"
        variants: [String!]!
    }

    "数据集（= 模块里的一个可查询导出）"
    type GameDataSet {
        "数据集 id，查询时作为 dataset 参数"
        id: String!
        "所属模块 id"
        module: String!
        "导出名：default 或具名导出"
        exportName: String!
        file: String!
        label: String!
        baseId: String!
        locale: String!
        variants: [String!]!
        "导出形态：array / object / map"
        kind: String!
        "记录数"
        count: Int!
    }

    "数据查询结果"
    type GameDataPage {
        "请求时传入的数据集 id"
        dataset: String!
        "数据集元信息（含未过滤的记录总数）"
        dataSet: GameDataSet!
        "过滤后总条数（分页前）"
        total: Int!
        "生效的偏移"
        offset: Int!
        "生效的单页上限"
        limit: Int!
        "本页条数"
        count: Int!
        "本页记录"
        items: [GameDataRecord!]!
    }

    "单条记录"
    type GameDataRecord {
        "记录键：id / 名称 / name，取不到时为序号或 Map 键"
        key: String!
        "记录主体（按 fields 投影后）"
        data: JSON!
    }

    "字段取值统计"
    type GameDataFieldValue {
        value: JSON!
        count: Int!
    }

    "数据查询参数"
    input GameDataQuery {
        "数据集 id（见 gameDataSets）"
        dataset: String!
        "过滤条件，多个条件为与关系"
        where: [GameDataFilter!]
        "跨字段全文匹配（大小写不敏感，键名与标量值都参与）"
        search: String
        "排序规则，按顺序生效；字段缺值的记录恒排在最后"
        sort: [GameDataSort!]
        "字段投影：只返回这些顶层字段"
        fields: [String!]
        "分页偏移，默认 0"
        offset: Int
        "单页上限，默认 50，最大 500"
        limit: Int
    }

    "过滤条件"
    input GameDataFilter {
        "字段名，支持 a.b 路径（遇到数组自动按元素下钻）"
        field: String!
        "算子，默认 EQ"
        op: GameDataFilterOp
        "比较值：EQ / NE / CONTAINS 传单值，IN 传数组，EXISTS 忽略"
        value: JSON
    }

    "过滤算子"
    enum GameDataFilterOp {
        "宽松相等：数字与数字字符串互认，数组字段任一元素命中即可"
        EQ
        "不等于"
        NE
        "包含：数组含该元素 / 字符串含子串 / 对象按 JSON 文本包含"
        CONTAINS
        "字段值命中给定数组中的任意一项"
        IN
        "大于（可转数字时按数字比较，否则按文本）"
        GT
        "大于等于"
        GTE
        "小于"
        LT
        "小于等于"
        LTE
        "字段存在且非空"
        EXISTS
    }

    "排序规则"
    input GameDataSort {
        field: String!
        "是否降序，默认升序"
        desc: Boolean
    }
`

export const resolvers = {
    JSON: jsonScalar,
    Query: {
        /**
         * 列出全部数据模块。
         * @returns 模块元信息列表（纯静态清单，不加载数据）
         */
        gameDataModules: () => listDataModules(),

        /**
         * 列出数据集。
         * @param args.module 可选，限定单个数据模块
         * @returns 数据集元信息列表
         */
        gameDataSets: async (_parent, args) => withGraphQLError(() => listDataSets(args?.module)),

        /**
         * 统一数据查询。
         * @param args.input 查询参数（数据集 id / 过滤 / 匹配 / 排序 / 投影 / 分页）
         * @returns 分页结果与数据集元信息
         */
        gameData: async (_parent, args) =>
            withGraphQLError(async () => {
                const input = args.input
                const [records, dataSet] = await Promise.all([getDataSetRecords(input.dataset), resolveDataSet(input.dataset)])
                const result = runDataQuery(records, input)
                return { dataset: input.dataset, dataSet, ...result }
            }),

        /**
         * 按记录键取单条记录。
         * @param args.dataset 数据集 id
         * @param args.key 记录键（id / 名称 / name / Map 键）
         * @returns 命中的记录，未命中返回 null
         */
        gameDataRecord: async (_parent, args) => withGraphQLError(() => findDataSetRecord(args.dataset, args.key)),

        /**
         * 取数据集的顶层字段名。
         * @param args.dataset 数据集 id
         * @param args.limit 最多扫描多少条记录来归纳字段，默认 200，最大 2000
         * @returns 字段名列表（按首次出现顺序）
         */
        gameDataFields: async (_parent, args) => {
            const limit = Math.min(Math.max(args.limit ?? FIELD_SCAN_LIMIT, 1), MAX_FIELD_SCAN_LIMIT)
            return withGraphQLError(() => getDataSetFields(args.dataset, limit))
        },

        /**
         * 取字段的去重取值与出现次数。
         * @param args.dataset 数据集 id
         * @param args.field 字段名（支持 a.b 路径）
         * @param args.limit 返回条数上限，默认 100，最大 1000
         * @returns 取值统计列表，按出现次数降序
         */
        gameDataFieldValues: async (_parent, args) => {
            const limit = Math.min(Math.max(args.limit ?? DEFAULT_FIELD_VALUE_LIMIT, 0), MAX_FIELD_VALUE_LIMIT)
            return withGraphQLError(() => getDataSetFieldValues(args.dataset, args.field, limit))
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs, { JSON: unknown }>, Context>
