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

import { DEFAULT_STORY_TEXT_CONFIG, replaceStoryPlaceholders, stripStoryTextTags } from "../../utils/story-text"
import type { CharExt } from "../d/charext.data"
import type { CharVoice } from "../d/charvoice.data"
import type { Dialogue, DialogueOption, QuestItem } from "../d/quest.data"
import type { QuestChain } from "../d/questchain.data"
import { questChain2Version } from "../d/questchain.data"
import {
    entryAnchor,
    profileAnchor,
    RAG_PROFILE_MODULE,
    type RagChunk,
    type RagEntryInput,
    ragChunkHash,
    storyDialogueAnchor,
    storyOptionAnchor,
    summaryAnchor,
    voiceAnchor,
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
