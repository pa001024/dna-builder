<script setup lang="ts">
import { useRouter } from "vue-router"
import { useHelpText } from "../../content/locale"
import type { RecapShot } from "../../content/types"
import { enterStyle } from "./motion"

const props = defineProps<{ shot: RecapShot; time: number; duration: number }>()
const tr = useHelpText()
const router = useRouter()

function itemAt(index: number): number {
    return 0.4 + index * 0.38
}

function goTry() {
    if (props.shot.route) void router.push(props.shot.route)
}
</script>

<template>
    <div class="help-recap-shot">
        <div class="help-callout-shot__body">
            <div class="help-kicker" :style="enterStyle(time, 0.05, 0.5, 8)">RECAP · NEXT</div>
            <h2 class="help-display help-callout-shot__title" :style="enterStyle(time, 0.18, 0.7, 20)">
                {{ tr(shot.title) }}
            </h2>

            <div class="help-recap-list">
                <div v-for="(item, index) in shot.checklist" :key="index" class="help-recap-item" :style="enterStyle(time, itemAt(index), 0.5, 12)">
                    <Icon icon="ri:checkbox-circle-fill" class="help-accent size-5 shrink-0" />
                    <span>{{ tr(item) }}</span>
                </div>
            </div>

            <div class="mt-9 flex items-center gap-4" :style="enterStyle(time, itemAt(shot.checklist.length) + 0.15, 0.55, 12)">
                <button v-if="shot.route" type="button" class="help-chip help-chip--accent h-11! cursor-pointer px-6! text-sm! font-semibold" @click="goTry">
                    <Icon icon="ri:arrow-right-up-line" class="size-4" />
                    {{ tr(shot.routeLabel ?? shot.hint ?? shot.title) }}
                </button>
                <span v-if="shot.hint" class="help-muted text-sm">{{ tr(shot.hint) }}</span>
            </div>
        </div>
    </div>
</template>
