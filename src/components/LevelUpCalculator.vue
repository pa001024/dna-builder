<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNARoleEntity } from "dna-api"
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue"
import {
    charData,
    charMap,
    Dungeon,
    dungeonMap,
    LeveledChar,
    LeveledMod,
    LeveledSkill,
    LeveledWeapon,
    modData,
    modMap,
    weaponData,
    weaponMap,
} from "@/data"
import { dataPackBootstrapLoading, dataPackHydrationKey, isDataPackHydrated } from "@/data/data-pack-bridge"
import {
    type CharLevelUpConfig,
    LevelUpCalculator,
    type LevelUpResult,
    type ModLevelUpConfig,
    type TimeEstimateConfig,
    type WeaponLevelUpConfig,
} from "@/data/LevelUpCalculator"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { getDungeonName, getDungeonRewardNames, getDungeonType } from "@/utils/dungeon-utils"

// 角色数据类型
interface CharItem {
    id: number
    config: CharLevelUpConfig
}

// 武器数据类型
interface WeaponItem {
    id: number
    config: WeaponLevelUpConfig
}

// 魔之楔数据类型
interface ModItem {
    id: number
    config: ModLevelUpConfig
}

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI

// 初始角色列表
const chars = useLocalStorage<CharItem[]>("lvup.chars", [])

// 初始武器列表
const weapons = useLocalStorage<WeaponItem[]>("lvup.weapons", [])

// 初始魔之楔列表
const mods = useLocalStorage<ModItem[]>("lvup.mods", [])

// 同步状态
const syncing = ref(false)
const roleInfo = useLocalStorage<DNARoleEntity>("dna.roleInfo", {} as any)

// 批量添加角色相关
const isBatchAddCharsModalOpen = ref(false)
const charSearchQuery = ref("")
const selectedCharsForBatch = ref<Set<number>>(new Set())

// 批量添加武器相关
const isBatchAddWeaponsModalOpen = ref(false)
const weaponSearchQuery = ref("")
const selectedWeaponsForBatch = ref<Set<number>>(new Set())

// 批量添加魔之楔相关
const isBatchAddModalOpen = ref(false)
const modSearchQuery = ref("")
const selectedModsForBatch = ref<Map<number, { count: number }>>(new Map())
const enableMods = ref({
    金: true,
    紫: false,
    蓝: false,
    绿: false,
    白: false,
})

// 资源过滤相关
const excludedResources = useLocalStorage<Set<string>>("lvup.excludedResources", new Set())

/**
 * 时间估算页面配置
 */
interface TimeEstimateUIConfig {
    dungeonDropRateBonusPercent: number
    dungeonTimeMultiplier: number
    dungeonTypeTimes: {
        Defense: number
        ExtermPro: number
        SurvivalMiniPro: number
    }
}

// 时间估算配置
const timeEstimateConfig = useLocalStorage<TimeEstimateUIConfig>("lvup.timeEstimateConfig", {
    dungeonDropRateBonusPercent: 30,
    dungeonTimeMultiplier: 1,
    dungeonTypeTimes: {
        Defense: 1,
        ExtermPro: 0.5,
        SurvivalMiniPro: 0.7,
    },
})

/**
 * 获取时间估算请求配置
 * @returns 传递给计算器的时间估算配置
 */
function getTimeEstimateRequestConfig(): TimeEstimateConfig {
    const dropRateBonusPercent = Number(timeEstimateConfig.value.dungeonDropRateBonusPercent)
    const dungeonTimeMultiplier = Number(timeEstimateConfig.value.dungeonTimeMultiplier)

    const defenseTime = Number(timeEstimateConfig.value.dungeonTypeTimes.Defense)
    const extermProTime = Number(timeEstimateConfig.value.dungeonTypeTimes.ExtermPro)
    const survivalMiniProTime = Number(timeEstimateConfig.value.dungeonTypeTimes.SurvivalMiniPro)

    return {
        dungeonDropRateBonus: Number.isFinite(dropRateBonusPercent) ? Math.max(-99, dropRateBonusPercent) / 100 : 0,
        dungeonTimeMultiplier: Number.isFinite(dungeonTimeMultiplier) ? Math.max(0.01, dungeonTimeMultiplier) : 1,
        dungeonTypeTimes: {
            Defense: Number.isFinite(defenseTime) ? Math.max(0.01, defenseTime) : 1,
            ExtermPro: Number.isFinite(extermProTime) ? Math.max(0.01, extermProTime) : 0.5,
            SurvivalMiniPro: Number.isFinite(survivalMiniProTime) ? Math.max(0.01, survivalMiniProTime) : 0.7,
        },
    }
}

// 切换资源过滤状态
const toggleResourceFilter = (resourceName: string) => {
    if (excludedResources.value.has(resourceName)) {
        excludedResources.value.delete(resourceName)
    } else {
        excludedResources.value.add(resourceName)
    }
}

// 清除所有资源过滤
const clearResourceFilters = () => {
    excludedResources.value.clear()
}

// 创建 LevelUpCalculator 实例
const levelUpCalculator = ref<LevelUpCalculator | null>(null)

// 销毁计算器实例
onBeforeUnmount(() => {
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
    levelUpCalculator.value?.destroy()
    levelUpCalculator.value = null
})

const filteredMods = computed(() => {
    if (!isBatchAddModalOpen.value) return []
    const filteredIds = modData.filter(v => enableMods.value[v.品质 as keyof typeof enableMods.value]).map(v => v.id)
    const query = modSearchQuery.value.trim()
    const mappedMods = filteredIds.map(id => new LeveledMod(id))
    if (!query) return mappedMods

    // 根据搜索查询过滤
    return mappedMods.filter(mod => {
        // 直接中文匹配
        if (matchPinyin(mod.名称, query).match || mod.属性?.includes(query) || matchPinyin(mod.系列, query).match) {
            return true
        }
        return false
    })
})

const filteredChars = computed(() => {
    if (!isBatchAddCharsModalOpen.value) return []
    const query = charSearchQuery.value.trim()
    if (!query) return charData

    return charData.filter(char => {
        return matchPinyin(char.名称, query).match || char.属性?.includes(query)
    })
})

const filteredWeapons = computed(() => {
    if (!isBatchAddWeaponsModalOpen.value) return []
    const query = weaponSearchQuery.value.trim()
    if (!query) return weaponData

    return weaponData.filter(weapon => {
        return matchPinyin(weapon.名称, query).match || weapon.类型?.some(type => type.includes(query))
    })
})

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        return
    }
    api = p
})

/**
 * 同步武器库存信息
 * 从角色信息中获取武器的当前等级和精炼等级
 */
async function syncWeapons() {
    if (!roleInfo.value?.roleInfo?.roleShow) {
        await loadRoleInfo()
    }
    if (!roleInfo.value?.roleInfo?.roleShow) {
        ui.showErrorMessage("无法获取角色信息")
        return
    }

    try {
        syncing.value = true
        const roleShow = roleInfo.value.roleInfo.roleShow

        for (const weapon of weapons.value) {
            const weaponId = weapon.id

            const foundWeapon =
                roleShow.closeWeapons.find(w => w.weaponId === weaponId) || roleShow.langRangeWeapons.find(w => w.weaponId === weaponId)

            if (foundWeapon) {
                weapon.config.currentLevel = +foundWeapon.level || 1
                weapon.config.currentRefine = +foundWeapon.skillLevel || 0
            }
        }
        ui.showSuccessMessage("武器信息同步成功")
    } catch (e) {
        ui.showErrorMessage("武器信息同步失败", e)
    } finally {
        syncing.value = false
    }
}

/**
 * 同步角色库存信息
 * 从角色信息中获取角色的当前等级
 * 从角色详情 API 获取技能等级
 */
async function syncChars() {
    if (!roleInfo.value?.roleInfo?.roleShow) {
        await loadRoleInfo()
    }
    if (!roleInfo.value?.roleInfo?.roleShow) {
        ui.showErrorMessage("无法获取角色信息")
        return
    }

    try {
        syncing.value = true
        const roleShow = roleInfo.value.roleInfo.roleShow

        for (const char of chars.value) {
            const charData = roleShow.roleChars.find(c => c.charId === char.id)
            if (charData) {
                char.config.currentLevel = charData.level || 1

                // 调用 API 获取角色详情以获取技能等级
                if (charData.charEid) {
                    try {
                        const detailRes = await api.getRoleDetail(charData.charId, charData.charEid)
                        if (detailRes.is_success && detailRes.data?.charDetail?.skills) {
                            const gradeLevel = detailRes.data.charDetail.gradeLevel
                            const skills = detailRes.data.charDetail.skills
                            const skillOffset = [
                                gradeLevel >= 3 ? 2 : 0,
                                gradeLevel >= 5 ? 2 : 0,
                                gradeLevel >= 3 ? (gradeLevel >= 5 ? 2 : 1) : 0,
                            ]
                            for (let i = 0; i < 3; i++) {
                                if (skills[i]) {
                                    const lv = +skills[i].level || 1
                                    char.config.skills[i].currentLevel = lv - skillOffset[i]
                                }
                            }
                        }
                    } catch {
                        console.warn(`获取角色 ${charData.name} 详情失败，跳过技能等级同步`)
                    }
                }
            }
        }
        ui.showSuccessMessage("角色信息同步成功")
    } catch (e) {
        ui.showErrorMessage("角色信息同步失败", e)
    } finally {
        syncing.value = false
    }
}

/**
 * 加载角色信息
 */
async function loadRoleInfo() {
    try {
        await setting.startHeartbeat()
        const roleRes = await api.defaultRoleForTool()
        if (roleRes.is_success && roleRes.data) {
            roleInfo.value = roleRes.data
        } else {
            ui.showErrorMessage(roleRes.msg || "获取默认角色信息失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取角色信息失败", e)
    } finally {
        await setting.stopHeartbeat()
    }
}

// 结果状态
const calculating = ref(false)
const result = shallowRef<ReturnType<typeof LevelUpCalculator.mergeResults> | null>(null)
// 请求ID，用于解决异步竞态条件
const latestRequestId = ref(0)

/**
 * 计算结果
 */
async function calculateResult() {
    if (!levelUpCalculator.value || dataPackBootstrapLoading.value) return

    if (!isDataPackHydrated()) {
        result.value = {
            ...LevelUpCalculator.mergeResults([]),
            timeEstimate: {
                days: 0,
                hours: 0,
                mins: 0,
                dungeonTimes: {},
            },
        }
        return
    }

    // 递增请求ID并保存当前请求ID
    const requestId = ++latestRequestId.value
    calculating.value = true
    try {
        // 获取实际的角色、武器、魔之楔数据
        const actualChars = chars.value.map(item => charMap.get(item.id)).filter((char): char is (typeof charData)[0] => char !== undefined)

        const actualWeapons = weapons.value
            .map(item => weaponMap.get(item.id))
            .filter((weapon): weapon is (typeof weaponData)[0] => weapon !== undefined)

        const actualMods = mods.value.map(item => modMap.get(item.id)).filter((mod): mod is (typeof modData)[0] => mod !== undefined)

        // 使用合并计算方法，减少异步通信开销，提高性能
        const mergeResults = await levelUpCalculator.value.mergeCalculate(
            actualChars,
            chars.value.map(item => item.config),
            actualWeapons,
            weapons.value.map(item => item.config),
            actualMods,
            mods.value.map(item => item.config)
        )

        // 检查是否为最新请求，如果不是则终止
        if (requestId !== latestRequestId.value) {
            return
        }

        // 合并所有结果
        const resultsToMerge = [mergeResults.charResult, mergeResults.weaponResult, mergeResults.modResult].filter(
            Boolean
        ) as LevelUpResult[]
        let mergedResult = LevelUpCalculator.mergeResults(resultsToMerge)
        // 如果有排除的资源，重新计算结果
        if (excludedResources.value.size > 0) {
            // 过滤总消耗
            const filteredTotalCost: typeof mergedResult.totalCost = {}
            for (const [resource, value] of Object.entries(mergedResult.totalCost)) {
                if (!excludedResources.value.has(resource) && value !== undefined) {
                    filteredTotalCost[resource] = value
                }
            }

            // 过滤详细消耗
            const filterResourceObject = (obj: typeof mergedResult.totalCost) => {
                const filtered: typeof mergedResult.totalCost = {}
                for (const [resource, value] of Object.entries(obj)) {
                    if (!excludedResources.value.has(resource) && value !== undefined) {
                        filtered[resource] = value
                    }
                }
                return filtered
            }

            // 过滤详情
            const filteredDetails = {
                levelUp: filterResourceObject(mergedResult.details.levelUp),
                breakthrough: mergedResult.details.breakthrough ? filterResourceObject(mergedResult.details.breakthrough) : undefined,
                craft: mergedResult.details.craft ? filterResourceObject(mergedResult.details.craft) : undefined,
                skills: mergedResult.details.skills ? filterResourceObject(mergedResult.details.skills) : undefined,
            }

            // 返回过滤后的结果
            mergedResult = {
                totalCost: filteredTotalCost,
                resourceTree: mergedResult.resourceTree,
                details: filteredDetails,
            }
        }
        // 重新计算时间，基于过滤后的资源
        mergedResult.timeEstimate = await levelUpCalculator.value.estimateTime(mergedResult.totalCost, getTimeEstimateRequestConfig())

        // 检查是否为最新请求，如果不是则终止
        if (requestId !== latestRequestId.value) {
            return
        }

        result.value = mergedResult
    } catch (error) {
        console.error("计算失败:", error)
        // 只有最新请求的错误才显示
        if (requestId === latestRequestId.value) {
            ui.showErrorMessage("计算失败，请重试")
        }
    } finally {
        // 只有最新请求才会更新calculating状态
        if (requestId === latestRequestId.value) {
            calculating.value = false
        }
    }
}

// 监听数据变化，重新计算结果
import { matchPinyin } from "@/utils/pinyin-utils"

// 防抖函数，避免频繁计算导致UI卡顿
let debounceTimer: number | null = null

watch(
    [chars, weapons, mods, excludedResources, timeEstimateConfig, dataPackHydrationKey, dataPackBootstrapLoading],
    () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer)
        }
        // 500ms防抖，数据稳定后再计算
        debounceTimer = window.setTimeout(() => {
            calculateResult()
        }, 500)
    },
    { deep: true }
)

// 初始化计算器实例并计算结果
onMounted(() => {
    levelUpCalculator.value = new LevelUpCalculator()
    calculateResult()
})

/**
 * 创建角色的默认养成配置
 * @returns 角色默认配置
 */
function createDefaultCharConfig(): CharLevelUpConfig {
    return {
        currentLevel: 1,
        targetLevel: 80,
        skills: [
            {
                currentLevel: 1,
                targetLevel: 10,
            },
            {
                currentLevel: 1,
                targetLevel: 10,
            },
            {
                currentLevel: 1,
                targetLevel: 10,
            },
        ],
    }
}

// 移除角色
const removeChar = (index: number) => {
    chars.value.splice(index, 1)
}

/**
 * 创建武器的默认养成配置
 * @returns 武器默认配置
 */
function createDefaultWeaponConfig(): WeaponLevelUpConfig {
    return {
        currentLevel: 1,
        targetLevel: 80,
        currentRefine: 0,
        targetRefine: 5,
    }
}

// 移除武器
const removeWeapon = (index: number) => {
    weapons.value.splice(index, 1)
}

// 移除魔之楔
const removeMod = (index: number) => {
    mods.value.splice(index, 1)
}

const clearMods = () => {
    mods.value = []
}

const clearChars = () => {
    chars.value = []
}

const clearWeapons = () => {
    weapons.value = []
}

/**
 * 切换批量选择的角色
 * @param charId 角色ID
 */
const toggleSelectCharForBatch = (charId: number) => {
    if (selectedCharsForBatch.value.has(charId)) {
        selectedCharsForBatch.value.delete(charId)
    } else {
        selectedCharsForBatch.value.add(charId)
    }
}

/**
 * 处理角色批量全选/取消全选
 */
const handleSelectAllCharsForBatch = () => {
    if (selectedCharsForBatch.value.size === filteredChars.value.length) {
        selectedCharsForBatch.value.clear()
    } else {
        filteredChars.value.forEach(char => {
            selectedCharsForBatch.value.add(char.id)
        })
    }
}

/**
 * 确认批量添加角色
 */
const handleBatchAddChars = () => {
    selectedCharsForBatch.value.forEach(charId => {
        const exists = chars.value.some(char => char.id === charId)
        if (!exists) {
            chars.value.push({
                id: charId,
                config: createDefaultCharConfig(),
            })
        }
    })
    isBatchAddCharsModalOpen.value = false
    selectedCharsForBatch.value.clear()
}

/**
 * 切换批量选择的武器
 * @param weaponId 武器ID
 */
const toggleSelectWeaponForBatch = (weaponId: number) => {
    if (selectedWeaponsForBatch.value.has(weaponId)) {
        selectedWeaponsForBatch.value.delete(weaponId)
    } else {
        selectedWeaponsForBatch.value.add(weaponId)
    }
}

/**
 * 处理武器批量全选/取消全选
 */
const handleSelectAllWeaponsForBatch = () => {
    if (selectedWeaponsForBatch.value.size === filteredWeapons.value.length) {
        selectedWeaponsForBatch.value.clear()
    } else {
        filteredWeapons.value.forEach(weapon => {
            selectedWeaponsForBatch.value.add(weapon.id)
        })
    }
}

/**
 * 确认批量添加武器
 */
const handleBatchAddWeapons = () => {
    selectedWeaponsForBatch.value.forEach(weaponId => {
        const exists = weapons.value.some(weapon => weapon.id === weaponId)
        if (!exists) {
            weapons.value.push({
                id: weaponId,
                config: createDefaultWeaponConfig(),
            })
        }
    })
    isBatchAddWeaponsModalOpen.value = false
    selectedWeaponsForBatch.value.clear()
}

// 批量添加魔之楔相关函数
const toggleSelectModForBatch = (modId: number) => {
    if (selectedModsForBatch.value.has(modId)) {
        selectedModsForBatch.value.delete(modId)
    } else {
        selectedModsForBatch.value.set(modId, { count: 1 })
    }
}

const handleSelectAllModsForBatch = () => {
    if (selectedModsForBatch.value.size === filteredMods.value.length) {
        selectedModsForBatch.value.clear()
    } else {
        filteredMods.value.forEach(mod => {
            selectedModsForBatch.value.set(mod.id, { count: 1 })
        })
    }
}

const updateModCountForBatch = (modId: number, count: number) => {
    if (selectedModsForBatch.value.has(modId)) {
        selectedModsForBatch.value.set(modId, { count })
    }
}

const handleBatchAddMods = () => {
    // 将选中的MOD添加到mods列表
    selectedModsForBatch.value.forEach((modInfo, modId) => {
        // 检查是否已存在
        const exists = mods.value.some(mod => mod.id === modId)
        if (!exists) {
            mods.value.push({
                id: modId,
                config: {
                    currentLevel: 1,
                    targetLevel: 10,
                    count: modInfo.count,
                },
            })
        }
    })
    // 关闭弹窗并清空选择
    isBatchAddModalOpen.value = false
    selectedModsForBatch.value.clear()
}

const isOpenGraph = ref(false)

// 养成计划活动页签：角色 / 武器 / 魔之楔 / 估算配置 合并管理
type PlanTab = "chars" | "weapons" | "mods" | "settings"
const activePlanTab = ref<PlanTab>("chars")

// 当前页签对应的添加动作
const planTabAddActions: Partial<Record<PlanTab, () => void>> = {
    chars: () => {
        isBatchAddCharsModalOpen.value = true
    },
    weapons: () => {
        isBatchAddWeaponsModalOpen.value = true
    },
    mods: () => {
        isBatchAddModalOpen.value = true
    },
}

// 页签计数方章样式：仅当前页签使用主色，其余弱化
const planTabBadgeClass = (tab: PlanTab) =>
    activePlanTab.value === tab
        ? "border-primary bg-primary font-semibold text-primary-content"
        : "border-base-content/20 text-base-content/55"

// 页签徽标计数；估算配置页签无计数
const planTabCount = (tab: PlanTab): number | null => {
    if (tab === "chars") return chars.value.length
    if (tab === "weapons") return weapons.value.length
    if (tab === "mods") return mods.value.length
    return null
}

// 副本估算配置项，驱动模板渲染
const timeEstimateFields = [
    { key: "dungeonDropRateBonusPercent", label: "掉落率加成(%)", min: -100, max: 1000, step: 1 },
    { key: "dungeonTimeMultiplier", label: "副本耗时倍率", min: 0.01, max: 20, step: 0.01 },
] as const

const dungeonTimeFields = [
    { key: "Defense", label: "扼守", hint: "单次时间(分钟)" },
    { key: "ExtermPro", label: "驱离", hint: "单次时间(分钟)" },
    { key: "SurvivalMiniPro", label: "避险", hint: "单次时间(分钟)" },
] as const
</script>

<template>
    <div class="h-full relative">
        <ScrollArea class="h-full">
            <div class="max-w-7xl mx-auto p-4 md:p-6 flex flex-col gap-3">
                <!-- ============ 输入区：养成计划 ============ -->
                <section class="overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm">
                    <!-- 页签导航 -->
                    <div class="px-4 pt-2">
                        <AniTabs
                            v-model="activePlanTab"
                            :tabs="[
                                { label: '角色', value: 'chars' },
                                { label: '武器', value: 'weapons' },
                                { label: '魔之楔', value: 'mods' },
                                { label: '估算配置', value: 'settings' },
                            ]"
                        >
                            <template #label="{ tab }">
                                {{ tab.label }}
                                <span
                                    v-if="planTabCount(tab.value as PlanTab) !== null"
                                    class="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-xs border px-1 py-px text-[10px] leading-4 tabular-nums transition-colors duration-150"
                                    :class="planTabBadgeClass(tab.value as PlanTab)"
                                >
                                    {{ planTabCount(tab.value as PlanTab) }}
                                </span>
                            </template>
                        </AniTabs>
                    </div>

                    <!-- 上下文工具栏 -->
                    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-base-content/10">
                        <template v-if="activePlanTab === 'chars'">
                            <button
                                class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-xs text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                                @click="syncChars"
                                :disabled="syncing || chars.length === 0"
                                aria-label="同步角色信息"
                            >
                                <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                                <Icon v-else icon="ri:refresh-line" />
                                同步角色
                            </button>
                            <button
                                class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-xs text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                                @click="clearChars"
                                :disabled="chars.length === 0"
                                aria-label="清空角色"
                            >
                                <Icon icon="ri:delete-bin-line" />
                                清空
                            </button>
                        </template>
                        <template v-else-if="activePlanTab === 'weapons'">
                            <button
                                class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-xs text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                                @click="syncWeapons"
                                :disabled="syncing || weapons.length === 0"
                                aria-label="同步武器信息"
                            >
                                <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                                <Icon v-else icon="ri:refresh-line" />
                                同步武器
                            </button>
                            <button
                                class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-xs text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                                @click="clearWeapons"
                                :disabled="weapons.length === 0"
                                aria-label="清空武器"
                            >
                                <Icon icon="ri:delete-bin-line" />
                                清空
                            </button>
                        </template>
                        <template v-else-if="activePlanTab === 'mods'">
                            <button
                                class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-xs text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                                @click="clearMods"
                                :disabled="mods.length === 0"
                                aria-label="清空魔之楔"
                            >
                                <Icon icon="ri:delete-bin-line" />
                                清空
                            </button>
                        </template>
                        <span class="ml-auto hidden text-xs tracking-wide text-base-content/45 sm:block"
                            >共
                            <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{
                                chars.length + weapons.length + mods.length
                            }}</b>
                            项计划</span
                        >
                        <button
                            v-if="planTabAddActions[activePlanTab]"
                            class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs bg-primary px-3 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/85 active:scale-[0.97]"
                            @click="planTabAddActions[activePlanTab]?.()"
                            aria-label="批量添加"
                        >
                            <Icon icon="ri:add-line" />
                            批量添加
                        </button>
                    </div>

                    <!-- ===== 角色面板 ===== -->
                    <div v-show="activePlanTab === 'chars'" class="p-3">
                        <div
                            v-if="chars.length"
                            class="flex flex-col rounded-xs border border-base-content/10 divide-y divide-base-content/10 overflow-hidden"
                        >
                            <div
                                v-for="(char, index) in chars"
                                :key="index"
                                class="group flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors duration-200"
                            >
                                <!-- 左侧：标题行 + range 行 -->
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="relative shrink-0 overflow-hidden rounded-xs bg-linear-15 from-yellow-500/80 to-yellow-700/80"
                                        >
                                            <img
                                                :src="LeveledChar.url(charMap.get(char.id)?.icon)"
                                                alt="角色图片"
                                                class="size-11 object-cover"
                                            />
                                            <img
                                                v-if="charMap.get(char.id)?.属性"
                                                :src="LeveledChar.elementUrl(charMap.get(char.id)!.属性!)"
                                                alt="角色属性"
                                                class="absolute top-0.5 left-0.5 h-2.5 w-5 rounded-xs object-cover"
                                            />
                                        </div>
                                        <div class="min-w-0">
                                            <SRouterLink
                                                :to="`/db/char/${char.id}`"
                                                class="block font-semibold truncate hover:text-primary hover:underline transition-colors"
                                            >
                                                {{ charMap.get(char.id)?.名称 }}
                                            </SRouterLink>
                                        </div>
                                    </div>
                                    <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                                        <label class="flex items-center gap-1.5">
                                            <span class="text-xs text-base-content/50">等级</span>
                                            <RangeSelector
                                                class="w-28 sm:w-32"
                                                v-model:from="char.config.currentLevel"
                                                v-model:to="char.config.targetLevel"
                                                :min="1"
                                                :max="80"
                                            />
                                        </label>
                                        <div
                                            v-for="(skill, skillIndex) in charMap.get(char.id)?.技能.slice(0, 3) || []"
                                            :key="skillIndex"
                                            class="flex items-center gap-2"
                                        >
                                            <Tooltip :tooltip="skill.名称 ?? '?'">
                                                <div class="shrink-0 overflow-hidden rounded-xs">
                                                    <div
                                                        alt="技能图标"
                                                        class="size-6 rounded-xs bg-base-content"
                                                        :style="{ mask: `url(${LeveledSkill.url(skill.icon)}) no-repeat center/contain` }"
                                                    />
                                                </div>
                                            </Tooltip>
                                            <RangeSelector
                                                class="w-28"
                                                v-model:from="char.config.skills[skillIndex].currentLevel"
                                                v-model:to="char.config.skills[skillIndex].targetLevel"
                                                :min="1"
                                                :max="10"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <!-- 右侧独立删除列 -->
                                <button
                                    class="inline-flex shrink-0 cursor-pointer items-center justify-center self-stretch px-2 text-base-content/30 transition-colors duration-150 hover:text-error"
                                    @click="removeChar(index)"
                                    aria-label="删除角色"
                                >
                                    <Icon icon="ri:delete-bin-line" />
                                </button>
                            </div>
                        </div>
                        <div v-else class="flex flex-col items-center justify-center gap-3 py-12">
                            <Icon icon="ri:user-line" class="text-4xl text-base-content/20" />
                            <p class="text-sm text-base-content/50">还没有角色养成计划</p>
                            <button
                                class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs bg-primary px-3 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/85 active:scale-[0.97]"
                                @click="isBatchAddCharsModalOpen = true"
                            >
                                <Icon icon="ri:add-line" />
                                添加角色
                            </button>
                        </div>
                    </div>

                    <!-- ===== 武器面板 ===== -->
                    <div v-show="activePlanTab === 'weapons'" class="p-3">
                        <div
                            v-if="weapons.length"
                            class="flex flex-col rounded-xs border border-base-content/10 divide-y divide-base-content/10 overflow-hidden"
                        >
                            <div
                                v-for="(weapon, index) in weapons"
                                :key="index"
                                class="group flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors duration-200"
                            >
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="relative shrink-0 overflow-hidden rounded-xs bg-linear-15 from-yellow-500/80 to-yellow-700/80"
                                        >
                                            <img
                                                :src="LeveledWeapon.url(weaponMap.get(weapon.id)?.icon)"
                                                alt="武器图片"
                                                class="size-11 object-cover"
                                            />
                                        </div>
                                        <div class="min-w-0">
                                            <SRouterLink
                                                :to="`/db/weapon/${weapon.id}`"
                                                class="block font-semibold truncate hover:text-primary hover:underline transition-colors"
                                            >
                                                {{ weaponMap.get(weapon.id)?.名称 }}
                                            </SRouterLink>
                                        </div>
                                    </div>
                                    <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                                        <label class="flex items-center gap-1.5">
                                            <span class="text-xs text-base-content/50">等级</span>
                                            <RangeSelector
                                                class="w-28 sm:w-32"
                                                v-model:from="weapon.config.currentLevel"
                                                v-model:to="weapon.config.targetLevel"
                                                :min="1"
                                                :max="80"
                                            />
                                        </label>
                                        <label class="flex items-center gap-1.5">
                                            <span class="text-xs text-base-content/50">熔炼</span>
                                            <RangeSelector
                                                class="w-24 sm:w-28"
                                                v-model:from="weapon.config.currentRefine"
                                                v-model:to="weapon.config.targetRefine"
                                                :min="0"
                                                :max="5"
                                            />
                                        </label>
                                    </div>
                                </div>
                                <button
                                    class="inline-flex shrink-0 cursor-pointer items-center justify-center self-stretch px-2 text-base-content/30 transition-colors duration-150 hover:text-error"
                                    @click="removeWeapon(index)"
                                    aria-label="删除武器"
                                >
                                    <Icon icon="ri:delete-bin-line" />
                                </button>
                            </div>
                        </div>
                        <div v-else class="flex flex-col items-center justify-center gap-3 py-12">
                            <Icon icon="ri:sword-line" class="text-4xl text-base-content/20" />
                            <p class="text-sm text-base-content/50">还没有武器养成计划</p>
                            <button
                                class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs bg-primary px-3 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/85 active:scale-[0.97]"
                                @click="isBatchAddWeaponsModalOpen = true"
                            >
                                <Icon icon="ri:add-line" />
                                添加武器
                            </button>
                        </div>
                    </div>

                    <!-- ===== 魔之楔面板 ===== -->
                    <div v-show="activePlanTab === 'mods'" class="p-3">
                        <div v-if="mods.length" class="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-2">
                            <div
                                v-for="(mod, index) in mods"
                                :key="index"
                                class="group relative flex items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 px-3.5 py-3 transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5"
                            >
                                <span
                                    class="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-xs bg-primary/0 transition-colors group-hover:bg-primary/60"
                                />
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="relative shrink-0 overflow-hidden rounded-xs bg-linear-15 from-yellow-500/80 to-yellow-700/80"
                                        >
                                            <img
                                                :src="LeveledMod.url(modMap.get(mod.id)?.icon)"
                                                alt="魔之楔图片"
                                                class="size-11 object-cover"
                                            />
                                        </div>
                                        <div class="min-w-0">
                                            <SRouterLink
                                                :to="`/db/mod/${mod.id}`"
                                                class="block font-semibold truncate hover:text-primary hover:underline transition-colors"
                                            >
                                                {{ modMap.get(mod.id)?.名称 }}
                                            </SRouterLink>
                                        </div>
                                    </div>
                                    <div class="mt-2 flex items-center gap-2">
                                        <RangeSelector
                                            class="flex-1 min-w-0"
                                            v-model:from="mod.config.currentLevel"
                                            v-model:to="mod.config.targetLevel"
                                            :min="0"
                                            :max="10"
                                        />
                                        <Select class="input input-sm w-16 shrink-0" v-model="mod.config.count" aria-label="数量">
                                            <SelectItem v-for="i in 8" :key="i" :value="i">×{{ i }}</SelectItem>
                                        </Select>
                                    </div>
                                </div>
                                <button
                                    class="inline-flex shrink-0 cursor-pointer items-center justify-center self-stretch px-2 text-base-content/30 transition-colors duration-150 hover:text-error"
                                    @click="removeMod(index)"
                                    aria-label="删除魔之楔"
                                >
                                    <Icon icon="ri:delete-bin-line" />
                                </button>
                            </div>
                        </div>
                        <div v-else class="flex flex-col items-center justify-center gap-3 py-12">
                            <Icon icon="po-A" class="text-4xl text-base-content/20" />
                            <p class="text-sm text-base-content/50">还没有魔之楔养成计划</p>
                            <button
                                class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs bg-primary px-3 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/85 active:scale-[0.97]"
                                @click="isBatchAddModalOpen = true"
                            >
                                <Icon icon="ri:add-line" />
                                添加魔之楔
                            </button>
                        </div>
                    </div>
                    <!-- ===== 估算配置面板 ===== -->
                    <div v-show="activePlanTab === 'settings'" class="p-3">
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                            <label
                                v-for="field in timeEstimateFields"
                                :key="field.key"
                                class="flex flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-3.5 py-3 transition-colors duration-150 focus-within:border-primary/50"
                            >
                                <span class="text-xs text-base-content/50">{{ field.label }}</span>
                                <input
                                    v-model.number="timeEstimateConfig[field.key]"
                                    type="number"
                                    class="w-full bg-transparent font-medium tabular-nums outline-none"
                                    :min="field.min"
                                    :max="field.max"
                                    :step="field.step"
                                />
                            </label>
                            <label
                                v-for="field in dungeonTimeFields"
                                :key="field.key"
                                class="flex flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-3.5 py-3 transition-colors duration-150 focus-within:border-primary/50"
                            >
                                <span class="text-xs text-base-content/50">{{ field.label }} · {{ field.hint }}</span>
                                <input
                                    v-model.number="timeEstimateConfig.dungeonTypeTimes[field.key]"
                                    type="number"
                                    class="w-full bg-transparent font-medium tabular-nums outline-none"
                                    min="0.01"
                                    max="60"
                                    step="0.1"
                                />
                            </label>
                        </div>
                        <p class="mt-3 text-xs text-base-content/40">以上参数仅影响时间估算结果，不影响资源消耗统计</p>
                    </div>
                </section>

                <!-- ============ 输出区 ============ -->
                <template v-if="result">
                    <!-- 概览：时间估算 + 副本次数 -->
                    <div class="grid grid-cols-1 xl:grid-cols-5 gap-3 items-start">
                        <section class="xl:col-span-2 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <SectionHeader no-animate compact kicker="ESTIMATE" title="预计养成时间">
                                <template #trailing>
                                    <button
                                        type="button"
                                        class="inline-flex cursor-pointer items-center gap-1 text-xs text-base-content/50 transition-colors duration-150 hover:text-primary"
                                        @click="isOpenGraph = true"
                                        aria-label="查看资源关系图"
                                    >
                                        <Icon icon="ri:git-branch-line" class="h-3.5 w-3.5" />
                                        资源关系图
                                    </button>
                                </template>
                            </SectionHeader>
                            <div v-if="result.timeEstimate" class="mt-4 flex items-end gap-5">
                                <div>
                                    <span class="font-orbitron text-5xl font-bold tabular-nums tracking-tight text-primary">{{
                                        result.timeEstimate.days
                                    }}</span>
                                    <span class="ml-1 text-sm text-base-content/60">天</span>
                                </div>
                                <div class="pb-1 flex items-baseline gap-3 text-base-content/80">
                                    <span
                                        ><b class="font-orbitron text-2xl font-bold tabular-nums text-primary">{{
                                            result.timeEstimate.hours
                                        }}</b>
                                        <span class="text-xs text-base-content/50">小时</span></span
                                    >
                                    <span
                                        ><b class="font-orbitron text-2xl font-bold tabular-nums text-primary">{{
                                            result.timeEstimate.mins
                                        }}</b>
                                        <span class="text-xs text-base-content/50">分钟</span></span
                                    >
                                </div>
                            </div>
                            <p v-if="result.timeEstimate" class="mt-4 text-xs text-base-content/40">
                                需挑战 <b class="font-orbitron tabular-nums">{{ Object.keys(result.timeEstimate.dungeonTimes).length }}</b>
                                种副本 · 按当前配置估算
                            </p>
                        </section>

                        <section
                            v-if="result.timeEstimate"
                            class="xl:col-span-3 rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm"
                        >
                            <div class="px-4 pt-3">
                                <SectionHeader
                                    no-animate
                                    compact
                                    kicker="DUNGEONS"
                                    title="副本次数"
                                    :count="Object.keys(result.timeEstimate.dungeonTimes).length"
                                />
                            </div>
                            <ScrollArea class="h-[60vh] max-h-[60vh]">
                                <div class="px-4 pb-4 pt-1 flex flex-col gap-2">
                                    <SRouterLink
                                        :to="`/db/dungeon/${dungeon.id}`"
                                        v-for="[dungeon, [times, reason]] in Object.entries(result.timeEstimate.dungeonTimes).map(
                                            v => [dungeonMap.get(+v[0]), v[1]] as [Dungeon, [number, string]]
                                        )"
                                        :key="dungeon.id"
                                        class="flex items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 px-3.5 py-2.5 transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5"
                                    >
                                        <img
                                            v-if="dungeon.e"
                                            :src="LeveledChar.elementUrl(dungeon.e)"
                                            class="h-8 w-4 shrink-0 rounded-xs object-cover"
                                        />
                                        <div class="min-w-0 flex-1">
                                            <div class="font-medium text-sm truncate">{{ getDungeonName(dungeon) }}</div>
                                            <div class="mt-0.5 text-xs text-base-content/45 flex items-center gap-2">
                                                <span>Lv.{{ dungeon.lv }}</span>
                                                <span v-if="dungeon.r?.length" class="truncate"
                                                    >奖励: {{ getDungeonRewardNames(dungeon) }}</span
                                                >
                                            </div>
                                        </div>
                                        <span
                                            class="shrink-0 rounded-xs px-2 py-0.5 text-xs"
                                            :class="getDungeonType(dungeon.t).color + ' text-white'"
                                        >
                                            {{ getDungeonType(dungeon.t).label }}
                                        </span>
                                        <div class="shrink-0 text-right">
                                            <div class="font-orbitron font-bold tabular-nums text-primary">×{{ times }}</div>
                                            <div class="text-[10px] text-base-content/40">{{ reason }}</div>
                                        </div>
                                    </SRouterLink>
                                </div>
                            </ScrollArea>
                        </section>
                    </div>

                    <!-- 已过滤资源 -->
                    <div
                        v-if="excludedResources.size > 0"
                        class="flex flex-wrap items-center gap-2 rounded-xs border border-error/20 bg-error/5 px-4 py-2.5"
                    >
                        <span class="flex items-center gap-1.5 text-xs font-medium text-error/80">
                            <Icon icon="ri:filter-line" />
                            已过滤
                        </span>
                        <span
                            v-for="resource in excludedResources"
                            :key="resource"
                            class="flex cursor-pointer items-center gap-1 rounded-xs bg-error/15 px-2 py-0.5 text-[11px] text-error transition-colors duration-150 hover:bg-error/25"
                        >
                            <span>{{ $t(resource) }}</span>
                            <button @click.stop="toggleResourceFilter(resource)" class="hover:opacity-70">
                                <Icon icon="codicon:chrome-close" class="h-3 w-3" />
                            </button>
                        </span>
                        <button
                            type="button"
                            class="ml-auto inline-flex h-6 cursor-pointer items-center gap-1 rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/55 transition-colors duration-150 hover:border-error/50 hover:text-error"
                            @click="clearResourceFilters"
                        >
                            清除全部
                        </button>
                    </div>

                    <!-- 总消耗 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="TOTAL" title="总消耗" :count="Object.keys(result.totalCost).length">
                            <template #trailing>
                                <span class="text-[11px] tracking-wide text-base-content/45">点击资源可过滤</span>
                            </template>
                        </SectionHeader>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1">
                            <ResourceCostItem
                                v-for="(value, key) in result.totalCost"
                                :key="key"
                                :name="key"
                                :value="value!"
                                class="cursor-pointer"
                                @click="toggleResourceFilter(key)"
                            />
                        </div>
                    </section>

                    <!-- 消耗明细 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="DETAILS" title="消耗明细" />
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div class="min-w-0">
                                <div
                                    class="mb-2.5 flex items-center gap-1.5 border-b border-base-content/10 pb-2 text-[11px] tracking-wide text-base-content/55"
                                >
                                    <Icon icon="ri:lightbulb-line" />
                                    等级升级
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.levelUp"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="cursor-pointer"
                                        @click="toggleResourceFilter(key)"
                                    />
                                </div>
                            </div>
                            <div v-if="result.details.skills && Object.keys(result.details.skills).length > 0" class="min-w-0">
                                <div
                                    class="mb-2.5 flex items-center gap-1.5 border-b border-base-content/10 pb-2 text-[11px] tracking-wide text-base-content/55"
                                >
                                    <Icon icon="ri:flashlight-line" />
                                    技能升级
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.skills"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="cursor-pointer"
                                        @click="toggleResourceFilter(key)"
                                    />
                                </div>
                            </div>
                            <div v-if="result.details.breakthrough && Object.keys(result.details.breakthrough).length > 0" class="min-w-0">
                                <div
                                    class="mb-2.5 flex items-center gap-1.5 border-b border-base-content/10 pb-2 text-[11px] tracking-wide text-base-content/55"
                                >
                                    <Icon icon="ri:star-line" />
                                    突破
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.breakthrough"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="cursor-pointer"
                                        @click="toggleResourceFilter(key)"
                                    />
                                </div>
                            </div>
                            <div v-if="result.details.craft && Object.keys(result.details.craft).length > 0" class="min-w-0">
                                <div
                                    class="mb-2.5 flex items-center gap-1.5 border-b border-base-content/10 pb-2 text-[11px] tracking-wide text-base-content/55"
                                >
                                    <Icon icon="ri:hammer-line" />
                                    锻造
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.craft"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="cursor-pointer"
                                        @click="toggleResourceFilter(key)"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                </template>
                <div v-else class="flex justify-center py-16">
                    <div class="loading loading-spinner loading-lg text-primary"></div>
                </div>
            </div>
        </ScrollArea>

        <!-- 资源关系图全屏覆盖层 -->
        <div class="absolute inset-0 bg-base-100/85 backdrop-blur-md" v-if="isOpenGraph && result?.resourceTree">
            <div class="absolute z-1 flex items-center justify-center p-2">
                <div
                    class="flex cursor-pointer items-center gap-1 rounded-xs border border-base-content/15 bg-base-100/85 p-1.5 text-xs shadow-lg backdrop-blur-md transition-colors duration-150 hover:border-error/50"
                    @click="isOpenGraph = false"
                >
                    <Icon icon="ri:close-line" class="h-5 w-5 text-error" />
                </div>
            </div>
            <ResourceTreeGraph :tree="result.resourceTree" />
        </div>
    </div>

    <!-- 批量添加角色弹窗 -->
    <DialogModel v-model="isBatchAddCharsModalOpen" class="w-[80vw] max-w-200">
        <div class="w-full max-w-4xl">
            <h2 class="mb-1 text-lg font-semibold">批量添加角色</h2>
            <p class="mb-4 text-xs text-base-content/50">选择要添加的角色，然后点击确认添加</p>

            <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-base-content/10 pb-3">
                <div class="ml-auto flex flex-wrap items-center gap-3">
                    <div class="relative w-56">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="charSearchQuery"
                            type="search"
                            placeholder="搜索角色..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                    </div>
                    <button
                        type="button"
                        class="inline-flex h-8 cursor-pointer items-center rounded-xs border px-3 text-xs transition-colors duration-150"
                        :class="
                            filteredChars.length
                                ? 'border-base-content/20 text-base-content/65 hover:border-primary/50 hover:text-primary'
                                : 'pointer-events-none border-base-content/15 text-base-content/35'
                        "
                        @click="handleSelectAllCharsForBatch"
                    >
                        {{ selectedCharsForBatch.size === filteredChars.length ? "取消全选" : "全选" }}
                    </button>
                </div>
            </div>

            <div class="min-h-80 w-full pb-4 max-h-[60vh] overflow-auto">
                <div class="p-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    <div
                        v-for="char in filteredChars"
                        :key="char.id"
                        class="cursor-pointer rounded-xs border transition-colors duration-150 hover:border-primary/40"
                        :class="
                            selectedCharsForBatch.has(char.id) ? 'border-primary bg-primary/10' : 'border-base-content/15 bg-base-content/3'
                        "
                        @click="toggleSelectCharForBatch(char.id)"
                    >
                        <div class="flex flex-row items-center gap-3 p-3">
                            <ImageFallback :src="LeveledChar.url(char.icon)" alt="角色头像" class="size-14 shrink-0 rounded-xs">
                                <img src="/imgs/webp/T_Head_Empty.webp" alt="角色头像" class="size-14 shrink-0 rounded-xs" />
                            </ImageFallback>
                            <div class="min-w-0 flex-1">
                                <div class="font-semibold truncate">{{ char.名称 }}</div>
                                <div class="text-sm opacity-70 flex items-center gap-2 mt-1">
                                    <img :src="LeveledChar.elementUrl(char.属性)" alt="角色属性" class="w-4 h-6 rounded-xs object-cover" />
                                    <span>{{ $t(char.属性) }}</span>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                class="checkbox checkbox-primary pointer-events-none shrink-0"
                                :checked="selectedCharsForBatch.has(char.id)"
                                tabindex="-1"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <template #action>
            <div class="flex justify-end gap-2">
                <button class="btn btn-secondary" @click="isBatchAddCharsModalOpen = false">取消</button>
                <button class="btn btn-primary" @click="handleBatchAddChars">确认添加 ({{ selectedCharsForBatch.size }})</button>
            </div>
        </template>
    </DialogModel>

    <!-- 批量添加武器弹窗 -->
    <DialogModel v-model="isBatchAddWeaponsModalOpen" class="w-[80vw] max-w-200">
        <div class="w-full max-w-4xl">
            <h2 class="mb-1 text-lg font-semibold">批量添加武器</h2>
            <p class="mb-4 text-xs text-base-content/50">选择要添加的武器，然后点击确认添加</p>

            <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-base-content/10 pb-3">
                <div class="ml-auto flex flex-wrap items-center gap-3">
                    <div class="relative w-56">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="weaponSearchQuery"
                            type="search"
                            placeholder="搜索武器..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                    </div>
                    <button
                        type="button"
                        class="inline-flex h-8 cursor-pointer items-center rounded-xs border px-3 text-xs transition-colors duration-150"
                        :class="
                            filteredWeapons.length
                                ? 'border-base-content/20 text-base-content/65 hover:border-primary/50 hover:text-primary'
                                : 'pointer-events-none border-base-content/15 text-base-content/35'
                        "
                        @click="handleSelectAllWeaponsForBatch"
                    >
                        {{ selectedWeaponsForBatch.size === filteredWeapons.length ? "取消全选" : "全选" }}
                    </button>
                </div>
            </div>

            <div class="min-h-80 w-full pb-4 max-h-[60vh] overflow-auto">
                <div class="p-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    <div
                        v-for="weapon in filteredWeapons"
                        :key="weapon.id"
                        class="cursor-pointer rounded-xs border transition-colors duration-150 hover:border-primary/40"
                        :class="
                            selectedWeaponsForBatch.has(weapon.id)
                                ? 'border-primary bg-primary/10'
                                : 'border-base-content/15 bg-base-content/3'
                        "
                        @click="toggleSelectWeaponForBatch(weapon.id)"
                    >
                        <div class="flex flex-row items-center gap-3 p-3">
                            <ImageFallback :src="LeveledWeapon.url(weapon.icon)" alt="武器头像" class="size-14 shrink-0 rounded-xs">
                                <img src="/imgs/webp/T_Head_Empty.webp" alt="武器头像" class="size-14 shrink-0 rounded-xs" />
                            </ImageFallback>
                            <div class="min-w-0 flex-1">
                                <div class="font-semibold truncate">{{ weapon.名称 }}</div>
                                <div class="text-sm opacity-70 mt-1">{{ weapon.类型.join(" / ") }}</div>
                            </div>
                            <input
                                type="checkbox"
                                class="checkbox checkbox-primary pointer-events-none shrink-0"
                                :checked="selectedWeaponsForBatch.has(weapon.id)"
                                tabindex="-1"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <template #action>
            <div class="flex justify-end gap-2">
                <button class="btn btn-secondary" @click="isBatchAddWeaponsModalOpen = false">取消</button>
                <button class="btn btn-primary" @click="handleBatchAddWeapons">确认添加 ({{ selectedWeaponsForBatch.size }})</button>
            </div>
        </template>
    </DialogModel>

    <!-- 批量添加魔之楔弹窗 -->
    <DialogModel v-model="isBatchAddModalOpen" class="w-[80vw] max-w-200">
        <div class="w-full max-w-4xl">
            <h2 class="mb-1 text-lg font-semibold">批量添加魔之楔</h2>
            <p class="mb-4 text-xs text-base-content/50">选择要添加的魔之楔，然后点击确认添加</p>

            <!-- 筛选和搜索 -->
            <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-base-content/10 pb-3">
                <div class="ml-auto flex flex-wrap items-center gap-3">
                    <div class="relative w-40">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="modSearchQuery"
                            type="search"
                            placeholder="搜索魔之楔..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                    </div>
                    <button
                        type="button"
                        class="inline-flex h-8 cursor-pointer items-center rounded-xs border px-3 text-xs transition-colors duration-150"
                        :class="
                            filteredMods.length
                                ? 'border-base-content/20 text-base-content/65 hover:border-primary/50 hover:text-primary'
                                : 'pointer-events-none border-base-content/15 text-base-content/35'
                        "
                        @click="handleSelectAllModsForBatch"
                    >
                        {{ selectedModsForBatch.size === filteredMods.length ? "取消全选" : "全选" }}
                    </button>
                    <label
                        v-for="color in ['金', '紫', '蓝', '绿', '白'] as const"
                        :key="color"
                        class="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/60"
                    >
                        {{ color }}
                        <input
                            :checked="enableMods[color]"
                            type="checkbox"
                            class="toggle toggle-secondary"
                            @change="enableMods[color] = ($event.target! as any).checked"
                        />
                    </label>
                </div>
            </div>

            <!-- MOD列表 -->
            <div class="min-h-80 w-full pb-4 max-h-[60vh] overflow-auto">
                <div
                    v-if="(['金', '紫', '蓝', '绿', '白'] as const).some(color => enableMods[color])"
                    class="p-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2"
                >
                    <div v-for="(mod, index) in filteredMods" :key="index" class="relative cursor-pointer">
                        <ModItem
                            :mod="mod"
                            :selected="selectedModsForBatch.has(mod.id)"
                            :count="selectedModsForBatch.get(mod.id)?.count || 1"
                            :index="index"
                            control
                            nolv
                            noremove
                            @click="toggleSelectModForBatch(mod.id)"
                            @count-change="updateModCountForBatch(mod.id, $event)"
                        />
                    </div>
                </div>
                <div v-else class="flex h-72 w-full items-center justify-center p-4 text-sm text-base-content/50">
                    请选择要显示的魔之楔品质
                </div>
            </div>
        </div>

        <template #action>
            <div class="flex justify-end gap-2">
                <button class="btn btn-secondary" @click="isBatchAddModalOpen = false">取消</button>
                <button class="btn btn-primary" @click="handleBatchAddMods">确认添加 ({{ selectedModsForBatch.size }})</button>
            </div>
        </template>
    </DialogModel>
</template>
