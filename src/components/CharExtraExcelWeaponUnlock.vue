<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { type CharExtraExcelWeapon, charExtraExcelWeapon } from "@/data/d/charext.data"
import { resourceMap } from "@/data/d/resource.data"
import type { Char } from "@/data/data-types"

const props = defineProps<{
    char: Char
}>()

/** 当前选中的额外精通武器类型 */
const activeType = ref<string>("")

/** 额外精通武器解锁：仅展示角色「额外精通」字段指定的武器类型。 */
const unlockList = computed<CharExtraExcelWeapon[]>(() => {
    return charExtraExcelWeapon.filter(item => props.char.额外精通?.includes(item.名称))
})

const selectedItem = computed<CharExtraExcelWeapon | null>(() => {
    return unlockList.value.find(item => item.名称 === activeType.value) ?? unlockList.value[0] ?? null
})

// 切换角色时重置选中项，默认选中第一项
watch(
    () => props.char.id,
    () => {
        activeType.value = unlockList.value[0]?.名称 ?? ""
    },
    { immediate: true }
)

/**
 * 按资源 ID 取资源名，缺失时回退到原始 ID。
 * @param id 资源 ID
 * @returns 资源展示名
 */
function getResourceName(id: number): string {
    return resourceMap.get(id)?.name || String(id)
}
</script>

<template>
    <section v-if="unlockList.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="UNLOCK" :title="$t('UI_Armory_ExtraExcelWeponTitle')" />

        <!-- 额外精通切换方章（与技能切换一致） -->
        <div class="mt-2 flex flex-wrap gap-1.5">
            <button
                v-for="item in unlockList"
                :key="item.id"
                type="button"
                class="cursor-pointer whitespace-nowrap rounded-xs border px-2.5 py-1 text-xs transition-colors duration-150 active:scale-[0.97]"
                :class="
                    selectedItem?.名称 === item.名称
                        ? 'border-primary bg-primary font-semibold text-primary-content'
                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                "
                @click="activeType = item.名称"
            >
                {{ $t(item.名称) }}
            </button>
        </div>

        <div v-if="selectedItem" class="mt-3 space-y-2">
            <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-semibold">{{ $t(selectedItem.名称) }}</div>
                <div class="shrink-0 font-mono text-[10px] tracking-[0.2em] text-base-content/40 uppercase">{{ selectedItem.id }}</div>
            </div>
            <div class="mb-1 text-[11px] tracking-wide text-base-content/55">{{ $t("UI_Armory_ExtraExcelResource") }}</div>
            <div class="grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                <ResourceCostItem
                    v-for="[resourceId, count] in Object.entries(selectedItem.消耗)"
                    :key="resourceId"
                    :name="getResourceName(Number(resourceId))"
                    :value="count"
                />
            </div>
        </div>
    </section>
</template>
