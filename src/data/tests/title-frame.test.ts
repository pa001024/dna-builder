import { describe, expect, it } from "vitest"
import { titleFrameIdToKey, titleFrames } from "@/data/generated/title-frame.generated"
import {
    computeLayerRect,
    contributesToBounds,
    resolveAnimation,
    sampleCurve,
    type TitleFrameDef,
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
