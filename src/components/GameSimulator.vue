<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useShooterGame } from "../composables/useShooterGame"

const props = defineProps<{
    characterName: string
}>()

const selectedEnemy = ref(0)
const enemyLevel = ref(180)

// @ts-ignore
const { canvasRef, canvasSize, gameState, eCooldown, qCooldown, start, stop, handleEnemySelect, mobList, dpsStats } = useShooterGame(props)

const addEnemy = () => {
    if (selectedEnemy.value) {
        handleEnemySelect(selectedEnemy.value, enemyLevel.value)
    }
}

const healthPercent = computed(() => {
    if (gameState.value.enemies.length === 0) return 0
    // 计算所有敌人的平均血量百分比
    const totalPercent = gameState.value.enemies.reduce((sum, enemy) => sum + (enemy.currentHealth / enemy.maxHealth) * 100, 0)
    return totalPercent / gameState.value.enemies.length
})

const shieldPercent = computed(() => {
    if (gameState.value.enemies.length === 0) return 0
    // 计算所有敌人的平均护盾百分比
    const totalPercent = gameState.value.enemies.reduce((sum, enemy) => sum + (enemy.currentShield / enemy.maxShield) * 100, 0)
    return totalPercent / gameState.value.enemies.length
})

const sanityPercent = computed(() => {
    const maxSanity = gameState.value.player.maxSanity || 150
    const currentSanity = gameState.value.player.sanity || maxSanity
    return (currentSanity / maxSanity) * 100
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

                <!-- 神智显示 -->
                <div class="absolute top-2.5 left-2.5 mt-44 flex flex-col gap-1 pointer-events-auto bg-neutral/80 p-3 rounded-lg min-w-48">
                    <div class="text-white text-sm font-semibold">神智</div>
                    <div class="relative h-4 bg-base-200/90 rounded-full overflow-hidden border border-base-content/20">
                        <div class="absolute h-full bg-secondary transition-all duration-300" :style="{ width: sanityPercent + '%' }"></div>
                    </div>
                    <div class="text-xs text-white/90 font-medium">
                        {{ formatNumber(Math.round(gameState.player.sanity || 0)) }} /
                        {{ formatNumber(gameState.player.maxSanity || 0) }}
                        <span v-if="(gameState.player.sanityRegenRate || 0) > 0" class="text-info">
                            (+{{ formatNumber(gameState.player.sanityRegenRate || 0) }}/s)
                        </span>
                    </div>
                </div>

                <!-- 敌人选择器 -->
                <div class="absolute top-2.5 right-2.5 flex flex-col gap-1.5 pointer-events-auto items-end">
                    <label class="text-white text-sm font-semibold">选择敌人:</label>
                    <div class="flex gap-4">
                        <select
                            v-model="selectedEnemy"
                            class="select select-sm select-bordered w-32 bg-base-200/90 border-base-content/20 hover:border-primary focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/30"
                        >
                            <option value="">-- 选择敌人 --</option>
                            <option v-for="mob in mobList" :key="mob.id" :value="mob.id">
                                {{ mob.名称 }} ({{ ["其他", "秽兽", "海伯利亚帝国", "神弃者同盟", "艾利西安传颂会", "华胥"][mob.阵营] }}) -
                                HP:
                                {{ formatNumber(mob.getHPByLevel(enemyLevel)) }}
                            </option>
                        </select>
                        <input
                            v-model="enemyLevel"
                            type="number"
                            min="1"
                            max="200"
                            class="input input-sm input-bordered w-32 bg-base-200/90 border-base-content/20 hover:border-primary focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/30"
                        />
                        <div class="btn btn-sm btn-primary" @click="addEnemy">添加敌人</div>
                    </div>
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
                <div
                    v-if="gameState.enemies.length > 0"
                    class="absolute top-20 left-1/2 -translate-x-1/2 w-80 text-center pointer-events-auto"
                >
                    <div class="text-white text-sm font-semibold mb-2">
                        {{ gameState.enemies[0].data.名称 }} ({{ gameState.enemies.length }}个)
                    </div>
                    <div class="relative h-6 bg-base-200/90 rounded-full overflow-hidden border-2 border-base-content/20">
                        <div class="absolute h-full bg-info transition-all duration-300" :style="{ width: shieldPercent + '%' }"></div>
                        <div class="absolute h-full bg-success transition-all duration-300" :style="{ width: healthPercent + '%' }"></div>
                    </div>
                    <div class="mt-1.5 text-white text-xs font-medium">
                        {{ formatNumber(gameState.enemies.reduce((sum, e) => sum + e.currentHealth, 0)) }} /
                        {{ formatNumber(gameState.enemies.reduce((sum, e) => sum + e.maxHealth, 0)) }}
                        <span v-if="gameState.enemies.some((e) => e.maxShield > 0)" class="text-info">
                            (护盾: {{ formatNumber(gameState.enemies.reduce((sum, e) => sum + e.currentShield, 0)) }})
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
