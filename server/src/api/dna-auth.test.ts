import { describe, expect, it } from "bun:test"
import { encodeCodeToImage, decodeCodeFromImage } from "../api/dna-auth"

describe("隐写技术测试", () => {
    it("应该能够编码和解码基本验证码", async () => {
        const testCode = "TEST1234ABCD"
        const imageBuffer = await encodeCodeToImage(testCode)
        const decodedCode = await decodeCodeFromImage(imageBuffer)

        expect(decodedCode).toBe(testCode)
    })

    it("应该能够处理长验证码", async () => {
        const longCode = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        const imageBuffer = await encodeCodeToImage(longCode)
        const decodedCode = await decodeCodeFromImage(imageBuffer)

        expect(decodedCode).toBe(longCode)
    })

    it("应该能够处理包含数字和字母的混合验证码", async () => {
        const mixedCode = "A1B2C3D4E5F6"
        const imageBuffer = await encodeCodeToImage(mixedCode)
        const decodedCode = await decodeCodeFromImage(imageBuffer)

        expect(decodedCode).toBe(mixedCode)
    })

    it("生成的 PNG 图片应该是有效的", async () => {
        const testCode = "TESTCODE123"
        const imageBuffer = await encodeCodeToImage(testCode)

        expect(imageBuffer.length).toBeGreaterThan(0)
        expect(imageBuffer[0]).toBe(0x89)
        expect(imageBuffer[1]).toBe(0x50)
        expect(imageBuffer[2]).toBe(0x4e)
        expect(imageBuffer[3]).toBe(0x47)
    })

    it("生成的 JPG 图片应该是有效的", async () => {
        const testCode = "TESTCODE123"
        const imageBuffer = await encodeCodeToImage(testCode, "image/jpeg")

        expect(imageBuffer.length).toBeGreaterThan(0)
        expect(imageBuffer[0]).toBe(0xff)
        expect(imageBuffer[1]).toBe(0xd8)
        expect(imageBuffer[2]).toBe(0xff)
        expect(imageBuffer[3]).toBe(0xe0)
    })

    it("JPG 转换后应该无法正确解码（预期行为）", async () => {
        const testCode = "JPEGTEST123"

        const jpgBuffer = await encodeCodeToImage(testCode, "image/jpeg")

        const decodedCode = await decodeCodeFromImage(jpgBuffer)

        expect(decodedCode).not.toBe(testCode)
        expect(decodedCode).toBeNull()
    })

    it("应该能够解码损坏或无效的图片", async () => {
        const invalidBuffer = Buffer.from("invalid image data")
        const decodedCode = await decodeCodeFromImage(invalidBuffer)

        expect(decodedCode).toBeNull()
    })

    it("解码不匹配的验证码应该返回 null", async () => {
        const testCode = "ORIGINAL123"
        const imageBuffer = await encodeCodeToImage(testCode)

        const anotherCode = "DIFFERENT456"
        const decodedCode = await decodeCodeFromImage(imageBuffer)

        expect(decodedCode).toBe(testCode)
        expect(decodedCode).not.toBe(anotherCode)
    })

    it("多个编码解码操作应该独立工作", async () => {
        const code1 = "CODE1"
        const code2 = "CODE2"
        const code3 = "CODE3"

        const buffer1 = await encodeCodeToImage(code1)
        const buffer2 = await encodeCodeToImage(code2)
        const buffer3 = await encodeCodeToImage(code3)

        const decoded1 = await decodeCodeFromImage(buffer1)
        const decoded2 = await decodeCodeFromImage(buffer2)
        const decoded3 = await decodeCodeFromImage(buffer3)

        expect(decoded1).toBe(code1)
        expect(decoded2).toBe(code2)
        expect(decoded3).toBe(code3)
    })

    it("重复编码相同验证码应该产生相同的解码结果", async () => {
        const testCode = "REPEATED123"

        const buffer1 = await encodeCodeToImage(testCode)
        const buffer2 = await encodeCodeToImage(testCode)

        const decoded1 = await decodeCodeFromImage(buffer1)
        const decoded2 = await decodeCodeFromImage(buffer2)

        expect(decoded1).toBe(testCode)
        expect(decoded2).toBe(testCode)
        expect(decoded1).toBe(decoded2)
    })
})
