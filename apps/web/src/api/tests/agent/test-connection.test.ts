import { describe, expect, it } from "vitest"
import { aiTestConnection } from "@/api/agent/test-connection"

describe("aiTestConnection", () => {
    it("基址 / 密钥 / 模型缺一即抛错，不发出任何请求", async () => {
        await expect(aiTestConnection({ baseUrl: "", apiKey: "sk-x", model: "m" })).rejects.toThrow()
        await expect(aiTestConnection({ baseUrl: "https://api.example.com/v1", apiKey: "  ", model: "m" })).rejects.toThrow()
        await expect(aiTestConnection({ baseUrl: "https://api.example.com/v1", apiKey: "sk-x", model: "" })).rejects.toThrow()
    })
})
