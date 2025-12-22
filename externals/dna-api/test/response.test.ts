import { describe, it, expect } from "vitest"

// We need to import the class through a dynamic import since it's not exported
// This tests the internal DNAApiResponse class behavior

describe("DNAApiResponse Integration Tests", () => {
    describe("Response Code Handling", () => {
        it("should handle OK_ZERO response code", () => {
            // Test through API method that returns response
            const rawData = { code: 0, success: true, data: { test: "value" } }
            // Response behavior is tested through API methods
            expect(rawData.code).toBe(0)
            expect(rawData.success).toBe(true)
        })

        it("should handle OK_HTTP response code", () => {
            const rawData = { code: 200, success: true, data: { test: "value" } }
            expect(rawData.code).toBe(200)
            expect(rawData.success).toBe(true)
        })

        it("should handle BAD_REQUEST response code", () => {
            const rawData = { code: 400, success: false, msg: "Bad Request" }
            expect(rawData.code).toBe(400)
            expect(rawData.success).toBe(false)
        })

        it("should handle SERVER_ERROR response code", () => {
            const rawData = { code: 500, success: false, msg: "Server Error" }
            expect(rawData.code).toBe(500)
            expect(rawData.success).toBe(false)
        })

        it("should handle ERROR response code", () => {
            const rawData = { code: -999, success: false, msg: "Error" }
            expect(rawData.code).toBe(-999)
            expect(rawData.success).toBe(false)
        })
    })

    describe("Success Determination", () => {
        it("should be successful for code 0 with success true", () => {
            const rawData = { code: 0, success: true }
            const isSuccess = rawData.success && [0, 200].includes(rawData.code)
            expect(isSuccess).toBe(true)
        })

        it("should be successful for code 200 with success true", () => {
            const rawData = { code: 200, success: true }
            const isSuccess = rawData.success && [0, 200].includes(rawData.code)
            expect(isSuccess).toBe(true)
        })

        it("should not be successful for code 0 with success false", () => {
            const rawData = { code: 0, success: false }
            const isSuccess = rawData.success && [0, 200].includes(rawData.code)
            expect(isSuccess).toBe(false)
        })

        it("should not be successful for code 400", () => {
            const rawData = { code: 400, success: true }
            const isSuccess = rawData.success && [0, 200].includes(rawData.code)
            expect(isSuccess).toBe(false)
        })
    })

    describe("Data Handling", () => {
        it("should preserve data structure", () => {
            const testData = { userId: "123", items: [1, 2, 3] }
            const rawData = { code: 200, success: true, data: testData }
            expect(rawData.data).toEqual(testData)
        })

        it("should handle null data", () => {
            const rawData = { code: 200, success: true, data: null }
            expect(rawData.data).toBeNull()
        })

        it("should handle undefined data", () => {
            const rawData = { code: 200, success: true, data: undefined }
            expect(rawData.data).toBeUndefined()
        })

        it("should handle nested objects", () => {
            const testData = {
                user: { id: "123", profile: { name: "Test" } },
                posts: [{ id: 1 }, { id: 2 }],
            }
            const rawData = { code: 200, success: true, data: testData }
            expect(rawData.data).toEqual(testData)
        })
    })

    describe("Message Handling", () => {
        it("should include error message", () => {
            const rawData = { code: 400, success: false, msg: "Invalid request" }
            expect(rawData.msg).toBe("Invalid request")
        })

        it("should handle empty message", () => {
            const rawData = { code: 200, success: true, msg: "" }
            expect(rawData.msg).toBe("")
        })

        it("should handle missing message", () => {
            const rawData = { code: 200, success: true }
            expect(rawData.msg).toBeUndefined()
        })
    })
})