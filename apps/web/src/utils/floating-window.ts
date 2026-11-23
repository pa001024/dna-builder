/**
 * 浮动窗口的纯几何工具：视口约束与初始位置计算。
 * 不访问 DOM，供 `FloatingWindow.vue` 与任意宿主复用，也便于单测。
 */

export interface WindowRect {
    left: number
    top: number
    width: number
    height: number
}

export interface FloatingViewport {
    width: number
    height: number
}

export interface ResolveInitialWindowRectOptions {
    minWidth?: number
    maxWidth?: number
    headerHeight?: number
}

/** header 高度兜底值（px）：DOM 测量失败时仍保证标题栏留在视口内。 */
export const DEFAULT_FLOATING_HEADER_HEIGHT = 40

export const DEFAULT_FLOATING_MIN_WIDTH = 320

export const DEFAULT_FLOATING_MAX_WIDTH = 560

/** 窗口与视口右 / 下边缘的最小留白（px）。 */
export const FLOATING_VIEWPORT_MARGIN = 16

/**
 * 把窗口钳制在视口内：left ∈ [0, width - rect.width]，top ∈ [0, height - headerHeight]。
 * 窗口比视口还宽 / 高时贴住左上角，不产生负坐标；headerHeight 为负或非有限值时按 0 / 兜底值处理。
 * @param rect 窗口矩形
 * @param viewport 视口尺寸
 * @param headerHeight header 高度（px），保证标题栏始终可见
 * @returns 钳制后的新矩形（宽度 / 高度不变）
 */
export function clampWindowRect(rect: WindowRect, viewport: FloatingViewport, headerHeight = DEFAULT_FLOATING_HEADER_HEIGHT): WindowRect {
    const safeHeader = Number.isFinite(headerHeight) ? Math.max(headerHeight, 0) : DEFAULT_FLOATING_HEADER_HEIGHT
    const maxLeft = Math.max(viewport.width - rect.width, 0)
    const maxTop = Math.max(viewport.height - safeHeader, 0)
    return {
        ...rect,
        left: Math.min(Math.max(rect.left, 0), maxLeft),
        top: Math.min(Math.max(rect.top, 0), maxTop),
    }
}

/**
 * 计算窗口初始矩形：left / top 逐字段沿用（缺省时分别为水平居中、视口高 20%），最后统一钳制。
 * 宽度限制在 [minWidth, min(maxWidth, 视口宽 - 16)]；视口比 minWidth 还窄时退化为视口宽 - 16（不为负）。
 * 缺省宽度取 minWidth，缺省高度为 0（由组件按内容自适应）；非有限字段按缺省处理。
 * @param initial 宿主给的初始矩形（字段可缺省）
 * @param viewport 视口尺寸
 * @param options 宽度与 header 高度约束
 * @returns 初始矩形
 */
export function resolveInitialWindowRect(
    initial: Partial<WindowRect> | null | undefined,
    viewport: FloatingViewport,
    options: ResolveInitialWindowRectOptions = {}
): WindowRect {
    const minWidth = Math.max(options.minWidth ?? DEFAULT_FLOATING_MIN_WIDTH, 0)
    const maxWidth = Math.max(options.maxWidth ?? DEFAULT_FLOATING_MAX_WIDTH, 0)
    const headerHeight = options.headerHeight ?? DEFAULT_FLOATING_HEADER_HEIGHT

    const availableWidth = Math.max(viewport.width - FLOATING_VIEWPORT_MARGIN, 0)
    const widthLimit = Math.min(maxWidth, availableWidth)
    const widthFloor = Math.min(minWidth, widthLimit)
    const initialWidth = initial?.width
    const requestedWidth = typeof initialWidth === "number" && Number.isFinite(initialWidth) ? initialWidth : widthFloor
    const width = Math.min(Math.max(requestedWidth, widthFloor), widthLimit)

    let left = (viewport.width - width) / 2
    let top = viewport.height * 0.2
    const initialLeft = initial?.left
    if (typeof initialLeft === "number" && Number.isFinite(initialLeft)) left = initialLeft
    const initialTop = initial?.top
    if (typeof initialTop === "number" && Number.isFinite(initialTop)) top = initialTop

    const initialHeight = initial?.height
    const height = typeof initialHeight === "number" && Number.isFinite(initialHeight) ? initialHeight : 0
    return clampWindowRect({ left, top, width, height }, viewport, headerHeight)
}
