<script setup lang="ts">
import { CharBuild } from "../../../data/CharBuild"
import type { CharBuildOptions } from "../../../data/CharBuild"
import BaseNode from "./BaseNode.vue"
import { computed } from "vue"
import { useNodeEditorStore } from "../../../store/nodeEditor"

// 定义节点数据类型
interface CoreCalcNodeData {
    type: string
    label: string
    charBuild?: CharBuild
    options?: Partial<CharBuildOptions>
    inputData?: {
        charData?: any
        weaponData?: any
        modData?: any
        buffData?: any
        enemyData?: any
    }
    error?: string
    missingInputs?: string[]
    selectedSkill?: string // 当前选择的技能
}

// 定义属性
const props = defineProps<{
    id: string
    data: CoreCalcNodeData
    type: string
    selected: boolean
}>()

// 获取store实例
const store = useNodeEditorStore()

// 计算属性：检查是否缺少必要输入
const hasMissingInputs = computed(() => {
    return props.data.missingInputs && props.data.missingInputs.length > 0
})

// 计算属性：显示状态文本
const statusText = computed(() => {
    if (props.data.error) {
        return props.data.error
    }
    if (hasMissingInputs.value) {
        return `缺少必要输入：${props.data.missingInputs?.join("、")}`
    }
    if (props.data.charBuild) {
        return "当前可用"
    }
    return "等待输入"
})

// 计算属性：获取所有可用技能
const availableSkills = computed(() => {
    return props.data.charBuild?.allSkills || []
})

// 处理技能选择变化
const handleSkillChange = (val: string) => {
    store.updateNodeData(props.id, { selectedSkill: val })
}
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div class="space-y-2">
            <!-- 状态信息 -->
            <div class="text-sm">
                <div v-if="!hasMissingInputs && !data.charBuild" class="text-center">
                    <span
                        :class="{
                            'text-green-600': !hasMissingInputs && !data.error,
                            'text-red-600': hasMissingInputs || data.error,
                            'text-yellow-600': !hasMissingInputs && !data.error && !data.charBuild,
                        }"
                    >
                        {{ statusText }}
                    </span>
                </div>

                <!-- 缺少输入列表 -->
                <div v-if="hasMissingInputs" class="mt-2">
                    <div class="text-xs text-red-600 font-medium mb-1">缺少必要输入：</div>
                    <div class="text-xs text-red-500">
                        <ul class="list-disc list-inside">
                            <li v-for="input in data.missingInputs" :key="input">{{ input }}</li>
                        </ul>
                    </div>
                </div>
                <!-- 错误信息 -->
                <div v-else-if="data.error" class="mt-2">
                    <div class="text-xs text-red-600 font-medium mb-1">错误信息：</div>
                    <div class="text-xs text-red-500">{{ data.error }}</div>
                </div>
                <!-- 技能选择 -->
                <div v-else-if="data.charBuild" class="mt-2">
                    <div class="text-xs text-base-content/60 mb-1">选择默认技能：</div>
                    <Select
                        class="input input-sm w-full"
                        :model-value="data.selectedSkill || ''"
                        placeholder="请选择技能"
                        @update:model-value="handleSkillChange"
                    >
                        <SelectItem v-for="skill in availableSkills" :key="skill.名称" :value="skill.名称">
                            {{ skill.名称 }}
                        </SelectItem>
                    </Select>
                </div>
            </div>
        </div>
    </BaseNode>
</template>
