/**
 * 内省查询识别。
 *
 * GraphiQL、代码生成器这类客户端拉取 schema 时会发内省查询（顶层字段是 `__schema` / `__type`）。
 * 这类查询必须绕开 graphql-jit：graphql v17 把参数默认值改成了 `default: { value }`，
 * 而 graphql-jit 仍读 v16 的 `defaultValue`，于是内省字段 `directives(includeDeprecated: Boolean!)`
 * 被判成「必填参数未提供」，GraphiQL 直接报 Error fetching schema。
 */

import { type ExecutionArgs, getOperationAST, Kind } from "graphql"

/**
 * 判断是否为内省查询。
 *
 * graphql v17 的 ExecutionArgs 里没有 `operation`，只能按 operationName 从 document 现解析；
 * 顶层字段里只要出现一个内省字段就整条查询不走 JIT。
 * @param args 执行参数（execute / subscribe 都适用）
 * @returns 是否为内省查询
 */
export function isIntrospectionOperation(args: ExecutionArgs): boolean {
    const operation = getOperationAST(args.document, args.operationName ?? undefined)
    if (!operation) return false
    return operation.selectionSet.selections.some(selection => selection.kind === Kind.FIELD && selection.name.value.startsWith("__"))
}
