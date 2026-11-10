import { describe, expect, it } from "vitest"
import { findDuplicateId, hashBytes, needsPublish, parseMaxBytes, parseTextureBudget } from "./models-pack"
import { DEFAULT_TEXTURE_BUDGET } from "./skin-model/compress"

describe("model manifest hashing", () => {
    it("hashes identical content identically and different content differently", () => {
        expect(hashBytes(new Uint8Array([1, 2, 3]))).toBe(hashBytes(new Uint8Array([1, 2, 3])))
        expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 4])))
    })

    it("returns a fixed width hex digest", () => {
        expect(hashBytes(new Uint8Array(0))).toMatch(/^[0-9a-f]{8}$/)
    })
})

describe("incremental publishing", () => {
    const entry = { hash: "abcd1234", bytes: 1024 }

    it("publishes a model that has never been published", () => {
        expect(needsPublish(entry, undefined)).toBe(true)
    })

    it("skips a model whose content is unchanged", () => {
        expect(needsPublish(entry, { ...entry, id: "110201", file: "110201.glb", builtAt: "" })).toBe(false)
    })

    it("republishes when the hash or the size changes", () => {
        const previous = { ...entry, id: "110201", file: "110201.glb", builtAt: "" }
        expect(needsPublish({ ...entry, hash: "ffffffff" }, previous)).toBe(true)
        expect(needsPublish({ ...entry, bytes: 2048 }, previous)).toBe(true)
    })
})

describe("duplicate model ids", () => {
    it("accepts a flat directory of uniquely named models", () => {
        expect(findDuplicateId([{ relPath: "110101.glb" }, { relPath: "110201.glb" }])).toBeUndefined()
    })

    it("reports the same id exported to two different paths", () => {
        const duplicate = findDuplicateId([{ relPath: "110201.glb" }, { relPath: "flora/110201.glb" }])
        expect(duplicate).toEqual({ id: "110201", paths: ["110201.glb", "flora/110201.glb"] })
    })
})

describe("size ceiling", () => {
    it("defaults to 5 MiB when no limit is given", () => {
        expect(parseMaxBytes(undefined)).toBe(5 * 1024 * 1024)
    })

    it("converts a MiB limit to bytes", () => {
        expect(parseMaxBytes("3.5")).toBe(3.5 * 1024 * 1024)
    })

    it("falls back to the default for garbage input", () => {
        expect(parseMaxBytes("0")).toBe(5 * 1024 * 1024)
        expect(parseMaxBytes("-1")).toBe(5 * 1024 * 1024)
        expect(parseMaxBytes("abc")).toBe(5 * 1024 * 1024)
    })
})

describe("texture budget overrides", () => {
    it("returns the defaults when no override is given", () => {
        expect(parseTextureBudget(undefined)).toEqual(DEFAULT_TEXTURE_BUDGET)
    })

    it("parses lossless and quality tiers", () => {
        const budget = parseTextureBudget("cutout=1:lossless,color=0.5:82")
        expect(budget.cutout).toEqual({ scale: 1, lossless: true })
        expect(budget.color).toEqual({ scale: 0.5, quality: 82 })
        expect(budget.mask).toEqual(DEFAULT_TEXTURE_BUDGET.mask)
    })

    it("ignores unknown slots and malformed specs", () => {
        expect(parseTextureBudget("nope=0.5:80,cutout=abc")).toEqual(DEFAULT_TEXTURE_BUDGET)
    })
})
