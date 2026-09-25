<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import type { Title } from "@/data/d/title.data"

const props = defineProps<{
    title: Title
}>()
const { t } = useTranslation()

const titleTypeLabel = computed(() => {
    return props.title.suf ? "后缀" : "前缀"
})

const titlePreview = computed(() => {
    const playerName = "-"
    return props.title.suf ? `${playerName}${t(props.title.name)}` : `${t(props.title.name)}${playerName}`
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 称号档案头：纸面 + primary 强调线 -->
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
            <div class="relative flex items-center gap-3.5">
                <div class="size-16 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                    <img src="/imgs/webp/T_Icon_Random_Title.webp" alt="title-icon" class="h-full w-full object-cover" />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Title File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content sm:text-2xl">
                            {{ $t(title.name) }}
                        </h2>
                        <CopyID :id="title.id" />
                    </div>
                    <span
                        class="mt-2 inline-flex rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] tracking-wide text-base-content/55"
                    >
                        {{ titleTypeLabel }}
                    </span>
                </div>
            </div>
        </header>

        <!-- 称号预览 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PREVIEW" :title="$t('db-title-detail.title_preview')" />
            <p class="text-sm leading-relaxed text-base-content/85">{{ titlePreview }}</p>
        </section>

        <!-- 来源 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('common.source')" />
            <p class="break-all text-sm leading-relaxed text-base-content/85">{{ $t(title.src || "暂无来源说明") }}</p>
        </section>
    </div>
</template>
