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

const model = defineModel<boolean>("modelShow")

function openWeaponSelect() {
    emit("openWeaponSelect")
    model.value = true
}

interface DynamicAttrSource {
    sourceName: string
    value: number
}

/**
 * 通过“移除单个动态BUFF后重算”的方式，得到每个动态来源对武器属性的实际数值贡献。
 */
const dynamicWeaponAttrSourceMap = computed<Record<string, DynamicAttrSource[]>>(() => {
    const sourceMap: Record<string, DynamicAttrSource[]> = {}
    const epsilon = 1e-10

    props.charBuild.dynamicBuffs.forEach((buff, buffIndex) => {
        const buildWithoutBuff = props.charBuild.clone()
        buildWithoutBuff.dynamicBuffs = props.charBuild.dynamicBuffs.filter((_, index) => index !== buffIndex).map(item => item.clone())
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
                <Select v-if="wkey !== 'skill'" v-model="charSettings[`${wkey}WeaponRefine`]" hidebtn class="text-sm text-primary">
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
                                <div class="text-base-content/80">基础{{ key }}</div>
                                {{
                                    formatWeaponProp(
                                        key === "攻击" ? "基础攻击" : key,
                                        (baseWeapon as LeveledWeapon)[("基础" + key) as keyof LeveledWeapon]!
                                    )
                                }}
                            </li>
                            <li v-if="'射速' in baseWeapon && key === '攻速'" class="flex justify-between gap-8 text-sm text-primary">
                                <div class="text-base-content/80">基础{{ key }}</div>
                                {{ formatWeaponProp("基础攻击", (baseWeapon as LeveledWeapon)["射速"]!) }}
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
                                v-for="(mod, index) in charBuild[`${baseKey}Mods`].filter((m): m is LeveledMod => m && m[key])"
                                :key="index"
                                class="flex justify-between gap-8 text-sm text-primary"
                            >
                                <div class="text-base-content/80">{{ $t(mod.名称) }}</div>
                                {{ format100r(mod[key]!) }}
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
                        </ul>
                    </div>
                </template>
                <div
                    class="cursor-pointer flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md rounded-md"
                    @click="$emit('addSkill', `${wkey}::${key}`)"
                >
                    <div class="text-sm text-base-content/80">
                        {{ key === "攻击" ? $t(`${charBuild[`${wkey}Weapon`]!.伤害类型}`) : "" }}{{ $t(key) }}
                    </div>
                    <div class="text-primary font-bold text-sm font-orbitron">
                        {{ formatWeaponProp(["攻速", "多重", "弹匣", "装填"].includes(key) ? "基础攻击" : key, val) }}
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
