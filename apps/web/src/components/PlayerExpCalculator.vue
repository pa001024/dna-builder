<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNARoleEntity } from "dna-api"
import { computed, ref } from "vue"
import { modMap } from "@/data"
import { ExpPerReason, ExtraExpInputMax, PlayerLevelMaxExp, PlayerLevelMaxLevel } from "@/data/d/player.data"
import { useInvStore } from "@/store/inv"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

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

/**
 * 手动经验来源默认值
 */
const MANUAL_EXP_SOURCE_DEFAULTS = {
    每日任务: 0,
    其他: 0,
    魔灵获取: 0,
    魔灵突破: 0,
    角色获取: 0,
    角色溯源: 0,
    武器获取: 0,
    武器熔炼: 0,
}

/**
 * 手动经验来源显示顺序
 */
const MANUAL_EXP_SOURCE_ORDER = ["每日任务", "其他", "魔灵获取", "魔灵突破", "角色获取", "角色溯源", "武器获取", "武器熔炼"] as const

// 用户输入的经验来源
const manualExpSources = useLocalStorage<Record<string, number>>("playerExp.manual", {
    ...MANUAL_EXP_SOURCE_DEFAULTS,
})

// 校验并修复 manualExpSources 数据
function validateManualExpSources() {
    // 先检查字段是否在默认值中，不在则删除
    for (const key in manualExpSources.value) {
        if (!(key in MANUAL_EXP_SOURCE_DEFAULTS)) {
            delete manualExpSources.value[key]
        } else {
            const value = manualExpSources.value[key]
            if (typeof value !== "number" || isNaN(value) || value < 0) {
                manualExpSources.value[key] = MANUAL_EXP_SOURCE_DEFAULTS[key as keyof typeof MANUAL_EXP_SOURCE_DEFAULTS]
            }
        }
    }

    // 再补齐可能缺失的新字段，避免旧本地数据不显示新来源
    for (const key of MANUAL_EXP_SOURCE_ORDER) {
        if (!(key in manualExpSources.value)) {
            manualExpSources.value[key] = MANUAL_EXP_SOURCE_DEFAULTS[key]
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
        ...MANUAL_EXP_SOURCE_DEFAULTS,
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
    for (let i = 0; i < PlayerLevelMaxLevel; i++) {
        if (totalExp.value < accumulatedExp + PlayerLevelMaxExp[i]) {
            return i + 1
        }
        accumulatedExp += PlayerLevelMaxExp[i]
    }
    return PlayerLevelMaxLevel
})

const expToNextLevel = computed(() => {
    if (currentLevel.value >= PlayerLevelMaxLevel) {
        return PlayerLevelMaxExp[PlayerLevelMaxLevel - 1]
    }
    return PlayerLevelMaxExp[currentLevel.value - 1]
})

const remainingExp = computed(() => {
    let accumulatedExp = 0
    for (let i = 0; i < currentLevel.value - 1; i++) {
        accumulatedExp += PlayerLevelMaxExp[i]
    }
    return totalExp.value - accumulatedExp
})

const progressPercent = computed(() => {
    if (expToNextLevel.value <= 0) {
        return 100
    }
    return Math.min(100, Math.round((remainingExp.value / expToNextLevel.value) * 100))
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
        ...MANUAL_EXP_SOURCE_DEFAULTS,
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
                ...MANUAL_EXP_SOURCE_DEFAULTS,
            }
            for (const key in data.manual) {
                if (!(key in MANUAL_EXP_SOURCE_DEFAULTS)) {
                    delete data.manual[key]
                } else {
                    const value = data.manual[key]
                    if (typeof value !== "number" || isNaN(value) || value < 0) {
                        data.manual[key] = defaults[key as keyof typeof defaults]
                    }
                }
            }
            for (const key of MANUAL_EXP_SOURCE_ORDER) {
                if (!(key in data.manual)) {
                    data.manual[key] = MANUAL_EXP_SOURCE_DEFAULTS[key]
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
    <div class="stagger-rise grid grid-cols-1 gap-3 md:grid-cols-2">
        <!-- 顶部操作栏 -->
        <div class="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
            <button
                type="button"
                class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xs border border-primary bg-primary px-3 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="syncing"
                @click="syncGameData"
            >
                <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                <Icon v-else icon="ri:refresh-line" class="block size-4" />
                {{ $t("player-exp.sync_game") }}
            </button>
            <button
                type="button"
                class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/20 px-3 text-xs text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                @click="importData"
            >
                <Icon icon="ri:clipboard-line" class="block size-4" />
                {{ $t("player-exp.import_json") }}
            </button>
            <button
                type="button"
                class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/20 px-3 text-xs text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                @click="exportData"
            >
                <Icon icon="ri:file-copy-line" class="block size-4" />
                {{ $t("player-exp.copy_json") }}
            </button>
            <button
                type="button"
                class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xs border border-error/40 px-3 text-xs text-error/80 transition-colors duration-150 hover:border-error hover:bg-error/10 hover:text-error active:scale-[0.97]"
                @click="resetData"
            >
                <Icon icon="ri:delete-bin-line" class="block size-4" />
                {{ $t("player-exp.reset") }}
            </button>
        </div>

        <!-- 等级显示 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm md:col-span-2">
            <SectionHeader no-animate compact kicker="LEVEL" :title="$t('player-exp.level')">
                <template #trailing>
                    <span class="font-orbitron text-[15px] font-semibold tabular-nums text-primary">{{ currentLevel }}</span>
                </template>
            </SectionHeader>
            <div class="flex items-center gap-3">
                <span class="shrink-0 font-orbitron text-[11px] font-semibold tabular-nums text-base-content/50">
                    {{ remainingExp.toLocaleString() }}
                    / {{ expToNextLevel.toLocaleString() }}
                </span>
                <div class="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-xs bg-base-content/10">
                    <div
                        class="absolute inset-y-0 left-0 rounded-xs bg-primary transition-all duration-300"
                        :style="{ width: `${progressPercent}%` }"
                    />
                </div>
                <span class="min-w-12 shrink-0 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary"
                    >{{ progressPercent }}%</span
                >
            </div>
            <div
                class="mt-3 flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="text-[11px] tracking-wide text-base-content/55">{{ $t("player-exp.total_exp") }}</span>
                <span class="font-orbitron text-[15px] font-semibold tabular-nums text-primary">{{ totalExp.toLocaleString() }}</span>
            </div>
        </section>

        <!-- 手动输入 -->
        <section class="flex flex-col rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="MANUAL" :title="$t('player-exp.manual_input')" />
            <div class="space-y-2.5">
                <div v-for="reason in MANUAL_EXP_SOURCE_ORDER" :key="reason" class="grid grid-cols-[1fr_4.5rem] items-end gap-3">
                    <div class="min-w-0">
                        <div class="mb-1 flex items-baseline justify-between gap-2">
                            <span class="truncate text-[11px] tracking-wide text-base-content/55"
                                >{{ reason }}{{ ["每日任务", "其他", "魔灵获取", "魔灵突破"].includes(reason) ? "" : "(可同步)" }}</span
                            >
                            <span class="shrink-0 text-[10px] text-base-content/35">{{ getExpPerItemLabel(reason) }}</span>
                        </div>
                        <input
                            v-model.number="manualExpSources[reason]"
                            type="number"
                            min="0"
                            class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] tabular-nums text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            :placeholder="$t('player-exp.amount')"
                        />
                    </div>
                    <span class="pb-1 text-right font-orbitron text-[13px] font-semibold tabular-nums text-base-content/45">
                        {{ getExpPerItem(reason) }}
                    </span>
                </div>
            </div>
            <div class="mt-auto flex items-center justify-between gap-2 border-t border-base-content/10 pt-2">
                <span class="text-[11px] tracking-wide text-base-content/55">{{ $t("player-exp.subtotal") }}</span>
                <span class="text-[15px] font-semibold tabular-nums text-primary">{{
                    $t("common.label_exp", { count: manualTotalExp.toLocaleString() })
                }}</span>
            </div>
        </section>

        <!-- 突破记录 -->
        <section class="flex flex-col rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BREAKTHROUGH" :title="$t('player-exp.breakthrough_record')" />
            <div class="space-y-3">
                <div v-for="(counts, reason) in breakthroughRecords" :key="reason" class="space-y-1.5">
                    <div class="text-[11px] tracking-wide text-base-content/55">{{ reason }}</div>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                        <div v-for="(_, index) in counts" :key="index" class="space-y-1">
                            <div class="text-[10px] text-base-content/40">{{ $t("player-exp.nth_time", { n: index + 1 }) }}</div>
                            <div class="flex items-center gap-2">
                                <input
                                    v-model.number="breakthroughRecords[reason][index]"
                                    type="number"
                                    min="0"
                                    class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] tabular-nums text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                    :placeholder="$t('player-exp.times')"
                                />
                                <span class="shrink-0 font-orbitron text-[11px] font-semibold tabular-nums text-base-content/45">{{
                                    getExpPerItem(reason, index)
                                }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="mt-auto flex items-center justify-between gap-2 border-t border-base-content/10 pt-2">
                <span class="text-[11px] tracking-wide text-base-content/55">{{ $t("player-exp.subtotal") }}</span>
                <span class="text-[15px] font-semibold tabular-nums text-primary">{{
                    $t("common.label_exp", { count: breakthroughTotalExp.toLocaleString() })
                }}</span>
            </div>
        </section>

        <!-- 额外经验 -->
        <section class="flex flex-col rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm md:col-span-2">
            <SectionHeader no-animate compact kicker="EXTRA" :title="$t('player-exp.extra_exp')" />
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div v-for="(_, reason) in extraExpInputs" :key="reason" class="space-y-1">
                    <div class="flex items-baseline justify-between gap-2">
                        <span class="truncate text-[11px] tracking-wide text-base-content/55">{{ reason }}</span>
                        <span class="shrink-0 text-[10px] tabular-nums text-base-content/35">{{
                            $t("player-exp.max_value", {
                                value: ExtraExpInputMax[reason as keyof typeof ExtraExpInputMax].toLocaleString(),
                            })
                        }}</span>
                    </div>
                    <input
                        v-model.number="extraExpInputs[reason]"
                        type="number"
                        min="0"
                        :max="ExtraExpInputMax[reason as keyof typeof ExtraExpInputMax]"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] tabular-nums text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        :placeholder="$t('player-exp.exp_value')"
                    />
                </div>
            </div>
            <div class="mt-auto flex items-center justify-between gap-2 border-t border-base-content/10 pt-2">
                <span class="text-[11px] tracking-wide text-base-content/55">{{ $t("player-exp.subtotal") }}</span>
                <span class="text-[15px] font-semibold tabular-nums text-primary">{{
                    $t("common.label_exp", { count: extraTotalExp.toLocaleString() })
                }}</span>
            </div>
        </section>

        <!-- 魔之楔经验 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm md:col-span-2">
            <SectionHeader no-animate compact kicker="MODS" :title="$t('player-exp.mod_exp')">
                <template #trailing>
                    <span class="text-[11px] text-base-content/45">{{ $t("player-exp.auto_calc") }}</span>
                </template>
            </SectionHeader>
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-[11px] tracking-wide text-base-content/55">{{ $t("player-exp.mod_acquisition") }}</span>
                <span class="font-orbitron text-[15px] font-semibold tabular-nums text-primary">{{ modExp.toLocaleString() }}</span>
            </div>
        </section>

        <!-- 经验来源详情 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm md:col-span-2">
            <SectionHeader no-animate compact kicker="DETAIL" :title="$t('player-exp.exp_source_detail')" />
            <div class="overflow-x-auto">
                <table class="w-full min-w-100">
                    <thead>
                        <tr class="border-b border-base-content/20">
                            <th class="px-3 py-2 text-left text-[10px] text-base-content/40">{{ $t("player-exp.source") }}</th>
                            <th class="px-3 py-2 text-right text-[10px] text-base-content/40">{{ $t("player-exp.amount") }}</th>
                            <th class="px-3 py-2 text-right text-[10px] text-base-content/40">{{ $t("player-exp.exp_per_unit") }}</th>
                            <th class="px-3 py-2 text-right text-[10px] text-base-content/40">{{ $t("player-exp.total_exp") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(count, reason) in manualExpSources"
                            :key="'manual-' + reason"
                            class="border-b border-base-content/10 transition-colors duration-200 hover:bg-base-content/4"
                        >
                            <td class="px-3 py-2 text-sm">{{ reason }}</td>
                            <td class="px-3 py-2 text-right text-sm tabular-nums">{{ count }}</td>
                            <td class="px-3 py-2 text-right text-sm tabular-nums text-base-content/55">{{ getExpPerItem(reason) }}</td>
                            <td class="px-3 py-2 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                {{ (count * getExpPerItem(reason)).toLocaleString() }}
                            </td>
                        </tr>
                        <tr
                            v-for="(counts, reason) in breakthroughRecords"
                            :key="'breakthrough-' + reason"
                            class="border-b border-base-content/10 transition-colors duration-200 hover:bg-base-content/4"
                        >
                            <td class="px-3 py-2 text-sm">{{ reason }}</td>
                            <td class="px-3 py-2 text-right text-sm tabular-nums text-base-content/55">{{ counts.join(", ") }}</td>
                            <td class="px-3 py-2 text-right text-sm tabular-nums text-base-content/55">{{ formatExpValue(reason) }}</td>
                            <td class="px-3 py-2 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                {{ counts.reduce((sum, count, i) => sum + count * getExpPerItem(reason, i), 0).toLocaleString() }}
                            </td>
                        </tr>
                        <tr
                            v-for="(exp, reason) in extraExpInputs"
                            :key="'extra-' + reason"
                            class="border-b border-base-content/10 transition-colors duration-200 hover:bg-base-content/4"
                        >
                            <td class="px-3 py-2 text-sm">{{ reason }}</td>
                            <td class="px-3 py-2 text-right text-sm text-base-content/35">-</td>
                            <td class="px-3 py-2 text-right text-sm text-base-content/35">-</td>
                            <td class="px-3 py-2 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                {{ exp.toLocaleString() }}
                            </td>
                        </tr>
                        <tr class="border-b border-base-content/10 bg-base-content/3">
                            <td class="px-3 py-2 text-sm text-base-content/80">{{ $t("player-exp.mod_acquisition") }}</td>
                            <td class="px-3 py-2 text-right text-sm text-base-content/35">-</td>
                            <td class="px-3 py-2 text-right text-sm text-base-content/35">-</td>
                            <td class="px-3 py-2 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                {{ modExp.toLocaleString() }}
                            </td>
                        </tr>
                        <tr class="border-t-2 border-primary/40">
                            <td class="px-3 py-2.5 text-sm font-semibold text-base-content">{{ $t("player-exp.total") }}</td>
                            <td class="px-3 py-2.5 text-right text-sm text-base-content/35">-</td>
                            <td class="px-3 py-2.5 text-right text-sm text-base-content/35">-</td>
                            <td class="px-3 py-2.5 text-right font-orbitron text-[15px] font-semibold tabular-nums text-primary">
                                {{ totalExp.toLocaleString() }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</template>
