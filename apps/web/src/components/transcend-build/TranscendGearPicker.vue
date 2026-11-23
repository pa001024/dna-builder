<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import { getTranscendSideGearGroup, serializeTranscendBuildSettings, type TranscendBuildSettings, type TranscendGearItemConfig, type TranscendSlotGroup } from "@/data"
import { useUIStore } from "@/store/ui"
import { dataPackHydrationKey } from "@/utils/data-pack/data-pack-bridge"
import { matchPinyin } from "@/utils/pinyin-utils"
import type { TranscendGearSlot } from "@/utils/transcend-build"
import { getGearDisplayName } from "@/utils/transcend-gear/catalog"
import { getItemSearchTokens } from "@/utils/transcend-gear/display"
import { createRelativeGainCache, gearItemKey, relativeGain } from "@/utils/transcend-gear/gain"
import { normalizeGearForEquipFallback } from "@/utils/transcend-gear/generation"
import { isSameGearItem } from "@/utils/transcend-gear/hash"
import { type GearAffixIncomeSource, type GearGainContext, requestGearIncomes } from "@/utils/transcend-gear/income"
import type { TranscendGearStockRow } from "@/utils/transcend-gear/repo"
import { transcendGearStock } from "@/utils/transcend-gear/stock"
import TranscendGearCreate from "./TranscendGearCreate.vue"
import TranscendGearSquareCard from "./TranscendGearSquareCard.vue"

/**
 * 升华装备全屏选择器（对齐原版 ModPickerDialog 外壳）：
 * 「库存」按槽型列出已拥有物品并按真实计算链路求收益排序；「新建」内嵌独立创建组件。
 * 不提供「生成组」选择器；库存 / 新建都只写数据库与当前槽位。
 */

const props = defineProps<{
    open: boolean
    slot: TranscendGearSlot
    side: TranscendSlotGroup
    /** 当前槽位已装备的物品（无则 null） */
    item: TranscendGearItemConfig | null
    /** 当前升华设置（收益计算基准） */
    settings: TranscendBuildSettings
    /** 宿主完整构筑快照来源（原构筑页接入后按合并构筑求相对收益） */
    gainContext?: GearGainContext | null
    /** 数据包是否可用（缺包时禁用新建，库存仍按快照展示） */
    dataReady: boolean
}>()

const emit = defineEmits<{
    (event: "update:open", value: boolean): void
    (event: "equip", item: TranscendGearItemConfig): void
    (event: "unequip"): void
}>()

const { t, i18next } = useTranslation()
const { gt } = useGameText()
const ui = useUIStore()

const activeTab = ref<"inventory" | "create">("inventory")
const search = ref("")
type KindFilter = "all" | "normal" | "unique"
const kindFilter = ref<KindFilter>("all")
const kindOptions: { value: KindFilter; key: string }[] = [
    { value: "all", key: "common.all" },
    { value: "normal", key: "transcend-build.gear_kind_normal" },
    { value: "unique", key: "transcend-build.gear_kind_unique" },
]
/** 单次收益请求的候选上限：每条候选携带最多 3 份全量快照，避免一次消息塞入整页库存 */
const INCOME_BATCH_SIZE = 12
const sortByIncome = ref(true)
/** 候选装备的相对收益（比例，0.032 = +3.2%）；null 表示该项算不出 */
const incomes = ref<Record<string, number | null>>({})
const incomeError = ref("")
const incomeFailures = ref<Record<string, string>>({})
const incomeLoading = ref(false)
let incomeRequestId = 0
let incomeTimer: number | undefined
/** 跨次打开 / 筛选的收益缓存：同设置 + 同物品不重复整体求值 */
const incomeCache = createRelativeGainCache()

const stock = transcendGearStock

watch(
    () => props.open,
    value => {
        if (!value) return
        search.value = ""
        kindFilter.value = "all"
        activeTab.value = "inventory"
        void stock.init()
    },
    { immediate: true }
)

/** 该槽型的库存行 */
const slotRows = computed(() => stock.rows.value.filter(row => row.slotType === props.slot.slotType))

/** 名称（本地化） */
function rowName(row: TranscendGearStockRow): string {
    return getGearDisplayName(row.item, gt, i18next.language)
}

/** 搜索：名称 / 词缀文本 / 拼音 / id */
function matchesSearch(row: TranscendGearStockRow, query: string): boolean {
    const name = rowName(row)
    if (matchPinyin(name, query).match) return true
    return getItemSearchTokens(row.item, gt).some(
        token => token.toLowerCase().includes(query.toLowerCase()) || matchPinyin(token, query).match
    )
}

/** 筛掉重复行后按搜索 / 类型过滤 */
const filteredRows = computed(() => {
    const query = search.value.trim()
    return slotRows.value.filter(row => {
        if (kindFilter.value !== "all" && row.kind !== kindFilter.value) return false
        return !query || matchesSearch(row, query)
    })
})

/** 收益键 */
function incomeKey(row: TranscendGearStockRow): string {
    return `stock:${row.id ?? row.hash}`
}

/** 收益缓存前缀：宿主上下文存在时用宿主 key（MOD / BUFF / 时间轴变化随 key 失效） */
function gainPrefix(): string {
    return (
        props.gainContext?.key ??
        `single-side:v0\u0000${dataPackHydrationKey.value}\u0000${serializeTranscendBuildSettings(props.settings)}`
    )
}

/** 当前构筑位角色（词条角色门控划线；选择器与新建共用） */
const charId = computed(() => props.settings[props.side]?.charId ?? 0)

/** 逐词条收益上下文：完整构筑上下文存在时才提供（预览卡按住 Shift 显示单条收益） */
const affixIncomeSource = computed<GearAffixIncomeSource | null>(() => {
    const gainContext = props.gainContext
    if (!gainContext) return null
    return {
        key: gainContext.key,
        side: props.side,
        gear: getTranscendSideGearGroup(props.settings.transcend, props.side),
        gainContext,
        charId: props.settings[props.side].charId,
    }
})

/** 排序后的库存行：收益高→低；无收益时按更新时间 */
const sortedRows = computed(() => {
    const rows = [...filteredRows.value]
    if (sortByIncome.value && !incomeError.value) {
        const gainOf = (row: TranscendGearStockRow): number => {
            const value = incomes.value[incomeKey(row)]
            return typeof value === "number" ? value : -Infinity
        }
        return rows.sort((left, right) => gainOf(right) - gainOf(left))
    }
    return rows
})

/** 库存行与当前物品是否同一身份（hash + 品质 / 强度 / 基础名 / 赛季） */
function isEquipped(row: TranscendGearStockRow): boolean {
    return Boolean(props.item && isSameGearItem(row.item, props.item))
}

/** 当前物品是否已拥有 */
const currentOwned = computed(() => (props.item ? stock.ownedCount(props.item) : 0))

/** 收益计算失败的候选名称（界面提示，不静默显示 —） */
const failedNames = computed(() =>
    sortedRows.value.filter(row => incomeFailures.value[incomeKey(row)]).map(row => rowName(row))
)

/** 收益错误文案：worker 的结构化错误逐项翻译 */
function incomeErrorText(message: string): string {
    if (message === "build-unavailable") return t("transcend-build.gear_income_no_build")
    if (message === "damage-not-finite") return t("transcend-build.gear_income_invalid")
    if (message === "data-unavailable") return t("transcend-build.gear_income_data_unavailable")
    return message
}

/**
 * 请求收益：候选物品替换当前槽位后，相对当前构筑 DPS 求比例（同构筑 / 同目标 / 同数据包）。
 * 结果按「设置 + 数据包 + 槽位 + 物品」缓存：搜索 / 筛选 / 滚动只查缓存，不重复整体求值；
 * 同物品的多个库存行共享一次计算。无法计算的候选保留在 `incomeFailures`，界面显示 — 而不是 0%。
 */
async function refreshIncomes(): Promise<void> {
    if (!props.open || activeTab.value !== "inventory") return
    if (!props.dataReady) {
        incomes.value = {}
        incomeFailures.value = {}
        incomeError.value = incomeErrorText("data-unavailable")
        incomeLoading.value = false
        return
    }
    const rows = filteredRows.value
    if (!rows.length) {
        incomes.value = {}
        incomeFailures.value = {}
        incomeError.value = ""
        incomeLoading.value = false
        return
    }
    const prefix = `${gainPrefix()}\u0000${props.side}\u0000${props.slot.slotId}`
    const cacheKeyOf = (row: TranscendGearStockRow): string => `${prefix}\u0000${gearItemKey(row.item)}`
    const next: Record<string, number | null> = {}
    /** 未命中候选：同缓存键只请求一次；key 只用于本次消息的映射 */
    const missing = new Map<string, { key: string; item: TranscendGearItemConfig }>()
    for (const row of rows) {
        const cacheKey = cacheKeyOf(row)
        const cached = incomeCache.get(cacheKey)
        if (cached !== undefined) {
            next[incomeKey(row)] = cached
            continue
        }
        if (!missing.has(cacheKey)) missing.set(cacheKey, { key: `candidate:${missing.size}`, item: row.item })
    }
    incomes.value = next
    incomeFailures.value = {}
    incomeError.value = ""
    if (!missing.size) {
        incomeLoading.value = false
        return
    }
    const id = ++incomeRequestId
    incomeLoading.value = true
    try {
        // 分批请求：每批最多 INCOME_BATCH_SIZE 个候选；每批返回后立即合并，再发下一批
        const entries = [...missing.entries()]
        const merged = { ...incomes.value }
        const mergedFailures: Record<string, string> = {}
        for (let start = 0; start < entries.length; start += INCOME_BATCH_SIZE) {
            const batch = entries.slice(start, start + INCOME_BATCH_SIZE)
            const result = await requestGearIncomes({
                settings: JSON.parse(JSON.stringify(props.settings)),
                side: props.side,
                slotId: props.slot.slotId,
                candidates: batch.map(([, entry], index) => ({
                    key: `candidate:${start + index}`,
                    item: entry.item,
                })),
                gainContext: props.gainContext ?? undefined,
            })
            if (id !== incomeRequestId) return
            const failuresByKey = new Map((result.failures ?? []).map(failure => [failure.key, failure.error]))
            const gainByCacheKey = new Map<string, number | null>()
            const failureByCacheKey = new Map<string, string>()
            // 无启用侧时回退的是装备者自身侧，不是目标卡合计：不显示，避免冒充团队收益
            const ownerFallback = result.target === "owner"
            for (const [index, [cacheKey]] of batch.entries()) {
                const key = `candidate:${start + index}`
                const failure = failuresByKey.get(key)
                if (failure) {
                    gainByCacheKey.set(cacheKey, null)
                    failureByCacheKey.set(cacheKey, failure)
                    continue
                }
                const delta = result.incomes[key]
                const gain =
                    !ownerFallback && typeof delta === "number" ? relativeGain(result.baseline + delta, result.baseline) : null
                gainByCacheKey.set(cacheKey, gain)
                if (gain === null) {
                    if (!ownerFallback) failureByCacheKey.set(cacheKey, "damage-not-finite")
                } else {
                    incomeCache.set(cacheKey, gain)
                }
            }
            for (const row of filteredRows.value) {
                const cacheKey = cacheKeyOf(row)
                if (!gainByCacheKey.has(cacheKey)) continue
                merged[incomeKey(row)] = gainByCacheKey.get(cacheKey) ?? null
                const failure = failureByCacheKey.get(cacheKey)
                if (failure) mergedFailures[incomeKey(row)] = failure
            }
            incomes.value = { ...merged }
            incomeFailures.value = { ...mergedFailures }
        }
    } catch (cause) {
        if (id !== incomeRequestId) return
        incomeFailures.value = {}
        incomeError.value = incomeErrorText(cause instanceof Error ? cause.message : String(cause))
    } finally {
        if (id === incomeRequestId) incomeLoading.value = false
    }
}

/** 触发收益刷新：150ms 防抖，搜索输入逐键变化不触发全量求值 */
function scheduleIncomes(): void {
    if (incomeTimer !== undefined) clearTimeout(incomeTimer)
    incomeTimer = window.setTimeout(() => {
        incomeTimer = undefined
        void refreshIncomes()
    }, 150)
}

onBeforeUnmount(() => {
    if (incomeTimer !== undefined) clearTimeout(incomeTimer)
})

watch(
    () => [
        props.open,
        props.dataReady,
        activeTab.value,
        gainPrefix(),
        filteredRows.value.map(row => row.id ?? row.hash).join("|"),
        props.item,
        props.side,
        props.slot.slotId,
        sortByIncome.value,
    ],
    scheduleIncomes,
    { immediate: true }
)

/** 装备库存物品并关闭 */
function equip(row: TranscendGearStockRow): void {
    emit("equip", row.item)
    emit("update:open", false)
}

/** 卸下当前槽位 */
function unequip(): void {
    emit("unequip")
    emit("update:open", false)
}

/** 把当前物品加入库存（未拥有提示的一键入口） */
async function addCurrentToStock(): Promise<void> {
    if (!props.item) return
    try {
        await stock.add(props.item)
        ui.showSuccessMessage(t("transcend-build.gear_added_to_stock"))
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_stock_write_failed", { message: cause instanceof Error ? cause.message : String(cause) }))
    }
}

/**
 * 新建完成：写入库存 → 装备库存归一化后的物品 → 关闭。
 * 装备必须使用 `stock.add` 返回的 `row.item`，否则已装备物品与库存行 hash / 状态分叉；
 * 写入失败时退回本地归一化结果并明确提示，归一化也失败则保留弹窗、不装备（不得 emit 原始物品）。
 * @param item 新建物品
 */
async function onCreate(item: TranscendGearItemConfig): Promise<void> {
    try {
        const saved = await stock.add(item)
        emit("equip", saved.item)
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_stock_write_failed", { message: cause instanceof Error ? cause.message : String(cause) }))
        const fallback = normalizeGearForEquipFallback(item)
        if (!fallback) return
        emit("equip", fallback)
    }
    emit("update:open", false)
}

</script>

<template>
    <Teleport v-if="open" to="body">
        <dialog class="modal" :class="{ 'modal-open': open }" data-transcend-gear-picker>
            <div class="modal-box relative h-11/12 max-w-11/12">
                <SectionHeader number="01" kicker="GEAR" :title="gt(slot.name)" no-animate compact>
                    <template #trailing>
                        <button class="btn btn-ghost btn-sm btn-square" @click="emit('update:open', false)">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </template>
                </SectionHeader>

                <div class="flex flex-wrap items-center gap-3 border-b border-base-content/10 pb-2">
                    <div class="tabs tabs-box bg-transparent">
                        <label class="tab">
                            <input v-model="activeTab" type="radio" :name="`transcend-gear-tab-${slot.slotId}`" value="inventory" />
                            <span>{{ $t("transcend-build.gear_inventory") }}</span>
                        </label>
                        <label class="tab" :class="{ 'tab-disabled': !dataReady }">
                            <input v-model="activeTab" type="radio" :name="`transcend-gear-tab-${slot.slotId}`" value="create" :disabled="!dataReady" />
                            <span>{{ $t("transcend-build.gear_create") }}</span>
                        </label>
                    </div>

                    <template v-if="activeTab === 'inventory'">
                        <input
                            v-model="search"
                            type="text"
                            class="min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            :placeholder="$t('transcend-build.gear_search')"
                            data-gear-stock-search
                        />
                        <div class="flex flex-wrap items-center gap-1">
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
                        </div>
                        <button class="btn btn-sm" :class="sortByIncome ? 'btn-secondary' : 'btn-outline'" @click="sortByIncome = !sortByIncome">
                            {{ sortByIncome ? $t("transcend-build.gear_sort_income") : $t("transcend-build.gear_sort_default") }}
                        </button>
                    </template>
                </div>

                <div v-if="stock.usingMemory.value" class="mt-2 border border-warning/30 bg-warning/5 px-2 py-1 text-[10px] text-warning/80">
                    {{ $t("transcend-build.gear_stock_memory_warning") }}
                </div>

                <div v-if="activeTab === 'inventory'" class="pt-3" data-gear-picker-tab="inventory">
                    <ScrollArea class="h-[calc(92vh-12rem)] pr-1">
                        <div class="space-y-3">
                            <div class="rounded-xs border border-base-content/10 bg-base-100/40 p-2.5" data-gear-current>
                                <div class="mb-2 flex flex-wrap items-center gap-2">
                                    <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.gear_equipped_current") }}</span>
                                    <span v-if="item && !currentOwned" class="border border-warning/40 bg-warning/5 px-1 py-px text-[10px] text-warning/90">
                                        {{ $t("transcend-build.gear_not_owned") }}
                                    </span>
                                    <span v-else-if="item && currentOwned" class="text-[10px] text-base-content/45">
                                        {{ $t("transcend-build.gear_owned_count", { count: currentOwned }) }}
                                    </span>
                                </div>
                                <div v-if="item" class="flex items-start gap-3">
                                    <div class="w-40 shrink-0">
                                        <TranscendGearSquareCard
                                            :item="item"
                                            :slot-id="slot.slotId"
                                            :count="currentOwned"
                                            equipped
                                            context="current"
                                            :char-id="charId"
                                            :affix-income-source="affixIncomeSource"
                                        />
                                    </div>
                                    <div class="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                                        <button type="button" class="btn btn-sm btn-outline" data-gear-unequip @click="unequip">
                                            {{ $t("transcend-build.gear_unequip") }}
                                        </button>
                                        <button v-if="!currentOwned" type="button" class="btn btn-sm btn-primary" data-gear-add-to-stock @click="addCurrentToStock">
                                            {{ $t("transcend-build.gear_add_to_stock") }}
                                        </button>
                                    </div>
                                </div>
                                <p v-else class="py-4 text-center text-[11px] text-base-content/35">{{ $t("transcend-build.gear_slot_empty") }}</p>
                            </div>

                            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-base-content/45">
                                <span>{{ $t("transcend-build.gear_stock_slot_count", { count: slotRows.length }) }}</span>
                                <span data-gear-gain-note>{{ $t("transcend-build.gear_gain_baseline") }}</span>
                                <span v-if="incomeLoading">{{ $t("transcend-build.gear_income_loading") }}</span>
                            </div>
                            <p v-if="incomeError" class="border border-error/30 bg-error/5 px-2 py-1 text-[10px] leading-relaxed text-error/80" data-gear-income-error>
                                {{ $t("transcend-build.gear_income_error", { message: incomeError }) }}
                            </p>
                            <p
                                v-else-if="failedNames.length"
                                class="border border-warning/30 bg-warning/5 px-2 py-1 text-[10px] leading-relaxed text-warning/80"
                                :title="failedNames.join(' · ')"
                                data-gear-income-partial
                            >
                                {{ $t("transcend-build.gear_income_partial", { count: failedNames.length }) }}
                            </p>

                            <div v-if="sortedRows.length" class="grid grid-cols-[repeat(auto-fill,minmax(0,10rem))] gap-2.5">
                                <div
                                    v-for="row in sortedRows"
                                    :key="row.id ?? row.hash"
                                    class="flex flex-col gap-1"
                                    :data-stock-id="row.id"
                                    :data-stock-hash="row.hash"
                                >
                                    <TranscendGearSquareCard
                                        :item="row.item"
                                        :slot-id="slot.slotId"
                                        :count="stock.ownedCount(row.item)"
                                        :equipped="isEquipped(row)"
                                        :income="incomeError ? null : (incomes[incomeKey(row)] ?? null)"
                                        :income-failed="Boolean(incomeError) || Boolean(incomeFailures[incomeKey(row)])"
                                        :char-id="charId"
                                        :affix-income-source="affixIncomeSource"
                                        clickable
                                        context="picker"
                                        @activate="equip(row)"
                                    />
                                    <span
                                        v-if="incomeFailures[incomeKey(row)]"
                                        class="truncate text-[9px] text-warning/80"
                                        :title="$t('transcend-build.gear_income_item_failed', { message: incomeFailures[incomeKey(row)] })"
                                    >
                                        {{ $t("transcend-build.gear_income_partial_short") }}
                                    </span>
                                </div>
                            </div>
                            <p v-else class="py-10 text-center text-[11px] text-base-content/35">
                                {{ search || kindFilter !== "all" ? $t("transcend-build.gear_no_match") : $t("transcend-build.gear_inventory_empty") }}
                            </p>
                        </div>
                    </ScrollArea>
                </div>

                <div v-else class="pt-3" data-gear-picker-tab="create">
                    <div v-if="!dataReady" class="py-12 text-center text-[12px] text-warning/80">{{ $t("transcend-build.gear_data_missing") }}</div>
                    <TranscendGearCreate
                        v-else
                        :slot-type="slot.slotType"
                        :slot-id="slot.slotId"
                        :char-id="charId"
                        :affix-income-source="affixIncomeSource"
                        mode="create"
                        @submit="onCreate"
                    />
                </div>

                <div class="mt-2 flex items-center justify-between border-t border-base-content/10 pt-2 text-[10px] text-base-content/40">
                    <span>{{ $t("transcend-build.gear_generate_group_note") }}</span>
                </div>
            </div>
            <div class="modal-backdrop" @click="emit('update:open', false)" />
        </dialog>
    </Teleport>
</template>
