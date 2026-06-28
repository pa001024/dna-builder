<script setup lang="ts">
import { computed } from "vue"
import { useCharSettings } from "@/composables/useCharSettings"
import { CharAttr, CharBuild, LeveledMod, LeveledWeapon } from "@/data"
import { format100, format100r, formatWeaponProp } from "@/util"

const props = defineProps<{
    charBuild: CharBuild
    wkey: "melee" | "ranged" | "skill"
    attributes: CharAttr
}>()

const nameRef = computed(() => props.charBuild.char.名称)
const charSettings = useCharSettings(nameRef)
const weaponAttrs = computed(() => props.charBuild.calculateWeaponAttributes(props.charBuild[`${props.wkey}Weapon`]).weapon!)

const emit = defineEmits<{
    addSkill: [skill: string]
    openWeaponSelect: []
}>()

const baseWeapon = computed(() => {
    let wkey = props.wkey
    if (props.wkey == "skill" && props.charBuild.skillWeapon!.inherit) {
        wkey = props.charBuild.skillWeapon!.inherit
    }
    return props.charBuild[`${wkey}Weapon`]!
})

const baseKey = computed(() => {
    let wkey = props.wkey
    if (props.wkey == "skill" && props.charBuild.skillWeapon!.inherit) {
        wkey = props.charBuild.skillWeapon!.inherit
    }
    return wkey
})

/**
 * 判断当前面板是否为 inherit 型同律武器的攻击词条。
 * @param key 属性键名
 * @returns 是否需要展示属性转换标记
 */
function isInheritedAttackLabel(key: string) {
    return key === "攻击" && props.wkey === "skill" && !!props.charBuild.skillWeapon?.inherit && props.charBuild.skillWeapon?.atk === "all"
}

/**
 * 获取武器攻击展示前缀。
 * @param key 属性键名
 * @returns 展示前缀 key
 */
function getWeaponAttackLabelPrefix(key: string) {
    if (key !== "攻击") return ""
    if (isInheritedAttackLabel(key)) {
        return `${props.charBuild.char.属性}属性`
    }
    return props.charBuild[`${props.wkey}Weapon`]!.伤害类型
}

/**
 * 获取 inherit 型同律攻击的来源说明。
 * @returns tooltip 文案
 */
function getInheritedAttackTooltip() {
    return baseWeapon.value.伤害类型
}

const model = defineModel<boolean>("modelShow")

function openWeaponSelect() {
    emit("openWeaponSelect")
    model.value = true
}

interface DynamicAttrSource {
    sourceName: string
    value: number
}

interface ModAttrSource {
    mod: LeveledMod
    value: number
}

/**
 * 获取当前武器面板对应的BUFF属性前缀。
 * @returns BUFF属性前缀
 */
function getBuffWeaponPrefix() {
    if (props.wkey === "skill") {
        return props.charBuild.skillWeapon?.inherit === "melee"
            ? "近战"
            : props.charBuild.skillWeapon?.inherit === "ranged"
              ? "远程"
              : "同律"
    }
    return props.wkey === "melee" ? "近战" : "远程"
}

/**
 * 记录动态BUFF对武器属性的显示来源。
 * code型BUFF用移除后重算的差值，attr型BUFF直接显示写入字段值。
 */
const dynamicWeaponAttrSourceMap = computed<Record<string, DynamicAttrSource[]>>(() => {
    const sourceMap: Record<string, DynamicAttrSource[]> = {}
    const epsilon = 1e-10
    const buffWeaponPrefix = getBuffWeaponPrefix()

    props.charBuild.dynamicBuffs.forEach(buff => {
        const buildWithoutBuff = props.charBuild.clone()
        buildWithoutBuff.dynamicBuffs = buildWithoutBuff.dynamicBuffs.filter(item => item.名称 !== buff.名称)
        const weaponWithoutBuff = buildWithoutBuff[`${props.wkey}Weapon`]
        const weaponAttrsWithoutBuff = weaponWithoutBuff ? buildWithoutBuff.calculateWeaponAttributes(weaponWithoutBuff).weapon : undefined
        if (!weaponAttrsWithoutBuff) return

        Object.entries(weaponAttrs.value).forEach(([attrKey, attrValue]) => {
            const withoutValue = weaponAttrsWithoutBuff[attrKey as keyof typeof weaponAttrsWithoutBuff]
            if (typeof attrValue !== "number" || typeof withoutValue !== "number") return

            const delta = attrValue - withoutValue
            if (Math.abs(delta) < epsilon) return

            sourceMap[attrKey] ||= []
            sourceMap[attrKey].push({
                sourceName: buff.名称,
                value: delta,
            })
        })
    })

    props.charBuild.buffs
        .filter(buff => buff.attr)
        .forEach(buff => {
            const preparedBuff = props.charBuild.prepareBuff(buff)
            Object.entries(preparedBuff.getProperties()).forEach(([attrKey, attrValue]) => {
                if (!attrKey.startsWith(buffWeaponPrefix) || typeof attrValue !== "number") return
                const weaponAttrKey = attrKey.slice(buffWeaponPrefix.length)
                if (!weaponAttrKey || !(weaponAttrKey in weaponAttrs.value)) return
                if (Math.abs(attrValue) < epsilon) return

                sourceMap[weaponAttrKey] ||= []
                sourceMap[weaponAttrKey].push({
                    sourceName: buff.名称,
                    value: attrValue,
                })
            })
        })

    return sourceMap
})

const modAttributeBonusSources = computed(() => {
    const modAttributeBonus = props.charBuild.getTotalBonus(`${props.charBuild.char.属性}MOD属性`)

    if (modAttributeBonus > 0) {
        const modsBySeries = props.charBuild.charMods.filter(
            (mod): mod is LeveledMod => mod !== null && CharBuild.elmSeries.includes(mod.系列)
        )
        return modsBySeries
    }
    return []
})

/**
 * 获取 MOD 在当前武器面板下的展示值。
 * 优先展示当前属性键，其次兼容带 scope 前缀的属性键。
 * @param mod 目标 MOD
 * @param key 当前武器属性键名
 * @returns 可展示的属性值
 */
function getModSourceValue(mod: LeveledMod, key: string) {
    const exactValue = mod[key]
    if (typeof exactValue === "number") {
        return exactValue
    }

    const scopedValue = mod[`${getBuffWeaponPrefix()}${key}`]
    if (typeof scopedValue !== "number") {
        return undefined
    }

    return scopedValue
}

const modSourceMap = computed<Record<string, ModAttrSource[]>>(() => {
    const sourceMap: Record<string, ModAttrSource[]> = {}
    const pushSource = (mod: LeveledMod, key: string) => {
        const value = getModSourceValue(mod, key)
        if (value === undefined) return

        sourceMap[key] ||= []
        sourceMap[key].push({ mod, value })
    }

    props.charBuild.charMods.forEach(mod => {
        if (!mod) return
        Object.keys(weaponAttrs.value).forEach(key => {
            if (key !== "攻击") pushSource(mod, key)
        })
    })

    props.charBuild[`${baseKey.value}Mods`].forEach(mod => {
        if (!mod) return
        Object.keys(weaponAttrs.value).forEach(key => pushSource(mod, key))
    })

    return sourceMap
})
</script>
<template>
    <!-- 武器 -->
    <div
        v-if="charBuild[`${wkey}Weapon`] && weaponAttrs"
        class="bg-base-100/50 backdrop-blur-sm rounded-md shadow-md p-4 space-y-3 border border-base-200"
    >
        <h3 class="flex items-center gap-4 text-lg font-bold text-base-content/90 mb-2">
            <div class="flex flex-1 flex-col" data-tour="weapon-select">
                <div class="text-lg font-bold cursor-pointer" @click="wkey !== 'skill' && openWeaponSelect()">
                    {{ $t(charBuild[`${wkey}Weapon`]!.名称 || "") }}
                    <Icon v-if="wkey !== 'skill'" icon="ri:exchange-line" class="inline-block w-5 h-5 text-primary" />
                </div>
                <Select
                    v-if="wkey !== 'skill' && !charBuild[`${wkey}Weapon`]._originalWeaponData.熔炉"
                    v-model="charSettings[`${wkey}WeaponRefine`]"
                    hidebtn
                    class="text-sm text-primary"
                >
                    <SelectItem v-for="i in [0, 1, 2, 3, 4, 5]" :key="i" :value="i">{{ $t("精炼") + i }}</SelectItem>
                </Select>
            </div>
            <div class="ml-auto flex flex-none">
                Lv. {{ wkey === "skill" ? charSettings.charLevel : charSettings[`${wkey}WeaponLevel`] }}
            </div>
        </h3>
        <div class="flex items-center gap-2 text-sm p-1">
            <div class="flex-1">
                <input
                    v-if="wkey !== 'skill'"
                    v-model.number="charSettings[`${wkey}WeaponLevel`]"
                    type="range"
                    class="range range-primary range-xs w-full"
                    min="1"
                    max="80"
                    step="1"
                />
                <input
                    v-else
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
        <div class="space-y-1">
            <CharAttrShow
                :attributes="attributes"
                :char-build="charBuild"
                :include-keys="wkey === 'skill' ? ['攻击', '技能威力'] : ['攻击']"
            />
            <FullTooltip
                v-for="[key, val] in Object.entries(weaponAttrs).filter(
                    ([k, v]) => v && (!charBuild[`${wkey}Weapon`]?.类型.includes('近战') || k !== '多重')
                )"
                :key="key"
                side="bottom"
            >
                <template #tooltip>
                    <div class="flex flex-col gap-2">
                        <div class="text-base-content/50 text-xs">{{ $t(key) }}</div>
                        <ul class="space-y-1">
                            <li v-if="'基础' + key in baseWeapon" class="flex justify-between gap-8 text-sm text-primary">
                                <div class="text-base-content/80">
                                    {{
                                        key === "攻击"
                                            ? $t("char-build.base_weapon_attack_label", { dmg: $t(getWeaponAttackLabelPrefix(key)) })
                                            : $t("char-build.base_attr_label", { attr: $t(key) })
                                    }}
                                </div>
                                {{
                                    formatWeaponProp(
                                        key === "攻击" ? "基础攻击" : key,
                                        (baseWeapon as LeveledWeapon)[("基础" + key) as keyof LeveledWeapon]!
                                    )
                                }}
                            </li>
                            <li v-if="key === '攻速'" class="flex justify-between gap-8 text-sm text-primary">
                                <div class="text-base-content/80">{{ $t("char-build.base_attr_label", { attr: $t(key) }) }}</div>
                                {{ formatWeaponProp("基础攻击", (baseWeapon as LeveledWeapon)["射速"] ?? 1) }}
                            </li>
                            <!-- 角色自带加成 -->
                            <li
                                v-if="key != '攻击' && key in (charBuild.char.加成 || {})"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ $t(charBuild.char.名称) }}</div>
                                {{ format100r(charBuild.char.加成![key]!) }}
                            </li>
                            <!-- 武器特效自身暴击攻速等 -->
                            <li
                                v-if="wkey !== 'skill' && key != '攻击' && key in (baseWeapon || {})"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ $t(baseWeapon.名称) }}</div>
                                {{ format100r((baseWeapon as LeveledWeapon)[key]!) }}
                            </li>
                            <!-- 武器BUFF给所有武器的加成 -->
                            <li
                                v-if="charBuild.meleeWeapon.buffProps && key in charBuild.meleeWeapon.buffProps"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ charBuild.meleeWeapon.名称 }}</div>
                                {{ format100r(charBuild.meleeWeapon.buffProps[key]!) }}
                            </li>
                            <li
                                v-if="charBuild.rangedWeapon.buffProps && key in charBuild.rangedWeapon.buffProps"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ charBuild.rangedWeapon.名称 }}</div>
                                {{ format100r(charBuild.rangedWeapon.buffProps[key]!) }}
                            </li>
                            <li
                                v-for="(source, index) in modSourceMap[key] || []"
                                :key="`${source.mod.id}-${key}-${index}`"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ $t(source.mod.名称) }}</div>
                                {{ format100r(source.value) }}
                            </li>
                            <li
                                v-for="(buff, index) in charBuild.buffs.filter(b => !['攻击', '增伤'].includes(key) && b[key])"
                                :key="index"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ buff.名称 }}</div>
                                {{ format100r(buff[key]!) }}
                            </li>
                            <li
                                v-for="(dynamicSource, index) in dynamicWeaponAttrSourceMap[key] || []"
                                :key="`${dynamicSource.sourceName}-${index}`"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ dynamicSource.sourceName }}</div>
                                {{ format100r(dynamicSource.value) }}
                            </li>
                            <li
                                v-if="
                                    key === '攻击' &&
                                    (charBuild.char.精通.includes(charBuild[`${wkey}Weapon`]!.类别) ||
                                        charBuild.char.精通.includes('全部类型'))
                                "
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">武器精通</div>
                                *{{ format100(1.2) }}
                            </li>
                            <li
                                v-if="
                                    charBuild.getTotalBonus(`${charBuild.char.属性}MOD属性`) > 0 &&
                                    modAttributeBonusSources.some(v => v.addAttr[key])
                                "
                                v-for="(buff, index) in charBuild.buffs.filter(b => b[`${charBuild.char.属性}MOD属性`])"
                                :key="index"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ buff.名称 }}</div>
                                {{
                                    format100r(
                                        modAttributeBonusSources.reduce((v, r) => v + (r.addAttr[key] ?? 0), 0) *
                                            buff[`${charBuild.char.属性}MOD属性`]!
                                    )
                                }}
                            </li>
                        </ul>
                    </div>
                </template>
                <div
                    class="cursor-pointer flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md rounded-md"
                    @click="$emit('addSkill', `${wkey}::${key}`)"
                >
                    <div class="flex items-center gap-1 text-sm text-base-content/80">
                        <span>{{
                            key === "攻击" ? $t("char-build.weapon_attack_label", { dmg: $t(getWeaponAttackLabelPrefix(key)) }) : $t(key)
                        }}</span>
                        <FullTooltip v-if="isInheritedAttackLabel(key)" side="top">
                            <template #tooltip>
                                <div class="text-sm text-base-content">
                                    {{ $t("char-build.weapon_attack_converted_from", { dmg: $t(getInheritedAttackTooltip()) }) }}
                                </div>
                            </template>
                            <button class="inline-flex text-base-content/60 hover:text-primary" @click.stop>
                                <Icon icon="ri:question-line" class="h-3.5 w-3.5" />
                            </button>
                        </FullTooltip>
                    </div>
                    <div class="text-primary font-bold text-sm font-orbitron">
                        {{ formatWeaponProp(["攻速", "多重", "弹匣", "装填", "弹药"].includes(key) ? "基础攻击" : key, val) }}
                    </div>
                </div>
            </FullTooltip>
        </div>
        <!-- 技能选择 -->
        <SkillTabs
            :skills="charBuild[`${wkey}WeaponSkills`]"
            :selected-skill-name="charSettings.baseName"
            @select="charSettings.baseName = $event"
        />
        <SkillFields
            v-if="charBuild[`is_${wkey}`] && charBuild.selectedSkill"
            :skill="charBuild.selectedSkill"
            :selected-identifiers="charBuild.getIdentifierNames(charBuild.targetFunction)"
            :char-build="charBuild"
            :attributes="attributes"
            @add-skill="$emit('addSkill', $event)"
        />
        <div v-else class="flex justify-center items-center text-sm opacity-60">未选择技能</div>
    </div>
</template>
