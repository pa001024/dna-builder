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
    <div class="p-3 space-y-4">
        <div class="flex items-start gap-3">
            <img
                v-if="score"
                :src="`/imgs/music/${score.icon}.webp`"
                :alt="score.name"
                class="h-16 shrink-0 rounded bg-base-200 object-cover"
            />
            <div class="min-w-0">
                <SRouterLink :to="`/db/music/${music.id}`" class="text-lg font-bold link link-primary wrap-break-word">
                    {{ $t(music.name) }}
                </SRouterLink>
                <div class="mt-1 text-sm text-base-content/70"><CopyID :id="music.id" /></div>
            </div>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.description") }}</div>
            <div class="text-sm leading-6 whitespace-pre-wrap">{{ $t(music.desc) }}</div>
        </div>
        <div class="p-3 bg-base-200 rounded">
            <div v-if="score" class="flex gap-2 items-center pb-2">
                <img :src="`/imgs/music/${score.icon}.webp`" :alt="score.name" class="h-8 shrink-0 rounded object-cover" />
                <span class="min-w-0 flex-1 wrap-break-word">{{ $t(score.name) }}</span>
                <CopyID :id="score.id" />
            </div>
            <div class="p-2">
                <MusicPlayer :src="musicAudioUrl" />
            </div>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.title") }}</div>
            <ResourceCostItem name="" :value="[1, music.rId, 'Resource']" />
        </div>
    </div>
</template>
