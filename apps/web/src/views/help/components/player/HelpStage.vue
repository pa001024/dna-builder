<script setup lang="ts">
import { computed } from "vue"
import type { Scene, Tutorial } from "../../content/types"
import ShotRenderer from "../shots/ShotRenderer.vue"
import ShotShell from "../shots/ShotShell.vue"
import StageBackdrop from "./StageBackdrop.vue"

const props = defineProps<{
    tutorial: Tutorial
    scene: Scene
    sceneIndex: number
    sceneTime: number
}>()

const backdropVariant = computed<"grid" | "spotlight" | "plain">(() => {
    const type = props.scene.shot.type
    if (type === "title" || type === "callout" || type === "recap") return "spotlight"
    if (type === "steps") return "plain"
    return "grid"
})
</script>

<template>
    <div class="help-stage" :style="{ '--accent': tutorial.accent }">
        <StageBackdrop :accent="tutorial.accent" :variant="backdropVariant" />

        <div class="help-watermark">
            <span class="help-watermark__dot" />
            <span>DNA BUILDER · GUIDE</span>
        </div>
        <div class="help-episode">EP {{ tutorial.number }}</div>

        <div :key="`scene-${sceneIndex}`" class="help-scene help-scene-in">
            <ShotShell :scene="scene" :time="sceneTime" :duration="scene.duration">
                <ShotRenderer :scene="scene" :time="sceneTime" :duration="scene.duration" />
            </ShotShell>
        </div>

        <div :key="`flash-${sceneIndex}`" class="help-scene-flash" />
    </div>
</template>
