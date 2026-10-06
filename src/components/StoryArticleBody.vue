<script setup lang="ts">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { useSettingStore } from "@/store/setting"
import { splitReaderParagraphs } from "@/utils/reader-paragraphs"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments, type StoryTextConfig, type StoryTextSegment } from "@/utils/story-text"

const props = withDefaults(
    defineProps<{
        text?: string
        paragraphGap?: string
        unwrapLines?: boolean
    }>(),
    {
        paragraphGap: "space-y-7",
        unwrapLines: false,
    }
)

const { gt } = useGameText()
const settingStore = useSettingStore()

const storyTextConfig = computed<StoryTextConfig>(() => ({
    nickname: settingStore.protagonistName1?.trim() || DEFAULT_STORY_TEXT_CONFIG.nickname,
    nickname2: settingStore.protagonistName2?.trim() || DEFAULT_STORY_TEXT_CONFIG.nickname2,
    gender: settingStore.protagonistGender,
    gender2: settingStore.protagonistGender2,
}))

const paragraphs = computed<StoryTextSegment[][]>(() =>
    splitReaderParagraphs(gt(props.text), { unwrapLines: props.unwrapLines }).map(paragraph =>
        parseStoryTextSegments(paragraph, storyTextConfig.value)
    )
)

function getToneClass(tone: StoryTextSegment["tone"]): string {
    if (tone === "highlight") return "text-primary font-semibold"
    if (tone === "warning") return "text-error font-semibold"
    if (tone === "title") return "text-base-content font-semibold"
    return ""
}
</script>

<template>
    <div :class="paragraphGap">
        <p
            v-for="(segments, paragraphIndex) in paragraphs"
            :key="paragraphIndex"
            class="wrap-break-word"
            :class="unwrapLines ? 'whitespace-normal' : 'whitespace-pre-wrap'"
        >
            <span v-for="(segment, segmentIndex) in segments" :key="segmentIndex" :class="getToneClass(segment.tone)">
                {{ segment.text }}
            </span>
        </p>
    </div>
</template>
