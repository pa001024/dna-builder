<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import {
    LeveledChar,
    LeveledMod,
    LeveledBuff,
    LeveledWeapon,
    CharBuild,
    gameData as data,
    buffMap,
    CharAttr,
    WeaponAttr,
    CharBuildTimeline,
} from "../data"
import { useLocalStorage } from "@vueuse/core"
import { groupBy, cloneDeep } from "lodash-es"
import { useInvStore } from "../store/inv"
import { useCharSettings } from "../store/charSettings"
import { useTimeline } from "../store/timeline"

// Initialize stores and data
const inv = useInvStore()

// Character options (same as CharBuildView)
const charOptions = data.char.map((char) => ({ value: char.名称, label: char.名称, elm: char.属性, icon: `/imgs/${char.名称}.png` }))

// MOD options (same as CharBuildView)
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

// BUFF options with custom buff support (same as CharBuildView)
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

// Component state
const selectedChar = useLocalStorage("compareSelectedChar", "赛琪")
const charSettings = useCharSettings(selectedChar)
const charProjectKey = computed(() => `project.${selectedChar.value}`)
const _charProject = useLocalStorage(charProjectKey, {
    selected: "",
    projects: [] as { name: string; charSettings: typeof charSettings.value }[],
})
const charProject = computed(() => ({
    selected: _charProject.value.selected || "当前配置",
    projects: [{ name: "当前配置", charSettings: charSettings.value }, ..._charProject.value.projects],
}))

// Define configuration type
interface BuildConfiguration {
    additionalMods: (number[] | null)[][] // [charMods, meleeMods, rangedMods, skillWeaponMods]
    additionalBuffs: [string, number][]
    name: string
}

// Multiple configurations state
const configs = ref<BuildConfiguration[]>([
    {
        additionalMods: [[], [], [], []],
        additionalBuffs: [],
        name: "配置 1",
    },
])

// 针对特定配置的已过滤 BUFF 选项，这些选项排除了项目现有的 BUFF
const getFilteredBuffOptions = (configIndex: number) => {
    const project = charProject.value.projects.find((p) => p.name === charProject.value.selected)
    const projectBuffs = project?.charSettings.buffs.map((b) => b[0]) || []

    return _buffOptions
        .filter((buff) => !buff.limit || buff.limit === selectedChar.value || buff.limit === charBuilds.value[configIndex]?.char.属性)
        .filter((buff) => !projectBuffs.includes(buff.label))
        .map((v) => {
            const b = configs.value[configIndex]?.additionalBuffs.find((b) => b[0] === v.label)
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
    const newConfig: BuildConfiguration = {
        additionalMods: cloneDeep(lastConfig.additionalMods),
        additionalBuffs: cloneDeep(lastConfig.additionalBuffs),
        name: `配置 ${configs.value.length + 1}`,
    }
    configs.value.push(newConfig)
}

// Remove a configuration
const removeConfiguration = (index: number) => {
    if (configs.value.length > 1) {
        configs.value.splice(index, 1)
    }
}

//#region 时间线
const timelines = useTimeline(selectedChar)
function getTimelineByName(name: string) {
    const raw = timelines.value.find((v) => v.name === name)
    if (!raw) return undefined
    return CharBuildTimeline.fromRaw(raw)
}
const isTimeline = computed(() => timelines.value.some((v) => v.name === charSettings.value.baseName))
//#endregion
// Base char build from selected project
const baseCharBuild = computed(() => {
    const project = charProject.value.projects.find((p) => p.name === charProject.value.selected)

    const settings = project!.charSettings

    // Create character build from project settings
    return new CharBuild({
        char: new LeveledChar(selectedChar.value, settings.charLevel),
        auraMod: new LeveledMod(settings.auraMod),
        charMods: settings.charMods.map((v) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null)).filter((m) => m !== null),
        meleeMods: settings.meleeMods.map((v) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null)).filter((m) => m !== null),
        rangedMods: settings.rangedMods.map((v) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null)).filter((m) => m !== null),
        skillWeaponMods: settings.skillWeaponMods
            .map((v) => (v ? new LeveledMod(v[0], v[1], inv.getBuffLv(v[0])) : null))
            .filter((m) => m !== null),
        skillLevel: settings.charSkillLevel,
        buffs: settings.buffs.map((v) => new LeveledBuff(v[0], v[1])),
        melee: new LeveledWeapon(
            settings.meleeWeapon,
            settings.meleeWeaponRefine,
            settings.meleeWeaponLevel,
            inv.getBuffLv(settings.meleeWeapon),
        ),
        ranged: new LeveledWeapon(
            settings.rangedWeapon,
            settings.rangedWeaponRefine,
            settings.rangedWeaponLevel,
            inv.getBuffLv(settings.rangedWeapon),
        ),
        baseName: settings.baseName,
        imbalance: settings.imbalance,
        hpPercent: settings.hpPercent,
        resonanceGain: settings.resonanceGain,
        enemyType: settings.enemyType,
        enemyLevel: settings.enemyLevel,
        enemyResistance: settings.enemyResistance,
        enemyHpType: settings.enemyHpType,
        targetFunction: settings.targetFunction,
        timeline: getTimelineByName(charSettings.value.baseName),
    })
})

// Combined char builds with additional MODs and BUFFs for each configuration
const charBuilds = computed(() => {
    if (!baseCharBuild.value) return []

    const baseBuild = baseCharBuild.value

    return configs.value.map((config) => {
        // Combine MODs from project and additional selections for this configuration
        const combinedCharMods = [...baseBuild.charMods]
        const combinedMeleeMods = [...baseBuild.meleeMods]
        const combinedRangedMods = [...baseBuild.rangedMods]
        const combinedSkillWeaponMods = [...baseBuild.skillWeaponMods]

        // Add additional MODs for this configuration, ensuring we don't exceed 8 slots for each type
        config.additionalMods[0].forEach((mod) => {
            if (mod && combinedCharMods.length < 8) {
                combinedCharMods.push(new LeveledMod(mod[0], mod[1], inv.getBuffLv(mod[0])))
            }
        })

        config.additionalMods[1].forEach((mod) => {
            if (mod && combinedMeleeMods.length < 8) {
                combinedMeleeMods.push(new LeveledMod(mod[0], mod[1], inv.getBuffLv(mod[0])))
            }
        })

        config.additionalMods[2].forEach((mod) => {
            if (mod && combinedRangedMods.length < 8) {
                combinedRangedMods.push(new LeveledMod(mod[0], mod[1], inv.getBuffLv(mod[0])))
            }
        })

        config.additionalMods[3].forEach((mod) => {
            if (mod && combinedSkillWeaponMods.length < 4) {
                combinedSkillWeaponMods.push(new LeveledMod(mod[0], mod[1], inv.getBuffLv(mod[0])))
            }
        })

        // Combine BUFFs from project and additional selections for this configuration
        const combinedBuffs = [...baseBuild.buffs, ...config.additionalBuffs.map((v) => new LeveledBuff(v[0], v[1]))]

        // Create new CharBuild instance with combined settings for this configuration
        return new CharBuild({
            char: baseBuild.char,
            melee: baseBuild.meleeWeapon,
            ranged: baseBuild.rangedWeapon,
            auraMod: baseBuild.auraMod,
            charMods: combinedCharMods,
            meleeMods: combinedMeleeMods,
            rangedMods: combinedRangedMods,
            skillWeaponMods: combinedSkillWeaponMods,
            skillLevel: baseBuild.skillLevel,
            buffs: combinedBuffs,
            baseName: baseBuild.baseName,
            imbalance: baseBuild.imbalance,
            hpPercent: baseBuild.hpPercent,
            resonanceGain: baseBuild.resonanceGain,
            enemyType: baseBuild.enemyType,
            enemyLevel: baseBuild.enemyLevel,
            enemyResistance: baseBuild.enemyResistance,
            enemyHpType: baseBuild.enemyHpType,
            targetFunction: baseBuild.targetFunction,
            timeline: baseBuild.timeline,
        })
    })
})

// Calculate statistics for all configurations
const attributesList = computed(() => {
    return charBuilds.value.map((build) => build?.calculateAttributes() || {})
})

const weaponAttrsList = computed(() => {
    return charBuilds.value.map((build) => {
        if (!build?.selectedWeapon) return null
        const result = build.calculateWeaponAttributes()
        return result.weapon
    })
})

const totalDamageList = computed(() => {
    return charBuilds.value.map((build) => build?.calculate() || 0)
})

// MOD slot counts based on selected project
const modSlotCounts = computed(() => {
    const project = charProject.value.projects.find((p) => p.name === charProject.value.selected)
    if (!project) return [8, 8, 8, 4] // Default max slots

    const settings = project.charSettings
    return [
        Math.max(0, 8 - settings.charMods.filter((m) => m !== null).length),
        Math.max(0, 8 - settings.meleeMods.filter((m) => m !== null).length),
        Math.max(0, 8 - settings.rangedMods.filter((m) => m !== null).length),
        Math.max(0, 4 - settings.skillWeaponMods.filter((m) => m !== null).length),
    ]
})

// Watch for project changes to reset all configurations
watch(
    () => charProject.value.selected,
    () => {
        configs.value = [
            {
                additionalMods: [[], [], [], []],
                additionalBuffs: [],
                name: "配置 1",
            },
        ]
    },
)

// MOD selection handlers for a specific configuration
function selectMod(configIndex: number, type: string, slotIndex: number, modId: number, lv: number) {
    const typeIndex = { 角色: 0, 近战: 1, 远程: 2, 同律: 3 }[type]
    if (typeIndex === undefined) return

    configs.value[configIndex].additionalMods[typeIndex][slotIndex] = [modId, lv]
}

function removeMod(configIndex: number, type: string, slotIndex: number) {
    const typeIndex = { 角色: 0, 近战: 1, 远程: 2, 同律: 3 }[type]
    if (typeIndex === undefined) return

    configs.value[configIndex].additionalMods[typeIndex].splice(slotIndex, 1)
}

// BUFF selection handlers for a specific configuration
function toggleBuff(configIndex: number, buff: LeveledBuff) {
    const index = configs.value[configIndex].additionalBuffs.findIndex((v) => v[0] === buff.名称)
    if (index > -1) {
        configs.value[configIndex].additionalBuffs.splice(index, 1)
    } else {
        configs.value[configIndex].additionalBuffs.push([buff.名称, buff.等级])
    }
}

function setBuffLv(configIndex: number, buff: LeveledBuff, lv: number) {
    const index = configs.value[configIndex].additionalBuffs.findIndex((v) => v[0] === buff.名称)
    if (index > -1) {
        configs.value[configIndex].additionalBuffs[index][1] = lv
    }
}

// Update configuration name
function updateConfigName(configIndex: number, name: string) {
    configs.value[configIndex].name = name
}

// Table customization
type ColumnKey = keyof CharAttr | `武器${keyof WeaponAttr}`
const visibleColumns = ref<ColumnKey[]>(["攻击", "生命", "护盾", "防御", "神智"])

const allColumns = [
    { key: "攻击" as const, label: "攻击" },
    { key: "生命" as const, label: "生命" },
    { key: "护盾" as const, label: "护盾" },
    { key: "防御" as const, label: "防御" },
    { key: "神智" as const, label: "神智" },
    { key: "增伤" as const, label: "伤害加成" },
    { key: "技能伤害" as const, label: "技能伤害" },
    { key: "减伤" as const, label: "伤害减免" },
    // Weapon attributes
    { key: "武器攻击" as const, label: "武器攻击" },
    { key: "武器暴击" as const, label: "武器暴击率" },
    { key: "武器暴伤" as const, label: "武器暴击伤害" },
    { key: "武器触发" as const, label: "武器触发率" },
    { key: "武器攻速" as const, label: "武器攻速" },
    { key: "武器多重" as const, label: "武器多重" },
    { key: "武器增伤" as const, label: "武器增伤" },
    { key: "武器独立增伤" as const, label: "武器独立增伤" },
    { key: "武器追加伤害" as const, label: "武器追加伤害" },
] as const

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
                <h2 class="text-xl font-semibold text-base-content">{{ $t("build-compare.input_section") }}</h2>
                <div class="text-xs text-gray-400 mb-4">{{ $t("build-compare.tip") }}</div>

                <!-- Multiple Configurations -->
                <div v-if="charProject.projects.length > 0 && charProject.selected" class="space-y-6">
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
                                        <input type="text" v-model="config.name" class="input input-sm input-bordered w-32" />
                                    </h3>
                                    <!-- Character Selection -->
                                    <div class="bg-base-200 rounded-lg flex items-center gap-4">
                                        <div class="text-xs text-gray-400">{{ $t("char-build.character") }}</div>
                                        <Select
                                            class="w-40 inline-flex justify-between input input-bordered input-sm"
                                            v-model="selectedChar"
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

                                    <!-- Project Selection -->
                                    <div class="bg-base-200 rounded-lg flex items-center gap-4">
                                        <div class="text-xs text-gray-400">{{ $t("build-compare.project_name") }}</div>
                                        <Select
                                            v-if="charProject.projects.length > 0"
                                            class="w-40 inline-flex justify-between input input-bordered input-sm"
                                            v-model="charProject.selected"
                                        >
                                            <SelectItem v-for="project in charProject.projects" :key="project.name" :value="project.name">
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
                                <button class="btn btn-primary btn-sm" @click="addConfiguration" :title="$t('build-compare.copy_config')">
                                    <Icon icon="ri:add-line" />
                                </button>
                                <button
                                    v-if="configs.length > 1"
                                    class="btn btn-error btn-sm"
                                    @click="removeConfiguration(index)"
                                    :title="$t('build-compare.remove_config')"
                                >
                                    <Icon icon="ri:delete-bin-line" />
                                </button>
                            </div>
                        </div>

                        <!-- Additional MOD List for this Configuration -->
                        <div class="mb-6">
                            <!-- Character MODs -->
                            <div v-if="modSlotCounts[0] > 0" class="mb-4">
                                <ModEditer
                                    :title="$t('char-build.char_mod_config')"
                                    :mods="Array(modSlotCounts[0]).fill(null)"
                                    :mod-options="
                                        modOptions.filter(
                                            (m) => m.type === '角色' && (!m.limit || m.limit === charBuilds[index]?.char.属性),
                                        )
                                    "
                                    :char-build="charBuilds[index]"
                                    @remove-mod="removeMod(index, '角色', $event)"
                                    @select-mod="selectMod(index, '角色', $event[0], $event[1], $event[2])"
                                    type="角色"
                                    :max-slots="modSlotCounts[0]"
                                />
                            </div>

                            <!-- Melee MODs -->
                            <div
                                v-if="
                                    modSlotCounts[1] > 0 &&
                                    (baseCharBuild.isMeleeWeapon || isTimeline || baseCharBuild.selectedSkill?.召唤物)
                                "
                                class="mb-4"
                            >
                                <ModEditer
                                    :title="$t('char-build.melee_weapon_mod_config')"
                                    :mods="Array(modSlotCounts[1]).fill(null)"
                                    :mod-options="
                                        modOptions.filter(
                                            (m) =>
                                                m.type === '近战' &&
                                                (!m.limit ||
                                                    [charBuilds[index]?.meleeWeapon.类别, charBuilds[index]?.meleeWeapon.伤害类型].includes(
                                                        m.limit,
                                                    )),
                                        )
                                    "
                                    :char-build="charBuilds[index]"
                                    @remove-mod="removeMod(index, '近战', $event)"
                                    @select-mod="selectMod(index, '近战', $event[0], $event[1], $event[2])"
                                    type="近战"
                                    :max-slots="modSlotCounts[1]"
                                />
                            </div>

                            <!-- Ranged MODs -->
                            <div v-if="modSlotCounts[2] > 0 && (baseCharBuild.isRangedWeapon || isTimeline)" class="mb-4">
                                <ModEditer
                                    :title="$t('char-build.ranged_weapon_mod_config')"
                                    :mods="Array(modSlotCounts[2]).fill(null)"
                                    :mod-options="
                                        modOptions.filter(
                                            (m) =>
                                                m.type === '远程' &&
                                                (!m.limit ||
                                                    [
                                                        charBuilds[index]?.rangedWeapon.类别,
                                                        charBuilds[index]?.rangedWeapon.伤害类型,
                                                    ].includes(m.limit)),
                                        )
                                    "
                                    :char-build="charBuilds[index]"
                                    @remove-mod="removeMod(index, '远程', $event)"
                                    @select-mod="selectMod(index, '远程', $event[0], $event[1], $event[2])"
                                    type="远程"
                                    :max-slots="modSlotCounts[2]"
                                />
                            </div>

                            <!-- Skill Weapon MODs -->
                            <div v-if="modSlotCounts[3] > 0 && (baseCharBuild.isSkillWeapon || isTimeline)" class="mb-4">
                                <ModEditer
                                    :title="$t('char-build.skill_weapon_mod_config')"
                                    :mods="Array(modSlotCounts[3]).fill(null)"
                                    :mod-options="
                                        modOptions.filter(
                                            (m) =>
                                                m.type === charBuilds[index]?.skillWeapon?.类型 &&
                                                (!m.limit ||
                                                    [
                                                        charBuilds[index]?.skillWeapon?.类别,
                                                        charBuilds[index]?.skillWeapon?.伤害类型,
                                                    ].includes(m.limit)),
                                        )
                                    "
                                    :char-build="charBuilds[index]"
                                    @remove-mod="removeMod(index, '同律', $event)"
                                    @select-mod="selectMod(index, '同律', $event[0], $event[1], $event[2])"
                                    type="同律"
                                    :max-slots="modSlotCounts[3]"
                                />
                            </div>
                        </div>

                        <!-- Additional BUFF List for this Configuration -->
                        <div id="buff-container" class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
                            <div class="flex flex-wrap items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <SectionMarker />
                                    <h3 class="text-lg font-semibold">{{ $t("char-build.buff_list") }}</h3>
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
                <h2 class="text-xl font-semibold mb-4 text-base-content">{{ $t("build-compare.results") }}</h2>

                <!-- Table Customization -->
                <div class="mb-4">
                    <h3 class="text-sm font-semibold mb-2 text-primary">{{ $t("build-compare.customize_table") }}</h3>
                    <div class="flex flex-wrap gap-4">
                        <label v-for="column in allColumns" :key="column.key" class="inline-flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" v-model="visibleColumns" :value="column.key" class="checkbox checkbox-primary" />
                            <span class="text-sm">{{ column.label }}</span>
                        </label>
                    </div>
                </div>

                <!-- Results Table -->
                <div class="overflow-x-auto">
                    <table class="table table-zebra w-full">
                        <thead>
                            <tr class="bg-base-200">
                                <th class="text-left">{{ $t("build-compare.configuration") }}</th>
                                <th class="text-right">
                                    {{ charSettings.baseName }} -
                                    {{ baseCharBuild?.selectedSkill?.召唤物?.名称 ? `[${baseCharBuild?.selectedSkill?.召唤物?.名称}]` : ""
                                    }}{{ charSettings.targetFunction }}
                                </th>
                                <th v-for="colKey in visibleColumns" :key="colKey" class="text-right">
                                    <!-- Get the display label for the column -->
                                    {{ allColumns.find((col) => col.key === colKey)?.label || colKey }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- One row per configuration -->
                            <tr v-for="(config, configIndex) in configs" :key="configIndex">
                                <!-- Configuration name -->
                                <td class="font-medium">{{ config.name }}</td>

                                <!-- Target function result -->
                                <td class="text-right">{{ Math.round(totalDamageList[configIndex]) }}</td>
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
            <div v-else-if="charProject.projects.length === 0" class="bg-base-100 rounded-xl p-6 shadow-lg text-center">
                <div class="text-lg font-medium mb-2 text-warning">{{ $t("build-compare.no_projects_available") }}</div>
                <div class="text-sm text-base-content/70">{{ $t("build-compare.create_project_first") }}</div>
            </div>

            <!-- No Project Selected Message -->
            <div v-else class="bg-base-100 rounded-xl p-6 shadow-lg text-center">
                <div class="text-lg font-medium mb-2 text-primary">{{ $t("build-compare.select_project_message") }}</div>
                <div class="text-sm text-base-content/70">{{ $t("build-compare.select_project_to_compare") }}</div>
            </div>
        </div>
    </div>
</template>
