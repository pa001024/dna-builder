import { resolveClientIp } from "../ai-log-format"

/** 限流判定结果；超限时带出距离下一个可用名额的等待时间。 */
export type RateLimitResult = { allowed: boolean; retryAfterMs?: number }

/** 桶数量超过该值时才清理空桶，避免每次请求都遍历。 */
const PRUNE_THRESHOLD = 5000

/** 桶数量硬上限：清理后仍超出时按插入顺序丢弃最旧的桶，保证内存有界。 */
const MAX_BUCKETS = 10_000

/**
 * 进程内滑动窗口限流：每个 key 保存窗口内的调用时间戳。
 * 多实例部署时各进程独立计数，仅作 v1 的防刷手段，不是全局配额。
 */
export class RateLimiter {
    private readonly buckets = new Map<string, number[]>()

    constructor(
        private readonly maxRequests: number,
        private readonly windowMs: number,
        private readonly now: () => number = Date.now
    ) {}

    /**
     * @description 记账一次调用并判定是否超限。
     * @param key 限流键（如 `user:<id>`、`ip:<addr>`）
     * @returns 是否允许；拒绝时给出重试等待毫秒数
     */
    allow(key: string): RateLimitResult {
        if (this.maxRequests <= 0) return { allowed: false, retryAfterMs: this.windowMs }

        const now = this.now()
        const recent = (this.buckets.get(key) ?? []).filter(timestamp => now - timestamp < this.windowMs)

        if (recent.length >= this.maxRequests) {
            this.buckets.set(key, recent)
            const oldest = recent[0]
            return { allowed: false, retryAfterMs: Math.max(1, this.windowMs - (now - oldest)) }
        }

        recent.push(now)
        this.buckets.set(key, recent)
        this.prune(now)
        return { allowed: true }
    }

    /**
     * @description 当前追踪的 key 数量（运维观测用）。
     */
    get size(): number {
        return this.buckets.size
    }

    /**
     * @description 清空全部计数（测试或运维重置用）。
     */
    reset(): void {
        this.buckets.clear()
    }

    /**
     * @description 桶数量过多时丢弃窗口内已无调用的 key；仍超出硬上限时按插入顺序淘汰最旧的桶。
     * @param now 当前时间
     */
    private prune(now: number): void {
        if (this.buckets.size <= PRUNE_THRESHOLD) return
        for (const [key, timestamps] of this.buckets) {
            if (!timestamps.some(timestamp => now - timestamp < this.windowMs)) {
                this.buckets.delete(key)
            }
        }
        while (this.buckets.size > MAX_BUCKETS) {
            const oldestKey = this.buckets.keys().next().value
            if (oldestKey === undefined) break
            this.buckets.delete(oldestKey)
        }
    }
}

/** 按客户端 IP 限流的判定入口。 */
export type IpRateLimiter = {
    /** 底层限流器，便于调用方按需重置 */
    limiter: RateLimiter
    /**
     * @description 按请求头解析客户端 IP 后记账。
     * @param headers 请求头
     * @param socketAddress 直连地址兜底
     * @returns 是否允许
     */
    allow(headers: { get(name: string): string | null }, socketAddress?: string | null): RateLimitResult
}

/**
 * @description 创建按 IP 计数的限流器；解析不到 IP 时共用 `ip:unknown` 桶，避免无头请求绕过限额。
 * @param maxRequests 窗口内允许次数
 * @param windowMs 窗口毫秒数
 * @param now 时钟（测试注入）
 * @returns IP 限流器
 */
export function createIpLimiter(maxRequests: number, windowMs: number, now: () => number = Date.now): IpRateLimiter {
    const limiter = new RateLimiter(maxRequests, windowMs, now)
    return {
        limiter,
        allow(headers, socketAddress) {
            const ip = resolveClientIp(headers, socketAddress)
            return limiter.allow(`ip:${ip || "unknown"}`)
        },
    }
}
