<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledChar } from "@/data"
import type { AbyssDungeon } from "@/data/d/abyss.data"
import { abyssDungeonMap, charMap } from "@/data/d/index"
import { getVersionByTime } from "@/data/time.data"
import { getCurrentVersionLimit } from "@/data/versionGate"
import { getAbyssDungeonGroup, getAbyssDungeonLevel } from "@/utils/dungeon-utils"

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
    selectedSelector: ".dbab-item-active",
})
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedDungeon }">
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索副本ID或角色名称..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredDungeons.length }}
                        </span>
                    </div>
                </div>

                <!-- 筛选条件 -->
                <div class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                    <!-- 赛季分组筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">赛季</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedDungeonGroup === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedDungeonGroup = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="group in allDungeonGroups"
                            :key="group"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedDungeonGroup === group
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedDungeonGroup = group"
                        >
                            {{ $t(group) }}
                        </button>
                    </div>

                    <!-- 版本筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">版本</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedVersion === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedVersion = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="version in versions"
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

                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <!-- 空状态 -->
                        <div
                            v-if="filteredDungeons.length === 0"
                            class="flex flex-col items-center justify-center py-20 text-base-content/45"
                        >
                            <p class="text-sm">未找到匹配的深渊副本</p>
                        </div>

                        <div v-else class="space-y-2">
                            <article
                                v-for="(group, index) in groupedDungeons"
                                :key="group.key"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    getDefaultDungeonInGroup(group)?.id === selectedDungeon?.id
                                        ? 'dbab-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectDungeon(getDefaultDungeonInGroup(group))"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="getDefaultDungeonInGroup(group)?.id === selectedDungeon?.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="p-3">
                                    <div class="flex items-start justify-between gap-3">
                                        <div class="min-w-0">
                                            <div class="flex items-baseline gap-2">
                                                <h3
                                                    class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                    :class="{ 'text-primary': getDefaultDungeonInGroup(group)?.id === selectedDungeon?.id }"
                                                >
                                                    <span v-if="group.sn">{{ group.sn }}</span>
                                                    <span v-if="group.cid"> - {{ $t(getCharName(group.cid)) }}</span>
                                                </h3>
                                                <span
                                                    class="shrink-0 rounded-xs bg-warning px-1.5 py-0.5 text-[10px] leading-4 tracking-wide text-warning-content whitespace-nowrap"
                                                >
                                                    {{ $t(getAbyssDungeonGroup(group.dungeons[0])) }}
                                                </span>
                                            </div>
                                            <div
                                                v-if="group.dungeons[0]?.st && group.dungeons[0]?.et"
                                                class="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-base-content/55"
                                            >
                                                <span class="font-mono tabular-nums">
                                                    {{ new Date(group.dungeons[0].st! * 1000).toLocaleDateString() }} -
                                                    {{ new Date(group.dungeons[0].et! * 1000).toLocaleDateString() }}
                                                </span>
                                                <span v-if="getVersionByTime(group.dungeons[0].st)" class="font-mono tabular-nums">
                                                    v{{ getVersionByTime(group.dungeons[0].st) }}
                                                </span>
                                            </div>
                                        </div>
                                        <div class="shrink-0 text-[11px] tabular-nums text-base-content/50">
                                            共 <span class="font-mono">{{ group.dungeons.length }}</span> 项
                                        </div>
                                    </div>
                                </div>

                                <div class="border-t border-base-content/10 px-3 py-2">
                                    <div class="flex flex-wrap gap-1">
                                        <button
                                            v-for="dungeon in group.dungeons"
                                            :key="dungeon.id"
                                            type="button"
                                            class="cursor-pointer rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                                            :class="
                                                selectedDungeon?.id === dungeon.id
                                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                            "
                                            @click.stop="selectDungeon(dungeon)"
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
                                                class="rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 tracking-wide text-base-content/55"
                                            >
                                                {{ buff.n }}
                                            </span>
                                            <span
                                                v-if="group.dungeons[0].buff.length > 3"
                                                class="font-mono text-[10px] tabular-nums text-base-content/40"
                                                >+{{ group.dungeons[0].buff.length - 3 }}</span
                                            >
                                        </span>
                                        <span v-if="group.dungeons[0]?.mb" class="ml-auto flex items-center gap-2">
                                            <img
                                                v-for="key in ['暗', '水', '火', '雷', '风', '光'].filter(
                                                    k => group.dungeons[0].mb![k] > 0
                                                )"
                                                :key="key"
                                                :src="LeveledChar.elementUrl(key)"
                                                alt=""
                                                class="h-8 w-4 inline-block rounded-xs object-cover"
                                            />
                                        </span>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredDungeons.length }}</b> 个深渊
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedDungeon"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectDungeon(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedDungeon" class="min-w-0 flex-1">
                <DBAbyssDungeonDetailItem :key="selectedDungeonId" :dungeon="selectedDungeon" />
            </ScrollArea>
        </div>
    </div>
</template>
