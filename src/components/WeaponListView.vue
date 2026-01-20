<script setup lang="ts">
import { computed, ref } from "vue"
import { CharBuild, LeveledWeapon, weaponData } from "../data"
import type { Weapon } from "../data/data-types"
import { format100, format100r } from "../util"
import { matchPinyin } from "../utils/pinyin-utils"

const props = defineProps<{
    charBuild?: CharBuild
    melee?: number
    ranged?: number
}>()

const tabs = ["全部", "单手剑", "长柄", "重剑", "双刀", "鞭刃", "太刀", "手枪", "双枪", "榴炮", "霰弹枪", "突击枪", "弓"]
const activeTab = ref(tabs[0])
const searchQuery = ref("")
const selectedMelee = ref(props.melee || 0)
const selectedRanged = ref(props.ranged || 0)

// 元素颜色映射
const elementColors: Record<string, string> = {
    近战: "from-yellow-400 to-yellow-600",
    远程: "from-blue-400 to-blue-600",
}

// 元素边框颜色
const elementBorderColors: Record<string, string> = {
    近战: "border-yellow-500",
    远程: "border-blue-500",
}

// 过滤后的武器列表
const filteredWeapons = computed(() => {
    let filtered = weaponData.filter(w => activeTab.value === "全部" || w.类型.includes(activeTab.value))

    if (searchQuery.value) {
        const query = searchQuery.value
        filtered = filtered.filter(w => {
            // 直接中文匹配
            if (w.名称.includes(query) || w.类型.some(t => t.includes(query))) {
                return true
            }
            // 拼音匹配（全拼/首字母）
            const nameMatch = matchPinyin(w.名称, query)
            if (nameMatch.match) return true
            const typeMatch = w.类型.some(t => matchPinyin(t, query).match)
            if (typeMatch) return true
            return false
        })
    }

    return filtered
})

// 卡片进入动画延迟
const getAnimationDelay = (index: number) => {
    return Math.min(index * 50, 500) // 最多延迟500ms
}

const emits = defineEmits<{
    change: [melee: number, ranged: number]
}>()

function selectWeapon(weapon: Weapon) {
    if (weapon.类型[0] === "近战") {
        selectedMelee.value = weapon.id
    } else if (weapon.类型[0] === "远程") {
        selectedRanged.value = weapon.id
    }
    emits("change", selectedMelee.value, selectedRanged.value)
}
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden bg-base-300">
        <!-- 顶部搜索和筛选区 -->
        <div class="flex-none bg-base-100 border-b border-base-200 shadow-sm p-4 space-y-3">
            <!-- 搜索框 -->
            <div class="relative">
                <input
                    v-model="searchQuery"
                    type="text"
                    :placeholder="$t('搜索武器名称、类型（支持拼音）...')"
                    class="input input-bordered w-full pl-10 pr-4 focus:input-primary transition-all"
                />
                <Icon icon="ri:search-line" class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 w-5 h-5" />
            </div>

            <!-- 分类标签 -->
            <ScrollArea :vertical="false" horizontal>
                <div class="flex gap-2 pb-2">
                    <button
                        v-for="tab in tabs"
                        :key="tab"
                        class="btn btn-sm whitespace-nowrap transition-all duration-200"
                        :class="activeTab === tab ? 'btn-primary shadow-lg scale-105' : 'btn-ghost hover:bg-base-200'"
                        @click="activeTab = tab"
                    >
                        {{ $t(tab) }}
                    </button>
                </div>
            </ScrollArea>
        </div>

        <!-- 武器列表 -->
        <ScrollArea class="h-[60vh]">
            <div v-if="filteredWeapons.length === 0" class="flex flex-col items-center justify-center h-full text-base-content/50 py-20">
                <Icon icon="ri:emotion-sad-line" class="w-16 h-16 mb-4" />
                <p class="text-lg">
                    {{ $t("没有找到匹配的武器") }}
                </p>
            </div>

            <div
                class="grid gap-4 p-4 grid-cols-[repeat(auto-fill,minmax(min(100%,120px),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,140px),1fr))] md:grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))]"
            >
                <div
                    v-for="(weapon, index) in filteredWeapons"
                    :key="weapon.id"
                    class="group relative bg-base-100 rounded-xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer border-2"
                    :class="[
                        elementBorderColors[weapon.类型[0]] || 'border-base-300',
                        (weapon.类型[0] === '近战' ? selectedMelee == weapon.id : selectedRanged == weapon.id)
                            ? '-translate-y-1 border-green-500!'
                            : '',
                    ]"
                    :style="{ animation: `fade-in-up 0.5s ease-out ${getAnimationDelay(index)}ms both` }"
                    @click="selectWeapon(weapon as Weapon)"
                >
                    <!-- 属性背景渐变 -->
                    <div
                        class="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 bg-linear-to-br"
                        :class="elementColors[weapon.类型[0]] || 'from-gray-400 to-gray-600'"
                    />

                    <!-- 顶部属性标签 -->
                    <div
                        class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold text-white shadow-lg"
                        :class="`bg-linear-to-r ${elementColors[weapon.类型[0]] || 'from-gray-400 to-gray-600'}`"
                    >
                        {{ weapon.类型[1] }}
                    </div>

                    <!-- 武器头像 -->
                    <div class="relative h-24 overflow-hidden bg-base-200">
                        <ImageFallback
                            :src="LeveledWeapon.url(weapon.icon)"
                            :alt="weapon.名称"
                            class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                        >
                            <Icon icon="ri:question-line" class="w-full h-full opacity-50" />
                        </ImageFallback>

                        <!-- 悬停时的遮罩 -->
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300" />
                    </div>

                    <!-- 武器信息 -->
                    <div class="p-3 space-y-2">
                        <!-- 名称 -->
                        <h3
                            class="inline-flex items-center gap-2 font-bold text-base truncate group-hover:text-primary transition-colors duration-200"
                        >
                            <img
                                :src="LeveledWeapon.typeUrl(weapon.类型[1])"
                                :alt="weapon.类型[1]"
                                class="h-8 w-4 object-cover pointer-events-none"
                            />
                            {{ $t(weapon.名称) }}
                        </h3>

                        <p v-if="weapon.熔炼" class="text-xs text-base-content/60 truncate">
                            {{ $t(weapon.熔炼[5]) }}
                        </p>

                        <p class="text-xs truncate space-x-2">
                            <span>
                                {{ $t(weapon.伤害类型) }}
                            </span>
                            <span v-if="charBuild" class="text-primary">
                                收益: {{ format100r(charBuild.calcIncome(new LeveledWeapon(weapon))) }}
                            </span>
                        </p>

                        <!-- 底部属性条 -->
                        <div class="grid grid-cols-3 gap-1 pt-2 border-t border-base-200">
                            <div class="flex items-center gap-1 text-xs text-base-content/70 group-hover:text-warning transition-colors">
                                <svg
                                    aria-hidden="true"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 15 15"
                                    width="1em"
                                    height="1em"
                                    class="fill-current flex-none"
                                >
                                    <path
                                        fill="currentColor"
                                        d="M7.755 1.651l1.643 1.643 1.928-1.926L11.3.25a.228.228 0 01.228-.22h2.2a.228.228 0 01.228.229c-.121 2.66.556 2.457-1.337 2.4l-1.933 1.925L12.33 6.23a.228.228 0 010 .322c-1.167 1.208-.775.907-1.892-.106l-7.151 7.147a.457.457 0 01-.313.137 21.32 21.32 0 01-2.954.238 21.172 21.172 0 01.238-2.953.451.451 0 01.134-.319l7.146-7.153-.838-.839a.229.229 0 010-.323l.732-.73a.228.228 0 01.322 0z"
                                    />
                                </svg>
                                <span>{{ format100(weapon.暴击) }}</span>
                            </div>
                            <div class="flex items-center gap-1 text-xs text-base-content/70 group-hover:text-success transition-colors">
                                <svg
                                    aria-hidden="true"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 15 15"
                                    width="1em"
                                    height="1em"
                                    class="fill-current flex-none"
                                >
                                    <path
                                        d="M14 0L7.256 3.5 1.973 1.465 3.5 6.236 0 14l7.256-3.5 4.771 1.527L10.5 7.256zm-3.24 3.24L8.88 7.136 9.701 9.7l-2.564-.82-3.898 1.88 1.88-4.17-.82-2.565L7.137 5.12z"
                                        fill="currentColor"
                                    />
                                </svg>
                                <span>{{ format100(weapon.暴伤) }}</span>
                            </div>
                            <div class="flex items-center gap-1 text-xs text-base-content/70 group-hover:text-primary transition-colors">
                                <svg
                                    aria-hidden="true"
                                    width="1em"
                                    height="1em"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 15 15"
                                    class="fill-current flex-none"
                                >
                                    <path
                                        fill="currentColor"
                                        d="M8.076 8.152l-.017-.05A4.335 4.335 0 007.3 6.796a4.431 4.431 0 00-.325-.346A2.113 2.113 0 107 2.223a2.144 2.144 0 00-1.838 3.18 4.374 4.374 0 00-1.2-.168 4.42 4.42 0 00-.755.066l-.038.007C1.836-.24 10.7-1.672 10.962 4.342a3.985 3.985 0 01-2.886 3.81zm3.662-2.137a3.949 3.949 0 00-.626-.235 4.473 4.473 0 01-1.105 1.7h.031a2.113 2.113 0 11-2.113 2.113 4.09 4.09 0 00-.025-.445 3.968 3.968 0 00-1.863-2.931l-.19-.11a3.963 3.963 0 10.645 6.535c.082-.068.16-.14.236-.214L6.7 12.39a4.367 4.367 0 01-.891-1.765 2.112 2.112 0 11-.883-2.914q.1.05.189.11a2.111 2.111 0 01.942 1.49 2.159 2.159 0 01.018.28 3.963 3.963 0 105.663-3.577z"
                                    />
                                </svg>
                                <span>{{ format100(weapon.触发) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 悬停时的发光效果 -->
                    <div
                        class="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300 ring-2 ring-primary/50"
                    />
                </div>
            </div>
        </ScrollArea>
    </div>
</template>
