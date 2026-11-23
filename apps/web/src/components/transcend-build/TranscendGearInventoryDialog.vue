<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, nextTick, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import { slots, type TranscendBuildSettings, type TranscendGearItemConfig } from "@/data"
import { useUIStore } from "@/store/ui"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getGearDisplayName } from "@/utils/transcend-gear/catalog"
import { getItemSearchTokens } from "@/utils/transcend-gear/display"
import { isSameGearItem } from "@/utils/transcend-gear/hash"
import type { TranscendGearStockRow } from "@/utils/transcend-gear/repo"
import { getEquippedGearItems } from "@/utils/transcend-gear/settings"
import { transcendGearStock } from "@/utils/transcend-gear/stock"
import TranscendGearCreate from "./TranscendGearCreate.vue"
import TranscendGearOcrImportDialog from "./TranscendGearOcrImportDialog.vue"
import TranscendGearStockItem from "./TranscendGearStockItem.vue"

/**
 * 升华装备库存管理：搜索 / 槽型 / 类型筛选，编辑（含孔位与宝石，不单设入口）、删除、导出 / 导入 JSON。
 * 与选择器共用 `transcendGearStock` 单例（liveQuery）；删除只移除库存行，不改动已装备配置。
 */

const props = defineProps<{
    open: boolean
    settings: TranscendBuildSettings
    dataReady: boolean
}>()

const emit = defineEmits<{
    (event: "update:open", value: boolean): void
}>()

const { t, i18next } = useTranslation()
const { gt } = useGameText()
const ui = useUIStore()
const stock = transcendGearStock

type KindFilter = "all" | "normal" | "unique"
const kindFilter = ref<KindFilter>("all")
const kindOptions: { value: KindFilter; key: string }[] = [
    { value: "all", key: "common.all" },
    { value: "normal", key: "transcend-build.gear_kind_normal" },
    { value: "unique", key: "transcend-build.gear_kind_unique" },
]
const slotFilter = ref(0)
const search = ref("")
const editingRow = ref<TranscendGearStockRow | null>(null)
/** 打开编辑的库存行根：浮层按钮关闭后可能已 inert，焦点归还到行内卡片根 */
const editRowRoot = ref<HTMLElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const ocrOpen = ref(false)

watch(
    () => props.open,
    value => {
        if (!value) {
            ocrOpen.value = false
            return
        }
        search.value = ""
        kindFilter.value = "all"
        slotFilter.value = 0
        editingRow.value = null
        ocrOpen.value = false
        void stock.init()
    },
    { immediate: true }
)

/** 名称（本地化） */
function rowName(row: TranscendGearStockRow): string {
    return getGearDisplayName(row.item, gt, i18next.language)
}

/** 已装备物品（删除提示用；只读激活变体的两组装备，按库存身份匹配） */
const equippedItems = computed(() => getEquippedGearItems(props.settings.transcend))

/** 库存行是否与任一已装备物品同一身份 */
function isRowEquipped(row: TranscendGearStockRow): boolean {
    return equippedItems.value.some(item => isSameGearItem(item, row.item))
}

/** 搜索匹配：名称 / 词缀文本（原文与译文） / 拼音 / id */
function matchesSearch(row: TranscendGearStockRow, query: string): boolean {
    if (matchPinyin(rowName(row), query).match) return true
    return getItemSearchTokens(row.item, gt).some(
        token => token.toLowerCase().includes(query.toLowerCase()) || matchPinyin(token, query).match
    )
}

/** 过滤后的库存行 */
const filteredRows = computed(() => {
    const query = search.value.trim()
    return stock.rows.value.filter(row => {
        if (slotFilter.value && row.slotType !== slotFilter.value) return false
        if (kindFilter.value !== "all" && row.kind !== kindFilter.value) return false
        return !query || matchesSearch(row, query)
    })
})

/** 打开编辑（缺包时禁用：选择器依赖当前数据），记录行根用于关闭后归还焦点 */
function startEdit(row: TranscendGearStockRow, event?: MouseEvent): void {
    if (!props.dataReady) return
    const trigger = event?.currentTarget
    editRowRoot.value = trigger instanceof Element ? trigger.closest<HTMLElement>("[data-gear-stock-row]") : null
    editingRow.value = row
}

/** 关闭编辑并归还焦点：浮层此时可能已 inert，聚焦行内卡片根（`tabindex=0`）而不再聚焦浮层按钮 */
function closeEdit(): void {
    editingRow.value = null
    void nextTick(() => editRowRoot.value?.querySelector<HTMLElement>("[data-gear-square-card]")?.focus())
}

/** 保存编辑 */
async function saveEdit(item: TranscendGearItemConfig): Promise<void> {
    const row = editingRow.value
    if (!row?.id) return
    try {
        await stock.update(row.id, item)
        ui.showSuccessMessage(t("transcend-build.gear_item_saved"))
        closeEdit()
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_stock_write_failed", { message: cause instanceof Error ? cause.message : String(cause) }))
    }
}

/** 编辑时的角色上下文：协战槽型（8-11）用协战一角色，其余用主控 */
const editCharId = computed(() => {
    const item = editingRow.value?.item
    const side = item && item.slotType >= 8 ? "assist1" : "main"
    return props.settings[side]?.charId ?? 0
})

/** 删除库存行（已装备物品明确提示仅移除库存） */
async function removeRow(row: TranscendGearStockRow): Promise<void> {
    const equipped = isRowEquipped(row)
    const message = equipped
        ? t("transcend-build.gear_stock_delete_equipped", { name: rowName(row) })
        : t("transcend-build.gear_stock_delete_confirm", { name: rowName(row) })
    const ok = await ui.showDialog(t("transcend-build.gear_stock_delete"), message)
    if (!ok || !row.id) return
    try {
        await stock.remove(row.id)
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_stock_write_failed", { message: cause instanceof Error ? cause.message : String(cause) }))
    }
}

/** 导出库存 JSON（下载文件） */
async function exportStock(): Promise<void> {
    try {
        const json = await stock.exportJson()
        const blob = new Blob([json], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = "transcend-gear-stock.json"
        anchor.click()
        URL.revokeObjectURL(url)
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_stock_export_failed", { message: cause instanceof Error ? cause.message : String(cause) }))
    }
}

/** 选择导入文件 */
function pickImport(): void {
    if (importing.value) return
    importInput.value?.click()
}

/** 读取并导入 JSON（合并；非法条目跳过并报告） */
async function onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    importing.value = true
    try {
        const text = await file.text()
        const result = await stock.importJson(text)
        const inferred = result.inferredSockets > 0 ? t("transcend-build.gear_stock_socket_inferred", { count: result.inferredSockets }) : ""
        ui.showSuccessMessage(
            [t("transcend-build.gear_stock_imported", { added: result.added, skipped: result.skipped }), inferred].filter(Boolean).join(" · ")
        )
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_stock_import_failed", { message: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
        importing.value = false
    }
}

/** 打开截图识别弹窗 */
function openOcr(): void {
    ocrOpen.value = true
}

/** 关闭截图识别弹窗 */
function closeOcr(): void {
    ocrOpen.value = false
}

/** 截图识别入库后刷新库存（liveQuery 自动刷新；内存降级时补一次）并关闭识别弹窗 */
function onOcrAdded(): void {
    void stock.refresh()
    ocrOpen.value = false
}

/** 关闭库存弹窗（同时关闭截图识别） */
function closeInventory(): void {
    ocrOpen.value = false
    emit("update:open", false)
}
</script>

<template>
    <Teleport v-if="open" to="body">
        <dialog class="modal" :class="{ 'modal-open': open }" data-transcend-gear-inventory>
            <div class="modal-box relative h-11/12 max-w-11/12">
                <SectionHeader number="03" kicker="GEAR STOCK" :title="$t('transcend-build.gear_stock_title')" no-animate compact>
                    <template #trailing>
                        <button class="btn btn-ghost btn-sm btn-square" @click="closeInventory">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </template>
                </SectionHeader>

                <div class="flex flex-wrap items-center gap-2 border-b border-base-content/10 pb-2">
                    <input
                        v-model="search"
                        type="text"
                        class="min-w-40 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] outline-none placeholder:text-base-content/30 focus:border-primary"
                        :placeholder="$t('transcend-build.gear_stock_search')"
                        data-gear-stock-manage-search
                    />
                    <button
                        v-for="option in kindOptions"
                        :key="option.value"
                        type="button"
                        class="btn btn-xs"
                        :class="kindFilter === option.value ? 'btn-primary' : 'btn-ghost'"
                        @click="kindFilter = option.value"
                    >
                        {{ $t(option.key) }}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline" @click="exportStock">{{ $t("transcend-build.gear_stock_export") }}</button>
                    <button type="button" class="btn btn-sm btn-outline" :disabled="importing" @click="pickImport">
                        {{ $t("transcend-build.gear_stock_import") }}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline" data-gear-ocr-open @click="openOcr">
                        {{ $t("transcend-build.gear_ocr_import") }}
                    </button>
                    <input ref="importInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-1">
                    <button
                        type="button"
                        class="btn btn-xs"
                        :class="slotFilter === 0 ? 'btn-primary' : 'btn-ghost'"
                        @click="slotFilter = 0"
                    >
                        {{ $t("common.all") }}
                    </button>
                    <button
                        v-for="slot in slots"
                        :key="slot.id"
                        type="button"
                        class="btn btn-xs"
                        :class="slotFilter === slot.id ? 'btn-primary' : 'btn-ghost'"
                        :data-slot-filter="slot.id"
                        @click="slotFilter = slot.id"
                    >
                        {{ gt(slot.name) }}
                    </button>
                    <span class="ml-auto text-[10px] text-base-content/45">
                        {{ $t("transcend-build.gear_stock_total", { count: filteredRows.length }) }}
                    </span>
                </div>

                <p v-if="stock.usingMemory.value" class="mt-2 border border-warning/30 bg-warning/5 px-2 py-1 text-[10px] text-warning/80">
                    {{ $t("transcend-build.gear_stock_memory_warning") }}
                </p>
                <p v-if="stock.error.value" class="mt-2 border border-error/30 bg-error/5 px-2 py-1 text-[10px] text-error/80">
                    {{ $t("transcend-build.gear_stock_error", { message: stock.error.value }) }}
                </p>

                <ScrollArea class="h-[calc(92vh-12rem)] pt-3">
                    <div v-if="filteredRows.length" class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2" data-gear-stock-grid>
                        <TranscendGearStockItem
                            v-for="row in filteredRows"
                            :key="row.id ?? row.hash"
                            :row="row"
                            :count="stock.ownedCount(row.item)"
                            :equipped="isRowEquipped(row)"
                            :data-ready="dataReady"
                            @edit="event => startEdit(row, event)"
                            @delete="removeRow(row)"
                        />
                    </div>
                    <p v-else class="py-10 text-center text-[11px] text-base-content/35">{{ $t("transcend-build.gear_stock_empty") }}</p>
                </ScrollArea>

                <p v-if="!dataReady" class="text-[10px] text-warning/80">{{ $t("transcend-build.gear_data_missing") }}</p>
            </div>
            <div class="modal-backdrop" @click="closeInventory" />
        </dialog>
    </Teleport>

    <TranscendGearOcrImportDialog
        :open="ocrOpen"
        :settings="settings"
        :data-ready="dataReady"
        @update:open="value => (value ? (ocrOpen = true) : closeOcr())"
        @added="onOcrAdded"
    />

    <Teleport v-if="editingRow" to="body">
        <dialog class="modal modal-open" data-transcend-gear-edit>
            <div class="modal-box relative h-11/12 max-w-11/12">
                <SectionHeader number="03" kicker="GEAR EDIT" :title="$t('transcend-build.gear_edit_item')" no-animate compact>
                    <template #trailing>
                        <button class="btn btn-ghost btn-sm btn-square" @click="closeEdit">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </template>
                </SectionHeader>
                <TranscendGearCreate
                    :slot-type="editingRow.item.slotType"
                    mode="edit"
                    :initial="editingRow.item"
                    :char-id="editCharId"
                    :gating-char-id="0"
                    :disabled="!dataReady"
                    @submit="saveEdit"
                />
            </div>
            <div class="modal-backdrop" @click="closeEdit" />
        </dialog>
    </Teleport>
</template>
