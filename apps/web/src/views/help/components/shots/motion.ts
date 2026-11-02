import type { CSSProperties } from "vue"

/** 分镜动画共用的确定性缓动与时间窗工具，全部以场景本地秒数为输入。 */

export function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value))
}

export function lerp(from: number, to: number, progress: number): number {
    return from + (to - from) * progress
}

export function easeOutCubic(value: number): number {
    const p = clamp01(value)
    return 1 - (1 - p) ** 3
}

export function easeOutExpo(value: number): number {
    const p = clamp01(value)
    return p >= 1 ? 1 : 1 - 2 ** (-10 * p)
}

export function easeInOutCubic(value: number): number {
    const p = clamp01(value)
    return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2
}

/**
 * 取某段动画在给定时间的进度。
 * @param time 场景本地时间
 * @param at 动画开始秒数
 * @param duration 动画时长
 */
export function progressAt(time: number, at: number, duration: number): number {
    return clamp01((time - at) / Math.max(0.001, duration))
}

export type EnterStyle = CSSProperties

/**
 * 入场样式：上移淡入，可加错峰。
 * @param time 场景本地时间
 * @param at 开始秒数
 * @param duration 动画时长
 * @param distance 上移距离（px）
 */
export function enterStyle(time: number, at: number, duration = 0.6, distance = 18): EnterStyle {
    const p = easeOutCubic(progressAt(time, at, duration))
    return {
        opacity: p,
        transform: `translateY(${lerp(distance, 0, p)}px)`,
    }
}

/**
 * 带缩放的入场样式（卡片/窗口）。
 * @param time 场景本地时间
 * @param at 开始秒数
 * @param duration 动画时长
 * @param fromScale 初始缩放
 */
export function popStyle(time: number, at: number, duration = 0.65, fromScale = 0.94): EnterStyle {
    const p = easeOutExpo(progressAt(time, at, duration))
    return {
        opacity: clamp01(p * 1.6),
        transform: `scale(${lerp(fromScale, 1, p)})`,
    }
}

/**
 * 线性插值一组路径点。
 * @param points 百分比路径
 * @param progress 0-1 进度
 */
export function samplePath(points: [number, number][], progress: number): [number, number] {
    if (!points.length) return [50, 50]
    if (points.length === 1) return points[0]
    const p = clamp01(progress) * (points.length - 1)
    const index = Math.min(points.length - 2, Math.floor(p))
    const local = p - index
    const eased = easeInOutCubic(local)
    const [x1, y1] = points[index]
    const [x2, y2] = points[index + 1]
    return [lerp(x1, x2, eased), lerp(y1, y2, eased)]
}

/**
 * 把数字限制在区间内。
 * @param value 值
 * @param min 最小值
 * @param max 最大值
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}
