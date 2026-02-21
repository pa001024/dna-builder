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
</script>
<template>
    <!-- 角色头部信息 -->
    <div class="flex flex-col md:flex-row gap-6 mb-6 mt-2">
        <div class="relative w-32 h-32 md:w-40 md:h-40 rounded-2xl overflow-hidden border-2 border-primary/30 shadow-xl self-start">
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

                <span class="px-4 py-2 rounded-full bg-cyan-500/20 text-cyan-400 text-sm border border-cyan-500/30 font-orbitron"
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
            <h4 class="text-lg font-bold mb-3 flex items-center gap-2">
                <span>{{ $t("char-build.char_attributes") }}</span>
                <span class="text-sm text-base-content/50"
                    >{{ $t("char-build.resonance_gain") }} {{ charSettings.resonanceGain * 100 }}%</span
                >
            </h4>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <div
                    class="col-span-2 bg-linear-to-br from-primary/10 to-primary/5 rounded-lg p-3 border border-primary/20 hover:border-primary/40 transition-colors"
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
                    v-for="[key, val] in Object.entries(attributes).filter(([k, v]) => !['召唤物攻击速度', '召唤物范围'].includes(k) && v)"
                    :key="key"
                    class="bg-linear-to-br from-secondary/10 to-secondary/5 rounded-lg p-3 border border-secondary/20 hover:border-secondary/40 transition-colors"
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
                {{ summonAttributes.find(p => p.名称 === "召唤物名称")?.格式 || "召唤物" }}
            </h4>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <div
                    v-for="prop in summonAttributes.filter(p => p.值)"
                    :key="prop.名称"
                    class="bg-linear-to-br from-secondary/10 to-secondary/5 rounded-lg p-3 border border-secondary/20"
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
            <h4 class="text-lg font-bold mb-3">
                {{ $t("char-build.weapon_attributes") }}
            </h4>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <div
                    v-for="[key, val] in Object.entries(weaponAttrs).filter(([_, v]) => v)"
                    :key="key"
                    class="bg-linear-to-br from-secondary/10 to-secondary/5 rounded-lg p-3 border border-secondary/20"
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
        <template v-for="key in ['charMods', 'meleeMods', 'rangedMods', 'skillMods'] satisfies (keyof CharBuild)[]" :key="key">
            <div v-if="charBuild[key].filter(v => v).length > 0">
                <h4 class="text-lg font-bold mb-3">{{ $t(`char-build.${key.slice(0, -4)}`) }}MOD</h4>
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
                        class="flex items-center gap-2 px-3 py-2 rounded-lg bg-linear-to-r from-secondary/10 to-secondary/5 border border-secondary/30 text-sm"
                    >
                        <img class="w-8 h-8 object-cover rounded" :src="mod.mod.url" alt="" />
                        <span class="font-medium"
                            >{{ mod.count > 1 ? `${mod.count} x ` : "" }}{{ $t(mod.mod.名称) }}
                            <span class="text-base-content/60">+{{ mod.mod.等级 }}</span>
                        </span>
                    </div>
                </div>
            </div>
        </template>

        <!-- BUFF展示 -->
        <div v-if="charBuild.buffs.length > 0">
            <h4 class="text-lg font-bold mb-3">BUFF</h4>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <span
                    v-for="buff in charBuild.buffs.map(v => v.名称)"
                    :key="buff"
                    class="px-4 py-2 rounded-lg bg-linear-to-r from-secondary/10 to-secondary/5 border border-secondary/30 text-sm"
                >
                    {{ buff }}
                </span>
            </div>
        </div>
    </div>
</template>
