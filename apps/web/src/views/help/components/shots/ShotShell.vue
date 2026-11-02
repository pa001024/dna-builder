<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import type { CalloutSpec, CaptionCue, CursorSpec, FocusSpec, Scene } from "../../content/types"
import { clamp01, easeOutCubic, lerp, progressAt, samplePath } from "./motion"

const props = defineProps<{
    scene: Scene
    time: number
    duration: number
}>()

const tr = useHelpText()

const activeCaption = computed<CaptionCue | null>(() => {
    let current: CaptionCue | null = null
    for (const cue of props.scene.captions ?? []) {
        if (props.time >= cue.at) current = cue
    }
    return current
})

const captionOpacity = computed(() => {
    const cue = activeCaption.value
    return cue ? easeOutCubic(clamp01((props.time - cue.at) / 0.3)) : 0
})

function calloutStyle(callout: CalloutSpec) {
    const p = easeOutCubic(progressAt(props.time, callout.at, 0.45))
    const shift = lerp(10, 0, p)
    return {
        left: `${callout.x}%`,
        top: `${callout.y}%`,
        opacity: p,
        transform: callout.align === "right" ? `translate(-100%, ${shift}px)` : `translateY(${shift}px)`,
    }
}

function focusVisible(focus: FocusSpec): boolean {
    return props.time >= (focus.at ?? 0.8)
}

function focusOpacity(focus: FocusSpec): number {
    return easeOutCubic(progressAt(props.time, focus.at ?? 0.8, 0.4))
}

const cursorState = computed(() => {
    const spec = props.scene.cursor
    if (!spec || props.time < spec.at || !spec.path.length) return null
    const travel = Math.max(0.35, (spec.path.length - 1) * 0.62)
    const p = clamp01((props.time - spec.at) / travel)
    const point = samplePath(spec.path, p)
    const click = spec.clickAt != null && props.time >= spec.clickAt && props.time < spec.clickAt + 0.7
    return { x: point[0], y: point[1], click }
})

function cursorOpacity(): number {
    const spec: CursorSpec | undefined = props.scene.cursor
    if (!spec) return 0
    return easeOutCubic(progressAt(props.time, spec.at, 0.25))
}
</script>

<template>
    <div class="help-shell">
        <slot />

        <div v-if="scene.focus && focusVisible(scene.focus)" class="help-focus" :style="{
            left: `${scene.focus.x}%`,
            top: `${scene.focus.y}%`,
            width: `${scene.focus.w}%`,
            height: `${scene.focus.h}%`,
            opacity: focusOpacity(scene.focus),
        }">
            <span v-if="scene.focus.label" class="help-focus__label">{{ tr(scene.focus.label) }}</span>
        </div>

        <div v-for="(callout, index) in scene.callouts ?? []" :key="index" class="help-callout" :style="calloutStyle(callout)">
            <span class="help-callout__dot" />
            <span>{{ tr(callout.text) }}</span>
        </div>

        <div v-if="cursorState" class="help-cursor" :style="{
            left: `${cursorState.x}%`,
            top: `${cursorState.y}%`,
            opacity: cursorOpacity(),
        }">
            <span v-if="cursorState.click" class="help-cursor__ripple" />
            <span class="help-cursor__ring" />
            <span class="help-cursor__dot" />
        </div>

        <div v-if="activeCaption" class="help-caption" :style="{ opacity: captionOpacity }">
            {{ tr(activeCaption.text) }}
        </div>

        <div v-if="scene.note" class="help-scene-note">
            <Icon icon="ri:information-line" class="size-3.5" />
            {{ tr(scene.note) }}
        </div>
    </div>
</template>
