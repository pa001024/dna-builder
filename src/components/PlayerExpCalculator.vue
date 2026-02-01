<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNARoleEntity } from "dna-api"
import { computed, ref } from "vue"
import { modMap } from "../data"
import { ExpPerReason, ExtraExpInputMax, PlayerLevelMaxExp } from "../data/d/player.data"
import { useInvStore } from "../store/inv"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

const ui = useUIStore()
const inv = useInvStore()

// 突破等级点
const BREAKTHROUGH_LEVELS = [0, 20, 30, 40, 50, 60, 70, 80]

// 魔之楔品质对应数组索引
const MOD_QUALITY_INDEX: Record<string, number> = {
    白: 0,
    绿: 1,
    蓝: 2,
    紫: 3,
    金: 4,
}

// 用户输入的经验来源
const manualExpSources = useLocalStorage<Record<string, number>>("playerExp.manual", {
    每日任务: 0,
    魔灵获取: 0,
    魔灵突破: 0,
    角色获取: 0,
    角色溯源: 0,
    武器获取: 0,
    武器熔炼: 0,
})

// 校验并修复 manualExpSources 数据
function validateManualExpSources() {
    const defaults = {
        每日任务: 0,
        魔灵获取: 0,
        魔灵突破: 0,
        角色获取: 0,
        角色溯源: 0,
        武器获取: 0,
        武器熔炼: 0,
    }
    // 先检查字段是否在默认值中，不在则删除
    for (const key in manualExpSources.value) {
        if (!(key in defaults)) {
            delete manualExpSources.value[key]
        } else {
            const value = manualExpSources.value[key]
            if (typeof value !== "number" || isNaN(value) || value < 0) {
                manualExpSources.value[key] = defaults[key as keyof typeof defaults]
            }
        }
    }
}

// 初始化时进行校验
validateManualExpSources()

// 突破记录（记录每次突破的次数）
const breakthroughRecords = useLocalStorage<Record<string, number[]>>("playerExp.breakthrough", {
    角色突破: [0, 0, 0, 0, 0, 0],
    武器突破: [0, 0, 0, 0, 0, 0],
})

// 校验并修复 breakthroughRecords 数据
function validateBreakthroughRecords() {
    const defaults = {
        角色突破: [0, 0, 0, 0, 0, 0],
        武器突破: [0, 0, 0, 0, 0, 0],
    }
    // 先检查字段是否在默认值中，不在则删除
    for (const key in breakthroughRecords.value) {
        if (!(key in defaults)) {
            delete breakthroughRecords.value[key]
        } else {
            const value = breakthroughRecords.value[key]
            if (!Array.isArray(value) || value.length !== 6) {
                breakthroughRecords.value[key] = [...defaults[key as keyof typeof defaults]]
            } else {
                for (let i = 0; i < value.length; i++) {
                    if (typeof value[i] !== "number" || isNaN(value[i]) || value[i] < 0) {
                        breakthroughRecords.value[key][i] = defaults[key as keyof typeof defaults][i]
                    }
                }
            }
        }
    }
}

// 初始化时进行校验
validateBreakthroughRecords()

// 额外经验输入
const extraExpInputs = useLocalStorage<Record<string, number>>("playerExp.extra", {
    任务奖励: 0,
    魔之楔: 0,
})

// 校验并修复 extraExpInputs 数据
function validateExtraExpInputs() {
    const defaults = {
        任务奖励: 0,
        魔之楔: 0,
    }
    // 先检查字段是否在默认值中，不在则删除
    for (const key in extraExpInputs.value) {
        if (!(key in defaults)) {
            delete extraExpInputs.value[key]
        } else {
            const value = extraExpInputs.value[key]
            if (typeof value !== "number" || isNaN(value) || value < 0) {
                extraExpInputs.value[key] = defaults[key as keyof typeof defaults]
            }
        }
    }
}

// 初始化时进行校验
validateExtraExpInputs()

// 同步状态
const syncing = ref(false)
const roleInfo = useLocalStorage<DNARoleEntity>("dna.roleInfo", {} as any)

/**
 * 检查配置是否被修改
 * @returns 是否所有值都是默认值
 */
function isConfigModified(): boolean {
    const manualDefaults = {
        每日任务: 0,
        魔灵获取: 0,
        魔灵突破: 0,
        角色获取: 0,
        角色溯源: 0,
        武器获取: 0,
        武器熔炼: 0,
    }
    const breakthroughDefaults = {
        角色突破: [0, 0, 0, 0, 0, 0],
        武器突破: [0, 0, 0, 0, 0, 0],
    }
    const extraDefaults = {
        任务奖励: 0,
        魔之楔: 0,
    }

    // 检查 manualExpSources
    for (const key in manualDefaults) {
        if (manualExpSources.value[key as keyof typeof manualDefaults] !== manualDefaults[key as keyof typeof manualDefaults]) {
            return true
        }
    }

    // 检查 breakthroughRecords
    for (const key in breakthroughDefaults) {
        const current = breakthroughRecords.value[key as keyof typeof breakthroughDefaults]
        const def = breakthroughDefaults[key as keyof typeof breakthroughDefaults]
        if (current.length !== def.length || current.some((v, i) => v !== def[i])) {
            return true
        }
    }

    // 检查 extraExpInputs
    for (const key in extraDefaults) {
        if (extraExpInputs.value[key as keyof typeof extraDefaults] !== extraDefaults[key as keyof typeof extraDefaults]) {
            return true
        }
    }

    return false
}

/**
 * 从 roleInfo 导入数据
 */
function importFromRoleInfo() {
    const roleShow = roleInfo.value?.roleInfo?.roleShow
    if (!roleShow) {
        return
    }

    // 只计算已解锁的角色
    const unlockedChars = (roleShow.roleChars || []).filter(c => c.unLocked)
    manualExpSources.value.角色获取 = unlockedChars.length

    // 计算角色突破经验（累加所有角色的突破）
    let charBreakthroughCounts = [0, 0, 0, 0, 0, 0]
    for (const char of unlockedChars) {
        const counts = calculateBreakthroughCounts(char.level)
        for (let i = 0; i < counts.length; i++) {
            charBreakthroughCounts[i] += counts[i]
        }
    }
    breakthroughRecords.value.角色突破 = charBreakthroughCounts

    // 计算角色溯源经验
    let charTraceCount = 0
    for (const char of unlockedChars) {
        charTraceCount += char.gradeLevel || 0
    }
    manualExpSources.value.角色溯源 = charTraceCount

    // 合并近战和远程武器
    const allWeapons = [
        ...(roleShow.closeWeapons || []).filter(w => w.unLocked),
        ...(roleShow.langRangeWeapons || []).filter(w => w.unLocked),
    ]

    // 对武器进行去重，相同ID的武器只取最大值
    const weaponMap = new Map<number, (typeof allWeapons)[0]>()
    for (const weapon of allWeapons) {
        const existing = weaponMap.get(weapon.weaponId)
        if (!existing) {
            weaponMap.set(weapon.weaponId, { ...weapon })
        } else {
            // 比较并保留更大的值
            const newLevel = Math.max(existing.level, weapon.level)
            const newSkillLevel = Math.max(existing.skillLevel || 0, weapon.skillLevel || 0)
            weaponMap.set(weapon.weaponId, {
                ...existing,
                level: newLevel,
                skillLevel: newSkillLevel,
            })
        }
    }
    const uniqueWeapons = Array.from(weaponMap.values())

    manualExpSources.value.武器获取 = uniqueWeapons.length

    // 计算武器突破经验（累加所有武器的突破）
    let weaponBreakthroughCounts = [0, 0, 0, 0, 0, 0]
    for (const weapon of uniqueWeapons) {
        const counts = calculateBreakthroughCounts(weapon.level)
        for (let i = 0; i < counts.length; i++) {
            weaponBreakthroughCounts[i] += counts[i]
        }
    }
    breakthroughRecords.value.武器突破 = weaponBreakthroughCounts

    // 计算武器熔炼经验
    let weaponRefineExp = 0
    for (const weapon of uniqueWeapons) {
        weaponRefineExp += weapon.skillLevel || 0
    }
    manualExpSources.value.武器熔炼 = weaponRefineExp
}

// 初始化时尝试从 roleInfo 加载数据（只在未修改时）
if (!isConfigModified()) {
    importFromRoleInfo()
}

/**
 * 获取经验来源的单次经验值
 * @param reason 经验来源名称
 * @param index 索引（用于数组和突破类）
 * @returns 单次经验值
 */
function getExpPerItem(reason: string, index = 0): number {
    const expPerItem = ExpPerReason[reason as keyof typeof ExpPerReason]
    if (Array.isArray(expPerItem)) {
        return expPerItem[index] || expPerItem[0]
    }
    return expPerItem
}

/**
 * 计算突破次数
 * @param level 当前等级
 * @returns 突破次数数组，记录每次突破的次数
 */
function calculateBreakthroughCounts(level: number): number[] {
    const counts = [0, 0, 0, 0, 0, 0]
    for (let i = 1; i < BREAKTHROUGH_LEVELS.length; i++) {
        if (level > BREAKTHROUGH_LEVELS[i]) {
            counts[i - 1] = 1
        }
    }
    return counts
}

/**
 * 计算总经验
 */
const totalExp = computed(() => {
    let total = 0

    // 手动输入的经验来源
    for (const [reason, count] of Object.entries(manualExpSources.value)) {
        if (count > 0) {
            const expPerItem = ExpPerReason[reason as keyof typeof ExpPerReason]
            if (Array.isArray(expPerItem)) {
                total += expPerItem[0] * count
            } else {
                total += expPerItem * count
            }
        }
    }

    // 突破记录的经验
    for (const [reason, counts] of Object.entries(breakthroughRecords.value)) {
        const expPerItem = ExpPerReason[reason as keyof typeof ExpPerReason]
        if (Array.isArray(expPerItem)) {
            for (let i = 0; i < counts.length && i < expPerItem.length; i++) {
                total += expPerItem[i] * counts[i]
            }
        }
    }

    // 额外经验
    for (const [, exp] of Object.entries(extraExpInputs.value)) {
        total += exp
    }

    return total
})

/**
 * 计算当前等级和剩余经验
 */
const currentLevel = computed(() => {
    let accumulatedExp = 0
    for (let i = 0; i < PlayerLevelMaxExp.length; i++) {
        if (totalExp.value < accumulatedExp + PlayerLevelMaxExp[i]) {
            return i + 1
        }
        accumulatedExp += PlayerLevelMaxExp[i]
    }
    return PlayerLevelMaxExp.length + 1
})

const remainingExp = computed(() => {
    let accumulatedExp = 0
    for (let i = 0; i < currentLevel.value - 1; i++) {
        accumulatedExp += PlayerLevelMaxExp[i]
    }
    return totalExp.value - accumulatedExp
})

const expToNextLevel = computed(() => {
    if (currentLevel.value > PlayerLevelMaxExp.length) {
        return 0
    }
    return PlayerLevelMaxExp[currentLevel.value - 1]
})

const progressPercent = computed(() => {
    if (currentLevel.value > PlayerLevelMaxExp.length) {
        return 100
    }
    return Math.round((remainingExp.value / expToNextLevel.value) * 100)
})

/**
 * 同步游戏数据
 */
async function syncGameData() {
    const setting = useSettingStore()
    try {
        syncing.value = true
        const api = await setting.getDNAAPI()
        if (!api) {
            ui.showErrorMessage("请先登录皎皎角账号")
            return
        }

        await setting.startHeartbeat()
        const res = await api.defaultRoleForTool()
        if (!res.is_success) {
            ui.showErrorMessage("数据同步失败")
            return
        }

        roleInfo.value = res.data
        importFromRoleInfo()
        ui.showSuccessMessage("数据同步成功")
    } catch (e) {
        ui.showErrorMessage("数据同步失败:", e instanceof Error ? e.message : String(e))
    } finally {
        syncing.value = false
        setting.stopHeartbeat()
    }
}

/**
 * 重置所有数据
 */
function resetData() {
    manualExpSources.value = {
        每日任务: 0,
        魔灵获取: 0,
        魔灵突破: 0,
        角色获取: 0,
        角色溯源: 0,
        武器获取: 0,
        武器熔炼: 0,
    }
    breakthroughRecords.value = {
        角色突破: [0, 0, 0, 0, 0, 0],
        武器突破: [0, 0, 0, 0, 0, 0],
    }
    extraExpInputs.value = {
        任务奖励: 0,
        魔之楔: 0,
    }
}

/**
 * 导出数据
 */
function exportData() {
    const data = {
        manual: manualExpSources.value,
        breakthrough: breakthroughRecords.value,
        extra: extraExpInputs.value,
    }
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    ui.showSuccessMessage("已复制到剪贴板")
}

/**
 * 导入数据
 */
async function importData() {
    try {
        const text = await navigator.clipboard.readText()
        const data = JSON.parse(text)

        // 校验并修复 manualExpSources
        if (data.manual) {
            const defaults = {
                每日任务: 0,
                魔灵获取: 0,
                魔灵突破: 0,
                角色获取: 0,
                角色溯源: 0,
                武器获取: 0,
                武器熔炼: 0,
            }
            for (const key in data.manual) {
                if (!(key in defaults)) {
                    delete data.manual[key]
                } else {
                    const value = data.manual[key]
                    if (typeof value !== "number" || isNaN(value) || value < 0) {
                        data.manual[key] = defaults[key as keyof typeof defaults]
                    }
                }
            }
            manualExpSources.value = data.manual
        }

        // 校验并修复 breakthroughRecords
        if (data.breakthrough) {
            const defaults = {
                角色突破: [0, 0, 0, 0, 0, 0],
                武器突破: [0, 0, 0, 0, 0, 0],
            }
            for (const key in data.breakthrough) {
                if (!(key in defaults)) {
                    delete data.breakthrough[key]
                } else {
                    const value = data.breakthrough[key]
                    if (!Array.isArray(value) || value.length !== 6) {
                        data.breakthrough[key] = [...defaults[key as keyof typeof defaults]]
                    } else {
                        for (let i = 0; i < value.length; i++) {
                            if (typeof value[i] !== "number" || isNaN(value[i]) || value[i] < 0) {
                                data.breakthrough[key][i] = defaults[key as keyof typeof defaults][i]
                            }
                        }
                    }
                }
            }
            breakthroughRecords.value = data.breakthrough
        }

        // 校验并修复 extraExpInputs
        if (data.extra) {
            const defaults = {
                任务奖励: 0,
                魔之楔: 0,
            }
            for (const key in data.extra) {
                if (!(key in defaults)) {
                    delete data.extra[key]
                } else {
                    const value = data.extra[key]
                    if (typeof value !== "number" || isNaN(value) || value < 0) {
                        data.extra[key] = defaults[key as keyof typeof defaults]
                    }
                }
            }
            extraExpInputs.value = data.extra
        }

        ui.showSuccessMessage("导入成功")
    } catch (e) {
        ui.showErrorMessage("导入失败:", e instanceof Error ? e.message : String(e))
    }
}

/**
 * 计算魔之楔获取经验
 */
const modExp = computed(() => {
    let total = 0
    for (const [modId, [, count]] of Object.entries(inv.mods)) {
        const mod = modMap.get(+modId)
        if (mod) {
            const qualityIndex = MOD_QUALITY_INDEX[mod.品质]
            const expPerMod = getExpPerItem("魔之楔获取", qualityIndex)
            total += expPerMod * count
        }
    }
    return total
})

/**
 * 格式化经验值显示
 * @param reason 经验来源名称
 * @returns 格式化后的字符串
 */
function formatExpValue(reason: string): string {
    const value = ExpPerReason[reason as keyof typeof ExpPerReason]
    if (Array.isArray(value)) {
        return value.join(", ")
    }
    return value.toString()
}

/**
 * 获取数量单位标签
 * @param reason 经验来源名称
 * @returns 单位标签
 */
function getExpPerItemLabel(reason: string): string {
    const value = ExpPerReason[reason as keyof typeof ExpPerReason]
    if (Array.isArray(value)) {
        return "经验/次"
    }
    return "经验"
}

/**
 * 计算手动输入的总经验
 */
const manualTotalExp = computed(() => {
    let total = 0
    for (const [reason, count] of Object.entries(manualExpSources.value)) {
        total += count * getExpPerItem(reason)
    }
    return total
})

/**
 * 计算突破记录的总经验
 */
const breakthroughTotalExp = computed(() => {
    let total = 0
    for (const [reason, counts] of Object.entries(breakthroughRecords.value)) {
        for (let i = 0; i < counts.length; i++) {
            total += counts[i] * getExpPerItem(reason, i)
        }
    }
    return total
})

/**
 * 计算额外经验的总和
 */
const extraTotalExp = computed(() => {
    return Object.values(extraExpInputs.value).reduce((sum, exp) => sum + exp, 0)
})
</script>

<template>
    <ScrollArea class="h-full">
        <div class="flex h-full flex-col p-4 gap-4">
            <!-- 顶部操作栏 -->
            <div class="flex flex-wrap gap-2 justify-end">
                <button class="btn btn-sm btn-primary" @click="syncGameData" :disabled="syncing">
                    <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                    <span v-else>同步游戏</span>
                </button>
                <button class="btn btn-sm btn-secondary" @click="importData">导入JSON</button>
                <button class="btn btn-sm btn-secondary" @click="exportData">复制JSON</button>
                <button class="btn btn-sm btn-error" @click="resetData">重置</button>
            </div>

            <!-- 等级显示卡片 -->
            <div class="card bg-linear-to-r from-primary/20 to-secondary/20 border-2 border-primary/30">
                <div class="card-body p-6">
                    <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div class="flex items-center gap-4">
                            <div class="text-6xl text-center">
                                <div class="text-sm opacity-70">历练等级</div>
                                <span class="font-bold text-primary">{{ currentLevel }}</span>
                            </div>
                        </div>
                        <div class="flex-1 w-full md:w-auto">
                            <div class="flex justify-between text-sm mb-2">
                                <span>{{ remainingExp.toLocaleString() }} / {{ expToNextLevel.toLocaleString() }}</span>
                                <span class="font-semibold">{{ progressPercent }}%</span>
                            </div>
                            <div class="w-full bg-base-200 rounded-full h-3">
                                <div
                                    class="bg-primary h-3 rounded-full transition-all duration-300"
                                    :style="{ width: progressPercent + '%' }"
                                ></div>
                            </div>
                            <div class="text-center mt-3 text-lg font-medium">总经验: {{ totalExp.toLocaleString() }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 经验来源网格 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- 手动输入 -->
                <div class="card bg-base-200">
                    <div class="card-body p-4">
                        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span class="text-xl">✏️</span>
                            手动输入
                        </h3>
                        <div class="space-y-3">
                            <div v-for="(_, reason) in manualExpSources" :key="reason" class="space-y-1">
                                <div class="flex justify-between items-center">
                                    <label class="text-sm font-medium">
                                        {{ reason }}
                                        {{ ["每日任务", "魔灵获取", "魔灵突破"].includes(reason) ? "" : "(可同步)" }}
                                    </label>
                                    <span class="text-xs opacity-70">{{ getExpPerItemLabel(reason) }}</span>
                                </div>
                                <div class="flex gap-2">
                                    <input
                                        v-model.number="manualExpSources[reason]"
                                        type="number"
                                        min="0"
                                        class="input input-sm flex-1"
                                        placeholder="数量"
                                    />
                                    <div class="input input-sm w-28 text-right bg-base-300">{{ getExpPerItem(reason) }}</div>
                                </div>
                            </div>
                        </div>
                        <div class="mt-auto pt-4 text-right">
                            <span class="text-sm">小计: </span>
                            <span class="text-lg font-bold text-primary">{{ manualTotalExp.toLocaleString() }} 经验</span>
                        </div>
                    </div>
                </div>

                <!-- 突破记录 -->
                <div class="card bg-base-200">
                    <div class="card-body p-4">
                        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span class="text-xl">⭐</span>
                            突破记录
                        </h3>
                        <div class="space-y-4">
                            <div v-for="(counts, reason) in breakthroughRecords" :key="reason" class="space-y-2">
                                <div class="text-sm font-medium">{{ reason }}</div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div v-for="(_, index) in counts" :key="index" class="space-y-1">
                                        <label class="text-xs opacity-70">第{{ index + 1 }}次</label>
                                        <div class="flex gap-1">
                                            <input
                                                v-model.number="breakthroughRecords[reason][index]"
                                                type="number"
                                                min="0"
                                                class="input input-sm flex-1"
                                                placeholder="次数"
                                            />
                                            <div class="input input-sm w-12 text-center bg-base-300 text-xs">
                                                {{ getExpPerItem(reason, index) }}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="mt-auto pt-4 text-right">
                            <span class="text-sm">小计: </span>
                            <span class="text-lg font-bold text-primary">{{ breakthroughTotalExp.toLocaleString() }} 经验</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 额外经验 -->
            <div class="card bg-base-200">
                <div class="card-body p-4">
                    <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                        <span class="text-xl">🎁</span>
                        额外经验
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div v-for="(exp, reason) in extraExpInputs" :key="reason" class="space-y-2">
                            <div class="flex justify-between items-center">
                                <label class="text-sm font-medium">{{ reason }}</label>
                                <span class="text-xs opacity-70"
                                    >最大: {{ ExtraExpInputMax[reason as keyof typeof ExtraExpInputMax].toLocaleString() }}</span
                                >
                            </div>
                            <div class="flex gap-2">
                                <input
                                    v-model.number="extraExpInputs[reason]"
                                    type="number"
                                    min="0"
                                    :max="ExtraExpInputMax[reason as keyof typeof ExtraExpInputMax]"
                                    class="input input-sm flex-1"
                                    placeholder="经验值"
                                />
                                <div class="input input-sm w-28 text-right bg-base-300">
                                    {{ exp.toLocaleString() }}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-base-300 text-right">
                        <span class="text-sm">小计: </span>
                        <span class="text-lg font-bold text-primary">{{ extraTotalExp.toLocaleString() }} 经验</span>
                    </div>
                </div>
            </div>

            <!-- 魔之楔经验 -->
            <div class="card bg-linear-to-r from-purple-500/20 to-pink-500/20 border-2 border-purple-500/30">
                <div class="card-body p-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <span class="text-3xl">💎</span>
                            <div>
                                <div class="text-sm opacity-70">魔之楔经验</div>
                                <div class="text-xs opacity-60">(自动计算)</div>
                            </div>
                        </div>
                        <div class="text-3xl font-bold text-purple-500">{{ modExp.toLocaleString() }}</div>
                    </div>
                </div>
            </div>

            <!-- 经验来源详情 -->
            <div class="card bg-base-200">
                <div class="card-body p-4">
                    <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                        <span class="text-xl">📊</span>
                        经验来源详情
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="table table-sm w-full">
                            <thead>
                                <tr class="bg-base-300">
                                    <th class="text-left">来源</th>
                                    <th class="text-right">数量</th>
                                    <th class="text-right">单次经验</th>
                                    <th class="text-right">总经验</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(count, reason) in manualExpSources" :key="'manual-' + reason" class="hover:bg-base-100">
                                    <td>{{ reason }}</td>
                                    <td class="text-right">{{ count }}</td>
                                    <td class="text-right">{{ getExpPerItem(reason) }}</td>
                                    <td class="text-right font-medium">{{ (count * getExpPerItem(reason)).toLocaleString() }}</td>
                                </tr>
                                <tr
                                    v-for="(counts, reason) in breakthroughRecords"
                                    :key="'breakthrough-' + reason"
                                    class="hover:bg-base-100"
                                >
                                    <td>{{ reason }}</td>
                                    <td class="text-right">{{ counts.join(", ") }}</td>
                                    <td class="text-right">{{ formatExpValue(reason) }}</td>
                                    <td class="text-right font-medium">
                                        {{ counts.reduce((sum, count, i) => sum + count * getExpPerItem(reason, i), 0).toLocaleString() }}
                                    </td>
                                </tr>
                                <tr v-for="(exp, reason) in extraExpInputs" :key="'extra-' + reason" class="hover:bg-base-100">
                                    <td>{{ reason }}</td>
                                    <td class="text-right">-</td>
                                    <td class="text-right">-</td>
                                    <td class="text-right font-medium">{{ exp.toLocaleString() }}</td>
                                </tr>
                                <tr class="bg-linear-to-r from-purple-500/20 to-pink-500/20">
                                    <td class="font-bold">魔之楔获取</td>
                                    <td class="text-right">-</td>
                                    <td class="text-right">-</td>
                                    <td class="text-right font-bold">{{ modExp.toLocaleString() }}</td>
                                </tr>
                                <tr class="bg-primary text-primary-content font-bold text-lg">
                                    <td>总计</td>
                                    <td class="text-right">-</td>
                                    <td class="text-right">-</td>
                                    <td class="text-right">{{ totalExp.toLocaleString() }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
