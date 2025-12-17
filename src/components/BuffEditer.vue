<script setup lang="ts">
import { CharBuild } from "../data/CharBuild"
import { LeveledBuff } from "../data/leveled"

interface BuffOption {
    label: string
    value: LeveledBuff
    lv: number
    limit?: string
    description?: string
}
defineProps<{
    buffOptions: BuffOption[]
    selectedBuffs: LeveledBuff[]
    charBuild: CharBuild
}>()

const emit = defineEmits<{
    toggleBuff: [buff: LeveledBuff]
    setBuffLv: [buff: LeveledBuff, level: number]
}>()

const toggleBuff = (buff: LeveledBuff) => {
    emit("toggleBuff", buff)
}

const setBuffLv = (buff: LeveledBuff, lv: number) => {
    emit("setBuffLv", buff, lv)
}
</script>
<template>
    <ScrollArea class="h-80 w-full">
        <transition-group name="list" tag="div" class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <!-- 已选择的BUFF -->
            <BuffCell
                v-for="buff in buffOptions.filter((b) => selectedBuffs.some((v) => v.名称 === b.label))"
                :key="buff.label"
                :title="buff.label"
                :buff="buff.value"
                :lv="buff.lv"
                selected
                :income="charBuild.calcIncome(buff.value, true)"
                @setBuffLv="setBuffLv"
                @click="toggleBuff(buff.value)"
            />
            <!-- 未选择的BUFF -->
            <BuffCell
                v-for="buff in buffOptions.filter((b) => !selectedBuffs.some((v) => v.名称 === b.label))"
                :key="buff.label"
                :title="buff.label"
                :buff="buff.value"
                :lv="buff.lv"
                :income="charBuild.calcIncome(buff.value, false)"
                @setBuffLv="setBuffLv"
                @click="toggleBuff(buff.value)"
            />
        </transition-group>
    </ScrollArea>
</template>
