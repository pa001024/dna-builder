<script setup lang="ts">
import { LeveledWeapon } from "../data"
import { formatProp } from "../util"

defineProps<{
    weapon: LeveledWeapon
}>()
</script>
<template>
    <div
        class="backdrop-blur-sm rounded-xl p-2 bg-linear-to-r from-secondary/1 to-secondary/5 border border-fuchsia-500/20 hover:border-fuchsia-500/40 transition-all duration-300"
    >
        <div class="flex gap-4">
            <div class="w-12 h-12 flex items-center justify-center rounded-lg overflow-hidden bg-gray-900/50 border border-fuchsia-500/30">
                <img :alt="$t(weapon.名称)" class="w-full h-full object-cover" :src="weapon.url" />
            </div>
            <div class="flex-1">
                <div class="flex items-center justify-between mb-1">
                    <h5 class="text-base-content/80 font-bold">{{ $t(weapon.名称) }}</h5>
                    <span class="px-2 py-1 rounded-md bg-fuchsia-500/20 text-fuchsia-400 text-xs border border-fuchsia-500/30">
                        {{ $t(weapon.类型) }}
                    </span>
                </div>
                <p class="text-gray-400 text-xs">
                    {{
                        Object.entries(weapon.getSimpleProperties())
                            .map(([k, v]) => `${$t(k)} ${formatProp(k, v)}`)
                            .join("，")
                    }}
                </p>
            </div>
        </div>
    </div>
</template>
