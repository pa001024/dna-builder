<script setup lang="ts">
import { computed } from "vue"
import { useCharSettings } from "@/composables/useCharSettings"
import { CharAttr, CharBuild, LeveledChar, LeveledMod } from "@/data"
import { format100r } from "@/util"

const props = withDefaults(
    defineProps<{
        attributes: CharAttr
        charBuild: CharBuild
        excludeKeys?: string[]
        includeKeys?: string[]
    }>(),
    {
        excludeKeys: () => ["召唤物攻击速度", "召唤物范围", "召唤物属性继承比例"],
    }
)
const charIdRef = computed(() => props.charBuild?.char?.id || 0)
const charSettings = useCharSettings(charIdRef)

defineEmits<{
    addSkill: [skill: string]
}>()

interface DynamicAttrSource {
    sourceName: string
    value: number
}

/**
 * 通过“移除单个动态BUFF后重算”的方式，得到每个动态来源对角色属性的实际数值贡献。
 */
const dynamicAttrSourceMap = computed<Record<string, DynamicAttrSource[]>>(() => {
    const sourceMap: Record<string, DynamicAttrSource[]> = {}
    const epsilon = 1e-10

    props.charBuild.dynamicBuffs.forEach((buff, buffIndex) => {
        const buildWithoutBuff = props.charBuild.clone()
        buildWithoutBuff.dynamicBuffs = props.charBuild.dynamicBuffs.filter((_, index) => index !== buffIndex).map(item => item.clone())
        // 与 attributes 保持同一武器作用域计算，避免充盈威力/召唤物独立增伤等转化属性产生上下文差异的虚假差值
        const attrsWithoutBuff = buildWithoutBuff.calculateWeaponAttributes()

        Object.entries(props.attributes).forEach(([attrKey, attrValue]) => {
            const withoutValue = attrsWithoutBuff[attrKey as keyof CharAttr]
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

/**
 * 各武器对角色充盈威力的武器转化来源（武器转化充盈威力），用于充盈威力来源明细。
 * 与 CharBuild.calculateWeaponAttributes 的汇总逻辑保持一致，仅保留非零贡献的武器。
 */
const fullnessWeaponSources = computed(() => props.charBuild.getFullnessWeaponSources().filter(source => Math.abs(source.value) > 1e-10))

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
 * 角色属性行的实际加成来源字段名：角色「攻击」属性由「属性攻击」百分比乘区贡献
 * （角色攻击 = 角色基础攻击 × (1 + 角色攻击加成 + 和鸣增益) × (1 + 属性攻击) + 固定攻击）。
 * @param key 展示的属性键名
 * @returns 对应的加成来源字段名
 */
function attrSourceKey(key: string): string {
    return key === "攻击" ? "属性攻击" : key
}

/**
 * 动态来源的展示格式与主属性保持一致：数值型属性（攻击/生命/护盾/防御/神智/有效生命）按带符号数值展示，
 * 其余百分比型属性按带符号百分比展示，避免 flat 差值（如「法露茜Q」将攻击百位转化生命）被误显示为百分比。
 * @param key 属性键名
 * @param value 来源贡献值
 * @returns 展示字符串
 */
function formatDynamicSource(key: string, value: number): string {
    if (["攻击", "生命", "护盾", "防御", "神智", "有效生命"].includes(key)) {
        return `${value >= 0 ? "+" : ""}${+value.toFixed(key === "攻击" ? 2 : 0)}`
    }
    return format100r(value)
}

/**
 * 角色属性行的附加来源字段：攻击 行额外展示「属性攻击」（百分比乘区）与「固定攻击」（平值），
 * 生命 行额外展示「固定生命」（平值）。基础字段（攻击/生命等）由既有来源块处理。
 * @param key 展示的属性键名
 * @returns 附加来源字段名列表
 */
function extraAttrSourceKeys(key: string): string[] {
    if (key === "攻击") return ["属性攻击", "固定攻击"]
    if (key === "生命") return ["固定生命"]
    return []
}

/**
 * 附加来源数值的展示格式：属性攻击 为百分比，固定攻击/固定生命 为带符号平值。
 * @param key 展示的属性键名
 * @param sourceField 来源字段名
 * @param value 来源贡献值
 * @returns 展示字符串
 */
function formatExtraSource(key: string, sourceField: string, value: number): string {
    if (sourceField === "属性攻击") return format100r(value)
    return formatDynamicSource(key, value)
}
</script>
<template>
    <FullTooltip
        v-for="[key, val] in Object.entries(attributes).filter(([k, v]) =>
            includeKeys ? includeKeys.includes(k) : !excludeKeys.includes(k) && typeof v === 'number' && v
        )"
        :key="key"
        side="bottom"
    >
        <template #tooltip>
            <div class="flex flex-col gap-2">
                <div class="text-base-content/50 text-xs">
                    {{ $t(key) }}
                </div>
                <div v-if="key === '有效生命'" class="text-sm text-primary">(生命 / (1 - 防御 / (300 + 防御)) + 护盾) / (1 - 减伤)</div>
                <ul class="space-y-1">
                    <li v-if="'基础' + key in charBuild.char" class="flex justify-between gap-8 text-sm text-primary">
                        <div class="text-base-content/80">{{ $t("char-build.base_attr_label", { attr: $t(key) }) }}</div>
                        {{ charBuild.char[("基础" + key) as keyof LeveledChar] }}
                    </li>
                    <li v-if="charBuild.char.加成 && key in charBuild.char.加成" class="flex justify-between gap-8 text-sm text-primary">
                        <div class="text-base-content/80">{{ $t(charBuild.char.名称) }}</div>
                        {{ format100r(charBuild.char.加成[key]!) }}
                    </li>
                    <li v-if="['生命', '护盾', '防御', '攻击'].includes(key)" class="flex justify-between gap-8 text-sm text-primary">
                        <div class="text-base-content/80">{{ $t("char-build.resonance_gain") }}</div>
                        {{ format100r(charSettings.resonanceGain) }}
                    </li>
                    <li v-if="key in (charBuild.meleeWeapon.addAttr || {})" class="flex justify-between gap-8 text-sm text-primary">
                        <div class="text-base-content/80">
                            {{ $t(charBuild.meleeWeapon.名称) }}
                        </div>
                        {{ format100r(charBuild.meleeWeapon.addAttr[key]!) }}
                    </li>
                    <li v-if="key in (charBuild.rangedWeapon.addAttr || {})" class="flex justify-between gap-8 text-sm text-primary">
                        <div class="text-base-content/80">
                            {{ $t(charBuild.rangedWeapon.名称) }}
                        </div>
                        {{ format100r(charBuild.rangedWeapon.addAttr[key]!) }}
                    </li>
                    <li
                        v-for="(mod, index) in [charBuild.auraMod].filter((m): m is LeveledMod => m && m[key])"
                        :key="index"
                        class="flex justify-between gap-8 text-sm text-primary"
                    >
                        <div class="text-base-content/80">
                            {{ $t(mod.名称) }}
                        </div>
                        {{ format100r(mod[key]!) }}
                    </li>
                    <li
                        v-for="(mod, index) in charBuild.charMods.filter((m): m is LeveledMod => m && m[key])"
                        :key="index"
                        class="flex justify-between gap-8 text-sm text-primary"
                    >
                        <div class="text-base-content/80">
                            {{ $t(mod.名称) }}
                        </div>
                        {{ format100r(mod[key]!) }}
                    </li>
                    <template v-for="sourceField in extraAttrSourceKeys(key)" :key="sourceField">
                        <li
                            v-for="(mod, index) in [
                                ...[charBuild.auraMod].filter((m): m is LeveledMod => m != null && typeof m[sourceField] === 'number'),
                                ...charBuild.charMods.filter((m): m is LeveledMod => m != null && typeof m[sourceField] === 'number'),
                            ]"
                            :key="`extra-mod-${sourceField}-${index}`"
                            class="flex justify-between gap-8 text-sm text-primary"
                        >
                            <div class="text-base-content/80">
                                {{ $t(mod.名称) }}
                            </div>
                            {{ sourceField === '属性攻击' ? '(*)' : '' }}{{ formatExtraSource(key, sourceField, mod[sourceField]!) }}
                        </li>
                        <li
                            v-for="(buff, index) in charBuild.buffs.filter(b => typeof b[sourceField] === 'number')"
                            :key="`extra-buff-${sourceField}-${index}`"
                            class="flex justify-between gap-8 text-sm text-primary"
                        >
                            <div class="text-base-content/80">
                                {{ buff.名称 }}
                            </div>
                            {{ sourceField === '属性攻击' ? '(*)' : '' }}{{ formatExtraSource(key, sourceField, buff[sourceField]!) }}
                        </li>
                    </template>
                    <li
                        v-for="(buff, index) in charBuild.buffs.filter(b => b[key])"
                        :key="index"
                        class="flex justify-between gap-8 text-sm text-primary"
                    >
                        <div class="text-base-content/80">
                            {{ buff.名称 }}
                        </div>
                        {{ format100r(buff[key]!) }}
                    </li>
                    <li
                        v-for="(dynamicSource, index) in dynamicAttrSourceMap[key] || []"
                        :key="`${dynamicSource.sourceName}-${index}`"
                        class="flex justify-between gap-8 text-sm text-primary"
                    >
                        <div class="text-base-content/80">{{ dynamicSource.sourceName }}</div>
                        {{ formatDynamicSource(key, dynamicSource.value) }}
                    </li>
                    <li
                        v-for="(source, index) in key === '充盈威力' ? fullnessWeaponSources : []"
                        :key="`fullness-weapon-${index}`"
                        class="flex justify-between gap-8 text-sm text-primary"
                    >
                        <div class="text-base-content/80">{{ $t(source.weapon.名称) }}</div>
                        {{ format100r(source.value) }}
                    </li>
                    <li
                        v-if="
                            charBuild.getTotalBonus(`${charBuild.char.属性}MOD属性`) > 0 &&
                            modAttributeBonusSources.some(v => v.addAttr[attrSourceKey(key)])
                        "
                        v-for="(buff, index) in charBuild.buffs.filter(b => b[`${charBuild.char.属性}MOD属性`])"
                        :key="index"
                        class="flex justify-between gap-8 text-sm text-primary"
                    >
                        <div class="text-base-content/80">{{ buff.名称 }}</div>
                        {{
                            (key === "攻击" ? $t(`${charBuild.char.属性}属性`) : "") +
                            format100r(
                                modAttributeBonusSources.reduce((v, r) => v + (r.addAttr[attrSourceKey(key)] ?? 0), 0) *
                                    buff[`${charBuild.char.属性}MOD属性`]!
                            )
                        }}
                    </li>
                </ul>
            </div>
        </template>
        <div
            class="cursor-pointer flex justify-between items-center p-1 px-2 rounded-xs transition-all duration-200 hover:bg-base-100 hover:shadow-sm"
            :class="{
                'shadow-md shadow-primary/50 text-shadow-sm outline outline-primary': charBuild
                    .getIdentifierNames(charBuild.targetFunction)
                    .includes(key),
            }"
            @click="$emit('addSkill', key)"
        >
            <div class="text-sm text-base-content/80">{{ key === "攻击" ? $t(`${charBuild.char.属性}属性`) : "" }}{{ $t(key) }}</div>
            <div class="text-primary font-bold text-sm font-orbitron">
                {{
                    ["攻击", "生命", "护盾", "防御", "神智", "有效生命"].includes(key)
                        ? `${+val.toFixed(key === "攻击" ? 2 : 0)}`
                        : `${+(val * 100).toFixed(2)}%`
                }}
            </div>
        </div>
    </FullTooltip>
</template>
