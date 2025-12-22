import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Vue
vi.mock("vue", () => ({
    createApp: vi.fn(() => ({
        use: vi.fn().mockReturnThis(),
        mount: vi.fn(),
    })),
}))

// Mock Pinia
vi.mock("pinia", () => ({
    createPinia: vi.fn(),
}))

// Mock i18next
vi.mock("i18next", () => ({
    default: {},
}))

vi.mock("i18next-vue", () => ({
    default: {},
}))

// Mock i18n
vi.mock("./i18n", () => ({
    initI18n: vi.fn(),
}))

// Mock DNALogin component
vi.mock("./views/DNALogin.vue", () => ({
    default: {},
}))

// Mock CSS
vi.mock("./style.css", () => ({}))

describe("Login Entry Point", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("should import required dependencies", async () => {
        // Simply importing the file will execute the code
        await import("./login")

        const { createApp } = await import("vue")
        const { createPinia } = await import("pinia")
        const { initI18n } = await import("./i18n")

        expect(createApp).toHaveBeenCalled()
        expect(createPinia).toHaveBeenCalled()
        expect(initI18n).toHaveBeenCalledWith(navigator.language)
    })

    it("should initialize i18n with navigator language", async () => {
        const { initI18n } = await import("./i18n")

        expect(initI18n).toHaveBeenCalledWith(expect.any(String))
    })

    it("should create app with DNALogin component", async () => {
        const { createApp } = await import("vue")

        expect(createApp).toHaveBeenCalledWith(expect.any(Object))
    })

    it("should use Pinia store", async () => {
        const mockApp = {
            use: vi.fn().mockReturnThis(),
            mount: vi.fn(),
        }
        const { createApp } = await import("vue")
        vi.mocked(createApp).mockReturnValue(mockApp as any)

        const { createPinia } = await import("pinia")

        expect(mockApp.use).toHaveBeenCalledWith(expect.anything())
    })

    it("should mount app to #app element", async () => {
        const mockApp = {
            use: vi.fn().mockReturnThis(),
            mount: vi.fn(),
        }
        const { createApp } = await import("vue")
        vi.mocked(createApp).mockReturnValue(mockApp as any)

        expect(mockApp.mount).toHaveBeenCalledWith("#app")
    })
})

describe("Login Configuration", () => {
    it("should chain plugin registrations", async () => {
        const mockApp = {
            use: vi.fn().mockReturnThis(),
            mount: vi.fn(),
        }
        const { createApp } = await import("vue")
        vi.mocked(createApp).mockReturnValue(mockApp as any)

        await import("./login")

        // Should be called twice: once for Pinia, once for I18NextVue
        expect(mockApp.use).toHaveBeenCalledTimes(2)
    })
})