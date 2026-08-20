<script lang="ts" setup>
import { t } from "i18next"
import { resourceMap } from "@/data"
import { modMap, weaponMap } from "@/data/d"
import type { Draft } from "@/data/d/draft.data"
import { LeveledMod } from "@/data/leveled/LeveledMod"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { type ResourceDraftSourceInfo } from "@/utils/draft-source"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const props = defineProps<{
    draftSources: ResourceDraftSourceInfo[]
}>()

/**
 * 格式化设计稿名称展示。
 * @param draft 设计稿数据
 * @returns 设计稿展示名称
 */
function getDraftLabel(draft: Draft): string {
    return `${t("UI_FORGING_BLUEPRINT")}${t(draft.n)}`
}

/**
 * 将铸造时间转换为 00:00 格式。
 * @param minutes 铸造时间（分钟）
 * @returns 格式化后的时长
 */
function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

/**
 * 获取设计稿产物图标（按产物类型走各自的图片工具）。
 * @param draft 设计稿数据
 * @returns 图标路径
 */
function getDraftProductIcon(draft: Draft): string {
    if (draft.t === "Resource") {
        const resource = resourceMap.get(draft.p)
        return resource?.icon ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
    if (draft.t === "Mod") {
        return LeveledMod.url(modMap.get(draft.p)?.icon)
    }
    if (draft.t === "Weapon") {
        return LeveledWeapon.url(weaponMap.get(draft.p)?.icon)
    }
    return ""
}

/**
 * 获取材料图标地址。
 * @param material 材料条目
 * @returns 图标路径
 */
function getMaterialIconUrl(material: Draft["x"][number]): string {
    if (material.t === "Resource") {
        const resource = resourceMap.get(material.id)
        return resource?.icon ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
    if (material.t === "Mod") {
        return LeveledMod.url(modMap.get(material.id)?.icon)
    }
    if (material.t === "Weapon") {
        return LeveledWeapon.url(weaponMap.get(material.id)?.icon)
    }
    return "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 获取铜币图标地址。
 * @returns 图标路径
 */
function getCoinIconUrl(): string {
    const coin = resourceMap.get("铜币")
    return coin?.icon ? `/imgs/res/${coin.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}
</script>

<template>
    <div v-if="props.draftSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">{{ $t("database.draft") }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            <div
                v-for="source in props.draftSources"
                :key="source.key"
                class="group flex w-full items-start gap-2.5 border border-base-content/15 bg-base-100 p-2 transition-colors duration-200 hover:border-primary/60"
            >
                <div
                    class="relative size-11 shrink-0 overflow-hidden rounded bg-linear-to-b"
                    :class="getRarityGradientClass(source.draft.r)"
                >
                    <img
                        v-if="getDraftProductIcon(source.draft)"
                        :src="getDraftProductIcon(source.draft)"
                        :alt="getDraftLabel(source.draft)"
                        class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                    <Icon
                        v-else
                        icon="ri:hammer-line"
                        class="absolute inset-0 m-auto size-5 text-base-content/40 transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4 class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary">
                            <SRouterLink :to="`/db/draft/${source.draft.id}`" class="hover:underline">
                                {{ getDraftLabel(source.draft) }}
                            </SRouterLink>
                        </h4>
                        <span
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            {{ formatDuration(source.draft.d) }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span class="shrink-0 bg-amber-500 px-1 py-px font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-white">
                            DRAFT
                        </span>
                        <span class="truncate">{{ source.draft.v ? `v${source.draft.v}` : "" }} · 产物 x{{ source.draft.c }}</span>
                    </div>
                    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-base-content/10 pt-1 text-[10px]">
                        <span class="flex items-center gap-1 text-base-content/70">
                            <img :src="getCoinIconUrl()" alt="铜币" class="size-3.5 shrink-0 rounded-sm object-cover" />
                            铜币 x{{ source.draft.m }}
                        </span>
                        <span
                            v-for="material in source.draft.x"
                            :key="`${source.draft.id}:${material.t}:${material.id}`"
                            class="flex min-w-0 items-center gap-1 text-base-content/70"
                        >
                            <img :src="getMaterialIconUrl(material)" :alt="material.n" class="size-3.5 shrink-0 rounded-sm object-cover" />
                            <span class="truncate">{{ $t(material.n) }}</span>
                            <span class="shrink-0 font-semibold text-base-content/80">x{{ material.c }}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
