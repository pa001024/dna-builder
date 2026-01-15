<script setup lang="ts">
import { IconTypes } from "@/components/Icon.vue"
import { Handle, Position } from "@vue-flow/core"
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

// 获取store实例
const store = useNodeEditorStore()

// 切换收缩状态
const toggleCollapse = () => {
    // 直接调用store的updateNodeData方法更新节点数据
    store.updateNodeData(props.id, { isCollapsed: !props.data.isCollapsed })
}

// 节点样式类
const nodeClass = computed(() => {
    const classes = ["min-w-[200px]"]
    if (props.selected) {
        classes.push("ring-2", "ring-primary")
    }
    // 迷你模式样式
    if (props.data.isCollapsed) {
        classes.push("min-w-[120px]", "p-2")
    }
    return classes.join(" ")
})

// 输出端口 - 输入节点和计算节点应该有输出端口
const hasOutput = computed(() => {
    const type = props.type as string
    return type.includes("input") || type.includes("calc")
})

// 输入端口 - 计算节点和输出节点应该有输入端口
const hasInput = computed(() => {
    const type = props.type as string
    return type.includes("calc") || type.includes("output")
})

// 获取节点图标
const getIcon = (type: string): IconTypes => {
    const icons: Record<string, IconTypes> = {
        "char-input": "ri:user-line",
        "weapon-input": "ri:sword-line",
        "mod-input": "ri:grid-line",
        "buff-input": "ri:flashlight-line",
        "enemy-input": "ri:skull-line",
        "attr-calc": "ri:calculator-line",
        "weapon-attr-calc": "ri:sword-line",
        "skill-dmg-calc": "ri:magic-line",
        "weapon-dmg-calc": "ri:crosshair-line",
        "full-calc": "ri:refresh-line",
        "attr-output": "ri:bar-chart-line",
        "weapon-output": "ri:bar-chart-line",
        "damage-output": "ri:more-line",
        "ast-expression-calc": "ri:function-line",
    }
    return icons[type] || "ri:node-tree"
}
</script>

<template>
    <div class="bg-base-100 rounded-lg shadow-lg border border-base-300 p-4" :class="nodeClass">
        <!-- 输入端口 -->
        <slot name="input">
            <Handle v-if="hasInput" type="target" :position="Position.Left" class="bg-primary!" />
        </slot>

        <!-- 节点头部 -->
        <div class="flex items-center gap-2 cursor-pointer" @click="toggleCollapse">
            <Icon :icon="getIcon(type)" class="text-lg" />
            <span class="font-semibold">{{ data.label }}</span>
            <!-- 收缩图标 -->
            <Icon
                :icon="data.isCollapsed ? 'radix-icons:chevron-down' : 'radix-icons:chevron-up'"
                class="ml-auto text-sm text-base-content/60"
            />
        </div>

        <!-- 插槽：节点主体内容（非迷你模式下显示） -->
        <div v-if="!data.isCollapsed" class="mt-2">
            <slot></slot>
        </div>

        <!-- 输出端口 -->
        <slot name="output">
            <Handle v-if="hasOutput" type="source" :position="Position.Right" class="bg-primary!" />
        </slot>
    </div>
</template>
