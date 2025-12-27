/**
 * DPS统计系统
 */
export class DPSMeter {
    private static damageHistory: Array<{ damage: number; time: number }> = []
    private static timeWindow = 5000 // 5秒时间窗口
    private static totalDamage = 0
    private static startTime = 0
    private static lastUpdateTime = 0

    /**
     * 记录伤害
     */
    static recordDamage(damage: number): void {
        const now = Date.now()

        if (this.startTime === 0) {
            this.startTime = now
        }

        this.damageHistory.push({ damage, time: now })
        this.totalDamage += damage
        this.lastUpdateTime = now

        // 清理超出时间窗口的历史记录
        this.cleanupOldEntries(now)
    }

    /**
     * 清理超出时间窗口的记录
     */
    private static cleanupOldEntries(now: number): void {
        const cutoff = now - this.timeWindow
        this.damageHistory = this.damageHistory.filter((entry) => entry.time > cutoff)
    }

    /**
     * 计算当前DPS(基于5秒窗口)
     */
    static getCurrentDPS(): number {
        const now = Date.now()
        this.cleanupOldEntries(now)

        if (this.damageHistory.length === 0) {
            return 0
        }

        const windowDamage = this.damageHistory.reduce((sum, entry) => sum + entry.damage, 0)
        return windowDamage / (this.timeWindow / 1000)
    }

    /**
     * 计算平均DPS(从开始到现在)
     */
    static getAverageDPS(): number {
        if (this.startTime === 0) {
            return 0
        }

        const elapsed = (this.lastUpdateTime - this.startTime) / 1000
        if (elapsed < 0.1) {
            return 0
        }

        return this.totalDamage / elapsed
    }

    /**
     * 获取总伤害
     */
    static getTotalDamage(): number {
        return this.totalDamage
    }

    /**
     * 获取战斗时长(秒)
     */
    static getElapsedTime(): number {
        if (this.startTime === 0) {
            return 0
        }
        return (this.lastUpdateTime - this.startTime) / 1000
    }

    /**
     * 重置统计
     */
    static reset(): void {
        this.damageHistory = []
        this.totalDamage = 0
        this.startTime = 0
        this.lastUpdateTime = 0
    }

    /**
     * 获取DPS统计信息
     */
    static getStats() {
        return {
            currentDPS: this.getCurrentDPS(),
            averageDPS: this.getAverageDPS(),
            totalDamage: this.getTotalDamage(),
            elapsedTime: this.getElapsedTime(),
        }
    }
}
