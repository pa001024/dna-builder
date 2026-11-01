/**
 * 游戏数据查询接口测试。
 *
 * 覆盖三层：
 * 1. 注册表层（模块枚举、数据集枚举、记录标准化、字段统计）；
 * 2. 查询引擎层（字段路径、过滤算子、全文匹配、排序、投影、分页）；
 * 3. GraphQL 层（真实 graphql-yoga + graphql-jit 管线执行，含 JSON 标量与变量传参）。
 *
 * 注意：这里不 import `./index`（那会把整个 schema 与 sqlite 一起拉起来），
 * 因此单独用一个测试校验「全部模块 SDL 合并」与「标量经 Object.assign 合并后仍可用」。
 */

import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { useGraphQlJit } from "@envelop/graphql-jit"
import { createSchema, createYoga } from "graphql-yoga"
import { jsonScalar, resolvers, typeDefs } from "./gameData"
import { compareRecords, matchFilter, matchSearch, projectRecord, resolveFieldValues, runDataQuery } from "./gameDataQuery"
import {
    type DataRecord,
    findDataSetRecord,
    getDataSetFields,
    getDataSetFieldValues,
    getDataSetRecords,
    listDataModules,
    listDataSets,
    resolveDataSet,
} from "./gameDataRegistry"

/** 造一条测试记录 */
function record(data: Record<string, unknown>, key = "k"): DataRecord {
    return { key, data }
}

describe("数据模块注册表", () => {
    it("登记了 packages/data/d 下全部数据文件", () => {
        const files = readdirSync(resolve(import.meta.dir, "../../../../../packages/data/d")).filter(name => name.endsWith(".data.ts"))
        // 模块含语言变体、id 也未必等于文件名：按源文件集合比对，保证每个文件都可达
        const registered = new Set(listDataModules().map(item => item.file.split("/").pop()))
        expect(registered).toEqual(new Set(files))
    })

    it("识别语言变体", () => {
        const modules = listDataModules()
        const en = modules.find(item => item.id === "charext.en")
        expect(en?.locale).toBe("en")
        expect(en?.baseId).toBe("charext")
        expect(en?.variants).toContain("charext.en")
        expect(en?.variants).toContain("charext")

        const zh = modules.find(item => item.id === "char")
        expect(zh?.locale).toBe("zh")
        expect(zh?.variants).toContain("char")
    })

    it("default 导出占用模块 id", async () => {
        const sets = await listDataSets("char")
        const primary = sets.find(item => item.exportName === "default")
        expect(primary).toMatchObject({ id: "char", module: "char", kind: "array", locale: "zh" })
        expect(sets.every(item => item.id === "char" || item.id.startsWith("char:"))).toBe(true)
        // 记录数与实际记录互锁，不写绝对数字
        expect(primary?.count).toBe((await getDataSetRecords("char")).length)
    })

    it("新增数据文件已登记为模块", async () => {
        for (const id of ["archive", "clue", "extvoice", "pan", "review", "wiki"]) {
            const sets = await listDataSets(id)
            expect(sets.length).toBeGreaterThan(0)
            expect(sets.every(item => item.id === id || item.id.startsWith(`${id}:`))).toBe(true)
        }
        const pan = await listDataSets("pan")
        expect(pan.some(item => item.id === "pan:panData")).toBe(true)
    })

    it("与 default 同源的具名导出不重复登记", async () => {
        const sets = await listDataSets("resource")
        expect(sets.find(item => item.exportName === "default")?.id).toBe("resource")
        expect(sets.every(item => item.id === "resource" || item.id.startsWith("resource:"))).toBe(true)
    })

    it("多导出的模块用 模块:导出名 区分", async () => {
        const sets = await listDataSets("pet")
        expect(sets.find(item => item.exportName === "default")?.id).toBe("pet")
        expect(sets.length).toBeGreaterThan(1)
        expect(sets.every(item => item.id === "pet" || item.id.startsWith("pet:"))).toBe(true)
    })

    it("没有 default 时按具名导出登记", async () => {
        const sets = await listDataSets("abyss")
        expect(sets.length).toBeGreaterThan(0)
        expect(sets.every(item => item.exportName !== "default")).toBe(true)
        expect(sets.every(item => item.id.startsWith("abyss:") && item.locale === "zh")).toBe(true)
    })

    it("按导出名别名解析数据集", async () => {
        const aliased = await resolveDataSet("resource:resourceData")
        expect(aliased.id).toBe("resource")
        const canonical = await resolveDataSet("resource")
        expect(canonical.exportName).toBe("default")
    })

    it("未知模块与未知数据集报错", async () => {
        await expect(listDataSets("not-exist")).rejects.toThrow("未知数据模块")
        await expect(resolveDataSet("char:notExist")).rejects.toThrow("未知数据集")
    })

    it("记录键取 id，找不到 id 时回退名称或序号", async () => {
        const records = await getDataSetRecords("char")
        expect(records.length).toBeGreaterThan(0)
        const keys = records.map(item => item.key)
        expect(new Set(keys).size).toBe(keys.length)

        // levelup 的 exp 表是纯数字数组，只能回退序号
        const levelUp = await getDataSetRecords("levelup:charLevelUpExpCost")
        expect(levelUp[0].key).toBe("0")
        expect(typeof (levelUp[0].data as { value?: unknown }).value).toBe("number")
    })

    it("按 id 与按名称都能取到同一条记录", async () => {
        const records = await getDataSetRecords("char")
        const first = records[0]
        expect((await findDataSetRecord("char", first.key))?.key).toBe(first.key)
        const name = (first.data as { 名称?: unknown }).名称
        if (typeof name === "string" && name) {
            expect((await findDataSetRecord("char", name))?.key).toBe(first.key)
        }
        expect(await findDataSetRecord("char", "不存在")).toBeNull()
    })

    it("归纳顶层字段", async () => {
        const fields = await getDataSetFields("char")
        expect(fields).toContain("id")
        expect(fields).toContain("名称")
        expect(fields).toContain("特质")
    })

    it("统计字段去重取值", async () => {
        const mods = await getDataSetRecords("mod")
        const purple = mods.filter(item => (item.data as { 品质?: unknown }).品质 === "紫").length
        expect(purple).toBeGreaterThan(0)
        const facets = await getDataSetFieldValues("mod", "品质")
        expect(facets.find(item => item.value === "紫")).toEqual({ value: "紫", count: purple })
        expect(facets.find(item => item.value === "金")?.count).toBeGreaterThan(0)
    })

    it("按路径统计数组字段的取值", async () => {
        const facets = await getDataSetFieldValues("char", "特质.名称")
        expect(facets.length).toBeGreaterThan(0)
        expect(facets.every(item => typeof item.value === "string")).toBe(true)
    })
})

describe("查询引擎", () => {
    it("按路径取值，数组自动下钻", () => {
        const item = record({ 特质: [{ 名称: "冒险家" }, { 名称: "印象：道德" }], 精通: ["单手剑", "双枪"] })
        expect(resolveFieldValues(item.data, "精通")).toEqual([["单手剑", "双枪"]])
        expect(resolveFieldValues(item.data, "特质.名称")).toEqual(["冒险家", "印象：道德"])
        expect(resolveFieldValues(item.data, "不存在")).toEqual([])
    })

    it("EQ 数字与数字字符串互认，数组任一元素命中即可", () => {
        const item = record({ id: 1101, 标签: ["输出", "武器伤害"] })
        expect(matchFilter(item, { field: "id", op: "EQ", value: "1101" })).toBe(true)
        expect(matchFilter(item, { field: "标签", op: "EQ", value: "输出" })).toBe(true)
        expect(matchFilter(item, { field: "标签", op: "EQ", value: "治疗" })).toBe(false)
    })

    it("NE 在字段缺失时也成立", () => {
        const item = record({ id: 1 })
        expect(matchFilter(item, { field: "品质", op: "NE", value: "紫" })).toBe(true)
    })

    it("CONTAINS 支持子串与数组元素", () => {
        const item = record({ 名称: "炽灼", 精通: ["单手剑"] })
        expect(matchFilter(item, { field: "名称", op: "CONTAINS", value: "炽" })).toBe(true)
        expect(matchFilter(item, { field: "精通", op: "CONTAINS", value: "单手剑" })).toBe(true)
        expect(matchFilter(item, { field: "精通", op: "CONTAINS", value: "太刀" })).toBe(false)
    })

    it("IN 命中给定数组中的任意一项", () => {
        const item = record({ 品质: "金" })
        expect(matchFilter(item, { field: "品质", op: "IN", value: ["金", "紫"] })).toBe(true)
        expect(matchFilter(item, { field: "品质", op: "IN", value: ["蓝"] })).toBe(false)
    })

    it("数值比较算子", () => {
        const item = record({ 耐受: 5, 版本: "1.6" })
        expect(matchFilter(item, { field: "耐受", op: "GT", value: 3 })).toBe(true)
        expect(matchFilter(item, { field: "耐受", op: "GTE", value: 5 })).toBe(true)
        expect(matchFilter(item, { field: "耐受", op: "LT", value: 5 })).toBe(false)
        expect(matchFilter(item, { field: "版本", op: "LTE", value: "1.6" })).toBe(true)
    })

    it("EXISTS 判定非空", () => {
        expect(matchFilter(record({ 描述: "有" }), { field: "描述", op: "EXISTS" })).toBe(true)
        expect(matchFilter(record({ 描述: "" }), { field: "描述", op: "EXISTS" })).toBe(false)
        expect(matchFilter(record({ 描述: [] }), { field: "描述", op: "EXISTS" })).toBe(false)
        expect(matchFilter(record({}), { field: "描述", op: "EXISTS" })).toBe(false)
    })

    it("全文匹配跨字段、大小写不敏感、键名也算命中", () => {
        const item = record({ 名称: "Phoenix", 嵌套: { 描述: "不死鸟" }, "@近战增伤": 1 })
        expect(matchSearch(item, "phoenix")).toBe(true)
        expect(matchSearch(item, "不死鸟")).toBe(true)
        expect(matchSearch(item, "近战增伤")).toBe(true)
        expect(matchSearch(item, "不存在")).toBe(false)
        expect(matchSearch(item, "  ")).toBe(true)
    })

    it("排序支持升降序，缺值恒排最后", () => {
        const items = [record({ id: 2 }, "b"), record({ id: 1 }, "a"), record({}, "c")]
        const asc = [...items].sort((a, b) => compareRecords(a, b, [{ field: "id" }]))
        expect(asc.map(item => item.key)).toEqual(["a", "b", "c"])
        const desc = [...items].sort((a, b) => compareRecords(a, b, [{ field: "id", desc: true }]))
        expect(desc.map(item => item.key)).toEqual(["b", "a", "c"])
    })

    it("投影只保留顶层字段", () => {
        const item = record({ id: 1, 名称: "甲", 特质: [{ 名称: "乙" }] })
        expect(projectRecord(item, ["id", "特质.名称"])).toEqual({ key: "k", data: { id: 1, 特质: [{ 名称: "乙" }] } })
        expect(projectRecord(item, [])).toBe(item)
    })

    it("分页信封与条数钳制", () => {
        const items = Array.from({ length: 120 }, (_, index) => record({ id: index }, String(index)))
        const page = runDataQuery(items, { offset: 10, limit: 5 })
        expect(page).toMatchObject({ total: 120, offset: 10, limit: 5, count: 5 })
        expect(page.items[0].key).toBe("10")

        expect(runDataQuery(items, {}).limit).toBe(50)
        expect(runDataQuery(items, { limit: 9999 }).limit).toBe(500)
        expect(runDataQuery(items, { limit: 0 }).items).toHaveLength(0)
        expect(runDataQuery(items, { offset: -5, limit: -1 })).toMatchObject({ offset: 0, limit: 50 })
        expect(runDataQuery(items, { offset: 500 }).count).toBe(0)
    })

    it("过滤 + 匹配 + 排序 + 投影组合生效", () => {
        const items = [
            record({ 名称: "炽灼", 品质: "白", 耐受: 5 }, "1"),
            record({ 名称: "炽灼", 品质: "金", 耐受: 9 }, "2"),
            record({ 名称: "其它", 品质: "金", 耐受: 7 }, "3"),
        ]
        const result = runDataQuery(items, {
            where: [{ field: "品质", op: "EQ", value: "金" }],
            search: "炽灼",
            sort: [{ field: "耐受", desc: true }],
            fields: ["名称"],
        })
        expect(result.total).toBe(1)
        expect(result.items[0]).toEqual({ key: "2", data: { 名称: "炽灼" } })
    })
})

describe("GraphQL 数据接口", () => {
    const schema = createSchema({ typeDefs, resolvers: resolvers as never })
    const yoga = createYoga({ schema, plugins: [useGraphQlJit()] })

    /**
     * 执行一次 GraphQL 请求。
     * @param query 查询文本
     * @param variables 变量
     * @returns 响应 JSON
     */
    async function execute(query: string, variables?: Record<string, unknown>): Promise<any> {
        const response = await yoga.fetch("http://localhost/graphql", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query, variables }),
        })
        const payload = (await response.json()) as any
        if (payload.errors) {
            throw new Error(`GraphQL 错误: ${JSON.stringify(payload.errors)}`)
        }
        return payload.data
    }

    it("列出数据模块（不加载数据）", async () => {
        const data = await execute(`query { gameDataModules { id label baseId locale variants } }`)
        expect(data.gameDataModules.length).toBeGreaterThan(70)
        const char = data.gameDataModules.find((item: any) => item.id === "char")
        expect(char).toEqual({ id: "char", label: "角色", baseId: "char", locale: "zh", variants: ["char"] })
    })

    it("列出数据集（含记录数与导出形态）", async () => {
        const data = await execute(`query { gameDataSets(module: "char") { id exportName kind count locale } }`)
        const primary = data.gameDataSets.find((item: any) => item.exportName === "default")
        expect(primary).toMatchObject({ id: "char", kind: "array", locale: "zh" })
        expect(primary.count).toBe((await getDataSetRecords("char")).length)
    })

    it("取数据集顶层字段名", async () => {
        const fields = await execute(`query { gameDataFields(dataset: "char") }`)
        expect(fields.gameDataFields).toContain("名称")
        expect(fields.gameDataFields).toContain("特质")

        // limit 控制归纳字段时扫描的记录条数：只扫 1 条时字段更少
        const sampled = await execute(`query { gameDataFields(dataset: "char", limit: 1) }`)
        expect(sampled.gameDataFields.length).toBeLessThan(fields.gameDataFields.length)
    })

    it("按字面量过滤、投影与分页", async () => {
        const data = await execute(`
            query {
                gameData(input: { dataset: "char", where: [{ field: "名称", op: CONTAINS, value: "贝" }], fields: ["id", "名称"], limit: 3 }) {
                    dataset
                    dataSet { id count kind }
                    total
                    count
                    offset
                    limit
                    items { key data }
                }
            }
        `)
        expect(data.gameData).toMatchObject({ dataset: "char", offset: 0, limit: 3 })
        expect(data.gameData.total).toBeGreaterThan(0)
        expect(data.gameData.count).toBe(data.gameData.total)
        expect(data.gameData.items.every((item: any) => String(item.data.名称).includes("贝"))).toBe(true)
        expect(data.gameData.dataSet.count).toBe((await getDataSetRecords("char")).length)
    })

    it("过滤值可用变量传入", async () => {
        const query = `query ($v: JSON) { gameData(input: { dataset: "mod", where: [{ field: "品质", op: EQ, value: $v }] }) { total } }`
        const literal = await execute(
            `query { gameData(input: { dataset: "mod", where: [{ field: "品质", op: EQ, value: "紫" }] }) { total } }`
        )
        const variable = await execute(query, { v: "紫" })
        expect(variable.gameData.total).toBe(literal.gameData.total)
        expect(variable.gameData.total).toBeGreaterThan(0)
    })

    it("整个查询参数可作为变量传入", async () => {
        const data = await execute(`query ($input: GameDataQuery!) { gameData(input: $input) { total items { key } } }`, {
            input: { dataset: "mod", limit: 2, sort: [{ field: "id" }] },
        })
        expect(data.gameData.total).toBeGreaterThan(0)
        expect(data.gameData.items.length).toBeLessThanOrEqual(2)
    })

    it("按记录键取单条记录，未命中返回 null", async () => {
        const list = await execute(`query { gameData(input: { dataset: "mod", limit: 1 }) { items { key data } } }`)
        const first = list.gameData.items[0]
        const data = await execute(`
            query {
                hit: gameDataRecord(dataset: "mod", key: "${first.key}") { key data }
                miss: gameDataRecord(dataset: "mod", key: "no-such-key") { key }
            }
        `)
        expect(data.hit.key).toBe(first.key)
        expect(data.hit.data).toEqual(first.data)
        expect(data.miss).toBeNull()
    })

    it("取字段去重取值", async () => {
        const data = await execute(`query { gameDataFieldValues(dataset: "mod", field: "品质", limit: 3) { value count } }`)
        expect(data.gameDataFieldValues).toHaveLength(3)
        expect(data.gameDataFieldValues[0].count).toBeGreaterThanOrEqual(data.gameDataFieldValues[1].count)
    })

    it("未知数据集返回错误", async () => {
        const response = await yoga.fetch("http://localhost/graphql", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: `query { gameData(input: { dataset: "nope" }) { total } }` }),
        })
        const payload = (await response.json()) as any
        expect(payload.errors?.[0]?.message).toContain("未知数据集")
    })

    it("JSON 输出是干净 JSON（无 undefined / Map / 循环引用）", async () => {
        const data = await execute(`query { gameData(input: { dataset: "char", limit: 1 }) { items { data } } }`)
        const text = JSON.stringify(data.gameData.items[0].data)
        expect(text).not.toContain("undefined")
        expect(text).not.toContain("[Circular]")
        expect(typeof JSON.parse(text).名称).toBe("string")
    })
})

describe("schema 集成", () => {
    it("与全部现有模块的 SDL 合并后能建成 schema（无重名冲突）", () => {
        const dir = import.meta.dir
        const allTypeDefs = readdirSync(dir)
            .filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts"))
            .map(name => {
                const content = readFileSync(resolve(dir, name), "utf-8")
                const matched = content.match(/export\s+const\s+typeDefs\s*=\s*\/\*\s*GraphQL\s*\*\/\s*`([^`]*)`/s)
                return matched?.[1] ?? ""
            })
            .filter(Boolean)

        expect(allTypeDefs.length).toBeGreaterThan(10)
        const merged = createSchema({ typeDefs: [...allTypeDefs, typeDefs], resolvers: { JSON: jsonScalar } as never })
        expect(merged.getType("GameDataSet")).toBeTruthy()
        expect(merged.getType("GameDataFilterOp")).toBeTruthy()
        expect(merged.getType("JSON")).toBeTruthy()
    })

    it("JSON 标量经 mod/index 的 Object.assign 合并后仍可用", async () => {
        // mod/index.ts 的 mergeResolvers 会把标量实例 Object.assign 进普通对象，这里复现该变换
        const copied = Object.assign({}, jsonScalar)
        const schema = createSchema({ typeDefs, resolvers: { ...resolvers, JSON: copied } as never })
        const yoga = createYoga({ schema, plugins: [useGraphQlJit()] })
        const list = await yoga.fetch("http://localhost/graphql", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: `query { gameData(input: { dataset: "mod", limit: 1 }) { items { key } } }` }),
        })
        const key = ((await list.json()) as any).data.gameData.items[0].key
        const response = await yoga.fetch("http://localhost/graphql", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: `query { gameDataRecord(dataset: "mod", key: "${key}") { data } }` }),
        })
        const payload = (await response.json()) as any
        expect(payload.errors).toBeUndefined()
        expect(typeof payload.data.gameDataRecord.data).toBe("object")
    })
})
