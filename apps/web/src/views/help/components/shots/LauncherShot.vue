<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import { L, type LauncherShot } from "../../content/types"
import { clamp01, easeOutExpo, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: LauncherShot; time: number; duration: number }>()
const tr = useHelpText()

const progressValue = computed(() => {
    if (props.shot.progress) return props.shot.progress.value * easeOutExpo(progressAt(props.time, 0.5, Math.max(1.2, props.duration * 0.55)))
    return clamp01(progressAt(props.time, 0.5, 2.4)) * 100
})

const status = computed(() => props.shot.status ?? (progressValue.value >= 100 ? L("已完成", "已完成", "READY", "完了", "완료", "PRÊT") : props.shot.progress?.label))
</script>

<template>
    <div class="help-center-shot">
        <div class="help-panel w-190 overflow-hidden">
            <div class="flex items-center justify-between border-b border-white/10 px-6 py-3">
                <div class="flex items-center gap-3">
                    <span class="flex size-8 items-center justify-center border border-(--accent)/40 bg-(--accent)/10">
                        <Icon :icon="shot.mode === 'pack' ? 'ri:database-2-line' : 'ri:rocket-2-line'" class="size-4 help-accent" />
                    </span>
                    <div>
                        <div class="text-sm font-semibold">{{ tr(shot.title) }}</div>
                        <div class="text-[10px] text-white/35">{{ tr(shot.subtitle ?? "") }}</div>
                    </div>
                </div>
                <span class="help-chip help-chip--accent">{{ shot.mode === "pack" ? "DATA PACK" : "LAUNCHER" }}</span>
            </div>

            <div class="px-6 py-5">
                <div v-if="shot.mode === 'pack'" class="grid grid-cols-2 gap-3">
                    <div v-for="(version, index) in shot.versions ?? []" :key="index" class="border p-4" :class="version.active ? 'border-(--accent)/55 bg-(--accent)/8' : 'border-white/10 bg-white/3'" :style="enterStyle(time, 0.3 + index * 0.16, 0.5, 12)">
                        <div class="text-[10px] tracking-widest text-white/35">{{ tr(version.label) }}</div>
                        <div class="mt-2 font-orbitron text-xl" :class="version.active ? 'help-accent' : 'text-white/65'">{{ version.value }}</div>
                    </div>
                </div>

                <div class="mt-5">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="text-white/55">{{ tr(shot.progress?.label ?? L("正在下载数据包，请稍候…", "正在下載資料包，請稍候…", "Downloading data pack…", "データパックをダウンロード中…", "데이터 팩 다운로드 중…", "Téléchargement du pack…")) }}</span>
                        <span class="font-orbitron help-accent">{{ Math.round(progressValue) }}%</span>
                    </div>
                    <div class="help-progress mt-2"><div class="help-progress__fill" :style="{ width: `${progressValue}%` }" /></div>
                </div>

                <div v-if="shot.steps?.length" class="mt-5 grid grid-cols-3 gap-2">
                    <div v-for="(step, index) in shot.steps" :key="index" class="flex items-center gap-2 border border-white/8 bg-white/3 px-3 py-2 text-[10px]" :class="{ 'border-emerald-300/30 text-emerald-200/80': step.done }">
                        <Icon :icon="step.done ? 'ri:checkbox-circle-fill' : 'ri:record-circle-line'" class="size-3.5" />
                        <span class="truncate">{{ tr(step.label) }}</span>
                    </div>
                </div>

                <div class="mt-6 flex items-center justify-between">
                    <div class="help-muted text-[11px]">{{ tr(status) }}</div>
                    <div class="flex gap-2">
                        <span v-for="(action, index) in shot.actions ?? []" :key="index" class="help-chip" :class="{ 'help-chip--accent': index === (shot.actions?.length ?? 0) - 1 }">
                            {{ tr(action) }}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
