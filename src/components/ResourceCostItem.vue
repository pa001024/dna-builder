<script setup lang="ts">
import { LeveledMod, resourceMap } from "@/data"
import { draftMap, modMap, weaponMap } from "@/data/d"
import { charAccessoryData, weaponAccessoryData } from "@/data/d/accessory.data"
import type { Draft } from "@/data/d/draft.data"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"

defineOptions({ inheritAttrs: false })
defineProps<{
    name: string
    value: number | [number, number, "Mod" | "Draft" | "Weapon" | "CharAccessory" | "WeaponAccessory"]
}>()

const emit = defineEmits<{
    click: []
}>()

function getIcon(name: string) {
    const res = resourceMap.get(name)
    return res?.icon ? `/imgs/res/${res?.icon}.webp` : `/imgs/webp/T_Head_Empty.webp`
}

function getRarityColor(name: string): string {
    const res = resourceMap.get(name)
    return getQualityColor(res?.rarity || 1)
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
function getDraftIcon(draftId: number) {
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
function getDraftBackgroundColor(draftId: number): string {
    const draft = getDraftByIdOrProductId(draftId)
    if (!draft) return getQualityColor(1)
    if (draft.t === "Mod") {
        return getQualityColor(modMap.get(draft.p)?.品质 || draft.r)
    }
    return getQualityColor(draft.r)
}

/**
 * 通过图纸ID或产物ID查找图纸。
 * @param draftId 图纸ID或产物ID
 * @returns 图纸数据
 */
function getDraftByIdOrProductId(draftId: number): Draft | undefined {
    return draftMap.get(draftId) ?? [...draftMap.values()].find(draft => draft.p === draftId)
}

/**
 * 获取饰品图标。
 * @param icon 图标名
 * @returns 图标路径
 */
function getAccessoryIcon(icon?: string) {
    return icon ? `/imgs/fashion/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 通过类型和ID查找饰品信息。
 * @param type 饰品类型
 * @param id 饰品ID
 * @returns 饰品数据
 */
function getAccessoryByType(type: "CharAccessory" | "WeaponAccessory", id: number) {
    const list = type === "CharAccessory" ? charAccessoryData : weaponAccessoryData
    return list.find(item => item.id === id)
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
        v-for="mod in [new LeveledMod(value[1])]"
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
        v-for="weapon in [new LeveledWeapon(value[1])]"
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
                {{ `图纸: ${getDraftByIdOrProductId(value[1])!.n}` }}
            </SRouterLink>
        </span>
        <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
    </div>
    <SRouterLink
        v-else-if="
            Array.isArray(value) &&
            (value[2] === 'CharAccessory' || value[2] === 'WeaponAccessory') &&
            getAccessoryByType(value[2], value[1])
        "
        :to="`/db/accessory/${value[2] === 'CharAccessory' ? 'char' : 'weapon'}/${value[1]}`"
        class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200 hover:bg-base-content/10"
        v-bind="$attrs"
        @click="$emit('click')"
    >
        <span class="font-medium truncate">
            <img :src="getAccessoryIcon(getAccessoryByType(value[2], value[1])?.icon)" alt="" class="size-8 inline-block mr-2 rounded" />
            {{ getAccessoryByType(value[2], value[1])?.name || name }}
        </span>
        <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
    </SRouterLink>
    <div v-else class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200" v-bind="$attrs" @click="$emit('click')">
        <span class="font-medium truncate">
            <img :src="getIcon(name)" alt="" class="size-8 inline-block mr-2 bg-linear-15 rounded" :class="getRarityColor(name)" />
            {{ $t(name) }}</span
        >
        <span class="font-bold text-primary ml-auto">{{ value }}</span>
    </div>
</template>
