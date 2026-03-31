/**
 * 奖励序列池模拟器。
 * 规则：每轮先洗牌，按顺序不放回抽取；抽空后自动重置序列。
 */
export class RewardSequenceSimulator<T> {
    private currentSequence: T[] = []

    constructor(private readonly sourceItems: T[]) {
        this.resetSequence()
    }

    /**
     * Fisher-Yates 洗牌。
     * @param items 待打乱数组
     * @returns 打乱后的新数组
     */
    private shuffle(items: T[]): T[] {
        const result = [...items]
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[result[i], result[j]] = [result[j], result[i]]
        }
        return result
    }

    /**
     * 重置当前序列。
     */
    private resetSequence(): void {
        this.currentSequence = this.shuffle(this.sourceItems)
    }

    /**
     * 抽取一个元素，抽空后自动重置下一轮序列。
     * @returns 抽取结果
     */
    draw(): T | null {
        if (!this.currentSequence.length) {
            this.resetSequence()
        }

        return this.currentSequence.shift() ?? null
    }
}

/**
 * 按次数展开序列源。
 * @param items 原始条目
 * @param getCount 次数提取函数
 * @returns 展开后的序列源
 */
export function expandRewardSequenceSource<T>(items: T[], getCount: (item: T) => number): T[] {
    const result: T[] = []
    for (const item of items) {
        const count = Math.max(0, Math.floor(getCount(item)))
        for (let i = 0; i < count; i++) {
            result.push(item)
        }
    }
    return result
}
