<script setup lang="ts">
import { LeveledWeapon } from "@/data"
import { format100r } from "@/util"

defineProps<{
    weapon: LeveledWeapon | null
    income?: number
    noremove?: boolean
    selected?: boolean
    control?: boolean
}>()

const emit = defineEmits<{
    removeWeapon: []
    refineChange: [val: number]
}>()
</script>
<template>
    <!-- 方形卡片：与 ModItem 同构——底部信息半透明叠加，hover 控件原地覆盖不撑高 -->
    <div
        class="group relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-xs border border-base-content/15 bg-base-200/60 backdrop-blur-sm transition-colors duration-200 hover:border-primary/60"
    >
        <div class="relative h-full w-full overflow-hidden rounded-xs">
            <ShowProps v-if="weapon" :props="weapon.getProperties()">
                <div class="relative h-full w-full">
                    <!-- 武器图 -->
                    <img class="h-full w-full object-cover" :src="weapon.url" :alt="weapon.名称" />
                    <!-- 悬停遮罩 -->
                    <div class="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/15" />

                    <!-- 底部信息条：半透明叠加，固定高度（hover 精炼控件原地覆盖，不撑高） -->
                    <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-base-100/25 px-2 py-2 backdrop-blur-sm">
                        <!-- 名称 -->
                        <div class="flex items-center gap-1 text-sm leading-tight font-bold text-base-content/80">
                            <Icon v-if="selected" icon="ri:checkbox-circle-fill" class="shrink-0 text-green-500" />
                            <span class="truncate">{{ $t(weapon.名称) }}</span>
                        </div>
                        <!-- 状态行：固定高度 -->
                        <div class="relative h-6 text-xs leading-8 text-base-content/80">
                            <div
                                class="absolute inset-0 flex items-center justify-between gap-1"
                                :class="control && selected ? 'transition-opacity duration-200 group-hover:opacity-0' : ''"
                            >
                                <span class="truncate">{{ control && !selected ? $t("未拥有") : `精炼${weapon.精炼}` }}</span>
                                <span v-if="income" class="shrink-0">{{ format100r(income) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 悬停精炼输入：绝对定位叠加于底部，不撑高 -->
                    <div
                        v-if="control && selected"
                        class="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-0.5 bg-base-100/25 px-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    >
                        <NumberInput
                            class="scale-90"
                            :model-value="weapon.精炼"
                            :min="0"
                            :max="5"
                            :step="1"
                            @update:model-value="emit('refineChange', $event)"
                        />
                    </div>
                </div>
            </ShowProps>

            <!-- 空槽位：虚线占位 -->
            <div v-else class="flex h-full w-full items-center justify-center text-base-content/40">
                <Icon icon="ri:add-line" class="h-8 w-8" />
            </div>
        </div>

        <!-- 删除判定区：右上角命中区，hover 时变红，点击删除 -->
        <button
            v-if="weapon && !noremove"
            type="button"
            class="group/rm absolute -top-3 -right-3 z-30 h-14 w-14 cursor-pointer"
            title="删除"
            @click.stop="emit('removeWeapon')"
        >
            <span
                class="pointer-events-none absolute top-3 right-3 h-8 w-8 bg-red-500 opacity-0 transition-opacity duration-200 group-hover/rm:opacity-90 [clip-path:polygon(100%_0,100%_100%,0_0)]"
            />
            <Icon
                icon="ri:close-line"
                class="pointer-events-none absolute top-4 right-4 h-4 w-4 text-white opacity-0 transition-opacity duration-200 group-hover/rm:opacity-100"
            />
        </button>
    </div>
</template>
