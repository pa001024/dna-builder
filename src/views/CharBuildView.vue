<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { t } from "i18next"
import { LeveledChar, LeveledMod, LeveledBuff, LeveledWeapon, CharBuild, gameData as data, CharBuildTimeline, buffMap } from "../data"
import { useLocalStorage } from "@vueuse/core"
import { groupBy, cloneDeep } from "lodash-es"
import { format100, formatProp, formatSkillProp, formatWeaponProp } from "../util"
import { useInvStore } from "../store/inv"
import { useCharSettings } from "../store/charSettings"
import { useTimeline } from "../store/timeline"

//#region 角色
const inv = useInvStore()
// 获取实际数据
const charOptions = data.char.map((char) => ({ value: char.名称, label: char.名称, elm: char.属性, icon: `/imgs/${char.名称}.png` }))
const modOptions = data.mod
    .map((mod) => ({
        value: mod.id,
        label: mod.名称,
        quality: mod.品质,
        type: mod.类型,
        limit: mod.属性 || mod.限定,
        ser: mod.系列,
        icon: mod.系列 && CharBuild.elmSeries.includes(mod.系列) ? `/imgs/${mod.属性}${mod.系列}.png` : `/imgs/${mod.系列}系列.png`,
        count: Math.min(inv.getModCount(mod.id, mod.品质), mod.系列 !== "契约者" ? 8 : 1),
        bufflv: inv.getBuffLv(mod.名称),
        lv: inv.getModLv(mod.id, mod.品质),
    }))
    .filter((mod) => mod.count)

// 写入自定义BUFF
;(function writeCustomBuff() {
    const customBuff = useLocalStorage("customBuff", [] as [string, number][])
    const buffObj = {
        名称: "自定义BUFF",
        描述: "自行填写",
    } as any
    customBuff.value.forEach((prop) => {
        buffObj[prop[0]] = prop[1]
    })
    buffMap.set("自定义BUFF", buffObj)
})()
const _buffOptions = reactive(
    data.buff.map((buff) => ({
        value: new LeveledBuff(buff.名称),
        label: buff.名称,
        limit: buff.限定,
        description: buff.描述,
    })),
)
const buffOptions = computed(() =>
    _buffOptions
        .filter((buff) => !buff.limit || buff.limit === selectedChar.value || buff.limit === charBuild.value.char.属性)
        .map((v) => {
            const b = charSettings.value.buffs.find((b) => b[0] === v.label)
            const lv = b?.[1] ?? v.value.等级
            return {
                value: new LeveledBuff(v.value._originalBuffData, lv),
                label: v.label,
                limit: v.limit,
                description: v.description,
                lv,
            }
        }),
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
const charSettings = useCharSettings(selectedChar)
const selectedCharMods = computed(() =>
    charSettings.value.charMods.map((v) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null)),
)
const selectedMeleeMods = computed(() =>
    charSettings.value.meleeMods.map((v) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null)),
)
const selectedRangedMods = computed(() =>
    charSettings.value.rangedMods.map((v) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null)),
)
const selectedSkillWeaponMods = computed(() =>
    charSettings.value.skillWeaponMods.map((v) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null)),
)
const selectedBuffs = computed(() =>
    charSettings.value.buffs
        .map((v) => {
            try {
                const b = new LeveledBuff(v[0], v[1])
                return b
            } catch (error) {
                console.error(error)
                charSettings.value.buffs = charSettings.value.buffs.filter((b) => b[0] !== v[0])
                return null
            }
        })
        .filter((b) => b !== null),
)

const team1Options = computed(() =>
    [{ value: "-", label: "无", elm: "", icon: `/imgs/1.png` }].concat(
        charOptions.filter((char) => char.label !== selectedChar.value && char.label !== charSettings.value.team2),
    ),
)
const team2Options = computed(() =>
    [{ value: "-", label: "无", elm: "", icon: `/imgs/1.png` }].concat(
        charOptions.filter((char) => char.label !== selectedChar.value && char.label !== charSettings.value.team1),
    ),
)

const teamWeaponOptions = computed(() =>
    [{ value: "-", label: "无", type: "", icon: `/imgs/1.png` }].concat(meleeWeaponOptions.concat(rangedWeaponOptions)),
)

// 创建CharBuild实例
const charBuild = computed(
    () =>
        new CharBuild({
            char: new LeveledChar(selectedChar.value, charSettings.value.charLevel),
            auraMod: new LeveledMod(charSettings.value.auraMod),
            charMods: selectedCharMods.value.filter((mod) => mod !== null),
            meleeMods: selectedMeleeMods.value.filter((mod) => mod !== null),
            rangedMods: selectedRangedMods.value.filter((mod) => mod !== null),
            skillWeaponMods: selectedSkillWeaponMods.value.filter((mod) => mod !== null),
            skillLevel: charSettings.value.charSkillLevel,
            buffs: selectedBuffs.value,
            melee: new LeveledWeapon(
                charSettings.value.meleeWeapon,
                charSettings.value.meleeWeaponRefine,
                charSettings.value.meleeWeaponLevel,
                inv.getBuffLv(charSettings.value.meleeWeapon),
            ),
            ranged: new LeveledWeapon(
                charSettings.value.rangedWeapon,
                charSettings.value.rangedWeaponRefine,
                charSettings.value.rangedWeaponLevel,
                inv.getBuffLv(charSettings.value.rangedWeapon),
            ),
            baseName: charSettings.value.baseName,
            imbalance: charSettings.value.imbalance,
            hpPercent: charSettings.value.hpPercent,
            resonanceGain: charSettings.value.resonanceGain,
            enemyType: charSettings.value.enemyType,
            enemyLevel: charSettings.value.enemyLevel,
            enemyResistance: charSettings.value.enemyResistance,
            enemyHpType: charSettings.value.enemyHpType,
            targetFunction: charSettings.value.targetFunction,
            timeline: getTimelineByName(charSettings.value.baseName),
        }),
)

const baseOptions = computed(() => [
    ...LeveledChar.getSkillNamesWithSub(selectedChar.value).map((skill) => ({ value: skill, label: skill, type: "技能" })),
    ...(charBuild.value.char.同律武器 ? LeveledWeapon.getBaseNamesWithName(charBuild.value.char.同律武器) : []).map((base) => ({
        value: base,
        label: base,
        type: "同律武器",
    })),
    ...[
        ...LeveledWeapon.getBaseNamesWithName(charSettings.value.meleeWeapon),
        ...LeveledWeapon.getBaseNamesWithName(charSettings.value.rangedWeapon),
    ].map((base) => ({
        value: base,
        label: base,
        type: "武器",
    })),
])

// 计算属性
const attributes = computed(() => charBuild.value.calculateAttributes())

// 计算武器属性
const weaponAttrs = computed(() => (charBuild.value.selectedWeapon ? charBuild.value.calculateWeaponAttributes().weapon : null))
// 计算总伤害
const totalDamage = computed(() => charBuild.value.calculate())

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
        teamBuffLvs.value[buff.名称] = 0
    } else {
        charSettings.value.buffs.push([buff.名称, buff.等级])
        teamBuffLvs.value[buff.名称] = buff.等级
    }
    updateCharBuild()
}
function setBuffLv(buff: LeveledBuff, lv: number) {
    const index = charSettings.value.buffs.findIndex((v) => v[0] === buff.名称)
    if (index > -1) {
        charSettings.value.buffs[index][1] = lv
        teamBuffLvs.value[buff.名称] = lv
    }
    updateCharBuild()
}

const charProjectKey = computed(() => `project.${selectedChar.value}`)
const charProject = useLocalStorage(charProjectKey, {
    selected: "",
    projects: [] as { name: string; charSettings: typeof charSettings.value }[],
})
// 保存配置
const saveConfig = () => {
    // 实现保存配置功能
    console.log("保存配置")
    const inputName = prompt(t("char-build.please_enter_config_name"))
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
    charSettings.value.hpPercent = 1
    charSettings.value.resonanceGain = 2
    charSettings.value.enemyType = "small"
    charSettings.value.enemyLevel = 80
    charSettings.value.enemyResistance = 0
    charSettings.value.enemyHpType = "生命"
    charSettings.value.targetFunction = "伤害"
    charSettings.value.imbalance = false
    charSettings.value.charMods = Array(8).fill(null)
    charSettings.value.meleeMods = Array(8).fill(null)
    charSettings.value.rangedMods = Array(8).fill(null)
    charSettings.value.skillWeaponMods = Array(4).fill(null)
    charSettings.value.buffs = []
    charSettings.value.team1 = "-"
    charSettings.value.team2 = "-"
}
// 导入配置
const loadConfig = () => {
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
    // 触发重新计算
    charSettings.value.buffs = [...charSettings.value.buffs]
}
//#endregion

//#region 自动构建
const autobuild_model_show = ref(false)
const openAutoBuild = () => {
    ;(window as any).autobuild_model.show()
    autobuild_model_show.value = true
}
let newBuild!: CharBuild

function applyAutobuild() {
    if (!newBuild) return
    charSettings.value.meleeWeapon = newBuild.meleeWeapon.名称
    charSettings.value.meleeWeaponLevel = newBuild.meleeWeapon.等级
    charSettings.value.meleeWeaponRefine = newBuild.meleeWeapon.精炼
    charSettings.value.rangedWeapon = newBuild.rangedWeapon.名称
    charSettings.value.rangedWeaponLevel = newBuild.rangedWeapon.等级
    charSettings.value.rangedWeaponRefine = newBuild.rangedWeapon.精炼
    charSettings.value.charMods = pad(
        newBuild.charMods.map((v) => [v.id, v.等级]),
        8,
        null,
    )
    charSettings.value.meleeMods = pad(
        newBuild.meleeMods.map((v) => [v.id, v.等级]),
        8,
        null,
    )
    charSettings.value.rangedMods = pad(
        newBuild.rangedMods.map((v) => [v.id, v.等级]),
        8,
        null,
    )
    charSettings.value.skillWeaponMods = pad(
        newBuild.skillWeaponMods.map((v) => [v.id, v.等级]),
        4,
        null,
    )
    function pad<T>(arr: T[], length: number, value: T) {
        while (arr.length < length) {
            arr.push(value)
        }
        return arr
    }
}
//#endregion
//#region 时间线
const timelines = useTimeline(selectedChar)
function getTimelineByName(name: string) {
    const raw = timelines.value.find((v) => v.name === name)
    if (!raw) return undefined
    return CharBuildTimeline.fromRaw(raw)
}
const isTimeline = computed(() => timelines.value.some((v) => v.name === charSettings.value.baseName))
//#endregion

// 更新CharBuild实例
function updateCharBuild() {
    // 确保技能存在
    if (
        !charSettings.value.baseName ||
        (!baseOptions.value.some((skill) => skill.value === charSettings.value.baseName) && !isTimeline.value)
    ) {
        charSettings.value.baseName = charBuild.value.char.技能[0].名称
    }
    pad(charSettings.value.charMods, 8, null)
    pad(charSettings.value.meleeMods, 8, null)
    pad(charSettings.value.rangedMods, 8, null)
    pad(charSettings.value.skillWeaponMods, 4, null)
    function pad<T>(arr: T[], length: number, value: T) {
        if (arr.length > length) {
            arr.length = length
            return arr
        }
        while (arr.length < length) {
            arr.push(value)
        }
        return arr
    }
}
updateCharBuild()

const summonAttributes = computed(() => {
    const skill = charBuild.value.selectedSkill
    if (skill?.召唤物) {
        const attrs = charBuild.value.calculateWeaponAttributes(undefined, undefined, charBuild.value.meleeWeapon)
        return skill.getSummonAttrs(attrs)
    }
    return undefined
})

const teamBuffLvs = useLocalStorage("teamBuffLvs", {} as Record<string, number>)

function updateTeamBuff(newValue: string, oldValue: string) {
    const newBuffs = [...charSettings.value.buffs.filter((v) => !v[0].includes(oldValue))]
    if (newValue !== "-") {
        // 添加新的BUFF
        const teamBuffs = buffOptions.value.filter((v) => v.label.includes(newValue))
        if (teamBuffs.length > 0) {
            const buffs = teamBuffs
                .map((v) => [v.label, teamBuffLvs.value[v.label] || v.value.等级] as [string, number])
                .filter((v) => v[1] > 0)
            newBuffs.push(...buffs)
        }
    }
    charSettings.value.buffs = newBuffs
    localStorage.setItem(`build.${selectedChar.value}`, JSON.stringify(charSettings.value))
}
</script>

<template>
    <div class="h-full overflow-y-auto">
        <div class="mx-auto p-4">
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
                <button class="btn btn-secondary" @click="openAutoBuild">自动构筑</button>
                <dialog id="autobuild_model" class="modal" @close="autobuild_model_show = false">
                    <div class="modal-box bg-base-300 w-5/6 max-w-5xl">
                        <div class="mb-6">
                            <div class="flex items-center gap-2 mb-3">
                                <SectionMarker />
                                <h3 class="text-lg font-semibold">自动构筑</h3>
                            </div>
                            <AutoBuild :update="autobuild_model_show" :charBuild="charBuild" @change="newBuild = $event" />
                        </div>
                        <div class="modal-action">
                            <form class="flex justify-end gap-2" method="dialog">
                                <button class="btn btn-primary" @click="applyAutobuild">应用</button>
                                <button class="btn">取消</button>
                            </form>
                        </div>
                    </div>
                </dialog>
                <button class="btn btn-primary" @click="saveConfig">{{ $t("char-build.save_config") }}</button>
                <button class="btn" @click="resetConfig">{{ $t("char-build.reset_config") }}</button>
            </div>

            <!-- 基本设置 -->
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                <!-- 角色选择 -->
                <ShowProps :props="charBuild.char.getProperties()" side="bottom">
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
                                            '总伤',
                                            '弹片伤害',
                                            '暴击伤害',
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
                </ShowProps>
                <!-- 技能选择 -->
                <FullTooltip side="bottom">
                    <template #tooltip>
                        <div v-if="charBuild.selectedSkill" class="flex flex-col">
                            <div class="text-md p-2">{{ charBuild.selectedSkill!.类型 }}</div>
                            <div
                                v-for="(val, index) in charBuild.selectedSkill!.getFieldsWithAttr(
                                    charBuild.selectedSkill.召唤物
                                        ? charBuild.calculateWeaponAttributes(undefined, undefined, charBuild.meleeWeapon)
                                        : charBuild.calculateAttributes(),
                                )"
                                :key="index"
                                class="flex flex-col group hover:bg-base-200 rounded-md p-2"
                            >
                                <div class="flex justify-between items-center gap-4 text-sm">
                                    <div class="text-xs text-neutral-500">{{ val.名称 }}</div>
                                    <div class="font-medium text-primary">
                                        {{ formatSkillProp(val.名称, val) }}
                                    </div>
                                </div>
                                <div
                                    v-if="val.属性影响"
                                    class="justify-between items-center gap-4 text-sm flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
                                >
                                    <div class="text-xs text-neutral-500">属性影响</div>
                                    <div class="text-xs ml-auto font-medium text-neutral-500">技能{{ val.属性影响 }}</div>
                                </div>
                            </div>
                        </div>

                        <div v-if="charBuild.selectedWeapon" class="flex flex-col gap-2 max-w-[300px]">
                            <div class="text-sm font-bold">{{ charBuild.selectedWeapon!.类型 }}</div>
                            <div class="flex justify-between items-center gap-2 text-sm">
                                <div class="text-xs text-neutral-500">倍率</div>
                                <div class="font-medium text-primary">
                                    {{
                                        format100(
                                            charBuild.skillWeapon && charBuild.selectedWeapon!.类型 === charBuild.skillWeapon.类型
                                                ? charBuild.skillWeapon.倍率 * charBuild.calculateAttributes().威力
                                                : charBuild.selectedWeapon.倍率,
                                        )
                                    }}
                                </div>
                            </div>
                            <div
                                v-for="(val, prop) in charBuild.selectedWeapon!.getProperties()"
                                :key="prop"
                                class="flex justify-between items-center gap-2 text-sm"
                            >
                                <div class="text-xs text-neutral-500">{{ prop }}</div>
                                <div class="font-medium text-primary">{{ formatWeaponProp(prop as string, val) }}</div>
                            </div>
                        </div>
                    </template>
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
                                    <template v-for="baseWithType in groupBy(baseOptions, 'type')" :key="baseWithType[0].type">
                                        <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                            {{ baseWithType[0].type }}
                                        </SelectLabel>
                                        <SelectGroup>
                                            <SelectItem v-for="base in baseWithType" :key="base.label" :value="base.label">
                                                {{ base.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </template>
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                        {{ $t("char-build.timeline") }}
                                    </SelectLabel>
                                    <SelectGroup>
                                        <SelectItem v-for="timeline in timelines" :key="timeline.name" :value="timeline.name">
                                            {{ timeline.name }}
                                        </SelectItem>
                                    </SelectGroup>
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
                </FullTooltip>
                <!-- 近战武器选择 -->
                <ShowProps :props="charBuild.meleeWeapon.getProperties()" side="bottom">
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
                </ShowProps>
                <!-- 远程武器选择 -->
                <ShowProps :props="charBuild.rangedWeapon.getProperties()" side="bottom">
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
                </ShowProps>
                <!-- 敌人选择 -->
                <div class="bg-base-300 rounded-xl p-4 shadow-lg">
                    <div class="flex items-center gap-2 mb-3">
                        <SectionMarker>
                            <Icon icon="ri:game-line" />
                        </SectionMarker>
                        <h3 class="text-lg font-semibold">{{ $t("char-build.enemy") }}</h3>
                        <div class="flex-1"></div>
                        <div class="label text-xs">失衡</div>
                        <input v-model="charSettings.imbalance" type="checkbox" class="toggle toggle-secondary" />
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
                                <SelectItem
                                    v-for="hp in [
                                        1,
                                        ...Array(20)
                                            .keys()
                                            .map((i) => (i + 1) * 5),
                                    ]"
                                    :key="hp"
                                    :value="hp / 100"
                                >
                                    {{ hp }}%
                                </SelectItem>
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
                    v-if="charBuild.isMeleeWeapon || isTimeline || charBuild.selectedSkill?.召唤物"
                    :title="$t('char-build.melee_weapon_mod_config')"
                    :mods="selectedMeleeMods"
                    :mod-options="
                        modOptions.filter(
                            (m) =>
                                m.type === '近战' &&
                                (!m.limit || [charBuild.meleeWeapon.类别, charBuild.meleeWeapon.伤害类型].includes(m.limit)),
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
                    v-if="charBuild.isRangedWeapon || isTimeline"
                    :title="$t('char-build.ranged_weapon_mod_config')"
                    :mods="selectedRangedMods"
                    :mod-options="
                        modOptions.filter(
                            (m) =>
                                m.type === '远程' &&
                                (!m.limit || [charBuild.rangedWeapon.类别, charBuild.rangedWeapon.伤害类型].includes(m.limit)),
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
                    v-if="charBuild.skillWeapon && (charBuild.isSkillWeapon || isTimeline)"
                    :title="$t('char-build.skill_weapon_mod_config')"
                    :mods="selectedSkillWeaponMods"
                    :mod-options="
                        modOptions.filter(
                            (m) =>
                                m.type === charBuild.skillWeapon!.类型 &&
                                (!m.limit || [charBuild.skillWeapon!.类别, charBuild.skillWeapon!.伤害类型].includes(m.limit)),
                        )
                    "
                    :char-build="charBuild"
                    @remove-mod="removeMod($event, '同律')"
                    @select-mod="selectMod('同律', $event[0], $event[1])"
                    @level-change="charSettings.skillWeaponMods[$event[0]]![1] = $event[1]"
                    type="同律"
                />
            </div>

            <!-- MODBUFF列表 -->
            <EffectSettings
                v-if="charBuild.modsWithWeapons.some((v) => v.buff)"
                id="modbuff-container"
                :mods="charBuild.modsWithWeapons"
                :char-build="charBuild"
            />
            <!-- BUFF列表 -->
            <div id="buff-container" class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
                <div class="flex flex-wrap items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <SectionMarker />
                        <h3 class="text-lg font-semibold">{{ $t("char-build.buff_list") }}</h3>
                    </div>
                    <div class="ml-auto flex gap-4 items-center">
                        <div class="flex flex-col sm:flex-row gap-4 mx-4 items-center">
                            <!-- 协战 -->
                            <span class="text-sm font-semibold text-primary whitespace-nowrap">{{ $t("char-build.team") }}</span>
                            <Select
                                class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap min-w-22"
                                v-model="charSettings.team1"
                                @change="updateTeamBuff"
                            >
                                <template v-for="charWithElm in groupBy(team1Options, 'elm')" :key="charWithElm[0].elm">
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

                            <Select
                                class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap min-w-22"
                                v-model="charSettings.team1Weapon"
                                @change="updateTeamBuff"
                            >
                                <template v-for="weaponWithType in groupBy(teamWeaponOptions, 'type')" :key="weaponWithType[0].type">
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                        {{ weaponWithType[0].type }}
                                    </SelectLabel>
                                    <SelectGroup>
                                        <SelectItem v-for="char in weaponWithType" :key="char.value" :value="char.value">
                                            {{ char.label }}
                                        </SelectItem>
                                    </SelectGroup>
                                </template>
                            </Select>

                            <Select
                                class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap min-w-22"
                                v-model="charSettings.team2"
                                @change="updateTeamBuff"
                            >
                                <template v-for="charWithElm in groupBy(team2Options, 'elm')" :key="charWithElm[0].elm">
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

                            <Select
                                class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap min-w-22"
                                v-model="charSettings.team2Weapon"
                                @change="updateTeamBuff"
                            >
                                <template v-for="weaponWithType in groupBy(teamWeaponOptions, 'type')" :key="weaponWithType[0].type">
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                        {{ weaponWithType[0].type }}
                                    </SelectLabel>
                                    <SelectGroup>
                                        <SelectItem v-for="char in weaponWithType" :key="char.value" :value="char.value">
                                            {{ char.label }}
                                        </SelectItem>
                                    </SelectGroup>
                                </template>
                            </Select>
                        </div>
                        <div class="text-sm text-gray-400">{{ $t("char-build.selected_count", { count: selectedBuffs.length }) }}</div>
                    </div>
                </div>
                <BuffEditer
                    :buff-options="buffOptions"
                    :selected-buffs="selectedBuffs"
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
                <div>
                    <div class="flex-1 flex flex-col justify-between">
                        <div class="flex flex-col justify-between gap-4">
                            <div class="flex flex-col md:flex-row gap-4">
                                <div class="relative rounded-2xl overflow-hidden border border-secondary/20 aspect-square self-start">
                                    <ImageFallback :src="charBuild.char.url" alt="角色头像" class="w-full h-full object-cover object-top">
                                        <Icon icon="la:user" class="w-full h-full" />
                                    </ImageFallback>
                                    <div class="absolute inset-0 bg-linear-to-t from-gray-900 via-transparent to-transparent"></div>
                                </div>
                                <div class="flex-1 flex flex-col justify-end gap-4">
                                    <!-- 角色 -->
                                    <div class="flex items-center justify-between">
                                        <h3 class="text-4xl font-bold text-base-content/80 flex items-center gap-2">
                                            <img :src="`/imgs/${charBuild.char.属性}.png`" :alt="charBuild.char.属性" class="h-12" />
                                            {{ selectedChar }}
                                        </h3>

                                        <span
                                            class="px-4 py-2 rounded-full bg-cyan-500/20 text-cyan-400 text-sm border border-cyan-500/30 font-orbitron"
                                            >LV {{ charBuild.char.等级 }}</span
                                        >
                                    </div>
                                    <!-- 武器 -->
                                    <div class="grid grid-cols-2 gap-4">
                                        <div
                                            class="backdrop-blur-sm rounded-xl p-2 bg-linear-to-r from-secondary/1 to-secondary/5 border border-fuchsia-500/20 hover:border-fuchsia-500/40 transition-all duration-300"
                                        >
                                            <div class="flex gap-4">
                                                <div
                                                    class="w-12 h-12 flex items-center justify-center rounded-lg overflow-hidden bg-gray-900/50 border border-fuchsia-500/30"
                                                >
                                                    <img
                                                        :alt="charBuild.meleeWeapon.名称"
                                                        class="w-full h-full object-cover"
                                                        :src="charBuild.meleeWeapon.url"
                                                    />
                                                </div>
                                                <div class="flex-1">
                                                    <div class="flex items-center justify-between mb-1">
                                                        <h5 class="text-base-content/80 font-bold">{{ charBuild.meleeWeapon.名称 }}</h5>
                                                        <span
                                                            class="px-2 py-1 rounded-md bg-fuchsia-500/20 text-fuchsia-400 text-xs border border-fuchsia-500/30"
                                                            >近战</span
                                                        >
                                                    </div>
                                                    <p class="text-gray-400 text-xs">
                                                        {{
                                                            Object.entries(charBuild.meleeWeapon.getSimpleProperties())
                                                                .map(([k, v]) => `${k} ${formatProp(k, v)}`)
                                                                .join("，")
                                                        }}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div
                                            class="backdrop-blur-sm rounded-xl p-2 bg-linear-to-r from-secondary/1 to-secondary/5 border border-fuchsia-500/20 hover:border-fuchsia-500/40 transition-all duration-300"
                                        >
                                            <div class="flex gap-4">
                                                <div
                                                    class="w-12 h-12 flex items-center justify-center rounded-lg overflow-hidden bg-gray-900/50 border border-fuchsia-500/30"
                                                >
                                                    <img
                                                        :alt="charBuild.rangedWeapon.名称"
                                                        class="w-full h-full object-cover"
                                                        :src="charBuild.rangedWeapon.url"
                                                    />
                                                </div>
                                                <div class="flex-1">
                                                    <div class="flex items-center justify-between mb-1">
                                                        <h5 class="text-base-content/80 font-bold">{{ charBuild.rangedWeapon.名称 }}</h5>
                                                        <span
                                                            class="px-2 py-1 rounded-md bg-fuchsia-500/20 text-fuchsia-400 text-xs border border-fuchsia-500/30"
                                                            >远程</span
                                                        >
                                                    </div>
                                                    <p class="text-gray-400 text-xs">
                                                        {{
                                                            Object.entries(charBuild.rangedWeapon.getSimpleProperties())
                                                                .map(([k, v]) => `${k} ${formatProp(k, v)}`)
                                                                .join("，")
                                                        }}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 class="text-xl font-bold mb-4 text-base-content/80">{{ $t("char-build.char_attributes") }}</h4>
                                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                    <div
                                        class="col-span-2 bg-base-300/60 bg-linear-to-r from-primary/1 to-primary/5 backdrop-blur-sm rounded-xl p-2 border border-primary/30"
                                    >
                                        <div class="text-gray-400 text-xs mb-1">
                                            {{ charSettings.baseName }} -
                                            {{ charBuild.selectedSkill?.召唤物?.名称 ? `[${charBuild.selectedSkill?.召唤物?.名称}]` : ""
                                            }}{{ charSettings.targetFunction }}
                                        </div>
                                        <div class="text-primary font-bold text-sm font-orbitron">{{ Math.round(totalDamage) }}</div>
                                    </div>
                                    <div
                                        class="bg-base-300/60 bg-linear-to-r from-secondary/1 to-secondary/5 backdrop-blur-sm rounded-xl p-2 border border-secondary/30"
                                        v-for="[key, val] in Object.entries(attributes).filter(
                                            ([k, v]) => !['召唤物攻击速度', '召唤物范围'].includes(k) && v,
                                        )"
                                    >
                                        <div class="text-gray-400 text-xs mb-1">
                                            {{ key === "攻击" ? `${charBuild.char.属性}属性` : "" }}{{ $t(`char-build.${key}`) }}
                                        </div>
                                        <div class="text-secondary font-bold text-sm font-orbitron">
                                            {{
                                                ["攻击", "生命", "护盾", "防御", "神智"].includes(key)
                                                    ? `${+val.toFixed(2)}`
                                                    : `${+(val * 100).toFixed(2)}%`
                                            }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <!-- 召唤物属性 -->
                            <div v-if="summonAttributes">
                                <h4 class="text-xl font-bold mb-4 text-base-content/80">
                                    {{ summonAttributes.find((p) => p.名称 === "召唤物名称")?.格式 || "召唤物" }}
                                </h4>
                                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                    <div
                                        class="bg-base-300/60 bg-linear-to-r from-secondary/1 to-secondary/5 backdrop-blur-sm rounded-xl p-2 border border-secondary/30"
                                        v-for="prop in summonAttributes.filter((p) => p.值)"
                                    >
                                        <div class="text-gray-400 text-xs mb-1">
                                            {{ prop.名称 }}
                                        </div>
                                        <div class="text-secondary font-bold text-sm font-orbitron">
                                            {{ formatSkillProp(prop.名称, prop) }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <!-- 武器属性 -->
                            <div v-if="charBuild.selectedWeapon && weaponAttrs">
                                <h4 class="text-xl font-bold mb-4 text-base-content/80">{{ $t("char-build.weapon_attributes") }}</h4>
                                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                    <div
                                        class="bg-base-300/60 bg-linear-to-r from-secondary/1 to-secondary/5 backdrop-blur-sm rounded-xl p-2 border border-secondary/30"
                                        v-for="[key, val] in Object.entries(weaponAttrs).filter(([_, v]) => v)"
                                    >
                                        <div class="text-gray-400 text-xs mb-1">
                                            {{ key === "attack" ? charBuild.selectedWeapon.伤害类型 : "" }}{{ $t(`char-build.${key}`) }}
                                        </div>
                                        <div class="text-secondary font-bold text-sm font-orbitron">
                                            {{ ["attack", "attackSpeed", "multiShot"].includes(key) ? val : `${+(val * 100).toFixed(2)}%` }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="flex flex-col gap-3" v-if="charBuild.mods.length > 0">
                                <h4 class="text-xl font-bold text-base-content/80">MOD</h4>
                                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                    <span
                                        class="px-4 py-2 rounded-lg bg-linear-to-r from-secondary/1 to-secondary/5 border border-secondary/30 text-secondary text-xs"
                                        v-for="mod in charBuild.mods
                                            .filter((v) => v.类型 === '角色')
                                            .reduce((r, v) => {
                                                if (r[v.名称]) {
                                                    r[v.名称].count += 1
                                                } else {
                                                    r[v.名称] = { count: 1, mod: v }
                                                }
                                                return r
                                            }, {} as any)"
                                    >
                                        <img class="size-8 object-cover inline-block" :src="mod.mod.url" alt="" />
                                        <span> {{ mod.count > 1 ? mod.count + " x " : "" }}{{ mod.mod.名称 }} </span>
                                    </span>
                                </div>
                                <div
                                    class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2"
                                    v-if="charBuild.selectedWeapon"
                                >
                                    <span
                                        class="px-4 py-2 rounded-lg bg-linear-to-r from-secondary/1 to-secondary/5 border border-secondary/30 text-secondary text-xs"
                                        v-for="mod in charBuild.mods
                                            .filter((v) => v.类型 === charBuild.selectedWeapon!.类型)
                                            .reduce((r, v) => {
                                                if (r[v.名称]) {
                                                    r[v.名称].count += 1
                                                } else {
                                                    r[v.名称] = { count: 1, mod: v }
                                                }
                                                return r
                                            }, {} as any)"
                                    >
                                        <img class="size-8 object-cover inline-block" :src="mod.mod.url" alt="" />
                                        <span> {{ mod.count > 1 ? mod.count + " x " : "" }}{{ mod.mod.名称 }} </span>
                                    </span>
                                </div>
                            </div>
                            <div v-if="charBuild.buffs.length > 0">
                                <h4 class="text-xl font-bold mb-3 text-base-content/80">BUFF</h4>
                                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                    <span
                                        class="px-4 py-2 rounded-lg bg-linear-to-r from-secondary/1 to-secondary/5 border border-secondary/30 text-secondary text-xs"
                                        v-for="buff in charBuild.buffs.map((v) => v.名称)"
                                    >
                                        {{ buff }}
                                    </span>
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
