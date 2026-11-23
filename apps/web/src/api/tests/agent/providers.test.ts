import { describe, expect, it } from "vitest"
import { AI_PROVIDER_PRESETS, findAiProviderPreset, resolveAiProviderByBaseUrl } from "@/api/agent/providers"

describe("AI_PROVIDER_PRESETS", () => {
    it("id 与基址唯一，避免下拉回显歧义", () => {
        expect(new Set(AI_PROVIDER_PRESETS.map(preset => preset.id)).size).toBe(AI_PROVIDER_PRESETS.length)
        expect(new Set(AI_PROVIDER_PRESETS.map(preset => preset.baseUrl)).size).toBe(AI_PROVIDER_PRESETS.length)
    })

    it("包含本地 magpie 网关与固定密钥", () => {
        const magpie = findAiProviderPreset("magpie")

        expect(magpie?.baseUrl).toBe("http://127.0.0.1:3425/v1")
        expect(magpie?.apiKey).toBe("magpie")
        expect(magpie?.local).toBe(true)
        // magpie 的模型列表在站点根，不在 /v1 下
        expect(magpie?.modelsPath).toBe("/models")
    })
})

describe("resolveAiProviderByBaseUrl", () => {
    it("忽略首尾空白与尾斜杠", () => {
        expect(resolveAiProviderByBaseUrl(" https://api.openai.com/v1/ ")?.id).toBe("openai")
        expect(resolveAiProviderByBaseUrl("https://api.deepseek.com")?.id).toBe("deepseek")
    })

    it("手填地址不误判为预设", () => {
        expect(resolveAiProviderByBaseUrl("https://my-gateway.example.com/v1")).toBeUndefined()
        expect(resolveAiProviderByBaseUrl("")).toBeUndefined()
    })
})
