<script setup lang="ts">
// 引入必要的依赖
import { ref, computed } from "vue"
import gameData from "../data/data.json"
import { LeveledMod, LeveledWeapon } from "../data"
import { useInvStore } from "../store/inv"
const inv = useInvStore()

// 武器
const allWeapons = gameData.weapon.filter((v) => !v.类型.startsWith("同律"))
const weaponSearchQuery = ref("")
const filteredWeapons = computed(() => {
    const mappedWeapons = allWeapons
        .filter((v) => inv.enableWeapons[v.类型 as keyof typeof inv.enableWeapons])
        .map((v) => new LeveledWeapon(v.名称, v.名称 in inv.weapons ? inv.weapons[v.名称] : 5))
    if (!weaponSearchQuery.value) return mappedWeapons

    const query = weaponSearchQuery.value.trim()
    return mappedWeapons.filter((weapon) => weapon.名称.includes(query) || weapon.类别.includes(query))
})
const filteredInvWeapons = computed(() => {
    const query = weaponSearchQuery.value.trim()
    return Object.keys(inv.weapons).filter((v) => v.includes(query))
})
// MOD
const allMods = gameData.mod.map((v) => new LeveledMod(v.id))
const modSearchQuery = ref("")
const filteredMods = computed(() => {
    const mappedMods = allMods
        .filter((v) => inv.enableMods[v.品质 as keyof typeof inv.enableMods])
        .map((v) => new LeveledMod(v.id, v.id in inv.mods ? inv.mods[v.id][0] : undefined))
    if (!modSearchQuery.value) return mappedMods

    const query = modSearchQuery.value.trim()
    return mappedMods.filter((mod) => mod.名称.includes(query) || mod.属性?.includes(query) || mod.系列.includes(query))
})

const filteredSelectedMods = computed(() => {
    const selectTypes = new Set(["金", "紫", "蓝", "绿", "白"].filter((v) => inv.enableMods[v as keyof typeof inv.enableMods]))
    const query = modSearchQuery.value.trim()
    return Object.keys(inv.mods).filter((v) => {
        const mod = new LeveledMod(+v)
        return (
            selectTypes.has(LeveledMod.getQuality(Number(v))) &&
            (mod.名称.includes(query) || mod.属性?.includes(query) || mod.系列.includes(query))
        )
    })
})

function toggleSelectWeapon(weaponName: string, weaponType: string) {
    if (weaponType === "近战") {
        if (weaponName in inv.meleeWeapons) {
            delete inv.meleeWeapons[weaponName]
        } else {
            inv.meleeWeapons[weaponName] = 5
        }
    } else if (weaponType === "远程") {
        if (weaponName in inv.rangedWeapons) {
            delete inv.rangedWeapons[weaponName]
        } else {
            inv.rangedWeapons[weaponName] = 5
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
        filteredWeapons.value.forEach((weapon) => {
            if (weapon.类型 === "近战") {
                delete inv.meleeWeapons[weapon.名称]
            } else if (weapon.类型 === "远程") {
                delete inv.rangedWeapons[weapon.名称]
            }
        })
    } else {
        filteredWeapons.value.forEach((weapon) => {
            if (weapon.类型 === "近战") {
                inv.meleeWeapons[weapon.名称] = weapon.精炼
            } else if (weapon.类型 === "远程") {
                inv.rangedWeapons[weapon.名称] = weapon.精炼
            }
        })
    }
}

function handleSelectAllMods() {
    if (filteredSelectedMods.value.length === filteredMods.value.length) {
        filteredMods.value.forEach((mod) => {
            delete inv.mods[mod.id]
        })
    } else {
        filteredMods.value.forEach((mod) => {
            inv.mods[mod.id] = [mod.等级, mod.系列 === "契约者" ? 8 : 1]
        })
    }
}
</script>
<template>
    <div class="h-full overflow-hidden overflow-y-auto">
        <div class="flex h-full flex-col p-4">
            <div class="flex justify-end gap-2 mb-4">
                <div class="btn btn-primary">导入</div>
                <div class="btn btn-primary">导出</div>
            </div>
            <div class="flex-1 bg-base-300 rounded-xl shadow-lg mb-6">
                <div class="p-4 pb-0 flex flex-wrap items-center gap-2 mb-3">
                    <SectionMarker />
                    <h3 class="text-lg font-semibold">拥有武器</h3>
                    <div class="ml-auto flex items-center gap-4">
                        <label class="w-40 input input-sm">
                            <svg class="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.5" fill="none" stroke="currentColor">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <path d="m21 21-4.3-4.3"></path>
                                </g>
                            </svg>
                            <input type="search" class="grow" placeholder="搜索..." v-model="weaponSearchQuery" />
                        </label>
                        <div
                            class="btn btn-sm btn-secondary"
                            @click="handleSelectAllWeapons"
                            :class="{ 'btn-disabled': !filteredWeapons.length }"
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
                        class="p-4 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4"
                    >
                        <WeaponItem
                            v-for="(weapon, index) in filteredWeapons"
                            :selected="weapon.名称 in inv.weapons"
                            :key="index"
                            :weapon="weapon"
                            :index="index"
                            @click="toggleSelectWeapon(weapon.名称, weapon.类型)"
                            @refineChange="inv.weapons[weapon.名称] = $event"
                            noremove
                            control
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
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <path d="m21 21-4.3-4.3"></path>
                                </g>
                            </svg>
                            <input type="search" class="grow" placeholder="搜索..." v-model="modSearchQuery" />
                        </label>
                        <div
                            class="btn btn-sm btn-secondary"
                            @click="handleSelectAllMods"
                            :class="{ 'btn-disabled': !filteredMods.length }"
                        >
                            {{ filteredMods.length && filteredSelectedMods.length === filteredMods.length ? `取消全选` : `全选` }}
                        </div>
                        <div v-for="color in ['金', '紫', '蓝', '绿', '白'] as const" :key="color" class="label text-xs">
                            {{ color }}
                            <input
                                :checked="inv.enableMods[color]"
                                @change="inv.enableMods[color] = ($event.target! as any).checked"
                                type="checkbox"
                                class="toggle toggle-secondary"
                            />
                        </div>
                    </div>
                </div>
                <div class="min-h-80 w-full pb-4">
                    <div
                        v-if="(['金', '紫', '蓝', '绿', '白'] as const).some((color) => inv.enableMods[color])"
                        class="p-4 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4"
                    >
                        <ModItem
                            v-for="(mod, index) in filteredMods"
                            :key="index"
                            :mod="mod"
                            :selected="mod.id in inv.mods"
                            :count="mod.系列 === '契约者' ? inv.mods[mod.id]?.[1] : 0"
                            :index="index"
                            @click="toggleSelectMod(mod.id, mod.品质)"
                            @lvChange="inv.mods[mod.id] = [$event, inv.mods[mod.id][1]]"
                            @countChange="inv.mods[mod.id] = [inv.mods[mod.id][0], $event]"
                            control
                            noremove
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
