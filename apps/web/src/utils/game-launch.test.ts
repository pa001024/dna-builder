import { describe, expect, it } from "vitest"
import { buildGameLaunchParams } from "@/utils/game-launch"

const base = {
    pathParams: "",
    modEnable: false,
    modLoader: "legacy",
    dx11Enable: false,
    logAnalysisEnable: false,
}

describe("buildGameLaunchParams", () => {
    it("按当前设置拼接用户参数、Legacy、DX11 与日志参数", () => {
        expect(
            buildGameLaunchParams({
                ...base,
                pathParams: "-windowed",
                modEnable: true,
                dx11Enable: true,
                logAnalysisEnable: true,
            })
        ).toBe("-windowed -fileopenlog -dx11 -EnableShippingLog -LogTimes -LogFiles")
    })

    it("没有用户参数时不产生前导空格", () => {
        expect(buildGameLaunchParams({ ...base, dx11Enable: true })).toBe("-dx11")
    })

    it("日志参数已存在时不重复追加（忽略大小写）", () => {
        expect(buildGameLaunchParams({ ...base, pathParams: "-logtimes", logAnalysisEnable: true })).toBe(
            "-logtimes -EnableShippingLog -LogFiles"
        )
    })

    it("非 Legacy 加载器不追加 -fileopenlog", () => {
        expect(buildGameLaunchParams({ ...base, modEnable: true, modLoader: "other" })).toBe("")
    })
})
