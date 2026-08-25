import { beforeAll, describe, expect, it } from "vitest"
import {
    canonicalizeClassValue,
    canonicalizeSource,
    fallbackCanonicalizeCandidate,
    loadDesignSystem,
} from "./canonicalize-tailwind-classes"

let designSystem: any

beforeAll(async () => {
    designSystem = await loadDesignSystem()
}, 30_000)

describe("canonicalizeClassValue 单位转换", () => {
    it("将 daisyUI 颜色透明度任意值规范化为百分比（border-base-content/[0.01] -> /1）", () => {
        expect(canonicalizeClassValue(designSystem, "border-base-content/[0.01]")).toBe("border-base-content/1")
        expect(canonicalizeClassValue(designSystem, "bg-primary/[0.5]")).toBe("bg-primary/50")
        expect(canonicalizeClassValue(designSystem, "hover:border-base-content/[0.01]")).toBe("hover:border-base-content/1")
    })

    it("将 px 长度转换为 spacing scale token（p-[8px] -> p-2）", () => {
        expect(canonicalizeClassValue(designSystem, "p-[8px]")).toBe("p-2")
        expect(canonicalizeClassValue(designSystem, "w-[8px]")).toBe("w-2")
        expect(canonicalizeClassValue(designSystem, "mt-[6px]")).toBe("mt-1.5")
    })

    it("将 rem 长度转换为 spacing scale token", () => {
        expect(canonicalizeClassValue(designSystem, "p-[0.5rem]")).toBe("p-2")
        expect(canonicalizeClassValue(designSystem, "p-[1.5rem]")).toBe("p-6")
        expect(canonicalizeClassValue(designSystem, "w-[4rem]")).toBe("w-16")
    })

    it("处理变体与 important", () => {
        expect(canonicalizeClassValue(designSystem, "hover:p-[8px]")).toBe("hover:p-2")
        expect(canonicalizeClassValue(designSystem, "sm:hover:p-[8px]")).toBe("sm:hover:p-2")
        expect(canonicalizeClassValue(designSystem, "!p-[8px]")).toBe("p-2!")
        expect(canonicalizeClassValue(designSystem, "-mt-[8px]")).toBe("-mt-2")
    })

    it("保留未知类与不安全的 arbitrary 值", () => {
        expect(canonicalizeClassValue(designSystem, "stagger-rise flex")).toBe("stagger-rise flex")
        expect(canonicalizeClassValue(designSystem, "text-[16px]")).toBe("text-[16px]")
        expect(canonicalizeClassValue(designSystem, "w-[50%]")).toBe("w-[50%]")
    })

    it("对规范化后等价的类去重", () => {
        expect(canonicalizeClassValue(designSystem, "p-[8px] p-[0.5rem] p-2")).toBe("p-2")
    })

    it("跳过模板插值", () => {
        expect(canonicalizeClassValue(designSystem, "p-{{ size }}")).toBe("p-{{ size }}")
    })
})

describe("fallbackCanonicalizeCandidate 兜底换算", () => {
    it("支持 px 单位", () => {
        expect(fallbackCanonicalizeCandidate(designSystem, "p-[8px]")).toBe("p-2")
    })

    it("支持 rem 单位", () => {
        expect(fallbackCanonicalizeCandidate(designSystem, "p-[0.5rem]")).toBe("p-2")
        expect(fallbackCanonicalizeCandidate(designSystem, "p-[1.5rem]")).toBe("p-6")
    })

    it("CSS 语义不一致时不改写", () => {
        expect(fallbackCanonicalizeCandidate(designSystem, "text-[8px]")).toBe("text-[8px]")
        // 无法整除 spacing 步长（1.23px / 4px = 0.3075，往返校验失败）
        expect(fallbackCanonicalizeCandidate(designSystem, "w-[1.23px]")).toBe("w-[1.23px]")
        // 目标类 blur-2 无对应 CSS，无法验证等价性
        expect(fallbackCanonicalizeCandidate(designSystem, "blur-[8px]")).toBe("blur-[8px]")
    })
})

describe("canonicalizeSource", () => {
    it("改写静态 class 属性", () => {
        const src = `<div class="border-base-content/[0.01] p-[8px]">x</div>`
        expect(canonicalizeSource(designSystem, src)).toBe(`<div class="border-base-content/1 p-2">x</div>`)
    })

    it("不改写 :class 绑定", () => {
        const src = `<div :class="p-[8px]">x</div>`
        expect(canonicalizeSource(designSystem, src)).toBe(src)
    })

    it("同时改写 className 属性", () => {
        const src = `export const c = <div className="p-[8px]">x</div>`
        expect(canonicalizeSource(designSystem, src)).toBe(`export const c = <div className="p-2">x</div>`)
    })
})
