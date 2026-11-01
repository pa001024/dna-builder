<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core"
import { computed, ref, watch } from "vue"
import ExprInput from "@/components/ExprInput.vue"
import { CharBuild } from "@/data/CharBuild"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { useUIStore } from "@/store/ui"
import { copyText, formatExpressionValue, pasteText } from "@/util"
import { formatCustomVariablesClipboardText, parseCustomVariablesClipboardText } from "@/utils/custom-variable-clipboard"
import { customVariableVectorPortId, PORT_META, PortType } from "@/utils/nodeEditorPorts"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const ui = useUIStore()
const exprMacros = new Set(Object.keys(CharBuild.macros))
const vectorColor = PORT_META[PortType.VECTOR].color
const customVarsColor = PORT_META[PortType.CUSTOM_VARS].color

/**
 * 读取节点中的变量定义，按值拷贝避免与节点数据共享数组引用。
 * 保留每一行的位置，保证变量行与向量输入端口一一对应。
 */
function readVariables(): [string, string][] {
    if (!Array.isArray(props.data.customVariables)) return []
    return props.data.customVariables.map((item: unknown) => [
        Array.isArray(item) && typeof item[0] === "string" ? item[0] : "",
        Array.isArray(item) && typeof item[1] === "string" ? item[1] : "",
    ])
}

/** 把外部变量数组归一化为等长的变量行 */
function normalizeVariables(value: unknown): [string, string][] {
    if (!Array.isArray(value)) return []
    return value.map(item => [
        Array.isArray(item) && typeof item[0] === "string" ? item[0] : "",
        Array.isArray(item) && typeof item[1] === "string" ? item[1] : "",
    ])
}

const variables = ref<[string, string][]>(readVariables())
const context = computed(() => store.getBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)

watch(
    () => props.data.customVariables,
    value => {
        const next = normalizeVariables(value)
        if (JSON.stringify(next) !== JSON.stringify(variables.value)) variables.value = next
    },
    { deep: true }
)

/** 写回变量定义并触发下游构筑重建 */
function commit() {
    store.updateNodeData(props.id, { customVariables: variables.value.map(item => [item[0], item[1]]) })
}

function addVariable() {
    variables.value.push(["", ""])
    commit()
}

function removeVariable(index: number) {
    variables.value.splice(index, 1)
    commit()
    store.syncVariableVectorEdges(props.id, variables.value.length, index)
}

/** 校验单行变量定义 */
function getValidation(row: [string, string]) {
    const build = charBuild.value
    if (!build || !row[0].trim() || !row[1].trim()) return ""
    try {
        return build.validateCustomVariable(row[0], row[1]) ?? ""
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}

/** 预览变量结果（函数定义以示例参数 1,2,3... 代入，仅展示，不产生节点输出） */
function getPreview(row: [string, string]) {
    const build = charBuild.value
    if (!build || !row[0].trim() || !row[1].trim() || getValidation(row)) return "-"
    const value = build.evaluateCustomVariableDefinition(row[0], row[1])
    if (!Number.isFinite(value)) return "0"
    const formatted = formatExpressionValue(value)
    const definition = build.parseCustomFunctionDefinition(row[0])
    if (!definition) return formatted
    const sampleArgs = definition.params.map((_, index) => index + 1)
    return `${definition.name}(${sampleArgs.join(", ")}) = ${formatted}`
}

async function copyVariables() {
    try {
        await copyText(formatCustomVariablesClipboardText(variables.value))
        ui.showSuccessMessage("已复制自定义变量")
    } catch (error) {
        ui.showErrorMessage("复制自定义变量失败", error instanceof Error ? error.message : String(error))
    }
}

async function pasteVariables() {
    try {
        const parsed = parseCustomVariablesClipboardText(await pasteText())
        if (parsed.length === 0) {
            ui.showErrorMessage("未识别到可粘贴的自定义变量")
            return
        }
        variables.value = parsed.map(variable => [...variable])
        commit()
        // 粘贴会整体替换变量列表，旧变量行上的向量接线不再对应任何变量
        store.clearVariableVectorEdges(props.id)
        ui.showSuccessMessage("已粘贴自定义变量")
    } catch (error) {
        ui.showErrorMessage("粘贴自定义变量失败", error instanceof Error ? error.message : String(error))
    }
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <template #ports>
            <!-- 与节点主体同宽，保证变量组宽度不随输入内容变化 -->
            <div class="space-y-0.5" :class="data.isCollapsed ? '' : 'w-140'">
                <!-- 变量组整体输出 -->
                <div class="relative flex h-6 items-center">
                    <span class="ml-auto text-[10px] text-base-content/55">自定义变量组</span>
                    <Handle
                        id="customVariables"
                        type="source"
                        :position="Position.Right"
                        class="border! border-base-100!"
                        :style="{ right: '-12px', left: 'auto', top: '50%', transform: 'translateY(-50%)', background: customVarsColor }"
                    />
                </div>
                <!-- 每个变量一个向量输入端口：只覆盖该变量，变量行与端口精确对齐 -->
                <div
                    v-for="(variable, index) in variables"
                    :key="`port-${index}`"
                    class="relative flex min-h-6 items-center gap-1.5"
                >
                    <Handle
                        :id="customVariableVectorPortId(index)"
                        type="target"
                        :position="Position.Left"
                        class="border! border-base-100!"
                        :style="{ left: '-12px', top: '50%', transform: 'translateY(-50%)', background: vectorColor }"
                    />
                    <template v-if="!data.isCollapsed">
                        <!-- 变量行：变量名 = 表达式（下划线输入，不加外框） -->
                        <input
                            v-model="variable[0]"
                            type="text"
                            class="nodrag w-18 shrink-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            placeholder="变量名"
                            @input="commit"
                            @pointerdown.stop
                            @mousedown.stop
                        />
                        <span class="flex-none select-none text-[10px] text-base-content/35">=</span>
                        <FullTooltip side="top">
                            <template #tooltip>
                                <div class="space-y-1">
                                    <div class="max-w-60 break-all text-xs text-base-content/80">{{ variable[0] }} = {{ variable[1] }}</div>
                                    <div class="text-xs text-primary tabular-nums">{{ getPreview(variable) }}</div>
                                </div>
                            </template>
                            <ExprInput
                                v-model="variable[1]"
                                class="min-w-0 flex-1"
                                variant="underline"
                                font-size="12px"
                                line-height="18px"
                                :macros="exprMacros"
                                placeholder="表达式"
                                @update:model-value="commit"
                            />
                        </FullTooltip>
                        <button
                            type="button"
                            class="grid size-5 shrink-0 cursor-pointer place-items-center text-base-content/40 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400 active:scale-[0.95]"
                            :title="$t('common.delete')"
                            @click="removeVariable(index)"
                        >
                            <Icon icon="codicon:chrome-close" class="size-3" />
                        </button>
                    </template>
                    <span v-else class="truncate text-[10px] text-base-content/55">{{ variable[0] || `变量${index + 1}` }}</span>
                </div>
            </div>
        </template>
        <div class="w-140 max-w-full space-y-1.5">
            <!-- 变量操作：添加 / 复制 / 粘贴（无边框 tint 芯片） -->
            <div class="flex items-center gap-1 pt-0.5">
                <button
                    type="button"
                    class="flex h-6 flex-1 cursor-pointer items-center justify-center gap-1 bg-primary/10 px-2 text-[10px] font-semibold text-primary transition-colors duration-150 hover:bg-primary/15 active:scale-[0.97]"
                    @click="addVariable"
                >
                    <Icon icon="ri:add-line" class="size-3" />
                    变量
                </button>
                <button
                    type="button"
                    class="grid size-6 shrink-0 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.97]"
                    title="复制自定义变量"
                    @click="copyVariables"
                >
                    <Icon icon="ri:file-copy-line" class="size-3" />
                </button>
                <button
                    type="button"
                    class="grid size-6 shrink-0 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.97]"
                    title="粘贴自定义变量"
                    @click="pasteVariables"
                >
                    <Icon icon="ri:clipboard-line" class="size-3" />
                </button>
            </div>
            <!-- 变量校验错误 -->
            <template v-for="(variable, index) in variables" :key="`variable-error-${index}`">
                <div v-if="variable[0] || variable[1] ? getValidation(variable) : false" class="flex text-xs items-center text-red-500">
                    {{ getValidation(variable) }}
                </div>
            </template>
        </div>
    </BaseNode>
</template>
