<script setup lang="ts">
import { onUnmounted, ref, watchEffect } from "vue"
import GameOverlay from "./GameOverlay.vue"
import { VoxelEngine } from "../game/services/VoxelEngine"
import { CharBuild } from "../data"
import { FloatingText, PlayerStats, Monster, GameSettings } from "../game/types"
import { useLocalStorage } from "@vueuse/core"

const props = defineProps<{
    charBuild: CharBuild
}>()

const canvasRef = ref<HTMLDivElement>()
const localSettings = useLocalStorage<GameSettings>("gameSettings", {
    monsterCount: 15,
    monsterId: 6001601,
    monsterLevel: 80,
    spawnType: "random",
    autoLevelUp: false,
    autoLevelInterval: 30,
    spawnInterval: 3,
    sanityRegenAmount: 7,
    sanityRegenInterval: 3,
})

const playerStats = ref<PlayerStats | null>(null)
const monsters = ref<Monster[]>([])
const floatingTexts = ref<FloatingText[]>([])
const dps = ref({ current: 0, total: 0 })
let engine: VoxelEngine

watchEffect(() => {
    if (!canvasRef.value) return

    // Initialize Game Engine
    engine = new VoxelEngine(
        canvasRef.value,
        props.charBuild.clone(),
        stats => (playerStats.value = stats),
        m => (monsters.value = m),
        texts => (floatingTexts.value = texts),
        (current, total) => (dps.value = { current, total })
    )
    engine.setSettings(localSettings.value)

    const handleResize = () => engine.resize()
    window.addEventListener("resize", handleResize)

    return () => {
        window.removeEventListener("resize", handleResize)
        engine.cleanup()
    }
})

onUnmounted(() => {
    engine.cleanup()
})
</script>
<template>
    <div class="flex justify-center items-center bg-base-300 h-[80vh] overflow-hidden relative">
        <div ref="canvasRef" class="absolute inset-0 z-0 cursor-crosshair" @contextmenu.prevent />
        <GameOverlay
            v-if="playerStats"
            :player-stats="playerStats"
            :monsters="monsters"
            :floating-texts="floatingTexts"
            :dps="dps"
            :settings="localSettings"
            @update:settings="engine.settings = localSettings = $event"
        />
    </div>
</template>
