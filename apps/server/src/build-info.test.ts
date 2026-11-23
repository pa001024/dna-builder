import { describe, expect, test } from "bun:test"
import { talents } from "dna-builder-data/d"
import { buildSchema, defaultFieldResolver, graphql } from "graphql"
import { computeBuildType, getBuildInfoParseCount, resolveBuildType } from "./build-info"
import { SAMPLE_BUILD_SETTINGS } from "./build-target-value.fixture"
import { resolvers, typeDefs } from "./db/mod/build"

const TRANSCEND_TALENT_ID = talents[0]?.id ?? 1
const TRANSCEND_SETTINGS = '{"transcend":{"enabled":true}}'

/** 测试用构筑行（GraphQL 执行时作为 builds 查询的返回值） */
interface BuildRow {
    id: string
    charSettings: string
    buildType?: string
}

/**
 * 用 build 模块的真实 typeDefs 建 schema，补齐跨模块引用的 User 类型。
 * @returns 可执行 schema
 */
function createSchema() {
    return buildSchema(`${typeDefs}\ntype User { id: String! }`)
}

/**
 * 执行查询：根字段用 rootValue，Build.info 走真实 resolver，其余字段用默认 resolver。
 * @param source GraphQL 查询文本
 * @param rows builds 查询返回的构筑行
 * @returns 执行结果
 */
async function runQuery(source: string, rows: BuildRow[]) {
    return graphql({
        schema: createSchema(),
        source,
        rootValue: { builds: rows },
        fieldResolver: (parent, args, context, info) => {
            if (info.parentType.name === "Build" && info.fieldName === "info") {
                return resolvers.Build.info(parent as { charSettings: string; buildType?: string | null })
            }
            return defaultFieldResolver(parent, args, context, info)
        },
    })
}

describe("Build typeDefs", () => {
    test("暴露 BuildInfo / BuildType，info 为必填，且支持 buildType 过滤参数", () => {
        const schema = createSchema()
        const build = schema.getType("Build") as { getFields(): Record<string, { type: unknown }> }
        const query = schema.getType("Query") as unknown as { getFields(): Record<string, { args: Array<{ name: string }> }> }
        expect(build.getFields().info).toBeDefined()
        expect(schema.getType("BuildInfo")).toBeDefined()
        expect(schema.getType("BuildType")).toBeDefined()
        expect(query.getFields().builds.args.map(arg => arg.name)).toContain("buildType")
        expect(query.getFields().buildsCount.args.map(arg => arg.name)).toContain("buildType")
    })
})

describe("computeBuildType", () => {
    test("没有 transcend 键的真实构筑为普通", () => {
        expect(computeBuildType(SAMPLE_BUILD_SETTINGS)).toBe("normal")
    })

    test("显式关闭且空配置为普通", () => {
        expect(computeBuildType("{}")).toBe("normal")
        expect(computeBuildType('{"transcend":{"enabled":false}}')).toBe("normal")
    })

    test("开启升华总开关为升华", () => {
        expect(computeBuildType(TRANSCEND_SETTINGS)).toBe("transcend")
    })

    test("只认 enabled：关闭总开关时即使含天赋 / 装备 / 变体也是普通（U140-fix §156）", () => {
        const withTalent = JSON.stringify({ transcend: { enabled: false, talentLevels: [[TRANSCEND_TALENT_ID, 1]] } })
        const withGear = JSON.stringify({ transcend: { enabled: false, gearVariants: [["A", [[1, {}]]]] } })
        expect(computeBuildType(withTalent)).toBe("normal")
        expect(computeBuildType(withGear)).toBe("normal")
    })

    test("压缩载荷的 enabled:1 还原为开启；字符串等其它真值不算升华", () => {
        expect(computeBuildType('{"transcend":{"enabled":1}}')).toBe("transcend")
        expect(computeBuildType('{"transcend":{"enabled":"true"}}')).toBe("normal")
        expect(computeBuildType('{"transcend":{"enabled":2}}')).toBe("normal")
    })

    test("损坏的 JSON / 非对象 transcend 回退普通且不抛错", () => {
        expect(computeBuildType("{ not json")).toBe("normal")
        expect(computeBuildType('{"transcend":"broken"}')).toBe("normal")
        expect(computeBuildType('{"transcend":[true]}')).toBe("normal")
    })
})

describe("resolveBuildType", () => {
    test("已入库的合法值优先且不解析配置", () => {
        const before = getBuildInfoParseCount()
        expect(resolveBuildType("transcend", "{}")).toBe("transcend")
        expect(resolveBuildType("normal", TRANSCEND_SETTINGS)).toBe("normal")
        expect(getBuildInfoParseCount()).toBe(before)
    })

    test("入库值缺失 / 非法时按配置原文回退", () => {
        const before = getBuildInfoParseCount()
        expect(resolveBuildType(null, TRANSCEND_SETTINGS)).toBe("transcend")
        expect(resolveBuildType(undefined, "{}")).toBe("normal")
        expect(resolveBuildType("legacy", TRANSCEND_SETTINGS)).toBe("transcend")
        expect(getBuildInfoParseCount()).toBe(before + 3)
    })
})

describe("Build.info 按需解析", () => {
    test("未请求 info 时不读取也不解析", async () => {
        const before = getBuildInfoParseCount()
        const result = await runQuery("{ builds { id charSettings } }", [{ id: "b1", charSettings: TRANSCEND_SETTINGS }])

        expect(result.errors).toBeUndefined()
        expect(getBuildInfoParseCount()).toBe(before)
    })

    test("行上有入库类型时直接返回，不解析 charSettings", async () => {
        const before = getBuildInfoParseCount()
        const result = await runQuery("{ builds { id info { buildType } } }", [
            { id: "b1", charSettings: "{}", buildType: "transcend" },
            { id: "b2", charSettings: TRANSCEND_SETTINGS, buildType: "normal" },
        ])

        expect(result.errors).toBeUndefined()
        const items = (result.data as { builds: Array<{ id: string; info: { buildType: string } }> }).builds
        expect(items.map(item => item.info.buildType)).toEqual(["transcend", "normal"])
        expect(getBuildInfoParseCount()).toBe(before)
    })

    test("行上没有入库类型（迁移前 / 手工数据）时按配置原文回退", async () => {
        const before = getBuildInfoParseCount()
        const result = await runQuery("{ builds { id info { buildType } } }", [
            { id: "b1", charSettings: TRANSCEND_SETTINGS },
            { id: "b2", charSettings: "{}" },
            { id: "b3", charSettings: "{ not json" },
        ])

        expect(result.errors).toBeUndefined()
        const items = (result.data as { builds: Array<{ id: string; info: { buildType: string } }> }).builds
        expect(items.map(item => item.info.buildType)).toEqual(["transcend", "normal", "normal"])
        expect(getBuildInfoParseCount()).toBe(before + items.length)
    })
})
