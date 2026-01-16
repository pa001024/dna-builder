<script setup lang="ts">
import { computed } from "vue"
import { useCharSettings } from "@/composables/useCharSettings"
import type { CharAttr, CharBuild, LeveledChar, LeveledMod } from "@/data"
import { format100r } from "@/util"

const props = withDefaults(
    defineProps<{
        attributes: CharAttr
        charBuild: CharBuild
        excludeKeys?: string[]
        includeKeys?: string[]
    }>(),
    {
        excludeKeys: () => ["召唤物攻击速度", "召唤物范围"],
    }
)
const nameRef = computed(() => props.charBuild.char.名称)
const charSettings = useCharSettings(nameRef)

defineEmits<{
    addSkill: [skill: string]
}>()
</script>
<template>
    <FullTooltip
        v-for="[key, val] in Object.entries(attributes).filter(([k, v]) =>
            includeKeys ? includeKeys.includes(k) : !excludeKeys.includes(k) && v
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
                        <div class="text-base-content/80">基础{{ key }}</div>
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
                </ul>
            </div>
        </template>
        <div
            class="cursor-pointer flex justify-between items-center p-1 px-2 transition-all duration-200 hover:bg-base-100/60 hover:shadow-md"
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
