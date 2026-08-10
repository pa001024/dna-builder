import { type RaceLotteryInsideBuff, raceLotteryData } from "@/data/d/race-lottery.data"

/** 赛道总长度（米），与 `RaceTrackLength` 常量一致。 */
export const RACE_TRACK_LENGTH = Number(raceLotteryData.constants.RaceTrackLength) || 100
/** 切换冲刺词条的时间点（秒），与 `RaceTimeOutTime` 常量一致。 */
export const RACE_SPRINT_TIME = Number(raceLotteryData.constants.RaceTimeOutTime) || 30
/** 冲刺词条 ID，与 `RaceTimeOutTimeBuff` 常量一致。 */
export const RACE_SPRINT_BUFF_ID = Number(raceLotteryData.constants.RaceTimeOutTimeBuff) || 3002
/** 前 N 名视为胜出，与 `ShortListedPlayerNum` 常量一致。 */
export const RACE_TOP_N = Number(raceLotteryData.constants.ShortListedPlayerNum) || 6
/** 途中重抽词条的时间节点（秒）。用户规则为每 5 秒，与动画模拟保持一致。 */
export const RACE_BUFF_MARKS = [5, 10, 15, 20, 25] as const
/** 魔灵竞速活动开始时间（黄金旅途·魔灵竞速 EventId 103025）。 */
export const RACE_EVENT_START = 1785945600
/** 冲刺前的分段时长（秒）。 */
const SEGMENT_DURATION = 5
/** 冲刺前分段数：初始 + 5 次重抽。 */
const PRE_SPRINT_SEGMENTS = RACE_BUFF_MARKS.length + 1
/** 时间分桶精度，合并浮点误差。 */
const TIME_EPS = 1e-9

export interface RaceSimPlayerInput {
    playerId: number
    /** 当天最终速度（已含外部词条）。 */
    speed: number
}

export interface RaceSimFinish {
    playerId: number
    finishTime: number
    rank: number
}

export interface RaceTop6Rate {
    playerId: number
    /** 进入前 N 的概率，取值 [0, 1]。 */
    rate: number
}

/** 完赛时间离散分布：按时间升序。 */
export interface FinishTimeMass {
    time: number
    probability: number
}

interface WeightedBuff {
    effect: number
    probability: number
}

/**
 * 计算当前赛事天数，用于筛选已解锁的赛内词条。
 * @param nowSec 当前时间戳（秒），默认取系统时间。
 * @returns 1 到活动天数之间的天数。
 */
export function computeRaceEventDay(nowSec = Math.floor(Date.now() / 1000)): number {
    const day = Math.floor((nowSec - RACE_EVENT_START) / 86400) + 1
    return Math.max(1, Math.min(day, raceLotteryData.maxStakes.length))
}

/**
 * 按当天可解锁的赛内词条池构建抽取池：同名词条只保留最后一个，且剔除随机权重为 0 的词条。
 * @param day 赛事天数。
 * @returns 可用于加权抽取的词条列表。
 */
export function buildInsideBuffPool(day: number): RaceLotteryInsideBuff[] {
    const eligible = raceLotteryData.insideBuffs.filter(buff => buff.unlockDay <= day)
    const result: RaceLotteryInsideBuff[] = []
    const indexByName = new Map<string, number>()
    for (const buff of eligible) {
        const existingIndex = indexByName.get(buff.name)
        if (existingIndex !== undefined) {
            result[existingIndex] = buff
        } else {
            indexByName.set(buff.name, result.length)
            result.push(buff)
        }
    }
    return result.filter(buff => buff.randomWeight > 0)
}

/**
 * 获取冲刺词条；缺失时回退到 effect=2 的同名「冲刺」。
 * @returns 冲刺词条。
 */
export function getSprintBuff(): RaceLotteryInsideBuff {
    const byId = raceLotteryData.insideBuffs.find(buff => buff.insideBuffId === RACE_SPRINT_BUFF_ID)
    if (byId) return byId
    return (
        raceLotteryData.insideBuffs.find(buff => buff.name === "冲刺") || {
            insideBuffId: RACE_SPRINT_BUFF_ID,
            unlockDay: 1,
            effect: 2,
            randomWeight: 0,
            name: "冲刺",
            description: "",
        }
    )
}

/**
 * 按随机权重从词条池中抽取一个词条。
 * @param pool 词条池。
 * @param random 随机数发生器，返回 [0, 1)。
 * @returns 抽中的赛内词条。
 */
export function pickInsideBuff(pool: readonly RaceLotteryInsideBuff[], random: () => number = Math.random): RaceLotteryInsideBuff {
    const total = pool.reduce((sum, buff) => sum + buff.randomWeight, 0)
    if (!pool.length) {
        return {
            insideBuffId: 1001,
            unlockDay: 1,
            effect: 1,
            randomWeight: 1,
            name: "匀速",
            description: "",
        }
    }
    if (total <= 0) return pool[pool.length - 1]
    let roll = random() * total
    for (const buff of pool) {
        roll -= buff.randomWeight
        if (roll < 0) return buff
    }
    return pool[pool.length - 1]
}

interface RunnerState {
    playerId: number
    initialSpeed: number
    speed: number
    distance: number
    finished: boolean
    finishTime: number
}

/**
 * 在恒定速度的时间段内推进选手，并在精确冲线时刻标记完赛。
 * @param runners 选手状态。
 * @param startTime 段起点（秒）。
 * @param endTime 段终点（秒）。
 */
function advanceSegment(runners: RunnerState[], startTime: number, endTime: number): void {
    const dt = endTime - startTime
    if (dt <= 0) return

    for (const runner of runners) {
        if (runner.finished) continue

        if (runner.speed > 0) {
            const remaining = RACE_TRACK_LENGTH - runner.distance
            const timeNeeded = remaining / runner.speed
            if (timeNeeded <= dt) {
                runner.distance = RACE_TRACK_LENGTH
                runner.finished = true
                runner.finishTime = startTime + timeNeeded
                continue
            }
        }

        runner.distance = Math.max(0, Math.min(RACE_TRACK_LENGTH, runner.distance + runner.speed * dt))
        if (runner.distance >= RACE_TRACK_LENGTH) {
            runner.distance = RACE_TRACK_LENGTH
            runner.finished = true
            runner.finishTime = endTime
        }
    }
}

/**
 * 冲刺阶段：速度恒定，按精确时间冲线；若速度非正则永不完赛，记为极大时间。
 * @param runners 选手状态。
 * @param startTime 冲刺开始时间。
 */
function advanceSprintToFinish(runners: RunnerState[], startTime: number): void {
    for (const runner of runners) {
        if (runner.finished) continue
        if (runner.speed <= 0) {
            runner.finishTime = Number.POSITIVE_INFINITY
            runner.finished = true
            continue
        }
        const remaining = RACE_TRACK_LENGTH - runner.distance
        runner.finishTime = startTime + remaining / runner.speed
        runner.distance = RACE_TRACK_LENGTH
        runner.finished = true
    }
}

/**
 * 按赛中词条规则模拟一整场比赛，返回精确完赛时间与名次。
 * 规则：初始抽 buff → 每 5 秒重抽 → 30 秒强制冲刺 → 100m 冲线。
 * @param players 选手及其当天最终速度。
 * @param day 赛事天数，决定词条解锁池。
 * @param random 随机数发生器。
 * @returns 按名次排序的完赛结果。
 */
export function simulateRace(players: readonly RaceSimPlayerInput[], day: number, random: () => number = Math.random): RaceSimFinish[] {
    const pool = buildInsideBuffPool(day)
    const sprintBuff = getSprintBuff()
    const runners: RunnerState[] = players.map(player => {
        const initialSpeed = Math.max(0, player.speed)
        const firstBuff = pickInsideBuff(pool, random)
        return {
            playerId: player.playerId,
            initialSpeed,
            speed: initialSpeed * firstBuff.effect,
            distance: 0,
            finished: false,
            finishTime: Number.POSITIVE_INFINITY,
        }
    })

    let cursor = 0
    for (const mark of RACE_BUFF_MARKS) {
        advanceSegment(runners, cursor, mark)
        for (const runner of runners) {
            if (runner.finished) continue
            const buff = pickInsideBuff(pool, random)
            runner.speed = runner.initialSpeed * buff.effect
        }
        cursor = mark
    }

    advanceSegment(runners, cursor, RACE_SPRINT_TIME)
    for (const runner of runners) {
        if (runner.finished) continue
        runner.speed = runner.initialSpeed * sprintBuff.effect
    }
    advanceSprintToFinish(runners, RACE_SPRINT_TIME)

    const orderIndex = new Map(players.map((player, index) => [player.playerId, index]))
    const sorted = [...runners].sort((left, right) => {
        const timeDiff = left.finishTime - right.finishTime
        if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff
        if (Number.isFinite(left.finishTime) !== Number.isFinite(right.finishTime)) {
            return Number.isFinite(left.finishTime) ? -1 : 1
        }
        return (orderIndex.get(left.playerId) ?? 0) - (orderIndex.get(right.playerId) ?? 0)
    })

    return sorted.map((runner, index) => ({
        playerId: runner.playerId,
        finishTime: runner.finishTime,
        rank: index + 1,
    }))
}

/**
 * 将完赛时间量化，合并浮点噪声。
 * @param time 原始时间。
 * @returns 量化后的时间键。
 */
function quantizeTime(time: number): number {
    if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY
    return Math.round(time / TIME_EPS) * TIME_EPS
}

/**
 * 把词条池规范成 effect 与概率。
 * @param pool 词条池。
 * @returns 加权词条。
 */
function toWeightedBuffs(pool: readonly RaceLotteryInsideBuff[]): WeightedBuff[] {
    const total = pool.reduce((sum, buff) => sum + buff.randomWeight, 0)
    if (!pool.length || total <= 0) {
        return [{ effect: 1, probability: 1 }]
    }
    return pool.map(buff => ({
        effect: buff.effect,
        probability: buff.randomWeight / total,
    }))
}

/**
 * 单段推进：返回是否完赛、新距离与完赛时间。
 * @param distance 段起点路程。
 * @param startTime 段起点时间。
 * @param duration 段时长。
 * @param speed 当前速度。
 */
function advanceOneSegment(
    distance: number,
    startTime: number,
    duration: number,
    speed: number
): { finished: boolean; distance: number; finishTime: number } {
    if (speed > 0) {
        const remaining = RACE_TRACK_LENGTH - distance
        const timeNeeded = remaining / speed
        if (timeNeeded <= duration) {
            return { finished: true, distance: RACE_TRACK_LENGTH, finishTime: startTime + timeNeeded }
        }
    }
    const nextDistance = Math.max(0, Math.min(RACE_TRACK_LENGTH, distance + speed * duration))
    if (nextDistance >= RACE_TRACK_LENGTH) {
        return { finished: true, distance: RACE_TRACK_LENGTH, finishTime: startTime + duration }
    }
    return { finished: false, distance: nextDistance, finishTime: Number.POSITIVE_INFINITY }
}

/**
 * 枚举全部赛内词条序列，得到该速度下的精确完赛时间分布。
 * @param initialSpeed 当天最终速度。
 * @param weightedBuffs 规范化后的词条池。
 * @param sprintEffect 冲刺倍率。
 * @returns 按时间升序的质量点。
 */
export function buildFinishTimeDistribution(
    initialSpeed: number,
    weightedBuffs: readonly WeightedBuff[],
    sprintEffect: number
): FinishTimeMass[] {
    const speed = Math.max(0, initialSpeed)
    const mass = new Map<number, number>()

    /**
     * 累加一个时间点的概率质量。
     * @param time 完赛时间。
     * @param probability 路径概率。
     */
    function addMass(time: number, probability: number): void {
        if (probability <= 0) return
        const key = quantizeTime(time)
        mass.set(key, (mass.get(key) || 0) + probability)
    }

    if (speed <= 0) {
        addMass(Number.POSITIVE_INFINITY, 1)
        return [{ time: Number.POSITIVE_INFINITY, probability: 1 }]
    }

    /**
     * DFS 展开 PRE_SPRINT_SEGMENTS 段词条。
     * @param depth 已完成段数。
     * @param distance 当前路程。
     * @param time 当前时间。
     * @param probability 路径概率。
     */
    function dfs(depth: number, distance: number, time: number, probability: number): void {
        if (depth >= PRE_SPRINT_SEGMENTS) {
            const sprintSpeed = speed * sprintEffect
            if (sprintSpeed <= 0) {
                addMass(Number.POSITIVE_INFINITY, probability)
                return
            }
            const remaining = RACE_TRACK_LENGTH - distance
            addMass(RACE_SPRINT_TIME + remaining / sprintSpeed, probability)
            return
        }

        for (const buff of weightedBuffs) {
            const branchProbability = probability * buff.probability
            if (branchProbability <= 0) continue
            const segmentSpeed = speed * buff.effect
            const advanced = advanceOneSegment(distance, time, SEGMENT_DURATION, segmentSpeed)
            if (advanced.finished) {
                addMass(advanced.finishTime, branchProbability)
                continue
            }
            dfs(depth + 1, advanced.distance, time + SEGMENT_DURATION, branchProbability)
        }
    }

    dfs(0, 0, 0, 1)

    return [...mass.entries()].map(([time, probability]) => ({ time, probability })).sort((left, right) => left.time - right.time)
}

/**
 * 预计算分布的严格小于 / 等于 CDF，便于快速查询。
 */
interface DistCdf {
    times: number[]
    /** prefixLess[i] = P(T < times[i]) */
    prefixLess: number[]
    /** equalProb[i] = P(T = times[i]) */
    equalProb: number[]
    /** P(T 有限) */
    finiteProb: number
}

/**
 * 将质量点转为可查询的 CDF 结构。
 * @param masses 完赛时间分布。
 */
function buildDistCdf(masses: readonly FinishTimeMass[]): DistCdf {
    const times: number[] = []
    const equalProb: number[] = []
    let cumulative = 0
    const prefixLess: number[] = []
    let finiteProb = 0
    for (const mass of masses) {
        prefixLess.push(cumulative)
        times.push(mass.time)
        equalProb.push(mass.probability)
        cumulative += mass.probability
        if (Number.isFinite(mass.time)) finiteProb += mass.probability
    }
    return { times, prefixLess, equalProb, finiteProb }
}

/**
 * 查询 P(T < t)。
 * @param cdf 分布 CDF。
 * @param time 阈值。
 */
function probabilityLessThan(cdf: DistCdf, time: number): number {
    if (!Number.isFinite(time)) return cdf.finiteProb
    // 找到第一个 times[i] >= time，则 P(T < time) = prefixLess[i] 再扣掉等于但 quantize 后仍 < time 的部分
    let lo = 0
    let hi = cdf.times.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (cdf.times[mid] < time - TIME_EPS / 2) lo = mid + 1
        else hi = mid
    }
    return lo < cdf.prefixLess.length
        ? cdf.prefixLess[lo]
        : cdf.prefixLess.length
          ? cdf.prefixLess[cdf.prefixLess.length - 1] + cdf.equalProb[cdf.equalProb.length - 1]
          : 0
}

/**
 * 查询 P(T = t)。
 * @param cdf 分布 CDF。
 * @param time 时间点。
 */
function probabilityEqual(cdf: DistCdf, time: number): number {
    const key = quantizeTime(time)
    let lo = 0
    let hi = cdf.times.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (cdf.times[mid] < key - TIME_EPS / 2) lo = mid + 1
        else hi = mid
    }
    if (lo >= cdf.times.length) return 0
    return Math.abs(cdf.times[lo] - key) <= TIME_EPS ? cdf.equalProb[lo] : 0
}

/**
 * Poisson binomial：P(X <= maxK)，X = sum Bernoulli(p_i)。
 * 截断 DP，只保留 0..maxK 的质量。
 * @param probs 各独立成功概率。
 * @param maxK 上限。
 * @returns CDF 值。
 */
export function poissonBinomialCdfAtMost(probs: readonly number[], maxK: number): number {
    if (maxK < 0) return 0
    if (!probs.length) return 1

    let dp = new Float64Array(maxK + 1)
    dp[0] = 1
    for (const raw of probs) {
        const p = Math.min(1, Math.max(0, raw))
        const next = new Float64Array(maxK + 1)
        for (let k = 0; k <= maxK; k++) {
            const stay = dp[k] * (1 - p)
            next[k] += stay
            if (k < maxK) next[k + 1] += dp[k] * p
            // k == maxK 且成功时质量落入 X > maxK，直接丢弃，CDF 只关心 <= maxK
        }
        dp = next
    }
    let total = 0
    for (let k = 0; k <= maxK; k++) total += dp[k]
    return total
}

/**
 * 用词条序列完全枚举 + Poisson binomial，精确计算进入前 N 的概率。
 * @param players 选手及其当天最终速度。
 * @param day 赛事天数。
 * @param topN 胜出名次上限，默认 6。
 * @returns 每位选手的精确胜率。
 */
export function estimateTopNRates(players: readonly RaceSimPlayerInput[], day: number, topN = RACE_TOP_N): RaceTop6Rate[] {
    if (!players.length) return []

    const pool = buildInsideBuffPool(day)
    const weightedBuffs = toWeightedBuffs(pool)
    const sprintEffect = getSprintBuff().effect
    const safeTopN = Math.max(1, Math.floor(topN))

    const distBySpeed = new Map<number, DistCdf>()
    const playerCdfs: DistCdf[] = players.map(player => {
        const speedKey = quantizeTime(Math.max(0, player.speed))
        let cdf = distBySpeed.get(speedKey)
        if (!cdf) {
            const masses = buildFinishTimeDistribution(speedKey, weightedBuffs, sprintEffect)
            cdf = buildDistCdf(masses)
            distBySpeed.set(speedKey, cdf)
        }
        return cdf
    })

    return players.map((player, index) => {
        const selfCdf = playerCdfs[index]
        let rate = 0
        for (let massIndex = 0; massIndex < selfCdf.times.length; massIndex++) {
            const time = selfCdf.times[massIndex]
            const probability = selfCdf.equalProb[massIndex]
            if (probability <= 0) continue

            const beatProbs: number[] = []
            for (let other = 0; other < players.length; other++) {
                if (other === index) continue
                const otherCdf = playerCdfs[other]
                let beat = probabilityLessThan(otherCdf, time)
                // 并列时按输入顺序打破：order 更小者排前
                if (other < index) beat += probabilityEqual(otherCdf, time)
                beatProbs.push(Math.min(1, Math.max(0, beat)))
            }
            rate += probability * poissonBinomialCdfAtMost(beatProbs, safeTopN - 1)
        }
        return {
            playerId: player.playerId,
            rate: Math.min(1, Math.max(0, rate)),
        }
    })
}
