import { describe, expect, it } from "vitest"
import { getVersionByTime } from "./time.data"

describe("getVersionByTime", () => {
    it("应该在 1.5 深渊开启时切换版本", () => {
        expect(getVersionByTime(1785203999)).toBe("1.4")
        expect(getVersionByTime(1785204000)).toBe("1.5")
    })
})
