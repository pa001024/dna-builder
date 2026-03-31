import type { Draft } from "@/data/d/draft.data"
import draftData from "@/data/d/draft.data"
import type { Resource } from "@/data/d/resource.data"

export interface ResourceDraftSourceInfo {
    key: string
    draft: Draft
}

/**
 * 反查资源对应的图纸来源。
 * @param resource 资源数据
 * @returns 图纸来源列表
 */
export function collectResourceDraftSources(resource: Resource): ResourceDraftSourceInfo[] {
    const sources: ResourceDraftSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    for (const draft of draftData) {
        if (draft.t !== "Resource" || draft.p !== resource.id) {
            continue
        }

        const key = `draft-${draft.id}-${resource.id}`
        if (sourceKeySet.has(key)) {
            continue
        }

        sourceKeySet.add(key)
        sources.push({
            key,
            draft,
        })
    }

    return sources
}
