import type { ParamText } from "@/data/data-types"
import { type LeveledMod, LeveledWeapon } from "@/data/leveled"

/**
 * 参数化文本求值函数（调用方传入 `useGameText().gpt`，翻译随语言切换响应式更新）。
 */
export type EffectTextEvaluator = (value: ParamText | null | undefined, index: number, options?: { stripFirstSentence?: boolean }) => string

/**
 * 特效行展示文案：effect.data 不再存参数化描述，统一用武器 `熔炼` / MOD `效果` 按当前档位求值。
 * 仅为回退：调用方（BuffCell）优先展示 buff 自带的手写描述，本函数只在无手写描述时采用。
 * @param item 附带特效的武器或魔之楔
 * @param gpt 参数化文本求值函数
 * @returns 当前语言下该档位的完整文本
 */
export function describeEffectItem(item: LeveledMod | LeveledWeapon, gpt: EffectTextEvaluator): string {
    if (item instanceof LeveledWeapon) {
        // 武器熔炼首句是属性摘要（已在属性区展示），正文才是特效说明；单句文案（灾厄通用语）则保留全文兜底
        return gpt(item.效果, item.精炼, { stripFirstSentence: true }) || gpt(item.效果, item.精炼)
    }
    return gpt(item.效果, item.等级 - 1)
}
