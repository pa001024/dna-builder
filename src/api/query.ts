import { type AnyVariables, type OperationContext, gql as urqlGql } from "@urql/vue"
import { gqClient } from "./graphql"

// ==========================================
// 1. 深度修复的类型解析器
// ==========================================

type Whitespace = " " | "\n" | "\t" | "\r"
type TrimLeft<S extends string> = S extends `${Whitespace}${infer R}` ? TrimLeft<R> : S
type TrimRight<S extends string> = S extends `${infer R}${Whitespace}` ? TrimRight<R> : S
type Trim<S extends string> = TrimLeft<TrimRight<S>>

// 提取 Body
type GetQueryBody<S extends string> = S extends `${string}{${infer Body}` ? TrimLeft<Body> : never

// 辅助工具：检查字符串 S 是否包含字符 C
type Contains<S extends string, C extends string> = S extends `${string}${C}${string}` ? true : false

// 核心提取逻辑 (无 Alias)
// 依次尝试用 '(', '{', ' ', '\n' 截断
type ExtractSimpleName<S extends string> = S extends `${infer Key}(${infer _}`
    ? Trim<Key>
    : S extends `${infer Key}{${infer _}`
      ? Trim<Key>
      : S extends `${infer Key} ${infer _}`
        ? Trim<Key>
        : S extends `${infer Key}\n${infer _}`
          ? Trim<Key>
          : Trim<S>

/**
 * 1. 尝试匹配 Alias (冒号 :)
 * 2. 如果匹配到冒号，检查冒号前的 Key 是否包含 '(' 或 '{'
 *    - 如果包含，说明这个冒号其实是在参数列表里 (如 builds(id: 1))，并非 Alias。-> 走 ExtractSimpleName
 *    - 如果不包含，说明这就是 Alias (如 myBuilds: builds)。-> 提取 Alias
 * 3. 如果没匹配到冒号 -> 走 ExtractSimpleName
 */
type GetFirstKey<S extends string> = S extends `${infer Key}:${infer _}`
    ? Contains<Key, "("> extends true
        ? ExtractSimpleName<S>
        : Contains<Key, "{"> extends true
          ? ExtractSimpleName<S>
          : Trim<Key>
    : ExtractSimpleName<S>

type ExtractQueryName<S extends string> = GetFirstKey<GetQueryBody<S>>

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

// ==========================================
// 2. API 定义 (柯里化风格)
// ==========================================

export function extractType<T extends string>(gqlQuery: T) {
    const match = gqlQuery.match(/query[\s\S]*?\s(\w+?)\s*[({]/m)
    if (match) {
        return match[1]
    }
    return ""
}

export interface TypedQueryFn<R, V, G extends string> {
    (variables?: V, context?: Partial<OperationContext>): Promise<R | undefined>
    raw: G
}

export const typedQuery = <G extends string>(gqlQuery: G) => {
    const name = extractType(gqlQuery)
    const query = urqlGql(gqlQuery)

    return <R, V extends AnyVariables = AnyVariables>() => {
        const fn = async (variables?: V, context?: Partial<OperationContext> | undefined) => {
            const raw = await gqClient.query(query, variables, context).toPromise()
            return raw?.data?.[name] as R | undefined
        }
        fn.raw = gqlQuery
        return fn as TypedQueryFn<R, V, G>
    }
}

export function combinedQuery<T extends TypedQueryFn<any, any, string>[]>(...queries: [...T]) {
    type VarsTuple = {
        [K in keyof T]: T[K] extends TypedQueryFn<any, infer V, any> ? V : never
    }
    type MergedVariables = UnionToIntersection<VarsTuple[number]>

    type ResultsTuple = {
        [K in keyof T]: T[K] extends TypedQueryFn<infer R, any, infer G> ? { [Key in ExtractQueryName<G>]: R } : never
    }
    type MergedResult = UnionToIntersection<ResultsTuple[number]>

    const varDefs = new Map<string, string>()
    const bodies: string[] = []

    queries.forEach(q => {
        const queryStr = q.raw
        const argsMatch = queryStr.match(/query\s*(?:\((.*?)\))?\s*\{/)
        if (argsMatch?.[1]) {
            argsMatch[1].split(",").forEach(arg => {
                const [key, val] = arg.split(":").map(s => s.trim())
                if (key && val) varDefs.set(key, val)
            })
        }
        const start = queryStr.indexOf("{")
        const end = queryStr.lastIndexOf("}")
        if (start > -1 && end > -1) {
            bodies.push(queryStr.substring(start + 1, end))
        }
    })

    const mergedVars = Array.from(varDefs.entries())
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    const mergedBody = bodies.join("\n")
    const finalQueryStr = mergedVars ? `query (${mergedVars}) { ${mergedBody} }` : `query { ${mergedBody} }`
    const query = urqlGql(finalQueryStr)

    const fn = async (variables?: MergedVariables, context?: Partial<OperationContext>) => {
        const raw = await gqClient.query(query, variables as any, context).toPromise()
        return raw?.data as MergedResult | undefined
    }
    fn.raw = finalQueryStr
    return fn
}
