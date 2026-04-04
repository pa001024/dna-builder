import { describe, expect, it } from "vitest"
import { resourceMap } from "@/data"
import { collectResourceDraftSources } from "./draft-source"

describe("collectResourceDraftSources", () => {
    it("应该把资源 10012 反查到图纸 2033", () => {
        const resource = resourceMap.get(10012)
        expect(resource).toBeDefined()

        const sources = collectResourceDraftSources(resource!)
        expect(sources.some(source => source.draft.id === 2033)).toBe(true)
    })
})
