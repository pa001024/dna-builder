<script setup lang="ts">
import { computed } from "vue"
import type { CharSettings } from "@/composables/useCharSettings"
import type { CharAttr, CharBuild } from "@/data"
import { formatSkillProp } from "@/util"

const props = defineProps<{
    charBuild: CharBuild
    attributes: CharAttr
    charName: string
    charSettings: CharSettings // readonly
}>()

// 计算武器属性
const weaponAttrs = computed(() => (props.charBuild.selectedWeapon ? props.charBuild.calculateWeaponAttributes().weapon : null))
// 计算总伤害
const totalDamage = computed(() => props.charBuild.calculate())

const summonAttributes = computed(() => {
    const skill = props.charBuild.selectedSkill
    if (skill?.召唤物) {
        const attrs = props.charBuild.calculateWeaponAttributes(props.charBuild.meleeWeapon)
        return skill.getSummonAttrs(attrs)
    }
    return undefined
})

/**
 * 判断当前武器属性名是否为 inherit 型同律攻击。
 * @param key 属性键名
 * @returns 是否需要按属性攻击展示
 */
function isInheritedWeaponAttack(key: string) {
    return (
        key === "攻击" &&
        !!props.charBuild.skillWeapon?.inherit &&
        props.charBuild.skillWeapon?.atk === "all" &&
        props.charBuild.selectedWeapon === props.charBuild.skillWeapon
    )
}

/**
 * 获取武器攻击展示前缀。
 * @param key 属性键名
 * @returns 展示前缀 key
 */
function getWeaponAttackLabelPrefix(key: string) {
    if (key !== "攻击") return ""
    if (isInheritedWeaponAttack(key)) {
        return `${props.charBuild.char.属性}属性`
    }
    return props.charBuild.selectedWeapon?.伤害类型 || ""
}
</script>
<template>
    <!-- 角色头部信息 -->
    <div class="flex flex-col md:flex-row gap-6 mb-6 mt-2">
        <div class="relative w-32 h-32 md:w-40 md:h-40 rounded-xs overflow-hidden border-2 border-primary/30 shadow-xl self-start">
            <ImageFallback :src="charBuild.char.url" alt="角色头像" class="w-full h-full object-cover object-top">
                <Icon icon="ri:question-mark" class="w-full h-full" />
            </ImageFallback>
            <div class="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
        </div>
        <div class="flex-1 flex flex-col justify-end gap-4">
            <!-- 角色 -->
            <div class="flex items-center justify-between">
                <h3 class="text-4xl font-bold text-base-content/80 flex items-center gap-2">
                    <img :src="charBuild.char.elementUrl" :alt="charBuild.char.属性" class="h-12 w-8 object-cover" />
                    {{ $t(charName) }}
                </h3>

                <span class="inline-flex items-center gap-1 rounded-xs bg-primary px-3 py-1 font-orbitron text-sm font-semibold text-primary-content tabular-nums"
                    >LV {{ charBuild.char.等级 }}</span
                >
            </div>
            <div class="flex gap-4 flex-wrap">
                <BuildWeaponCard :weapon="charBuild.meleeWeapon" class="flex-1" />
                <BuildWeaponCard :weapon="charBuild.rangedWeapon" class="flex-1" />
            </div>
        </div>
    </div>

    <!-- 属性展示 -->
    <div class="space-y-6">
        <!-- 角色属性 -->
        <div>
            <SectionHeader number="01" kicker="STATS" :title="$t('char-build.char_attributes')" no-animate>
                <template #trailing>
                    <span class="text-[11px] font-medium text-base-content/50"
                        >{{ $t("char-build.resonance_gain") }} {{ charSettings.resonanceGain * 100 }}%</span
                    >
                </template>
            </SectionHeader>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <div
                    class="col-span-2 rounded-xs bg-linear-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 p-3 transition-colors duration-200"
                >
                    <div class="text-xs text-base-content/60 mb-1">
                        {{ charSettings.baseName }} -
                        {{ charBuild.selectedSkill?.召唤物?.名称 ? `[${charBuild.selectedSkill?.召唤物?.名称}]` : ""
                        }}{{ charSettings.targetFunction || $t("伤害") }}
                    </div>
                    <div class="text-primary font-bold text-lg font-orbitron group">
                        <span class="group-hover:hidden">
                            {{ Math.round(totalDamage) }}
                        </span>
                        <span class="hidden group-hover:inline">
                            {{ Math.round(totalDamage * 0.95) }} ~ {{ Math.round(totalDamage * 1.05) }}
                        </span>
                    </div>
                </div>
                <div
                    v-for="[key, val] in Object.entries(attributes).filter(([k, v]) => !['召唤物攻击速度', '召唤物范围'].includes(k) && typeof v === 'number' && v)"
                    :key="key"
                    class="rounded-xs bg-linear-to-br from-secondary/10 to-secondary/5 border border-secondary/20 hover:border-secondary/40 p-3 transition-colors duration-200"
                >
                    <div class="text-xs text-base-content/60 mb-1">
                        {{ key === "攻击" ? $t(getWeaponAttackLabelPrefix(key)) : "" }}{{ $t(key) }}
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
            <SectionHeader
                number="02"
                kicker="SUMMON"
                :title="summonAttributes.find(p => p.名称 === '召唤物名称')?.格式 || '召唤物'"
                no-animate
            />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <div
                    v-for="prop in summonAttributes.filter(p => p.值)"
                    :key="prop.名称"
                    class="rounded-xs bg-linear-to-br from-secondary/10 to-secondary/5 border border-secondary/20 p-3"
                >
                    <div class="text-xs text-base-content/60 mb-1">
                        {{ prop.名称 }}
                    </div>
                    <div class="text-secondary font-bold text-lg font-orbitron">
                        {{ formatSkillProp(prop.名称, prop) }}
                    </div>
                </div>
            </div>
        </div>

        <!-- 武器属性 -->
        <div v-if="charBuild.selectedWeapon && weaponAttrs">
            <SectionHeader number="03" kicker="WEAPON" :title="$t('char-build.weapon_attributes')" no-animate />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <div
                    v-for="[key, val] in Object.entries(weaponAttrs).filter(([_, v]) => v)"
                    :key="key"
                    class="rounded-xs bg-linear-to-br from-secondary/10 to-secondary/5 border border-secondary/20 p-3"
                >
                    <div class="text-xs text-base-content/60 mb-1">
                        {{ key === "攻击" ? $t("char-build.weapon_attack_label", { dmg: $t(getWeaponAttackLabelPrefix(key)) }) : $t(key) }}
                    </div>
                    <div class="text-secondary font-bold text-lg font-orbitron">
                        {{ ["攻击", "攻速", "多重", "弹匣", "装填"].includes(key) ? `${+val.toFixed(2)}` : `${+(val * 100).toFixed(2)}%` }}
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
        <template v-for="key in ['charMods', 'meleeMods', 'rangedMods', 'skillMods'] satisfies (keyof CharBuild)[]" :key="key">
            <div v-if="charBuild[key].filter(v => v).length > 0">
                <SectionHeader number="04" kicker="MODS" :title="`${$t(`char-build.${key.slice(0, -4)}`)}MOD`" no-animate />
                <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                    <div
                        v-for="mod in charBuild[key].reduce((r, v) => {
                            if (!v) return r
                            if (r[v.名称]) {
                                r[v.名称].count += 1
                            } else {
                                r[v.名称] = { count: 1, mod: v }
                            }
                            return r
                        }, {} as any)"
                        :key="mod.mod.名称"
                        class="relative flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-100/70 px-3 py-2 text-sm"
                    >
                        <!-- 重复数量角标（右上角） -->
                        <span
                            v-if="mod.count > 1"
                            class="absolute -top-2 -right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-primary px-1 font-orbitron text-[11px] font-semibold text-primary-content tabular-nums"
                            >×{{ mod.count }}</span
                        >
                        <img class="w-8 h-8 object-cover rounded-xs" :src="mod.mod.url" alt="" />
                        <span class="font-medium">{{ $t(mod.mod.名称) }} <span class="text-base-content/60">+{{ mod.mod.等级 }}</span></span>
                    </div>
                </div>
            </div>
        </template>

        <!-- BUFF展示 -->
        <div v-if="charBuild.buffs.length > 0">
            <SectionHeader number="05" kicker="BUFFS" title="BUFF" no-animate />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <span
                    v-for="buff in charBuild.buffs.map(v => v.名称)"
                    :key="buff"
                    class="rounded-xs border border-base-content/10 bg-base-100/70 px-4 py-2 text-sm"
                >
                    {{ buff }}
                </span>
            </div>
        </div>
    </div>
</template>
