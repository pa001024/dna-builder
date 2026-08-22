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
    const playerName = "玩家昵称"
    return props.title.suf ? `${playerName} · ${t(props.title.name)}` : `${t(props.title.name)} · ${playerName}`
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 称号档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <div class="flex items-center gap-3.5">
                <div class="size-16 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                    <img src="/imgs/webp/T_Icon_Random_Title.webp" alt="title-icon" class="h-full w-full object-cover" />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Title File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 class="truncate font-orbitron text-xl font-bold leading-none tracking-tight sm:text-2xl">
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
            <SectionHeader no-animate compact kicker="PREVIEW" title="称号预览" />
            <p class="text-sm leading-relaxed text-base-content/85">{{ titlePreview }}</p>
        </section>

        <!-- 来源 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" title="来源" />
            <p class="break-all text-sm leading-relaxed text-base-content/85">{{ title.src || "暂无来源说明" }}</p>
        </section>
    </div>
</template>
