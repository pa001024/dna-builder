<script lang="ts" setup>
import type { Draft } from "@/data/d/draft.data"
import { type ResourceDraftSourceInfo } from "@/utils/draft-source"

const props = defineProps<{
    draftSources: ResourceDraftSourceInfo[]
}>()

/**
 * 格式化图纸名称展示。
 * @param draft 图纸数据
 * @returns 图纸展示名称
 */
function getDraftLabel(draft: Draft): string {
    return `图纸: ${draft.n}`
}

/**
 * 将铸造时间转换为 00:00 格式。
 * @param minutes 铸造时间（分钟）
 * @returns 格式化后的时长
 */
function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}
</script>

<template>
    <div v-if="props.draftSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">{{ $t("database.draft") }}</div>
        <div class="grid grid-cols-1 gap-2">
            <div
                v-for="source in props.draftSources"
                :key="source.key"
                class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors duration-200"
            >
                <div class="flex flex-col gap-2">
                    <div class="flex items-start justify-between gap-2 min-w-0">
                        <div class="flex items-center gap-2 min-w-0">
                            <SRouterLink :to="`/db/draft/${source.draft.id}`" class="hover:underline min-w-0 truncate">
                                {{ getDraftLabel(source.draft) }}
                            </SRouterLink>
                            <span class="badge badge-sm badge-neutral">{{ formatDuration(source.draft.d) }}</span>
                        </div>
                        <CopyID :id="source.draft.id" />
                    </div>
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                        <ResourceCostItem name="铜币" :value="source.draft.m" />
                        <template v-for="material in source.draft.x" :key="`${source.draft.id}:${material.t}:${material.id}`">
                            <ResourceCostItem
                                :name="material.n"
                                :value="material.t === 'Resource' ? material.c : [material.c, material.id, material.t]"
                            />
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
