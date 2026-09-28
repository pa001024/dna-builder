/**
 * NPC 数据的公共判定与取名口径。
 *
 * 资料库 NPC 列表页与检索层（`db-search`）都要用同一套口径判断
 * 「这个 NPC 有没有印象检定 / 印象增加 / 分支对话」，否则页面筛出来的结果
 * 与 Agent 按 filters 查出来的结果会对不上。
 */

import type { NPC } from "@/data/d/npc.data"
import { DEFAULT_STORY_TEXT_CONFIG, replaceStoryPlaceholders } from "@/utils/story-text"

/**
 * 判断 NPC 是否包含印象检定选项。
 * @param npc NPC 数据
 * @returns 是否包含印象检定
 */
export function hasNpcImprCheck(npc: NPC): boolean {
    return !!npc.talks?.some(dialogue => dialogue.options?.some(option => !!option.imprCheck))
}

/**
 * 判断 NPC 是否包含印象增加选项。
 * @param npc NPC 数据
 * @returns 是否包含印象增加
 */
export function hasNpcImprIncrease(npc: NPC): boolean {
    return !!npc.talks?.some(dialogue => dialogue.options?.some(option => !!option.impr && option.impr[2] > 0))
}

/**
 * 判断 NPC 是否包含可显示的对话。
 * @param npc NPC 数据
 * @returns 是否包含对话
 */
export function hasNpcDialogue(npc: NPC): boolean {
    return !!npc.talks?.length
}

/**
 * 取 NPC 的展示名：无名 NPC 统一回落成 `NPC <id>`。
 *
 * 只做名字回落，不处理 `{nickname}` 这类剧情占位符——占位符要按调用方
 * 的展示语境替换（详情页用 `formatStoryText`，检索层与地图点位名用 {@link getNpcDisplayText}）。
 * @param npc NPC 数据
 * @returns 展示名
 */
export function getNpcDisplayName(npc: NPC): string {
    return npc.name || `NPC ${npc.id}`
}

/**
 * 取 NPC 在检索结果与地图点位名里使用的完整展示名。
 *
 * 与 {@link getNpcDisplayName} 的区别是把 `{nickname}` 这类剧情占位符按默认剧情文本配置替换掉：
 * 工具结果与地图标记名都不能直接显示占位符原文。
 * @param npc NPC 数据
 * @returns 完整展示名
 */
export function getNpcDisplayText(npc: NPC): string {
    return replaceStoryPlaceholders(getNpcDisplayName(npc), DEFAULT_STORY_TEXT_CONFIG)
}
