<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledMod, LeveledWeaponHelper, modMap, resourceMap, weaponMap } from "@/data"
import walnutData, { Walnut } from "@/data/d/walnut.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedWalnutId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<number>("tp", 0)

// 根据 ID 获取选中的密函
const selectedWalnut = computed(() => {
    return selectedWalnutId.value ? walnutData.find(walnut => walnut.id === selectedWalnutId.value) || null : null
})

// 所有密函类型
const allTypes = computed(() => {
    const types = new Set(walnutData.map(w => w.类型))
    return Array.from(types).sort()
})

// 按类型和关键词筛选密函
const filteredWalnuts = computed(() => {
    return walnutData.filter(w => {
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
})

function selectWalnut(walnut: Walnut | null) {
    selectedWalnutId.value = walnut?.id || 0
}

/**
 * 获取密函列表首个产物的图标。
 * @param walnut 密函数据
 * @returns 图标地址
 */
function getWalnutProductIcon(walnut: Walnut): string {
    const reward = walnut.奖励[0]
    if (!reward) {
        return "/imgs/webp/T_Head_Empty.webp"
    }

    if (reward.type === "Mod") {
        return LeveledMod.url(modMap.get(reward.id)?.icon)
    }

    if (reward.type === "Weapon") {
        return LeveledWeaponHelper.idToUrl(weaponMap.get(reward.id)?.id ?? reward.id)
    }

    if (reward.type === "Resource") {
        const resource = resourceMap.get(reward.id)
        return resource?.icon ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }

    return "/imgs/webp/T_Head_Empty.webp"
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbwal-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedWalnut }"
            >
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索密函ID/名称（支持拼音）..."
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
                            全部
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
                            {{ $t(type === 1 ? "角色" : type === 2 ? "武器" : "魔之楔") }}
                        </button>
                    </div>
                </div>

                <!-- 密函列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3 space-y-2">
                        <article
                            v-for="(walnut, index) in filteredWalnuts"
                            :key="walnut.id"
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                            :class="
                                selectedWalnutId === walnut.id
                                    ? 'dbwal-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectWalnut(walnut)"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedWalnutId === walnut.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex items-start gap-3 p-3">
                                <img
                                    :src="getWalnutProductIcon(walnut)"
                                    :alt="walnut.名称"
                                    class="size-10 shrink-0 rounded-xs object-cover"
                                />
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-baseline gap-2">
                                        <h3
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedWalnutId === walnut.id }"
                                        >
                                            {{ $t(walnut.名称) }}
                                        </h3>
                                        <CopyID :id="walnut.id" class="ml-auto shrink-0" />
                                    </div>
                                    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                        <span>稀有度: {{ walnut.稀有度 }}星</span>
                                    </div>
                                </div>
                                <span
                                    class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 tracking-wide text-base-content/55"
                                >
                                    {{ $t(walnut.类型 === 1 ? "角色" : walnut.类型 === 2 ? "武器" : "魔之楔") }}
                                </span>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredWalnuts.length }}</b> 个密函
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedWalnut"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectWalnut(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedWalnut" class="min-w-0 flex-2">
                <DBWalnutDetailItem :key="selectedWalnutId" :walnut="selectedWalnut" />
            </ScrollArea>
        </div>
    </div>
</template>
