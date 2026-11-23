import { describe, expect, it } from "vitest"
import {
    clampWindowRect,
    DEFAULT_FLOATING_HEADER_HEIGHT,
    DEFAULT_FLOATING_MAX_WIDTH,
    DEFAULT_FLOATING_MIN_WIDTH,
    FLOATING_VIEWPORT_MARGIN,
    resolveInitialWindowRect,
    type WindowRect,
} from "@/utils/floating-window"

const VIEWPORT = { width: 1200, height: 800 }

function makeRect(left: number, top: number, width = 400, height = 300): WindowRect {
    return { left, top, width, height }
}

describe("clampWindowRect：视口约束", () => {
    it("视口内的矩形原样返回", () => {
        expect(clampWindowRect(makeRect(100, 100), VIEWPORT)).toEqual(makeRect(100, 100))
    })

    it("负坐标贴住左上角", () => {
        expect(clampWindowRect(makeRect(-50, -20), VIEWPORT)).toEqual(makeRect(0, 0))
    })

    it("越界右下时收回视口内（left / top 各自钳制）", () => {
        const result = clampWindowRect(makeRect(1100, 900), VIEWPORT)
        expect(result).toEqual(makeRect(800, 760))
    })

    it("headerHeight 参与 top 上限，且宽度 / 高度保持不变", () => {
        const result = clampWindowRect(makeRect(100, 900, 400, 300), VIEWPORT, 60)
        expect(result.top).toBe(740)
        expect(result.width).toBe(400)
        expect(result.height).toBe(300)
    })

    it("窗口比视口还宽时贴住左侧，不产生负坐标", () => {
        const result = clampWindowRect(makeRect(200, 100, 1500, 300), VIEWPORT)
        expect(result.left).toBe(0)
        expect(result.width).toBe(1500)
    })

    it("视口比窗口窄时贴住左侧", () => {
        const narrow = clampWindowRect(makeRect(50, 50, 400, 300), { width: 300, height: 200 })
        expect(narrow.left).toBe(0)
    })

    it("视口比 header 还矮时 top 钳制到 0", () => {
        const result = clampWindowRect(makeRect(0, 100, 400, 300), { width: 1200, height: 30 })
        expect(result.top).toBe(0)
    })

    it("headerHeight 为 0 时 top 上限为视口高", () => {
        const result = clampWindowRect(makeRect(0, 9999, 400, 300), VIEWPORT, 0)
        expect(result.top).toBe(VIEWPORT.height)
    })

    it("headerHeight 为负数时按 0 处理", () => {
        const result = clampWindowRect(makeRect(0, 9999, 400, 300), VIEWPORT, -50)
        expect(result.top).toBe(VIEWPORT.height)
    })

    it("headerHeight 为 NaN 时回退兜底值", () => {
        const result = clampWindowRect(makeRect(0, 9999, 400, 300), VIEWPORT, Number.NaN)
        expect(result.top).toBe(VIEWPORT.height - DEFAULT_FLOATING_HEADER_HEIGHT)
    })

    it("0×0 视口下贴住左上角", () => {
        expect(clampWindowRect(makeRect(50, 50), { width: 0, height: 0 })).toEqual(makeRect(0, 0))
    })

    it("不修改传入的矩形对象", () => {
        const input = makeRect(-10, -10)
        clampWindowRect(input, VIEWPORT)
        expect(input).toEqual(makeRect(-10, -10))
    })
})

describe("resolveInitialWindowRect：初始位置与宽度", () => {
    it("无 initial 时水平居中、top 取视口高 20%", () => {
        const result = resolveInitialWindowRect(undefined, VIEWPORT)
        expect(result.width).toBe(DEFAULT_FLOATING_MIN_WIDTH)
        expect(result.left).toBe((VIEWPORT.width - DEFAULT_FLOATING_MIN_WIDTH) / 2)
        expect(result.top).toBe(VIEWPORT.height * 0.2)
        expect(result.height).toBe(0)
    })

    it("null initial 与 undefined 等价", () => {
        expect(resolveInitialWindowRect(null, VIEWPORT)).toEqual(resolveInitialWindowRect(undefined, VIEWPORT))
    })

    it("给定 initial 时沿用 left / top / width / height", () => {
        const initial = makeRect(100, 120, 400, 300)
        expect(resolveInitialWindowRect(initial, VIEWPORT)).toEqual(initial)
    })

    it("initial 负坐标被钳制到左上角", () => {
        const result = resolveInitialWindowRect(makeRect(-120, -80, 400, 300), VIEWPORT)
        expect(result.left).toBe(0)
        expect(result.top).toBe(0)
    })

    it("initial 越界右下时收回视口内", () => {
        const result = resolveInitialWindowRect(makeRect(2000, 2000, 400, 300), VIEWPORT)
        expect(result.left).toBe(800)
        expect(result.top).toBe(760)
    })

    it("宽度受 minWidth / maxWidth 约束", () => {
        expect(resolveInitialWindowRect(makeRect(0, 0, 100, 0), VIEWPORT).width).toBe(DEFAULT_FLOATING_MIN_WIDTH)
        expect(resolveInitialWindowRect(makeRect(0, 0, 900, 0), VIEWPORT).width).toBe(DEFAULT_FLOATING_MAX_WIDTH)
        expect(resolveInitialWindowRect(makeRect(0, 0, 900, 0), VIEWPORT, { maxWidth: 640 }).width).toBe(640)
        expect(resolveInitialWindowRect(makeRect(0, 0, 100, 0), VIEWPORT, { minWidth: 400 }).width).toBe(400)
    })

    it("缺省宽度取 minWidth，initial 缺字段时逐项回退", () => {
        const result = resolveInitialWindowRect({ left: 50, top: 60 }, VIEWPORT)
        expect(result.left).toBe(50)
        expect(result.top).toBe(60)
        expect(result.width).toBe(DEFAULT_FLOATING_MIN_WIDTH)
        expect(result.height).toBe(0)
    })

    it("视口比 minWidth 还窄时宽度退化为视口宽 - 16", () => {
        const result = resolveInitialWindowRect(null, { width: 300, height: 800 })
        expect(result.width).toBe(300 - FLOATING_VIEWPORT_MARGIN)
        expect(result.left).toBe(FLOATING_VIEWPORT_MARGIN / 2)
    })

    it("极窄视口下宽度不为负", () => {
        const result = resolveInitialWindowRect(null, { width: 10, height: 10 })
        expect(result.width).toBe(0)
        expect(result.left).toBe(5)
        expect(result.top).toBe(0)
    })

    it("custom headerHeight 参与 top 钳制", () => {
        const result = resolveInitialWindowRect(makeRect(0, 2000, 400, 300), VIEWPORT, { headerHeight: 60 })
        expect(result.top).toBe(VIEWPORT.height - 60)
    })

    it("宽度上限同时受 maxWidth 与视口宽 - 16 限制", () => {
        const wide = resolveInitialWindowRect(makeRect(0, 0, 900, 0), { width: 500, height: 800 })
        expect(wide.width).toBe(500 - FLOATING_VIEWPORT_MARGIN)
    })

    it("仅给 left 时保留 left、top 取视口高 20%", () => {
        const result = resolveInitialWindowRect({ left: 50 }, VIEWPORT)
        expect(result.left).toBe(50)
        expect(result.top).toBe(VIEWPORT.height * 0.2)
    })

    it("仅给 top 时保留 top、left 水平居中", () => {
        const result = resolveInitialWindowRect({ top: 60 }, VIEWPORT)
        expect(result.top).toBe(60)
        expect(result.left).toBe((VIEWPORT.width - DEFAULT_FLOATING_MIN_WIDTH) / 2)
    })

    it("NaN / Infinity 字段按缺省处理", () => {
        const result = resolveInitialWindowRect(
            { left: Number.NaN, top: Number.POSITIVE_INFINITY, width: Number.NaN, height: Number.NEGATIVE_INFINITY },
            VIEWPORT
        )
        expect(result.left).toBe((VIEWPORT.width - DEFAULT_FLOATING_MIN_WIDTH) / 2)
        expect(result.top).toBe(VIEWPORT.height * 0.2)
        expect(result.width).toBe(DEFAULT_FLOATING_MIN_WIDTH)
        expect(result.height).toBe(0)
    })

    it("minWidth > maxWidth 时以 maxWidth 为准", () => {
        const result = resolveInitialWindowRect(makeRect(0, 0, 400, 0), VIEWPORT, { minWidth: 600, maxWidth: 400 })
        expect(result.width).toBe(400)
    })

    it("负的 minWidth / maxWidth 视为 0", () => {
        const result = resolveInitialWindowRect(null, VIEWPORT, { minWidth: -100, maxWidth: -50 })
        expect(result.width).toBe(0)
    })

    it("0×0 视口下居中位置贴住左上角", () => {
        const result = resolveInitialWindowRect(null, { width: 0, height: 0 })
        expect(result).toEqual({ left: 0, top: 0, width: 0, height: 0 })
    })

    it("headerHeight >= 视口高时 top 钳制到 0", () => {
        const equal = resolveInitialWindowRect(makeRect(0, 500, 400, 300), { width: 1200, height: 40 }, { headerHeight: 40 })
        expect(equal.top).toBe(0)
        const over = resolveInitialWindowRect(makeRect(0, 500, 400, 300), { width: 1200, height: 40 }, { headerHeight: 200 })
        expect(over.top).toBe(0)
    })

    it("initial.width 恰等 maxWidth / 视口宽 - 16 时不缩放", () => {
        expect(resolveInitialWindowRect(makeRect(0, 0, DEFAULT_FLOATING_MAX_WIDTH, 0), VIEWPORT).width).toBe(DEFAULT_FLOATING_MAX_WIDTH)
        expect(resolveInitialWindowRect(makeRect(0, 0, 500 - FLOATING_VIEWPORT_MARGIN, 0), { width: 500, height: 800 }).width).toBe(
            500 - FLOATING_VIEWPORT_MARGIN
        )
    })

    it("不修改传入的 initial 对象", () => {
        const initial = makeRect(-120, 2000, 900, 300)
        const snapshot = { ...initial }
        resolveInitialWindowRect(initial, VIEWPORT)
        expect(initial).toEqual(snapshot)
    })
})
