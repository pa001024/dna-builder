import { describe, expect, it } from "vitest"
import { normalizeFrameAnimationLabel, parseUiFrameEntries } from "./import-ui-frame-lib"

describe("UI 动态框映射", () => {
    it("头像框只导入 DynamicPath，保留实际包路径和同框多 ID", () => {
        const source = `[10054] = { DynamicPath = "WidgetBlueprint'/Game/UI/WBP/DynamicHead/DynamicFrame/WBP_DynamicFrame_03.WBP_DynamicFrame_03'", FrameID = 10054 },
            [10055] = { Icon = "Texture2D'/Game/T_Head_Frame50.T_Head_Frame50'" },
            [10060] = { DynamicPath = "WidgetBlueprint'/Game/Other/WBP_DynamicFrame_03.WBP_DynamicFrame_03'" }`
        expect(parseUiFrameEntries(source, "head")).toEqual([
            {
                id: 10054,
                widget: "WBP_DynamicFrame_03",
                key: "03",
                package: "EM/Content/UI/WBP/DynamicHead/DynamicFrame/WBP_DynamicFrame_03",
            },
            { id: 10060, widget: "WBP_DynamicFrame_03", key: "03", package: "EM/Content/Other/WBP_DynamicFrame_03" },
        ])
        expect(parseUiFrameEntries(source, "title")).toEqual([])
    })

    it("称号框仍使用 FramePath，不混入头像框映射", () => {
        const source = `[10001] = { FramePath = "WidgetBlueprint'/Game/UI/WBP/PersonalInfo/Widget/Title/Title/WBP_PersonalInfo_Title_07_2.WBP_PersonalInfo_Title_07_2'" }`
        expect(parseUiFrameEntries(source, "title")[0]).toMatchObject({ id: 10001, key: "07_2" })
        expect(parseUiFrameEntries(source, "head")).toEqual([])
    })

    it("Auto_Loop 自动播放动画映射到共享的 loop 时间轴", () => {
        expect(normalizeFrameAnimationLabel("Auto_Loop")).toBe("loop")
        expect(normalizeFrameAnimationLabel("Auto_Loop_INST")).toBe("loop")
        expect(normalizeFrameAnimationLabel("In_INST")).toBe("in")
        expect(normalizeFrameAnimationLabel("Normal")).toBe("normal")
    })
})
