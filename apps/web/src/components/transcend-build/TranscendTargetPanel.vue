<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { debounce, isEqual } from "lodash-es"
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from "vue"
import ExprInput from "@/components/ExprInput.vue"
import type { ExprDragPayload } from "@/composables/useExprDrag"
import { clearExprDrag, registerExprDropHandler, useExprDrag } from "@/composables/useExprDrag"
import { CharBuild, type DotFrequencySettings, defaultDotFrequencySettings, type TranscendSlotGroup } from "@/data"
import { useUIStore } from "@/store/ui"
import { copyText, formatExpressionValue, pasteText } from "@/util"
import { formatCustomVariablesClipboardText, parseCustomVariablesClipboardText } from "@/utils/custom-variable-clipboard"
import { joinExprText } from "@/utils/expr-field"
import { getTranscendSideLabelKey } from "@/utils/transcend-build"

/**
 * 目标函数面板：主控 / 协战一 / 协战二逐位编辑目标表达式与自定义变量，并配置本位的每秒 DOT 伤害。
 * 面板只写 `targetFunction` / `customVariables` / `dotSettings` / `enabled`（父级负责写回与重算），
 * `charId` 仅用于启用开关的可用性判断；`baseName` 只随状态携带给结果标签。校验与预览使用该位自己的 CharBuild。
 */

/**
 * 目标面板单个构筑位的最小状态：由 `createMainTargetSide` / `createAssistTargetSide` 从完整 `CharSettings`
 * 投影（`charId` 来自主控 id / `teamN`，`baseName` 只供结果标签）；升华构筑位（`TranscendSideLoadout`）
 * 也满足此形状，因此两套页面共用同一面板。
 */
export interface TargetSideState {
    charId: number
    baseName: string
    targetFunction: string
    customVariables: [string, string][]
    dotSettings: DotFrequencySettings
    enabled: boolean
}

type ExprInputInstance = { getCursor: () => number; insertAtCursor: (text: string) => number }

const props = withDefaults(
    defineProps<{
        /** 各构筑位目标面板读写的字段（主控镜像与协战 loadout 由父级写回） */
        sides: Record<TranscendSlotGroup, TargetSideState>
        /** 各构筑位的构筑实例（未启用 / 无角色 / 构建失败时为空） */
        sideBuilds: Record<TranscendSlotGroup, CharBuild | null>
        /** 左栏当前构筑位：仅用于初始化页签 */
        loadoutSide?: TranscendSlotGroup
        /** 是否渲染自带标题栏（帮助入口随之移动，宿主可改用自身头部按钮触发 `openHelp`） */
        showHeader?: boolean
    }>(),
    { showHeader: true }
)

const emit = defineEmits<{
    (event: "update-loadout", side: TranscendSlotGroup, patch: Partial<TargetSideState>): void
}>()

const { t } = useTranslation()
const ui = useUIStore()

const ASTHelp = defineAsyncComponent(() => import("@/components/ASTHelp.vue"))
const DotConfigDialog = defineAsyncComponent(() => import("@/components/DotConfigDialog.vue"))

/** 表达式 / 变量提交防抖间隔（与老构筑页一致） */
const EXPRESSION_DEBOUNCE_MS = 500
const SIDES = ["main", "assist1", "assist2"] as const
const exprMacros = new Set(Object.keys(CharBuild.macros))
const { floatingPayload, hoveredDropKey, dropReady } = useExprDrag()

const sideTabs = computed(() => SIDES.map(side => ({ side, label: t(getTranscendSideLabelKey(side)) })))

/** 当前编辑的构筑位（切换页签前先把本位待提交文本写回本位） */
const activeSide = ref<TranscendSlotGroup>(props.loadoutSide ?? "main")

/** 当前位的构筑实例：表达式 / 变量校验与预览只认本位 */
const activeBuild = computed(() => props.sideBuilds[activeSide.value] ?? null)

/** 逐条复制变量，避免页面与设置共享同一数组 */
function cloneVariables(variables: readonly [string, string][]): [string, string][] {
    return variables.map(variable => [...variable] as [string, string])
}

/** 各构筑位自己的本地输入副本（页签切换只换读取来源，不互相覆盖） */
const expressionInputs = ref<Record<TranscendSlotGroup, string>>({
    main: props.sides.main.targetFunction,
    assist1: props.sides.assist1.targetFunction,
    assist2: props.sides.assist2.targetFunction,
})
const customVariableInputs = ref<Record<TranscendSlotGroup, [string, string][]>>({
    main: cloneVariables(props.sides.main.customVariables),
    assist1: cloneVariables(props.sides.assist1.customVariables),
    assist2: cloneVariables(props.sides.assist2.customVariables),
})

const expressionInput = computed(() => expressionInputs.value[activeSide.value])
const variableInputs = computed(() => customVariableInputs.value[activeSide.value])

//#region 目标表达式
/**
 * 每个构筑位独立的提交器：闭包捕获本位，延迟提交 / 切换页签都不会写进别位。
 * @param side 构筑位
 * @returns 目标表达式与自定义变量的防抖提交函数
 */
function createCommitters(side: TranscendSlotGroup) {
    return {
        expression: debounce((value: string) => {
            if (value === props.sides[side].targetFunction) return
            emit("update-loadout", side, { targetFunction: value })
        }, EXPRESSION_DEBOUNCE_MS),
        variables: debounce((variables: [string, string][]) => {
            if (isEqual(props.sides[side].customVariables, variables)) return
            emit("update-loadout", side, { customVariables: cloneVariables(variables) })
        }, EXPRESSION_DEBOUNCE_MS),
    }
}

const committers = {
    main: createCommitters("main"),
    assist1: createCommitters("assist1"),
    assist2: createCommitters("assist2"),
} as const

/**
 * 输入目标表达式：立即更新本位本地副本，500ms 后写回该位设置。
 * @param value 表达式文本
 */
function onExpressionInput(value: string): void {
    const side = activeSide.value
    expressionInputs.value[side] = value
    committers[side].expression(value)
}

/** 清空当前位的目标表达式（回到技能默认「伤害」） */
function clearExpression(): void {
    const side = activeSide.value
    expressionInputs.value[side] = ""
    committers[side].expression.cancel()
    emit("update-loadout", side, { targetFunction: "" })
}

/**
 * 切换构筑位页签：先把本位的待提交文本提回本位，再切换。
 * @param side 目标构筑位
 */
function selectSide(side: TranscendSlotGroup): void {
    if (side === activeSide.value) return
    dotDialogOpen.value = false
    committers[activeSide.value].expression.flush()
    committers[activeSide.value].variables.flush()
    activeSide.value = side
}

/** 启用 / 禁用当前构筑位（三者同一数据源，禁用后不计入合计） */
function onEnabledChange(event: Event): void {
    emit("update-loadout", activeSide.value, { enabled: (event.target as HTMLInputElement).checked })
}

/** 表达式即时校验：不阻止输入，只提示错误（求值失败时结果面板不显示 0） */
const expressionError = computed(() => {
    const build = activeBuild.value
    if (!build || !expressionInput.value.trim()) return ""
    return build.validateAST(expressionInput.value) ?? ""
})

const targetInputRef = ref<ExprInputInstance | null>(null)
//#endregion

//#region DOT 设置
/** DOT 设置弹窗显隐 */
const dotDialogOpen = ref(false)
/** 本位 DOT 设置的草稿副本：弹窗原地修改草稿，不把设置对象本身交给弹窗 */
const dotDraft = ref<DotFrequencySettings>({ ...defaultDotFrequencySettings })

/** 本位 DOT 总频率（次/秒） */
const dotTotalFreq = computed(() => activeBuild.value?.calculateDotFrequencies().totalFreq ?? 0)
/** 本位每秒 DOT 伤害（全部来源） */
const dotDamage = computed(() => activeBuild.value?.calculateDotDamage() ?? 0)

/** 打开 DOT 弹窗：按本位设置复制一份草稿 */
function openDotDialog(): void {
    dotDraft.value = { ...props.sides[activeSide.value].dotSettings }
    dotDialogOpen.value = true
}

/** 关闭 DOT 弹窗（草稿改动已逐次写回本位设置） */
function closeDotDialog(): void {
    dotDialogOpen.value = false
}

// 弹窗原地改草稿 → 与本位设置比对后写回，触发快照重算并标记持久化
watch(
    dotDraft,
    draft => {
        const side = activeSide.value
        if (isEqual(props.sides[side].dotSettings, draft)) return
        emit("update-loadout", side, { dotSettings: { ...draft } })
    },
    { deep: true }
)

// 本位失去构筑实例（未选角色 / 已禁用）时关闭弹窗，避免对着空构筑配置
watch(activeBuild, build => {
    if (!build) dotDialogOpen.value = false
})
//#endregion

//#region 自定义变量
const customVariableExpend = ref(true)
const variableInputRefs = ref<Record<number, ExprInputInstance>>({})

/**
 * 变量校验错误（空行不提示）。
 * @param variable 变量行
 * @returns 错误文案；无错误为空串
 */
function variableError(variable: [string, string]): string {
    const build = activeBuild.value
    if (!build || (!variable[0] && !variable[1])) return ""
    return build.validateCustomVariable(variable[0], variable[1]) ?? ""
}

/**
 * 变量表达式的结果预览（函数定义以 1,2,3… 代入示例参数）。
 * @param variable 变量行
 * @returns 预览文本
 */
function variablePreview(variable: [string, string]): string {
    const build = activeBuild.value
    if (!build || !variable[0] || !variable[1] || variableError(variable)) return "-"
    const value = build.evaluateCustomVariableDefinition(variable[0], variable[1])
    if (!Number.isFinite(value)) return "0"
    const formatted = formatExpressionValue(value)
    const definition = build.parseCustomFunctionDefinition(variable[0])
    if (!definition) return formatted
    const sampleArgs = definition.params.map((_, index) => index + 1)
    return `${definition.name}(${sampleArgs.join(", ")}) = ${formatted}`
}

/** 给当前位添加一行空变量 */
function addVariable(): void {
    customVariableInputs.value[activeSide.value].push(["", ""])
}

/**
 * 删除当前位的一行变量。
 * @param index 行下标
 */
function removeVariable(index: number): void {
    customVariableInputs.value[activeSide.value].splice(index, 1)
}

/** 复制当前位的全部变量到剪贴板 */
async function copyVariables(): Promise<void> {
    try {
        await copyText(formatCustomVariablesClipboardText(variableInputs.value))
        ui.showSuccessMessage(t("transcend-build.variable_copied"))
    } catch (error) {
        ui.showErrorMessage(t("char-build.copy_failed"), error instanceof Error ? error.message : String(error))
    }
}

/** 从剪贴板替换当前位的全部变量 */
async function pasteVariables(): Promise<void> {
    const side = activeSide.value
    try {
        const variables = parseCustomVariablesClipboardText(await pasteText())
        if (!variables.length) {
            ui.showErrorMessage(t("transcend-build.variable_paste_empty"))
            return
        }
        committers[side].variables.cancel()
        customVariableInputs.value[side] = variables
        emit("update-loadout", side, { customVariables: cloneVariables(variables) })
        ui.showSuccessMessage(t("transcend-build.variable_pasted"))
    } catch (error) {
        ui.showErrorMessage(t("transcend-build.variable_paste_failed"), error instanceof Error ? error.message : String(error))
    }
}

/**
 * 记录 / 移除变量输入控件引用。
 * @param index 行下标
 * @param instance 控件实例；卸载时为 null
 */
function setVariableInputRef(index: number, instance: ExprInputInstance | null): void {
    if (instance) variableInputRefs.value[index] = instance
    else delete variableInputRefs.value[index]
}
//#endregion

//#region 拖拽放置
const TARGET_KEY = "transcend-target"
const VARIABLE_KEY_PREFIX = "transcend-variable:"

/**
 * 按放置目标 key 取输入控件（只渲染当前位的变量行）。
 * @param key 放置目标 key
 * @returns 控件实例；不存在时为 null
 */
function getDropInput(key: string): ExprInputInstance | null {
    if (key === TARGET_KEY) return targetInputRef.value
    if (!key.startsWith(VARIABLE_KEY_PREFIX)) return null
    return variableInputRefs.value[Number(key.slice(VARIABLE_KEY_PREFIX.length))] ?? null
}

/**
 * 放置字段：写入当前位目标表达式或对应变量行。
 * @param key 放置目标 key
 * @param field 抓起的字段
 * @param input 输入控件（用于取光标位置）
 */
function applyDrop(key: string, field: ExprDragPayload, input?: ExprInputInstance | null): void {
    const side = activeSide.value
    const caret = input?.getCursor()
    if (key === TARGET_KEY) {
        expressionInputs.value[side] = joinExprText(expressionInputs.value[side], field.expr, caret)
        committers[side].expression(expressionInputs.value[side])
        return
    }
    if (!key.startsWith(VARIABLE_KEY_PREFIX)) return
    const variable = customVariableInputs.value[side][Number(key.slice(VARIABLE_KEY_PREFIX.length))]
    if (!variable) return
    variable[1] = joinExprText(variable[1], field.expr, caret)
}

/**
 * 触控点击放置：已抓起字段时点击输入框即写入。
 * @param key 放置目标 key
 */
function handleDropClick(key: string): void {
    const field = floatingPayload.value
    if (!field) return
    applyDrop(key, field, getDropInput(key))
    clearExprDrag()
}

/**
 * 表达式输入框在抓起 / 拖动状态下的高亮样式。
 * @param key 放置目标 key
 * @returns 追加的 class
 */
function dropTargetClass(key: string): string {
    if (hoveredDropKey.value === key) return "ring-2 ring-primary"
    if (dropReady.value) return "ring-1 ring-primary/50"
    return ""
}

registerExprDropHandler((key, field) => applyDrop(key, field, getDropInput(key)))
//#endregion

//#region ASTHelp
const astHelpOpen = ref(false)
const astHelpSide = ref<TranscendSlotGroup>("main")
const astHelpTargetKey = ref(TARGET_KEY)
const astHelpInitialExpression = ref("")

/**
 * 打开 ASTHelp：记住打开时的构筑位与输入框，确认后只写回该框。
 * @param key 打开时的目标 key
 */
function openAstHelp(key: string): void {
    const side = activeSide.value
    const index = Number(key.slice(VARIABLE_KEY_PREFIX.length))
    astHelpSide.value = side
    astHelpTargetKey.value = key
    astHelpInitialExpression.value = key === TARGET_KEY ? expressionInputs.value[side] : (customVariableInputs.value[side][index]?.[1] ?? "")
    astHelpOpen.value = true
}

/**
 * ASTHelp 确认：一次性写回打开时关联的构筑位与输入框。
 * @param expression 组好的表达式
 */
function onAstHelpSelect(expression: string): void {
    const side = astHelpSide.value
    const key = astHelpTargetKey.value
    if (key === TARGET_KEY) {
        expressionInputs.value[side] = expression
        committers[side].expression.cancel()
        emit("update-loadout", side, { targetFunction: expression })
        return
    }
    const variable = customVariableInputs.value[side][Number(key.slice(VARIABLE_KEY_PREFIX.length))]
    if (!variable) return
    variable[1] = expression
    committers[side].variables.cancel()
    emit("update-loadout", side, { customVariables: cloneVariables(customVariableInputs.value[side]) })
}

/**
 * 宿主头部按钮的帮助入口：打开当前位的目标表达式帮助。
 * `showHeader=false` 时标题栏连同帮助钮一起让位给宿主。
 */
function openHelp(): void {
    openAstHelp(TARGET_KEY)
}

defineExpose({ openHelp })
//#endregion

for (const side of SIDES) {
    // 外部替换设置（切换角色 / 导入 / 重置）时取消本位待提交文本，避免写进新存档
    watch(
        () => props.sides[side].targetFunction,
        value => {
            if (value === expressionInputs.value[side]) return
            committers[side].expression.cancel()
            expressionInputs.value[side] = value
        }
    )
    watch(
        () => props.sides[side].customVariables,
        variables => {
            if (isEqual(customVariableInputs.value[side], variables)) return
            committers[side].variables.cancel()
            customVariableInputs.value[side] = cloneVariables(variables)
        }
    )
    watch(
        () => customVariableInputs.value[side],
        variables => {
            committers[side].variables(cloneVariables(variables))
        },
        { deep: true }
    )
}

onBeforeUnmount(() => {
    for (const side of SIDES) {
        committers[side].expression.flush()
        committers[side].variables.flush()
    }
    clearExprDrag()
})
</script>

<template>
    <div class="space-y-3">
        <SectionHeader v-if="showHeader" :title="$t('transcend-build.section_target')" no-animate compact>
            <template #trailing>
                <div class="btn btn-xs btn-ghost btn-circle" @click="openAstHelp(TARGET_KEY)">
                    <Icon icon="ri:question-line" />
                </div>
            </template>
        </SectionHeader>
        <!-- 三人页签 + 本位「启用」开关（与基础设置的协战开关同一数据源） -->
        <div class="flex items-center gap-2 px-1" data-target-side-tabs>
            <div class="flex min-w-0 flex-1 items-center gap-1">
                <button
                    v-for="tab in sideTabs"
                    :key="tab.side"
                    type="button"
                    class="min-w-0 flex-1 btn btn-xs"
                    :class="{ 'btn-primary': activeSide === tab.side }"
                    :data-target-side-tab="tab.side"
                    @click="selectSide(tab.side)"
                >
                    {{ tab.label }}
                </button>
            </div>
            <label
                class="flex shrink-0 items-center gap-1.5 text-[11px]"
                :class="sides[activeSide].charId > 0 ? 'cursor-pointer text-base-content/60' : 'pointer-events-none opacity-40'"
                :title="sides[activeSide].charId > 0 ? $t('transcend-build.side_enable') : $t('transcend-build.assist_needs_char')"
            >
                <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="sides[activeSide].enabled"
                    :disabled="sides[activeSide].charId <= 0"
                    :data-target-side-enable="activeSide"
                    @change="onEnabledChange"
                />
                <span>{{ $t("transcend-build.side_enable") }}</span>
            </label>
        </div>
        <p v-if="!sides[activeSide].enabled" class="px-1 text-[10px] leading-none text-warning/80" data-target-side-disabled>
            {{ $t("transcend-build.assist_not_enabled") }}
        </p>
        <div
            class="space-y-2 p-1 transition-opacity duration-200"
            :class="{ 'opacity-55': !sides[activeSide].enabled }"
            :data-target-side-panel="activeSide"
        >
            <!-- 自定义变量：与原版一致，daisyUI collapse + 居中箭头 -->
            <div class="collapse" :class="{ 'collapse-open': customVariableExpend }">
                <div class="collapse-content space-y-1.5 px-0 py-1">
                    <div v-for="(variable, index) in variableInputs" :key="index" class="flex items-center gap-2">
                        <input
                            v-model="variable[0]"
                            type="text"
                            class="w-20 shrink-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            :placeholder="$t('transcend-build.variable_name')"
                        />
                        <span class="flex-none select-none text-[11px] text-base-content/35">=</span>
                        <FullTooltip side="top">
                            <template #tooltip>
                                <div class="space-y-1">
                                    <div class="max-w-60 break-all text-xs text-base-content/80">{{ variable[0] }} = {{ variable[1] }}</div>
                                    <div class="text-xs text-primary tabular-nums">{{ variablePreview(variable) }}</div>
                                </div>
                            </template>
                            <div
                                class="min-w-0 flex-1"
                                :class="dropTargetClass(`${VARIABLE_KEY_PREFIX}${index}`)"
                                :data-expr-drop="`${VARIABLE_KEY_PREFIX}${index}`"
                                @click="handleDropClick(`${VARIABLE_KEY_PREFIX}${index}`)"
                            >
                                <ExprInput
                                    :ref="el => setVariableInputRef(index, el as ExprInputInstance | null)"
                                    v-model="variable[1]"
                                    class="w-full"
                                    variant="underline"
                                    font-size="13px"
                                    line-height="19.5px"
                                    :macros="exprMacros"
                                    :placeholder="$t('transcend-build.variable_expression')"
                                />
                            </div>
                        </FullTooltip>
                        <button
                            type="button"
                            class="grid size-6 shrink-0 cursor-pointer place-items-center rounded-xs text-base-content/40 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400 active:scale-[0.95]"
                            :title="$t('common.delete')"
                            @click="removeVariable(index)"
                        >
                            <Icon icon="codicon:chrome-close" class="size-3.5" />
                        </button>
                    </div>
                    <p v-for="(variable, index) in variableInputs" :key="`variable-error-${index}`" v-show="variableError(variable)" class="text-[11px] leading-relaxed text-error">
                        {{ variableError(variable) }}
                    </p>
                    <!-- 变量操作：添加 / 复制 / 粘贴（与原版相同的 tint 芯片） -->
                    <div class="flex items-center gap-1.5 pt-0.5">
                        <button
                            type="button"
                            class="flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-xs bg-primary/10 px-2 text-[11px] font-semibold text-primary transition-colors duration-150 hover:bg-primary/15 active:scale-[0.97]"
                            @click="addVariable"
                        >
                            <Icon icon="ri:add-line" class="size-3.5" />
                            {{ $t("transcend-build.variable_add") }}
                        </button>
                        <button
                            type="button"
                            class="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-xs text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.97]"
                            :title="$t('transcend-build.variable_copy')"
                            @click="copyVariables"
                        >
                            <Icon icon="ri:file-copy-line" class="size-3.5" />
                        </button>
                        <button
                            type="button"
                            class="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-xs text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.97]"
                            :title="$t('transcend-build.variable_paste')"
                            @click="pasteVariables"
                        >
                            <Icon icon="ri:clipboard-line" class="size-3.5" />
                        </button>
                    </div>
                </div>
            </div>
            <!-- 折叠开关（同词条 charattr） -->
            <div
                class="flex cursor-pointer items-center justify-center p-2 transition-all duration-200 hover:bg-base-100/60"
                @click="customVariableExpend = !customVariableExpend"
            >
                <Icon icon="radix-icons:chevron-down" :class="{ 'rotate-180': customVariableExpend }" />
            </div>
            <!-- 每秒DOT伤害：与原构筑页一致，点击打开频率设置弹窗（本位独立配置） -->
            <div
                v-if="activeBuild"
                class="flex cursor-pointer items-center justify-between rounded-sm p-1 transition-all duration-200 hover:bg-base-100/60"
                :title="$t('dot-config.title')"
                data-transcend-dot-row
                @click="openDotDialog"
            >
                <div class="flex items-center gap-1 text-sm text-base-content/80">
                    {{ $t("transcend-build.dot_per_second") }}
                    <span v-if="dotTotalFreq > 0" class="text-xs text-base-content/50 tabular-nums">
                        {{ +dotTotalFreq.toFixed(2) }}
                        {{ $t("dot-config.per_second") }}
                    </span>
                </div>
                <div class="flex items-center gap-1">
                    <DamageShow :value="dotDamage" />
                    <Icon icon="ri:settings-3-line" class="size-3.5 opacity-60" />
                </div>
            </div>
            <!-- 目标表达式（下划线输入） -->
            <div
                class="flex items-center gap-1 rounded-none border-b border-base-content/20 px-0.5 pb-1 text-sm transition-colors duration-150 focus-within:border-primary"
                :class="dropTargetClass(TARGET_KEY)"
                :data-expr-drop="TARGET_KEY"
                data-target-expression
                @click="handleDropClick(TARGET_KEY)"
            >
                <ExprInput
                    ref="targetInputRef"
                    :model-value="expressionInput"
                    class="grow"
                    font-size="14px"
                    line-height="20px"
                    :macros="exprMacros"
                    :placeholder="$t('char-build.damage')"
                    @update:model-value="onExpressionInput"
                />
                <div v-if="expressionInput" class="flex cursor-pointer items-center hover:text-primary" data-target-clear @click="clearExpression">
                    <Icon icon="codicon:chrome-close" />
                </div>
            </div>
            <p v-if="expressionError" class="flex items-center text-[11px] text-error">{{ expressionError }}</p>
            <!-- 结果行（由父级注入 TranscendResultPanel）：与原版一样紧跟表达式、同处一个内容块 -->
            <slot name="result" />
        </div>

<Teleport to="body">
        <dialog class="modal" :class="{ 'modal-open': astHelpOpen }">
            <div class="modal-box w-11/12 max-w-6xl bg-base-300 p-0">
                <ASTHelp
                    v-if="astHelpOpen"
                    :model-value="astHelpOpen"
                    :char-build="activeBuild ?? undefined"
                    :skill="activeBuild?.selectedSkill"
                    :initial-expression="astHelpInitialExpression"
                    @update:model-value="astHelpOpen = $event === true"
                    @select="onAstHelpSelect"
                />
            </div>
            <div class="modal-backdrop" @click="astHelpOpen = false" />
        </dialog>
    </Teleport>

<Teleport to="body">
        <dialog class="modal" :class="{ 'modal-open': dotDialogOpen }">
            <DotConfigDialog
                v-if="dotDialogOpen && activeBuild"
                :char-build="activeBuild"
                :dot-settings="dotDraft"
                @close="closeDotDialog"
            />
            <div class="modal-backdrop" @click="closeDotDialog" />
        </dialog>
    </Teleport>
    </div>
</template>
