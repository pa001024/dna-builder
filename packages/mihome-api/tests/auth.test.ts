import { describe, expect, it } from "vitest"
import { AuthStore, InMemoryTokenStore } from "../src/auth"

describe("auth store round-trip", () => {
    it("persists strings and integers through an in-memory store", () => {
        const backing = new InMemoryTokenStore()
        const auth = new AuthStore(backing)
        expect(auth.getStr("ssecurity")).toBeNull()
        expect(auth.containsAll(["ssecurity", "userId"])).toBe(false)
        auth.set("ssecurity", "abc")
        auth.set("userId", 42)
        auth.save()
        const reopened = new AuthStore(backing)
        expect(reopened.getStr("ssecurity")).toBe("abc")
        expect(reopened.getI64("userId")).toBe(42)
        expect(reopened.containsAll(["ssecurity", "userId"])).toBe(true)
    })
    it("corrupt blobs reset to logged-out instead of throwing", () => {
        const backing = new InMemoryTokenStore()
        backing.save("{not json")
        const auth = new AuthStore(backing)
        expect(auth.getStr("ssecurity")).toBeNull()
        expect(auth.containsAll(["ssecurity"])).toBe(false)
    })
    it("clear wipes memory and backing", () => {
        const backing = new InMemoryTokenStore()
        const auth = new AuthStore(backing)
        auth.set("ssecurity", "abc")
        auth.save()
        auth.clear()
        expect(backing.load()).toBeNull()
        expect(new AuthStore(backing).containsAll(["ssecurity"])).toBe(false)
    })
})
