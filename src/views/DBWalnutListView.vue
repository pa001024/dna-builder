<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledMod } from "@/data"
import walnutData, { Walnut } from "@/data/d/walnut.data"
import { formatProp } from "@/util"
import { formatModLimit } from "@/utils/mod-limit"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getWalnutProduct, getWalnutProductName } from "@/utils/walnut-product"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedWalnutId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<number>("tp", 0)

/**
 * 把密函类型（1=角色 2=武器 3=魔之楔）转成展示名。
 * 返回值是**游戏原文**，交给模板里的 `$t` 取译文。
 * @param type 密函类型
 * @returns 展示名原文
 */
function getWalnutTypeName(type: number): string {
    return type === 1 ? "角色" : type === 2 ? "武器" : "魔之楔"
}

// 根据 ID 获取选中的密函
const selectedWalnut = computed(() => {
    return selectedWalnutId.value ? walnutData.find(walnut => walnut.id === selectedWalnutId.value) || null : null
})

// 所有密函类型
const allTypes = computed(() => {
    const types = new Set(walnutData.map(w => w.类型))
    return Array.from(types).sort()
})

// 按类型和关键词筛选密函，并附上成品信息（图标 / 底色 / 属性展示用）
const filteredWalnuts = computed(() => {
    return walnutData
        .filter(w => {
            const matchesType = selectedType.value === 0 || w.类型 === selectedType.value

            let matchesKeyword = false
            if (searchKeyword.value === "") {
                matchesKeyword = true
            } else {
                const q = searchKeyword.value
                // 直接匹配（ID、名称）
                if (`${w.id}`.includes(q) || w.名称.includes(q)) {
                    matchesKeyword = true
                } else {
                    // 拼音匹配（名称）
                    matchesKeyword = matchPinyin(w.名称, q).match
                }
            }

            return matchesType && matchesKeyword
        })
        .map(w => ({ walnut: w, product: getWalnutProduct(w) }))
})

function selectWalnut(walnut: Walnut | null) {
    selectedWalnutId.value = walnut?.id || 0
}



useInitialScrollToSelectedItem({ selectedSelector: ".dbwal-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView
            :desktop-ratio="1 / 3"
            :detail-open="Boolean(selectedWalnut)"
            @collapse="selectWalnut(null)"
        >
            <template #master>

            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedWalnut }"
            >
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            :placeholder="$t('db-walnut-list.search_placeholder')"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredWalnuts.length }}
                        </span>
                    </div>
                </div>

                <!-- 类型筛选方章 -->
                <div class="flex-none border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("类型") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === 0
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 0"
                        >
                            {{ $t('common.all') }}
                        </button>
                        <button
                            v-for="type in allTypes"
                            :key="type"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === type
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = type"
                        >
                            {{ $t(getWalnutTypeName(type)) }}
                        </button>
                    </div>
                </div>

                <!-- 密函列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3 space-y-2">
                        <article
                            v-for="(item, index) in filteredWalnuts"
                            :key="item.walnut.id"
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                            :class="
                                selectedWalnutId === item.walnut.id
                                    ? 'dbwal-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectWalnut(item.walnut)"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedWalnutId === item.walnut.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex items-start gap-3 p-3">
                                <!-- 成品图标（成品品质渐变底，同魔之楔列表） -->
                                <div
                                    class="size-12 shrink-0 overflow-hidden rounded-xs bg-linear-15"
                                    :class="item.product.bg"
                                >
                                    <img
                                        :src="item.product.icon"
                                        :alt="item.walnut.名称"
                                        class="h-full w-full object-cover"
                                        :class="{ 'object-top': item.product.kind === 'Char' }"
                                    />
                                </div>
                                <div class="min-w-0 flex-1">
                                    <!-- 名称行：密函名 / ID -->
                                    <div class="flex items-baseline gap-2">
                                        <h3
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedWalnutId === item.walnut.id }"
                                        >
                                            {{ $t(item.walnut.名称) }}
                                        </h3>
                                        <CopyID :id="item.walnut.id" class="ml-auto shrink-0" />
                                    </div>
                                    <!-- 元信息行：成品名 / 类型属性 -->
                                    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                        <span class="font-medium text-base-content/75">{{ getWalnutProductName(item.product, $t) }}</span>
                                        <template v-if="item.product.mod">
                                            <span>{{ $t(item.product.mod.类型) }}</span>
                                            <span v-if="item.product.mod.属性">{{ $t(`${item.product.mod.属性}属性`) }}</span>
                                            <span v-if="item.product.mod.限定">{{ $t(formatModLimit(item.product.mod.限定)) }}</span>
                                            <span v-if="item.product.mod.版本" class="font-mono tabular-nums">v{{ item.product.mod.版本 }}</span>
                                            <span
                                                v-if="item.product.mod.极性 || item.product.mod.耐受"
                                                class="inline-flex items-center gap-1 rounded-xs border border-base-content/15 bg-base-content/3 px-1.5 py-0.5 font-mono tabular-nums"
                                            >
                                                {{ item.product.mod.耐受 }}
                                                <Icon v-if="item.product.mod.极性" :icon="`po-${item.product.mod.极性}`" />
                                            </span>
                                        </template>
                                        <template v-else-if="item.product.weapon">
                                            <span>{{ item.product.weapon.类型.map(t => $t(t)).join(", ") }}</span>
                                            <span>{{ $t(item.product.weapon.伤害类型) }}</span>
                                            <span v-if="item.product.weapon.版本" class="font-mono tabular-nums">v{{ item.product.weapon.版本 }}</span>
                                        </template>
                                        <template v-else-if="item.product.char">
                                            <span>{{ $t(`${item.product.char.属性}属性`) }}</span>
                                            <span v-if="item.product.char.阵营">{{ $t(item.product.char.阵营) }}</span>
                                            <span v-if="item.product.char.版本" class="font-mono tabular-nums">v{{ item.product.char.版本 }}</span>
                                        </template>
                                    </div>
                                    <!-- 数值行：成品属性，同魔之楔列表 -->
                                    <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-base-content/55">
                                        <template v-if="item.product.mod">
                                            <template
                                                v-for="[key, attr] in Object.entries(new LeveledMod(item.product.mod).getProperties()).filter(([_, v]) => v)"
                                                :key="key"
                                            >
                                                <span class="inline-flex items-center gap-1">
                                                    {{ $t(key) }}
                                                    <span
                                                        class="font-medium tabular-nums"
                                                        :class="{ 'text-primary': selectedWalnut?.id !== item.walnut.id }"
                                                        >{{ formatProp(key, attr) }}</span
                                                    >
                                                </span>
                                            </template>
                                            <template v-if="item.product.mod.生效">
                                                <span
                                                    v-for="key in Object.keys(item.product.mod.生效).filter(key => key !== '条件')"
                                                    :key="key"
                                                    class="inline-flex items-center gap-1"
                                                >
                                                    {{ $t(key) }}
                                                    <span
                                                        class="font-medium tabular-nums"
                                                        :class="{ 'text-primary': selectedWalnut?.id !== item.walnut.id }"
                                                        >{{ formatProp(key, item.product.mod.生效[key]) }}</span
                                                    >
                                                </span>
                                            </template>
                                        </template>
                                        <template v-else-if="item.product.weapon">
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("攻击") }}
                                                <span class="font-medium tabular-nums">{{ formatProp("基础攻击", item.product.weapon.攻击) }}</span>
                                            </span>
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("暴击") }}
                                                <span class="font-medium tabular-nums">{{ formatProp("基础暴击", item.product.weapon.暴击) }}</span>
                                            </span>
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("暴伤") }}
                                                <span class="font-medium tabular-nums">{{ formatProp("基础暴伤", item.product.weapon.暴伤) }}</span>
                                            </span>
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("触发") }}
                                                <span class="font-medium tabular-nums">{{ formatProp("基础触发", item.product.weapon.触发) }}</span>
                                            </span>
                                        </template>
                                        <template v-else-if="item.product.char">
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("攻击") }}
                                                <span class="font-medium tabular-nums">{{ item.product.char.基础攻击 }}</span>
                                            </span>
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("生命") }}
                                                <span class="font-medium tabular-nums">{{ item.product.char.基础生命 }}</span>
                                            </span>
                                            <span class="inline-flex items-center gap-1">
                                                {{ $t("防御") }}
                                                <span class="font-medium tabular-nums">{{ item.product.char.基础防御 }}</span>
                                            </span>
                                        </template>
                                    </div>
                                </div>
                                <span
                                    class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 tracking-wide text-base-content/55"
                                >
                                    {{ $t(getWalnutTypeName(item.walnut.类型)) }}
                                </span>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        {{ $t('common.total_count') }} <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredWalnuts.length }}</b> {{ $t('db-walnut-list.walnut_count') }}
                    </p>
                </div>
            </div>

                        </template>
            <template #detail>


            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedWalnut" class="min-h-0 min-w-0 flex-2">
                <DBWalnutDetailItem :key="selectedWalnutId" :walnut="selectedWalnut" />
            </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
