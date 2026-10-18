<script lang="ts" setup>
import { t } from "i18next"
import { computed, ref } from "vue"
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

/** 当前在弹窗中查看的设计稿。 */
const selectedSource = ref<Draft | null>(null)

/**
 * 详情弹窗显示状态：选中设计稿即打开，关闭时清空选中。
 */
const showDetailDialog = computed({
    get: () => selectedSource.value !== null,
    set: (value: boolean) => {
        if (!value) {
            selectedSource.value = null
        }
    },
})

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
</script>

<template>
    <div v-if="props.draftSources.length > 0" class="space-y-2">
        <div class="text-[11px] tracking-wide text-base-content/55">{{ $t("database.draft") }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2 text-sm">
            <div
                v-for="source in props.draftSources"
                :key="source.key"
                class="group flex w-full cursor-pointer items-center gap-2.5 rounded-xs border border-base-content/15 bg-base-content/4 p-2 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-base-content/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                @click="selectedSource = source.draft"
            >
                <div
                    class="relative size-11 shrink-0 overflow-hidden rounded-xs bg-linear-to-b"
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
                        <h4
                            class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                        >
                            <SRouterLink :to="`/db/draft/${source.draft.id}`" stop class="hover:underline">
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
                        <span
                            class="shrink-0 rounded-xs bg-amber-500/15 px-1 py-px font-mono text-[8px] font-semibold tracking-[0.15em] uppercase text-amber-400"
                        >
                            DRAFT
                        </span>
                        <span class="truncate">{{ source.draft.v ? `v${source.draft.v}` : "" }} · 产物 x{{ source.draft.c }}</span>
                        <Icon
                            icon="ri:arrow-right-up-line"
                            class="ml-auto h-3 w-3 shrink-0 text-base-content/35 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                        />
                    </div>
                </div>
            </div>
        </div>

        <!-- 设计稿详情弹窗（标题由 DBDraftDetailItem 档案头承担） -->
        <SourceDetailDialog v-model="showDetailDialog">
            <DBDraftDetailItem v-if="selectedSource" :draft="selectedSource" />
        </SourceDetailDialog>
    </div>
</template>
