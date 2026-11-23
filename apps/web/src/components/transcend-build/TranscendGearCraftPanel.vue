<script setup lang="ts">
import { ref } from "vue"
import type { TranscendGearItemConfig } from "@/data"
import type { CraftRng } from "@/utils/transcend-gear/craft"
import TranscendCraftEnchantTab from "./craft/TranscendCraftEnchantTab.vue"
import TranscendCraftForgeTab from "./craft/TranscendCraftForgeTab.vue"
import TranscendCraftPunchTab from "./craft/TranscendCraftPunchTab.vue"
import TranscendCraftSellTab from "./craft/TranscendCraftSellTab.vue"
import TranscendCraftTemperTab from "./craft/TranscendCraftTemperTab.vue"

type CraftTab = "sell" | "punch" | "finalforge" | "enchant" | "temper"

/**
 * 做装面板：与原版 BP 一致的 5 个 tab（回收 → 镶嵌 → 精锻 → 附魔 → 淬炼）。
 * 切 tab 保留装备 craft 状态；tab 内部选择态随组件卸载清空。
 * `initialTab` 让槽位做装弹窗从点击意图（孔位 / 宝石）进入，其他入口保持回收。
 */
const props = withDefaults(
    defineProps<{
        item: TranscendGearItemConfig
        slotId: number
        charId: number
        preserveUnknown: boolean
        rng?: CraftRng
        canUndo: boolean
        /** 初始 tab（缺省回收） */
        initialTab?: CraftTab
    }>(),
    { initialTab: "sell" }
)

const emit = defineEmits<{
    (event: "apply", item: TranscendGearItemConfig): void
    (event: "undo"): void
}>()

/**
 * 官方 craft 页签图标（游戏 `CraftTabIcons`）：纯白 alpha，用 mask + currentColor 着色，
 * 深浅主题跟随 tab 文字色；maskSize 按各自 alpha 包围盒放大，避免 24px 盒内笔画过细。
 */
const CRAFT_TAB_ICONS: Record<CraftTab, { url: string; maskSize: string }> = {
    sell: { url: "/imgs/webp/T_Tab_Season_Craft_Sell.webp", maskSize: "158%" },
    punch: { url: "/imgs/webp/T_Tab_Season_Craft_Punch.webp", maskSize: "128%" },
    finalforge: { url: "/imgs/webp/T_Tab_Season_Craft_FinalForge.webp", maskSize: "128%" },
    enchant: { url: "/imgs/webp/T_Tab_Season_Craft_Enchant.webp", maskSize: "132%" },
    temper: { url: "/imgs/webp/T_Tab_Season_Craft_Temper.webp", maskSize: "131%" },
}

/** tab 顺序与 BP `CraftOrder` 一致 */
const tabs: { key: CraftTab; labelKey: string }[] = [
    { key: "sell", labelKey: "transcend-build.craft_tab_sell" },
    { key: "punch", labelKey: "transcend-build.craft_tab_punch" },
    { key: "finalforge", labelKey: "transcend-build.craft_tab_final_forge" },
    { key: "enchant", labelKey: "transcend-build.craft_tab_enchant" },
    { key: "temper", labelKey: "transcend-build.craft_tab_temper" },
]

/**
 * 官方页签图标的 mask 样式。
 * @param key tab 键
 * @returns mask 样式
 */
function tabIconStyle(key: CraftTab) {
    const { url, maskSize } = CRAFT_TAB_ICONS[key]
    return {
        maskImage: `url("${url}")`,
        maskSize,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: `url("${url}")`,
        WebkitMaskSize: maskSize,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
    }
}

const activeTab = ref<CraftTab>(props.initialTab)

/**
 * 转发 tab 产出的新物品。
 * @param item 新物品
 */
function apply(item: TranscendGearItemConfig): void {
    emit("apply", item)
}
</script>

<template>
    <section class="space-y-2" data-create-section="craft" data-craft-panel-root>
        <div class="flex flex-wrap items-center gap-2">
            <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.craft_section") }}</span>
            <span class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_sim_note") }}</span>
        </div>

        <div class="tabs tabs-box w-fit bg-transparent" data-craft-tabs>
            <button
                v-for="tab in tabs"
                :key="tab.key"
                type="button"
                class="tab h-9 w-11 p-0"
                :class="{ 'tab-active': activeTab === tab.key }"
                :data-craft-tab="tab.key"
                :data-craft-tab-active="activeTab === tab.key ? '1' : '0'"
                :data-craft-tab-icon="tab.key"
                :data-craft-tab-icon-src="CRAFT_TAB_ICONS[tab.key].url"
                :aria-label="$t(tab.labelKey)"
                :title="$t(tab.labelKey)"
                @click="activeTab = tab.key"
            >
                <span class="block size-6 shrink-0 bg-current" aria-hidden="true" :style="tabIconStyle(tab.key)" />
            </button>
        </div>

        <TranscendCraftSellTab v-if="activeTab === 'sell'" :rarity-id="props.item.rarityId ?? 0" />

        <TranscendCraftPunchTab
            v-else-if="activeTab === 'punch'"
            :item="props.item"
            :slot-id="props.slotId"
            :preserve-unknown="props.preserveUnknown"
            @apply="apply"
        />

        <TranscendCraftForgeTab
            v-else-if="activeTab === 'finalforge'"
            :item="props.item"
            :slot-id="props.slotId"
            :char-id="props.charId"
            :preserve-unknown="props.preserveUnknown"
            :rng="props.rng"
            :can-undo="props.canUndo"
            @apply="apply"
            @undo="emit('undo')"
        />

        <TranscendCraftEnchantTab
            v-else-if="activeTab === 'enchant'"
            :item="props.item"
            :char-id="props.charId"
            :slot-id="props.slotId"
            :preserve-unknown="props.preserveUnknown"
            :rng="props.rng"
            @apply="apply"
        />

        <TranscendCraftTemperTab
            v-else
            :item="props.item"
            :char-id="props.charId"
            :slot-id="props.slotId"
            :preserve-unknown="props.preserveUnknown"
            @apply="apply"
        />
    </section>
</template>
