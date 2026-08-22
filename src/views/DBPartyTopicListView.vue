<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { charMap } from "@/data"
import type { PartyTopic } from "@/data/d/partytopic.data"
import { questChainMap } from "@/data/d/questchain.data"
import { getLocalizedPartyTopicDataByLanguage } from "@/data/d/story-locale"
import { useSettingStore } from "@/store/setting"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedPartyTopicId = useSearchParam<number>("id", 0)
const selectedCharacterId = useSearchParam<string>("chr", "-")
const settingStore = useSettingStore()
const localizedPartyTopicData = ref<PartyTopic[]>([])

/**
 * 异步加载当前语言光阴集数据，并忽略过期请求结果。
 * @param language 设置语言代码
 */
async function loadLocalizedPartyTopicData(language: string): Promise<void> {
    const data = await getLocalizedPartyTopicDataByLanguage(language)
    if (settingStore.lang !== language) {
        return
    }
    localizedPartyTopicData.value = data
}

watch(
    () => settingStore.lang,
    async language => {
        await loadLocalizedPartyTopicData(language)
    },
    { immediate: true }
)

/**
 * 获取当前选中的光阴集。
 */
const selectedPartyTopic = computed(() => {
    return selectedPartyTopicId.value ? localizedPartyTopicData.value.find(topic => topic.id === selectedPartyTopicId.value) || null : null
})

/**
 * 获取当前数据集中可筛选的角色列表。
 */
const characterOptions = computed(() => {
    const uniqueCharacterIds = new Set<number>()
    for (const partyTopic of localizedPartyTopicData.value) {
        uniqueCharacterIds.add(partyTopic.charId)
    }

    return Array.from(uniqueCharacterIds)
        .map(charId => ({
            charId,
            charName: getCharacterName(charId),
        }))
        .sort((left, right) => left.charId - right.charId)
})

/**
 * 关键词和角色联合过滤后的光阴集列表。
 */
const filteredPartyTopics = computed(() => {
    return localizedPartyTopicData.value.filter(partyTopic => {
        if (selectedCharacterId.value && selectedCharacterId.value !== "-" && partyTopic.charId !== Number(selectedCharacterId.value)) {
            return false
        }

        if (!searchKeyword.value) {
            return true
        }

        const keyword = searchKeyword.value
        const charName = getCharacterName(partyTopic.charId)

        if (`${partyTopic.id}`.includes(keyword) || partyTopic.name.includes(keyword) || charName.includes(keyword)) {
            return true
        }

        return matchPinyin(partyTopic.name, keyword).match || matchPinyin(charName, keyword).match
    })
})

/**
 * 选中光阴集。
 * @param partyTopic 光阴集
 */
function selectPartyTopic(partyTopic: PartyTopic | null) {
    selectedPartyTopicId.value = partyTopic?.id || 0
}

/**
 * 获取角色名称。
 * @param charId 角色 ID
 * @returns 角色名称
 */
function getCharacterName(charId: number): string {
    const targetCharacter = charMap.get(charId)
    if (!targetCharacter) {
        return `角色 ${charId}`
    }

    for (const [key, value] of charMap.entries()) {
        if (typeof key === "string" && value === targetCharacter) {
            return key
        }
    }

    return `角色 ${charId}`
}

/**
 * 获取前置任务链名称。
 * @param conditionId 前置任务链 ID
 * @returns 任务链显示文本
 */
function getConditionQuestChainName(conditionId: number | undefined): string {
    if (!conditionId) {
        return "无"
    }

    const questChain = questChainMap.get(conditionId)
    return questChain ? `${questChain.name}` : `${conditionId}`
}

/**
 * 获取光阴集消耗资源总数。
 * @param partyTopic 光阴集数据
 * @returns 消耗总数
 */
function getConsumeCount(partyTopic: PartyTopic): number {
    return Object.keys(partyTopic.consume || {}).length
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbpt-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedPartyTopic }"
            >
                <!-- 检索带：下划线搜索 + 计数 + 角色筛选 -->
                <div
                    class="flex-none space-y-3 border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <!-- 下划线搜索框 -->
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索光阴集 ID/名称/角色（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredPartyTopics.length }}
                        </span>
                    </div>

                    <!-- 角色筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">角色筛选</span>
                        <Select
                            v-model="selectedCharacterId"
                            class="w-full min-w-0 flex-1 rounded-none border-b border-base-content/25 bg-transparent px-2 py-1 text-xs outline-none transition-colors duration-150 focus:border-primary"
                        >
                            <SelectItem value="-">全部角色</SelectItem>
                            <SelectItem
                                v-for="characterOption in characterOptions"
                                :key="characterOption.charId"
                                :value="characterOption.charId"
                            >
                                {{ $t(characterOption.charName) }}
                            </SelectItem>
                        </Select>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="space-y-2 p-3">
                        <article
                            v-for="(partyTopic, index) in filteredPartyTopics"
                            :key="partyTopic.id"
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                            :class="
                                selectedPartyTopicId === partyTopic.id
                                    ? 'dbpt-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectPartyTopic(partyTopic)"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedPartyTopicId === partyTopic.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="p-3">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="line-clamp-1 text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedPartyTopicId === partyTopic.id }"
                                        >
                                            {{ partyTopic.name }}
                                        </div>
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span>{{ $t(getCharacterName(partyTopic.charId)) }}</span>
                                            <span>资源 <span class="font-mono tabular-nums">{{ getConsumeCount(partyTopic) }}</span> 项</span>
                                        </div>
                                    </div>

                                    <CopyID :id="partyTopic.id" class="ml-auto shrink-0" />
                                </div>

                                <div class="mt-2 flex items-center gap-2 text-[11px] text-base-content/45">
                                    <span>前置: {{ $t(getConditionQuestChainName(partyTopic.conditionId)) }}</span>
                                </div>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-center text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredPartyTopics.length }}</b> 条光阴集
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedPartyTopic"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectPartyTopic(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <ScrollArea v-if="selectedPartyTopic" :key="selectedPartyTopic.id" class="flex-2">
                <DBPartyTopicDetailItem :key="selectedPartyTopicId" :party-topic="selectedPartyTopic" />
            </ScrollArea>
        </div>
    </div>
</template>
