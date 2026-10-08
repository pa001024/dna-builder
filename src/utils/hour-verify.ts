/**
 * 整点密函“二次写入”验真协调器。
 *
 * 旧逻辑是“二次确认”：整点后等 80 秒取一次，每 30 秒复取，连续两次一致才写入本地 / 推送，
 * 确认完成前本地一直是旧数据，且等待全程占着共享 DNA 队列，弹窗手动刷新会被卡住。
 *
 * 新逻辑是“二次写入”：首轮（整点+80 秒）立刻取数并写入本地；第二轮（整点+80+30 秒）验真，
 * 不一致判首轮为假并用新数据覆盖写入，一致判首轮正确并触发推送；一致时再取第三轮，
 * 依然一致说明 80 秒那次就是真的，与第二轮不一致则再次推送修正后的数据。
 *
 * 弹窗等手动立刻取数会取消当前在途会话并重新规划：若取数时刻落在整点后 110 秒窗口内，
 * 则在 80+30 秒时间点重排一次验真；落在窗口外则不需要重验。
 *
 * 本模块只放可测试的纯协调逻辑（时间口径、可取消等待、会话注册表、推送注册表、验真 Runner），
 * 不直接依赖 Pinia 与 DNA API，取样与写入 / 推送由调用方注入。
 */

export const HOUR_MS = 60 * 60 * 1000
/** 首轮取样相对整点的延迟（毫秒）。 */
export const HOUR_VERIFY_FIRST_DELAY_MS = 80 * 1000
/** 相邻两轮取样的间隔（毫秒）。 */
export const HOUR_VERIFY_GAP_MS = 30 * 1000
/** 验真窗口：整点后 80+30 秒，手动取数落在此窗口内需要重排验真。 */
export const HOUR_VERIFY_WINDOW_MS = HOUR_VERIFY_FIRST_DELAY_MS + HOUR_VERIFY_GAP_MS

/**
 * 取指定时间戳所在的整点。
 * @param timestamp 时间戳，默认现在
 * @returns 整点时间戳
 */
export function getHourStart(timestamp: number = Date.now()): number {
    return Math.floor(timestamp / HOUR_MS) * HOUR_MS
}

/**
 * 首轮取样时间点（整点+80 秒）。
 * @param hourStart 整点时间戳
 * @returns 首轮取样时间戳
 */
export function getFirstSampleAt(hourStart: number): number {
    return hourStart + HOUR_VERIFY_FIRST_DELAY_MS
}

/**
 * 验真取样时间点（整点+80+30 秒）。
 * @param hourStart 整点时间戳
 * @returns 验真取样时间戳
 */
export function getVerifyAt(hourStart: number): number {
    return hourStart + HOUR_VERIFY_WINDOW_MS
}

/**
 * 判断取数时刻是否落在需要重排验真的窗口内（整点起 110 秒内）。
 * @param now 取数时刻
 * @param hourStart 取数时刻所在的整点，默认自动推导
 * @returns 是否需要重排验真
 */
export function isInVerifyWindow(now: number, hourStart: number = getHourStart(now)): boolean {
    const elapsed = now - hourStart
    return elapsed >= 0 && elapsed <= HOUR_VERIFY_WINDOW_MS
}

/**
 * 构造取消错误。
 * @returns 名称为 AbortError 的错误
 */
export function createAbortError(): Error {
    const error = new Error("验真会话已被取消")
    error.name = "AbortError"
    return error
}

/**
 * 判断是否为会话取消错误。
 * @param error 待判断的错误
 * @returns 是否取消错误
 */
export function isAbortError(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError"
}

/**
 * 可取消的等待，超时 resolve，被取消时以 AbortError reject。
 * @param milliseconds 等待毫秒数
 * @param signal 取消信号，可选
 * @returns 等待 Promise
 */
export function waitWithSignal(milliseconds: number, signal?: AbortSignal): Promise<void> {
    if (milliseconds <= 0) return Promise.resolve()
    if (signal?.aborted) return Promise.reject(createAbortError())
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort)
            resolve()
        }, milliseconds)
        const onAbort = () => {
            clearTimeout(timer)
            reject(createAbortError())
        }
        signal?.addEventListener("abort", onAbort, { once: true })
    })
}

export interface TrackedHourSession {
    /** 本次会话的取消信号。 */
    signal: AbortSignal
    /** 会话结束时调用，用于从注册表中摘除。 */
    done: () => void
    /** 会话来源标记，便于日志排查。 */
    label: string
}

const activeHourSessions = new Set<{ controller: AbortController; label: string }>()

/**
 * 登记一个在途验真会话（允许多个整点 / 重验会话并存，互不挤占）。
 * @param label 会话来源标记
 * @returns 会话信号与结束回调
 */
export function trackHourSession(label: string): TrackedHourSession {
    const controller = new AbortController()
    const entry = { controller, label }
    activeHourSessions.add(entry)
    return {
        signal: controller.signal,
        done: () => {
            activeHourSessions.delete(entry)
        },
        label,
    }
}

/**
 * 取消当前全部在途验真会话（弹窗立刻取数时调用），已完成的会话不受影响。
 * @param reason 取消原因
 * @returns 被取消的会话数
 */
export function cancelAllHourSessions(reason = "手动刷新取消"): number {
    let count = 0
    for (const entry of [...activeHourSessions]) {
        entry.controller.abort(reason)
        count++
    }
    return count
}

/**
 * 当前在途验真会话数。
 * @returns 会话数
 */
export function getActiveHourSessionCount(): number {
    return activeHourSessions.size
}

/**
 * 整点验真通过后的管理员推送处理函数（由管理员同步模块在 cron 启动时注册、停止时注销）。
 * 传入数据所属整点与验真后的密函任务，函数内部自行拉取活动并上传。
 */
export type HourAdminPushHandler = (hourStart: number, missions: string[][]) => Promise<void>

let hourAdminPushHandler: HourAdminPushHandler | null = null
let lastAdminPushHourStart: number | null = null

/**
 * 注册 / 注销管理员推送处理函数。
 * @param handler 处理函数，传 null 表示管理员推送未启用
 */
export function setHourAdminPushHandler(handler: HourAdminPushHandler | null): void {
    hourAdminPushHandler = handler
}

/**
 * 读取当前管理员推送处理函数。
 * @returns 处理函数，未启用时为 null
 */
export function getHourAdminPushHandler(): HourAdminPushHandler | null {
    return hourAdminPushHandler
}

/**
 * 读取最近一次管理员推送成功的整点。
 * @returns 整点时间戳，从未推送过为 null
 */
export function getLastAdminPushHourStart(): number | null {
    return lastAdminPushHourStart
}

/**
 * 记录管理员推送成功。
 * @param hourStart 推送数据所属的整点
 */
export function markHourAdminPush(hourStart: number): void {
    lastAdminPushHourStart = hourStart
}

/**
 * 经注册表调用管理员推送，成功后记录所属整点；未启用时直接返回 false。
 * @param hourStart 数据所属的整点
 * @param missions 验真后的密函任务
 * @returns 是否执行了推送
 */
export async function invokeHourAdminPush(hourStart: number, missions: string[][]): Promise<boolean> {
    const handler = getHourAdminPushHandler()
    if (!handler) return false
    await handler(hourStart, missions)
    markHourAdminPush(hourStart)
    return true
}

export interface DoubleWriteVerifyDeps<T> {
    /** 首轮样本归属的整点。 */
    hourStart: number
    /** 首轮样本（整点流在+80 秒取得，手动重验用手动取数值）。 */
    first: { value: T; at: number }
    /** 验真取样的绝对时间点（整点流与手动重验都是整点+80+30 秒）。 */
    verifyAt: number
    /** 第二轮一致后的额外确认间隔；手动重验传 0 表示只验真一次。 */
    extraGapMs: number
    /** 单次取样。 */
    sample: () => Promise<T>
    /** 判定两次取样是否一致。 */
    isSame: (a: T, b: T) => boolean
    /** 每次新取样写入本地（含首轮后的修正写入）。 */
    onSample: (value: T, at: number) => void
    /** 验真后推送（管理员上传；本地流传 null 表示不推送）。 */
    onVerifiedPush: ((value: T) => Promise<void>) | null
    /** 可取消等待，默认 waitWithSignal。 */
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
    /** 当前时间，默认 Date.now。 */
    now?: () => number
    /** 取消信号。 */
    signal: AbortSignal
}

export interface DoubleWriteVerifyResult<T> {
    /** 最终采信的数据。 */
    value: T
    /** 本次 Runner 内实际取样次数（不含首轮）。 */
    samples: number
    /** 是否执行过推送。 */
    pushed: boolean
    /** 最终数据是否经过修正（与首轮不一致）。 */
    corrected: boolean
    /** 验真完成时间。 */
    verifiedAt: number
}

/**
 * 执行“二次写入”验真：第二轮不一致则覆盖写入并推送，一致则推送后再按需取第三轮确认。
 * @param deps 验真依赖
 * @returns 验真结果
 */
export async function runDoubleWriteVerify<T>(deps: DoubleWriteVerifyDeps<T>): Promise<DoubleWriteVerifyResult<T>> {
    const { hourStart: _hourStart, first, verifyAt, extraGapMs, sample, isSame, onSample, onVerifiedPush, signal } = deps
    void _hourStart
    const wait = deps.wait ?? waitWithSignal
    const now = deps.now ?? Date.now
    const throwIfAborted = () => {
        if (signal.aborted) throw createAbortError()
    }

    throwIfAborted()
    await wait(Math.max(0, verifyAt - now()), signal)
    const second = await sample()
    const secondAt = now()
    throwIfAborted()

    if (!isSame(first.value, second)) {
        // 验真不一致：判首轮为假，用新数据覆盖写入并推送修正
        onSample(second, secondAt)
        let pushed = false
        if (onVerifiedPush) {
            await onVerifiedPush(second)
            pushed = true
        }
        return { value: second, samples: 1, pushed, corrected: true, verifiedAt: secondAt }
    }

    // 验真一致：判首轮正确，推送当前数据
    let pushed = false
    if (onVerifiedPush) {
        await onVerifiedPush(second)
        pushed = true
    }

    if (extraGapMs > 0) {
        await wait(extraGapMs, signal)
        const third = await sample()
        const thirdAt = now()
        throwIfAborted()
        if (!isSame(second, third)) {
            // 第三轮与第二轮不一致：再次修正写入并再次推送
            onSample(third, thirdAt)
            if (onVerifiedPush) {
                await onVerifiedPush(third)
                pushed = true
            }
            return { value: third, samples: 2, pushed, corrected: true, verifiedAt: thirdAt }
        }
        return { value: second, samples: 2, pushed, corrected: false, verifiedAt: thirdAt }
    }
    return { value: second, samples: 1, pushed, corrected: false, verifiedAt: secondAt }
}

export interface HourlyDoubleWriteDeps<T> {
    /** 本次整点。 */
    hourStart: number
    /** 单次取样。 */
    sample: () => Promise<T>
    /** 判定两次取样是否一致。 */
    isSame: (a: T, b: T) => boolean
    /** 每次取样写入本地。 */
    onSample: (value: T, at: number) => void
    /** 验真后推送，本地流传 null。 */
    onVerifiedPush: ((value: T) => Promise<void>) | null
    /** 可取消等待，默认 waitWithSignal。 */
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
    /** 当前时间，默认 Date.now。 */
    now?: () => number
    /** 取消信号。 */
    signal: AbortSignal
}

/**
 * 执行整点会话：整点+80 秒首轮立刻取数写入，+80+30 秒验真，一致时再隔 30 秒确认第三轮。
 * @param deps 整点会话依赖
 * @returns 验真结果
 */
export async function runHourlyDoubleWriteSession<T>(deps: HourlyDoubleWriteDeps<T>): Promise<DoubleWriteVerifyResult<T>> {
    const { hourStart, sample, isSame, onSample, onVerifiedPush, signal } = deps
    const wait = deps.wait ?? waitWithSignal
    const now = deps.now ?? Date.now
    if (signal.aborted) throw createAbortError()
    await wait(Math.max(0, getFirstSampleAt(hourStart) - now()), signal)
    const first = await sample()
    const firstAt = now()
    if (signal.aborted) throw createAbortError()
    onSample(first, firstAt)
    return runDoubleWriteVerify({
        hourStart,
        first: { value: first, at: firstAt },
        verifyAt: getVerifyAt(hourStart),
        extraGapMs: HOUR_VERIFY_GAP_MS,
        sample,
        isSame,
        onSample,
        onVerifiedPush,
        wait,
        now,
        signal,
    })
}

/**
 * 仅测试使用的状态重置：清空会话注册表、推送注册表与推送记录。
 */
export function __resetHourVerifyRegistriesForTest(): void {
    cancelAllHourSessions("测试重置")
    activeHourSessions.clear()
    hourAdminPushHandler = null
    lastAdminPushHourStart = null
}
