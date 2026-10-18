import { describe, expect, it, vi } from "vitest"

vi.mock("i18next", () => ({ default: {} }))
vi.mock("i18next-http-backend", () => ({ default: {} }))

import { FALLBACK_I18N_LANGUAGE, i18nLanguages, resolveI18nLanguage } from "@/i18n"

describe("resolveI18nLanguage", () => {
    it("code 精确命中原样返回", () => {
        for (const lang of i18nLanguages) {
            if (lang.code === "jiaojiao") continue
            expect(resolveI18nLanguage(lang.code)).toBe(lang.code)
        }
    })

    it("alias 精确命中归一到 code", () => {
        expect(resolveI18nLanguage("zh")).toBe("zh-CN")
        expect(resolveI18nLanguage("zh-Hans")).toBe("zh-CN")
        expect(resolveI18nLanguage("zh-Hant")).toBe("zh-TW")
        expect(resolveI18nLanguage("ja-JP")).toBe("ja")
        expect(resolveI18nLanguage("ko-KR")).toBe("ko")
        expect(resolveI18nLanguage("fr-FR")).toBe("fr")
    })

    it("浏览器区域变体按主语言段归一", () => {
        expect(resolveI18nLanguage("en-US")).toBe("en")
        expect(resolveI18nLanguage("en-GB")).toBe("en")
        expect(resolveI18nLanguage("zh-HK")).toBe("zh-CN")
        expect(resolveI18nLanguage("zh-SG")).toBe("zh-CN")
    })

    it("jiaojiao 映射到英文包", () => {
        expect(resolveI18nLanguage("jiaojiao")).toBe("en")
    })

    it("未知语言与空值回落简体中文", () => {
        expect(resolveI18nLanguage("de")).toBe(FALLBACK_I18N_LANGUAGE)
        expect(resolveI18nLanguage("xx-YY")).toBe(FALLBACK_I18N_LANGUAGE)
        expect(resolveI18nLanguage("")).toBe(FALLBACK_I18N_LANGUAGE)
    })
})
