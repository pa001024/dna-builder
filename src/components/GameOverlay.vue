<script setup lang="ts">
import { ref, watch } from "vue"
import { PlayerStats, Monster, FloatingText, GameSettings } from "../game/types"

interface Props {
    playerStats: PlayerStats
    monsters: Monster[]
    floatingTexts: FloatingText[]
    dps: { current: number; total: number }
    settings: GameSettings
}

const props = defineProps<Props>()
const emit = defineEmits<{
    "update:settings": [settings: GameSettings]
}>()

const isSettingsOpen = ref(false)
const localSettings = ref<GameSettings>({ ...props.settings })

// 监听外部设置变化
watch(
    () => props.settings,
    (newSettings) => {
        localSettings.value = { ...newSettings }
    },
    { deep: true },
)

const isOnScreen = (position: { x: number; y: number }) => {
    const { x, y } = position
    return !(x < -100 || x > window.innerWidth + 100 || y < -100 || y > window.innerHeight + 100)
}

const updateSettings = () => {
    emit("update:settings", { ...localSettings.value })
}

const toggleSpawnType = () => {
    localSettings.value.spawnType = localSettings.value.spawnType === "random" ? "ring" : "random"
    updateSettings()
}

const toggleAutoLevelUp = () => {
    localSettings.value.autoLevelUp = !localSettings.value.autoLevelUp
    updateSettings()
}

const closeSettings = () => {
    isSettingsOpen.value = false
}
</script>
<template>
    <div class="absolute inset-0 pointer-events-none select-none font-sans text-white">
        <!-- HUD: Player Status (Bottom Center) -->
        <div class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[500px]">
            <!-- Buff Icons Area -->
            <div class="flex gap-2 mb-2 flex-wrap justify-center">
                <!-- Energy Overcharge Indicator -->
                <div
                    v-if="playerStats.electricEnergy >= 30"
                    class="animate-pulse bg-yellow-500/20 border border-yellow-400 text-yellow-300 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                >
                    <Icon icon="ri:flashlight-line" /> CHARGED
                </div>

                <!-- Active Buffs from Engine -->
                <div
                    v-for="(buff, idx) in playerStats.activeBuffs"
                    :key="idx"
                    class="bg-indigo-500/80 border border-indigo-300 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg shadow-indigo-500/50"
                >
                    <!-- <Flame size="12" fill="currentColor" /> -->
                    {{ buff }}
                </div>

                <div
                    v-if="playerStats.currentSanity < 50"
                    class="bg-purple-900/40 border border-purple-500 text-purple-300 px-3 py-1 rounded-full text-xs font-bold"
                >
                    低神智
                </div>
            </div>

            <!-- HP Bar -->
            <div class="w-full h-6 bg-slate-900/80 rounded-full border border-slate-700 relative overflow-hidden">
                <div
                    class="h-full bg-linear-to-r from-green-600 to-emerald-400 transition-all duration-200"
                    :style="{ width: `${(playerStats.currentHP / playerStats.maxHP) * 100}%` }"
                ></div>
                <!-- Shield Overlay -->
                <div
                    class="absolute top-0 left-0 h-full bg-blue-500/30 border-r border-blue-400 transition-all duration-200"
                    :style="{ width: `${(playerStats.currentShield / playerStats.maxShield) * 100}%` }"
                ></div>
                <div class="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md gap-2">
                    <Icon icon="ri:heart-line" class="text-red-500" />
                    {{ Math.floor(playerStats.currentHP) }} / {{ playerStats.maxHP }}
                    <span v-if="playerStats.currentShield > 0" class="text-blue-300">[{{ Math.floor(playerStats.currentShield) }}]</span>
                </div>
            </div>

            <!-- Sanity Bar (Mana) -->
            <div class="w-full h-3 bg-slate-900/80 rounded-full border border-slate-700 relative overflow-hidden mt-1">
                <div
                    class="h-full bg-linear-to-r from-purple-600 to-fuchsia-400 transition-all duration-200"
                    :style="{ width: `${(playerStats.currentSanity / playerStats.maxSanity) * 100}%` }"
                ></div>
                <div class="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/80">SANITY</div>
            </div>

            <!-- Electric Energy (Passive) -->
            <div class="flex items-center gap-2 w-full mt-1">
                <Icon icon="ri:flashlight-line" class="text-yellow-400" />
                <div class="flex-1 h-2 bg-slate-900/50 rounded-full overflow-hidden">
                    <div
                        class="h-full bg-yellow-400 transition-all duration-100"
                        :style="{ width: `${Math.min(100, (playerStats.electricEnergy / 100) * 100)}%` }"
                    ></div>
                    <!-- Threshold Marker at 30 -->
                    <div class="absolute top-0 bottom-0 w-0.5 bg-white/50" style="left: 30%"></div>
                </div>
                <span class="text-xs font-mono text-yellow-400">{{ Math.floor(playerStats.electricEnergy) }}</span>
            </div>
        </div>

        <!-- --- HUD: Top Right DPS --- -->
        <div class="absolute top-4 right-4 bg-black/40 backdrop-blur-sm p-4 rounded-xl border border-white/10 text-right">
            <div class="flex items-center justify-end gap-2 text-slate-300 text-xs font-bold uppercase tracking-wider mb-1">
                <Icon icon="ri:line-chart-line" /> 统计
            </div>
            <div class="text-2xl font-black font-mono text-white">
                {{ dps.current.toLocaleString() }} <span class="text-sm text-slate-400">DPS</span>
            </div>
            <div class="text-xs text-slate-400 font-mono">Total: {{ dps.total.toLocaleString() }}</div>
        </div>

        <!-- --- HUD: Top Left Settings --- -->
        <div class="absolute top-4 left-4 pointer-events-auto">
            <button
                @click="isSettingsOpen = true"
                class="p-3 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-xl text-white transition-colors"
            >
                <Icon icon="ri:settings-3-line" />
            </button>
        </div>

        <!-- --- Monster Health Bars (Screen Space) --- -->
        <template v-for="m in monsters" :key="m.id">
            <!-- Use calculated screen position from engine -->
            <div
                v-if="m.screenPosition && isOnScreen(m.screenPosition)"
                class="absolute flex flex-col items-center w-24 pointer-events-none"
                :style="{
                    left: `${m.screenPosition.x}px`,
                    top: `${m.screenPosition.y - 60}px`, // Above head offset
                    transform: 'translate(-50%, -50%)',
                }"
            >
                <div class="text-[10px] font-bold text-white drop-shadow-md mb-1 whitespace-nowrap">{{ m.name }}</div>
                <div class="w-full h-1.5 bg-black/50 rounded-full overflow-hidden mb-0.5">
                    <div class="h-full bg-red-500" :style="{ width: `${(m.currentHP / m.maxHP) * 100}%` }"></div>
                </div>
                <div v-if="m.currentShield > 0" class="w-full h-1 bg-black/50 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-400" :style="{ width: `${(m.currentShield / m.maxShield) * 100}%` }"></div>
                </div>
            </div>
        </template>

        <!-- --- Floating Damage Text --- -->
        <div
            v-for="t in floatingTexts.filter((t) => t.screenPosition)"
            :key="t.id"
            class="absolute font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
            :style="{
                left: `${t.screenPosition!.x}px`,
                top: `${t.screenPosition!.y - 80}px`, // Higher than HP bar
                color: t.color,
                opacity: t.opacity,
                transform: `translate(-50%, -${(1 - t.life) * 50}px) scale(${0.8 + t.opacity * 0.2})`,
            }"
        >
            {{ t.text }}
        </div>

        <!-- --- Settings Modal --- -->
        <div
            v-if="isSettingsOpen"
            class="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center pointer-events-auto"
        >
            <div class="bg-slate-800 border border-slate-700 p-8 rounded-3xl w-full max-w-md shadow-2xl">
                <h2 class="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <Icon icon="ri:settings-3-line" class="text-indigo-400" /> 游戏设置
                </h2>

                <div class="space-y-6">
                    <div>
                        <label class="block text-sm font-bold text-slate-400 mb-2">怪物数量</label>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            v-model="localSettings.monsterCount"
                            @change="updateSettings"
                            class="w-full accent-indigo-500"
                        />
                        <div class="text-right text-xs text-slate-500">{{ localSettings.monsterCount }} 实体</div>
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-slate-400 mb-2">初始等级</label>
                        <input
                            type="number"
                            v-model.number="localSettings.monsterLevel"
                            @change="updateSettings"
                            class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div class="flex items-center justify-between">
                        <label class="text-sm font-bold text-slate-400">生成模式</label>
                        <button
                            @click="toggleSpawnType"
                            class="px-4 py-2 bg-slate-700 rounded-lg text-xs font-bold uppercase hover:bg-slate-600"
                        >
                            {{ localSettings.spawnType }}
                        </button>
                    </div>

                    <div class="flex items-center justify-between">
                        <label class="text-sm font-bold text-slate-400">自动升级 (+5 / {{ localSettings.autoLevelInterval }}s)</label>
                        <button
                            @click="toggleAutoLevelUp"
                            :class="`w-12 h-6 rounded-full transition-colors relative ${localSettings.autoLevelUp ? 'bg-green-500' : 'bg-slate-600'}`"
                        >
                            <div
                                :class="`absolute top-1 bottom-1 left-1 w-4 bg-white rounded-full transition-transform ${localSettings.autoLevelUp ? 'translate-x-6' : ''}`"
                            ></div>
                        </button>
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-slate-400 mb-2">
                            神智回复 (+{{ localSettings.sanityRegenAmount }} / {{ localSettings.sanityRegenInterval }}s)
                        </label>
                        <div class="flex gap-2">
                            <input
                                type="number"
                                v-model.number="localSettings.sanityRegenAmount"
                                @change="updateSettings"
                                class="w-1/2 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                                placeholder="Amount"
                            />
                            <input
                                type="number"
                                v-model.number="localSettings.sanityRegenInterval"
                                @change="updateSettings"
                                class="w-1/2 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                                placeholder="Interval (s)"
                            />
                        </div>
                    </div>
                </div>

                <button
                    @click="closeSettings"
                    class="w-full mt-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors"
                >
                    应用
                </button>
            </div>
        </div>
    </div>
</template>
