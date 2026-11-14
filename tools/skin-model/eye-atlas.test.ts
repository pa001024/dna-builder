import { deflateSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { decodePng, detectEyeAtlas, eyeUvChannelFromParent, pickEyeUvChannel } from "./eye-atlas"

/** 合成一张虹膜图集：巩膜在外，虹膜体在里，角膜缘是虹膜外缘一圈向外的暗环，正中一个暗瞳孔。 */
function irisAtlas(size: number, options: { cx: number; cy: number; radius: number; pupilRadius: number }) {
    const { cx, cy, radius, pupilRadius } = options
    const rgba = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const u = (x + 0.5) / size
            const v = (y + 0.5) / size
            const r = Math.hypot(u - cx, v - cy)
            // 巩膜 0.85、虹膜体 0.70、角膜缘从 0.55 渐变到外缘的 0.10、瞳孔 0.10
            let value = 0.85
            if (r < radius * 0.88) value = 0.7
            else if (r < radius) value = 0.55 - (0.45 * (r - radius * 0.88)) / (radius * 0.12)
            if (r < pupilRadius) value = 0.1
            const byte = Math.round(Math.max(0, Math.min(1, value)) * 255)
            const offset = (y * size + x) * 4
            rgba[offset] = byte
            rgba[offset + 1] = byte
            rgba[offset + 2] = byte
            rgba[offset + 3] = 255
        }
    return rgba
}

/** 把 RGBA 编码成 8 位真彩 PNG（只用 filter 0，够本测试用）。 */
function encodePng(rgba: Uint8Array, size: number): Uint8Array {
    const raw = new Uint8Array(size * (size * 4 + 1))
    for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1)
    const crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        crcTable[n] = c >>> 0
    }
    const crc = (bytes: Uint8Array) => {
        let c = 0xffffffff
        for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8)
        return (c ^ 0xffffffff) >>> 0
    }
    const chunk = (type: string, data: Uint8Array) => {
        const out = new Uint8Array(12 + data.length)
        const view = new DataView(out.buffer)
        view.setUint32(0, data.length)
        out.set(
            [...type].map(c => c.charCodeAt(0)),
            4
        )
        out.set(data, 8)
        view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
        return out
    }
    const header = new Uint8Array(13)
    const headerView = new DataView(header.buffer)
    headerView.setUint32(0, size)
    headerView.setUint32(4, size)
    header[8] = 8
    header[9] = 6
    const parts = [
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", new Uint8Array(deflateSync(raw))),
        chunk("IEND", new Uint8Array(0)),
    ]
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

describe("decodePng", () => {
    it("解出 8 位真彩 PNG 的尺寸与像素", () => {
        const rgba = irisAtlas(32, { cx: 0.5, cy: 0.5, radius: 0.45, pupilRadius: 0.08 })
        const decoded = decodePng(encodePng(rgba, 32))
        expect(decoded?.width).toBe(32)
        expect(decoded?.height).toBe(32)
        expect(decoded?.rgba[0]).toBe(rgba[0])
        expect(decoded?.rgba.length).toBe(32 * 32 * 4)
    })

    it("拒绝非 PNG 数据", () => {
        expect(decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeUndefined()
    })
})

describe("detectEyeAtlas", () => {
    it("量出居中的虹膜圆心与半径", () => {
        const size = 128
        const atlas = detectEyeAtlas(irisAtlas(size, { cx: 0.5, cy: 0.5, radius: 0.45, pupilRadius: 0.09 }), size, size)
        expect(atlas).toBeDefined()
        expect(atlas!.center[0]).toBeCloseTo(0.5, 1)
        expect(atlas!.center[1]).toBeCloseTo(0.5, 1)
        expect(atlas!.radius).toBeCloseTo(0.45, 1)
    })

    it("跟随偏心的虹膜", () => {
        const size = 128
        const atlas = detectEyeAtlas(irisAtlas(size, { cx: 0.56, cy: 0.47, radius: 0.42, pupilRadius: 0.08 }), size, size)
        expect(atlas!.center[0]).toBeCloseTo(0.56, 1)
        expect(atlas!.center[1]).toBeCloseTo(0.47, 1)
        expect(atlas!.radius).toBeCloseTo(0.42, 1)
    })

    it("虹膜偏出图心过多时拒绝，让调用方退回默认值", () => {
        const size = 128
        expect(detectEyeAtlas(irisAtlas(size, { cx: 0.82, cy: 0.5, radius: 0.4, pupilRadius: 0.08 }), size, size)).toBeUndefined()
    })
})

describe("pickEyeUvChannel", () => {
    /** 构造左右眼各铺满一格的 UV1，以及只在巩膜小方块里的 UV0。 */
    function fixture() {
        const position = new Float32Array([-1, 0, 0, -1, 1, 0, 1, 0, 0, 1, 1, 0])
        const uv0 = new Float32Array([0.3, 0.4, 0.38, 0.48, 0.62, 0.4, 0.7, 0.48])
        const uv1 = new Float32Array([0, 0, 1, 1, 1, 0, 2, 1])
        return { position, uv0, uv1 }
    }

    it("UV1 每只眼铺满一格时选 UV1", () => {
        const { position, uv0, uv1 } = fixture()
        expect(pickEyeUvChannel(uv0, uv1, position)).toBe(1)
    })

    it("只有 UV0 铺满时选 UV0", () => {
        const { position } = fixture()
        const uv0 = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1])
        const uv1 = new Float32Array([0.3, 0.4, 0.38, 0.48, 0.62, 0.4, 0.7, 0.48])
        expect(pickEyeUvChannel(uv0, uv1, position)).toBe(0)
    })

    it("没有 UV1 时选 UV0", () => {
        const { position, uv0 } = fixture()
        expect(pickEyeUvChannel(uv0, undefined, position)).toBe(0)
    })
})

describe("eyeUvChannelFromParent", () => {
    it("V14 在 UV1，V10/V11 在 UV0", () => {
        expect(eyeUvChannelFromParent("/Game/.../M_Player_Eye_V14.0")).toBe(1)
        expect(eyeUvChannelFromParent("EM/Content/.../M_Player_Eye_V11.0")).toBe(0)
        expect(eyeUvChannelFromParent("EM/Content/.../M_Player_Eye_V10.0")).toBe(0)
        expect(eyeUvChannelFromParent(undefined)).toBe(0)
    })
})
