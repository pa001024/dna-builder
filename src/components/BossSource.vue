<script lang="ts" setup>
import { hardBossMap } from "@/data/d/hardboss.data"
import { formatWeaponSourceTimeRange, type WeaponHardbossSourceInfo } from "@/utils/weapon-source"

const props = defineProps<{
    bossSources: WeaponHardbossSourceInfo[]
}>()

/**
 * 获取梦魇残声图标。
 * @param hardbossId 梦魇残声 ID
 * @returns 图标路径
 */
function getHardbossIcon(hardbossId?: number) {
    const boss = hardBossMap.get(hardbossId ?? 0)
    return boss?.icon ? `/imgs/webp/${boss.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}
</script>

<template>
    <div v-if="props.bossSources.length > 0" class="space-y-2">
        <div class="text-[11px] tracking-wide text-base-content/55">{{ $t("database.hardboss") }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            <div
                v-for="source in props.bossSources"
                :key="source.key"
                class="group flex w-full items-center gap-2.5 rounded-xs border border-base-content/15 bg-base-content/[0.04] p-2 transition-colors duration-200 hover:border-primary/50 hover:bg-base-content/[0.06]"
            >
                <div class="relative size-11 shrink-0 overflow-hidden rounded-xs bg-linear-to-b from-gray-600/25 to-gray-200/10">
                    <img
                        :src="getHardbossIcon(source.hardbossId)"
                        :alt="source.hardbossName"
                        class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4
                            class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                        >
                            <SRouterLink v-if="source.hardbossId" :to="`/db/hardboss/${source.hardbossId}`" class="hover:underline">
                                {{ source.hardbossName }}
                            </SRouterLink>
                            <span v-else>{{ source.hardbossName }}</span>
                        </h4>
                        <span
                            v-if="source.hardbossLv"
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            Lv.{{ source.hardbossLv }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span class="shrink-0 rounded-xs bg-red-500/15 px-1 py-px font-mono text-[8px] font-semibold tracking-[0.15em] uppercase text-red-400">
                            BOSS
                        </span>
                        <span class="truncate">{{ formatWeaponSourceTimeRange(source, $t("database.until_now")) }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
