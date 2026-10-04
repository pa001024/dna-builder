/**
 * 客户端向量召回通道。
 *
 * 分工：向量索引建在服务端（见 `server/src/rag/`），客户端只发查询、收「锚点 + 相似度」，
 * 正文仍由本地语料还原——因此不需要下载任何向量（单语言 float32 有 110MB）。
 *
 * 三道闸门，任一不满足就静默退回纯词法检索（不让向量通道的不确定性影响可用性）：
 * 1. 已登录（接口按账号鉴权与限流）；
 * 2. 携带的数据包 RAG 内容指纹与服务端索引**按语料种类**比对（不符时服务端返回 409，
 *    相符的种类仍然会返回向量——只有部分模块变化时其余模块照常可用）；
 * 3. 接口可用（未部署索引 / 网络异常都按不可用处理）。
 *
 * 指纹来自数据包清单（打包时算好），客户端不重算：本地数据会被安全模式门限过滤，
 * 重算出来的值与「整包内容」无关。服务端自己负责按当前数据重建索引，这里只管携带与降级。
 */

import { env } from "@/env"
import { registerDataPackHydrationCallback } from "@/utils/data-pack/data-pack-bridge"
import type { DBAgentLang } from "@/utils/db-locale"
import { isRagEnabled } from "@/utils/rag/enabled"

/** 一条向量召回结果 */
export interface RagVectorHit {
    /** 语料锚点 */
    anchor: string
    /** 余弦相似度 */
    score: number
}

/** 向量通道的调用结果 */
export interface RagVectorRecall {
    /** 命中的锚点；通道不可用时为空数组 */
    hits: RagVectorHit[]
    /** 通道未能参与时的原因（供 note 说明，通道可用时为 undefined） */
    unavailable?: string
}

/** 登录令牌在 localStorage 中的键（与 user store 的 useLocalStorage 一致） */
const JWT_STORAGE_KEY = "jwt_token"

/** 请求超时：向量通道是「锦上添花」，不该让一次检索等太久 */
const REQUEST_TIMEOUT = 4000

/** 当前数据包的 RAG 内容指纹缓存（按语言；语言内是「种类 → 指纹」） */
const fingerprintCache = new Map<string, Record<string, string> | null>()

registerDataPackHydrationCallback(() => {
    fingerprintCache.clear()
})

/**
 * 读取登录令牌。
 * @returns 令牌；未登录时返回空串
 */
function readToken(): string {
    if (typeof localStorage === "undefined") {
        return ""
    }

    const raw = localStorage.getItem(JWT_STORAGE_KEY)

    if (!raw) {
        return ""
    }

    try {
        // vueuse 的 useLocalStorage 写入的是 JSON 字符串
        const parsed = JSON.parse(raw)

        return typeof parsed === "string" ? parsed : ""
    } catch {
        return raw
    }
}

/**
 * 取当前已安装数据包里某个语言按种类分别的 RAG 内容指纹。
 * @param lang 数据语言
 * @returns 种类 → 指纹；未安装数据包 / 老数据包没有该字段时返回 null
 */
async function resolveFingerprints(lang: string): Promise<Record<string, string> | null> {
    const cached = fingerprintCache.get(lang)

    if (cached !== undefined) {
        return cached
    }

    try {
        const { getLoadedDataPackRagFingerprints } = await import("@/utils/data-pack/data-pack")
        const fingerprints = getLoadedDataPackRagFingerprints(lang)
        fingerprintCache.set(lang, fingerprints)

        return fingerprints
    } catch (error) {
        console.warn("[rag] 读取数据包 RAG 指纹失败，本次不使用向量通道", error)

        return null
    }
}

/**
 * 请求向量召回。
 * @param options.query 查询文本
 * @param options.lang 数据语言
 * @param options.limit 候选条数上限
 * @returns 命中的锚点；通道不可用时给出原因
 */
export async function fetchVectorRecall(options: { query: string; lang: DBAgentLang; limit?: number }): Promise<RagVectorRecall> {
    const query = options.query.trim()
    const token = readToken()

    if (!query) {
        return { hits: [] }
    }

    // 开关关闭时不发任何后端请求（也不读数据包指纹）
    if (!isRagEnabled()) {
        return { hits: [], unavailable: "上下文检索增强已关闭，未使用向量通道" }
    }

    if (!token) {
        return { hits: [], unavailable: "未登录，未使用向量通道" }
    }

    const fingerprints = await resolveFingerprints(options.lang)

    if (!fingerprints) {
        return { hits: [], unavailable: "未安装数据包（或数据包没有 RAG 指纹），未使用向量通道" }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

    try {
        const response = await fetch(`${env.apiEndpoint.replace(/\/$/, "")}/api/v1/rag/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ query, lang: options.lang, fingerprints, limit: options.limit ?? 40 }),
            signal: controller.signal,
        })

        if (response.status === 409) {
            const detail = (await response.json().catch(() => ({}))) as { error?: string; stale_kinds?: string[]; building?: boolean }

            return {
                hits: [],
                unavailable:
                    detail.error === "index_building"
                        ? "服务端正在按当前数据构建向量索引（已退回关键词检索）"
                        : `本机数据包的语料与服务端索引不一致${detail.stale_kinds?.length ? `（${detail.stale_kinds.join(" / ")}）` : ""}，已退回关键词检索`,
            }
        }

        if (!response.ok) {
            return { hits: [], unavailable: `向量通道不可用（HTTP ${response.status}）` }
        }

        const payload = (await response.json()) as { results?: RagVectorHit[] }

        return { hits: Array.isArray(payload.results) ? payload.results : [] }
    } catch (error) {
        // 超时与网络失败都按「本次不用向量通道」处理，不影响词法检索
        return { hits: [], unavailable: `向量通道请求失败：${error instanceof Error ? error.message : String(error)}` }
    } finally {
        clearTimeout(timer)
    }
}
