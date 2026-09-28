<script lang="ts" setup>
import { computed } from "vue"
import type { Music } from "@/data/d/music.data"
import { musicScoreData } from "@/data/d/music.data"
import { formatSequenceNumber, getMusicAlbumPosition, getMusicAudioDirectory, getMusicAudioFileName } from "@/utils/music-album"
import { buildMusicAudioUrl } from "@/utils/music-audio"

const props = defineProps<{
    music: Music
}>()

/** 当前乐谱所属的专辑。 */
const score = computed(() => musicScoreData.find(item => item.id === props.music.scoreId))

/** 当前乐谱在专辑内的位置（序号从 1 起）。 */
const position = computed(() => getMusicAlbumPosition(props.music.id))

/** 专辑内位置文案，如 `01 / 07`；无专辑信息时为 `--`。 */
const positionText = computed(() => {
    const current = position.value
    return current ? `${formatSequenceNumber(current.index)} / ${formatSequenceNumber(current.total)}` : "--"
})

/** 音频文件名（路径末段，档案展示用）。 */
const audioFileName = computed(() => getMusicAudioFileName(props.music.music))

/** 音频所在目录（档案展示用）。 */
const audioDirectory = computed(() => getMusicAudioDirectory(props.music.music))

const musicAudioUrl = computed(() => buildMusicAudioUrl(props.music.music))
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 乐谱档案头：纸面 + primary 强调线 + 元数据格 -->
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
                <!-- 专辑封面：横向唱片套 -->
                <div v-if="score" class="h-16 w-28 shrink-0 overflow-hidden rounded-xs border border-base-content/15 bg-base-content/3 sm:h-20 sm:w-36">
                    <img :src="`/imgs/music/${score.icon}.webp`" :alt="$t(score.name)" class="h-full w-full object-cover" />
                </div>
                <div class="min-w-0 flex-1">
                    <!-- 徽记行：分类小标 -->
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Music File
                    </p>
                    <!-- 曲名 + 幽灵 ID -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/music/${music.id}`"
                            class="font-orbitron text-xl font-bold leading-tight tracking-tight wrap-break-word text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(music.name) }}
                        </SRouterLink>
                        <CopyID :id="music.id" />
                    </div>
                    <!-- 专辑行：专辑名 + 专辑 ID -->
                    <div v-if="score" class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-base-content/55">
                        <span class="wrap-break-word">{{ $t(score.name) }}</span>
                        <CopyID :id="score.id" />
                    </div>
                </div>
            </div>

            <!-- 元数据格：位置 / 音频文件 / 目录 / 资源 ID -->
            <dl class="relative mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-base-content/10 pt-3">
                <div class="min-w-0">
                    <dt class="font-mono text-[10px] uppercase tracking-[0.18em] text-base-content/45">Position</dt>
                    <dd class="mt-1.5 flex items-center gap-1.5">
                        <i class="size-1.25 shrink-0 bg-primary/70" aria-hidden="true" />
                        <span class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{ positionText }}</span>
                    </dd>
                </div>
                <div class="min-w-0">
                    <dt class="font-mono text-[10px] uppercase tracking-[0.18em] text-base-content/45">Asset ID</dt>
                    <dd class="mt-1.5 flex items-center gap-1.5">
                        <i class="size-1.25 shrink-0 bg-primary/70" aria-hidden="true" />
                        <CopyID :id="music.rId" />
                    </dd>
                </div>
                <div class="min-w-0">
                    <dt class="font-mono text-[10px] uppercase tracking-[0.18em] text-base-content/45">Audio File</dt>
                    <dd class="mt-1.5 flex items-center gap-1.5">
                        <i class="size-1.25 shrink-0 bg-primary/70" aria-hidden="true" />
                        <span class="min-w-0 truncate font-mono text-[12px] text-base-content/75">{{ audioFileName }}</span>
                    </dd>
                </div>
                <div class="min-w-0">
                    <dt class="font-mono text-[10px] uppercase tracking-[0.18em] text-base-content/45">Library</dt>
                    <dd class="mt-1.5 flex items-center gap-1.5">
                        <i class="size-1.25 shrink-0 bg-primary/70" aria-hidden="true" />
                        <span class="min-w-0 truncate font-mono text-[12px] text-base-content/75">{{ audioDirectory }}</span>
                    </dd>
                </div>
            </dl>
        </header>

        <!-- 试听 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader
                no-animate
                compact
                kicker="PLAYBACK"
                :title="$t('db-music-list.playback')"
                :count="positionText"
            />
            <MusicPlayer :src="musicAudioUrl" />
        </section>

        <!-- 描述 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('resource.description')" />
            <div class="text-sm leading-relaxed whitespace-pre-wrap text-base-content/85">{{ $t(music.desc) }}</div>
        </section>

        <!-- 曲目资源 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="TRACK" :title="$t('resource.title')" />
            <ResourceCostItem name="" :value="[1, music.rId, 'Resource']" />
        </section>
    </div>
</template>
