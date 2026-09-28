import { beforeEach, describe, expect, it } from "vitest"
import { normalizeDBCardKind, resolveDBCardEntry } from "@/utils/db-card-utils"

/**
 * DBAICard（AI 卡片中间层）的数据补全用例。
 *
 * 关注的是「模型只给类型 + id 或名称时能不能补齐成完整条目」：
 * id / 名称 / 别名 / 魔之楔的「系列 + 名称」写法 / 类型缺失兜底 / 查不到时不乱猜。
 */

/** 让 localStorage 在测试环境里报「中文」，名称解析按原文匹配 */
function stubChineseLocale(): void {
    const store = new Map<string, string>([["setting_lang", "zh-CN"]])

    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => store.set(key, value),
            removeItem: (key: string) => store.delete(key),
            clear: () => store.clear(),
        },
    })
}

beforeEach(() => {
    stubChineseLocale()
})

describe("normalizeDBCardKind", () => {
    it("接受英文与中文写法", () => {
        expect(normalizeDBCardKind("char")).toBe("char")
        expect(normalizeDBCardKind("Weapon")).toBe("weapon")
        expect(normalizeDBCardKind(" 魔之楔 ")).toBe("mod")
        expect(normalizeDBCardKind("角色")).toBe("char")
    })

    it("无法识别时返回 undefined", () => {
        expect(normalizeDBCardKind("")).toBeUndefined()
        expect(normalizeDBCardKind("pet")).toBeUndefined()
        expect(normalizeDBCardKind(undefined)).toBeUndefined()
    })
})

describe("resolveDBCardEntry 按 id", () => {
    it("按角色 id 补齐", () => {
        const entry = resolveDBCardEntry({ kind: "char", id: 4201 })

        expect(entry?.kind).toBe("char")
        expect(entry?.item.名称).toBe("煜明")
    })

    it("id 写成字符串也能识别", () => {
        const entry = resolveDBCardEntry({ kind: "char", id: "4201" })

        expect(entry?.item.名称).toBe("煜明")
    })

    it("类型缺失时自动找到条目", () => {
        const weapon = resolveDBCardEntry({ kind: undefined, name: "辉珀刃" })

        expect(weapon?.kind).toBe("weapon")
    })
})

describe("resolveDBCardEntry 按名称", () => {
    it("角色名称精确命中", () => {
        const entry = resolveDBCardEntry({ kind: "char", name: "煜明" })

        expect(entry?.kind).toBe("char")
        expect(entry?.item.名称).toBe("煜明")
    })

    it("角色别名也能命中", () => {
        const entry = resolveDBCardEntry({ name: "无罪囚徒" })

        expect(entry?.kind).toBe("char")
        expect(entry?.item.名称).toBe("煜明")
    })

    it("武器名称命中", () => {
        const entry = resolveDBCardEntry({ kind: "weapon", name: "辉珀刃" })

        expect(entry?.kind).toBe("weapon")
        expect(entry?.item.id).toBe(10101)
    })

    it("魔之楔支持「系列 + 名称」写法", () => {
        const plain = resolveDBCardEntry({ kind: "mod", name: "炽灼" })
        const withSeries = resolveDBCardEntry({ kind: "mod", name: "不死鸟·炽灼" })

        expect(plain?.kind).toBe("mod")
        expect(plain?.item.名称).toBe("炽灼")
        expect(withSeries?.item.id).toBe(plain?.item.id)
    })

    it("名称查不到时返回 undefined（不乱猜同模块的其它条目）", () => {
        expect(resolveDBCardEntry({ kind: "char", name: "绝不可能存在的角色名" })).toBeUndefined()
    })

    it("参数全空时返回 undefined", () => {
        expect(resolveDBCardEntry({})).toBeUndefined()
        expect(resolveDBCardEntry({ kind: "char" })).toBeUndefined()
    })

    it("id 与名称都给时以 id 为准", () => {
        const byId = resolveDBCardEntry({ kind: "char", id: 4201 })
        const both = resolveDBCardEntry({ kind: "char", id: 4201, name: "贝蕾妮卡" })

        expect(both?.item.id).toBe(byId?.item.id)
    })
})
