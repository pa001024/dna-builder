<script setup lang="ts">
import { type ITourStep, VTour } from "@globalhive/vuejs-tour"
import { useLocalStorage } from "@vueuse/core"
import { DNARoleCharsBean, DNARoleShowBean, DNAWeaponBean } from "dna-api"
import { useTranslation } from "i18next-vue"
import { cloneDeep, debounce, groupBy } from "lodash-es"
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { buildQuery, createBuildMutation } from "@/api/graphql"
import { env } from "@/env"
import { inlineActionsToTimeline } from "@/utils/inlineActionsToTimeline"
import { CharSettings, useCharSettings } from "../composables/useCharSettings"
import {
    buffData,
    buffMap,
    CharBuild,
    CharBuildTimeline,
    charData,
    charMap,
    LeveledBuff,
    LeveledChar,
    LeveledMod,
    LeveledWeapon,
    modData,
    monsterData,
    monsterMap,
    weaponData,
} from "../data"
import { waitForInitialLoad } from "../i18n"
import { useInvStore } from "../store/inv"
import { useSettingStore } from "../store/setting"
import { useTimeline } from "../store/timeline"
import { useTourStore } from "../store/tour"
import { useUIStore } from "../store/ui"
import { copyText } from "../util"

//#region 角色
const inv = useInvStore()
const setting = useSettingStore()
const ui = useUIStore()
const route = useRoute()
const tourStore = useTourStore()
const { t } = useTranslation()

// 路由
const selectedChar = computed(() => charMap.get(+route.params.charId)?.名称 || "")
const charSettings = useCharSettings(selectedChar)
const charProjectKey = computed(() => `project.${selectedChar.value}`)
const charProject = useLocalStorage(charProjectKey, {
    selected: "",
    projects: [] as { name: string; charSettings: typeof charSettings.value }[],
})

// 获取实际数据
const charOptions = charData.map(char => ({
    value: char.名称,
    label: char.名称,
    elm: char.属性,
    icon: LeveledChar.url(char.icon),
}))
const modOptions = modData
    .map(mod => ({
        value: mod.id,
        label: mod.名称,
        quality: mod.品质,
        type: mod.类型,
        limit: mod.属性 || mod.限定,
        ser: mod.系列,
        count: Math.min(inv.getModCount(mod.id, mod.品质), mod.系列 !== "契约者" ? 8 : 1),
        bufflv: inv.getBuffLv(mod.id),
        lv: inv.getModLv(mod.id, mod.品质),
    }))
    .filter(mod => mod.count)

    // 写入自定义BUFF
    ; (function writeCustomBuff() {
        const customBuff = useLocalStorage("customBuff", [] as [string, number][])
        const buffObj = {
            名称: "自定义BUFF",
            描述: "自行填写",
        } as any
        customBuff.value.forEach(prop => {
            buffObj[prop[0]] = prop[1]
        })
        buffMap.set("自定义BUFF", buffObj)
    })()
const _buffOptions = reactive(
    buffData.map(buff => ({
        value: new LeveledBuff(buff.名称),
        label: buff.名称,
        limit: buff.限定,
        description: buff.描述,
    }))
)
const buffOptions = computed(() =>
    _buffOptions
        .filter(buff => !buff.limit || buff.limit === selectedChar.value || buff.limit === charBuild.value.char.属性)
        .map(v => {
            const b = charSettings.value.buffs.find(b => b[0] === v.label)
            const lv = b?.[1] ?? v.value.等级
            return {
                value: new LeveledBuff(v.value._originalBuffData, lv),
                label: v.label,
                limit: v.limit,
                description: v.description,
                lv,
            }
        })
)
// 近战和远程武器选项
const meleeWeaponOptions = weaponData
    .filter(weapon => weapon.类型[0] === "近战")
    .map(weapon => ({
        value: weapon.名称,
        label: weapon.名称,
        type: weapon.类型[1],
        icon: LeveledWeapon.url(weapon.icon),
    }))
const rangedWeaponOptions = weaponData
    .filter(weapon => weapon.类型[0] === "远程")
    .map(weapon => ({
        value: weapon.名称,
        label: weapon.名称,
        type: weapon.类型[1],
        icon: LeveledWeapon.url(weapon.icon),
    }))

// 状态变量
const selectedCharMods = computed(() => charSettings.value.charMods.map(v => (v ? LeveledMod.from(v[0], v[1], inv.getBuffLv(v[0])) : null)))
const selectedMeleeMods = computed(() =>
    charSettings.value.meleeMods.map(v => (v ? LeveledMod.from(v[0], v[1], inv.getBuffLv(v[0])) : null))
)
const selectedRangedMods = computed(() =>
    charSettings.value.rangedMods.map(v => (v ? LeveledMod.from(v[0], v[1], inv.getBuffLv(v[0])) : null))
)
const selectedSkillWeaponMods = computed(() =>
    charSettings.value.skillWeaponMods.map(v => (v ? LeveledMod.from(v[0], v[1], inv.getBuffLv(v[0])) : null))
)
const selectedBuffs = computed(() =>
    charSettings.value.buffs
        .map(v => {
            try {
                const b = new LeveledBuff(v[0], v[1])
                return b
            } catch (error) {
                console.error(error)
                charSettings.value.buffs = charSettings.value.buffs.filter(b => b[0] !== v[0])
                return null
            }
        })
        .filter(b => b !== null)
)

const team1Options = computed(() =>
    [{ value: "-", label: "无", elm: "", icon: `/imgs/1.png` }].concat(
        charOptions.filter(char => char.label !== selectedChar.value && char.label !== charSettings.value.team2)
    )
)
const team2Options = computed(() =>
    [{ value: "-", label: "无", elm: "", icon: `/imgs/1.png` }].concat(
        charOptions.filter(char => char.label !== selectedChar.value && char.label !== charSettings.value.team1)
    )
)

const teamWeaponOptions = computed(() =>
    [{ value: "-", label: "无", type: "", icon: `/imgs/1.png` }].concat(meleeWeaponOptions.concat(rangedWeaponOptions))
)

const getInlineActions = () => {
    const raw = inlineActionsToTimeline(charSettings.value.actions, selectedChar.value)
    return CharBuildTimeline.fromRaw(raw)
}

// 创建CharBuild实例
const charBuild = computed(() => {
    try {
        const char = new LeveledChar(selectedChar.value, charSettings.value.charLevel)
        const melee = new LeveledWeapon(
            charSettings.value.meleeWeapon,
            charSettings.value.meleeWeaponRefine,
            charSettings.value.meleeWeaponLevel,
            inv.getWBuffLv(charSettings.value.meleeWeapon, char.属性)
        )
        const ranged = new LeveledWeapon(
            charSettings.value.rangedWeapon,
            charSettings.value.rangedWeaponRefine,
            charSettings.value.rangedWeaponLevel,
            inv.getWBuffLv(charSettings.value.rangedWeapon, char.属性)
        )
        const b = new CharBuild({
            char,
            auraMod: new LeveledMod(charSettings.value.auraMod),
            charMods: selectedCharMods.value,
            meleeMods: selectedMeleeMods.value,
            rangedMods: selectedRangedMods.value,
            skillMods: selectedSkillWeaponMods.value,
            skillLevel: charSettings.value.charSkillLevel,
            buffs: selectedBuffs.value,
            melee,
            ranged,
            baseName: charSettings.value.baseName,
            imbalance: charSettings.value.imbalance,
            hpPercent: charSettings.value.hpPercent,
            resonanceGain: charSettings.value.resonanceGain,
            enemyId: charSettings.value.enemyId,
            enemyLevel: charSettings.value.enemyLevel,
            enemyResistance: charSettings.value.enemyResistance,
            targetFunction: charSettings.value.targetFunction,
            timeline: charSettings.value.actions.enable ? getInlineActions() : getTimelineByName(charSettings.value.baseName),
        })
        return b
    } catch {
        localStorage.removeItem(`build.${selectedChar.value}`)
        location.reload()
        return {} as CharBuild
    }
})

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
    const index = charSettings.value.buffs.findIndex(v => v[0] === buff.名称)
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
    const index = charSettings.value.buffs.findIndex(v => v[0] === buff.名称)
    if (index > -1) {
        charSettings.value.buffs[index][1] = lv
        teamBuffLvs.value[buff.名称] = lv
    }
    updateCharBuild()
}

const editingProjectIndex = ref(-1)
const editProjectName = ref("")

/**
 * 根据索引加载本地构筑方案
 * @param index 方案在列表中的索引
 * @returns void
 */
const loadConfigByIndex = (index: number) => {
    const project = charProject.value.projects[index]
    if (!project) {
        return
    }
    charProject.value.selected = project.name
    charSettings.value = cloneDeep(project.charSettings)
    targetFunction.value = charSettings.value.targetFunction
    updateCharBuild()
}

/**
 * 保存当前构筑到指定方案
 * @param index 方案在列表中的索引
 * @returns void
 */
const saveConfig = (index: number) => {
    const project = charProject.value.projects[index]
    if (!project) {
        return
    }
    project.charSettings = cloneDeep(charSettings.value)
    charProject.value.selected = project.name
    ui.showSuccessMessage("已保存当前项目")
}

/**
 * 新建方案并保存当前构筑
 * @returns void
 */
const addProject = () => {
    const defaultName = `${selectedChar.value}${(~~(Math.random() * 1e6)).toString(36)}`
    const inputName = prompt(t("char-build.please_enter_config_name"), defaultName)?.trim()
    if (!inputName) {
        return
    }
    const existingIndex = charProject.value.projects.findIndex(project => project.name === inputName)
    if (existingIndex !== -1) {
        charProject.value.projects[existingIndex].charSettings = cloneDeep(charSettings.value)
        charProject.value.selected = inputName
        ui.showSuccessMessage("已覆盖同名项目")
        return
    }
    charProject.value.projects.push({
        name: inputName,
        charSettings: cloneDeep(charSettings.value),
    })
    charProject.value.selected = inputName
}

/**
 * 开始编辑方案名称
 * @param index 方案在列表中的索引
 * @returns void
 */
const renameProject = (index: number) => {
    const project = charProject.value.projects[index]
    if (!project) {
        return
    }
    editProjectName.value = project.name
    editingProjectIndex.value = index
    nextTick(() => {
        const element = document.getElementById(`char-project-name-input-${index}`) as HTMLInputElement | null
        element?.focus()
    })
}

/**
 * 完成方案重命名并校验重名
 * @returns void
 */
const finishEditProjectName = () => {
    if (editingProjectIndex.value === -1) {
        return
    }
    const newName = editProjectName.value.trim()
    if (!newName) {
        ui.showErrorMessage("项目名称不能为空")
        return
    }
    const duplicate = charProject.value.projects.some((project, index) => index !== editingProjectIndex.value && project.name === newName)
    if (duplicate) {
        ui.showErrorMessage("项目名称已存在")
        return
    }
    const previousName = charProject.value.projects[editingProjectIndex.value].name
    charProject.value.projects[editingProjectIndex.value].name = newName
    if (charProject.value.selected === previousName) {
        charProject.value.selected = newName
    }
    editingProjectIndex.value = -1
}

/**
 * 删除指定方案
 * @param index 方案在列表中的索引
 * @returns Promise<void>
 */
const deleteProject = async (index: number) => {
    const project = charProject.value.projects[index]
    if (!project) {
        return
    }
    if (!(await ui.showDialog("删除确认", `确定要删除项目 ${project.name} 吗？`))) {
        return
    }
    charProject.value.projects.splice(index, 1)
    if (charProject.value.selected === project.name) {
        charProject.value.selected = ""
    }
}

// 从数据库加载分享的构筑
const loadSharedBuild = async (buildId: string) => {
    try {
        const build = await buildQuery({ id: buildId })
        if (build && build.charSettings) {
            const loadedSettings = JSON.parse(build.charSettings)
            // 将加载的设置应用到当前构筑
            applyLoadedSettings(loadedSettings)
        }
    } catch (error) {
        ui.showErrorMessage("加载构筑失败:", error instanceof Error ? error.message : "未知错误")
    }
}

const applyLoadedSettings = (loadedSettings: CharSettings) => {
    Object.assign(charSettings.value, loadedSettings)
    targetFunction.value = charSettings.value.targetFunction
    ui.showSuccessMessage("已加载分享的构筑")
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

const reloadCustomBuff = () => {
    const index = _buffOptions.findIndex(buff => buff.label === "自定义BUFF")
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
    charSettings.value.meleeWeapon = newBuild.meleeWeapon.id
    charSettings.value.meleeWeaponLevel = newBuild.meleeWeapon.等级
    charSettings.value.meleeWeaponRefine = newBuild.meleeWeapon.精炼
    charSettings.value.rangedWeapon = newBuild.rangedWeapon.id
    charSettings.value.rangedWeaponLevel = newBuild.rangedWeapon.等级
    charSettings.value.rangedWeaponRefine = newBuild.rangedWeapon.精炼
    charSettings.value.charMods = pad(
        newBuild.charMods.filter(v => v !== null).map(v => [v.id, v.等级]),
        8,
        null
    )
    charSettings.value.meleeMods = pad(
        newBuild.meleeMods.filter(v => v !== null).map(v => [v.id, v.等级]),
        8,
        null
    )
    charSettings.value.rangedMods = pad(
        newBuild.rangedMods.filter(v => v !== null).map(v => [v.id, v.等级]),
        8,
        null
    )
    charSettings.value.skillWeaponMods = pad(
        newBuild.skillMods.filter(v => v !== null).map(v => [v.id, v.等级]),
        4,
        null
    )
    function pad<T>(arr: T[], length: number, value: T) {
        while (arr.length < length) {
            arr.push(value)
        }
        return arr
    }
}
//#endregion
//#region 配装分享弹窗
const share_model_show = ref(false)
const share_title = ref(``)
const share_desc = ref(``)
const buildShow = ref()

function openShareModal() {
    share_title.value = `${selectedChar.value}构筑`
    share_desc.value = ``
    share_model_show.value = true
}

async function confirmShare() {
    share_model_show.value = false
    await shareCharBuild(share_title.value, share_desc.value)
    buildShow.value.fetchBuilds()
}
//#endregion
//#region 时间线
const timelines = useTimeline(selectedChar)
function getTimelineByName(name: string) {
    const raw = timelines.value.find(v => v.name === name)
    if (!raw) return undefined
    return CharBuildTimeline.fromRaw(raw)
}
const isTimeline = ref(timelines.value.find(v => v.name === charSettings.value.baseName) !== undefined)

const pselectedChar = useLocalStorage("selectedChar", "赛琪")

onMounted(async () => {
    pselectedChar.value = selectedChar.value
    if (route.params.buildId && typeof route.params.buildId === "string") await loadSharedBuild(route.params.buildId)
})
//#endregion

// 更新CharBuild实例
function updateCharBuild() {
    if (!monsterMap.has(charSettings.value.enemyId)) {
        charSettings.value.enemyId = 130
    }
    if (!charSettings.value.baseName) {
        charSettings.value.baseName = charBuild.value.char.技能[0].名称
    }
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

// 计算属性
const attributes = computed(() => charBuild.value.calculateAttributes())

//#region Tour
const tour = ref<typeof VTour>()

// 定义按钮标签（使用 computed 支持 i18n 动态翻译）
const buttonLabels = computed(() => ({
    next: t("tour.next"),
    back: t("tour.back"),
    done: t("tour.done"),
    skip: t("tour.skip"),
}))

// 定义 tour 步骤（使用 computed 支持 i18n 动态翻译）
const steps = computed<ITourStep[]>(() => [
    {
        target: "[data-tour='char-tabs']",
        content: t("tour.char_tabs"),
        placement: "right",
    },
    {
        target: "[data-tour='weapon-select']",
        content: t("tour.weapon_select"),
        placement: "right",
    },
    {
        target: "[data-tour='skill-select']",
        content: t("tour.skill_select"),
        placement: "right",
    },
    {
        target: "[data-tour='target-function']",
        content: t("tour.target_function"),
        placement: "right",
    },
    {
        target: "[data-tour='damage-result']",
        content: t("tour.damage_result"),
        placement: "right",
    },
    {
        target: "[data-tour='char-mods']", // 4
        content: t("tour.char_mods"),
        placement: "right",
    },
    {
        target: "[data-tour='top-actions']",
        content: t("tour.top_actions"),
        placement: "bottom",
    },
    {
        target: "[data-tour='tour-button']",
        content: t("tour.finish"),
        placement: "bottom",
    },
])

// 处理 tour 步骤变化
function handleTourStep(index: number) {
    const step = steps.value[index]
    const target = document.querySelector(step.target)
    if (!target) return
    const elementRect = target.getBoundingClientRect()
    if (index === 0) {
        charTab.value = "近战"
    }
    const scrollArea = document.querySelector(
        index >= 5 ? "#char-build-scroll2 [data-radix-scroll-area-viewport]" : "#char-build-scroll1 [data-radix-scroll-area-viewport]"
    )
    if (!scrollArea) return
    const viewportHeight = scrollArea.clientHeight
    const viewportWidth = scrollArea.clientWidth

    // 计算滚动目标位置（垂直居中 + 可选偏移，水平同理）
    const scrollTop = scrollArea.scrollTop + elementRect.top - viewportHeight / 2 + elementRect.height / 2
    const scrollLeft = scrollArea.scrollLeft + elementRect.left - viewportWidth / 2 + elementRect.width / 2

    scrollArea.scrollTo({
        top: scrollTop,
        left: scrollLeft,
        behavior: "smooth",
    })
}

//#endregion

const teamBuffLvs = useLocalStorage("teamBuffLvs", {} as Record<string, number>)

function updateTeamBuff(newValue: string, oldValue: string) {
    const newBuffs = [...charSettings.value.buffs.filter(v => !v[0].includes(oldValue))]
    if (newValue !== "-") {
        const teamBuffs = buffOptions.value.filter(v => v.label.includes(newValue))
        if (teamBuffs.length > 0) {
            const buffs = teamBuffs
                .map(v => [v.label, teamBuffLvs.value[v.label] || v.value.等级] as [string, number])
                .filter(v => v[1] > 0)
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

onMounted(async () => {
    window.setMod = (key: "charMods" | "meleeMods" | "rangedMods" | "skillWeaponMods", index: number, modId: number, level: number) => {
        if (index < 0 || index >= charSettings.value[key].length) return
        if (modId < 0) charSettings.value[key][index] = null
        else charSettings.value[key][index] = [modId, level]
    }
    window.setBuff = (buffId: string, level?: number) => {
        const buff = buffOptions.value.find(v => v.label === buffId)
        if (!buff) return
        if (level === undefined) level = buff.value.等级
        const index = charSettings.value.buffs.findIndex(v => v[0] === buffId)
        if (index === -1) {
            if (level > 0) charSettings.value.buffs.push([buffId, level])
        } else {
            if (level > 0) charSettings.value.buffs[index] = [buffId, level]
            else charSettings.value.buffs.splice(index, 1)
        }
    }
    await waitForInitialLoad()
    ui.title = t("char-build.title1", { charName: t(selectedChar.value) })

    // Tour 启动逻辑：检查是否已完成
    const tourKey = `char-build`
    if (!tourStore.isTourCompleted(tourKey)) {
        // 延迟 1 秒后启动，等待组件完全渲染
        setTimeout(() => {
            tour.value?.startTour()
        }, 1000)
    }
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
    actions: false,
    share: false,
})

function toggleSection(section: keyof typeof collapsedSections.value) {
    collapsedSections.value[section] = !collapsedSections.value[section]
}

const charTab = ref(charBuild.value.selectedSkillType)

function addSkill(skillName: string) {
    targetFunction.value += skillName.replace(/\//g, "_")
}

const targetFunction = ref(charSettings.value.targetFunction)
watch(
    targetFunction,
    debounce(newValue => {
        const error = charBuild.value.validateAST(newValue)
        if (error) {
            return
        }
        charSettings.value.targetFunction = newValue
    }, 500)
)
const charDetailExpend = ref(true)
const weapon_select_model_show = ref(false)
const weaponDefaultTab = ref("近战")
const newWeaponSelection = ref({ melee: 0, ranged: 0 })
function handleWeaponSelection(melee: number, ranged: number) {
    newWeaponSelection.value = { melee, ranged }
    charSettings.value.meleeWeapon = newWeaponSelection.value.melee
    charSettings.value.rangedWeapon = newWeaponSelection.value.ranged
    weapon_select_model_show.value = false
}
function applyWeaponSelection() {
    charSettings.value.meleeWeapon = newWeaponSelection.value.melee
    charSettings.value.rangedWeapon = newWeaponSelection.value.ranged
    weapon_select_model_show.value = false
}

const ast_help_model_show = ref(false)

async function shareCharBuild(title: string, desc: string = "") {
    try {
        const settingsString = JSON.stringify(charSettings.value)
        const result = await createBuildMutation({
            input: {
                title,
                desc,
                charId: parseInt(route.params.charId as string),
                charSettings: settingsString,
            },
        })

        if (result) {
            const shareUrl = `${env.endpoint}/char/${route.params.charId}/${result.id}`
            await copyText(shareUrl)
            ui.showSuccessMessage("分享链接已复制")
        }
    } catch (error) {
        ui.showErrorMessage("分享失败:", error instanceof Error ? error.message : "未知错误")
    }
}
; (globalThis as any).__chapterCounter = 1

let roleCache: DNARoleShowBean | null = null
async function syncModFromGame(id: number, isWeapon: boolean, isConWeapon: boolean = false) {
    const dna = await setting.getDNAAPI()
    if (!dna) {
        ui.showErrorMessage("请先登录")
        return
    }
    if (!roleCache) {
        await setting.startHeartbeat()
        try {
            const res = await dna.defaultRoleForTool()
            if (!res.success || !res.data?.roleInfo.roleShow.roleChars) {
                ui.showErrorMessage("获取角色信息失败")
                return
            }
            roleCache = res.data.roleInfo.roleShow
        } finally {
            await setting.stopHeartbeat()
        }
    }
    const chars = (roleCache.roleChars || []).reduce(
        (prev, cur) => {
            prev[+cur.charId] = cur
            return prev
        },
        {} as Record<number, DNARoleCharsBean>
    )
    const weapons = [...(roleCache.closeWeapons || []), ...(roleCache.langRangeWeapons || [])].reduce(
        (prev, cur) => {
            prev[+cur.weaponId] = cur
            return prev
        },
        {} as Record<number, DNAWeaponBean>
    )

    if (isWeapon || isConWeapon) {
        if (!weapons[id]) {
            ui.showErrorMessage("不可用的武器")
            return
        }
        const weapon = await dna.getWeaponDetail(id, weapons[id].weaponEid)
        const lw = new LeveledWeapon(id)
        if (!weapon.success || !weapon.data) {
            ui.showErrorMessage("获取武器信息失败")
            return
        }
        const mods = weapon.data.weaponDetail.modes.map(m => {
            try {
                const mod = new LeveledMod(+m.id, inv.getModLv(+m.id))
                return [+m.id, mod.等级] as [number, number]
            } catch {
                return null
            }
        })
        switch (lw.类型) {
            case "近战":
                charSettings.value.meleeMods = mods
                break
            case "远程":
                charSettings.value.rangedMods = mods
                break
        }
    } else {
        if (!chars[id]) {
            ui.showErrorMessage("不可用的角色")
            return
        }
        const char = await dna.getRoleDetail(id, chars[id].charEid)
        if (!char.success || !char.data) {
            ui.showErrorMessage("获取角色信息失败")
            return
        }
        charSettings.value.charMods = char.data.charDetail.modes
            .map(m => {
                try {
                    const mod = new LeveledMod(+m.id, m.level)
                    return [+m.id, mod.等级] as [number, number]
                } catch {
                    return null
                }
            })
            .slice(0, 8)
        const modes = char.data.charDetail.modes
        if (modes.length > 8 && modes[8]?.id) {
            charSettings.value.auraMod = +modes[8].id
        }
    }
    localStorage.setItem(`build.${selectedChar.value}`, JSON.stringify(charSettings.value))
    ui.showSuccessMessage("同步成功")
}
</script>

<template>
    <!-- Tour 组件 -->
    <VTour ref="tour" :steps="steps" :button-labels="buttonLabels" backdrop highlight no-scroll
        @on-tour-step="handleTourStep" @on-tour-end="tourStore.markTourCompleted('char-build')" />

    <dialog class="modal" :class="{ 'modal-open': simulator_model_show }">
        <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
            <GameSimulator v-if="simulator_model_show" :char-build="charBuild" />
        </div>
        <div class="modal-backdrop" @click="simulator_model_show = false" />
    </dialog>
    <dialog class="modal" :class="{ 'modal-open': autobuild_model_show }">
        <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
            <AutoBuild :update="autobuild_model_show" :char-build="charBuild" @change="newBuild = $event" />
            <div class="modal-action">
                <form class="flex justify-end gap-2" method="dialog">
                    <button class="btn btn-primary" @click="applyAutobuild">
                        {{ $t("应用") }}
                    </button>
                    <button class="btn" @click="autobuild_model_show = false">
                        {{ $t("取消") }}
                    </button>
                </form>
            </div>
        </div>
        <div class="modal-backdrop" @click="autobuild_model_show = false" />
    </dialog>
    <dialog class="modal" :class="{ 'modal-open': ast_help_model_show }">
        <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
            <ASTHelp v-if="ast_help_model_show" v-model="ast_help_model_show" :char-build="charBuild"
                :skill="charBuild.selectedSkill" @select="targetFunction = $event" />
        </div>
        <div class="modal-backdrop" @click="ast_help_model_show = false" />
    </dialog>
    <dialog class="modal" :class="{ 'modal-open': weapon_select_model_show }">
        <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
            <WeaponListView v-if="weapon_select_model_show" :char-build="charBuild" :default-tab="weaponDefaultTab"
                :melee="charSettings.meleeWeapon" :ranged="charSettings.rangedWeapon" @change="handleWeaponSelection" />
            <div class="modal-action">
                <form class="flex justify-end gap-2" method="dialog">
                    <button class="btn btn-primary" @click="applyWeaponSelection">
                        {{ $t("应用") }}
                    </button>
                    <button class="btn" @click="weapon_select_model_show = false">
                        {{ $t("取消") }}
                    </button>
                </form>
            </div>
        </div>
        <div class="modal-backdrop" @click="weapon_select_model_show = false" />
    </dialog>

    <!-- 配装分享弹窗 -->
    <DialogModel v-model="share_model_show" @submit="confirmShare" class="bg-base-300">
        <div class="space-y-4">
            <h3 class="text-xl font-bold">{{ $t("char-build.share_build") }}</h3>
            <div>
                <label class="label" for="share-title">
                    <span class="label-text">{{ $t("char-build.title") }}</span>
                </label>
                <input id="share-title" v-model="share_title" type="text" class="input input-bordered w-full"
                    :placeholder="$t('char-build.enter_title')" maxlength="50" />
            </div>
            <div>
                <label class="label" for="share-desc">
                    <span class="label-text">{{ $t("char-build.description") }}</span>
                </label>
                <textarea id="share-desc" v-model="share_desc" class="textarea textarea-bordered w-full"
                    :placeholder="$t('char-build.enter_description')" rows="3" maxlength="200"></textarea>
            </div>
        </div>
    </DialogModel>
    <div class="h-full flex flex-col relative">
        <!-- 背景图 -->
        <div class="inset-0 absolute opacity-50" :style="{
            backgroundImage: `url(${charBuild.char.bg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        }" />
        <!-- 顶部操作栏 -->
        <div data-tour="top-actions"
            class="sticky top-0 z-1 bg-base-300/50 backdrop-blur-sm rounded-md p-2 sm:p-3 m-1 sm:m-2 shadow-lg border border-base-200">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-2">
                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
                    <button class="btn btn-sm btn-ghost flex-1 sm:flex-none" data-tour="tour-button"
                        @click="tour?.startTour()">
                        <Icon icon="ri:question-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("char-build.tour") }}</span>
                    </button>
                    <button class="btn btn-sm btn-ghost flex-1 sm:flex-none" @click="openShareModal">
                        <Icon icon="ri:share-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("char-build.share") }}</span>
                    </button>
                    <button v-if="['黎瑟', '赛琪'].includes(selectedChar)" class="btn btn-sm btn-ghost flex-1 sm:flex-none"
                        @click="simulator_model_show = true">
                        <Icon icon="ri:game-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("char-build.simulator") }}</span>
                    </button>
                    <button class="btn btn-sm btn-secondary flex-1 sm:flex-none" @click="autobuild_model_show = true">
                        <Icon icon="ri:robot-2-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("char-build.auto_build") }}</span>
                    </button>
                    <button class="btn btn-sm btn-success flex-1 sm:flex-none"
                        @click="$router.push('/char-build-compare')">
                        <Icon icon="ri:bar-chart-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("build-compare.title") }}</span>
                    </button>
                    <div class="dropdown dropdown-end w-full sm:w-auto">
                        <div tabindex="0" role="button"
                            class="btn btn-sm btn-primary w-full sm:w-auto flex-1 sm:flex-none">
                            <Icon icon="ri:save-fill" class="w-4 h-4" />
                            <span class="hidden sm:inline">{{ $t("char-build.save_project") }}</span>
                            <span class="sm:hidden">{{ $t("char-build.save") }}</span>
                        </div>
                        <div tabindex="0"
                            class="card card-sm dropdown-content bg-base-100 rounded-box z-1 w-80 shadow-sm">
                            <div class="card-body space-y-2">
                                <h2 class="card-title">{{ $t("char-build.save_project") }}</h2>
                                <ul v-if="charProject.projects.length > 0">
                                    <li v-for="(project, index) in charProject.projects" :key="project.name"
                                        class="p-2 flex items-center gap-2 rounded-md"
                                        :class="{ 'bg-base-300': project.name === charProject.selected }">
                                        <input v-if="editingProjectIndex === index"
                                            :id="`char-project-name-input-${index}`" v-model="editProjectName"
                                            class="bg-base-200 px-2 py-0.5 text-sm w-24 sm:w-36"
                                            @blur="finishEditProjectName" @keyup.enter="finishEditProjectName"
                                            @keyup.escape="editingProjectIndex = -1" />
                                        <span v-else class="font-medium text-sm link link-primary link-hover"
                                            title="点击加载" @click="loadConfigByIndex(index)">
                                            {{ project.name }}
                                        </span>
                                        <div class="ml-auto btn btn-xs btn-ghost btn-square border-0" title="重命名"
                                            @click="renameProject(index)">
                                            <Icon icon="ri:pencil-fill" class="h-4 w-4" />
                                        </div>
                                        <div class="btn btn-xs btn-ghost btn-square border-0" title="保存"
                                            @click="saveConfig(index)">
                                            <Icon icon="ri:save-fill" class="h-4 w-4" />
                                        </div>
                                        <div class="btn btn-xs btn-ghost btn-square border-0" title="删除"
                                            @click="deleteProject(index)">
                                            <Icon icon="ri:delete-bin-2-fill" class="h-4 w-4" />
                                        </div>
                                    </li>
                                </ul>
                                <div v-else class="text-sm opacity-70">
                                    暂无已保存项目
                                </div>
                                <div class="btn btn-primary" @click="addProject()">新建项目</div>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-ghost flex-1 sm:flex-none" @click="resetConfig">
                        <Icon icon="ri:refresh-line" class="w-4 h-4" />
                        <span class="hidden sm:inline">{{ $t("char-build.reset_config") }}</span>
                    </button>
                </div>
            </div>
        </div>
        <div class="flex-1 flex flex-col sm:flex-row overflow-y-auto sm:overflow-hidden">
            <!-- 侧边栏 -->
            <ScrollArea id="char-build-scroll1" class="sm:w-92 flex-none flex flex-col gap-2 p-2">
                <div class="flex flex-col gap-4">
                    <div data-tour="char-tabs" class="flex m-auto gap-2 overflow-x-auto pb-2">
                        <div v-for="(tab, index) in [
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
                        ]" :key="index" class="flex items-center gap-2 shrink-0">
                            <div class="flex-none cursor-pointer size-10 sm:size-12 relative rounded-full overflow-hidden border-2 border-base-100 aspect-square"
                                :class="{ 'border-primary! shadow-lg shadow-primary/40': charTab === tab.name }"
                                @click="charTab = tab.name">
                                <ImageFallback :src="tab.url" alt="角色头像" class="w-full h-full object-cover object-top">
                                    <Icon icon="kezhou" class="w-full h-full" />
                                </ImageFallback>
                                <div
                                    class="absolute inset-0 bg-linear-to-t from-yellow-500/20 via-transparent to-transparent" />
                            </div>
                        </div>
                    </div>
                    <!-- 角色 -->
                    <div v-if="charTab === '角色'"
                        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-md p-3 space-y-3 border border-base-200">
                        <h3 class="flex items-center gap-4 text-lg font-bold text-base-content/90 mb-2 p-1">
                            <div class="flex flex-col">
                                <div class="text-lg font-bold">
                                    {{ $t(selectedChar) }}
                                </div>
                                <div class="text-sm opacity-60">
                                    {{ $t(charBuild.char.别名 || "") }}
                                </div>
                            </div>
                            <div class="ml-auto flex">Lv. {{ charSettings.charLevel }}</div>
                        </h3>
                        <div class="flex items-center gap-2 text-sm p-1">
                            <div class="flex-1">
                                <input v-model.number="charSettings.charLevel" type="range"
                                    class="range range-primary range-xs w-full" min="1" max="80" step="1" />
                            </div>
                        </div>
                        <!-- 词条 -->
                        <div class="collapse p-1" :class="{ 'collapse-open': charDetailExpend }">
                            <div class="space-y-1 collapse-content p-0">
                                <CharAttrShow :attributes="attributes" :char-build="charBuild" @add-skill="addSkill" />
                            </div>
                        </div>
                        <div class="flex justify-center items-center cursor-pointer p-2 hover:bg-base-100/60 transition-all duration-200"
                            @click="charDetailExpend = !charDetailExpend">
                            <Icon icon="radix-icons:chevron-down" :class="{ 'rotate-180': charDetailExpend }" />
                        </div>
                        <!-- 技能选择 -->
                        <div data-tour="skill-select">
                            <SkillTabs :skills="charBuild.charSkills" :selected-skill-name="charSettings.baseName"
                                @select="charSettings.baseName = $event" />
                        </div>
                        <div class="flex items-center gap-4 text-sm p-1">
                            <div class="flex-1">
                                <input v-model.number="charSettings.charSkillLevel" type="range"
                                    class="range range-primary range-xs w-full" min="1" max="12" step="1" />
                            </div>
                            <div class="flex-none">Lv. {{ charSettings.charSkillLevel }}</div>
                        </div>
                        <SkillFields :skill="charBuild.selectedSkill"
                            :selected-identifiers="charBuild.getIdentifierNames(charBuild.targetFunction)"
                            :char-build="charBuild" :attributes="attributes" @add-skill="addSkill($event)" />
                    </div>

                    <!-- 武器 -->
                    <WeaponTab v-if="charTab === '近战'" v-model:model-show="weapon_select_model_show"
                        @open-weapon-select="weaponDefaultTab = '近战'" wkey="melee" :char-build="charBuild"
                        :attributes="attributes" @add-skill="addSkill($event)" />
                    <WeaponTab v-if="charTab === '远程'" v-model:model-show="weapon_select_model_show"
                        @open-weapon-select="weaponDefaultTab = '远程'" wkey="ranged" :char-build="charBuild"
                        :attributes="attributes" @add-skill="addSkill($event)" />
                    <WeaponTab v-if="charTab === '同律'" wkey="skill" :char-build="charBuild" :attributes="attributes"
                        @add-skill="addSkill($event)" />

                    <!-- 目标函数 -->
                    <div data-tour="target-function"
                        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-md p-4 space-y-3 border border-base-200">
                        <div class="space-y-2 p-1">
                            <div class="text-sm flex justify-between">
                                <div class="flex items-center gap-2">
                                    {{ isTimeline ? "时间线" : "表达式" }}
                                    <div class="btn btn-xs text-lg btn-ghost btn-circle"
                                        @click="ast_help_model_show = true">
                                        <Icon icon="ri:question-line" />
                                    </div>
                                </div>
                                <input v-model="isTimeline" type="checkbox" class="toggle toggle-secondary" />
                            </div>
                            <label v-if="!isTimeline" class="input input-sm input-primary text-sm flex justify-between">
                                <input v-model="targetFunction" type="text" placeholder="伤害" class="grow" />
                                <div v-if="targetFunction" class="flex items-center cursor-pointer hover:text-primary"
                                    @click="targetFunction = ''">
                                    <Icon icon="codicon:chrome-close" />
                                </div>
                            </label>
                            <!-- 时间线 -->
                            <template v-else>
                                <Select :value="charSettings.baseName" class="input input-sm input-primary w-full"
                                    placeholder="选择时间线" @change="charSettings.baseName = $event">
                                    <SelectItem v-for="timeline in timelines" :key="timeline.name"
                                        :value="timeline.name">
                                        {{ timeline.name }}
                                    </SelectItem>
                                </Select>
                                <div class="flex justify-between items-center gap-8">
                                    <button class="btn grow btn-sm btn-primary" @click="$router.push('/timeline')">
                                        <Icon icon="ri:add-line" />
                                        新建
                                    </button>
                                    <label class="label cursor-pointer">
                                        <span class="text-sm text-base-content/80">DPS</span>
                                        <input v-model="charSettings.timelineDPS" type="checkbox"
                                            class="toggle toggle-secondary" />
                                    </label>
                                </div>
                            </template>
                            <!-- 错误信息 -->
                            <div v-if="charBuild.validateAST(targetFunction)"
                                class="flex text-xs items-center text-red-500">
                                {{ charBuild.validateAST(targetFunction) }}
                            </div>
                            <div v-else data-tour="damage-result" class="flex justify-between items-center p-1">
                                <div class="text-sm text-base-content/80">{{ charSettings.baseName }}</div>
                                <div class="text-primary font-bold text-md font-orbitron">
                                    {{ charBuild.calculate() }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollArea>
            <!-- 正文 -->
            <ScrollArea id="char-build-scroll2" class="sm:flex-1 flex-none">
                <div class="p-2 space-y-4">
                    <!-- 配装分享 -->
                    <CollapsibleSection :title="$t('char-build.share_build')" :is-open="!collapsedSections.share"
                        @toggle="toggleSection('share')">
                        <DOBBuildShow :charId="charBuild.char.id" :charName="charBuild.char.名称" ref="buildShow"
                            @use-build="applyLoadedSettings" />
                    </CollapsibleSection>
                    <!-- 角色详情 -->
                    <CollapsibleSection :title="$t('dna-role-detail.title')" :is-open="!collapsedSections.detail"
                        @toggle="toggleSection('detail')">
                        <CharIntronShow :char="charBuild.char" />
                        <CharSkillShow :char="charBuild.char" />
                    </CollapsibleSection>
                    <!-- 基本设置卡片 -->
                    <CollapsibleSection :title="$t('char-build.basic_settings')" :is-open="!collapsedSections.basic"
                        @toggle="toggleSection('basic')">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                            <!-- 其他设置 -->
                            <div class="space-y-3">
                                <div class="flex gap-2">
                                    <div class="flex-1">
                                        <div class="px-2 text-xs text-gray-400 mb-1">
                                            {{ $t("char-build.hp_percent") }}
                                        </div>
                                        <Select v-model="charSettings.hpPercent"
                                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                            @change="updateCharBuild">
                                            <SelectItem
                                                v-for="hp in [1, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 5)]"
                                                :key="hp" :value="hp / 100">
                                                {{ hp }}%
                                            </SelectItem>
                                        </Select>
                                    </div>
                                    <div class="flex-1">
                                        <div class="px-2 text-xs text-gray-400 mb-1">
                                            {{ $t("char-build.resonance_gain") }}
                                        </div>
                                        <Select v-model="charSettings.resonanceGain"
                                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                            @change="updateCharBuild">
                                            <SelectItem v-for="rg in [0, 0.5, 1, 1.5, 2, 2.5, 3]" :key="rg" :value="rg">
                                                {{ rg * 100 }}%
                                            </SelectItem>
                                        </Select>
                                    </div>
                                    <div class="flex-1">
                                        <div class="px-2 text-xs text-gray-400 mb-1">
                                            {{ $t("失衡") }}
                                        </div>
                                        <div class="p-0.5">
                                            <input v-model="charSettings.imbalance" type="checkbox"
                                                class="toggle toggle-secondary" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <!-- 敌人设置 -->
                            <div class="space-y-3">
                                <div class="flex gap-2">
                                    <div class="flex-1">
                                        <div class="px-2 text-xs text-gray-400 mb-1">
                                            {{ $t("char-build.enemy") }}
                                        </div>
                                        <Select v-model="charSettings.enemyId"
                                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                            @change="updateCharBuild">
                                            <SelectItem v-for="enemy in monsterData" :key="enemy.id" :value="enemy.id">
                                                {{ $t(enemy.n) }}
                                            </SelectItem>
                                        </Select>
                                    </div>
                                    <div class="flex-1">
                                        <div class="px-2 text-xs text-gray-400 mb-1">
                                            {{ $t("char-build.enemy_resistance") }}
                                        </div>
                                        <Select v-model="charSettings.enemyResistance"
                                            class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                                            @change="updateCharBuild">
                                            <SelectItem v-for="res in [0, 0.5, -4]" :key="res" :value="res"> {{ res *
                                                100 }}%
                                            </SelectItem>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            <!-- 敌人等级 -->
                            <div class="flex-1">
                                <div class="px-2 text-xs text-gray-400 mb-1">
                                    {{ $t("char-build.enemy_level") }} (Lv. {{ charSettings.enemyLevel }})
                                </div>
                                <input v-model.number="charSettings.enemyLevel" type="range"
                                    class="range range-primary range-xs w-full" min="1" max="180" step="1" />
                            </div>
                            <!-- 敌人信息 -->
                            <div class="space-y-3">
                                <div class="flex gap-2">
                                    <div class="flex-1">
                                        <div class="px-2 text-xs text-gray-400 mb-1 whitespace-nowrap">
                                            {{ $t("生命") }}
                                        </div>
                                        <div class="text-primary font-bold text-right">
                                            {{ charBuild.enemy.hp }}
                                        </div>
                                    </div>
                                    <div class="flex-1">
                                        <div class="px-2 text-xs text-gray-400 mb-1 whitespace-nowrap">
                                            {{ $t("防御") }}
                                        </div>
                                        <div class="text-primary font-bold text-right">
                                            {{ charBuild.enemy.def }}
                                        </div>
                                    </div>
                                    <div class="flex-1">
                                        <div class="px-2 text-xs text-gray-400 mb-1 whitespace-nowrap">
                                            {{ $t("护盾") }}
                                        </div>
                                        <div class="text-primary font-bold text-right">
                                            {{ charBuild.enemy.es || 0 }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="mt-4">
                            <CharHPCurve :desperate="attributes.背水" :boost="attributes.昂扬" />
                        </div>
                    </CollapsibleSection>

                    <!-- MOD配置区域 -->
                    <!-- 角色MOD -->
                    <CollapsibleSection data-tour="char-mods"
                        :title="`${$t('魔之楔')} (${charBuild.getModCostMax(charTab)}/${charBuild.getModCap(charTab)})`"
                        :badge="`${charBuild.getModCostTransfer(charTab).length}模块`" :is-open="!collapsedSections.mods"
                        @toggle="toggleSection('mods')">
                        <div class="mt-2">
                            <ModEditer v-if="charTab === '角色'" :mods="selectedCharMods"
                                :mod-options="modOptions.filter(m => m.type === '角色' && (!m.limit || m.limit === charBuild.char.属性))"
                                :char-build="charBuild" :aura-mod="charSettings.auraMod" type="角色"
                                :polset="charBuild.getModCostTransfer(charTab)" @remove-mod="removeMod($event, '角色')"
                                @select-mod="selectMod('角色', $event[0], $event[1], $event[2])"
                                @level-change="charSettings.charMods[$event[0]]![1] = $event[1]"
                                @select-aura-mod="charSettings.auraMod = $event"
                                @swap-mods="(index1, index2) => swapMods(index1, index2, '角色')"
                                @sync="syncModFromGame(charBuild.char.id, false)" />

                            <!-- 近战武器MOD -->
                            <ModEditer
                                v-if="charTab === '近战' || (charTab === '同律' && charBuild.skillWeapon?.inherit === 'melee')"
                                :mods="selectedMeleeMods" :mod-options="modOptions.filter(
                                    m =>
                                        m.type === '近战' &&
                                        (!m.limit || [charBuild.meleeWeapon.类别, charBuild.meleeWeapon.伤害类型].includes(m.limit))
                                )
                                    " :char-build="charBuild" type="近战" :polset="charBuild.getModCostTransfer(charTab)"
                                @remove-mod="removeMod($event, '近战')"
                                @select-mod="selectMod('近战', $event[0], $event[1], $event[2])"
                                @level-change="charSettings.meleeMods[$event[0]]![1] = $event[1]"
                                @swap-mods="(index1, index2) => swapMods(index1, index2, '近战')"
                                @sync="syncModFromGame(charBuild.meleeWeapon.id, true)" />

                            <!-- 远程武器MOD -->
                            <ModEditer
                                v-if="charTab === '远程' || (charTab === '同律' && charBuild.skillWeapon?.inherit === 'ranged')"
                                :mods="selectedRangedMods" :mod-options="modOptions.filter(
                                    m =>
                                        m.type === '远程' &&
                                        (!m.limit || [charBuild.rangedWeapon.类别, charBuild.rangedWeapon.伤害类型].includes(m.limit))
                                )
                                    " :char-build="charBuild" type="远程" :polset="charBuild.getModCostTransfer(charTab)"
                                @remove-mod="removeMod($event, '远程')"
                                @select-mod="selectMod('远程', $event[0], $event[1], $event[2])"
                                @level-change="charSettings.rangedMods[$event[0]]![1] = $event[1]"
                                @swap-mods="(index1, index2) => swapMods(index1, index2, '远程')"
                                @sync="syncModFromGame(charBuild.rangedWeapon.id, true)" />

                            <!-- 同律武器MOD -->
                            <ModEditer v-if="charTab === '同律' && !charBuild.skillWeapon?.inherit"
                                :mods="selectedSkillWeaponMods" :mod-options="modOptions.filter(
                                    m =>
                                        m.type === charBuild.skillWeapon!.类型 &&
                                        (!m.limit || [charBuild.skillWeapon!.类别, charBuild.skillWeapon!.伤害类型].includes(m.limit))
                                )
                                    " :char-build="charBuild" type="同律" :polset="charBuild.getModCostTransfer(charTab)"
                                @remove-mod="removeMod($event, '同律')"
                                @select-mod="selectMod('同律', $event[0], $event[1], $event[2])"
                                @level-change="charSettings.skillWeaponMods[$event[0]]![1] = $event[1]"
                                @swap-mods="(index1, index2) => swapMods(index1, index2, '同律')"
                                @sync="syncModFromGame(charBuild.char.id, false, true)" />
                        </div>
                    </CollapsibleSection>

                    <!-- MODBUFF列表 -->
                    <CollapsibleSection v-if="charBuild.modsWithWeapons.some(v => v.buff)"
                        :title="$t('char-build.special_effect_config')"
                        :badge="charBuild.modsWithWeapons.filter(v => v.buff).length"
                        :is-open="!collapsedSections.effects" @toggle="toggleSection('effects')">
                        <div class="mt-2">
                            <EffectSettings :mods="charBuild.modsWithWeapons" :char-build="charBuild" />
                        </div>
                    </CollapsibleSection>

                    <!-- BUFF列表 -->
                    <CollapsibleSection :title="$t('char-build.buff_list')" :badge="selectedBuffs.length"
                        :is-open="!collapsedSections.buffs" @toggle="toggleSection('buffs')">
                        <!-- 协战选择 -->
                        <div class="flex flex-wrap items-center gap-4 my-2 p-3 bg-base-200/50 rounded-lg">
                            <span class="text-sm font-semibold">{{ $t("char-build.team") }}</span>
                            <Select v-model="charSettings.team1" class="input input-bordered input-sm w-32"
                                @change="updateTeamBuff">
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
                            <Select v-model="charSettings.team1Weapon" class="input input-bordered input-sm w-32"
                                @change="updateTeamBuff">
                                <template v-for="weaponWithType in groupBy(teamWeaponOptions, 'type')"
                                    :key="weaponWithType[0].type">
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                        {{ $t(weaponWithType[0].type) }}
                                    </SelectLabel>
                                    <SelectGroup>
                                        <SelectItem v-for="char in weaponWithType" :key="char.value"
                                            :value="char.value">
                                            {{ $t(char.label) }}
                                        </SelectItem>
                                    </SelectGroup>
                                </template>
                            </Select>
                            <Select v-model="charSettings.team2" class="input input-bordered input-sm w-32"
                                @change="updateTeamBuff">
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
                            <Select v-model="charSettings.team2Weapon" class="input input-bordered input-sm w-32"
                                @change="updateTeamBuff">
                                <template v-for="weaponWithType in groupBy(teamWeaponOptions, 'type')"
                                    :key="weaponWithType[0].type">
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                        {{ $t(weaponWithType[0].type) }}
                                    </SelectLabel>
                                    <SelectGroup>
                                        <SelectItem v-for="char in weaponWithType" :key="char.value"
                                            :value="char.value">
                                            {{ $t(char.label) }}
                                        </SelectItem>
                                    </SelectGroup>
                                </template>
                            </Select>
                        </div>
                        <BuffEditer :buff-options="buffOptions" :selected-buffs="selectedBuffs" :char-build="charBuild"
                            @toggle-buff="toggleBuff" @set-buff-lv="setBuffLv" />
                    </CollapsibleSection>

                    <!-- 自定义BUFF -->
                    <div v-if="selectedBuffs.some(v => v.名称 === '自定义BUFF')"
                        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg overflow-hidden border border-base-200">
                        <div class="p-4">
                            <CustomBuffEditor @submit="reloadCustomBuff" />
                        </div>
                    </div>

                    <!-- 动作序列 -->
                    <CollapsibleSection :title="$t('char-build.actions')" :is-open="!collapsedSections.actions"
                        @toggle="toggleSection('actions')">
                        <CharActionEditor :char-name="selectedChar" :char-build="charBuild" />
                    </CollapsibleSection>

                    <!-- 装配预览 -->
                    <CollapsibleSection :title="$t('char-build.equipment_preview')"
                        :is-open="!collapsedSections.preview" @toggle="toggleSection('preview')">
                        <EquipmentPreview :char-build="charBuild" :attributes="attributes" :char-name="selectedChar"
                            :char-settings="charSettings" />
                    </CollapsibleSection>
                </div>
            </ScrollArea>
        </div>
    </div>

    <!-- AI对话助手 -->
    <AIChatDialog v-if="setting.showAIChat" :char-build="charBuild" @update:char-settings="charSettings = $event"
        @update:selected-char="selectedChar = $event" />
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
