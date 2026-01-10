<script lang="ts" setup>
import { ref, computed } from "vue"
import { abyssDungeonMap, charMap } from "../data/d/index"
import type { AbyssDungeon } from "../data/d/abyss.data"
import { getAbyssDungeonGroup, getAbyssDungeonLevel } from "../utils/dungeon-utils"

const searchKeyword = ref("")
const selectedDungeon = ref<AbyssDungeon | null>(null)
const selectedDungeonGroup = ref<string>("")

const allDungeons = computed(() => Array.from(abyssDungeonMap.values()))

const allDungeonGroups = computed(() => {
    const groups = new Set(allDungeons.value.map(d => getAbyssDungeonGroup(d)))
    return Array.from(groups)
})

const filteredDungeons = computed(() => {
    return allDungeons.value.filter(d => {
        const matchesGroup = selectedDungeonGroup.value === "" || getAbyssDungeonGroup(d) === selectedDungeonGroup.value
        const matchesKeyword =
            searchKeyword.value === "" ||
            d.id.toString().includes(searchKeyword.value) ||
            (d.cid && getCharName(d.cid).toString().includes(searchKeyword.value))
        return matchesGroup && matchesKeyword
    })
})

function selectDungeon(dungeon: AbyssDungeon | null) {
    selectedDungeon.value = dungeon
}

function getCharName(charId: number): string {
    const char = charMap.get(charId)
    return char?.名称 || `ID: ${charId}`
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedDungeon }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索副本ID或角色名称..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <div class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="
                                selectedDungeonGroup === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedDungeonGroup = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="group in allDungeonGroups"
                            :key="group"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="
                                selectedDungeonGroup === group ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedDungeonGroup = group"
                        >
                            {{ $t(group) }}
                        </button>
                    </div>
                </div>

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
                                    <div class="font-medium flex gap-2">
                                        <span v-if="dungeon.sn">{{ dungeon.sn }}</span>
                                        <span v-if="dungeon.cid">{{ $t(getCharName(dungeon.cid)) }}</span>
                                        #{{ getAbyssDungeonLevel(dungeon) }}
                                    </div>
                                    <div v-if="dungeon.st && dungeon.et" class="mt-1 text-xs text-base-content/70">
                                        {{ new Date(dungeon.st * 1000).toLocaleDateString() }} -
                                        {{ new Date(dungeon.et * 1000).toLocaleDateString() }}
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <div class="text-xs opacity-70 ml-4">ID: {{ dungeon.id }}</div>
                                    <span class="text-xs px-2 py-0.5 rounded bg-warning text-white whitespace-nowrap">{{
                                        $t(getAbyssDungeonGroup(dungeon))
                                    }}</span>
                                    <span v-if="dungeon.mb" class="flex items-center gap-2">
                                        <img
                                            v-for="key in ['暗', '水', '火', '雷', '风', '光'].filter(k => dungeon.mb![k] > 0)"
                                            :key="key"
                                            :src="`/imgs/${key}.png`"
                                            alt=""
                                            class="h-8 inline-block"
                                        />
                                    </span>
                                </div>
                            </div>

                            <div v-if="dungeon.buff?.length" class="mt-2">
                                <div class="flex flex-wrap gap-1">
                                    <span
                                        v-for="buff in dungeon.buff.slice(0, 3)"
                                        :key="buff.id"
                                        class="text-xs bg-base-300/20 px-1.5 py-0.5 rounded"
                                    >
                                        {{ buff.n }}
                                    </span>
                                    <span v-if="dungeon.buff.length > 3" class="text-xs opacity-70">+{{ dungeon.buff.length - 3 }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredDungeons.length }} 个深渊
                </div>
            </div>
            <div
                v-if="selectedDungeon"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectDungeon(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <div v-if="selectedDungeon" class="flex-1 overflow-hidden">
                <DBAbyssDungeonDetailItem :dungeon="selectedDungeon" />
            </div>
        </div>
    </div>
</template>
