<script setup lang="ts">
import { computed, ref } from "vue"
import { LeveledMonsterHelper, weaponVerifyData } from "@/data"
import { getRewardDetails } from "@/utils/reward-utils"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments } from "@/utils/story-text"

const selectedLevelId = ref<number>(weaponVerifyData.levels[0]?.id || 0)
type WeaponVerifyLevel = (typeof weaponVerifyData.levels)[number]

const selectedLevel = computed<WeaponVerifyLevel | undefined>(() =>
    weaponVerifyData.levels.find(level => level.id === selectedLevelId.value)
)

const selectedAffixIds = computed(() => new Set(selectedLevel.value?.affixIds || []))

const levelGroups = computed(() => {
    const groups = new Map<number, WeaponVerifyLevel[]>()
    for (const level of weaponVerifyData.levels) {
        const group = Math.floor(level.id / 10) % 10
        if (!groups.has(group)) groups.set(group, [])
        groups.get(group)?.push(level)
    }
    return [...groups.entries()]
})

function formatTarget(level: WeaponVerifyLevel): string {
    return level.levelType === 1 ? `击败敌人，目标 ${level.winTarget}` : "击败高危敌人"
}

function getAffixName(id: number): string {
    return weaponVerifyData.affixes.find(affix => affix.id === id)?.name || `词条 ${id}`
}

function getAffixDescription(id: number): string {
    return weaponVerifyData.affixes.find(affix => affix.id === id)?.description || ""
}

function getBuffDetailSegments(id: number) {
    const description = weaponVerifyData.buffs.find(buff => buff.id === id)?.description || ""
    return parseStoryTextSegments(description, DEFAULT_STORY_TEXT_CONFIG)
}

function getRewardDetailsById(id: number) {
    return getRewardDetails(id)
}
</script>

<template>
    <section class="rounded-md border border-base-300 bg-base-200 p-3 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 class="mt-1 text-lg font-bold">{{ weaponVerifyData.event.name }}</h2>
                <p class="mt-1 text-sm text-base-content/70">{{ weaponVerifyData.event.description }}</p>
            </div>
            <div class="text-right text-xs text-base-content/60">
                <div>推荐解锁等级 Lv.{{ weaponVerifyData.event.jumpUnlockCondition }}</div>
                <div>12 个关卡 · {{ weaponVerifyData.rewards.at(-1)?.requiredStar || 0 }} 星奖励</div>
            </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
            <div class="space-y-3">
                <div v-for="[group, levels] in levelGroups" :key="group" class="space-y-2">
                    <div class="flex items-center justify-between text-xs text-base-content/60">
                        <span>{{ group === 1 ? "知其行" : group === 2 ? "观其术" : "战其道" }}</span>
                        <span>推荐等级 {{ Math.min(...levels.map(level => level.recommendedLevel)) }}+</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <button
                            v-for="level in levels"
                            :key="level.id"
                            type="button"
                            class="rounded border p-2 text-left transition-colors"
                            :class="
                                selectedLevelId === level.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-base-300 bg-base-100 hover:border-primary/60'
                            "
                            @click="selectedLevelId = level.id"
                        >
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-sm font-semibold">{{ level.number }}</span>
                                <span class="text-[0.65rem] text-base-content/60">Lv.{{ level.recommendedLevel }}</span>
                            </div>
                            <div class="mt-1 truncate text-xs text-base-content/70">{{ level.name }}</div>
                        </button>
                    </div>
                </div>
            </div>

            <div v-if="selectedLevel" class="rounded border border-base-300 bg-base-100 p-3">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <div class="text-xs text-primary">关卡 {{ selectedLevel.number }}</div>
                        <h3 class="mt-1 font-bold">{{ selectedLevel.name }}</h3>
                    </div>
                    <span class="badge badge-outline">Lv.{{ selectedLevel.recommendedLevel }}</span>
                </div>
                <p class="mt-2 text-sm text-base-content/70">{{ selectedLevel.description }}</p>
                <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div class="rounded bg-base-200 p-2">
                        <dt class="text-base-content/60">胜利目标</dt>
                        <dd class="mt-1 font-medium">{{ formatTarget(selectedLevel) }}</dd>
                    </div>
                    <div class="rounded bg-base-200 p-2">
                        <dt class="text-base-content/60">限时</dt>
                        <dd class="mt-1 font-medium">{{ selectedLevel.totalTime }} 秒</dd>
                    </div>
                    <div class="rounded bg-base-200 p-2">
                        <dt class="text-base-content/60">三星门槛</dt>
                        <dd class="mt-1 font-medium">{{ selectedLevel.goalTimes.slice(1).join(" / ") }} 秒</dd>
                    </div>
                    <div class="rounded bg-base-200 p-2">
                        <dt class="text-base-content/60">胜利模式</dt>
                        <dd class="mt-1 font-medium">{{ selectedLevel.winMode === 1 ? "首领战" : "歼灭战" }}</dd>
                    </div>
                </dl>
                <div v-if="selectedLevel.levelType === 2 && selectedLevel.dungeonMonsters.length" class="mt-3">
                    <div class="mb-2 text-xs text-base-content/60">目标敌人</div>
                    <div class="grid gap-2">
                        <DBMonsterCompactCard
                            v-for="monsterId in selectedLevel.dungeonMonsters"
                            :key="monsterId"
                            :monster="LeveledMonsterHelper.fromId(monsterId, selectedLevel.recommendedLevel)"
                        />
                    </div>
                </div>
                <div class="mt-3 space-y-2 text-xs">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-base-content/60">可用词条：</span>
                        <FullTooltip v-for="id in selectedLevel.affixIds" :key="id" side="top">
                            <span class="badge badge-primary badge-sm cursor-help">{{ getAffixName(id) }}</span>
                            <template #tooltip>
                                <div class="w-72 max-w-[calc(100vw-2rem)] space-y-2 leading-normal">
                                    <div class="flex items-center justify-between gap-3">
                                        <span class="font-semibold">{{ getAffixName(id) }}</span>
                                        <span class="badge badge-outline badge-sm">描述</span>
                                    </div>
                                    <p class="whitespace-normal text-base-content/75">{{ getAffixDescription(id) }}</p>
                                </div>
                            </template>
                        </FullTooltip>
                    </div>
                    <div>
                        <span class="text-base-content/60">挑战效果：</span>
                        <div v-for="id in selectedLevel.globalBuffIds" :key="`global-${id}`" class="mt-1 rounded bg-primary/10 px-2 py-1">
                            <template v-for="(segment, index) in getBuffDetailSegments(id)" :key="`global-${id}-${index}`">
                                <span :class="segment.tone === 'highlight' ? 'font-semibold text-primary' : ''">{{ segment.text }}</span>
                            </template>
                        </div>
                    </div>
                    <div>
                        <span class="text-base-content/60">关卡效果：</span>
                        <div v-for="id in selectedLevel.levelBuffIds" :key="`level-${id}`" class="mt-1 rounded bg-secondary/10 px-2 py-1">
                            <template v-for="(segment, index) in getBuffDetailSegments(id)" :key="`${id}-${index}`">
                                <span :class="segment.tone === 'highlight' ? 'font-semibold text-primary' : ''">{{ segment.text }}</span>
                            </template>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <details class="rounded border border-base-300 bg-base-100 p-3">
            <summary class="cursor-pointer text-sm font-semibold">词条说明与星级奖励</summary>
            <div class="mt-3 grid gap-3 lg:grid-cols-2">
                <div class="space-y-2">
                    <div
                        v-for="affix in weaponVerifyData.affixes"
                        :key="affix.id"
                        class="rounded border p-2 text-xs transition-colors"
                        :class="
                            selectedAffixIds.has(affix.id)
                                ? 'border-primary bg-primary/10 text-base-content'
                                : 'border-transparent bg-base-200 text-base-content/50'
                        "
                    >
                        <div class="font-medium">{{ affix.name }}</div>
                        <div class="mt-1 text-base-content/70">{{ affix.description }}</div>
                    </div>
                </div>
                <div class="space-y-2">
                    <div v-for="reward in weaponVerifyData.rewards" :key="reward.rewardId" class="rounded bg-base-200 p-2 text-xs">
                        <div class="mb-2 flex items-center justify-between">
                            <span class="font-medium">{{ reward.requiredStar }} 星</span>
                        </div>
                        <RewardItem :reward="getRewardDetailsById(reward.rewardId)" />
                    </div>
                    <div class="rounded bg-base-200 p-2 text-xs text-base-content/70">活动规则：{{ weaponVerifyData.event.rule }}</div>
                </div>
            </div>
        </details>
    </section>
</template>
