import type { DnaSeasonTalentEffect } from "@/data/d/dnaseasonprogress.data"
import { parseAffixMarkup } from "@/utils/transcend-gear/richtext"

/**
 * 去掉上游文本里的全部样式标签，保留纯文本。
 * 复用富文本白名单解析的文本拼接：`<Content>` / `<D>` / `<Effect>` / `<G>` 等白名单标签、
 * 未知标签、显式闭合（`</H>` / `</Title>` / `</Highlight>`）与错配闭合都只丢标签、不泄漏。
 * 富文本场景请改用 `parseAffixMarkup` + `TranscendRichText`，这里只服务纯文本出口。
 * @param text 原始游戏文本
 * @returns 可直接渲染的文本
 */
export function cleanGameMarkup(text: string | undefined): string {
    if (!text) {
        return ""
    }

    return parseAffixMarkup(text)
        .map(segment => segment.text)
        .join("")
}

/**
 * 天赋图标路径：升华天赋图标都落在 /imgs/webp 下。
 * @param icon 上游图标名
 * @returns 图标地址；缺省时回退空头像
 */
export function getTalentIconUrl(icon: string | undefined): string {
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/** 节点类型（kind）→ i18n 文案键；上游 talentTypes 只给了英文枚举 */
export function getTalentKindLabelKey(kind: number): string {
    if (kind === 3) {
        return "db-transcendence.talent.kind_middle"
    }

    if (kind === 4) {
        return "db-transcendence.talent.kind_advanced"
    }

    return "db-transcendence.talent.kind_low"
}

/**
 * 计算某等级下的词条数值并按上游格式输出；等级未达到解锁线时返回 null。
 * 数值口径：`level >= unlockLevel ? base + levelGrow * level : 未解锁`。
 * `addType: "Rate"` 与 `isPercent` 都表示百分比展示，其余按绝对值展示。
 * @param effect 天赋效果
 * @param level 节点等级（1..maxLevel）
 * @returns 展示文本；未解锁时返回 null
 */
export function formatTalentEffectValue(effect: DnaSeasonTalentEffect, level: number): string | null {
    if (level < (effect.unlockLevel ?? 1)) {
        return null
    }

    const value = (effect.base ?? 0) + (effect.levelGrow ?? 0) * level
    const sign = value >= 0 ? "+" : ""

    if (effect.addType === "Rate" || effect.isPercent) {
        return `${sign}${+(value * 100).toFixed(2)}%`
    }

    return `${sign}${+value.toFixed(2)}`
}
