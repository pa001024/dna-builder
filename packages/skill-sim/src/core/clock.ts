/**
 * 固定时间网格 + 事件边界插入。
 *
 * 采样点 = 网格点 `k * dt` ∪ 已调度事件时刻。事件先于该时刻的采样执行，
 * 因此边界采样看到的是事件后的状态；同一时刻的事件按调度序号（插入序）稳定执行。
 * 网格时间用 `index * dt` 计算而非累加，避免浮点漂移。
 */

export const TIME_EPS = 1e-9

export function sameTime(a: number, b: number): boolean {
    return Math.abs(a - b) <= TIME_EPS
}

export class SimClock {
    readonly duration: number
    readonly dt: number
    now = 0
    private nextGridIndex = 1

    constructor(duration: number, dt = 1 / 60) {
        if (!Number.isFinite(duration) || duration < 0) throw new Error(`duration 必须是非负有限数字，收到 ${duration}`)
        if (!Number.isFinite(dt) || dt <= 0) throw new Error(`dt 必须是正有限数字，收到 ${dt}`)
        this.duration = duration
        this.dt = dt
    }

    /** 下一个尚未采样的网格时刻；已越过 duration 时返回 Infinity */
    peekGridTime(): number {
        const time = this.nextGridIndex * this.dt
        return time <= this.duration + TIME_EPS ? time : Number.POSITIVE_INFINITY
    }

    consumeGrid(): void {
        this.nextGridIndex++
    }

    advanceTo(time: number): void {
        if (time < this.now - TIME_EPS) throw new Error(`时钟不能倒退：${this.now} → ${time}`)
        this.now = time
    }
}

export interface QueueEntry<T> {
    at: number
    /** 同刻优先级：小的先执行（用户命令 0 < 内部 buff 到期 1） */
    priority: number
    /** 全局单调调度序号，用于同刻稳定排序 */
    seq: number
    payload: T
}

/** 按 (at, priority, seq) 升序的二叉堆事件队列 */
export class EventQueue<T> {
    private heap: QueueEntry<T>[] = []
    private nextSeq = 0

    get size(): number {
        return this.heap.length
    }

    push(at: number, payload: T, priority = 0): QueueEntry<T> {
        if (!Number.isFinite(at)) throw new Error(`事件时刻必须是有限数字，收到 ${at}`)
        const entry: QueueEntry<T> = { at, priority, seq: this.nextSeq++, payload }
        this.heap.push(entry)
        this.bubbleUp(this.heap.length - 1)
        return entry
    }

    peek(): QueueEntry<T> | undefined {
        return this.heap[0]
    }

    /** 队首时刻；队列为空时返回 Infinity */
    peekTime(): number {
        return this.heap.length > 0 ? this.heap[0].at : Number.POSITIVE_INFINITY
    }

    pop(): QueueEntry<T> | undefined {
        const top = this.heap[0]
        if (!top) return undefined
        const last = this.heap.pop() as QueueEntry<T>
        if (this.heap.length > 0) {
            this.heap[0] = last
            this.bubbleDown(0)
        }
        return top
    }

    clear(): void {
        this.heap = []
        this.nextSeq = 0
    }

    /** 剩余条目按 (at, priority, seq) 排序快照（调试/测试用） */
    snapshot(): QueueEntry<T>[] {
        return this.heap.slice().sort(compareEntries)
    }

    private compare(a: QueueEntry<T>, b: QueueEntry<T>): number {
        return compareEntries(a, b)
    }

    private bubbleUp(index: number): void {
        let i = index
        while (i > 0) {
            const parent = (i - 1) >> 1
            if (this.compare(this.heap[i], this.heap[parent]) >= 0) break
            const tmp = this.heap[i]
            this.heap[i] = this.heap[parent]
            this.heap[parent] = tmp
            i = parent
        }
    }

    private bubbleDown(index: number): void {
        const length = this.heap.length
        let i = index
        while (true) {
            const left = i * 2 + 1
            const right = left + 1
            let smallest = i
            if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) smallest = left
            if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) smallest = right
            if (smallest === i) break
            const tmp = this.heap[i]
            this.heap[i] = this.heap[smallest]
            this.heap[smallest] = tmp
            i = smallest
        }
    }
}

function compareEntries<T>(a: QueueEntry<T>, b: QueueEntry<T>): number {
    if (a.at !== b.at) return a.at - b.at
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.seq - b.seq
}
