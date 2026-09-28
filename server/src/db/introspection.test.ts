/**
 * 内省查询守卫测试。
 *
 * 回归点：GraphiQL 拉取 schema 时报 `Argument "includeDeprecated" of required type "Boolean!" was not provided.`。
 * 成因是 graphql-jit 与 graphql v17 的参数默认值口径不一致，因此内省查询必须绕开 JIT。
 * 这里用最小 schema 复现，不依赖 gameData 与数据库。
 */

import { describe, expect, it } from "bun:test"
import { useGraphQlJit } from "@envelop/graphql-jit"
import { type ExecutionArgs, getIntrospectionQuery, parse } from "graphql"
import { createSchema, createYoga } from "graphql-yoga"
import { isIntrospectionOperation } from "./introspection"

/**
 * 造一份执行参数。
 * @param query 查询文本
 * @param operationName 操作名
 * @returns 执行参数
 */
function argsOf(query: string, operationName?: string): ExecutionArgs {
    return { schema: createSchema({ typeDefs: /* GraphQL */ `type Query { ok: Boolean! }` }), document: parse(query), operationName }
}

describe("isIntrospectionOperation", () => {
    it("识别 __schema / __type 查询", () => {
        expect(isIntrospectionOperation(argsOf(`query { __schema { queryType { name } } }`))).toBe(true)
        expect(isIntrospectionOperation(argsOf(`query { __type(name: "Query") { name } }`))).toBe(true)
        expect(isIntrospectionOperation(argsOf(getIntrospectionQuery()))).toBe(true)
    })

    it("普通查询不算内省", () => {
        expect(isIntrospectionOperation(argsOf(`query { ok }`))).toBe(false)
    })

    it("混排查询只要含内省字段就整体不走 JIT", () => {
        expect(isIntrospectionOperation(argsOf(`query { ok __schema { queryType { name } } }`))).toBe(true)
    })

    it("多操作文档按 operationName 判定", () => {
        const document = parse(`query Introspection { __schema { queryType { name } } } query Normal { ok }`)
        expect(isIntrospectionOperation({ document, operationName: "Introspection" } as ExecutionArgs)).toBe(true)
        expect(isIntrospectionOperation({ document, operationName: "Normal" } as ExecutionArgs)).toBe(false)
    })

    it("解析不出操作时按非内省处理", () => {
        expect(isIntrospectionOperation({ document: parse(`query { ok }`), operationName: "NotExist" } as ExecutionArgs)).toBe(false)
    })
})

describe("graphql-jit 内省守卫", () => {
    /** 与 yoga.ts 相同的最小 schema + 守卫配置 */
    const schema = createSchema({
        typeDefs: /* GraphQL */ `type Query { ok: Boolean! }`,
        resolvers: { Query: { ok: () => true } } as never,
    })
    const yoga = createYoga({ schema, plugins: [useGraphQlJit({}, { enableIf: args => !isIntrospectionOperation(args) })] })

    /**
     * 发一次 GraphQL 请求。
     * @param query 查询文本
     * @param operationName 操作名
     * @returns 响应 JSON
     */
    async function execute(query: string, operationName?: string): Promise<any> {
        const response = await yoga.fetch("http://localhost/graphql", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query, operationName }),
        })
        return response.json()
    }

    it("完整内省查询能取到 schema（GraphiQL 同款）", async () => {
        const payload = await execute(
            getIntrospectionQuery({
                descriptions: true,
                schemaDescription: true,
                directiveIsRepeatable: true,
                specifiedByUrl: true,
                inputValueDeprecation: true,
            }),
            "IntrospectionQuery"
        )
        expect(payload.errors).toBeUndefined()
        expect(payload.data.__schema.queryType.name).toBe("Query")
    })

    it("普通查询仍然走 JIT 并正常返回", async () => {
        const payload = await execute(`query { ok }`)
        expect(payload).toEqual({ data: { ok: true } })
    })
})
