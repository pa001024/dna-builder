/**
 * 确定性 RNG（mulberry32 + FNV-1a fork）。
 *
 * 模拟内禁止 `Math.random` / `Date.now` 这类隐式随机与时钟：所有随机（随机选敌、
 * 暴击掷骰等）必须走 `createRng(seed)`，保证同 seed 同配置两次运行逐位一致。
 */

export interface Rng {
    /** 初始 seed（fork 后为新 seed） */
    readonly seed: number
    /** 下一个 32 位无符号整数 */
    nextUint32(): number
    /** [0, 1) 浮点 */
    next(): number
    /** [min, max) 整数；max <= min 时返回 min */
    int(min: number, max: number): number
    /** 以概率 p 返回 true；p <= 0 恒 false，p >= 1 恒 true */
    chance(p: number): boolean
    /** 随机取一个元素；空数组返回 undefined */
    pick<T>(items: readonly T[]): T | undefined
    /** 返回洗牌后的新数组（Fisher-Yates），不修改入参 */
    shuffle<T>(items: readonly T[]): T[]
    /** 按标签派生独立子流（同 seed + 同标签恒定） */
    fork(label: string): Rng
}

export function hashLabel(label: string): number {
    // FNV-1a 32bit
    let hash = 0x811c9dc5
    for (let i = 0; i < label.length; i++) {
        hash ^= label.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

export function createRng(seed: number): Rng {
    if (!Number.isFinite(seed)) throw new Error(`seed 必须是有限数字，收到 ${seed}`)
    const normalized = seed >>> 0
    let state = normalized

    const nextUint32 = (): number => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return (t ^ (t >>> 14)) >>> 0
    }

    const next = (): number => nextUint32() / 4294967296

    const rng: Rng = {
        seed: normalized,
        nextUint32,
        next,
        int(min, max) {
            if (max <= min) return min
            return min + Math.floor(next() * (max - min))
        },
        chance(p) {
            if (p <= 0) return false
            if (p >= 1) return true
            return next() < p
        },
        pick(items) {
            if (items.length === 0) return undefined
            return items[Math.floor(next() * items.length)]
        },
        shuffle(items) {
            const out = items.slice()
            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1))
                const tmp = out[i]
                out[i] = out[j]
                out[j] = tmp
            }
            return out
        },
        fork(label) {
            return createRng((normalized ^ hashLabel(label)) >>> 0)
        },
    }
    return rng
}
