<script lang="ts" setup>
import type { ImprEntry } from "@/data/d/impr"
import { getImprType, getRegionType } from "@/utils/quest-utils"

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
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 印象档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Impression File
            </p>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SRouterLink
                    :to="getImprRoute()"
                    class="wrap-break-word font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                >
                    {{ props.entry.sourceName }}
                </SRouterLink>
                <CopyID :id="props.entry.sourceId" />
            </div>
        </header>

        <!-- 印象信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="IMPRESSION" title="印象信息" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">来源</span>
                    <span class="text-right text-xs font-medium">{{ $t(`database.${props.entry.sourceType}`) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">地区</span>
                    <span class="text-right text-xs font-medium">{{ props.entry.regionLabel }}</span>
                </div>
                <div
                    v-if="props.entry.sourceSubRegionId"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="shrink-0 text-xs text-base-content/60">子区域</span>
                    <SubRegionLink :sub-region-id="props.entry.sourceSubRegionId" />
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">印象</span>
                    <span class="text-right text-xs font-medium">
                        {{ $t(getImprType(props.entry.valueType)) }}
                        <b class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ props.entry.value > 0 ? `+${props.entry.value}` : props.entry.value }}
                        </b>
                    </span>
                </div>
            </div>
        </section>

        <!-- 选项 -->
        <section
            v-if="props.entry.sourceOptions?.length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="OPTIONS" title="选项" />
            <div class="space-y-2">
                <div
                    v-for="(option, optionIndex) in props.entry.sourceOptions"
                    :key="option.id"
                    class="rounded-xs border px-2.5 py-1.5 transition-colors duration-200"
                    :class="
                        optionIndex === props.entry.sourceOptionIndex
                            ? 'border-primary/70 bg-primary/10'
                            : 'border-base-content/10 bg-base-content/3'
                    "
                >
                    <div class="flex items-start gap-2">
                        <span
                            class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border text-[9px] font-semibold tabular-nums"
                            :class="
                                optionIndex === props.entry.sourceOptionIndex
                                    ? 'border-primary bg-primary text-primary-content'
                                    : 'border-base-content/25 text-base-content/60'
                            "
                        >
                            {{ optionIndex + 1 }}
                        </span>

                        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            <span class="leading-4 whitespace-normal text-base-content/90">
                                {{ option.content }}
                            </span>

                            <span
                                v-for="impression in option.impr
                                    ? [{ regionId: option.impr[0], typeLabel: $t(getImprType(option.impr[1])), value: option.impr[2] }]
                                    : []"
                                :key="`${option.id}-${impression.regionId}-${impression.typeLabel}-impr`"
                                class="rounded-xs border px-1.5 py-0.5 text-xs leading-none tabular-nums"
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
        </section>

        <!-- 来源链接 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" title="来源链接" />
            <SRouterLink
                :to="getSourceRoute()"
                class="break-all text-sm font-medium text-primary transition-colors duration-150 hover:text-primary/80"
            >
                {{ props.entry.sourceName }}
            </SRouterLink>
        </section>
    </div>
</template>
