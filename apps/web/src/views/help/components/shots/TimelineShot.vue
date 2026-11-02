<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import { L, type TimelineShot } from "../../content/types"
import { clamp01, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: TimelineShot; time: number; duration: number }>()
const tr = useHelpText()

const span = computed(() => {
    let max = 24
    for (const slot of props.shot.slots) {
        for (const track of slot.tracks) {
            for (const block of track.blocks) max = Math.max(max, block.start + block.dur + 2)
        }
    }
    return Math.ceil(max)
})

const ticks = computed(() => Array.from({ length: 8 }, (_, index) => `${Math.round((span.value / 8) * index)}s`))

function slotHeight(slot: TimelineShot["slots"][number]): number {
    return slot.tracks.length * 46
}

function blockStyle(start: number, dur: number, kind: "skill" | "buff" = "skill") {
    return {
        left: `${(start / span.value) * 100}%`,
        width: `${Math.max(1.4, (dur / span.value) * 100)}%`,
        "--block-color": kind === "buff" ? "#86efac" : "var(--accent)",
    }
}

const ghostStyle = computed(() => {
    const p = clamp01(progressAt(props.time, 0.5, 1.1))
    return {
        left: `${8 + p * 17}%`,
        top: "28px",
        width: "13%",
        opacity: props.time > 0.4 ? 1 : 0,
        transform: `rotate(${p * -1.4}deg) scale(${1.04 - p * 0.04})`,
    }
})

const resizeBlockStyle = computed(() => {
    const p = clamp01(progressAt(props.time, 0.8, 1.2))
    return { left: "34%", width: `${10 + p * 10}%`, top: "58px" }
})

const hpPoints = computed(() => {
    const values = props.shot.hp ?? [100, 98, 94, 88, 80, 64, 52, 44, 38, 30]
    const step = 100 / Math.max(1, values.length - 1)
    return values.map((value, index) => `${index * step},${100 - clamp01(value / 100) * 100}`).join(" ")
})

const hpOpacity = computed(() => (props.shot.showHp === false ? 0 : clamp01(progressAt(props.time, 0.6, 0.8))))
const playhead = computed(() => `${clamp01(progressAt(props.time, 0, props.duration)) * 100}%`)
</script>

<template>
    <div class="help-timeline-shot">
        <div class="help-timeline-head">
            <div>
                <div class="help-kicker">COMBAT TIMELINE</div>
                <h2 class="help-display help-timeline-title">{{ tr(shot.title ?? L("时间线", "時間線", "Timeline", "タイムライン", "타임라인", "Chronologie")) }}</h2>
            </div>
            <div class="flex items-center gap-2">
                <span class="help-chip">{{ shot.slots.length }} {{ tr(L("槽位", "槽位", "slots", "スロット", "슬롯", "slots")) }}</span>
                <span class="help-chip">{{ tr(L("帧级吸附", "影格吸附", "frame snap", "フレーム吸着", "프레임 스냅", "aimantation image")) }}</span>
                <span class="help-chip help-chip--accent">{{ tr(L("导出 JSON", "匯出 JSON", "Export JSON", "JSON 書出", "JSON 내보내기", "Exporter JSON")) }}</span>
            </div>
        </div>

        <div class="help-timeline-canvas">
            <div class="help-timeline-ruler">
                <div v-for="tick in ticks" :key="tick" class="help-timeline-ruler__tick">{{ tick }}</div>
            </div>

            <div class="help-timeline-body">
                <div class="help-timeline-slots">
                    <div v-for="(slot, index) in shot.slots" :key="index" class="help-timeline-slot" :style="{ height: `${slotHeight(slot)}px` }">
                        <div class="help-timeline-slot__name">{{ tr(slot.character) }}</div>
                        <div class="help-timeline-slot__weapon">{{ tr(slot.weapon ?? L("", "", "", "", "", "")) }}</div>
                    </div>
                </div>

                <div class="help-timeline-tracks">
                    <template v-for="(slot, slotIndex) in shot.slots" :key="slotIndex">
                        <div v-for="(track, trackIndex) in slot.tracks" :key="`${slotIndex}-${trackIndex}`" class="help-timeline-track">
                            <span class="help-timeline-track__label">{{ tr(track.label) }}</span>
                            <div
                                v-for="(block, blockIndex) in track.blocks"
                                :key="blockIndex"
                                class="help-timeline-block"
                                :style="{
                                    ...blockStyle(block.start, block.dur, track.kind),
                                    ...enterStyle(time, 0.4 + blockIndex * 0.1 + slotIndex * 0.05, 0.45, 8),
                                }"
                            >
                                {{ tr(block.label) }}
                            </div>

                            <div
                                v-if="shot.phase === 'buff' && track.kind === 'buff'"
                                class="pointer-events-none absolute inset-y-0 left-0 w-full border border-emerald-300/45"
                                :style="{ opacity: progressAt(time, 0.6, 0.5) }"
                            />
                        </div>
                    </template>

                    <div v-if="shot.phase === 'drag'" class="pointer-events-none absolute inset-0">
                        <div
                            class="help-timeline-block border-dashed"
                            :style="{ ...blockStyle(0, 3), ...ghostStyle, left: undefined, marginLeft: ghostStyle.left, height: '22px' }"
                        >
                            {{ tr(shot.dragLabel ?? L("技能", "技能", "Skill", "スキル", "스킬", "Compétence")) }}
                        </div>
                        <div class="absolute left-[26%] top-[12px] h-[22px] w-[12%] border border-dashed border-white/25" />
                    </div>

                    <div
                        v-if="shot.phase === 'resize'"
                        class="pointer-events-none absolute h-[22px] border border-white/70"
                        :style="resizeBlockStyle"
                    >
                        <span class="absolute -right-1 top-1/2 h-4 w-2 -translate-y-1/2 bg-white" />
                    </div>

                    <div v-if="shot.showHp !== false" class="help-timeline-hp" :style="{ opacity: hpOpacity }">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="h-full w-full">
                            <polyline :points="hpPoints" fill="none" stroke="var(--accent)" stroke-width="1.4" vector-effect="non-scaling-stroke" />
                            <polyline :points="`${hpPoints} 100,100 0,100`" fill="color-mix(in oklch, var(--accent) 12%, transparent)" stroke="none" />
                        </svg>
                        <span class="absolute left-3 top-2 text-[9px] tracking-widest text-white/35">HP CURVE</span>
                    </div>

                    <div class="help-timeline-playhead" :style="{ left: playhead }" />
                </div>
            </div>

            <div v-if="shot.phase === 'save'" class="help-chip help-chip--accent absolute bottom-3 right-3 h-8!">
                <Icon icon="ri:save-line" class="size-3.5" />
                {{ tr(L("方案已保存", "方案已儲存", "Scheme saved", "プランを保存", "방안 저장됨", "Plan enregistré")) }}
            </div>
        </div>
    </div>
</template>
