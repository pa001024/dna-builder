<script setup lang="ts">
import { useHelpText } from "../../content/locale"
import { type CodeShot, L } from "../../content/types"
import { clamp01, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: CodeShot; time: number; duration: number }>()
const tr = useHelpText()

function lineVisible(index: number): boolean {
    return props.time >= 0.3 + index * 0.11
}

function lineStyle(index: number) {
    return enterStyle(props.time, 0.3 + index * 0.11, 0.35, 6)
}

function copied(): boolean {
    return props.shot.copyAt != null && props.time >= props.shot.copyAt
}
</script>

<template>
    <div class="help-center-shot">
        <div class="help-panel w-210 overflow-hidden">
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div class="flex items-center gap-2">
                    <Icon icon="ri:code-s-slash-line" class="size-4 help-accent" />
                    <span class="text-sm font-semibold">{{ tr(shot.title) }}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="help-chip">{{ shot.language ?? "TEXT" }}</span>
                    <span class="help-chip" :class="{ 'help-chip--accent': copied() }">
                        <Icon :icon="copied() ? 'ri:checkbox-circle-fill' : 'ri:file-copy-line'" class="size-3" />
                        {{ copied() ? tr(L("已复制", "已複製", "Copied", "コピー済み", "복사됨", "Copié")) : tr(L("复制", "複製", "Copy", "コピー", "복사", "Copier")) }}
                    </span>
                </div>
            </div>

            <div class="help-code px-3 py-4">
                <div
                    v-for="(line, index) in shot.lines"
                    :key="index"
                    class="help-code__line"
                    :class="{ 'help-code__line--hl': (shot.highlight ?? []).includes(index), 'opacity-0': !lineVisible(index) }"
                    :style="lineVisible(index) ? lineStyle(index) : undefined"
                >
                    <span class="help-code__no">{{ String(index + 1).padStart(2, "0") }}</span>
                    <span class="whitespace-pre-wrap break-all">{{ line }}</span>
                </div>
            </div>

            <div v-if="shot.result" class="flex items-center justify-between border-t border-white/10 px-5 py-3" :style="{ opacity: clamp01(progressAt(time, 0.3 + shot.lines.length * 0.11, 0.5)) }">
                <span class="text-[11px] text-white/45">{{ tr(shot.result) }}</span>
                <span class="help-chip help-chip--accent">{{ tr(L("复制社区代码", "複製社群代碼", "Copy community code", "コミュニティコードをコピー", "커뮤니티 코드 복사", "Copier le code")) }}</span>
            </div>
        </div>
    </div>
</template>
