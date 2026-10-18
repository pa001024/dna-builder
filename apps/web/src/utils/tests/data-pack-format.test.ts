import { describe, expect, it } from "vitest"
import {
    compareDataPackVersions,
    DATA_PACK_FORMAT_MAJOR,
    isDataPackMajorSupported,
    normalizeDataPackMajor,
} from "../data-pack/data-pack-format"

describe("数据包格式 major", () => {
    it("当前格式 major 为正整数", () => {
        expect(Number.isInteger(DATA_PACK_FORMAT_MAJOR)).toBe(true)
        expect(DATA_PACK_FORMAT_MAJOR).toBeGreaterThan(0)
    })

    it("显式 major 优先采用", () => {
        expect(normalizeDataPackMajor(1, "1.7.4.1")).toBe(1)
        expect(normalizeDataPackMajor(2, "1.1.86.1")).toBe(2)
    })

    it("缺失 major 时按历史分割线推断", () => {
        expect(normalizeDataPackMajor(undefined, "1.6.208.6")).toBe(1)
        expect(normalizeDataPackMajor(undefined, "1.6.208.7")).toBe(2)
        expect(normalizeDataPackMajor(undefined, "1.7.4.1")).toBe(2)
        expect(normalizeDataPackMajor(undefined, undefined)).toBe(1)
    })

    it("版本号按数字段比较", () => {
        expect(compareDataPackVersions("1.6.208.7", "1.6.208.7")).toBe(0)
        expect(compareDataPackVersions("1.6.208.10", "1.6.208.7")).toBe(1)
        expect(compareDataPackVersions("1.7.3.1", "1.6.208.7")).toBe(1)
        expect(compareDataPackVersions("1.6.208.6", "1.6.208.7")).toBe(-1)
    })

    it("只接受当前支持范围内的包", () => {
        expect(isDataPackMajorSupported(1, "1.6.208.6")).toBe(true)
        expect(isDataPackMajorSupported(2, "1.7.4.1")).toBe(true)
        expect(isDataPackMajorSupported(DATA_PACK_FORMAT_MAJOR + 1, "9.9.9.9")).toBe(false)
        expect(isDataPackMajorSupported(undefined, "1.6.208.6")).toBe(true)
    })
})
