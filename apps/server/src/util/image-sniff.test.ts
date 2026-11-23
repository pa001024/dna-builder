import { describe, expect, it } from "bun:test"
import sharp from "sharp"
import { reencodeImage, sniffImage, validateImageAsset } from "./image-sniff"

/**
 * @description 用 sharp 生成指定格式的真实图片字节。
 */
function createImage(format: "png" | "jpeg" | "webp", width = 8, height = 8): Promise<Buffer> {
    return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .toFormat(format)
        .toBuffer()
}

/** PNG 文件头 */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * @description 构造只含文件头的容器字节（魔数识别用）。
 */
function magicOnly(magic: Buffer, padding = 16): Buffer {
    return Buffer.concat([magic, Buffer.alloc(padding)])
}

describe("sniffImage", () => {
    it("识别 PNG/JPEG/GIF/WebP/AVIF 魔数", () => {
        expect(sniffImage(PNG_MAGIC)).toEqual({ mime: "image/png", ok: true })
        expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: "image/jpeg", ok: true })
        expect(sniffImage(magicOnly(Buffer.from("GIF89a")))).toEqual({ mime: "image/gif", ok: true })
        expect(sniffImage(magicOnly(Buffer.from("RIFF\x00\x00\x00\x00WEBP")))).toEqual({ mime: "image/webp", ok: true })
        expect(sniffImage(magicOnly(Buffer.from("\x00\x00\x00\x1cftypavif")))).toEqual({ mime: "image/avif", ok: true })
        expect(sniffImage(magicOnly(Buffer.from("\x00\x00\x00\x1cftypavis")))).toEqual({ mime: "image/avif", ok: true })
        expect(sniffImage(magicOnly(Buffer.from("\x00\x00\x00\x1cftypheic")))).toEqual({ mime: "image/heic", ok: true })
        expect(sniffImage(magicOnly(Buffer.from("\x00\x00\x00\x1cftypmif1")))).toEqual({ mime: "image/heic", ok: true })
    })

    it("空内容与任意字节不识别", () => {
        expect(sniffImage(new Uint8Array())).toEqual({ mime: null, ok: false })
        expect(sniffImage(Buffer.from("hello world"))).toEqual({ mime: null, ok: false })
        // RIFF 但内容不是 WEBP
        expect(sniffImage(magicOnly(Buffer.from("RIFF\x00\x00\x00\x00WAVE")))).toEqual({ mime: null, ok: false })
    })
})

describe("validateImageAsset", () => {
    it("接受 PNG/JPEG/WebP 并返回真实尺寸", async () => {
        const png = await createImage("png", 12, 7)
        expect(await validateImageAsset(png)).toEqual({ ok: true, mime: "image/png", width: 12, height: 7 })

        const jpeg = await createImage("jpeg")
        expect((await validateImageAsset(jpeg)).mime).toBe("image/jpeg")

        const webp = await createImage("webp")
        expect((await validateImageAsset(webp)).mime).toBe("image/webp")
    })

    it("声明 MIME 与魔数不一致时拒绝", async () => {
        const png = await createImage("png")
        const result = await validateImageAsset(png, { declaredMime: "image/jpeg" })
        expect(result.ok).toBe(false)
        expect(result.error).toContain("不一致")
    })

    it("伪造文件头（魔数正确但无法解码）时拒绝", async () => {
        const fake = magicOnly(PNG_MAGIC, 32)
        const result = await validateImageAsset(fake)
        expect(result.ok).toBe(false)
        expect(result.error).toContain("解码")
    })

    it("超过像素预算时拒绝并给出当前尺寸", async () => {
        const png = await createImage("png", 32, 32)
        const result = await validateImageAsset(png, { maxPixels: 100 })
        expect(result.ok).toBe(false)
        expect(result.error).toContain("32×32")
    })

    it("超过字节预算时拒绝", async () => {
        const png = await createImage("png")
        const result = await validateImageAsset(png, { maxBytes: 16 })
        expect(result.ok).toBe(false)
        expect(result.error).toContain("不得超过")
    })

    it("GIF/AVIF/HEIC 一期要求转换，不作为上传格式", async () => {
        expect((await validateImageAsset(magicOnly(Buffer.from("GIF89a")))).error).toContain("不支持")
        expect((await validateImageAsset(magicOnly(Buffer.from("\x00\x00\x00\x1cftypavif")))).error).toContain("不支持")
        expect((await validateImageAsset(magicOnly(Buffer.from("\x00\x00\x00\x1cftypheic")))).error).toContain("不支持")
    })

    it("空内容拒绝", async () => {
        expect((await validateImageAsset(new Uint8Array())).error).toContain("为空")
    })
})

describe("reencodeImage", () => {
    it("剥离 EXIF 并输出 WebP", async () => {
        const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } } })
            .jpeg()
            .withExif({ IFD0: { Copyright: "secret-location" } })
            .toBuffer()
        expect((await sharp(jpeg).metadata()).exif).toBeDefined()

        const output = await reencodeImage(jpeg)
        const metadata = await sharp(output).metadata()
        expect(metadata.format).toBe("webp")
        expect(metadata.exif).toBeUndefined()
    })

    it("按像素预算等比缩放", async () => {
        const png = await createImage("png", 100, 50)
        const output = await reencodeImage(png, 1000)
        const metadata = await sharp(output).metadata()
        const width = metadata.width ?? 0
        const height = metadata.height ?? 0

        expect(width * height).toBeLessThanOrEqual(1000)
        expect(width / height).toBeCloseTo(2, 1)
    })

    it("可显式输出 PNG", async () => {
        const jpeg = await createImage("jpeg", 10, 10)
        const output = await reencodeImage(jpeg, 1_000_000, { format: "png" })
        expect((await sharp(output).metadata()).format).toBe("png")
    })
})
