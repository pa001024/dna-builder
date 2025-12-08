<script setup lang="ts">
import { computed, reactive } from "vue"
import { LeveledChar, LeveledMod, LeveledBuff, LeveledWeapon } from "../data/leveled"
import { CharBuild } from "../data/CharBuild"
import data from "../data/data.json"
import Select, { SelectItem } from "../components/select"
import { useLocalStorage } from "@vueuse/core"
import { groupBy, cloneDeep } from "lodash-es"

// 获取实际数据
const charOptions = data.char.map((char) => ({ value: char.名称, label: char.名称, elm: char.属性, icon: `/imgs/${char.名称}.png` }))
const modOptions = data.mod.map((mod) => ({
    value: mod.id,
    label: mod.名称,
    quality: mod.品质,
    type: mod.类型,
    limit: mod.属性 || mod.限定,
    ser: mod.系列,
    icon: mod.系列 && ["狮鹫", "百首", "契约者"].includes(mod.系列) ? `/imgs/${mod.属性}${mod.系列}.png` : `/imgs/${mod.系列}系列.png`,
}))
const _buffOptions = reactive(
    data.buff.map((buff) => ({
        value: new LeveledBuff(buff.名称),
        label: buff.名称,
        limit: buff.限定,
        description: buff.描述,
        icon: `/imgs/${buff.名称}.png`, // 可以根据需要添加图标
    }))
)
const buffOptions = computed(() =>
    _buffOptions.filter((buff) => !buff.limit || buff.limit === selectedChar.value || buff.limit === charBuild.value.char.属性)
)
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

// 状态变量
const selectedChar = useLocalStorage("selectedChar", "赛琪")
const charSettingsKey = computed(() => `build.${selectedChar.value}`)
const defaultCharSettings = {
    charLevel: 80,
    baseName: "",
    hpPercent: 1,
    resonanceGain: 0,
    enemyType: "small",
    enemyLevel: 80,
    enemyResistance: 0,
    enemyHpType: "生命",
    targetFunction: "伤害",
    charSkillLevel: 10,
    meleeWeapon: "枯朽",
    meleeWeaponLevel: 80,
    meleeWeaponRefine: 5,
    rangedWeapon: "剥离",
    rangedWeaponLevel: 80,
    rangedWeaponRefine: 5,
    auraMod: 31524, // 警惕
    charMods: Array(8).fill(null) as ([number, number] | null)[],
    meleeMods: Array(8).fill(null) as ([number, number] | null)[],
    rangedMods: Array(8).fill(null) as ([number, number] | null)[],
    skillWeaponMods: Array(4).fill(null) as ([number, number] | null)[],
    buffs: [] as [string, number][],
}
const charSettings = useLocalStorage(charSettingsKey, defaultCharSettings, { deep: true })
const selectedCharMods = computed(() => charSettings.value.charMods.map((v) => (v ? new LeveledMod(v[0], v[1]) : null)))
const selectedMeleeMods = computed(() => charSettings.value.meleeMods.map((v) => (v ? new LeveledMod(v[0], v[1]) : null)))
const selectedRangedMods = computed(() => charSettings.value.rangedMods.map((v) => (v ? new LeveledMod(v[0], v[1]) : null)))
const selectedSkillWeaponMods = computed(() => charSettings.value.skillWeaponMods.map((v) => (v ? new LeveledMod(v[0], v[1]) : null)))
const selectedBuffs = computed(() => charSettings.value.buffs.map((v) => new LeveledBuff(v[0], v[1])))

// 创建CharBuild实例
const charBuild = computed(
    () =>
        new CharBuild({
            char: new LeveledChar(selectedChar.value, charSettings.value.charLevel),
            mods: [
                ...selectedCharMods.value.filter((mod) => mod !== null),
                ...selectedMeleeMods.value.filter((mod) => mod !== null),
                ...selectedRangedMods.value.filter((mod) => mod !== null),
                ...selectedSkillWeaponMods.value.filter((mod) => mod !== null),
            ] as LeveledMod[],
            buffs: selectedBuffs.value,
            melee: new LeveledWeapon(
                charSettings.value.meleeWeapon,
                charSettings.value.meleeWeaponRefine,
                charSettings.value.meleeWeaponLevel
            ),
            ranged: new LeveledWeapon(
                charSettings.value.rangedWeapon,
                charSettings.value.rangedWeaponRefine,
                charSettings.value.rangedWeaponLevel
            ),
            baseName: charSettings.value.baseName,
            hpPercent: charSettings.value.hpPercent,
            resonanceGain: charSettings.value.resonanceGain,
            enemyType: charSettings.value.enemyType,
            enemyLevel: charSettings.value.enemyLevel,
            enemyResistance: charSettings.value.enemyResistance,
            enemyHpType: charSettings.value.enemyHpType,
            targetFunction: charSettings.value.targetFunction,
        })
)

const baseOptions = computed(() => [
    ...[
        ...LeveledWeapon.getBaseNamesWithName(charSettings.value.meleeWeapon),
        ...LeveledWeapon.getBaseNamesWithName(charSettings.value.rangedWeapon),
    ].map((base) => ({ value: base, label: base, type: "武器" })),
    ...(charBuild.value.char.同律武器 ? LeveledWeapon.getBaseNamesWithName(charBuild.value.char.同律武器) : []).map((base) => ({
        value: base,
        label: base,
        type: "同律武器",
    })),
    ...LeveledChar.getSkillNamesWithSub(selectedChar.value).map((skill) => ({ value: skill, label: skill, type: "技能" })),
])

// 计算属性
const attributes = computed(() => charBuild.value.calculateAttributes())

// 计算武器属性
const weaponAttrs = computed(() => (charBuild.value.selectedWeapon ? charBuild.value.calculateWeaponAttributes().weapon : null))
// 计算总伤害
const totalDamage = computed(() => charBuild.value.calculate())

// 更新CharBuild实例
const updateCharBuild = () => {
    charBuild.value.char = new LeveledChar(selectedChar.value, 80)
    charBuild.value.auraMod = new LeveledMod(charSettings.value.auraMod)
    // 确保技能存在
    if (!charSettings.value.baseName || !baseOptions.value.some((skill) => skill.value === charSettings.value.baseName)) {
        charSettings.value.baseName = charBuild.value.char.技能[0].名称
    }
    charBuild.value.meleeWeapon = new LeveledWeapon(
        charSettings.value.meleeWeapon,
        charSettings.value.meleeWeaponRefine,
        charSettings.value.meleeWeaponLevel
    )
    charBuild.value.rangedWeapon = new LeveledWeapon(
        charSettings.value.rangedWeapon,
        charSettings.value.rangedWeaponRefine,
        charSettings.value.rangedWeaponLevel
    )
    charBuild.value.buffs = selectedBuffs.value.filter((buff) => buff !== null) as LeveledBuff[]
    charBuild.value.mods = [
        ...selectedCharMods.value.filter((mod) => mod !== null),
        ...selectedMeleeMods.value.filter((mod) => mod !== null),
        ...selectedRangedMods.value.filter((mod) => mod !== null),
        ...selectedSkillWeaponMods.value.filter((mod) => mod !== null),
    ] as LeveledMod[]
}
updateCharBuild()

function selectMod(type: string, slotIndex: number, modId: number) {
    const mod = new LeveledMod(modId)
    const lv = mod.等级
    if (type === "角色") {
        charSettings.value.charMods[slotIndex] = [modId, lv]
    } else if (type === "近战") {
        charSettings.value.meleeMods[slotIndex] = [modId, lv]
    } else if (type === "远程") {
        charSettings.value.rangedMods[slotIndex] = [modId, lv]
    } else if (type === "同律") {
        charSettings.value.skillWeaponMods[slotIndex] = [modId, lv]
    }
    updateCharBuild()
}

function removeMod(slotIndex: number, type: string) {
    if (type === "角色") {
        charSettings.value.charMods[slotIndex] = null
    } else if (type === "近战") {
        charSettings.value.meleeMods[slotIndex] = null
    } else if (type === "远程") {
        charSettings.value.rangedMods[slotIndex] = null
    } else if (type === "同律") {
        charSettings.value.skillWeaponMods[slotIndex] = null
    }
    updateCharBuild()
}

// 切换BUFF选择
const toggleBuff = (buff: LeveledBuff) => {
    const index = charSettings.value.buffs.findIndex((v) => v[0] === buff.名称)
    if (index > -1) {
        charSettings.value.buffs.splice(index, 1)
    } else {
        charSettings.value.buffs.push([buff.名称, buff.等级])
    }
    updateCharBuild()
}
function setBuffLv(buff: LeveledBuff, lv: number) {
    const index = charSettings.value.buffs.findIndex((v) => v[0] === buff.名称)
    if (index > -1) {
        charSettings.value.buffs[index][1] = lv
    }
    updateCharBuild()
}

const charProjectKey = computed(() => `project.${selectedChar.value}`)
const charProject = useLocalStorage(charProjectKey, {
    selected: "",
    projects: [] as { name: string; charSettings: typeof defaultCharSettings }[],
})
// 保存配置
const saveConfig = () => {
    // 实现保存配置功能
    console.log("保存配置")
    const inputName = prompt("请输入配置名称")
    if (!inputName) {
        return
    }
    charProject.value.selected = inputName
    if (charProject.value.projects.some((project) => project.name === inputName)) {
        const index = charProject.value.projects.findIndex((project) => project.name === inputName)
        charProject.value.projects[index].charSettings = cloneDeep(charSettings.value)
    } else {
        charProject.value.projects.push({
            name: inputName,
            charSettings: cloneDeep(charSettings.value),
        })
    }
}

const resetConfig = () => {
    // 实现重置配置功能
    console.log("重置配置")
    charSettings.value.charMods = Array(8).fill(null)
    charSettings.value.meleeMods = Array(8).fill(null)
    charSettings.value.rangedMods = Array(8).fill(null)
    charSettings.value.skillWeaponMods = Array(4).fill(null)
}

// 导入配置
const loadConfig = () => {
    // 实现导入配置功能
    console.log("导入配置")
    const project = charProject.value.projects.find((project) => project.name === charProject.value.selected)
    if (project) {
        charSettings.value = cloneDeep(project.charSettings)
        updateCharBuild()
    }
}

const reloadCustomBuff = () => {
    const index = _buffOptions.findIndex((buff) => buff.label === "自定义BUFF")
    if (index > -1) {
        _buffOptions[index].value = new LeveledBuff("自定义BUFF")
    }
}
</script>

<template>
    <div class="h-full overflow-scroll">
        <div class="container mx-auto p-4">
            <div class="flex justify-end gap-2 mb-4">
                <Select
                    v-if="charProject.projects.length > 0"
                    class="w-50 inline-flex items-center justify-between input input-bordered input-md whitespace-nowrap"
                    v-model="charProject.selected"
                    @change="loadConfig"
                >
                    <SelectItem v-for="project in charProject.projects" :key="project.name" :value="project.name">
                        {{ project.name }}
                    </SelectItem>
                </Select>
                <button class="btn btn-primary" @click="saveConfig">{{ $t("char-build.save_config") }}</button>
                <button class="btn" @click="resetConfig">{{ $t("char-build.reset_config") }}</button>
            </div>

            <!-- 基本设置 -->
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                <!-- 角色选择 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <SectionMarker reset>
                            <Icon icon="ri:user-line" />
                        </SectionMarker>
                        <h3 class="text-lg font-semibold">{{ $t("char-build.select_character") }}</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.character") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="selectedChar"
                                @change="updateCharBuild"
                            >
                                <template v-for="charWithElm in groupBy(charOptions, 'elm')" :key="charWithElm[0].elm">
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                        {{ charWithElm[0].elm }}
                                    </SelectLabel>
                                    <SelectGroup>
                                        <SelectItem v-for="char in charWithElm" :key="char.value" :value="char.value">
                                            {{ char.label }}
                                        </SelectItem>
                                    </SelectGroup>
                                </template>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.level") }}</div>
                            <Select
                                class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.charLevel"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="lv in [1, 10, 20, 30, 40, 50, 60, 70, 80]" :key="lv" :value="lv">
                                    {{ lv }}
                                </SelectItem>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.target_function") }}</div>
                            <Select
                                class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.targetFunction"
                                @change="updateCharBuild"
                            >
                                <SelectItem
                                    v-for="fn in [
                                        '伤害',
                                        '弹片伤害',
                                        '每秒伤害',
                                        '每神智伤害',
                                        '每持续神智伤害',
                                        '每神智每秒伤害',
                                        '每持续神智每秒伤害',
                                    ]"
                                    :key="fn"
                                    :value="fn"
                                >
                                    {{ fn }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>
                </div>
                <!-- 技能选择 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <SectionMarker>
                            <Icon icon="ri:flashlight-line" />
                        </SectionMarker>
                        <h3 class="text-lg font-semibold">{{ $t("char-build.select_skill_weapon") }}</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.skill_weapon") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.baseName"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="skill in baseOptions" :key="skill.label" :value="skill.label">
                                    {{ skill.label }}
                                </SelectItem>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.skill_level") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.charSkillLevel"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="lv in 12" :key="lv" :value="lv">
                                    {{ lv }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>
                </div>
                <!-- 近战武器选择 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <SectionMarker>
                            <Icon icon="ri:sword-line" />
                        </SectionMarker>
                        <h3 class="text-lg font-semibold">{{ $t("char-build.melee_weapon") }}</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.weapon") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.meleeWeapon"
                                @change="updateCharBuild"
                            >
                                <template v-for="weaponWithType in groupBy(meleeWeaponOptions, 'type')" :key="weaponWithType[0].type">
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                        {{ weaponWithType[0].type }}
                                    </SelectLabel>
                                    <SelectGroup>
                                        <SelectItem v-for="weapon in weaponWithType" :key="weapon.value" :value="weapon.value">
                                            {{ weapon.label }}
                                        </SelectItem>
                                    </SelectGroup>
                                </template>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.refine") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.meleeWeaponRefine"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="lv in [0, 1, 2, 3, 4, 5]" :key="lv" :value="lv">
                                    {{ lv }}
                                </SelectItem>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.level") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.meleeWeaponLevel"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="lv in [1, 10, 20, 30, 40, 50, 60, 70, 80]" :key="lv" :value="lv">
                                    {{ lv }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>
                </div>
                <!-- 远程武器选择 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <SectionMarker>
                            <Icon icon="ri:crosshair-line" />
                        </SectionMarker>
                        <h3 class="text-lg font-semibold">{{ $t("char-build.ranged_weapon") }}</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.weapon") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.rangedWeapon"
                                @change="updateCharBuild"
                            >
                                <template v-for="weaponWithType in groupBy(rangedWeaponOptions, 'type')" :key="weaponWithType[0].type">
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                        {{ weaponWithType[0].type }}
                                    </SelectLabel>
                                    <SelectGroup>
                                        <SelectItem v-for="weapon in weaponWithType" :key="weapon.value" :value="weapon.value">
                                            {{ weapon.label }}
                                        </SelectItem>
                                    </SelectGroup>
                                </template>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.refine") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.rangedWeaponRefine"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="lv in [0, 1, 2, 3, 4, 5]" :key="lv" :value="lv">
                                    {{ lv }}
                                </SelectItem>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.level") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.rangedWeaponLevel"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="lv in [1, 10, 20, 30, 40, 50, 60, 70, 80]" :key="lv" :value="lv">
                                    {{ lv }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>
                </div>
                <!-- 敌人选择 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <SectionMarker>
                            <Icon icon="ri:game-line" />
                        </SectionMarker>
                        <h3 class="text-lg font-semibold">{{ $t("char-build.enemy") }}</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.enemy_type") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.enemyType"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="enemy in ['small', 'large', 'boss']" :key="enemy" :value="enemy">
                                    {{ $t(`char-build.${enemy}`) }}
                                </SelectItem>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.level") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.enemyLevel"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="lv in 36" :key="lv" :value="lv * 5">
                                    {{ lv * 5 }}
                                </SelectItem>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.hp_type") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.enemyHpType"
                                @change="updateCharBuild"
                            >
                                <SelectItem
                                    v-for="(key, hpType) in { 生命: 'hp', 护盾: 'shield', 战姿: 'stance' }"
                                    :key="key"
                                    :value="hpType"
                                >
                                    {{ $t(`char-build.${key}`) }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>
                </div>
                <!-- 其他 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <SectionMarker>
                            <Icon icon="ri:more-line" />
                        </SectionMarker>
                        <h3 class="text-lg font-semibold">{{ $t("char-build.other") }}</h3>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.hp_percent") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.hpPercent"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="hp in [0.01, 0.25, 0.5, 0.75, 1]" :key="hp" :value="hp"> {{ hp * 100 }}% </SelectItem>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.resonance_gain") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.resonanceGain"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="rg in [0, 0.5, 1, 1.5, 2, 2.5, 3]" :key="rg" :value="rg"> {{ rg * 100 }}% </SelectItem>
                            </Select>
                        </div>
                        <div class="flex-1">
                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.enemy_resistance") }}</div>
                            <Select
                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                v-model="charSettings.enemyResistance"
                                @change="updateCharBuild"
                            >
                                <SelectItem v-for="res in [0, 0.5, -4]" :key="res" :value="res"> {{ res * 100 }}% </SelectItem>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MOD -->
            <div id="mod-container">
                <!-- 角色MOD配置 -->
                <ModEditer
                    :title="$t('char-build.char_mod_config')"
                    :mods="selectedCharMods"
                    :mod-options="modOptions.filter((m) => m.type === '角色' && (!m.limit || m.limit === charBuild.char.属性))"
                    :char-build="charBuild"
                    @remove-mod="removeMod($event, '角色')"
                    @select-mod="selectMod('角色', $event[0], $event[1])"
                    @level-change="charSettings.charMods[$event[0]]![1] = $event[1]"
                    :aura-mod="charSettings.auraMod"
                    @select-aura-mod="charSettings.auraMod = $event"
                    type="角色"
                />
                <!-- 近战武器MOD配置 -->
                <ModEditer
                    v-if="charBuild.isMeleeWeapon"
                    :title="$t('char-build.melee_weapon_mod_config')"
                    :mods="selectedMeleeMods"
                    :mod-options="
                        modOptions.filter(
                            (m) =>
                                m.type === '近战' &&
                                (!m.limit || [charBuild.meleeWeapon.类别, charBuild.meleeWeapon.伤害类型].includes(m.limit))
                        )
                    "
                    :char-build="charBuild"
                    @remove-mod="removeMod($event, '近战')"
                    @select-mod="selectMod('近战', $event[0], $event[1])"
                    @level-change="charSettings.meleeMods[$event[0]]![1] = $event[1]"
                    type="近战"
                />
                <!-- 远程武器MOD配置 -->
                <ModEditer
                    v-if="charBuild.isRangedWeapon"
                    :title="$t('char-build.ranged_weapon_mod_config')"
                    :mods="selectedRangedMods"
                    :mod-options="
                        modOptions.filter(
                            (m) =>
                                m.type === '远程' &&
                                (!m.limit || [charBuild.rangedWeapon.类别, charBuild.rangedWeapon.伤害类型].includes(m.limit))
                        )
                    "
                    :char-build="charBuild"
                    @remove-mod="removeMod($event, '远程')"
                    @select-mod="selectMod('远程', $event[0], $event[1])"
                    @level-change="charSettings.rangedMods[$event[0]]![1] = $event[1]"
                    type="远程"
                />
                <!-- 同律武器MOD配置 -->
                <ModEditer
                    v-if="charBuild.skillWeapon && charBuild.isSkillWeapon"
                    :title="$t('char-build.skill_weapon_mod_config')"
                    :mods="selectedSkillWeaponMods"
                    :mod-options="
                    modOptions.filter(
                        (m) =>
                            m.type === charBuild.skillWeapon!.类型 &&
                            (!m.limit || [charBuild.skillWeapon!.类别, charBuild.skillWeapon!.伤害类型].includes(m.limit))
                    )
                "
                    :char-build="charBuild"
                    @remove-mod="removeMod($event, '同律')"
                    @select-mod="selectMod('同律', $event[0], $event[1])"
                    @level-change="charSettings.skillWeaponMods[$event[0]]![1] = $event[1]"
                    :type="charBuild.skillWeapon!.类型"
                />
            </div>

            <!-- BUFF列表 -->
            <div id="buff-container" class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <SectionMarker />
                        <h3 class="text-lg font-semibold">{{ $t("char-build.buff_list") }}</h3>
                    </div>
                    <div class="text-sm text-gray-400">{{ $t("char-build.selected_count", { count: selectedBuffs.length }) }}</div>
                </div>
                <BuffEditer
                    :buff-options="buffOptions"
                    :selected-buffs="selectedBuffs"
                    :char-settings="charSettings"
                    :char-build="charBuild"
                    @toggle-buff="toggleBuff"
                    @set-buff-lv="setBuffLv"
                />
            </div>
            <!-- 自定义BUFF -->
            <div
                id="custom-buff-container"
                class="bg-base-300 rounded-xl p-4 shadow-lg mb-6"
                v-if="selectedBuffs.some((v) => v.名称 === '自定义BUFF')"
            >
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <SectionMarker />
                        <h3 class="text-lg font-semibold">{{ $t("char-build.custom_buff") }}</h3>
                    </div>
                </div>
                <CustomBuffEditor @submit="reloadCustomBuff" />
            </div>

            <!-- 装配预览与保存 -->
            <div id="preview-container" class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
                <div class="flex items-center gap-2 mb-4">
                    <SectionMarker />
                    <h3 class="text-lg font-semibold">{{ $t("char-build.equipment_preview") }}</h3>
                </div>

                <div class="flex flex-col gap-4 md:flex-row">
                    <!-- 角色信息 -->
                    <div class="bg-base-200 rounded-lg p-3">
                        <div class="flex flex-col justify-center items-center gap-2">
                            <!-- 角色 -->
                            <div class="flex flex-col items-center">
                                <div class="size-72 bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                                    <span class="text-gray-400">
                                        <ImageFallback :src="charBuild.char.url" alt="角色头像" class="size-72 object-cover rounded-md">
                                            <Icon icon="la:user" class="text-[18rem]" />
                                        </ImageFallback>
                                    </span>
                                </div>
                                <div class="text-center">
                                    <div class="font-medium">{{ selectedChar }}</div>
                                    <div class="text-xs text-gray-400">等级: {{ charSettings.charLevel }}</div>
                                </div>
                            </div>
                            <div class="flex gap-2 bg-gray-200 rounded-lg p-2 w-full">
                                <!-- 近战 -->
                                <div class="flex items-center gap-2">
                                    <div class="size-16 rounded-lg mb-2 flex items-center justify-center">
                                        <span class="text-gray-400">
                                            <img
                                                :src="charBuild.meleeWeapon.url"
                                                alt="近战武器"
                                                class="w-full h-full object-cover rounded-md"
                                            />
                                        </span>
                                    </div>
                                    <div class="text-left">
                                        <div class="font-medium">{{ charSettings.meleeWeapon }}</div>
                                        <div class="text-xs text-gray-400">等级: {{ charSettings.meleeWeaponLevel }}</div>
                                        <div class="text-xs text-gray-400">精炼: {{ charSettings.meleeWeaponRefine }}</div>
                                    </div>
                                </div>
                                <!-- 远程 -->
                                <div class="flex items-center gap-2">
                                    <div class="size-16 rounded-lg mb-2 flex items-center justify-center">
                                        <span class="text-gray-400">
                                            <img
                                                :src="charBuild.rangedWeapon.url"
                                                alt="远程武器"
                                                class="w-full h-full object-cover rounded-md"
                                            />
                                        </span>
                                    </div>
                                    <div class="text-left">
                                        <div class="font-medium">{{ charSettings.rangedWeapon }}</div>
                                        <div class="text-xs text-gray-400">等级: {{ charSettings.rangedWeaponLevel }}</div>
                                        <div class="text-xs text-gray-400">精炼: {{ charSettings.rangedWeaponRefine }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 综合属性 -->
                    <div class="bg-base-200 rounded-lg p-3 flex-1 flex flex-col gap-2">
                        <div class="flex flex-col gap-2">
                            <div class="text-sm font-medium p-2 bg-primary/10 rounded-lg flex items-center gap-2">
                                <div class="w-3 h-3 rounded-full bg-primary"></div>
                                {{ $t("char-build.char_attributes") }}
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.attack") }}</div>
                                    <div class="text-lg font-semibold text-red-400">{{ attributes.attack }}</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.health") }}</div>
                                    <div class="text-lg font-semibold text-green-400">{{ attributes.health }}</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.shield") }}</div>
                                    <div class="text-lg font-semibold text-blue-400">{{ attributes.shield }}</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.defense") }}</div>
                                    <div class="text-lg font-semibold text-yellow-400">{{ attributes.defense }}</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.power") }}</div>
                                    <div class="text-lg font-semibold text-sky-400">{{ (attributes.power * 100).toFixed(0) }}%</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.durability") }}</div>
                                    <div class="text-lg font-semibold text-purple-400">{{ (attributes.durability * 100).toFixed(0) }}%</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.efficiency") }}</div>
                                    <div class="text-lg font-semibold text-green-400">{{ (attributes.efficiency * 100).toFixed(0) }}%</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.range") }}</div>
                                    <div class="text-lg font-semibold text-rose-400">{{ (attributes.range * 100).toFixed(0) }}%</div>
                                </div>
                                <div class="flex flex-col items-center" v-if="attributes.boost">
                                    <span class="text-xs text-gray-400 mb-1">{{ $t("char-build.boost") }}</span>
                                    <span class="text-lg font-semibold text-red-400">{{ (attributes.boost * 100).toFixed(0) }}%</span>
                                </div>
                                <div class="flex flex-col items-center" v-if="attributes.desperate">
                                    <span class="text-xs text-gray-400 mb-1">{{ $t("char-build.desperate") }}</span>
                                    <span class="text-lg font-semibold text-green-400">{{ (attributes.desperate * 100).toFixed(0) }}%</span>
                                </div>
                                <div class="flex flex-col items-center" v-if="attributes.damageIncrease">
                                    <span class="text-xs text-gray-400 mb-1">{{ $t("char-build.damage_increase") }}</span>
                                    <span class="text-lg font-semibold text-cyan-400"
                                        >{{ (attributes.damageIncrease * 100).toFixed(0) }}%</span
                                    >
                                </div>
                                <div class="flex flex-col items-center" v-if="attributes.weaponDamage">
                                    <span class="text-xs text-gray-400 mb-1">{{ $t("char-build.weapon_damage") }}</span>
                                    <span class="text-lg font-semibold text-orange-400"
                                        >{{ (attributes.weaponDamage * 100).toFixed(0) }}%</span
                                    >
                                </div>
                                <div class="flex flex-col items-center" v-if="attributes.skillDamage">
                                    <span class="text-xs text-gray-400 mb-1">{{ $t("char-build.skill_damage") }}</span>
                                    <span class="text-lg font-semibold text-purple-400"
                                        >{{ (attributes.skillDamage * 100).toFixed(0) }}%</span
                                    >
                                </div>
                                <div class="flex flex-col items-center" v-if="attributes.independentDamageIncrease">
                                    <span class="text-xs text-gray-400 mb-1">{{ $t("char-build.independent_damage_increase") }}</span>
                                    <span class="text-lg font-semibold text-indigo-400"
                                        >{{ (attributes.independentDamageIncrease * 100).toFixed(0) }}%</span
                                    >
                                </div>
                                <div class="flex flex-col items-center" v-if="attributes.penetration">
                                    <span class="text-xs text-gray-400 mb-1">{{ $t("char-build.attribute_penetration") }}</span>
                                    <span class="text-lg font-semibold text-lime-400"
                                        >{{ (attributes.penetration * 100).toFixed(0) }}%</span
                                    >
                                </div>
                                <div class="flex flex-col items-center" v-if="attributes.ignoreDefense">
                                    <span class="text-xs text-gray-400 mb-1">{{ $t("char-build.ignore_defense") }}</span>
                                    <span class="text-lg font-semibold text-pink-400"
                                        >{{ (attributes.ignoreDefense * 100).toFixed(0) }}%</span
                                    >
                                </div>
                            </div>
                        </div>
                        <div v-if="weaponAttrs" class="flex flex-col gap-2">
                            <div class="text-sm font-medium p-2 bg-primary/10 rounded-lg flex items-center gap-2">
                                <div class="w-3 h-3 rounded-full bg-primary"></div>
                                {{ $t("char-build.weapon_attributes") }}
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.attack") }}</div>
                                    <div class="text-lg font-semibold text-red-400">{{ weaponAttrs.attack }}</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.crit_rate") }}</div>
                                    <div class="text-lg font-semibold text-yellow-400">{{ (weaponAttrs.critRate * 100).toFixed(1) }}%</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.crit_damage") }}</div>
                                    <div class="text-lg font-semibold text-yellow-400">
                                        {{ (weaponAttrs.critDamage * 100).toFixed(1) }}%
                                    </div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.trigger_rate") }}</div>
                                    <div class="text-lg font-semibold text-blue-400">{{ (weaponAttrs.triggerRate * 100).toFixed(1) }}%</div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.attack_speed") }}</div>
                                    <div class="text-lg font-semibold text-green-400">
                                        {{ weaponAttrs.attackSpeed.toFixed(1) }}
                                    </div>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.multiple_shots") }}</div>
                                    <div class="text-lg font-semibold text-purple-400">{{ weaponAttrs.multiShot.toFixed(1) }}</div>
                                </div>
                                <div v-if="weaponAttrs.damageIncrease" class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.damage_boost") }}</div>
                                    <div class="text-lg font-semibold text-cyan-400">
                                        {{ (weaponAttrs.damageIncrease * 100).toFixed(1) }}%
                                    </div>
                                </div>
                                <div v-if="weaponAttrs.independentDamageIncrease" class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.independent_damage_increase") }}</div>
                                    <div class="text-lg font-semibold text-indigo-400">
                                        {{ (weaponAttrs.independentDamageIncrease * 100).toFixed(1) }}%
                                    </div>
                                </div>
                                <div v-if="weaponAttrs.additionalDamage" class="flex flex-col items-center">
                                    <div class="text-xs text-gray-400 mb-1">{{ $t("char-build.additional_damage") }}</div>
                                    <div class="text-lg font-semibold text-orange-400">
                                        {{ (weaponAttrs.additionalDamage * 100).toFixed(1) }}%
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="flex flex-col gap-2">
                            <div class="text-sm font-medium p-2 bg-primary/10 rounded-lg flex items-center gap-2">
                                <div class="w-3 h-3 rounded-full bg-primary"></div>
                                {{ charSettings.baseName }} - {{ charSettings.targetFunction }}
                            </div>
                            <div class="bg-base-200 rounded-lg p-3 flex-1">
                                <div class="flex flex-col items-center">
                                    <div class="text-2xl font-semibold text-primary">{{ Math.round(totalDamage) }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
<style>
.list-move, /* 对移动中的元素应用的过渡 */
.list-enter-active,
.list-leave-active {
    transition: all 0.5s ease;
}

.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateX(30px);
}

/* 确保将离开的元素从布局流中删除
  以便能够正确地计算移动的动画。 */
.list-leave-active {
    position: absolute;
}
</style>
