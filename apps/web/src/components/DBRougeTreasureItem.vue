<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useGameText } from "@/composables/useGameText"
import { rougeLikeTreasures, rougeProTreasures } from "@/data/d/rouge.data"
import { stripStoryTextTags } from "@/utils/story-text"

const props = defineProps<{
    id: number
}>()

const route = useRoute()

/** 游戏原文取词（遗物名与简述）与界面文案取词（数据缺失时的兜底名）。 */
const { gt } = useGameText()
const { t } = useTranslation()

/**
 * 从当前迷津路由判断遗物所属模式，避免两套数据中重复 ID 产生歧义。
 */
const mode = computed(() => {
    return route.params.mode === "pro" || route.query.mode === "pro" ? "pro" : "like"
})

/**
 * 按当前模式和 ID 查找遗物数据。
 */
const treasure = computed(() => {
    const treasures = mode.value === "pro" ? rougeProTreasures : rougeLikeTreasures
    return treasures.find(item => item.id === props.id)
})

/**
 * 获取遗物图标地址。
 */
const iconUrl = computed(() => {
    const icon = treasure.value?.icon?.trim()
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
})

/**
 * 遗物展示名（游戏原文 → 当前语言，数据缺失时回退为「未知遗物 ID」）。
 */
const treasureName = computed(() => {
    return treasure.value?.name ? gt(treasure.value.name) : `${t("db-rouge-detail.unknown_treasure")} ${props.id}`
})

/**
 * 遗物简述（先翻译再剥富文本标记）。
 */
const treasureDesc = computed(() => {
    const raw = treasure.value?.simpleDesc
    return raw ? stripStoryTextTags(gt(raw)) : ""
})
</script>

<template>
    <SRouterLink
        :to="`/db/rouge/${mode}/treasure/${id}`"
        class="flex min-w-0 items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2 transition-colors duration-200 hover:border-primary/40"
    >
        <div class="size-10 shrink-0 overflow-hidden rounded-xs bg-linear-15">
            <ImageFallback :src="iconUrl" :alt="treasureName" class="size-10 object-contain">
                <img src="/imgs/webp/T_Head_Empty.webp" :alt="treasureName" class="size-10 object-contain" />
            </ImageFallback>
        </div>
        <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium">{{ treasureName }}</span>
                <span class="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-base-content/35">ID {{ id }}</span>
            </div>
            <div v-if="treasureDesc" class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-base-content/55">
                {{ treasureDesc }}
            </div>
        </div>
    </SRouterLink>
</template>
