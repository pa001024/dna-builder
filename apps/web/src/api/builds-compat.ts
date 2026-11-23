import { gql } from "@urql/vue"
import type { DocumentNode } from "graphql"
import { gqClient } from "./client"
import { buildsWithCountQuery } from "./combined"
import type * as Types from "./gen/api-types"

/** 构筑列表 + 总数的查询结果 */
export interface BuildsWithCountResult {
    builds: Types.Build[]
    buildsCount: number
}

/** 兼容层入参；`buildType` 仅在服务端支持时透传 */
export interface BuildsWithCountVariables {
    search?: string
    charId?: number
    userId?: string
    limit?: number
    offset?: number
    sortBy?: string
    buildType?: "normal" | "transcend"
}

/**
 * 旧服务端可接受的查询形状：选择集与当前查询一致，但不含 `info` / `buildType`。
 * 线上服务端尚未部署新 schema 时用它重试，保证列表不 400。
 */
const LEGACY_QUERY = gql`
    query ($search: String, $charId: Int, $userId: String, $limit: Int, $offset: Int, $sortBy: String) {
        builds(search: $search, charId: $charId, userId: $userId, limit: $limit, offset: $offset, sortBy: $sortBy) {
            id
            title
            desc
            charId
            charSettings
            userId
            views
            likes
            isRecommended
            isPinned
            createdAt
            updateAt
            user {
                id
                name
                qq
            }
            isLiked
        }
        buildsCount(search: $search, charId: $charId)
    }
`

/** 当前查询：复用生成器产出的合并文档（含 `info` / `buildType`） */
const CURRENT_QUERY = gql(buildsWithCountQuery.raw as string)

/** 服务端是否支持构筑类型过滤（内存态；刷新页面后会重新探测） */
let supportsBuildType = true

/**
 * 当前服务端是否支持构筑类型过滤。
 * @returns 首次请求被旧服务端拒绝后为 false
 */
export function supportsBuildTypeFilter(): boolean {
    return supportsBuildType
}

/** 重置探测状态（仅供测试）。 */
export function resetBuildTypeSupport(): void {
    supportsBuildType = true
}

/**
 * 判断是否为旧服务端不认识新 schema 的校验错误。
 * @param error 请求错误（urql CombinedError 或普通 Error）
 * @returns 是否属于 BuildType / buildType / info 相关校验错误
 */
function isBuildTypeSchemaError(error: unknown): boolean {
    const combined = error as { message?: string; graphQLErrors?: Array<{ message?: string }> } | null
    const text = [combined?.message ?? "", ...(combined?.graphQLErrors ?? []).map(item => item.message ?? "")].join("\n")
    return /Unknown type "BuildType"|Unknown argument "buildType"|Cannot query field "info"/.test(text)
}

/**
 * 发送合并查询并返回列表与总数；无数据时抛错，交给调用方提示。
 * @param document 查询文档
 * @param variables 查询变量
 * @returns 列表与总数
 */
async function request(document: DocumentNode, variables: Record<string, unknown>): Promise<BuildsWithCountResult> {
    const result = await gqClient.query(document, variables, { requestPolicy: "cache-and-network" }).toPromise()
    if (result.error) throw result.error
    const data = result.data as Partial<BuildsWithCountResult> | null | undefined
    if (!data) throw new Error("构筑列表查询无数据")
    return { builds: data.builds ?? [], buildsCount: data.buildsCount ?? 0 }
}

/**
 * 读取构筑列表与总数：优先携带 `info` / `buildType`；旧服务端校验失败时自动降级为旧查询并记住状态。
 * 非 schema 错误（网络 / 鉴权等）原样抛出，不触发降级。
 * @param variables 查询变量
 * @returns 列表与总数
 */
export async function fetchBuildsWithCount(variables: BuildsWithCountVariables): Promise<BuildsWithCountResult> {
    if (supportsBuildType) {
        try {
            return await request(CURRENT_QUERY, variables as Record<string, unknown>)
        } catch (error) {
            if (!isBuildTypeSchemaError(error)) throw error
            supportsBuildType = false
        }
    }
    const { buildType: _unsupported, ...legacyVariables } = variables
    return request(LEGACY_QUERY, legacyVariables as Record<string, unknown>)
}
