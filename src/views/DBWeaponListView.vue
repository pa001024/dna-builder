<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledWeapon } from "@/data"
import weaponData from "@/data/d/weapon.data"
import { formatProp } from "@/util"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedWeaponId = useSearchParam<number>("id", 0)
const selectedCategory = useSearchParam<string>("cat", "")
const selectedDamageType = useSearchParam<string>("dt", "")
const selectedVersion = useSearchParam<string>("ver", "")

// 过滤选项显示控制
const showCategoryFilter = useLocalStorage("weapon.showCategoryFilter", false)
const showDamageTypeFilter = useLocalStorage("weapon.showDamageTypeFilter", false)
const showVersionFilter = useLocalStorage("weapon.showVersionFilter", false)

// 根据 ID 获取选中的武器
const selectedWeapon = computed(() => {
    return selectedWeaponId.value ? weaponData.find(weapon => weapon.id === selectedWeaponId.value) || null : null
})

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

// 获取所有可用版本
const versionOptions = computed(() => {
    const versionSet = new Set<string>()
    weaponData.forEach(w => {
        if (w.版本) {
            versionSet.add(w.版本)
        }
    })
    return Array.from(versionSet).sort()
})

const filteredWeapons = computed(() => {
    return weaponData.filter(w => {
        const matchCategory = selectedCategory.value === "" || w.类型.includes(selectedCategory.value)
        const matchDamageType = selectedDamageType.value === "" || w.伤害类型 === selectedDamageType.value
        const matchVersion = selectedVersion.value === "" || w.版本 === selectedVersion.value

        if (searchKeyword.value === "") {
            return matchCategory && matchDamageType && matchVersion
        }

        const query = searchKeyword.value

        // 直接中文匹配
        const directMatch = w.名称.includes(query) || w.类型.some(t => t.includes(query)) || w.伤害类型.includes(query)
        if (directMatch) {
            return matchCategory && matchDamageType && matchVersion
        }

        // 拼音匹配（全拼/首字母）
        const nameMatch = matchPinyin(w.名称, query).match
        const typeMatch = w.类型.some(t => matchPinyin(t, query).match)
        const damageMatch = matchPinyin(w.伤害类型, query).match

        const matchKeyword = nameMatch || typeMatch || damageMatch

        return matchKeyword && matchCategory && matchDamageType && matchVersion
    })
})

/**
 * 切换武器分类过滤显示状态
 * @param show 是否显示武器分类过滤
 */
function toggleCategoryFilter(show: boolean) {
    if (!show) {
        selectedCategory.value = ""
    }
}

/**
 * 切换伤害类型过滤显示状态
 * @param show 是否显示伤害类型过滤
 */
function toggleDamageTypeFilter(show: boolean) {
    if (!show) {
        selectedDamageType.value = ""
    }
}

/**
 * 切换版本过滤显示状态
 * @param show 是否显示版本过滤
 */
function toggleVersionFilter(show: boolean) {
    if (!show) {
        selectedVersion.value = ""
    }
}

/**
 * 过滤器名称。
 */
type FilterName = "category" | "damageType" | "version"

/**
 * 切换过滤行显示状态；收起时清空对应筛选值，避免隐藏后筛选仍生效。
 * @param name 过滤器名称
 */
function toggleFilterRow(name: FilterName) {
    switch (name) {
        case "category":
            showCategoryFilter.value = !showCategoryFilter.value
            toggleCategoryFilter(showCategoryFilter.value)
            break
        case "damageType":
            showDamageTypeFilter.value = !showDamageTypeFilter.value
            toggleDamageTypeFilter(showDamageTypeFilter.value)
            break
        case "version":
            showVersionFilter.value = !showVersionFilter.value
            toggleVersionFilter(showVersionFilter.value)
            break
    }
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbw-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedWeapon }"
            >
                <!-- 检索带：下划线搜索 + 计数 + 过滤器开关方章 -->
                <div
                    class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索武器名称（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredWeapons.length }}
                        </span>
                    </div>

                    <!-- 过滤器开关方章 -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showCategoryFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow('category')"
                        >
                            武器分类
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showDamageTypeFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow('damageType')"
                        >
                            伤害类型
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showVersionFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow('version')"
                        >
                            {{ $t("char-build.version") }}
                        </button>
                    </div>
                </div>

                <!-- 筛选条件 -->
                <div
                    v-show="showCategoryFilter || showDamageTypeFilter || showVersionFilter"
                    class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise"
                    style="animation-delay: 0.05s"
                >
                    <!-- 武器分类筛选 -->
                    <div v-show="showCategoryFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">武器分类</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedCategory === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedCategory = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="cat in categories"
                            :key="cat"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedCategory === cat
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedCategory = cat"
                        >
                            {{ $t(cat) }}
                        </button>
                    </div>

                    <!-- 伤害类型筛选 -->
                    <div v-show="showDamageTypeFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">伤害类型</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedDamageType === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedDamageType = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="type in damageTypes"
                            :key="type"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedDamageType === type
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedDamageType = type"
                        >
                            {{ $t(type) }}
                        </button>
                    </div>

                    <!-- 版本筛选 -->
                    <div v-show="showVersionFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">{{
                            $t("char-build.version")
                        }}</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedVersion === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedVersion = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="version in versionOptions"
                            :key="version"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedVersion === version
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedVersion = version"
                        >
                            {{ version }}
                        </button>
                    </div>
                </div>

                <!-- 武器列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <div class="space-y-2">
                            <article
                                v-for="(weapon, index) in filteredWeapons"
                                :key="weapon.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedWeaponId === weapon.id
                                        ? 'dbw-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectedWeaponId = weapon.id"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedWeaponId === weapon.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <!-- 武器图标（稀有度渐变底） -->
                                    <div class="size-12 shrink-0 overflow-hidden rounded-xs bg-linear-15" :class="getRarityGradientClass(5)">
                                        <img :src="LeveledWeapon.url(weapon.icon)" alt="武器图标" class="h-full w-full object-cover" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行：名称 + 幽灵 ID -->
                                        <div class="flex items-baseline gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedWeaponId === weapon.id }"
                                            >
                                                {{ $t(weapon.名称) }}
                                            </h3>
                                            <span class="ml-auto shrink-0"><CopyID :id="weapon.id" /></span>
                                        </div>
                                        <!-- 元信息行：分类 / 伤害类型 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span>{{ weapon.类型.map(t => $t(t)).join(", ") }}</span>
                                            <span>{{ $t(weapon.伤害类型) }}</span>
                                        </div>
                                        <!-- 数值行：攻击 / 暴击 / 暴伤 / 触发 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-base-content/55">
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("攻击") }}
                                                <span class="font-medium tabular-nums">{{ formatProp("基础攻击", weapon.攻击) }}</span>
                                            </span>
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("暴击") }}
                                                <span class="font-medium tabular-nums">{{ formatProp("基础暴击", weapon.暴击) }}</span>
                                            </span>
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("暴伤") }}
                                                <span class="font-medium tabular-nums">{{ formatProp("基础暴伤", weapon.暴伤) }}</span>
                                            </span>
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("触发") }}
                                                <span class="font-medium tabular-nums">{{ formatProp("基础触发", weapon.触发) }}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredWeapons.length }}</b> 个武器
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedWeapon"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectedWeaponId = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedWeapon" class="min-w-0 flex-1">
                <DBWeaponDetailItem :key="selectedWeaponId" :weapon="selectedWeapon" />
            </ScrollArea>
        </div>
    </div>
</template>
