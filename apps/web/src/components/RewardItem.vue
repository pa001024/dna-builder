<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { charMap, draftMap, iconticketMap, skinMap, walnutMap } from "@/data/d"
import { titleData } from "@/data/d/title.data"
import { getDropModeText, getRewardTypeText } from "@/utils/i18n-utils"
import { getRewardIconBackground, getRewardIconUrl } from "@/utils/reward-icon"
import { getRewardDetailLink } from "@/utils/reward-link"
import { RewardItem as RewardItemType } from "@/utils/reward-utils"

// 递归
defineOptions({
    name: "RewardItem",
})

const { t } = useTranslation()

/** 称号 id → 称号数据（RewardItem 内复用 ResourceCostItem 的解析口径） */
const titleMap = new Map(titleData.map(title => [title.id, title]))

// 定义组件接收的Props
interface Props {
    reward: RewardItemType | null
    /** 原始奖励组 id：reward 解析失败时的降级提示用 */
    rewardId?: number | string
    typeFilter?: string[]
    header?: boolean | string
}

const props = defineProps<Props>()

/** 降级提示里回显的奖励组标识 */
function fallbackRewardLabel(): string {
    const id = props.rewardId ?? props.reward?.id

    if (id === undefined || id === null || `${id}`.trim() === "") {
        return ""
    }

    return t("reward-item.reward_group_id", { id })
}

/**
 * 获取奖励项的链接地址（收敛到公共 util，见 reward-link.ts）。
 * @param item 奖励项
 * @returns 路由地址；无对应页面时返回空串
 */
function getRewardLink(item: RewardItemType) {
    return getRewardDetailLink(item.t, item.id)
}

/**
 * 获取奖励项的展示图标（收敛到公共 util，见 reward-icon.ts）。
 * @param item 奖励项
 * @returns 图标路径
 */
function getRewardIcon(item: RewardItemType) {
    return getRewardIconUrl(item.t, item.id)
}

/**
 * 获取奖励图标的背景色（收敛到公共 util，见 reward-icon.ts）。
 * @param item 奖励项
 * @returns 背景色类名
 */
function getRewardBackgroundColor(item: RewardItemType) {
    return getRewardIconBackground(item.t, item.id)
}

/**
 * 判断奖励项是否需要展示链接。
 * @param item 奖励项
 * @returns 是否可跳转
 */
function hasRewardLink(item: RewardItemType) {
    return Boolean(getRewardLink(item))
}

/**
 * 获取奖励项的展示名称。
 * @param item 奖励项
 * @returns 展示文本
 */
function getRewardDisplayName(item: RewardItemType) {
    if (item.t === "Mod") {
        return item.n ? t(item.n) : `ID: ${item.id}`
    }
    if (item.t === "Char") {
        return charMap.get(item.id)?.名称 || item.n || `ID: ${item.id}`
    }
    if (item.t === "Skin") {
        const skin = skinMap.get(item.id)
        const charName = skin?.charId ? charMap.get(skin.charId)?.名称 : ""
        const skinName = item.n ? t(item.n) : skin?.name || `ID: ${item.id}`
        return charName ? `${t(charName)} · ${skinName}` : skinName
    }
    if (["Weapon", "HeadSculpture", "HeadFrame"].includes(item.t)) {
        return item.n ? t(item.n) : `ID: ${item.id}`
    }
    if (["CharAccessory", "WeaponAccessory", "WeaponSkin"].includes(item.t)) {
        return item.n ? t(item.n) : `ID: ${item.id}`
    }
    if (item.t === "Draft") {
        const draft = draftMap.get(item.id)
        return draft ? `${t("UI_FORGING_BLUEPRINT")}${t(draft.n)}` : `ID: ${item.id}`
    }
    if (item.t === "Resource") {
        return item.n ? t(item.n) : `ID: ${item.id}`
    }
    if (item.t === "Walnut") {
        return walnutMap.get(item.id)?.名称 || `ID: ${item.id}`
    }
    if (item.t === "Pet") {
        return item.n ? t(item.n) : `ID: ${item.id}`
    }
    if (item.t === "IronTicket") {
        const ticket = iconticketMap.get(item.id)
        return ticket?.name || t(getRewardTypeText("IronTicket"))
    }
    if (item.t === "Title") {
        return titleMap.get(item.id)?.name || item.n || `ID: ${item.id}`
    }
    return (item.n && t(item.n)) || (item.t === "Reward" ? t("reward-item.reward_group_id", { id: item.id }) : `ID: ${item.id}`)
}

/**
 * 判断奖励项是否需要显示。
 * @param item 奖励项
 * @returns 是否显示
 */
function shouldShowRewardItem(item: RewardItemType): boolean {
    if (!props.typeFilter?.length) {
        return true
    }

    return !props.typeFilter.includes(item.t)
}

/**
 * 获取奖励项所在的父组掉落模式。
 * 普通奖励项继承父组模式（存在 m 上），奖励组节点则单独记录父组模式。
 * @param item 奖励项
 * @returns 父组掉落模式
 */
function getParentDropMode(item: RewardItemType): string {
    return (item.t === "Reward" ? item.parentM : item.m) || ""
}

/**
 * 获取奖励项在父组中的原始权重。
 * 奖励组节点只有父组给出过权重时才有值，普通奖励项直接取 p。
 * @param item 奖励项
 * @returns 权重；无权重时为 0
 */
function getParentWeight(item: RewardItemType): number {
    return item.t === "Reward" ? (item.parentP ?? 0) : item.p
}

/**
 * 获取奖励项在父组中的掉落说明：容量 / 权重 + 比例 + 期望次数，独立掉落则给出单独概率。
 * @param item 奖励项
 * @returns 展示文本；无权重时返回空串
 */
function getParentShareText(item: RewardItemType): string {
    const mode = getParentDropMode(item)
    const weight = getParentWeight(item)

    if (!weight) {
        return ""
    }

    if (mode === "Independent") {
        return `${t("reward-item.independent_drop")} ${t("reward-item.probability", { value: +(weight / 100).toFixed(2) })}`
    }

    const parts = [
        mode === "Sequence" ? t("reward-item.capacity", { value: weight }) : t("reward-item.weight_ratio", { value: weight }),
    ]
    if (item.pp) {
        parts.push(t("reward-item.ratio", { value: +(item.pp * 100).toFixed(2) }))
    }
    if (item.times) {
        parts.push(t("reward-item.expect_times", { value: +item.times.toFixed(2) }))
    }

    return `(${parts.join(" ")})`
}

/**
 * 判断奖励组节点是否是固定发放（父组为 Fixed 且没有数量）。
 * @param item 奖励项
 * @returns 是否标记为固定
 */
function isFixedRewardGroup(item: RewardItemType): boolean {
    return item.t === "Reward" && item.c === undefined && getParentDropMode(item) === "Fixed"
}

/**
 * 获取奖励树中实际会显示的子节点。
 * @param item 奖励项
 * @returns 过滤 typeFilter 后仍然可渲染的子节点
 */
function getRenderableRewardChildren(item: RewardItemType | null): RewardItemType[] {
    if (!item) {
        return []
    }

    return (item.child || []).filter(
        child => shouldShowRewardItem(child) && (child.t !== "Reward" || getRenderableRewardChildren(child).length > 0)
    )
}

/**
 * 判断奖励树节点是否需要展示。
 * @param item 奖励项
 * @returns 是否存在过滤后仍可显示的节点
 */
function shouldRenderRewardNode(item: RewardItemType | null): boolean {
    if (!item) {
        return false
    }

    if (item.t !== "Reward") {
        return shouldShowRewardItem(item)
    }

    return shouldShowRewardItem(item) && getRenderableRewardChildren(item).length > 0
}
</script>

<template>
    <!-- reward 解析失败（模型编造了不存在的奖励组 id）的降级提示，与 DBAICard / DBMapLink 口径一致 -->
    <div
        v-if="!reward"
        class="inline-flex max-w-full flex-col gap-1 rounded-xs border border-dashed border-base-content/20 p-2.5 text-left text-[11px] leading-5 text-base-content/45"
    >
        <span>{{ $t("dbAgent.card.notFound") }}</span>
        <span v-if="fallbackRewardLabel()" class="truncate text-[10px] text-base-content/35">{{ fallbackRewardLabel() }}</span>
    </div>
    <div v-else class="space-y-1">
        <div class="flex items-center gap-2 mb-1" v-if="reward && header">
            <span class="text-xs font-medium"
                >{{ typeof header === "string" ? header : $t("reward-item.reward_group") }} <CopyID :id="reward.id" /></span
            >
            <slot></slot>
            <span
                class="text-xs px-1.5 py-0.5 rounded"
                :class="reward.m === 'Independent' ? 'bg-success text-success-content' : 'bg-warning text-warning-content'"
            >
                {{ $t(getDropModeText(reward.m || "")) }}
                <span v-if="reward.totalP">{{ $t("reward-item.total_capacity", { count: reward.totalP }) }}</span>
            </span>
        </div>
        <!-- 递归奖励显示 -->
        <template v-for="item in getRenderableRewardChildren(reward)" :key="`${item.id}-${item.t}`">
            <template v-if="shouldRenderRewardNode(item)">
                <div class="flex items-start gap-2 text-xs">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <span class="flex min-w-0 items-center gap-1">
                                <img
                                    v-if="item.t !== 'Reward'"
                                    :src="getRewardIcon(item)"
                                    :alt="getRewardDisplayName(item)"
                                    class="size-6 shrink-0 rounded bg-linear-45"
                                    :class="getRewardBackgroundColor(item)"
                                />
                                <SRouterLink v-if="hasRewardLink(item)" :to="getRewardLink(item)" class="min-w-0 truncate hover:underline">
                                    {{ item.dp ? `${$t("reward-item.drop_item")} ` : "" }}
                                    {{ item.d ? $t("UI_FORGING_BLUEPRINT") : "" }}
                                    {{ getRewardDisplayName(item) }}
                                </SRouterLink>
                                <span v-else>
                                    {{ item.dp ? `${$t("reward-item.drop_item")} ` : "" }}
                                    {{ item.d ? $t("UI_FORGING_BLUEPRINT") : "" }}
                                    {{ getRewardDisplayName(item) }}
                                </span>
                                <span class="text-xs text-base-content/50">({{ $t(getRewardTypeText(item.t)) }})</span>
                            </span>
                            <span v-if="item.c !== undefined" class="text-base-content/70">x{{ item.c }}</span>
                            <span v-if="isFixedRewardGroup(item)" class="text-base-content/70">{{ $t("reward-item.fixed") }}</span>
                            <span v-if="getParentShareText(item)" class="text-base-content/70">{{ getParentShareText(item) }}</span>
                            <!-- 显示掉落模式 -->
                            <span
                                v-if="item.t === 'Reward'"
                                class="text-xs px-1.5 py-0.5 rounded"
                                :class="
                                    item.m === 'Independent'
                                        ? 'bg-success text-success-content'
                                        : 'bg-warning text-warning-content'
                                "
                            >
                                {{ $t(getDropModeText(item.m || "")) }}
                                <span v-if="item.totalP">{{ $t("reward-item.total_capacity", { count: item.totalP }) }}</span>
                            </span>
                        </div>
                        <!-- 递归显示子奖励 -->
                        <div v-if="getRenderableRewardChildren(item).length" class="pl-4 mt-1 space-y-1">
                            <RewardItem :reward="item" :type-filter="typeFilter" />
                        </div>
                    </div>
                </div>
            </template>
        </template>
    </div>
</template>
