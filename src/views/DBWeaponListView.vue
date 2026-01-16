<script lang="ts" setup>
import { computed, ref } from "vue"
import { LeveledWeapon } from "@/data"
import weaponData from "../data/d/weapon.data"
import type { Weapon } from "../data/data-types"
import { formatProp } from "../util"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = ref("")
const selectedWeapon = ref<Weapon | null>(null)
const selectedCategory = ref<string | "">("")
const selectedDamageType = ref<string | "">("")

const categories = computed(() => {
    const categorySet = new Set<string>()
    weaponData.forEach(w => {
        w.类型.forEach(t => {
            if (t !== "近战" && t !== "远程") {
                categorySet.add(t)
            }
        })
    })
    return Array.from(categorySet).sort()
})

const damageTypes = computed(() => {
    const typeSet = new Set<string>()
    weaponData.forEach(w => {
        typeSet.add(w.伤害类型)
    })
    return Array.from(typeSet).sort()
})

const filteredWeapons = computed(() => {
    return weaponData.filter(w => {
        const matchCategory = selectedCategory.value === "" || w.类型.includes(selectedCategory.value)
        const matchDamageType = selectedDamageType.value === "" || w.伤害类型 === selectedDamageType.value

        if (searchKeyword.value === "") {
            return matchCategory && matchDamageType
        }

        const query = searchKeyword.value

        // 直接中文匹配
        const directMatch = w.名称.includes(query) || w.类型.some(t => t.includes(query)) || w.伤害类型.includes(query)
        if (directMatch) {
            return matchCategory && matchDamageType
        }

        // 拼音匹配（全拼/首字母）
        const nameMatch = matchPinyin(w.名称, query).match
        const typeMatch = w.类型.some(t => matchPinyin(t, query).match)
        const damageMatch = matchPinyin(w.伤害类型, query).match

        const matchKeyword = nameMatch || typeMatch || damageMatch

        return matchKeyword && matchCategory && matchDamageType
    })
})
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedWeapon }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索武器名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <div class="p-2 border-b border-base-200 space-y-2">
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">武器分类</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="
                                    selectedCategory === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedCategory = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="cat in categories"
                                :key="cat"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="
                                    selectedCategory === cat ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedCategory = cat"
                            >
                                {{ $t(cat) }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <div class="text-xs text-base-content/70 mb-1">伤害类型</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="
                                    selectedDamageType === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedDamageType = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="type in damageTypes"
                                :key="type"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="
                                    selectedDamageType === type
                                        ? 'bg-primary text-white'
                                        : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedDamageType = type"
                            >
                                {{ $t(type) }}
                            </button>
                        </div>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="weapon in filteredWeapons"
                            :key="weapon.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedWeapon?.id === weapon.id }"
                            @click="selectedWeapon = weapon"
                        >
                            <div class="flex items-start justify-between">
                                <div class="flex">
                                    <div class="flex items-center gap-2">
                                        <img :src="LeveledWeapon.url(weapon.icon)" alt="武器图标" class="w-8 h-8 rounded" />
                                        <div>
                                            <div class="font-medium">
                                                {{ $t(weapon.名称) }}
                                            </div>
                                            <div class="text-xs opacity-70 mt-1 flex gap-2">
                                                <span>{{ weapon.类型.map(t => $t(t)).join(", ") }}</span>
                                                <span>{{ $t(weapon.伤害类型) }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="text-sm font-medium">ID: {{ weapon.id }}</div>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2 mt-2 text-xs opacity-70">
                                <div class="flex items-center gap-1">
                                    <span>{{ $t("攻击") }}</span>
                                    <span class="font-medium">{{ formatProp("基础攻击", weapon.攻击) }}</span>
                                </div>
                                <div class="flex items-center gap-1">
                                    <span>{{ $t("暴击") }}</span>
                                    <span class="font-medium">{{ formatProp("基础暴击", weapon.暴击) }}</span>
                                </div>
                                <div class="flex items-center gap-1">
                                    <span>{{ $t("暴伤") }}</span>
                                    <span class="font-medium">{{ formatProp("基础暴伤", weapon.暴伤) }}</span>
                                </div>
                                <div class="flex items-center gap-1">
                                    <span>{{ $t("触发") }}</span>
                                    <span class="font-medium">{{ formatProp("基础触发", weapon.触发) }}</span>
                                </div>
                                <div v-if="weapon.弹匣" class="flex items-center gap-1">
                                    <span>{{ $t("弹匣") }}</span>
                                    <span class="font-medium">{{ weapon.弹匣 }}</span>
                                </div>
                                <div v-if="weapon.最大弹药" class="flex items-center gap-1">
                                    <span>{{ $t("最大弹药") }}</span>
                                    <span class="font-medium">{{ weapon.最大弹药 }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredWeapons.length }} 个武器
                </div>
            </div>
            <div
                v-if="selectedWeapon"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedWeapon = null"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <div v-if="selectedWeapon" class="flex-1 overflow-hidden">
                <DBWeaponDetailItem :weapon="selectedWeapon" />
            </div>
        </div>
    </div>
</template>
