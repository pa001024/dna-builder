<script setup lang="ts">
import { LeveledBuff } from "../data/leveled"
import { format100 } from "../util"

defineProps<{
    buff: LeveledBuff
    lv: number
    selected?: boolean
    income: number
    title?: string
}>()
const emit = defineEmits<{
    setBuffLv: [buff: LeveledBuff, level: number]
}>()

const setBuffLv = (buff: LeveledBuff, lv: number) => {
    emit("setBuffLv", buff, lv)
}
</script>
<template>
    <div class="flex">
        <ShowProps side="top" :props="buff.getProperties()" :code="buff.code" :title="title">
            <div
                class="flex-1 bg-base-200/50 rounded-lg p-3 cursor-pointer hover:bg-gray-200/20 transition-colors"
                :class="{
                    ' border border-green-500/20 hover:bg-green-200/20': selected,
                }"
            >
                <div class="flex items-center justify-between mb-2">
                    <div class="text-sm font-medium flex items-center gap-1">
                        <div v-if="selected" class="text-green-500">
                            <Icon icon="ri:checkbox-circle-fill" />
                        </div>
                        {{ buff.名称 }}
                    </div>
                    <div v-if="buff.mx" class="text-xs text-gray-400">
                        Lv.
                        <NumberInput
                            v-if="selected"
                            :model-value="lv"
                            :min="buff.lx || 0"
                            :max="buff.mx"
                            class="w-8 text-center"
                            @update:model-value="setBuffLv(buff, $event)"
                        />
                        <span v-else>{{ lv }}</span>
                    </div>
                </div>
                <div class="text-xs text-base-content/50 mb-2">
                    {{ buff.描述 }}
                </div>
                <div class="text-xs text-base-content/30">
                    {{ $t("char-build.income") }}:
                    {{ format100(income) }}
                </div>
            </div>
        </ShowProps>
    </div>
</template>
