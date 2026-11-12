import { describe, expect, it } from "vitest"
import {
    type LinearRgb,
    resolveHairModelDye,
    resolveSkinModelColor,
    resolveSkinModelFresnel,
    type SkinModelMetadata,
    validateSkinModelMetadata,
} from "./skin-model"

const metadata: SkinModelMetadata = {
    version: 1,
    skinId: 110201,
    charId: 1102,
    hairId: 110292,
    captureVerified: false,
    parts: Array.from({ length: 9 }, (_, i) => String(i)),
    allowedStockingIds: [1022],
    swatches: { 1001: { linear: [0.5029, 0.7529, 1] }, 1022: { linear: [0.2, 0.3, 0.4], fresnel: 0.2581 } },
}
const fallback: LinearRgb = [1, 0.8, 0.7]

describe("game skin dye semantics", () => {
    it("uses ActualRGB without applying sRGB conversion a second time", () => {
        expect(resolveSkinModelColor(metadata, [1001], 1, fallback)).toEqual([0.5029, 0.7529, 1])
    })
    it("restores data-table defaults for 0, -1, missing and unknown colors", () => {
        for (const ids of [[0], [-1], [], [9999]]) expect(resolveSkinModelColor(metadata, ids, 1, fallback)).toEqual(fallback)
    })
    it("treats part 8 as stockings with a restricted swatch and Fresnel", () => {
        const ids = Array(9).fill(0)
        ids[7] = 1001
        expect(resolveSkinModelColor(metadata, ids, 8, fallback)).toEqual(fallback)
        expect(resolveSkinModelFresnel(metadata, ids, 0.62)).toBe(0.62)
        ids[7] = 1022
        expect(resolveSkinModelColor(metadata, ids, 8, fallback)).toEqual([0.2, 0.3, 0.4])
        expect(resolveSkinModelFresnel(metadata, ids, 0.62)).toBe(0.2581)
    })
    it("keeps part 9 independent from emission (part 7)", () => {
        const ids = Array(9).fill(0)
        ids[8] = 1001
        expect(resolveSkinModelColor(metadata, ids, 7, fallback)).toEqual(fallback)
        expect(resolveSkinModelColor(metadata, ids, 9, fallback)).toEqual([0.5029, 0.7529, 1])
    })
    it("maps hair slots 1–2, headpiece slots 3–5 and emission slot 6", () => {
        const hairMetadata: SkinModelMetadata = {
            ...metadata,
            swatches: {
                2001: { linear: [0.1, 0.2, 0.3] },
                2002: { linear: [0.2, 0.3, 0.4] },
                2003: { linear: [0.3, 0.4, 0.5] },
                2004: { linear: [0.4, 0.5, 0.6] },
                2005: { linear: [0.5, 0.6, 0.7] },
                2006: { linear: [0.6, 0.7, 0.8] },
            },
        }
        const result = resolveHairModelDye(hairMetadata, [2001, 2002, 2003, 2004, 2005, 2006], {
            hair: [
                [0.9, 0.9, 0.9],
                [0.9, 0.9, 0.9],
                [0.9, 0.9, 0.9],
            ],
            hairPart: [
                [0.8, 0.8, 0.8],
                [0.8, 0.8, 0.8],
                [0.8, 0.8, 0.8],
            ],
            hairPartEmission: [0.7, 0.7, 0.7],
        })
        expect(result.hair).toEqual([
            [0.1, 0.2, 0.3],
            [0.2, 0.3, 0.4],
            [0.9, 0.9, 0.9],
        ])
        expect(result.hairPart).toEqual([
            [0.3, 0.4, 0.5],
            [0.4, 0.5, 0.6],
            [0.5, 0.6, 0.7],
        ])
        expect(result.hairPartEmission).toEqual([0.6, 0.7, 0.8])
    })
    it("rejects unrelated GLBs and invalid color payloads", () => {
        expect(validateSkinModelMetadata(metadata)).toBe(metadata)
        // 皮肤 id 只要求是整数（202 个皮肤共用同一套校验），非整数或缺失才算无效载荷
        expect(() => validateSkinModelMetadata({ ...metadata, skinId: 1.5 })).toThrow()
        expect(() => validateSkinModelMetadata({ ...metadata, swatches: { 1: { linear: [NaN, 1, 1] } } })).toThrow()
    })
})
