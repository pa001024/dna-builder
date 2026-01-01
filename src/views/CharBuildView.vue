<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from "vue"
import { t } from "i18next"
import {
    LeveledChar,
    LeveledMod,
    LeveledBuff,
    LeveledWeapon,
    CharBuild,
    CharBuildTimeline,
    buffMap,
    charData,
    modData,
    buffData,
    weaponData,
    monsterData,
    monsterMap,
    charMap,
    LeveledSkill,
    WeaponAttr,
} from "../data"
import { useLocalStorage } from "@vueuse/core"
import { groupBy, cloneDeep, debounce } from "lodash-es"
import { copyText, format100, format100r, formatSkillProp } from "../util"
import { useInvStore } from "../store/inv"
import { defaultCharSettings, deserializeCharSettings, serializeCharSettings, useCharSettings } from "../composables/useCharSettings"
import { useTimeline } from "../store/timeline"
import { useSettingStore } from "../store/setting"
import { useRoute } from "vue-router"
import { useUIStore } from "../store/ui"

//#region 角色
const inv = useInvStore()
const setting = useSettingStore()
const ui = useUIStore()
const route = useRoute()

// 路由
const selectedChar = computed(() => charMap.get(+route.params.charId)?.名称 || "")
const code = computed(() => route.params.code || "")
const charSettings = useCharSettings(selectedChar)
const charProjectKey = computed(() => `project.${selectedChar.value}`)
const charProject = useLocalStorage(charProjectKey, {
    selected: "",
    projects: [] as { name: string; charSettings: typeof charSettings.value }[],
})
if (code.value) {
    // 代码存在时，判断是否需要添加项目
    if (JSON.stringify(defaultCharSettings) !== JSON.stringify(charSettings.value)) {
        charProject.value.projects.push({
            name: `${selectedChar.value} - ${Math.random().toString(36).substr(2, 9)}`,
            charSettings: cloneDeep(charSettings.value),
        })
    }
    Object.assign(charSettings.value, deserializeCharSettings(code.value as string))
}

// 获取实际数据
const charOptions = charData.map((char) => ({
    value: char.名称,
    label: char.名称,
    elm: char.属性,
    icon: `/imgs/${char.名称}.png`,
}))
const modOptions = modData
    .map((mod) => ({
        value: mod.id,
        label: mod.名称,
        quality: mod.品质,
        type: mod.类型,
        limit: mod.属性 || mod.限定,
        ser: mod.系列,
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
    buffData.map((buff) => ({
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
const meleeWeaponOptions = weaponData
    .filter((weapon) => weapon.类型[0] === "近战")
    .map((weapon) => ({
        value: weapon.名称,
        label: weapon.名称,
        type: weapon.类型[1],
        icon: `/imgs/${weapon.名称}.png`,
    }))
const rangedWeaponOptions = weaponData
    .filter((weapon) => weapon.类型[0] === "远程")
    .map((weapon) => ({
        value: weapon.名称,
        label: weapon.名称,
        type: weapon.类型[0],
        icon: `/imgs/${weapon.名称}.png`,
    }))

// 状态变量
const selectedCharMods = computed(() =>
    charSettings.value.charMods.map((v) => (v ? LeveledMod.from(v[0], v[1], inv.getBuffLv(v[0])) : null)),
)
const selectedMeleeMods = computed(() =>
    charSettings.value.meleeMods.map((v) => (v ? LeveledMod.from(v[0], v[1], inv.getBuffLv(v[0])) : null)),
)
const selectedRangedMods = computed(() =>
    charSettings.value.rangedMods.map((v) => (v ? LeveledMod.from(v[0], v[1], inv.getBuffLv(v[0])) : null)),
)
const selectedSkillWeaponMods = computed(() =>
    charSettings.value.skillWeaponMods.map((v) => (v ? LeveledMod.from(v[0], v[1], inv.getBuffLv(v[0])) : null)),
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
            enemyId: charSettings.value.enemyId,
            enemyLevel: charSettings.value.enemyLevel,
            enemyResistance: charSettings.value.enemyResistance,
            targetFunction: charSettings.value.targetFunction,
            timeline: getTimelineByName(charSettings.value.baseName),
        }),
)

// 计算属性
const attributes = computed(() => charBuild.value.calculateAttributes())

// 计算武器属性
const weaponAttrs = computed(() => (charBuild.value.selectedWeapon ? charBuild.value.calculateWeaponAttributes().weapon : null))
const meleeAttrs = computed(() => charBuild.value.meleeAttrs || ({} as WeaponAttr))
const rangedAttrs = computed(() => charBuild.value.rangedAttrs || ({} as WeaponAttr))
const skillWeaponAttrs = computed(() => charBuild.value.skillWeaponAttrs || ({} as WeaponAttr))
// 计算总伤害
const totalDamage = computed(() => charBuild.value.calculate())

function selectMod(type: string, slotIndex: number, modId: number, lv: number) {
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

// 交换MOD位置
function swapMods(fromIndex: number, toIndex: number, type: string) {
    if (type === "角色") {
        const temp = charSettings.value.charMods[fromIndex]
        charSettings.value.charMods[fromIndex] = charSettings.value.charMods[toIndex]
        charSettings.value.charMods[toIndex] = temp
    } else if (type === "近战") {
        const temp = charSettings.value.meleeMods[fromIndex]
        charSettings.value.meleeMods[fromIndex] = charSettings.value.meleeMods[toIndex]
        charSettings.value.meleeMods[toIndex] = temp
    } else if (type === "远程") {
        const temp = charSettings.value.rangedMods[fromIndex]
        charSettings.value.rangedMods[fromIndex] = charSettings.value.rangedMods[toIndex]
        charSettings.value.rangedMods[toIndex] = temp
    } else if (type === "同律") {
        const temp = charSettings.value.skillWeaponMods[fromIndex]
        charSettings.value.skillWeaponMods[fromIndex] = charSettings.value.skillWeaponMods[toIndex]
        charSettings.value.skillWeaponMods[toIndex] = temp
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

// 保存配置
const saveConfig = () => {
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
    charSettings.value.resonanceGain = 3
    charSettings.value.enemyId = 130
    charSettings.value.enemyLevel = 80
    charSettings.value.enemyResistance = 0
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
        targetFunction.value = charSettings.value.targetFunction
        updateCharBuild()
    }
}

const reloadCustomBuff = () => {
    const index = _buffOptions.findIndex((buff) => buff.label === "自定义BUFF")
    if (index > -1) {
        _buffOptions[index].value = new LeveledBuff("自定义BUFF")
    }
    charSettings.value.buffs = [...charSettings.value.buffs]
}
//#endregion

//#region 模拟
const simulator_model_show = ref(false)
//#endregion
//#region 自动构建
const autobuild_model_show = ref(false)
let newBuild!: CharBuild

function applyAutobuild() {
    autobuild_model_show.value = false
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
function setTimeline(name?: string) {
    if (isTimeline.value) {
        charSettings.value.baseName = charBuild.value.char.技能[0].名称
        return
    }
    if (!name) {
        if (timelines.value.length > 0) {
            name = timelines.value[0].name
        } else {
            // name = charBuild.value.char.技能[0].名称
            ui.showErrorMessage("当前角色没有时间线，无法切换")
            return
        }
    }
    const timeline = getTimelineByName(name)
    if (!timeline) {
        return
    }
    charSettings.value.baseName = name || ""
}
//#endregion

// 更新CharBuild实例
function updateCharBuild() {
    if (!monsterMap.has(charSettings.value.enemyId)) {
        charSettings.value.enemyId = 1001001
    }
    // if (
    //     !charSettings.value.baseName ||
    //     (!baseOptions.value.some((skill) => skill.value === charSettings.value.baseName) && !isTimeline.value)
    // ) {
    //     charSettings.value.baseName = charBuild.value.char.技能[0].名称
    // }
    pad(charSettings.value.charMods, 8, null)
    pad(charSettings.value.meleeMods, 8, null)
    pad(charSettings.value.rangedMods, 8, null)
    pad(charSettings.value.skillWeaponMods, 4, null)
    function pad<T>(arr: T[], length: number, value: T) {
        if (arr.length > length) {
            arr.length = length
            return
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

// 外部调用接口
declare global {
    interface Window {
        setCharName: (name: string) => void
        setMod: (key: "charMods" | "meleeMods" | "rangedMods" | "skillWeaponMods", index: number, modId: number, level: number) => void
        setBuff: (buffId: string, level?: number) => void
    }
}

onMounted(() => {
    window.setMod = (key: "charMods" | "meleeMods" | "rangedMods" | "skillWeaponMods", index: number, modId: number, level: number) => {
        if (index < 0 || index >= charSettings.value[key].length) return
        if (modId < 0) charSettings.value[key][index] = null
        else charSettings.value[key][index] = [modId, level]
    }
    window.setBuff = (buffId: string, level?: number) => {
        const buff = buffOptions.value.find((v) => v.label === buffId)
        if (!buff) return
        if (level === undefined) level = buff.value.等级
        const index = charSettings.value.buffs.findIndex((v) => v[0] === buffId)
        if (index === -1) {
            if (level > 0) charSettings.value.buffs.push([buffId, level])
        } else {
            if (level > 0) charSettings.value.buffs[index] = [buffId, level]
            else charSettings.value.buffs.splice(index, 1)
        }
    }
    ui.title = t("char-build.title1", { charName: t(selectedChar.value) })
})

onBeforeUnmount(() => {
    ui.title = ""
})

// 折叠状态
const collapsedSections = useLocalStorage("build-collapsed-sections", {
    detail: false,
    basic: false,
    mods: false,
    effects: false,
    buffs: false,
    preview: false,
})

function toggleSection(section: keyof typeof collapsedSections.value) {
    collapsedSections.value[section] = !collapsedSections.value[section]
}

const detailTab = ref("溯源")
const selectedSkill = ref<LeveledSkill | null>(null)
const selectedSkillLevel = ref(12)
watchEffect(() => {
    let skill = charBuild.value.char.技能.find((s) => s.名称 === detailTab.value)
    if (!skill) {
        detailTab.value = charBuild.value.char.技能[0].名称
        skill = charBuild.value.char.技能[0]
    }
    selectedSkill.value = skill.clone(selectedSkillLevel.value)
})

const charTab = ref(charBuild.value.selectedSkillType)

function addSkill(skillName: string) {
    targetFunction.value += skillName
}

const targetFunction = ref(charSettings.value.targetFunction)
watch(
    targetFunction,
    debounce((newValue) => {
        const error = charBuild.value.validateAST(newValue)
        if (error) {
            return
        }
        charSettings.value.targetFunction = newValue
    }, 500),
)
const charDetailExpend = ref(true)
const weapon_select_model_show = ref(false)
const newWeaponSelection = ref({ melee: "", ranged: "" })
function handleWeaponSelection(melee: string, ranged: string) {
    newWeaponSelection.value = { melee, ranged }
}
function applyWeaponSelection() {
    charSettings.value.meleeWeapon = newWeaponSelection.value.melee
    charSettings.value.rangedWeapon = newWeaponSelection.value.ranged
    weapon_select_model_show.value = false
}

const ast_help_model_show = ref(false)

function shareCharBuild() {
    const shareUrl = `https://xn--chq26veyq.icu/char/${route.params.charId}/${serializeCharSettings(charSettings.value)}`
    copyText(shareUrl)
    ui.showSuccessMessage(t("分享链接已复制"))
}
</script>

<template>
    <dialog class="modal" :class="{ 'modal-open': simulator_model_show }">
        <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
            <GameSimulator v-if="simulator_model_show" :charBuild="charBuild" />
        </div>
        <div class="modal-backdrop" @click="simulator_model_show = false"></div>
    </dialog>
    <dialog class="modal" :class="{ 'modal-open': autobuild_model_show }">
        <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
            <AutoBuild :update="autobuild_model_show" :charBuild="charBuild" @change="newBuild = $event" />
            <div class="modal-action">
                <form class="flex justify-end gap-2" method="dialog">
                    <button class="btn btn-primary" @click="applyAutobuild">{{ $t("应用") }}</button>
                    <button class="btn" @click="autobuild_model_show = false">{{ $t("取消") }}</button>
                </form>
            </div>
        </div>
        <div class="modal-backdrop" @click="autobuild_model_show = false"></div>
    </dialog>
    <dialog class="modal" :class="{ 'modal-open': ast_help_model_show }">
        <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
            <ASTHelp
                :char-build="charBuild"
                v-if="ast_help_model_show"
                v-model="ast_help_model_show"
                @select="targetFunction = $event"
                :skill="charBuild.selectedSkill"
            />
        </div>
        <div class="modal-backdrop" @click="ast_help_model_show = false"></div>
    </dialog>
    <dialog class="modal" :class="{ 'modal-open': weapon_select_model_show }">
        <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
            <WeaponListView
                v-if="weapon_select_model_show"
                :charBuild="charBuild"
                :melee="charSettings.meleeWeapon"
                :ranged="charSettings.rangedWeapon"
                @change="handleWeaponSelection"
            />
            <div class="modal-action">
                <form class="flex justify-end gap-2" method="dialog">
                    <button class="btn btn-primary" @click="applyWeaponSelection">{{ $t("应用") }}</button>
                    <button class="btn" @click="weapon_select_model_show = false">{{ $t("取消") }}</button>
                </form>
            </div>
        </div>
        <div class="modal-backdrop" @click="weapon_select_model_show = false"></div>
    </dialog>
    <div class="h-full flex flex-col relative">
        <!-- 背景图 -->
        <div
            class="inset-0 absolute opacity-50"
            :style="{
                backgroundImage: `url(${charBuild.char.bg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }"
        ></div>
        <!-- 顶部操作栏 -->
        <div class="sticky top-0 z-1 bg-base-300/50 backdrop-blur-sm rounded-md p-3 m-2 shadow-lg border border-base-200">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <button class="btn btn-sm btn-circle btn-ghost" @click="$router.back()">
                        <Icon icon="ri:arrow-left-line" />
                    </button>
                    <h1 class="text-xl font-bold">{{ $t("char-build.title") }}</h1>
                </div>
                <div class="flex ml-auto flex-wrap items-center gap-2">
                    <button class="btn btn-sm btn-ghost" @click="shareCharBuild">
                        <Icon icon="ri:share-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("分享") }}</span>
                    </button>
                    <button class="btn btn-sm btn-ghost" @click="simulator_model_show = true">
                        <Icon icon="ri:game-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("模拟") }}</span>
                    </button>
                    <button class="btn btn-sm btn-secondary" @click="autobuild_model_show = true">
                        <Icon icon="ri:robot-2-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("char-build.auto_build") }}</span>
                    </button>
                    <button class="btn btn-sm btn-success" @click="$router.push('/char-build-compare')">
                        <Icon icon="ri:bar-chart-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("build-compare.title") }}</span>
                    </button>
                    <Select
                        v-if="charProject.projects.length > 0"
                        class="w-40 input input-bordered input-sm"
                        v-model="charProject.selected"
                        @change="loadConfig"
                    >
                        <SelectItem v-for="project in charProject.projects" :key="project.name" :value="project.name">
                            {{ project.name }}
                        </SelectItem>
                    </Select>
                    <button class="btn btn-sm btn-primary" @click="saveConfig">
                        <Icon icon="ri:save-fill" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("char-build.save_project") }}</span>
                    </button>
                    <button class="btn btn-sm btn-ghost" @click="resetConfig">
                        <Icon icon="ri:refresh-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("char-build.reset_config") }}</span>
                    </button>
                </div>
            </div>
        </div>
        <div class="flex-1 flex flex-col sm:flex-row overflow-y-auto sm:overflow-hidden">
            <!-- 侧边栏 -->
            <ScrollArea class="sm:w-92 flex-none flex flex-col gap-2 p-2">
                <div class="flex flex-col gap-4">
                    <div class="flex m-auto gap-2">
                        <div
                            v-for="tab in [
                                {
                                    name: '角色',
                                    url: charBuild.char.url,
                                },
                                {
                                    name: '近战',
                                    url: charBuild.meleeWeapon.url,
                                },
                                {
                                    name: '远程',
                                    url: charBuild.rangedWeapon.url,
                                },
                                ...(charBuild.skillWeapon
                                    ? [
                                          {
                                              name: '同律',
                                              url: charBuild.skillWeapon.url,
                                          },
                                      ]
                                    : []),
                            ]"
                            class="flex items-center gap-2"
                        >
                            <div
                                class="flex-none cursor-pointer size-12 relative rounded-full overflow-hidden border-2 border-base-100 aspect-square"
                                :class="{ 'border-primary! shadow-lg shadow-primary/40': charTab === tab.name }"
                                @click="charTab = tab.name"
                            >
                                <ImageFallback :src="tab.url" alt="角色头像" class="w-full h-full object-cover object-top">
                                    <Icon icon="ri:question-mark" class="w-full h-full" />
                                </ImageFallback>
                                <div class="absolute inset-0 bg-linear-to-t from-yellow-500/20 via-transparent to-transparent"></div>
                            </div>
                        </div>
                    </div>
                    <!-- 角色 -->
                    <div
                        v-if="charTab === '角色'"
                        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-md p-4 space-y-3 border border-base-200"
                    >
                        <h3 class="flex items-center gap-4 text-lg font-bold text-base-content/90 mb-2">
                            <div class="flex flex-col">
                                <div class="text-lg font-bold">{{ $t(selectedChar) }}</div>
                                <div class="text-sm opacity-60">{{ $t(charBuild.char.别名 || "") }}</div>
                            </div>
                            <div class="ml-auto flex">Lv. {{ charSettings.charLevel }}</div>
                        </h3>
                        <div class="flex items-center gap-2 text-sm p-1">
                            <div class="flex-1">
                                <input
                                    v-model.number="charSettings.charLevel"
                                    type="range"
                                    class="range range-primary range-xs w-full"
                                    min="1"
                                    max="80"
                                    step="1"
                                />
                            </div>
                        </div>
                        <!-- 词条 -->
                        <div class="collapse" :class="{ 'collapse-open': charDetailExpend }">
                            <div class="space-y-1 collapse-content p-0">
                                <FullTooltip
                                    side="bottom"
                                    v-for="[key, val] in Object.entries(attributes).filter(
                                        ([k, v]) => !['召唤物攻击速度', '召唤物范围'].includes(k) && v,
                                    )"
                                    :key="key"
                                >
                                    <template #tooltip>
                                        <div class="flex flex-col gap-2">
                                            <div class="text-base-content/50 text-xs">{{ $t(key) }}</div>
                                            <div class="text-sm text-primary" v-if="key === '有效生命'">
                                                (生命 / (1 - 防御 / (300 + 防御)) + 护盾) / (1 - 减伤)
                                            </div>
                                            <ul class="space-y-1">
                                                <li
                                                    v-if="'基础' + key in charBuild.char"
                                                    class="flex justify-between gap-8 text-sm text-primary"
                                                >
                                                    <div class="text-base-content/80">基础{{ key }}</div>
                                                    {{ charBuild.char[("基础" + key) as keyof LeveledChar] }}
                                                </li>
                                                <li
                                                    v-if="charBuild.char.加成 && key in charBuild.char.加成"
                                                    class="flex justify-between gap-8 text-sm text-primary"
                                                >
                                                    <div class="text-base-content/80">角色</div>
                                                    {{ format100r(charBuild.char.加成[key]!) }}
                                                </li>
                                                <li
                                                    v-if="['生命', '护盾', '防御', '攻击'].includes(key)"
                                                    class="flex justify-between gap-8 text-sm text-primary"
                                                >
                                                    <div class="text-base-content/80">和鸣增益</div>
                                                    {{ format100r(charSettings.resonanceGain) }}
                                                </li>
                                                <li
                                                    v-if="key in (charBuild.meleeWeapon || {})"
                                                    class="flex justify-between gap-8 text-sm text-primary"
                                                >
                                                    <div class="text-base-content/80">{{ $t(charBuild.meleeWeapon.名称) }}</div>
                                                    {{ format100r(charBuild.meleeWeapon[key]!) }}
                                                </li>
                                                <li
                                                    v-if="key in (charBuild.rangedWeapon || {})"
                                                    class="flex justify-between gap-8 text-sm text-primary"
                                                >
                                                    <div class="text-base-content/80">{{ $t(charBuild.rangedWeapon.名称) }}</div>
                                                    {{ format100r(charBuild.rangedWeapon[key]!) }}
                                                </li>
                                                <li
                                                    v-for="mod in charBuild.charMods.filter((m) => m[key])"
                                                    class="flex justify-between gap-8 text-sm text-primary"
                                                >
                                                    <div class="text-base-content/80">{{ $t(mod.名称) }}</div>
                                                    {{ format100r(mod[key]!) }}
                                                </li>
                                                <li
                                                    v-for="buff in charBuild.buffs.filter((b) => b[key])"
                                                    class="flex justify-between gap-8 text-sm text-primary"
                                                >
                                                    <div class="text-base-content/80">{{ buff.名称 }}</div>
                                                    {{ format100r(buff[key]!) }}
                                                </li>
                                            </ul>
                                        </div>
                                    </template>
                                    <div
                                        class="cursor-pointer flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100/60 hover:shadow-md"
                                        @click="addSkill(key)"
                                        :class="{
                                            'shadow-md shadow-primary/50 text-shadow-sm outline outline-primary': charBuild
                                                .getIdentifierNames(charBuild.targetFunction)
                                                .includes(key),
                                        }"
                                    >
                                        <div class="text-sm text-base-content/80">
                                            {{ key === "攻击" ? $t(`${charBuild.char.属性}属性`) : "" }}{{ $t(key) }}
                                        </div>
                                        <div class="text-primary font-bold text-sm font-orbitron">
                                            {{
                                                ["攻击", "生命", "护盾", "防御", "神智", "有效生命"].includes(key)
                                                    ? `${+val.toFixed(key === "攻击" ? 2 : 0)}`
                                                    : `${+(val * 100).toFixed(2)}%`
                                            }}
                                        </div>
                                    </div>
                                </FullTooltip>
                            </div>
                        </div>
                        <div
                            class="flex justify-center items-center cursor-pointer p-2 hover:bg-base-100/60 transition-all duration-200"
                            @click="charDetailExpend = !charDetailExpend"
                        >
                            <Icon icon="radix-icons:chevron-down" :class="{ 'rotate-180': charDetailExpend }" />
                        </div>
                        <!-- 技能选择 -->
                        <div class="join flex">
                            <button
                                v-for="(skill, index) in charBuild.skills.slice(0, 3)"
                                :key="index"
                                class="flex-1 btn btn-sm join-item p-0"
                                :class="{
                                    'btn-primary': skill.名称 === charBuild.baseName,
                                    'btn-ghost': skill.名称 !== charBuild.baseName,
                                }"
                                @click="charSettings.baseName = skill.名称"
                            >
                                {{ skill.名称 }}
                            </button>
                        </div>
                        <div class="flex items-center gap-4 text-sm p-1">
                            <div class="flex-1">
                                <input
                                    v-model.number="charSettings.charSkillLevel"
                                    type="range"
                                    class="range range-primary range-xs w-full"
                                    min="1"
                                    max="12"
                                    step="1"
                                />
                            </div>
                            <div class="flex-none">Lv. {{ charSettings.charSkillLevel }}</div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-sm" v-if="charBuild.selectedSkill">
                                <div
                                    v-for="(val, index) in charBuild.selectedSkill!.getFieldsWithAttr(
                                        charBuild.selectedSkill?.召唤物
                                            ? charBuild.calculateWeaponAttributes(undefined, undefined, charBuild.meleeWeapon)
                                            : attributes,
                                    )"
                                    :key="index"
                                    class="flex flex-col group hover:bg-base-200/50 p-2 cursor-pointer"
                                    @click="addSkill(val.名称)"
                                    :class="{
                                        'shadow-md shadow-primary/50 outline-2 outline-primary/60': charBuild
                                            .getIdentifierNames(charBuild.targetFunction)
                                            .includes(val.名称),
                                    }"
                                >
                                    <div class="flex justify-between items-center gap-4">
                                        <div>{{ val.名称 }}</div>
                                        <div class="font-medium text-primary">
                                            {{ formatSkillProp(val.名称, val) }}
                                        </div>
                                    </div>
                                    <div
                                        v-if="val.影响"
                                        class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
                                    >
                                        <div>属性影响</div>
                                        <div class="ml-auto font-medium">{{ val.影响 }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- 近战武器 -->
                    <div
                        v-if="charTab === '近战'"
                        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-md p-4 space-y-3 border border-base-200"
                    >
                        <h3 class="flex items-center gap-4 text-lg font-bold text-base-content/90 mb-2">
                            <div class="flex flex-1 flex-col">
                                <div class="text-lg font-bold cursor-pointer" @click="weapon_select_model_show = true">
                                    {{ $t(charBuild.meleeWeapon.名称) }}
                                    <Icon icon="ri:exchange-line" class="inline-block w-5 h-5 text-primary" />
                                </div>
                                <div class="text-sm opacity-60 flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
                                    精炼 {{ charSettings.meleeWeaponRefine }}
                                </div>
                            </div>
                            <div class="ml-auto flex flex-none">Lv. {{ charSettings.meleeWeaponLevel }}</div>
                        </h3>
                        <div class="flex items-center gap-2 text-sm p-1">
                            <div class="flex-1">
                                <input
                                    v-model.number="charSettings.meleeWeaponLevel"
                                    type="range"
                                    class="range range-primary range-xs w-full"
                                    min="1"
                                    max="80"
                                    step="1"
                                />
                            </div>
                        </div>
                        <!-- 词条 -->
                        <div class="space-y-1">
                            <FullTooltip
                                side="bottom"
                                v-for="[key, val] in Object.entries(attributes).filter(([k]) => k === '攻击')"
                                :key="key"
                            >
                                <template #tooltip>
                                    <div class="flex flex-col gap-2">
                                        <div class="text-base-content/50 text-xs">{{ $t(key) }}</div>
                                        <ul class="space-y-1">
                                            <li
                                                v-if="'基础' + key in charBuild.char"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">基础{{ key }}</div>
                                                {{ charBuild.char[("基础" + key) as keyof LeveledChar] }}
                                            </li>
                                            <li
                                                v-if="charBuild.char.加成 && key in charBuild.char.加成"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">角色</div>
                                                {{ format100r(charBuild.char.加成[key]!) }}
                                            </li>
                                            <li
                                                v-if="['生命', '护盾', '防御', '攻击'].includes(key)"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">和鸣增益</div>
                                                {{ format100r(charSettings.resonanceGain) }}
                                            </li>
                                            <li
                                                v-if="key in (charBuild.meleeWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(charBuild.meleeWeapon.名称) }}</div>
                                                {{ format100r(charBuild.meleeWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-if="key in (charBuild.rangedWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(charBuild.rangedWeapon.名称) }}</div>
                                                {{ format100r(charBuild.rangedWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-for="mod in charBuild.charMods.filter((m) => m[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(mod.名称) }}</div>
                                                {{ format100r(mod[key]!) }}
                                            </li>
                                            <li
                                                v-for="buff in charBuild.buffs.filter((b) => b[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ buff.名称 }}</div>
                                                {{ format100r(buff[key]!) }}
                                            </li>
                                        </ul>
                                    </div>
                                </template>
                                <div
                                    class="flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md rounded-md"
                                >
                                    <div class="text-sm text-base-content/80">
                                        {{ key === "攻击" ? $t(`${charBuild.char.属性}属性`) : "" }}{{ $t(key) }}
                                    </div>
                                    <div class="text-primary font-bold text-sm font-orbitron">
                                        {{
                                            ["攻击", "生命", "护盾", "防御", "神智"].includes(key)
                                                ? `${+val.toFixed(2)}`
                                                : `${+(val * 100).toFixed(2)}%`
                                        }}
                                    </div>
                                </div>
                            </FullTooltip>
                            <FullTooltip
                                side="bottom"
                                v-for="[key, val] in Object.entries(meleeAttrs).filter(([k, v]) => v && k !== '多重')"
                                :key="key"
                            >
                                <template #tooltip>
                                    <div class="flex flex-col gap-2">
                                        <div class="text-base-content/50 text-xs">{{ $t(key) }}</div>
                                        <ul class="space-y-1">
                                            <li
                                                v-if="'基础' + key in charBuild.meleeWeapon"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">基础{{ key }}</div>
                                                {{
                                                    key !== "攻击"
                                                        ? format100(charBuild.meleeWeapon[("基础" + key) as keyof LeveledWeapon]!)
                                                        : +charBuild.meleeWeapon[("基础" + key) as keyof LeveledWeapon].toFixed(2)
                                                }}
                                            </li>
                                            <li
                                                v-if="charBuild.meleeWeapon.加成 && key in charBuild.meleeWeapon.加成"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ charBuild.meleeWeapon.名称 }}</div>
                                                {{ format100r(charBuild.meleeWeapon.加成[key]!) }}
                                            </li>
                                            <li
                                                v-if="key != '攻击' && key in (charBuild.meleeWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">近战武器</div>
                                                {{ format100r(charBuild.meleeWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-if="key != '攻击' && key in (charBuild.rangedWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">远程武器</div>
                                                {{ format100r(charBuild.rangedWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-for="mod in charBuild.meleeMods.filter((m) => m[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(mod.名称) }}</div>
                                                {{ format100r(mod[key]!) }}
                                            </li>
                                            <li
                                                v-for="buff in charBuild.buffs.filter((b) => b[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ buff.名称 }}</div>
                                                {{ format100r(buff[key]!) }}
                                            </li>
                                        </ul>
                                    </div>
                                </template>
                                <div
                                    class="flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md rounded-md"
                                >
                                    <div class="text-sm text-base-content/80">
                                        {{ key === "攻击" ? $t(`${charBuild.meleeWeapon.伤害类型}`) : "" }}{{ $t(key) }}
                                    </div>
                                    <div class="text-primary font-bold text-sm font-orbitron">
                                        {{ ["攻击", "攻速", "多重"].includes(key) ? `${+val.toFixed(2)}` : `${+(val * 100).toFixed(2)}%` }}
                                    </div>
                                </div>
                            </FullTooltip>
                        </div>
                        <!-- 技能选择 -->
                        <div class="join flex">
                            <button
                                v-for="(skill, index) in charBuild.meleeWeaponSkills.slice(0, 3)"
                                :key="index"
                                class="flex-1 btn btn-sm join-item p-0"
                                :class="{
                                    'btn-primary': skill.名称 === charBuild.baseName,
                                    'btn-ghost': skill.名称 !== charBuild.baseName,
                                }"
                                @click="charSettings.baseName = skill.名称"
                            >
                                {{ skill.名称 }}
                            </button>
                        </div>
                        <div class="space-y-1">
                            <div class="text-sm" v-if="charBuild.isMeleeWeapon && charBuild.selectedSkill">
                                <div
                                    v-for="(val, index) in charBuild.selectedSkill!.getFieldsWithAttr(
                                        charBuild.selectedSkill?.召唤物
                                            ? charBuild.calculateWeaponAttributes(undefined, undefined, charBuild.meleeWeapon)
                                            : attributes,
                                    )"
                                    :key="index"
                                    class="flex flex-col group hover:bg-base-200/50 p-2 cursor-pointer"
                                    @click="addSkill(val.名称)"
                                    :class="{
                                        'shadow-md shadow-primary/50 outline-2 outline-primary/60': charBuild
                                            .getIdentifierNames(charBuild.targetFunction)
                                            .includes(val.名称),
                                    }"
                                >
                                    <div class="flex justify-between items-center gap-4">
                                        <div>{{ val.名称 }}</div>
                                        <div class="font-medium text-primary">
                                            {{ formatSkillProp(val.名称, val) }}
                                        </div>
                                    </div>
                                    <div
                                        v-if="val.影响"
                                        class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
                                    >
                                        <div>属性影响</div>
                                        <div class="ml-auto font-medium">{{ val.影响 }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- 远程武器 -->
                    <div
                        v-if="charTab === '远程'"
                        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-md p-4 space-y-3 border border-base-200"
                    >
                        <h3 class="flex items-center gap-4 text-lg font-bold text-base-content/90 mb-2">
                            <div class="flex flex-1 flex-col">
                                <div class="text-lg font-bold cursor-pointer" @click="weapon_select_model_show = true">
                                    {{ $t(charBuild.rangedWeapon.名称) }}
                                    <Icon icon="ri:exchange-line" class="inline-block w-5 h-5 text-primary" />
                                </div>
                                <div class="text-sm opacity-60 flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
                                    精炼 {{ charSettings.rangedWeaponRefine }}
                                </div>
                            </div>
                            <div class="ml-auto flex flex-none">Lv. {{ charSettings.rangedWeaponLevel }}</div>
                        </h3>
                        <div class="flex items-center gap-2 text-sm p-1">
                            <div class="flex-1">
                                <input
                                    v-model.number="charSettings.rangedWeaponLevel"
                                    type="range"
                                    class="range range-primary range-xs w-full"
                                    min="1"
                                    max="80"
                                    step="1"
                                />
                            </div>
                        </div>
                        <!-- 词条 -->
                        <div class="space-y-1">
                            <FullTooltip
                                side="bottom"
                                v-for="[key, val] in Object.entries(attributes).filter(([k]) => k === '攻击')"
                                :key="key"
                            >
                                <template #tooltip>
                                    <div class="flex flex-col gap-2">
                                        <div class="text-base-content/50 text-xs">{{ $t(key) }}</div>
                                        <ul class="space-y-1">
                                            <li
                                                v-if="'基础' + key in charBuild.char"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">基础{{ key }}</div>
                                                {{ charBuild.char[("基础" + key) as keyof LeveledChar] }}
                                            </li>
                                            <li
                                                v-if="charBuild.char.加成 && key in charBuild.char.加成"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">角色</div>
                                                {{ format100r(charBuild.char.加成[key]!) }}
                                            </li>
                                            <li
                                                v-if="['生命', '护盾', '防御', '攻击'].includes(key)"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">和鸣增益</div>
                                                {{ format100r(charSettings.resonanceGain) }}
                                            </li>
                                            <li
                                                v-if="key in (charBuild.meleeWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(charBuild.meleeWeapon.名称) }}</div>
                                                {{ format100r(charBuild.meleeWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-if="key in (charBuild.rangedWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(charBuild.rangedWeapon.名称) }}</div>
                                                {{ format100r(charBuild.rangedWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-for="mod in charBuild.charMods.filter((m) => m[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(mod.名称) }}</div>
                                                {{ format100r(mod[key]!) }}
                                            </li>
                                            <li
                                                v-for="buff in charBuild.buffs.filter((b) => b[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ buff.名称 }}</div>
                                                {{ format100r(buff[key]!) }}
                                            </li>
                                        </ul>
                                    </div>
                                </template>
                                <div
                                    class="flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md rounded-md"
                                >
                                    <div class="text-sm text-base-content/80">
                                        {{ key === "攻击" ? $t(`${charBuild.char.属性}属性`) : "" }}{{ $t(key) }}
                                    </div>
                                    <div class="text-primary font-bold text-sm font-orbitron">
                                        {{
                                            ["攻击", "生命", "护盾", "防御", "神智"].includes(key)
                                                ? `${+val.toFixed(2)}`
                                                : `${+(val * 100).toFixed(2)}%`
                                        }}
                                    </div>
                                </div>
                            </FullTooltip>
                            <FullTooltip side="bottom" v-for="[key, val] in Object.entries(rangedAttrs).filter(([_k, v]) => v)" :key="key">
                                <template #tooltip>
                                    <div class="flex flex-col gap-2">
                                        <div class="text-base-content/50 text-xs">{{ $t(key) }}</div>
                                        <ul class="space-y-1">
                                            <li
                                                v-if="'基础' + key in charBuild.rangedWeapon"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">基础{{ key }}</div>
                                                {{
                                                    key !== "攻击"
                                                        ? format100(charBuild.rangedWeapon[("基础" + key) as keyof LeveledWeapon]!)
                                                        : +charBuild.rangedWeapon[("基础" + key) as keyof LeveledWeapon].toFixed(2)
                                                }}
                                            </li>
                                            <li
                                                v-if="charBuild.meleeWeapon.加成 && key in charBuild.meleeWeapon.加成"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ charBuild.rangedWeapon.名称 }}</div>
                                                {{ format100r(charBuild.rangedWeapon.加成[key]!) }}
                                            </li>
                                            <li
                                                v-if="key != '攻击' && key in (charBuild.meleeWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">近战武器</div>
                                                {{ format100r(charBuild.meleeWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-if="key != '攻击' && key in (charBuild.rangedWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">远程武器</div>
                                                {{ format100r(charBuild.rangedWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-for="mod in charBuild.rangedMods.filter((m) => m[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(mod.名称) }}</div>
                                                {{ format100r(mod[key]!) }}
                                            </li>
                                            <li
                                                v-for="buff in charBuild.buffs.filter((b) => b[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ buff.名称 }}</div>
                                                {{ format100r(buff[key]!) }}
                                            </li>
                                        </ul>
                                    </div>
                                </template>
                                <div
                                    class="flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md rounded-md"
                                >
                                    <div class="text-sm text-base-content/80">
                                        {{ key === "攻击" ? $t(`${charBuild.rangedWeapon.伤害类型}`) : "" }}{{ $t(key) }}
                                    </div>
                                    <div class="text-primary font-bold text-sm font-orbitron">
                                        {{ ["攻击", "攻速", "多重"].includes(key) ? `${+val.toFixed(2)}` : `${+(val * 100).toFixed(2)}%` }}
                                    </div>
                                </div>
                            </FullTooltip>
                        </div>
                        <!-- 技能选择 -->
                        <div class="join flex">
                            <button
                                v-for="(skill, index) in charBuild.rangedWeaponSkills.slice(0, 3)"
                                :key="index"
                                class="flex-1 btn btn-sm join-item p-0"
                                :class="{
                                    'btn-primary': skill.名称 === charBuild.baseName,
                                    'btn-ghost': skill.名称 !== charBuild.baseName,
                                }"
                                @click="charSettings.baseName = skill.名称"
                            >
                                {{ skill.名称 }}
                            </button>
                        </div>
                        <div class="space-y-1">
                            <div class="text-sm" v-if="charBuild.isRangedWeapon && charBuild.selectedSkill">
                                <div
                                    v-for="(val, index) in charBuild.selectedSkill!.getFieldsWithAttr(
                                        charBuild.selectedSkill?.召唤物
                                            ? charBuild.calculateWeaponAttributes(undefined, undefined, charBuild.meleeWeapon)
                                            : attributes,
                                    )"
                                    :key="index"
                                    class="flex flex-col group hover:bg-base-200/50 p-2 cursor-pointer"
                                    @click="addSkill(val.名称)"
                                    :class="{
                                        'shadow-md shadow-primary/50 outline-2 outline-primary/60': charBuild
                                            .getIdentifierNames(charBuild.targetFunction)
                                            .includes(val.名称),
                                    }"
                                >
                                    <div class="flex justify-between items-center gap-4">
                                        <div>{{ val.名称 }}</div>
                                        <div class="font-medium text-primary">
                                            {{ formatSkillProp(val.名称, val) }}
                                        </div>
                                    </div>
                                    <div
                                        v-if="val.影响"
                                        class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
                                    >
                                        <div>属性影响</div>
                                        <div class="ml-auto font-medium">{{ val.影响 }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- 同律武器 -->
                    <div
                        v-if="charTab === '同律' && charBuild.skillWeapon"
                        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-md p-4 space-y-3 border border-base-200"
                    >
                        <h3 class="flex items-center gap-4 text-lg font-bold text-base-content/90 mb-2">
                            <div class="flex flex-1 flex-col">
                                <div class="text-lg font-bold cursor-pointer">
                                    {{ $t(charBuild.skillWeapon.名称) }}
                                </div>
                            </div>
                            <div class="ml-auto flex flex-none">Lv. {{ charSettings.charLevel }}</div>
                        </h3>
                        <!-- 词条 -->
                        <div class="space-y-1">
                            <FullTooltip
                                side="bottom"
                                v-for="[key, val] in Object.entries(attributes).filter(([k]) => k === '攻击')"
                                :key="key"
                            >
                                <template #tooltip>
                                    <div class="flex flex-col gap-2">
                                        <div class="text-base-content/50 text-xs">{{ $t(key) }}</div>
                                        <ul class="space-y-1">
                                            <li
                                                v-if="'基础' + key in charBuild.char"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">基础{{ key }}</div>
                                                {{ charBuild.char[("基础" + key) as keyof LeveledChar] }}
                                            </li>
                                            <li
                                                v-if="charBuild.char.加成 && key in charBuild.char.加成"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">角色</div>
                                                {{ format100r(charBuild.char.加成[key]!) }}
                                            </li>
                                            <li
                                                v-if="['生命', '护盾', '防御', '攻击'].includes(key)"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">和鸣增益</div>
                                                {{ format100r(charSettings.resonanceGain) }}
                                            </li>
                                            <li
                                                v-if="key in (charBuild.meleeWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(charBuild.meleeWeapon.名称) }}</div>
                                                {{ format100r(charBuild.meleeWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-if="key in (charBuild.rangedWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(charBuild.rangedWeapon.名称) }}</div>
                                                {{ format100r(charBuild.rangedWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-for="mod in charBuild.charMods.filter((m) => m[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(mod.名称) }}</div>
                                                {{ format100r(mod[key]!) }}
                                            </li>
                                            <li
                                                v-for="buff in charBuild.buffs.filter((b) => b[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ buff.名称 }}</div>
                                                {{ format100r(buff[key]!) }}
                                            </li>
                                        </ul>
                                    </div>
                                </template>
                                <div
                                    class="flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md rounded-md"
                                >
                                    <div class="text-sm text-base-content/80">
                                        {{ key === "攻击" ? $t(`${charBuild.char.属性}属性`) : "" }}{{ $t(key) }}
                                    </div>
                                    <div class="text-primary font-bold text-sm font-orbitron">
                                        {{
                                            ["攻击", "生命", "护盾", "防御", "神智"].includes(key)
                                                ? `${+val.toFixed(2)}`
                                                : `${+(val * 100).toFixed(2)}%`
                                        }}
                                    </div>
                                </div>
                            </FullTooltip>
                            <FullTooltip
                                side="bottom"
                                v-for="[key, val] in Object.entries(skillWeaponAttrs).filter(
                                    ([k, v]) => v && (charBuild.skillWeapon!.类型 !== '近战' || k !== '多重'),
                                )"
                                :key="key"
                            >
                                <template #tooltip>
                                    <div class="flex flex-col gap-2">
                                        <div class="text-base-content/50 text-xs">{{ $t(key) }}</div>
                                        <ul class="space-y-1">
                                            <li
                                                v-if="'基础' + key in charBuild.skillWeapon"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">基础{{ key }}</div>
                                                {{
                                                    key !== "攻击"
                                                        ? format100(
                                                              charBuild.skillWeapon[
                                                                  ("基础" + key) as "基础攻击" | "基础暴击" | "基础暴伤" | "基础触发"
                                                              ]!,
                                                          )
                                                        : +charBuild.skillWeapon[
                                                              ("基础" + key) as "基础攻击" | "基础暴击" | "基础暴伤" | "基础触发"
                                                          ]!.toFixed(2)
                                                }}
                                            </li>
                                            <li
                                                v-if="key != '攻击' && key in (charBuild.meleeWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">近战武器</div>
                                                {{ format100r(charBuild.meleeWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-if="key != '攻击' && key in (charBuild.rangedWeapon || {})"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">远程武器</div>
                                                {{ format100r(charBuild.rangedWeapon[key]!) }}
                                            </li>
                                            <li
                                                v-for="mod in charBuild.rangedMods.filter((m) => m[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ $t(mod.名称) }}</div>
                                                {{ format100r(mod[key]!) }}
                                            </li>
                                            <li
                                                v-for="buff in charBuild.buffs.filter((b) => b[key])"
                                                class="flex justify-between gap-8 text-sm text-primary"
                                            >
                                                <div class="text-base-content/80">{{ buff.名称 }}</div>
                                                {{ format100r(buff[key]!) }}
                                            </li>
                                        </ul>
                                    </div>
                                </template>
                                <div
                                    class="flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md rounded-md"
                                >
                                    <div class="text-sm text-base-content/80">
                                        {{ key === "攻击" ? $t(`${charBuild.rangedWeapon.伤害类型}`) : "" }}{{ $t(key) }}
                                    </div>
                                    <div class="text-primary font-bold text-sm font-orbitron">
                                        {{ ["攻击", "攻速", "多重"].includes(key) ? `${+val.toFixed(2)}` : `${+(val * 100).toFixed(2)}%` }}
                                    </div>
                                </div>
                            </FullTooltip>
                        </div>
                        <!-- 技能选择 -->
                        <div class="join flex">
                            <button
                                v-for="(skill, index) in charBuild.skillWeaponSkills.slice(0, 3)"
                                :key="index"
                                class="flex-1 btn btn-sm join-item p-0"
                                :class="{
                                    'btn-primary': skill.名称 === charBuild.baseName,
                                    'btn-ghost': skill.名称 !== charBuild.baseName,
                                }"
                                @click="charSettings.baseName = skill.名称"
                            >
                                {{ skill.名称 }}
                            </button>
                        </div>
                        <div class="space-y-1">
                            <div class="text-sm" v-if="charBuild.isSkillWeapon && charBuild.selectedSkill">
                                <div
                                    v-for="(val, index) in charBuild.selectedSkill!.getFieldsWithAttr(
                                        charBuild.selectedSkill?.召唤物
                                            ? charBuild.calculateWeaponAttributes(undefined, undefined, charBuild.meleeWeapon)
                                            : attributes,
                                    )"
                                    :key="index"
                                    class="flex flex-col group hover:bg-base-200/50 p-2 cursor-pointer"
                                    @click="addSkill(val.名称)"
                                    :class="{
                                        'shadow-md shadow-primary/50 outline-2 outline-primary/60': charBuild
                                            .getIdentifierNames(charBuild.targetFunction)
                                            .includes(val.名称),
                                    }"
                                >
                                    <div class="flex justify-between items-center gap-4">
                                        <div>{{ val.名称 }}</div>
                                        <div class="font-medium text-primary">
                                            {{ formatSkillProp(val.名称, val) }}
                                        </div>
                                    </div>
                                    <div
                                        v-if="val.影响"
                                        class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
                                    >
                                        <div>属性影响</div>
                                        <div class="ml-auto font-medium">{{ val.影响 }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- 目标函数 -->
                    <div class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-md p-4 space-y-3 border border-base-200">
                        <div class="space-y-2 p-1">
                            <div class="text-sm flex justify-between">
                                <div class="flex items-center gap-2">
                                    {{ isTimeline ? "时间线" : "表达式" }}
                                    <div class="btn btn-xs text-lg btn-ghost btn-circle" @click="ast_help_model_show = true">
                                        <Icon icon="ri:question-line" />
                                    </div>
                                </div>
                                <input
                                    v-model="isTimeline"
                                    @click.prevent="setTimeline()"
                                    type="checkbox"
                                    class="toggle toggle-secondary"
                                />
                            </div>
                            <label v-if="!isTimeline" class="input input-sm input-primary text-sm flex justify-between">
                                <input v-model="targetFunction" type="text" placeholder="伤害" class="grow" />
                                <div
                                    v-if="targetFunction"
                                    class="flex items-center cursor-pointer hover:text-primary"
                                    @click="targetFunction = ''"
                                >
                                    <Icon icon="codicon:chrome-close" />
                                </div>
                            </label>
                            <!-- 时间线 -->
                            <Select
                                v-else
                                :value="charSettings.baseName"
                                @change="charSettings.baseName = $event"
                                class="select select-sm select-primary w-full"
                            >
                                <SelectItem v-for="timeline in timelines" :key="timeline.name" :value="timeline.name">
                                    {{ timeline.name }}
                                </SelectItem>
                            </Select>
                            <!-- 错误信息 -->
                            <div class="flex text-xs items-center text-red-500" v-if="charBuild.validateAST(targetFunction)">
                                {{ charBuild.validateAST(targetFunction) }}
                            </div>
                            <div v-else class="flex justify-between items-center p-1">
                                <div class="text-sm text-base-content/80">计算结果</div>
                                <div class="text-primary font-bold text-md font-orbitron">
                                    {{ totalDamage }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollArea>
            <!-- 正文 -->
            <ScrollArea class="sm:flex-1 flex-none">
                <div class="p-2 space-y-4">
                    <!-- 技能 -->
                    <div
                        class="collapse bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg border border-base-200"
                        :class="{ 'collapse-open': !collapsedSections.detail }"
                    >
                        <div
                            class="collapse-title flex items-center justify-between p-4 cursor-pointer bg-linear-to-r from-primary/5 to-transparent hover:from-primary/10 transition-colors"
                            @click="toggleSection('detail')"
                        >
                            <div class="flex items-center gap-2">
                                <SectionMarker reset />
                                <h2 class="text-lg font-bold">{{ $t("角色详情") }}</h2>
                            </div>
                            <span
                                class="flex-none size-8 items-center justify-center text-lg text-base-content/50 swap swap-flip -rotate-90"
                                :class="{ 'swap-active': collapsedSections.detail }"
                            >
                                <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                                <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
                            </span>
                        </div>
                        <div class="collapse-content">
                            <h2 v-if="charBuild.char.溯源" class="text-lg font-bold p-2 mt-2">溯源</h2>
                            <div class="flex flex-col gap-2 p-2" v-if="charBuild.char.溯源">
                                <div
                                    v-for="(grade, i) in charBuild.char.溯源"
                                    class="font-medium flex text-sm justify-between items-center gap-8"
                                >
                                    <div class="font-medium whitespace-nowrap opacity-70">
                                        第{{ ["一", "二", "三", "四", "五", "六"][i] }}根源
                                    </div>
                                    <div>{{ grade }}</div>
                                </div>
                            </div>
                            <h2 class="text-lg font-bold p-2 flex gap-4 justify-between items-center">
                                技能
                                <span class="text-base-content/50 text-sm">Lv. {{ selectedSkillLevel }}</span>

                                <input
                                    v-model.number="selectedSkillLevel"
                                    type="range"
                                    class="range range-primary range-xs ml-auto max-w-64"
                                    min="1"
                                    max="12"
                                    step="1"
                                />
                            </h2>

                            <div class="flex gap-2 p-2">
                                <button
                                    v-for="skill in charBuild.char.技能"
                                    :key="skill.名称"
                                    @click="detailTab = skill.名称"
                                    class="btn btn-sm rounded-full whitespace-nowrap transition-all duration-200"
                                    :class="detailTab === skill.名称 ? 'btn-primary shadow-lg scale-105' : 'btn-ghost hover:bg-base-200'"
                                >
                                    {{ skill.名称 }}
                                </button>
                            </div>
                            <div class="text-sm" v-if="selectedSkill">
                                <div class="p-2 text-sm font-medium">
                                    {{ selectedSkill.类型 }}
                                </div>
                                <div class="p-2 text-sm">
                                    {{ selectedSkill.描述 }}
                                </div>
                                <div class="p-2" v-for="(value, key) in selectedSkill.术语解释">
                                    <div class="text-xs font-medium underline">{{ key }}</div>
                                    <div class="text-xs">{{ value }}</div>
                                </div>
                                <div
                                    v-for="(val, index) in selectedSkill!.getFieldsWithAttr()"
                                    :key="index"
                                    class="flex flex-col group hover:bg-base-200/50 rounded-md p-2"
                                >
                                    <div class="flex justify-between items-center gap-4">
                                        <div>{{ val.名称 }}</div>
                                        <div class="font-medium text-primary">
                                            {{ formatSkillProp(val.名称, val) }}
                                        </div>
                                    </div>
                                    <div
                                        v-if="val.影响"
                                        class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
                                    >
                                        <div>属性影响</div>
                                        <div class="ml-auto font-medium">{{ val.影响 }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- 基本设置卡片 -->
                    <div
                        class="collapse bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg overflow-hidden border border-base-200"
                        :class="{ 'collapse-open': !collapsedSections.basic }"
                    >
                        <div
                            class="flex items-center justify-between p-4 cursor-pointer bg-linear-to-r from-primary/5 to-transparent hover:from-primary/10 transition-colors"
                            @click="toggleSection('basic')"
                        >
                            <div class="flex items-center gap-2">
                                <SectionMarker />
                                <h2 class="text-lg font-bold">{{ $t("char-build.basic_settings") }}</h2>
                            </div>
                            <span
                                class="flex-none size-8 items-center justify-center text-lg text-base-content/50 swap swap-flip -rotate-90"
                                :class="{ 'swap-active': collapsedSections.basic }"
                            >
                                <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                                <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
                            </span>
                        </div>
                        <div class="collapse-content">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                <!-- 其他设置 -->
                                <div class="space-y-3">
                                    <div class="flex gap-2">
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
                                                <SelectItem v-for="rg in [0, 0.5, 1, 1.5, 2, 2.5, 3]" :key="rg" :value="rg">
                                                    {{ rg * 100 }}%
                                                </SelectItem>
                                            </Select>
                                        </div>
                                        <div class="flex-1">
                                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("失衡") }}</div>
                                            <div class="p-0.5">
                                                <input v-model="charSettings.imbalance" type="checkbox" class="toggle toggle-secondary" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <!-- 敌人设置 -->
                                <div class="space-y-3">
                                    <div class="flex gap-2">
                                        <div class="flex-1">
                                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.enemy") }}</div>
                                            <Select
                                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                                v-model="charSettings.enemyId"
                                                @change="updateCharBuild"
                                            >
                                                <SelectItem v-for="enemy in monsterData" :key="enemy.id" :value="enemy.id">
                                                    {{ enemy.名称 }}
                                                </SelectItem>
                                            </Select>
                                        </div>
                                        <div class="flex-1">
                                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("char-build.enemy_resistance") }}</div>
                                            <Select
                                                class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                                v-model="charSettings.enemyResistance"
                                                @change="updateCharBuild"
                                            >
                                                <SelectItem v-for="res in [0, 0.5, -4]" :key="res" :value="res">
                                                    {{ res * 100 }}%
                                                </SelectItem>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <div class="px-2 text-xs text-gray-400 mb-1">
                                        {{ $t("char-build.enemy_level") }} (Lv. {{ charSettings.enemyLevel }})
                                    </div>
                                    <input
                                        v-model.number="charSettings.enemyLevel"
                                        type="range"
                                        class="range range-primary range-xs w-full"
                                        min="1"
                                        max="180"
                                        step="1"
                                    />
                                </div>
                                <!-- 敌人信息 -->
                                <div class="space-y-3">
                                    <div class="flex gap-2">
                                        <div class="flex-1">
                                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("生命") }}</div>
                                            <div class="text-primary font-bold text-right">{{ charBuild.enemy.生命 }}</div>
                                        </div>
                                        <div class="flex-1">
                                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("防御") }}</div>
                                            <div class="text-primary font-bold text-right">{{ charBuild.enemy.防御 }}</div>
                                        </div>
                                        <div class="flex-1">
                                            <div class="px-2 text-xs text-gray-400 mb-1">{{ $t("护盾") }}</div>
                                            <div class="text-primary font-bold text-right">{{ charBuild.enemy.护盾 }}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- MOD配置区域 -->
                    <div id="mod-container" class="space-y-4">
                        <!-- 角色MOD -->
                        <div
                            class="collapse bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg overflow-hidden border border-base-200"
                            :class="{ 'collapse-open': !collapsedSections.mods }"
                        >
                            <div
                                class="flex items-center justify-between p-4 cursor-pointer bg-linear-to-r from-primary/5 to-transparent hover:from-primary/10 transition-colors"
                                @click="toggleSection('mods')"
                            >
                                <div class="flex items-center gap-2">
                                    <SectionMarker />
                                    <h2 class="text-lg font-bold">{{ $t("魔之楔") }}</h2>
                                </div>
                                <span
                                    class="flex-none size-8 items-center justify-center text-lg text-base-content/50 swap swap-flip -rotate-90"
                                    :class="{ 'swap-active': collapsedSections.mods }"
                                >
                                    <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                                    <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
                                </span>
                            </div>
                            <div class="collapse-content">
                                <div class="mt-2">
                                    <ModEditer
                                        v-if="charTab === '角色'"
                                        :mods="selectedCharMods"
                                        :mod-options="
                                            modOptions.filter((m) => m.type === '角色' && (!m.limit || m.limit === charBuild.char.属性))
                                        "
                                        :char-build="charBuild"
                                        @remove-mod="removeMod($event, '角色')"
                                        @select-mod="selectMod('角色', $event[0], $event[1], $event[2])"
                                        @level-change="charSettings.charMods[$event[0]]![1] = $event[1]"
                                        :aura-mod="charSettings.auraMod"
                                        @select-aura-mod="charSettings.auraMod = $event"
                                        type="角色"
                                        @swap-mods="(index1, index2) => swapMods(index1, index2, '角色')"
                                    />

                                    <!-- 近战武器MOD -->
                                    <ModEditer
                                        v-if="charTab === '近战'"
                                        :mods="selectedMeleeMods"
                                        :mod-options="
                                            modOptions.filter(
                                                (m) =>
                                                    m.type === '近战' &&
                                                    (!m.limit ||
                                                        [charBuild.meleeWeapon.类别, charBuild.meleeWeapon.伤害类型].includes(m.limit)),
                                            )
                                        "
                                        :char-build="charBuild"
                                        @remove-mod="removeMod($event, '近战')"
                                        @select-mod="selectMod('近战', $event[0], $event[1], $event[2])"
                                        @level-change="charSettings.meleeMods[$event[0]]![1] = $event[1]"
                                        type="近战"
                                        @swap-mods="(index1, index2) => swapMods(index1, index2, '近战')"
                                    />

                                    <!-- 远程武器MOD -->
                                    <ModEditer
                                        v-if="charTab === '远程'"
                                        :mods="selectedRangedMods"
                                        :mod-options="
                                            modOptions.filter(
                                                (m) =>
                                                    m.type === '远程' &&
                                                    (!m.limit ||
                                                        [charBuild.rangedWeapon.类别, charBuild.rangedWeapon.伤害类型].includes(m.limit)),
                                            )
                                        "
                                        :char-build="charBuild"
                                        @remove-mod="removeMod($event, '远程')"
                                        @select-mod="selectMod('远程', $event[0], $event[1], $event[2])"
                                        @level-change="charSettings.rangedMods[$event[0]]![1] = $event[1]"
                                        type="远程"
                                        @swap-mods="(index1, index2) => swapMods(index1, index2, '远程')"
                                    />

                                    <!-- 同律武器MOD -->
                                    <ModEditer
                                        v-if="charTab === '同律'"
                                        :mods="selectedSkillWeaponMods"
                                        :mod-options="
                                            modOptions.filter(
                                                (m) =>
                                                    m.type === charBuild.skillWeapon!.类型 &&
                                                    (!m.limit ||
                                                        [charBuild.skillWeapon!.类别, charBuild.skillWeapon!.伤害类型].includes(m.limit)),
                                            )
                                        "
                                        :char-build="charBuild"
                                        @remove-mod="removeMod($event, '同律')"
                                        @select-mod="selectMod('同律', $event[0], $event[1], $event[2])"
                                        @level-change="charSettings.skillWeaponMods[$event[0]]![1] = $event[1]"
                                        type="同律"
                                        @swap-mods="(index1, index2) => swapMods(index1, index2, '同律')"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- MODBUFF列表 -->
                    <div
                        v-if="charBuild.modsWithWeapons.some((v) => v.buff)"
                        class="collapse bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg overflow-hidden border border-base-200"
                        :class="{ 'collapse-open': !collapsedSections.effects }"
                    >
                        <div
                            class="flex items-center justify-between p-4 cursor-pointer bg-linear-to-r from-primary/5 to-transparent hover:from-primary/10 transition-colors"
                            @click="toggleSection('effects')"
                        >
                            <div class="flex items-center gap-2">
                                <SectionMarker />
                                <h2 class="text-lg font-bold">{{ $t("char-build.special_effect_config") }}</h2>
                                <span class="badge badge-ghost badge-sm">{{ charBuild.modsWithWeapons.filter((v) => v.buff).length }}</span>
                            </div>
                            <span
                                class="flex-none size-8 items-center justify-center text-lg text-base-content/50 swap swap-flip -rotate-90"
                                :class="{ 'swap-active': collapsedSections.effects }"
                            >
                                <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                                <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
                            </span>
                        </div>
                        <div class="collapse-content">
                            <div class="mt-2">
                                <EffectSettings :mods="charBuild.modsWithWeapons" :char-build="charBuild" />
                            </div>
                        </div>
                    </div>

                    <!-- BUFF列表 -->
                    <div
                        class="collapse bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg overflow-hidden border border-base-200"
                        :class="{ 'collapse-open': !collapsedSections.buffs }"
                    >
                        <div
                            class="flex items-center justify-between p-4 cursor-pointer bg-linear-to-r from-primary/5 to-transparent hover:from-primary/10 transition-colors"
                            @click="toggleSection('buffs')"
                        >
                            <div class="flex items-center gap-2">
                                <SectionMarker />
                                <h2 class="text-lg font-bold">{{ $t("char-build.buff_list") }}</h2>
                                <span class="badge badge-ghost badge-sm">{{ selectedBuffs.length }}</span>
                            </div>
                            <span
                                class="flex-none size-8 items-center justify-center text-lg text-base-content/50 swap swap-flip -rotate-90"
                                :class="{ 'swap-active': collapsedSections.buffs }"
                            >
                                <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                                <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
                            </span>
                        </div>
                        <div class="collapse-content">
                            <!-- 协战选择 -->
                            <div class="flex flex-wrap items-center gap-4 my-2 p-3 bg-base-200/50 rounded-lg">
                                <span class="text-sm font-semibold">{{ $t("char-build.team") }}</span>
                                <Select class="input input-bordered input-sm w-32" v-model="charSettings.team1" @change="updateTeamBuff">
                                    <template v-for="charWithElm in groupBy(team1Options, 'elm')" :key="charWithElm[0].elm">
                                        <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                            {{ $t(charWithElm[0].elm + "属性") }}
                                        </SelectLabel>
                                        <SelectGroup>
                                            <SelectItem v-for="char in charWithElm" :key="char.value" :value="char.value">
                                                {{ $t(char.label) }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </template>
                                </Select>
                                <Select
                                    class="input input-bordered input-sm w-32"
                                    v-model="charSettings.team1Weapon"
                                    @change="updateTeamBuff"
                                >
                                    <template v-for="weaponWithType in groupBy(teamWeaponOptions, 'type')" :key="weaponWithType[0].type">
                                        <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                            {{ $t(weaponWithType[0].type) }}
                                        </SelectLabel>
                                        <SelectGroup>
                                            <SelectItem v-for="char in weaponWithType" :key="char.value" :value="char.value">
                                                {{ $t(char.label) }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </template>
                                </Select>
                                <Select class="input input-bordered input-sm w-32" v-model="charSettings.team2" @change="updateTeamBuff">
                                    <template v-for="charWithElm in groupBy(team2Options, 'elm')" :key="charWithElm[0].elm">
                                        <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                            {{ $t(charWithElm[0].elm + "属性") }}
                                        </SelectLabel>
                                        <SelectGroup>
                                            <SelectItem v-for="char in charWithElm" :key="char.value" :value="char.value">
                                                {{ $t(char.label) }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </template>
                                </Select>
                                <Select
                                    class="input input-bordered input-sm w-32"
                                    v-model="charSettings.team2Weapon"
                                    @change="updateTeamBuff"
                                >
                                    <template v-for="weaponWithType in groupBy(teamWeaponOptions, 'type')" :key="weaponWithType[0].type">
                                        <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                            {{ $t(weaponWithType[0].type) }}
                                        </SelectLabel>
                                        <SelectGroup>
                                            <SelectItem v-for="char in weaponWithType" :key="char.value" :value="char.value">
                                                {{ $t(char.label) }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </template>
                                </Select>
                            </div>
                            <BuffEditer
                                :buff-options="buffOptions"
                                :selected-buffs="selectedBuffs"
                                :char-build="charBuild"
                                @toggle-buff="toggleBuff"
                                @set-buff-lv="setBuffLv"
                            />
                        </div>
                    </div>

                    <!-- 自定义BUFF -->
                    <div
                        v-if="selectedBuffs.some((v) => v.名称 === '自定义BUFF')"
                        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg overflow-hidden border border-base-200"
                    >
                        <div class="p-4">
                            <CustomBuffEditor @submit="reloadCustomBuff" />
                        </div>
                    </div>

                    <!-- 装配预览 -->
                    <div
                        class="collapse bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg overflow-hidden border border-base-200"
                        :class="{ 'collapse-open': !collapsedSections.preview }"
                    >
                        <div
                            class="flex items-center justify-between p-4 cursor-pointer bg-linear-to-r from-primary/5 to-transparent hover:from-primary/10 transition-colors"
                            @click="toggleSection('preview')"
                        >
                            <div class="flex items-center gap-2">
                                <SectionMarker />
                                <h2 class="text-lg font-bold">{{ $t("char-build.equipment_preview") }}</h2>
                            </div>
                            <span
                                class="flex-none size-8 items-center justify-center text-lg text-base-content/50 swap swap-flip -rotate-90"
                                :class="{ 'swap-active': collapsedSections.preview }"
                            >
                                <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                                <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
                            </span>
                        </div>
                        <div class="collapse-content">
                            <!-- 角色头部信息 -->
                            <div class="flex flex-col md:flex-row gap-6 mb-6 mt-2">
                                <div
                                    class="relative w-32 h-32 md:w-40 md:h-40 rounded-2xl overflow-hidden border-2 border-primary/30 shadow-xl self-start"
                                >
                                    <ImageFallback :src="charBuild.char.url" alt="角色头像" class="w-full h-full object-cover object-top">
                                        <Icon icon="ri:question-mark" class="w-full h-full" />
                                    </ImageFallback>
                                    <div class="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent"></div>
                                </div>
                                <div class="flex-1 flex flex-col justify-end gap-4">
                                    <!-- 角色 -->
                                    <div class="flex items-center justify-between">
                                        <h3 class="text-4xl font-bold text-base-content/80 flex items-center gap-2">
                                            <img :src="`/imgs/${charBuild.char.属性}.png`" :alt="charBuild.char.属性" class="h-12" />
                                            {{ $t(selectedChar) }}
                                        </h3>

                                        <span
                                            class="px-4 py-2 rounded-full bg-cyan-500/20 text-cyan-400 text-sm border border-cyan-500/30 font-orbitron"
                                            >LV {{ charBuild.char.等级 }}</span
                                        >
                                    </div>
                                    <div class="grid grid-cols-2 gap-4">
                                        <BuildWeaponCard :weapon="charBuild.meleeWeapon" />
                                        <BuildWeaponCard :weapon="charBuild.rangedWeapon" />
                                    </div>
                                </div>
                            </div>

                            <!-- 属性展示 -->
                            <div class="space-y-6">
                                <!-- 角色属性 -->
                                <div>
                                    <h4 class="text-lg font-bold mb-3 flex items-center gap-2">
                                        <span>{{ $t("char-build.char_attributes") }}</span>
                                        <span class="text-sm text-base-content/50"
                                            >{{ $t("char-build.resonance_gain") }} {{ charSettings.resonanceGain * 100 }}%</span
                                        >
                                    </h4>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        <div
                                            class="col-span-2 bg-linear-to-br from-primary/10 to-primary/5 rounded-lg p-3 border border-primary/20 hover:border-primary/40 transition-colors"
                                        >
                                            <div class="text-xs text-base-content/60 mb-1">
                                                {{ charSettings.baseName }} -
                                                {{
                                                    charBuild.selectedSkill?.召唤物?.名称
                                                        ? `[${charBuild.selectedSkill?.召唤物?.名称}]`
                                                        : ""
                                                }}{{ charSettings.targetFunction }}
                                            </div>
                                            <div class="text-primary font-bold text-lg font-orbitron">
                                                {{ Math.round(totalDamage) }}
                                            </div>
                                        </div>
                                        <div
                                            class="bg-linear-to-br from-secondary/10 to-secondary/5 rounded-lg p-3 border border-secondary/20 hover:border-secondary/40 transition-colors"
                                            v-for="[key, val] in Object.entries(attributes).filter(
                                                ([k, v]) => !['召唤物攻击速度', '召唤物范围'].includes(k) && v,
                                            )"
                                            :key="key"
                                        >
                                            <div class="text-xs text-base-content/60 mb-1">
                                                {{ key === "攻击" ? $t(`${charBuild.char.属性}属性`) : "" }}{{ $t(key) }}
                                            </div>
                                            <div class="text-secondary font-bold text-lg font-orbitron">
                                                {{
                                                    ["攻击", "生命", "护盾", "防御", "神智", "有效生命"].includes(key)
                                                        ? `${+val.toFixed(key === "攻击" ? 2 : 0)}`
                                                        : `${+(val * 100).toFixed(2)}%`
                                                }}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 召唤物属性 -->
                                <div v-if="summonAttributes">
                                    <h4 class="text-lg font-bold mb-3">
                                        {{ summonAttributes.find((p) => p.名称 === "召唤物名称")?.格式 || "召唤物" }}
                                    </h4>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        <div
                                            class="bg-linear-to-br from-secondary/10 to-secondary/5 rounded-lg p-3 border border-secondary/20"
                                            v-for="prop in summonAttributes.filter((p) => p.值)"
                                            :key="prop.名称"
                                        >
                                            <div class="text-xs text-base-content/60 mb-1">{{ prop.名称 }}</div>
                                            <div class="text-secondary font-bold text-lg font-orbitron">
                                                {{ formatSkillProp(prop.名称, prop) }}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 武器属性 -->
                                <div v-if="charBuild.selectedWeapon && weaponAttrs">
                                    <h4 class="text-lg font-bold mb-3">{{ $t("char-build.weapon_attributes") }}</h4>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        <div
                                            class="bg-linear-to-br from-secondary/10 to-secondary/5 rounded-lg p-3 border border-secondary/20"
                                            v-for="[key, val] in Object.entries(weaponAttrs).filter(([_, v]) => v)"
                                            :key="key"
                                        >
                                            <div class="text-xs text-base-content/60 mb-1">
                                                {{ key === "攻击" ? charBuild.selectedWeapon.伤害类型 : "" }}{{ $t(key) }}
                                            </div>
                                            <div class="text-secondary font-bold text-lg font-orbitron">
                                                {{ ["攻击", "攻速", "多重"].includes(key) ? val : `${+(val * 100).toFixed(2)}%` }}
                                                {{
                                                    key === "多重" && (charBuild.selectedWeapon?.弹片数 || 1) > 1
                                                        ? ` * ${charBuild.selectedWeapon.弹片数! * val}`
                                                        : ""
                                                }}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- MOD展示 -->
                                <div v-if="charBuild.mods.length > 0">
                                    <h4 class="text-lg font-bold mb-3">MOD</h4>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                        <div
                                            class="flex items-center gap-2 px-3 py-2 rounded-lg bg-linear-to-r from-secondary/10 to-secondary/5 border border-secondary/30 text-sm"
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
                                            :key="mod.mod.名称"
                                        >
                                            <img class="w-8 h-8 object-cover rounded" :src="mod.mod.url" alt="" />
                                            <span class="font-medium"
                                                >{{ mod.count > 1 ? `${mod.count} x ` : "" }}{{ $t(mod.mod.名称) }}</span
                                            >
                                        </div>
                                    </div>
                                </div>

                                <!-- BUFF展示 -->
                                <div v-if="charBuild.buffs.length > 0">
                                    <h4 class="text-lg font-bold mb-3">BUFF</h4>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                        <span
                                            class="px-4 py-2 rounded-lg bg-linear-to-r from-secondary/10 to-secondary/5 border border-secondary/30 text-sm"
                                            v-for="buff in charBuild.buffs.map((v) => v.名称)"
                                            :key="buff"
                                        >
                                            {{ buff }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </div>
    </div>

    <!-- AI对话助手 -->
    <AIChatDialog
        v-if="setting.showAIChat"
        :charBuild="charBuild"
        @update:charSettings="charSettings = $event"
        @update:selectedChar="selectedChar = $event"
    />
</template>

<style>
.list-move,
.list-enter-active,
.list-leave-active {
    transition: all 0.5s ease;
}

.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateX(30px);
}

.list-leave-active {
    position: absolute;
}
</style>
