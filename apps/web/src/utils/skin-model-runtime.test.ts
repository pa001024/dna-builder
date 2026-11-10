import { describe, expect, it } from "vitest"
import { isGlb } from "./skin-model-runtime"

/** 造一段以 GLB 魔数开头的字节 */
function glbBytes(payload = 32): Uint8Array {
    const bytes = new Uint8Array(payload)
    bytes.set([0x67, 0x6c, 0x54, 0x46])
    return bytes
}

describe("model payload validation", () => {
    it("accepts a response that starts with the glTF magic", () => {
        const response = new Response(null, { headers: { "content-type": "model/gltf-binary" } })
        expect(isGlb(response, glbBytes())).toBe(true)
    })

    it("rejects the dev server's SPA fallback HTML for a missing model", () => {
        // 缺失的 /mock/models/<id>.glb 会落进 SPA fallback，回 200 + HTML
        const html = new TextEncoder().encode("<!doctype html><html><body>app</body></html>")
        const response = new Response(null, { headers: { "content-type": "text/html" } })
        expect(isGlb(response, html)).toBe(false)
    })

    it("rejects a truncated body even when the content type claims a model", () => {
        const response = new Response(null, { headers: { "content-type": "model/gltf-binary" } })
        expect(isGlb(response, new Uint8Array([0x67, 0x6c, 0x54]))).toBe(false)
        expect(isGlb(response, new Uint8Array(0))).toBe(false)
    })

    it("rejects bytes whose magic is not glTF", () => {
        const response = new Response(null, { headers: { "content-type": "model/gltf-binary" } })
        expect(isGlb(response, new Uint8Array(32))).toBe(false)
    })
})
