<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import ExprInput from "@/components/ExprInput.vue"
import { CharBuild } from "@/data/CharBuild"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatDamage } from "@/util"
import BaseNode from "./BaseNode.vue"
import VectorResultTable from "./VectorResultTable.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const { t } = useTranslation()

const exprMacros = new Set(Object.keys(CharBuild.macros))
const astHelpShow = ref(false)
const astHelpInitialExpression = ref("")

const expression = computed({
    get: () => (typeof props.data.expression === "string" ? props.data.expression : ""),
    set: (value: string) => store.updateNodeData(props.id, { expression: value }),
})

const context = computed(() => store.getInputBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)

const validationError = computed(() => {
    if (!expression.value.trim()) return ""
    if (!charBuild.value) return t("node-editor.astExpression.missingCore")
    try {
        return charBuild.value.validateAST(expression.value) || ""
    } catch (error) {
        console.error("AST验证错误:", error)
        return error instanceof Error ? error.message : t("node-editor.astExpression.unknownError")
    }
})

const resultValue = computed(() => {
    const value = props.data.result?.value
    return typeof value === "number" ? value : null
})

const resultText = computed(() => (resultValue.value === null ? "-" : formatDamage(resultValue.value)))

/** 打开 AST 帮助：以当前目标函数作为初始表达式 */
function openAstHelp() {
    astHelpInitialExpression.value = expression.value
    astHelpShow.value = true
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-95 max-w-full space-y-2">
            <div>
                <div class="mb-0.5 flex items-center justify-between">
                    <label class="text-[10px] text-base-content/45">{{ $t("node-editor.astExpression.expression") }}</label>
                    <button
                        type="button"
                        class="grid size-5 cursor-pointer place-items-center text-base-content/45 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary"
                        @click="openAstHelp"
                    >
                        <Icon icon="ri:question-line" class="size-3" />
                    </button>
                </div>
                <div
                    class="flex items-center gap-1 rounded-none border-b border-base-content/20 px-0.5 pb-0.5 text-[12px] transition-colors duration-150 focus-within:border-primary"
                >
                    <FullTooltip side="top">
                        <template #tooltip>
                            <div class="space-y-1">
                                <div class="max-w-60 break-all text-xs text-base-content/80">{{ expression }}</div>
                                <div class="text-xs text-primary tabular-nums">{{ resultText }}</div>
                            </div>
                        </template>
                        <ExprInput
                            v-model="expression"
                            class="grow"
                            font-size="12px"
                            line-height="18px"
                            :macros="exprMacros"
                            :placeholder="$t('伤害')"
                        />
                    </FullTooltip>
                    <div v-if="expression" class="flex cursor-pointer items-center text-base-content/40 hover:text-primary" @click="expression = ''">
                        <Icon icon="codicon:chrome-close" class="size-3" />
                    </div>
                </div>
            </div>

            <div v-if="validationError" class="text-[10px] text-red-500">{{ validationError }}</div>

            <div v-if="resultValue !== null" class="flex items-center gap-2">
                <span class="text-[10px] text-base-content/45">{{ $t("node-editor.astExpression.result") }}</span>
                <span class="font-orbitron text-[13px] font-bold text-primary">{{ resultText }}</span>
            </div>
            <div v-else-if="data.evalPending" class="text-[10px] text-base-content/45">{{ $t("node-editor.astExpression.waiting") }}</div>
            <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
        </div>

        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': astHelpShow }">
                <div class="modal-box bg-base-300 w-11/12 max-w-6xl p-0">
                    <ASTHelp
                        v-if="astHelpShow"
                        v-model="astHelpShow"
                        :char-build="charBuild"
                        :skill="charBuild?.selectedSkill"
                        :initial-expression="astHelpInitialExpression"
                        @select="expression = $event"
                    />
                </div>
                <div class="modal-backdrop" @click="astHelpShow = false" />
            </dialog>
        </Teleport>
    </BaseNode>
</template>
