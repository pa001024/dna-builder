import { describe, expect, it } from "vitest"
import { isQaPass, readQaThresholds } from "./asr"
import { classifyEmotionHeuristic } from "./emotion"
import {
    buildRequiredVariants,
    buildTtsVariants,
    expandGenderVariants,
    requiredVoiceSuffixes,
    stripNicknamePlaceholders,
} from "./text-prep"

describe("stripNicknamePlaceholders", () => {
    it("昵称占位符替换为默认主角名", () => {
        expect(stripNicknamePlaceholders("{nickname}总说你做的饭很好吃")).toBe("维塔总说你做的饭很好吃")
        expect(stripNicknamePlaceholders("卡米拉，{nickname}的下落有消息了吗？")).toBe("卡米拉，维塔的下落有消息了吗？")
        expect(stripNicknamePlaceholders("{nickname2}，你来了")).toBe("墨斯，你来了")
    })
})

describe("expandGenderVariants", () => {
    it("中文同音性别词只出一版", () => {
        expect(expandGenderVariants("{性别:他|她}回来了", "zh-CN")).toHaveLength(1)
    })

    it("英文发音差异性别词出两版", () => {
        const variants = expandGenderVariants("{性别:his|her} book", "en")
        expect(variants.map(variant => variant.fileSuffix)).toEqual(["_m", "_f"])
    })
})

describe("requiredVoiceSuffixes", () => {
    const force = new Set([100001])

    it("主角占位 NPC 必出 _m / _f（与前端同规则）", () => {
        expect(requiredVoiceSuffixes("我是谁？", 100001, "zh-CN", force).sort()).toEqual(["_f", "_m"])
    })

    it("故事 NPC 无后缀", () => {
        expect(requiredVoiceSuffixes("回去吧。", 260001, "zh-CN", force)).toEqual([""])
    })
})

describe("buildRequiredVariants", () => {
    const force = new Set([100001])

    it("以后端规则为准出变体", () => {
        const variants = buildRequiredVariants("我是谁？", 100001, "zh-CN", force)
        expect(variants.map(variant => variant.fileSuffix).sort()).toEqual(["_f", "_m"])
        expect(variants.map(variant => variant.text)).toEqual(["我是谁？", "我是谁？"])
    })
})

describe("buildTtsVariants", () => {
    it("去标签去昵称", () => {
        const variants = buildTtsVariants("<H>走吧</H>{nickname}，一起回家。", "zh-CN")
        expect(variants).toHaveLength(1)
        expect(variants[0].text).not.toContain("{nickname}")
        expect(variants[0].text).toContain("走吧")
    })

    it("主角占位 NPC 强制出 _m / _f 两版", () => {
        const variants = buildTtsVariants("我是谁？", "zh-CN", "", true)
        expect(variants.map(variant => variant.fileSuffix)).toEqual(["_m", "_f"])
    })

    it("纯标点不过审", () => {
        expect(buildTtsVariants("……", "zh-CN")).toEqual([])
    })
})

describe("isQaPass", () => {
    const thresholds = readQaThresholds()

    it("好文件通过", () => {
        expect(isQaPass({ cer: 0, recall: 1, missing: 0, longest_missing: 0 }, thresholds, 20)).toBe(true)
    })

    it("整句丢失拒绝", () => {
        expect(isQaPass({ cer: 0.49, recall: 0.33, missing: 20, longest_missing: 19 }, thresholds, 59)).toBe(false)
    })

    it("短句单字 ASR 噪声放行", () => {
        expect(isQaPass({ cer: 0.33, recall: 0.67, missing: 2, longest_missing: 1 }, thresholds, 6)).toBe(true)
    })

    it("长句中间丢段拒绝", () => {
        expect(isQaPass({ cer: 0.35, recall: 0.65, missing: 15, longest_missing: 13 }, thresholds, 43)).toBe(false)
    })
})

describe("classifyEmotionHeuristic", () => {
    it("命中关键词", () => {
        expect(classifyEmotionHeuristic("嘻嘻，恶魔大盗闪亮登场！")).toBe("happy")
        expect(classifyEmotionHeuristic("对不起……是我太小看这些污物了")).toBe("sad")
    })

    it("无命中回 neutral", () => {
        expect(classifyEmotionHeuristic("前面就是车站了。")).toBe("neutral")
    })
})
