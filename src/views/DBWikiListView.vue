<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type WikiEntry, wikiData } from "@/data/d/wiki.data"
import { useSettingStore } from "@/store/setting"
import { matchPinyin } from "@/utils/pinyin-utils"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

/** 百科里的一个条目：把「大类 → 子类 → 条目」三层摊平成列表可用的扁平结构 */
export interface WikiListEntry {
    mainTypeId: number
    mainTypeName: string
    mainTypeIcon?: string
    subTypeId: number
    subTypeName: string
    entry: WikiEntry
}

/** 列表中的一个子类分组（同一大类下一组条目的容器） */
export interface WikiGroup {
    subTypeId: number
    subTypeName: string
    entries: WikiListEntry[]
}

const { gt } = useGameText()
const settingStore = useSettingStore()

/** 剧情文本替换配置：条目标题里的占位符（如 `{性别2：少年|少女}`）按主角名与性别代入 */
const storyTextConfig = computed<StoryTextConfig>(() => ({
    nickname: settingStore.protagonistName1?.trim() || "维塔",
    nickname2: settingStore.protagonistName2?.trim() || "墨斯",
    gender: settingStore.protagonistGender,
    gender2: settingStore.protagonistGender2,
}))

/**
 * 翻译游戏原文并代入剧情占位符。
 * @param text 游戏原文（可含 `{nickname}` / `{性别：…}` 占位符）
 * @returns 当前语言下可展示的文本
 */
function formatEntryTitle(text: string | undefined): string {
    return replaceStoryPlaceholders(gt(text), storyTextConfig.value)
}

const searchKeyword = useSearchParam<string>("kw", "")
const selectedEntryId = useSearchParam<number>("id", 0)
const selectedMainTypeId = useSearchParam<number>("tab", 0)

/** 全量条目（按大类 → 子类 → 条目的顺序摊平） */
const allEntries = computed<WikiListEntry[]>(() => {
    const list: WikiListEntry[] = []

    for (const mainType of wikiData) {
        for (const subType of mainType.subTypes) {
            for (const entry of subType.entries) {
                list.push({
                    mainTypeId: mainType.id,
                    mainTypeName: mainType.name,
                    mainTypeIcon: mainType.icon,
                    subTypeId: subType.id,
                    subTypeName: subType.name,
                    entry,
                })
            }
        }
    }

    return list
})

/** 大类筛选项（全部 + 各大类） */
const mainTypeOptions = computed(() => wikiData.map(mainType => ({ id: mainType.id, name: mainType.name, icon: mainType.icon })))

/** 按关键词与大类筛选条目 */
const filteredEntries = computed(() => {
    return allEntries.value.filter(entry => {
        if (selectedMainTypeId.value && entry.mainTypeId !== selectedMainTypeId.value) {
            return false
        }

        return matchesWikiKeyword(entry, searchKeyword.value.trim())
    })
})

/** 命中条目按子类分组（保留数据里的先后顺序） */
const groupedEntries = computed<WikiGroup[]>(() => {
    const groups = new Map<number, WikiGroup>()

    for (const entry of filteredEntries.value) {
        let group = groups.get(entry.subTypeId)

        if (!group) {
            group = { subTypeId: entry.subTypeId, subTypeName: entry.subTypeName, entries: [] }
            groups.set(entry.subTypeId, group)
        }

        group.entries.push(entry)
    }

    return [...groups.values()]
})

/** 当前选中的百科条目 */
const selectedEntry = computed(() => {
    return selectedEntryId.value ? allEntries.value.find(entry => entry.entry.id === selectedEntryId.value) || null : null
})

/**
 * 判断百科条目是否命中关键词。
 * @param entry 百科条目
 * @param keyword 关键词
 * @returns 是否命中
 */
function matchesWikiKeyword(entry: WikiListEntry, keyword: string): boolean {
    if (keyword === "") {
        return true
    }

    const { entry: wikiEntry, mainTypeName, subTypeName } = entry

    if (
        `${wikiEntry.id}`.includes(keyword) ||
        wikiEntry.title.includes(keyword) ||
        mainTypeName.includes(keyword) ||
        subTypeName.includes(keyword)
    ) {
        return true
    }

    if (matchPinyin(wikiEntry.title, keyword).match || matchPinyin(subTypeName, keyword).match || matchPinyin(mainTypeName, keyword).match) {
        return true
    }

    return wikiEntry.texts.some(text => {
        if (`${text.id}`.includes(keyword) || text.text.includes(keyword)) {
            return true
        }

        return matchPinyin(text.text, keyword).match
    })
}

/**
 * 选中百科条目。
 * @param entry 百科条目
 */
function selectEntry(entry: WikiListEntry | null): void {
    selectedEntryId.value = entry?.entry.id || 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbw-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 3" :detail-open="Boolean(selectedEntry)" @collapse="selectEntry(null)">
            <template #master>
                <!-- 左侧列表面板 -->
                <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedEntry }">
                    <!-- 检索带：下划线搜索 + 计数 -->
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <div class="relative">
                            <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                            <input
                                v-model="searchKeyword"
                                type="text"
                                :placeholder="$t('wiki-list.searchPlaceholder')"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                            />
                            <span
                                class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                            >
                                {{ filteredEntries.length }}
                            </span>
                        </div>
                    </div>

                    <!-- 筛选带：大类方章（带页签图标） -->
                    <div class="flex-none border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">CATEGORY</span>
                            <button
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedMainTypeId === 0
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedMainTypeId = 0"
                            >
                                {{ $t("wiki-list.allCategories") }}
                            </button>
                            <button
                                v-for="tab in mainTypeOptions"
                                :key="tab.id"
                                class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedMainTypeId === tab.id
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedMainTypeId = tab.id"
                            >
                                <img v-if="tab.icon" :src="`/imgs/webp/${tab.icon}.webp`" :alt="gt(tab.name)" class="h-3.5 w-3.5 object-contain" />
                                {{ gt(tab.name) }}
                            </button>
                        </div>
                    </div>

                    <!-- 条目列表：按子类分组 -->
                    <ScrollArea class="flex-1">
                        <div class="space-y-4 p-3">
                            <section v-for="group in groupedEntries" :key="group.subTypeId" class="space-y-2">
                                <!-- 子类章节头 -->
                                <div class="flex items-center gap-2 px-1">
                                    <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">SUBTYPE</span>
                                    <span class="text-xs font-semibold tracking-wide text-base-content/70">{{ gt(group.subTypeName) }}</span>
                                    <span class="h-px flex-1 bg-base-content/15" aria-hidden="true" />
                                    <span class="font-mono text-[10px] tabular-nums text-base-content/40">{{ group.entries.length }}</span>
                                </div>

                                <article
                                    v-for="(entry, index) in group.entries"
                                    :key="entry.entry.id"
                                    class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                    :class="
                                        selectedEntryId === entry.entry.id
                                            ? 'dbw-item-active border-primary/70 bg-primary/10'
                                            : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                    "
                                    :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                    @click="selectEntry(entry)"
                                >
                                    <span
                                        class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                        :class="selectedEntryId === entry.entry.id ? 'opacity-100' : 'opacity-0'"
                                        aria-hidden="true"
                                    />
                                    <div class="flex items-center gap-3 p-3">
                                        <div class="min-w-0 flex-1">
                                            <div
                                                class="text-sm font-medium leading-tight whitespace-normal wrap-break-word transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedEntryId === entry.entry.id }"
                                            >
                                                {{ formatEntryTitle(entry.entry.title) }}
                                            </div>
                                            <div class="mt-1 truncate text-[11px] text-base-content/50">{{ gt(entry.mainTypeName) }}</div>
                                        </div>
                                        <div class="flex shrink-0 flex-col items-end gap-1">
                                            <span class="font-mono text-[10px] tabular-nums text-base-content/40">x{{ entry.entry.texts.length }}</span>
                                            <span
                                                v-if="entry.entry.related?.length"
                                                class="rounded-xs border border-secondary/30 bg-secondary/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-secondary"
                                            >
                                                ↔{{ entry.entry.related.length }}
                                            </span>
                                        </div>
                                    </div>
                                </article>
                            </section>

                            <!-- 空结果 -->
                            <p v-if="filteredEntries.length === 0" class="px-1 py-8 text-center text-xs text-base-content/50">
                                {{ $t("wiki-list.emptyResult") }}
                            </p>
                        </div>
                    </ScrollArea>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("wiki-list.totalCount", { count: filteredEntries.length }) }}
                        </p>
                    </div>
                </div>
            </template>

            <template #detail>
                <!-- 右侧详情面板 -->
                <ScrollArea v-if="selectedEntry" class="min-h-0 min-w-0 flex-2">
                    <DBWikiDetailItem :key="selectedEntryId" :entry="selectedEntry" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>