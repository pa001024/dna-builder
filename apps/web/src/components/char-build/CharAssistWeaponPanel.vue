<script setup lang="ts">
import TranscendWeaponTab from "@/components/transcend-build/TranscendWeaponTab.vue"
import type { CharAttr, CharBuild, TranscendSideLoadout } from "@/data"

// 复用升华页 `TranscendWeaponTab`（不读 useCharSettings），避免把协战角色写进自己的 build.<assistId>

defineProps<{
    loadout: TranscendSideLoadout
    charBuild?: CharBuild | null
    attributes?: CharAttr
    /** 和鸣增益：属性面板显式传入，避免面板内部读老存档 */
    resonanceGain: number
}>()

const emit = defineEmits<{
    (event: "update", patch: Partial<TranscendSideLoadout>): void
}>()
</script>

<template>
    <div data-char-tab-panel="assist-weapon">
        <TranscendWeaponTab
            :loadout="loadout"
            wkey="melee"
            single
            :char-build="charBuild"
            :attributes="attributes"
            :resonance-gain="resonanceGain"
            @update="emit('update', $event)"
        />
    </div>
</template>
