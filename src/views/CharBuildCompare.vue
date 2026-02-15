<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { cloneDeep } from "lodash-es"
import { computed, reactive, ref } from "vue"
import { useCharSettings } from "../composables/useCharSettings"
import {
    buffData,
    buffMap,
    CharAttr,
    CharBuild,
    CharBuildTimeline,
    LeveledBuff,
    LeveledChar,
    LeveledMod,
    LeveledWeapon,
    modData,
    WeaponAttr,
} from "../data"
import { useInvStore } from "../store/inv"
import { useTimeline } from "../store/timeline"

// Initialize stores and data
const inv = useInvStore()

// MOD options (same as CharBuildView)
const modOptions = modData
    .map(mod => ({
        value: mod.id,
        label: mod.名称,
        quality: mod.品质,
        type: mod.类型,
        limit: mod.属性 || mod.限定,
        ser: mod.系列,
        icon: LeveledMod.url(mod.icon),
        count: Math.min(inv.getModCount(mod.id, mod.品质), mod.系列 !== "契约者" ? 8 : 1),
        bufflv: inv.getBuffLv(mod.id),
        lv: inv.getModLv(mod.id, mod.品质),
    }))
    .filter(mod => mod.count)

// BUFF options with custom buff support (same as CharBuildView)
;(function writeCustomBuff() {
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

// Define configuration type
interface BuildConfiguration {
    additionalMods: ([number, number] | null)[][] // [charMods, meleeMods, rangedMods, skillWeaponMods]
    additionalBuffs: [string, number][]
    name: string
    selectedChar: string
    selectedProject: string
    charSettings: ReturnType<typeof useCharSettings>["value"]
    projects: { name: string; charSettings: ReturnType<typeof useCharSettings>["value"] }[]
}

// Helper function to create a new configuration
function createConfig(name: string, char?: string): BuildConfiguration {
    const selectedChar = char ? ref(char) : useLocalStorage("selectedChar", "赛琪")
    const charSettingsRef = useCharSettings(selectedChar)

    // Clone charSettings value
    const charSettings = cloneDeep(charSettingsRef.value)

    // Calculate available slots by subtracting existing non-null mods
    const charModSlots = Math.max(0, 8 - charSettings.charMods.filter((m: any) => m !== null).length)
    const meleeModSlots = Math.max(0, 8 - charSettings.meleeMods.filter((m: any) => m !== null).length)
    const rangedModSlots = Math.max(0, 8 - charSettings.rangedMods.filter((m: any) => m !== null).length)
    const skillWeaponModSlots = Math.max(0, 4 - charSettings.skillWeaponMods.filter((m: any) => m !== null).length)

    // Get projects from localStorage
    const savedProjects = useLocalStorage(`project.${selectedChar}`, {
        selected: "",
        projects: [] as { name: string; charSettings: typeof charSettings }[],
    })

    // Create projects array directly
    const projects = [{ name: "当前配置", charSettings: cloneDeep(charSettings) }, ...cloneDeep(savedProjects.value.projects)]

    // Create and return config object
    return {
        additionalMods: [
            Array(charModSlots).fill(null), // charMods: available slots
            Array(meleeModSlots).fill(null), // meleeMods: available slots
            Array(rangedModSlots).fill(null), // rangedMods: available slots
            Array(skillWeaponModSlots).fill(null), // skillWeaponMods: available slots
        ],
        additionalBuffs: [],
        name,
        selectedChar: selectedChar.value,
        selectedProject: "当前配置",
        charSettings,
        projects,
    } as BuildConfiguration
}

// Multiple configurations state
const configs = ref<BuildConfiguration[]>([createConfig("配置 1")])
// Initialize with one configuration

// 针对特定配置的已过滤 BUFF 选项，这些选项排除了项目现有的 BUFF
const getFilteredBuffOptions = (configIndex: number) => {
    const config = configs.value[configIndex]
    const project = config.projects.find((p: { name: string; charSettings: any }) => p.name === config.selectedProject)
    const projectBuffs = project?.charSettings.buffs.map((b: any) => b[0]) || []

    return _buffOptions
        .filter(buff => !buff.limit || buff.limit === config.selectedChar || buff.limit === charBuilds.value[configIndex]?.char.属性)
        .filter(buff => !projectBuffs.includes(buff.label))
        .map(v => {
            const b = config.additionalBuffs.find(b => b[0] === v.label)
            const lv = b?.[1] ?? v.value.等级
            return {
                value: new LeveledBuff(v.value._originalBuffData, lv),
                label: v.label,
                limit: v.limit,
                description: v.description,
                lv,
            }
        })
}

// Add new configuration by copying the last one
const addConfiguration = () => {
    const lastConfig = configs.value[configs.value.length - 1]
    const newConfig = createConfig(`配置 ${configs.value.length + 1}`, lastConfig.selectedChar)
    // Copy all properties from last config using deep clone
    Object.assign(newConfig, cloneDeep(lastConfig), {
        name: `配置 ${configs.value.length + 1}`,
    })
    configs.value.push(newConfig)
}

// Remove a configuration
const removeConfiguration = (index: number) => {
    if (configs.value.length > 1) {
        configs.value.splice(index, 1)
    }
}

//#region 时间线
// Timeline functionality is now handled within baseCharBuilds computed property
//#endregion
// Base char builds from selected projects for each configuration
const baseCharBuilds = computed(() => {
    return configs.value.map(config => {
        const project = config.projects.find((p: { name: string; charSettings: any }) => p.name === config.selectedProject)
        if (!project) return null

        const settings = project.charSettings
        const timelines = useTimeline(ref(config.selectedChar))

        function getTimelineByName(name: string) {
            const raw = timelines.value.find((v: any) => v.name === name)
            if (!raw) return undefined
            return CharBuildTimeline.fromRaw(raw)
        }

        // Create character build from project settings
        const char = new LeveledChar(config.selectedChar, settings.charLevel)
        return new CharBuild({
            char,
            auraMod: new LeveledMod(settings.auraMod),
            charMods: settings.charMods
                .map((v: any) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null))
                .filter((m: any): m is LeveledMod => m !== null),
            meleeMods: settings.meleeMods
                .map((v: any) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null))
                .filter((m: any): m is LeveledMod => m !== null),
            rangedMods: settings.rangedMods
                .map((v: any) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null))
                .filter((m: any): m is LeveledMod => m !== null),
            skillMods: settings.skillWeaponMods
                .map((v: any) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null))
                .filter((m: any): m is LeveledMod => m !== null),
            skillLevel: settings.charSkillLevel,
            buffs: settings.buffs.map((v: any) => new LeveledBuff(v[0], v[1])),
            melee: new LeveledWeapon(
                settings.meleeWeapon,
                settings.meleeWeaponRefine,
                settings.meleeWeaponLevel,
                inv.getWBuffLv(settings.meleeWeapon, char.属性)
            ),
            ranged: new LeveledWeapon(
                settings.rangedWeapon,
                settings.rangedWeaponRefine,
                settings.rangedWeaponLevel,
                inv.getWBuffLv(settings.rangedWeapon, char.属性)
            ),
            baseName: settings.baseName,
            imbalance: settings.imbalance,
            hpPercent: settings.hpPercent,
            resonanceGain: settings.resonanceGain,
            enemyId: settings.enemyId,
            enemyLevel: settings.enemyLevel,
            enemyResistance: settings.enemyResistance,
            targetFunction: settings.targetFunction,
            timeline: getTimelineByName(settings.baseName),
            teamWeapons: [settings.team1Weapon, settings.team2Weapon],
        })
    })
})

// Combined char builds with additional MODs and BUFFs for each configuration
const charBuilds = computed(() => {
    return configs.value.map((config, index) => {
        const baseBuild = baseCharBuilds.value[index]
        if (!baseBuild) {
            // Create a dummy CharBuild instance if baseBuild is null
            return new CharBuild({
                char: new LeveledChar(config.selectedChar, 10),
                melee: new LeveledWeapon(10302, 0, 1, 0),
                ranged: new LeveledWeapon(20601, 0, 1, 0),
                auraMod: new LeveledMod(0),
                charMods: [],
                meleeMods: [],
                rangedMods: [],
                skillMods: [],
                skillLevel: 1,
                buffs: [],
                baseName: "",
                imbalance: false,
                hpPercent: 1,
                resonanceGain: 2,
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                targetFunction: "伤害",
            })
        }

        // Combine MODs from project and additional selections for this configuration
        const combinedCharMods = [...baseBuild.charMods]
        const combinedMeleeMods = [...baseBuild.meleeMods]
        const combinedRangedMods = [...baseBuild.rangedMods]
        const combinedSkillWeaponMods = [...baseBuild.skillMods]

        // Add additional MODs for this configuration, ensuring we don't exceed 8 slots for each type
        config.additionalMods[0].forEach(mod => {
            if (mod && combinedCharMods.length < 8) {
                combinedCharMods.push(new LeveledMod(mod[0], mod[1], inv.getBuffLv(mod[0])))
            }
        })

        config.additionalMods[1].forEach(mod => {
            if (mod && combinedMeleeMods.length < 8) {
                combinedMeleeMods.push(new LeveledMod(mod[0], mod[1], inv.getBuffLv(mod[0])))
            }
        })

        config.additionalMods[2].forEach(mod => {
            if (mod && combinedRangedMods.length < 8) {
                combinedRangedMods.push(new LeveledMod(mod[0], mod[1], inv.getBuffLv(mod[0])))
            }
        })

        config.additionalMods[3].forEach(mod => {
            if (mod && combinedSkillWeaponMods.length < 4) {
                combinedSkillWeaponMods.push(new LeveledMod(mod[0], mod[1], inv.getBuffLv(mod[0])))
            }
        })

        // Combine BUFFs from project and additional selections for this configuration
        const combinedBuffs = [...baseBuild.buffs, ...config.additionalBuffs.map(v => new LeveledBuff(v[0], v[1]))]

        // Create new CharBuild instance with combined settings for this configuration
        return new CharBuild({
            char: baseBuild.char,
            melee: baseBuild.meleeWeapon,
            ranged: baseBuild.rangedWeapon,
            auraMod: baseBuild.auraMod,
            charMods: combinedCharMods,
            meleeMods: combinedMeleeMods,
            rangedMods: combinedRangedMods,
            skillMods: combinedSkillWeaponMods,
            skillLevel: baseBuild.skillLevel,
            buffs: combinedBuffs,
            baseName: baseBuild.baseName,
            imbalance: baseBuild.imbalance,
            hpPercent: baseBuild.hpPercent,
            resonanceGain: baseBuild.resonanceGain,
            enemyId: baseBuild.enemyId,
            enemyLevel: baseBuild.enemyLevel,
            enemyResistance: baseBuild.enemyResistance,
            targetFunction: baseBuild.targetFunction,
            timeline: baseBuild.timeline,
            teamWeaponCategories: [...baseBuild.teamWeaponCategories],
        })
    })
})

// Calculate statistics for all configurations
const attributesList = computed(() => {
    return charBuilds.value.map(build => build?.calculateAttributes() || {})
})

const weaponAttrsList = computed(() => {
    return charBuilds.value.map(build => {
        if (!build?.selectedWeapon) return null
        const result = build.calculateWeaponAttributes()
        return result.weapon
    })
})

const totalDamageList = computed(() => {
    return charBuilds.value.map(build => build?.calculate() || 0)
})

// MOD slot counts based on selected project for a specific configuration
function getModSlotCounts(configIndex: number) {
    const config = configs.value[configIndex]
    const project = config.projects.find((p: { name: string; charSettings: any }) => p.name === config.selectedProject)
    if (!project) return [8, 8, 8, 4] // Default max slots

    const settings = project.charSettings
    return [
        Math.max(0, 8 - settings.charMods.filter((m: any) => m !== null).length),
        Math.max(0, 8 - settings.meleeMods.filter((m: any) => m !== null).length),
        Math.max(0, 8 - settings.rangedMods.filter((m: any) => m !== null).length),
        Math.max(0, 4 - settings.skillWeaponMods.filter((m: any) => m !== null).length),
    ]
}

// MOD selection handlers for a specific configuration
function selectMod(configIndex: number, type: string, slotIndex: number, modId: number, lv: number) {
    const typeIndex = { 角色: 0, 近战: 1, 远程: 2, 同律: 3 }[type]
    if (typeIndex === undefined) return

    configs.value[configIndex].additionalMods[typeIndex][slotIndex] = [modId, lv]
}

function removeMod(configIndex: number, type: string, slotIndex: number) {
    const typeIndex = { 角色: 0, 近战: 1, 远程: 2, 同律: 3 }[type]
    if (typeIndex === undefined) return

    configs.value[configIndex].additionalMods[typeIndex][slotIndex] = null
}

// BUFF selection handlers for a specific configuration
function toggleBuff(configIndex: number, buff: LeveledBuff) {
    const index = configs.value[configIndex].additionalBuffs.findIndex(v => v[0] === buff.名称)
    if (index > -1) {
        configs.value[configIndex].additionalBuffs.splice(index, 1)
    } else {
        configs.value[configIndex].additionalBuffs.push([buff.名称, buff.等级])
    }
}

function setBuffLv(configIndex: number, buff: LeveledBuff, lv: number) {
    const index = configs.value[configIndex].additionalBuffs.findIndex(v => v[0] === buff.名称)
    if (index > -1) {
        configs.value[configIndex].additionalBuffs[index][1] = lv
    }
}

// Table customization
type ColumnKey = keyof CharAttr | `武器${keyof WeaponAttr}`
const visibleColumns = ref<ColumnKey[]>(["攻击", "生命", "护盾", "防御", "神智"])

const allColumns: { key: ColumnKey; label: string }[] = [
    { key: "攻击", label: "攻击" },
    { key: "生命", label: "生命" },
    { key: "护盾", label: "护盾" },
    { key: "防御", label: "防御" },
    { key: "神智", label: "神智" },
    { key: "技能威力", label: "技能威力" },
    { key: "技能耐久", label: "技能耐久" },
    { key: "技能效益", label: "技能效益" },
    { key: "技能范围", label: "技能范围" },
    { key: "昂扬", label: "昂扬" },
    { key: "背水", label: "背水" },
    { key: "增伤", label: "增伤" },
    { key: "武器伤害", label: "武器伤害" },
    { key: "技能伤害", label: "技能伤害" },
    { key: "独立增伤", label: "独立增伤" },
    { key: "属性穿透", label: "属性穿透" },
    { key: "无视防御", label: "无视防御" },
    { key: "技能速度", label: "技能速度" },
    { key: "失衡易伤", label: "失衡易伤" },
    { key: "技能倍率加数", label: "技能倍率加数" },
    { key: "召唤物攻击速度", label: "召唤物攻击速度" },
    { key: "召唤物范围", label: "召唤物范围" },
    { key: "减伤", label: "减伤" },
    // Weapon attributes
    { key: "武器攻击", label: "武器攻击" },
    { key: "武器暴击", label: "武器暴击率" },
    { key: "武器暴伤", label: "武器暴击伤害" },
    { key: "武器触发", label: "武器触发率" },
    { key: "武器攻速", label: "武器攻速" },
    { key: "武器多重", label: "武器多重" },
    { key: "武器增伤", label: "武器增伤" },
    { key: "武器独立增伤", label: "武器独立增伤" },
    { key: "武器追加伤害", label: "武器追加伤害" },
]

// Helper methods for table cell formatting
function formatCharAttribute(configIndex: number, colKey: string): string {
    const attr = attributesList.value[configIndex]
    if (!(colKey in attr)) return "-"

    const value = attr[colKey as keyof CharAttr]
    const isBaseStat = ["攻击", "生命", "护盾", "防御", "神智"].includes(colKey)
    return isBaseStat ? `${+value.toFixed(2)}` : `${+(value * 100).toFixed(2)}%`
}

function formatWeaponAttribute(configIndex: number, colKey: string): string {
    const weaponAttr = weaponAttrsList.value[configIndex]
    if (!weaponAttr) return "-"

    const attrKey = colKey.replace("武器", "") as keyof typeof weaponAttr
    const value = weaponAttr[attrKey]
    const isBaseStat = ["攻击", "攻速", "多重"].includes(attrKey)
    return isBaseStat ? `${+value.toFixed(2)}` : `${+(value * 100).toFixed(2)}%`
}
</script>

<template>
    <div class="h-full overflow-y-auto">
        <div class="mx-auto p-4">
            <!-- Input Section -->
            <div class="mb-6">
                <h2 class="text-xl font-semibold text-base-content">
                    {{ $t("build-compare.input_section") }}
                </h2>
                <div class="text-xs text-gray-400 mb-4">
                    {{ $t("build-compare.tip") }}
                </div>

                <!-- Multiple Configurations -->
                <div v-if="configs[0].projects.length > 0" class="space-y-6">
                    <!-- Configuration Cards -->
                    <div
                        v-for="(config, index) in configs"
                        :key="index"
                        class="bg-base-200 rounded-xl p-4 shadow-md border border-base-300"
                    >
                        <!-- Configuration Header -->
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <!-- Character and Project Selection -->
                                <div class="flex flex-wrap gap-4">
                                    <h3 class="text-lg font-semibold text-primary">
                                        <input v-model="config.name" type="text" class="input input-sm input-bordered w-32" />
                                    </h3>
                                    <!-- Character Selection -->
                                    <div class="bg-base-200 rounded-lg flex items-center gap-4">
                                        <div class="text-xs text-gray-400">
                                            {{ $t("char-build.char") }}
                                        </div>
                                        <CharSelect v-model="config.selectedChar" />
                                    </div>

                                    <!-- Project Selection -->
                                    <div class="bg-base-200 rounded-lg flex items-center gap-4">
                                        <div class="text-xs text-gray-400">
                                            {{ $t("build-compare.project_name") }}
                                        </div>
                                        <Select
                                            v-if="config.projects.length > 0"
                                            v-model="config.selectedProject"
                                            class="w-40 inline-flex justify-between input input-bordered input-sm"
                                        >
                                            <SelectItem v-for="project in config.projects" :key="project.name" :value="project.name">
                                                {{ project.name }}
                                            </SelectItem>
                                        </Select>
                                        <div v-else class="text-sm text-warning">
                                            {{ $t("build-compare.no_projects_available") }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button class="btn btn-primary btn-sm" :title="$t('build-compare.copy_config')" @click="addConfiguration">
                                    <Icon icon="ri:add-line" />
                                </button>
                                <button
                                    v-if="configs.length > 1"
                                    class="btn btn-error btn-sm"
                                    :title="$t('build-compare.remove_config')"
                                    @click="removeConfiguration(index)"
                                >
                                    <Icon icon="ri:delete-bin-line" />
                                </button>
                            </div>
                        </div>

                        <!-- Additional MOD List for this Configuration -->
                        <div class="mb-6">
                            <!-- Character MODs -->
                            <div v-if="getModSlotCounts(index)[0] > 0" class="mb-4">
                                <ModEditer
                                    :title="$t('char-build.char_mod_config')"
                                    :mods="config.additionalMods[0].map(m => (m ? new LeveledMod(m[0], m[1]) : null))"
                                    :other-mods="config.charSettings.charMods.map(m => (m ? new LeveledMod(m[0], m[1]) : null))"
                                    :mod-options="
                                        modOptions.filter(m => m.type === '角色' && (!m.limit || m.limit === charBuilds[index]?.char.属性))
                                    "
                                    :char-build="charBuilds[index]"
                                    type="角色"
                                    @remove-mod="removeMod(index, '角色', $event)"
                                    @select-mod="selectMod(index, '角色', $event[0], $event[1], $event[2])"
                                />
                            </div>

                            <!-- Melee MODs -->
                            <div
                                v-if="
                                    getModSlotCounts(index)[1] > 0 &&
                                    (baseCharBuilds[index]?.isMeleeWeapon || baseCharBuilds[index]?.selectedSkill?.召唤物)
                                "
                                class="mb-4"
                            >
                                <ModEditer
                                    :title="$t('char-build.melee_weapon_mod_config')"
                                    :mods="config.additionalMods[1].map(m => (m ? new LeveledMod(m[0], m[1]) : null))"
                                    :other-mods="config.charSettings.meleeMods.map(m => (m ? new LeveledMod(m[0], m[1]) : null))"
                                    :mod-options="
                                        modOptions.filter(
                                            m =>
                                                m.type === '近战' &&
                                                (!m.limit ||
                                                    [charBuilds[index]?.meleeWeapon.类别, charBuilds[index]?.meleeWeapon.伤害类型].includes(
                                                        m.limit
                                                    ))
                                        )
                                    "
                                    :char-build="charBuilds[index]"
                                    type="近战"
                                    @remove-mod="removeMod(index, '近战', $event)"
                                    @select-mod="selectMod(index, '近战', $event[0], $event[1], $event[2])"
                                />
                            </div>

                            <!-- Ranged MODs -->
                            <div v-if="getModSlotCounts(index)[2] > 0 && baseCharBuilds[index]?.isRangedWeapon" class="mb-4">
                                <ModEditer
                                    :title="$t('char-build.ranged_weapon_mod_config')"
                                    :mods="config.additionalMods[2].map(m => (m ? new LeveledMod(m[0], m[1]) : null))"
                                    :other-mods="config.charSettings.rangedMods.map(m => (m ? new LeveledMod(m[0], m[1]) : null))"
                                    :mod-options="
                                        modOptions.filter(
                                            m =>
                                                m.type === '远程' &&
                                                (!m.limit ||
                                                    [
                                                        charBuilds[index]?.rangedWeapon.类别,
                                                        charBuilds[index]?.rangedWeapon.伤害类型,
                                                    ].includes(m.limit))
                                        )
                                    "
                                    :char-build="charBuilds[index]"
                                    type="远程"
                                    @remove-mod="removeMod(index, '远程', $event)"
                                    @select-mod="selectMod(index, '远程', $event[0], $event[1], $event[2])"
                                />
                            </div>

                            <!-- Skill Weapon MODs -->
                            <div v-if="getModSlotCounts(index)[3] > 0 && baseCharBuilds[index]?.isSkillWeapon" class="mb-4">
                                <ModEditer
                                    :title="$t('char-build.skill_weapon_mod_config')"
                                    :mods="config.additionalMods[3].map(m => (m ? new LeveledMod(m[0], m[1]) : null))"
                                    :other-mods="config.charSettings.skillWeaponMods.map(m => (m ? new LeveledMod(m[0], m[1]) : null))"
                                    :mod-options="
                                        modOptions.filter(
                                            m =>
                                                m.type === charBuilds[index]?.skillWeapon?.类型 &&
                                                (!m.limit ||
                                                    [
                                                        charBuilds[index]?.skillWeapon?.类别,
                                                        charBuilds[index]?.skillWeapon?.伤害类型,
                                                    ].includes(m.limit))
                                        )
                                    "
                                    :char-build="charBuilds[index]"
                                    type="同律"
                                    @remove-mod="removeMod(index, '同律', $event)"
                                    @select-mod="selectMod(index, '同律', $event[0], $event[1], $event[2])"
                                />
                            </div>
                        </div>

                        <!-- Additional BUFF List for this Configuration -->
                        <div id="buff-container" class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
                            <div class="flex flex-wrap items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <SectionMarker />
                                    <h3 class="text-lg font-semibold">
                                        {{ $t("char-build.buff_list") }}
                                    </h3>
                                </div>
                            </div>
                            <BuffEditer
                                :selected-buffs="config.additionalBuffs.map(([name, lv]) => new LeveledBuff(name, lv))"
                                :buff-options="getFilteredBuffOptions(index)"
                                :char-build="charBuilds[index]"
                                @toggle-buff="toggleBuff(index, $event)"
                                @set-buff-lv="setBuffLv(index, $event[0], $event[1])"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Results Section -->
            <div v-if="charBuilds.length > 0 && charBuilds[0]" class="bg-base-100 rounded-xl p-6 shadow-lg">
                <h2 class="text-xl font-semibold mb-4 text-base-content">
                    {{ $t("build-compare.results") }}
                </h2>

                <!-- Table Customization -->
                <div class="mb-4">
                    <h3 class="text-sm font-semibold mb-2 text-primary">
                        {{ $t("build-compare.customize_table") }}
                    </h3>
                    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        <label v-for="column in allColumns" :key="column.key" class="inline-flex items-center gap-1 cursor-pointer">
                            <input v-model="visibleColumns" type="checkbox" :value="column.key" class="checkbox checkbox-primary" />
                            <span class="text-sm">{{ column.label }}</span>
                        </label>
                    </div>
                </div>

                <!-- Results Table -->
                <div class="overflow-x-auto">
                    <table class="table table-zebra w-full">
                        <thead>
                            <tr class="bg-base-200">
                                <th class="text-left">
                                    {{ $t("build-compare.configuration") }}
                                </th>
                                <th class="text-right">
                                    {{ configs[0].charSettings.baseName }} -
                                    {{
                                        baseCharBuilds[0]?.selectedSkill?.召唤物?.名称
                                            ? `[${baseCharBuilds[0]?.selectedSkill?.召唤物?.名称}]`
                                            : ""
                                    }}{{ configs[0].charSettings.targetFunction }}
                                </th>
                                <th v-for="colKey in visibleColumns" :key="colKey" class="text-right">
                                    <!-- Get the display label for the column -->
                                    {{ allColumns.find(col => col.key === colKey)?.label || colKey }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- One row per configuration -->
                            <tr v-for="(config, configIndex) in configs" :key="configIndex">
                                <!-- Configuration name -->
                                <td class="font-medium">
                                    {{ config.name }}
                                </td>

                                <!-- Target function result -->
                                <td class="text-right">
                                    {{ Math.round(totalDamageList[configIndex]) }}
                                </td>
                                <!-- Value for each visible column -->
                                <td v-for="colKey in visibleColumns" :key="colKey" class="text-right">
                                    <!-- Character attributes -->
                                    {{
                                        colKey.startsWith("武器")
                                            ? formatWeaponAttribute(configIndex, colKey)
                                            : formatCharAttribute(configIndex, colKey)
                                    }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- No Project Selected Message -->
            <div v-else-if="configs[0].projects.length === 0" class="bg-base-100 rounded-xl p-6 shadow-lg text-center">
                <div class="text-lg font-medium mb-2 text-warning">
                    {{ $t("build-compare.no_projects_available") }}
                </div>
                <div class="text-sm text-base-content/70">
                    {{ $t("build-compare.create_project_first") }}
                </div>
            </div>

            <!-- No Project Selected Message -->
            <div v-else class="bg-base-100 rounded-xl p-6 shadow-lg text-center">
                <div class="text-lg font-medium mb-2 text-primary">
                    {{ $t("build-compare.select_project_message") }}
                </div>
                <div class="text-sm text-base-content/70">
                    {{ $t("build-compare.select_project_to_compare") }}
                </div>
            </div>
        </div>
    </div>
</template>
