/**
 * RAG 语料切块（客户端与服务端共用）。
 *
 * 服务端预索引只保存「锚点 + 向量 + 内容指纹」，正文由客户端用同一套规则重新还原，
 * 因此这里的切块顺序、清理方式、meta 拼接都是**跨端契约**，改动必须同步升
 * {@link RAG_CHUNK_SCHEMA_VERSION}。
 *
 * 归属说明：本文件放在数据包目录下（而非 `src/utils/`），因为服务端也要用它建索引
 * （`server` 已有直接 import 仓库 `src/data` 的先例），而它只依赖数据模块与纯函数。
 */

import type { CharExt } from "../d/charext.data"
import type { CharVoice } from "../d/charvoice.data"
import type { ClueTabType } from "../d/clue.data"
import type { Dialogue, DialogueOption, QuestItem } from "../d/quest.data"
import type { QuestChain } from "../d/questchain.data"
import { questChain2Version } from "../d/questchain.data"
import type { Review, ReviewPage } from "../d/review.data"
import type { WikiMainType } from "../d/wiki.data"
import { DEFAULT_STORY_TEXT_CONFIG, replaceStoryPlaceholders, stripStoryTextTags } from "../story-text"
import {
    clueAnchor,
    entryAnchor,
    profileAnchor,
    RAG_PROFILE_MODULE,
    type RagChunk,
    type RagEntryInput,
    ragChunkHash,
    reviewAnchor,
    storyDialogueAnchor,
    storyOptionAnchor,
    summaryAnchor,
    voiceAnchor,
    wikiAnchor,
} from "./types"

/** 剧情正文的清理配置：与检索层、详情页保持一致（昵称取默认占位值） */
const STORY_TEXT_CONFIG = DEFAULT_STORY_TEXT_CONFIG

/**
 * 清理剧情正文：剥离富文本标签并把玩家昵称占位符替换成默认写法。
 *
 * 与 `src/utils/db-search.ts` 的 `cleanDialogueContent` 同一口径：
 * 索引里的文本必须和用户看到的文本一致，否则引用片段与页面内容对不上。
 * @param content 原始正文
 * @returns 清理后的正文（空文本返回空串）
 */
export function cleanStoryContent(content: string | undefined): string {
    if (!content) {
        return ""
    }

    return replaceStoryPlaceholders(stripStoryTextTags(content), STORY_TEXT_CONFIG).trim()
}

/**
 * 读取对话说话人：优先用数据自带的 speakerName，缺失时回退 NPC 名。
 * @param dialogue 对话或选项
 * @param npcNames NPC id → 名称
 * @returns 说话人名称（无则空串）
 */
function resolveSpeaker(dialogue: Dialogue | DialogueOption, npcNames: ReadonlyMap<number, string>): string {
    const speakerName = (dialogue as Dialogue).speakerName

    if (speakerName) {
        return replaceStoryPlaceholders(speakerName, STORY_TEXT_CONFIG).trim()
    }

    if (dialogue.npc === undefined) {
        return ""
    }

    return replaceStoryPlaceholders(npcNames.get(dialogue.npc) ?? "", STORY_TEXT_CONFIG).trim()
}

/**
 * 构建剧情 chunk：一行对话（含选项行）一条。
 *
 * 顺序即剧情顺序，客户端据此做「前后几行」的上下文扩展，
 * 因此这里**必须按 任务链 → 任务 → 节点 → 对话** 的顺序依次推入。
 * @param options.lang 数据语言（zh / en / jp / kr / fr / tc）
 * @param options.chains 任务链（已按版本门限过滤）
 * @param options.questItems 任务 id → 任务详情（含对话节点）
 * @param options.npcNames NPC id → 名称（用于补齐说话人）
 * @returns 剧情 chunk 列表
 */
export function buildStoryChunks(options: {
    lang: string
    chains: readonly QuestChain[]
    questItems: ReadonlyMap<number, QuestItem>
    npcNames: ReadonlyMap<number, string>
}): RagChunk[] {
    const { lang, chains, questItems, npcNames } = options
    const chunks: RagChunk[] = []
    /**
     * 已产出的锚点集合。
     *
     * 游戏数据里同一段对话会被多个分支/节点复用（实测中文 19,258 行里 404 行为重复），
     * 它们的锚点与正文完全相同。锚点是跨端契约（向量索引的主键、客户端还原正文的键），
     * 必须唯一，否则服务端写入时会被主键覆盖、客户端定位时会取到另一份的邻居。
     */
    const emitted = new Set<string>()

    for (const chain of chains) {
        const chapter = `${chain.chapterName} ${chain.chapterNumber || ""}`.trim()
        const version = questChain2Version[chain.id] || chain.版本

        for (const chainItem of chain.quests) {
            const quest = questItems.get(chainItem.id)

            if (!quest) {
                continue
            }

            const questName = replaceStoryPlaceholders(quest.name || "", STORY_TEXT_CONFIG).trim()
            const meta = [questName, chain.name, chapter, chain.episode].filter(Boolean).join(" ")

            /** 推入一条 chunk：正文为空的行不入索引（纯音效/演出节点很常见），重复锚点只保留首次出现 */
            const push = (anchor: string, title: string, rawContent: string | undefined) => {
                const text = cleanStoryContent(rawContent)

                if (!text || emitted.has(anchor)) {
                    return
                }

                emitted.add(anchor)

                chunks.push({
                    anchor,
                    kind: "story",
                    lang,
                    title,
                    text,
                    meta,
                    path: `/db/questchain/${chain.id}/${quest.id}`,
                    version,
                    hash: ragChunkHash(`${title}\n${text}\n${meta}`),
                })
            }

            for (const node of quest.nodes ?? []) {
                for (const dialogue of node.dialogues ?? []) {
                    const dialogueId = (dialogue as Dialogue).id

                    if (typeof dialogueId === "number") {
                        push(storyDialogueAnchor(chain.id, quest.id, dialogueId), resolveSpeaker(dialogue, npcNames), dialogue.content)
                    }

                    for (const option of dialogue.options ?? []) {
                        if (typeof option.id === "number") {
                            push(storyOptionAnchor(chain.id, quest.id, option.id), resolveSpeaker(option, npcNames), option.content)
                        }
                    }
                }
            }
        }
    }

    return chunks
}

/**
 * 剧情 AI 总结 chunk 的伴随信息标记。
 *
 * 进了 meta 就等于进了索引（meta 字段权重 1.5），这样「某某剧情总结」这类提问、
 * 以及模型自己按「总结」检索时能稳定落到总结语料上；返回给模型时也一眼能看出这是梗概而非原文。
 */
const SUMMARY_META_TAG = "剧情总结"

/**
 * 构建剧情 AI 总结 chunk：一条任务链一条。
 *
 * 总结是整链梗概（`storysummary.data.ts`，只有简体中文一套），回答「这条剧情讲了什么」
 * 时比逐行台词省得多：一次召回即可拿到完整脉络，需要具体台词再按 path 去 read_story。
 * 路径指向任务链页面，与剧情正文 chunk 的「任务链 + 任务」路径不同层级，属有意为之。
 * @param options.lang 数据语言（总结正文的语言；目前恒为 zh）
 * @param options.chains 任务链（已按版本门限过滤）
 * @param options.summaries 任务链 id → 总结正文
 * @returns 总结 chunk 列表（无总结的任务链跳过）
 */
export function buildSummaryChunks(options: {
    lang: string
    chains: readonly QuestChain[]
    summaries: Readonly<Record<number, string>>
}): RagChunk[] {
    const { lang, chains, summaries } = options
    const chunks: RagChunk[] = []

    for (const chain of chains) {
        const text = cleanStoryContent(summaries[chain.id])

        if (!text) {
            continue
        }

        const chapter = `${chain.chapterName} ${chain.chapterNumber || ""}`.trim()
        const title = replaceStoryPlaceholders(chain.name || "", STORY_TEXT_CONFIG).trim()
        const meta = [chapter, chain.episode, SUMMARY_META_TAG].filter(Boolean).join(" ")

        chunks.push({
            anchor: summaryAnchor(chain.id),
            kind: "summary",
            lang,
            title,
            text,
            meta,
            path: `/db/questchain/${chain.id}`,
            version: questChain2Version[chain.id] || chain.版本,
            hash: ragChunkHash(`${title}\n${text}\n${meta}`),
        })
    }

    return chunks
}

/**
 * 构建角色语音 chunk：一条语音一条。
 * @param options.lang 数据语言
 * @param options.voices 语音数据（按语言切分后的那一套）
 * @param options.charNames 角色 id → 角色名
 * @returns 语音 chunk 列表
 */
export function buildVoiceChunks(options: {
    lang: string
    voices: readonly CharVoice[]
    charNames: ReadonlyMap<number, string>
}): RagChunk[] {
    const { lang, voices, charNames } = options

    return voices
        .map(voice => {
            const charName = charNames.get(voice.charId) ?? ""
            const text = replaceStoryPlaceholders(voice.text ?? "", STORY_TEXT_CONFIG).trim()
            const meta = [charName, voice.name].filter(Boolean).join(" ")

            return {
                anchor: voiceAnchor(voice.charId, voice.id),
                kind: "voice" as const,
                lang,
                title: voice.name,
                text,
                meta,
                path: `/db/char/${voice.charId}`,
                hash: ragChunkHash(`${voice.name}\n${text}\n${meta}`),
            }
        })
        .filter(chunk => !!chunk.text)
}

/**
 * 角色档案 chunk 的伴随信息标记。
 *
 * 与剧情总结的 `SUMMARY_META_TAG` 同理：进了 meta 就等于进了索引（meta 权重 1.5），
 * 「某某的档案」这类提问、以及模型自己按「档案」检索时能稳定落到档案语料上。
 */
const PROFILE_META_TAG = "角色档案"

/**
 * 构建角色档案 chunk：一条档案一条，正文是整篇档案原文。
 *
 * 档案正文与展示层同口径清洗（去样式标签、替换昵称与性别占位符）：
 * 索引里的文本必须和角色详情页「档案」标签下看到的文本一致，否则引用片段对不上页面。
 * 标题拼上角色名——档案名在各角色间高度重复（实测 517 条只有 20 个不同名字，
 * 如「见证·其一」被多个角色共用），只写档案名会让检索结果无法区分主体，
 * 也会被标题多样性约束误判成「同一主体刷屏」。
 * @param options.lang 数据语言（档案正文的语言）
 * @param options.profiles 档案数据（按语言切分后的那一套）
 * @param options.charNames 角色 id → 角色名（游戏原文，用于标题与伴随信息）
 * @returns 档案 chunk 列表（正文为空的不入索引）
 */
export function buildProfileChunks(options: {
    lang: string
    profiles: readonly CharExt[]
    charNames: ReadonlyMap<number, string>
}): RagChunk[] {
    const { lang, profiles, charNames } = options

    return profiles
        .map(profile => {
            const charName = charNames.get(profile.charId) ?? ""
            const title = [charName, profile.name].filter(Boolean).join(" · ")
            const text = cleanStoryContent(profile.text)
            const meta = [charName, cleanStoryContent(profile.unlock), PROFILE_META_TAG].filter(Boolean).join(" ")

            return {
                anchor: profileAnchor(profile.charId, profile.id),
                kind: "profile" as const,
                lang,
                module: RAG_PROFILE_MODULE,
                title,
                text,
                meta,
                path: `/db/char/${profile.charId}`,
                hash: ragChunkHash(`${title}\n${text}\n${meta}`),
            }
        })
        .filter(chunk => !!chunk.text)
}

/**
 * 构建条目 chunk：一条资料库条目一条。
 *
 * 正文由「标题 + 副信息 + 隐藏检索词」拼成，因此详情页字段（生日 / CV / 面板数值）
 * 也能被关键词直接命中，不必先定位条目再取详情。
 * @param options.lang 数据语言（条目名已按该语言翻译，正文仍是原文）
 * @param options.entries 条目输入（客户端由全库检索索引枚举）
 * @returns 条目 chunk 列表
 */
export function buildEntryChunks(options: { lang: string; entries: readonly RagEntryInput[] }): RagChunk[] {
    const { lang, entries } = options

    return entries.map(entry => {
        const [, module = "", entityId = ""] = /^([^:]+):(.*)$/.exec(entry.id) ?? []
        // 标题与类型名由 i18next 渲染，未初始化（无头环境 / 单测）时可能取不到值：
        // 这里统一兜成空串，避免把 undefined 灌进索引造成整段语料不可检索
        const meta = entry.typeLabel ?? ""
        const text = [entry.subtitle, entry.searchText].filter(Boolean).join(" ")

        return {
            anchor: entryAnchor(module || "unknown", entityId || entry.id),
            kind: "entry" as const,
            lang,
            module: module || undefined,
            entityId: entityId || undefined,
            title: entry.title || "",
            text,
            meta,
            path: entry.path,
            version: entry.version,
            hash: ragChunkHash(`${entry.title || ""}\n${text}\n${meta}`),
        }
    })
}

/**
 * 调查墙线索板 chunk 的伴随信息标记。
 *
 * 与剧情总结的 `SUMMARY_META_TAG` 同理：进了 meta 就等于进了索引（meta 权重 1.5），
 * 「线索板上关于 X 的记录」这类提问、以及模型自己按「线索」检索时能稳定落到线索语料上。
 */
const CLUE_META_TAG = "线索板"

/**
 * 构建调查墙线索板 chunk：一条线索内容条目一条。
 *
 * 标题取「页名 · 线索名」——线索板的检索主体是“哪块板上关于谁的哪条线索”，
 * 只写线索名会丢掉调查对象（页）这一层语境，也会让同一调查对象的多条记录被
 * 标题多样性约束误判成「同一主体刷屏」（同名线索名在不同页下可能重复出现）。
 * 正文只有简体中文一套（见 `RAG_CN_SOURCE_LANG`），lang 由调用方传入中文单语常量。
 * @param options.lang 数据语言（线索正文的语言；恒为 zh）
 * @param options.tabs 线索板页类型（含页与线索的完整树）
 * @returns 线索 chunk 列表（正文为空的内容条目跳过）
 */
export function buildClueChunks(options: { lang: string; tabs: readonly ClueTabType[] }): RagChunk[] {
    const { lang, tabs } = options
    const chunks: RagChunk[] = []

    for (const tab of tabs) {
        for (const page of tab.pages) {
            for (const clue of page.clues) {
                for (const content of clue.contents) {
                    const text = cleanStoryContent(content.text)

                    if (!text) {
                        continue
                    }

                    const title = [page.name, clue.name].filter(Boolean).join(" · ")
                    const trigger = content.trigger ? (content.trigger.type === "Dialogue" ? "对话线索" : "资源线索") : ""
                    const meta = [tab.name, page.name, CLUE_META_TAG, trigger].filter(Boolean).join(" ")

                    chunks.push({
                        anchor: clueAnchor(clue.id, content.id),
                        kind: "clue",
                        lang,
                        title,
                        text,
                        meta,
                        path: `/db/clue?id=${clue.id}`,
                        hash: ragChunkHash(`${title}\n${text}\n${meta}`),
                    })
                }
            }
        }
    }

    return chunks
}

/**
 * 剧情回顾 chunk 的伴随信息标记（同 `SUMMARY_META_TAG` 口径，进 meta 即进索引）。
 */
const REVIEW_META_TAG = "剧情回顾"

/**
 * 构建剧情回顾 chunk：一条回顾条目一条。
 *
 * 标题取「篇章名 · 条目标题」——回顾条目名在各篇章间可能重复，拼上篇章才能区分主体。
 * 主线与支线同为回顾正文（内容就是一段剧情梗概），以 meta 里的「主线 / 支线」区分。
 * 正文只有简体中文一套（见 `RAG_CN_SOURCE_LANG`），lang 由调用方传入中文单语常量。
 * @param options.lang 数据语言（回顾正文的语言；恒为 zh）
 * @param options.pages 回顾页（含列与主线 / 支线条目的完整树）
 * @returns 回顾 chunk 列表（正文为空或锚点重复的条目跳过）
 */
export function buildReviewChunks(options: { lang: string; pages: readonly ReviewPage[] }): RagChunk[] {
    const { lang, pages } = options
    const chunks: RagChunk[] = []
    /** 已产出的锚点集合：上游若把同一条目挂到多个列，锚点必须唯一（向量索引主键） */
    const emitted = new Set<string>()

    for (const page of pages) {
        const episode = (page.episodeName ?? "").trim()

        for (const chain of page.chains) {
            /** 推入一条回顾 chunk：正文为空或锚点已出现则跳过 */
            const push = (review: Review, side: boolean) => {
                const anchor = reviewAnchor(review.id)

                if (emitted.has(anchor)) {
                    return
                }

                const text = cleanStoryContent(review.content)

                if (!text) {
                    return
                }

                emitted.add(anchor)

                const title = [episode, review.name].filter(Boolean).join(" · ")
                const meta = [episode, side ? "支线" : "主线", REVIEW_META_TAG].filter(Boolean).join(" ")

                chunks.push({
                    anchor,
                    kind: "review",
                    lang,
                    title,
                    text,
                    meta,
                    path: `/db/review?id=${review.id}`,
                    hash: ragChunkHash(`${title}\n${text}\n${meta}`),
                })
            }

            for (const review of chain.main) {
                push(review, false)
            }

            for (const review of chain.side) {
                push(review, true)
            }
        }
    }

    return chunks
}

/**
 * 游戏内百科 chunk 的伴随信息标记（同 `SUMMARY_META_TAG` 口径，进 meta 即进索引）。
 */
const WIKI_META_TAG = "百科"

/**
 * 构建游戏内百科 chunk：一条正文段一条。
 *
 * 标题取条目名——百科的检索主体是「某个词条讲了什么」，子类（如「海伯利亚」）与
 * 大类（如「势力」）作为语境放进 meta；正文段本身没有独立标题，故不拼进标题里。
 * 一个条目可能有多段正文（按解锁进度逐段开放），各段独立成 chunk，
 * 锚点用「条目 id : 段 id」以便同一条目的段落稳定排序与定位。
 * 正文只有简体中文一套（见 `RAG_CN_SOURCE_LANG`），lang 由调用方传入中文单语常量。
 * @param options.lang 数据语言（百科正文的语言；恒为 zh）
 * @param options.mainTypes 百科大类（含子类、条目与正文段的完整树）
 * @returns 百科 chunk 列表（正文为空的段落跳过）
 */
export function buildWikiChunks(options: { lang: string; mainTypes: readonly WikiMainType[] }): RagChunk[] {
    const { lang, mainTypes } = options
    const chunks: RagChunk[] = []

    for (const mainType of mainTypes) {
        for (const subType of mainType.subTypes) {
            for (const entry of subType.entries) {
                for (const wikiText of entry.texts) {
                    const text = cleanStoryContent(wikiText.text)

                    if (!text) {
                        continue
                    }

                    const title = entry.title || ""
                    const meta = [mainType.name, subType.name, WIKI_META_TAG].filter(Boolean).join(" ")

                    chunks.push({
                        anchor: wikiAnchor(entry.id, wikiText.id),
                        kind: "wiki",
                        lang,
                        title,
                        text,
                        meta,
                        path: `/db/wiki?id=${entry.id}`,
                        hash: ragChunkHash(`${title}\n${text}\n${meta}`),
                    })
                }
            }
        }
    }

    return chunks
}
