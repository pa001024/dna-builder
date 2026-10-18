import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useUIStore } from "./ui"

describe("ui store 全局提示", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        setActivePinia(createPinia())
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("显示后可见性应立刻为真，且文本不被清空", () => {
        const ui = useUIStore()
        ui.showSuccessMessage("已保存")

        expect(ui.successMessage).toBe("已保存")
        expect(ui.successMessageVisible).toBe(true)
    })

    it("自动隐藏应只收起可见性，文本常驻以支撑退场动画", () => {
        const ui = useUIStore()
        ui.showErrorMessage("出错了")

        vi.advanceTimersByTime(3000)

        expect(ui.errorMessageVisible).toBe(false)
        // 退场动画期间模板仍要读到文本，清空会导致提示条先塌成只剩图标
        expect(ui.errorMessage).toBe("出错了")
    })

    it("隐藏后再次显示应能正常触发", () => {
        const ui = useUIStore()
        ui.showSuccessMessage("第一次")
        vi.advanceTimersByTime(3000)
        expect(ui.successMessageVisible).toBe(false)

        ui.showSuccessMessage("第二次")
        expect(ui.successMessage).toBe("第二次")
        expect(ui.successMessageVisible).toBe(true)

        vi.advanceTimersByTime(3000)
        expect(ui.successMessageVisible).toBe(false)
    })

    it("连续提示应重置计时，不被旧定时器提前收起", () => {
        const ui = useUIStore()
        ui.showErrorMessage("第一条")
        vi.advanceTimersByTime(2000)

        ui.showErrorMessage("第二条")
        // 旧定时器若未被清理，此刻就会把提示收掉
        vi.advanceTimersByTime(1000)
        expect(ui.errorMessageVisible).toBe(true)
        expect(ui.errorMessage).toBe("第二条")

        vi.advanceTimersByTime(2000)
        expect(ui.errorMessageVisible).toBe(false)
    })

    it("手动关闭应立即收起，不进队列", () => {
        const ui = useUIStore()
        ui.showSuccessMessage("内容")
        ui.dismissSuccessMessage()

        vi.advanceTimersByTime(0)

        expect(ui.successMessageVisible).toBe(false)
        expect(ui.successMessage).toBe("内容")
    })

    it("错误与成功提示的计时器互不干扰", () => {
        const ui = useUIStore()
        ui.showErrorMessage("错误")
        vi.advanceTimersByTime(2000)
        ui.showSuccessMessage("成功")

        vi.advanceTimersByTime(1000)

        expect(ui.errorMessageVisible).toBe(false)
        expect(ui.successMessageVisible).toBe(true)
    })
})
