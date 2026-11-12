/** 脚本控制台环形缓冲容量：与旧版控制台保留上限一致。 */
export const SCRIPT_CONSOLE_RING_CAPACITY = 1000

/** 控制台响应式快照的批量刷新节流间隔（毫秒）：高频日志下每秒最多触发约 4 次渲染。 */
export const SCRIPT_CONSOLE_FLUSH_INTERVAL_MS = 250

/** 单条控制台消息的最大保留长度：超长消息（long string dump）直接截断，防止单条大文本卡死渲染。 */
export const SCRIPT_CONSOLE_MAX_MESSAGE_LENGTH = 2000

/** 脚本事件时间戳的响应式同步节流间隔（毫秒）：看门狗按秒级精度工作即可，无需每次事件都触发响应式更新。 */
export const SCRIPT_CONSOLE_TOUCH_THROTTLE_MS = 1000

/**
 * 定长环形缓冲：O(1) 写入，写满时覆盖最旧条目并累计丢弃数。
 * 日志事件回调内只做 push，不 touching 任何响应式状态，保证洪水日志下主线程仍可响应停止按钮。
 */
export class ConsoleLogRingBuffer<T> {
    private buffer: (T | undefined)[]
    private head = 0
    private count = 0
    droppedCount = 0

    constructor(readonly capacity: number = SCRIPT_CONSOLE_RING_CAPACITY) {
        this.buffer = new Array<T | undefined>(Math.max(1, Math.floor(capacity)))
    }

    get size(): number {
        return this.count
    }

    push(item: T): void {
        if (this.count < this.buffer.length) {
            this.buffer[(this.head + this.count) % this.buffer.length] = item
            this.count++
            return
        }
        this.buffer[this.head] = item
        this.head = (this.head + 1) % this.buffer.length
        this.droppedCount++
    }

    /** 按从旧到新顺序返回快照，不修改缓冲内容。 */
    toArray(): T[] {
        const result: T[] = new Array<T>(this.count)
        for (let i = 0; i < this.count; i++) {
            result[i] = this.buffer[(this.head + i) % this.buffer.length] as T
        }
        return result
    }

    clear(): void {
        this.buffer.fill(undefined)
        this.head = 0
        this.count = 0
        this.droppedCount = 0
    }

    /**
     * 移除满足条件的条目并重建缓冲（O(N)，仅用户清空等低频操作调用）。
     * @returns 移除的条目数
     */
    removeIf(predicate: (item: T) => boolean): number {
        const ordered = this.toArray()
        let write = 0
        for (let read = 0; read < ordered.length; read++) {
            if (predicate(ordered[read])) continue
            ordered[write++] = ordered[read]
        }
        const removed = ordered.length - write
        if (removed === 0) return 0
        this.buffer.fill(undefined)
        for (let i = 0; i < write; i++) {
            this.buffer[i] = ordered[i]
        }
        this.head = 0
        this.count = write
        return removed
    }
}

/**
 * 高频事件源的节流调度器：低频时同步 flush 保证即时可见，高频时合并到 interval 一次 flush。
 * 控制台日志与脚本状态共用一套，避免每加一个事件源就复制一份 timer/lastAt 簿记。
 * @param intervalMs 节流间隔
 * @param flush 真正写响应式状态的函数
 * @returns queue（请求一次刷新）、beginFlush（在 flush 体内记账并取消待处理刷新）、cancel、touch
 */
export function createThrottledFlush(intervalMs: number, flush: () => void) {
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastAt = 0
    const cancel = () => {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }
    return {
        queue() {
            const now = Date.now()
            if (now - lastAt >= intervalMs) {
                flush()
                return
            }
            if (timer) return
            const delay = intervalMs - (now - lastAt)
            timer = setTimeout(() => {
                timer = null
                flush()
            }, delay)
        },
        /** 在 flush 函数体开头调用：记录刷新时刻并取消待处理的定时刷新。 */
        beginFlush() {
            lastAt = Date.now()
            cancel()
        },
        cancel,
        touch() {
            lastAt = Date.now()
        },
    }
}

/**
 * 截断超长控制台消息，保留首尾便于定位。
 */
export function truncateConsoleMessage(message: string, maxLength: number = SCRIPT_CONSOLE_MAX_MESSAGE_LENGTH): string {
    if (message.length <= maxLength) return message
    const keepHead = Math.ceil((maxLength - 32) / 2)
    const keepTail = Math.floor((maxLength - 32) / 2)
    return `${message.slice(0, keepHead)}…(已截断 ${message.length - maxLength} 字)…${message.slice(message.length - keepTail)}`
}
