<script setup lang="ts">
import { LeveledBuff } from "../data/leveled"
import { format100, formatProp } from "../util"

const props = defineProps<{
    buff: LeveledBuff
    lv: number
    selected?: boolean
    income: number
}>()
const emit = defineEmits<{
    setBuffLv: [buff: LeveledBuff, level: number]
}>()

const setBuffLv = (buff: LeveledBuff, lv: number) => {
    emit("setBuffLv", buff, lv)
}
</script>
<template>
    <FullTooltip side="top">
        <template #tooltip>
            <div class="flex flex-col gap-2">
                <div v-for="(val, prop) in buff.getProperties()" :key="prop" class="flex justify-between items-center gap-2 text-sm">
                    <div class="text-xs text-neutral-500">{{ prop }}</div>
                    <div class="font-medium text-primary">{{ formatProp(prop as string, val) }}</div>
                </div>
                <div v-if="buff.code" class="text-xs text-gray-400">
                    <div class="text-xs text-neutral-500">{{ $t("char-build.dynamic_prop") }}</div>
                    {{ buff.code }}
                </div>
            </div>
        </template>
        <div
            class="bg-base-200 rounded-lg p-3 cursor-pointer hover:bg-gray-200 transition-colors"
            :class="{
                'bg-green-100 border border-green-500 hover:bg-green-200': selected,
            }"
            v-bind="$attrs"
        >
            <div class="flex items-center justify-between mb-2">
                <div class="text-sm font-medium flex items-center gap-1">
                    <div v-if="selected" class="text-green-500">
                        <Icon icon="ri:checkbox-circle-fill" />
                    </div>
                    {{ buff.名称 }}
                </div>
                <div class="text-xs text-gray-400" v-if="buff.dx">
                    Lv.
                    <NumberInput
                        v-if="selected"
                        :model-value="lv"
                        @update:model-value="setBuffLv(buff, $event)"
                        :min="buff.lx"
                        :max="buff.mx"
                        class="w-8 text-center"
                    />
                    <span v-else>{{ lv }}</span>
                </div>
            </div>
            <div class="text-xs text-gray-400 mb-2">{{ buff.描述 }}</div>
            <div class="text-xs text-gray-500">
                {{ $t("char-build.income") }}:
                {{ format100(income) }}
            </div>
        </div>
    </FullTooltip>
</template>
