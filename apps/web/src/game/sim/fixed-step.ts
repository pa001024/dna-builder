/**
 * 视图侧固定步长累加器：rAF 的可变 dt 只用于「攒时间」，战斗/移动/攻击一律按固定步推进。
 *
 * 与 `Simulation` 的网格同频（默认 1/60），因此同一段墙钟时间无论按 30 / 60 / 144 Hz 切片，
 * 产生的固定步数一致（最多差一步的余数）。单帧追帧上限避免切后台后一次性补几百步。
 */

export const FIXED_STEP = 1 / 60
export const MAX_ACCUMULATED_SECONDS = 0.25
const TIME_EPS = 1e-9

export class FixedStepAccumulator {
    private accumulator = 0

    constructor(
        readonly step: number = FIXED_STEP,
        readonly maxAccumulated: number = MAX_ACCUMULATED_SECONDS
    ) {
        if (!(step > 0)) throw new Error(`固定步长必须 > 0，收到 ${step}`)
        if (!(maxAccumulated >= step)) throw new Error(`追帧上限必须 >= 步长，收到 ${maxAccumulated}`)
    }

    /** 加入一帧的真实 dt，返回本次应执行的固定步数 */
    add(realDt: number): number {
        if (!Number.isFinite(realDt) || realDt <= 0) return 0
        this.accumulator = Math.min(this.accumulator + realDt, this.maxAccumulated)
        let steps = 0
        while (this.accumulator >= this.step - TIME_EPS) {
            this.accumulator -= this.step
            steps++
        }
        return steps
    }

    /** 尚未消费完的时间（秒），用于调试 / 测试 */
    get pending(): number {
        return this.accumulator
    }

    reset(): void {
        this.accumulator = 0
    }
}
