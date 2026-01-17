/**
 * 密函(Walnut)SequenceCeiling 模拟类
 * 核心逻辑：生成奖励池→洗牌非金奖→金奖后置→每次抽3个→抽中金则重置
 */
export class WalnutSequenceSimulator {
    // 当前奖励序列（存储奖励类型：1=金，2=大银，3=小银，4=铜1，5=铜2，6=铜3）
    private currentSequence: number[] = []

    constructor(public parameter: number[] = [1, 7, 10, 13, 13, 13]) {
        // 初始化生成奖励序列
        this.resetSequence()
    }

    /**
     * 生成闭区间 [min, max] 的随机整数（均匀分布）
     */
    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    /**
     * Fisher-Yates 洗牌算法：打乱数组
     */
    private shuffle(arr: number[]): number[] {
        const newArr = [...arr]
        for (let i = newArr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[newArr[i], newArr[j]] = [newArr[j], newArr[i]]
        }
        return newArr
    }

    /**
     * 重置奖励序列（重新生成奖励池）
     */
    private resetSequence(): void {
        // 1. 生成各非金奖的随机数量
        const bigSilver = this.randomInt(0, this.parameter[1]) // 大银：0~7
        const smallSilver = this.randomInt(0, this.parameter[2]) // 小银：0~10
        const copper1 = this.randomInt(0, this.parameter[3]) // 铜1：0~13
        const copper2 = this.randomInt(0, this.parameter[4]) // 铜2：0~13
        const copper3 = this.randomInt(0, this.parameter[5]) // 铜3：0~13

        // 2. 生成非金奖的奖励项数组（按数量填充类型）
        const nonGoldItems: number[] = []
        for (let i = 0; i < bigSilver; i++) nonGoldItems.push(2)
        for (let i = 0; i < smallSilver; i++) nonGoldItems.push(3)
        for (let i = 0; i < copper1; i++) nonGoldItems.push(4)
        for (let i = 0; i < copper2; i++) nonGoldItems.push(5)
        for (let i = 0; i < copper3; i++) nonGoldItems.push(6)

        // 3. 洗牌非金奖项 + 金奖放在最后
        this.currentSequence = [...this.shuffle(nonGoldItems), 1]
    }

    /**
     * 开一次密函，返回3个奖励索引
     * @returns 长度为3的数组，元素为奖励在数组中的索引（0=金，1=大银，2=小银，3=铜1，4=铜2，5=铜3）
     */
    open(): number[] {
        const takeCount = 3
        const rewards: number[] = []

        // 确保凑够3个奖励
        while (rewards.length < takeCount) {
            // 如果当前序列为空，重置序列
            if (this.currentSequence.length === 0) {
                this.resetSequence()
            }

            // 抽取当前序列的第一个奖励类型
            const rewardType = this.currentSequence.shift()!
            // 将奖励类型转换为索引（1→0，2→1，3→2，4→3，5→4，6→5）
            const rewardIndex = rewardType - 1
            rewards.push(rewardIndex)

            // 检查是否抽中金奖
            if (rewardType === 1) {
                // 抽中金奖则重置序列，但继续抽取剩余奖励
                this.resetSequence()
            }
        }

        return rewards
    }

    /**
     * 计算 M = 大银+小银+铜1+铜2+铜3 的概率分布（卷积法，精确推导M的所有可能值及概率）
     * X2(0~7)、X3(0~10)、X4/X5/X6(0~13) 均为均匀分布
     * @returns Map<M的取值, 概率>
     */
    static calculateMDistribution(): Map<number, number> {
        // 初始化各变量的均匀分布（键=取值，值=概率）
        const x2Dist = new Map<number, number>()
        for (let x = 0; x <= 7; x++) x2Dist.set(x, 1 / 8) // 大银：0~7（8种可能）
        const x3Dist = new Map<number, number>()
        for (let x = 0; x <= 10; x++) x3Dist.set(x, 1 / 11) // 小银：0~10（11种可能）
        const x456Dist = new Map<number, number>()
        for (let x = 0; x <= 13; x++) x456Dist.set(x, 1 / 14) // 铜1/2/3：0~13（14种可能）

        // 分步卷积：X2+X3 → +X4 → +X5 → +X6（计算M的联合分布）
        const sumDist = new Map<number, number>()
        // 第一步：X2 + X3
        for (const [x2, p2] of x2Dist) {
            for (const [x3, p3] of x3Dist) {
                const sum = x2 + x3
                sumDist.set(sum, (sumDist.get(sum) || 0) + p2 * p3)
            }
        }
        // 第二步：+X4
        const sumDist2 = new Map<number, number>()
        for (const [s, ps] of sumDist) {
            for (const [x4, p4] of x456Dist) {
                const sum = s + x4
                sumDist2.set(sum, (sumDist2.get(sum) || 0) + ps * p4)
            }
        }
        // 第三步：+X5
        const sumDist3 = new Map<number, number>()
        for (const [s, ps] of sumDist2) {
            for (const [x5, p5] of x456Dist) {
                const sum = s + x5
                sumDist3.set(sum, (sumDist3.get(sum) || 0) + ps * p5)
            }
        }
        // 第四步：+X6（最终M的分布）
        const finalDist = new Map<number, number>()
        for (const [s, ps] of sumDist3) {
            for (const [x6, p6] of x456Dist) {
                const sum = s + x6
                finalDist.set(sum, (finalDist.get(sum) || 0) + ps * p6)
            }
        }

        return finalDist
    }

    /**
     * 计算n次开密函「至少一次出金」的概率（符合实际规则：n≥19时必出金）
     * 核心逻辑：
     * 1. 总取奖数 k = 3*n；
     * 2. 非金奖数量 M < k → 取奖数覆盖非金奖，触达金奖（出金）；
     * 3. n≥19 → k=57 ≥ M最大56 → 概率=100%；
     * 4. n<19 → 概率=Σ P(M=m) （m从0到min(k-1, 56)）
     * @param n 开密函次数（正整数）
     * @returns 出金概率（保留6位小数）
     */
    static calculateGoldProbability(n: number): number {
        // 1. 参数校验
        if (!Number.isInteger(n) || n <= 0) {
            throw new Error("开密函次数n必须是正整数")
        }

        // 2. 核心常量（序列物理上限）
        const maxM = 56 // 非金奖最大数量（7+10+13+13+13）
        const k = 3 * n // n次开函总取奖数

        // 4. n<19 → 计算P(M < k)（M<k时能取到金奖）
        const mDist = WalnutSequenceSimulator.calculateMDistribution()
        let goldProb = 0
        const maxEffectiveM = Math.min(k - 1, maxM) // M的有效上限：k-1（M<k）且≤56

        // 遍历所有可能的M值，累加概率
        for (const [m, p] of mDist) {
            if (m <= maxEffectiveM) {
                goldProb += p
            }
        }

        // 保留6位小数，确保精度
        return Math.min(1, goldProb)
    }
    /**
     * 计算单个非金奖类型的数量分布（均匀分布）
     * @param type 非金奖类型（2=大银，3=小银，4=铜1，5=铜2，6=铜3）
     * @returns 该类型数量的概率分布 Map<数量, 概率>
     */
    static getNonGoldTypeDistribution(type: number): Map<number, number> {
        const dist = new Map<number, number>()
        let min: number, max: number, total: number

        switch (type) {
            case 2: // 大银
                min = 0
                max = 7
                total = 8
                break
            case 3: // 小银
                min = 0
                max = 10
                total = 11
                break
            case 4: // 铜1
            case 5: // 铜2
            case 6: // 铜3
                min = 0
                max = 13
                total = 14
                break
            default:
                throw new Error("无效的非金奖类型，必须是2-6")
        }

        const prob = 1 / total
        for (let i = min; i <= max; i++) {
            dist.set(i, prob)
        }
        return dist
    }
}
