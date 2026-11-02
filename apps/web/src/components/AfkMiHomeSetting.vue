<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import {
    availablePlugins,
    ensurePluginsLoaded,
    installedPlugins,
    installPlugin,
    pluginSettings,
    refreshAvailable,
    uninstallPlugin,
} from "@/automation/loader"
import { useAutomationStore } from "@/automation/store"
import AutomationPanel from "@/components/AutomationPanel.vue"
import { useAfkLedgerStore } from "@/store/afkLedger"
import {
    type AutomationCondition,
    type AutomationRulePreset,
    migrateLegacyAutomation,
} from "@/store/automation-migrate"
import { MIHAN_TYPES } from "@/store/mihan"
import { useUIStore } from "@/store/ui"
import { afkDungeonName } from "@/utils/afk-ledger"
import { dungeonDisplayName } from "@/utils/dungeon-utils"

const { t } = useTranslation()
const automation = useAutomationStore()
const ledger = useAfkLedgerStore()
const ui = useUIStore()

const EMPTY_CONFIG = {}
const selectedPlugin = ref("")
const managerOpen = ref(false)
const managerTab = ref<"installed" | "market">("installed")
const managerTabs = computed(() => [
    { label: t("automation.plugins_installed"), value: "installed" },
    { label: t("automation.plugins_market"), value: "market" },
])
const marketLoading = ref(false)
const operatingId = ref("")
const marketError = ref("")

const installedIds = computed(() => Object.keys(installedPlugins).sort())
const marketList = computed(() => [...availablePlugins].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
const selectedSettings = computed(() => (selectedPlugin.value ? pluginSettings[selectedPlugin.value] ?? null : null))

function pluginName(id: string, title?: string) {
    return title || id
}

async function refreshMarket() {
    marketLoading.value = true
    marketError.value = ""
    try {
        await refreshAvailable()
    } catch (error) {
        marketError.value = error instanceof Error ? error.message : String(error)
    } finally {
        marketLoading.value = false
    }
}

async function install(id: string) {
    operatingId.value = id
    try {
        await installPlugin(id)
        if (!selectedPlugin.value) selectedPlugin.value = id
        ui.showSuccessMessage(t("automation.plugin_installed", { id }))
    } catch (error) {
        ui.showErrorMessage(t("automation.plugin_install_fail", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
        operatingId.value = ""
    }
}

function uninstall(id: string) {
    uninstallPlugin(id)
    if (selectedPlugin.value === id) selectedPlugin.value = installedIds.value[0] ?? ""
}

const panelRef = ref<InstanceType<typeof AutomationPanel> | null>(null)

type PresetShape = "dungeon_complete" | "item_drop" | "craft_complete" | "commission_refresh"
const SHAPES: PresetShape[] = ["dungeon_complete", "item_drop", "craft_complete", "commission_refresh"]
const presetShape = ref<PresetShape>("dungeon_complete")
const presetDungeon = ref("-")
const presetItem = ref("")
const presetRarity = ref(1)
const presetMihanType = ref("-")

const dungeonOptions = computed(() => {
    const entries = Object.entries(ledger.snapshot.dungeons)
        .map(([id, entry]) => ({ value: id, label: dungeonDisplayName(id, afkDungeonName(id, entry.name)) }))
        .sort((a, b) => a.label.localeCompare(b.label))
    return [{ value: "-", label: t("afk-mihome.dungeon_any") }, ...entries]
})

const rarityOptions = computed(() => [
    { value: 1, label: t("afk-mihome.rarity_any") },
    ...[5, 4, 3, 2].map(n => ({ value: n, label: t(`afk-ledger.rarity_${n}`) })),
])

function dungeonLabel(id: string) {
    if (!id) return t("afk-mihome.dungeon_any")
    const entry = ledger.snapshot.dungeons[id]
    return dungeonDisplayName(id, afkDungeonName(id, entry?.name ?? id))
}

function applyPreset() {
    const when: AutomationCondition[] = []
    let kind: string
    let name: string
    if (presetShape.value === "dungeon_complete") {
        kind = "dungeon"
        when.push({ field: "status", op: "eq", value: "complete" })
        if (presetDungeon.value !== "-") {
            when.push({ field: "id", op: "eq", value: presetDungeon.value })
            name = dungeonLabel(presetDungeon.value)
        } else {
            name = t("afk-mihome.kind_dungeon_complete")
        }
    } else if (presetShape.value === "item_drop") {
        kind = "reward"
        const item = presetItem.value.trim()
        if (item) {
            when.push({ field: "name", op: "contains", value: item })
            name = item
        } else {
            name = t("afk-mihome.kind_item_drop")
        }
        if (presetRarity.value > 1) when.push({ field: "rarity", op: "gte", value: presetRarity.value })
    } else if (presetShape.value === "commission_refresh") {
        kind = "commission_refresh"
        if (presetMihanType.value !== "-") when.push({ field: "type", op: "eq", value: presetMihanType.value })
        const mission = presetItem.value.trim()
        if (mission) {
            when.push({ field: "mission", op: "contains", value: mission })
            name = mission
        } else {
            name = t("afk-mihome.kind_commission_refresh")
        }
    } else {
        kind = "craft"
        const item = presetItem.value.trim()
        if (item) {
            when.push({ field: "name", op: "contains", value: item })
            name = item
        } else {
            name = t("afk-mihome.kind_craft_complete")
        }
    }
    const preset: AutomationRulePreset = { name: name!, kind, when }
    panelRef.value?.startNewRule(preset)
}

function openManager() {
    managerOpen.value = true
    if (marketList.value.length === 0) void refreshMarket()
}

onMounted(() => {
    migrateLegacyAutomation()
    void ledger.init()
    void ensurePluginsLoaded().then(() => {
        if (!selectedPlugin.value) selectedPlugin.value = installedIds.value[0] ?? ""
    })
})
</script>

<template>
    <div
        class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
    >
        <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2">
                <span class="text-[11px] font-medium text-base-content/55">
                    {{ $t("automation.plugins_installed") }} · {{ installedIds.length }}
                </span>
                <button type="button" class="btn btn-xs ml-auto" @click="openManager">
                    {{ $t("automation.plugins_manage") }}
                </button>
            </div>
            <Dialog v-model="managerOpen" wide :title="$t('automation.plugins_manage')" @submit="managerOpen = false">
                <template #content>
                    <div class="flex flex-col gap-3">
            <AniTabs v-model="managerTab" :tabs="managerTabs" />
            <div v-show="managerTab === 'installed'" class="flex flex-col gap-1">
                <div v-if="installedIds.length === 0" class="py-1 text-center text-[11px] text-base-content/45">
                    {{ $t("automation.plugins_empty") }}
                </div>
                <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr]">
                    <div class="flex flex-col gap-1">
                        <div
                            v-for="id in installedIds"
                            :key="id"
                            class="flex items-center gap-1.5 rounded-xs border px-1.5 py-1 text-[11px]"
                            :class="selectedPlugin === id ? 'border-secondary/50 bg-secondary/10 text-base-content/85' : 'border-base-content/15 text-base-content/70'"
                        >
                            <input
                                type="checkbox"
                                class="checkbox checkbox-xs"
                                :checked="automation.isPluginEnabled(id)"
                                @click.stop
                                @change="automation.setPluginEnabled(id, ($event.target as HTMLInputElement).checked)"
                            />
                            <button type="button" class="min-w-0 flex-1 truncate text-left" @click="selectedPlugin = id">
                                {{ pluginName(id, installedPlugins[id].title) }}
                            </button>
                            <span class="font-mono text-[10px] text-base-content/35">v{{ installedPlugins[id].version }}</span>
                            <button
                                type="button"
                                class="btn btn-xs h-5 min-h-0 px-1 text-[10px] text-error/80 hover:text-error"
                                :title="$t('automation.plugin_uninstall')"
                                @click="uninstall(id)"
                            >
                                {{ $t("automation.plugin_uninstall") }}
                            </button>
                        </div>
                    </div>
                    <div class="min-w-0">
                        <component
                            v-if="selectedPlugin && selectedSettings"
                            :is="selectedSettings"
                            :model-value="EMPTY_CONFIG"
                            :account-only="true"
                        />
                        <p v-else class="py-2 text-center text-[11px] text-base-content/45">
                            {{ $t("automation.plugin_select_hint") }}
                        </p>
                    </div>
                </div>
            </div>
            <div v-show="managerTab === 'market'" class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                    <span class="text-[11px] font-medium text-base-content/55">{{ $t("automation.plugins_market") }}</span>
                    <button
                        type="button"
                        class="btn btn-xs ml-auto"
                        :disabled="marketLoading"
                        @click="refreshMarket"
                    >
                        <span v-if="marketLoading" class="loading loading-spinner loading-xs" />
                        {{ $t("automation.refresh") }}
                    </button>
                </div>
                <span v-if="marketError" class="text-xs text-error">{{ marketError }}</span>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div
                        v-for="item in marketList"
                        :key="item.id"
                        class="flex flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="flex items-center gap-1.5">
                            <span class="min-w-0 flex-1 truncate text-[12px] font-semibold text-base-content">
                                {{ pluginName(item.id, item.title) }}
                            </span>
                            <span class="font-mono text-[10px] text-base-content/35">v{{ item.version }}</span>
                        </div>
                        <p v-if="item.desc" class="min-h-8 text-[11px] leading-relaxed text-base-content/55">
                            {{ item.desc }}
                        </p>
                        <div class="flex items-center gap-1.5">
                            <span v-if="installedPlugins[item.id]" class="text-[10px] text-success">
                                {{ $t("automation.plugin_installed_tag", { version: installedPlugins[item.id].version }) }}
                            </span>
                            <button
                                v-else
                                type="button"
                                class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px]"
                                :disabled="operatingId === item.id"
                                @click="install(item.id)"
                            >
                                <span v-if="operatingId === item.id" class="loading loading-spinner loading-xs" />
                                {{ $t("automation.plugin_install") }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
                    </div>
                </template>
                <template #actions>
                    <div class="flex justify-end gap-1.5">
                        <button type="button" class="btn btn-xs" @click="managerOpen = false">
                            {{ $t("afk-mihome.close") }}
                        </button>
                    </div>
                </template>
            </Dialog>
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="mb-1.5 flex flex-wrap items-end gap-2">
                    <label class="flex min-w-32 flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_kind") }}</span>
                        <Select
                            v-model="presetShape"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem v-for="shape in SHAPES" :key="shape" :value="shape">
                                {{ $t(`afk-mihome.kind_${shape}`) }}
                            </SelectItem>
                        </Select>
                    </label>
                    <label v-if="presetShape === 'dungeon_complete'" class="flex min-w-32 flex-1 flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_dungeon") }}</span>
                        <Select
                            v-model="presetDungeon"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem v-for="option in dungeonOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </Select>
                    </label>
                    <label v-else-if="presetShape === 'commission_refresh'" class="flex min-w-32 flex-1 flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_mission") }}</span>
                        <input
                            v-model="presetItem"
                            type="text"
                            class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            :placeholder="$t('afk-mihome.field_mission_placeholder')"
                            autocomplete="off"
                        />
                    </label>
                    <label v-else class="flex min-w-32 flex-1 flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_item") }}</span>
                        <input
                            v-model="presetItem"
                            type="text"
                            class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            :placeholder="$t('afk-mihome.field_item_placeholder')"
                            autocomplete="off"
                        />
                    </label>
                    <label v-if="presetShape === 'commission_refresh'" class="flex min-w-28 flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_mihan_type") }}</span>
                        <Select
                            v-model="presetMihanType"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem value="-">{{ $t("afk-mihome.mihan_type_any") }}</SelectItem>
                            <SelectItem v-for="type in MIHAN_TYPES" :key="type" :value="type">
                                {{ type }}
                            </SelectItem>
                        </Select>
                    </label>
                    <label v-if="presetShape === 'item_drop'" class="flex min-w-28 flex-col gap-1">
                        <span class="text-[11px] text-base-content/55">{{ $t("afk-mihome.field_rarity") }}</span>
                        <Select
                            v-model="presetRarity"
                            class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        >
                            <SelectItem v-for="option in rarityOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </Select>
                    </label>
                    <button type="button" class="btn btn-xs" @click="applyPreset">
                        {{ $t("automation.preset_apply") }}
                    </button>
                </div>
                <AutomationPanel ref="panelRef" />
            </div>
        </div>
    </div>
</template>
