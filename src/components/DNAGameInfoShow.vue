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
    <div v-if="roleInfo?.roleShow" class="space-y-6" id="screenshot-container">
        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <div class="flex flex-col md:flex-row items-center gap-4">
                    <div class="avatar">
                        <div class="w-24 h-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                            <img :src="roleInfo.roleShow.headUrl" :alt="roleInfo.roleShow.roleName" />
                        </div>
                    </div>
                    <div class="flex-1">
                        <h2 class="text-2xl font-bold">
                            {{ roleInfo.roleShow.roleName }}
                        </h2>
                        <div class="text-sm text-base-content/70 mt-1">UID: {{ roleInfo.roleShow.roleId }}</div>
                        <div class="text-sm text-base-content/70 mt-1">Lv. {{ roleInfo.roleShow.level }}</div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="roleInfo.roleShow.params.length > 0" class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center">
                    <div v-for="(p, index) in roleInfo.roleShow.params" :key="index" class="card hover-3d">
                        <div class="card-body bg-linear-0 from-base-300 to-base-200 rounded-2xl relative p-4">
                            <div class="text-sm font-medium">{{ p.paramKey }}</div>
                            <div class="text-xl font-bold">
                                {{ p.paramValue }}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center mt-2">
                    <div class="card hover-3d">
                        <div class="card-body bg-linear-0 from-base-300 to-base-200 rounded-2xl relative p-4">
                            <div class="text-sm font-medium">成就达成</div>
                            <div class="text-xl font-bold">
                                {{ roleInfo.roleShow.roleAchv.total }}
                            </div>
                        </div>
                    </div>
                    <div
                        v-for="[k, p] in ['gold', 'silver', 'bronze'].map(v => [
                            v,
                            roleInfo!.roleShow.roleAchv[v as keyof typeof roleInfo.roleShow.roleAchv],
                        ])"
                        :key="k"
                        class="card hover-3d"
                    >
                        <div class="card-body bg-linear-0 from-base-300 to-base-200 rounded-2xl relative p-4">
                            <div class="text-xl font-bold flex flex-col justify-center h-full">
                                <div class="flex items-end gap-4">
                                    <img
                                        :src="`/imgs/webp/Icon_Achievement_${{ bronze: 'Copper', silver: 'Silver', gold: 'Gold' }[k]}.webp`"
                                        alt="品质"
                                        class="size-10"
                                    />
                                    {{ p }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h3 class="card-title mb-4">
                    角色 ({{ roleInfo.roleShow.roleChars.filter(v => v.unLocked).length }}/{{ roleInfo.roleShow.roleChars.length }})
                </h3>
                <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center">
                    <DNACharItem v-for="char in roleInfo.roleShow.roleChars" :key="char.charId" :char="char" />
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h3 class="card-title mb-4">远程武器 ({{ getWeaponUnlockProgress(roleInfo.roleShow.langRangeWeapons) }})</h3>
                <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center">
                    <DNAWeaponItem v-for="weapon in roleInfo.roleShow.langRangeWeapons" :key="weapon.weaponId" :weapon="weapon" />
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h3 class="card-title mb-4">近战武器 ({{ getWeaponUnlockProgress(roleInfo.roleShow.closeWeapons) }})</h3>
                <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center">
                    <DNAWeaponItem v-for="weapon in roleInfo.roleShow.closeWeapons" :key="weapon.weaponId" :weapon="weapon" />
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h3 class="card-title mb-4">迷津</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-base-200 p-3 rounded-lg">
                        <div class="text-sm font-medium">进度</div>
                        <div class="text-xl font-bold">
                            {{ ["0", "I", "II", "III", "IV", "V", "VI"][roleInfo.roleShow.rougeLikeInfo.maxPassed >> 4] }}
                        </div>
                        <div class="text-sm text-base-content/70">Lv.{{ (roleInfo.roleShow.rougeLikeInfo.maxPassed & 8) * 10 }}</div>
                    </div>
                    <div class="bg-base-200 p-3 rounded-lg">
                        <div class="text-sm font-medium">本周行迹</div>
                        <div class="text-xl font-bold">
                            {{ roleInfo.roleShow.rougeLikeInfo.rewardCount }}
                        </div>
                        <div class="text-sm text-base-content/70">/ {{ roleInfo.roleShow.rougeLikeInfo.rewardTotal }}</div>
                    </div>
                    <div class="bg-base-200 p-3 rounded-lg">
                        <div class="text-sm font-medium">重置时间</div>
                        <div class="text-xl font-bold">
                            {{ ui.timeDistanceFuture(+roleInfo.roleShow.rougeLikeInfo.resetTime * 1000) }}
                        </div>
                        <div class="text-sm text-base-content/70">
                            {{ new Date(+roleInfo.roleShow.rougeLikeInfo.resetTime * 1000).toLocaleDateString() }}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div
                        v-for="(talent, index) in roleInfo.roleShow.rougeLikeInfo.talentInfo"
                        :key="index"
                        class="bg-base-200 p-3 rounded-lg"
                    >
                        <div class="text-sm font-medium">{{ ["技能", "适应", "近战", "远程"][index] }}强化</div>
                        <div class="text-xl font-bold">
                            {{ talent.cur }}
                        </div>
                        <div class="text-sm text-base-content/70">/ {{ talent.max }}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h3 class="card-title mb-4">
                    {{ roleInfo.abyssInfo.operaName }}
                    <span class="ml-auto text-base-content/70 text-sm"
                        >{{ new Date(+roleInfo.abyssInfo.startTime * 1000).toLocaleDateString() }} -
                        {{ new Date(+roleInfo.abyssInfo.endTime * 1000).toLocaleDateString() }}</span
                    >
                </h3>
                <div class="space-y-3">
                    <div class="flex justify-between">
                        <span class="text-base-content/70">{{ roleInfo.abyssInfo.progressName }}</span>
                        <span class="font-semibold badge badge-primary">
                            <Icon icon="ri:star-line" class="size-4 inline-block" />
                            {{ roleInfo.abyssInfo.stars }}</span
                        >
                    </div>

                    <div class="flex justify-center" style="--spacing: max(0.25rem, calc(1vw / 2))">
                        <div v-if="roleInfo.abyssInfo.bestTimeVo1" class="flex gap-2">
                            <img
                                v-if="roleInfo.abyssInfo.bestTimeVo1.charIcon"
                                :src="roleInfo.abyssInfo.bestTimeVo1.charIcon"
                                alt="角色"
                                class="size-40 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                            />
                            <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                            <div class="flex flex-col items-center gap-2">
                                <img
                                    v-if="roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                    :src="roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                    alt="近战武器"
                                    class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                <img
                                    v-if="roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                    :src="roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                    alt="远程武器"
                                    class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                <img
                                    v-if="roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                    :src="roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                    alt="魔灵"
                                    class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                            </div>
                            <div class="flex flex-col gap-2">
                                <img
                                    v-if="roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                    :src="roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                    alt="协战角色1"
                                    class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                <img
                                    v-if="roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                    :src="roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                    alt="协战角色2"
                                    class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                            </div>
                            <div class="flex flex-col gap-2">
                                <img
                                    v-if="roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                    :src="roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                    alt="协战武器1"
                                    class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                <img
                                    v-if="roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                    :src="roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                    alt="协战武器2"
                                    class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                            </div>
                        </div>
                        <span v-else>暂无数据</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
