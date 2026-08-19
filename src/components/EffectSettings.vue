<script setup lang="ts">
import { computed } from "vue"
import type { CharSettings } from "@/composables/useCharSettings"
import { CharBuild, LeveledBuff, LeveledMod, LeveledWeapon } from "@/data"
import { getModBuffLvFromSetting, getWBuffLvFromSetting } from "@/data/effectLv"
import { useInvStore } from "@/store/inv"

const inv = useInvStore()
const props = defineProps<{
    mods: (LeveledMod | LeveledWeapon)[]
    charBuild: CharBuild
    useGlobal?: boolean
    charSettings: CharSettings
}>()
const emit = defineEmits<{
    "update:useGlobal": [value: boolean]
}>()

const effectConfig = computed(() => props.charSettings.effectConfig || {})
const getLv = (mod: LeveledMod | LeveledWeapon, elm: string) => {
    if (props.useGlobal) {
        return mod.buff?.pt === "Weapon" ? inv.getWBuffLv(mod.id, elm) : inv.getBuffLv(mod.id)
    }
    return mod.buff?.pt === "Weapon"
        ? getWBuffLvFromSetting(effectConfig.value, mod.id, elm)
        : getModBuffLvFromSetting(effectConfig.value, mod.id)
}
const setLv = (mod: LeveledMod | LeveledWeapon, lv: number) => {
    const mx = mod.buff?.mx || 1
    if (props.useGlobal) {
        if (mod.buff?.pt === "Weapon") inv.setWBuffLv(mod.id, lv)
        else inv.setBuffLv(mod.id, lv)
        return
    }
    // 本地模式：等于最大值即默认态，删除键；否则写入配置
    if (lv >= mx) delete props.charSettings.effectConfig[mod.buff?.pt === "Weapon" ? `w:${mod.id}` : `m:${mod.id}`]
    else props.charSettings.effectConfig[mod.buff?.pt === "Weapon" ? `w:${mod.id}` : `m:${mod.id}`] = lv
}
const buffOptions = computed(() => {
    const elm = props.charBuild.char.属性
    return props.mods
        .filter(mod => mod.buff)
        .map(mod => {
            const buff = mod.buff!
            const lv = getLv(mod, elm)
            return {
                label: buff.名称 || "",
                value: lv <= 0 ? buff.clone().setLv(buff.mx || 1) : buff,
                lv: lv <= 0 ? buff.等级 : lv,
                description: buff.描述 || "",
            }
        })
})
const selectedBuffs = computed(() => {
    const elm = props.charBuild.char.属性
    return props.mods.filter(mod => mod.buff && getLv(mod, elm) > 0).map(mod => mod.buff!)
})
function toggleBuff(buff: LeveledBuff) {
    const mod = props.mods.find(m => m.buff?.pid === buff.pid)
    if (!mod) return
    const elm = props.charBuild.char.属性
    setLv(mod, getLv(mod, elm) <= 0 ? mod.buff?.mx || 1 : 0)
}
function setBuffLv(buff: LeveledBuff, lv: number) {
    const mod = props.mods.find(m => m.buff?.pid === buff.pid)
    if (!mod) return
    setLv(mod, lv)
}
function setAllMax() {
    props.mods.filter(m => m.buff).forEach(mod => setLv(mod, mod.buff?.mx || 1))
}
function setAllOff() {
    props.mods.filter(m => m.buff).forEach(mod => setLv(mod, 0))
}
</script>
<template>
    <div class="flex items-center gap-2 mb-3">
        <label class="flex items-center gap-2 text-sm text-base-content/80 cursor-pointer">
            <input
                :checked="useGlobal"
                type="checkbox"
                class="toggle toggle-sm toggle-primary"
                @change="emit('update:useGlobal', ($event.target as HTMLInputElement).checked)"
            />
            使用全局设置
            <RouterLink title="点击跳转到库存管理" to="/inventory" class="btn btn-xs text-lg btn-ghost btn-circle">
                <Icon icon="ri:question-line" />
            </RouterLink>
        </label>
        <div class="ml-auto flex items-center gap-2">
            <div class="btn btn-ghost btn-sm border border-base-content/15" @click="setAllMax">全部最大</div>
            <div class="btn btn-ghost btn-sm border border-base-content/15" @click="setAllOff">全部关闭</div>
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
