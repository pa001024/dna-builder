<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { RouteLocationRaw } from "vue-router"
import DBQuestStoryNodes from "@/components/DBQuestStoryNodes.vue"
import RewardItem from "@/components/RewardItem.vue"
import SubRegionLink from "@/components/SubRegionLink.vue"
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
 * 生成坐标跳转到本地地图的路由。
 */
const questMapLink = computed<RouteLocationRaw>(() => {
    return {
        name: "map-local",
        query: {
            regionId: String(props.quest.regionId),
            subRegionId: String(props.quest.subRegionId),
            pointName: props.quest.name,
            pointX: String(props.quest.pos[0]),
            pointY: String(props.quest.pos[1]),
            pointIcon: DYN_QUEST_TYPE_ICON_MAP[props.quest.type],
        },
    }
})

/**
 * 获取动态委托类型图标地址。
 * @returns 图标地址
 */
const questTypeIconUrl = computed(() => `/imgs/res/${DYN_QUEST_TYPE_ICON_MAP[props.quest.type]}.webp`)
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-start gap-3">
            <img
                :src="questTypeIconUrl"
                :alt="getDynQuestTypeLabel(quest.type)"
                class="size-14 rounded-lg bg-base-200 object-cover shrink-0"
                loading="lazy"
            />
            <div class="min-w-0 flex-1">
                <SRouterLink :to="`/db/dynquest/${quest.id}`" class="text-lg font-bold link link-primary wrap-break-word">
                    {{ formatStoryText(quest.name) }}
                </SRouterLink>
                <div class="text-sm text-base-content/70 mt-1">ID: {{ quest.id }} | {{ getDynQuestTypeLabel(quest.type) }}</div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">委托信息</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">区域</span>
                    <span>{{ getRegionInfo(quest.regionId).name }}</span>
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">子区域</span>
                    <SubRegionLink :sub-region-id="quest.subRegionId" />
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">冷却</span>
                    <span>{{ quest.cd }}s</span>
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">人数</span>
                    <span>{{ quest.person }}</span>
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">稀有度</span>
                    <span>{{ quest.rarity }}</span>
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">权重</span>
                    <span>{{ quest.weight }}</span>
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">坐标</span>
                    <div class="flex items-center gap-2">
                        <span>{{ quest.pos[0] }}, {{ quest.pos[1] }}</span>
                        <SRouterLink :to="questMapLink" class="link link-primary">跳转</SRouterLink>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="questLevelGroups.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">等级档位</h3>
            <div class="tabs tabs-box mb-3 overflow-x-auto">
                <button
                    v-for="group in questLevelGroups"
                    :key="group.key"
                    type="button"
                    class="tab whitespace-nowrap"
                    :class="{ 'tab-active': activeQuestLevelGroupKey === group.key }"
                    @click="activeQuestLevelGroupKey = group.key"
                >
                    {{ group.label }}
                </button>
            </div>
            <div v-if="activeQuestLevelGroup" class="space-y-3">
                <div v-for="level in activeQuestLevelGroup.levels" :key="level.id" class="rounded bg-base-200 p-3 space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="font-medium">{{ formatDynQuestLevelRange(level) }}</span>
                        <span class="text-xs text-base-content/70">ID {{ level.id }}</span>
                    </div>
                    <div class="text-xs text-base-content/80">需求: {{ formatDynQuestDemand(level.demand) }}</div>
                    <div class="space-y-2">
                        <div v-for="rewardId in level.reward" :key="`${level.id}-${rewardId}`" class="pl-2">
                            <RewardItem v-if="getRewardDetails(rewardId)" :reward="getRewardDetails(rewardId)!" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="questNodes.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">剧情节点 ({{ questNodes.length }}个)</h3>
            <DBQuestStoryNodes :quest-id="quest.id" :nodes="questNodes" :start-ids="quest.startIds" />
        </div>
    </div>
</template>
