<script setup lang="ts">
/** 标题栏面板标签页：节点库 / 画布 / 性能；桌面端控制侧栏显隐，移动端整屏切换。 */
const model = defineModel<"palette" | "canvas" | "perf">()

const PANES = [
    { value: "palette", label: "节点库", icon: "ri:node-tree" },
    { value: "canvas", label: "画布", icon: "ri:artboard-2-line" },
    { value: "perf", label: "性能", icon: "ri:speed-line" },
] as const
</script>

<template>
    <div class="flex flex-none items-center gap-0.5" role="tablist" aria-label="面板切换">
        <button
            v-for="pane in PANES"
            :key="pane.value"
            type="button"
            role="tab"
            class="flex h-6 cursor-pointer items-center gap-1 border px-1.5 text-[10px] font-semibold transition-colors duration-150 active:scale-[0.97]"
            :class="
                model === pane.value
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-base-content/10 bg-base-100 text-base-content/60 hover:border-primary/30 hover:text-primary'
            "
            :aria-selected="model === pane.value"
            :title="pane.label"
            @click="model = pane.value"
        >
            <Icon :icon="pane.icon" class="size-3" />
            {{ pane.label }}
        </button>
    </div>
</template>
