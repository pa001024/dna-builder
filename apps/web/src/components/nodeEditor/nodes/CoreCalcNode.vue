<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import type { CharBuildOptions } from "@/data/CharBuild"
import { CharBuild } from "@/data/CharBuild"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { CORE_INPUT } from "@/utils/nodeEditorPorts"
import BaseNode from "./BaseNode.vue"

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
    /** 构筑输入合并模式：override 覆盖构筑对应项目，append 原构筑与叠加结果同时产出 */
    buildMode?: "override" | "append"
    vectorDimensions?: number[]
    buildVector?: { contexts: unknown[] }
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
const { t } = useTranslation()

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
        return `${t("node-editor.coreCalc.missingInputs")}${props.data.missingInputs?.join("、")}`
    }
    if (props.data.charBuild) {
        return t("node-editor.coreCalc.currentAvailable")
    }
    return t("node-editor.coreCalc.waiting")
})

// 计算属性：获取所有可用技能
const availableSkills = computed(() => {
    return props.data.charBuild?.allSkills || []
})

// 处理技能选择变化
const handleSkillChange = (val: string) => {
    store.updateNodeData(props.id, { selectedSkill: val })
}

/** 是否接了构筑输入：没有构筑输入时覆盖 / 追加没有意义 */
const hasBuildInput = computed(() => store.edges.some(edge => edge.target === props.id && edge.targetHandle === CORE_INPUT.build))

const BUILD_MODES = [
    { value: "override", label: "覆盖" },
    { value: "append", label: "追加" },
] as const

const buildMode = computed<"override" | "append">(() => (props.data.buildMode === "append" ? "append" : "override"))

/**
 * 切换构筑输入合并模式。
 * @param mode 覆盖或追加
 */
function setBuildMode(mode: "override" | "append") {
    store.updateNodeData(props.id, { buildMode: mode })
}
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div class="w-57.5 max-w-full space-y-1 text-[11px]">
            <!-- 构筑输入合并模式 -->
            <div v-if="hasBuildInput" class="flex items-center gap-1">
                <span class="shrink-0 text-[10px] text-base-content/45">构筑输入</span>
                <button
                    v-for="mode in BUILD_MODES"
                    :key="mode.value"
                    type="button"
                    class="h-5 cursor-pointer border px-1.5 text-[10px] font-semibold transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        buildMode === mode.value
                            ? 'border-primary/40 bg-primary/15 text-primary'
                            : 'border-base-content/10 bg-base-100 text-base-content/60 hover:border-primary/30 hover:text-primary'
                    "
                    :title="mode.value === 'override' ? '连线输入覆盖构筑的对应项目' : '原构筑与叠加输入后的构筑同时产出'"
                    @click="setBuildMode(mode.value)"
                >
                    {{ mode.label }}
                </button>
            </div>
            <!-- 状态信息 -->
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
            <div v-if="hasMissingInputs">
                <div class="mb-0.5 font-medium text-red-600">{{ $t("node-editor.coreCalc.missingInputs") }}</div>
                <ul class="list-inside list-disc text-[10px] text-red-500">
                    <li v-for="input in data.missingInputs" :key="input">{{ input }}</li>
                </ul>
            </div>
            <!-- 错误信息 -->
            <div v-else-if="data.error">
                <div class="mb-0.5 font-medium text-red-600">{{ $t("node-editor.coreCalc.errorInfo") }}</div>
                <div class="text-[10px] text-red-500">{{ data.error }}</div>
            </div>
            <!-- 技能选择 -->
            <div v-else-if="data.charBuild">
                <div class="mb-0.5 text-[10px] text-base-content/45">{{ $t("node-editor.coreCalc.defaultSkill") }}</div>
                <Select
                    class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                    :model-value="data.selectedSkill || ''"
                    :placeholder="$t('node-editor.coreCalc.selectSkill')"
                    @update:model-value="handleSkillChange"
                >
                    <SelectItem v-for="skill in availableSkills" :key="skill.名称" :value="skill.名称">
                        {{ skill.名称 }}
                    </SelectItem>
                </Select>

                <div v-if="data.vectorDimensions?.length" class="mt-1.5 text-[10px] text-base-content/45">
                    向量构筑：{{ data.vectorDimensions.join(" × ") }}（{{ data.buildVector?.contexts.length ?? 0 }} 组）
                </div>
                <div class="mt-1.5 text-[10px] text-base-content/45">构筑已就绪，可在下游计算节点求值</div>
            </div>
        </div>
    </BaseNode>
</template>
