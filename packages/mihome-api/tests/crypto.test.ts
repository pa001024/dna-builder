import { describe, expect, it } from "vitest"
import {
    b64decode,
    b64encode,
    decryptRc4,
    encryptRc4,
    encSignature,
    generateEncParams,
    genNonce,
    rc4Crypt,
    sha1,
    sha256,
    signedNonce,
} from "../src/crypto"

const hexOf = (b: Uint8Array): string => [...b].map(x => x.toString(16).padStart(2, "0")).join("")

describe("sha", () => {
    it("sha1 matches known digest", () => {
        expect(hexOf(sha1(new TextEncoder().encode("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d")
    })
    it("sha256 matches known digest", () => {
        expect(hexOf(sha256(new TextEncoder().encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    })
})

describe("vectors derived from the Rust implementation", () => {
    it("signedNonce is stable and matches Rust", () => {
        expect(signedNonce("c2VjcmV0", "bm9uY2U=")).toBe("BwUG2ggEQPnD34LgcfsEvBoWE2xakjeXV5YQHCh9nxc=")
    })
    it("encSignature matches Rust", () => {
        const sn = signedNonce("c2VjcmV0", "bm9uY2U=")
        expect(encSignature("/appgateway/miot/appsceneservice/AppSceneService/NewRunScene", "POST", sn, [["data", '{"a":1}']])).toBe(
            "EBqcdG7JvBngH1cg0soQRhb1t3w="
        )
    })
    it("encryptRc4 matches Rust", () => {
        expect(encryptRc4("c2VjcmV0", "hello mijia")).toBe("Y8VY/MMTt7LlOQM=")
    })
    it("decryptRc4 inverts Rust output", () => {
        expect(hexOf(decryptRc4("c2VjcmV0", "Y8VY/MMTt7LlOQM="))).toBe("68656c6c6f206d696a6961")
    })
    it("generateEncParams matches Rust", () => {
        const sn = signedNonce("c2VjcmV0", "bm9uY2U=")
        const out = generateEncParams("/some/uri", "POST", sn, "Tn9xAA==", [["data", '{"scene_id":"42"}']], "c2VjcmV0")
        expect(out).toEqual([
            ["data", "GDaFoDT3XTqbd8JqKM25Ki8="],
            ["rc4_hash__", "FGWAgQPcfi6eRpU5covkMRatTYMlP/ae5QcBGw=="],
            ["signature", "9JEiFieqWhXh9XxVq/SwVrhpksA="],
            ["ssecurity", "c2VjcmV0"],
            ["_nonce", "Tn9xAA=="],
        ])
    })
})

describe("rc4", () => {
    it("round-trips with 1024-byte discard", () => {
        const key = new TextEncoder().encode("test-key-123")
        const data = new TextEncoder().encode("hello mijia world")
        const enc = rc4Crypt(key, data, 1024)
        expect(enc).not.toEqual(data)
        expect(rc4Crypt(key, enc, 1024)).toEqual(data)
    })
})

describe("misc", () => {
    it("genNonce is base64 with 8-byte random head", () => {
        const raw = b64decode(genNonce())
        expect(raw.length).toBeGreaterThanOrEqual(9)
        expect(raw.length).toBeLessThanOrEqual(16)
    })
    it("base64 round-trips binary", () => {
        const bytes = new Uint8Array([0, 1, 2, 250, 255])
        expect(b64decode(b64encode(bytes))).toEqual(bytes)
    })
})
