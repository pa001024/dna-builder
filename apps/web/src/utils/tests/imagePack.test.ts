import { describe, expect, it } from "vitest"
import {
    decodeImageBytes,
    decodeJutf122,
    detectImageFormat,
    encodeImageBytes,
    encodeJutf122,
    imageMimeForFormat,
    restoreImageContainerHeaders,
    stripImageContainerHeaders,
} from "@/utils/imagePack"

/** 确定性伪随机字节，避免测试因随机数据偶发失败 */
function pseudoRandomBytes(length: number, seed = 1): Uint8Array {
    const bytes = new Uint8Array(length)
    let state = seed >>> 0
    for (let index = 0; index < length; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        bytes[index] = state >>> 24
    }
    return bytes
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
    let offset = 0
    for (const part of parts) {
        output.set(part, offset)
        offset += part.length
    }
    return output
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index])
}

describe("JUTF-122", () => {
    it("round-trips every byte length", () => {
        const lengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 31, 32, 33, 64, 127, 128, 255]
        for (const length of lengths) {
            const source = pseudoRandomBytes(length, length + 7)
            expect(bytesEqual(decodeJutf122(encodeJutf122(source)), source), `length=${length}`).toBe(true)
        }
    })

    it("survives a JSON round-trip", () => {
        const source = pseudoRandomBytes(512, 42)
        const parsed = JSON.parse(JSON.stringify(encodeJutf122(source))) as string
        expect(bytesEqual(decodeJutf122(parsed), source)).toBe(true)
    })

    it("emits no JSON escapes and no control characters", () => {
        const encoded = encodeJutf122(pseudoRandomBytes(2048, 9))
        expect(encoded).not.toContain('"')
        expect(encoded).not.toContain("\\")
        for (const char of encoded) {
            const code = char.charCodeAt(0)
            expect(code >= 0x20 && code !== 0x22 && code !== 0x5c).toBe(true)
        }
        expect(JSON.stringify(encoded).length).toBe(encoded.length + 2)
    })

    it("round-trips every single-byte value", () => {
        for (let value = 0; value < 256; value++) {
            const source = new Uint8Array([value])
            expect(bytesEqual(decodeJutf122(encodeJutf122(source)), source), `value=${value}`).toBe(true)
        }
    })
})

describe("image container headers", () => {
    const pngPrefix = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
    const pngSuffix = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])

    function fakePng(body: Uint8Array): Uint8Array {
        return concatBytes(pngPrefix, body, pngSuffix)
    }

    function fakeJpeg(body: Uint8Array): Uint8Array {
        return concatBytes(new Uint8Array([0xff, 0xd8]), body, new Uint8Array([0xff, 0xd9]))
    }

    function fakeGif(body: Uint8Array, version: 0x37 | 0x39 = 0x39): Uint8Array {
        return concatBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38, version, 0x61]), body, new Uint8Array([0x3b]))
    }

    function fakeWebp(body: Uint8Array): Uint8Array {
        const totalSize = 12 + body.length
        const riffSize = totalSize - 8
        const header = new Uint8Array([
            0x52,
            0x49,
            0x46,
            0x46,
            riffSize & 0xff,
            (riffSize >>> 8) & 0xff,
            (riffSize >>> 16) & 0xff,
            (riffSize >>> 24) & 0xff,
            0x57,
            0x45,
            0x42,
            0x50,
        ])
        return concatBytes(header, body)
    }

    it("detects and restores PNG, JPEG, GIF and WebP", () => {
        const body = pseudoRandomBytes(64, 3)
        const cases: Array<{ format: string; input: Uint8Array }> = [
            { format: "png", input: fakePng(body) },
            { format: "jpeg", input: fakeJpeg(body) },
            { format: "gif89a", input: fakeGif(body) },
            { format: "gif87a", input: fakeGif(body, 0x37) },
            { format: "webp", input: fakeWebp(body) },
        ]

        for (const item of cases) {
            expect(detectImageFormat(item.input)).toBe(item.format)
            const { stripped, bytesSaved } = stripImageContainerHeaders(item.input)
            expect(bytesSaved).toBeGreaterThan(0)
            expect(bytesEqual(restoreImageContainerHeaders(stripped), item.input)).toBe(true)
        }
    })

    it("escapes raw payloads whose first byte collides with a container marker", () => {
        const input = new Uint8Array([0xf1, 0x10, 0x20, 0x30])
        const { stripped, format } = stripImageContainerHeaders(input)
        expect(format).toBe("raw")
        expect(stripped[0]).toBe(0xf0)
        expect(bytesEqual(restoreImageContainerHeaders(stripped), input)).toBe(true)
    })

    it("detects SVG without stripping it", () => {
        const input = new TextEncoder().encode(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`)
        expect(detectImageFormat(input)).toBe("svg")
        expect(stripImageContainerHeaders(input).bytesSaved).toBe(0)
        expect(bytesEqual(restoreImageContainerHeaders(input), input)).toBe(true)
    })

    it("embeds and restores a PNG", () => {
        const source = fakePng(pseudoRandomBytes(300, 5))
        const { encoded, format } = encodeImageBytes(source)
        expect(format).toBe("png")
        expect(bytesEqual(decodeImageBytes(encoded), source)).toBe(true)
    })

    it("exposes MIME metadata", () => {
        expect(imageMimeForFormat("png")).toBe("image/png")
        expect(imageMimeForFormat("raw")).toBe("")
    })
})
