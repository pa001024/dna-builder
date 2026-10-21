import i18next from "i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    hydrationCallback: undefined as (() => void) | undefined,
    // 模拟“水合回填后的壳模块绑定”：与真实壳一样按引用整体替换
    tables: {
        tc: {} as Record<string, string>,
        en: {} as Record<string, string>,
        jp: {} as Record<string, string>,
        kr: {} as Record<string, string>,
        fr: {} as Record<string, string>,
    },
}))

vi.mock("@/data/d/translations.data", () => ({
    get translationsTc() {
        return mocks.tables.tc
    },
    get translationsEn() {
        return mocks.tables.en
    },
    get translationsJa() {
        return mocks.tables.jp
    },
    get translationsKo() {
        return mocks.tables.kr
    },
    get translationsFr() {
        return mocks.tables.fr
    },
}))

vi.mock("./data-pack-bridge", () => ({
    registerDataPackHydrationCallback: (callback: () => void) => {
        mocks.hydrationCallback = callback
    },
}))

import { applyAllPackTranslations } from "./translations-pack"

/** 等待断言成立：注入链是多段微任务，轮询比固定 sleep 稳 */
async function waitForTranslated(key: string, lng: string, expected: string): Promise<void> {
    const deadline = Date.now() + 3000
    for (;;) {
        if (i18next.t(key, { lng }) === expected) {
            return
        }
        if (Date.now() > deadline) {
            break
        }
        await new Promise<void>(resolve => setTimeout(resolve, 10))
    }
    expect(i18next.t(key, { lng })).toBe(expected)
}

beforeEach(() => {
    for (const table of Object.values(mocks.tables)) {
        for (const key of Object.keys(table)) {
            delete table[key]
        }
    }
})

describe("数据包翻译与页面初始化的时序", () => {
    it("水合先于 initI18n 完成时，真实初始化后翻译仍然生效", async () => {
        // 复现 rewrite 生产包的启动顺序：壳模块 import 阶段即触发水合，
        // 此时主应用的 initI18n 还没跑（单例尚未初始化）
        expect(i18next.isInitialized).toBeFalsy()
        mocks.tables.en["你好"] = "Hello"

        mocks.hydrationCallback?.()
        // 旧实现会在这里 bare init() 抢跑并标“已注入”，随后真实 init 清空 store 导致翻译全灭；
        // 新实现应等待真实初始化，不提前 init
        await new Promise<void>(resolve => setTimeout(resolve, 50))
        expect(i18next.isInitialized).toBeFalsy()

        // 页面初始化：主应用的真实 initI18n（会新建 ResourceStore）
        await i18next.init({
            lng: "en",
            fallbackLng: "zh-CN",
            resources: { en: { translation: {} }, "zh-CN": { translation: {} } },
            interpolation: { escapeValue: false },
            initImmediate: false,
        })

        await waitForTranslated("你好", "en", "Hello")
    }, 20000)

    it("初始化后再水合（换包）时，新文案能覆盖旧文案", async () => {
        expect(i18next.isInitialized).toBeTruthy()

        mocks.tables.en["你好"] = "HelloV2"
        mocks.hydrationCallback?.()

        await waitForTranslated("你好", "en", "HelloV2")
    })

    it("对照表为空时不注入也不占位，后续水合仍可补上", async () => {
        expect(i18next.hasResourceBundle("fr", "translation")).toBe(false)
        // fr 表为空：applyAll 不应凭空建 bundle
        await applyAllPackTranslations()
        expect(i18next.hasResourceBundle("fr", "translation")).toBe(false)

        mocks.tables.fr["你好"] = "Bonjour"
        mocks.hydrationCallback?.()
        await waitForTranslated("你好", "fr", "Bonjour")
    })
})
