import { describe, expect, test } from "bun:test"
import { account } from "./index"

describe("mihome account", () => {
    test("暴露登录与场景能力", () => {
        for (const key of ["status", "qrBegin", "qrWait", "logout", "listScenes"] as const) {
            expect(typeof account[key]).toBe("function")
        }
    })
})
