/**
 * 密函(Walnut)SequenceCeiling 模拟类
 * 核心逻辑：生成奖励池→洗牌非金奖→金奖后置→每次抽3个→抽中金则重置
 */
export class WalnutSequenceSimulator {
    /**
     * 模拟器默认参数：[占位, 大银上限, 小银上限, 铜1上限, 铜2上限, 铜3上限]。
     * 详情页模拟开函、出金概率表、来源期望都用这一套模型（金期望恰为 10）；
     * walnut.参数不参与模拟，只做奖励池范围展示。
     */
    static readonly DEFAULT_PARAMETER = [1, 7, 10, 13, 13, 13]
    // 当前奖励序列（存储奖励类型：1=金，2=大银，3=小银，4=铜1，5=铜2，6=铜3）
    private currentSequence: number[] = []

    constructor(public parameter: number[] = [...WalnutSequenceSimulator.DEFAULT_PARAMETER]) {
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
     * 计算 M = 各非金奖档数量之和的概率分布（卷积法，精确推导M的所有可能值及概率）
     * 各档（大银/小银/铜1/铜2/铜3）在 0~上限内均匀分布，上限取自密函参数。
     * @param parameter 密函参数（walnut.参数）：[占位, 大银上限, 小银上限, 铜1上限, 铜2上限, 铜3上限]
     * @returns Map<M的取值, 概率>
     */
    static calculateMDistribution(parameter: number[] = [...WalnutSequenceSimulator.DEFAULT_PARAMETER]): Map<number, number> {
        // 各档均匀分布（键=取值，值=概率），档位 i 的上限为 parameter[i]
        const uniformDists: Map<number, number>[] = []
        for (let tier = 1; tier <= 5; tier++) {
            const max = Math.max(0, Math.floor(parameter[tier] ?? 0))
            const dist = new Map<number, number>()
            for (let x = 0; x <= max; x++) dist.set(x, 1 / (max + 1))
            uniformDists.push(dist)
        }

        // 分步卷积求联合分布
        let sumDist = new Map<number, number>([[0, 1]])
        for (const tierDist of uniformDists) {
            const next = new Map<number, number>()
            for (const [s, ps] of sumDist) {
                for (const [x, px] of tierDist) {
                    const sum = s + x
                    next.set(sum, (next.get(sum) || 0) + ps * px)
                }
            }
            sumDist = next
        }

        return sumDist
    }

    /**
     * 单轮序列的期望开函次数 E[ceil((M+1)/3)]：每次开函取 3 个奖励，金奖殿后。
     * 金奖每轮恰出 1 个，该值即金奖成品的期望开函数；非金奖档位再除以该档期望产出数即得单件期望。
     * 参数必须从外面传入（walnut.参数），不可写死——不同密函的参数不同。
     * @param parameter 密函参数（walnut.参数）：[占位, 大银上限, 小银上限, 铜1上限, 铜2上限, 铜3上限]
     * @returns 期望开函次数
     */
    static expectedCycleOpens(parameter: number[]): number {
        const mDist = WalnutSequenceSimulator.calculateMDistribution(parameter)
        let expected = 0
        for (const [m, p] of mDist) {
            expected += Math.ceil((m + 1) / 3) * p
        }
        return expected
    }

    /**
     * 指定档位单轮序列的期望产出数。
     *
     * 每次开函取 3 张、只结算其中**档位最高**的一张（金 > 大银 > 小银 > 铜1 > 铜2 > 铜3），
     * 所以高档次会顶掉低档次的结算名额，不能用「上限/2」这种无竞争的均值。
     * 一轮序列共 M 个非金奖 + 1 个金奖，批次在序列上连续平铺：
     * - 前 floor(M/3) 个满批，每批 3 张互不竞争地在一起，其中档位 i 胜出的概率为
     *   `[C(s,3) - C(低于 i 的个数,3)] / C(M,3)`（s = 档位 i 及其以下的数量）；
     * - 剩下 M mod 3 个非金 + 金奖挤在最后一批，金奖必胜，非金奖一张都拿不到。
     * @param parameter 密函参数（walnut.参数）
     * @param rewardIndex 奖励在密函奖励数组中的索引（0=金，1=大银，2=小银，3+=铜），非金奖档位映射到 parameter 同索引
     * @returns 该档位单轮期望产出数
     */
    static expectedCycleCopies(parameter: number[], rewardIndex: number): number {
        if (rewardIndex <= 0 || rewardIndex > 5) {
            return 1 // 金奖每轮恰 1 个；越界索引按 1 处理
        }
        // 高档次各档数量之和 H、本档数量 c、低档次各档数量之和 L
        const distHigher = WalnutSequenceSimulator.convolveUniform(parameter, 1, rewardIndex - 1)
        const distSelf = WalnutSequenceSimulator.uniformDistribution(parameter[rewardIndex] ?? 0)
        const distLower = WalnutSequenceSimulator.convolveUniform(parameter, rewardIndex + 1, 5)

        let expected = 0
        for (let s = 0; s < distSelf.length + distLower.length - 1; s++) {
            // s 个「本档及以下」的奖励中，至少 1 个是本档的概率（抵掉全是更低档的组合）
            let joint = 0
            let lowerOnly = 0
            for (let l = 0; l < distLower.length && l <= s; l++) {
                const c = s - l
                if (c >= distSelf.length) {
                    continue
                }
                const weight = distSelf[c] * distLower[l]
                joint += weight
                lowerOnly += weight * WalnutSequenceSimulator.choose3(l)
            }
            const winCount = joint * WalnutSequenceSimulator.choose3(s) - lowerOnly
            if (winCount === 0) {
                continue
            }
            // 满批次数的条件期望：前 floor((H+s)/3) 批都落在本档及以下之内
            let fullBatches = 0
            for (let h = 0; h < distHigher.length; h++) {
                const p = distHigher[h]
                const m = h + s
                if (!p || m < 3) {
                    continue
                }
                fullBatches += p * (Math.floor(m / 3) / WalnutSequenceSimulator.choose3(m))
            }
            expected += winCount * fullBatches
        }
        return expected
    }

    /**
     * 指定奖励档位的单件期望开函次数（长期平均口径：单轮期望开函 ÷ 单轮期望产出数）。
     * 参数必须从外面传入（walnut.参数），不可写死——不同密函的参数不同。
     * @param parameter 密函参数（walnut.参数）
     * @param rewardIndex 奖励在密函奖励数组中的索引（0=金，1=大银，2=小银，3+=铜）
     * @param count 该档位单次产出数量
     * @returns 单件期望开函次数；档位无法产出时返回 Infinity
     */
    static expectedOpensForRewardIndex(parameter: number[], rewardIndex: number, count = 1): number {
        if (count <= 0) {
            return Number.POSITIVE_INFINITY
        }
        const cycleOpens = WalnutSequenceSimulator.expectedCycleOpens(parameter)
        const expectedCopies = WalnutSequenceSimulator.expectedCycleCopies(parameter, rewardIndex) * count
        return expectedCopies > 0 ? cycleOpens / expectedCopies : Number.POSITIVE_INFINITY
    }

    /**
     * 组合数 C(n, 3)，n < 3 时为 0。
     * @param n 总数
     * @returns 组合数
     */
    private static choose3(n: number): number {
        return n >= 3 ? (n * (n - 1) * (n - 2)) / 6 : 0
    }

    /**
     * 单个档位数量的均匀分布（0~上限）。
     * @param max 上限
     * @returns 概率数组，下标为数量
     */
    private static uniformDistribution(max: number): Float64Array {
        const limit = Math.max(0, Math.floor(max))
        return new Float64Array(limit + 1).fill(1 / (limit + 1))
    }

    /**
     * 把 [fromTier, toTier] 各档的均匀分布卷积成「这些档数量之和」的分布。
     * @param parameter 密函参数（walnut.参数）
     * @param fromTier 起始档位（含）
     * @param toTier 结束档位（含）
     * @returns 概率数组，下标为数量之和
     */
    private static convolveUniform(parameter: number[], fromTier: number, toTier: number): Float64Array {
        let result = Float64Array.from([1])
        for (let tier = fromTier; tier <= toTier; tier++) {
            const next = new Float64Array(result.length + Math.max(0, Math.floor(parameter[tier] ?? 0)))
            const dist = WalnutSequenceSimulator.uniformDistribution(parameter[tier] ?? 0)
            for (let i = 0; i < result.length; i++) {
                const ps = result[i]
                if (!ps) {
                    continue
                }
                for (let j = 0; j < dist.length; j++) {
                    next[i + j] += ps * dist[j]
                }
            }
            result = next
        }
        return result
    }

    /**
     * 计算n次开密函「至少一次出金」的概率。
     * 核心逻辑：
     * 1. 总取奖数 k = 3*n；
     * 2. 非金奖数量 M < k → 取奖数覆盖非金奖，触达金奖（出金）；
     * 3. k 超过 M 上限 → 概率=100%（M 上限由参数推导，默认参数下 M 最大 56，n≥19 必出金）；
     * 4. 否则概率=Σ P(M=m)（m 从 0 到 k-1）。
     * 参数必须从外面传入（walnut.参数），不可写死——不同密函的参数不同。
     * @param n 开密函次数（正整数）
     * @param parameter 密函参数（walnut.参数）
     * @returns 出金概率（保留6位小数）
     */
    static calculateGoldProbability(n: number, parameter: number[] = [...WalnutSequenceSimulator.DEFAULT_PARAMETER]): number {
        // 1. 参数校验
        if (!Number.isInteger(n) || n <= 0) {
            throw new Error("开密函次数n必须是正整数")
        }

        // 2. M 上限由传入参数推导（各档上限之和）
        const maxM = [1, 2, 3, 4, 5].reduce((total, tier) => total + Math.max(0, Math.floor(parameter[tier] ?? 0)), 0)
        const k = 3 * n // n次开函总取奖数

        // 4. 计算P(M < k)（M<k时能取到金奖；k超过M上限时覆盖全分布，概率=100%）
        const mDist = WalnutSequenceSimulator.calculateMDistribution(parameter)
        let goldProb = 0
        const maxEffectiveM = Math.min(k - 1, maxM) // M的有效上限：k-1（M<k）且≤参数上限

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
