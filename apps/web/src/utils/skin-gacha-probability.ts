import type { GachaProbability } from "@/data/d/skingacha.data"

/** 紫色品质保底次数（固定 10 抽必出紫） */
export const PURPLE_PITY = 10
/** 默认金色品质保底次数（卡池无 ShowGetStar5Times 配置时的回退值） */
export const DEFAULT_GOLD_PITY = 90
/** 金色软保底递增区间长度：硬保底前最后 N 抽出金概率随抽数线性递增（原神式软保底） */
export const GOLD_SOFT_PITY_WINDOW = 16

/**
 * 金色品质抽卡概率配置。
 */
export interface GoldPityConfig {
    /** 基础出金概率（小数，如 0.003 即 0.3%） */
    baseRate: number
    /** 硬保底抽数：第 hardPity 抽必定出金 */
    hardPity: number
    /** 软保底起始抽数：从该抽起出金概率开始线性递增 */
    softPityStart: number
    /** 软保底每抽递增概率（小数） */
    step: number
}

/**
 * 计算卡池的金色品质抽卡概率配置（基础概率 / 硬保底 / 软保底）。
 *
 * 采用原神式软保底：硬保底前最后 GOLD_SOFT_PITY_WINDOW 抽，出金概率随抽数线性递增；
 * 递增步长按「第 hardPity 抽恰好达到 100%」反推。对万华皮肤卡池（基础 0.3%、90 抽硬保底），
 * 综合概率（含保底）≈ 1.42%，与官方概率说明「基础概率 0.3%，综合概率（含保底）1.42%，
 * 至多 90 次寻觅必定获取金色品质道具」一致。
 *
 * @param prob 卡池概率配置（万分比），缺失时使用默认硬保底
 * @returns 金色概率配置
 */
export function getGoldPityConfig(prob?: GachaProbability): GoldPityConfig {
    const baseRate = (prob?.ProbabilityGold ?? 0) / 10000
    const hardPity = prob?.ShowGetStar5Times ?? DEFAULT_GOLD_PITY
    // 软保底起始抽数：硬保底前 GOLD_SOFT_PITY_WINDOW 抽开始递增（90 抽硬保底 → 第 75 抽起）
    const softPityStart = Math.max(1, hardPity - GOLD_SOFT_PITY_WINDOW + 1)
    // 步长反推：baseRate + (hardPity - softPityStart + 1) * step = 1（第 hardPity 抽必出）
    const step = (1 - baseRate) / (hardPity - softPityStart + 1)
    return { baseRate, hardPity, softPityStart, step }
}

/**
 * 计算当前抽数下的实时出金概率。
 * @param pullCount 距上次出金后的抽数（含本次，从 1 开始）
 * @param config 金色概率配置
 * @returns 本次出金概率（小数，取值 [0, 1]）
 */
export function getGoldRate(pullCount: number, config: GoldPityConfig): number {
    if (pullCount >= config.hardPity) return 1
    if (pullCount < config.softPityStart) return config.baseRate
    return Math.min(1, config.baseRate + (pullCount - config.softPityStart + 1) * config.step)
}

/**
 * 计算一个保底周期内抽到金色品质的期望抽数（长期平均每金所需抽数）。
 * @param config 金色概率配置
 * @returns 期望抽数
 */
export function getGoldExpectedPulls(config: GoldPityConfig): number {
    // 期望抽数 = Σ P(前 n-1 抽都没出金)，n 从 1 到 hardPity
    let expected = 1
    let survive = 1
    for (let pullCount = 1; pullCount < config.hardPity; pullCount++) {
        survive *= 1 - getGoldRate(pullCount, config)
        expected += survive
    }
    return expected
}

/**
 * 计算综合出金概率（含保底）：长期来看出金抽数占全部抽数的比例，即期望抽数的倒数。
 * @param config 金色概率配置
 * @returns 综合出金概率（小数）
 */
export function getGoldCombinedRate(config: GoldPityConfig): number {
    return 1 / getGoldExpectedPulls(config)
}
