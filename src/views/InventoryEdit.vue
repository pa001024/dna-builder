<script setup lang="ts">
// 引入必要的依赖
import { computed, ref } from "vue"
import { useUIStore } from "@/store/ui"
import { copyText, pasteText } from "@/util"
import { LeveledMod, LeveledWeapon, modData, weaponData } from "../data"
import { useInvStore } from "../store/inv"
import { matchPinyin } from "../utils/pinyin-utils"

const inv = useInvStore()
const ui = useUIStore()
// 武器
const allWeapons = weaponData.filter(v => !v.类型[0].startsWith("同律"))
const weaponSearchQuery = ref("")
const filteredWeapons = computed(() => {
    const mappedWeapons = allWeapons
        .filter(v => inv.enableWeapons[v.类型[0] as keyof typeof inv.enableWeapons])
        .map(v => new LeveledWeapon(v.id, v.id in inv.weapons ? inv.weapons[v.id] : 5))
    if (!weaponSearchQuery.value) return mappedWeapons

    const query = weaponSearchQuery.value.trim()
    return mappedWeapons.filter(weapon => {
        // 直接中文匹配
        if (weapon.名称.includes(query) || weapon.类别.includes(query)) {
            return true
        }
        // 拼音匹配（全拼/首字母）
        const nameMatch = matchPinyin(weapon.名称, query).match
        if (nameMatch) return true
        const categoryMatch = matchPinyin(weapon.类别, query).match
        if (categoryMatch) return true
        return false
    })
})
const filteredInvWeapons = computed(() => {
    const query = weaponSearchQuery.value.trim()
    return Object.keys(inv.weapons).filter(v => {
        try {
            const weapon = new LeveledWeapon(+v)
            if (!inv.enableWeapons[weapon.类型 as keyof typeof inv.enableWeapons]) return false
            // 直接中文匹配
            if (weapon.名称.includes(query) || weapon.类别.includes(query)) {
                return true
            }
            // 拼音匹配（全拼/首字母）
            const nameMatch = matchPinyin(weapon.名称, query).match
            if (nameMatch) return true
            const categoryMatch = matchPinyin(weapon.类别, query).match
            if (categoryMatch) return true
            return false
        } catch {
            delete inv.meleeWeapons[v as any]
            delete inv.rangedWeapons[v as any]
            return false
        }
    })
})
// MOD
const allMods = modData.map(v => new LeveledMod(v.id))
const modSearchQuery = ref("")
const filteredMods = computed(() => {
    const mappedMods = allMods
        .filter(v => inv.enableMods[v.品质 as keyof typeof inv.enableMods])
        .map(v => new LeveledMod(v.id, v.id in inv.mods ? inv.mods[v.id][0] : undefined))
    if (!modSearchQuery.value) return mappedMods

    const query = modSearchQuery.value.trim()
    return mappedMods.filter(mod => {
        // 直接中文匹配
        if (
            mod.名称.includes(query) ||
            mod.属性?.includes(query) ||
            mod.系列.includes(query) ||
            JSON.stringify((mod as any)._originalModData).includes(query)
        ) {
            return true
        }
        // 拼音匹配（全拼/首字母）
        const nameMatch = matchPinyin(mod.名称, query).match
        if (nameMatch) return true
        const propMatch = mod.属性 ? matchPinyin(mod.属性, query).match : false
        if (propMatch) return true
        const seriesMatch = matchPinyin(mod.系列, query).match
        if (seriesMatch) return true
        return false
    })
})

const filteredSelectedMods = computed(() => {
    const selectTypes = new Set(["金", "紫", "蓝", "绿", "白"].filter(v => inv.enableMods[v as keyof typeof inv.enableMods]))
    const query = modSearchQuery.value.trim()
    return Object.keys(inv.mods).filter(v => {
        try {
            const mod = new LeveledMod(+v)
            // 直接中文匹配
            if (
                selectTypes.has(LeveledMod.getQuality(Number(v))) &&
                (mod.名称.includes(query) || mod.属性?.includes(query) || mod.系列.includes(query))
            ) {
                return true
            }
            // 拼音匹配（全拼/首字母）
            const nameMatch = matchPinyin(mod.名称, query).match
            if (nameMatch && selectTypes.has(LeveledMod.getQuality(Number(v)))) return true
            const propMatch = mod.属性 ? matchPinyin(mod.属性, query).match : false
            if (propMatch && selectTypes.has(LeveledMod.getQuality(Number(v)))) return true
            const seriesMatch = matchPinyin(mod.系列, query).match
            if (seriesMatch && selectTypes.has(LeveledMod.getQuality(Number(v)))) return true
            return false
        } catch {
            delete inv.mods[+v]
            return false
        }
    })
})

function toggleSelectWeapon(weaponId: number, weaponType: string) {
    if (weaponType === "近战") {
        if (weaponId in inv.meleeWeapons) {
            delete inv.meleeWeapons[weaponId]
        } else {
            inv.meleeWeapons[weaponId] = 5
        }
    } else if (weaponType === "远程") {
        if (weaponId in inv.rangedWeapons) {
            delete inv.rangedWeapons[weaponId]
        } else {
            inv.rangedWeapons[weaponId] = 5
        }
    }
}

function toggleSelectMod(modId: number, quality: string) {
    if (modId in inv.mods) {
        delete inv.mods[modId]
    } else {
        const mod = new LeveledMod(+modId)
        inv.mods[modId] = [LeveledMod.getMaxLevel(quality), mod.系列 === "契约者" ? 8 : 1]
    }
}

function handleSelectAllWeapons() {
    if (filteredInvWeapons.value.length === filteredWeapons.value.length) {
        filteredWeapons.value.forEach(weapon => {
            if (weapon.类型 === "近战") {
                delete inv.meleeWeapons[weapon.id]
            } else if (weapon.类型 === "远程") {
                delete inv.rangedWeapons[weapon.id]
            }
        })
    } else {
        filteredWeapons.value.forEach(weapon => {
            if (weapon.类型 === "近战") {
                inv.meleeWeapons[weapon.id] = weapon.精炼
            } else if (weapon.类型 === "远程") {
                inv.rangedWeapons[weapon.id] = weapon.精炼
            }
        })
    }
}

function handleSelectAllMods() {
    if (filteredSelectedMods.value.length === filteredMods.value.length) {
        filteredMods.value.forEach(mod => {
            delete inv.mods[mod.id]
        })
    } else {
        filteredMods.value.forEach(mod => {
            inv.mods[mod.id] = [mod.等级, mod.系列 === "契约者" ? 8 : 1]
        })
    }
}
function handleExport() {
    const dataStr = JSON.stringify({ melee: inv.meleeWeapons, ranged: inv.rangedWeapons }, null, 2)
    copyText(dataStr)
    ui.showSuccessMessage("已复制到剪贴板")
}
async function handleImport() {
    const dataStr = await pasteText()
    if (!dataStr) return
    try {
        const data = JSON.parse(dataStr)
        if (!data.melee || !data.ranged || typeof data.melee !== "object" || typeof data.ranged !== "object") {
            ui.showErrorMessage("导入数据格式错误")
            return
        }
        inv.meleeWeapons = data.melee
        inv.rangedWeapons = data.ranged
        ui.showSuccessMessage("已导入")
    } catch {
        console.error("导入失败")
        ui.showErrorMessage("导入失败")
    }
}
</script>
<template>
    <div class="h-full overflow-hidden overflow-y-auto">
        <div class="flex h-full flex-col p-4">
            <div class="flex justify-end gap-2 mb-4">
                <div class="btn btn-sm btn-primary" @click="handleImport">导入</div>
                <div class="btn btn-sm btn-primary" @click="handleExport">导出</div>
            </div>
            <div class="flex-1 bg-base-300 rounded-xl shadow-lg mb-6">
                <div class="p-4 pb-0 flex flex-wrap items-center gap-2 mb-3">
                    <SectionMarker />
                    <h3 class="text-lg font-semibold">拥有武器</h3>
                    <div class="ml-auto flex items-center gap-4">
                        <label class="w-40 input input-sm">
                            <svg class="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.5" fill="none" stroke="currentColor">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.3-4.3" />
                                </g>
                            </svg>
                            <input v-model="weaponSearchQuery" type="search" class="grow" placeholder="搜索（支持拼音）..." />
                        </label>
                        <div
                            class="btn btn-sm btn-secondary"
                            :class="{ 'btn-disabled': !filteredWeapons.length }"
                            @click="handleSelectAllWeapons"
                        >
                            {{ filteredWeapons.length && Object.keys(inv.weapons).length === filteredWeapons.length ? `取消全选` : `全选` }}
                        </div>
                        <div class="label text-xs">
                            近战 <input v-model="inv.enableWeapons.近战" type="checkbox" class="toggle toggle-secondary" />
                        </div>
                        <div class="label text-xs">
                            远程 <input v-model="inv.enableWeapons.远程" type="checkbox" class="toggle toggle-secondary" />
                        </div>
                    </div>
                </div>

                <div class="min-h-80 w-full pb-4">
                    <div
                        v-if="inv.enableWeapons.近战 || inv.enableWeapons.远程"
                        class="p-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4"
                    >
                        <WeaponItem
                            v-for="(weapon, index) in filteredWeapons"
                            :key="index"
                            :selected="weapon.id in inv.weapons"
                            :weapon="weapon"
                            :index="index"
                            noremove
                            control
                            @click="toggleSelectWeapon(weapon.id, weapon.类型)"
                            @refine-change="inv.setWeaponRefineLv(weapon.id, $event)"
                        />
                    </div>
                    <div v-else class="p-4 flex w-full h-72 justify-center items-center text-gray-500">
                        已选择所有, 更改筛选选择自己的库存
                    </div>
                </div>
            </div>
            <div class="flex-1 bg-base-300 rounded-xl shadow-lg mb-6">
                <div class="p-4 pb-0 flex flex-wrap items-center gap-2 mb-3">
                    <SectionMarker />
                    <h3 class="text-lg font-semibold">拥有MOD</h3>
                    <div class="ml-auto flex flex-wrap items-center gap-4">
                        <label class="w-40 input input-sm">
                            <svg class="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.5" fill="none" stroke="currentColor">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.3-4.3" />
                                </g>
                            </svg>
                            <input v-model="modSearchQuery" type="search" class="grow" placeholder="搜索（支持拼音）..." />
                        </label>
                        <div
                            class="btn btn-sm btn-secondary"
                            :class="{ 'btn-disabled': !filteredMods.length }"
                            @click="handleSelectAllMods"
                        >
                            {{ filteredMods.length && filteredSelectedMods.length === filteredMods.length ? `取消全选` : `全选` }}
                        </div>
                        <div v-for="color in ['金', '紫', '蓝', '绿', '白'] as const" :key="color" class="label text-xs">
                            {{ color }}
                            <input
                                :checked="inv.enableMods[color]"
                                type="checkbox"
                                class="toggle toggle-secondary"
                                @change="inv.enableMods[color] = ($event.target! as any).checked"
                            />
                        </div>
                    </div>
                </div>
                <div class="min-h-80 w-full pb-4">
                    <div
                        v-if="(['金', '紫', '蓝', '绿', '白'] as const).some(color => inv.enableMods[color])"
                        class="p-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4"
                    >
                        <ModItem
                            v-for="(mod, index) in filteredMods"
                            :key="index"
                            :mod="mod"
                            :selected="mod.id in inv.mods"
                            :count="mod.系列 === '契约者' ? inv.mods[mod.id]?.[1] : 0"
                            :index="index"
                            control
                            noremove
                            @click="toggleSelectMod(mod.id, mod.品质)"
                            @lv-change="inv.mods[mod.id] = [$event, inv.mods[mod.id][1]]"
                            @count-change="inv.mods[mod.id] = [inv.mods[mod.id][0], $event]"
                        />
                    </div>
                    <div v-else class="p-4 flex w-full h-72 justify-center items-center text-gray-500">
                        已选择所有, 更改筛选选择自己的库存
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
