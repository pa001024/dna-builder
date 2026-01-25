<script setup lang="ts">
import type { DNAWeaponBean } from "dna-api"
import { LeveledWeapon } from "@/data"
import { useUIStore } from "../store/ui"

defineProps<{
    weapon: DNAWeaponBean
}>()

const ui = useUIStore()
</script>
<template>
    <div
        class="card"
        :class="{ 'opacity-60': !weapon.unLocked, 'cursor-pointer hover-3d': weapon.unLocked }"
        @click="weapon.unLocked ? $router.push(`/dna/weapon/${weapon.weaponId}/${weapon.weaponEid}`) : ui.showErrorMessage('武器未解锁')"
    >
        <div class="card-body bg-linear-30 from-purple-300/50 to-purple-600/50 rounded-2xl relative p-2">
            <img
                class="absolute inset-0 h-full object-cover pointer-events-none mask-b-from-60%"
                :src="LeveledWeapon.idToUrl(weapon.weaponId)"
            />
            <div class="absolute size-8 aura-pulse-dark">
                <span class="aura-pulse-aura"></span>
                <img :src="weapon.elementIcon" alt="icon" class="z-2 w-full h-full object-contain" />
            </div>
            <div v-if="weapon.unLocked" class="absolute p-1 px-2 rounded-lg right-1 aura-pulse-dark">
                <span class="aura-pulse-aura"></span>
                <span class="font-bold text-lg text-white aura-pulse-text">
                    {{ ["{}", "I", "II", "III", "IV", "V", "VI"][weapon.skillLevel] }}</span
                >
            </div>
            <div class="flex flex-col items-center z-1 text-white text-shadow-md text-shadow-black/30">
                <div class="avatar mb-2">
                    <div class="h-32 rounded-full"></div>
                </div>
                <h4 class="font-medium text-center">
                    {{ weapon.name }}
                </h4>
                <div v-if="weapon.unLocked" class="text-xs">Lv. {{ weapon.level }}</div>
                <div v-else class="text-xs text-error">未解锁</div>
            </div>
        </div>
    </div>
</template>
