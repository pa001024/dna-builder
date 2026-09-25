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
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Impression File
            </p>
            <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                <SRouterLink
                    :to="getImprRoute()"
                    class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                >
                    {{ $t(props.entry.sourceName) }}
                </SRouterLink>
                <CopyID :id="props.entry.sourceId" />
            </div>
        </header>

        <!-- 印象信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="IMPRESSION" :title="$t('db-impr-detail.impr_info')" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t('common.source') }}</span>
                    <span class="text-right text-xs font-medium">{{ $t(`database.${props.entry.sourceType}`) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t('common.region') }}</span>
                    <span class="text-right text-xs font-medium">{{ props.entry.regionLabel }}</span>
                </div>
                <div
                    v-if="props.entry.sourceSubRegionId"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t('common.sub_region') }}</span>
                    <SubRegionLink :sub-region-id="props.entry.sourceSubRegionId" />
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t('印象') }}</span>
                    <span class="text-right text-xs font-medium">
                        {{ $t(getImprType(props.entry.valueType)) }}
                        <b class="font-orbitron text-[13px] font-semibold text-primary">
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
            <SectionHeader no-animate compact kicker="OPTIONS" :title="$t('db-impr-detail.options')" />
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
                            class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border text-[9px] font-semibold"
                            :class="
                                optionIndex === props.entry.sourceOptionIndex
                                    ? 'border-primary bg-primary text-primary-content'
                                    : 'border-base-content/25 text-base-content/60'
                            "
                        >
                            {{ optionIndex + 1 }}
                        </span>

                        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            <span class="leading-4 whitespace-normal text-sm text-base-content/90">
                                {{ $t(option.content) }}
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
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('db-impr-detail.source_link')" />
            <SRouterLink
                :to="getSourceRoute()"
                class="break-all text-sm font-medium text-primary transition-colors duration-150 hover:text-primary/80"
            >
                {{ $t(props.entry.sourceName) }}
            </SRouterLink>
        </section>
    </div>
</template>
