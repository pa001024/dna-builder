import type { QrCodeData } from "./qr-code"

/**
 * 二维码美化渲染：把模块矩阵转换成圆角消融轮廓与定位图形轮廓。
 *
 * 数据模块按「圆角矩形 + 相邻方向外扩」绘制：相邻的深色模块会连成一片（消融效果），
 * 浅色模块仍保留 1 个模块的净空（外扩量小于半个模块，采样点不会被糊住）。
 * 定位图形与校正图形单独绘制成圆角方环，避免被数据模块的圆角破坏识别特征。
 */

/** 轮廓样式选项 */
export interface QrShapeOptions {
    /** 数据模块圆角半径（模块单位，0.5 即圆形），默认 0.42，上限 0.5 */
    moduleRadius?: number
    /** 相邻深色模块的外扩量（模块单位，越大越"消融"），默认 0.32，上限 0.49 */
    merge?: number
    /** 定位图形圆角半径（模块单位），默认 2 */
    finderRadius?: number
    /** 校正图形圆角半径（模块单位），默认 1.4 */
    alignmentRadius?: number
}

/** 轮廓结果：均为 SVG path 的 `d` 属性值 */
export interface QrShapes {
    /** 数据模块轮廓（含时序图形），用 nonzero 填充 */
    modules: string
    /** 定位图形与校正图形的圆环与外芯，用 evenodd 填充 */
    rings: string
}

/**
 * 输出紧凑数字：最多两位小数，去掉多余的 0。
 * @param value 数值
 * @returns 字符串
 */
function fmt(value: number): string {
    return String(Math.round(value * 100) / 100)
}

/**
 * 生成圆角矩形路径（顺时针）。
 * @param x 左上角 x
 * @param y 左上角 y
 * @param w 宽
 * @param h 高
 * @param radius 圆角半径
 * @returns SVG path 数据
 */
function roundedRectPath(x: number, y: number, w: number, h: number, radius: number): string {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2))
    if (r === 0) {
        return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`
    }

    return [
        `M${fmt(x + r)} ${fmt(y)}`,
        `h${fmt(w - r * 2)}`,
        `a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} ${fmt(r)}`,
        `v${fmt(h - r * 2)}`,
        `a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(-r)} ${fmt(r)}`,
        `h${fmt(-(w - r * 2))}`,
        `a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(-r)} ${fmt(-r)}`,
        `v${fmt(-(h - r * 2))}`,
        `a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} ${fmt(-r)}`,
        "z",
    ].join("")
}

/**
 * 生成圆角方环路径：外圈顺时针 + 内圈（同向即可，填充用 evenodd）。
 * @param cx 中心 x
 * @param cy 中心 y
 * @param outer 外圈边长
 * @param inner 内圈边长
 * @param radius 外圈圆角半径
 * @returns SVG path 数据
 */
function roundedRingPath(cx: number, cy: number, outer: number, inner: number, radius: number): string {
    const outerRadius = radius
    const innerRadius = Math.max(0, radius - (outer - inner) / 2)
    return (
        roundedRectPath(cx - outer / 2, cy - outer / 2, outer, outer, outerRadius) +
        roundedRectPath(cx - inner / 2, cy - inner / 2, inner, inner, innerRadius)
    )
}

/**
 * 构建二维码的美化轮廓。
 * @param qr 二维码矩阵
 * @param options 轮廓样式选项
 * @returns 数据模块轮廓与功能图形轮廓
 */
export function buildQrCodeShapes(qr: QrCodeData, options: QrShapeOptions = {}): QrShapes {
    // 外扩量与圆角都要卡在上限内：外扩过半会让浅色模块的采样中心被糊住，
    // 圆角过半则形状自相交。宁可牺牲一点观感，也不能让二维码扫不出来。
    const moduleRadius = Math.min(0.5, Math.max(0, options.moduleRadius ?? 0.42))
    const merge = Math.min(0.49, Math.max(0, options.merge ?? 0.32))
    const finderRadius = options.finderRadius ?? 2
    const alignmentRadius = options.alignmentRadius ?? 1.4
    const { size, modules } = qr

    /** 读取模块深浅（越界按浅色处理） */
    const isDark = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < size && y < size && modules[y][x]

    // 定位图形（7×7 与其外的 1 模块分隔符）与校正图形（5×5）由功能图形轮廓单独绘制
    const isStyledCell = (x: number, y: number): boolean => {
        for (const origin of qr.finderOrigins) {
            if (x >= origin.x && x < origin.x + 7 && y >= origin.y && y < origin.y + 7) {
                return true
            }
        }
        for (const center of qr.alignmentCenters) {
            if (Math.abs(x - center.x) <= 2 && Math.abs(y - center.y) <= 2) {
                return true
            }
        }
        return false
    }

    const moduleParts: string[] = []
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!isDark(x, y) || isStyledCell(x, y)) {
                continue
            }

            const left = isDark(x - 1, y) ? merge : 0
            const right = isDark(x + 1, y) ? merge : 0
            const up = isDark(x, y - 1) ? merge : 0
            const down = isDark(x, y + 1) ? merge : 0
            moduleParts.push(roundedRectPath(x - left, y - up, 1 + left + right, 1 + up + down, moduleRadius))
        }
    }

    const ringParts: string[] = []
    for (const origin of qr.finderOrigins) {
        // 7×7 圆角方环（中间 5×5 挖空）
        ringParts.push(roundedRingPath(origin.x + 3.5, origin.y + 3.5, 7, 5, finderRadius))
        // 3×3 实心圆角方芯
        ringParts.push(roundedRectPath(origin.x + 2, origin.y + 2, 3, 3, finderRadius - 1))
    }
    for (const center of qr.alignmentCenters) {
        ringParts.push(roundedRingPath(center.x + 0.5, center.y + 0.5, 5, 3, alignmentRadius))
        ringParts.push(roundedRectPath(center.x, center.y, 1, 1, moduleRadius))
    }

    return {
        modules: moduleParts.join(""),
        rings: ringParts.join(""),
    }
}
