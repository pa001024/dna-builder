<script setup lang="ts">
import { LeveledWeapon } from "../data"
import { format100r } from "../util"

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
    <div class="aspect-square bg-base-200 rounded-lg border-2 flex items-center justify-center transition-colors cursor-pointer group">
        <div class="relative w-full h-full flex items-center justify-center">
            <ShowProps v-if="weapon" :props="weapon.getProperties()">
                <div class="w-full h-full flex items-center justify-center bg-opacity-30 rounded-lg overflow-hidden">
                    <!-- 背景 -->
                    <div class="absolute inset-0 flex items-center justify-center">
                        <img :src="weapon.url" :alt="weapon.名称" />
                    </div>
                    <!-- MOD名称 -->
                    <div class="relative mt-auto w-full bg-black/50 z-10 text-left p-2">
                        <div class="text-base-100 text-sm font-bold mb-1 flex items-center">
                            <Icon v-if="selected" icon="ri:checkbox-circle-fill" class="inline-block mr-1 text-green-500" />
                            {{ weapon.名称 }}
                        </div>
                        <div class="relative">
                            <div v-if="control && selected" class="text-base-300 text-xs pb-4 group-hover:pb-8">
                                <NumberInput
                                    class="absolute w-full max-h-0 group-hover:max-h-20"
                                    :model-value="weapon.精炼"
                                    @update:modelValue="emit('refineChange', $event)"
                                    :min="0"
                                    :max="5"
                                    :step="1"
                                />
                                <span class="absolute inline-flex text-base-300 text-xs max-h-20 overflow-hidden group-hover:max-h-0">
                                    精炼{{ weapon.精炼 }}
                                </span>
                            </div>
                            <div v-else class="text-base-300 text-xs">{{ control ? "未拥有" : `精炼${weapon.精炼}` }}</div>
                            <div class="text-base-300 text-xs" v-if="income">{{ format100r(income) }}</div>
                        </div>
                    </div>
                    <!-- 关闭按钮 -->
                    <button
                        v-if="!noremove"
                        @click.stop="emit('removeWeapon')"
                        class="absolute cursor-pointer -top-2 -right-2 w-5 h-5 bg-red-400 bg-opacity-50 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                    >
                        <span class="text-white text-xs">×</span>
                    </button>
                </div>
            </ShowProps>
            <div v-else class="text-gray-500">+</div>
        </div>
    </div>
</template>
