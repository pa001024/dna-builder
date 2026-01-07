<script setup lang="ts">
import { computed } from "vue"
import { CharBuild, LeveledBuff, LeveledMod, LeveledWeapon } from "../data"
import { useInvStore } from "../store/inv"

const inv = useInvStore()
const props = defineProps<{
    mods: (LeveledMod | LeveledWeapon)[]
    charBuild: CharBuild
}>()
const buffOptions = computed(() => {
    return props.mods
        .filter((mod) => mod.buff)
        .map((mod) => {
            const buff = mod.buff!
            const lv = buff.pt === "Weapon" ? inv.getWBuffLv(mod.id) : inv.getBuffLv(mod.id)
            return {
                label: buff.名称 || "",
                value: lv <= 0 ? buff.clone().setLv(buff.mx || 1) : buff,
                lv: lv <= 0 ? buff.等级 : lv,
                description: buff.描述 || "",
            }
        })
})
const selectedBuffs = computed(() => {
    return props.mods
        .filter((mod) => mod.buff && (mod.buff.pt === "Weapon" ? inv.getWBuffLv(mod.id) : inv.getBuffLv(mod.id)) > 0)
        .map((mod) => mod.buff!)
})
function toggleBuff(buff: LeveledBuff) {
    if (buff.pt === "Weapon") {
        const lv = inv.getWBuffLv(buff.pid)
        inv.setWBuffLv(buff.pid, lv <= 0 ? buff.mx || 1 : 0)
    } else {
        const lv = inv.getBuffLv(buff.pid)
        inv.setBuffLv(buff.pid, lv <= 0 ? buff.mx || 1 : 0)
    }
}
function setBuffLv(buff: LeveledBuff, lv: number) {
    if (buff.pt === "Weapon") {
        inv.setWBuffLv(buff.pid, lv)
    } else {
        inv.setBuffLv(buff.pid, lv)
    }
}
</script>
<template>
    <div class="flex items-center gap-2 mb-3">
        <div class="ml-auto flex items-center gap-2">
            <div class="btn btn-sm btn-primary" @click="buffOptions.forEach((buff) => setBuffLv(buff.value, buff.value.mx))">全部最大</div>
            <div class="btn btn-sm btn-primary" @click="buffOptions.forEach((buff) => setBuffLv(buff.value, 0))">全部关闭</div>
        </div>
    </div>
    <BuffEditer
        :buff-options="buffOptions"
        :selected-buffs="selectedBuffs"
        :char-build="charBuild"
        @toggle-buff="toggleBuff"
        @set-buff-lv="setBuffLv"
    />
</template>
