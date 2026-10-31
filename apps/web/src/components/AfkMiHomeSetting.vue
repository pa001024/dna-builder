<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import { env } from "@/env"
import { useAfkLedgerStore } from "@/store/afkLedger"
import { type MiHomeRuleDraft, type MiHomeRuleKind, useMiHomeLinkStore } from "@/store/mihomeLink"
import { useUIStore } from "@/store/ui"
import { AFK_DUNGEON_ALIASES, afkDungeonName } from "@/utils/afk-ledger"
import { dungeonDisplayName } from "@/utils/dungeon-utils"

const { t } = useTranslation()
const mihome = useMiHomeLinkStore()
const ledger = useAfkLedgerStore()
const ui = useUIStore()

const KIND_OPTIONS: MiHomeRuleKind[] = ["dungeon_complete", "item_drop", "craft_complete"]

const showForm = ref(false)
const editingId = ref<string | null>(null)
const formKind = ref<MiHomeRuleKind>("dungeon_complete")
const formDungeonId = ref("-")
const formItemName = ref("")
const formMinRarity = ref(1)
const formSceneKey = ref("-")

const loginStatusKey = computed(() => {
    if (mihome.loggedIn === true) return "afk-mihome.logged_in"
    if (mihome.loggedIn === false) return "afk-mihome.not_logged_in"
    return "afk-mihome.status_unknown"
})

const dungeonOptions = computed(() => {
    const entries = Object.entries(ledger.snapshot.dungeons)
        .map(([id, entry]) => ({ value: id, label: dungeonDisplayName(id, afkDungeonName(id, entry.name)) }))
        .sort((a, b) => a.label.localeCompare(b.label))
    return [{ value: "-", label: t("afk-mihome.dungeon_any") }, ...entries]
})

const sceneOptions = computed(() =>
    mihome.effectiveScenes.map(scene => ({
        value: `${scene.scene_id}@@${scene.home_id}`,
        label: scene.home_name ? `${scene.name} · ${scene.home_name}` : scene.name,
    }))
)

const rarityOptions = computed(() => [
    { value: 1, label: t("afk-mihome.rarity_any") },
    ...[5, 4, 3, 2].map(n => ({ value: n, label: t(`afk-ledger.rarity_${n}`) })),
])

/**
 * 副本 id 转展示名：快照里有就用快照名，否则按 id 原样。
 * @param id 副本 id
 * @returns 展示名
 */
function dungeonLabel(id: string) {
    if (!id) return t("afk-mihome.dungeon_any")
    const entry = ledger.snapshot.dungeons[id]
    if (id in AFK_DUNGEON_ALIASES) return dungeonDisplayName(id, afkDungeonName(id, entry?.name ?? id))
    return dungeonDisplayName(id, afkDungeonName(id, entry?.name ?? id))
}

/**
 * 规则的条件摘要（种类徽标右侧的文字）。
 * @param rule 规则
 * @returns 条件文本
 */
function conditionText(rule: { kind: MiHomeRuleKind; dungeonId: string; itemName: string; minRarity: number }) {
    if (rule.kind === "dungeon_complete") return dungeonLabel(rule.dungeonId)
    if (rule.kind === "item_drop") {
        const name = rule.itemName.trim() || t("afk-mihome.dungeon_any")
        if (rule.minRarity > 1) return `${name} · ${t(`afk-ledger.rarity_${rule.minRarity}`)}+`
        return name
    }
    return rule.itemName.trim() || t("afk-mihome.dungeon_any")
}

/**
 * 场景 key 转完整场景（含 home_id）。
 * @param key 复合 key
 * @returns 场景或 null
 */
function sceneOf(key: string) {
    const [sceneId, homeId] = key.split("@@")
    if (!sceneId || sceneId === "-") return null
    return (
        mihome.effectiveScenes.find(scene => scene.scene_id === sceneId && scene.home_id === (homeId ?? "")) ??
        mihome.effectiveScenes.find(scene => scene.scene_id === sceneId) ??
        null
    )
}

/**
 * 打开新增表单：默认值按当前副本/场景是否有数据给个合理起点。
 */
function openAdd() {
    editingId.value = null
    formKind.value = "dungeon_complete"
    formDungeonId.value = "-"
    formItemName.value = ""
    formMinRarity.value = 1
    formSceneKey.value = sceneOptions.value[0]?.value ?? "-"
    showForm.value = true
}

/**
 * 打开编辑表单：把规则回填进草稿。
 * @param id 规则 id
 */
function openEdit(id: string) {
    const rule = mihome.rules.find(item => item.id === id)
    if (!rule) return
    editingId.value = id
    formKind.value = rule.kind
    formDungeonId.value = rule.dungeonId || "-"
    formItemName.value = rule.itemName
    formMinRarity.value = rule.minRarity
    formSceneKey.value = `${rule.sceneId}@@${rule.homeId}`
    showForm.value = true
}

/**
 * 保存表单：新增或更新一条绑定，场景必填。
 */
function saveForm() {
    const scene = sceneOf(formSceneKey.value)
    if (!scene) {
        ui.showErrorMessage(t("afk-mihome.scene_placeholder"))
        return
    }
    const draft: MiHomeRuleDraft = {
        enabled: true,
        kind: formKind.value,
        dungeonId: formKind.value === "dungeon_complete" && formDungeonId.value !== "-" ? formDungeonId.value : "",
        itemName: formKind.value === "dungeon_complete" ? "" : formItemName.value.trim(),
        minRarity: formKind.value === "item_drop" ? formMinRarity.value : 1,
        sceneId: scene.scene_id,
        homeId: scene.home_id,
        sceneName: scene.name,
    }
    if (editingId.value) mihome.updateRule(editingId.value, draft)
    else mihome.addRule(draft)
    showForm.value = false
    editingId.value = null
}

/**
 * 取二维码并等待扫码：二维码出现即开始等，成功自动拉场景。
 */
async function getQrAndWait() {
    if (mihome.qrBusy || mihome.loginBusy) return
    try {
        await mihome.beginQr()
    } catch (error) {
        ui.showErrorMessage(t("afk-mihome.login_fail", { error: error instanceof Error ? error.message : String(error) }))
        return
    }
    if (!mihome.qrUrl) {
        ui.showSuccessMessage(t("afk-mihome.login_ok"))
        return
    }
    try {
        await mihome.waitQr()
        ui.showSuccessMessage(t("afk-mihome.login_ok"))
    } catch (error) {
        mihome.cancelQr()
        ui.showErrorMessage(t("afk-mihome.login_fail", { error: error instanceof Error ? error.message : String(error) }))
    }
}

/**
 * 仅刷新场景列表（不弹成功提示，失败才提示）。
 */
async function refreshOnly() {
    if (mihome.scenesBusy) return
    try {
        await mihome.refreshScenes()
    } catch (error) {
        ui.showErrorMessage(t("afk-mihome.test_fail", { error: error instanceof Error ? error.message : String(error) }))
    }
}

/**
 * 退出登录。
 */
async function logout() {
    try {
        await mihome.logout()
    } catch (error) {
        ui.showErrorMessage(t("afk-mihome.login_fail", { error: error instanceof Error ? error.message : String(error) }))
    }
}

/**
 * 立即执行一次规则绑定的场景。
 * @param id 规则 id
 */
async function fireNow(id: string) {
    const rule = mihome.rules.find(item => item.id === id)
    if (!rule) return
    try {
        await mihome.fireRule(id)
        ui.showSuccessMessage(t("afk-mihome.fire_ok", { scene: mihome.sceneNameOf(rule.sceneId, rule.sceneName) }))
    } catch (error) {
        ui.showErrorMessage(t("afk-mihome.fire_fail", { error: error instanceof Error ? error.message : String(error) }))
    }
}

/**
 * 时刻格式化为 HH:MM:SS。
 * @param ms Unix 毫秒
 * @returns 时间文本
 */
function timeLabel(ms: number) {
    return new Date(ms).toLocaleTimeString(undefined, { hour12: false })
}

onMounted(() => {
    void ledger.init()
    if (env.isApp) void mihome.init()
})
</script>

<template>
    <div
        class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
    >
        <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="label-text">
                    {{ $t("afk-mihome.enable") }}
                    <div class="text-xs text-base-content/50">{{ $t("afk-mihome.enable_hint") }}</div>
                    <div v-if="mihome.lastError" class="mt-0.5 text-xs text-error">{{ mihome.lastError }}</div>
                    <div v-if="!env.isApp" class="mt-0.5 text-xs text-warning">{{ $t("afk-support.app_only") }}</div>
                </span>
                <div class="flex shrink-0 items-center gap-2">
                    <span
                        class="inline-block size-1.5 rounded-full"
                        :class="mihome.loggedIn === true ? 'bg-success' : 'bg-base-content/25'"
                        :title="$t(loginStatusKey)"
                    />
                    <span class="text-[11px] text-base-content/55">{{ $t(loginStatusKey) }}</span>
                    <input
                        type="checkbox"
                        class="toggle toggle-secondary"
                        :checked="mihome.enabled"
                        :disabled="!env.isApp"
                        @change="mihome.setEnabled(($event.target as HTMLInputElement).checked)"
                    />
                </div>
            </div>

            <div v-if="env.isApp" class="flex flex-col gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div v-if="mihome.loggedIn !== true" class="flex flex-col gap-2">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            class="btn btn-xs"
                            :disabled="mihome.qrBusy || mihome.loginBusy"
                            @click="getQrAndWait"
                        >
                            <span v-if="mihome.qrBusy" class="loading loading-spinner loading-xs" />
                            {{ $t("afk-mihome.qr_get") }}
                        </button>
                        <span v-if="mihome.loginBusy" class="inline-flex items-center gap-1.5 text-[11px] text-base-content/55">
                            <span class="loading loading-spinner loading-xs" />
                            {{ $t("afk-mihome.qr_waiting") }}
                        </span>
                        <button
                            v-if="mihome.qrUrl"
                            type="button"
                            class="btn btn-xs"
                            @click="mihome.cancelQr"
                        >
                            {{ $t("afk-mihome.cancel") }}
                        </button>
                    </div>
                    <div v-if="mihome.qrUrl" class="flex flex-wrap items-center gap-3">
                        <QrCodeStyled :value="mihome.qrUrl" :size="168" />
                        <p class="min-w-40 flex-1 text-[11px] leading-relaxed text-base-content/55">
                            {{ $t("afk-mihome.qr_scan_hint") }}
                        </p>
                    </div>
                    <p class="text-[11px] leading-relaxed text-base-content/45">{{ $t("afk-mihome.need_login_hint") }}</p>
                </div>
                <div v-else class="flex flex-wrap items-center gap-1.5">
                    <button type="button" class="btn btn-xs" :disabled="mihome.scenesBusy" @click="refreshOnly">
                        <span v-if="mihome.scenesBusy" class="loading loading-spinner loading-xs" />
                        {{ $t("afk-mihome.refresh") }}
                    </button>
                    <button type="button" class="btn btn-xs" @click="logout">
                        {{ $t("afk-mihome.logout") }}
                    </button>
                    <span class="text-[11px] text-base-content/50">
                        {{
                            mihome.effectiveScenes.length > 0
                                ? $t("afk-mihome.scenes_count", { count: mihome.effectiveScenes.length })
                                : $t("afk-mihome.scenes_empty")
                        }}
                    </span>
                </div>
                <p class="text-[11px] leading-relaxed text-base-content/45">{{ $t("afk-mihome.service_hint") }}</p>
                <p class="text-[11px] leading-relaxed text-base-content/45">{{ $t("afk-mihome.scenes_hint") }}</p>
            </div>

            <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="mb-1.5 flex items-center gap-2">
                    <span class="text-[11px] font-medium text-base-content/55">{{ $t("afk-mihome.rules_title") }}</span>
                    <button type="button" class="btn btn-xs ml-auto" @click="showForm ? (showForm = false) : openAdd()">
                        {{ showForm ? $t("afk-mihome.cancel") : $t("afk-mihome.add_rule") }}
                    </button>
                </div>
                <div v-if="mihome.rules.length === 0 && !showForm" class="py-2 text-center text-xs text-base-content/45">
                    {{ $t("afk-mihome.rule_empty") }}
                </div>
                <div v-else class="flex flex-col gap-1">
                    <div
                        v-for="rule in mihome.rules"
                        :key="rule.id"
                        class="flex flex-wrap items-center gap-2 rounded-xs bg-base-100/60 px-1.5 py-1"
                    >
                        <input
                            type="checkbox"
                            class="toggle toggle-xs toggle-secondary"
                            :checked="rule.enabled"
                            @change="mihome.updateRule(rule.id, { enabled: ($event.target as HTMLInputElement).checked })"
                        />
                        <span class="inline-flex h-4 items-center rounded-xs bg-secondary/15 px-1 text-[9px] font-semibold text-secondary">
                            {{ $t(`afk-mihome.kind_${rule.kind}`) }}
                        </span>
                        <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/75">
                            {{ conditionText(rule) }} → {{ mihome.sceneNameOf(rule.sceneId, rule.sceneName) }}
                        </span>
                        <span v-if="mihome.lastFiredAt[rule.id]" class="font-orbitron text-[10px] text-base-content/35 tabular-nums">
                            {{ timeLabel(mihome.lastFiredAt[rule.id]) }}
                        </span>
                        <span v-if="mihome.fireError[rule.id]" class="max-w-48 truncate text-[10px] text-error" :title="mihome.fireError[rule.id]">
                            {{ mihome.fireError[rule.id] }}
                        </span>
                        <button
                            type="button"
                            class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px]"
                            :disabled="mihome.firingId === rule.id"
                            :title="$t('afk-mihome.fire_now')"
                            @click="fireNow(rule.id)"
                        >
                            {{ $t("afk-mihome.fire_now") }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px]"
                            :title="$t('afk-mihome.edit_rule')"
                            @click="openEdit(rule.id)"
                        >
                            {{ $t("afk-mihome.edit_rule") }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px] text-error/80 hover:text-error"
                            :title="$t('afk-mihome.delete')"
                            @click="mihome.removeRule(rule.id)"
                        >
                            {{ $t("afk-mihome.delete") }}
                        </button>
                    </div>
                </div>

                <div v-if="showForm" class="mt-2 flex flex-col gap-2 rounded-xs border border-primary/25 bg-primary/5 p-2">
                    <div class="text-[11px] font-medium text-base-content/60">
                        {{ editingId ? $t("afk-mihome.edit_rule") : $t("afk-mihome.add_rule") }}
                    </div>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label class="flex flex-col gap-1">
                            <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_kind") }}</span>
                            <Select
                                v-model="formKind"
                                class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            >
                                <SelectItem v-for="kind in KIND_OPTIONS" :key="kind" :value="kind">
                                    {{ $t(`afk-mihome.kind_${kind}`) }}
                                </SelectItem>
                            </Select>
                        </label>
                        <label class="flex flex-col gap-1">
                            <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_scene") }}</span>
                            <Select
                                v-model="formSceneKey"
                                class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                :placeholder="$t('afk-mihome.scene_placeholder')"
                            >
                                <SelectItem v-for="option in sceneOptions" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </SelectItem>
                            </Select>
                        </label>
                    </div>
                    <label v-if="formKind === 'dungeon_complete'" class="flex flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_dungeon") }}</span>
                        <Select
                            v-model="formDungeonId"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem v-for="option in dungeonOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </Select>
                    </label>
                    <label v-if="formKind !== 'dungeon_complete'" class="flex flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_item") }}</span>
                        <input
                            v-model="formItemName"
                            type="text"
                            class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            :placeholder="$t('afk-mihome.field_item_placeholder')"
                            autocomplete="off"
                        />
                    </label>
                    <label v-if="formKind === 'item_drop'" class="flex flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_rarity") }}</span>
                        <Select
                            v-model="formMinRarity"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem v-for="option in rarityOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </Select>
                    </label>
                    <div class="flex items-center gap-1.5">
                        <button type="button" class="btn btn-xs btn-primary" @click="saveForm">
                            {{ $t("afk-mihome.save") }}
                        </button>
                        <button type="button" class="btn btn-xs" @click="showForm = false; editingId = null">
                            {{ $t("afk-mihome.cancel") }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
