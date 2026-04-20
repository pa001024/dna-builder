<script lang="ts" setup>
import { computed, reactive } from "vue"
import DBDialogueCard from "@/components/DBDialogueCard.vue"
import type { NPC } from "@/data/d/npc.data"
import type { Dialogue, DialogueOption } from "@/data/d/quest.data"
import { useSettingStore } from "@/store/setting"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

const props = defineProps<{
    npc: NPC
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

const selectedOptionMap = reactive<Record<string, number>>({})

/**
 * 生成 NPC 分支状态作用域键。
 * @param npcId NPC ID
 * @returns 作用域键
 */
function getNPCScopeKey(npcId: number): string {
    return `npc-${npcId}`
}

/**
 * 生成选项状态键。
 * @param scopeKey 分支作用域键
 * @param dialogueId 对话 ID
 * @returns 状态键
 */
function getOptionStateKey(scopeKey: string, dialogueId: number): string {
    return `${scopeKey}-${dialogueId}`
}

/**
 * 读取当前对话已选选项，默认取第一个选项。
 * @param scopeKey 分支作用域键
 * @param dialogue 对话数据
 * @returns 当前选项
 */
function getSelectedOption(scopeKey: string, dialogue: Dialogue): DialogueOption | undefined {
    if (!dialogue.options?.length) {
        return undefined
    }

    const optionStateKey = getOptionStateKey(scopeKey, dialogue.id)
    const selectedOptionId = selectedOptionMap[optionStateKey] ?? dialogue.options[0].id
    return dialogue.options.find(option => option.id === selectedOptionId) ?? dialogue.options[0]
}

/**
 * 更新指定对话的选项状态。
 * @param dialogueId 对话 ID
 * @param optionId 选项 ID
 */
function selectOption(dialogueId: number, optionId: number) {
    selectedOptionMap[`${getNPCScopeKey(props.npc.id)}-${dialogueId}`] = optionId
}

/**
 * 处理对话选项变更。
 * @param dialogueId 对话 ID
 * @param optionId 选项 ID
 */
function handleSelectOption(dialogueId: number, optionId: number) {
    selectOption(dialogueId, optionId)
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-2">
            <SRouterLink :to="`/db/npc/${npc.id}`" class="text-lg font-bold link link-primary">
                {{ formatStoryText(npc.name || `NPC ${npc.id}`) }}
            </SRouterLink>
            <CopyID :id="npc.id" />
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">NPC 信息</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">ID</span>
                    <span>{{ npc.id }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">名称</span>
                    <span>{{ formatStoryText(npc.name || "未知") }}</span>
                </div>
                <div v-if="npc.camp" class="flex justify-between">
                    <span class="text-base-content/70">阵营</span>
                    <span>{{ npc.camp }}</span>
                </div>
                <div v-if="npc.type" class="flex justify-between">
                    <span class="text-base-content/70">类型</span>
                    <span>{{ npc.type }}</span>
                </div>
                <div v-if="npc.charId" class="flex justify-between">
                    <span class="text-base-content/70">角色 ID</span>
                    <span>{{ npc.charId }}</span>
                </div>
                <div v-if="npc.icon" class="flex justify-between">
                    <span class="text-base-content/70">图标</span>
                    <span>{{ npc.icon }}</span>
                </div>
                <div v-if="npc.srId" class="flex justify-between">
                    <span class="text-base-content/70">子区域</span>
                    <SubRegionLink :sub-region-id="npc.srId" />
                </div>
                <div v-if="npc.srId && npc.pos" class="flex justify-between">
                    <span class="text-base-content/70">坐标</span>
                    <MapPosLink
                        :sub-region-id="npc.srId"
                        :point="npc.pos"
                        :point-name="formatStoryText(npc.name || `NPC ${npc.id}`)"
                        :point-icon="npc.icon || 'T_Gp_MainMission'"
                    />
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3" v-if="npc.talks?.length">
            <h3 class="font-bold mb-2">分支对话 ({{ npc.talks.length }} 条)</h3>

            <TransitionGroup name="dialogue-list" tag="div" class="space-y-2">
                <DBDialogueCard
                    v-for="dialogue in npc.talks"
                    :key="dialogue.id"
                    :dialogue="dialogue"
                    :selected-option="getSelectedOption(getNPCScopeKey(npc.id), dialogue)"
                    :trigger-key="`${npc.id}-${dialogue.id}`"
                    :speaker-name="`${formatStoryText(npc.name || `NPC ${npc.id}`)}:`"
                    :speaker-avatar="npc.icon ? `/imgs/webp/T_Head_${npc.icon}.webp` : undefined"
                    :show-voice-button="false"
                    :voice-playing="false"
                    :playing="false"
                    @select-option="payload => handleSelectOption(payload.dialogueId, payload.optionId)"
                />
            </TransitionGroup>
        </div>

        <div v-else class="card bg-base-100 border border-base-200 rounded p-3 text-sm text-base-content/70">暂无可展示的对话链</div>
    </div>
</template>
