<script lang="ts" setup>
import type { ImprEntry } from "@/data/d/impr"
import { getImprType, getRegionType } from "@/data/d/quest.data"

const props = defineProps<{
    entry: ImprEntry
}>()

/**
 * 获取印象来源的站内路由。
 */
function getSourceRoute(): string {
    if (props.entry.sourceType === "npc") {
        return `/db/npc/${props.entry.sourceId}`
    }
    if (props.entry.sourceType === "dynquest") {
        return `/db/dynquest/${props.entry.sourceId}`
    }
    return `/db/questchain/${props.entry.sourceId}/${props.entry.sourceQuestId ?? props.entry.sourceId}`
}

/**
 * 获取印象列表的站内路由。
 */
function getImprRoute(): string {
    return `/db/impr?id=${encodeURIComponent(
        [
            props.entry.sourceType,
            props.entry.sourceId,
            props.entry.regionId,
            props.entry.sourceSubRegionId ?? "",
            props.entry.valueType,
        ].join("|")
    )}`
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-2">
            <SRouterLink :to="getImprRoute()" class="text-lg font-bold link link-primary wrap-break-word">
                {{ props.entry.sourceName }}
            </SRouterLink>
            <CopyID :id="props.entry.sourceId" />
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">印象信息</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">来源</span>
                    <span> {{ $t(`database.${props.entry.sourceType}`) }}</span>
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">地区</span>
                    <span>{{ props.entry.regionLabel }}</span>
                </div>
                <div v-if="props.entry.sourceSubRegionId" class="flex justify-between gap-2">
                    <span class="text-base-content/70">子区域</span>
                    <SubRegionLink :sub-region-id="props.entry.sourceSubRegionId" />
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">印象</span>
                    <span
                        >{{ $t(getImprType(props.entry.valueType)) }}
                        {{ props.entry.value > 0 ? `+${props.entry.value}` : props.entry.value }}</span
                    >
                </div>
            </div>
        </div>

        <div v-if="props.entry.sourceOptions?.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">选项</h3>
            <div class="space-y-2">
                <div
                    v-for="(option, optionIndex) in props.entry.sourceOptions"
                    :key="option.id"
                    class="group w-full rounded px-2.5 py-1.5 text-left text-xs transition-all duration-200"
                    :class="
                        optionIndex === props.entry.sourceOptionIndex ? 'bg-primary/80 shadow-sm' : 'bg-base-100/60 hover:bg-base-100/80'
                    "
                >
                    <div class="flex items-start gap-2">
                        <span
                            class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold"
                            :class="
                                optionIndex === props.entry.sourceOptionIndex
                                    ? 'border-primary bg-primary text-primary-content'
                                    : 'border-base-300 text-base-content/70'
                            "
                        >
                            {{ optionIndex + 1 }}
                        </span>

                        <div class="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                            <span class="leading-4 text-base-content/90 whitespace-normal">
                                {{ option.content }}
                            </span>

                            <span
                                v-for="impression in option.impr
                                    ? [{ regionId: option.impr[0], typeLabel: $t(getImprType(option.impr[1])), value: option.impr[2] }]
                                    : []"
                                :key="`${option.id}-${impression.regionId}-${impression.typeLabel}-impr`"
                                class="rounded border px-1.5 py-0.5 text-xs leading-none"
                                :class="
                                    impression.value > 0
                                        ? 'border-success/40 bg-success/10 text-success'
                                        : 'border-error/40 bg-error/10 text-error'
                                "
                            >
                                {{ $t(getRegionType(impression.regionId)) }}·{{ impression.typeLabel }}
                                {{ impression.value > 0 ? `+${impression.value}` : impression.value }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">来源链接</h3>
            <div>
                <SRouterLink :to="getSourceRoute()" class="link link-primary break-all">
                    {{ props.entry.sourceName }}
                </SRouterLink>
            </div>
        </div>
    </div>
</template>
