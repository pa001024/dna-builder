<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledChar } from "@/data"
import { getCurrentVersionLimit } from "@/data/versionGate"
import type { AbyssDungeon } from "../data/d/abyss.data"
import { abyssDungeonMap, charMap } from "../data/d/index"
import { getVersionByTime } from "../data/time.data"
import { getAbyssDungeonGroup, getAbyssDungeonLevel } from "../utils/dungeon-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedDungeonId = useSearchParam<number>("id", 0)
const selectedDungeonGroup = useSearchParam<string>("dgg", "")
const selectedVersion = useSearchParam<string>("ver", "")

// 获取选中的深渊副本对象
const selectedDungeon = computed(() => {
    return selectedDungeonId.value ? abyssDungeonMap.get(selectedDungeonId.value) || null : null
})

const allDungeons = computed(() => Array.from(abyssDungeonMap.values()))

const allDungeonGroups = computed(() => {
    const groups = new Set(allDungeons.value.map(d => getAbyssDungeonGroup(d)))
    return Array.from(groups)
})

// 获取所有可用版本
const versions = computed(() => {
    const versionSet = new Set<string>()
    allDungeons.value.forEach(dungeon => {
        const version = getVersionByTime(dungeon.st)
        if (version && isVersionAllowed(version)) {
            versionSet.add(version)
        }
    })
    return Array.from(versionSet).sort()
})

const filteredDungeons = computed(() => {
    return allDungeons.value.filter(d => {
        const matchesGroup = selectedDungeonGroup.value === "" || getAbyssDungeonGroup(d) === selectedDungeonGroup.value
        const dungeonVersion = getVersionByTime(d.st)
        const matchesVersion = selectedVersion.value === "" || dungeonVersion === selectedVersion.value
        const matchesSafeMode = !dungeonVersion || isVersionAllowed(dungeonVersion)
        const matchesKeyword =
            searchKeyword.value === "" ||
            d.id.toString().includes(searchKeyword.value) ||
            (d.cid && getCharName(d.cid).toString().includes(searchKeyword.value))
        return matchesGroup && matchesVersion && matchesSafeMode && matchesKeyword
    })
})

interface AbyssDungeonGroupItem {
    key: string
    sid?: number
    sn?: string
    cid?: number
    dungeons: AbyssDungeon[]
}

const groupedDungeons = computed<AbyssDungeonGroupItem[]>(() => {
    const groups = new Map<string, AbyssDungeonGroupItem>()

    for (const dungeon of filteredDungeons.value) {
        const groupType = getAbyssDungeonGroup(dungeon)
        const key = dungeon.sid ? `sid-${dungeon.sid}-${groupType}` : `id-${dungeon.id}`
        const existed = groups.get(key)
        if (existed) {
            existed.dungeons.push(dungeon)
            continue
        }

        groups.set(key, {
            key,
            sid: dungeon.sid,
            sn: dungeon.sn,
            cid: dungeon.cid,
            // 同赛季下保留具体类型，避免不同类型副本被错误合并。
            dungeons: [dungeon],
        })
    }

    return Array.from(groups.values())
})

function selectDungeon(dungeon: AbyssDungeon | null) {
    selectedDungeonId.value = dungeon?.id || 0
}

/**
 * 获取赛季分组的默认选中副本。
 * @param group 赛季分组
 * @returns 默认副本
 */
function getDefaultDungeonInGroup(group: AbyssDungeonGroupItem): AbyssDungeon | null {
    return group.dungeons.find(dungeon => dungeon.id === selectedDungeonId.value) || group.dungeons[0] || null
}

function getCharName(charId: number): string {
    const char = charMap.get(charId)
    return char?.名称 || `ID: ${charId}`
}

/**
 * 判断版本是否在当前安全模式允许范围内。
 * @param version 版本号
 * @returns 是否允许显示
 */
function isVersionAllowed(version: string): boolean {
    const parsedVersion = Number(version)
    if (!Number.isFinite(parsedVersion)) {
        return true
    }
    return parsedVersion <= getCurrentVersionLimit()
}

useInitialScrollToSelectedItem({
    selectedSelector: '[data-selected="true"]',
})
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
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />
                </div>

                <div class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all duration-200"
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
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
                            :class="
                                selectedDungeonGroup === group ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedDungeonGroup = group"
                        >
                            {{ $t(group) }}
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-1">
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
                            :class="selectedVersion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedVersion = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="version in versions"
                            :key="version"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
                            :class="
                                selectedVersion === version ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedVersion = version"
                        >
                            {{ version }}
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="group in groupedDungeons"
                            :key="group.key"
                            class="rounded border border-base-200 bg-base-200/60 overflow-hidden"
                            :data-selected="getDefaultDungeonInGroup(group)?.id === selectedDungeon?.id ? 'true' : 'false'"
                        >
                            <button
                                type="button"
                                class="w-full p-3 text-left transition-colors duration-200 hover:bg-base-300"
                                :class="{
                                    'bg-primary/90 text-primary-content hover:bg-primary':
                                        getDefaultDungeonInGroup(group)?.id === selectedDungeon?.id,
                                }"
                                @click="selectDungeon(getDefaultDungeonInGroup(group))"
                            >
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="font-medium flex gap-2 min-w-0">
                                            <span v-if="group.sn" class="truncate">{{ group.sn }}</span>
                                            <span v-if="group.cid" class="truncate">{{ $t(getCharName(group.cid)) }}</span>
                                            <span class="text-xs px-2 py-0.5 rounded bg-warning text-white whitespace-nowrap">
                                                {{ $t(getAbyssDungeonGroup(group.dungeons[0])) }}
                                            </span>
                                        </div>
                                        <div
                                            v-if="group.dungeons[0]?.st && group.dungeons[0]?.et"
                                            class="mt-1 text-xs text-base-content/70"
                                        >
                                            {{ new Date(group.dungeons[0].st! * 1000).toLocaleDateString() }} -
                                            {{ new Date(group.dungeons[0].et! * 1000).toLocaleDateString() }}
                                            <span v-if="getVersionByTime(group.dungeons[0].st)" class="ml-2"
                                                >v{{ getVersionByTime(group.dungeons[0].st) }}</span
                                            >
                                        </div>
                                    </div>
                                    <div class="flex flex-col items-end gap-1 shrink-0">
                                        <div class="text-xs opacity-70">共 {{ group.dungeons.length }} 项</div>
                                    </div>
                                </div>
                            </button>

                            <div class="border-t border-base-300 px-3 py-2">
                                <div class="flex flex-wrap gap-1">
                                    <button
                                        v-for="dungeon in group.dungeons"
                                        :key="dungeon.id"
                                        type="button"
                                        class="rounded px-2 py-1 text-xs transition-colors duration-200"
                                        :class="
                                            selectedDungeon?.id === dungeon.id
                                                ? 'bg-primary text-primary-content'
                                                : 'bg-base-100 text-base-content hover:bg-base-300'
                                        "
                                        @click="selectDungeon(dungeon)"
                                    >
                                        #{{ getAbyssDungeonLevel(dungeon) }}
                                    </button>
                                </div>
                                <div
                                    v-if="group.dungeons.some(dungeon => dungeon.mb || dungeon.buff?.length)"
                                    class="mt-2 flex items-center justify-between gap-2"
                                >
                                    <span v-if="group.dungeons[0]?.buff?.length" class="flex flex-wrap items-center gap-1">
                                        <span
                                            v-for="buff in group.dungeons[0].buff.slice(0, 3)"
                                            :key="buff.id"
                                            class="text-xs bg-base-300/20 px-1.5 py-0.5 rounded"
                                        >
                                            {{ buff.n }}
                                        </span>
                                        <span v-if="group.dungeons[0].buff.length > 3" class="text-xs opacity-70"
                                            >+{{ group.dungeons[0].buff.length - 3 }}</span
                                        >
                                    </span>
                                    <span v-if="group.dungeons[0]?.mb" class="ml-auto flex items-center gap-2">
                                        <img
                                            v-for="key in ['暗', '水', '火', '雷', '风', '光'].filter(k => group.dungeons[0].mb![k] > 0)"
                                            :key="key"
                                            :src="LeveledChar.elementUrl(key)"
                                            alt=""
                                            class="h-8 inline-block"
                                        />
                                    </span>
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

            <ScrollArea v-if="selectedDungeon" class="flex-1">
                <DBAbyssDungeonDetailItem :dungeon="selectedDungeon" />
            </ScrollArea>
        </div>
    </div>
</template>
