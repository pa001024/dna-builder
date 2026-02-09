<script lang="ts" setup>
import { useSessionStorage } from "@vueuse/core"
import { computed } from "vue"
import titleData from "@/data/d/title.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSessionStorage<string>("title.searchKeyword", "")
const selectedTitleId = useSessionStorage<number>("title.selectedTitle", 0)
const selectedType = useSessionStorage<number>("title.selectedType", 0)

const selectedTitle = computed(() => {
    if (!selectedTitleId.value) return null
    return titleData.find(title => title.id === selectedTitleId.value) || null
})

const filteredTitles = computed(() => {
    return titleData.filter(title => {
        const matchesType = selectedType.value === 0 || (selectedType.value === 1 ? !title.suf : title.suf)

        if (searchKeyword.value === "") {
            return matchesType
        }

        const keyword = searchKeyword.value
        const idMatch = `${title.id}`.includes(keyword)
        const nameMatch = title.name.includes(keyword) || matchPinyin(title.name, keyword).match
        const srcText = title.src || ""
        const srcMatch = srcText.includes(keyword) || matchPinyin(srcText, keyword).match

        return matchesType && (idMatch || nameMatch || srcMatch)
    })
})

function selectTitle(id: number | null) {
    selectedTitleId.value = id || 0
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedTitle }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索称号ID/名称/来源（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

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
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 1 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedType = 1"
                        >
                            前缀
                        </button>
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 2 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedType = 2"
                        >
                            后缀
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="title in filteredTitles"
                            :key="title.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedTitleId === title.id }"
                            @click="selectTitle(title.id)"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div>
                                    <div class="font-medium">{{ title.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">ID: {{ title.id }}</div>
                                </div>
                                <span class="text-xs px-2 py-0.5 rounded" :class="title.suf ? 'bg-secondary text-secondary-content' : 'bg-accent text-accent-content'">
                                    {{ title.suf ? "后缀" : "前缀" }}
                                </span>
                            </div>
                            <p class="text-xs opacity-70 mt-2 line-clamp-2 break-all">{{ title.src || "暂无来源说明" }}</p>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">共 {{ filteredTitles.length }} 个称号</div>
            </div>

            <div
                v-if="selectedTitle"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectTitle(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedTitle" class="flex-1">
                <DBTitleDetailItem :title="selectedTitle" />
            </ScrollArea>
        </div>
    </div>
</template>
