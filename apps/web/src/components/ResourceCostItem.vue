<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { LeveledCharHelper, LeveledModHelper, LeveledWeaponHelper, resourceMap } from "@/data"
import { charMap, draftMap, iconticketMap, skinMap, walnutMap } from "@/data/d"
import { charAccessoryData, weaponAccessoryData } from "@/data/d/accessory.data"
import type { Draft } from "@/data/d/draft.data"
import { titleData } from "@/data/d/title.data"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { getRewardIconBackground, getRewardIconUrl } from "@/utils/reward-icon"
import { getRewardDetailLink } from "@/utils/reward-link"

/** 称号 id → 称号数据 */
const titleMap = new Map(titleData.map(title => [title.id, title]))

const { t } = useTranslation()

/**
 * 奖励展示名国际化（单个名或斜杠拼接的多个名统一处理）。
 * @param name 奖励名或奖励名数组
 * @returns 翻译后的展示文本
 */
function tName(name: string | string[]): string {
    if (Array.isArray(name)) {
        return name.map(item => t(item)).join(" / ")
    }
    return t(name)
}

/**
 * 获取称号条目信息。
 * @param titleId 称号ID
 * @returns 称号数据
 */
function getTitleById(titleId: number | string) {
    const normalizedId = Number(titleId)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }
    return titleMap.get(normalizedId)
}

defineOptions({ inheritAttrs: false })
const props = defineProps<{
    name: string | string[]
    value:
        | number
        | [
              number | string,
              number | string,
              (
                  | "Mod"
                  | "Draft"
                  | "Pack"
                  | "Weapon"
                  | "Char"
                  | "CharAccessory"
                  | "WeaponAccessory"
                  | "Walnut"
                  | "Resource"
                  | "IronTicket"
                  | "Skin"
                  | "HeadSculpture"
                  | "HeadFrame"
                  | "Hair"
                  | "Title"
                  | "WeaponSkin"
              ),
          ]
    mini?: boolean
    /** 行内模式：只显示图标+数量，悬停弹出 ResourceTooltip（用于周阶段建设点这类单资源计数） */
    inline?: boolean
}>()

const nameString = computed(() => {
    if (Array.isArray(props.name)) {
        return props.name.join(" / ")
    }
    return props.name
})

const emit = defineEmits<{
    click: []
}>()

function getIcon(name: string) {
    return getRewardIconUrl("Resource", name)
}

/**
 * 通过资源 ID 查找资源信息。
 * @param id 资源 ID
 * @returns 资源数据
 */
function getResourceById(id: number | string) {
    // 铸造产物没有游戏 id，调用方会直接把资源名当 key 传进来
    const direct = resourceMap.get(id as number)
    if (direct) {
        return direct
    }
    const normalizedId = Number(id)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }

    return [...resourceMap.values()].find(item => item.id === normalizedId)
}

function getRarityColor(name: string): string {
    const res = resourceMap.get(name)
    return getRarityGradientClass(res?.rarity || 1)
}

/**
 * 获取资源的展示图标。
 * @param resourceId 资源ID
 * @returns 图标路径
 */
function getResourceIconById(resourceId: number | string) {
    return getRewardIconUrl("Resource", resourceId)
}

/**
 * 获取资源的稀有度背景色。
 * @param resourceId 资源ID
 * @returns 背景色类名
 */
function getResourceBackgroundById(resourceId: number | string) {
    return getRewardIconBackground("Resource", resourceId)
}

/**
 * 获取深境罗盘图标。
 * @param ticketId 深境罗盘ID
 * @returns 图标路径
 */
function getIronTicketIcon(ticketId: number | string): string {
    return getRewardIconUrl("IronTicket", ticketId)
}

/**
 * 获取深境罗盘背景色。
 * @param ticketId 深境罗盘ID
 * @returns 背景色类名
 */
function getIronTicketBackgroundById(ticketId: number | string): string {
    return getRewardIconBackground("IronTicket", ticketId)
}

/**
 * 获取设计稿条目的展示图标。
 * @param draftId 设计稿ID或产物ID
 * @returns 图标路径
 */
function getDraftIcon(draftId: number | string) {
    return getRewardIconUrl("Draft", draftId)
}

/**
 * 获取设计稿条目的背景色。
 * @param draftId 设计稿ID或产物ID
 * @returns 背景色类名
 */
function getDraftBackgroundColor(draftId: number | string): string {
    return getRewardIconBackground("Draft", draftId)
}

/**
 * 获取密函对应的产物信息。
 * @param walnutId 密函ID
 * @returns 产物信息
 */
function getWalnutReward(walnutId: number | string) {
    const walnut = walnutMap.get(Number(walnutId))
    return { walnut, reward: walnut?.奖励?.[0] ?? null }
}

/**
 * 获取密函产物图标。
 * @param walnutId 密函ID
 * @returns 图标路径
 */
function getWalnutIcon(walnutId: number | string): string {
    return getRewardIconUrl("Walnut", walnutId)
}

/**
 * 获取密函产物背景色。
 * @param walnutId 密函ID
 * @returns 背景色类名
 */
function getWalnutBackgroundColor(walnutId: number | string): string {
    return getRewardIconBackground("Walnut", walnutId)
}

/**
 * 通过设计稿ID或产物ID查找设计稿。
 * @param draftId 设计稿ID或产物ID
 * @returns 设计稿数据
 */
function getDraftByIdOrProductId(draftId: number | string): Draft | undefined {
    const normalizedId = Number(draftId)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }
    return draftMap.get(normalizedId) ?? [...draftMap.values()].find(draft => draft.p === normalizedId)
}

type FashionCostType = "CharAccessory" | "WeaponAccessory" | "WeaponSkin" | "Skin" | "HeadSculpture" | "HeadFrame" | "Hair" | "TitleFrame"

/**
 * 获取皮肤条目的展示名称。
 * @param id 皮肤ID
 * @param fallback 兜底名称
 * @returns 角色名与皮肤名组合后的展示文本
 */
function getSkinDisplayName(id: number | string, fallback: string): string {
    const normalizedId = Number(id)
    if (!Number.isFinite(normalizedId)) {
        return t(fallback)
    }

    const skin = skinMap.get(normalizedId)
    const charName = skin?.charId ? charMap.get(skin.charId)?.名称 : ""
    const skinName = skin?.name || fallback
    return charName ? `${t(charName)} · ${t(skinName)}` : t(skinName)
}

/**
 * 判断奖励项是否属于可直接按时装类型展示的分支。
 * @param type 奖励类型
 * @returns 是否为时装分支
 */
function isFashionCostType(type: string): type is FashionCostType {
    return ["Skin", "HeadSculpture", "HeadFrame", "Hair", "WeaponSkin"].includes(type)
}

/**
 * 判断奖励类型是否可以直接作为饰品查询类型。
 * @param type 奖励类型
 * @returns 是否可作为饰品类型
 */
function isAccessoryCostType(type: string): type is "CharAccessory" | "WeaponAccessory" {
    return ["CharAccessory", "WeaponAccessory"].includes(type)
}

/**
 * 获取时装类条目的图标。
 * @param type 时装类型
 * @param id 条目ID
 * @returns 图标路径
 */
function getFashionIcon(type: FashionCostType, id: number | string) {
    return getRewardIconUrl(type, id)
}

/**
 * 获取时装类条目的背景色。
 * @param type 时装类型
 * @param id 条目ID
 * @returns 背景色类名
 */
function getFashionBackgroundColor(type: FashionCostType, id: number | string): string {
    return getRewardIconBackground(type, id)
}

/**
 * 通过类型和ID查找饰品信息。
 * @param type 饰品类型
 * @param id 饰品ID
 * @returns 饰品数据
 */
function getAccessoryByType(type: "CharAccessory" | "WeaponAccessory", id: number | string) {
    const normalizedId = Number(id)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }

    const list = type === "CharAccessory" ? charAccessoryData : weaponAccessoryData
    return list.find(item => item.id === normalizedId)
}

/**
 * 获取用于魔之楔展示的构造参数。
 * @param id 资源ID
 * @returns 规范化后的数值ID
 */
function getNormalizedId(id: number | string): number {
    return Number(id)
}

/**
 * 构造带等级的魔之楔展示对象。
 * @param id 魔之楔ID
 * @returns 带等级的魔之楔对象
 */
function createLeveledMod(id: number | string) {
    return LeveledModHelper.fromId(getNormalizedId(id))
}

/**
 * 构造带等级的武器展示对象。
 * @param id 武器ID
 * @returns 带等级的武器对象
 */
function createLeveledWeapon(id: number | string) {
    return LeveledWeaponHelper.fromId(getNormalizedId(id) as number)
}

/**
 * 构造带等级的角色展示对象。
 * @param id 角色ID或名称
 * @returns 带等级的角色对象
 */
function createLeveledChar(id: number | string) {
    return LeveledCharHelper.fromId(id)
}

/**
 * 处理卡片点击；若点击发生在链接上，则保留链接默认跳转且不触发卡片点击。
 */
function handleCardClick() {
    emit("click")
}
</script>
<template>
    <template v-if="inline && Array.isArray(value)">
        <FullTooltip
            v-if="(value[2] === 'Resource' || value[2] === 'Pack') && getResourceById(value[1])"
            side="top"
        >
            <template #tooltip>
                <div class="-mx-3.75 -my-2.5">
                    <ResourceTooltip :resource="getResourceById(value[1])!" bare />
                </div>
            </template>
            <SRouterLink
                :to="getRewardDetailLink('Resource', value[1])"
                class="inline-flex cursor-pointer items-center gap-1 hover:underline"
            >
                <img
                    :src="getResourceIconById(value[1])"
                    alt=""
                    class="size-5 rounded-xs"
                    :class="getResourceBackgroundById(value[1])"
                />
                <span class="text-xs">{{ tName(getResourceById(value[1])!.name) }}</span>
                <span class="text-xs">{{ value[0] }}</span>
            </SRouterLink>
        </FullTooltip>
        <ShowProps
            v-else-if="value[2] === 'Mod'"
            v-for="mod in [createLeveledMod(value[1])]"
            :key="mod.id"
            :mod="mod"
            :link="getRewardDetailLink('Mod', mod.id)"
        >
            <SRouterLink
                :to="getRewardDetailLink('Mod', mod.id)"
                class="inline-flex cursor-pointer items-center gap-1 hover:underline"
            >
                <img
                    :src="mod.url"
                    alt=""
                    class="size-5 rounded-xs"
                    :class="getRewardIconBackground('Mod', value[1])"
                />
                <span class="text-xs">{{ $t(mod.名称) }}</span>
                <span class="text-xs">{{ value[0] }}</span>
            </SRouterLink>
        </ShowProps>
        <ShowProps
            v-else-if="value[2] === 'Weapon'"
            v-for="weapon in [createLeveledWeapon(value[1])]"
            :key="weapon.id"
            :weapon="weapon"
            :link="getRewardDetailLink('Weapon', weapon.id)"
        >
            <SRouterLink
                :to="getRewardDetailLink('Weapon', weapon.id)"
                class="inline-flex cursor-pointer items-center gap-1 hover:underline"
            >
                <img
                    :src="weapon.url"
                    alt=""
                    class="size-5 rounded-xs"
                    :class="getRewardIconBackground('Weapon', value[1])"
                />
                <span class="text-xs">{{ $t(weapon.名称) }}</span>
                <span class="text-xs">{{ value[0] }}</span>
            </SRouterLink>
        </ShowProps>
        <ShowProps
            v-else-if="value[2] === 'Char'"
            v-for="char in [createLeveledChar(value[1])]"
            :key="char.id"
            :char="char"
            :link="getRewardDetailLink('Char', char.id)"
        >
            <SRouterLink
                :to="getRewardDetailLink('Char', char.id)"
                class="inline-flex cursor-pointer items-center gap-1 hover:underline"
            >
                <img
                    :src="char.url"
                    alt=""
                    class="size-5 rounded-xs"
                    :class="getRewardIconBackground('Char', value[1])"
                />
                <span class="text-xs">{{ $t(char.名称) }}</span>
                <span class="text-xs">{{ value[0] }}</span>
            </SRouterLink>
        </ShowProps>
        <SRouterLink
            v-else-if="getRewardDetailLink(value[2], value[1])"
            :to="getRewardDetailLink(value[2], value[1])"
            class="inline-flex cursor-pointer items-center gap-1 hover:underline"
        >
            <img
                :src="getRewardIconUrl(value[2], value[1])"
                alt=""
                class="size-5 rounded-xs"
                :class="getRewardIconBackground(value[2], value[1])"
            />
            <span class="text-xs">{{ $t(nameString) }}</span>
            <span class="text-xs">{{ value[0] }}</span>
        </SRouterLink>
        <span v-else class="inline-flex items-center gap-1">
            <img
                :src="getRewardIconUrl(value[2], value[1])"
                alt=""
                class="size-5 rounded-xs"
                :class="getRewardIconBackground(value[2], value[1])"
            />
            <span class="text-xs">{{ $t(nameString) }}</span>
            <span class="text-xs">{{ value[0] }}</span>
        </span>
    </template>
    <template v-else>
    <ShowProps
        v-if="Array.isArray(value) && value[2] === 'Mod'"
        v-for="mod in [createLeveledMod(value[1])]"
        :key="mod.id"
        :mod="mod"
        :link="getRewardDetailLink('Mod', mod.id)"
    >
        <div
            v-bind="$attrs"
            :class="
                mini
                    ? 'flex items-center transition-colors duration-200'
                    : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
            "
            @click="handleCardClick"
        >
            <span class="font-medium truncate">
                <img
                    :src="mod.url"
                    :alt="mod.名称"
                    class="size-8 inline-block mr-2 rounded-xs bg-linear-45"
                    :class="getRarityGradientClass(mod.品质)"
                />
                <SRouterLink v-if="!mini" :to="getRewardDetailLink('Mod', mod.id)" stop class="hover:underline">
                    {{ value[2] === "Mod" ? $t(mod.名称) : `${$t("UI_FORGING_BLUEPRINT")}${mod.名称}` }}
                </SRouterLink>
            </span>
            <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
        </div>
    </ShowProps>
    <ShowProps
        v-else-if="Array.isArray(value) && value[2] === 'Weapon'"
        v-for="weapon in [createLeveledWeapon(value[1])]"
        :key="weapon.id"
        :weapon="weapon"
        :link="getRewardDetailLink('Weapon', weapon.id)"
    >
        <div
            v-bind="$attrs"
            :class="
                mini
                    ? 'flex items-center transition-colors duration-200'
                    : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
            "
            @click="handleCardClick"
        >
            <span class="font-medium truncate">
                <img
                    :src="weapon.url"
                    :alt="weapon.名称"
                    class="size-8 inline-block mr-2 rounded-xs bg-linear-45"
                    :class="getRarityGradientClass(5)"
                />
                <SRouterLink v-if="!mini" :to="getRewardDetailLink('Weapon', weapon.id)" stop class="hover:underline">
                    {{ $t(weapon.名称) }}
                </SRouterLink>
            </span>
            <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
        </div>
    </ShowProps>
    <ShowProps
        v-else-if="Array.isArray(value) && value[2] === 'Char'"
        v-for="char in [createLeveledChar(value[1])]"
        :key="char.id"
        :char="char"
        :link="getRewardDetailLink('Char', char.id)"
    >
        <div
            v-bind="$attrs"
            :class="
                mini
                    ? 'flex items-center transition-colors duration-200'
                    : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
            "
            @click="handleCardClick"
        >
            <span class="font-medium truncate">
                <img
                    :src="char.url"
                    :alt="char.名称"
                    class="size-8 inline-block mr-2 rounded-xs bg-linear-45"
                    :class="getRarityGradientClass(5)"
                />
                <SRouterLink v-if="!mini" :to="getRewardDetailLink('Char', char.id)" stop class="hover:underline">
                    {{ $t(char.名称) }}
                </SRouterLink>
            </span>
            <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
        </div>
    </ShowProps>
    <div
        v-else-if="Array.isArray(value) && value[2] === 'Draft' && getDraftByIdOrProductId(value[1])"
        :class="
            mini
                ? 'flex items-center transition-colors duration-200'
                : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
        "
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getDraftIcon(value[1])"
                alt=""
                class="size-8 inline-block mr-2 rounded-xs bg-linear-45"
                :class="getDraftBackgroundColor(value[1])"
            />
            <SRouterLink v-if="!mini" :to="getRewardDetailLink('Draft', value[1])" stop class="hover:underline">
                {{ $t("设计稿") }}: {{ tName(Array.isArray(name) ? name : getDraftByIdOrProductId(value[1])!.n) }}
            </SRouterLink>
        </span>
        <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="Array.isArray(value) && value[2] === 'Walnut' && getWalnutReward(value[1]).walnut"
        :class="
            mini
                ? 'flex items-center transition-colors duration-200'
                : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
        "
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getWalnutIcon(value[1])"
                alt=""
                class="size-8 inline-block mr-2 rounded-xs bg-linear-45"
                :class="getWalnutBackgroundColor(value[1])"
            />
            <SRouterLink v-if="!mini" :to="getRewardDetailLink('Walnut', value[1])" stop class="hover:underline">
                {{ tName(getWalnutReward(value[1]).walnut?.名称 || String(value[1])) }}
            </SRouterLink>
        </span>
        <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="
            Array.isArray(value) && (value[2] === 'Resource' || value[2] === 'Pack') && getResourceById(value[1])
        "
        :class="
            mini
                ? 'flex items-center transition-colors duration-200'
                : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
        "
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getResourceIconById(value[1])"
                alt=""
                class="size-8 inline-block mr-2 rounded-xs bg-linear-15"
                :class="getResourceBackgroundById(value[1])"
            />
            <SRouterLink v-if="!mini" :to="getRewardDetailLink('Resource', value[1])" stop class="hover:underline">
                {{ tName(getResourceById(value[1])!.name) }}
            </SRouterLink>
        </span>
        <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="
            Array.isArray(value) &&
            (value[2] === 'IronTicket' || nameString.startsWith('IronTicket_')) &&
            iconticketMap.get(Number(value[1]))
        "
        :class="
            mini
                ? 'flex items-center transition-colors duration-200'
                : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
        "
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getIronTicketIcon(value[1])"
                alt=""
                class="size-8 inline-block mr-2 rounded-xs bg-linear-15"
                :class="getIronTicketBackgroundById(value[1])"
            />
            <SRouterLink v-if="!mini" :to="getRewardDetailLink('IronTicket', value[1])" stop class="hover:underline">
                {{ tName(iconticketMap.get(Number(value[1]))?.name || name) }}
            </SRouterLink>
        </span>
        <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="Array.isArray(value) && value[2] === 'Title' && getTitleById(value[1])"
        :class="
            mini
                ? 'flex items-center transition-colors duration-200'
                : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
        "
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                src="/imgs/webp/T_Icon_Random_Title.webp"
                alt=""
                class="size-8 inline-block mr-2 rounded-xs bg-linear-15"
                :class="getRarityGradientClass(4)"
            />
            <SRouterLink v-if="!mini" :to="getRewardDetailLink('Title', value[1])" stop class="hover:underline">
                {{ tName(getTitleById(value[1])?.name ?? "") }}
            </SRouterLink>
            <span v-else>{{ tName(getTitleById(value[1])?.name ?? "") }}</span>
        </span>
        <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="Array.isArray(value) && isFashionCostType(value[2])"
        :class="
            mini
                ? 'flex items-center transition-colors duration-200'
                : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
        "
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getFashionIcon(value[2], value[1])"
                alt=""
                class="size-8 inline-block mr-2 rounded-xs bg-linear-15"
                :class="getFashionBackgroundColor(value[2], value[1])"
            />
            <SRouterLink
                v-if="!mini && getRewardDetailLink(value[2], value[1])"
                :to="getRewardDetailLink(value[2], value[1])"
                stop
                class="hover:underline"
            >
                {{ value[2] === "Skin" ? getSkinDisplayName(value[1], nameString) : tName(nameString) }}
            </SRouterLink>
            <span v-else-if="!mini">{{ tName(name) }}</span>
        </span>
        <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="Array.isArray(value) && isAccessoryCostType(value[2]) && getAccessoryByType(value[2], value[1])"
        :class="
            mini
                ? 'flex items-center transition-colors duration-200'
                : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
        "
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getFashionIcon(value[2], value[1])"
                alt=""
                class="size-8 inline-block mr-2 rounded-xs bg-linear-15"
                :class="getFashionBackgroundColor(value[2], value[1])"
            />
            <SRouterLink v-if="!mini" :to="getRewardDetailLink(value[2], value[1])" stop class="hover:underline">
                {{ tName(getAccessoryByType(value[2], value[1])?.name || name) }}
            </SRouterLink>
        </span>
        <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value[0] }}</span>
    </div>
    <div
        v-else
        v-bind="$attrs"
        :class="
            mini
                ? 'flex items-center transition-colors duration-200'
                : 'flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40'
        "
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getIcon(nameString)"
                alt=""
                class="size-8 inline-block mr-2 rounded-xs bg-linear-15"
                :class="getRarityColor(nameString)"
            />
            <SRouterLink v-if="!mini" :to="getRewardDetailLink('Resource', nameString)" stop class="hover:underline">
                {{ $t(nameString) }}
            </SRouterLink>
        </span>
        <span v-if="!mini" class="ml-auto shrink-0 pl-2 font-orbitron text-sm font-bold text-primary">{{ value }}</span>
    </div>
    </template>
</template>
