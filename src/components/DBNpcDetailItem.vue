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
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- NPC 档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative">
                <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                    <span class="h-px w-6 bg-primary" aria-hidden="true" />
                    NPC File
                </p>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SRouterLink
                        :to="`/db/npc/${npc.id}`"
                        class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                    >
                        {{ $t(formatStoryText(npc.name || `NPC ${npc.id}`)) }}
                    </SRouterLink>
                    <CopyID :id="npc.id" />
                </div>
            </div>
        </header>

        <!-- 基本信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PROFILE" title="NPC 信息" />
            <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">ID</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ npc.id }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">名称</span>
                    <span class="truncate text-sm font-semibold text-base-content">{{ $t(formatStoryText(npc.name || "未知")) }}</span>
                </div>
                <div
                    v-if="npc.camp"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">阵营</span>
                    <span class="truncate text-sm text-base-content/85">{{ npc.camp }}</span>
                </div>
                <div
                    v-if="npc.type"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">类型</span>
                    <span class="truncate text-sm text-base-content/85">{{ npc.type }}</span>
                </div>
                <div
                    v-if="npc.charId"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">角色 ID</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ npc.charId }}</span>
                </div>
                <div
                    v-if="npc.icon"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">图标</span>
                    <span class="truncate font-mono text-[11px] tracking-wide text-base-content/70">{{ npc.icon }}</span>
                </div>
                <div
                    v-if="npc.srId"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">子区域</span>
                    <SubRegionLink :sub-region-id="npc.srId" />
                </div>
                <div
                    v-if="npc.srId && npc.pos"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">坐标</span>
                    <MapPosLink
                        :sub-region-id="npc.srId"
                        :point="npc.pos"
                        :point-name="formatStoryText(npc.name || `NPC ${npc.id}`)"
                        :point-icon="npc.icon || 'T_Gp_MainMission'"
                    />
                </div>
            </div>
        </section>

        <!-- 分支对话 -->
        <section v-if="npc.talks?.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DIALOGUE" :title="`分支对话 (${npc.talks.length} 条)`" />

            <TransitionGroup name="dialogue-list" tag="div" class="space-y-2">
                <DBDialogueCard
                    v-for="dialogue in npc.talks"
                    :key="dialogue.id"
                    :dialogue="dialogue"
                    :selected-option="getSelectedOption(getNPCScopeKey(npc.id), dialogue)"
                    :trigger-key="`${npc.id}-${dialogue.id}`"
                    :speaker-name="`${$t(formatStoryText(npc.name || `NPC ${npc.id}`))}:`"
                    :speaker-avatar="npc.icon ? `/imgs/webp/T_Head_${npc.icon}.webp` : undefined"
                    :show-voice-button="false"
                    :voice-playing="false"
                    :playing="false"
                    @select-option="payload => handleSelectOption(payload.dialogueId, payload.optionId)"
                />
            </TransitionGroup>
        </section>

        <section v-else class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 text-sm text-base-content/60 backdrop-blur-sm">
            暂无可展示的对话链
        </section>
    </div>
</template>
