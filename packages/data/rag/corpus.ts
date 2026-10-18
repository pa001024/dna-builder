/**
 * 服务端语料装配（**离线/服务端专用**，浏览器端不用它）。
 *
 * 数据包构建（算内容指纹）与服务端建索引都由这里取语料——同一份实现、同一套切块器，
 * 两边算出的内容指纹才能对上（见 `ragKindFingerprints`，按语料种类各算一份）。
 *
 * 浏览器端走的是另一条路径（`src/utils/rag/corpus.ts`）：它从已水合的数据包读数据、
 * 分片让出主线程，并把索引工作交给 Worker。两者用的是同一批 `build*Chunks` 切块器，
 * 因此锚点、指纹、正文逐位一致；差别只在「怎么把数据读出来」。
 *
 * 数据来源是仓库里的 `src/data/d/*.data.ts`（与数据包同源），
 * 因此可以整份 import 全量数据。
 */

import type { CharExt } from "../d/charext.data"
import type { CharVoice } from "../d/charvoice.data"
import type { ClueTabType } from "../d/clue.data"
import type { QuestItem } from "../d/quest.data"
import type { QuestChain } from "../d/questchain.data"
import type { ReviewPage } from "../d/review.data"
import type { WikiMainType } from "../d/wiki.data"
import { setCurrentVersionLimit } from "../versionGate"
import {
    buildClueChunks,
    buildProfileChunks,
    buildReviewChunks,
    buildStoryChunks,
    buildSummaryChunks,
    buildVoiceChunks,
    buildWikiChunks,
} from "./chunks"
import {
    RAG_CN_SOURCE_LANG,
    RAG_SERVER_KINDS,
    RAG_SUMMARY_LANG,
    type RagChunk,
    type RagChunkKind,
    type RagKindFingerprintMap,
    ragKindFingerprints,
} from "./types"

/** 一个语言的语料规模与**按种类分别**的内容指纹 */
export interface RagFingerprintInfo {
    /** 种类 → 16 位十六进制内容指纹（只含有内容的种类） */
    kinds: RagKindFingerprintMap
    /** 参与指纹的 chunk 条数 */
    count: number
}

/**
 * 放开版本门限后再加载数据。
 *
 * `questchain.data.ts` 在模块求值时就会按当前门限过滤（浏览器里安全模式默认 1.6），
 * 而数据包与索引都应该覆盖数据文件里的全部内容——安全模式只在客户端展示时生效，
 * 因此必须在 import 之前把门限设为无限。Bun 环境没有 localStorage，默认门限已是无限，
 * 这里显式设置是为了不依赖运行环境。
 * @returns 全量任务链
 */
async function loadVersionUnlimitedQuestChains(): Promise<QuestChain[]> {
    setCurrentVersionLimit(Number.POSITIVE_INFINITY)
    const module = await import("../d/questchain.data")

    return module.questChainData
}

/**
 * 取某个语言的剧情任务详情（任务名与对话正文都按语言切分）。
 * @param lang 数据语言
 * @returns 任务 id → 任务详情
 */
async function loadQuestItems(lang: string): Promise<Map<number, QuestItem>> {
    const { getQuestDataByLocale } = await import("../d/story-locale")
    const stories = await getQuestDataByLocale(lang as Parameters<typeof getQuestDataByLocale>[0])
    const map = new Map<number, QuestItem>()

    for (const story of stories) {
        for (const quest of story.quests) {
            map.set(quest.id, quest)
        }
    }

    return map
}

/**
 * 取 NPC 名（剧情说话人补齐）。
 *
 * 直接用 `npc.data` 的原始数组建映射，而不是引 `@/data/d` 的 `npcMap`：
 * 后者所在的数据索引入口会拉起 Vue 响应式依赖，服务端没必要为此引入前端运行时。
 * @returns NPC id → 名称
 */
async function loadNpcNames(): Promise<Map<number, string>> {
    const { npcData } = await import("../d/npc.data")

    return new Map(npcData.map(npc => [npc.id, npc.name || ""]))
}

/**
 * 取角色名（语音与档案语料的伴随信息）。
 * @returns 角色 id → 角色名
 */
async function loadCharNames(): Promise<Map<number, string>> {
    const charData = (await import("../d/char.data")).default

    return new Map(charData.map(char => [char.id, char.名称]))
}

/**
 * 取某个语言的角色语音。
 * @param lang 数据语言
 * @returns 语音列表
 */
async function loadVoices(lang: string): Promise<CharVoice[]> {
    const { getLocalizedCharVoiceData } = await import("../d/charvoice-locale")

    return getLocalizedCharVoiceData(lang)
}

/**
 * 取某个语言的角色档案。
 * @param lang 数据语言
 * @returns 档案列表
 */
async function loadProfiles(lang: string): Promise<CharExt[]> {
    const { getLocalizedCharExtData } = await import("../d/charext-locale")

    return getLocalizedCharExtData(lang)
}

/**
 * 取剧情 AI 总结（任务链 id → 梗概）。
 *
 * 数据只有简体中文一套（与 `RAG_SUMMARY_LANG` 同源），因此**不按 lang 取**：
 * 每个语言的语料都嵌同一份中文梗概，查询侧靠跨语言能力对齐。
 * @returns 任务链 id → 总结正文
 */
async function loadStorySummaries(): Promise<Record<number, string>> {
    const { storySummaryData } = await import("../d/storysummary.data")

    return storySummaryData
}

/**
 * 取调查墙线索板数据。
 *
 * 正文只有简体中文一套（与 `RAG_CN_SOURCE_LANG` 同源），因此**不按 lang 取**：
 * 每个语言的语料都嵌同一份中文线索，查询侧靠跨语言能力对齐。
 * @returns 线索板页类型树
 */
async function loadClueTabs(): Promise<ClueTabType[]> {
    const { clueData } = await import("../d/clue.data")

    return clueData
}

/**
 * 取剧情回顾数据（同线索板：正文只有简体中文一套，不按 lang 取）。
 * @returns 回顾页树
 */
async function loadReviewPages(): Promise<ReviewPage[]> {
    const { reviewData } = await import("../d/review.data")

    return reviewData
}

/**
 * 取游戏内百科数据（同线索板：正文只有简体中文一套，不按 lang 取）。
 * @returns 百科大类树
 */
async function loadWikiMainTypes(): Promise<WikiMainType[]> {
    const { wikiData } = await import("../d/wiki.data")

    return wikiData
}

/**
 * 构建某个语言、指定种类的语料 chunk。
 *
 * 条目语料（全库条目）**不在服务端建向量**：它的名称与字段几乎都是短文本，
 * 词法召回 + facet 筛选已经足够准，语义检索的收益集中在长文本的剧情、剧情总结、语音与角色档案上。
 * 条目仍会进客户端的词法索引（见 `src/utils/rag/corpus.ts`）。
 * @param lang 数据语言（zh / en / jp / kr / fr / tc）
 * @param kinds 需要构建的语料种类；默认为服务端索引的全部种类
 * @returns chunk 列表（顺序即剧情顺序）
 */
export async function buildRagChunks(lang: string, kinds: readonly RagChunkKind[] = RAG_SERVER_KINDS): Promise<RagChunk[]> {
    const wanted = new Set(kinds)
    const chunks: RagChunk[] = []
    // 剧情与总结都要任务链数据（且都必须在放开版本门限后加载）
    const needsChains = wanted.has("story") || wanted.has("summary")
    const chains = needsChains ? await loadVersionUnlimitedQuestChains() : []

    if (wanted.has("story")) {
        const [questItems, npcNames] = await Promise.all([loadQuestItems(lang), loadNpcNames()])
        chunks.push(...buildStoryChunks({ lang, chains, questItems, npcNames }))
    }

    if (wanted.has("summary")) {
        chunks.push(...buildSummaryChunks({ lang: RAG_SUMMARY_LANG, chains, summaries: await loadStorySummaries() }))
    }

    // 语音与档案共用角色名映射（档案标题由角色名 + 档案名拼成），只取一次
    if (wanted.has("voice") || wanted.has("profile")) {
        const charNames = await loadCharNames()

        if (wanted.has("voice")) {
            chunks.push(...buildVoiceChunks({ lang, voices: await loadVoices(lang), charNames }))
        }

        if (wanted.has("profile")) {
            chunks.push(...buildProfileChunks({ lang, profiles: await loadProfiles(lang), charNames }))
        }
    }

    // 调查墙线索板、剧情回顾与游戏内百科：正文只有简体中文一套，故 lang 恒为 RAG_CN_SOURCE_LANG
    if (wanted.has("clue")) {
        chunks.push(...buildClueChunks({ lang: RAG_CN_SOURCE_LANG, tabs: await loadClueTabs() }))
    }

    if (wanted.has("review")) {
        chunks.push(...buildReviewChunks({ lang: RAG_CN_SOURCE_LANG, pages: await loadReviewPages() }))
    }

    if (wanted.has("wiki")) {
        chunks.push(...buildWikiChunks({ lang: RAG_CN_SOURCE_LANG, mainTypes: await loadWikiMainTypes() }))
    }

    return chunks
}

/**
 * 计算某个语言**按种类分别**的语料内容指纹（数据包清单与服务端索引共用）。
 * @param lang 数据语言
 * @param kinds 参与指纹的语料种类；默认与服务端索引一致
 * @returns 各类型指纹与总条数
 */
export async function computeRagFingerprint(lang: string, kinds: readonly RagChunkKind[] = RAG_SERVER_KINDS): Promise<RagFingerprintInfo> {
    const chunks = await buildRagChunks(lang, kinds)

    return { kinds: ragKindFingerprints(chunks), count: chunks.length }
}

/**
 * 批量计算多个语言的内容指纹。
 *
 * 单个语言失败（数据缺失、文件损坏）只跳过该语言并告警：数据包构建不该因为
 * 某个语言没有数据而整体失败，客户端在该语言下会因为没有指纹而退回纯词法检索。
 * @param langs 数据语言列表
 * @returns 语言 → 指纹信息（失败的语言不出现在结果里）
 */
export async function computeRagFingerprints(langs: readonly string[]): Promise<Record<string, RagFingerprintInfo>> {
    const result: Record<string, RagFingerprintInfo> = {}

    for (const lang of langs) {
        try {
            result[lang] = await computeRagFingerprint(lang)
        } catch (error) {
            console.warn(`[rag] 计算 ${lang} 语料指纹失败，已跳过：${error instanceof Error ? error.message : String(error)}`)
        }
    }

    return result
}
