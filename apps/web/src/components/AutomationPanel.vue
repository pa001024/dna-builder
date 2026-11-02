<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import { actionVersion, fireRuleNow, listActions, pluginOf } from "@/automation/bus"
import { type CondValueOption, resolveValueOptions, schemaFieldsFor } from "@/automation/eventSchema"
import { ensurePluginsLoaded, pluginSettings } from "@/automation/loader"
import { readPluginGlobalConfig } from "@/automation/pluginConfig"
import { useAutomationStore } from "@/automation/store"
import type { ActionDef, AutomationRule, MatchOp } from "@/automation/types"
import { useAfkLedgerStore } from "@/store/afkLedger"
import { AFK_KINDS, type AutomationCondition, type AutomationRulePreset } from "@/store/automation-migrate"
import { useUIStore } from "@/store/ui"
import { afkDungeonName } from "@/utils/afk-ledger"
import { dungeonDisplayName } from "@/utils/dungeon-utils"

const props = withDefaults(
    defineProps<{
        /** 锁死动作 id（此时隐藏动作选择器）。 */
        actionFilter?: string
        /** 可选动作列表（默认读 listActions()，由注册表提供）。 */
        actions?: ActionDef[]
    }>(),
    {
        actionFilter: "",
        actions: undefined,
    }
)

const { t } = useTranslation()
const ui = useUIStore()
const store = useAutomationStore()
const ledger = useAfkLedgerStore()

const OP_OPTIONS: MatchOp[] = ["eq", "neq", "contains", "gte", "lte"]

const effectiveActions = computed(() => {
    void actionVersion.value
    return props.actions ?? listActions()
})

const rules = computed(() =>
    store.rules.filter(item => typeof item.id === "string" && typeof item.actionId === "string" && typeof item.match === "object")
)
const lastFiredAt = computed(() => store.lastFiredAt)
const fireError = computed(() => store.fireError)
const firingId = ref("")

onMounted(() => {
    void ensurePluginsLoaded()
})

const showForm = ref(false)
const editingId = ref<string | null>(null)
const draftName = ref("")
const draftEnabled = ref(true)
const draftFireOnce = ref(false)
const draftKind = ref("")
const draftWhen = ref<AutomationCondition[]>([])

/** 当前 kind 下可选字段（字段列只允许下拉选择）。 */
const schemaFields = computed(() => schemaFieldsFor(draftKind.value || undefined))

/** 副本下拉（dungeon id 取值用）。 */
const dungeonOptions = computed(() =>
    Object.entries(ledger.snapshot.dungeons)
        .map(([id, entry]) => ({ value: id, label: dungeonDisplayName(id, afkDungeonName(id, entry.name)) }))
        .sort((a, b) => a.label.localeCompare(b.label))
)

/** 某行值的取值方式：副本下拉 / 枚举下拉 / 自由文本。 */
function valueOptionsOf(cond: AutomationCondition): CondValueOption[] | "dungeons" | null {
    if (!cond.field) return null
    return resolveValueOptions(draftKind.value || undefined, cond.field)
}

/** 切换动作：新动作的插件全局配置补齐缺失项（已有值保留）。 */
function switchAction(actionId: string) {
    draftActionId.value = actionId
    draftConfig.value = { ...readPluginGlobalConfig(pluginOf(actionId)), ...draftConfig.value }
}

/** kind 变化后剪掉已不存在的字段行（无效条件永不命中）。 */
function pruneConditions() {
    const valid = new Set(schemaFields.value.map(item => item.field))
    draftWhen.value = draftWhen.value.filter(item => valid.has(item.field))
}
const draftActionId = ref("")
const draftConfig = ref<Record<string, unknown>>({})

const activeActionId = computed(() => props.actionFilter || draftActionId.value)

function actionDefOf(id: string) {
    return effectiveActions.value.find(item => item.id === id)
}

function ruleActionTitle(id: string) {
    return actionDefOf(id)?.title ?? id
}

const activeActionDef = computed(() => actionDefOf(activeActionId.value))



/** 插件自定义设置界面（有则渲染，无则走通用字段表单）。 */
const settingsComp = computed(() => pluginSettings[pluginOf(activeActionId.value)] ?? null)

function resetDraft(preset?: AutomationRulePreset) {
    editingId.value = null
    draftName.value = preset?.name ?? ""
    draftEnabled.value = true
    draftFireOnce.value = false
    draftKind.value = preset?.kind ?? ""
    draftWhen.value = (preset?.when ?? []).map(item => ({ ...item }))
    draftActionId.value = props.actionFilter || effectiveActions.value[0]?.id || ""
    draftConfig.value = { ...readPluginGlobalConfig(pluginOf(draftActionId.value)), ...(preset?.actionConfig ?? {}) }
}

/**
 * 从预设开一个新规则（父组件快捷按钮调用，编辑器内场景下拉框继续选场景）。
 * @param preset kind + when（+ 可选 name / actionConfig）预设
 */
async function startNewRule(preset?: AutomationRulePreset) {
    resetDraft(preset)
    await ensurePluginsLoaded()
    if (!actionDefOf(draftActionId.value)) draftActionId.value = effectiveActions.value[0]?.id ?? ""
    showForm.value = true
}

async function openEdit(rule: AutomationRule) {
    editingId.value = rule.id
    draftName.value = rule.name
    draftEnabled.value = rule.enabled
    draftFireOnce.value = rule.fireOnce
    draftKind.value = rule.match.kind ?? (rule.match as { kinds?: string[] }).kinds?.[0] ?? ""
    draftWhen.value = (rule.match.when ?? []).map(item => ({ ...item }))
    draftActionId.value = props.actionFilter || rule.actionId
    draftConfig.value = { ...readPluginGlobalConfig(pluginOf(draftActionId.value)), ...rule.actionConfig }
    await ensurePluginsLoaded()
    showForm.value = true
}

function kindLabel(kind?: string) {
    return kind ? t(`automation.kind_${kind}`) : t("automation.kind_any")
}

function ruleSummary(rule: AutomationRule) {
    const kinds = kindLabel(rule.match.kind ?? (rule.match as { kinds?: string[] }).kinds?.[0])
    const conditions = (rule.match.when ?? [])
        .map(item => `${item.field} ${t(`automation.op_${item.op}`)} ${String(item.value)}`)
        .join("；")
    const sceneName = String(rule.actionConfig.sceneName ?? rule.actionConfig.scene_id ?? "")
    return [kinds, conditions, sceneName ? `→ ${sceneName}` : ""].filter(Boolean).join(" ")
}

function configString(key: string) {
    const value = draftConfig.value[key]
    return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

function setConfig(key: string, value: unknown) {
    draftConfig.value = { ...draftConfig.value, [key]: value }
}

function addCondition() {
    draftWhen.value = [...draftWhen.value, { field: schemaFields.value[0]?.field ?? "", op: "contains" as MatchOp, value: "" }]
}

function removeCondition(index: number) {
    draftWhen.value = draftWhen.value.filter((_, i) => i !== index)
}

function saveForm() {
    const actionId = activeActionId.value
    if (!actionId) {
        ui.showErrorMessage(t("automation.actions_empty"))
        return
    }
    const def = actionDefOf(actionId)
    const config: Record<string, unknown> = { ...draftConfig.value }
    for (const field of def?.fields ?? []) {
        if (config[field.key] === undefined && field.def !== undefined) config[field.key] = field.def
        if (field.type === "number") {
            const raw = config[field.key]
            config[field.key] = typeof raw === "number" ? raw : Number(String(raw ?? "").trim() || 0)
        }
        if (field.type === "boolean") config[field.key] = config[field.key] === true
    }
    for (const field of def?.fields ?? []) {
        if (field.required && String(config[field.key] ?? "").trim() === "") {
            ui.showErrorMessage(t("automation.field_required", { field: field.label }))
            return
        }
    }
    const draft = {
        enabled: draftEnabled.value,
        name: draftName.value.trim() || ruleActionTitle(actionId),
        fireOnce: draftFireOnce.value,
        match: {
            ...(draftKind.value ? { kind: draftKind.value } : {}),
            when: draftWhen.value.filter(item => item.field.trim()).map(item => ({ ...item, field: item.field.trim() })),
        },
        actionId,
        actionConfig: config,
    }
    if (editingId.value) store.updateRule(editingId.value, draft)
    else store.addRule(draft)
    showForm.value = false
    editingId.value = null
}

function sceneLabelOf(rule: AutomationRule) {
    return String(rule.actionConfig.sceneName ?? rule.actionConfig.scene_id ?? rule.name)
}

async function fireNow(id: string) {
    const rule = rules.value.find(item => item.id === id)
    if (!rule) return
    firingId.value = id
    try {
        const result = await fireRuleNow(rule)
        if (result.ok) ui.showSuccessMessage(t("afk-mihome.fire_ok", { scene: sceneLabelOf(rule) }))
        else ui.showErrorMessage(t("afk-mihome.fire_fail", { error: result.message ?? id }))
    } catch (error) {
        ui.showErrorMessage(t("afk-mihome.fire_fail", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
        if (firingId.value === id) firingId.value = ""
    }
}

function timeLabel(ms: number) {
    return new Date(ms).toLocaleTimeString(undefined, { hour12: false })
}

defineExpose({ startNewRule })
</script>

<template>
    <div class="flex flex-col gap-2">
        <div class="mb-1.5 flex items-center gap-2">
            <span class="text-[11px] font-medium text-base-content/55">{{ $t("automation.title") }}</span>
            <button type="button" class="btn btn-xs ml-auto" @click="startNewRule()">
                {{ $t("automation.add_rule") }}
            </button>
        </div>
        <div v-if="effectiveActions.length === 0" class="py-1 text-center text-xs text-base-content/45">
            {{ $t("automation.actions_empty") }}
        </div>
        <div v-else-if="rules.length === 0" class="py-2 text-center text-xs text-base-content/45">
            {{ $t("automation.rule_empty") }}
        </div>
        <div v-else class="flex flex-col gap-1">
            <div
                v-for="rule in rules"
                :key="rule.id"
                class="flex flex-wrap items-center gap-2 rounded-xs bg-base-100/60 px-1.5 py-1"
            >
                <input
                    type="checkbox"
                    class="toggle toggle-xs toggle-secondary"
                    :checked="rule.enabled"
                    @change="store.updateRule(rule.id, { enabled: ($event.target as HTMLInputElement).checked })"
                />
                <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/75">
                    {{ rule.name }}
                    <span class="text-base-content/45">{{ ruleSummary(rule) }}</span>
                </span>
                <span v-if="rule.fireOnce" class="inline-flex h-4 items-center rounded-xs bg-warning/15 px-1 text-[9px] font-semibold text-warning">
                    {{ $t("automation.only_once") }}
                </span>
                <span v-if="lastFiredAt[rule.id]" class="font-orbitron text-[10px] text-base-content/35 tabular-nums">
                    {{ $t("automation.fired_at", { time: timeLabel(lastFiredAt[rule.id]) }) }}
                </span>
                <span v-if="fireError[rule.id]" class="max-w-48 truncate text-[10px] text-error" :title="fireError[rule.id]">
                    {{ fireError[rule.id] }}
                </span>
                <button
                    type="button"
                    class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px]"
                    :disabled="firingId === rule.id"
                    :title="$t('afk-mihome.fire_now')"
                    @click="fireNow(rule.id)"
                >
                    {{ $t("afk-mihome.fire_now") }}
                </button>
                <button
                    type="button"
                    class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px]"
                    :title="$t('afk-mihome.edit_rule')"
                    @click="openEdit(rule)"
                >
                    {{ $t("afk-mihome.edit_rule") }}
                </button>
                <button
                    type="button"
                    class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px] text-error/80 hover:text-error"
                    :title="$t('afk-mihome.delete')"
                    @click="store.removeRule(rule.id)"
                >
                    {{ $t("afk-mihome.delete") }}
                </button>
            </div>
        </div>

        <Dialog v-model="showForm" wide :title="editingId ? $t('afk-mihome.edit_rule') : $t('automation.add_rule')">
            <template #content>
                <div class="flex flex-col gap-2">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label class="flex flex-col gap-1">
                    <span class="text-[11px] text-base-content/55">{{ $t("automation.name") }}</span>
                    <input
                        v-model="draftName"
                        type="text"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        autocomplete="off"
                    />
                </label>
                <div v-if="!actionFilter" class="flex flex-col gap-1">
                    <span class="text-[11px] text-base-content/55">{{ $t("automation.action") }}</span>
                    <Select
                        :model-value="draftActionId"
                        :placeholder="$t('automation.actions_empty')"
                        class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        @update:model-value="switchAction($event as string)"
                    >
                        <SelectItem v-for="action in effectiveActions" :key="action.id" :value="action.id">
                            {{ action.title }}
                        </SelectItem>
                    </Select>
                </div>
                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-1.5 text-[11px] text-base-content/55">
                        <input v-model="draftEnabled" type="checkbox" class="toggle toggle-xs toggle-secondary" />
                        {{ $t("afk-mihome.enable") }}
                    </label>
                    <label class="flex items-center gap-1.5 text-[11px] text-base-content/55">
                        <input v-model="draftFireOnce" type="checkbox" class="toggle toggle-xs toggle-secondary" />
                        {{ $t("automation.only_once") }}
                    </label>
                </div>
            </div>
            <div class="flex flex-col gap-1">
                <span class="text-[11px] text-base-content/55">{{ $t("automation.kind") }}</span>
                <div class="flex flex-wrap gap-1.5">
                    <Tooltip
                        v-for="kind in AFK_KINDS"
                        :key="kind"
                        :tooltip="$t(`automation.kind_${kind}_desc`)"
                        side="top"
                    >
                        <label
                            class="inline-flex cursor-pointer items-center gap-1 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/70 has-checked:border-secondary/50 has-checked:bg-secondary/10"
                        >
                            <input
                                v-model="draftKind"
                                type="radio"
                                :value="kind"
                                class="radio radio-xs"
                                @change="pruneConditions"
                            />
                            {{ $t(`automation.kind_${kind}`) }}
                        </label>
                    </Tooltip>
                    <label
                        class="inline-flex cursor-pointer items-center gap-1 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/70 has-checked:border-secondary/50 has-checked:bg-secondary/10"
                    >
                        <input v-model="draftKind" type="radio" value="" class="radio radio-xs" @change="pruneConditions" />
                        {{ $t("automation.kind_any") }}
                    </label>
                </div>
            </div>
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                    <span class="text-[11px] text-base-content/55">{{ $t("automation.when") }}</span>
                    <button type="button" class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px]" @click="addCondition">
                        {{ $t("automation.add_condition") }}
                    </button>
                </div>
                <div v-for="(cond, index) in draftWhen" :key="index" class="grid grid-cols-[1fr_110px_1fr_auto] items-end gap-1.5">
                    <label class="flex flex-col gap-1">
                        <span class="text-[10px] text-base-content/45">{{ $t("automation.field") }}</span>
                        <Select
                            v-model="cond.field"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem v-for="option in schemaFields" :key="option.field" :value="option.field">
                                {{ $t(option.labelKey) }}
                            </SelectItem>
                        </Select>
                    </label>
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] text-base-content/45">{{ $t("automation.op") }}</span>
                        <Select
                            v-model="cond.op"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem v-for="op in OP_OPTIONS" :key="op" :value="op">
                                {{ $t(`automation.op_${op}`) }}
                            </SelectItem>
                        </Select>
                    </div>
                    <label class="flex flex-col gap-1">
                        <span class="text-[10px] text-base-content/45">{{ $t("automation.value") }}</span>
                        <Select
                            v-if="valueOptionsOf(cond) === 'dungeons'"
                            v-model="cond.value"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem v-for="option in dungeonOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </Select>
                        <Select
                            v-else-if="Array.isArray(valueOptionsOf(cond))"
                            v-model="cond.value"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem
                                v-for="option in valueOptionsOf(cond) as CondValueOption[]"
                                :key="String(option.value)"
                                :value="option.value"
                            >
                                {{ option.labelKey ? $t(option.labelKey) : (option.label ?? String(option.value)) }}
                            </SelectItem>
                        </Select>
                        <input
                            v-else
                            :value="String(cond.value ?? '')"
                            type="text"
                            class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            autocomplete="off"
                            @input="cond.value = ($event.target as HTMLInputElement).value"
                        />
                    </label>
                    <button
                        type="button"
                        class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px] text-error/80 hover:text-error"
                        :title="$t('afk-mihome.delete')"
                        @click="removeCondition(index)"
                    >
                        {{ $t("afk-mihome.delete") }}
                    </button>
                </div>
            </div>
            <div v-if="activeActionDef" class="flex flex-col gap-2">
                <component
                    v-if="settingsComp"
                    :is="settingsComp"
                    :model-value="draftConfig"
                    @update:model-value="draftConfig = $event"
                />
                <template v-else v-for="field in activeActionDef.fields" :key="field.key">
                    <label class="flex flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ field.label }}</span>
                        <input
                            v-if="field.type === 'text' || field.type === 'password' || field.type === 'number'"
                            :value="configString(field.key)"
                            :type="field.type === 'number' ? 'number' : field.type"
                            class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            autocomplete="off"
                            @input="setConfig(field.key, ($event.target as HTMLInputElement).value)"
                        />
                        <textarea
                            v-else-if="field.type === 'textarea'"
                            :value="configString(field.key)"
                            class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            rows="2"
                            @input="setConfig(field.key, ($event.target as HTMLTextAreaElement).value)"
                        />
                        <input
                            v-else
                            type="checkbox"
                            class="toggle toggle-xs toggle-secondary"
                            :checked="draftConfig[field.key] === true"
                            @change="setConfig(field.key, ($event.target as HTMLInputElement).checked)"
                        />
                    </label>
                </template>
            </div>
                </div>
            </template>
            <template #actions>
                <div class="flex justify-end gap-1.5">
                    <button type="button" class="btn btn-xs" @click="showForm = false; editingId = null">
                        {{ $t("afk-mihome.cancel") }}
                    </button>
                    <button type="button" class="btn btn-xs btn-primary" @click="saveForm">
                        {{ $t("afk-mihome.save") }}
                    </button>
                </div>
            </template>
        </Dialog>
    </div>
</template>
