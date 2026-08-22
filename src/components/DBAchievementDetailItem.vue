<script lang="ts" setup>
type AchievementItem = (typeof import("@/data/d/achievement.data").default)[number]

const props = defineProps<{
    achievement: AchievementItem
}>()

/**
 * 将品质数字转换为中文标签。
 */
function getQualityLabel(quality: number): string {
    return ["", "铜", "银", "金"][quality] || `${quality}`
}

/**
 * 将品质数字转换为图标资源后缀。
 */
function getQualityIcon(quality: number): string {
    return ["", "Copper", "Silver", "Gold"][quality] || "Copper"
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 成就档案头：纸面 + primary 强调线 + 斜切楔形 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Achievement File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/achievement/${achievement.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(achievement.名称) }}
                        </SRouterLink>
                        <CopyID :id="achievement.id" />
                    </div>
                </div>
                <img
                    v-if="achievement.品质"
                    :src="`/imgs/webp/Icon_Achievement_${getQualityIcon(achievement.品质)}.webp`"
                    alt="品质"
                    class="size-8 shrink-0 sm:size-10"
                />
            </div>
        </header>

        <!-- 基本信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BASIC" :title="$t('achievement-detail.basicInfo')" />
            <div class="space-y-1.5">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t("achievement-detail.name") }}</span>
                    <span class="truncate text-sm font-medium">{{ $t(achievement.名称) }}</span>
                </div>
                <div class="flex items-start justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 pt-0.5 text-xs text-base-content/60">{{ $t("achievement-detail.desc") }}</span>
                    <span class="text-right text-sm leading-relaxed">{{ $t(achievement.描述) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t("achievement-detail.category") }}</span>
                    <span class="truncate text-sm font-medium">{{ $t(achievement.分类) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t("achievement-detail.version") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ achievement.版本 }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t("achievement-detail.quality") }}</span>
                    <span class="shrink-0 text-sm font-medium">{{ getQualityLabel(achievement.品质) }}</span>
                </div>
            </div>
        </section>

        <!-- 奖励 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="REWARD" :title="$t('achievement-detail.reward')" />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem v-for="(value, key) in achievement.奖励" :name="key" :value="value!" :key="key" />
            </div>
        </section>
    </div>
</template>
