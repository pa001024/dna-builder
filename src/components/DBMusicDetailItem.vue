<script lang="ts" setup>
import { computed } from "vue"
import type { Music } from "@/data/d/music.data"
import { musicScoreData } from "@/data/d/music.data"
import { buildMusicAudioUrl } from "@/utils/music-audio"

const props = defineProps<{
    music: Music
}>()

/** 当前乐谱所属的专辑。 */
const score = computed(() => musicScoreData.find(item => item.id === props.music.scoreId))
const musicAudioUrl = computed(() => buildMusicAudioUrl(props.music.music))
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 乐谱档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <div class="flex items-center gap-3.5">
                <div v-if="score" class="h-16 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                    <img :src="`/imgs/music/${score.icon}.webp`" :alt="score.name" class="h-full w-full object-cover" />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Music File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/music/${music.id}`"
                            class="wrap-break-word font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(music.name) }}
                        </SRouterLink>
                        <CopyID :id="music.id" />
                    </div>
                </div>
            </div>
        </header>

        <!-- 描述 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('resource.description')" />
            <div class="text-sm leading-relaxed whitespace-pre-wrap text-base-content/85">{{ $t(music.desc) }}</div>
        </section>

        <!-- 专辑与播放 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ALBUM" />
            <div v-if="score" class="flex items-center gap-2.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <img :src="`/imgs/music/${score.icon}.webp`" :alt="score.name" class="h-8 shrink-0 rounded-xs object-cover" />
                <span class="min-w-0 flex-1 wrap-break-word text-sm font-medium">{{ $t(score.name) }}</span>
                <CopyID :id="score.id" />
            </div>
            <div class="mt-2">
                <MusicPlayer :src="musicAudioUrl" />
            </div>
        </section>

        <!-- 曲目资源 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="TRACK" :title="$t('resource.title')" />
            <ResourceCostItem name="" :value="[1, music.rId, 'Resource']" />
        </section>
    </div>
</template>
