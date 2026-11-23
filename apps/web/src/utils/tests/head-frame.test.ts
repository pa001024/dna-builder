import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { headFrameIdToKey, headFrames } from "../head-frame/head-frame.generated"
import { headFramePulse, headFrameUv } from "../head-frame/head-frame-material"
import { computeLayerRect, resolveAnimation } from "../title-frame/title-frame"

describe("动态头像框", () => {
    it("10054 方形发光框的负边距向四周扩张，不改变中心", () => {
        const frame = headFrames[headFrameIdToKey[10054]]
        const glow = frame.layers.find(layer => layer.key === "VX_BgGlow02")!
        const border = frame.layers.find(layer => layer.key === "BG_Frame_1")!
        const glowRect = computeLayerRect(glow, frame.width, frame.height)
        const borderRect = computeLayerRect(border, frame.width, frame.height)
        expect(glowRect.width).toBeCloseTo(borderRect.width + 22.857143 + 22.857141, 5)
        expect(glowRect.height).toBeCloseTo(borderRect.height + 23.428572 + 24.285713, 5)
        expect(glowRect.left + glowRect.width / 2).toBeCloseTo(borderRect.left + borderRect.width / 2, 5)
        expect(glowRect.top + glowRect.height / 2).toBeCloseTo(borderRect.top + borderRect.height / 2 + 0.4285705, 5)
    })

    it("10054 从 DynamicPath 映射到 03，保留控件图层与自动循环", () => {
        expect(headFrameIdToKey[10054]).toBe("03")
        const frame = headFrames[headFrameIdToKey[10054]]
        expect(frame.ids).toContain(10054)
        expect(frame.width).toBeGreaterThan(0)
        expect(frame.height).toBeGreaterThan(0)
        expect(frame.layers.length).toBeGreaterThan(1)
        expect(frame.text).toBeNull()
        expect(frame.animations.loop?.durationMs).toBeGreaterThan(0)
        expect(resolveAnimation(frame, 500, true).timeMs).toBe(500)
    })

    it("无控件轨道的 Auto_Loop 仍通过材质时间参数产生变化", () => {
        const frame = headFrames[headFrameIdToKey[10054]]
        const layers = frame.layers.filter(layer => typeof layer.params?.SinSpeed === "number")
        expect(layers.length).toBeGreaterThan(0)
        expect(layers.some(layer => headFramePulse(layer, 0) !== headFramePulse(layer, 500))).toBe(true)
        expect(frame.layers.some(layer => headFrameUv(layer, "Mask2", 0).position !== headFrameUv(layer, "Mask2", 500).position)).toBe(true)
    })

    it("静态头像框与未知 ID 不映射到其他动态框", () => {
        expect(headFrameIdToKey[10055]).toBeUndefined()
        expect(headFrameIdToKey[99999]).toBeUndefined()
    })

    it("所有映射、主贴图与具名材质贴图都存在", () => {
        const publicDir = path.resolve(import.meta.dirname, "../../../public")
        for (const [id, key] of Object.entries(headFrameIdToKey)) expect(headFrames[key].ids).toContain(Number(id))
        for (const frame of Object.values(headFrames)) {
            for (const layer of frame.layers) {
                for (const src of [layer.src, ...layer.masks, ...Object.values(layer.textures ?? {})]) {
                    expect(src.startsWith("/imgs/headframe/dynamic/")).toBe(true)
                    expect(fs.existsSync(path.join(publicDir, src)), src).toBe(true)
                }
            }
        }
    })
})
