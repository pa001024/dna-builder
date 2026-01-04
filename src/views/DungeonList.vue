<script lang="ts" setup>
import { ref, computed } from "vue"
import dungeonData from "../data/d/dungeon.data"
import { getDungeonType } from "../utils/dungeon-utils"

const searchKeyword = ref("")
const selectedDungeon = ref<(typeof dungeonData)[0] | null>(null)
const selectedType = ref<string>("")

// 所有副本类型
const allTypes = computed(() => {
    const types = new Set(dungeonData.map((d) => d.t))
    return Array.from(types).sort()
})

// 按类型和关键词筛选副本
const filteredDungeons = computed(() => {
    return dungeonData.filter((d) => {
        const matchesType = selectedType.value === "" || d.t === selectedType.value
        const matchesKeyword = searchKeyword.value === "" || d.n.includes(searchKeyword.value) || d.desc?.includes(searchKeyword.value)
        return matchesType && matchesKeyword
    })
})

function selectDungeon(dungeon: (typeof dungeonData)[0] | null) {
    selectedDungeon.value = dungeon
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100 text-base-content">
        <div class="flex-1 flex min-h-0">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedDungeon }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索副本名称..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- 类型筛选Tab -->
                <div class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedType = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="type in allTypes"
                            :key="type"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="
                                selectedType === type
                                    ? getDungeonType(type).color + ' text-white'
                                    : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedType = type"
                        >
                            {{ getDungeonType(type).label }}
                        </button>
                    </div>
                </div>

                <!-- 副本列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="dungeon in filteredDungeons"
                            :key="dungeon.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedDungeon?.id === dungeon.id }"
                            @click="selectDungeon(dungeon)"
                        >
                            <div class="flex items-start justify-between">
                                <div>
                                    <div class="font-medium">{{ dungeon.n }}</div>
                                    <div class="text-xs opacity-70 mt-1">{{ dungeon.desc }}</div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs px-2 py-0.5 rounded" :class="getDungeonType(dungeon.t).color + ' text-white'">
                                        {{ getDungeonType(dungeon.t).label }}
                                    </span>
                                    <span class="text-xs opacity-70">Lv.{{ dungeon.lv }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span>怪物: {{ (dungeon.m || []).length + (dungeon.sm || []).length }}个</span>
                                <span v-if="dungeon.r?.length">奖励: {{ dungeon.r.length }}组</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredDungeons.length }} 个副本
                </div>
            </div>
            <div
                v-if="selectedDungeon"
                class="flex-none flex justify-center items-center w-4 overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectDungeon(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" />
            </div>

            <!-- 右侧详情面板 -->
            <div v-if="selectedDungeon" class="flex-1 overflow-hidden">
                <DungeonDetailItem :dungeon="selectedDungeon" />
            </div>
        </div>
    </div>
</template>
