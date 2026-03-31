<script setup lang="ts">
import { computed } from "vue"
import { LeveledChar, LeveledMod, resourceMap } from "@/data"
import { charMap, draftMap, modMap, walnutMap, weaponMap } from "@/data/d"
import { charAccessoryData, headFrameData, skinData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import type { Draft } from "@/data/d/draft.data"
import { headSculptureData } from "@/data/d/headsculpture.data"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"

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
                  | "Weapon"
                  | "Char"
                  | "CharAccessory"
                  | "WeaponAccessory"
                  | "Walnut"
                  | "Resource"
                  | "Skin"
                  | "HeadSculpture"
                  | "HeadFrame"
                  | "WeaponSkin"
              ),
          ]
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
    const fragmentIcon = getCharacterFragmentIcon(name)
    if (fragmentIcon) {
        return fragmentIcon
    }
    const res = resourceMap.get(name)
    return res?.icon ? `/imgs/res/${res?.icon}.webp` : `/imgs/webp/T_Head_Empty.webp`
}

/**
 * 通过资源 ID 查找资源信息。
 * @param id 资源 ID
 * @returns 资源数据
 */
function getResourceById(id: number | string) {
    const normalizedId = Number(id)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }

    return [...resourceMap.values()].find(item => item.id === normalizedId)
}

function getRarityColor(name: string): string {
    const res = resourceMap.get(name)
    return getQualityColor(res?.rarity || 1)
}

/**
 * 获取资源的展示图标。
 * @param resourceId 资源ID
 * @returns 图标路径
 */
function getResourceIconById(resourceId: number | string) {
    const resource = getResourceById(resourceId)
    return resource?.icon ? `/imgs/res/${resource.icon}.webp` : `/imgs/webp/T_Head_Empty.webp`
}

/**
 * 获取资源的稀有度背景色。
 * @param resourceId 资源ID
 * @returns 背景色类名
 */
function getResourceBackgroundById(resourceId: number | string) {
    const resource = getResourceById(resourceId)
    return getQualityColor(resource?.rarity || 1)
}
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
 * 获取图纸条目的展示图标。
 * @param draftId 图纸ID或产物ID
 * @returns 图标路径
 */
function getDraftIcon(draftId: number | string) {
    const draft = getDraftByIdOrProductId(draftId)
    if (!draft) return `/imgs/webp/T_Head_Empty.webp`
    if (draft.t === "Mod") {
        return LeveledMod.url(modMap.get(draft.p)?.icon)
    }
    if (draft.t === "Weapon") {
        return LeveledWeapon.url(weaponMap.get(draft.p)?.icon)
    }
    return getIcon(draft.n)
}

/**
 * 获取图纸条目的背景色。
 * @param draftId 图纸ID或产物ID
 * @returns 背景色类名
 */
function getDraftBackgroundColor(draftId: number | string): string {
    const draft = getDraftByIdOrProductId(draftId)
    if (!draft) return getQualityColor(1)
    if (draft.t === "Mod") {
        return getQualityColor(modMap.get(draft.p)?.品质 || draft.r)
    }
    return getQualityColor(draft.r)
}

/**
 * 获取角色碎片资源对应的角色头像。
 * @param name 资源名
 * @returns 角色头像路径
 */
function getCharacterFragmentIcon(name: string): string {
    const prefix = "思绪片段·"
    if (!name.startsWith(prefix)) {
        return ""
    }

    const char = charMap.get(name.slice(prefix.length))
    return char?.icon ? LeveledChar.url(char.icon) : ""
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
    const { reward } = getWalnutReward(walnutId)
    if (!reward) return "/imgs/webp/T_Head_Empty.webp"
    if (reward.type === "Mod") {
        return LeveledMod.url(modMap.get(reward.id)?.icon)
    }
    if (reward.type === "Weapon") {
        return LeveledWeapon.url(weaponMap.get(reward.id)?.icon)
    }
    if (reward.type === "Resource") {
        return getCharacterFragmentIcon(reward.name) || getIcon(reward.name)
    }
    return "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 获取密函产物背景色。
 * @param walnutId 密函ID
 * @returns 背景色类名
 */
function getWalnutBackgroundColor(_walnutId: number | string): string {
    return getQualityColor(5)
}

/**
 * 通过图纸ID或产物ID查找图纸。
 * @param draftId 图纸ID或产物ID
 * @returns 图纸数据
 */
function getDraftByIdOrProductId(draftId: number | string): Draft | undefined {
    const normalizedId = Number(draftId)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }
    return draftMap.get(normalizedId) ?? [...draftMap.values()].find(draft => draft.p === normalizedId)
}

type FashionCostType = "CharAccessory" | "WeaponAccessory" | "WeaponSkin" | "Skin" | "HeadSculpture" | "HeadFrame"

interface FashionCostMeta {
    icon: string
    rarity: number
}

/**
 * 通过类型和ID查找时装条目。
 * @param type 时装类型
 * @param id 条目ID
 * @returns 时装元数据
 */
function getFashionMeta(type: FashionCostType, id: number | string): FashionCostMeta | null {
    const normalizedId = Number(id)
    if (!Number.isFinite(normalizedId)) {
        return null
    }

    if (type === "CharAccessory") {
        const item = charAccessoryData.find(entry => entry.id === normalizedId)
        return item ? { icon: item.icon, rarity: item.rarity } : null
    }

    if (type === "WeaponAccessory") {
        const item = weaponAccessoryData.find(entry => entry.id === normalizedId)
        return item ? { icon: item.icon, rarity: item.rarity } : null
    }

    if (type === "WeaponSkin") {
        const item = weaponSkinData.find(entry => entry.id === normalizedId)
        return item ? { icon: item.icon, rarity: item.rarity } : null
    }

    if (type === "Skin") {
        const item = skinData.find(entry => entry.id === normalizedId)
        return item ? { icon: item.icon, rarity: item.rarity } : null
    }

    if (type === "HeadSculpture") {
        const item = headSculptureData.find(entry => entry.id === normalizedId)
        return item ? { icon: item.icon, rarity: 5 } : null
    }

    if (type === "HeadFrame") {
        const item = headFrameData.find(entry => entry.id === normalizedId)
        return item ? { icon: item.icon, rarity: 4 } : null
    }

    return null
}

/**
 * 获取时装类条目的图标。
 * @param type 时装类型
 * @param id 条目ID
 * @returns 图标路径
 */
function getFashionIcon(type: FashionCostType, id: number | string) {
    const meta = getFashionMeta(type, id)
    return meta?.icon ? resolveSkinIconUrl(meta.icon) : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 获取时装类条目的稀有度。
 * @param type 时装类型
 * @param id 条目ID
 * @returns 稀有度
 */
function getFashionRarity(type: FashionCostType, id: number | string): number {
    return getFashionMeta(type, id)?.rarity || 1
}

/**
 * 获取时装类条目的背景色。
 * @param type 时装类型
 * @param id 条目ID
 * @returns 背景色类名
 */
function getFashionBackgroundColor(type: FashionCostType, id: number | string): string {
    return getQualityColor(getFashionRarity(type, id))
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
 * 获取用于模组展示的构造参数。
 * @param id 资源ID
 * @returns 规范化后的数值ID
 */
function getNormalizedId(id: number | string): number {
    return Number(id)
}

/**
 * 构造带等级的模组展示对象。
 * @param id 模组ID
 * @returns 带等级的模组对象
 */
function createLeveledMod(id: number | string) {
    return new LeveledMod(getNormalizedId(id))
}

/**
 * 构造带等级的武器展示对象。
 * @param id 武器ID
 * @returns 带等级的武器对象
 */
function createLeveledWeapon(id: number | string) {
    return new LeveledWeapon(getNormalizedId(id))
}

/**
 * 构造带等级的角色展示对象。
 * @param id 角色ID或名称
 * @returns 带等级的角色对象
 */
function createLeveledChar(id: number | string) {
    return new LeveledChar(id)
}

/**
 * 处理卡片点击；若点击发生在链接上，则保留链接默认跳转且不触发卡片点击。
 */
function handleCardClick() {
    emit("click")
}
</script>
<template>
    <ShowProps
        v-if="Array.isArray(value) && value[2] === 'Mod'"
        v-for="mod in [createLeveledMod(value[1])]"
        :key="mod.id"
        :props="mod.getProperties()"
        :title="`${$t(mod.系列)}${$t(mod.名称)}`"
        :rarity="mod.品质"
        :polarity="mod.极性"
        :cost="mod.耐受"
        :type="`${$t(mod.类型)}${mod.属性 ? `,${$t(mod.属性 + '属性')}` : ''}${mod.限定 ? `,${$t(mod.限定)}` : ''}`"
        :effdesc="mod.效果"
        :link="`/db/mod/${mod.id}`"
    >
        <div class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200" v-bind="$attrs" @click="handleCardClick">
            <span class="font-medium truncate">
                <img
                    :src="mod.url"
                    :alt="mod.名称"
                    class="size-8 inline-block mr-2 bg-linear-45 rounded"
                    :class="getQualityColor(mod.品质)"
                />
                <SRouterLink :to="`/db/mod/${mod.id}`" stop class="hover:underline">
                    {{ value[2] === "Mod" ? $t(mod.名称) : `图纸: ${mod.名称}` }}
                </SRouterLink>
            </span>
            <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
        </div>
    </ShowProps>
    <ShowProps
        v-else-if="Array.isArray(value) && value[2] === 'Weapon'"
        v-for="weapon in [createLeveledWeapon(value[1])]"
        :key="weapon.id"
        :props="weapon.getProperties()"
        :title="$t(weapon.名称)"
        :type="weapon._originalWeaponData.类型.map(type => $t(type)).join(',')"
        :effdesc="weapon.效果"
        :link="`/db/weapon/${weapon.id}`"
    >
        <div class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200" v-bind="$attrs" @click="handleCardClick">
            <span class="font-medium truncate">
                <img :src="weapon.url" :alt="weapon.名称" class="size-8 inline-block mr-2 rounded" />
                <SRouterLink :to="`/db/weapon/${weapon.id}`" stop class="hover:underline">
                    {{ $t(weapon.名称) }}
                </SRouterLink>
            </span>
            <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
        </div>
    </ShowProps>
    <ShowProps
        v-else-if="Array.isArray(value) && value[2] === 'Char'"
        v-for="char in [createLeveledChar(value[1])]"
        :key="char.id"
        :props="char.getProperties()"
        :title="$t(char.名称)"
        :link="`/db/char/${char.id}`"
    >
        <div class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200" v-bind="$attrs" @click="handleCardClick">
            <span class="font-medium truncate">
                <img :src="char.url" :alt="char.名称" class="size-8 inline-block mr-2 rounded" />
                <SRouterLink :to="`/db/char/${char.id}`" stop class="hover:underline">
                    {{ $t(char.名称) }}
                </SRouterLink>
            </span>
            <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
        </div>
    </ShowProps>
    <div
        v-else-if="Array.isArray(value) && value[2] === 'Draft' && getDraftByIdOrProductId(value[1])"
        class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200"
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getDraftIcon(value[1])"
                alt=""
                class="size-8 inline-block mr-2 bg-linear-45 rounded"
                :class="getDraftBackgroundColor(value[1])"
            />
            <SRouterLink :to="`/db/draft/${getDraftByIdOrProductId(value[1])!.id}`" stop class="hover:underline">
                {{ `图纸: ${Array.isArray(name) ? name.join(" / ") : getDraftByIdOrProductId(value[1])!.n}` }}
            </SRouterLink>
        </span>
        <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="Array.isArray(value) && value[2] === 'Walnut' && getWalnutReward(value[1]).walnut"
        class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200"
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getWalnutIcon(value[1])"
                alt=""
                class="size-8 inline-block mr-2 bg-linear-45 rounded"
                :class="getWalnutBackgroundColor(value[1])"
            />
            <SRouterLink :to="`/db/walnut/${Number(value[1])}`" stop class="hover:underline">
                {{ `密函: ${getWalnutReward(value[1]).walnut?.名称 || value[1]}` }}
            </SRouterLink>
        </span>
        <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="Array.isArray(value) && value[2] === 'Resource' && getResourceById(value[1])"
        class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200"
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getResourceIconById(value[1])"
                alt=""
                class="size-8 inline-block mr-2 bg-linear-15 rounded"
                :class="getResourceBackgroundById(value[1])"
            />
            <SRouterLink :to="`/db/resource/${getResourceById(value[1])!.id}`" stop class="hover:underline">
                {{ getResourceById(value[1])!.name }}
            </SRouterLink>
        </span>
        <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="
            Array.isArray(value) &&
            (value[2] === 'Skin' || value[2] === 'HeadSculpture' || value[2] === 'HeadFrame' || value[2] === 'WeaponSkin')
        "
        class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200"
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getFashionIcon(value[2], value[1])"
                alt=""
                class="size-8 inline-block mr-2 bg-linear-15 rounded"
                :class="getFashionBackgroundColor(value[2], value[1])"
            />
            <span>{{ name }}</span>
        </span>
        <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
    </div>
    <div
        v-else-if="
            Array.isArray(value) &&
            (value[2] === 'CharAccessory' || value[2] === 'WeaponAccessory') &&
            getAccessoryByType(value[2], value[1])
        "
        class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200"
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img
                :src="getFashionIcon(value[2], value[1])"
                alt=""
                class="size-8 inline-block mr-2 bg-linear-15 rounded"
                :class="getFashionBackgroundColor(value[2], value[1])"
            />
            <SRouterLink :to="`/db/accessory/${value[2] === 'CharAccessory' ? 'char' : 'weapon'}/${value[1]}`" stop class="hover:underline">
                {{ getAccessoryByType(value[2], value[1])?.name || name }}
            </SRouterLink>
        </span>
        <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
    </div>
    <div v-else class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200" v-bind="$attrs" @click="$emit('click')">
        <span class="font-medium truncate">
            <img
                :src="getIcon(nameString)"
                alt=""
                class="size-8 inline-block mr-2 bg-linear-15 rounded"
                :class="getRarityColor(nameString)"
            />
            <SRouterLink :to="`/db/resource/${resourceMap.get(nameString)?.id}`" stop class="hover:underline">
                {{ $t(nameString) }}
            </SRouterLink>
        </span>
        <span class="font-bold text-primary ml-auto">{{ value }}</span>
    </div>
</template>
