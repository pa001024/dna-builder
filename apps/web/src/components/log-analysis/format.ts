import type { MobKind } from "@/utils/log-analysis/types"

/** 判断是否为有限数字，用于统一空值展示。 */
export function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}

/** 整数千分位格式化；空值/NaN/Infinity 显示 —。 */
export function fmtInt(value: number | null | undefined): string {
    if (!isFiniteNumber(value)) return "—"
    return Math.round(value).toLocaleString("en-US")
}

/** 指定位数的小数格式化；空值/NaN/Infinity 显示 —。 */
export function fmtNum(value: number | null | undefined, digits = 1): string {
    if (!isFiniteNumber(value)) return "—"
    return value.toFixed(digits)
}

/** 百分比格式化（入参已是 0–100）；空值显示 —。 */
export function fmtPct(value: number | null | undefined, digits = 1): string {
    if (!isFiniteNumber(value)) return "—"
    return `${value.toFixed(digits)}%`
}

/** 秒数格式化为 `m:ss.s` 或 `ss.s`；空值显示 —。 */
export function fmtDuration(seconds: number | null | undefined): string {
    if (!isFiniteNumber(seconds)) return "—"
    const value = Math.max(0, seconds)
    if (value >= 60) {
        const minutes = Math.floor(value / 60)
        const rest = value - minutes * 60
        return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`
    }
    return `${value.toFixed(1)}s`
}

/** 字节数按 B/KB/MB/GB 格式化；空值显示 —。 */
export function fmtBytes(bytes: number | null | undefined): string {
    if (!isFiniteNumber(bytes)) return "—"
    if (bytes < 1024) return `${Math.round(bytes)} B`
    const units = ["KB", "MB", "GB", "TB"]
    let value = bytes / 1024
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex++
    }
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

/**
 * 日志里的伪 Unix 秒按 UTC 格式化为 HH:MM:SS。
 * 日志时间戳是本地墙钟时间按 UTC 编码，用 UTC getter 才能还原文件头时间。
 */
export function fmtClock(epochSeconds: number | null | undefined): string {
    if (!isFiniteNumber(epochSeconds) || epochSeconds <= 0) return "—"
    const date = new Date(epochSeconds * 1000)
    const pad = (value: number) => String(value).padStart(2, "0")
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

/** 相对秒数，保留一位小数并带 s 后缀；空值显示 —。 */
export function fmtRel(seconds: number | null | undefined): string {
    if (!isFiniteNumber(seconds)) return "—"
    return `${seconds.toFixed(1)}s`
}

/** 怪物类别对应的 i18n 键。 */
export function mobKindKey(kind: MobKind): string {
    switch (kind) {
        case 1:
            return "log-analysis.kind_elite"
        case 2:
            return "log-analysis.kind_boss"
        case 3:
            return "log-analysis.kind_summon"
        default:
            return "log-analysis.kind_normal"
    }
}

/** 死因原始值对应的 i18n 键；未知值返回 null，由调用方原样展示。 */
export function deathReasonKey(reason: string): string | null {
    switch (reason) {
        case "Damage":
            return "log-analysis.reason_damage"
        case "SummonMax":
            return "log-analysis.reason_summon_max"
        case "SummonRemove":
            return "log-analysis.reason_summon_remove"
        case "SummonTimeLife":
            return "log-analysis.reason_summon_time_life"
        case "ClearSummons":
            return "log-analysis.reason_clear_summons"
        case "未知":
            return "log-analysis.reason_unknown"
        default:
            return null
    }
}
