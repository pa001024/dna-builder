<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
    affixes,
    decodeTranscendGearCode,
    encodeTranscendGearCode,
    getSlotMaxInlayCount,
    serializeTranscendBuildSettings,
    slots,
    TRANSCEND_GEAR_VARIANT_MAX_COUNT,
    type TranscendBuildSettings,
    type TranscendGearGroup,
    type TranscendGearItemConfig,
    type TranscendSlotGroup,
} from "@/data"
import { useUIStore } from "@/store/ui"
import { copyText, pasteText } from "@/util"
import { dataPackHydrationKey, isDataAvailable } from "@/utils/data-pack/data-pack-bridge"
import { getSideGearSlots, type TranscendGearSlot } from "@/utils/transcend-build"
import { createRelativeGainCache, gearItemKey, relativeGain, withoutItem } from "@/utils/transcend-gear/gain"
import { type GearAffixIncomeSource, type GearGainContext, requestGearIncomes } from "@/utils/transcend-gear/income"
import { getEquippedItem, getLegacySlotEntries, getSideGearGroup, setSlotItem } from "@/utils/transcend-gear/settings"
import { transcendGearStock } from "@/utils/transcend-gear/stock"
import TranscendGearCraftDialog from "./TranscendGearCraftDialog.vue"
import TranscendGearInventoryDialog from "./TranscendGearInventoryDialog.vue"
import TranscendGearPicker from "./TranscendGearPicker.vue"
import TranscendGearSlotCard from "./TranscendGearSlot.vue"

/**
 * 升华装备区：主控 8 槽 + 协战一 9-12 + 协战二 13-16（一人一套，三组互不共用）。
 * 顶部是 A/B/C 装备变体与装备短码入口；物品级写入直接回传装备组。
 */

const props = defineProps<{
    settings: TranscendBuildSettings
    /** 宿主完整构筑快照来源：原构筑页接入后按合并构筑（含 MOD / BUFF / 时间轴）求相对收益 */
    gainContext?: GearGainContext | null
}>()

const emit = defineEmits<{
    (event: "update-gear", side: TranscendSlotGroup, group: TranscendGearGroup): void
    (event: "replace-gear", mainGear: TranscendGearGroup, assist1Gear: TranscendGearGroup, assist2Gear: TranscendGearGroup): void
    (event: "select-gear-variant", id: string): void
    (event: "add-gear-variant"): void
    (event: "remove-gear-variant", id: string): void
}>()

const { t } = useTranslation()
const ui = useUIStore()
const stock = transcendGearStock

onMounted(() => {
    void stock.init()
})

/** 数据包是否可用（缺包时禁用新建，库存仍按快照展示） */
const dataReady = computed(() => {
    dataPackHydrationKey.value
    return isDataAvailable() && affixes.length > 0 && slots.length > 0
})

/** 主控装备组（8 槽） */
const mainGroup = computed(() => ({
    key: "main" as const,
    side: "main" as TranscendSlotGroup,
    label: t("transcend-build.gear_main"),
    slots: getSideGearSlots("main"),
}))

/** 协战一 / 二（各 4 槽，一人一套）：容器达到 8 列宽度时并排一行，与主控槽列对齐 */
const assistGroups = computed(() => [
    {
        key: "assist1" as const,
        side: "assist1" as TranscendSlotGroup,
        label: t("transcend-build.gear_assist1"),
        enabled: props.settings.assist1.enabled,
        slots: getSideGearSlots("assist1"),
    },
    {
        key: "assist2" as const,
        side: "assist2" as TranscendSlotGroup,
        label: t("transcend-build.gear_assist2"),
        enabled: props.settings.assist2.enabled,
        slots: getSideGearSlots("assist2"),
    },
])

/** 三组装备（主控 / 协战一 / 协战二各一套，互不共用） */
const groups = computed(() => [mainGroup.value, ...assistGroups.value])

/** 装备变体（A/B/C） */
const variants = computed(() => props.settings.transcend.gearVariants ?? [])
const activeVariantId = computed(() => props.settings.transcend.activeGearVariant)
const canAddVariant = computed(() => variants.value.length < TRANSCEND_GEAR_VARIANT_MAX_COUNT)
const canRemoveVariant = computed(() => variants.value.length > 1)

/**
 * 取某侧的装备组。
 * @param side 构筑位
 * @returns 装备组
 */
function groupOf(side: TranscendSlotGroup): TranscendGearGroup {
    return getSideGearGroup(props.settings.transcend, side)
}

/**
 * 某槽位的完整物品。
 * @param side 构筑位
 * @param slotId 装备位
 * @returns 物品或 null
 */
function itemOf(side: TranscendSlotGroup, slotId: number): TranscendGearItemConfig | null {
    return getEquippedItem(groupOf(side), slotId)?.item ?? null
}

/**
 * 某构筑位的逐词条收益上下文：完整构筑上下文存在时才提供（纯设置无快照时预览卡不显示单条收益）。
 * @param side 构筑位
 * @returns 上下文或 null
 */
function affixIncomeSourceOf(side: TranscendSlotGroup): GearAffixIncomeSource | null {
    const gainContext = props.gainContext
    if (!gainContext) return null
    return { key: gainContext.key, side, gear: groupOf(side), gainContext, charId: props.settings[side].charId }
}

/** 物品是否已在库存（hash + 品质 / 强度 / 基础名 / 赛季，未拥有仍参与计算） */
function isOwned(item: TranscendGearItemConfig | null): boolean {
    return item ? stock.owns(item) : false
}

/** 库存份数（同一身份才计数） */
function ownedCount(item: TranscendGearItemConfig | null): number {
    return item ? stock.ownedCount(item) : 0
}

/**
 * 写回某侧装备组。
 * @param side 构筑位
 * @param group 新装备组
 */
function commit(side: TranscendSlotGroup, group: TranscendGearGroup): void {
    emit("update-gear", side, group)
}

//#region 槽位相对收益

/** 槽位收益缓存：设置 / 数据包 / 构筑位 / 物品未变时复用 */
const slotGainCache = createRelativeGainCache()
/** 槽位相对收益：`side:slotId` → 比例（null = 算不出；缺席 = 未算出） */
const slotGains = ref<Record<string, number | null>>({})
let slotGainTimer: number | undefined
let slotGainRequestId = 0

/** 有物品的槽位（主控 8 + 协战一 4 + 协战二 4） */
function slotGainInputs(): { domKey: string; side: TranscendSlotGroup; slotId: number; item: TranscendGearItemConfig }[] {
    const inputs: { domKey: string; side: TranscendSlotGroup; slotId: number; item: TranscendGearItemConfig }[] = []
    for (const group of groups.value) {
        for (const slot of group.slots) {
            const item = itemOf(group.side, slot.slotId)
            if (item) inputs.push({ domKey: `${group.side}:${slot.slotId}`, side: group.side, slotId: slot.slotId, item })
        }
    }
    return inputs
}

/** 收益缓存前缀：宿主上下文存在时用宿主 key（MOD / BUFF / 时间轴变化随 key 失效） */
function gainPrefix(): string {
    return (
        props.gainContext?.key ??
        `single-side:v0\u0000${dataPackHydrationKey.value}\u0000${serializeTranscendBuildSettings(props.settings)}`
    )
}

/**
 * 刷新槽位相对收益：基准 = 同一构筑把该槽清空后的 DPS，装备后 `(with - without) / without`。
 * 逐槽请求（同一构筑 / 目标 / 数据包），命中缓存不重复求值；算不出保留 null，界面显示 —。
 */
async function refreshSlotGains(): Promise<void> {
    const inputs = slotGainInputs()
    if (!inputs.length || !dataReady.value) {
        slotGains.value = {}
        return
    }
    const id = ++slotGainRequestId
    const prefix = gainPrefix()
    const next: Record<string, number | null> = {}
    const missing: { domKey: string; side: TranscendSlotGroup; slotId: number; item: TranscendGearItemConfig; cacheKey: string }[] = []
    for (const input of inputs) {
        const cacheKey = `${prefix}\u0000${input.side}\u0000${input.slotId}\u0000${gearItemKey(input.item)}`
        const cached = slotGainCache.get(cacheKey)
        if (cached !== undefined) next[input.domKey] = cached
        else missing.push({ ...input, cacheKey })
    }
    slotGains.value = next
    if (!missing.length) return
    const results = await Promise.all(
        missing.map(async entry => {
            try {
                const key = `slot:${entry.slotId}`
                const result = await requestGearIncomes({
                    settings: withoutItem(props.settings, entry.side, entry.slotId),
                    side: entry.side,
                    slotId: entry.slotId,
                    candidates: [{ key, item: entry.item }],
                    gainContext: props.gainContext ?? undefined,
                })
                const delta = result.incomes[key]
                // 无启用侧时回退的是装备者自身侧，不是目标卡合计：不显示，避免冒充团队收益
                const gain =
                    result.target !== "owner" && typeof delta === "number"
                        ? relativeGain(result.baseline + delta, result.baseline)
                        : null
                return { entry, gain }
            } catch {
                return { entry, gain: null }
            }
        })
    )
    if (id !== slotGainRequestId) return
    const merged = { ...slotGains.value }
    for (const { entry, gain } of results) {
        merged[entry.domKey] = gain
        if (gain !== null) slotGainCache.set(entry.cacheKey, gain)
    }
    slotGains.value = merged
}

/** 防抖刷新：其它面板改设置时不逐次整体求值 */
function scheduleSlotGains(): void {
    if (slotGainTimer !== undefined) clearTimeout(slotGainTimer)
    slotGainTimer = window.setTimeout(() => {
        slotGainTimer = undefined
        void refreshSlotGains()
    }, 250)
}

watch(() => [props.gainContext?.key ?? serializeTranscendBuildSettings(props.settings), dataReady.value], scheduleSlotGains, {
    immediate: true,
})

onBeforeUnmount(() => {
    if (slotGainTimer !== undefined) clearTimeout(slotGainTimer)
})

//#endregion

//#region 装备短码（主控 + 协战一 + 协战二三组）

/** 复制当前装备短码 */
async function copyGearCode(): Promise<void> {
    try {
        const { mainGear, assist1Gear, assist2Gear } = props.settings.transcend
        await copyText(encodeTranscendGearCode(mainGear, assist1Gear, assist2Gear))
        ui.showSuccessMessage(t("transcend-build.gear_code_copied"))
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_code_copy_failed"), cause instanceof Error ? cause.message : String(cause))
    }
}

/** 从剪贴板导入装备短码：只替换装备，角色 / 天赋 / 环境保持不变 */
async function importGearCode(): Promise<void> {
    try {
        const text = (await pasteText()).trim()
        if (!text) {
            ui.showErrorMessage(t("char-build.clipboard_empty"))
            return
        }
        const decoded = decodeTranscendGearCode(text)
        emit("replace-gear", decoded.mainGear, decoded.assist1Gear, decoded.assist2Gear)
        ui.showSuccessMessage(t("transcend-build.gear_code_imported"))
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_code_invalid"), cause instanceof Error ? cause.message : String(cause))
    }
}

//#endregion

//#region 全屏选择器

const pickerOpen = ref(false)
const pickerSide = ref<TranscendSlotGroup>("main")
const pickerSlot = ref<TranscendGearSlot | null>(null)
const focusTarget = ref<HTMLElement | null>(null)

/** 当前弹窗槽位的物品 */
const pickerItem = computed(() => (pickerSlot.value ? itemOf(pickerSide.value, pickerSlot.value.slotId) : null))

/**
 * 打开选择器并记录焦点来源（关闭后归还焦点）。
 * @param side 构筑位（三组各自独立，收益与新建角色上下文跟随该槽所属构筑位）
 * @param slot 槽位
 */
function openPicker(side: TranscendSlotGroup, slot: TranscendGearSlot): void {
    focusTarget.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
    pickerSide.value = side
    pickerSlot.value = slot
    pickerOpen.value = true
}

/** 关闭选择器并归还焦点 */
function closePicker(): void {
    pickerOpen.value = false
    void nextTick(() => focusTarget.value?.focus())
}

/**
 * 装备物品到槽位。
 * @param item 物品
 */
function equipItem(item: TranscendGearItemConfig): void {
    if (!pickerSlot.value) return
    commit(pickerSide.value, setSlotItem(groupOf(pickerSide.value), pickerSlot.value.slotId, item))
}

/** 卸下当前槽位物品 */
function unequipItem(): void {
    if (!pickerSlot.value) return
    commit(pickerSide.value, setSlotItem(groupOf(pickerSide.value), pickerSlot.value.slotId, null))
}

//#endregion

//#region 未拥有

/**
 * 把已装备但未拥有的物品加入库存。
 * @param side 构筑位
 * @param slot 槽位
 */
async function addToStock(side: TranscendSlotGroup, slot: TranscendGearSlot): Promise<void> {
    const item = itemOf(side, slot.slotId)
    if (!item) return
    try {
        await stock.add(item)
        ui.showSuccessMessage(t("transcend-build.gear_added_to_stock"))
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_stock_write_failed", { message: cause instanceof Error ? cause.message : String(cause) }))
    }
}

//#endregion

//#region 做装 / 库存

const craftOpen = ref(false)
const craftSide = ref<TranscendSlotGroup>("main")
const craftSlot = ref<TranscendGearSlot | null>(null)
const craftTrigger = ref<HTMLElement | null>(null)
const craftItem = computed(() => (craftSlot.value ? itemOf(craftSide.value, craftSlot.value.slotId) : null))
/** 该槽所属构筑位的角色（附魔 / 淬炼过滤） */
const craftCharId = computed(() => props.settings[craftSide.value]?.charId ?? 0)

/**
 * 打开完整做装弹窗并记录焦点来源。
 * @param side 构筑位
 * @param slot 槽位
 */
function openCraft(side: TranscendSlotGroup, slot: TranscendGearSlot): void {
    craftTrigger.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
    craftSide.value = side
    craftSlot.value = slot
    craftOpen.value = true
}

/** 关闭做装弹窗并归还焦点 */
function closeCraft(): void {
    craftOpen.value = false
    void nextTick(() => craftTrigger.value?.focus())
}

/**
 * 把做装产出的物品回写当前槽位。
 * @param item 新物品
 */
function updateCraftItem(item: TranscendGearItemConfig): void {
    if (!craftSlot.value) return
    commit(craftSide.value, setSlotItem(groupOf(craftSide.value), craftSlot.value.slotId, item))
}

const inventoryOpen = ref(false)
const inventoryTrigger = ref<HTMLElement | null>(null)

/** 打开库存管理并记录焦点来源 */
function openInventory(): void {
    inventoryTrigger.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
    inventoryOpen.value = true
}

/** 关闭库存管理并归还焦点 */
function closeInventory(): void {
    inventoryOpen.value = false
    void nextTick(() => inventoryTrigger.value?.focus())
}

//#endregion
</script>

<template>
    <div class="space-y-3" data-transcend-gear-section>
        <!-- §40 单行工具栏：变体 A/B/C + 增删 + 装备短码 + 库存入口；窄屏横向滚动，不换行 -->
        <div class="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5" data-transcend-gear-toolbar>
            <button
                v-for="variant in variants"
                :key="variant.id"
                type="button"
                class="btn btn-sm btn-square shrink-0 border"
                :class="variant.id === activeVariantId ? 'btn-secondary border-secondary' : 'btn-ghost border-base-content/15'"
                :title="$t('transcend-build.gear_variant_switch', { letter: variant.id })"
                :data-gear-variant="variant.id"
                @click="emit('select-gear-variant', variant.id)"
            >
                {{ variant.id }}
            </button>
            <button
                v-if="canAddVariant"
                type="button"
                class="btn btn-ghost btn-sm btn-square shrink-0 border border-dashed border-base-content/30 text-base-content/60"
                :title="$t('transcend-build.gear_variant_add')"
                data-gear-variant-add
                @click="emit('add-gear-variant')"
            >
                <Icon icon="ri:add-line" class="size-4" />
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-sm btn-square shrink-0 border border-base-content/15 text-base-content/45 disabled:opacity-40"
                :title="$t('transcend-build.gear_variant_remove')"
                :disabled="!canRemoveVariant"
                data-gear-variant-remove
                @click="emit('remove-gear-variant', activeVariantId)"
            >
                <Icon icon="ri:close-line" class="size-4" />
            </button>

            <span class="mx-0.5 h-5 w-px shrink-0 bg-base-content/12" aria-hidden="true" />

            <button
                type="button"
                class="btn btn-ghost btn-sm btn-square shrink-0 border border-base-content/15"
                :title="$t('transcend-build.gear_code_copy')"
                data-transcend-gear-code-copy
                @click="copyGearCode"
            >
                <Icon icon="ri:file-copy-line" class="size-4" />
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-sm btn-square shrink-0 border border-base-content/15"
                :title="$t('transcend-build.gear_code_import')"
                data-transcend-gear-code-import
                @click="importGearCode"
            >
                <Icon icon="ri:import-line" class="size-4" />
            </button>

            <span class="mx-0.5 h-5 w-px shrink-0 bg-base-content/12" aria-hidden="true" />

            <button
                type="button"
                class="btn btn-ghost btn-sm btn-square shrink-0 border border-base-content/15"
                :title="$t('transcend-build.gear_stock_manage')"
                data-gear-inventory-open
                @click="openInventory"
            >
                <Icon icon="ri:box-3-line" class="size-4" />
            </button>
            <span class="ml-0.5 shrink-0 text-[11px] text-base-content/55">
                {{ $t("transcend-build.gear_owned_total", { count: stock.rows.value.length }) }}
            </span>
            <span v-if="stock.usingMemory.value" class="shrink-0 text-[10px] text-warning/80">{{ $t("transcend-build.gear_memory_short") }}</span>
        </div>

        <!-- @container：槽位列数按槽位区自身宽度算（同 ModEditer），不受页面外层容器影响 -->
        <div class="@container space-y-3">
            <div :data-gear-group="mainGroup.key">
                <div class="mb-2 flex flex-wrap items-center gap-2">
                    <span class="text-[12px] font-semibold text-base-content/80">{{ mainGroup.label }}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 @xs:grid-cols-4 @5xl:grid-cols-8">
                    <TranscendGearSlotCard
                        v-for="slot in mainGroup.slots"
                        :key="slot.slotId"
                        :slot="slot"
                        :item="itemOf(mainGroup.side, slot.slotId)"
                        :legacy-entries="getLegacySlotEntries(groupOf(mainGroup.side), slot.slotId)"
                        :owned="isOwned(itemOf(mainGroup.side, slot.slotId))"
                        :owned-count="ownedCount(itemOf(mainGroup.side, slot.slotId))"
                        :max-inlays="getSlotMaxInlayCount(slot.slotType)"
                        :gain="slotGains[`${mainGroup.side}:${slot.slotId}`]"
                        :affix-income-source="affixIncomeSourceOf(mainGroup.side)"
                        :char-id="settings[mainGroup.side].charId"
                        @pick="openPicker(mainGroup.side, slot)"
                        @add-to-stock="addToStock(mainGroup.side, slot)"
                        @unequip="commit(mainGroup.side, setSlotItem(groupOf(mainGroup.side), slot.slotId, null))"
                        @craft="openCraft(mainGroup.side, slot)"
                    />
                </div>
            </div>
            <!-- 协战一 / 二：窄容器纵向堆叠（2/4 列）；@5xl 起并排一行各占 4 列，与主控 8 列逐槽对齐 -->
            <div class="border-t border-base-content/8 pt-3 @5xl:grid @5xl:grid-cols-2 @5xl:gap-2">
                <div
                    v-for="(group, index) in assistGroups"
                    :key="group.key"
                    :class="index > 0 ? 'border-t border-base-content/8 pt-3 @5xl:border-t-0 @5xl:pt-0' : ''"
                    :data-gear-group="group.key"
                >
                    <div class="mb-2 flex flex-wrap items-center gap-2">
                        <span class="text-[12px] font-semibold text-base-content/80">{{ group.label }}</span>
                        <span v-if="!group.enabled" class="border border-warning/40 px-1 py-px text-[10px] leading-none text-warning/80">
                            {{ $t("transcend-build.assist_not_enabled") }}
                        </span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 @xs:grid-cols-4">
                        <TranscendGearSlotCard
                            v-for="slot in group.slots"
                            :key="slot.slotId"
                            :slot="slot"
                            :item="itemOf(group.side, slot.slotId)"
                            :legacy-entries="getLegacySlotEntries(groupOf(group.side), slot.slotId)"
                            :owned="isOwned(itemOf(group.side, slot.slotId))"
                            :owned-count="ownedCount(itemOf(group.side, slot.slotId))"
                            :max-inlays="getSlotMaxInlayCount(slot.slotType)"
                            :gain="slotGains[`${group.side}:${slot.slotId}`]"
                            :affix-income-source="affixIncomeSourceOf(group.side)"
                            :char-id="settings[group.side].charId"
                            @pick="openPicker(group.side, slot)"
                            @add-to-stock="addToStock(group.side, slot)"
                            @unequip="commit(group.side, setSlotItem(groupOf(group.side), slot.slotId, null))"
                            @craft="openCraft(group.side, slot)"
                        />
                    </div>
                </div>
            </div>
        </div>

        <TranscendGearPicker
            v-if="pickerSlot"
            :open="pickerOpen"
            :slot="pickerSlot"
            :side="pickerSide"
            :item="pickerItem"
            :settings="settings"
            :gain-context="gainContext"
            :data-ready="dataReady"
            @update:open="value => (value ? (pickerOpen = true) : closePicker())"
            @equip="equipItem"
            @unequip="unequipItem"
        />

        <TranscendGearCraftDialog
            v-if="craftSlot && craftItem"
            :open="craftOpen"
            :slot="craftSlot"
            :item="craftItem"
            :char-id="craftCharId"
            :affix-income-source="affixIncomeSourceOf(craftSide)"
            @update:open="value => (value ? (craftOpen = true) : closeCraft())"
            @update-item="updateCraftItem"
        />

        <TranscendGearInventoryDialog
            :open="inventoryOpen"
            :settings="settings"
            :data-ready="dataReady"
            @update:open="value => (value ? (inventoryOpen = true) : closeInventory())"
        />
    </div>
</template>
