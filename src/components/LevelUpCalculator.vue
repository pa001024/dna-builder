<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNARoleEntity } from "dna-api"
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue"
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
import { type CharLevelUpConfig, type LevelUpResult, type ModLevelUpConfig, type WeaponLevelUpConfig } from "@/data/LevelUpCalculator"
import { getDungeonName, getDungeonRewardNames, getDungeonType } from "@/utils/dungeon-utils"
import { LevelUpCalculator } from "../data/LevelUpCalculator"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

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
    if (!levelUpCalculator.value) return

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
        mergedResult.timeEstimate = await levelUpCalculator.value.estimateTime(mergedResult.totalCost)

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
import { watch } from "vue"
import { matchPinyin } from "@/utils/pinyin-utils"

// 防抖函数，避免频繁计算导致UI卡顿
let debounceTimer: number | null = null

watch(
    [chars, weapons, mods, excludedResources],
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

// 添加角色
const addChar = () => {
    chars.value.push({
        id: charData[0]?.id || 0,
        config: {
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
        },
    })
}

// 移除角色
const removeChar = (index: number) => {
    chars.value.splice(index, 1)
}

// 添加武器
const addWeapon = () => {
    weapons.value.push({
        id: weaponData[0]?.id || 0,
        config: {
            currentLevel: 1,
            targetLevel: 80,
            currentRefine: 0,
            targetRefine: 5,
        },
    })
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
</script>

<template>
    <div class="h-full relative">
        <ScrollArea class="h-full">
            <div class="p-4 flex flex-col justify-center items-center gap-4">
                <!-- 角色养成 -->
                <section class="w-full">
                    <div class="flex items-center justify-between mb-2 p-2">
                        <h3 class="text-xl font-semibold text-base-content flex items-center gap-2">
                            <Icon icon="ri:user-line" />
                            角色养成
                        </h3>
                        <div class="flex gap-2">
                            <button
                                class="btn btn-primary btn-sm gap-2"
                                @click="syncChars"
                                :disabled="syncing || chars.length === 0"
                                aria-label="同步角色信息"
                            >
                                <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                                <Icon v-else icon="ri:refresh-line" />
                                同步角色
                            </button>
                            <button class="btn btn-primary btn-sm gap-2" @click="addChar" aria-label="添加角色">
                                <span class="text-xl font-bold">+</span>
                                添加角色
                            </button>
                        </div>
                    </div>

                    <div class="flex flex-col gap-4">
                        <div
                            v-for="(char, index) in chars"
                            :key="index"
                            class="card bg-base-200 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg"
                        >
                            <div class="card-body p-4">
                                <div class="flex items-center justify-between mb-4">
                                    <div class="flex-1 max-w-xs">
                                        <CharSelect v-model="char.id" mainKey="id" class="w-full" />
                                    </div>
                                    <button class="btn btn-error btn-sm" @click="removeChar(index)" aria-label="删除角色">删除</button>
                                </div>

                                <!-- 角色信息卡片 -->
                                <div v-if="charMap.get(char.id)" class="bg-base-100 rounded-xl p-4 mb-4 flex items-center gap-4">
                                    <div class="relative bg-linear-15 from-yellow-500/80 to-yellow-700/80 rounded-lg overflow-hidden">
                                        <img
                                            :src="LeveledChar.url(charMap.get(char.id)?.icon)"
                                            alt="角色图片"
                                            class="w-20 h-20 object-cover"
                                        />
                                        <div class="absolute top-1 -left-1">
                                            <img
                                                :src="LeveledChar.elementUrl(charMap.get(char.id)!.属性!)"
                                                alt="角色图片"
                                                class="w-8 h-4 object-cover rounded-lg"
                                            />
                                        </div>
                                    </div>
                                    <div class="flex-1">
                                        <h4 class="text-md font-semibold">{{ charMap.get(char.id)?.名称 }}</h4>
                                        <div class="mt-1">
                                            <label class="flex flex-col gap-1">
                                                <span class="text-xs opacity-80">选择等级</span>
                                                <RangeSelector
                                                    class="w-40"
                                                    v-model:from="char.config.currentLevel"
                                                    v-model:to="char.config.targetLevel"
                                                    :min="1"
                                                    :max="80"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <!-- 技能部分 -->
                                <div>
                                    <h5 class="text-md font-semibold mb-3 flex items-center gap-2">
                                        <span class="text-lg">
                                            <Icon icon="ri:flashlight-line" />
                                        </span>
                                        技能
                                    </h5>
                                    <div class="flex flex-col gap-3">
                                        <div
                                            v-if="charMap.get(char.id)?.技能"
                                            v-for="(skill, skillIndex) in charMap.get(char.id)?.技能.slice(0, 3) || []"
                                            :key="skillIndex"
                                            class="flex items-center gap-4 bg-base-100 p-3 rounded-lg"
                                        >
                                            <div class="shrink-0 rounded-full overflow-hidden">
                                                <div
                                                    alt="技能图标"
                                                    class="size-10 rounded-full bg-base-content"
                                                    :style="{ mask: `url(${LeveledSkill.url(skill.icon)}) no-repeat center/contain` }"
                                                />
                                            </div>
                                            <div class="flex-1">
                                                <div class="text-sm font-medium">{{ skill.名称 }}</div>
                                            </div>
                                            <RangeSelector
                                                class="w-40"
                                                v-model:from="char.config.skills[skillIndex].currentLevel"
                                                v-model:to="char.config.skills[skillIndex].targetLevel"
                                                :min="1"
                                                :max="10"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 武器养成 -->
                <section class="w-full">
                    <div class="flex items-center justify-between mb-2 p-2">
                        <h3 class="text-xl font-semibold text-base-content flex items-center gap-2">
                            <Icon icon="ri:sword-line" />
                            武器养成
                        </h3>
                        <div class="flex gap-2">
                            <button
                                class="btn btn-primary btn-sm gap-2"
                                @click="syncWeapons"
                                :disabled="syncing || weapons.length === 0"
                                aria-label="同步武器信息"
                            >
                                <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                                <Icon v-else icon="ri:refresh-line" />
                                同步武器
                            </button>
                            <button class="btn btn-primary btn-sm gap-2" @click="addWeapon" aria-label="添加武器">
                                <span class="text-xl font-bold">+</span>
                                添加武器
                            </button>
                        </div>
                    </div>

                    <div class="flex flex-col gap-4">
                        <div
                            v-for="(weapon, index) in weapons"
                            :key="index"
                            class="card bg-base-200 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg"
                        >
                            <div class="card-body p-4">
                                <div class="flex items-center justify-between mb-4">
                                    <div class="flex-1 max-w-xs">
                                        <WeaponSelect mainKey="id" v-model="weapon.id" class="w-full" />
                                    </div>
                                    <button class="btn btn-error btn-sm" @click="removeWeapon(index)" aria-label="删除武器">删除</button>
                                </div>

                                <!-- 武器信息卡片 -->
                                <div v-if="weaponMap.get(weapon.id)" class="bg-base-100 rounded-xl p-4 flex items-center gap-4">
                                    <div class="relative bg-linear-15 from-yellow-500/80 to-yellow-700/80 rounded-lg overflow-hidden">
                                        <img
                                            :src="LeveledWeapon.url(weaponMap.get(weapon.id)?.icon)"
                                            alt="武器图片"
                                            class="w-16 h-16 object-cover"
                                        />
                                    </div>
                                    <div class="flex-1">
                                        <h4 class="text-md font-semibold">{{ weaponMap.get(weapon.id)?.名称 }}</h4>
                                        <div class="mt-1 flex gap-4">
                                            <label class="flex flex-col gap-1">
                                                <span class="text-xs opacity-80">选择等级</span>
                                                <RangeSelector
                                                    class="w-40"
                                                    v-model:from="weapon.config.currentLevel"
                                                    v-model:to="weapon.config.targetLevel"
                                                    :min="1"
                                                    :max="80"
                                                />
                                            </label>
                                            <label class="flex flex-col gap-1">
                                                <span class="text-xs opacity-80">熔炼等级</span>
                                                <RangeSelector
                                                    class="w-40"
                                                    v-model:from="weapon.config.currentRefine"
                                                    v-model:to="weapon.config.targetRefine"
                                                    :min="0"
                                                    :max="5"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 魔之楔养成 -->
                <section class="w-full">
                    <div class="flex items-center justify-between mb-2 p-2">
                        <h3 class="text-xl font-semibold text-base-content flex items-center gap-2">
                            <Icon icon="po-A" />
                            魔之楔养成
                        </h3>
                        <div class="flex gap-2">
                            <button class="btn btn-primary btn-sm gap-2" @click="clearMods" aria-label="清空">清空</button>
                            <button class="btn btn-primary btn-sm gap-2" @click="isBatchAddModalOpen = true" aria-label="批量添加魔之楔">
                                <span class="text-xl font-bold">+</span>
                                添加魔之楔
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-[repeat(auto-fill,minmax(450px,1fr))] gap-4">
                        <div
                            v-for="(mod, index) in mods"
                            :key="index"
                            class="card bg-base-200 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg"
                        >
                            <div class="card-body p-2">
                                <!-- 魔之楔信息卡片 -->
                                <div v-if="modMap.get(mod.id)" class="rounded-xl p-2 flex items-center gap-4">
                                    <div class="relative bg-linear-15 from-yellow-500/80 to-yellow-700/80 rounded-lg overflow-hidden">
                                        <img
                                            :src="LeveledMod.url(modMap.get(mod.id)?.icon)"
                                            alt="魔之楔图片"
                                            class="size-12 object-cover"
                                        />
                                    </div>
                                    <div class="flex-1">
                                        <div class="mt-1 flex items-center gap-4">
                                            <div class="flex flex-1 justify-between">
                                                <h4 class="text-md font-semibold">{{ modMap.get(mod.id)?.名称 }}</h4>
                                            </div>
                                            <label class="flex flex-col gap-1">
                                                <span class="text-xs opacity-80">选择等级</span>
                                                <RangeSelector
                                                    class="w-full"
                                                    v-model:from="mod.config.currentLevel"
                                                    v-model:to="mod.config.targetLevel"
                                                    :min="0"
                                                    :max="10"
                                                />
                                            </label>
                                            <label class="flex flex-col gap-1">
                                                <span class="text-xs opacity-80">选择数量</span>
                                                <Select class="input input-sm w-full" v-model="mod.config.count">
                                                    <SelectItem v-for="i in 8" :key="i" :value="i">{{ i }}</SelectItem>
                                                </Select>
                                            </label>
                                            <label class="flex flex-col gap-1">
                                                <span class="text-xs opacity-80">操作</span>
                                                <button class="btn btn-error btn-sm" @click="removeMod(index)" aria-label="删除魔之楔">
                                                    <Icon icon="ri:delete-bin-line" />
                                                </button>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
            <div class="p-4 flex justify-center">
                <!-- 结果显示 -->
                <div v-if="result" class="w-full">
                    <h3 class="text-xl font-bold text-base-content mb-6 flex items-center gap-2">
                        <div class="flex items-center gap-2">
                            <Icon icon="ri:bar-chart-line" />
                            结果
                        </div>
                        <div
                            class="ml-auto cursor-pointer text-primary flex items-center gap-2 hover:underline"
                            @click="isOpenGraph = true"
                        >
                            <Icon icon="ri:git-branch-line" />
                            点击查看关系图
                        </div>
                    </h3>

                    <!-- 时间估算 -->
                    <div
                        v-if="result.timeEstimate"
                        class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg mb-6"
                    >
                        <div class="card-body p-6">
                            <div class="flex text-lg items-center mb-4 gap-2">
                                <Icon icon="ri:time-line" />
                                <h4 class="font-semibold">时间估算</h4>
                            </div>
                            <div class="text-3xl md:text-4xl font-bold">
                                {{ result.timeEstimate.days }} 天 {{ result.timeEstimate.hours }} 小时 {{ result.timeEstimate.mins }} 分钟
                            </div>
                        </div>
                    </div>

                    <!-- 副本次数 -->
                    <div
                        v-if="result.timeEstimate"
                        class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg mb-6"
                    >
                        <div class="card-body p-6">
                            <div class="flex text-lg items-center mb-4 gap-2">
                                <Icon icon="ri:refresh-line" />
                                <h4 class="font-semibold">副本次数</h4>
                            </div>
                            <SRouterLink
                                :to="`/db/dungeon/${dungeon.id}`"
                                v-for="[dungeon, [times, reason]] in Object.entries(result.timeEstimate.dungeonTimes).map(
                                    v => [dungeonMap.get(+v[0]), v[1]] as [Dungeon, [number, string]]
                                )"
                                :key="dungeon.id"
                                class="p-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors duration-200"
                            >
                                <div class="flex items-start justify-between">
                                    <div>
                                        <div class="font-medium flex gap-2 items-center">
                                            <img
                                                v-if="dungeon.e"
                                                :src="LeveledChar.elementUrl(dungeon.e)"
                                                class="h-8 w-4 object-cover inline-block rounded"
                                            />
                                            {{ getDungeonName(dungeon) }} * {{ times }}次 ({{ reason }})
                                        </div>
                                    </div>
                                    <div class="flex flex-col items-end gap-1">
                                        <span class="text-xs px-2 py-0.5 rounded" :class="getDungeonType(dungeon.t).color + ' text-white'">
                                            {{ getDungeonType(dungeon.t).label }}
                                        </span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                    <span>怪物: {{ (dungeon.m || []).length }}种</span>
                                    <span v-if="(dungeon.sm || []).length">特殊: {{ (dungeon.sm || []).length }}个</span>
                                    <span v-if="dungeon.r?.length"> 奖励: {{ getDungeonRewardNames(dungeon) }} </span>
                                    <span class="ml-auto">ID: {{ dungeon.id }}</span>
                                    <span class="text-xs opacity-70">Lv.{{ dungeon.lv }}</span>
                                </div>
                            </SRouterLink>
                        </div>
                    </div>

                    <!-- 资源过滤状态 -->
                    <div
                        v-if="excludedResources.size > 0"
                        class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg mb-6"
                    >
                        <div class="card-body p-6">
                            <div class="flex items-center justify-between mb-4">
                                <div class="flex text-lg items-center gap-2">
                                    <Icon icon="ri:filter-line" />
                                    <h4 class="font-semibold text-base-content">已过滤资源</h4>
                                </div>
                                <button class="btn btn-sm btn-secondary" @click="clearResourceFilters">
                                    <Icon icon="codicon:chrome-close" />
                                    清除过滤
                                </button>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <span
                                    v-for="resource in excludedResources"
                                    :key="resource"
                                    class="px-3 py-1 bg-error/20 text-error rounded-full text-sm flex items-center gap-1"
                                >
                                    <span>{{ $t(resource) }}</span>
                                    <button @click.stop="toggleResourceFilter(resource)" class="text-xs hover:underline">
                                        <Icon icon="codicon:chrome-close" class="h-3 w-3" />
                                    </button>
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- 总消耗 -->
                    <div
                        class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg mb-6"
                    >
                        <div class="card-body p-6">
                            <div class="flex text-lg items-center justify-between mb-4 gap-2">
                                <div class="flex items-center gap-2">
                                    <Icon icon="ri:file-list-line" />
                                    <h4 class="font-semibold text-base-content">总消耗</h4>
                                </div>
                                <div class="text-xs opacity-70">点击资源可过滤</div>
                            </div>
                            <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                                <ResourceCostItem
                                    v-for="(value, key) in result.totalCost"
                                    :key="key"
                                    :name="key"
                                    :value="value!"
                                    class="bg-base-200 hover:bg-base-300 cursor-pointer"
                                    @click="toggleResourceFilter(key)"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- 详细消耗 -->
                    <div class="flex flex-col gap-6">
                        <!-- 等级升级消耗 -->
                        <div
                            class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg"
                        >
                            <div class="card-body p-6">
                                <div class="flex text-lg items-center mb-4 gap-2">
                                    <Icon icon="ri:lightbulb-line" />
                                    <h4 class="font-semibold text-base-content">等级升级消耗</h4>
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.levelUp"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="bg-base-200 hover:bg-base-300 cursor-pointer"
                                        @click="toggleResourceFilter(key)"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- 技能升级 -->
                        <div
                            class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg"
                            v-if="result.details.skills && Object.keys(result.details.skills).length > 0"
                        >
                            <div class="card-body p-6">
                                <div class="flex text-lg items-center mb-4 gap-2">
                                    <Icon icon="ri:flashlight-line" />
                                    <h4 class="font-semibold text-base-content">技能升级消耗</h4>
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.skills"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="bg-base-200 hover:bg-base-300 cursor-pointer"
                                        @click="toggleResourceFilter(key)"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- 突破消耗 -->
                        <div
                            class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg"
                            v-if="result.details.breakthrough && Object.keys(result.details.breakthrough).length > 0"
                        >
                            <div class="card-body p-6">
                                <div class="flex text-lg items-center mb-4 gap-2">
                                    <Icon icon="ri:star-line" />
                                    <h4 class="font-semibold text-base-content">突破消耗</h4>
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.breakthrough"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="bg-base-200 hover:bg-base-300 cursor-pointer"
                                        @click="toggleResourceFilter(key)"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- 锻造消耗 -->
                        <div
                            class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg"
                            v-if="result.details.craft && Object.keys(result.details.craft).length > 0"
                        >
                            <div class="card-body p-6">
                                <div class="flex text-lg items-center mb-4 gap-2">
                                    <Icon icon="ri:hammer-line" />
                                    <h4 class="font-semibold text-base-content">锻造消耗</h4>
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.craft"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="bg-base-200 hover:bg-base-300 cursor-pointer"
                                        @click="toggleResourceFilter(key)"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else class="loading loading-spinner mb-4"></div>
            </div>
        </ScrollArea>
        <div class="inset-0 absolute bg-base-100" v-if="isOpenGraph && result?.resourceTree">
            <div class="absolute flex justify-center items-center p-2 z-1">
                <div
                    class="flex items-center gap-1 text-xs bg-base-200 hover:bg-base-300 cursor-pointer p-1 rounded"
                    @click="isOpenGraph = false"
                >
                    <Icon icon="ri:close-line" class="text-2xl text-red-500" />
                </div>
            </div>
            <ResourceTreeGraph :tree="result.resourceTree" />
        </div>
    </div>

    <!-- 批量添加魔之楔弹窗 -->
    <DialogModel v-model="isBatchAddModalOpen" class="w-[80vw] max-w-200">
        <div class="w-full max-w-4xl">
            <h2 class="text-2xl font-bold mb-4">批量添加魔之楔</h2>
            <p class="mb-4">选择要添加的魔之楔，然后点击确认添加</p>

            <!-- 筛选和搜索 -->
            <div class="p-4 pb-0 flex flex-wrap items-center gap-2 mb-3 bg-base-100 rounded-lg">
                <div class="ml-auto flex items-center gap-4">
                    <label class="w-40 input input-sm">
                        <svg class="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.5" fill="none" stroke="currentColor">
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.3-4.3" />
                            </g>
                        </svg>
                        <input v-model="modSearchQuery" type="search" class="grow" placeholder="搜索魔之楔..." />
                    </label>
                    <div
                        class="btn btn-sm btn-secondary"
                        :class="{ 'btn-disabled': !filteredMods.length }"
                        @click="handleSelectAllModsForBatch"
                    >
                        {{ selectedModsForBatch.size === filteredMods.length ? "取消全选" : "全选" }}
                    </div>
                    <div v-for="color in ['金', '紫', '蓝', '绿', '白'] as const" :key="color" class="label text-xs">
                        {{ color }}
                        <input
                            :checked="enableMods[color]"
                            type="checkbox"
                            class="toggle toggle-secondary"
                            @change="enableMods[color] = ($event.target! as any).checked"
                        />
                    </div>
                </div>
            </div>

            <!-- MOD列表 -->
            <div class="min-h-80 w-full pb-4 max-h-[60vh] overflow-auto">
                <div
                    v-if="(['金', '紫', '蓝', '绿', '白'] as const).some(color => enableMods[color])"
                    class="p-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4"
                >
                    <div
                        v-for="(mod, index) in filteredMods"
                        :key="index"
                        class="relative cursor-pointer transition-all duration-200 hover:scale-105"
                    >
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
                <div v-else class="p-4 flex w-full h-72 justify-center items-center text-gray-500">请选择要显示的魔之楔品质</div>
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
