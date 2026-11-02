import { describe, expect, test } from "bun:test"
import { getMihomeStore } from "./fileStore"

describe("mihome fileStore", () => {
    test("单例可用；无存储环境下读写不抛错", async () => {
        const store = getMihomeStore()
        await store.ready
        expect(getMihomeStore()).toBe(store)
        expect(store.load()).toBeNull()
        expect(() => store.save('{"a":1}')).not.toThrow()
        expect(() => store.clear()).not.toThrow()
        expect(store.load()).toBeNull()
    })
})
