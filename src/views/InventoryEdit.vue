<script setup lang="ts">
import type { DNAAPI, DNAModesBean, DNARoleShowBean } from "dna-api"
import { useTranslation } from "i18next-vue"
// 引入必要的依赖
import { computed, ref } from "vue"
import { LeveledMod, LeveledModHelper, LeveledWeapon, LeveledWeaponHelper, modData, weaponData } from "@/data"
import { useInvStore } from "@/store/inv"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { copyText, pasteText } from "@/util"
import { matchPinyin } from "@/utils/pinyin-utils"

const inv = useInvStore()
const ui = useUIStore()
const { t } = useTranslation()
const syncing = ref(false)
// 同步模式选择弹窗是否可见
const showSyncModeDialog = ref(false)
// 武器
const allWeapons = weaponData.filter(v => !v.类型[0].startsWith("同律"))
const weaponSearchQuery = ref("")
const filteredWeapons = computed(() => {
    const mappedWeapons = allWeapons
        .filter(v => inv.enableWeapons[v.类型[0] as keyof typeof inv.enableWeapons])
        .map(v => LeveledWeaponHelper.fromId(v.id, v.id in inv.weapons ? inv.weapons[v.id] : 5))
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
            const weapon = LeveledWeaponHelper.fromId(+v)
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
const allMods = modData.map(v => LeveledModHelper.fromId(v.id))
const modSearchQuery = ref("")
const filteredMods = computed(() => {
    const mappedMods = allMods
        .filter(v => inv.enableMods[v.品质 as keyof typeof inv.enableMods])
        .map(v => LeveledModHelper.fromId(v.id, v.id in inv.mods ? inv.mods[v.id][0] : undefined))
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
            const mod = LeveledModHelper.fromId(+v)
            // 直接中文匹配
            if (
                selectTypes.has(LeveledModHelper.getQuality(Number(v))) &&
                (mod.名称.includes(query) || mod.属性?.includes(query) || mod.系列.includes(query))
            ) {
                return true
            }
            // 拼音匹配（全拼/首字母）
            const nameMatch = matchPinyin(mod.名称, query).match
            if (nameMatch && selectTypes.has(LeveledModHelper.getQuality(Number(v)))) return true
            const propMatch = mod.属性 ? matchPinyin(mod.属性, query).match : false
            if (propMatch && selectTypes.has(LeveledModHelper.getQuality(Number(v)))) return true
            const seriesMatch = matchPinyin(mod.系列, query).match
            if (seriesMatch && selectTypes.has(LeveledModHelper.getQuality(Number(v)))) return true
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
        const mod = LeveledModHelper.fromId(+modId)
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

/**
 * 同步模式: 仅武器 / 武器和角色魔之楔 / 武器和角色武器魔之楔
 */
type SyncMode = "weapons" | "weapons_and_mods" | "weapons_and_all_mods"

/**
 * 打开同步模式选择弹窗
 */
function openSyncDialog() {
    if (syncing.value) return
    showSyncModeDialog.value = true
}

/**
 * 根据选中的同步模式开始同步, 同步魔之楔前先弹出确认提示
 * @param mode 同步模式
 */
async function startSync(mode: SyncMode) {
    showSyncModeDialog.value = false
    // 同步魔之楔需要扫描所有角色(及武器)已装备的魔之楔, 耗时较长, 先确认
    if (mode === "weapons_and_mods" || mode === "weapons_and_all_mods") {
        const message =
            mode === "weapons_and_mods" ? t("inventory.sync_mods_confirm") : t("inventory.sync_all_mods_confirm")
        const confirmed = await ui.showDialog(t("inventory.sync_mods_confirm_title"), message)
        if (!confirmed) return
    }
    await syncInventory(mode)
}

/**
 * 统计单个实体(角色或武器)装备的魔之楔数量与最大等级
 * @param modes 角色或武器详情的魔之楔数组
 * @returns 魔之楔统计 {魔之楔ID: [数量, 等级]}
 */
function statsFromModes(modes: DNAModesBean[]) {
    const stats = new Map<number, [number, number]>()
    for (const mode of modes) {
        // 空槽位的魔之楔ID为 -1, 跳过
        if (!mode || +mode.id === -1) continue
        try {
            const mod = LeveledModHelper.fromId(+mode.id, mode.level)
            const id = +mode.id
            const stat = stats.get(id) ?? [0, 0]
            stats.set(id, [stat[0] + 1, Math.max(stat[1], mod.等级)])
        } catch {
            // 静态表中不存在的魔之楔直接忽略
        }
    }
    return stats
}

/**
 * 将单个实体(角色或武器)的魔之楔统计合并进全局结果
 * @param target 全局结果映射 {魔之楔ID: [等级, 数量]}
 * @param stats 单个实体的魔之楔统计 {魔之楔ID: [数量, 等级]}
 */
function mergeModStats(target: Record<number, [number, number]>, stats: Map<number, [number, number]>) {
    for (const [id, [count, level]] of stats) {
        const prev = target[id]
        // 数量取单个实体装备数量的最大值(上限8), 等级取最大值
        target[id] = [Math.max(prev?.[0] ?? 0, level), Math.max(prev?.[1] ?? 0, Math.min(8, count))]
    }
}

/**
 * 扫描所有角色已装备的魔之楔, 汇总为库存映射
 * @param api DNA API 实例
 * @param roleShow 角色展示信息
 * @param includeWeaponMods 是否额外同步武器上装备的魔之楔
 * @returns 魔之楔库存映射 {魔之楔ID: [等级, 数量]}
 */
async function collectEquippedMods(api: DNAAPI, roleShow: DNARoleShowBean, includeWeaponMods = false) {
    const mods: Record<number, [number, number]> = {}
    const chars = roleShow.roleChars || []
    for (const char of chars) {
        if (!char.unLocked) continue
        const res = await api.getRoleDetail(char.charId, char.charEid)
        if (!res.is_success || !res.data?.charDetail?.modes) continue
        mergeModStats(mods, statsFromModes(res.data.charDetail.modes))
    }
    // 额外同步所有武器已装备的魔之楔
    if (includeWeaponMods) {
        const seenWeapons = new Set<number>()
        const weapons = [...(roleShow.closeWeapons || []), ...(roleShow.langRangeWeapons || [])]
        for (const weapon of weapons) {
            if (!weapon.unLocked || seenWeapons.has(weapon.weaponId)) continue
            seenWeapons.add(weapon.weaponId)
            const res = await api.getWeaponDetail(weapon.weaponId, weapon.weaponEid)
            if (!res.is_success || !res.data?.weaponDetail?.modes) continue
            mergeModStats(mods, statsFromModes(res.data.weaponDetail.modes))
        }
    }
    return mods
}

/**
 * 同步游戏库存到本地
 * @param mode 同步模式, 默认仅同步武器
 */
async function syncInventory(mode: SyncMode = "weapons") {
    const setting = useSettingStore()
    if (syncing.value) {
        return
    }
    try {
        syncing.value = true
        const api = await setting.getDNAAPI()
        if (!api) {
            ui.showErrorMessage("请先登录皎皎角账号")
            return
        }
        await setting.startHeartbeat()
        const res = await api.defaultRoleForTool()
        if (!res.is_success) {
            ui.showErrorMessage("库存同步失败")
            return
        }
        const roleInfo = res.data
        if (!roleInfo?.roleInfo.roleShow.closeWeapons || !roleInfo.roleInfo.roleShow.langRangeWeapons) {
            ui.showErrorMessage("无库存, 请先到官方APP绑定角色")
            return
        }
        inv.meleeWeapons = roleInfo.roleInfo.roleShow.closeWeapons.reduce(
            (acc, cur) => {
                if (cur.unLocked) acc[cur.weaponId] = cur.skillLevel
                return acc
            },
            {} as Record<string, number>
        )
        inv.rangedWeapons = roleInfo.roleInfo.roleShow.langRangeWeapons.reduce(
            (acc, cur) => {
                if (cur.unLocked) acc[cur.weaponId] = cur.skillLevel
                return acc
            },
            {} as Record<string, number>
        )
        // 同步魔之楔: 扫描所有角色已装备的魔之楔, "武器和角色武器魔之楔"模式额外同步武器上装备的魔之楔
        if (mode === "weapons_and_mods" || mode === "weapons_and_all_mods") {
            inv.mods = await collectEquippedMods(api, roleInfo.roleInfo.roleShow, mode === "weapons_and_all_mods")
        }
        ui.showSuccessMessage("库存同步成功")
    } catch (e) {
        ui.showErrorMessage("库存同步失败:", e instanceof Error ? e.message : String(e))
    } finally {
        setting.stopHeartbeat()
        syncing.value = false
    }
}

// 特效编辑功能
import { LeveledBuff } from "@/data"

// 获取所有武器和MOD的buffs
const allItemsWithBuffs = computed(() => {
    // 获取所有武器
    const allWeapons = [...Object.keys(inv.meleeWeapons), ...Object.keys(inv.rangedWeapons)]
        .map(id => {
            try {
                return LeveledWeaponHelper.fromId(+id)
            } catch {
                delete inv.meleeWeapons[+id]
                delete inv.rangedWeapons[+id]
                return null
            }
        })
        .filter(item => item !== null) as LeveledWeapon[]

    // 获取所有MOD
    const allMods = Object.keys(inv.mods).map(id => {
        return LeveledModHelper.fromId(+id)
    })

    // 合并所有物品
    return [...allWeapons, ...allMods]
})

// 特效选项
const buffOptions = computed(() => {
    return allItemsWithBuffs.value
        .filter(item => item.buff)
        .map(item => {
            const buff = item.buff!
            const lv = buff.pt === "Weapon" ? inv.getWBuffLv(item.id, "any") : inv.getBuffLv(item.id)
            return {
                label: buff.名称 || "",
                value: buff,
                lv: lv <= 0 ? buff.等级 : lv,
                description: buff.描述 || "",
            }
        })
})

// 已选择的特效
const selectedBuffs = computed(() => {
    return allItemsWithBuffs.value
        .filter(item => item.buff && (item.buff.pt === "Weapon" ? inv.getWBuffLv(item.id, "any") : inv.getBuffLv(item.id)) > 0)
        .map(item => item.buff!)
})

// 切换特效
function toggleBuff(buff: LeveledBuff) {
    if (buff.pt === "Weapon") {
        const lv = inv.getWBuffLv(buff.pid, "any")
        inv.setWBuffLv(buff.pid, lv <= 0 ? buff.mx || 1 : 0)
    } else {
        const lv = inv.getBuffLv(buff.pid)
        inv.setBuffLv(buff.pid, lv <= 0 ? buff.mx || 1 : 0)
    }
}

// 设置特效等级
function setBuffLv(buff: LeveledBuff, lv: number) {
    if (buff.pt === "Weapon") {
        inv.setWBuffLv(buff.pid, lv)
    } else {
        inv.setBuffLv(buff.pid, lv)
    }
}

// 经验计算器
const showExpCalculator = ref(false)
</script>
<template>
    <div class="relative h-full">
        <ScrollArea class="h-full">
            <div class="stagger-rise mx-auto flex max-w-6xl flex-col gap-4 p-4">
                <!-- 工具栏 -->
                <div class="flex justify-end gap-2">
                    <button
                        type="button"
                        class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 text-sm font-medium text-base-content/80 backdrop-blur-sm transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="showExpCalculator = true"
                    >
                        经验计算
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary/20"
                        @click="openSyncDialog"
                    >
                        <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                        <span>{{ syncing ? "同步中" : "同步游戏" }}</span>
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 text-sm font-medium text-base-content/80 backdrop-blur-sm transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="handleImport"
                    >
                        导入JSON
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 text-sm font-medium text-base-content/80 backdrop-blur-sm transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="handleExport"
                    >
                        复制JSON
                    </button>
                </div>

                <!-- 拥有武器 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="WEAPONS" title="拥有武器">
                        <template #trailing>
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <div class="relative w-52">
                                    <Icon
                                        icon="ri:search-line"
                                        class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35"
                                    />
                                    <input
                                        v-model="weaponSearchQuery"
                                        type="search"
                                        placeholder="搜索（支持拼音）..."
                                        class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1 pl-7 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                                    />
                                </div>
                                <button
                                    type="button"
                                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40"
                                    :class="
                                        filteredWeapons.length && Object.keys(inv.weapons).length === filteredWeapons.length
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    :disabled="!filteredWeapons.length"
                                    @click="handleSelectAllWeapons"
                                >
                                    {{
                                        filteredWeapons.length && Object.keys(inv.weapons).length === filteredWeapons.length
                                            ? "取消全选"
                                            : "全选"
                                    }}
                                </button>
                                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/60">
                                    近战
                                    <input v-model="inv.enableWeapons.近战" type="checkbox" class="toggle toggle-secondary toggle-sm" />
                                </label>
                                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/60">
                                    远程
                                    <input v-model="inv.enableWeapons.远程" type="checkbox" class="toggle toggle-secondary toggle-sm" />
                                </label>
                            </div>
                        </template>
                    </SectionHeader>

                    <div class="min-h-80 w-full pt-2">
                        <div
                            v-if="inv.enableWeapons.近战 || inv.enableWeapons.远程"
                            class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3"
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
                        <div v-else class="flex h-72 w-full items-center justify-center text-sm text-base-content/40">
                            已选择所有, 更改筛选选择自己的库存
                        </div>
                    </div>
                </section>

                <!-- 拥有MOD -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="MODS" title="拥有魔之楔">
                        <template #trailing>
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <div class="relative w-52">
                                    <Icon
                                        icon="ri:search-line"
                                        class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35"
                                    />
                                    <input
                                        v-model="modSearchQuery"
                                        type="search"
                                        placeholder="搜索（支持拼音）..."
                                        class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1 pl-7 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                                    />
                                </div>
                                <button
                                    type="button"
                                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40"
                                    :class="
                                        filteredMods.length && filteredSelectedMods.length === filteredMods.length
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    :disabled="!filteredMods.length"
                                    @click="handleSelectAllMods"
                                >
                                    {{ filteredMods.length && filteredSelectedMods.length === filteredMods.length ? "取消全选" : "全选" }}
                                </button>
                                <label
                                    v-for="color in ['金', '紫', '蓝', '绿', '白'] as const"
                                    :key="color"
                                    class="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/60"
                                >
                                    {{ color }}
                                    <input
                                        :checked="inv.enableMods[color]"
                                        type="checkbox"
                                        class="toggle toggle-secondary toggle-sm"
                                        @change="inv.enableMods[color] = ($event.target! as any).checked"
                                    />
                                </label>
                            </div>
                        </template>
                    </SectionHeader>

                    <div class="min-h-80 w-full pt-2">
                        <div
                            v-if="(['金', '紫', '蓝', '绿', '白'] as const).some(color => inv.enableMods[color])"
                            class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3"
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
                        <div v-else class="flex h-72 w-full items-center justify-center text-sm text-base-content/40">
                            已选择所有, 更改筛选选择自己的库存
                        </div>
                    </div>
                </section>

                <!-- 特效编辑 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="BUFFS" title="特效编辑">
                        <template #trailing>
                            <div class="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border border-primary/40 bg-primary/10 px-2 text-[11px] font-semibold text-primary transition-colors duration-150 hover:bg-primary/20"
                                    @click="buffOptions.forEach(buff => setBuffLv(buff.value, buff.value.mx || 1))"
                                >
                                    全部最大
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] font-medium text-base-content/60 transition-colors duration-150 hover:border-error/50 hover:text-error"
                                    @click="buffOptions.forEach(buff => setBuffLv(buff.value, 0))"
                                >
                                    全部关闭
                                </button>
                            </div>
                        </template>
                    </SectionHeader>
                    <div class="min-h-80 w-full pt-2">
                        <BuffEditer
                            class="h-120"
                            :buff-options="buffOptions"
                            :selected-buffs="selectedBuffs"
                            @toggle-buff="toggleBuff"
                            @set-buff-lv="setBuffLv"
                        />
                    </div>
                </section>
            </div>
        </ScrollArea>

        <!-- 经验计算器（半透明全屏覆盖层） -->
        <div v-if="showExpCalculator" class="absolute inset-0 z-20 bg-base-100/85 backdrop-blur-md">
            <div class="absolute z-10 flex items-center p-2">
                <button
                    type="button"
                    class="cursor-pointer rounded-xs border border-base-content/20 bg-base-100/80 p-1.5 text-base-content/60 backdrop-blur transition-colors duration-150 hover:border-error/50 hover:text-error"
                    title="关闭"
                    @click="showExpCalculator = false"
                >
                    <Icon icon="ri:close-line" class="block size-4" />
                </button>
            </div>
            <ScrollArea class="h-full">
                <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4">
                    <div class="flex justify-end gap-2">
                        <button
                            type="button"
                            class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 text-sm font-medium text-base-content/80 backdrop-blur-sm transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                            @click="showExpCalculator = false"
                        >
                            退出全屏
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary/20"
                            :class="{ loading: syncing }"
                            @click="openSyncDialog"
                        >
                            <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                            <span>{{ syncing ? "同步中" : "同步游戏" }}</span>
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 text-sm font-medium text-base-content/80 backdrop-blur-sm transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                            @click="handleImport"
                        >
                            导入JSON
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 text-sm font-medium text-base-content/80 backdrop-blur-sm transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                            @click="handleExport"
                        >
                            复制JSON
                        </button>
                    </div>
                    <PlayerExpCalculator />
                </div>
            </ScrollArea>
        </div>

        <!-- 同步模式选择弹窗 -->
        <dialog class="modal" :class="{ 'modal-open': showSyncModeDialog }">
            <div class="modal-box bg-base-300 w-11/12 max-w-sm">
                <h3 class="text-lg font-bold">{{ $t("inventory.sync_mode_title") }}</h3>
                <div class="mt-4 flex flex-col gap-2">
                    <button
                        type="button"
                        class="flex cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 py-3 text-sm font-medium text-base-content/80 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="startSync('weapons')"
                    >
                        <Icon icon="ri:sword-line" class="size-4" />
                        {{ $t("inventory.sync_mode_weapons_only") }}
                    </button>
                    <button
                        type="button"
                        class="flex cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 py-3 text-sm font-medium text-base-content/80 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="startSync('weapons_and_mods')"
                    >
                        <Icon icon="ri:puzzle-line" class="size-4" />
                        {{ $t("inventory.sync_mode_weapons_and_mods") }}
                    </button>
                    <button
                        type="button"
                        class="flex cursor-pointer items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-4 py-3 text-sm font-medium text-base-content/80 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="startSync('weapons_and_all_mods')"
                    >
                        <Icon icon="ri:box-3-line" class="size-4" />
                        {{ $t("inventory.sync_mode_weapons_and_all_mods") }}
                    </button>
                </div>
                <div class="modal-action">
                    <form method="dialog">
                        <button class="btn" @click="showSyncModeDialog = false">
                            {{ $t("setting.cancel") }}
                        </button>
                    </form>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="showSyncModeDialog = false">close</button>
            </form>
        </dialog>
    </div>
</template>
