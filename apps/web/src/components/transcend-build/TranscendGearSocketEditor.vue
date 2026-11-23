<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import {
    applyCreateSocket,
    applyDetachAll,
    type DnaSeasonAffix,
    getCraftAvailability,
    inlays,
    normalizeGearItem,
    replaceSocketGem,
    resolveInlayAffixId,
    resourceMap,
    type TranscendGearItemConfig,
} from "@/data"
import { useUIStore } from "@/store/ui"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getCraftGateTextKey } from "@/utils/transcend-gear/craft"
import { getAffixFinalValueText, getItemSocketLines } from "@/utils/transcend-gear/display"
import { getGearSocketState } from "@/utils/transcend-gear/sockets"
import { getAffixById, getAffixSummaryParts } from "@/utils/transcendence-gear"
import TranscendCraftCost from "./craft/TranscendCraftCost.vue"

/**
 * 孔位与宝石编辑器（做装「镶嵌」tab 与孔位弹窗共用）：
 * 添加镶孔（craft 5，每次 +1）、选择孔位镶嵌 / 逐孔替换（craft 6，仅消耗宝石）、
 * 全部拆取（craft 7，一次清空全部宝石，已开孔数不变）。同一宝石可占多个孔。
 */

const props = withDefaults(
    defineProps<{
        item: TranscendGearItemConfig
        /** 展示用装备位（解析宝石词缀数值） */
        slotId?: number
        /** 库存 / 已装备物品保留未知词条与未知宝石 */
        preserveUnknown?: boolean
        /** 槽位名（弹窗内展示，缺省不显示） */
        slotName?: string
    }>(),
    { slotId: 0, preserveUnknown: false, slotName: "" }
)

const emit = defineEmits<{
    (event: "apply", item: TranscendGearItemConfig): void
}>()

const { t } = useTranslation()
const { gt } = useGameText()
const ui = useUIStore()

/** 读写前按库存口径归一化一次（旧存档 / 分享物品），未知词条与未知宝石保留 */
const item = computed(() => normalizeGearItem(props.item, undefined, { preserveUnknown: true }) ?? props.item)
const socketState = computed(() => getGearSocketState(item.value, item.value.slotType))
const maxInlay = computed(() => socketState.value.max)
const opened = computed(() => socketState.value.opened)
const socketLines = computed(() => getItemSocketLines(item.value))
const search = ref("")
const activeIndex = ref(0)

const punchAvailable = computed(() => getCraftAvailability(item.value, 5, undefined, { preserveUnknown: props.preserveUnknown }).available)
const detachAvailable = computed(() => getCraftAvailability(item.value, 7, undefined, { preserveUnknown: props.preserveUnknown }).available)
/** craft 6 可写入口径：有空孔，或仅因没有空孔不可用（逐孔替换仍可写入） */
const inlayAvailable = computed(() => {
    const availability = getCraftAvailability(item.value, 6, undefined, { preserveUnknown: props.preserveUnknown })
    return availability.available || availability.reason === "no-empty-socket"
})

/**
 * craft 不可用原因文案。
 * @param craftId craft id
 * @returns 文案；可用时为空串
 */
function gateText(craftId: number): string {
    const availability = getCraftAvailability(item.value, craftId, undefined, { preserveUnknown: props.preserveUnknown })
    const key = getCraftGateTextKey(availability.available ? undefined : availability.reason)
    return key ? t(key) : ""
}

/** 某孔位的宝石行 */
function socketAt(index: number) {
    return socketLines.value.find(line => line.socketIndex === index)
}

/**
 * 某孔位的展示名。
 * @param index 孔位下标
 * @returns 宝石名 / 空孔提示 / 未开孔提示
 */
function socketName(index: number): string {
    if (index >= opened.value) return t("transcend-build.gear_socket_locked")
    const line = socketAt(index)
    if (!line) return t("transcend-build.gear_socket_empty")
    return line.unknownGem ? t("transcend-build.gear_unknown_gem") : gt(line.name)
}

/**
 * 某孔位的三态。
 * @param index 孔位下标
 * @returns 未开孔 / 已镶嵌 / 已开孔未镶嵌
 */
function socketPhase(index: number): "locked" | "inlaid" | "opened" {
    if (index >= opened.value) return "locked"
    return socketAt(index) ? "inlaid" : "opened"
}

/** 第一个空孔位（全部占用时为 0） */
function firstEmptyIndex(): number {
    const used = new Set((item.value.sockets ?? []).map(socket => socket.socketIndex))
    const found = Array.from({ length: opened.value }, (_, index) => index).find(index => !used.has(index))
    return found ?? 0
}

onMounted(() => {
    activeIndex.value = firstEmptyIndex()
})

watch(opened, (value, previous) => {
    if (activeIndex.value >= value) activeIndex.value = Math.max(0, value - 1)
    else if (previous !== undefined && value > previous && !socketAt(value - 1)) activeIndex.value = value - 1
})

/**
 * 目标孔位之外是否有当前槽型不可用的宝石（未知 / 不适用）。
 * @param exceptIndex 目标孔位
 * @returns 存在不可用宝石为 true
 */
function hasUnusableSocketGems(exceptIndex: number): boolean {
    return (item.value.sockets ?? []).some(
        socket => socket.socketIndex !== exceptIndex && resolveInlayAffixId(socket.gemId, item.value.slotType) === null
    )
}

/** 宝石候选（按槽型解析词缀；搜索覆盖名称 / 摘要 / 拼音） */
const gemOptions = computed(() => {
    const query = search.value.trim()
    return inlays
        .map(inlay => {
            const resource = resourceMap.get(inlay.id)
            const affixId = resolveInlayAffixId(inlay.id, item.value.slotType)
            const affix = affixId === null ? undefined : getAffixById(affixId)
            return {
                gemId: inlay.id,
                name: resource?.name ?? "",
                unknownGem: !resource,
                icon: resource ? `/imgs/res/${resource.icon}.webp` : "",
                affix,
                summaryParts: affix ? getAffixSummaryParts(affix) : [],
            }
        })
        .filter(option => option.affix)
        .filter(option => {
            if (!query) return true
            const summary = option.summaryParts.map(part => gt(part)).join(" · ")
            return (
                option.name.includes(query) ||
                gt(option.name).includes(query) ||
                summary.includes(query) ||
                matchPinyin(option.name, query).match
            )
        })
})

/**
 * 宝石效果文本（按展示用装备位解析数值）。
 * @param affix 词缀
 * @returns 展示文本
 */
function effectText(affix: DnaSeasonAffix | undefined): string {
    if (!affix) return ""
    const parts = getAffixSummaryParts(affix).map(part => gt(part)).filter(Boolean)
    const value = getAffixFinalValueText(affix, { affixId: affix.id, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }, props.slotId)
    return `${parts.join(" · ")} ${value}`.trim()
}

/** 添加镶孔一次（craft 5）：只增加已开孔数，不添加宝石 */
function punch(): void {
    const next = applyCreateSocket(item.value)
    if (next !== item.value) emit("apply", next)
}

/**
 * 把宝石写入当前选中的已开孔位：空孔直接镶嵌，已占用孔按「拆取全部 → 重镶其余 → 写入目标」替换。
 * @param gemId 宝石 id
 */
function applyGem(gemId: number): void {
    const index = activeIndex.value
    if (index < 0 || index >= opened.value) return
    const current = item.value
    const wasEmpty = !socketAt(index)
    const next = replaceSocketGem(current, index, gemId)
    if (next !== current) {
        emit("apply", next)
        if (wasEmpty) {
            const used = new Set((next.sockets ?? []).map(socket => socket.socketIndex))
            for (let slot = 0; slot < opened.value; slot += 1) {
                if (!used.has(slot)) {
                    activeIndex.value = slot
                    break
                }
            }
        }
        return
    }
    if (hasUnusableSocketGems(index)) ui.showErrorMessage(t("transcend-build.gear_unknown_gem"))
}

/** 拆取全部（craft 7）：一次清空全部宝石，已开孔数不变 */
function detachAll(): void {
    const next = applyDetachAll(item.value)
    if (next !== item.value) emit("apply", next)
}
</script>

<template>
    <div class="space-y-2" data-gear-socket-editor>
        <div class="flex flex-wrap items-center gap-2 text-[11px] text-base-content/55">
            <span v-if="slotName" class="text-base-content/80">{{ gt(slotName) }}</span>
            <span>{{ $t("transcend-build.gear_socket_used") }} {{ socketState.used }}</span>
            <span
                data-gear-socket-opened
                data-punch-opened
                :data-gear-socket-opened-count="opened"
                :data-punch-opened-count="opened"
                :data-punch-max="maxInlay"
            >
                {{ $t("transcend-build.gear_socket_opened") }} {{ opened }} / {{ maxInlay }}
            </span>
        </div>
        <p v-if="maxInlay > 0" class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.gear_socket_desc") }}</p>

        <div v-if="maxInlay > 0" class="flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2" data-create-craft="5">
            <button v-if="punchAvailable" type="button" class="btn btn-sm btn-primary" data-create-craft-socket data-gear-socket-punch @click="punch">
                <Icon icon="ri:add-line" class="size-4" />
                {{ $t("transcend-build.gear_socket_add", { current: opened, max: maxInlay }) }}
            </button>
            <span v-else class="text-[11px] text-warning/90" data-craft-gate="5" data-gear-socket-limit>{{ gateText(5) }}</span>
            <TranscendCraftCost v-if="punchAvailable" :craft-id="5" class="ml-auto" />
        </div>

        <div v-if="maxInlay > 0" class="flex flex-wrap gap-2" data-gear-socket-cards>
            <button
                v-for="index in maxInlay"
                :key="index"
                type="button"
                class="flex min-w-40 flex-1 items-center gap-2 rounded-xs border p-2 text-left transition-colors duration-150"
                :class="
                    socketPhase(index - 1) === 'locked'
                        ? 'cursor-not-allowed border-dashed border-base-content/10 opacity-45'
                        : activeIndex === index - 1
                          ? 'border-primary/70 bg-primary/10'
                          : 'border-base-content/15 hover:border-primary/50'
                "
                :disabled="socketPhase(index - 1) === 'locked'"
                :data-socket-index="index - 1"
                :data-craft-socket-index="index - 1"
                :data-socket-state="socketPhase(index - 1)"
                :data-socket-occupied="socketPhase(index - 1) === 'inlaid' ? '1' : '0'"
                :data-socket-gem-id="socketAt(index - 1)?.gemId"
                @click="activeIndex = index - 1"
            >
                <ImageFallback
                    :src="socketPhase(index - 1) === 'locked' ? '' : (socketAt(index - 1)?.iconSrc ?? '')"
                    :alt="socketName(index - 1)"
                    class="size-8 shrink-0 overflow-hidden rounded-xs border border-base-content/15"
                >
                    <span class="flex size-8 items-center justify-center text-base-content/30">
                        <Icon :icon="socketPhase(index - 1) === 'locked' ? 'ri:lock-line' : 'ri:add-line'" />
                    </span>
                </ImageFallback>
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-[11px] text-base-content/75">
                        {{ socketName(index - 1) }}
                        <CopyID v-if="socketPhase(index - 1) === 'inlaid' && socketAt(index - 1)?.unknownGem" :id="socketAt(index - 1)?.gemId ?? 0" compact />
                    </span>
                    <span v-if="socketPhase(index - 1) !== 'locked'" class="block truncate text-[10px] text-base-content/45">
                        {{ effectText(socketAt(index - 1)?.affix) }}
                    </span>
                </span>
            </button>
        </div>
        <p v-else class="py-6 text-center text-[11px] text-base-content/40" data-gear-socket-none>{{ $t("transcend-build.gear_socket_none") }}</p>

        <div v-if="opened > 0" class="space-y-2 border-t border-base-content/10 pt-3" data-create-craft="6">
            <div class="flex flex-wrap items-center gap-2">
                <span class="text-[12px] font-semibold text-base-content/80">
                    {{ socketAt(activeIndex) ? $t("transcend-build.gear_socket_replace") : $t("transcend-build.gear_socket_inlay") }}
                </span>
                <span class="text-[10px] text-base-content/40">{{ $t("transcend-build.craft_cost_gem") }}</span>
                <span v-if="!inlayAvailable" class="text-[10px] text-warning/80" data-craft-gate="6">{{ gateText(6) }}</span>
                <input
                    v-model="search"
                    type="text"
                    class="ml-auto w-44 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[11px] outline-none placeholder:text-base-content/30 focus:border-primary"
                    :placeholder="$t('transcend-build.gear_search_gem')"
                    data-gear-socket-search
                />
            </div>
            <p v-if="socketAt(activeIndex)" class="text-[10px] leading-relaxed text-base-content/40">
                {{ $t("transcend-build.craft_socket_replace_note") }}
            </p>
            <ScrollArea class="max-h-72 pr-1">
                <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2" data-gear-socket-gems>
                    <button
                        v-for="gem in gemOptions"
                        :key="gem.gemId"
                        type="button"
                        class="flex items-start gap-2 rounded-xs border border-base-content/10 p-2 text-left transition-colors duration-150 hover:border-info/60 hover:bg-info/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-base-content/10 disabled:hover:bg-transparent"
                        :disabled="!inlayAvailable"
                        :data-gem-id="gem.gemId"
                        @click="applyGem(gem.gemId)"
                    >
                        <ImageFallback :src="gem.icon" :alt="gt(gem.name)" class="size-8 shrink-0 overflow-hidden rounded-xs">
                            <span class="flex size-8 items-center justify-center text-base-content/30"><Icon icon="ri:sparkling-line" /></span>
                        </ImageFallback>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-[11px] text-base-content/75">
                                <template v-if="gem.unknownGem">
                                    {{ $t("transcend-build.gear_unknown_gem") }}
                                    <CopyID :id="gem.gemId" compact />
                                </template>
                                <template v-else>{{ gt(gem.name) }}</template>
                            </span>
                            <span class="block text-[10px] leading-snug text-base-content/45">{{ effectText(gem.affix) }}</span>
                        </span>
                    </button>
                    <p v-if="!gemOptions.length" class="col-span-full py-4 text-center text-[11px] text-base-content/35">
                        {{ $t("transcend-build.gear_socket_no_gem") }}
                    </p>
                </div>
            </ScrollArea>
        </div>

        <div v-if="maxInlay > 0" class="flex flex-wrap items-center gap-2 border-t border-base-content/10 pt-3" data-create-craft="7" data-gear-socket-detach>
            <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_unequip_inlay") }}</span>
            <button
                v-if="detachAvailable"
                type="button"
                class="btn btn-sm btn-outline btn-error"
                data-gear-socket-detach-all
                data-create-detach-all
                @click="detachAll"
            >
                {{ $t("transcend-build.craft_detach_all") }}
            </button>
            <span v-else class="text-[10px] text-base-content/40" data-craft-gate="7">{{ gateText(7) }}</span>
            <TranscendCraftCost v-if="detachAvailable" :craft-id="7" />
            <span class="w-full text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_detach_note") }}</span>
        </div>
    </div>
</template>
