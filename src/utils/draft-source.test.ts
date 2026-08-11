import { describe, expect, it } from "vitest"
import { resourceMap } from "@/data"
import { collectIronTicketDraftSources, collectResourceDraftSources } from "./draft-source"

describe("collectResourceDraftSources", () => {
    it("应该把资源 10012 反查到设计稿 2033", () => {
        const resource = resourceMap.get(10012)
        expect(resource).toBeDefined()

        const sources = collectResourceDraftSources(resource!)
        expect(sources.some(source => source.draft.id === 2033)).toBe(true)
    })

    it("应该把深境罗盘 1002 反查到对应设计稿", () => {
        const sources = collectIronTicketDraftSources(1002)

        expect(sources.some(source => source.draft.id === 1056)).toBe(true)
        expect(sources.some(source => source.draft.id === 1057)).toBe(true)
    })
})
