import { describe, expect, it } from "vitest"
import { AFK_KINDS, EVENT_SCHEMA, resolveValueOptions, schemaFieldsFor } from "./eventSchema"

describe("eventSchema", () => {
    it("覆盖全部 kind 且字段非空", () => {
        for (const kind of AFK_KINDS) {
            expect(EVENT_SCHEMA[kind]?.length).toBeGreaterThan(0)
        }
    })

    it("空 kind 返回全量字段并集", () => {
        const fields = schemaFieldsFor(undefined).map(item => item.field)
        expect(fields).toContain("status")
        expect(fields).toContain("rarity")
        expect(new Set(fields).size).toBe(fields.length)
    })

    it("dungeon id 取副本下拉，status 取枚举", () => {
        expect(resolveValueOptions("dungeon", "id")).toBe("dungeons")
        expect(resolveValueOptions("dungeon", "status")).toEqual([
            { value: "enter", labelKey: "automation.value_enter" },
            { value: "complete", labelKey: "automation.value_complete" },
        ])
    })

    it("唯一命中的枚举直接返回（id 只有 dungeon 定义了下拉）", () => {
        expect(resolveValueOptions(undefined, "id")).toBe("dungeons")
        expect(resolveValueOptions(undefined, "name")).toBeNull()
        expect(resolveValueOptions(undefined, "nope")).toBeNull()
    })
})
