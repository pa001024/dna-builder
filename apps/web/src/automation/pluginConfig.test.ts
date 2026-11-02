import { describe, expect, it } from "vitest"
import { readPluginGlobalConfig, writePluginGlobalConfig } from "./pluginConfig"

describe("pluginConfig", () => {
    it("无存储环境下读写不抛错", () => {
        expect(readPluginGlobalConfig("notify")).toEqual({})
        expect(() => writePluginGlobalConfig("notify", { title: "x" })).not.toThrow()
    })
})
