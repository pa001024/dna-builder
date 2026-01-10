<script setup lang="ts">
import { DNARoleCharsBean } from "dna-api"
import { useUIStore } from "../store/ui"

defineProps<{
    char: DNARoleCharsBean
}>()

const ui = useUIStore()
</script>
<template>
    <div
        class="card bg-base-200 cursor-pointer hover:shadow-lg transition-shadow"
        :class="{ 'opacity-50': !char.unLocked }"
        @click="char.unLocked ? $router.push(`/dna/char/${char.charId}/${char.charEid}`) : ui.showErrorMessage('角色未解锁')"
    >
        <div class="card-body p-3">
            <div class="flex flex-col items-center">
                <div class="avatar mb-2">
                    <div class="w-16 h-16 rounded-full">
                        <img :src="char.icon" :alt="char.name" />
                    </div>
                </div>
                <h4 class="font-medium text-center">
                    {{ char.name }}
                </h4>
                <div v-if="char.unLocked" class="text-xs text-base-content/70">
                    <span class="mx-1">Lv. {{ char.level }}</span>
                    <span class="mx-1">溯源 {{ char.gradeLevel }}</span>
                </div>
                <div v-if="!char.unLocked" class="text-xs text-error mt-1">未解锁</div>
            </div>
        </div>
    </div>
</template>
