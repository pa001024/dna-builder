import { afterEach, describe, expect, it } from "bun:test"
import type { Context } from "../yoga"
import { verifyDataSyncAccess } from "./syncAccess"

const originalApiToken = process.env.API_TOKEN

afterEach(() => {
    if (originalApiToken === undefined) {
        delete process.env.API_TOKEN
    } else {
        process.env.API_TOKEN = originalApiToken
    }
})

describe("verifyDataSyncAccess", () => {
    it("应该允许管理员 JWT", () => {
        expect(() => verifyDataSyncAccess(undefined, { user: { id: "1", name: "admin", roles: ["admin"] } } as Context)).not.toThrow()
    })

    it("应该保留 API token 兼容路径", () => {
        process.env.API_TOKEN = "test-token"
        expect(() => verifyDataSyncAccess("test-token", {} as Context)).not.toThrow()
    })

    it("应该拒绝普通用户的空 token", () => {
        expect(() => verifyDataSyncAccess(undefined, { user: { id: "2", name: "user", roles: [] } } as unknown as Context)).toThrow(
            "need api token"
        )
    })
})
