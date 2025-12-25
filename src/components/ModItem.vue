<script setup lang="ts">
import { CharBuild, LeveledMod } from "../data"
import { format100r } from "../util"

function getQualityColor(quality: string): string {
    // 实现根据品质返回颜色类名的逻辑
    switch (quality) {
        case "金":
            return "border-yellow-500"
        case "紫":
            return "border-purple-500"
        case "蓝":
            return "border-blue-500"
        case "绿":
            return "border-green-500"
        case "白":
            return "border-gray-400"
        default:
            return ""
    }
}

function getQualityHoverBorder(quality: string): string {
    // 实现根据品质返回 hover 边框颜色类名的逻辑
    switch (quality) {
        case "金":
            return "hover:border-yellow-400"
        case "紫":
            return "hover:border-purple-400"
        case "蓝":
            return "hover:border-blue-400"
        case "绿":
            return "hover:border-green-400"
        case "白":
            return "hover:border-gray-300"
        default:
            return "hover:border-gray-400"
    }
}
defineProps<{
    mod: LeveledMod | null
    income?: number
    noremove?: boolean
    count?: number
    selected?: boolean
    control?: boolean
    charBuild?: CharBuild
}>()

const emit = defineEmits<{
    removeMod: []
    lvChange: [number]
    countChange: [number]
}>()
</script>
<template>
    <div
        class="aspect-square bg-base-200 rounded-lg border-2 flex items-center justify-center transition-colors cursor-pointer group"
        :class="[mod ? getQualityColor(mod.品质) : 'border-dashed border-gray-600', getQualityHoverBorder(mod?.品质!)]"
        draggable="true"
        @dragstart="$attrs.index !== undefined && $event.dataTransfer?.setData('modIndex', $attrs.index as string)"
        @dragover.prevent
        @dragenter.prevent
    >
        <div class="relative w-full h-full flex items-center justify-center">
            <ShowProps
                v-if="mod"
                :props="mod.getProperties()"
                :title="mod.fullName"
                :polarity="mod.极性"
                :cost="mod.耐受"
                :type="mod.types"
                :desc="mod.效果"
                :eff="charBuild?.checkModEffective(mod) || mod.getCondition()"
            >
                <div class="w-full h-full flex items-center justify-center bg-opacity-30 rounded-lg overflow-hidden">
                    <!-- 背景 -->
                    <div class="absolute inset-0 flex items-center justify-center">
                        <img :src="mod.url" :alt="mod.名称" />
                    </div>
                    <!-- MOD名称 -->
                    <div class="relative mt-auto w-full bg-base-content/30 z-10 text-left p-2">
                        <div class="text-base-100 text-sm font-bold mb-1 flex items-center">
                            <Icon v-if="selected" icon="ri:checkbox-circle-fill" class="inline-block mr-1 text-green-500" />
                            {{ mod.名称 }}
                        </div>
                        <div class="relative">
                            <div
                                v-if="control && (selected || selected === undefined)"
                                class="text-base-300 text-xs pb-4"
                                :class="[count ? 'group-hover:pb-16' : 'group-hover:pb-8']"
                            >
                                <NumberInput
                                    class="absolute w-full max-h-0 group-hover:max-h-20"
                                    :model-value="mod.等级"
                                    @update:modelValue="emit('lvChange', $event)"
                                    :min="0"
                                    :max="mod.maxLevel"
                                    :step="1"
                                />
                                <NumberInput
                                    v-if="count"
                                    class="absolute mt-8 w-full max-h-0 group-hover:max-h-20"
                                    :model-value="count"
                                    @update:modelValue="emit('countChange', $event)"
                                    :min="1"
                                    :max="8"
                                    :step="1"
                                />
                                <div class="absolute w-full flex justify-between max-h-20 overflow-hidden group-hover:max-h-0">
                                    <div class="text-base-300 text-xs">Lv.{{ mod.等级 }}</div>
                                    <div class="text-base-300 text-xs" v-if="income">{{ format100r(income, 1) }}</div>
                                    <div class="text-base-300 text-xs" v-if="count">x {{ count }}</div>
                                </div>
                            </div>
                            <div v-else class="flex justify-between">
                                <div class="text-base-300 text-xs">
                                    {{ control && selected !== undefined ? "未拥有" : `Lv.${mod.等级}` }}
                                </div>
                                <div class="text-base-300 text-xs" v-if="income">{{ format100r(income, 1) }}</div>
                                <div class="text-base-300 text-xs" v-if="count">x{{ count }}</div>
                            </div>
                        </div>
                    </div>
                    <!-- 删除按钮 -->
                    <button
                        v-if="!noremove"
                        @click.stop="emit('removeMod')"
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
