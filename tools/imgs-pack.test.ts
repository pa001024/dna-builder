import { describe, expect, it } from "vitest"
import { collectNewFiles } from "./imgs-pack"

describe("collectNewFiles", () => {
    it("首个版本打包全部图片", () => {
        expect(collectNewFiles(["1.webp", "2.webp", "3.webp"], [])).toEqual(["1.webp", "2.webp", "3.webp"])
    })

    it("后续版本只打包未出现过的图片", () => {
        const versions = [{ files: ["1.webp", "2.webp", "3.webp"] }]

        expect(collectNewFiles(["1.webp", "2.webp", "3.webp", "4.webp"], versions)).toEqual(["4.webp"])
    })

    it("对所有历史版本去重", () => {
        const versions = [{ files: ["1.webp", "2.webp"] }, { files: ["3.webp", "4.webp"] }]

        expect(collectNewFiles(["1.webp", "2.webp", "3.webp", "4.webp", "5.webp"], versions)).toEqual(["5.webp"])
    })
})
