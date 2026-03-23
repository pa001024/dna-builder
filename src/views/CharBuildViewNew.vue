<script setup lang="ts">
import { debounce } from "lodash-es"
import { computed, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { buildQuery, createBuildMutation } from "@/api/graphql"
import type { IconTypes } from "@/components/Icon.vue"
import { type CharSettings, normalizeCharSettings, useCharSettings } from "@/composables/useCharSettings"
import type { CharAttr } from "@/data"
import {
    buffData,
    buffMap,
    CharBuild,
    charData,
    charMap,
    LeveledBuff,
    LeveledChar,
    LeveledMod,
    LeveledWeapon,
    modData,
    monsterMap,
    weaponData,
} from "@/data"
import { LeveledSkill } from "@/data/leveled/LeveledSkill"
import { env } from "@/env"
import { useInvStore } from "@/store/inv"
import { useUIStore } from "@/store/ui"
import { copyText, format100, format100r, formatWeaponProp } from "@/util"

type BuildPanel = "角色" | "近战" | "远程" | "同律" | "光环"

interface DisplayAttribute {
    key: string
    value: number
}

interface AttributeDisplayMeta {
    icon: IconTypes
    label: string
}

interface EffectEntry {
    id: number
    label: string
    level: number
    minLevel: number
    maxLevel: number
    description: string
    source: string
    enabled: boolean
    isWeapon: boolean
}

interface DynamicAttrSource {
    sourceName: string
    value: number
}

interface SkillNodeGroup {
    skill: LeveledSkill
    nodes: { key: string; icon: string; label: string; value: string; description?: string; skillName?: string }[]
}

const inv = useInvStore()
const ui = useUIStore()
const route = useRoute()

const selectedCharName = computed(() => charMap.get(+route.params.charId)?.名称 || "")
const charSettings = useCharSettings(selectedCharName)

const activePanel = ref<BuildPanel>("角色")
const editingModType = ref<BuildPanel>("角色")
const editingModIndex = ref(0)
const editingModId = ref<number | undefined>(undefined)
const editingModLv = ref(1)
const modEditorOpen = ref(false)
const modSearchKeyword = ref("")
const modQualityFilter = ref<"全部" | "金" | "紫" | "蓝" | "绿" | "白">("全部")
const modSortByIncome = ref(true)
const weaponSelectOpen = ref(false)
const weaponDefaultTab = ref<"近战" | "远程">("近战")
const weaponSearchKeyword = ref("")
const supportSelectOpen = ref(false)
const supportSelectMode = ref<"char1" | "char2" | "weapon1" | "weapon2">("char1")
const supportSearchKeyword = ref("")
const astHelpOpen = ref(false)
const shareModelOpen = ref(false)
const shareTitle = ref("")
const shareDesc = ref("")
const buildShow = ref()
const targetFunction = ref(charSettings.value.targetFunction)

const buffOptions = computed(() =>
    buffData
        .filter(buff => !buff.限定 || buff.限定 === selectedCharName.value || buff.限定 === charBuild.value.char.属性)
        .map(buff => {
            const selected = charSettings.value.buffs.find(item => item[0] === buff.名称)
            const level = selected?.[1] ?? 1
            return new LeveledBuff(buff, level)
        })
)

const selectedCharMods = computed(() =>
    charSettings.value.charMods.map(item => (item ? LeveledMod.from(item[0], item[1], inv.getBuffLv(item[0])) : null))
)
const selectedMeleeMods = computed(() =>
    charSettings.value.meleeMods.map(item => (item ? LeveledMod.from(item[0], item[1], inv.getBuffLv(item[0])) : null))
)
const selectedRangedMods = computed(() =>
    charSettings.value.rangedMods.map(item => (item ? LeveledMod.from(item[0], item[1], inv.getBuffLv(item[0])) : null))
)
const selectedSkillWeaponMods = computed(() =>
    charSettings.value.skillWeaponMods.map(item => (item ? LeveledMod.from(item[0], item[1], inv.getBuffLv(item[0])) : null))
)
const selectedBuffs = computed(() =>
    charSettings.value.buffs
        .map(item => {
            try {
                return new LeveledBuff(item[0], item[1])
            } catch (error) {
                console.error(error)
                return null
            }
        })
        .filter((item): item is LeveledBuff => item !== null)
)

const charOptions = computed(() =>
    charData.map(char => ({
        value: char.名称,
        label: char.名称,
        elm: char.属性,
        icon: LeveledChar.url(char.icon),
    }))
)

const meleeWeaponOptions = computed(() =>
    weaponData
        .filter(weapon => weapon.类型[0] === "近战")
        .map(weapon => ({
            value: weapon.id,
            label: weapon.名称,
            type: weapon.类型[1],
            icon: LeveledWeapon.url(weapon.icon),
        }))
)

const rangedWeaponOptions = computed(() =>
    weaponData
        .filter(weapon => weapon.类型[0] === "远程")
        .map(weapon => ({
            value: weapon.id,
            label: weapon.名称,
            type: weapon.类型[1],
            icon: LeveledWeapon.url(weapon.icon),
        }))
)

const team1Options = computed(() =>
    [{ value: "-", label: "无", elm: "", icon: "/imgs/webp/T_Head_Empty.webp" }].concat(
        charOptions.value.filter(char => char.label !== selectedCharName.value && char.label !== charSettings.value.team2)
    )
)

const team2Options = computed(() =>
    [{ value: "-", label: "无", elm: "", icon: "/imgs/webp/T_Head_Empty.webp" }].concat(
        charOptions.value.filter(char => char.label !== selectedCharName.value && char.label !== charSettings.value.team1)
    )
)

const teamWeaponOptions = computed(() =>
    [{ value: "-" as number | "-", label: "无", type: "", icon: "/imgs/webp/T_Head_Empty.webp" }].concat(
        meleeWeaponOptions.value.concat(rangedWeaponOptions.value)
    )
)

/**
 * 根据当前角色配置构建实时属性模型。
 * @returns 用于页面展示的角色构筑实例
 */
const charBuild = computed(() => {
    const char = new LeveledChar(selectedCharName.value, charSettings.value.charLevel)
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

    return new CharBuild({
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
        teamWeapons: [charSettings.value.team1Weapon, charSettings.value.team2Weapon],
    })
})

const attributes = computed(() => charBuild.value.calculateAttributes())
const selectedBuffNameSet = computed(() => new Set(charSettings.value.buffs.map(item => item[0])))
const expressionIdentifiers = computed(() => charBuild.value.getIdentifierNames(targetFunction.value))

/**
 * 为属性展示面板提供统一的图标与标签文案。
 * @param key 属性名
 * @returns 展示所需的图标、标签与分组名
 */
function getAttributeDisplayMeta(key: string): AttributeDisplayMeta {
    const metaMap: Record<string, AttributeDisplayMeta> = {
        攻击: { icon: "ri:sword-line", label: "攻击" },
        生命: { icon: "ri:heart-pulse-line", label: "生命" },
        防御: { icon: "ri:shield-line", label: "防御" },
        护盾: { icon: "ri:shield-cross-line", label: "护盾" },
        神智: { icon: "ri:mental-health-line", label: "神智" },
        有效生命: { icon: "ri:shield-check-line", label: "有效生命" },
        攻速: { icon: "ri:timer-flash-line", label: "攻速" },
        多重: { icon: "ri:focus-3-line", label: "多重" },
        弹匣: { icon: "ri:stack-line", label: "弹匣" },
        装填: { icon: "ri:restart-line", label: "装填" },
        暴击: { icon: "ri:flashlight-line", label: "暴击" },
        爆伤: { icon: "ri:fire-line", label: "爆伤" },
        增伤: { icon: "ri:flashlight-line", label: "增伤" },
        最终伤害: { icon: "ri:flashlight-line", label: "最终伤害" },
        技能威力: { icon: "ri:flashlight-line", label: "技能威力" },
        技能耐久: { icon: "ri:timer-flash-line", label: "技能耐久" },
        技能效益: { icon: "ri:subtract-line", label: "技能效益" },
        技能范围: { icon: "ri:crosshair-line", label: "技能范围" },
        武器精通: { icon: "ri:star-line", label: "武器精通" },
        穿透: { icon: "ri:sword-line", label: "穿透" },
        穿透率: { icon: "ri:sword-line", label: "穿透率" },
        易伤: { icon: "ri:fire-line", label: "易伤" },
        减伤: { icon: "ri:shield-check-line", label: "减伤" },
        抗性: { icon: "ri:shield-line", label: "抗性" },
        命中: { icon: "ri:focus-3-line", label: "命中" },
        闪避: { icon: "ri:restart-line", label: "闪避" },
        范围: { icon: "ri:focus-3-line", label: "范围" },
        持续: { icon: "ri:timer-flash-line", label: "持续" },
        冷却: { icon: "ri:timer-flash-line", label: "冷却" },
        异常: { icon: "ri:fire-line", label: "异常" },
        异常增伤: { icon: "ri:fire-line", label: "异常增伤" },
        异常命中: { icon: "ri:focus-3-line", label: "异常命中" },
        异常伤害: { icon: "ri:fire-line", label: "异常伤害" },
    }

    if (key in metaMap) {
        return metaMap[key]
    }

    if (key.includes("生命")) {
        return { icon: "ri:heart-pulse-line", label: key }
    }
    if (key.includes("防御") || key.includes("抗")) {
        return { icon: "ri:shield-line", label: key }
    }
    if (key.includes("护盾")) {
        return { icon: "ri:shield-cross-line", label: key }
    }
    if (key.includes("攻击") || key.includes("穿透")) {
        return { icon: "ri:sword-line", label: key }
    }
    if (key.includes("暴") || key.includes("增伤") || key.includes("伤害") || key.includes("易伤") || key.includes("异常")) {
        return { icon: "ri:fire-line", label: key }
    }
    if (key.includes("攻速") || key.includes("冷却") || key.includes("持续")) {
        return { icon: "ri:timer-flash-line", label: key }
    }
    if (key.includes("弹匣")) {
        return { icon: "ri:stack-line", label: key }
    }
    if (key.includes("装填") || key.includes("闪避")) {
        return { icon: "ri:restart-line", label: key }
    }
    if (key.includes("命中") || key.includes("范围") || key.includes("多重")) {
        return { icon: "ri:focus-3-line", label: key }
    }
    if (key.includes("神智")) {
        return { icon: "ri:mental-health-line", label: key }
    }

    return { icon: "ri:star-line", label: key }
}

const allAttributeEntries = computed<DisplayAttribute[]>(() =>
    Object.entries(attributes.value)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value !== 0)
        .map(([key, value]) => ({ key, value: value as number }))
)

const activeWeaponKey = computed<"melee" | "ranged" | "skill" | null>(() => {
    if (activePanel.value === "近战") {
        return "melee"
    }
    if (activePanel.value === "远程") {
        return "ranged"
    }
    if (activePanel.value === "同律") {
        return "skill"
    }
    return null
})

const baseWeaponKey = computed<"melee" | "ranged" | null>(() => {
    const key = activeWeaponKey.value
    if (!key) {
        return null
    }
    if (key === "skill" && charBuild.value.skillWeapon?.inherit) {
        return charBuild.value.skillWeapon.inherit
    }
    return key === "skill" ? null : key
})

const activeWeapon = computed(() => {
    const key = activeWeaponKey.value
    if (!key) {
        return null
    }
    return charBuild.value[`${key}Weapon`]
})

const baseWeapon = computed(() => {
    const key = baseWeaponKey.value
    if (!key) {
        return activeWeapon.value
    }
    return charBuild.value[`${key}Weapon`]
})

const weaponAttributes = computed(() => {
    if (!activeWeapon.value) {
        return null
    }
    return charBuild.value.calculateWeaponAttributes(activeWeapon.value).weapon
})

const weaponAttributeEntries = computed<DisplayAttribute[]>(() => {
    if (!weaponAttributes.value || !activeWeapon.value) {
        return []
    }
    return Object.entries(weaponAttributes.value)
        .filter(([key, value]) => value && (!activeWeapon.value?.类型.includes("近战") || key !== "多重"))
        .map(([key, value]) => ({ key, value: value as number }))
})

/**
 * 判断当前属性项是否为 inherit 型同律武器的攻击词条。
 * @param key 属性键名
 * @returns 是否需要显示属性转换说明
 */
function isInheritedWeaponAttack(key: string) {
    return key === "攻击" && activeWeaponKey.value === "skill" && !!charBuild.value.skillWeapon?.inherit && charBuild.value.skillWeapon?.atk === "all"
}

/**
 * 获取武器攻击展示前缀。
 * @param key 属性键名
 * @returns 展示前缀 key
 */
function getWeaponAttackLabelPrefix(key: string) {
    if (key !== "攻击") return ""
    if (isInheritedWeaponAttack(key)) {
        return `${charBuild.value.char.属性}属性`
    }
    return activeWeapon.value?.伤害类型 || ""
}

/**
 * 获取 inherit 型同律攻击的来源提示。
 * @returns 来源说明
 */
function getInheritedWeaponAttackTooltip() {
    return baseWeapon.value?.伤害类型 || ""
}

const dynamicAttrSourceMap = computed<Record<string, DynamicAttrSource[]>>(() => {
    const sourceMap: Record<string, DynamicAttrSource[]> = {}
    const epsilon = 1e-10

    charBuild.value.dynamicBuffs.forEach((buff, buffIndex) => {
        const buildWithoutBuff = charBuild.value.clone()
        buildWithoutBuff.dynamicBuffs = charBuild.value.dynamicBuffs.filter((_, index) => index !== buffIndex).map(item => item.clone())
        const attrsWithoutBuff = buildWithoutBuff.calculateAttributes()

        Object.entries(attributes.value).forEach(([attrKey, attrValue]) => {
            const withoutValue = attrsWithoutBuff[attrKey as keyof CharAttr]
            if (typeof attrValue !== "number" || typeof withoutValue !== "number") {
                return
            }

            const delta = attrValue - withoutValue
            if (Math.abs(delta) < epsilon) {
                return
            }

            sourceMap[attrKey] ||= []
            sourceMap[attrKey].push({
                sourceName: buff.名称,
                value: delta,
            })
        })
    })

    return sourceMap
})

const dynamicWeaponAttrSourceMap = computed<Record<string, DynamicAttrSource[]>>(() => {
    const sourceMap: Record<string, DynamicAttrSource[]> = {}
    const epsilon = 1e-10
    const key = activeWeaponKey.value
    const weapon = activeWeapon.value
    const attrs = weaponAttributes.value

    if (!key || !weapon || !attrs) {
        return sourceMap
    }

    charBuild.value.dynamicBuffs.forEach((buff, buffIndex) => {
        const buildWithoutBuff = charBuild.value.clone()
        buildWithoutBuff.dynamicBuffs = charBuild.value.dynamicBuffs.filter((_, index) => index !== buffIndex).map(item => item.clone())
        const weaponWithoutBuff = buildWithoutBuff[`${key}Weapon`]
        const weaponAttrsWithoutBuff = weaponWithoutBuff ? buildWithoutBuff.calculateWeaponAttributes(weaponWithoutBuff).weapon : undefined
        if (!weaponAttrsWithoutBuff) {
            return
        }

        Object.entries(attrs).forEach(([attrKey, attrValue]) => {
            const withoutValue = weaponAttrsWithoutBuff[attrKey as keyof typeof weaponAttrsWithoutBuff]
            if (typeof attrValue !== "number" || typeof withoutValue !== "number") {
                return
            }

            const delta = attrValue - withoutValue
            if (Math.abs(delta) < epsilon) {
                return
            }

            sourceMap[attrKey] ||= []
            sourceMap[attrKey].push({
                sourceName: buff.名称,
                value: delta,
            })
        })
    })

    return sourceMap
})

const effectEntries = computed<EffectEntry[]>(() =>
    charBuild.value.modsWithWeapons
        .filter(item => item.buff)
        .map(item => {
            const buff = item.buff!
            const enabled = buff.pt === "Weapon" ? inv.getWBuffLv(item.id, charBuild.value.char.属性) > 0 : inv.getBuffLv(item.id) > 0
            const level =
                buff.pt === "Weapon" ? inv.getWBuffLv(item.id, charBuild.value.char.属性) || buff.等级 : inv.getBuffLv(item.id) || buff.等级
            return {
                id: item.id,
                label: buff.名称 || item.名称,
                level,
                minLevel: buff.lx || 1,
                maxLevel: buff.mx || buff.等级 || 1,
                description: buff.描述 || item.描述 || "",
                source: item.名称,
                enabled,
                isWeapon: buff.pt === "Weapon",
            }
        })
)

const hiddenSupportBuffNames = computed(() => {
    const selectedSupportChars = new Set(
        [charSettings.value.team1, charSettings.value.team2].filter((name): name is string => Boolean(name && name !== "-"))
    )
    const selectedSupportWeapons = new Set(
        [charSettings.value.team1Weapon, charSettings.value.team2Weapon].filter((id): id is number => typeof id === "number" && id > 0)
    )

    const hiddenCharNames = charOptions.value
        .map(item => item.label)
        .filter(name => name !== selectedCharName.value && !selectedSupportChars.has(name))

    const hiddenWeaponNames = weaponData.filter(weapon => !selectedSupportWeapons.has(weapon.id)).map(weapon => weapon.名称)

    return [...hiddenCharNames, ...hiddenWeaponNames]
})

const buffDeck = computed(() => {
    const charName = charBuild.value.char.名称 || ""
    return [...buffOptions.value]
        .filter(buff => selectedBuffNameSet.value.has(buff.名称) || !hiddenSupportBuffNames.value.some(name => buff.名称.includes(name)))
        .sort((a, b) => {
            const aSelected = selectedBuffNameSet.value.has(a.名称)
            const bSelected = selectedBuffNameSet.value.has(b.名称)
            if (aSelected !== bSelected) {
                return aSelected ? -1 : 1
            }

            const aHasCharName = a.名称.includes(charName)
            const bHasCharName = b.名称.includes(charName)
            if (aHasCharName !== bHasCharName) {
                return aHasCharName ? -1 : 1
            }

            return 0
        })
})

const expressionSuggestions = computed(() => {
    const attrs = allAttributeEntries.value.map(item => ({
        key: item.key,
        label: item.key,
        type: "ATTR",
    }))
    const fields =
        charBuild.value.selectedSkill?.字段.map(field => ({
            key: field.safeName,
            label: field.名称,
            type: "FIELD",
        })) || []
    const unique = new Map<string, { key: string; label: string; type: string }>()
    ;[...fields, ...attrs].forEach(item => {
        if (!unique.has(item.key)) {
            unique.set(item.key, item)
        }
    })
    return [...unique.values()].slice(0, 18)
})

const auraMod = computed(() => {
    if (!charSettings.value.auraMod) {
        return undefined
    }
    try {
        return new LeveledMod(
            charSettings.value.auraMod,
            inv.getModLv(charSettings.value.auraMod) ?? 10,
            inv.getBuffLv(charSettings.value.auraMod)
        )
    } catch {
        return undefined
    }
})

const auraDisplayName = computed(() => {
    if (!auraMod.value) {
        return "选择光环"
    }
    return `${auraMod.value.名称} +${auraMod.value.等级}`
})

const filteredWeaponChoices = computed(() => {
    return weaponData
        .filter(weapon => weapon.类型[0] === weaponDefaultTab.value)
        .filter(weapon => {
            const keyword = weaponSearchKeyword.value.trim()
            if (!keyword) {
                return true
            }
            return weapon.名称.includes(keyword) || weapon.类型.some(type => type.includes(keyword))
        })
        .map(weapon => {
            const leveled = new LeveledWeapon(
                weapon.id,
                weapon.类型[0] === "近战" ? charSettings.value.meleeWeaponRefine : charSettings.value.rangedWeaponRefine,
                weapon.类型[0] === "近战" ? charSettings.value.meleeWeaponLevel : charSettings.value.rangedWeaponLevel,
                inv.getWBuffLv(weapon.id, charBuild.value.char.属性)
            )
            return {
                weapon,
                leveled,
                income: charBuild.value.calcIncome(leveled),
            }
        })
})

const supportCards = computed(() => {
    const cards = [
        {
            key: "char1" as const,
            label: charSettings.value.team1 === "-" ? "未设置协战 1" : charSettings.value.team1,
            subtitle: "协战角色 01",
            icon: team1Options.value.find(item => item.value === charSettings.value.team1)?.icon || "/imgs/webp/T_Head_Empty.webp",
        },
        {
            key: "weapon1" as const,
            label:
                charSettings.value.team1Weapon === "-"
                    ? "未设置武器 1"
                    : weaponData.find(item => item.id === charSettings.value.team1Weapon)?.名称 || "未设置武器 1",
            subtitle: "协战武器 01",
            icon:
                teamWeaponOptions.value.find(item => item.value === charSettings.value.team1Weapon)?.icon || "/imgs/webp/T_Head_Empty.webp",
        },
        {
            key: "char2" as const,
            label: charSettings.value.team2 === "-" ? "未设置协战 2" : charSettings.value.team2,
            subtitle: "协战角色 02",
            icon: team2Options.value.find(item => item.value === charSettings.value.team2)?.icon || "/imgs/webp/T_Head_Empty.webp",
        },
        {
            key: "weapon2" as const,
            label:
                charSettings.value.team2Weapon === "-"
                    ? "未设置武器 2"
                    : weaponData.find(item => item.id === charSettings.value.team2Weapon)?.名称 || "未设置武器 2",
            subtitle: "协战武器 02",
            icon:
                teamWeaponOptions.value.find(item => item.value === charSettings.value.team2Weapon)?.icon || "/imgs/webp/T_Head_Empty.webp",
        },
    ]

    return cards
})

const filteredSupportCharChoices = computed(() => {
    const keyword = supportSearchKeyword.value.trim()
    const source = supportSelectMode.value === "char2" ? team2Options.value : team1Options.value
    return source.filter(item => !keyword || item.label.includes(keyword) || item.elm.includes(keyword))
})

const filteredSupportWeaponChoices = computed(() => {
    const keyword = supportSearchKeyword.value.trim()
    return teamWeaponOptions.value.filter(item => !keyword || item.label.includes(keyword) || item.type.includes(keyword))
})

const activeSkillBonusEntries = computed(() => Object.entries(charBuild.value.char.加成 || {}))
const fullCharacterSkillSource = computed(() => charBuild.value.skills)
const selectedSkillName = ref("")

const skillGroups = computed<SkillNodeGroup[]>(() =>
    fullCharacterSkillSource.value.slice(0, 3).map((skill, index) => {
        if (index < 2 && activeSkillBonusEntries.value[index]) {
            return {
                skill,
                nodes: [
                    {
                        key: `${skill.id}-2`,
                        icon: skill.url,
                        label: activeSkillBonusEntries.value[index][0],
                        value: formatAttributeSource((activeSkillBonusEntries.value[index][1] as number) * (2 / 5)),
                        description: "",
                        skillName: skill.名称,
                    },
                    {
                        key: `${skill.id}-5`,
                        icon: skill.url,
                        label: activeSkillBonusEntries.value[index][0],
                        value: formatAttributeSource((activeSkillBonusEntries.value[index][1] as number) * (3 / 5)),
                        description: "",
                        skillName: skill.名称,
                    },
                ],
            }
        }

        const extraSkills = fullCharacterSkillSource.value.slice(3, 5)
        return {
            skill,
            nodes: extraSkills.map(extraSkill => ({
                key: `${skill.id}-${extraSkill.id}`,
                icon: extraSkill.url,
                label: extraSkill.名称,
                value: "",
                description: extraSkill.描述 || "",
                skillName: extraSkill.名称,
            })),
        }
    })
)

const selectedSkillPanel = computed(() => {
    const availableSkills = fullCharacterSkillSource.value
    const fallback = availableSkills[0]
    if (!selectedSkillName.value) {
        return fallback
    }
    return availableSkills.find(skill => skill.名称 === selectedSkillName.value) || fallback
})

const availableModChoices = computed(() => {
    const resolvedEditingType = resolveModPanelType(editingModType.value)
    const currentSource = getModSource(editingModType.value)
    const editingSlots = currentModSlots.value || []
    const currentText = modSearchKeyword.value.trim()
    const samePanelIds = new Map<number, number>()
    const equippedExclusiveSeries = new Set<string>()
    const otherPanelNames = new Set<string>()

    editingSlots.forEach((mod, index) => {
        if (!mod || index === editingModIndex.value) {
            return
        }
        samePanelIds.set(mod.id, (samePanelIds.get(mod.id) || 0) + 1)
        if (CharBuild.exclusiveSeries.includes(mod.系列) || (mod.系列 === "囚狼" && mod.id > 100000)) {
            mod.excludeSeries.forEach(series => equippedExclusiveSeries.add(series))
        }
        if (mod.系列 !== "契约者") {
            otherPanelNames.add(mod.名称)
        }
    })

    return modData
        .filter(mod => {
            if (modQualityFilter.value !== "全部" && mod.品质 !== modQualityFilter.value) {
                return false
            }

            if (editingModType.value !== "光环" && mod.系列 === "羽蛇") {
                return false
            }

            if (editingModType.value === "光环") {
                if (mod.系列 !== "羽蛇") {
                    return false
                }
                if (mod.属性 && mod.属性 !== charBuild.value.char.属性) {
                    return false
                }
            }

            if (editingModType.value === "角色") {
                if (mod.类型 !== "角色") {
                    return false
                }
                if (mod.属性 && mod.属性 !== charBuild.value.char.属性) {
                    return false
                }
                if (mod.限定 && mod.限定 !== charBuild.value.char.属性) {
                    return false
                }
            }

            if (resolvedEditingType === "近战") {
                if (mod.类型 !== "近战") {
                    return false
                }
                if (mod.限定 && ![charBuild.value.meleeWeapon.类别, charBuild.value.meleeWeapon.伤害类型].includes(mod.限定)) {
                    return false
                }
            }

            if (resolvedEditingType === "远程") {
                if (mod.类型 !== "远程") {
                    return false
                }
                if (mod.限定 && ![charBuild.value.rangedWeapon.类别, charBuild.value.rangedWeapon.伤害类型].includes(mod.限定)) {
                    return false
                }
            }

            if (editingModType.value === "同律" && !charBuild.value.skillWeapon?.inherit) {
                if (charBuild.value.skillWeapon?.inherit) {
                    return false
                }
                if (mod.类型 !== charBuild.value.skillWeapon?.类型) {
                    return false
                }
                if (mod.限定 && ![charBuild.value.skillWeapon?.类别, charBuild.value.skillWeapon?.伤害类型].includes(mod.限定)) {
                    return false
                }
            }

            const currentCount = samePanelIds.get(mod.id) || 0
            const currentSelectedId = currentSource[editingModIndex.value]?.[0]
            const allowedCount = Math.min(inv.getModCount(mod.id, mod.品质), mod.系列 !== "契约者" ? 8 : 1)
            if (currentSelectedId !== mod.id && currentCount >= allowedCount) {
                return false
            }

            const targetSeries = mod.系列 === "囚狼" && mod.id > 100000 ? "囚狼1" : mod.系列
            if (currentSelectedId !== mod.id && equippedExclusiveSeries.has(targetSeries)) {
                return false
            }

            if (mod.系列 !== "契约者" && currentSelectedId !== mod.id && otherPanelNames.has(mod.名称)) {
                return false
            }

            if (currentText) {
                const raw = JSON.stringify(mod)
                if (!raw.includes(currentText)) {
                    return false
                }
            }

            return true
        })
        .map(mod => {
            const leveled = new LeveledMod(mod.id, inv.getModLv(mod.id, mod.品质) ?? 10, inv.getBuffLv(mod.id))
            return {
                mod: leveled,
                income: charBuild.value.calcIncome(leveled),
            }
        })
        .sort((a, b) => {
            if (modSortByIncome.value) {
                return b.income - a.income
            }
            return 0
        })
})

const panelCards = computed(() => {
    const result: { key: BuildPanel; label: string; icon: string; subtitle: string }[] = [
        {
            key: "角色",
            label: selectedCharName.value,
            icon: charBuild.value.char.url,
            subtitle: `${charBuild.value.char.属性} / Lv.${charSettings.value.charLevel}`,
        },
        {
            key: "近战",
            label: charBuild.value.meleeWeapon.名称,
            icon: charBuild.value.meleeWeapon.url,
            subtitle: `R${charSettings.value.meleeWeaponRefine} / Lv.${charSettings.value.meleeWeaponLevel}`,
        },
        {
            key: "远程",
            label: charBuild.value.rangedWeapon.名称,
            icon: charBuild.value.rangedWeapon.url,
            subtitle: `R${charSettings.value.rangedWeaponRefine} / Lv.${charSettings.value.rangedWeaponLevel}`,
        },
    ]

    if (charBuild.value.skillWeapon) {
        result.push({
            key: "同律",
            label: charBuild.value.skillWeapon.名称,
            icon: charBuild.value.skillWeapon.url,
            subtitle: `Lv.${charSettings.value.charSkillLevel}`,
        })
    }

    return result
})

/**
 * 解析同律页签实际应使用的模组槽位类型。
 * @param type 当前页签或编辑类型
 * @returns 实际对应的模组槽位类型
 */
function resolveModPanelType(type: BuildPanel): BuildPanel {
    if (type === "同律" && charBuild.value.skillWeapon?.inherit) {
        return charBuild.value.skillWeapon.inherit === "melee" ? "近战" : "远程"
    }
    return type
}

const currentModSlots = computed(() => {
    switch (resolveModPanelType(activePanel.value)) {
        case "角色":
            return selectedCharMods.value
        case "近战":
            return selectedMeleeMods.value
        case "远程":
            return selectedRangedMods.value
        case "同律":
            return selectedSkillWeaponMods.value
    }
})

/**
 * 保证旧版存档与新页面需要的槽位长度一致。
 * @returns void
 */
function updateCharBuild() {
    if (!monsterMap.has(charSettings.value.enemyId)) {
        charSettings.value.enemyId = 130
    }
    if (!charSettings.value.baseName) {
        charSettings.value.baseName = charBuild.value.char.技能[0].名称
    }

    padArray(charSettings.value.charMods, 8, null)
    padArray(charSettings.value.meleeMods, 8, null)
    padArray(charSettings.value.rangedMods, 8, null)
    padArray(charSettings.value.skillWeaponMods, 4, null)
}

/**
 * 将数组补齐或裁切到指定长度。
 * @param arr 目标数组
 * @param length 目标长度
 * @param value 需要补入的默认值
 * @returns void
 */
function padArray<T>(arr: T[], length: number, value: T) {
    if (arr.length > length) {
        arr.length = length
        return
    }
    while (arr.length < length) {
        arr.push(value)
    }
}

/**
 * 切换当前角色并跳转到对应的新页面路由。
 * @param charId 角色 id
 * @returns Promise<void>
 */
/**
 * 打开武器选择弹窗。
 * @param type 武器类型
 * @returns void
 */
function openWeaponSelect(type: "近战" | "远程") {
    weaponDefaultTab.value = type
    weaponSelectOpen.value = true
}

/**
 * 打开协战角色或武器选择弹窗。
 * @param mode 协战槽位类型
 * @returns void
 */
function openSupportSelect(mode: "char1" | "char2" | "weapon1" | "weapon2") {
    supportSelectMode.value = mode
    supportSearchKeyword.value = ""
    supportSelectOpen.value = true
}

/**
 * 应用武器选择弹窗中的结果。
 * @param weapons 选中的武器结果
 * @returns void
 */
function handleWeaponSelection(weapons: { melee?: number; ranged?: number }) {
    if (weapons.melee) {
        charSettings.value.meleeWeapon = weapons.melee
    }
    if (weapons.ranged) {
        charSettings.value.rangedWeapon = weapons.ranged
    }
    weaponSelectOpen.value = false
}

/**
 * 应用协战角色或武器选择结果。
 * @param value 选中的协战项
 * @returns void
 */
function handleSupportSelection(value: string | number) {
    switch (supportSelectMode.value) {
        case "char1":
            charSettings.value.team1 = value as string
            break
        case "char2":
            charSettings.value.team2 = value as string
            break
        case "weapon1":
            charSettings.value.team1Weapon = value as number | "-"
            break
        case "weapon2":
            charSettings.value.team2Weapon = value as number | "-"
            break
    }
    supportSelectOpen.value = false
}

/**
 * 打开指定槽位的 MOD 编辑器。
 * @param type 槽位类型
 * @param index 槽位索引
 * @returns void
 */
function openModEditor(type: BuildPanel, index: number) {
    editingModType.value = type
    editingModIndex.value = index
    if (type === "光环") {
        editingModId.value = charSettings.value.auraMod
        editingModLv.value = auraMod.value?.等级 ?? 1
    } else {
        const source = getModSource(type)
        const current = source[index]
        editingModId.value = current?.[0]
        editingModLv.value = current?.[1] ?? 1
    }
    modSearchKeyword.value = ""
    modQualityFilter.value = "全部"
    modSortByIncome.value = true
    modEditorOpen.value = true
}

/**
 * 选择 MOD 候选项写入当前编辑态。
 * @param mod 目标 MOD
 * @returns void
 */
function selectModChoice(mod: LeveledMod) {
    editingModId.value = mod.id
    editingModLv.value = mod.等级
    applyModSelection()
}

/**
 * 将编辑器中的 MOD 结果写回构筑存档。
 * @returns void
 */
function applyModSelection() {
    if (editingModType.value === "光环") {
        if (editingModId.value !== undefined) {
            charSettings.value.auraMod = editingModId.value
        }
        modEditorOpen.value = false
        return
    }
    const source = getModSource(editingModType.value)
    if (editingModId.value === undefined) {
        source[editingModIndex.value] = null
        modEditorOpen.value = false
        return
    }
    source[editingModIndex.value] = [editingModId.value, editingModLv.value]
    modEditorOpen.value = false
}

/**
 * 删除指定槽位上的 MOD。
 * @param type 槽位类型
 * @param index 槽位索引
 * @returns void
 */
function removeMod(type: BuildPanel, index: number) {
    const source = getModSource(type)
    source[index] = null
}

/**
 * 返回指定页签对应的 MOD 槽位数组。
 * @param type 页签类型
 * @returns 当前页签的 MOD 存档数组
 */
function getModSource(type: BuildPanel) {
    switch (resolveModPanelType(type)) {
        case "角色":
            return charSettings.value.charMods
        case "近战":
            return charSettings.value.meleeMods
        case "远程":
            return charSettings.value.rangedMods
        case "同律":
            return charSettings.value.skillWeaponMods
        case "光环":
            return charSettings.value.charMods
    }
}

/**
 * 切换 BUFF 选中状态。
 * @param buff 目标 BUFF
 * @returns void
 */
function toggleBuff(buff: LeveledBuff) {
    const index = charSettings.value.buffs.findIndex(item => item[0] === buff.名称)
    if (index >= 0) {
        charSettings.value.buffs.splice(index, 1)
        return
    }
    charSettings.value.buffs.push([buff.名称, buff.等级])
}

/**
 * 调整已选 BUFF 的等级。
 * @param buff 目标 BUFF
 * @param delta 等级变化量
 * @returns void
 */
function adjustBuffLevel(buff: LeveledBuff, delta: number) {
    const index = charSettings.value.buffs.findIndex(item => item[0] === buff.名称)
    if (index < 0) {
        return
    }
    const currentLevel = charSettings.value.buffs[index][1]
    const nextLevel = Math.max(buff.lx || 1, Math.min(buff.mx || currentLevel, currentLevel + delta))
    charSettings.value.buffs[index][1] = nextLevel
}

/**
 * 切换模组或武器提供的特效 BUFF。
 * @param effect 目标特效
 * @returns void
 */
function toggleEffect(effect: EffectEntry) {
    if (effect.enabled) {
        if (effect.isWeapon) {
            inv.setWBuffLv(effect.id, 0)
        } else {
            inv.setBuffLv(effect.id, 0)
        }
        return
    }
    if (effect.isWeapon) {
        inv.setWBuffLv(effect.id, effect.maxLevel)
    } else {
        inv.setBuffLv(effect.id, effect.maxLevel)
    }
}

/**
 * 直接设置模组或武器特效等级。
 * @param effect 目标特效
 * @param lv 新等级
 * @returns void
 */
function setEffectLevel(effect: EffectEntry, lv: number) {
    const nextLevel = Math.max(effect.minLevel, Math.min(effect.maxLevel, lv))
    if (effect.isWeapon) {
        inv.setWBuffLv(effect.id, nextLevel)
        return
    }
    inv.setBuffLv(effect.id, nextLevel)
}

/**
 * 将技能字段追加到表达式中。
 * @param skillName 技能或属性名称
 * @returns void
 */
function addSkill(skillName: string) {
    targetFunction.value += skillName.replace(/\//g, "_")
}

/**
 * 以页面适合阅读的形式格式化属性值。
 * @param key 属性名
 * @param value 属性值
 * @returns 页面展示字符串
 */
function formatAttributeValue(key: string, value: number) {
    if (["攻击", "生命", "护盾", "防御", "神智", "有效生命"].includes(key)) {
        return `${+value.toFixed(key === "攻击" ? 2 : 0)}`
    }
    return `${+(value * 100).toFixed(2)}%`
}

/**
 * 将属性来源贡献统一格式化成老页面口径。
 * @param value 属性来源数值
 * @returns 格式化后的来源文本
 */
function formatAttributeSource(value: number) {
    return format100r(value)
}

/**
 * 按老页面规则格式化武器属性展示值。
 * @param key 属性名
 * @param value 属性值
 * @returns 武器属性展示字符串
 */
function formatWeaponAttributeValue(key: string, value: number) {
    return formatWeaponProp(["攻速", "多重", "弹匣", "装填"].includes(key) ? "基础攻击" : key, value)
}

/**
 * 打开分享弹窗并初始化表单。
 * @returns void
 */
function openShareModal() {
    shareTitle.value = `${selectedCharName.value}构筑`
    shareDesc.value = ""
    shareModelOpen.value = true
}

/**
 * 确认分享当前构筑。
 * @returns Promise<void>
 */
async function confirmShare() {
    shareModelOpen.value = false
    await shareCharBuild(shareTitle.value, shareDesc.value)
    buildShow.value?.fetchBuilds?.()
}

/**
 * 将当前构筑分享为可访问链接。
 * @param title 分享标题
 * @param desc 分享描述
 * @returns Promise<void>
 */
async function shareCharBuild(title: string, desc = "") {
    try {
        const result = await createBuildMutation({
            input: {
                title,
                desc,
                charId: parseInt(route.params.charId as string),
                charSettings: JSON.stringify(charSettings.value),
            },
        })

        if (result) {
            const shareUrl = `${env.endpoint}/char/${route.params.charId}/${result.id}`
            await copyText(shareUrl)
            ui.showSuccessMessage("分享链接已复制")
        }
    } catch (error) {
        ui.showErrorMessage("分享失败", error instanceof Error ? error.message : "未知错误")
    }
}

/**
 * 从分享链接载入外部构筑配置。
 * @param buildId 分享构筑 id
 * @returns Promise<void>
 */
async function loadSharedBuild(buildId: string) {
    try {
        const build = await buildQuery({ id: buildId })
        if (!build?.charSettings) {
            return
        }
        applyLoadedSettings(JSON.parse(build.charSettings) as CharSettings)
    } catch (error) {
        ui.showErrorMessage("加载构筑失败", error instanceof Error ? error.message : "未知错误")
    }
}

/**
 * 应用外部载入的配置，并补齐当前版本需要的字段。
 * @param loadedSettings 外部载入的角色配置
 * @returns void
 */
function applyLoadedSettings(loadedSettings: CharSettings) {
    charSettings.value = normalizeCharSettings(loadedSettings)
    updateCharBuild()
}

/**
 * 同步自定义 BUFF 到运行时映射，保证属性重算可直接读取。
 * @param customBuff 自定义 BUFF 列表
 * @returns void
 */
function syncCustomBuff(customBuff: [string, number][]) {
    const buffObj = {
        名称: "自定义BUFF",
        描述: "自行填写",
    } as Record<string, string | number>
    customBuff.forEach(([property, value]) => {
        buffObj[property] = value
    })
    buffMap.set("自定义BUFF", buffObj as never)
}

watch(
    () => charSettings.value.customBuff,
    value => {
        syncCustomBuff(value)
    },
    {
        deep: true,
        immediate: true,
    }
)

watch(
    () => selectedCharName.value,
    () => {
        updateCharBuild()
        activePanel.value = charBuild.value.skillWeapon ? charBuild.value.selectedSkillType : "角色"
        selectedSkillName.value = charBuild.value.skills[0]?.名称 || ""
    },
    { immediate: true }
)

watch(
    () => charBuild.value.skills.map(skill => skill.名称).join("|"),
    () => {
        const currentNames = new Set(charBuild.value.skills.map(skill => skill.名称))
        if (!selectedSkillName.value || !currentNames.has(selectedSkillName.value)) {
            selectedSkillName.value = charBuild.value.skills[0]?.名称 || ""
        }
    },
    { immediate: true }
)

watch(
    () => route.params.buildId,
    async buildId => {
        if (typeof buildId === "string") {
            await loadSharedBuild(buildId)
        }
    },
    { immediate: true }
)

watch(
    targetFunction,
    debounce(newValue => {
        const error = charBuild.value.validateAST(newValue)
        if (error) {
            return
        }
        charSettings.value.targetFunction = newValue
    }, 300)
)

onMounted(() => {
    ui.title = `${selectedCharName.value} 构筑`
})
</script>

<template>
    <dialog class="modal" :class="{ 'modal-open': modEditorOpen }">
        <div class="modal-box h-[88%] max-w-[92%] overflow-hidden border border-white/10 bg-slate-950/95 p-0 text-white lg:max-w-300">
            <div class="flex h-full flex-col">
                <div class="flex items-center gap-4 border-b border-white/8 px-6 py-4">
                    <div>
                        <div class="font-mono text-[11px] tracking-[0.35em] text-white/45">MOD EDITOR</div>
                        <div class="mt-1 text-2xl font-['Cormorant_Garamond',serif]">
                            {{ editingModType }} 槽位 {{ editingModIndex + 1 }}
                        </div>
                    </div>
                    <button
                        class="ml-auto border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/70"
                        @click="editingModId = undefined"
                    >
                        清空槽位
                    </button>
                    <button
                        class="border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/70"
                        @click="modEditorOpen = false"
                    >
                        关闭
                    </button>
                </div>

                <div class="grid min-h-0 flex-1 gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div class="border-b border-white/8 bg-white/3 p-5 lg:border-b-0 lg:border-r">
                        <div class="text-xs tracking-[0.28em] text-white/45">当前选择</div>
                        <div class="relative mt-3 overflow-hidden border border-white/8 bg-white/4 p-4">
                            <div
                                v-if="editingModId"
                                class="pointer-events-none absolute inset-0 opacity-20"
                                :style="{
                                    backgroundImage: `url(${new LeveledMod(editingModId, editingModLv, inv.getBuffLv(editingModId)).url})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                }"
                            />
                            <div
                                class="pointer-events-none absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/82 to-slate-950/35"
                            />
                            <div class="relative z-10 font-mono text-[10px] tracking-[0.18em] text-cyan-300">
                                SLOT {{ String(editingModIndex + 1).padStart(2, "0") }}
                            </div>
                            <template v-if="editingModId">
                                <div class="relative z-10 mt-3 flex items-start gap-4">
                                    <img
                                        :src="new LeveledMod(editingModId, editingModLv, inv.getBuffLv(editingModId)).url"
                                        :alt="new LeveledMod(editingModId, editingModLv, inv.getBuffLv(editingModId)).名称"
                                        class="h-20 w-20 rounded-md border border-white/10 object-cover"
                                    />
                                    <div>
                                        <div class="text-2xl font-['Cormorant_Garamond',serif]">
                                            {{ new LeveledMod(editingModId, editingModLv, inv.getBuffLv(editingModId)).名称 }}
                                        </div>
                                        <div class="mt-2 text-sm text-white/65">
                                            {{ new LeveledMod(editingModId, editingModLv, inv.getBuffLv(editingModId)).系列 }} /
                                            {{ new LeveledMod(editingModId, editingModLv, inv.getBuffLv(editingModId)).品质 }}
                                        </div>
                                    </div>
                                </div>
                            </template>
                            <template v-else>
                                <div class="relative z-10 mt-3 text-lg text-white/85">未选择 MOD</div>
                                <div class="relative z-10 mt-2 text-sm text-white/55">从右侧列表中挑选一个候选项</div>
                            </template>
                        </div>

                        <div class="mt-5 space-y-3">
                            <div class="text-xs tracking-[0.28em] text-white/45">等级</div>
                            <div class="flex items-center gap-3">
                                <button
                                    class="h-9 w-9 border border-white/12 bg-white/5 text-white"
                                    @click="editingModLv = Math.max(1, editingModLv - 1)"
                                >
                                    -
                                </button>
                                <div class="min-w-16 border border-white/10 bg-white/5 px-4 py-2 text-center font-mono text-sm">
                                    Lv.{{ editingModLv }}
                                </div>
                                <button class="h-9 w-9 border border-white/12 bg-white/5 text-white" @click="editingModLv += 1">+</button>
                            </div>
                        </div>
                    </div>

                    <div class="flex min-h-0 flex-col">
                        <div class="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-4">
                            <input
                                v-model="modSearchKeyword"
                                type="text"
                                placeholder="搜索名称 / 属性 / 描述"
                                class="min-w-55 flex-1 border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/30"
                            />
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="quality in ['全部', '金', '紫', '蓝', '绿', '白'] as const"
                                    :key="quality"
                                    class="border px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] transition"
                                    :class="
                                        modQualityFilter === quality
                                            ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
                                            : 'border-white/10 bg-white/5 text-white/65'
                                    "
                                    @click="modQualityFilter = quality"
                                >
                                    {{ quality }}
                                </button>
                            </div>
                            <button
                                class="border px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] transition"
                                :class="
                                    modSortByIncome
                                        ? 'border-amber-200/40 bg-amber-100/10 text-amber-100'
                                        : 'border-white/10 bg-white/5 text-white/65'
                                "
                                @click="modSortByIncome = !modSortByIncome"
                            >
                                {{ modSortByIncome ? "收益排序" : "默认顺序" }}
                            </button>
                        </div>

                        <ScrollArea class="h-0 min-h-0 flex-1 px-5 py-4">
                            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <button
                                    v-for="entry in availableModChoices"
                                    :key="entry.mod.id"
                                    class="relative overflow-hidden border p-4 text-left transition hover:-translate-y-0.5"
                                    :class="
                                        editingModId === entry.mod.id ? 'border-cyan-300/45 bg-cyan-300/10' : 'border-white/8 bg-white/4'
                                    "
                                    @click="selectModChoice(entry.mod)"
                                >
                                    <div
                                        class="pointer-events-none absolute inset-0 opacity-15"
                                        :style="{
                                            backgroundImage: `url(${entry.mod.url})`,
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'center',
                                        }"
                                    />
                                    <div
                                        class="pointer-events-none absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/82 to-slate-950/38"
                                    />
                                    <div class="relative z-10 flex items-start justify-between gap-3">
                                        <div>
                                            <div class="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/45">
                                                {{ entry.mod.系列 }} / {{ entry.mod.品质 }} / {{ entry.mod.类型 }}
                                            </div>
                                        </div>
                                        <div class="font-mono text-[10px] tracking-[0.16em] text-cyan-300">
                                            {{ format100r(entry.income, 1) }}
                                        </div>
                                    </div>
                                    <div class="relative z-10 mt-3 text-xl font-['Cormorant_Garamond',serif]">
                                        {{ entry.mod.名称 }}
                                    </div>
                                    <div class="relative z-10 mt-3 flex gap-3">
                                        <img
                                            :src="entry.mod.url"
                                            :alt="entry.mod.名称"
                                            class="h-16 w-16 rounded-md border border-white/10 object-cover"
                                        />
                                        <div class="min-w-0">
                                            <div class="space-y-1 font-mono text-[11px] text-white/70">
                                                <div
                                                    v-for="[key, value] in Object.entries(entry.mod.getProperties()).filter(
                                                        ([_, value]) => value
                                                    )"
                                                    :key="key"
                                                >
                                                    {{ key }}{{ formatAttributeSource(value as number) }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        class="relative z-10 mt-3 flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-white/40"
                                    >
                                        <span>{{ entry.mod.属性 || entry.mod.限定 || "通用" }}</span>
                                        <span>Lv.{{ entry.mod.等级 }}</span>
                                    </div>
                                </button>
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </div>
            <div class="modal-action">
                <button class="btn btn-primary" @click="applyModSelection">应用</button>
                <button class="btn btn-ghost" @click="modEditorOpen = false">取消</button>
            </div>
        </div>
        <div class="modal-backdrop" @click="modEditorOpen = false" />
    </dialog>

    <dialog class="modal" :class="{ 'modal-open': astHelpOpen }">
        <div class="modal-box w-11/12 max-w-6xl bg-base-300">
            <ASTHelp
                v-if="astHelpOpen"
                v-model="astHelpOpen"
                :char-build="charBuild"
                :skill="charBuild.selectedSkill"
                @select="targetFunction = $event"
            />
        </div>
        <div class="modal-backdrop" @click="astHelpOpen = false" />
    </dialog>

    <dialog class="modal" :class="{ 'modal-open': weaponSelectOpen }">
        <div class="modal-box h-[88%] max-w-[92%] overflow-hidden border border-white/10 bg-slate-950/95 p-0 text-white lg:max-w-300">
            <div class="flex h-full flex-col">
                <div class="flex items-center gap-4 border-b border-white/8 px-6 py-4">
                    <div>
                        <div class="font-mono text-[11px] tracking-[0.35em] text-white/45">WEAPON SELECTOR</div>
                        <div class="mt-1 text-2xl font-['Cormorant_Garamond',serif]">{{ weaponDefaultTab }} 更换</div>
                    </div>
                    <button
                        class="ml-auto border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/70"
                        @click="weaponSelectOpen = false"
                    >
                        关闭
                    </button>
                </div>

                <div class="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-4">
                    <button
                        v-for="tab in ['近战', '远程'] as const"
                        :key="tab"
                        class="border px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] transition"
                        :class="
                            weaponDefaultTab === tab
                                ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
                                : 'border-white/10 bg-white/5 text-white/65'
                        "
                        @click="weaponDefaultTab = tab"
                    >
                        {{ tab }}
                    </button>
                    <input
                        v-model="weaponSearchKeyword"
                        type="text"
                        placeholder="搜索武器名称 / 类型"
                        class="min-w-55 flex-1 border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/30"
                    />
                    <div class="ml-auto flex items-center gap-3">
                        <div class="flex items-center gap-2">
                            <button
                                class="h-8 w-8 border border-white/10 bg-white/5 text-white"
                                @click="
                                    weaponDefaultTab === '近战'
                                        ? (charSettings.meleeWeaponLevel = Math.max(1, charSettings.meleeWeaponLevel - 1))
                                        : (charSettings.rangedWeaponLevel = Math.max(1, charSettings.rangedWeaponLevel - 1))
                                "
                            >
                                -
                            </button>
                            <div class="min-w-14 text-center font-mono text-xs text-white/70">
                                Lv.{{ weaponDefaultTab === "近战" ? charSettings.meleeWeaponLevel : charSettings.rangedWeaponLevel }}
                            </div>
                            <button
                                class="h-8 w-8 border border-white/10 bg-white/5 text-white"
                                @click="
                                    weaponDefaultTab === '近战'
                                        ? (charSettings.meleeWeaponLevel = Math.min(80, charSettings.meleeWeaponLevel + 1))
                                        : (charSettings.rangedWeaponLevel = Math.min(80, charSettings.rangedWeaponLevel + 1))
                                "
                            >
                                +
                            </button>
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                class="h-8 w-8 border border-white/10 bg-white/5 text-white"
                                @click="
                                    weaponDefaultTab === '近战'
                                        ? (charSettings.meleeWeaponRefine = Math.max(0, charSettings.meleeWeaponRefine - 1))
                                        : (charSettings.rangedWeaponRefine = Math.max(0, charSettings.rangedWeaponRefine - 1))
                                "
                            >
                                -
                            </button>
                            <div class="min-w-12 text-center font-mono text-xs text-white/70">
                                R{{ weaponDefaultTab === "近战" ? charSettings.meleeWeaponRefine : charSettings.rangedWeaponRefine }}
                            </div>
                            <button
                                class="h-8 w-8 border border-white/10 bg-white/5 text-white"
                                @click="
                                    weaponDefaultTab === '近战'
                                        ? (charSettings.meleeWeaponRefine = Math.min(5, charSettings.meleeWeaponRefine + 1))
                                        : (charSettings.rangedWeaponRefine = Math.min(5, charSettings.rangedWeaponRefine + 1))
                                "
                            >
                                +
                            </button>
                        </div>
                    </div>
                </div>

                <ScrollArea class="h-0 min-h-0 flex-1 px-5 py-4">
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <button
                            v-for="entry in filteredWeaponChoices"
                            :key="entry.weapon.id"
                            class="relative overflow-hidden border p-4 text-left transition hover:-translate-y-0.5"
                            :class="
                                (weaponDefaultTab === '近战' ? charSettings.meleeWeapon : charSettings.rangedWeapon) === entry.weapon.id
                                    ? 'border-cyan-300/45 bg-cyan-300/10'
                                    : 'border-white/8 bg-white/4'
                            "
                            @click="handleWeaponSelection({ [weaponDefaultTab === '近战' ? 'melee' : 'ranged']: entry.weapon.id })"
                        >
                            <div
                                class="pointer-events-none absolute inset-0 opacity-12"
                                :style="{
                                    backgroundImage: `url(${entry.leveled.url})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                }"
                            />
                            <div
                                class="pointer-events-none absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/82 to-slate-950/38"
                            />
                            <div class="relative z-10 flex items-start justify-between gap-3">
                                <div class="font-mono text-[10px] tracking-[0.18em] text-cyan-300">
                                    {{ entry.weapon.类型[1] }}
                                </div>
                                <div class="font-mono text-[10px] tracking-[0.16em] text-cyan-300">
                                    收益 {{ format100r(entry.income, 1) }}
                                </div>
                            </div>
                            <div class="relative z-10 mt-3 text-xl font-['Cormorant_Garamond',serif]">
                                {{ entry.weapon.名称 }}
                            </div>
                            <div class="relative z-10 mt-3 flex gap-3">
                                <img
                                    :src="entry.leveled.url"
                                    :alt="entry.weapon.名称"
                                    class="h-16 w-16 rounded-md border border-white/10 object-cover"
                                />
                                <div class="min-w-0">
                                    <div class="text-sm text-white/70">{{ entry.weapon.伤害类型 }} / {{ entry.weapon.类型[0] }}</div>
                                    <div class="mt-2 text-xs leading-6 text-white/60">
                                        {{ entry.leveled.效果 || entry.weapon.描述 || "选择后会同步替换当前武器。" }}
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </ScrollArea>
            </div>
        </div>
        <div class="modal-backdrop" @click="weaponSelectOpen = false" />
    </dialog>

    <dialog class="modal" :class="{ 'modal-open': supportSelectOpen }">
        <div class="modal-box h-[88%] max-w-[92%] overflow-hidden border border-white/10 bg-slate-950/95 p-0 text-white lg:max-w-250">
            <div class="flex h-full flex-col">
                <div class="flex items-center gap-4 border-b border-white/8 px-6 py-4">
                    <div>
                        <div class="font-mono text-[11px] tracking-[0.35em] text-white/45">SUPPORT SELECTOR</div>
                        <div class="mt-1 text-2xl font-['Cormorant_Garamond',serif]">
                            {{ supportSelectMode.startsWith("char") ? "协战角色" : "协战武器" }}更换
                        </div>
                    </div>
                    <button
                        class="ml-auto border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/70"
                        @click="supportSelectOpen = false"
                    >
                        关闭
                    </button>
                </div>

                <div class="border-b border-white/8 px-5 py-4">
                    <input
                        v-model="supportSearchKeyword"
                        type="text"
                        :placeholder="supportSelectMode.startsWith('char') ? '搜索协战角色名称 / 属性' : '搜索协战武器名称 / 类型'"
                        class="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/30"
                    />
                </div>

                <ScrollArea class="h-0 min-h-0 flex-1 px-5 py-4">
                    <div v-if="supportSelectMode.startsWith('char')" class="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <button
                            v-for="entry in filteredSupportCharChoices"
                            :key="entry.value"
                            class="flex items-center gap-3 border border-white/8 bg-white/4 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-cyan-300/8"
                            @click="handleSupportSelection(entry.value)"
                        >
                            <ImageFallback :src="entry.icon" :alt="entry.label" class="h-14 w-14 rounded-full object-cover object-top">
                                <img
                                    src="/imgs/webp/T_Head_Empty.webp"
                                    alt="协战角色"
                                    class="h-14 w-14 rounded-full object-cover object-top"
                                />
                            </ImageFallback>
                            <div class="min-w-0">
                                <div class="truncate text-[18px] font-['Cormorant_Garamond',serif] text-white">
                                    {{ entry.label }}
                                </div>
                                <div class="font-mono text-[10px] tracking-[0.2em] text-cyan-300">{{ entry.elm || "EMPTY" }}</div>
                            </div>
                        </button>
                    </div>

                    <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <button
                            v-for="entry in filteredSupportWeaponChoices"
                            :key="entry.value"
                            class="flex items-center gap-3 border border-white/8 bg-white/4 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-cyan-300/8"
                            @click="handleSupportSelection(entry.value)"
                        >
                            <ImageFallback :src="entry.icon" :alt="entry.label" class="h-14 w-14 rounded-full object-cover object-top">
                                <img
                                    src="/imgs/webp/T_Head_Empty.webp"
                                    alt="协战武器"
                                    class="h-14 w-14 rounded-full object-cover object-top"
                                />
                            </ImageFallback>
                            <div class="min-w-0">
                                <div class="truncate text-[18px] font-['Cormorant_Garamond',serif] text-white">
                                    {{ entry.label }}
                                </div>
                                <div class="font-mono text-[10px] tracking-[0.2em] text-cyan-300">{{ entry.type || "EMPTY" }}</div>
                            </div>
                        </button>
                    </div>
                </ScrollArea>
            </div>
        </div>
        <div class="modal-backdrop" @click="supportSelectOpen = false" />
    </dialog>

    <DialogModel v-model="shareModelOpen" @submit="confirmShare" class="bg-base-300">
        <div class="space-y-4">
            <h3 class="text-xl font-bold">分享构筑</h3>
            <div>
                <label class="label" for="share-title">
                    <span class="label-text">标题</span>
                </label>
                <input id="share-title" v-model="shareTitle" type="text" class="input input-bordered w-full" maxlength="50" />
            </div>
            <div>
                <label class="label" for="share-desc">
                    <span class="label-text">描述</span>
                </label>
                <textarea id="share-desc" v-model="shareDesc" class="textarea textarea-bordered w-full" rows="3" maxlength="200" />
            </div>
        </div>
    </DialogModel>

    <div
        class="relative h-full min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_50%_115%,rgba(28,53,95,0.85)_0%,rgba(11,16,28,0)_38%),radial-gradient(circle_at_15%_20%,rgba(127,102,192,0.16)_0%,transparent_35%),radial-gradient(circle_at_84%_18%,rgba(116,211,239,0.12)_0%,transparent_30%),linear-gradient(180deg,#05070d_0%,#08101c_100%)] text-white"
    >
        <div
            class="pointer-events-none absolute inset-0 z-0 opacity-15"
            :style="{ backgroundImage: `url(${charBuild.char.bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }"
        />
        <div
            class="pointer-events-none absolute inset-0 z-0 opacity-40 bg-[radial-gradient(1px_1px_at_10%_14%,rgba(255,255,255,0.95)_100%,transparent),radial-gradient(1.5px_1.5px_at_22%_74%,rgba(255,255,255,0.75)_100%,transparent),radial-gradient(1px_1px_at_43%_23%,rgba(255,255,255,0.7)_100%,transparent),radial-gradient(2px_2px_at_77%_38%,rgba(234,211,154,0.75)_100%,transparent),radial-gradient(1px_1px_at_88%_78%,rgba(241,120,100,0.75)_100%,transparent),radial-gradient(1px_1px_at_61%_84%,rgba(116,211,239,0.75)_100%,transparent)] bg-size-[360px_360px]"
        />
        <div
            class="pointer-events-none absolute inset-0 z-0 blur-2xl [background:radial-gradient(circle_at_50%_54%,rgba(116,211,239,0.08),transparent_34%),radial-gradient(circle_at_50%_54%,rgba(127,102,192,0.1),transparent_48%)]"
        />

        <section
            class="relative z-10 grid min-h-full grid-cols-1 gap-4 p-3 md:h-full md:grid-cols-[300px_minmax(0,1fr)_340px] md:overflow-hidden md:p-5 xl:grid-cols-[310px_minmax(0,1fr)_360px]"
        >
            <aside class="flex min-h-0 flex-col border border-white/10 bg-slate-950/70 backdrop-blur-xl">
                <div class="flex items-center justify-between border-b border-white/8 px-5 py-5">
                    <div class="flex items-center gap-3">
                        <div class="relative h-8 w-8 rotate-45 border border-white/15">
                            <div
                                class="absolute inset-2 rounded-full bg-[radial-gradient(circle,#ead39a_0%,rgba(234,211,154,0.05)_72%,transparent_100%)] -rotate-45"
                            />
                        </div>
                    </div>
                    <div class="font-mono text-[11px] tracking-[0.4em] text-white/70">CHAR</div>
                    <button
                        class="inline-flex items-center gap-2 border border-cyan-300/35 bg-cyan-300/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] text-cyan-200 transition hover:border-cyan-200/60 hover:bg-cyan-200/12"
                        @click="openShareModal"
                    >
                        分享
                    </button>
                </div>

                <ScrollArea class="px-5 py-5 md:h-0 md:min-h-0 md:flex-1">
                    <div class="space-y-6">
                        <div class="grid gap-3">
                            <button
                                v-for="card in panelCards"
                                :key="card.key"
                                class="grid grid-cols-[68px_minmax(0,1fr)_28px] items-center gap-3 border px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-cyan-300/8"
                                :class="activePanel === card.key ? 'border-cyan-300/50 bg-cyan-300/8' : 'border-white/8 bg-white/4'"
                                @click="activePanel = card.key"
                            >
                                <ImageFallback
                                    :src="card.icon"
                                    :alt="card.label"
                                    class="aspect-square w-17 rounded-full object-cover object-top"
                                >
                                    <img
                                        src="/imgs/webp/T_Head_Empty.webp"
                                        alt="武器头像"
                                        class="aspect-square w-17 rounded-full object-cover object-top"
                                    />
                                </ImageFallback>
                                <div class="min-w-0">
                                    <div class="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">{{ card.key }}</div>
                                    <div class="mt-1 truncate text-[18px] font-['Cormorant_Garamond',serif] text-white">
                                        {{ card.label }}
                                    </div>
                                    <div class="truncate text-sm text-white/70">{{ card.subtitle }}</div>
                                </div>
                                <button
                                    v-if="card.key === '近战' || card.key === '远程'"
                                    class="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-300 transition hover:border-cyan-300/45 hover:bg-cyan-300/10"
                                    @click.stop="openWeaponSelect(card.key)"
                                >
                                    <Icon icon="ri:exchange-line" class="h-4 w-4" />
                                </button>
                                <div v-else class="h-8 w-8" />
                            </button>
                        </div>

                        <div>
                            <div class="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-white/42">协战</div>
                            <div class="grid gap-3">
                                <button
                                    v-for="card in supportCards"
                                    :key="card.key"
                                    class="grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-3 border border-white/8 bg-white/3 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-cyan-300/8"
                                    @click="openSupportSelect(card.key)"
                                >
                                    <ImageFallback
                                        :src="card.icon"
                                        :alt="card.label"
                                        class="h-13 w-13 rounded-full object-cover object-top"
                                    >
                                        <img
                                            src="/imgs/webp/T_Head_Empty.webp"
                                            alt="协战槽位"
                                            class="h-13 w-13 rounded-full object-cover object-top"
                                        />
                                    </ImageFallback>
                                    <div class="min-w-0">
                                        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300">
                                            {{ card.subtitle }}
                                        </div>
                                        <div class="mt-1 truncate text-[16px] font-['Cormorant_Garamond',serif] text-white">
                                            {{ card.label }}
                                        </div>
                                    </div>
                                    <div
                                        class="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-300"
                                    >
                                        <Icon icon="ri:exchange-line" class="h-4 w-4" />
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </aside>

            <main class="flex min-h-0 flex-col border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl md:p-6">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div class="font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">MOD // BUFF ORBIT</div>
                        <h1 class="mt-1 text-5xl leading-[0.94] tracking-[0.04em] md:text-[54px] font-['Cormorant_Garamond',serif]">
                            {{ selectedCharName }}
                        </h1>
                        <div class="text-sm text-white/70 md:text-[15px]">{{ activePanel }} 构筑矩阵</div>
                    </div>
                    <div class="w-fit border border-cyan-300/40 px-3 py-2 font-mono text-[11px] tracking-[0.22em] text-cyan-300">
                        {{ (currentModSlots || []).filter(Boolean).length }}/{{ (currentModSlots || []).length }}
                    </div>
                </div>

                <ScrollArea class="pt-4 md:h-0 md:min-h-0 md:flex-1">
                    <div class="space-y-5 pr-1">
                        <div class="relative flex min-h-90 items-center justify-center overflow-hidden md:min-h-110">
                            <div class="pointer-events-none absolute h-90 w-90 rounded-full border border-purple-300/25 md:h-90 md:w-90" />
                            <div
                                class="pointer-events-none absolute h-100 w-100 rounded-full border border-cyan-300/25 border-dashed md:h-130 md:w-130 animate-[spin_78s_linear_infinite_reverse]"
                            />
                            <div
                                class="pointer-events-none absolute h-125 w-125 rounded-full border border-white/8 md:h-160 md:w-160 animate-[spin_55s_linear_infinite]"
                            />
                            <div class="pointer-events-none absolute inset-[8%] z-0 flex items-center justify-center">
                                <img
                                    :src="charBuild.char.bg"
                                    :alt="selectedCharName"
                                    class="h-full w-full object-contain opacity-[0.16] saturate-[0.9]"
                                />
                                <div class="absolute inset-0 bg-linear-to-r from-slate-950/70 via-transparent to-slate-950/70" />
                                <div class="absolute inset-0 bg-linear-to-b from-slate-950/70 via-transparent to-slate-950/70" />
                                <div
                                    class="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(2,6,23,0.08)_64%,rgba(2,6,23,0.38)_82%,rgba(2,6,23,0.72)_100%)]"
                                />
                            </div>

                            <div
                                class="relative z-10 grid w-full gap-4"
                                :class="activePanel === '角色' ? 'mx-auto max-w-7xl grid-cols-5' : 'max-w-245 grid-cols-2 xl:grid-cols-4'"
                            >
                                <template v-for="(mod, index) in currentModSlots" :key="`${activePanel}-${index}`">
                                    <div
                                        v-if="activePanel === '角色' && (index === 2 || index === 6)"
                                        class="pointer-events-none min-h-33"
                                    />
                                    <button
                                        class="relative min-h-33 overflow-hidden border p-4 text-left transition hover:-translate-y-1 hover:shadow-2xl"
                                        :class="mod ? 'border-amber-100/30 bg-white/4' : 'border-white/8 bg-white/3'"
                                        @click="openModEditor(activePanel, index)"
                                    >
                                        <div
                                            v-if="mod"
                                            class="pointer-events-none absolute inset-0 opacity-18"
                                            :style="{
                                                backgroundImage: `url(${mod.url})`,
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center',
                                            }"
                                        />
                                        <div
                                            v-if="mod"
                                            class="pointer-events-none absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/82 to-slate-950/38"
                                        />
                                        <div class="relative z-10 font-mono text-[10px] tracking-[0.18em] text-cyan-300">
                                            {{ mod?.系列 || `槽位 ${String(index + 1).padStart(2, "0")}` }}
                                        </div>
                                        <template v-if="mod">
                                            <div class="relative z-10 mt-3 text-[21px] font-['Cormorant_Garamond',serif]">
                                                {{ mod.名称 }} +{{ mod.等级 }}
                                            </div>
                                            <div class="relative z-10 mt-3 flex gap-3">
                                                <img
                                                    :src="mod.url"
                                                    :alt="mod.名称"
                                                    class="h-16 w-16 rounded-md border border-white/10 object-cover"
                                                />
                                                <div class="min-w-0">
                                                    <div class="space-y-1 font-mono text-[11px] text-white/70">
                                                        <div
                                                            v-for="[key, value] in Object.entries(mod.getProperties()).filter(
                                                                ([_, value]) => value
                                                            )"
                                                            :key="key"
                                                        >
                                                            {{ key }}{{ formatAttributeSource(value as number) }}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="relative z-10 mt-3 flex items-center justify-between gap-3">
                                                <button class="text-xs text-orange-300" @click.stop="removeMod(activePanel, index)">
                                                    移除
                                                </button>
                                                <div class="font-mono text-[10px] tracking-[0.12em] text-cyan-300">
                                                    收益 {{ format100r(charBuild.calcIncome(mod, true), 1) }}
                                                </div>
                                            </div>
                                        </template>
                                        <template v-else>
                                            <div class="relative z-10 mt-4 text-lg text-white">点击装配模组</div>
                                            <div class="relative z-10 mt-1 font-mono text-[11px] text-white/70">从当前库存中选择</div>
                                        </template>
                                    </button>
                                </template>
                            </div>
                            <div
                                v-if="activePanel === '角色'"
                                class="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                            >
                                <div class="flex flex-col items-center gap-2">
                                    <button
                                        class="group relative flex h-30 w-30 items-center justify-center rounded-full border border-cyan-300/35 bg-slate-950/80 p-3 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur-md transition hover:scale-[1.02] hover:border-cyan-200/55"
                                        @click="openModEditor('光环', 0)"
                                    >
                                        <div class="pointer-events-none absolute inset-1 rounded-full border border-white/8" />
                                        <div
                                            class="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(116,211,239,0.14)_0%,rgba(116,211,239,0.06)_36%,transparent_74%)]"
                                        />
                                        <div
                                            v-if="auraMod"
                                            class="pointer-events-none absolute inset-0 rounded-full opacity-20"
                                            :style="{
                                                backgroundImage: `url(${auraMod.url})`,
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center',
                                            }"
                                        />
                                        <div
                                            class="pointer-events-none absolute inset-0 rounded-full bg-linear-to-t from-slate-950 via-slate-950/70 to-transparent"
                                        />
                                        <template v-if="auraMod">
                                            <img
                                                :src="auraMod.url"
                                                :alt="auraMod.名称"
                                                class="relative z-10 h-18 w-18 rounded-full border border-white/10 object-cover"
                                            />
                                        </template>
                                        <template v-else>
                                            <div class="relative z-10 font-mono text-[10px] tracking-[0.24em] text-white/38">AURA</div>
                                        </template>
                                    </button>
                                    <div class="text-sm font-['Cormorant_Garamond',serif] text-white/85">
                                        {{ auraDisplayName }}
                                    </div>
                                </div>
                            </div>
                            <div
                                class="pointer-events-none absolute z-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08)_0%,rgba(116,211,239,0.12)_28%,transparent_70%)] shadow-[0_0_35px_rgba(116,211,239,0.14)] animate-[pulse_6s_ease-in-out_infinite] md:h-44 md:w-44"
                            />
                        </div>

                        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                            <div class="border border-white/8 bg-white/4 p-4">
                                <div class="space-y-5">
                                    <div
                                        v-for="group in skillGroups"
                                        :key="group.skill.id"
                                        class="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-4"
                                    >
                                        <button
                                            class="relative flex items-center gap-3 text-left"
                                            @click="((charSettings.baseName = group.skill.名称), (selectedSkillName = group.skill.名称))"
                                        >
                                            <div
                                                class="relative z-10 flex size-16 shrink-0 items-center justify-center rounded-full border bg-black/25 aspect-square"
                                                :class="
                                                    selectedSkillName === group.skill.名称
                                                        ? 'border-cyan-300/65 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,0.2)]'
                                                        : 'border-white/15'
                                                "
                                            >
                                                <img :src="group.skill.url" :alt="group.skill.名称" class="h-10 w-10 object-contain" />
                                                <div
                                                    class="absolute -bottom-1 rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-slate-900"
                                                >
                                                    MAX
                                                </div>
                                            </div>
                                        </button>
                                        <div class="flex items-center gap-3">
                                            <template v-for="(node, index) in group.nodes" :key="node.key">
                                                <div class="h-px flex-1 bg-linear-to-r from-[#f5edbd]/0 via-[#f5edbd]/90 to-[#f5edbd]/0" />
                                                <FullTooltip side="top">
                                                    <template #tooltip>
                                                        <div class="space-y-1">
                                                            <div class="text-sm text-white">{{ node.label }}</div>
                                                            <div v-if="node.value" class="text-sm text-cyan-200">{{ node.value }}</div>
                                                            <div v-if="node.description" class="max-w-65 text-sm leading-6 text-white/70">
                                                                {{ node.description }}
                                                            </div>
                                                        </div>
                                                    </template>
                                                    <button
                                                        class="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_20px_rgba(255,255,255,0.06)] transition"
                                                        @click="selectedSkillName = node.skillName || group.skill.名称"
                                                    >
                                                        <img
                                                            :src="node.icon"
                                                            :alt="group.skill.名称"
                                                            class="h-5 w-5 object-contain opacity-90"
                                                        />
                                                    </button>
                                                </FullTooltip>
                                                <div
                                                    v-if="index === group.nodes.length - 1"
                                                    class="h-px flex-1 bg-linear-to-r from-[#f5edbd]/0 via-[#f5edbd]/90 to-[#f5edbd]/0"
                                                />
                                            </template>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="border border-white/8 bg-white/4 p-4">
                                <div v-if="selectedSkillPanel" class="space-y-3">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-white/5"
                                        >
                                            <img
                                                :src="selectedSkillPanel.url"
                                                :alt="selectedSkillPanel.名称"
                                                class="h-7 w-7 object-contain"
                                            />
                                        </div>
                                        <div>
                                            <div class="text-[20px] font-['Cormorant_Garamond',serif] text-white">
                                                {{ selectedSkillPanel.名称 }}
                                            </div>
                                            <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300">
                                                {{ selectedSkillPanel.类型 }}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="text-sm leading-6 text-white/70">{{ selectedSkillPanel.描述 || "当前技能暂无描述。" }}</div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div class="font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">BUFF 展示</div>
                                <div
                                    class="w-fit border border-cyan-300/40 px-3 py-2 font-mono text-[11px] tracking-[0.22em] text-cyan-300"
                                >
                                    {{ selectedBuffs.length }} Active
                                </div>
                            </div>
                            <transition-group name="buff-deck" tag="div" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                <button
                                    v-for="buff in buffDeck"
                                    :key="buff.名称"
                                    class="group relative overflow-hidden border p-4 text-left transition hover:-translate-y-0.5"
                                    :class="
                                        selectedBuffNameSet.has(buff.名称)
                                            ? 'border-cyan-300/40 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.08)]'
                                            : 'border-white/8 bg-white/4'
                                    "
                                    @click="toggleBuff(buff)"
                                >
                                    <div
                                        class="pointer-events-none absolute inset-y-0 left-0 w-px bg-linear-to-b from-cyan-200/0 via-cyan-200/90 to-cyan-200/0 opacity-0 transition group-hover:opacity-100"
                                    />
                                    <div class="flex items-start justify-between gap-3">
                                        <div>
                                            <div class="text-xl font-['Cormorant_Garamond',serif]">{{ buff.名称 }}</div>
                                            <div class="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40">
                                                {{ selectedBuffNameSet.has(buff.名称) ? "SELECTED" : "AVAILABLE" }}
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-cyan-300">
                                            <template v-if="selectedBuffNameSet.has(buff.名称)">
                                                <button
                                                    v-if="buff.mx"
                                                    class="h-5 w-5 border border-white/12 bg-white/5 text-white"
                                                    @click.stop="adjustBuffLevel(buff, -1)"
                                                >
                                                    -
                                                </button>
                                                <span
                                                    >Lv.{{ charSettings.buffs.find(item => item[0] === buff.名称)?.[1] ?? buff.等级 }}</span
                                                >
                                                <button
                                                    v-if="buff.mx"
                                                    class="h-5 w-5 border border-white/12 bg-white/5 text-white"
                                                    @click.stop="adjustBuffLevel(buff, 1)"
                                                >
                                                    +
                                                </button>
                                            </template>
                                            <template v-else>READY</template>
                                        </div>
                                    </div>
                                    <div class="mt-3 min-h-10 text-sm leading-6 text-white/70">{{ buff.描述 }}</div>
                                    <div
                                        class="mt-3 flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-white/40"
                                    >
                                        <span>{{ buff.limit || "通用" }}</span>
                                        <span>{{ selectedBuffNameSet.has(buff.名称) ? "ON" : "OFF" }}</span>
                                    </div>
                                </button>
                            </transition-group>
                        </div>

                        <div v-if="selectedBuffNameSet.has('自定义BUFF')" class="border border-white/8 bg-white/4 p-4">
                            <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">自定义 BUFF</div>
                            <CustomBuffEditor :buffs="charSettings.customBuff" @submit="charSettings.customBuff = $event" />
                        </div>

                        <div v-if="effectEntries.length" class="border border-white/8 bg-white/4 p-4">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <div class="font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">特效编辑</div>
                                <div class="font-mono text-[10px] tracking-[0.18em] text-white/45">{{ effectEntries.length }} EFFECTS</div>
                            </div>
                            <div class="grid gap-3 lg:grid-cols-2">
                                <div
                                    v-for="effect in effectEntries"
                                    :key="`${effect.id}-${effect.label}`"
                                    class="border p-4"
                                    :class="effect.enabled ? 'border-amber-200/30 bg-amber-100/5' : 'border-white/8 bg-white/3'"
                                >
                                    <div class="flex items-start justify-between gap-3">
                                        <div>
                                            <div class="text-lg font-['Cormorant_Garamond',serif]">{{ effect.label }}</div>
                                            <div class="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/45">
                                                {{ effect.source }}
                                            </div>
                                        </div>
                                        <button
                                            class="border px-2 py-1 font-mono text-[10px] tracking-[0.16em] transition"
                                            :class="
                                                effect.enabled
                                                    ? 'border-cyan-300/45 bg-cyan-300/10 text-cyan-200'
                                                    : 'border-white/10 bg-white/5 text-white/65'
                                            "
                                            @click="toggleEffect(effect)"
                                        >
                                            {{ effect.enabled ? "ON" : "OFF" }}
                                        </button>
                                    </div>
                                    <div class="mt-3 min-h-10 text-sm leading-6 text-white/70">
                                        {{ effect.description || "当前特效提供额外增益，可在这里直接开关和调整等级。" }}
                                    </div>
                                    <div class="mt-3 flex items-center gap-3">
                                        <button
                                            class="h-7 w-7 border border-white/12 bg-white/5 text-white"
                                            @click="setEffectLevel(effect, effect.level - 1)"
                                        >
                                            -
                                        </button>
                                        <div class="min-w-16 border border-white/10 bg-white/5 px-3 py-1 text-center font-mono text-xs">
                                            Lv.{{ effect.level }}
                                        </div>
                                        <button
                                            class="h-7 w-7 border border-white/12 bg-white/5 text-white"
                                            @click="setEffectLevel(effect, effect.level + 1)"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="border border-white/8 bg-white/4 p-4">
                            <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">库存过滤</div>
                            <div class="font-mono text-xs leading-6 text-white/70">
                                {{
                                    modData.filter(mod => Math.min(inv.getModCount(mod.id, mod.品质), mod.系列 !== "契约者" ? 8 : 1)).length
                                }}
                                项可用 MOD 已接入当前构筑筛选
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </main>

            <aside class="flex min-h-0 flex-col border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl md:p-6">
                <div class="flex items-start justify-between gap-4 border-b border-[#ebd8a5]/15 pb-4">
                    <div>
                        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">Attribute Matrix</div>
                        <div class="mt-2 text-[34px] text-white font-['Cormorant_Garamond',serif]">属性</div>
                    </div>
                    <div class="text-right font-mono text-[10px] uppercase leading-5 tracking-[0.18em] text-white/40">
                        <div>{{ selectedCharName }}</div>
                        <div>{{ activePanel === "角色" ? "角色属性面板" : `${activePanel}属性面板` }}</div>
                        <div>{{ charBuild.char.属性 }} / Lv.{{ charSettings.charLevel }}</div>
                    </div>
                </div>

                <ScrollArea class="pt-4 md:h-0 md:min-h-0 md:flex-1">
                    <div class="space-y-5 pr-1">
                        <div
                            class="relative overflow-hidden border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0.012)_100%)] px-0 py-0"
                        >
                            <div
                                class="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-purple-300/0 via-purple-300/30 to-purple-300/0"
                            />
                            <div class="border-b border-white/8 px-5 py-3">
                                <div class="font-mono text-[10px] uppercase tracking-[0.28em] text-white/42">
                                    {{ activePanel === "角色" ? "Current Planetary Transits" : "Current Weapon Transits" }}
                                </div>
                            </div>
                            <div v-if="activePanel === '角色'" class="divide-y divide-white/8">
                                <FullTooltip v-for="item in allAttributeEntries" :key="item.key" side="left">
                                    <template #tooltip>
                                        <div class="flex max-w-90 flex-col gap-2">
                                            <div class="text-xs text-white/45">{{ item.key }}</div>
                                            <div v-if="item.key === '有效生命'" class="text-sm text-cyan-300">
                                                (生命 / (1 - 防御 / (300 + 防御)) + 护盾) / (1 - 减伤)
                                            </div>
                                            <ul class="space-y-1">
                                                <li
                                                    v-if="'基础' + item.key in charBuild.char"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ $t("char-build.base_attr_label", { attr: $t(item.key) }) }}</div>
                                                    {{ charBuild.char[("基础" + item.key) as keyof LeveledChar] }}
                                                </li>
                                                <li
                                                    v-if="charBuild.char.加成 && item.key in charBuild.char.加成"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ charBuild.char.名称 }}</div>
                                                    {{ formatAttributeSource(charBuild.char.加成[item.key]!) }}
                                                </li>
                                                <li
                                                    v-if="['生命', '护盾', '防御', '攻击'].includes(item.key)"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">共鸣增益</div>
                                                    {{ formatAttributeSource(charSettings.resonanceGain) }}
                                                </li>
                                                <li
                                                    v-if="item.key in (charBuild.meleeWeapon.addAttr || {})"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ charBuild.meleeWeapon.名称 }}</div>
                                                    {{ formatAttributeSource(charBuild.meleeWeapon.addAttr[item.key]!) }}
                                                </li>
                                                <li
                                                    v-if="item.key in (charBuild.rangedWeapon.addAttr || {})"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ charBuild.rangedWeapon.名称 }}</div>
                                                    {{ formatAttributeSource(charBuild.rangedWeapon.addAttr[item.key]!) }}
                                                </li>
                                                <li
                                                    v-for="(mod, index) in [charBuild.auraMod].filter(
                                                        (m): m is NonNullable<typeof charBuild.value.auraMod> => Boolean(m && m[item.key])
                                                    )"
                                                    :key="`aura-${index}`"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ mod.名称 }}</div>
                                                    {{ formatAttributeSource(mod[item.key]!) }}
                                                </li>
                                                <li
                                                    v-for="(mod, index) in charBuild.charMods.filter((m): m is NonNullable<typeof m> =>
                                                        Boolean(m && m[item.key])
                                                    )"
                                                    :key="`char-${index}`"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ mod.名称 }}</div>
                                                    {{ formatAttributeSource(mod[item.key]!) }}
                                                </li>
                                                <li
                                                    v-for="(buff, index) in charBuild.buffs.filter(buff => buff[item.key])"
                                                    :key="`buff-${index}`"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ buff.名称 }}</div>
                                                    {{ formatAttributeSource(buff[item.key]!) }}
                                                </li>
                                                <li
                                                    v-for="(dynamicSource, index) in dynamicAttrSourceMap[item.key] || []"
                                                    :key="`${dynamicSource.sourceName}-${index}`"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ dynamicSource.sourceName }}</div>
                                                    {{ formatAttributeSource(dynamicSource.value) }}
                                                </li>
                                            </ul>
                                        </div>
                                    </template>
                                    <button
                                        class="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-white/3"
                                        @click="addSkill(item.key)"
                                    >
                                        <div
                                            class="flex h-5 w-5 shrink-0 items-center justify-center text-cyan-200"
                                            :class="expressionIdentifiers.includes(item.key) ? 'text-orange-100' : ''"
                                        >
                                            <Icon :icon="getAttributeDisplayMeta(item.key).icon" class="h-4 w-4" />
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <div class="text-[12px] text-white/72">{{ getAttributeDisplayMeta(item.key).label }}</div>
                                        </div>
                                        <div
                                            class="text-right font-mono text-[14px] leading-none text-white"
                                            :class="expressionIdentifiers.includes(item.key) ? 'text-orange-100' : ''"
                                        >
                                            {{ formatAttributeValue(item.key, item.value) }}
                                        </div>
                                    </button>
                                </FullTooltip>
                            </div>
                            <div v-else class="divide-y divide-white/8">
                                <FullTooltip v-for="item in weaponAttributeEntries" :key="item.key" side="left">
                                    <template #tooltip>
                                        <div class="flex max-w-90 flex-col gap-2">
                                            <div class="text-xs text-white/45">{{ item.key }}</div>
                                            <ul class="space-y-1">
                                                <li
                                                    v-if="baseWeapon && '基础' + item.key in baseWeapon"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">
                                                        {{ item.key === "攻击"
                                                            ? $t("char-build.base_weapon_attack_label", { dmg: $t(getWeaponAttackLabelPrefix(item.key)) })
                                                            : $t("char-build.base_attr_label", { attr: $t(item.key) }) }}
                                                    </div>
                                                    {{
                                                        formatWeaponProp(
                                                            item.key === "攻击" ? "基础攻击" : item.key,
                                                            baseWeapon[("基础" + item.key) as keyof typeof baseWeapon] as number
                                                        )
                                                    }}
                                                </li>
                                                <li
                                                    v-if="baseWeapon && '射速' in baseWeapon && item.key === '攻速'"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ $t("char-build.base_attr_label", { attr: $t(item.key) }) }}</div>
                                                    {{ formatWeaponProp("基础攻击", (baseWeapon as never)["射速"] as number) }}
                                                </li>
                                                <li
                                                    v-if="item.key !== '攻击' && charBuild.char.加成 && item.key in charBuild.char.加成"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ charBuild.char.名称 }}</div>
                                                    {{ format100r(charBuild.char.加成[item.key]!) }}
                                                </li>
                                                <li
                                                    v-if="
                                                        activeWeaponKey !== 'skill' &&
                                                        baseWeapon &&
                                                        item.key !== '攻击' &&
                                                        item.key in baseWeapon
                                                    "
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ baseWeapon.名称 }}</div>
                                                    {{ format100r((baseWeapon as never)[item.key] as number) }}
                                                </li>
                                                <li
                                                    v-if="item.key in (charBuild.meleeWeapon.buffProps || {})"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ charBuild.meleeWeapon.名称 }}</div>
                                                    {{ format100r(charBuild.meleeWeapon.buffProps[item.key]!) }}
                                                </li>
                                                <li
                                                    v-if="item.key in (charBuild.rangedWeapon.buffProps || {})"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ charBuild.rangedWeapon.名称 }}</div>
                                                    {{ format100r(charBuild.rangedWeapon.buffProps[item.key]!) }}
                                                </li>
                                                <li
                                                    v-for="(mod, index) in activePanel === '近战'
                                                        ? charBuild.meleeMods.filter((m): m is NonNullable<typeof m> =>
                                                              Boolean(m && m[item.key])
                                                          )
                                                        : activePanel === '远程'
                                                          ? charBuild.rangedMods.filter((m): m is NonNullable<typeof m> =>
                                                                Boolean(m && m[item.key])
                                                            )
                                                          : activePanel === '同律'
                                                            ? charBuild.skillMods.filter((m): m is NonNullable<typeof m> =>
                                                                  Boolean(m && m[item.key])
                                                              )
                                                            : []"
                                                    :key="`weapon-mod-${index}`"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ mod.名称 }}</div>
                                                    {{ format100r(mod[item.key]!) }}
                                                </li>
                                                <li
                                                    v-for="(buff, index) in charBuild.buffs.filter(
                                                        buff => !['攻击', '增伤'].includes(item.key) && buff[item.key]
                                                    )"
                                                    :key="`weapon-buff-${index}`"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ buff.名称 }}</div>
                                                    {{ format100r(buff[item.key]!) }}
                                                </li>
                                                <li
                                                    v-for="(dynamicSource, index) in dynamicWeaponAttrSourceMap[item.key] || []"
                                                    :key="`${dynamicSource.sourceName}-${index}`"
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">{{ dynamicSource.sourceName }}</div>
                                                    {{ format100r(dynamicSource.value) }}
                                                </li>
                                                <li
                                                    v-if="
                                                        item.key === '攻击' &&
                                                        activeWeapon &&
                                                        (charBuild.char.精通.includes(activeWeapon.类别) ||
                                                            charBuild.char.精通.includes('全部类型'))
                                                    "
                                                    class="flex justify-between gap-8 text-sm text-cyan-200"
                                                >
                                                    <div class="text-white/75">武器精通</div>
                                                    *{{ format100(1.2) }}
                                                </li>
                                            </ul>
                                        </div>
                                    </template>
                                    <button
                                        class="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-white/3"
                                        @click="addSkill(`${activeWeaponKey}::${item.key}`)"
                                    >
                                        <div
                                            class="flex h-5 w-5 shrink-0 items-center justify-center text-cyan-200"
                                            :class="
                                                expressionIdentifiers.includes(`${activeWeaponKey}::${item.key}`) ? 'text-orange-100' : ''
                                            "
                                        >
                                            <Icon :icon="getAttributeDisplayMeta(item.key).icon" class="h-4 w-4" />
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center gap-1 text-[12px] text-white/72">
                                                <span>{{
                                                    item.key === "攻击"
                                                        ? $t("char-build.weapon_attack_label", { dmg: $t(getWeaponAttackLabelPrefix(item.key)) })
                                                        : getAttributeDisplayMeta(item.key).label
                                                }}</span>
                                                <FullTooltip v-if="isInheritedWeaponAttack(item.key)" side="top">
                                                    <template #tooltip>
                                                        <div class="text-sm text-white">
                                                            {{ $t("char-build.weapon_attack_converted_from", { dmg: $t(getInheritedWeaponAttackTooltip()) }) }}
                                                        </div>
                                                    </template>
                                                    <button class="inline-flex text-white/55 hover:text-cyan-200" @click.stop>
                                                        <Icon icon="ri:question-line" class="h-3.5 w-3.5" />
                                                    </button>
                                                </FullTooltip>
                                            </div>
                                        </div>
                                        <div
                                            class="text-right font-mono text-[14px] leading-none text-white"
                                            :class="
                                                expressionIdentifiers.includes(`${activeWeaponKey}::${item.key}`) ? 'text-orange-100' : ''
                                            "
                                        >
                                            {{ formatWeaponAttributeValue(item.key, item.value) }}
                                        </div>
                                    </button>
                                </FullTooltip>
                            </div>
                        </div>

                        <div class="border border-white/8 bg-white/4 p-4">
                            <div
                                class="mb-3 flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/70"
                            >
                                <span>当前表达式</span>
                                <button class="btn btn-xs btn-ghost" @click="astHelpOpen = true">
                                    <Icon icon="ri:question-line" class="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <label class="flex items-center gap-2 border border-white/8 bg-white/3 px-3 py-2">
                                <input
                                    v-model="targetFunction"
                                    type="text"
                                    placeholder="伤害"
                                    class="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
                                />
                                <button
                                    v-if="targetFunction"
                                    type="button"
                                    class="text-white/50 hover:text-white"
                                    @click="targetFunction = ''"
                                >
                                    <Icon icon="codicon:chrome-close" />
                                </button>
                            </label>
                            <div v-if="charBuild.validateAST(targetFunction)" class="mt-2 text-sm text-red-400">
                                {{ charBuild.validateAST(targetFunction) }}
                            </div>
                            <div
                                v-else
                                class="mt-3 flex items-center justify-between gap-3 border border-white/8 bg-white/3 px-3 py-2 text-sm"
                            >
                                <div class="truncate text-white/70">{{ charSettings.baseName }}</div>
                                <div class="font-mono font-bold text-cyan-300">{{ charBuild.calculate() }}</div>
                            </div>
                            <div v-if="expressionSuggestions.length" class="mt-3">
                                <div class="mb-2 font-mono text-[10px] tracking-[0.18em] text-white/40">表达式片段</div>
                                <div class="flex flex-wrap gap-2">
                                    <button
                                        v-for="item in expressionSuggestions"
                                        :key="`${item.type}-${item.key}`"
                                        class="border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-200"
                                        @click="addSkill(item.key)"
                                    >
                                        {{ item.label }}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="border border-white/8 bg-white/4 p-4">
                            <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">已选 BUFF</div>
                            <div class="flex flex-wrap gap-2">
                                <div v-if="selectedBuffs.length === 0" class="text-sm text-white/70">尚未启用 BUFF</div>
                                <div
                                    v-for="buff in selectedBuffs"
                                    :key="buff.名称"
                                    class="inline-flex items-center gap-2 border border-white/8 bg-white/4 px-3 py-2 font-mono text-[11px] tracking-[0.08em]"
                                >
                                    <span>{{ buff.名称 }}</span>
                                    <span>Lv.{{ buff.等级 }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="border border-white/8 bg-white/4 p-4">
                            <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">配装分享</div>
                            <div class="h-105 overflow-hidden">
                                <DOBBuildShow
                                    ref="buildShow"
                                    :char-id="charBuild.char.id"
                                    :char-name="charBuild.char.名称"
                                    @use-build="applyLoadedSettings"
                                />
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </aside>
        </section>
    </div>
</template>

<style>
.buff-deck-move,
.buff-deck-enter-active,
.buff-deck-leave-active {
    transition: all 0.35s ease;
}

.buff-deck-enter-from,
.buff-deck-leave-to {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
}

.buff-deck-leave-active {
    position: absolute;
}
</style>
