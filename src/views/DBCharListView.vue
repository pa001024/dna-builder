<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledChar } from "../data"
import { charMap } from "../data/d"
import charData from "../data/d/char.data"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("char.searchKeyword", "")
const selectedCharId = useSearchParam<number>("char.selectedChar", 0)
const selectedElem = useSearchParam<string>("char.selectedElem", "")
const selectedVersion = useSearchParam<string>("char.selectedVersion", "")
const selectedTag = useSearchParam<string>("char.selectedTag", "")
const selectedProficiency = useSearchParam<string>("char.selectedProficiency", "")
const selectedFaction = useSearchParam<string>("char.selectedFaction", "")

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

// 切换过滤选项显示
function toggleFilter(filterName: string, show: boolean) {
    if (!show) {
        // 取消勾选时清空对应的过滤
        if (filterName === "elem") selectedElem.value = ""
        if (filterName === "version") selectedVersion.value = ""
        if (filterName === "tag") selectedTag.value = ""
        if (filterName === "proficiency") selectedProficiency.value = ""
        if (filterName === "faction") selectedFaction.value = ""
    }
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedChar }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input v-model="searchKeyword" type="text" placeholder="搜索角色名称/别名（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />
                </div>

                <!-- 筛选条件 -->
                <div class="p-2 border-b border-base-200">
                    <!-- Checkbox 行 -->
                    <div class="flex flex-wrap gap-2 mb-2">
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" v-model="showElemFilter"
                                @change="toggleFilter('elem', showElemFilter)" class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.elem") }}</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" v-model="showVersionFilter"
                                @change="toggleFilter('version', showVersionFilter)" class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.version") }}</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" v-model="showTagFilter" @change="toggleFilter('tag', showTagFilter)"
                                class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.tag") }}</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" v-model="showProficiencyFilter"
                                @change="toggleFilter('proficiency', showProficiencyFilter)"
                                class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">{{ $t("武器精通") }}</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" v-model="showFactionFilter"
                                @change="toggleFilter('faction', showFactionFilter)" class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.faction") }}</span>
                        </label>
                    </div>

                    <!-- 元素筛选 -->
                    <div v-show="showElemFilter" class="flex flex-wrap gap-1 mb-2">
                        <button class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedElem === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedElem = ''">
                            {{ $t("全部") }}
                        </button>
                        <button v-for="elem in elems" :key="elem"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedElem === elem ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedElem = elem">
                            {{ $t(`${elem}属性`) }}
                        </button>
                    </div>

                    <!-- 版本筛选 -->
                    <div v-show="showVersionFilter" class="flex flex-wrap gap-1 mb-2">
                        <button class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedVersion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedVersion = ''">
                            {{ $t("全部") }}
                        </button>
                        <button v-for="version in versions" :key="version"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedVersion === version ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectedVersion = version">
                            {{ version }}
                        </button>
                    </div>

                    <!-- 标签筛选 -->
                    <div v-show="showTagFilter" class="flex flex-wrap gap-1 mb-2">
                        <button class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedTag === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedTag = ''">
                            {{ $t("全部") }}
                        </button>
                        <button v-for="tag in tags" :key="tag"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedTag === tag ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedTag = tag">
                            {{ tag }}
                        </button>
                    </div>

                    <!-- 武器精通筛选 -->
                    <div v-show="showProficiencyFilter" class="flex flex-wrap gap-1 mb-2">
                        <button class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all" :class="selectedProficiency === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            " @click="selectedProficiency = ''">
                            {{ $t("全部") }}
                        </button>
                        <button v-for="proficiency in proficiencies" :key="proficiency"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedProficiency === proficiency
                                ? 'bg-primary text-white'
                                : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectedProficiency = proficiency">
                            {{ proficiency }}
                        </button>
                    </div>

                    <!-- 阵营筛选 -->
                    <div v-show="showFactionFilter" class="flex flex-wrap gap-1">
                        <button class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedFaction === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedFaction = ''">
                            {{ $t("全部") }}
                        </button>
                        <button v-for="faction in factions" :key="faction"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedFaction === faction ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectedFaction = faction">
                            {{ faction }}
                        </button>
                    </div>
                </div>

                <!-- 角色列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="char in filteredChars" :key="char.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedCharId === char.id }"
                            @click="selectedCharId = char.id">
                            <div class="flex items-start justify-between">
                                <div class="flex items-center gap-2">
                                    <div class="w-10 h-10 overflow-hidden rounded-full border-2 border-base-100">
                                        <img :src="LeveledChar.url(char.icon)"
                                            class="w-full h-full object-cover object-top" />
                                    </div>
                                    <div>
                                        <div class="font-medium flex gap-2 items-center">
                                            {{ $t(char.名称) }}
                                            <span v-if="char.别名" class="text-xs opacity-70">({{ $t(char.别名) }})</span>
                                            <span class="text-xs opacity-70">ID: {{ char.id }}</span>
                                        </div>
                                        <div class="text-xs opacity-70 mt-1 flex gap-2 flex-wrap">
                                            <span>{{ $t(`${char.属性}属性`) }}</span>
                                            <span v-if="char.版本">v{{ char.版本 }}</span>
                                            <span v-for="tag in char.标签" :key="tag"
                                                class="px-1.5 py-0.5 rounded bg-base-300 text-base-content/80">
                                                {{ $t(tag) }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <div v-if="char.阵营" class="text-xs text-base-content/70 truncate">
                                        {{ $t(char.阵营) }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredChars.length }} 个角色
                </div>
            </div>
            <div v-if="selectedChar"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedCharId = 0">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedChar" class="flex-1">
                <DBCharDetailItem :char="selectedChar" />
            </ScrollArea>
        </div>
    </div>
</template>
