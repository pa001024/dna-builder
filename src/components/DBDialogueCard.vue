<script lang="ts" setup>
import { computed } from "vue"
import type { Dialogue, DialogueOption } from "@/data/d/quest.data"
import { getImprType, getRegionType } from "@/data/d/quest.data"
import { useSettingStore } from "@/store/setting"
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
}>()

const emit = defineEmits<{
    (event: "select-option", payload: { dialogueId: number; optionId: number }): void
    (event: "voice-click"): void
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
    <div class="dialogue-card p-2 rounded bg-base-200/80 space-y-1" :class="{ 'dialogue-card-playing': playing }">
        <div class="space-y-1 text-sm">
            <div class="flex items-center gap-2">
                <img
                    v-if="speakerAvatar"
                    :src="speakerAvatar"
                    :alt="speakerName || ''"
                    class="size-8 rounded object-cover bg-base-100"
                    loading="lazy"
                />

                <span v-if="speakerName" class="font-medium text-primary mr-1 min-w-0 truncate" :title="speakerName">
                    {{ speakerName }}
                </span>

                <button v-if="showVoiceButton" type="button" class="btn btn-ghost btn-xs shrink-0 ml-auto" @click="emit('voice-click')">
                    <Icon :icon="voicePlaying ? 'ri:pause-circle-line' : 'ri:play-circle-line'" />
                </button>
            </div>
            <TypewriterText :text="formatStoryText(dialogue.content)" :trigger-key="triggerKey" />
            <div v-if="getImpressionEntries(dialogue).length" class="mt-1 flex flex-wrap gap-1.5">
                <span
                    v-for="impression in getImpressionEntries(dialogue)"
                    :key="`${dialogue.id}-${impression.regionId}-${impression.typeLabel}-dialogue-impr`"
                    class="rounded border px-1.5 py-0.5 text-xs leading-none"
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
                class="group w-full rounded px-2.5 py-1.5 text-left text-xs transition-all duration-200"
                :class="selectedOption?.id === option.id ? 'bg-primary/80 shadow-sm' : 'bg-base-100/60 hover:bg-base-100/80'"
                @click="emit('select-option', { dialogueId: dialogue.id, optionId: option.id })"
            >
                <div class="flex items-start gap-2">
                    <span
                        class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold"
                        :class="
                            selectedOption?.id === option.id
                                ? 'border-primary bg-primary text-primary-content'
                                : 'border-base-300 text-base-content/70'
                        "
                    >
                        {{ optionIndex + 1 }}
                    </span>

                    <div class="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                        <span class="leading-4 text-base-content/90 whitespace-normal">
                            {{ formatStoryText(option.content) }}
                        </span>

                        <span
                            v-for="impression in getImpressionEntries(option)"
                            :key="`${option.id}-${impression.regionId}-${impression.typeLabel}-impr`"
                            class="rounded border px-1.5 py-0.5 text-xs leading-none"
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
                            class="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-xs leading-none text-info"
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

<style scoped>
.dialogue-card {
    transition:
        transform 220ms ease,
        opacity 220ms ease,
        box-shadow 220ms ease;
    box-shadow: 0 0 0 transparent;
}

.dialogue-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-base-content) 8%, transparent);
}

.dialogue-card-playing {
    border: 1px solid color-mix(in srgb, var(--color-primary) 60%, transparent);
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-base-100));
    box-shadow:
        0 0 0 1px color-mix(in srgb, var(--color-primary) 24%, transparent),
        0 10px 24px color-mix(in srgb, var(--color-primary) 18%, transparent);
}
</style>
