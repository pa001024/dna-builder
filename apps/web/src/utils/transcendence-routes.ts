import type { LocationQuery, RouteLocationRaw } from "vue-router"

/** 旧 tab 链接里需要原样带到新路由的筛选参数；tab 与已转成路径的 id 除外 */
const LEGACY_QUERY_KEYS = ["kw", "tree", "view", "kind", "ml", "ft", "journeysub", "gearsub"] as const

/** gear / journey 子页中同时作为路径段与筛选参数的键 */
interface LegacyRedirect {
    path: string
    dropQueryKeys: readonly string[]
    /** 路径已改成列表页时，把旧 id 带成 query 参数（如基础名详情 → 列表 + `?id=`） */
    extraQuery?: Record<string, string>
}

/**
 * 把 `/db/transcendence?tab=...&id=...` 映射到独立路由；未知或空 tab 回总览并清掉 `tab`。
 * @param to 旧入口路由
 * @returns 新路由；无需转换（不带 tab）时返回 null
 */
export function resolveLegacyTranscendenceRoute(to: { query: LocationQuery; hash: string }): RouteLocationRaw | null {
    if (!("tab" in to.query)) {
        return null
    }

    const tab = firstQueryValue(to.query.tab)

    const id = numericQueryId(to.query.id)
    const gearsub = firstQueryValue(to.query.gearsub)
    const journeysub = firstQueryValue(to.query.journeysub)
    let redirect: LegacyRedirect | null = null

    switch (tab) {
        case "overview":
            redirect = { path: "/db/transcendence", dropQueryKeys: [] }
            break
        case "talents":
            redirect = { path: id ? `/db/transcendence/talent/${id}` : "/db/transcendence/talent", dropQueryKeys: [] }
            break
        case "gear":
            if (gearsub === "unique") {
                redirect = {
                    path: id ? `/db/transcendence/gear/unique/${id}` : "/db/transcendence/gear/unique",
                    dropQueryKeys: ["gearsub"],
                }
            } else if (gearsub === "base") {
                redirect = {
                    path: "/db/transcendence/gear/base",
                    dropQueryKeys: ["gearsub"],
                    extraQuery: id ? { id: String(id) } : undefined,
                }
            } else if (gearsub === "inlay" || gearsub === "craft") {
                redirect = { path: `/db/transcendence/gear/${gearsub}`, dropQueryKeys: ["gearsub"] }
            } else if (gearsub === "breakdown") {
                redirect = { path: "/db/transcendence/gear/craft", dropQueryKeys: ["gearsub"] }
            } else {
                redirect = { path: id ? `/db/transcendence/gear/affix/${id}` : "/db/transcendence/gear/affix", dropQueryKeys: ["gearsub"] }
            }
            break
        case "rift":
            redirect = {
                path: "/db/transcendence/rift",
                dropQueryKeys: [],
                extraQuery: id ? { id: String(id) } : undefined,
            }
            break
        case "nest":
            redirect = { path: id ? `/db/transcendence/nest/${id}` : "/db/transcendence/nest", dropQueryKeys: [] }
            break
        case "journey":
            if (journeysub === "commissions") {
                redirect = { path: "/db/transcendence/commission", dropQueryKeys: ["journeysub"] }
            } else if (journeysub === "buffs") {
                redirect = { path: "/db/transcendence/journey/buffs", dropQueryKeys: ["journeysub"] }
            } else {
                redirect = {
                    path: id ? `/db/transcendence/journey/quest/${id}` : "/db/transcendence/journey",
                    dropQueryKeys: ["journeysub"],
                }
            }
            break
        default:
            // 未知 / 空 tab：回总览，只保留白名单筛选参数
            redirect = { path: "/db/transcendence", dropQueryKeys: [] }
    }

    const query: Record<string, string> = {}
    for (const key of LEGACY_QUERY_KEYS) {
        // journeysub / gearsub 在决定目标路径后有意丢弃：新路由用路径表达子页，保留会形成重复态
        if (redirect.dropQueryKeys.includes(key)) {
            continue
        }

        const value = firstQueryValue(to.query[key])
        if (value !== undefined) {
            query[key] = value
        }
    }

    if (redirect.extraQuery) {
        Object.assign(query, redirect.extraQuery)
    }

    // hash 是 URL fragment（#section），不是 query 参数，原样带到新地址
    return { path: redirect.path, query, hash: to.hash }
}

/** query 可能是数组/空值；只取第一个有效字符串 */
function firstQueryValue(value: LocationQuery[string]): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value

    return raw === null || raw === undefined || raw === "" ? undefined : String(raw)
}

/** 只接受有限的非负整数 id，避免把脏值拼进详情路径 */
function numericQueryId(value: LocationQuery[string]): number | null {
    const raw = firstQueryValue(value)

    if (raw === undefined) {
        return null
    }

    const id = Number(raw)

    return Number.isSafeInteger(id) && id > 0 ? id : null
}
