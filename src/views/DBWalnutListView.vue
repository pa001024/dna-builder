<script lang="ts" setup>
import { ref, computed } from "vue"
import { Walnut } from "../data/d/walnut.data"
import walnutData from "../data/d/walnut.data"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = ref("")
const selectedWalnut = ref<Walnut | null>(null)
const selectedType = ref<number>(0)

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
    selectedWalnut.value = walnut
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedWalnut }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索密函ID/名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- 类型筛选Tab -->
                <div class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 0 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedType = 0"
                        >
                            全部
                        </button>
                        <button
                            v-for="type in allTypes"
                            :key="type"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedType === type ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedType = type"
                        >
                            {{ $t(type === 1 ? "角色" : type === 2 ? "武器" : "魔之楔") }}
                        </button>
                    </div>
                </div>

                <!-- 密函列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="walnut in filteredWalnuts"
                            :key="walnut.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedWalnut?.id === walnut.id }"
                            @click="selectWalnut(walnut)"
                        >
                            <div class="flex items-start justify-between">
                                <div>
                                    <div class="font-medium">
                                        {{ walnut.名称 }}
                                    </div>
                                    <div class="text-xs opacity-70 mt-1">ID: {{ walnut.id }} | 稀有度: {{ walnut.稀有度 }}星</div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs px-2 py-0.5 rounded bg-primary text-white">
                                        {{ walnut.类型 === 1 ? "角色" : walnut.类型 === 2 ? "武器" : "魔之楔" }}
                                    </span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70 flex-wrap">
                                <span v-for="way in walnut.获取途径" :key="way" class="bg-base-300 px-2 py-0.5 rounded">
                                    {{ way }}
                                </span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredWalnuts.length }} 个密函
                </div>
            </div>
            <div
                v-if="selectedWalnut"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectWalnut(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <div v-if="selectedWalnut" class="flex-1 overflow-hidden">
                <DBWalnutDetailItem :walnut="selectedWalnut" />
            </div>
        </div>
    </div>
</template>
