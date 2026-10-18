<script setup lang="ts">
import { computed } from "vue"
import CharTooltip from "@/components/CharTooltip.vue"
import WeaponTooltip from "@/components/WeaponTooltip.vue"
import { useGameText } from "@/composables/useGameText"
import type { LeveledChar, LeveledSkillWeapon, LeveledWeapon } from "@/data"
import { formatProp } from "@/util"

/** 配装页侧边栏页签（角色 / 近战 / 远程 / 同律）的 tooltip 内容 */
export type BuildTabCard =
    | { kind: "char"; char: LeveledChar; mastery?: string[] }
    | { kind: "weapon"; weapon: LeveledWeapon; ineffective: ReadonlySet<string> }
    | { kind: "skill"; weapon: LeveledSkillWeapon }
    | { kind: "empty"; title: string; isEmpty?: boolean }

const props = defineProps<{
    card: BuildTabCard
}>()

const { gt } = useGameText()
const skill = computed(() => (props.card.kind === "skill" ? props.card.weapon : undefined))
const skillIcon = computed(() => (skill.value && !skill.value.url.endsWith("/_.webp") ? skill.value.url : ""))
const skillProps = computed(() => skill.value?.getProperties() ?? {})
</script>
<template>
    <FullTooltip side="bottom">
        <template #tooltip>
            <div v-if="card.kind === 'char'" class="-mx-3.75 -my-2.5">
                <CharTooltip :char="card.char" :mastery="card.mastery" bare />
            </div>
            <div v-else-if="card.kind === 'weapon'" class="-mx-3.75 -my-2.5">
                <WeaponTooltip :weapon="card.weapon" :ineffective="card.ineffective" bare />
            </div>
            <div v-else-if="card.kind === 'skill' && skill" class="flex w-64 flex-col gap-2">
                <div v-if="skillIcon" class="relative -mx-3.75 -mt-2.5 mb-1 h-24 w-64 overflow-hidden">
                    <img :src="skillIcon" :alt="skill.名称" class="absolute inset-0 h-full w-full object-cover" />
                    <span
                        class="absolute left-2 top-2 bg-base-content px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-base-100"
                    >
                        SKILL
                    </span>
                </div>
                <div class="text-sm font-bold">{{ gt(skill.名称) }}</div>
                <div class="text-xs font-bold text-neutral-500">{{ gt(skill.类别) }}</div>
                <div
                    v-for="[key, val] in Object.entries(skillProps).filter(([, val]) => val)"
                    :key="key"
                    class="flex items-center justify-between gap-2 text-sm"
                >
                    <div class="whitespace-nowrap text-xs text-neutral-500">{{ gt(key) }}</div>
                    <div class="font-medium text-primary">{{ formatProp(key, val) }}</div>
                </div>
            </div>
            <div v-else-if="card.kind === 'empty'" class="flex max-w-75 min-w-28 flex-col gap-2">
                <div class="text-sm font-bold">{{ card.title }}</div>
                <div v-if="card.isEmpty" class="whitespace-nowrap text-[11px] text-base-content/50">
                    {{ $t("char-build.weapon_slot_not_equipped") }}
                </div>
            </div>
        </template>
        <slot />
    </FullTooltip>
</template>
