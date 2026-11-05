<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { onUnmounted, ref, watchEffect } from "vue"
import { CharBuild } from "@/data"
import { VoxelEngine } from "@/game/services/VoxelEngine"
import { FloatingText, GameSettings, Monster, PlayerStats } from "@/game/types"
import GameOverlay from "./GameOverlay.vue"

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
const initError = ref<string | null>(null)
let engine: VoxelEngine | null = null

watchEffect(() => {
    if (!canvasRef.value) return

    try {
        // 战斗由 skill-sim 的 Simulation + SkillRuntime 驱动，VoxelEngine 只做视图
        engine = new VoxelEngine(
            canvasRef.value,
            props.charBuild.clone(),
            stats => (playerStats.value = stats),
            m => (monsters.value = m),
            texts => (floatingTexts.value = texts),
            (current, total) => (dps.value = { current, total })
        )
        engine.setSettings(localSettings.value)
        initError.value = null
    } catch (error) {
        initError.value = error instanceof Error ? error.message : String(error)
        engine = null
        return
    }

    const handleResize = () => engine?.resize()
    window.addEventListener("resize", handleResize)

    return () => {
        window.removeEventListener("resize", handleResize)
        engine?.cleanup()
        engine = null
    }
})

onUnmounted(() => {
    engine?.cleanup()
    engine = null
})
</script>
<template>
    <div class="flex justify-center items-center bg-base-300 h-[80vh] overflow-hidden relative">
        <div ref="canvasRef" class="absolute inset-0 z-0 cursor-crosshair" @contextmenu.prevent />
        <div v-if="initError" class="absolute inset-x-0 top-4 z-10 mx-auto w-fit rounded bg-red-900/80 px-4 py-2 text-sm text-red-100">
            {{ initError }}
        </div>
        <GameOverlay
            v-if="playerStats"
            :player-stats="playerStats"
            :monsters="monsters"
            :floating-texts="floatingTexts"
            :dps="dps"
            :settings="localSettings"
            @update:settings="(settings: GameSettings) => { localSettings = settings; if (engine) engine.settings = settings }"
        />
    </div>
</template>
