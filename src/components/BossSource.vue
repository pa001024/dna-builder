<script lang="ts" setup>
import { hardBossMap } from "@/data/d/hardboss.data"
import { formatWeaponSourceTimeRange, type WeaponHardbossSourceInfo } from "@/utils/weapon-source"

const props = defineProps<{
    bossSources: WeaponHardbossSourceInfo[]
}>()

/**
 * 获取高难 Boss 图标。
 * @param hardbossId Boss ID
 * @returns 图标路径
 */
function getHardbossIcon(hardbossId?: number) {
    const boss = hardBossMap.get(hardbossId ?? 0)
    return boss?.icon ? `/imgs/webp/${boss.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}
</script>

<template>
    <div v-if="props.bossSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">{{ $t("database.hardboss") }}</div>
        <div v-for="source in props.bossSources" :key="source.key">
            <div class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors flex items-center gap-4">
                <div class="size-16 shrink-0">
                    <img :src="getHardbossIcon(source.hardbossId)" class="w-full h-full object-cover rounded" :alt="source.hardbossName" />
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 min-w-0">
                        <SRouterLink
                            v-if="source.hardbossId"
                            :to="`/db/hardboss/${source.hardbossId}`"
                            class="hover:underline min-w-0 truncate"
                        >
                            {{ source.hardbossName }}
                        </SRouterLink>
                        <span v-else class="min-w-0 truncate">{{ source.hardbossName }}</span>
                        <span v-if="source.hardbossLv" class="badge badge-sm badge-neutral">Lv.{{ source.hardbossLv }}</span>
                    </div>
                    <div class="mt-1 text-xs text-base-content/70">
                        {{ formatWeaponSourceTimeRange(source, $t("database.until_now")) }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
