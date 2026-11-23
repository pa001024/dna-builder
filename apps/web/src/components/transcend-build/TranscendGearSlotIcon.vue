<script setup lang="ts">
import { computed } from "vue"
import { transcendIconMaskStyle, transcendSlotIcon } from "@/utils/transcendence-icon"

/**
 * 升华装备槽位图标：官方贴图 `T_Season_Equipment_Icon*`（128×128，纯白 alpha）走 mask + `currentColor`，
 * 颜色由调用方 `text-*` 类控制、尺寸由调用方 `size-6/7/8/9` 类控制；
 * maskSize 按各图 alpha 包围盒标定（见 `@/utils/transcendence-icon`）。
 */
const props = defineProps<{
    slotType: number
}>()

const icon = computed(() => transcendSlotIcon(props.slotType))
const style = computed(() => transcendIconMaskStyle(icon.value.url, icon.value.maskSize))
</script>

<template>
    <span class="inline-block shrink-0 bg-current" aria-hidden="true" data-transcend-slot-icon :style="style" />
</template>
