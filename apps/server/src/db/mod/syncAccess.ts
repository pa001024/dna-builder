import { createGraphQLError } from "graphql-yoga"
import type { Context } from "../yoga"

/**
 * 校验服务端同步令牌或 JWT 管理员权限。
 * @param token 可选服务端同步令牌。
 * @param context GraphQL 请求上下文。
 * @throws 无有效同步令牌且当前用户不是管理员时抛出。
 */
export function verifyDataSyncAccess(token: string | null | undefined, context: Context): void {
    if (context.user?.roles?.includes("admin")) return
    if (!token || token !== process.env.API_TOKEN) throw createGraphQLError("need api token")
}
