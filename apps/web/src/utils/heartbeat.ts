/**
 * 心跳快速启动：用竞速把等待压到 500ms 内，失败再等完全就绪后重试。
 *
 * 背景：心跳建连后原来会同步 sleep(1000) 等首轮心跳数据，每次 DNA 取样都要多等 1 秒。
 * 新策略分两步：
 * 1. 快速路径——`heartbeatFastStarted` 对完整握手 race 一个 500ms 超时，超时直接乐观返回，
 *    握手本身在后台继续推进；
 * 2. 兜底重试——`retryAfterHeartbeatReady` 执行后续请求，失败则等握手 promise resolve
 *    后再试一次（心跳未就绪导致的失败会被这次重试救回来）。
 *
 * 本模块是纯函数，可直接单测；真正的握手逻辑由调用方注入。
 */

/** 快速路径最多等待毫秒数。 */
export const HEARTBEAT_FAST_WAIT_MS = 500

/**
 * 最小 sleep 实现（不依赖外部模块，保证 fake timers 下可测）。
 * @param milliseconds 等待毫秒数
 * @returns 等待 Promise
 */
function sleep(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) return Promise.resolve()
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/**
 * 心跳快速启动：完整握手与超时竞速，超时先乐观返回 true。
 * @param ready 完整握手 promise（建连 + 稳定等待），resolve 为是否成功
 * @param fastWaitMs 快速路径等待上限，默认 500ms
 * @returns 是否可以继续发请求（乐观 true，或握手的真实 verdict）
 */
export function heartbeatFastStarted(ready: Promise<boolean>, fastWaitMs: number = HEARTBEAT_FAST_WAIT_MS): Promise<boolean> {
    return Promise.race([ready, sleep(fastWaitMs).then(() => true)])
}

/**
 * 执行心跳后的请求；失败则等握手完全就绪后重试一次。
 * @param ready 完整握手 promise，为 null 表示没有可等待的握手，直接抛原错误
 * @param task 请求函数（应为无副作用的读操作，可安全重试）
 * @returns 请求结果
 */
export async function retryAfterHeartbeatReady<T>(ready: Promise<boolean> | null, task: () => Promise<T>): Promise<T> {
    try {
        return await task()
    } catch (error) {
        if (!ready) throw error
        const ok = await ready.then(
            value => value,
            () => false
        )
        // 握手本身都没成功，重试也没有意义，直接抛原错误
        if (!ok) throw error
        return await task()
    }
}
