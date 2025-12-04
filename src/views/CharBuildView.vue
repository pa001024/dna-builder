<script setup lang="ts">
import { ref, computed } from "vue"
import { LeveledChar, LeveledMod, LeveledBuff, LeveledWeapon } from "../data/leveled"
import { CharBuild } from "../data/CharBuild"
import data from "../data/data.json"
import Select, { SelectItem } from "../components/select"
import { useLocalStorage } from "@vueuse/core"

// 获取实际数据
const charOptions = data.char.map((char) => ({ value: char.名称, label: char.名称, icon: `/imgs/${char.名称}.png` }))
const modOptions = data.mod.map((mod) => ({
    value: mod.id,
    label: mod.名称,
    quality: mod.品质,
    type: mod.类型,
    elm: mod.属性,
    icon: mod.系列 && ["狮鹫", "百首", "契约者"].includes(mod.系列) ? `/imgs/${mod.属性}${mod.系列}.png` : `/imgs/${mod.系列}系列.png`,
}))
const buffOptions = data.buff.map((buff) => ({
    value: buff.名称,
    label: buff.名称,
    description: buff.描述,
    icon: `/imgs/${buff.名称}.png`, // 可以根据需要添加图标
}))
// 近战和远程武器选项
const meleeWeaponOptions = data.weapon
    .filter((weapon) => weapon.类型 === "近战")
    .map((weapon) => ({
        value: weapon.名称,
        label: weapon.名称,
        type: weapon.类别,
        icon: `/imgs/${weapon.名称}.png`,
    }))
const rangedWeaponOptions = data.weapon
    .filter((weapon) => weapon.类型 === "远程")
    .map((weapon) => ({
        value: weapon.名称,
        label: weapon.名称,
        type: weapon.类别,
        icon: `/imgs/${weapon.名称}.png`,
    }))

const skillOptions = data.skill.map((skill) => ({
    value: skill.名称,
    label: skill.名称,
    // icon: `/imgs/${skill.名称}.png`, // 可以根据需要添加图标
}))

// 状态变量
const selectedChar = useLocalStorage("selectedChar", "赛琪")
const selectedCharLevel = useLocalStorage("selectedLevel", 80)
const selectedCharSkillLevel = useLocalStorage("selectedCharSkillLevel", 10)
const selectedMeleeWeapon = useLocalStorage("selectedMeleeWeapon", "辉珀刃")
const selectedMeleeWeaponLevel = useLocalStorage("selectedMeleeWeaponLevel", 80)
const selectedMeleeWeaponRefine = useLocalStorage("selectedMeleeWeaponType", 5)
const selectedRangedWeapon = useLocalStorage("selectedRangedWeapon", "剥离")
const selectedRangedWeaponLevel = useLocalStorage("selectedRangedWeaponLevel", 80)
const selectedRangedWeaponRefine = useLocalStorage("selectedRangedWeaponType", 5)
const selectedCharMods = ref<(LeveledMod | null)[]>([null, null, null, null, null, null, null, null])
const selectedMeleeMods = ref<(LeveledMod | null)[]>([null, null, null, null, null, null, null, null])
const selectedRangedMods = ref<(LeveledMod | null)[]>([null, null, null, null, null, null, null, null])
const selectedBuffs = ref<(LeveledBuff | null)[]>([])
const selectedModSlot = ref<number>(-1)
const selectedModType = ref("角色")

// 创建CharBuild实例
const charBuild = computed(
    () =>
        new CharBuild({
            char: new LeveledChar(selectedChar.value, selectedCharLevel.value),
            hpPercent: 1,
            resonanceGain: 0,
            mods: [
                ...selectedCharMods.value.filter((mod) => mod !== null),
                ...selectedMeleeMods.value.filter((mod) => mod !== null),
                ...selectedRangedMods.value.filter((mod) => mod !== null),
            ] as LeveledMod[],
            buffs: selectedBuffs.value.filter((buff) => buff !== null) as LeveledBuff[],
            melee: new LeveledWeapon(selectedMeleeWeapon.value, selectedMeleeWeaponRefine.value, selectedMeleeWeaponLevel.value),
            ranged: new LeveledWeapon(selectedRangedWeapon.value, selectedRangedWeaponRefine.value, selectedRangedWeaponLevel.value),
            baseName: selectedChar.value,
            enemyType: "小型",
            enemyLevel: 80,
            enemyResistance: 0,
            enemyHpType: "生命",
            targetFunction: "DPS",
        })
)

// 计算属性
const attributes = computed(() => charBuild.value.calculateAttributes())

// 计算武器属性
const meleeWeaponAttrs = computed(() => charBuild.value.calculateWeaponAttributes(charBuild.value.meleeWeapon))
const rangedWeaponAttrs = computed(() => charBuild.value.calculateWeaponAttributes(charBuild.value.rangedWeapon))

// 计算技能伤害
const skills = computed(() => charBuild.value.skills)
const skillDamages = computed(() => {
    return skills.value.map((skill) => ({
        skill,
        damage: charBuild.value.calculateSkillDamage(skill),
        dps: charBuild.value.calculateTargetFunction(charBuild.value.calculateSkillDamage(skill), undefined, skill),
    }))
})

// 计算武器伤害
const meleeDamage = computed(() => charBuild.value.calculateWeaponDamage(charBuild.value.meleeWeapon))
const rangedDamage = computed(() => charBuild.value.calculateWeaponDamage(charBuild.value.rangedWeapon))

// 计算总伤害
const totalDamage = computed(() => charBuild.value.calculate())

// 更新CharBuild实例
const updateCharBuild = () => {
    charBuild.value.char = new LeveledChar(selectedChar.value, 80)
    charBuild.value.meleeWeapon = new LeveledWeapon(selectedMeleeWeapon.value, 5)
    charBuild.value.rangedWeapon = new LeveledWeapon(selectedRangedWeapon.value, 5)
    charBuild.value.buffs = selectedBuffs.value.filter((buff) => buff !== null) as LeveledBuff[]
    charBuild.value.mods = [
        ...selectedCharMods.value.filter((mod) => mod !== null),
        ...selectedMeleeMods.value.filter((mod) => mod !== null),
        ...selectedRangedMods.value.filter((mod) => mod !== null),
    ] as LeveledMod[]
}

function selectMod(modId: number) {
    const slotIndex = selectedModSlot.value
    const type = selectedModType.value
    if (type === "角色") {
        selectedCharMods.value[slotIndex] = new LeveledMod(modId)
    } else if (type === "近战") {
        selectedMeleeMods.value[slotIndex] = new LeveledMod(modId)
    } else if (type === "远程") {
        selectedRangedMods.value[slotIndex] = new LeveledMod(modId)
    }
    updateCharBuild()
}

function removeMod() {
    const slotIndex = selectedModSlot.value
    const type = selectedModType.value
    if (type === "角色") {
        selectedCharMods.value[slotIndex] = null
    } else if (type === "近战") {
        selectedMeleeMods.value[slotIndex] = null
    } else if (type === "远程") {
        selectedRangedMods.value[slotIndex] = null
    }
    updateCharBuild()
}

// 获取品质对应的颜色类名
function getQualityColor(quality: string) {
    const colors: Record<string, string> = {
        金: "border-yellow-500",
        紫: "border-purple-500",
        蓝: "border-blue-500",
        绿: "border-green-500",
        白: "border-gray-500",
    }
    return colors[quality] || "border-gray-500"
}

// 获取品质对应的hover边框类名
function getQualityHoverBorder(quality: string) {
    const colors: Record<string, string> = {
        金: "hover:border-yellow-400",
        紫: "hover:border-purple-400",
        蓝: "hover:border-blue-400",
        绿: "hover:border-green-400",
        白: "hover:border-gray-400",
    }
    return colors[quality] || "hover:border-gray-400"
}

// 获取品质对应的文本类名
function getQualityText(quality: string) {
    const colors: Record<string, string> = {
        金: "text-yellow-400",
        紫: "text-purple-400",
        蓝: "text-blue-400",
        绿: "text-green-400",
        白: "text-gray-400",
    }
    return colors[quality] || "text-gray-400"
}
// 获取品质对应的等级
function getQualityLevel(quality: string) {
    const levels: Record<string, number> = {
        金: 10,
        紫: 5,
        蓝: 5,
        绿: 3,
        白: 3,
    }
    return levels[quality] || 0
}

// 切换BUFF选择
const toggleBuff = (buffName: string) => {
    const index = selectedBuffs.value.findIndex((buff) => buff?.名称 === buffName)
    if (index > -1) {
        selectedBuffs.value.splice(index, 1)
    } else {
        selectedBuffs.value.push(new LeveledBuff(buffName, 1))
    }
    updateCharBuild()
}

// 保存配置
const saveConfig = () => {
    // 实现保存配置功能
    console.log("保存配置")
}

// 重置配置
const resetConfig = () => {
    selectedChar.value = "赛琪"
    selectedMeleeWeapon.value = "辉珀刃"
    selectedRangedWeapon.value = "剥离"
    selectedCharMods.value = [null, null, null, null, null, null, null, null]
    selectedMeleeMods.value = [null, null, null, null, null, null, null, null]
    selectedRangedMods.value = [null, null, null, null, null, null, null, null]
    selectedBuffs.value = []
    updateCharBuild()
}
</script>

<template>
    <div class="h-full overflow-scroll">
        <div class="container mx-auto p-4">
            <div class="flex justify-end gap-2 mb-4">
                <button class="btn btn-primary">保存配置</button>
                <button class="btn">重置</button>
            </div>

            <!-- 角色选择 -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <div class="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                            <span class="text-xs">1</span>
                        </div>
                        <h3 class="text-lg font-semibold">选择角色</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedChar"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="char in charOptions" :key="char.value" :value="char.value">
                                {{ char.label }}
                            </SelectItem>
                        </Select>
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedCharLevel"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="lv in [1, 10, 20, 30, 40, 50, 60, 70, 80]" :key="lv" :value="lv">
                                {{ lv }}
                            </SelectItem>
                        </Select>
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedCharSkillLevel"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="lv in [1, 10, 20, 30, 40, 50, 60, 70, 80]" :key="lv" :value="lv">
                                {{ lv }}
                            </SelectItem>
                        </Select>
                    </div>
                </div>

                <!-- 近战武器选择 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <div class="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                            <span class="text-xs">2</span>
                        </div>
                        <h3 class="text-lg font-semibold">近战武器</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedMeleeWeapon"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="weapon in meleeWeaponOptions" :key="weapon.value" :value="weapon.value">
                                {{ weapon.label }}
                            </SelectItem>
                        </Select>
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedMeleeWeaponRefine"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="lv in [0, 1, 2, 3, 4, 5]" :key="lv" :value="lv">
                                {{ lv }}
                            </SelectItem>
                        </Select>
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedMeleeWeaponLevel"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="lv in [1, 10, 20, 30, 40, 50, 60, 70, 80]" :key="lv" :value="lv">
                                {{ lv }}
                            </SelectItem>
                        </Select>
                    </div>
                </div>

                <!-- 远程武器选择 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <div class="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                            <span class="text-xs">3</span>
                        </div>
                        <h3 class="text-lg font-semibold">远程武器</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedRangedWeapon"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="weapon in rangedWeaponOptions" :key="weapon.value" :value="weapon.value">
                                {{ weapon.label }}
                            </SelectItem>
                        </Select>
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedRangedWeaponRefine"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="lv in [0, 1, 2, 3, 4, 5]" :key="lv" :value="lv">
                                {{ lv }}
                            </SelectItem>
                        </Select>
                        <Select
                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            v-model="selectedRangedWeaponLevel"
                            @change="updateCharBuild"
                        >
                            <SelectItem v-for="lv in [1, 10, 20, 30, 40, 50, 60, 70, 80]" :key="lv" :value="lv">
                                {{ lv }}
                            </SelectItem>
                        </Select>
                    </div>
                </div>
            </div>

            <!-- MOD配置 -->
            <div class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
                <div class="flex items-center gap-2 mb-3">
                    <div class="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                        <span class="text-xs">4</span>
                    </div>
                    <h3 class="text-lg font-semibold">MOD配置</h3>
                </div>
                <div class="grid grid-cols-4 md:grid-cols-8 gap-4">
                    <div
                        @click="selectedModSlot = index"
                        v-for="(mod, index) in selectedModType === '角色'
                            ? selectedCharMods
                            : selectedModType === '近战'
                            ? selectedMeleeMods
                            : selectedRangedMods"
                        :key="index"
                        class="aspect-square bg-base-200 rounded-lg border-2 flex items-center justify-center hover:border-purple-500 transition-colors cursor-pointer"
                        :class="mod ? getQualityColor(mod.品质) : 'border-dashed border-gray-600'"
                    >
                        <div class="relative w-full h-full flex items-center justify-center">
                            <div v-if="mod" class="w-full h-full flex items-center justify-center bg-opacity-30 rounded-lg overflow-hidden">
                                <!-- 背景 -->
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <img :src="mod.url" :alt="mod.名称" />
                                </div>
                                <!-- MOD名称 -->
                                <div class="relative mt-auto w-full bg-black/50 z-10 text-left p-2">
                                    <div class="text-base-100 text-sm font-bold mb-1">{{ mod.名称 }}</div>
                                    <div class="text-base-300 text-xs">Lv.{{ mod.等级 }}</div>
                                </div>
                                <!-- 关闭按钮 -->
                                <button
                                    @click.stop="removeMod()"
                                    class="absolute cursor-pointer -top-2 -right-2 w-5 h-5 bg-red-400 bg-opacity-50 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                                >
                                    <span class="text-white text-xs">×</span>
                                </button>
                            </div>
                            <div v-else class="text-gray-500">+</div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- MOD选择面板 -->
            <div v-if="selectedModSlot != -1" class="mt-4 bg-base-200 rounded-lg p-3">
                <div class="flex">
                    <h4 class="text-sm font-medium mb-3 p-2">选择MOD - 槽位 {{ selectedModSlot + 1 }}</h4>

                    <!-- 关闭按钮 -->
                    <button class="ml-auto btn btn-ghost btn-sm btn-square" @click="selectedModSlot = -1">
                        <Icon bold icon="codicon:chrome-close" />
                    </button>
                </div>

                <!-- 品质筛选 -->
                <div class="tabs tabs-box">
                    <template v-for="quality in '金紫蓝绿白'" :key="quality">
                        <input type="radio" name="mod_select" class="tab" :aria-label="`${quality}色`" :checked="quality === '金'" />
                        <div class="tab-content py-2">
                            <ScrollArea class="h-80 w-full">
                                <div class="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
                                    <div
                                        v-for="mod in modOptions.filter(
                                            (m) =>
                                                m.type === selectedModType &&
                                                (!m.elm || m.elm === charBuild.char.属性) &&
                                                m.quality === quality
                                        )"
                                        :key="mod.value"
                                        class="border aspect-square rounded-md cursor-pointer transition-colors relative flex overflow-hidden"
                                        :class="[getQualityColor(mod.quality), getQualityHoverBorder(mod.quality)]"
                                        @click="selectMod(mod.value!)"
                                    >
                                        <!-- MOD背景图 -->
                                        <div class="absolute inset-0 opacity-50 rounded-md">
                                            <img :src="mod.icon" alt="MOD背景" class="w-full h-full object-cover rounded-md" />
                                        </div>

                                        <!-- MOD内容 -->
                                        <div class="relative p-3 z-10 mt-auto w-full bg-black/50 text-left text-base-100">
                                            <div class="text-sm font-medium truncate mb-1">{{ mod.label }}</div>
                                            <div class="flex items-center justify-between">
                                                <div class="text-xs">Lv.{{ getQualityLevel(mod.quality) }}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    </template>
                </div>
            </div>

            <!-- BUFF列表 -->
            <div class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                            <span class="text-xs">5</span>
                        </div>
                        <h3 class="text-lg font-semibold">BUFF列表</h3>
                    </div>
                    <div class="text-sm text-gray-400">已选 {{ selectedBuffs.length }} 个</div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div
                        v-for="buff in buffOptions.slice(0, 12)"
                        :key="buff.value"
                        class="bg-base-200 rounded-lg p-3 cursor-pointer hover:bg-gray-400 transition-colors"
                        @click="toggleBuff(buff.value)"
                    >
                        <div class="flex items-center justify-between mb-2">
                            <div class="text-sm font-medium">{{ buff.label }}</div>
                            <div class="text-xs text-gray-400">Lv.1</div>
                        </div>
                        <div class="text-xs text-gray-400 mb-2">{{ buff.description }}</div>
                        <div class="text-xs text-gray-500">收益: {{ Math.floor(Math.random() * 500) }}</div>
                    </div>
                </div>
            </div>

            <!-- 装配预览与保存 -->
            <div class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <span class="text-xs">6</span>
                    </div>
                    <h3 class="text-lg font-semibold">装配预览</h3>
                </div>

                <div class="flex flex-col gap-4 sm:flex-row">
                    <!-- 角色信息 -->
                    <div class="bg-base-200 rounded-lg p-3">
                        <div class="flex justify-center items-center gap-2">
                            <!-- 角色 -->
                            <div class="flex flex-col items-center">
                                <div class="size-60 bg-gray-700 rounded-lg mb-3 flex items-center justify-center">
                                    <span class="text-gray-400">
                                        <img :src="charBuild.char.url" alt="角色头像" class="w-full h-full object-cover rounded-md" />
                                    </span>
                                </div>
                                <div class="text-center">
                                    <div class="font-medium">{{ selectedChar }}</div>
                                    <div class="text-xs text-gray-400">等级: {{ selectedCharLevel }}</div>
                                </div>
                            </div>
                            <div class="flex flex-col gap-2">
                                <!-- 近战 -->
                                <div class="flex flex-col items-center">
                                    <div class="w-24 h-24 bg-gray-700 rounded-lg mb-2 flex items-center justify-center">
                                        <span class="text-gray-400">
                                            <img
                                                :src="charBuild.meleeWeapon.url"
                                                alt="近战武器"
                                                class="w-full h-full object-cover rounded-md"
                                            />
                                        </span>
                                    </div>
                                    <div class="text-center">
                                        <div class="font-medium">{{ selectedMeleeWeapon }}</div>
                                        <div class="text-xs text-gray-400">
                                            等级: {{ selectedMeleeWeaponLevel }} 精炼: {{ selectedMeleeWeaponRefine }}
                                        </div>
                                    </div>
                                </div>
                                <!-- 远程 -->
                                <div class="flex flex-col items-center">
                                    <div class="w-24 h-24 bg-gray-700 rounded-lg mb-2 flex items-center justify-center">
                                        <span class="text-gray-400">
                                            <img
                                                :src="charBuild.rangedWeapon.url"
                                                alt="远程武器"
                                                class="w-full h-full object-cover rounded-md"
                                            />
                                        </span>
                                    </div>
                                    <div class="text-center">
                                        <div class="font-medium">{{ selectedRangedWeapon }}</div>
                                        <div class="text-xs text-gray-400">
                                            等级: {{ selectedRangedWeaponLevel }} 精炼: {{ selectedRangedWeaponRefine }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 综合属性 -->
                    <div class="bg-base-200 rounded-lg p-3 flex-1">
                        <h4 class="text-sm font-medium mb-3">综合属性</h4>
                        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div class="flex flex-col items-center">
                                <div class="text-xs text-gray-400 mb-1">攻击</div>
                                <div class="text-lg font-semibold text-red-400">{{ attributes.attack }}</div>
                            </div>
                            <div class="flex flex-col items-center">
                                <div class="text-xs text-gray-400 mb-1">生命值</div>
                                <div class="text-lg font-semibold text-green-400">{{ attributes.health }}</div>
                            </div>
                            <div class="flex flex-col items-center">
                                <div class="text-xs text-gray-400 mb-1">护盾</div>
                                <div class="text-lg font-semibold text-blue-400">{{ attributes.shield }}</div>
                            </div>
                            <div class="flex flex-col items-center">
                                <div class="text-xs text-gray-400 mb-1">威力</div>
                                <div class="text-lg font-semibold text-yellow-400">{{ (attributes.power * 100).toFixed(0) }}%</div>
                            </div>
                            <div class="flex flex-col items-center">
                                <div class="text-xs text-gray-400 mb-1">耐久</div>
                                <div class="text-lg font-semibold text-purple-400">{{ (attributes.durability * 100).toFixed(0) }}%</div>
                            </div>
                            <div class="flex flex-col items-center">
                                <div class="text-xs text-gray-400 mb-1">效益</div>
                                <div class="text-lg font-semibold text-green-400">{{ (attributes.efficiency * 100).toFixed(0) }}%</div>
                            </div>
                            <div class="flex flex-col items-center">
                                <div class="text-xs text-gray-400 mb-1">范围</div>
                                <div class="text-lg font-semibold text-amber-400">{{ (attributes.range * 100).toFixed(0) }}%</div>
                            </div>
                            <div class="flex flex-col items-center" v-if="attributes.boost > 0">
                                <span class="text-xs text-gray-400 mb-1">昂扬</span>
                                <span class="text-lg font-semibold text-red-400">{{ (attributes.boost * 100).toFixed(0) }}%</span>
                            </div>
                            <div class="flex flex-col items-center" v-if="attributes.desperate > 0">
                                <span class="text-xs text-gray-400 mb-1">背水</span>
                                <span class="text-lg font-semibold text-green-400">{{ (attributes.desperate * 100).toFixed(0) }}%</span>
                            </div>
                            <div class="flex flex-col items-center" v-if="attributes.damageIncrease > 0">
                                <span class="text-xs text-gray-400 mb-1">增伤</span>
                                <span class="text-lg font-semibold text-cyan-400">{{ (attributes.damageIncrease * 100).toFixed(0) }}%</span>
                            </div>
                            <div class="flex flex-col items-center" v-if="attributes.weaponDamage > 0">
                                <span class="text-xs text-gray-400 mb-1">武器伤害</span>
                                <span class="text-lg font-semibold text-orange-400">{{ (attributes.weaponDamage * 100).toFixed(0) }}%</span>
                            </div>
                            <div class="flex flex-col items-center" v-if="attributes.skillDamage > 0">
                                <span class="text-xs text-gray-400 mb-1">技能伤害</span>
                                <span class="text-lg font-semibold text-purple-400">{{ (attributes.skillDamage * 100).toFixed(0) }}%</span>
                            </div>
                            <div class="flex flex-col items-center" v-if="attributes.independentDamageIncrease > 0">
                                <span class="text-xs text-gray-400 mb-1">独立增伤</span>
                                <span class="text-lg font-semibold text-indigo-400">{{ (attributes.independentDamageIncrease * 100).toFixed(0) }}%</span>
                            </div>
                            <div class="flex flex-col items-center" v-if="attributes.penetration > 0">
                                <span class="text-xs text-gray-400 mb-1">属性穿透</span>
                                <span class="text-lg font-semibold text-lime-400">{{ (attributes.penetration * 100).toFixed(0) }}%</span>
                            </div>
                            <div class="flex flex-col items-center" v-if="attributes.ignoreDefense > 0">
                                <span class="text-xs text-gray-400 mb-1">无视防御</span>
                                <span class="text-lg font-semibold text-pink-400">{{ (attributes.ignoreDefense * 100).toFixed(0) }}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
