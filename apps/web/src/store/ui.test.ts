import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useUIStore } from "./ui"

describe("ui store 全局提示队列", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        setActivePinia(createPinia())
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("显示后队列里应有一条，字段正确", () => {
        const ui = useUIStore()
        ui.showSuccessMessage("已保存")

        expect(ui.toasts).toHaveLength(1)
        expect(ui.toasts[0]).toMatchObject({ kind: "success", message: "已保存", sticky: false })
    })

    it("多条提示共存，各自独立计时", () => {
        const ui = useUIStore()
        ui.showErrorMessage("第一条")
        vi.advanceTimersByTime(2000)
        ui.showErrorMessage("第二条")

        expect(ui.toasts.map(toast => toast.message)).toEqual(["第一条", "第二条"])

        // 第一条到期先走，第二条仍在
        vi.advanceTimersByTime(1000)
        expect(ui.toasts.map(toast => toast.message)).toEqual(["第二条"])

        vi.advanceTimersByTime(2000)
        expect(ui.toasts).toHaveLength(0)
    })

    it("错误与成功提示互不干扰", () => {
        const ui = useUIStore()
        ui.showErrorMessage("错误")
        vi.advanceTimersByTime(2000)
        ui.showSuccessMessage("成功")

        vi.advanceTimersByTime(1000)

        expect(ui.toasts.map(toast => toast.message)).toEqual(["成功"])
    })

    it("手动关闭变体不自动消失，可手动关闭", () => {
        const ui = useUIStore()
        const id = ui.showStickyErrorMessage("一直都在")

        vi.advanceTimersByTime(10000)
        expect(ui.toasts.map(toast => toast.message)).toEqual(["一直都在"])

        ui.dismissToast(id)
        expect(ui.toasts).toHaveLength(0)

        // 关闭后推进时间，队列应保持为空
        vi.advanceTimersByTime(10000)
        expect(ui.toasts).toHaveLength(0)
    })

    it("手动关闭应清理定时器，不误删后续提示", () => {
        const ui = useUIStore()
        const id = ui.showSuccessMessage("内容")
        ui.dismissToast(id)
        expect(ui.toasts).toHaveLength(0)

        ui.showSuccessMessage("下一条")
        vi.advanceTimersByTime(2000)
        expect(ui.toasts.map(toast => toast.message)).toEqual(["下一条"])

        vi.advanceTimersByTime(1000)
        expect(ui.toasts).toHaveLength(0)
    })

    it("超出上限时优先挤掉最早的非手动关闭提示", () => {
        const ui = useUIStore()
        ui.showStickySuccessMessage("sticky")
        for (let i = 0; i < 5; i++) ui.showSuccessMessage(`auto${i}`)

        expect(ui.toasts).toHaveLength(5)
        expect(ui.toasts.map(toast => toast.message)).toEqual(["sticky", "auto1", "auto2", "auto3", "auto4"])
    })

    it("全是手动关闭时新提示挤掉最早的一条", () => {
        const ui = useUIStore()
        for (let i = 0; i < 5; i++) ui.showStickySuccessMessage(`sticky${i}`)
        ui.showSuccessMessage("auto")

        expect(ui.toasts).toHaveLength(5)
        expect(ui.toasts.map(toast => toast.message)).toEqual(["sticky1", "sticky2", "sticky3", "sticky4", "auto"])
    })
})
