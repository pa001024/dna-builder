<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { monsterMap } from "@/data"
import { type HardBoss, hardBossMap } from "../data/d/hardboss.data"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("hardboss.searchKeyword", "")
const selectedBossId = useSearchParam<number>("hardboss.selectedBoss", 0)

// 根据 ID 获取选中的 Boss
const selectedBoss = computed(() => {
    return selectedBossId.value ? hardBossMap.get(selectedBossId.value) || null : null
})

// 按关键词筛选Boss
const filteredBosses = computed(() => {
    return Array.from(hardBossMap.values()).filter((boss: HardBoss) => {
        if (searchKeyword.value === "") {
            return true
        } else {
            const q = searchKeyword.value
            const monster = monsterMap.get(boss.mid)
            const monsterName = monster ? monster.n : ""
            // 直接匹配（ID、名称、描述）
            if (`${boss.id}`.includes(q) || boss.name.includes(q) || boss.desc?.includes(q) || monsterName.includes(q)) {
                return true
            } else {
                // 拼音匹配（名称、描述）
                const nameMatch = matchPinyin(boss.name, q).match
                if (nameMatch) {
                    return true
                }
                if (boss.desc && matchPinyin(boss.desc, q).match) {
                    return true
                }
                if (monsterName && matchPinyin(monsterName, q).match) {
                    return true
                }
            }
        }
        return false
    })
})

function selectBoss(boss: HardBoss | null) {
    selectedBossId.value = boss?.id || 0
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedBoss }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input v-model="searchKeyword" type="text" placeholder="搜索梦魇残声 ID/名称/描述/怪物名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />
                </div>

                <!-- Boss列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="boss in filteredBosses" :key="boss.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedBossId === boss.id }"
                            @click="selectBoss(boss)">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="font-medium">{{ boss.name }}</div>
                                    <div class="text-xs opacity-70 mt-1 line-clamp-2">
                                        {{ boss.desc }}
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1 ml-2">
                                    <span class="text-xs px-2 py-0.5 rounded bg-primary text-white"> {{ boss.diff.length
                                    }} 个难度 </span>
                                    <span class="text-xs opacity-70">ID: {{ boss.id }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span>等级范围: Lv.{{ boss.diff[0]?.lv }} - Lv.{{ boss.diff[boss.diff.length - 1]?.lv
                                }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredBosses.length }} 个梦魇残声
                </div>
            </div>
            <div v-if="selectedBoss"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectBoss(null)">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedBoss" class="flex-1">
                <DBHardbossDetailItem :boss="selectedBoss" />
            </ScrollArea>
        </div>
    </div>
</template>
