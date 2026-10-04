/**
 * RAG 语料的主线程装配：读数据 + 切块 + 分批交给索引引擎。
 *
 * 分工（实测中文全量 28,352 条：切块合计约 60ms，索引构建约 1s）：
 * - **主线程**：读数据、按锚点切块、分批传给引擎——每片控制在十几毫秒，夹在空闲回调之间；
 * - **引擎（Worker）**：切词、倒排索引、召回与片段拼装（见 `engine.ts` / `rag.worker.ts`）。
 *
 * 语料 = 剧情对话行 + 剧情 AI 总结 + 角色语音 + 角色档案 + 全库条目，五者在同一索引里统一召回，
 * 这样「一次检索跨语料」才成立（模型不必先猜该查哪个模块）。
 */

import { npcMap } from "@/data/d"
import charData from "@/data/d/char.data"
import { getLocalizedCharExtData } from "@/data/d/charext-locale"
import { getLocalizedCharVoiceData } from "@/data/d/charvoice-locale"
import type { QuestItem } from "@/data/d/quest.data"
import questChainData from "@/data/d/questchain.data"
import { getQuestDataByLocale } from "@/data/d/story-locale"
import { storySummaryData } from "@/data/d/storysummary.data"
import { buildEntryChunks, buildProfileChunks, buildStoryChunks, buildSummaryChunks, buildVoiceChunks } from "@/data/rag/chunks"
import { RAG_SUMMARY_LANG, type RagChunk } from "@/data/rag/types"
import { registerDataPackHydrationCallback } from "@/utils/data-pack/data-pack-bridge"
import type { DBAgentLang } from "@/utils/db-locale"
import { getGlobalSearchService, peekGlobalSearchService } from "@/utils/global-search"
import { isRagEnabled } from "@/utils/rag/enabled"
import { getRagEngine, yieldToBrowser } from "@/utils/rag/engine"

/** 一次装配好的语料 */
export interface RagCorpus {
    /** 数据语言 */
    lang: DBAgentLang
    /** 全部 chunk（顺序即剧情顺序，用于上下文扩展） */
    chunks: readonly RagChunk[]
}

/** 语料缓存：按数据语言缓存 */
const corpusCache = new Map<string, RagCorpus>()

/** 正在装配中的语料（同一语言的并发请求共享同一次装配） */
const pendingBuilds = new Map<string, Promise<RagCorpus>>()

/** 语言 id → 角色名，语音语料的伴随信息与检索用 */
const charNames = new Map(charData.map(char => [char.id, char.名称]))

/** NPC id → 名称（剧情说话人补齐；数据只有中文原文，与检索层现状一致） */
const npcNames = new Map([...npcMap].map(([id, npc]) => [id, npc.name || ""]))

/** 每片处理的任务链数量：实测全量 158 链约 47ms，按 24 链一片则每片 <10ms */
const CHAIN_SLICE_SIZE = 24

// 数据包换版会换掉整套数据：已装配的语料与引擎里的索引全部作废
registerDataPackHydrationCallback(() => {
    corpusCache.clear()
    pendingBuilds.clear()
    getRagEngine().reset()
})

/**
 * 把任务列表摊成「任务 id → 任务详情」的映射。
 * @param lang 数据语言
 * @returns 任务映射
 */
async function collectQuestItems(lang: DBAgentLang): Promise<Map<number, QuestItem>> {
    const stories = await getQuestDataByLocale(lang)
    const map = new Map<number, QuestItem>()

    for (const story of stories) {
        for (const quest of story.quests) {
            map.set(quest.id, quest)
        }
    }

    return map
}

/**
 * 取全库条目的检索输入。
 *
 * 条目枚举复用全库检索索引（它本就要在主线程建，且已覆盖 30 个数据源）。
 * 索引可能还在预热中，这里**先等它**而不是同步重建一次：预热是空闲期启动的，
 * 检索路径上再同步建一遍会把 800ms 的构建搬到用户等待里。
 * @returns 条目输入列表
 */
async function collectEntryInputs(): Promise<ReturnType<ReturnType<typeof getGlobalSearchService>["listEntries"]>> {
    for (let attempt = 0; attempt < 40; attempt++) {
        const service = peekGlobalSearchService()

        if (service) {
            return service.listEntries()
        }

        await yieldToBrowser()
    }

    // 兜底：预热迟迟未完成（如未进过资料库首页）时自己建一次
    return getGlobalSearchService().listEntries()
}

/**
 * 装配某个语言的语料（剧情 + 剧情 AI 总结 + 语音 + 条目）。
 *
 * 每次让出事件循环之前只做一小片工作，保证首屏与滚动不掉帧；
 * 装配完成后交给引擎建索引（在主线程之外）。
 * @param lang 数据语言
 * @returns 装配好的语料
 */
async function buildCorpus(lang: DBAgentLang): Promise<RagCorpus> {
    const chunks: RagChunk[] = []

    await yieldToBrowser()

    const questItems = await collectQuestItems(lang)

    // 剧情：按任务链分片，保持顺序（上下文扩展依赖「同任务相邻」这一顺序）
    for (let start = 0; start < questChainData.length; start += CHAIN_SLICE_SIZE) {
        const chains = questChainData.slice(start, start + CHAIN_SLICE_SIZE)
        chunks.push(...buildStoryChunks({ lang, chains, questItems, npcNames }))
        await yieldToBrowser()
    }

    // 剧情 AI 总结：一条任务链一条，只有简体中文一套（storysummary.data.ts）。
    // 其他语言的语料同样带上它——提问语言的关键词会经跨语言反查扩展出游戏原文写法，
    // 因此英文/日文提问照样能命中中文梗概（向量通道里也嵌同一份），检索层会在 note 里说明语言。
    chunks.push(...buildSummaryChunks({ lang: RAG_SUMMARY_LANG, chains: questChainData, summaries: storySummaryData }))

    await yieldToBrowser()

    // 语音：按语言切分的独立数据集，可能因数据包缺失而加载失败（可选语料，不该拖垮整体）
    try {
        const voices = await getLocalizedCharVoiceData(lang)
        chunks.push(...buildVoiceChunks({ lang, voices, charNames }))
    } catch (error) {
        console.warn("[rag] 语音语料加载失败，已跳过该部分", { lang, error })
    }

    await yieldToBrowser()

    // 角色档案：同样是按语言切分的独立数据集（六种语言齐备），与语音一样容错加载
    try {
        const profiles = await getLocalizedCharExtData(lang)
        chunks.push(...buildProfileChunks({ lang, profiles, charNames }))
    } catch (error) {
        console.warn("[rag] 角色档案语料加载失败，已跳过该部分", { lang, error })
    }

    await yieldToBrowser()

    chunks.push(...buildEntryChunks({ lang, entries: await collectEntryInputs() }))

    const corpus: RagCorpus = { lang, chunks }

    // 交给引擎建索引：Worker 路径下这里是异步的，主线程不会阻塞
    await getRagEngine().ready(lang, chunks)

    return corpus
}

/**
 * 取某个数据语言的语料，未装配时现场装配。
 * @param lang 数据语言
 * @returns 语料
 */
export function getRagCorpus(lang: DBAgentLang): Promise<RagCorpus> {
    const cached = corpusCache.get(lang)

    if (cached) {
        return Promise.resolve(cached)
    }

    const pending = pendingBuilds.get(lang)

    if (pending) {
        return pending
    }

    const build = buildCorpus(lang)
        .then(corpus => {
            corpusCache.set(lang, corpus)

            return corpus
        })
        .finally(() => {
            pendingBuilds.delete(lang)
        })

    pendingBuilds.set(lang, build)

    return build
}

/**
 * 取已装配好的语料（不触发装配）。
 * @param lang 数据语言
 * @returns 语料；未装配时返回 null
 */
export function peekRagCorpus(lang: DBAgentLang): RagCorpus | null {
    return corpusCache.get(lang) ?? null
}

/**
 * 空闲预热语料与索引：进入资料库页面且开关开启时调用，避免首次检索等待。
 *
 * 开关关闭时直接返回——**不装配语料、不启动索引 Worker**。
 * @param lang 数据语言
 * @returns 预热完成（失败时静默，检索期会再试一次并给出错误）
 */
export async function warmUpRagCorpus(lang: DBAgentLang): Promise<void> {
    if (!isRagEnabled() || corpusCache.has(lang)) {
        return
    }

    try {
        await getRagCorpus(lang)
    } catch (error) {
        console.warn("[rag] 语料预热失败，将在首次检索时重试", { lang, error })
    }
}
