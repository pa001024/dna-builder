<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { DynQuest, DynQuestLevel } from "@/data/d/dynquest.data"
import { DYN_QUEST_TYPE_ICON_MAP, formatDynQuestDemand, formatDynQuestLevelRange, getDynQuestTypeLabel } from "@/data/d/dynquest.data"
import { regionMap } from "@/data/d/region.data"
import { useSettingStore } from "@/store/setting"
import { getRewardDetails } from "@/utils/reward-utils"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

const props = defineProps<{
    quest: DynQuest
}>()

const settingStore = useSettingStore()

/**
 * 获取当前剧情文本替换配置。
 */
const storyTextConfig = computed<StoryTextConfig>(() => {
    return {
        nickname: settingStore.protagonistName1?.trim() || "维塔",
        nickname2: settingStore.protagonistName2?.trim() || "墨斯",
        gender: settingStore.protagonistGender,
        gender2: settingStore.protagonistGender2,
    }
})

/**
 * 解析剧情文本中的占位符。
 * @param text 原始文本
 * @returns 替换后的文本
 */
function formatStoryText(text: string | undefined): string {
    if (!text) {
        return ""
    }

    return replaceStoryPlaceholders(text, storyTextConfig.value)
}

/**
 * 获取区域信息。
 * @param regionId 区域 ID
 * @returns 区域信息
 */
function getRegionInfo(regionId: number) {
    const region = regionMap.get(regionId)
    return region || { id: regionId, name: `区域${regionId}`, type: null, mapId: null }
}

/**
 * 获取动态任务剧情节点列表。
 */
const questNodes = computed(() => {
    return props.quest.nodes ?? []
})

/**
 * 等级档位分组信息。
 */
interface QuestLevelGroup {
    key: string
    label: string
    levels: DynQuestLevel[]
}

/**
 * 按等级范围去重并分组。
 * @param levels 原始等级档位
 * @returns 去重后的等级档位分组
 */
function groupQuestLevels(levels: DynQuestLevel[]): QuestLevelGroup[] {
    const grouped = new Map<string, QuestLevelGroup>()

    for (const level of levels) {
        const key = `${level.level[0]}-${level.level[1]}`
        const existingGroup = grouped.get(key)
        if (existingGroup) {
            existingGroup.levels.push(level)
            continue
        }

        grouped.set(key, {
            key,
            label: formatDynQuestLevelRange(level),
            levels: [level],
        })
    }

    return [...grouped.values()]
}

const questLevelGroups = computed(() => groupQuestLevels(props.quest.levels))
const activeQuestLevelGroupKey = ref("")

/**
 * 等级档位分组对应的 AniTabs 选项列表。
 */
const questLevelGroupTabs = computed(() => questLevelGroups.value.map(group => ({ label: group.label, value: group.key })))

/**
 * 当前选中的等级档位分组。
 */
const activeQuestLevelGroup = computed(() => {
    return questLevelGroups.value.find(group => group.key === activeQuestLevelGroupKey.value) || questLevelGroups.value[0] || null
})

/**
 * 切换任务时，重置当前选中的等级档位分组。
 */
watch(
    () => props.quest.id,
    () => {
        activeQuestLevelGroupKey.value = questLevelGroups.value[0]?.key || ""
    },
    { immediate: true }
)

/**
 * 获取动态委托类型图标地址。
 * @returns 图标地址
 */
const questTypeIconUrl = computed(() => `/imgs/res/${DYN_QUEST_TYPE_ICON_MAP[props.quest.type]}.webp`)
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 委托档案头 -->
        <header class="flex items-start gap-3.5 border-b-2 border-primary pb-4">
            <img
                :src="questTypeIconUrl"
                :alt="getDynQuestTypeLabel(quest.type)"
                class="size-14 shrink-0 rounded-xs bg-base-content/3 object-cover"
                loading="lazy"
            />
            <div class="min-w-0 flex-1">
                <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                    <span class="h-px w-6 bg-primary" aria-hidden="true" />
                    Dyn Quest
                </p>
                <SRouterLink
                    :to="`/db/dynquest/${quest.id}`"
                    class="wrap-break-word font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                >
                    {{ formatStoryText(quest.name) }}
                </SRouterLink>
                <div class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-base-content/60">
                    <CopyID :id="quest.id" />
                    <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                    <span>{{ getDynQuestTypeLabel(quest.type) }}</span>
                </div>
            </div>
        </header>

        <!-- 委托信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="INFO" title="委托信息" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">区域</span>
                    <span class="text-sm">{{ getRegionInfo(quest.regionId).name }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">子区域</span>
                    <SubRegionLink :sub-region-id="quest.subRegionId" />
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">冷却</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ quest.cd }}m</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">人数</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ quest.person }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">稀有度</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ quest.rarity }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">权重</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ quest.weight }}</span>
                </div>
                <div
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 sm:col-span-2"
                >
                    <span class="text-xs text-base-content/60">坐标</span>
                    <MapPosLink
                        :sub-region-id="quest.subRegionId"
                        :point="quest.pos"
                        :point-name="quest.name"
                        :point-icon="DYN_QUEST_TYPE_ICON_MAP[quest.type]"
                    />
                </div>
            </div>
        </section>

        <!-- 等级档位 -->
        <section v-if="questLevelGroups.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVELS" title="等级档位" :count="questLevelGroups.length" />
            <AniTabs v-model="activeQuestLevelGroupKey" :tabs="questLevelGroupTabs" />
            <div v-if="activeQuestLevelGroup" class="mt-2 space-y-3">
                <div
                    v-for="level in activeQuestLevelGroup.levels"
                    :key="level.id"
                    class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-sm font-medium">{{ formatDynQuestLevelRange(level) }}</span>
                        <span class="font-mono text-[10px] tabular-nums text-base-content/35">ID {{ level.id }}</span>
                    </div>
                    <div class="text-xs text-base-content/70">需求: {{ formatDynQuestDemand(level.demand) }}</div>
                    <div class="space-y-2">
                        <div v-for="rewardId in level.reward" :key="`${level.id}-${rewardId}`" class="pl-2">
                            <RewardItem v-if="getRewardDetails(rewardId)" :reward="getRewardDetails(rewardId)!" />
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 剧情节点 -->
        <section v-if="questNodes.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="NODES" title="剧情节点" :count="questNodes.length" />
            <DBQuestStoryNodes :quest-id="quest.id" :nodes="questNodes" :start-ids="quest.startIds" />
        </section>
    </div>
</template>
