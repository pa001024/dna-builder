<script lang="ts" setup>
import { computed } from "vue"
import type { Dialogue, DialogueOption } from "@/data/d/quest.data"
import { useSettingStore } from "@/store/setting"
import { getDialogueDisplayContent } from "@/utils/dialogue"
import { getImprType, getRegionType } from "@/utils/quest-utils"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

const props = defineProps<{
    dialogue: Dialogue
    triggerKey: string
    selectedOption?: DialogueOption
    speakerName?: string
    speakerAvatar?: string
    showVoiceButton?: boolean
    voicePlaying?: boolean
    playing?: boolean
    searchKeyword?: string
}>()

const emit = defineEmits<{
    (event: "select-option", payload: { dialogueId: number; optionId: number }): void
    (event: "voice-click"): void
}>()

const settingStore = useSettingStore()
const normalizedSearchKeyword = computed(() => props.searchKeyword?.trim() || "")
const dialogueContent = computed(() => getDialogueDisplayContent(props.dialogue))
const formattedDialogueContent = computed(() => formatStoryText(dialogueContent.value))

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
 * 提取条目中的印象变化条目。
 * @param entry 对话或选项条目
 * @returns 印象变化条目列表
 */
function getImpressionEntries(entry: {
    impr?: [number, Parameters<typeof getImprType>[0], number]
}): Array<{ regionId: number; typeLabel: string; value: number }> {
    if (!entry.impr) {
        return []
    }

    const [regionId, imprType, value] = entry.impr
    if (typeof value !== "number" || value === 0) {
        return []
    }

    return [
        {
            regionId,
            typeLabel: getImprType(imprType),
            value,
        },
    ]
}

/**
 * 提取选项中的印象检定条目。
 * @param option 对话选项
 * @returns 印象检定条目列表
 */
function getImpressionCheckEntries(option: DialogueOption): Array<{ regionId: number; typeLabel: string; threshold: number }> {
    if (!option.imprCheck) {
        return []
    }

    const [regionId, imprType, threshold] = option.imprCheck
    if (typeof threshold !== "number") {
        return []
    }

    return [
        {
            regionId,
            typeLabel: getImprType(imprType),
            threshold,
        },
    ]
}
</script>

<template>
    <!-- 内层小卡：hover 轻浮起；播放中切换 primary 强调态 -->
    <div
        class="space-y-1 rounded-xs border bg-base-content/3 p-2.5 transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-px hover:shadow-[0_0_6px_color-mix(in_srgb,var(--color-base-content)_8%,transparent)]"
        :class="playing ? 'border-primary/60 bg-primary/8 shadow-lg shadow-primary/20' : 'border-base-content/10'"
    >
        <div class="space-y-1 text-sm">
            <div class="flex items-center gap-2">
                <img
                    v-if="speakerAvatar"
                    :src="speakerAvatar"
                    :alt="speakerName || ''"
                    class="size-8 rounded-xs object-cover bg-base-content/6"
                    loading="lazy"
                />

                <span v-if="speakerName" class="font-medium text-primary mr-1 min-w-0 truncate" :title="speakerName">
                    {{ speakerName }}
                </span>

                <button v-if="showVoiceButton" type="button" class="btn btn-ghost btn-xs shrink-0 ml-auto" @click="emit('voice-click')">
                    <Icon :icon="voicePlaying ? 'ri:pause-circle-line' : 'ri:play-circle-line'" />
                </button>
            </div>
            <div v-if="dialogueContent" data-dialogue-content="true" class="w-full">
                <HighlightText
                    v-if="normalizedSearchKeyword"
                    :text="formattedDialogueContent"
                    :keyword="normalizedSearchKeyword"
                    class="block w-full"
                />
                <TypewriterText v-else :text="formattedDialogueContent" :trigger-key="triggerKey" />
            </div>
            <div v-if="getImpressionEntries(dialogue).length" class="mt-1 flex flex-wrap gap-1.5">
                <span
                    v-for="impression in getImpressionEntries(dialogue)"
                    :key="`${dialogue.id}-${impression.regionId}-${impression.typeLabel}-dialogue-impr`"
                    class="rounded-xs border px-1.5 py-0.5 text-xs leading-none tabular-nums"
                    :class="
                        impression.value > 0 ? 'border-success/40 bg-success/10 text-success' : 'border-error/40 bg-error/10 text-error'
                    "
                >
                    {{ $t(getRegionType(impression.regionId)) }}·{{ impression.typeLabel }}
                    {{ impression.value > 0 ? `+${impression.value}` : impression.value }}
                </span>
            </div>
        </div>

        <div v-if="dialogue.options?.length" class="space-y-2">
            <button
                v-for="(option, optionIndex) in dialogue.options"
                :key="option.id"
                type="button"
                :data-dialogue-option-id="option.id"
                class="group w-full cursor-pointer rounded-xs border px-2.5 py-1.5 text-left text-xs transition-all duration-200 active:scale-[0.99]"
                :class="
                    selectedOption?.id === option.id
                        ? 'border-primary/70 bg-primary/10'
                        : 'border-transparent bg-base-content/4 hover:border-primary/40 hover:bg-base-content/[0.07]'
                "
                @click="emit('select-option', { dialogueId: dialogue.id, optionId: option.id })"
            >
                <div class="flex items-start gap-2">
                    <span
                        class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border font-orbitron text-[9px] font-semibold tabular-nums"
                        :class="
                            selectedOption?.id === option.id
                                ? 'border-primary bg-primary text-primary-content'
                                : 'border-base-content/25 text-base-content/60'
                        "
                    >
                        {{ optionIndex + 1 }}
                    </span>

                    <div class="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                        <HighlightText
                            v-if="normalizedSearchKeyword"
                            :text="formatStoryText(option.content)"
                            :keyword="normalizedSearchKeyword"
                            class="leading-4 text-base-content/90 whitespace-normal"
                        />
                        <span v-else class="leading-4 text-base-content/90 whitespace-normal">
                            {{ formatStoryText(option.content) }}
                        </span>

                        <span
                            v-for="impression in getImpressionEntries(option)"
                            :key="`${option.id}-${impression.regionId}-${impression.typeLabel}-impr`"
                            class="rounded-xs border px-1.5 py-0.5 text-xs leading-none tabular-nums"
                            :class="
                                impression.value > 0
                                    ? 'border-success/40 bg-success/10 text-success'
                                    : 'border-error/40 bg-error/10 text-error'
                            "
                        >
                            {{ $t(getRegionType(impression.regionId)) }}·{{ impression.typeLabel }}
                            {{ impression.value > 0 ? `+${impression.value}` : impression.value }}
                        </span>

                        <span
                            v-for="impressionCheck in getImpressionCheckEntries(option)"
                            :key="`${option.id}-${impressionCheck.regionId}-${impressionCheck.typeLabel}-impr-check`"
                            class="rounded-xs border border-info/40 bg-info/10 px-1.5 py-0.5 text-xs leading-none tabular-nums text-info"
                        >
                            印象检定 {{ $t(getRegionType(impressionCheck.regionId)) }}·{{ impressionCheck.typeLabel }}
                            ≥
                            {{ impressionCheck.threshold }}
                        </span>
                    </div>
                </div>
            </button>
        </div>
    </div>
</template>
