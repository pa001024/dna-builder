<script setup lang="ts">
import type { DNARoleWeapon } from "dna-api"
import { useUIStore } from "../store/ui"

defineProps<{
    weapon: DNARoleWeapon
}>()

const ui = useUIStore()
</script>
<template>
    <div
        @click="weapon.unLocked ? $router.push(`/dna/weapon/${weapon.weaponId}/${weapon.weaponEid}`) : ui.showErrorMessage('武器未解锁')"
        class="card bg-base-200 cursor-pointer hover:shadow-lg transition-shadow"
        :class="{ 'opacity-50': !weapon.unLocked }"
    >
        <div class="card-body p-3">
            <div class="flex flex-col items-center">
                <div class="avatar mb-2">
                    <div class="w-16 h-16 rounded-full">
                        <img :src="weapon.icon" :alt="weapon.name" />
                    </div>
                </div>
                <h4 class="font-medium text-center">{{ weapon.name }}</h4>
                <div v-if="weapon.unLocked" class="text-xs text-base-content/70">
                    <span class="mx-1">Lv. {{ weapon.level }}</span>
                    <span class="mx-1">精炼 {{ weapon.skillLevel }}</span>
                </div>
                <div v-else class="text-xs text-error mt-1">未解锁</div>
            </div>
        </div>
    </div>
</template>
