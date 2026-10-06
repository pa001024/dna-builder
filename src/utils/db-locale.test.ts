import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    voice: vi.fn(),
    ext: vi.fn(),
    apply: vi.fn(),
    load: vi.fn(),
    invalidate: undefined as (() => void) | undefined,
}))

vi.mock("i18next", () => ({
    default: {
        isInitialized: true,
        hasResourceBundle: () => false,
        loadLanguages: mocks.load,
        getResourceBundle: () => ({}),
    },
}))
vi.mock("@/data/d/charvoice-locale", () => ({ getLocalizedCharVoiceData: mocks.voice }))
vi.mock("@/data/d/charext-locale", () => ({ getLocalizedCharExtData: mocks.ext }))
vi.mock("@/utils/data-pack/translations-pack", () => ({
    applyPackTranslations: mocks.apply,
    getPackTranslationTable: () => ({}),
    isPackTranslationLocale: () => true,
    registerPackTranslationInvalidation: (callback: () => void) => {
        mocks.invalidate = callback
    },
}))

import { ensureDBAgentLangReady } from "@/utils/db-locale"

beforeEach(() => {
    mocks.invalidate?.()
    vi.clearAllMocks()
    mocks.voice.mockResolvedValue({})
    mocks.ext.mockResolvedValue({})
    mocks.apply.mockResolvedValue(undefined)
    mocks.load.mockResolvedValue(undefined)
})

describe("资料检索语言并发预热", () => {
    it("同语言的冷启动调用都等待完整预热，只加载一次", async () => {
        const gate = Promise.withResolvers<void>()
        const entered = Promise.withResolvers<void>()
        mocks.voice.mockImplementation(() => {
            entered.resolve()
            return gate.promise
        })
        const first = ensureDBAgentLangReady("en")
        const second = ensureDBAgentLangReady("en")
        let secondReady = false
        void second.then(() => {
            secondReady = true
        })
        try {
            await entered.promise
            expect(secondReady).toBe(false)
            expect(mocks.ext).not.toHaveBeenCalled()
            gate.resolve()
            await Promise.all([first, second])
            expect(secondReady).toBe(true)
            await ensureDBAgentLangReady("en")
            expect(mocks.voice).toHaveBeenCalledTimes(1)
            expect(mocks.ext).toHaveBeenCalledTimes(1)
            expect(mocks.apply).toHaveBeenCalledTimes(1)
        } finally {
            gate.resolve()
            await Promise.all([first, second])
        }
    })

    it("数据包失效后旧任务不会把新缓存标为就绪", async () => {
        const gate = Promise.withResolvers<void>()
        const entered = Promise.withResolvers<void>()
        mocks.voice.mockImplementationOnce(() => {
            entered.resolve()
            return gate.promise
        })
        const oldTask = ensureDBAgentLangReady("zh")
        try {
            await entered.promise
            mocks.invalidate?.()
            gate.resolve()
            await oldTask
            await ensureDBAgentLangReady("zh")
            expect(mocks.voice).toHaveBeenCalledTimes(2)
        } finally {
            gate.resolve()
            await oldTask
        }
    })
})
