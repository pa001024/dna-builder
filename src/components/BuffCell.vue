<script setup lang="ts">
import { LeveledBuff } from "@/data/leveled"
import { format100 } from "@/util"

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
        <ShowProps side="top" :props="buff.getProperties()" :attr="buff.attr" :code="buff.code" :title="title">
            <div
                class="flex-1 rounded-xs border border-base-content/10 bg-base-100/70 p-3 cursor-pointer hover:border-primary/40 transition-colors duration-200"
                :class="{
                    ' border-primary bg-primary/5 shadow-sm shadow-primary/10 hover:border-primary': selected,
                }"
            >
                <div class="flex items-center justify-between mb-2">
                    <div class="text-sm font-medium flex items-center gap-1">
                        <div v-if="selected" class="text-primary">
                            <Icon icon="ri:checkbox-circle-fill" />
                        </div>
                        {{ buff.名称 }}
                    </div>
                    <div v-if="buff.mx" class="text-xs text-base-content/60 font-orbitron tabular-nums">
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
                <div class="text-xs text-base-content/60 mb-2">
                    {{ buff.描述 }}
                </div>
                <div class="text-xs text-base-content/40" v-if="income">
                    {{ $t("char-build.income") }}:
                    <span class="font-orbitron tabular-nums">{{ format100(income) }}</span>
                </div>
            </div>
        </ShowProps>
    </div>
</template>
