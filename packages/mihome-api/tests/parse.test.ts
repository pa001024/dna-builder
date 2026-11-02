import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { MiHomeClient } from "../src/client"
import { coercePropValue, deviceFromSpec } from "../src/device"
import { errorMessage } from "../src/errors"
import { isSpeaker, type Json, toDeviceInfo, toSceneInfo } from "../src/models"
import { formatMetricsText, isSubDevice } from "../src/service"
import { parseSpecInstance } from "../src/spec"
import { actionDescZh, applyFallback, propDescZh } from "../src/spec_zh"

const fixture = (name: string): Json => JSON.parse(readFileSync(resolve(__dirname, "fixtures", name), "utf-8")) as Json

describe("scene/device parsing", () => {
    it("toSceneInfo fills home fields and default names", () => {
        const scenes = fixture("scenes.json") as Json[]
        expect(toSceneInfo(scenes[0], "12345", "家")).toEqual({
            scene_id: "s1",
            name: "观影模式",
            home_id: "12345",
            home_name: "家",
        })
        expect(toSceneInfo(scenes[1], "12345", "家").name).toBe("未命名场景")
    })
    it("toDeviceInfo maps entries with room attribution", () => {
        const devices = fixture("devices.json") as Json[]
        expect(toDeviceInfo(devices[0], "家", "客厅")).toEqual({
            did: "did1",
            name: "客厅灯",
            model: "philips.light.bulb",
            home_name: "家",
            room_name: "客厅",
            online: true,
            spec_type: "urn:miot-spec-v2:device:light:00007802:philips-bulb:1",
        })
        const unnamed = toDeviceInfo(devices[1], "未知", "未知")
        expect(unnamed.name).toBe("did2")
        expect(unnamed.online).toBe(false)
    })
    it("isSpeaker matches third-party speakers", () => {
        const devices = fixture("devices.json") as Json[]
        expect(isSpeaker(toDeviceInfo(devices[1], "", ""))).toBe(true)
        expect(isSpeaker(toDeviceInfo(devices[0], "", ""))).toBe(false)
    })
    it("listScenes merges homes with a mocked fetch", async () => {
        const homes = fixture("homelist.json") as { homelist: Json[] }
        const scenes = fixture("scenes.json") as Json[]
        const fetchFn = vi.fn(async (url: unknown) => {
            const u = String(url)
            const result = u.includes("gethome_merged") ? { homelist: homes.homelist } : { manual_scene_info_list: scenes }
            return new Response(JSON.stringify({ code: 0, result }))
        })
        const store = {
            load: (): string | null => JSON.stringify({ ua: "ua", ssecurity: "c2VjcmV0", userId: "1", cUserId: "2", serviceToken: "t" }),
            save: (): void => {},
            clear: (): void => {},
        }
        const client = new MiHomeClient(store, fetchFn as typeof fetch)
        const out = await client.listScenes()
        expect(out).toEqual([
            { scene_id: "s1", name: "观影模式", home_id: "12345", home_name: "家" },
            { scene_id: "s2", name: "未命名场景", home_id: "12345", home_name: "家" },
        ])
    })
})

describe("spec parsing", () => {
    it("parses instance docs like the Rust port", () => {
        const info = parseSpecInstance("urn:miot-spec-v2:device:light:00007802:dummy:1", fixture("spec-instance.json"))
        expect(info.services.map(s => s.class)).toEqual(["light"])
        expect(info.services[0].desc_zh).toBe("灯光")
        expect(info.properties.map(p => [p.name, p.rw, p.type])).toEqual([
            ["on", "rw", "bool"],
            ["brightness", "rw", "uint"],
            ["mode", "rw", "uint"],
        ])
        expect(info.properties[1].range).toEqual([1, 100, 1])
        expect(info.actions.map(a => a.name)).toEqual(["toggle"])
    })
    it("spec_zh fallbacks match Rust behavior", () => {
        expect(propDescZh("on-2", "on")).toBe("on / 按键")
        expect(propDescZh("on-10", "")).toBe("开关")
        expect(propDescZh("mode", "模式")).toBe("模式")
        expect(actionDescZh("toggle", "")).toBe("切换")
        const info = parseSpecInstance("urn:x", fixture("spec-instance.json"))
        info.services[0].desc_zh = ""
        applyFallback(info)
        expect(info.services[0].desc_zh).toBe("灯光")
        expect(info.properties[0].description).toBe("Switch Status / 开关")
    })
    it("deviceFromSpec builds alias keys and coerce checks ranges", () => {
        const info = parseSpecInstance("urn:x", fixture("spec-instance.json"))
        applyFallback(info)
        const dev = deviceFromSpec("did1", "dummy", "灯", info)
        expect(dev.props.has("on")).toBe(true)
        const brightness = dev.props.get("brightness")
        expect(brightness).toBeDefined()
        expect(coercePropValue(brightness!, 50)).toBe(50)
        expect(() => coercePropValue(brightness!, 101)).toThrow()
    })
})

describe("helpers", () => {
    it("errorMessage covers cloud codes", () => {
        expect(errorMessage(-10007)).toBe("设备离线或者不存在")
        expect(errorMessage(-704042011)).toBe("设备离线")
        expect(errorMessage(123456)).toBe("未知错误")
    })
    it("metrics/sub-device helpers match Rust", () => {
        expect(formatMetricsText(28.3, 60)).toBe("28.3°C 60%")
        expect(formatMetricsText(283, 683)).toBe("28.3°C 68%")
        expect(formatMetricsText(undefined, undefined)).toBeNull()
        expect(isSubDevice("123.s3")).toBe(3)
        expect(isSubDevice("123")).toBeNull()
    })
})
