import { describe, expect, it } from "vitest"
import { isDataPackModule } from "../data-pack/data-pack-runtime"

describe("数据包模块清单", () => {
    it("应该把剧情数据模块纳入数据包加载", () => {
        expect(isDataPackModule("quest.data")).toBe(true)
        expect(isDataPackModule("partytopic.data")).toBe(true)
    })

    it("分语言文件已合并进中文结构，不再是独立数据包模块", () => {
        // quest / partytopic / charvoice / charext 的译文已压成同文件内的 id→文本大表
        expect(isDataPackModule("quest.tc.data")).toBe(false)
        expect(isDataPackModule("partytopic.tc.data")).toBe(false)
        expect(isDataPackModule("charvoice.en.data")).toBe(false)
        expect(isDataPackModule("charext.en.data")).toBe(false)
    })

    it("不应误判普通模块", () => {
        expect(isDataPackModule("charbuild.data")).toBe(false)
        expect(isDataPackModule("queststory.ts")).toBe(false)
    })
})
