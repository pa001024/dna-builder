<script setup lang="ts">
import { computed } from "vue"
import { CharBuild } from "../data/CharBuild"
import { LeveledBuff } from "../data/leveled"

interface BuffOption {
    label: string
    value: LeveledBuff
    lv: number
    limit?: string
    description?: string
}
const props = defineProps<{
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

const sortedBuffs = computed(() => {
    // 获取角色名称
    const charName = props.charBuild.char.名称 || ""

    return [...props.buffOptions.filter(b => !props.selectedBuffs.some(v => v.名称 === b.label))].sort((a, b) => {
        // 最先是包含角色名称的BUFF; 然后按默认顺序排序
        const aHasCharName = a.label.includes(charName) || a.value.名称.includes(charName)
        const bHasCharName = b.label.includes(charName) || b.value.名称.includes(charName)

        // 如果一个包含角色名称，另一个不包含，则包含角色名称的排在前面
        if (aHasCharName && !bHasCharName) return -1
        if (!aHasCharName && bHasCharName) return 1

        // 否则保持默认顺序
        return 0
    })
})
</script>
<template>
    <ScrollArea class="h-80">
        <transition-group name="list" tag="div" class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            <!-- 已选择的BUFF -->
            <BuffCell
                v-for="buff in buffOptions.filter(b => selectedBuffs.some(v => v.名称 === b.label))"
                :key="buff.label"
                :title="buff.label"
                :buff="buff.value"
                :lv="buff.lv"
                selected
                :income="charBuild.calcIncome(buff.value, true)"
                @set-buff-lv="setBuffLv"
                @click="toggleBuff(buff.value)"
            />
            <!-- 未选择的BUFF -->
            <BuffCell
                v-for="buff in sortedBuffs"
                :key="buff.label"
                :title="buff.label"
                :buff="buff.value"
                :lv="buff.lv"
                :income="charBuild.calcIncome(buff.value, false)"
                @set-buff-lv="setBuffLv"
                @click="toggleBuff(buff.value)"
            />
        </transition-group>
    </ScrollArea>
</template>
