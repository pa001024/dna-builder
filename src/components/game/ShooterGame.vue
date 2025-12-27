<template>
    <div class="flex justify-center items-center p-5 bg-base-300 h-full">
        <div class="relative inline-block">
            <canvas
                ref="canvasRef"
                :width="canvasSize.width"
                :height="canvasSize.height"
                class="block border-2 border-base-300 rounded-lg bg-base-200 cursor-crosshair"
            />
            <div class="absolute inset-0 pointer-events-none">
                <!-- DPS统计 -->
                <div class="absolute top-2.5 left-2.5 flex flex-col gap-1 pointer-events-auto bg-neutral/80 p-3 rounded-lg min-w-48">
                    <div class="text-white text-base font-semibold mb-1">DPS统计</div>
                    <div class="text-sm text-white/90">
                        当前DPS: <span class="font-mono text-warning">{{ dpsStats.currentDPS.toFixed(0) }}</span>
                    </div>
                    <div class="text-sm text-white/90">
                        平均DPS: <span class="font-mono text-info">{{ dpsStats.averageDPS.toFixed(0) }}</span>
                    </div>
                    <div class="text-sm text-white/90">
                        总伤害: <span class="font-mono text-success">{{ formatNumber(dpsStats.totalDamage) }}</span>
                    </div>
                    <div class="text-sm text-white/90">
                        时间: <span class="font-mono">{{ dpsStats.elapsedTime.toFixed(1) }}s</span>
                    </div>
                </div>

                <!-- 敌人选择器 -->
                <div class="absolute top-2.5 right-2.5 flex flex-col gap-1.5 pointer-events-auto items-end">
                    <label class="text-white text-sm font-semibold">选择敌人:</label>
                    <select
                        v-model="selectedEnemy"
                        @change="handleEnemyChange"
                        class="select select-sm select-bordered w-64 bg-base-200/90 border-base-content/20 hover:border-primary focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/30"
                    >
                        <option value="">-- 选择敌人 --</option>
                        <option v-for="mob in mobList" :key="mob.名称" :value="mob.名称">
                            {{ mob.名称 }} ({{ mob.阵营 }}) - HP: {{ formatNumber(mob.生命) }}
                        </option>
                    </select>

                    <!-- 角色信息移动到敌人选择器下方 -->
                    <span class="text-white text-base font-semibold">{{ characterName }}</span>
                    <span class="text-sm font-medium" :class="getElementClass(gameState.player.charData.属性)">
                        {{ gameState.player.charData.属性 }}
                    </span>
                </div>

                <!-- 技能栏 -->
                <div class="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-2.5">
                    <div
                        class="relative w-20 h-20 bg-base-200/90 border-2 border-primary rounded-lg flex flex-col items-center justify-center pointer-events-auto"
                        :class="{ 'opacity-50 border-base-content/30': eCooldown > 0 }"
                    >
                        <div class="text-2xl font-bold mb-1">E</div>
                        <div class="text-xs text-center px-1.5 w-full truncate">{{ gameState.player.skills[0]?.名称 || "N/A" }}</div>
                        <div
                            v-if="eCooldown > 0"
                            class="absolute inset-0 bg-neutral/70 flex items-center justify-center text-lg font-semibold rounded-md"
                        >
                            {{ eCooldown.toFixed(1) }}s
                        </div>
                    </div>

                    <div
                        class="relative w-20 h-20 bg-base-200/90 border-2 border-primary rounded-lg flex flex-col items-center justify-center pointer-events-auto"
                        :class="{ 'opacity-50 border-base-content/30': qCooldown > 0 }"
                    >
                        <div class="text-2xl font-bold mb-1">Q</div>
                        <div class="text-xs text-center px-1.5 w-full truncate">{{ gameState.player.skills[1]?.名称 || "N/A" }}</div>
                        <div
                            v-if="qCooldown > 0"
                            class="absolute inset-0 bg-neutral/70 flex items-center justify-center text-lg font-semibold rounded-md"
                        >
                            {{ qCooldown.toFixed(1) }}s
                        </div>
                    </div>
                </div>

                <!-- 敌人血量显示 -->
                <div v-if="gameState.enemy" class="absolute top-20 left-1/2 -translate-x-1/2 w-80 text-center pointer-events-auto">
                    <div class="text-white text-sm font-semibold mb-2">{{ gameState.enemy.data.名称 }}</div>
                    <div class="relative h-6 bg-base-200/90 rounded-full overflow-hidden border-2 border-base-content/20">
                        <div class="absolute h-full bg-info transition-all duration-300" :style="{ width: shieldPercent + '%' }"></div>
                        <div class="absolute h-full bg-success transition-all duration-300" :style="{ width: healthPercent + '%' }"></div>
                    </div>
                    <div class="mt-1.5 text-white text-xs font-medium">
                        {{ formatNumber(gameState.enemy.currentHealth) }} / {{ formatNumber(gameState.enemy.maxHealth) }}
                        <span v-if="gameState.enemy.maxShield > 0" class="text-info">
                            (护盾: {{ formatNumber(gameState.enemy.currentShield) }})
                        </span>
                    </div>
                </div>

                <!-- 操作说明 -->
                <div class="absolute bottom-2.5 left-2.5 flex flex-col gap-1 pointer-events-auto">
                    <div class="text-white/60 text-xs px-2 py-1 bg-neutral/80 rounded w-fit">WASD - 移动</div>
                    <div class="text-white/60 text-xs px-2 py-1 bg-neutral/80 rounded w-fit">鼠标左键 - 近战</div>
                    <div class="text-white/60 text-xs px-2 py-1 bg-neutral/80 rounded w-fit">鼠标右键 - 远程</div>
                    <div class="text-white/60 text-xs px-2 py-1 bg-neutral/80 rounded w-fit">E/Q - 技能</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useShooterGame } from "../../composables/useShooterGame"

const props = defineProps<{
    characterName: string
}>()

const selectedEnemy = ref(0)

// @ts-ignore
const { canvasRef, canvasSize, gameState, eCooldown, qCooldown, start, stop, handleEnemySelect, mobList, dpsStats } = useShooterGame(props)

const handleEnemyChange = () => {
    if (selectedEnemy.value) {
        handleEnemySelect(selectedEnemy.value)
    }
}

const healthPercent = computed(() => {
    if (!gameState.value.enemy) return 0
    return (gameState.value.enemy.currentHealth / gameState.value.enemy.maxHealth) * 100
})

const shieldPercent = computed(() => {
    if (!gameState.value.enemy) return 0
    return (gameState.value.enemy.currentShield / gameState.value.enemy.maxShield) * 100
})

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + "M"
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + "K"
    }
    return num.toString()
}

function getElementClass(element: string): string {
    const classMap: Record<string, string> = {
        光: "text-warning",
        暗: "text-white/50",
        水: "text-info",
        火: "text-error",
        雷: "text-secondary",
        风: "text-success",
    }
    return classMap[element] || "text-white"
}

onMounted(() => {
    start()
})

onUnmounted(() => {
    stop()
})
</script>
