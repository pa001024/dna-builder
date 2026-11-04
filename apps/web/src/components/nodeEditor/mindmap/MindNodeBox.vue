<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { MIND_MAP_BOX, type MindMapLayoutNode } from "@/utils/mindMapLayout"

const props = defineProps<{
    node: MindMapLayoutNode
    selected: boolean
    editing: boolean
    hasChildren: boolean
    collapsed: boolean
    /** 子主题数量：折叠后显示在圆点里 */
    childCount?: number
    /** 指针悬停在此主题上（绑定卡片的悬停需要由导图单独跟踪） */
    hovered?: boolean
    /** 拖拽落点高亮 */
    dropTarget?: boolean
    /** 绑定了画布节点：只画定位框，真实节点由 Vue Flow 渲染 */
    bound?: boolean
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

/** 绑定主题的定位框：完全不画边框/底色，只保留折叠开关与落点高亮 */
const boundFrameStyle = computed(() => ({ color: color.value }))
</script>

<template>
    <!-- 绑定画布节点的主题：盒子本身透明，真实节点由 Vue Flow 画在同一位置 -->
    <div
        v-if="bound"
        class="mind-node mind-node--bound absolute rounded-xs"
        :class="{ 'mind-node--drop': dropTarget, 'mind-node--hovered': hovered }"
        :style="{ ...boxStyle, ...boundFrameStyle }"
        :data-mind-id="node.id"
    >
        <!-- 展开/折叠圆点：位于节点下方，悬停时出现；折叠后带子主题数量常驻 -->
        <button
            v-if="hasChildren"
            type="button"
            class="mind-toggle nodrag nopan absolute grid cursor-pointer place-items-center rounded-full border leading-none"
            :class="[{ 'mind-toggle--collapsed': collapsed }, collapsed ? 'size-4 text-[9px]' : 'size-3']"
            :style="{ borderColor: color, color, background: 'var(--color-base-100)' }"
            :title="collapsed ? `展开 ${childCount ?? 0} 个子主题` : '折叠子主题'"
            @pointerdown.stop
            @mousedown.stop
            @click.stop="emit('toggle-collapse', node.id)"
        >
            <span v-if="collapsed">{{ childCount ?? 0 }}</span>
        </button>
    </div>

    <div
        v-else
        class="mind-node absolute flex cursor-grab items-center justify-center rounded-xs transition-shadow duration-150"
        :class="[
            skinClass,
            { 'mind-node--selected': selected, 'mind-node--hovered': hovered, 'mind-node--drop': dropTarget, 'mind-node--editing': editing },
        ]"
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

        <!-- 展开/折叠圆点：位于节点下方，悬停或选中时出现；折叠后带子主题数量常驻 -->
        <button
            v-if="hasChildren"
            type="button"
            class="mind-toggle nodrag nopan absolute grid cursor-pointer place-items-center rounded-full border leading-none"
            :class="[{ 'mind-toggle--collapsed': collapsed }, collapsed ? 'size-4 text-[9px]' : 'size-3']"
            :style="{ borderColor: color, color, background: 'var(--color-base-100)' }"
            :title="collapsed ? `展开 ${childCount ?? 0} 个子主题` : '折叠子主题'"
            @pointerdown.stop
            @mousedown.stop
            @click.stop="emit('toggle-collapse', node.id)"
        >
            <span v-if="collapsed">{{ childCount ?? 0 }}</span>
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
.mind-node--bound {
    cursor: default;
    background: transparent;
    border: 1px solid transparent;
    /* 盒子只承载折叠圆点与落点高亮，节点本体接管指针事件 */
    pointer-events: none;
}
/* 节点下方的展开/折叠圆点：默认隐藏，悬停、选中或折叠后常驻 */
.mind-toggle {
    top: 100%;
    left: 50%;
    z-index: 2;
    transform: translateX(-50%);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
}
.mind-node:hover .mind-toggle,
.mind-node--selected .mind-toggle,
.mind-node--hovered .mind-toggle,
.mind-toggle--collapsed {
    opacity: 1;
    pointer-events: auto;
}
</style>
