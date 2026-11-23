/**
 * 按内容键 + 时间窗口去重。
 *
 * 官方管道与日志分析会重复播报同一条事件，两路都能在写入前用同一套窗口判重。
 * @param windowMs 去重窗口（毫秒）
 * @param maxSize 触发清理的条目数
 */
export function createRecentDedupe(windowMs: number, maxSize = 256) {
    const seen = new Map<string, number>()
    return {
        /** 判断键在窗口内是否出现过；首次出现会记录时刻。 */
        duplicate(key: string, at = Date.now()): boolean {
            const last = seen.get(key)
            if (last !== undefined && Math.abs(at - last) < windowMs) return true
            seen.set(key, at)
            if (seen.size > maxSize) {
                for (const [item, prev] of seen) {
                    if (Math.abs(at - prev) >= windowMs) seen.delete(item)
                }
            }
            return false
        },
        /** 清空去重表（清空账本时用）。 */
        clear() {
            seen.clear()
        },
    }
}
