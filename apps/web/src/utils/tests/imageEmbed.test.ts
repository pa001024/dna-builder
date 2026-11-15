import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const encodeMock = vi.hoisted(() => vi.fn(async (_image: ImageData, _options?: { quality: number }) => new ArrayBuffer(0)))

vi.mock("@jsquash/webp/encode", () => ({ default: encodeMock }))

import { embedImageFile, findImageFile, fitImageBox, formatByteSize, isAnimatedPng, MAX_EMBED_BYTES } from "@/utils/imageEmbed"
import { decodeImageBytes } from "@/utils/imagePack"

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const IEND_CRC = [0xae, 0x42, 0x60, 0x82]

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
    let offset = 0
    for (const part of parts) {
        output.set(part, offset)
        offset += part.length
    }
    return output
}

function pngChunk(type: string, data: Uint8Array = new Uint8Array(), crc = [0, 0, 0, 0]): Uint8Array {
    const output = new Uint8Array(12 + data.length)
    const length = data.length
    output[0] = (length >>> 24) & 0xff
    output[1] = (length >>> 16) & 0xff
    output[2] = (length >>> 8) & 0xff
    output[3] = length & 0xff
    for (let index = 0; index < 4; index++) output[4 + index] = type.charCodeAt(index)
    output.set(data, 8)
    output.set(crc, 8 + data.length)
    return output
}

/** 构造结构合法的 PNG：IHDR 让魔数检测命中，IEND CRC 与 imagePack 的固定后缀一致 */
function buildPng(idatBytes = 64, animated = false, width = 0, height = 0): Uint8Array {
    const ihdr = new Uint8Array(13)
    const view = new DataView(ihdr.buffer)
    view.setUint32(0, width)
    view.setUint32(4, height)
    ihdr.set([8, 6, 0, 0, 0], 8)
    const chunks = [pngChunk("IHDR", ihdr)]
    if (animated) chunks.push(pngChunk("acTL", new Uint8Array(8)))
    chunks.push(pngChunk("IDAT", new Uint8Array(idatBytes).fill(7)))
    chunks.push(pngChunk("IEND", new Uint8Array(), IEND_CRC))
    return concatBytes(PNG_SIGNATURE, ...chunks)
}

function buildJpeg(size = 32): Uint8Array {
    const bytes = new Uint8Array(size)
    bytes.set([0xff, 0xd8], 0)
    bytes.set([0xff, 0xd9], size - 2)
    return bytes
}

function makeFile(bytes: Uint8Array, name: string, type: string): File {
    return new File([new Uint8Array(bytes)], name, { type })
}

class FakeOffscreenCanvas {
    getContext() {
        return {
            drawImage: vi.fn(),
            getImageData: (_x: number, _y: number, width: number, height: number) => ({
                data: new Uint8ClampedArray(width * height * 4),
                width,
                height,
            }),
        }
    }
}

function stubImageBitmap(width = 100, height = 100) {
    const close = vi.fn()
    const mock = vi.fn(async (_blob: Blob, _options?: ImageBitmapOptions) => ({ width, height, close }))
    vi.stubGlobal("createImageBitmap", mock)
    return { close, mock }
}

describe("isAnimatedPng", () => {
    it("detects acTL before IDAT", () => {
        expect(isAnimatedPng(buildPng(64, true))).toBe(true)
        expect(isAnimatedPng(buildPng(64, false))).toBe(false)
    })

    it("treats malformed bytes as static", () => {
        expect(isAnimatedPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
    })
})

describe("fitImageBox", () => {
    it("fits landscape images inside the long-edge limit", () => {
        expect(fitImageBox(1920, 1080, 320)).toEqual({ width: 320, height: 180 })
    })

    it("keeps portrait screenshots upright", () => {
        expect(fitImageBox(1080, 2340, 320)).toEqual({ width: 148, height: 320 })
    })

    it("does not upscale small images", () => {
        expect(fitImageBox(100, 50, 320)).toEqual({ width: 100, height: 50 })
    })

    it("rejects invalid dimensions", () => {
        expect(fitImageBox(0, 100)).toBeNull()
        expect(fitImageBox(100, Number.NaN)).toBeNull()
    })
})

describe("formatByteSize", () => {
    it("formats B / KB / MB", () => {
        expect(formatByteSize(0)).toBe("0 B")
        expect(formatByteSize(1023)).toBe("1023 B")
        expect(formatByteSize(1536)).toBe("1.5 KB")
        expect(formatByteSize(2 * 1024 * 1024)).toBe("2.00 MB")
    })
})

describe("findImageFile", () => {
    it("picks the image by magic when the clipboard MIME is wrong", async () => {
        const text = new File(["hello"], "note.txt", { type: "text/plain" })
        const png = makeFile(buildPng(), "clipboard.png", "image/jpeg")

        expect(await findImageFile([text, png])).toBe(png)
    })

    it("falls back to declared MIME for formats magic does not cover", async () => {
        const avif = new File([new Uint8Array(64)], "clipboard.avif", { type: "image/avif" })

        expect(await findImageFile([avif])).toBe(avif)
    })

    it("returns null when no candidate looks like an image", async () => {
        expect(await findImageFile([new File(["hello"], "note.txt", { type: "text/plain" })])).toBeNull()
    })
})

describe("embedImageFile", () => {
    beforeEach(() => {
        encodeMock.mockReset()
        vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("converts a PNG to WebP when the result is smaller", async () => {
        const { close } = stubImageBitmap()
        const webp = new Uint8Array(60).fill(1)
        encodeMock.mockResolvedValue(webp.buffer)

        const source = buildPng()
        const payload = await embedImageFile(makeFile(source, "shot.png", "image/png"))

        expect(payload.imageMime).toBe("image/webp")
        expect(payload.imageName).toBe("shot.png")
        expect(decodeImageBytes(payload.imageData)).toEqual(webp)
        expect(encodeMock).toHaveBeenCalledTimes(1)
        expect(encodeMock.mock.calls[0][1]).toEqual({ quality: 88 })
        expect(close).toHaveBeenCalled()
    })

    it("decides the format by magic, not the declared MIME", async () => {
        stubImageBitmap()
        encodeMock.mockResolvedValue(new Uint8Array(60).buffer)

        const payload = await embedImageFile(makeFile(buildPng(), "clipboard.png", "image/jpeg"))

        expect(payload.imageMime).toBe("image/webp")
        expect(encodeMock).toHaveBeenCalledTimes(1)
    })

    it("converts a PNG with trailing bytes even though strict container detection misses it", async () => {
        stubImageBitmap()
        encodeMock.mockResolvedValue(new Uint8Array(60).buffer)

        const source = concatBytes(buildPng(), new Uint8Array([1, 2, 3]))
        const payload = await embedImageFile(makeFile(source, "clipboard.png", "image/jpeg"))

        expect(payload.imageMime).toBe("image/webp")
    })

    it("uses magic even when a JPEG claims image/png", async () => {
        const payload = await embedImageFile(makeFile(buildJpeg(), "photo.png", "image/png"))

        expect(payload.imageMime).toBe("image/jpeg")
        expect(encodeMock).not.toHaveBeenCalled()
    })

    it("pre-scales an oversized PNG before decoding pixels", async () => {
        const { mock } = stubImageBitmap(8000, 6000)
        encodeMock.mockResolvedValue(new Uint8Array(60).buffer)

        await embedImageFile(makeFile(buildPng(64, false, 8000, 6000), "big.png", "image/png"))

        const options = mock.mock.calls[0][1]
        expect(options?.resizeWidth).toBe(4096)
        expect(options?.resizeHeight).toBe(3072)
        expect(options?.resizeQuality).toBe("high")
    })

    it("keeps the original PNG when WebP would be larger", async () => {
        stubImageBitmap()
        encodeMock.mockResolvedValue(new Uint8Array(4096).buffer)

        const source = buildPng()
        const payload = await embedImageFile(makeFile(source, "shot.png", "image/png"))

        expect(payload.imageMime).toBe("image/png")
        expect(decodeImageBytes(payload.imageData)).toEqual(source)
    })

    it("accepts a PNG above the embed limit once it compresses under the limit", async () => {
        stubImageBitmap()
        encodeMock.mockResolvedValue(new Uint8Array(1024).buffer)

        const source = buildPng(MAX_EMBED_BYTES + 4096)
        const payload = await embedImageFile(makeFile(source, "huge.png", "image/png"))

        expect(source.length).toBeGreaterThan(MAX_EMBED_BYTES)
        expect(payload.imageMime).toBe("image/webp")
        expect(decodeImageBytes(payload.imageData)).toHaveLength(1024)
    })

    it("rejects a PNG that stays above the limit after every quality step", async () => {
        stubImageBitmap()
        encodeMock.mockImplementation(async () => new Uint8Array(MAX_EMBED_BYTES + 1024).buffer)

        const source = buildPng(MAX_EMBED_BYTES + 4096)
        await expect(embedImageFile(makeFile(source, "huge.png", "image/png"))).rejects.toThrow(/图片过大/)
        expect(encodeMock).toHaveBeenCalledTimes(4)
    })

    it("does not transcode animated PNG", async () => {
        stubImageBitmap()
        const source = buildPng(64, true)
        const payload = await embedImageFile(makeFile(source, "anim.png", "image/png"))

        expect(payload.imageMime).toBe("image/png")
        expect(encodeMock).not.toHaveBeenCalled()
    })

    it("leaves non-PNG images untouched", async () => {
        const source = buildJpeg()
        const payload = await embedImageFile(makeFile(source, "photo.jpg", "image/jpeg"))

        expect(payload.imageMime).toBe("image/jpeg")
        expect(decodeImageBytes(payload.imageData)).toEqual(source)
        expect(encodeMock).not.toHaveBeenCalled()
    })

    it("rejects non-PNG images above the embed limit", async () => {
        const source = buildJpeg(MAX_EMBED_BYTES + 4096)
        await expect(embedImageFile(makeFile(source, "photo.jpg", "image/jpeg"))).rejects.toThrow(/图片过大/)
    })

    it("rejects non-image files", async () => {
        await expect(embedImageFile(new File(["hello"], "note.txt", { type: "text/plain" }))).rejects.toThrow("请选择图片文件")
    })
})
