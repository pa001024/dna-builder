import { describe, expect, it } from "vitest"
import { isDataPackModule } from "../data-pack-runtime"

describe("数据包模块清单", () => {
    it("应该把剧情数据模块纳入数据包加载", () => {
        expect(isDataPackModule("quest.data")).toBe(true)
        expect(isDataPackModule("quest.tc.data")).toBe(true)
        expect(isDataPackModule("partytopic.data")).toBe(true)
        expect(isDataPackModule("partytopic.tc.data")).toBe(true)
    })

    it("不应误判普通模块", () => {
        expect(isDataPackModule("charbuild.data")).toBe(false)
        expect(isDataPackModule("queststory.ts")).toBe(false)
    })
})
