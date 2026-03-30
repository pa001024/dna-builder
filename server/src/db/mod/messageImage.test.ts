import { describe, expect, it } from "bun:test"
import { appendOssAutoFormat, estimateDataUrlBytes, processMessageImageContent } from "./messageImage"

/**
 * @description 生成指定字节大小的 Data URL，便于测试消息图片处理逻辑。
 * @param bytes 目标二进制字节数。
 * @returns 可用于 `<img src>` 的 Data URL。
 */
function buildDataUrl(bytes: number): string {
    const base64 = Buffer.alloc(bytes, 1).toString("base64")
    return `data:image/png;base64,${base64}`
}

describe("messageImage", () => {
    describe("appendOssAutoFormat", () => {
        it("应该在无查询参数时追加 x-oss-process", () => {
            const url = appendOssAutoFormat("https://cdn.example.com/img/a.png")
            expect(url).toBe("https://cdn.example.com/img/a.png?x-oss-process=image/format,auto")
        })

        it("应该在已有查询参数时追加 x-oss-process", () => {
            const url = appendOssAutoFormat("https://cdn.example.com/img/a.png?v=1")
            expect(url).toBe("https://cdn.example.com/img/a.png?v=1&x-oss-process=image/format,auto")
        })

        it("应该避免重复追加 x-oss-process", () => {
            const url = appendOssAutoFormat("https://cdn.example.com/img/a.png?x-oss-process=image/format,auto")
            expect(url).toBe("https://cdn.example.com/img/a.png?x-oss-process=image/format,auto")
        })
    })

    describe("estimateDataUrlBytes", () => {
        it("应该正确估算 Data URL 的字节数", () => {
            const dataUrl = buildDataUrl(128)
            expect(estimateDataUrlBytes(dataUrl)).toBe(128)
        })
    })

    describe("processMessageImageContent", () => {
        it("应该在没有内联图片时保持原内容", async () => {
            const content = "<p>hello world</p>"
            const result = await processMessageImageContent(content)
            expect(result).toBe(content)
        })

        it("应该自动上传大图并替换为 OSS 地址", async () => {
            const largeImage = buildDataUrl(256)
            let uploadCount = 0

            const result = await processMessageImageContent(`<img src="${largeImage}" />`, {
                largeInlineImageBytes: 200,
                uploadDataUrlImage: async () => {
                    uploadCount += 1
                    return "https://cdn.example.com/img/large.png?x-oss-process=image/format,auto"
                },
            })

            expect(uploadCount).toBe(1)
            expect(result).toContain("https://cdn.example.com/img/large.png?x-oss-process=image/format,auto")
            expect(result).not.toContain("data:image/")
        })

        it("应该在消息总长度超限时上传小图以缩短消息", async () => {
            const smallImage = buildDataUrl(32)
            let uploadCount = 0

            const result = await processMessageImageContent(`<img src="${smallImage}" /><span>msg</span>`, {
                largeInlineImageBytes: 10_000,
                maxMessageLength: 60,
                estimatedUploadedUrlLength: 20,
                uploadDataUrlImage: async () => {
                    uploadCount += 1
                    return "https://cdn.example.com/img/small.png?x-oss-process=image/format,auto"
                },
            })

            expect(uploadCount).toBe(1)
            expect(result).toContain("https://cdn.example.com/img/small.png?x-oss-process=image/format,auto")
            expect(result).not.toContain("data:image/")
        })

        it("应该复用重复图片的上传结果并替换全部引用", async () => {
            const sharedImage = buildDataUrl(64)
            let uploadCount = 0

            const content = `<img src="${sharedImage}" /><div>text</div><img src="${sharedImage}" />`
            const result = await processMessageImageContent(content, {
                largeInlineImageBytes: 1,
                uploadDataUrlImage: async () => {
                    uploadCount += 1
                    return "https://cdn.example.com/img/shared.png?x-oss-process=image/format,auto"
                },
            })

            const replacedCount = result.split("https://cdn.example.com/img/shared.png?x-oss-process=image/format,auto").length - 1
            expect(uploadCount).toBe(1)
            expect(replacedCount).toBe(2)
        })

        it("应该基于图片哈希复用上传结果（不同 Data URL 也只上传一次）", async () => {
            const bytes = Buffer.alloc(64, 2)
            const base64 = bytes.toString("base64")
            const sharedImageA = `data:image/png;base64,${base64}`
            const sharedImageB = `data:image/png;base64,${base64.slice(0, 20)}\n${base64.slice(20)}`
            let uploadCount = 0

            const content = `<img src="${sharedImageA}" /><img src="${sharedImageB}" />`
            const result = await processMessageImageContent(content, {
                largeInlineImageBytes: 1,
                uploadDataUrlImage: async () => {
                    uploadCount += 1
                    return "https://cdn.example.com/img/hash.png?x-oss-process=image/format,auto"
                },
            })

            const replacedCount = result.split("https://cdn.example.com/img/hash.png?x-oss-process=image/format,auto").length - 1
            expect(uploadCount).toBe(1)
            expect(replacedCount).toBe(2)
        })
    })
})
