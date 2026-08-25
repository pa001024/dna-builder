<script setup lang="ts">
/**
 * 溯源展示组件，入参仅需要角色的溯源字段。
 * 同时兼容 Char（数据库详情）与 LeveledChar（构筑页）。
 */
defineProps<{
    char: { 溯源?: string[] }
}>()

/**
 * 获取角色溯源的序号文本。
 * @param index 溯源索引
 * @returns 适合展示的序号文本
 */
function getTraceOrdinal(index: number): string {
    const ordinals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
    return ordinals[index] || String(index + 1)
}
</script>

<template>
    <!-- 溯源信息 -->
    <section
        v-if="char.溯源 && char.溯源.length > 0"
        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
    >
        <SectionHeader no-animate compact kicker="TRACE" :title="$t('溯源')" />
        <div class="space-y-3">
            <div v-for="(trace, index) in char.溯源" :key="index" class="flex items-start gap-2.5">
                <span
                    class="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-xs bg-primary/10 px-1.5 font-orbitron text-[11px] font-semibold tabular-nums text-primary"
                    >{{ String(index + 1).padStart(2, "0") }}</span
                >
                <div class="min-w-0 pt-0.5">
                    <div class="text-[11px] tracking-wide text-base-content/45">{{ $t("第" + getTraceOrdinal(index) + "根源") }}</div>
                    <div class="mt-0.5 text-sm leading-relaxed text-base-content/90">{{ $t(trace) }}</div>
                </div>
            </div>
        </div>
    </section>
</template>
