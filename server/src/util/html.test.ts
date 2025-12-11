import { describe, expect, it } from "bun:test"
import { sanitizeHTML } from "./html"

describe("sanitizeHTML", () => {
    it("should return sanitized HTML with only allowed tags and attributes", () => {
        const inputHTML = '<p><a href="#" style="color: red;">Hello</a></p><span style="font-size: 16px;">World</span>'
        const expectedOutput = '<p><a href="#" style="color: red;">Hello</a></p><span style="font-size: 16px;">World</span>'
        expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
    })

    it("should return empty string if input is empty", () => {
        const inputHTML = ""
        const expectedOutput = ""
        expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
    })

    it("should return same HTML if all tags and attributes are allowed", () => {
        const inputHTML = '<div><b style="font-weight: bold;">Test</b></div>'
        const expectedOutput = '<div><b style="font-weight: bold;">Test</b></div>'
        expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
    })

    it("should remove disallowed tags and attributes", () => {
        const inputHTML = '<p><a href="#" style="color: red;" target="_blank">Hello</a></p>'
        const expectedOutput = '<p><a href="#" style="color: red;">Hello</a></p>'
        expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
    })
})
