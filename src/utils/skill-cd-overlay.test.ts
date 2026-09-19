import { describe, expect, it } from "vitest"
import {
    ANCHOR_MAX_PERCENT,
    buildFloatWindowConfig,
    clampAnchorInside,
    clampCdSeconds,
    createDefaultSkillCdOverlaySettings,
    createKeyBinding,
    normalizeKeyBindings,
    parseProcessNames,
    SKILL_CD_MAX_KEYS,
    SKILL_CD_OVERLAY_COLORS,
    SKILL_CD_OVERLAY_DEFAULTS,
    SKILL_CD_OVERLAY_STORAGE_KEY,
} from "./skill-cd-overlay"
import { clampVk, vkFromKeyboardEvent, vkLabel } from "./virtual-key"

describe("virtual-key", () => {
    it("优先按 code 解析虚拟键码", () => {
        expect(vkFromKeyboardEvent({ code: "KeyE", keyCode: 0 })).toBe(0x45)
        expect(vkFromKeyboardEvent({ code: "Digit1", keyCode: 0 })).toBe(0x31)
        expect(vkFromKeyboardEvent({ code: "ArrowUp", keyCode: 0 })).toBe(0x26)
        expect(vkFromKeyboardEvent({ code: "F5", keyCode: 0 })).toBe(0x74)
        expect(vkFromKeyboardEvent({ code: "Numpad3", keyCode: 0 })).toBe(0x63)
        expect(vkFromKeyboardEvent({ code: "ShiftLeft", keyCode: 0 })).toBe(0x10)
    })

    it("未知 code 时回退 keyCode", () => {
        expect(vkFromKeyboardEvent({ code: "Unidentified", keyCode: 0x52 })).toBe(0x52)
        expect(vkFromKeyboardEvent({ code: "Unidentified", keyCode: 0 })).toBe(0)
        expect(vkFromKeyboardEvent({ code: "Unidentified", keyCode: 999 })).toBe(0)
    })

    it("描述标签与后端保持一致的风格", () => {
        expect(vkLabel(0x45)).toBe("E")
        expect(vkLabel(0x31)).toBe("1")
        expect(vkLabel(0x20)).toBe("Space")
        expect(vkLabel(0x1b)).toBe("Esc")
        expect(vkLabel(0x74)).toBe("F5")
        expect(vkLabel(0x41)).toBe("A")
        // 0x70 ~ 0x87 是 F1 ~ F24,0x7f 应解析为 F16
        expect(vkLabel(0x7f)).toBe("F16")
        expect(vkLabel(0x01)).toBe("")
        expect(vkLabel(0xe8)).toBe("")
    })

    it("钳制非法的虚拟键码", () => {
        expect(clampVk(0x45)).toBe(0x45)
        expect(clampVk(0)).toBe(0)
        expect(clampVk(-3)).toBe(0)
        expect(clampVk(Number.NaN)).toBe(0)
        expect(clampVk(0x300)).toBe(0)
    })
})

describe("skill-cd-overlay", () => {
    it("空列表时补一条默认的 E 键绑定,保证设置页始终可编辑", () => {
        const keys = normalizeKeyBindings([])
        expect(keys).toHaveLength(1)
        expect(keys[0].vk).toBe(0x45)
        expect(keys[0].label).toBe("E")
        expect(keys[0].cdSeconds).toBe(SKILL_CD_OVERLAY_DEFAULTS.cdSeconds)
        expect(keys[0].enabled).toBe(true)
    })

    it("整组配置只占一个存储键", () => {
        expect(SKILL_CD_OVERLAY_STORAGE_KEY).toBe("setting_skill_cd_overlay")
    })

    it("默认设置每次调用都返回互不影响的新对象", () => {
        const first = createDefaultSkillCdOverlaySettings()
        const second = createDefaultSkillCdOverlaySettings()
        expect(first).not.toBe(second)
        expect(first.keys).not.toBe(second.keys)
        first.keys.push(createKeyBinding({ vk: 0x45 }))
        first.scale = 2
        expect(second.keys).toHaveLength(0)
        expect(second.scale).toBe(SKILL_CD_OVERLAY_DEFAULTS.scale)
        // 默认值本身就要能直接喂给组装函数(不依赖任何用户输入)
        expect(buildFloatWindowConfig(first).processNames).toEqual([SKILL_CD_OVERLAY_DEFAULTS.processName])
    })

    it("剔除非法键码、补全标签、钳制 CD 并去重", () => {
        const keys = normalizeKeyBindings([
            { id: "a", vk: 0x45, cdSeconds: 8 },
            { vk: 0, cdSeconds: 8 },
            { label: "酷炫", vk: 0x51, cdSeconds: 9999 },
            { label: "重复", vk: 0x45, cdSeconds: 8 },
            { vk: 0x46, cdSeconds: "bad", enabled: false },
            { vk: 0x45, cdSeconds: 8, enabled: false },
        ])
        expect(keys.map(key => key.vk)).toEqual([0x45, 0x51, 0x46, 0x45])
        expect(keys[0].label).toBe("E")
        expect(keys[1].label).toBe("酷炫")
        expect(keys[1].cdSeconds).toBe(600)
        expect(keys[2].cdSeconds).toBe(2.7)
        expect(keys[2].enabled).toBe(false)
        expect(keys[3].enabled).toBe(false)
    })

    it("限制最多可配置的按键数量", () => {
        const raw = Array.from({ length: SKILL_CD_MAX_KEYS + 5 }, (_, index) => ({
            vk: 0x41 + index,
            cdSeconds: 8,
        }))
        expect(normalizeKeyBindings(raw)).toHaveLength(SKILL_CD_MAX_KEYS)
    })

    it("clampCdSeconds 对非法值给出默认 8 秒", () => {
        expect(clampCdSeconds(Number.NaN)).toBe(2.7)
        expect(clampCdSeconds(0.1)).toBe(0.5)
        expect(clampCdSeconds(20)).toBe(20)
    })

    it("解析进程名输入并忽略重复/空白", () => {
        expect(parseProcessNames(" EM-Win64-Shipping.exe , em-win64-shipping.exe\nEM.exe ")).toEqual(["EM-Win64-Shipping.exe", "EM.exe"])
        expect(parseProcessNames("   ")).toEqual([])
    })

    it("钳制锚点使浮窗完整落在客户区内", () => {
        expect(clampAnchorInside(50, 10)).toBe(50)
        expect(clampAnchorInside(100, 10)).toBe(ANCHOR_MAX_PERCENT - 10)
        expect(clampAnchorInside(-5, 10)).toBe(0)
        expect(clampAnchorInside(Number.NaN, 10)).toBe(0)
        expect(clampAnchorInside(100, 200)).toBe(0)
    })

    it("组装配置时归一化各字段并沿用默认配色", () => {
        const config = buildFloatWindowConfig({
            anchorXPercent: 130,
            anchorYPercent: -20,
            scale: 9,
            discAlpha: 0.5,
            hideWhenReady: true,
            hideWhenGameMissing: false,
            gameOnlyTrigger: true,
            processName: "EM-Win64-Shipping.exe, custom.exe",
            keys: [createKeyBinding({ vk: 0x45, cdSeconds: 9 })],
        })
        expect(config.anchorXPercent).toBe(100)
        expect(config.anchorYPercent).toBe(0)
        expect(config.scale).toBe(3)
        expect(config.discAlpha).toBe(0.5)
        expect(config.hideWhenReady).toBe(true)
        expect(config.hideWhenGameMissing).toBe(false)
        expect(config.gameOnlyTrigger).toBe(true)
        expect(config.processNames).toEqual(["EM-Win64-Shipping.exe", "custom.exe"])
        expect(config.ringColor).toBe(SKILL_CD_OVERLAY_COLORS.ringColor)
        expect(config.discColor).toBe(SKILL_CD_OVERLAY_COLORS.discColor)
        expect(config.keys).toHaveLength(1)
        expect(config.keys[0].cdSeconds).toBe(9)
    })
})
