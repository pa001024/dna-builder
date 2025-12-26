<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue"
import { useFPSGameStore } from "../store/fpsGame"
import { useBabylonScene } from "../composables/useBabylonScene"
import { useRouter } from "vue-router"

const router = useRouter()
const store = useFPSGameStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isLoading = ref(true)
let lastTime = 0

// Initialize Babylon.js scene
const { initBabylon, cleanup } = useBabylonScene(canvasRef)

// Get attribute color
const getAttributeColor = (attribute: string) => {
    const colors: Record<string, string> = {
        光: "text-yellow-400",
        暗: "text-purple-400",
        火: "text-red-500",
        水: "text-blue-500",
        风: "text-green-400",
        雷: "text-cyan-400",
        物理: "text-gray-400",
    }
    return colors[attribute] || "text-gray-400"
}

// Filter characters - for now just show a few
const featuredCharacters = computed(() => {
    return store.characters.slice(0, 6) // Show first 6 characters
})

// Game loop for cooldowns
const gameLoop = (currentTime: number) => {
    if (lastTime === 0) {
        lastTime = currentTime
    }
    const deltaTime = (currentTime - lastTime) / 1000
    lastTime = currentTime

    if (store.isPlaying) {
        store.updateCooldowns(deltaTime)
    }

    requestAnimationFrame(gameLoop)
}

// Lifecycle
onMounted(async () => {
    try {
        if (canvasRef.value) {
            initBabylon()
            await new Promise((resolve) => setTimeout(resolve, 500))
            isLoading.value = false
        }
    } catch (error) {
        console.error("Failed to initialize Babylon.js:", error)
        isLoading.value = false
    }

    // Start game loop
    requestAnimationFrame(gameLoop)
})

onUnmounted(() => {
    cleanup()
})

// Watch for game state changes
watch(
    () => store.gameState,
    (newState) => {
        if (newState === "menu") {
            // Exit pointer lock when returning to menu
            document.exitPointerLock()
        }
    },
)

// Navigation
const goBack = () => {
    store.resetToMenu()
    router.push("/")
}
</script>

<template>
    <div class="relative w-full h-full bg-black overflow-hidden">
        <!-- Loading Screen -->
        <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-gray-900 z-50">
            <div class="text-center">
                <span class="loading loading-spinner loading-lg text-primary"></span>
                <p class="mt-4 text-white text-lg">Loading 3D Engine...</p>
            </div>
        </div>

        <!-- 3D Canvas -->
        <canvas ref="canvasRef" class="w-full h-full" :class="{ 'opacity-50': store.isPaused }"></canvas>

        <!-- Main Menu Overlay -->
        <Transition name="fade">
            <div v-if="store.gameState === 'menu'" class="absolute inset-0 flex items-center justify-center bg-black/70 z-40">
                <div class="bg-base-200 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
                    <h1 class="text-4xl font-bold text-primary text-center mb-8">FPS Shooter</h1>

                    <div class="space-y-4">
                        <button @click="store.startGame" class="btn btn-primary btn-lg w-full">Start Game</button>

                        <div class="divider">Settings</div>

                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Mouse Sensitivity</span>
                                <span class="label-text-alt">{{ store.mouseSensitivity.toFixed(3) }}</span>
                            </label>
                            <input
                                type="range"
                                min="0.001"
                                max="0.01"
                                step="0.001"
                                v-model.number="store.mouseSensitivity"
                                class="range range-primary"
                            />
                        </div>

                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Difficulty</span>
                            </label>
                            <div class="join w-full">
                                <button
                                    v-for="diff in ['easy', 'medium', 'hard'] as const"
                                    :key="diff"
                                    @click="store.difficulty = diff"
                                    class="join-item btn flex-1"
                                    :class="store.difficulty === diff ? 'btn-active btn-primary' : ''"
                                >
                                    {{ diff.charAt(0).toUpperCase() + diff.slice(1) }}
                                </button>
                            </div>
                        </div>

                        <button @click="goBack" class="btn btn-ghost w-full mt-4">Back to Home</button>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- Character Selection Screen -->
        <Transition name="fade">
            <div
                v-if="store.gameState === 'character-select'"
                class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900/90 via-blue-900/90 to-black/95 z-40"
            >
                <div class="bg-base-200/95 backdrop-blur rounded-lg p-8 max-w-6xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                    <h2 class="text-4xl font-bold text-primary text-center mb-8">Select Your Character</h2>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div
                            v-for="char in featuredCharacters"
                            :key="char.id"
                            @click="store.selectCharacter(char)"
                            class="card bg-base-300 hover:bg-base-100 cursor-pointer transition-all hover:scale-105 hover:shadow-xl"
                        >
                            <div class="card-body">
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="card-title text-2xl">{{ char.名称 }}</h3>
                                    <span :class="[getAttributeColor(char.属性), 'text-2xl font-bold']">
                                        {{ char.属性 }}
                                    </span>
                                </div>

                                <div class="space-y-1 text-sm">
                                    <div class="flex justify-between">
                                        <span class="text-gray-500">攻击:</span>
                                        <span class="font-mono">{{ char.基础攻击 }}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-500">生命:</span>
                                        <span class="font-mono">{{ char.基础生命 }}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-500">神智:</span>
                                        <span class="font-mono text-primary">{{ char.基础神智 }}</span>
                                    </div>
                                </div>

                                <div class="divider my-2">Skills</div>
                                <div class="space-y-2">
                                    <div class="flex items-center gap-2">
                                        <span class="kbd kbd-sm bg-yellow-500 text-black">Q</span>
                                        <span class="text-sm">{{ char.技能[0]?.名称 }}</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="kbd kbd-sm bg-orange-500 text-black">E</span>
                                        <span class="text-sm">{{ char.技能[1]?.名称 }}</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="kbd kbd-sm bg-gray-500 text-white">P</span>
                                        <span class="text-sm text-gray-400">{{ char.技能[2]?.名称 }} (Passive)</span>
                                    </div>
                                </div>

                                <div class="card-actions justify-end mt-4">
                                    <button class="btn btn-primary btn-sm">Select</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="mt-8 flex justify-center gap-4">
                        <button v-if="store.selectedCharacter" @click="store.startGame" class="btn btn-success btn-lg">
                            Start Game as {{ store.selectedCharacter.名称 }}
                        </button>
                        <button @click="store.gameState = 'menu'" class="btn btn-ghost">Back</button>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- Pause Menu -->
        <Transition name="fade">
            <div v-if="store.isPaused" class="absolute inset-0 flex items-center justify-center bg-black/50 z-40">
                <div class="bg-base-200 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
                    <h2 class="text-3xl font-bold text-primary text-center mb-8">Paused</h2>

                    <div class="space-y-4">
                        <button @click="store.resumeGame" class="btn btn-primary btn-lg w-full">Resume</button>
                        <button @click="store.resetToMenu" class="btn btn-ghost w-full">Main Menu</button>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- Game Over Screen -->
        <Transition name="fade">
            <div v-if="store.gameState === 'gameover'" class="absolute inset-0 flex items-center justify-center bg-black/70 z-40">
                <div class="bg-base-200 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
                    <h2 class="text-3xl font-bold text-error text-center mb-4">Game Over</h2>

                    <div class="text-center mb-8">
                        <p class="text-xl mb-2">Final Score: {{ store.score }}</p>
                        <p class="text-lg text-primary">High Score: {{ store.highScore }}</p>
                    </div>

                    <div class="space-y-4">
                        <button @click="store.startGame" class="btn btn-primary btn-lg w-full">Play Again</button>
                        <button @click="store.resetToMenu" class="btn btn-ghost w-full">Main Menu</button>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- HUD - Skills -->
        <Transition name="slide-up">
            <div v-if="store.isPlaying && store.selectedCharacter" class="absolute bottom-4 right-4 flex gap-3">
                <!-- Q Skill -->
                <div class="bg-base-200/80 backdrop-blur rounded-lg p-3 min-w-[120px]">
                    <div class="text-xs text-gray-400 mb-1">Q - {{ store.selectedCharacter.技能[0]?.名称 }}</div>
                    <div class="flex items-center gap-2">
                        <span class="kbd kbd-sm bg-yellow-500 text-black">Q</span>
                        <div class="flex-1">
                            <progress class="progress progress-warning w-full" :value="store.skill1Percentage" max="100"></progress>
                        </div>
                    </div>
                    <div class="text-xs text-right mt-1" :class="store.skill1Ready ? 'text-success' : 'text-error'">
                        {{ store.skill1Ready ? "READY" : Math.ceil(store.skillCooldowns.skill1) + "s" }}
                    </div>
                </div>

                <!-- E Skill -->
                <div class="bg-base-200/80 backdrop-blur rounded-lg p-3 min-w-[120px]">
                    <div class="text-xs text-gray-400 mb-1">E - {{ store.selectedCharacter.技能[1]?.名称 }}</div>
                    <div class="flex items-center gap-2">
                        <span class="kbd kbd-sm bg-orange-500 text-black">E</span>
                        <div class="flex-1">
                            <progress class="progress progress-error w-full" :value="store.skill2Percentage" max="100"></progress>
                        </div>
                    </div>
                    <div class="text-xs text-right mt-1" :class="store.skill2Ready ? 'text-success' : 'text-error'">
                        {{ store.skill2Ready ? "READY" : Math.ceil(store.skillCooldowns.skill2) + "s" }}
                    </div>
                </div>
            </div>
        </Transition>

        <!-- HUD - Stats -->
        <Transition name="slide-up">
            <div
                v-if="store.isPlaying && store.selectedCharacter"
                class="absolute top-4 left-4 bg-base-200/80 backdrop-blur rounded-lg p-3 space-y-2"
            >
                <div class="flex items-center gap-2">
                    <div class="text-sm">HP</div>
                    <progress class="progress progress-success flex-1" :value="store.healthPercentage" max="100"></progress>
                    <div class="text-sm font-mono w-12 text-right">{{ store.playerHealth }}/{{ store.maxHealth }}</div>
                </div>
                <div class="flex items-center gap-2">
                    <div class="text-sm text-primary">SP</div>
                    <progress class="progress progress-primary flex-1" :value="store.sanityPercentage" max="100"></progress>
                    <div class="text-sm font-mono w-12 text-right">{{ store.sanity }}/{{ store.maxSanity }}</div>
                </div>
                <div class="divider my-1"></div>
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold">DPS:</span>
                    <span class="text-sm font-mono text-warning">{{ store.currentDPS }}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm">Total Damage:</span>
                    <span class="text-sm font-mono">{{ store.totalDamage }}</span>
                </div>
            </div>
        </Transition>

        <!-- Controls Hint -->
        <Transition name="slide-up">
            <div v-if="store.isPlaying" class="absolute bottom-4 left-4 bg-base-200/80 rounded-lg p-4 text-sm">
                <div class="font-bold mb-2">Controls:</div>
                <div>WASD - Move</div>
                <div>Mouse - Look</div>
                <div>Left Click - Shoot</div>
                <div>Q - {{ store.selectedCharacter?.技能[0]?.名称 || "Skill 1" }}</div>
                <div>E - {{ store.selectedCharacter?.技能[1]?.名称 || "Skill 2" }}</div>
                <div>R - Reload</div>
                <div>ESC - Pause</div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
    transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(20px);
    opacity: 0;
}
</style>
