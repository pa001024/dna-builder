<script setup lang="ts">
import { computed, ref } from "vue"
import type { CharSettings } from "@/composables/useCharSettings"
import { CharBuild, LeveledWeapon, weaponData } from "@/data"
import type { Weapon } from "@/data/data-types"
import { getWBuffLvFromSetting } from "@/data/effectLv"
import { useInvStore } from "@/store/inv"
import { format100, format100r } from "@/util"
import { matchPinyin } from "@/utils/pinyin-utils"

const props = defineProps<{
    charBuild?: CharBuild
    melee?: number
    ranged?: number
    defaultTab?: string
    useGlobal?: boolean
    charSettings?: CharSettings
}>()

const inv = useInvStore()

/**
 * 获取武器效果等级：无配装上下文时取全局背包配置，否则取角色配装配置。
 * @param weaponId 武器 ID
 * @param elm 元素属性
 * @returns 效果等级
 */
const getWBuffLv = (weaponId: number, elm: string) =>
    props.useGlobal || !props.charSettings
        ? inv.getWBuffLv(weaponId, elm)
        : getWBuffLvFromSetting(props.charSettings.effectConfig, weaponId, elm)

const tabs = ["全部", "近战", "远程", "单手剑", "长柄", "重剑", "双刀", "鞭刃", "太刀", "手枪", "双枪", "榴炮", "霰弹枪", "突击枪", "弓"]
const activeTab = ref(props.defaultTab || tabs[0])
const searchQuery = ref("")
const selectedMelee = ref(props.melee || 0)
const selectedRanged = ref(props.ranged || 0)
const sortByIncome = ref(true)

// 武器大类颜色映射（悬停渐变）
const elementColors: Record<string, string> = {
    近战: "from-yellow-400 to-yellow-600",
    远程: "from-blue-400 to-blue-600",
}

// 武器大类悬停边框颜色（卡片悬停时以类别色强调）
const elementHoverBorders: Record<string, string> = {
    近战: "hover:border-yellow-500/70",
    远程: "hover:border-blue-500/70",
}

// 武器大类英文徽记（纯装饰，配合等宽大写徽记的造型语言）
const weaponTypeNames: Record<string, string> = {
    近战: "Melee",
    远程: "Ranged",
}

/**
 * 过滤后的武器列表：先按分类方章过滤，再按关键词（中文/拼音）过滤。
 */
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

/**
 * 按收益排序后的展示列表；无配装上下文或未开启收益排序时保持原顺序。
 */
const displayedWeapons = computed(() => {
    const charBuild = props.charBuild
    if (!charBuild || !sortByIncome.value) {
        return filteredWeapons.value
    }

    return [...filteredWeapons.value]
        .map(weapon => {
            const effectLv = getWBuffLv(weapon.id, charBuild.char.属性)
            const income = charBuild.calcIncome(new LeveledWeapon(weapon, undefined, undefined, effectLv)) || 0
            return { weapon, income }
        })
        .sort((a, b) => b.income - a.income)
        .map(item => item.weapon)
})

/**
 * 计算卡片入场动画的延迟时间，按序错开浮现。
 * @param index 武器下标
 * @returns 延迟毫秒数（封顶 500ms）
 */
const getAnimationDelay = (index: number) => {
    return Math.min(index * 50, 500)
}

/**
 * 判断武器是否处于选中状态（近战/远程分别对照对应武器槽位）。
 * @param weapon 武器数据
 * @returns 是否已选中
 */
function isSelected(weapon: Weapon) {
    return weapon.类型[0] === "近战" ? selectedMelee.value === weapon.id : selectedRanged.value === weapon.id
}

const emits = defineEmits<{
    change: [melee: number, ranged: number]
}>()

/**
 * 选中武器：按大类写入对应槽位并回传。
 * @param weapon 被点击的武器
 */
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
    <div class="flex h-full flex-col overflow-hidden">
        <ScrollArea class="flex-1">
            <div class="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 md:px-6 lg:px-8">
                <!-- 检索带：下划线搜索 + 计数 + 排序开关 + 分类方章 -->
                <section
                    class="animate-ef-rise border-b border-base-content/15 py-6 motion-reduce:animate-none"
                    style="animation-delay: 0.06s"
                >
                    <div class="flex flex-col gap-4">
                        <div class="flex flex-wrap items-center gap-3">
                            <!-- 下划线搜索框 -->
                            <div class="relative min-w-0 flex-1">
                                <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                                <input
                                    v-model="searchQuery"
                                    type="text"
                                    :placeholder="$t('weapon-list.searchPlaceholder')"
                                    class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                                />
                                <span
                                    class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                                >
                                    {{ filteredWeapons.length }}
                                </span>
                            </div>

                            <!-- 收益排序开关方章 -->
                            <button
                                type="button"
                                class="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-xs border px-2 text-[11px] transition-colors duration-150"
                                :class="
                                    sortByIncome
                                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                                        : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                                "
                                @click="sortByIncome = !sortByIncome"
                            >
                                <Icon icon="ri:sort-number-asc" class="h-3.5 w-3.5" />
                                {{ sortByIncome ? $t("weapon-list.sortByIncome") : $t("weapon-list.defaultOrder") }}
                            </button>
                        </div>

                        <!-- 分类方章 -->
                        <ScrollArea :vertical="false" horizontal>
                            <div class="flex gap-2 pb-1">
                                <button
                                    v-for="tab in tabs"
                                    :key="tab"
                                    type="button"
                                    class="shrink-0 cursor-pointer whitespace-nowrap border px-3.5 py-1.5 text-xs transition-colors duration-200 active:scale-[0.97]"
                                    :class="
                                        activeTab === tab
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    @click="activeTab = tab"
                                >
                                    {{ $t(tab) }}
                                </button>
                            </div>
                        </ScrollArea>
                    </div>
                </section>

                <!-- 武器索引 -->
                <main class="flex-1 py-6 md:py-8">
                    <div
                        v-if="displayedWeapons.length === 0"
                        class="flex flex-col items-center justify-center py-24 text-base-content/50 animate-ef-rise motion-reduce:animate-none"
                        style="animation-delay: 0.12s"
                    >
                        <Icon icon="ri:emotion-sad-line" class="mb-5 h-14 w-14 opacity-40" />
                        <p class="text-base">{{ $t("weapon-list.noResults") }}</p>
                    </div>

                    <div
                        v-else
                        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,140px),1fr))] gap-4 md:grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))]"
                    >
                        <div
                            v-for="(weapon, index) in displayedWeapons"
                            :key="weapon.id"
                            class="animate-ef-rise group relative flex cursor-pointer flex-col overflow-hidden border backdrop-blur-sm [transition:transform_0.3s_cubic-bezier(0.22,1,0.36,1),box-shadow_0.3s_ease,border-color_0.2s_ease] hover:-translate-y-1 hover:[box-shadow:0_16px_40px_-16px_color-mix(in_srgb,var(--color-base-content)_22%,transparent)] active:scale-[0.985] motion-reduce:animate-none"
                            :class="[
                                isSelected(weapon) ? 'border-primary/70 bg-primary/10' : 'border-base-content/15 bg-base-100/50',
                                isSelected(weapon) ? '' : elementHoverBorders[weapon.类型[0]] || '',
                            ]"
                            :style="{ animationDelay: `${getAnimationDelay(index)}ms` }"
                            @click="selectWeapon(weapon as Weapon)"
                        >
                            <!-- 武器类型色条：悬停时显现 -->
                            <div
                                class="absolute inset-x-0 top-0 z-10 h-0.5 bg-linear-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                                :class="elementColors[weapon.类型[0]] || 'from-gray-400 to-gray-600'"
                            />

                            <!-- 武器立绘 -->
                            <div class="relative aspect-square overflow-hidden bg-base-200">
                                <ImageFallback
                                    :src="LeveledWeapon.url(weapon.icon)"
                                    :alt="weapon.名称"
                                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    loading="lazy"
                                >
                                    <Icon icon="ri:sword-line" class="h-full w-full opacity-50" />
                                </ImageFallback>

                                <!-- 幽灵序号 + 类型徽记 -->
                                <span
                                    class="absolute left-2 top-2 z-10 bg-base-100/55 px-[0.35rem] py-[0.15rem] text-2xl font-black leading-none tracking-[-0.02em] tabular-nums text-base-content/60 backdrop-blur-[2px] transition-colors duration-200 group-hover:text-primary/75"
                                >
                                    {{ String(index + 1).padStart(2, "0") }}
                                </span>
                                <span
                                    v-if="weaponTypeNames[weapon.类型[0]]"
                                    class="absolute right-2 top-2 z-10 bg-base-100/55 px-[0.45rem] py-[0.2rem] font-mono text-[9px] uppercase tracking-[0.25em] text-base-content/55 backdrop-blur-[2px] transition-colors duration-200 group-hover:text-primary"
                                >
                                    {{ weaponTypeNames[weapon.类型[0]] }}
                                </span>

                                <!-- 悬停遮罩 -->
                                <div class="absolute inset-0 bg-black/0 transition-all duration-300 group-hover:bg-black/20" />
                            </div>

                            <!-- 武器信息 -->
                            <div class="flex flex-1 flex-col gap-2 p-3.5">
                                <!-- 名称 -->
                                <h3
                                    class="flex items-center gap-2 text-base font-bold transition-colors duration-200 group-hover:text-primary"
                                >
                                    <img
                                        :src="LeveledWeapon.typeUrl(weapon.类型[1])"
                                        :alt="weapon.类型[1]"
                                        class="h-8 w-4 shrink-0 object-cover pointer-events-none"
                                    />
                                    <span class="truncate">{{ $t(weapon.名称) }}</span>
                                </h3>

                                <!-- 伤害类型 + 熔炼：元信息行 -->
                                <p
                                    class="flex min-h-5 items-center justify-between gap-2 text-[0.625rem] tracking-wide text-base-content/40"
                                >
                                    <span v-if="weapon.伤害类型" class="truncate">{{ $t(weapon.伤害类型) }}</span>
                                    <span v-if="weapon.熔炼" class="shrink-0 truncate">{{ $t(weapon.熔炼[5]) }}</span>
                                </p>

                                <!-- 配装收益 -->
                                <div v-if="charBuild" class="flex items-center gap-1.5 text-xs">
                                    <Icon icon="ri:bar-chart-line" class="h-3.5 w-3.5 shrink-0 text-primary/80" />
                                    <span class="text-base-content/50">{{ $t("weapon-list.income") }}:</span>
                                    <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                        {{
                                            format100r(
                                                charBuild.calcIncome(
                                                    new LeveledWeapon(
                                                        weapon,
                                                        undefined,
                                                        undefined,
                                                        getWBuffLv(weapon.id, charBuild.char.属性)
                                                    )
                                                )
                                            )
                                        }}
                                    </span>
                                </div>

                                <!-- 底部属性条 -->
                                <div class="mt-auto grid grid-cols-3 gap-1 border-t border-base-content/10 pt-2">
                                    <div
                                        class="flex min-w-0 items-center gap-1.5 text-xs text-base-content/70 transition-colors duration-200 group-hover:text-warning"
                                    >
                                        <Icon icon="ri:crosshair-line" class="h-3.5 w-3.5 shrink-0" />
                                        <span class="truncate tabular-nums">{{ format100(weapon.暴击) }}</span>
                                    </div>
                                    <div
                                        class="flex min-w-0 items-center gap-1.5 text-xs text-base-content/70 transition-colors duration-200 group-hover:text-success"
                                    >
                                        <Icon icon="ri:flashlight-line" class="h-3.5 w-3.5 shrink-0" />
                                        <span class="truncate tabular-nums">{{ format100(weapon.暴伤) }}</span>
                                    </div>
                                    <div
                                        class="flex min-w-0 items-center gap-1.5 text-xs text-base-content/70 transition-colors duration-200 group-hover:text-primary"
                                    >
                                        <Icon icon="ri:fire-line" class="h-3.5 w-3.5 shrink-0" />
                                        <span class="truncate tabular-nums">{{ format100(weapon.触发) }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- 选中主色竖条 -->
                            <div
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="isSelected(weapon) ? 'opacity-100' : 'opacity-0'"
                            />
                        </div>
                    </div>
                </main>

                <!-- 统计页脚：幽灵大数字 + 分类徽记 -->
                <footer
                    class="animate-ef-rise flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-t border-base-content/15 py-5 motion-reduce:animate-none"
                    style="animation-delay: 0.3s"
                >
                    <div class="flex items-baseline gap-3">
                        <span
                            class="text-[clamp(2rem,4vw,2.75rem)] font-black leading-[0.95] tracking-[-0.03em] tabular-nums text-base-content/18"
                        >
                            {{ displayedWeapons.length }}
                        </span>
                        <span class="text-xs text-base-content/45">{{ $t("weapon-list.title") }}</span>
                    </div>
                    <div class="flex flex-col items-end gap-1.5">
                        <span
                            v-if="activeTab !== '全部'"
                            class="border border-primary/60 px-2 py-[0.15rem] text-[10px] tracking-[0.2em] text-primary"
                        >
                            {{ $t(activeTab) }}
                        </span>
                        <p v-if="charBuild" class="text-[10px] tracking-wide text-base-content/40">
                            {{ sortByIncome ? $t("weapon-list.sortByIncome") : $t("weapon-list.defaultOrder") }}
                        </p>
                    </div>
                </footer>
            </div>
        </ScrollArea>
    </div>
</template>
