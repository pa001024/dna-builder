<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import type { Ref } from "vue"
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledChar } from "@/data"
import { charMap } from "@/data/d"
import charData from "@/data/d/char.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedCharId = useSearchParam<number>("id", 0)
const selectedElem = useSearchParam<string>("el", "")
const selectedVersion = useSearchParam<string>("ver", "")
const selectedTag = useSearchParam<string>("tag", "")
const selectedProficiency = useSearchParam<string>("prof", "")
const selectedFaction = useSearchParam<string>("fac", "")

// 根据 ID 获取选中的角色
const selectedChar = computed(() => {
    return selectedCharId.value ? charMap.get(selectedCharId.value) || null : null
})

// 过滤选项显示控制
const showElemFilter = useLocalStorage("char.showElemFilter", false)
const showVersionFilter = useLocalStorage("char.showVersionFilter", false)
const showTagFilter = useLocalStorage("char.showTagFilter", false)
const showProficiencyFilter = useLocalStorage("char.showProficiencyFilter", false)
const showFactionFilter = useLocalStorage("char.showFactionFilter", false)

/**
 * 过滤器名称。
 */
type FilterName = "elem" | "version" | "tag" | "proficiency" | "faction"

/** 各过滤器的显示状态注册表（localStorage 持久化）。 */
const filterVisibility: Record<FilterName, Ref<boolean>> = {
    elem: showElemFilter,
    version: showVersionFilter,
    tag: showTagFilter,
    proficiency: showProficiencyFilter,
    faction: showFactionFilter,
}

/** 各过滤器当前选中值的注册表（路由参数持久化）。 */
const filterValues: Record<FilterName, Ref<string>> = {
    elem: selectedElem,
    version: selectedVersion,
    tag: selectedTag,
    proficiency: selectedProficiency,
    faction: selectedFaction,
}

/** 过滤器开关的展示顺序与 i18n 标签键。 */
const filterLabels: Record<FilterName, string> = {
    elem: "char-build.elem",
    version: "char-build.version",
    tag: "char-build.tag",
    proficiency: "武器精通",
    faction: "char-build.faction",
}

/**
 * 切换过滤行显示状态；收起时清空对应筛选值，避免隐藏后筛选仍生效。
 * @param name 过滤器名称
 */
function toggleFilterRow(name: FilterName) {
    const visible = filterVisibility[name]
    if (visible.value) {
        filterValues[name].value = ""
    }
    visible.value = !visible.value
}

// 是否有任一过滤行处于展开状态（控制过滤区整体显隐）
const hasVisibleFilterRow = computed(() => Object.values(filterVisibility).some(ref => ref.value))

// 获取所有可用元素
const elems = ["火", "水", "雷", "风", "暗", "光"]

// 获取所有可用版本
const versions = computed(() => {
    const versionSet = new Set<string>()
    charData.forEach(char => {
        if (char.版本) {
            versionSet.add(char.版本)
        }
    })
    return Array.from(versionSet).sort()
})

// 获取所有可用标签
const tags = computed(() => {
    const tagSet = new Set<string>()
    charData.forEach(char => {
        char.标签?.forEach(tag => {
            tagSet.add(tag)
        })
    })
    return Array.from(tagSet).sort()
})

// 获取所有可用武器精通
const proficiencies = computed(() => {
    const proficiencySet = new Set<string>()
    charData.forEach(char => {
        char.精通?.forEach(proficiency => {
            proficiencySet.add(proficiency)
        })
    })
    return Array.from(proficiencySet).sort()
})

// 获取所有可用阵营
const factions = computed(() => {
    const factionSet = new Set<string>()
    charData.forEach(char => {
        if (char.阵营) {
            factionSet.add(char.阵营)
        }
    })
    return Array.from(factionSet).sort()
})

// 过滤角色列表
const filteredChars = computed(() => {
    return charData.filter(char => {
        // 搜索筛选
        let matchKeyword = false
        if (searchKeyword.value === "") {
            matchKeyword = true
        } else {
            const q = searchKeyword.value
            // 直接中文匹配
            if (char.名称.includes(q)) {
                matchKeyword = true
            } else {
                // 拼音匹配（全拼/首字母）
                const nameMatch = matchPinyin(char.名称, q).match
                if (nameMatch) {
                    matchKeyword = true
                } else {
                    // 尝试匹配别名
                    const aliasMatch = char.别名 && matchPinyin(char.别名, q).match
                    matchKeyword = Boolean(aliasMatch)
                }
            }
        }

        const matchElem = selectedElem.value === "" || char.属性 === selectedElem.value
        const matchVersion = selectedVersion.value === "" || char.版本 === selectedVersion.value
        const matchTag = selectedTag.value === "" || char.标签?.includes(selectedTag.value)
        const matchProficiency = selectedProficiency.value === "" || char.精通?.includes(selectedProficiency.value)
        const matchFaction = selectedFaction.value === "" || char.阵营 === selectedFaction.value
        return matchKeyword && matchElem && matchVersion && matchTag && matchProficiency && matchFaction
    })
})

useInitialScrollToSelectedItem({ selectedSelector: ".dbc-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedChar }"
            >
                <!-- 检索带：下划线搜索 + 计数 + 过滤器开关方章 -->
                <div
                    class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索角色名称/别名（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredChars.length }}
                        </span>
                    </div>

                    <!-- 过滤器开关方章 -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        <button
                            v-for="(label, name) in filterLabels"
                            :key="name"
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                filterVisibility[name].value
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow(name)"
                        >
                            {{ $t(label) }}
                        </button>
                    </div>
                </div>

                <!-- 筛选条件 -->
                <div
                    v-show="hasVisibleFilterRow"
                    class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise"
                    style="animation-delay: 0.05s"
                >
                    <!-- 元素筛选 -->
                    <div v-show="showElemFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.elem") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedElem === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedElem = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="elem in elems"
                            :key="elem"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedElem === elem
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedElem = elem"
                        >
                            {{ $t(`${elem}属性`) }}
                        </button>
                    </div>

                    <!-- 版本筛选 -->
                    <div v-show="showVersionFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.version") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedVersion === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedVersion = ''"
                        >
                            {{ $t("全部") }}
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

                    <!-- 标签筛选 -->
                    <div v-show="showTagFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.tag") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedTag === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedTag = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="tag in tags"
                            :key="tag"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedTag === tag
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedTag = tag"
                        >
                            {{ $t(tag) }}
                        </button>
                    </div>

                    <!-- 武器精通筛选 -->
                    <div v-show="showProficiencyFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("武器精通") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedProficiency === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedProficiency = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="proficiency in proficiencies"
                            :key="proficiency"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedProficiency === proficiency
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedProficiency = proficiency"
                        >
                            {{ $t(proficiency) }}
                        </button>
                    </div>

                    <!-- 阵营筛选 -->
                    <div v-show="showFactionFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.faction") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedFaction === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedFaction = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="faction in factions"
                            :key="faction"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedFaction === faction
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedFaction = faction"
                        >
                            {{ $t(faction) }}
                        </button>
                    </div>
                </div>

                <!-- 角色列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <!-- 空状态 -->
                        <div v-if="filteredChars.length === 0" class="flex flex-col items-center justify-center py-20 text-base-content/45">
                            <Icon icon="ri:user-search-line" class="mb-4 h-12 w-12 opacity-40" />
                            <p class="text-sm">未找到匹配的角色</p>
                        </div>

                        <div v-else class="space-y-2">
                            <article
                                v-for="(char, index) in filteredChars"
                                :key="char.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedCharId === char.id
                                        ? 'dbc-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectedCharId = char.id"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedCharId === char.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <!-- 角色头像（稀有度渐变底） -->
                                    <div class="size-12 shrink-0 overflow-hidden rounded-xs bg-linear-15" :class="getRarityGradientClass(5)">
                                        <img
                                            :src="LeveledChar.url(char.icon)"
                                            :alt="$t(char.名称)"
                                            class="h-full w-full object-cover object-top"
                                        />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行：名称 + 别名 + 幽灵 ID -->
                                        <div class="flex items-baseline gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedCharId === char.id }"
                                            >
                                                {{ $t(char.名称) }}
                                            </h3>
                                            <span v-if="char.别名" class="truncate text-[11px] text-base-content/45">
                                                ({{ $t(char.别名) }})
                                            </span>
                                            <CopyID :id="char.id" class="ml-auto shrink-0" />
                                        </div>
                                        <!-- 元信息行：元素 / 版本 / 标签 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span class="inline-flex items-center gap-1">
                                                <img
                                                    :src="LeveledChar.elementUrl(char.属性)"
                                                    :alt="$t(`${char.属性}属性`)"
                                                    class="h-4 w-2 object-cover"
                                                />
                                                {{ $t(`${char.属性}属性`) }}
                                            </span>
                                            <span v-if="char.版本" class="font-mono tabular-nums">v{{ char.版本 }}</span>
                                            <span
                                                v-for="tag in char.标签"
                                                :key="tag"
                                                class="rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 tracking-wide text-base-content/55"
                                            >
                                                {{ $t(`tag.${tag}`, $t(tag)) }}
                                            </span>
                                        </div>
                                    </div>
                                    <!-- 阵营 -->
                                    <div v-if="char.阵营" class="shrink-0 text-right text-[11px] leading-5 text-base-content/45">
                                        {{ $t(char.阵营) }}
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredChars.length }}</b> 个角色
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedChar"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectedCharId = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedChar" class="min-w-0 flex-1">
                <DBCharDetailItem :key="selectedCharId" :char="selectedChar" />
            </ScrollArea>
        </div>
    </div>
</template>

