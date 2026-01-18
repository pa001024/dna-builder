<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNARoleEntity } from "dna-api"
import { computed, onMounted, ref } from "vue"
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
import { type CharLevelUpConfig, LevelUpCalculator, type ModLevelUpConfig, type WeaponLevelUpConfig } from "@/data/LevelUpCalculator"
import { initEmojiDict } from "@/util"
import { getDungeonName, getDungeonRewardNames, getDungeonType } from "@/utils/dungeon-utils"
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

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        ui.showErrorMessage("请先登录")
        return
    }
    api = p
    await initEmojiDict()
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
        const roleRes = await api.defaultRoleForTool()
        if (roleRes.is_success && roleRes.data) {
            roleInfo.value = roleRes.data
        } else {
            ui.showErrorMessage(roleRes.msg || "获取默认角色信息失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取角色信息失败", e)
    }
}

// 计算总结果
const result = computed(() => {
    // 获取实际的角色、武器、魔之楔数据
    const actualChars = chars.value.map(item => charMap.get(item.id)).filter((char): char is (typeof charData)[0] => char !== undefined)

    const actualWeapons = weapons.value
        .map(item => weaponMap.get(item.id))
        .filter((weapon): weapon is (typeof weaponData)[0] => weapon !== undefined)

    const actualMods = mods.value.map(item => modMap.get(item.id)).filter((mod): mod is (typeof modData)[0] => mod !== undefined)

    // 计算角色养成结果
    const charResult = LevelUpCalculator.calculateCharLevelUp(actualChars, {
        chars: chars.value.map(item => item.config),
    })

    // 计算武器养成结果
    const weaponResult = LevelUpCalculator.calculateWeaponLevelUp(actualWeapons, {
        weapons: weapons.value.map(item => item.config),
    })

    // 计算魔之楔养成结果
    const modResult = LevelUpCalculator.calculateModLevelUp(actualMods, {
        mods: mods.value.map(item => item.config),
    })

    // 合并结果
    return LevelUpCalculator.mergeResults([charResult, weaponResult, modResult])
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

// 添加魔之楔
const addMod = () => {
    mods.value.push({
        id: 56154,
        config: {
            currentLevel: 1,
            targetLevel: 10,
        },
    })
}

// 移除魔之楔
const removeMod = (index: number) => {
    if (mods.value.length > 1) {
        mods.value.splice(index, 1)
    }
}
</script>

<template>
    <div class="h-full flex flex-col gap-4 md:flex-row">
        <ScrollArea class="md:h-full flex-1">
            <div class="p-4 space-y-4">
                <!-- 角色养成 -->
                <section>
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
                <section>
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
                <section>
                    <div class="flex items-center justify-between mb-2 p-2">
                        <h3 class="text-xl font-semibold text-base-content flex items-center gap-2">
                            <Icon icon="po-A" />
                            魔之楔养成
                        </h3>
                        <button class="btn btn-primary btn-sm gap-2" @click="addMod" aria-label="添加魔之楔">
                            <span class="text-xl font-bold">+</span>
                            添加魔之楔
                        </button>
                    </div>

                    <div class="flex flex-col gap-4">
                        <div
                            v-for="(mod, index) in mods"
                            :key="index"
                            class="card bg-base-200 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg"
                        >
                            <div class="card-body p-4">
                                <div class="flex items-center justify-between mb-4">
                                    <div class="flex-1 max-w-xs">
                                        <ModSelect v-model="mod.id" class="w-full" />
                                    </div>
                                    <button
                                        class="btn btn-error btn-sm"
                                        @click="removeMod(index)"
                                        :disabled="mods.length <= 1"
                                        :aria-disabled="mods.length <= 1"
                                        aria-label="删除魔之楔"
                                    >
                                        删除
                                    </button>
                                </div>

                                <!-- 魔之楔信息卡片 -->
                                <div v-if="modMap.get(mod.id)" class="bg-base-100 rounded-xl p-4 mb-4 flex items-center gap-4">
                                    <div class="relative bg-linear-15 from-yellow-500/80 to-yellow-700/80 rounded-lg overflow-hidden">
                                        <img
                                            :src="LeveledMod.url(modMap.get(mod.id)?.icon)"
                                            alt="魔之楔图片"
                                            class="w-16 h-16 object-cover"
                                        />
                                    </div>
                                    <div class="flex-1">
                                        <h4 class="text-lg font-semibold">{{ modMap.get(mod.id)?.名称 }}</h4>
                                        <div class="mt-1">
                                            <label class="flex flex-col gap-1">
                                                <span class="text-xs opacity-80">选择等级</span>
                                                <RangeSelector
                                                    class="w-40"
                                                    v-model:from="mod.config.currentLevel"
                                                    v-model:to="mod.config.targetLevel"
                                                    :min="1"
                                                    :max="80"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </ScrollArea>
        <ScrollArea class="md:h-full flex-1">
            <div class="p-4">
                <!-- 结果显示 -->
                <section class="mb-4">
                    <h3 class="text-xl font-bold text-base-content mb-6 flex items-center gap-2">
                        <Icon icon="ri:bar-chart-line" />
                        结果
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
                            <RouterLink
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
                                    <span>怪物: {{ (dungeon.m || []).length }}个</span>
                                    <span v-if="(dungeon.sm || []).length">特殊: {{ (dungeon.sm || []).length }}个</span>
                                    <span v-if="dungeon.r?.length"> 奖励: {{ getDungeonRewardNames(dungeon) }} </span>
                                    <span class="ml-auto">ID: {{ dungeon.id }}</span>
                                    <span class="text-xs opacity-70">Lv.{{ dungeon.lv }}</span>
                                </div>
                            </RouterLink>
                        </div>
                    </div>

                    <!-- 总消耗 -->
                    <div
                        class="card bg-base-100 border-2 border-base-300 hover:border-base-content/30 transition-all duration-200 hover:shadow-lg mb-6"
                    >
                        <div class="card-body p-6">
                            <div class="flex text-lg items-center mb-4 gap-2">
                                <Icon icon="ri:file-list-line" />
                                <h4 class="font-semibold text-base-content">总消耗</h4>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                <ResourceCostItem
                                    v-for="(value, key) in result.totalCost"
                                    :key="key"
                                    :name="key"
                                    :value="value!"
                                    class="flex justify-between items-center p-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors duration-200"
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
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.levelUp"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="flex justify-between items-center p-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors duration-200"
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
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.skills"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="flex justify-between items-center p-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors duration-200"
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
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.breakthrough"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="flex justify-between items-center p-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors duration-200"
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
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <ResourceCostItem
                                        v-for="(value, key) in result.details.craft"
                                        :key="key"
                                        :name="key"
                                        :value="value!"
                                        class="flex justify-between items-center p-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors duration-200"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </ScrollArea>
    </div>
</template>
