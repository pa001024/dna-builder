<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { conditionsMap } from "@/data/d/condition.data"
import { wikiData } from "@/data/d/wiki.data"
import { useSettingStore } from "@/store/setting"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"
import type { WikiListEntry } from "@/views/DBWikiListView.vue"

const { gt } = useGameText()
const settingStore = useSettingStore()

const props = defineProps<{
    entry: WikiListEntry
}>()

/** 剧情文本替换配置：标题与正文里的占位符（如 `{性别2：少年|少女}`）按主角名与性别代入 */
const storyTextConfig = computed<StoryTextConfig>(() => ({
    nickname: settingStore.protagonistName1?.trim() || "维塔",
    nickname2: settingStore.protagonistName2?.trim() || "墨斯",
    gender: settingStore.protagonistGender,
    gender2: settingStore.protagonistGender2,
}))

/**
 * 翻译游戏原文并代入剧情占位符。
 * @param text 游戏原文（可含 `{nickname}` / `{性别：…}` 占位符）
 * @returns 当前语言下可展示的文本
 */
function formatText(text: string | undefined): string {
    return replaceStoryPlaceholders(gt(text), storyTextConfig.value)
}

/**
 * 全量条目索引（条目 id → 标题）：用于把 related 里的裸 id 解析成可跳转的关联条目，
 * 在模块作用域只建一次，避免每个详情实例重复遍历。
 */
const entryTitleMap = new Map<number, string>()
for (const mainType of wikiData) {
    for (const subType of mainType.subTypes) {
        for (const entry of subType.entries) {
            entryTitleMap.set(entry.id, entry.title)
        }
    }
}

/** 关联条目：related 存的是同表条目 id，解析标题后渲染成跳转链接 */
const relatedEntries = computed(() => (props.entry.entry.related ?? []).map(id => ({ id, title: entryTitleMap.get(id) })))

/** 条目配图地址（img 已是完整 T_Encyclopedia_* 贴图名） */
const imageUrl = computed(() => (props.entry.entry.img ? `/imgs/webp/${props.entry.entry.img}.webp` : ""))
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 百科档案头：纸面 + primary 强调线 -->
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
            <div class="relative flex items-start gap-3.5">
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Wiki Entry
                    </p>
                    <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/wiki/${entry.entry.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ formatText(entry.entry.title) }}
                        </SRouterLink>
                        <CopyID :id="entry.entry.id" />
                    </div>
                </div>
            </div>
        </header>

        <!-- 条目配图：游戏内的宽幅横幅（4:1），锁幅居中、避免拉伸失真 -->
        <figure v-if="imageUrl" class="mx-auto w-full max-w-160">
            <div class="relative overflow-hidden rounded-xs border border-base-content/15 bg-base-100/60 p-1.5 backdrop-blur-sm">
                <span class="pointer-events-none absolute top-0.5 left-0.5 h-3 w-3 border-t-2 border-l-2 border-primary/45" aria-hidden="true" />
                <span class="pointer-events-none absolute top-0.5 right-0.5 h-3 w-3 border-t-2 border-r-2 border-primary/45" aria-hidden="true" />
                <span class="pointer-events-none absolute bottom-0.5 left-0.5 h-3 w-3 border-b-2 border-l-2 border-primary/45" aria-hidden="true" />
                <span class="pointer-events-none absolute bottom-0.5 right-0.5 h-3 w-3 border-b-2 border-r-2 border-primary/45" aria-hidden="true" />
                <img :src="imageUrl" :alt="formatText(entry.entry.title)" loading="lazy" decoding="async" class="block w-full rounded-xs border border-primary/25" />
            </div>
        </figure>

        <!-- 归属信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('wiki-detail.sourceSection')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("wiki-detail.mainType") }}</span>
                    <span class="shrink-0 text-[13px] font-semibold text-primary">{{ gt(entry.mainTypeName) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("wiki-detail.subType") }}</span>
                    <span class="truncate text-[13px] font-semibold text-primary">{{ gt(entry.subTypeName) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("wiki-detail.textCount") }}</span>
                    <span class="shrink-0 font-mono text-[13px] font-semibold text-primary">{{ entry.entry.texts.length }}</span>
                </div>
            </div>
        </section>

        <!-- 关联条目：点击跳转对应条目详情页 -->
        <section v-if="relatedEntries.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="RELATED" :title="$t('wiki-detail.relatedSection')" />
            <div class="flex flex-wrap gap-1.5">
                <SRouterLink
                    v-for="related in relatedEntries"
                    :key="related.id"
                    :to="`/db/wiki/${related.id}`"
                    class="inline-flex items-center gap-1.5 rounded-xs border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-xs text-secondary transition-colors duration-150 hover:border-secondary hover:bg-secondary/20"
                >
                    <Icon icon="ri:arrow-right-up-line" class="h-3.5 w-3.5" />
                    <span class="font-medium">{{ related.title ? formatText(related.title) : `#${related.id}` }}</span>
                </SRouterLink>
            </div>
        </section>

        <!-- 正文段落 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ENTRIES" :title="$t('wiki-detail.texts')" />
            <p v-if="entry.entry.texts.length === 0" class="text-xs text-base-content/50">{{ $t("wiki-detail.emptyTexts") }}</p>
            <div v-else class="space-y-2.5">
                <article
                    v-for="text in entry.entry.texts"
                    :key="text.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="mb-1.5 flex flex-wrap items-center gap-2">
                        <CopyID :id="text.id" />
                        <CopyID
                            v-for="dialogueId in text.dialogues ?? []"
                            :key="dialogueId"
                            :id="dialogueId"
                            :name="$t('wiki-detail.triggerDialogue')"
                        />
                    </div>
                    <p class="whitespace-pre-wrap text-[13px] leading-relaxed text-base-content/80">{{ formatText(text.text) }}</p>

                    <!-- 该段正文的解锁条件 -->
                    <div v-if="text.unlock && conditionsMap[text.unlock]" class="mt-2">
                        <ConditionItem :condition="conditionsMap[text.unlock]" />
                    </div>
                </article>
            </div>
        </section>
    </div>
</template>