import { type AnyVariables, gql, type OperationContext } from "@urql/vue"
import { useUIStore } from "@/store/ui"
import { gqClient } from "./graphql"

function extractType<T extends string>(gqlQuery: T) {
    const match = gqlQuery.match(/mutation[\s\S]*?\s(\w+?)\s*[({]/m)
    if (match) {
        return match[1]
    }
    return ""
}
/**
 * 从GraphQL查询字符串中提取查询名称，并返回一个异步函数，用于执行该查询。
 * @param gqlQuery GraphQL查询字符串
 * @returns 解构后的查询结果
 */
export function typedMutation<R = { id: string }, V extends AnyVariables = AnyVariables, G extends string = string>(gqlQuery: G) {
    const name = extractType(gqlQuery)
    const query = gql(gqlQuery)
    const fn = async (variables?: V, context?: Partial<OperationContext> | undefined) => {
        try {
            const raw = await gqClient.mutation(query, variables, context).toPromise()
            if (raw?.error) {
                useUIStore().showErrorMessage("操作失败:", raw?.error?.message || "未知错误")
                return
            }
            return raw?.data?.[name] as R
        } catch (e) {
            useUIStore().showErrorMessage("操作失败:", e instanceof Error ? e.message : "未知错误")
        }
    }

    fn.raw = gqlQuery
    return fn
}
