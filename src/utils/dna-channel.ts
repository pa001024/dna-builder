import { useSettingStore } from "@/store/setting"

/**
 * 共享的 DNA API 通道：所有需要心跳 + DNA API 的任务(密函轮询、管理员同步)共用一条串行队列，
 * 避免两个功能同时开启时互相抢占心跳连接。
 */
let dnaTaskQueue: Promise<void> = Promise.resolve()

/**
 * @description 将任务排入共享 DNA 串行队列。
 */
export function enqueueDNATask<T>(task: () => Promise<T>): Promise<T> {
    const result = dnaTaskQueue.then(task, task)
    dnaTaskQueue = result.then(
        () => undefined,
        () => undefined
    )
    return result
}

export interface DNAChannelOptions<T> {
    /**
     * 单次取样。
     */
    sample(): Promise<T>
    /**
     * 判定两次取样是否一致。
     */
    isSame(a: T, b: T): boolean
    /**
     * 首次取样前的等待毫秒数。
     */
    initialDelayMs: number
    /**
     * 相邻两次检查的间隔毫秒数。
     */
    pollIntervalMs: number
    /**
     * 最多取样次数。
     */
    maxSamples: number
    /**
     * 结果已确定时提前结束的回调，返回 true 表示无需继续取样。
     */
    isSettled?(value: T): boolean
}

export interface DNAChannelResult<T> {
    value: T
    /**
     * 是否由连续两次相同取样确认。
     */
    confirmed: boolean
    /**
     * 实际取样次数。
     */
    samples: number
}

/**
 * @description 在共享通道内按「首轮延迟 → 每隔固定间隔取样 → 连续两次相同即确认」的策略取稳定数据。
 * 所有取样都在共享串行队列内执行，并与心跳生命周期绑定，避免与其他 DNA 任务抢占。
 */
export function runDNAChannelTask<T>(options: DNAChannelOptions<T>): Promise<DNAChannelResult<T>> {
    return enqueueDNATask(async () => {
        const setting = useSettingStore()
        const api = await setting.getDNAAPI()
        if (!api) throw new Error("请先登录皎皎角账号")

        const heartbeatStarted = await setting.startHeartbeat()
        if (!heartbeatStarted) throw new Error("启动心跳失败")

        try {
            await wait(options.initialDelayMs)
            let previous = await options.sample()
            let samples = 1

            if (options.isSettled?.(previous)) {
                return { value: previous, confirmed: true, samples }
            }

            for (let i = 1; i < options.maxSamples; i++) {
                await wait(options.pollIntervalMs)
                const current = await options.sample()
                samples++
                if (options.isSame(previous, current)) {
                    return { value: current, confirmed: true, samples }
                }
                previous = current
                if (options.isSettled?.(current)) {
                    return { value: current, confirmed: false, samples }
                }
            }

            return { value: previous, confirmed: false, samples }
        } finally {
            await setting.stopHeartbeat()
        }
    })
}

/**
 * @description 等待指定时长。
 */
export function wait(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/**
 * @description 序列化任务数据用于一致性比较。
 */
export function serializeTaskData(value: unknown): string {
    return JSON.stringify(value)
}
