<script lang="ts" setup>
import { t } from "i18next"
import { draftMap, LeveledChar, LeveledMod, LeveledWeapon, resourceMap } from "../data"
import { charMap, walnutMap } from "../data/d"
import { getRewardTypeText, RewardItem as RewardItemType } from "../utils/reward-utils"

// 递归
defineOptions({
    name: "RewardItem",
})

// 定义组件接收的Props
interface Props {
    reward: RewardItemType
}

defineProps<Props>()

/**
 * 获取资源图标路径。
 * @param name 资源名
 * @returns 图标路径
 */
function getResourceIcon(name?: string) {
    const fragmentIcon = getCharacterFragmentIcon(name)
    if (fragmentIcon) {
        return fragmentIcon
    }
    const resource = resourceMap.get(name || "")
    return resource?.icon ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 获取资源背景色。
 * @param name 资源名
 * @returns 背景色类名
 */
function getResourceBackgroundColor(name?: string) {
    const resource = resourceMap.get(name || "")
    const rarity = resource?.rarity || 1
    const colorMap: Record<number, string> = {
        5: "from-yellow-900/80 to-yellow-100/80",
        4: "from-purple-900/80 to-purple-100/80",
        3: "from-blue-900/80 to-blue-100/80",
        2: "from-green-900/80 to-green-100/80",
        1: "from-gray-900/80 to-gray-100/80",
    }
    return colorMap[rarity] || colorMap[1]
}

/**
 * 获取品质背景色。
 * @param quality 品质
 * @returns 背景色类名
 */
function getQualityColor(quality: string | number): string {
    if (typeof quality === "number") {
        quality = ["白", "绿", "蓝", "紫", "金"][quality - 1]
    }
    const colorMap: Record<string, string> = {
        金: "from-yellow-900/80 to-yellow-100/80",
        紫: "from-purple-900/80 to-purple-100/80",
        蓝: "from-blue-900/80 to-blue-100/80",
        绿: "from-green-900/80 to-green-100/80",
        白: "from-gray-900/80 to-gray-100/80",
    }
    return colorMap[quality] || "from-gray-900/80 to-gray-100/80"
}

/**
 * 获取图纸展示图标。
 * @param id 图纸ID
 * @returns 图标路径
 */
function getDraftIcon(id: number) {
    const draft = draftMap.get(id)
    if (!draft) {
        return "/imgs/webp/T_Head_Empty.webp"
    }

    if (draft.t === "Mod") {
        return LeveledMod.getUrl(draft.p)
    }

    if (draft.t === "Weapon") {
        return LeveledWeapon.idToUrl(draft.p)
    }

    return "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 获取奖励项的链接地址。
 * @param item 奖励项
 * @returns 路由地址
 */
function getRewardLink(item: RewardItemType) {
    if (item.t === "Mod") {
        return `/db/mod/${item.id}`
    }
    if (item.t === "Weapon") {
        return `/db/weapon/${item.id}`
    }
    if (item.t === "Char") {
        return `/db/char/${item.id}`
    }
    if (item.t === "Draft") {
        const draft = draftMap.get(item.id)
        return draft ? `/db/draft/${draft.id}` : ""
    }
    if (item.t === "CharAccessory" || item.t === "WeaponAccessory") {
        return `/db/accessory/${item.t === "CharAccessory" ? "char" : "weapon"}/${item.id}`
    }
    if (item.t === "Walnut") {
        return `/db/walnut/${item.id}`
    }

    return ""
}

/**
 * 获取奖励项的展示图标。
 * @param item 奖励项
 * @returns 图标路径
 */
function getRewardIcon(item: RewardItemType) {
    if (item.t === "Mod") {
        return LeveledMod.getUrl(item.id)
    }
    if (item.t === "Weapon") {
        return LeveledWeapon.idToUrl(item.id)
    }
    if (item.t === "Char") {
        return LeveledChar.idToUrl(item.id)
    }
    if (item.t === "Draft") {
        return getDraftIcon(item.id)
    }
    if (item.t === "Resource") {
        return getResourceIcon(item.n)
    }
    if (item.t === "Walnut") {
        const walnut = walnutMap.get(item.id)
        const reward = walnut?.奖励?.[0]
        if (!reward) return "/imgs/webp/T_Head_Empty.webp"
        if (reward.type === "Mod") {
            return LeveledMod.getUrl(reward.id)
        }
        if (reward.type === "Weapon") {
            return LeveledWeapon.idToUrl(reward.id)
        }
        if (reward.type === "Resource") {
            return getCharacterFragmentIcon(reward.name) || getResourceIcon(reward.name)
        }
        return "/imgs/webp/T_Head_Empty.webp"
    }
    return "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 获取奖励图标的背景色。
 * @param item 奖励项
 * @returns 背景色类名
 */
function getRewardBackgroundColor(item: RewardItemType) {
    if (item.t === "Resource") {
        return getResourceBackgroundColor(item.n)
    }
    if (item.t === "Mod") {
        return "from-purple-900/80 to-purple-100/80"
    }
    if (item.t === "Weapon") {
        return "from-blue-900/80 to-blue-100/80"
    }
    if (item.t === "Char") {
        return "from-green-900/80 to-green-100/80"
    }
    if (item.t === "Draft") {
        return "from-yellow-900/80 to-yellow-100/80"
    }
    if (item.t === "Walnut") {
        return getQualityColor(5)
    }
    return "from-gray-900/80 to-gray-100/80"
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
    if (item.t === "Weapon" || item.t === "Char") {
        return item.n ? t(item.n) : `ID: ${item.id}`
    }
    if (item.t === "Draft") {
        const draft = draftMap.get(item.id)
        return draft ? `图纸: ${draft.n}` : `ID: ${item.id}`
    }
    if (item.t === "Resource") {
        return item.n ? t(item.n) : `ID: ${item.id}`
    }
    if (item.t === "Walnut") {
        return walnutMap.get(item.id)?.名称 || `ID: ${item.id}`
    }
    if (item.t === "CharAccessory" || item.t === "WeaponAccessory") {
        return item.n || `ID: ${item.id}`
    }
    return (item.n && t(item.n)) || (item.t === "Reward" ? `奖励组 ${item.id}` : `ID: ${item.id}`)
}

/**
 * 获取角色碎片资源对应的角色头像。
 * @param name 资源名
 * @returns 角色头像路径
 */
function getCharacterFragmentIcon(name?: string): string {
    const fragmentPrefix = "思绪片段·"
    if (!name || !name.startsWith(fragmentPrefix)) {
        return ""
    }

    const charName = name.slice(fragmentPrefix.length)
    const char = charMap.get(charName)
    return char?.icon ? LeveledChar.url(char.icon) : ""
}

// 获取掉落模式文本
function getDropModeText(mode: string): string {
    const modeMap: Record<string, string> = {
        Independent: "独立",
        Weight: "权重",
        Fixed: "固定",
        Gender: "性别",
        Level: "等级",
        Once: "一次",
        Sequence: "序列",
    }

    return modeMap[mode] || mode
}
</script>

<template>
    <div class="space-y-1">
        <!-- 递归奖励显示 -->
        <template v-for="item in reward?.child || []" :key="`${item.id}-${item.t}`">
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
                                {{ item.dp ? "掉落物: " : "" }}
                                {{ item.d ? "图纸: " : "" }}
                                {{ getRewardDisplayName(item) }}
                            </SRouterLink>
                            <span v-else>
                                {{ item.dp ? "掉落物: " : "" }}
                                {{ item.d ? "图纸: " : "" }}
                                {{ getRewardDisplayName(item) }}
                            </span>
                            <span class="text-xs text-base-content/50">({{ $t(getRewardTypeText(item.t)) }})</span>
                        </span>
                        <span v-if="item.c" class="text-base-content/70">x{{ item.c }}</span>
                        <span v-if="item.p && item.m !== 'Independent'" class="text-base-content/70">
                            ({{ item.m === "Sequence" ? `容量:${item.p}` : `权重:${item.p}` }}
                            {{ item.pp ? `比例:${+(item.pp * 100).toFixed(2)}%` : "" }}
                            {{ item.times ? `每个期望:${+item.times.toFixed(2)}次` : "" }}
                            )
                        </span>
                        <span v-if="item.m === 'Independent'">独立掉落 {{ `概率:${+(item.p / 100).toFixed(2)}%` }}</span>
                        <!-- 显示掉落模式 -->
                        <span
                            v-if="item.t === 'Reward'"
                            class="text-xs px-1.5 py-0.5 rounded"
                            :class="
                                getDropModeText(item.m || '') === '独立'
                                    ? 'bg-success text-success-content'
                                    : 'bg-warning text-warning-content'
                            "
                        >
                            {{ getDropModeText(item.m || "") }}
                            <span v-if="item.totalP"> 总容量 {{ item.totalP }}</span>
                        </span>
                    </div>
                    <!-- 递归显示子奖励 -->
                    <div v-if="item.child && item.child.length" class="pl-4 mt-1 space-y-1">
                        <RewardItem :reward="item" />
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
