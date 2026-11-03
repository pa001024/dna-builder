<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { MIND_MAP_BOX, type MindMapLayoutNode } from "@/utils/mindMapLayout"

const props = defineProps<{
    node: MindMapLayoutNode
    selected: boolean
    editing: boolean
    hasChildren: boolean
    collapsed: boolean
    /** 拖拽落点高亮 */
    dropTarget?: boolean
}>()

const emit = defineEmits<{
    (e: "toggle-collapse", id: string): void
    (e: "commit", id: string, text: string): void
    (e: "cancel"): void
}>()

const textarea = ref<HTMLTextAreaElement | null>(null)
const draft = ref("")

watch(
    () => props.editing,
    async editing => {
        if (!editing) return
        draft.value = props.node.lines.join("")
        await nextTick()
        textarea.value?.focus()
        textarea.value?.select()
    },
    { immediate: true }
)

/** 提交编辑：空文本视为取消，保留原文字 */
function commit() {
    const next = draft.value.replace(/\s+$/, "")
    if (!next.trim()) {
        emit("cancel")
        return
    }
    emit("commit", props.node.id, next)
}

const boxStyle = computed(() => ({
    left: `${props.node.x}px`,
    top: `${props.node.y}px`,
    width: `${props.node.width}px`,
    height: `${props.node.height}px`,
    fontSize: `${props.node.style.fontSize}px`,
    paddingLeft: `${MIND_MAP_BOX.paddingX}px`,
    paddingRight: `${MIND_MAP_BOX.paddingX}px`,
    paddingTop: `${MIND_MAP_BOX.paddingY}px`,
    paddingBottom: `${MIND_MAP_BOX.paddingY}px`,
    // 根主题用白字，其余用分支色
    color: props.node.depth === 0 ? "#fff" : props.node.style.color,
}))

const isRoot = computed(() => props.node.depth === 0)
const isBranch = computed(() => props.node.depth === 1)
const color = computed(() => props.node.style.color)

/** 根主题实心填充、一级主题描边、其余主题只用文字与虚线下划线 */
const skinClass = computed(() => {
    if (isRoot.value) return "mind-node--root"
    if (isBranch.value) return "mind-node--branch"
    return "mind-node--leaf"
})

const skinStyle = computed(() => {
    if (isRoot.value) return { background: color.value, borderColor: color.value, color: "#fff" }
    if (isBranch.value) return { borderColor: color.value }
    return {}
})
</script>

<template>
    <div
        class="mind-node absolute flex cursor-grab items-center justify-center rounded-xs transition-shadow duration-150"
        :class="[skinClass, { 'mind-node--selected': selected, 'mind-node--drop': dropTarget, 'mind-node--editing': editing }]"
        :style="{ ...boxStyle, ...skinStyle }"
        :data-mind-id="node.id"
    >
        <div class="w-full" :class="isRoot ? 'font-semibold' : isBranch ? 'font-medium' : ''">
            <textarea
                v-if="editing"
                ref="textarea"
                v-model="draft"
                class="nodrag nopan nowheel w-full resize-none border-0 bg-transparent p-0 leading-[1.35] outline-none"
                :style="{ fontSize: `${node.style.fontSize}px`, height: `${Math.max(18, node.height - 12)}px` }"
                @keydown.enter.exact.prevent="commit"
                @keydown.esc.prevent="emit('cancel')"
                @blur="commit"
                @pointerdown.stop
                @mousedown.stop
                @click.stop
            />
            <div v-else class="whitespace-pre leading-[1.35]">
                <div v-for="(line, index) in node.lines" :key="index">{{ line }}</div>
            </div>
        </div>

        <!-- 折叠开关：有子级时才出现 -->
        <button
            v-if="hasChildren"
            type="button"
            class="nodrag nopan absolute -right-2 top-1/2 grid size-4 cursor-pointer place-items-center rounded-full border text-[9px] leading-none"
            :style="{ borderColor: color, color, background: 'var(--color-base-100)' }"
            :title="collapsed ? '展开子树' : '折叠子树'"
            @pointerdown.stop
            @mousedown.stop
            @click.stop="emit('toggle-collapse', node.id)"
        >
            <Icon :icon="collapsed ? 'ri:add-line' : 'ri:subtract-line'" class="size-2.5" />
        </button>
    </div>
</template>

<style scoped>
.mind-node {
    border: 1px solid transparent;
}
.mind-node--root {
    border-radius: 999px;
    color: #fff;
}
.mind-node--branch {
    border-radius: 3px;
    background: color-mix(in srgb, currentColor 8%, transparent);
}
.mind-node--leaf {
    border-radius: 0;
    border-bottom: 1px dashed currentColor;
}
.mind-node--selected {
    z-index: 1;
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 22%, transparent);
}
.mind-node--drop {
    outline: 2px dashed currentColor;
    outline-offset: 2px;
}
.mind-node--editing {
    cursor: text;
    background: var(--color-base-100);
    box-shadow: 0 0 0 2px var(--color-primary);
}
</style>
