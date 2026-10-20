<script setup lang="ts">
import type { DNARoleInfoBean, DNAWeaponBean } from "dna-api"
import { useUIStore } from "@/store/ui"

const ui = useUIStore()
defineProps<{
    roleInfo: DNARoleInfoBean | null
}>()

function getWeaponUnlockProgress(weapons: DNAWeaponBean[]) {
    const my = [...new Set(weapons.filter(v => v.unLocked).map(v => v.weaponId))]
    const all = [...new Set(weapons.map(v => v.weaponId))]
    return `${my.length} / ${all.length}`
}
</script>
<template>
    <div v-if="roleInfo?.roleShow" class="space-y-3" id="screenshot-container">
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ACCOUNT" />
            <div class="flex flex-col items-center gap-3 md:flex-row">
                <img
                    :src="roleInfo.roleShow.headUrl"
                    :alt="roleInfo.roleShow.roleName"
                    class="size-20 shrink-0 rounded-full border border-base-content/15 object-cover"
                />
                <div class="min-w-0 flex-1 text-center md:text-left">
                    <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 md:justify-start">
                        <h2 class="truncate text-lg leading-tight font-bold tracking-tight text-base-content">
                            {{ roleInfo.roleShow.roleName }}
                        </h2>
                        <CopyID :id="roleInfo.roleShow.roleId" />
                    </div>
                    <div class="mt-1 text-xs text-base-content/50">
                        <span class="font-mono tabular-nums">Lv. {{ roleInfo.roleShow.level }}</span>
                    </div>
                </div>
            </div>
        </section>

        <section v-if="roleInfo.roleShow.params.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PARAMS" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div
                    v-for="(p, index) in roleInfo.roleShow.params"
                    :key="index"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ p.paramKey }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">
                        {{ p.paramValue }}
                    </span>
                </div>
                <div
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t('dna-game-info-show.achievement_progress') }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">
                        {{ roleInfo.roleShow.roleAchv?.total }}
                    </span>
                </div>
                <div
                    v-if="roleInfo!.roleShow.roleAchv"
                    v-for="[k, p] in ['gold', 'silver', 'bronze'].map(v => [
                        v,
                        roleInfo!.roleShow.roleAchv[v as keyof typeof roleInfo.roleShow.roleAchv],
                    ])"
                    :key="k"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <img
                        :src="`/imgs/webp/Icon_Achievement_${{ bronze: 'Copper', silver: 'Silver', gold: 'Gold' }[k]}.webp`"
                        :alt="$t('common.quality')"
                        class="size-8 shrink-0 object-contain"
                    />
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">
                        {{ p }}
                    </span>
                </div>
            </div>
        </section>

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader
                no-animate
                compact
                kicker="ROSTER"
                :title="`角色 (${roleInfo.roleShow.roleChars.filter(v => v.unLocked).length}/${roleInfo.roleShow.roleChars.length})`"
            />
            <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-2 justify-center">
                <DNACharItem v-for="char in roleInfo.roleShow.roleChars" :key="char.charId" :char="char" />
            </div>
        </section>

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader
                no-animate
                compact
                kicker="RANGED"
                :title="`远程武器 (${getWeaponUnlockProgress(roleInfo.roleShow.langRangeWeapons)})`"
            />
            <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-2 justify-center">
                <DNAWeaponItem v-for="weapon in roleInfo.roleShow.langRangeWeapons" :key="weapon.weaponId" :weapon="weapon" />
            </div>
        </section>

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader
                no-animate
                compact
                kicker="MELEE"
                :title="`近战武器 (${getWeaponUnlockProgress(roleInfo.roleShow.closeWeapons)})`"
            />
            <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-2 justify-center">
                <DNAWeaponItem v-for="weapon in roleInfo.roleShow.closeWeapons" :key="weapon.weaponId" :weapon="weapon" />
            </div>
        </section>

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ROGUELIKE" :title="$t('迷津')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div class="mb-1 text-[11px] tracking-wide text-base-content/55">{{ $t('dna-game-info-show.progress') }}</div>
                    <div class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">
                        {{ ["0", "I", "II", "III", "IV", "V", "VI"][roleInfo.roleShow.rougeLikeInfo.maxPassed >> 4] }}
                    </div>
                    <div class="mt-0.5 font-mono text-xs text-base-content/50 tabular-nums">
                        Lv.{{ (roleInfo.roleShow.rougeLikeInfo.maxPassed & 8) * 10 }}
                    </div>
                </div>
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div class="mb-1 text-[11px] tracking-wide text-base-content/55">{{ $t('dna-game-info-show.weekly_trace') }}</div>
                    <div class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">
                        {{ roleInfo.roleShow.rougeLikeInfo.rewardCount }}
                    </div>
                    <div class="mt-0.5 text-xs text-base-content/50">/ {{ roleInfo.roleShow.rougeLikeInfo.rewardTotal }}</div>
                </div>
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div class="mb-1 text-[11px] tracking-wide text-base-content/55">{{ $t('dna-game-info-show.reset_time') }}</div>
                    <div class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">
                        {{ ui.timeDistanceFuture(+roleInfo.roleShow.rougeLikeInfo.resetTime * 1000) }}
                    </div>
                    <div class="mt-0.5 text-xs text-base-content/50">
                        {{ new Date(+roleInfo.roleShow.rougeLikeInfo.resetTime * 1000).toLocaleDateString() }}
                    </div>
                </div>
            </div>

            <div class="mt-1.5 grid grid-cols-2 gap-1.5 md:grid-cols-4">
                <div
                    v-for="(talent, index) in roleInfo.roleShow.rougeLikeInfo.talentInfo"
                    :key="index"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="mb-1 text-[11px] tracking-wide text-base-content/55">
                        {{ ["技能", "适应", "近战", "远程"][index] }}强化
                    </div>
                    <div class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">
                        {{ talent.cur }}
                    </div>
                    <div class="mt-0.5 text-xs text-base-content/50">/ {{ talent.max }}</div>
                </div>
            </div>
        </section>

        <section v-if="roleInfo.abyssInfo" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ABYSS" :title="roleInfo.abyssInfo.operaName">
                <template #trailing>
                    <span class="shrink-0 text-xs text-base-content/50 tabular-nums"
                        >{{ new Date(+roleInfo.abyssInfo.startTime * 1000).toLocaleDateString() }} -
                        {{ new Date(+roleInfo.abyssInfo.endTime * 1000).toLocaleDateString() }}</span
                    >
                </template>
            </SectionHeader>
            <div class="space-y-2.5">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-sm text-base-content/60">{{ roleInfo.abyssInfo.progressName }}</span>
                    <span
                        class="inline-flex shrink-0 items-center gap-1 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-orbitron text-[11px] font-semibold text-primary tabular-nums"
                    >
                        <Icon icon="ri:star-line" class="size-3.5" />
                        {{ roleInfo.abyssInfo.stars }}</span
                    >
                </div>

                <div class="flex justify-center">
                    <div v-if="roleInfo.abyssInfo.bestTimeVo1" class="flex gap-2">
                        <img
                            v-if="roleInfo.abyssInfo.bestTimeVo1.charIcon"
                            :src="roleInfo.abyssInfo.bestTimeVo1.charIcon"
                            :alt="$t('角色')"
                            class="size-40 rounded-xs border border-base-content/10 object-cover"
                        />
                        <div v-else class="size-12 rounded-xs border border-base-content/10 bg-base-content/5" />
                        <div class="flex flex-col items-center gap-2">
                            <img
                                v-if="roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                :src="roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                :alt="$t('dna-game-info-show.melee_weapon')"
                                class="size-12 rounded-xs border border-base-content/10 object-cover"
                            />
                            <div v-else class="size-12 rounded-xs border border-base-content/10 bg-base-content/5" />
                            <img
                                v-if="roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                :src="roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                :alt="$t('dna-game-info-show.ranged_weapon')"
                                class="size-12 rounded-xs border border-base-content/10 object-cover"
                            />
                            <div v-else class="size-12 rounded-xs border border-base-content/10 bg-base-content/5" />
                            <img
                                v-if="roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                :src="roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                :alt="$t('魔灵')"
                                class="size-12 rounded-xs border border-base-content/10 object-cover"
                            />
                            <div v-else class="size-12 rounded-xs border border-base-content/10 bg-base-content/5" />
                        </div>
                        <div class="flex flex-col gap-2">
                            <img
                                v-if="roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                :src="roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                :alt="$t('dna-game-info-show.coop_char_1')"
                                class="size-19 rounded-xs border border-base-content/10 object-cover"
                            />
                            <div v-else class="size-12 rounded-xs border border-base-content/10 bg-base-content/5" />
                            <img
                                v-if="roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                :src="roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                :alt="$t('dna-game-info-show.coop_char_2')"
                                class="size-19 rounded-xs border border-base-content/10 object-cover"
                            />
                            <div v-else class="size-12 rounded-xs border border-base-content/10 bg-base-content/5" />
                        </div>
                        <div class="flex flex-col gap-2">
                            <img
                                v-if="roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                :src="roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                :alt="$t('dna-game-info-show.coop_weapon_1')"
                                class="size-19 rounded-xs border border-base-content/10 object-cover"
                            />
                            <div v-else class="size-12 rounded-xs border border-base-content/10 bg-base-content/5" />
                            <img
                                v-if="roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                :src="roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                :alt="$t('dna-game-info-show.coop_weapon_2')"
                                class="size-19 rounded-xs border border-base-content/10 object-cover"
                            />
                            <div v-else class="size-12 rounded-xs border border-base-content/10 bg-base-content/5" />
                        </div>
                    </div>
                    <span v-else class="text-sm text-base-content/45">{{ $t('common.no_data') }}</span>
                </div>
            </div>
        </section>
    </div>
</template>
