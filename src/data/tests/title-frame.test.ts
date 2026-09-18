import { describe, expect, it } from "vitest"
import { titleFrameIdToKey, titleFrames } from "@/data/generated/title-frame.generated"
import {
    computeLayerRect,
    contributesToBounds,
    flipBookCellAt,
    flipBookFpsCurve,
    integrateCurve,
    resolveAnimation,
    resolveFlipBook,
    sampleCurve,
    TITLE_FONT_LINE_RATIO,
    type TitleFrameDef,
    type TitleFrameFlipBook,
    type TitleFrameLayer,
    unionBounds,
    wrapTime,
} from "@/data/title-frame"

/**
 * 构造一个最小可用的图层，仅覆盖被测试字段。
 * @param patch 需要覆盖的字段
 * @returns 图层对象
 */
function makeLayer(patch: Partial<TitleFrameLayer>): TitleFrameLayer {
    return {
        key: "layer",
        src: "/imgs/titleframe/fake.webp",
        masks: [],
        textureWidth: 100,
        textureHeight: 100,
        width: 100,
        height: 100,
        alignH: "center",
        alignV: "center",
        padding: [0, 0, 0, 0],
        translation: [0, 0],
        scale: [1, 1],
        shear: [0, 0],
        rotation: 0,
        opacity: 1,
        tint: null,
        blend: "normal",
        ...patch,
    }
}

/**
 * 构造一个最小可用的称号框定义。
 * @param patch 需要覆盖的字段
 * @returns 称号框定义
 */
function makeFrame(patch: Partial<TitleFrameDef>): TitleFrameDef {
    return {
        key: "test",
        ids: [],
        width: 200,
        height: 40,
        bounds: { x: 0, y: 0, width: 200, height: 40 },
        text: null,
        layers: [],
        animations: {},
        ...patch,
    }
}

describe("sampleCurve", () => {
    it("没有曲线时返回兜底值", () => {
        expect(sampleCurve(undefined, 100, 0.5)).toBe(0.5)
        expect(sampleCurve({ times: [], values: [] }, 100, 0.5)).toBe(0.5)
    })

    it("单点曲线返回该点值", () => {
        expect(sampleCurve({ times: [0], values: [0.25] }, 999, 1)).toBe(0.25)
    })

    it("区间内线性插值", () => {
        const curve = { times: [0, 100], values: [0, 1] }
        expect(sampleCurve(curve, 0, 0)).toBe(0)
        expect(sampleCurve(curve, 50, 0)).toBeCloseTo(0.5)
        expect(sampleCurve(curve, 100, 0)).toBe(1)
    })

    it("超出两端时钳制到端点值", () => {
        const curve = { times: [10, 20], values: [3, 7] }
        expect(sampleCurve(curve, -100, 0)).toBe(3)
        expect(sampleCurve(curve, 999, 0)).toBe(7)
    })

    it("常量插值在区间内保持左值", () => {
        const curve = { times: [0, 100], values: [0, 1], interp: [0, 1] }
        expect(sampleCurve(curve, 99, 0)).toBe(0)
    })

    it("多点曲线按所在区间插值", () => {
        const curve = { times: [0, 100, 200, 300], values: [0, 1, 1, 0] }
        expect(sampleCurve(curve, 150, 0)).toBe(1)
        expect(sampleCurve(curve, 250, 0)).toBeCloseTo(0.5)
    })
})

describe("wrapTime", () => {
    it("按周期折叠", () => {
        expect(wrapTime(0, 1000)).toBe(0)
        expect(wrapTime(1500, 1000)).toBe(500)
        expect(wrapTime(-500, 1000)).toBe(500)
    })

    it("周期非正时返回 0", () => {
        expect(wrapTime(500, 0)).toBe(0)
    })
})

describe("computeLayerRect", () => {
    it("Fill 时被 padding 内缩（负值外扩）", () => {
        const layer = makeLayer({
            alignH: "fill",
            alignV: "fill",
            padding: [-10, -16, -10, -16],
        })
        expect(computeLayerRect(layer, 236, 34)).toEqual({ left: -10, top: -16, width: 256, height: 66 })
    })

    it("Center 时按 padding 偏移并居中", () => {
        const layer = makeLayer({ width: 120, height: 120, padding: [-10, -16, -10, -16] })
        const rect = computeLayerRect(layer, 236, 34)
        expect(rect.width).toBe(120)
        expect(rect.left).toBeCloseTo((236 - 120 - 10 + 10) / 2)
        expect(rect.top).toBeCloseTo((34 - 120 - 16 + 16) / 2)
    })

    it("Right/Bottom 时贴边并扣除 padding", () => {
        const layer = makeLayer({
            width: 64,
            height: 64,
            alignH: "right",
            alignV: "bottom",
            padding: [0, 0, 8, 6],
        })
        expect(computeLayerRect(layer, 200, 100)).toEqual({ left: 128, top: 30, width: 64, height: 64 })
    })

    it("Left/Top 时以 padding 作为起点", () => {
        const layer = makeLayer({ width: 10, height: 10, alignH: "left", alignV: "top", padding: [4, 5, 0, 0] })
        expect(computeLayerRect(layer, 200, 100)).toEqual({ left: 4, top: 5, width: 10, height: 10 })
    })
})

describe("resolveAnimation", () => {
    const frame = makeFrame({
        animations: {
            in: { durationMs: 100, tracks: {} },
            loop: { durationMs: 1000, tracks: {} },
        },
    })

    it("In 区间内播放 In", () => {
        expect(resolveAnimation(frame, 0, true)).toEqual({ animation: frame.animations.in, timeMs: 0 })
        expect(resolveAnimation(frame, 99, true).animation).toBe(frame.animations.in)
    })

    it("In 结束后进入 Loop 并循环", () => {
        expect(resolveAnimation(frame, 100, true)).toEqual({ animation: frame.animations.loop, timeMs: 0 })
        expect(resolveAnimation(frame, 1250, true).timeMs).toBe(150)
    })

    it("不循环时停在 Loop 末尾", () => {
        expect(resolveAnimation(frame, 5000, false)).toEqual({ animation: frame.animations.loop, timeMs: 1000 })
    })

    it("没有 Loop 时回退到 Normal / In", () => {
        const staticFrame = makeFrame({ animations: { in: { durationMs: 100, tracks: {} } } })
        expect(resolveAnimation(staticFrame, 500, true).animation).toBe(staticFrame.animations.in)

        const plainFrame = makeFrame({ animations: {} })
        expect(resolveAnimation(plainFrame, 500, true)).toEqual({ animation: null, timeMs: 0 })
    })
})

describe("可见包围盒", () => {
    const stage = { width: 236, height: 34 }

    it("横向铺满的框面美术参与包围盒", () => {
        expect(contributesToBounds({ x: -10, y: -16, width: 256, height: 66 }, stage)).toBe(true)
        expect(contributesToBounds({ x: -138, y: -47, width: 512, height: 128 }, stage)).toBe(true)
    })

    it("只占一侧的漂浮装饰不参与", () => {
        expect(contributesToBounds({ x: 58, y: -43, width: 120, height: 120 }, stage)).toBe(false)
        expect(contributesToBounds({ x: 172, y: -30, width: 64, height: 64 }, stage)).toBe(false)
    })

    it("放大到整屏的环境辉光不参与", () => {
        expect(contributesToBounds({ x: -394, y: -321, width: 1024, height: 512 }, stage)).toBe(false)
        expect(contributesToBounds({ x: -138, y: -93, width: 512, height: 256 }, stage)).toBe(false)
    })

    it("并集覆盖所有命中矩形", () => {
        const bounds = unionBounds(
            [
                { x: -10, y: -16, width: 256, height: 66 },
                { x: -6, y: -18, width: 248, height: 52 },
                { x: 58, y: -43, width: 120, height: 120 },
            ],
            stage
        )
        expect(bounds).toEqual({ x: -10, y: -18, width: 256, height: 68 })
    })

    it("没有任何命中矩形时退回布局框", () => {
        expect(unionBounds([{ x: 58, y: -43, width: 120, height: 120 }], stage)).toEqual({ x: 0, y: 0, width: 236, height: 34 })
    })
})

describe("材质具名参数", () => {
    /** 材质图层的参数表来自「基础材质默认值 + 材质实例覆写」，这里抽查几个已知取值 */
    const materialLayers = Object.entries(titleFrames).flatMap(([key, frame]) =>
        frame.layers.filter(layer => layer.material).map(layer => ({ key, layer }))
    )

    it("材质图层都带参数表，纯贴图图层不带", () => {
        expect(materialLayers.length).toBeGreaterThan(0)
        for (const { key, layer } of materialLayers) {
            expect(Object.keys(layer.params ?? {}).length, `${key}/${layer.key}`).toBeGreaterThan(0)
        }
        const plain = Object.values(titleFrames).flatMap(frame => frame.layers.filter(layer => !layer.material))
        expect(plain.length).toBeGreaterThan(0)
        for (const layer of plain) {
            expect(Object.keys(layer.params ?? {}).length, layer.key).toBe(0)
        }
    })

    it("基础材质默认值与实例覆写都被合入", () => {
        for (const { key, layer } of materialLayers) {
            const params = layer.params ?? {}
            // 向量参数一律以 [r, g, b, a] 形式输出
            for (const [name, value] of Object.entries(params)) {
                if (typeof value === "number") continue
                expect(value.length, `${key}/${layer.key}.${name}`).toBe(4)
            }
            // 两个 VX 基础材质的 16 个共同标量里必定含这几个
            if (/M_UIBasic|M_BasicVX01/.test(layer.material ?? "")) {
                for (const name of ["Opacity", "FinalPower", "Saturation", "HueShift"]) {
                    expect(params[name], `${key}/${layer.key}.${name}`).toBeTypeOf("number")
                }
            }
        }
    })

    it("HDR 发光层的 MainColor 超过 1", () => {
        const glow = titleFrames["07_2"].layers.find(layer => layer.key === "VX_glow")
        expect(glow, "07_2/VX_glow").toBeTruthy()
        const mainColor = glow?.params?.MainColor as number[] | undefined
        expect(mainColor?.[0]).toBeCloseTo(2, 2)
        expect(mainColor?.[1]).toBeCloseTo(2, 2)
        expect(mainColor?.[2]).toBeCloseTo(0.917, 2)
    })
})

describe("序列帧图集裁剪", () => {
    it("识别 FlipBook 材质并取出分格参数", () => {
        const book = resolveFlipBook(
            makeLayer({
                key: "eye_1",
                material: "EM/Content/UI/WBP/Common/VX/UIVX/Material/MM/M_FlipBook.0",
                params: { row: 4, column: 4, FPS: 1, Flip: -1 },
            })
        )
        expect(book).toEqual({ rows: 4, columns: 4, fps: 1, reverse: true })
    })

    it("非序列帧图层不裁剪", () => {
        // 普通材质即使带同名的 row/column 参数也不算序列帧
        expect(resolveFlipBook(makeLayer({ material: "EM/Content/UI/Materials/MM/UIBasic/M_UIBase_02_M2.0" }))).toBeNull()
        // 材质名对但没有分格（1×1）时等价于整张贴图
        expect(resolveFlipBook(makeLayer({ material: ".../M_FlipBook.0", params: { row: 1, column: 1, FPS: 1 } }))).toBeNull()
        // 没有材质就是纯贴图图层
        expect(resolveFlipBook(makeLayer({}))).toBeNull()
    })

    it("按 FPS 推进格数并循环", () => {
        const book = { rows: 2, columns: 2, fps: 1, reverse: false }
        // 第 0 秒在第 0 格，每秒推进一格，走完 4 格后回到起点
        expect(flipBookCellAt(book, 0)).toEqual({ row: 0, column: 0 })
        expect(flipBookCellAt(book, 999)).toEqual({ row: 0, column: 0 })
        expect(flipBookCellAt(book, 1000)).toEqual({ row: 0, column: 1 })
        expect(flipBookCellAt(book, 2000)).toEqual({ row: 1, column: 0 })
        expect(flipBookCellAt(book, 3000)).toEqual({ row: 1, column: 1 })
        expect(flipBookCellAt(book, 4000)).toEqual({ row: 0, column: 0 })
    })

    it("Flip 为负时倒序播放", () => {
        const book = { rows: 4, columns: 4, fps: 1, reverse: true }
        expect(flipBookCellAt(book, 0)).toEqual({ row: 3, column: 3 })
        expect(flipBookCellAt(book, 1000)).toEqual({ row: 3, column: 2 })
        expect(flipBookCellAt(book, 15000)).toEqual({ row: 0, column: 0 })
    })

    it("FPS 快于每秒一格时按倍率跳格", () => {
        const book = { rows: 1, columns: 4, fps: 4, reverse: false }
        expect(flipBookCellAt(book, 0).column).toBe(0)
        expect(flipBookCellAt(book, 250).column).toBe(1)
        expect(flipBookCellAt(book, 500).column).toBe(2)
    })
})

describe("曲线积分", () => {
    it("常量插值按阶跃累加（不留梯形面积）", () => {
        // 0~1s 值 1，之后值 4
        const curve = { times: [0, 1000], values: [1, 4], interp: [0, 0] }
        expect(integrateCurve(curve, 0)).toBeCloseTo(0, 6)
        expect(integrateCurve(curve, 500)).toBeCloseTo(0.5, 6)
        expect(integrateCurve(curve, 1000)).toBeCloseTo(1, 6)
        expect(integrateCurve(curve, 1500)).toBeCloseTo(3, 6)
    })

    it("线性插值按梯形累加", () => {
        const curve = { times: [0, 1000], values: [0, 2], interp: [1, 1] }
        // 0~1s 从 0 升到 2，平均 1 → 面积 1
        expect(integrateCurve(curve, 1000)).toBeCloseTo(1, 6)
        expect(integrateCurve(curve, 500)).toBeCloseTo(0.25, 6)
    })

    it("首个关键帧之前的区间按常量外推", () => {
        const curve = { times: [500], values: [3], interp: [0] }
        expect(integrateCurve(curve, 200)).toBeCloseTo(0.6, 6)
        expect(integrateCurve(curve, 100)).toBeCloseTo(0.3, 6)
    })

    it("空曲线积分为 0", () => {
        expect(integrateCurve(undefined, 1000)).toBe(0)
        expect(integrateCurve({ times: [], values: [], interp: [] }, 1000)).toBe(0)
    })

    it("时间未到起点时积分为负零区间，不产生跳变", () => {
        const curve = { times: [0, 100], values: [5, 5], interp: [0, 0] }
        expect(integrateCurve(curve, -10)).toBe(0)
        expect(integrateCurve(curve, 0)).toBe(0)
    })
})

describe("被动画驱动的序列帧速度", () => {
    /** 灾厄使者 eye_1 的 FPS 曲线：慢放中插两段快放 */
    const fpsCurve = {
        times: [0, 833.333, 1366.667, 3100.217, 3633.55, 4166.883],
        values: [1, 16, 1, 1, 16, 1],
        interp: [0, 0, 0, 0, 0, 0],
    }
    const book: TitleFrameFlipBook = { rows: 4, columns: 4, fps: 1, reverse: true }
    const loopMs = 5300

    it("速度按积分推进：一个循环能走完整张图集", () => {
        // 0.833×1 + 0.533×16 + 1.733×1 + 0.533×16 + 1.667×1 ≈ 21.3 格
        expect(integrateCurve(fpsCurve, loopMs)).toBeCloseTo(21.3, 1)
        const visited = new Set<string>()
        for (let timeMs = 0; timeMs <= loopMs; timeMs += 10) {
            const cell = flipBookCellAt(book, timeMs, fpsCurve)
            visited.add(`${cell.row},${cell.column}`)
        }
        expect(visited.size, "走完 16 格").toBe(16)
    })

    it("静态 FPS 会明显偏慢（旧实现的症状）", () => {
        // 不带曲线时按材质里的静态 FPS=1 推进：一个循环只有 5.3 格，图集都播不完
        const staticCells = (loopMs / 1000) * book.fps
        expect(staticCells).toBeLessThan(6)
        // 同一个时刻两者落到的格子不同（1.5s 时静态还在第 2 格，积分已经走到第 11 格）
        expect(flipBookCellAt(book, 1500)).not.toEqual(flipBookCellAt(book, 1500, fpsCurve))
        const staticVisited = new Set<string>()
        for (let timeMs = 0; timeMs <= loopMs; timeMs += 10) {
            const cell = flipBookCellAt(book, timeMs)
            staticVisited.add(`${cell.row},${cell.column}`)
        }
        expect(staticVisited.size, "静态 FPS 只走到 6 格").toBe(6)
    })

    it("快放段落的瞬时速度等于 FPS", () => {
        // 快放从 833ms 开始：再过 0.1s 应当推进 1.6 格（16 格/秒）
        const before = integrateCurve(fpsCurve, 833.333)
        const after = integrateCurve(fpsCurve, 933.333)
        expect(after - before).toBeCloseTo(1.6, 3)
        // 慢放段 1 格/秒
        expect(integrateCurve(fpsCurve, 2000) - integrateCurve(fpsCurve, 1900)).toBeCloseTo(0.1, 3)
    })

    it("倒序播放时从图集最后一格开始", () => {
        expect(flipBookCellAt(book, 0, fpsCurve)).toEqual({ row: 3, column: 3 })
    })

    it("能从动画轨道里取出 FPS 曲线", () => {
        const animation = {
            durationMs: loopMs,
            tracks: { eye_1: { scalars: { FPS: fpsCurve } }, other: {} },
        }
        expect(flipBookFpsCurve(animation, "eye_1")).toBe(fpsCurve)
        // 没有该图层的轨道 / 轨道里没有 FPS 参数时返回 undefined
        expect(flipBookFpsCurve(animation, "other")).toBeUndefined()
        expect(flipBookFpsCurve(animation, "missing")).toBeUndefined()
        expect(flipBookFpsCurve(null, "eye_1")).toBeUndefined()
    })
})

describe("生成的称号框数据", () => {
    const keys = Object.keys(titleFrames)

    it("至少覆盖一个称号框", () => {
        expect(keys.length).toBeGreaterThan(0)
    })

    it("每个称号框都有正的舞台尺寸与合法图层", () => {
        for (const key of keys) {
            const frame = titleFrames[key]
            expect(frame.width, `${key} 宽度`).toBeGreaterThan(0)
            expect(frame.height, `${key} 高度`).toBeGreaterThan(0)
            expect(frame.key, `${key} key 一致`).toBe(key)
            for (const layer of frame.layers) {
                expect(layer.src, `${key}/${layer.key} 贴图`).toMatch(/^\/imgs\/titleframe\/.+\.webp$/)
                expect(layer.padding.length, `${key}/${layer.key} padding`).toBe(4)
                expect(layer.width, `${key}/${layer.key} 宽`).toBeGreaterThan(0)
                expect(layer.height, `${key}/${layer.key} 高`).toBeGreaterThan(0)
            }
            // 可见包围盒必须包住布局框，否则说明框面美术被裁掉了
            expect(frame.bounds.width, `${key} 包围盒宽`).toBeGreaterThan(0)
            expect(frame.bounds.height, `${key} 包围盒高`).toBeGreaterThan(0)
            expect(frame.bounds.x, `${key} 包围盒左`).toBeLessThanOrEqual(0)
            expect(frame.bounds.y, `${key} 包围盒上`).toBeLessThanOrEqual(0)
            expect(frame.bounds.x + frame.bounds.width, `${key} 包围盒右`).toBeGreaterThanOrEqual(frame.width)
            expect(frame.bounds.y + frame.bounds.height, `${key} 包围盒下`).toBeGreaterThanOrEqual(frame.height)
            // 环境辉光会放大到整屏（宽高都在 15 倍以上），包围盒不该被它们撑爆。
            // 上限定得比单层阈值宽：多个参与层上下错开时并集可以略微超过单层上限。
            expect(frame.bounds.width, `${key} 包围盒宽上限`).toBeLessThanOrEqual(frame.width * 4)
            expect(frame.bounds.height, `${key} 包围盒高上限`).toBeLessThanOrEqual(frame.height * 6)
        }
    })

    it("整框光效层与底图同尺寸", () => {
        // 12_x / 13_x 的 VX_BgGlow 遮罩是整幅底图的剪影（SSS／剑／鹫），必须和底图一样大，
        // 否则光效会飘到框外、右侧只剩一团糊影。游戏数据里这几个控件漏勾了 4K 开关，
        // ImageSize 写的是遮罩的像素尺寸（512×128 = 底图两倍），由导入工具补算一半。
        for (const key of ["12_1", "12_2", "13_1", "13_2"]) {
            const frame = titleFrames[key]
            const glow = frame.layers.find(layer => layer.key === "VX_BgGlow")
            const art = frame.layers.find(layer => layer.key === "bg")
            expect(glow, `${key}/VX_BgGlow`).toBeTruthy()
            expect(art, `${key}/bg`).toBeTruthy()
            expect(glow?.width, `${key}/VX_BgGlow 宽`).toBe(art?.width)
            expect(glow?.height, `${key}/VX_BgGlow 高`).toBe(art?.height)
            // 底图轮廓遮罩挂在光效层上，说明两者本来就是同一幅画
            expect(glow?.masks.length, `${key}/VX_BgGlow 遮罩`).toBeGreaterThan(0)
        }
    })

    it("序列帧图层能与贴图尺寸对齐", () => {
        // 14_1（灾厄使者）右上角的眼睛是一张 4×4 的序列帧图集，渲染端按格裁剪；
        // 参数表缺了 row/column/FPS/Flip 就会重新退化成「整张贴图压进控件」。
        const flipLayers = Object.entries(titleFrames).flatMap(([key, frame]) =>
            frame.layers.filter(layer => resolveFlipBook(layer)).map(layer => ({ key, layer }))
        )
        expect(flipLayers.length).toBeGreaterThan(0)
        for (const { key, layer } of flipLayers) {
            const book = resolveFlipBook(layer)
            expect(book, `${key}/${layer.key}`).toBeTruthy()
            if (!book) continue
            // 图集必须能被格数整除，否则裁出来的格子是错位的
            expect(layer.textureWidth % book.columns, `${key}/${layer.key} 列`).toBe(0)
            expect(layer.textureHeight % book.rows, `${key}/${layer.key} 行`).toBe(0)
        }
        expect(flipLayers.some(entry => entry.key === "14_1" && entry.layer.key === "eye_1")).toBe(true)
    })

    it("序列帧速度由动画里的 FPS 参数驱动", () => {
        // 眼睛的快慢由 Loop 动画的材质参数轨道给出（1 → 16 → 1 → 1 → 16 → 1），
        // 只读材质静态值 FPS=1 会让眼睛慢到一整个循环都播不完。
        const frame = titleFrames["14_1"]
        const curve = flipBookFpsCurve(frame.animations.loop, "eye_1")
        expect(curve, "14_1/eye_1 的 FPS 曲线").toBeTruthy()
        if (!curve) return
        expect(curve.times.length).toBe(curve.values.length)
        expect(Math.max(...curve.values)).toBeGreaterThan(1)
        // 曲线必须落在 Loop 区间内，否则快放段永远不会被采样
        expect(curve.times[curve.times.length - 1]).toBeLessThanOrEqual(frame.animations.loop?.durationMs ?? 0)
    })

    it("文字框高度取字体真实行高，落点由控件决定", () => {
        for (const key of keys) {
            const frame = titleFrames[key]
            const text = frame.text
            if (!text) continue
            // 高度 = 字体 (ascender - descender) × 字号，而不是 1.4 倍行距的近似值：
            // 近似值会多出 2px，文字整体下移，所有称号看起来都偏。
            expect(text.height, `${key} 文字框高`).toBe(Math.ceil(text.fontSize * TITLE_FONT_LINE_RATIO))
            // 文字槽是 HAlign_Fill/VAlign_Center、水平 padding 56/56，竖直方向只有 01 多 1px，
            // 所以盒子中线就落在舞台竖直中线上，渲染端不需要再做任何居中补偿。
            expect(Math.abs(text.y + text.height / 2 - frame.height / 2), `${key} 文字竖直落点`).toBeLessThanOrEqual(1)
        }
    })

    it("ID 映射指向存在的称号框且 ID 与数据自洽", () => {
        for (const [idText, key] of Object.entries(titleFrameIdToKey)) {
            expect(titleFrames[key], `ID ${idText} → ${key}`).toBeTruthy()
            expect(titleFrames[key].ids).toContain(Number(idText))
        }
    })

    it("动画时间轴单调且时长为正", () => {
        for (const key of keys) {
            const frame = titleFrames[key]
            for (const [label, animation] of Object.entries(frame.animations)) {
                if (!animation) continue
                expect(animation.durationMs, `${key}.${label} 时长`).toBeGreaterThan(0)
                for (const [layerKey, track] of Object.entries(animation.tracks)) {
                    const curves = [track.opacity, track.transform?.translateX, track.transform?.scaleX]
                    for (const curve of curves) {
                        if (!curve) continue
                        expect(curve.times.length, `${key}.${label}.${layerKey} 曲线长度`).toBe(curve.values.length)
                        for (let index = 1; index < curve.times.length; index++) {
                            expect(curve.times[index], `${key}.${label}.${layerKey} 时间单调`).toBeGreaterThanOrEqual(
                                curve.times[index - 1]
                            )
                        }
                    }
                }
            }
        }
    })
})
