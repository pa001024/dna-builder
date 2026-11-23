<script setup lang="ts">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { LeveledWeapon } from "@/data"
import { formatProp } from "@/util"

/**
 * 构筑页「角色详情」内的灾厄武器子区：逐档展示已装备灾厄武器的熔炼层次效果。
 * 与 DB 武器详情页不同，这里只展示熔炉内的层级效果，不展示任何材料。
 */
const props = defineProps<{
    /** 当前构筑已装备的武器（近战 / 远程；同律武器无熔炉，不入列） */
    weapons: (LeveledWeapon | undefined | null)[]
}>()

const { gt } = useGameText()

/** 已装备、熔炉非空的灾厄武器；同一把武器（id 相同）只保留一次 */
const calamityWeapons = computed(() => {
    const seen = new Set<number>()
    const result: LeveledWeapon[] = []
    for (const weapon of props.weapons) {
        if (!weapon || weapon.isEmpty || !weapon.hasForge) continue
        if (seen.has(weapon.id)) continue
        seen.add(weapon.id)
        result.push(weapon)
    }
    return result
})
</script>

<template>
    <section
        v-if="calamityWeapons.length > 0"
        data-calamity-weapon
        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
    >
        <SectionHeader no-animate compact kicker="FORGE" :title="$t('char-build.calamity_weapon')" />
        <div class="space-y-3">
            <div v-for="weapon in calamityWeapons" :key="weapon.id" class="space-y-2">
                <div class="flex items-center gap-2 px-1">
                    <ImageFallback :src="weapon.url" :alt="$t(weapon.名称)" class="size-8 shrink-0 rounded-xs object-cover">
                        <div class="size-8 shrink-0 rounded-xs bg-base-content/10" />
                    </ImageFallback>
                    <div class="min-w-0 wrap-break-word text-sm font-medium text-base-content">{{ $t(weapon.名称) }}</div>
                </div>
                <div
                    v-for="forge in weapon._originalWeaponData.熔炉"
                    :key="forge.lv"
                    data-calamity-forge-level
                    class="rounded-xs border border-base-content/10 bg-base-100/40 p-2"
                >
                    <div class="border-l-2 border-l-primary pl-2 font-orbitron text-sm font-bold tabular-nums text-primary">
                        Lv. {{ forge.lv }}
                    </div>
                    <div
                        v-if="forge.技能 && forge.技能.length > 0"
                        class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
                    >
                        <div
                            v-for="skill in forge.技能"
                            :key="skill.id"
                            data-calamity-skill
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2"
                        >
                            <div class="flex items-center gap-2">
                                <div
                                    v-if="skill.icon"
                                    class="size-8 shrink-0 bg-base-content"
                                    :style="{ mask: `url(/imgs/webp/${skill.icon}.webp) no-repeat center/contain` }"
                                />
                                <div class="min-w-0 wrap-break-word text-sm font-medium text-primary">{{ $t(skill.名称) }}</div>
                            </div>
                            <div v-if="skill.描述" class="mt-1 wrap-break-word whitespace-pre-wrap text-sm leading-relaxed text-base-content/70">
                                {{ gt(skill.描述) }}
                            </div>
                            <div
                                v-if="skill.加成"
                                class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5 text-sm"
                            >
                                <div
                                    v-for="(value, name) in skill.加成"
                                    :key="name"
                                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-100/40 px-2 py-1.5"
                                >
                                    <span class="min-w-0 wrap-break-word text-xs text-base-content/60">{{ $t(name) }}</span>
                                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ formatProp(name, value) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
