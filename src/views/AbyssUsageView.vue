<script setup lang="ts">
import type { DNAAPI, DNARoleEntity } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { abyssUsageBaseQuery } from "@/api/combined"
import type {
    AbyssRoleUsageStat,
    AbyssUsageLineupStat,
    AbyssUsageSlotStat,
    AbyssUsageSlotStats,
    AbyssWeaponUsageStat,
} from "@/api/gen/api-types"
import { abyssUsageLineupStatsQuery, submitAbyssUsageMutation } from "@/api/graphql"
import { abyssDungeonMap, charMap, petMap, weaponMap } from "@/data"
import { LeveledChar } from "@/data/leveled/LeveledChar"
import { LeveledPet } from "@/data/leveled/LeveledPet"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { buildAbyssUploadPayload, getCurrentAbyssSeason } from "@/utils/abyss-upload"
import { formatTimeRange } from "@/utils/time"

type LineupSlot = {
    kind: "char" | "weapon" | "pet"
    id: number
    icon: string
    link: string
    label: string
}

type UsageGroup = {
    label: string
    items: AbyssRoleUsageStat[]
}

type SlotStatKind = "support" | "meleeWeapon" | "rangedWeapon" | "pet"

type SlotStatSection = {
    key: SlotStatKind
    label: string
    items: AbyssUsageSlotStat[]
    total: number
}

type DistributionItem = {
    level: number
    label: string
    percent: string
}

const setting = useSettingStore()
const ui = useUIStore()

let api: DNAAPI

const loading = ref(false)
const abyssUploading = ref(false)
const seasonInfo = ref<ReturnType<typeof getCurrentAbyssSeason>>(null)
const roleStats = ref<AbyssRoleUsageStat[]>([])
const weaponStats = ref<AbyssWeaponUsageStat[]>([])
const lineupStats = ref<AbyssUsageLineupStat[]>([])
const roleRanks = ref<AbyssRoleUsageStat[]>([])
const weaponRanks = ref<AbyssWeaponUsageStat[]>([])
const slotStats = ref<AbyssUsageSlotStats | null>(null)
const selectedAssistantCharId = ref<number | null>(null)
const assistantMainOnly = ref(false)
const assistantLineupStats = ref<AbyssUsageLineupStat[]>([])

const seasonRoleName = computed(() => {
    const charId = seasonInfo.value?.bindCharId
    return charId ? charMap.get(charId)?.名称 || "--" : "--"
})

const seasonRoleIcon = computed(() => {
    const charId = seasonInfo.value?.bindCharId
    return charId ? LeveledChar.idToUrl(charId) : ""
})

const seasonRangeText = computed(() => {
    if (!seasonInfo.value) {
        return ""
    }
    return formatTimeRange(seasonInfo.value.startTime, seasonInfo.value.endTime)
})

const seasonVersionText = computed(() => {
    const version = seasonInfo.value?.version
    if (!version) {
        return "--"
    }
    return `v${version}${seasonInfo.value?.half || ""}`
})

const seasonDungeon = computed(() => {
    const seasonId = seasonInfo.value?.seasonId
    if (!seasonId) {
        return null
    }
    return (
        Array.from(abyssDungeonMap.values())
            .filter(dungeon => dungeon.sid === seasonId && dungeon.art === "奖励进度·不朽剧目")
            .sort((left, right) => left.id - right.id)[0] || null
    )
})

const seasonDungeonLink = computed(() => {
    if (!seasonDungeon.value) {
        return "/db/abyss"
    }
    return `/db/abyss?dgg=%E4%B8%8D%E6%9C%BD%E5%89%A7%E7%9B%AE&id=${seasonDungeon.value.id}`
})

const seasonCharLink = computed(() => {
    const charId = seasonInfo.value?.bindCharId
    return charId ? `/db/char/${charId}` : "/db/char/0"
})

const lineupTotal = computed(() => lineupStats.value.reduce((sum, item) => sum + (item.submissionCount || 0), 0))

const slotStatSections = computed<SlotStatSection[]>(() => {
    const stats = slotStats.value
    if (!stats) {
        return []
    }
    return [
        {
            key: "support",
            label: "助战",
            items: stats.support || [],
            total: (stats.support || []).reduce((sum, item) => sum + item.submissionCount, 0),
        },
        {
            key: "meleeWeapon",
            label: "近战武器",
            items: stats.meleeWeapon || [],
            total: (stats.meleeWeapon || []).reduce((sum, item) => sum + item.submissionCount, 0),
        },
        {
            key: "rangedWeapon",
            label: "远程武器",
            items: stats.rangedWeapon || [],
            total: (stats.rangedWeapon || []).reduce((sum, item) => sum + item.submissionCount, 0),
        },
        {
            key: "pet",
            label: "魔灵",
            items: stats.pet || [],
            total: (stats.pet || []).reduce((sum, item) => sum + item.submissionCount, 0),
        },
    ].filter(section => section.items.length > 0) as SlotStatSection[]
})

const groupedRoleRanks = computed<UsageGroup[]>(() => {
    const groups: UsageGroup[] = [
        { label: "80% 以上", items: [] },
        { label: "60% - 80%", items: [] },
        { label: "40% - 60%", items: [] },
        { label: "20% - 40%", items: [] },
        { label: "20% 以下", items: [] },
    ]

    for (const item of roleRanks.value) {
        const owned = item.ownedCount || 0
        const rate = owned ? ((item.submissionCount || 0) / owned) * 100 : 0
        if (rate >= 80) {
            groups[0].items.push(item)
        } else if (rate >= 60) {
            groups[1].items.push(item)
        } else if (rate >= 40) {
            groups[2].items.push(item)
        } else if (rate >= 20) {
            groups[3].items.push(item)
        } else {
            groups[4].items.push(item)
        }
    }

    return groups.filter(group => group.items.length > 0)
})

function getCharName(charId?: number) {
    return charId ? charMap.get(charId)?.名称 || String(charId) : "--"
}

function getWeaponName(weaponId?: number) {
    return weaponId ? weaponMap.get(weaponId)?.名称 || String(weaponId) : "--"
}

function getCharIcon(charId?: number) {
    return charId ? LeveledChar.idToUrl(charId) : ""
}

function getWeaponIcon(weaponId?: number) {
    return weaponId ? LeveledWeapon.idToUrl(weaponId) : ""
}

function getPetName(petId?: number) {
    return petId ? petMap.get(petId)?.名称 || String(petId) : "--"
}

function getPetIcon(petId?: number) {
    const pet = petId ? petMap.get(petId) : null
    return pet?.icon ? LeveledPet.url(pet.icon) : ""
}

function getCharLink(charId?: number) {
    return charId ? `/db/char/${charId}` : "/db/char/0"
}

function getWeaponLink(weaponId?: number) {
    return weaponId ? `/db/weapon/${weaponId}` : "/db/weapon"
}

function getPetLink(petId?: number) {
    return petId ? `/db/pet/${petId}` : "/db/pet"
}

/**
 * 拉取最新角色信息，不写入页面缓存。
 * @returns 最新角色信息。
 */
async function fetchLatestRoleInfo() {
    if (!api) {
        const client = await setting.getDNAAPI()
        if (!client) {
            ui.showErrorMessage("请先登录")
            return null
        }
        api = client
    }

    try {
        await setting.startHeartbeat()
        const roleRes = await api.defaultRoleForTool()
        if (roleRes.is_success && roleRes.data) {
            return roleRes.data
        }
        throw new Error(roleRes.msg || "获取默认角色信息失败")
    } catch (error) {
        ui.showErrorMessage("获取最新角色信息失败", error instanceof Error ? error.message : String(error))
        return null
    } finally {
        await setting.stopHeartbeat()
    }
}

/**
 * 上传当前深渊数据。
 */
async function uploadAbyssUsage() {
    abyssUploading.value = true
    try {
        const role = await fetchLatestRoleInfo()
        if (!role?.roleInfo?.abyssInfo?.bestTimeVo1) {
            ui.showErrorMessage("没有可上传的深渊数据")
            return
        }
        if (!role.roleInfo?.roleShow?.roleId) {
            ui.showErrorMessage("缺少 UID")
            return
        }

        const payload = await buildAbyssUploadPayload(role)
        if (!payload) {
            throw new Error("无法生成深渊上传数据")
        }
        const result = await submitAbyssUsageMutation({ input: payload }, { requestPolicy: "network-only" })
        if (!result) {
            throw new Error("上传结果为空")
        }
        ui.showSuccessMessage("深渊数据上传成功")
    } catch (error) {
        ui.showErrorMessage("深渊数据上传失败", error instanceof Error ? error.message : String(error))
    } finally {
        abyssUploading.value = false
    }
}

/**
 * 获取单项统计名称。
 * @param kind 统计类型。
 * @param id 项目 ID。
 * @returns 名称。
 */
function getSlotStatName(kind: SlotStatKind, id: number) {
    if (kind === "support") {
        return getCharName(id)
    }
    if (kind === "pet") {
        return getPetName(id)
    }
    return getWeaponName(id)
}

/**
 * 获取单项统计图标。
 * @param kind 统计类型。
 * @param id 项目 ID。
 * @returns 图标地址。
 */
function getSlotStatIcon(kind: SlotStatKind, id: number) {
    if (kind === "support") {
        return getCharIcon(id)
    }
    if (kind === "pet") {
        return getPetIcon(id)
    }
    return getWeaponIcon(id)
}

/**
 * 获取单项统计链接。
 * @param kind 统计类型。
 * @param id 项目 ID。
 * @returns 跳转链接。
 */
function getSlotStatLink(kind: SlotStatKind, id: number) {
    if (kind === "support") {
        return getCharLink(id)
    }
    if (kind === "pet") {
        return getPetLink(id)
    }
    return getWeaponLink(id)
}

function formatSharePercent(value: number, total: number) {
    if (!total) {
        return "0.0%"
    }
    return `${((value / total) * 100).toFixed(1)}%`
}

/**
 * 将阿拉伯数字等级转为罗马数字。
 * @param level 等级数值。
 * @returns 罗马数字文本。
 */
function formatRomanLevel(level: number) {
    const numerals: Array<[number, string]> = [
        [10, "X"],
        [9, "IX"],
        [5, "V"],
        [4, "IV"],
        [1, "I"],
    ]
    let remaining = level
    let result = ""
    for (const [value, numeral] of numerals) {
        while (remaining >= value) {
            result += numeral
            remaining -= value
        }
    }
    return result || "0"
}

/**
 * 根据分布类型和等级索引读取 tooltip 文本。
 * @param kind 分布类型。
 * @param sourceId 角色或武器 ID。
 * @param levelIndex 等级索引。
 * @returns tooltip 文本。
 */
function getDistributionTooltip(kind: SlotStatKind, sourceId: number, levelIndex: number) {
    if (kind === "support") {
        const char = charMap.get(sourceId)
        return char?.溯源?.[levelIndex - 1]
    }
    const weapon = weaponMap.get(sourceId)
    return weapon?.熔炼?.[levelIndex]
}

/**
 * 判断是否需要展示分布 tooltip。
 * @param kind 分布类型。
 * @param levelIndex 等级索引。
 * @returns 是否展示 tooltip。
 */
function shouldShowDistributionTooltip(kind: SlotStatKind, sourceId: number, levelIndex: number) {
    return getDistributionTooltip(kind, sourceId, levelIndex) !== undefined
}

/**
 * 格式化等级分布为徽章展示项。
 * @param items 分布数组。
 * @returns 徽章展示项列表。
 */
function formatLevelDistribution(items?: number[]) {
    const total = (items || []).reduce((sum, count) => sum + count, 0)
    if (!total) {
        return [] as DistributionItem[]
    }
    return (items || [])
        .map((count, level) => ({ level, count }))
        .filter(item => item.count > 0)
        .map(item => ({
            level: item.level,
            label: formatRomanLevel(item.level),
            percent: `${((item.count / total) * 100).toFixed(1)}%`,
        }))
}

/**
 * 格式化使用率。
 * @param used 上场人数。
 * @param owned 持有人数。
 * @returns 使用率文本。
 */
function formatUsageRate(used: number, owned: number) {
    if (!owned) {
        return "0.0%"
    }
    return `${((used / owned) * 100).toFixed(1)}%`
}

const lineupCharOptions = computed(() => {
    return roleRanks.value
        .slice()
        .sort((left, right) => (right.submissionCount || 0) - (left.submissionCount || 0))
        .map(item => ({
            charId: item.charId,
            name: getCharName(item.charId),
        }))
})

/**
 * 加载配队助手的阵容查询结果。
 * @param charId 角色 ID。
 */
async function loadAssistantLineups(charId: number | null) {
    const seasonId = seasonInfo.value?.seasonId
    if (!seasonId || !charId) {
        assistantLineupStats.value = []
        return
    }
    const result = await abyssUsageLineupStatsQuery(
        { seasonId, charId: charId || undefined, mainOnly: assistantMainOnly.value || undefined, limit: 6 },
        { requestPolicy: "network-only" }
    )
    assistantLineupStats.value = result ?? []
}

/**
 * 处理配队助手角色选择。
 * @param event 选择事件。
 */
async function handleAssistantCharChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value
    selectedAssistantCharId.value = value ? Number(value) : null
    await loadAssistantLineups(selectedAssistantCharId.value)
}

/**
 * 处理仅主控开关切换。
 * @param event 勾选事件。
 */
async function handleAssistantMainOnlyChange(event: Event) {
    assistantMainOnly.value = (event.target as HTMLInputElement).checked
    await loadAssistantLineups(selectedAssistantCharId.value)
}

function getLineupSlots(item: AbyssUsageLineupStat): LineupSlot[] {
    const slots: LineupSlot[] = []
    if (item.charId) {
        slots.push({
            kind: "char",
            id: item.charId,
            icon: getCharIcon(item.charId),
            link: getCharLink(item.charId),
            label: getCharName(item.charId),
        })
    }
    if (item.meleeId) {
        slots.push({
            kind: "weapon",
            id: item.meleeId,
            icon: getWeaponIcon(item.meleeId),
            link: getWeaponLink(item.meleeId),
            label: getWeaponName(item.meleeId),
        })
    }
    if (item.rangedId) {
        slots.push({
            kind: "weapon",
            id: item.rangedId,
            icon: getWeaponIcon(item.rangedId),
            link: getWeaponLink(item.rangedId),
            label: getWeaponName(item.rangedId),
        })
    }
    if (item.support1) {
        slots.push({
            kind: "char",
            id: item.support1,
            icon: getCharIcon(item.support1),
            link: getCharLink(item.support1),
            label: getCharName(item.support1),
        })
    }
    if (item.supportWeapon1) {
        slots.push({
            kind: "weapon",
            id: item.supportWeapon1,
            icon: getWeaponIcon(item.supportWeapon1),
            link: getWeaponLink(item.supportWeapon1),
            label: getWeaponName(item.supportWeapon1),
        })
    }
    if (item.support2) {
        slots.push({
            kind: "char",
            id: item.support2,
            icon: getCharIcon(item.support2),
            link: getCharLink(item.support2),
            label: getCharName(item.support2),
        })
    }
    if (item.supportWeapon2) {
        slots.push({
            kind: "weapon",
            id: item.supportWeapon2,
            icon: getWeaponIcon(item.supportWeapon2),
            link: getWeaponLink(item.supportWeapon2),
            label: getWeaponName(item.supportWeapon2),
        })
    }
    if (item.petId) {
        slots.push({
            kind: "pet",
            id: item.petId,
            icon: getPetIcon(item.petId),
            link: getPetLink(item.petId),
            label: getPetName(item.petId),
        })
    }
    return slots
}

async function loadStats() {
    loading.value = true
    try {
        const currentSeason = getCurrentAbyssSeason()
        seasonInfo.value = currentSeason
        const seasonId = currentSeason?.seasonId
        const baseRes = await abyssUsageBaseQuery({ seasonId }, { requestPolicy: "network-only" })
        roleStats.value = baseRes?.abyssUsageRoleStats ?? []
        weaponStats.value = baseRes?.abyssUsageWeaponStats ?? []
        lineupStats.value = baseRes?.abyssUsageLineupStats ?? []
        slotStats.value = baseRes?.abyssUsageSlotStats ?? null
        roleRanks.value = baseRes?.abyssUsageRoleRank ?? []
        weaponRanks.value = baseRes?.abyssUsageWeaponRank ?? []
        assistantLineupStats.value = []
    } catch (error) {
        ui.showErrorMessage("加载深渊统计失败", error instanceof Error ? error.message : String(error))
    } finally {
        loading.value = false
    }
}

onMounted(async () => {
    try {
        await loadStats()
    } catch (error) {
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
})
</script>

<template>
    <ScrollArea class="h-full">
        <div class="mx-auto max-w-7xl p-4 space-y-4">
            <div class="rounded-2xl bg-base-100 shadow-md">
                <div class="p-5 md:p-6 space-y-4">
                    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div class="space-y-2">
                            <div class="flex flex-wrap items-center gap-2 text-sm opacity-70">
                                <RouterLink :to="seasonDungeonLink" class="link link-hover">
                                    {{ seasonVersionText }}
                                </RouterLink>
                                <RouterLink :to="seasonCharLink" class="inline-flex items-center gap-2 link link-hover">
                                    <img v-if="seasonRoleIcon" :src="seasonRoleIcon" :alt="seasonRoleName" class="size-5 rounded-full" />
                                    <span>{{ seasonRoleName }}</span>
                                </RouterLink>
                                <span>{{ seasonRangeText }}</span>
                            </div>
                            <div class="space-y-1">
                                <h1 class="text-3xl font-black tracking-tight">沉浸式戏剧</h1>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 self-start md:self-auto">
                            <button class="btn btn-sm btn-primary" :disabled="abyssUploading" @click="uploadAbyssUsage">
                                <span v-if="abyssUploading" class="loading loading-spinner loading-xs"></span>
                                <Icon v-else icon="ri:upload-2-line" />
                                上传
                            </button>
                            <button class="btn btn-ghost btn-sm" :disabled="loading" @click="loadStats">
                                <Icon icon="ri:refresh-line" class="size-4" />
                                <span>刷新</span>
                            </button>
                        </div>
                    </div>

                    <div v-if="loading" class="mt-4">
                        <span class="loading loading-spinner loading-sm"></span>
                    </div>
                </div>
            </div>

            <div class="rounded-2xl bg-base-100 shadow-md">
                <div class="p-5">
                    <div class="mb-4 flex items-end justify-between gap-3">
                        <div>
                            <h2 class="text-2xl font-bold">角色使用率</h2>
                            <p class="text-sm opacity-70">
                                本页面全部数据分析自 {{ lineupTotal }} 名玩家。使用率=上场该角色玩家数÷持有该角色玩家数
                            </p>
                        </div>
                    </div>
                    <div class="space-y-3">
                        <div v-for="group in groupedRoleRanks" :key="group.label" class="space-y-2">
                            <div class="text-xs font-medium opacity-60">{{ group.label }}</div>
                            <div class="flex flex-wrap justify-center gap-2">
                                <div
                                    v-for="item in group.items"
                                    :key="item.charId"
                                    class="group card w-16 shrink-0 transition-all duration-300"
                                >
                                    <RouterLink
                                        :to="getCharLink(item.charId)"
                                        class="card-body bg-linear-30 from-indigo-300/50 to-indigo-600/50 rounded-2xl relative p-2 overflow-hidden"
                                    >
                                        <img
                                            class="absolute inset-0 h-full object-cover pointer-events-none mask-b-from-60%"
                                            :src="getCharIcon(item.charId)"
                                            :alt="getCharName(item.charId)"
                                        />
                                        <div class="flex flex-col items-center z-1 text-white text-shadow-md text-shadow-black/30">
                                            <div class="avatar mb-2">
                                                <div class="h-16 rounded-full"></div>
                                            </div>
                                            <div class="font-medium text-center text-sm leading-tight">
                                                {{ formatUsageRate(item.submissionCount || 0, item.ownedCount || 0) }}
                                            </div>
                                        </div>
                                    </RouterLink>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
                <div class="rounded-2xl bg-base-100 shadow-md">
                    <div class="p-5">
                        <div class="mb-4">
                            <h2 class="text-2xl font-bold text-center">最常用阵容</h2>
                            <p class="mt-2 text-center text-sm opacity-60">出战数最高的阵容</p>
                        </div>
                        <div class="space-y-3">
                            <div
                                v-for="item in lineupStats.slice(0, 6)"
                                :key="`${item.charId}-${item.meleeId}-${item.rangedId}-${item.support1}-${item.support2}-${item.supportWeapon1}-${item.supportWeapon2}-${item.petId ?? 0}`"
                                class="rounded-2xl bg-base-200 p-3"
                            >
                                <div class="flex items-center justify-between gap-3">
                                    <div class="flex items-center gap-2 overflow-hidden">
                                        <div class="flex flex-wrap gap-1 shrink-0">
                                            <RouterLink
                                                v-for="slot in getLineupSlots(item)"
                                                :key="`${item.charId}-${slot.kind}-${slot.id}`"
                                                :to="slot.link"
                                                class="group"
                                                :title="slot.label"
                                            >
                                                <img
                                                    :src="slot.icon"
                                                    class="size-9 rounded-full ring-2 ring-base-200 object-cover transition-transform duration-200 group-hover:scale-105"
                                                />
                                            </RouterLink>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="truncate text-sm font-medium">{{ getCharName(item.charId) }}</div>
                                            <div class="truncate text-xs opacity-60">
                                                {{ getWeaponName(item.meleeId) }} / {{ getWeaponName(item.rangedId) }} /
                                                {{ getPetName(item.petId) }}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-lg font-bold">
                                            {{ formatSharePercent(item.submissionCount || 0, lineupTotal) }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="rounded-2xl bg-base-100 shadow-md">
                    <div class="p-5">
                        <div class="mb-4">
                            <h2 class="text-2xl font-bold text-center">配队助手</h2>
                            <p class="mt-2 text-center text-sm opacity-60">查询角色常用阵容</p>
                        </div>
                        <div class="mb-3">
                            <div class="flex items-center gap-2">
                                <select
                                    class="select select-bordered flex-1"
                                    :value="selectedAssistantCharId ?? ''"
                                    @change="handleAssistantCharChange"
                                >
                                    <option disabled value="">请选择角色</option>
                                    <option v-for="item in lineupCharOptions" :key="item.charId" :value="item.charId">
                                        {{ item.name }}
                                    </option>
                                </select>
                                <label class="label cursor-pointer gap-2 px-3 py-2">
                                    <span class="label-text whitespace-nowrap text-sm">仅主控</span>
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-primary toggle-sm"
                                        :checked="assistantMainOnly"
                                        @change="handleAssistantMainOnlyChange"
                                    />
                                </label>
                            </div>
                        </div>
                        <div v-if="assistantLineupStats.length" class="space-y-3">
                            <div
                                v-for="item in assistantLineupStats"
                                :key="`${item.charId}-${item.meleeId}-${item.rangedId}-${item.support1}-${item.support2}-${item.supportWeapon1}-${item.supportWeapon2}-${item.petId ?? 0}`"
                                class="rounded-2xl bg-base-200 p-3"
                            >
                                <div class="flex items-center justify-between gap-3">
                                    <div class="flex items-center gap-2 overflow-hidden">
                                        <div class="flex flex-wrap gap-1 shrink-0">
                                            <RouterLink
                                                v-for="slot in getLineupSlots(item)"
                                                :key="`${item.charId}-${slot.kind}-${slot.id}`"
                                                :to="slot.link"
                                                class="group"
                                                :title="slot.label"
                                            >
                                                <img
                                                    :src="slot.icon"
                                                    class="size-9 rounded-full ring-2 ring-base-200 object-cover transition-transform duration-200 group-hover:scale-105"
                                                />
                                            </RouterLink>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="truncate text-sm font-medium">{{ getCharName(item.charId) }}</div>
                                            <div class="truncate text-xs opacity-60">
                                                {{ getWeaponName(item.meleeId) }} / {{ getWeaponName(item.rangedId) }} /
                                                {{ getPetName(item.petId) }}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-lg font-bold">
                                            {{ formatSharePercent(item.submissionCount || 0, lineupTotal) }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-else class="py-6 text-center text-sm opacity-60">暂无结果</div>
                    </div>
                </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <div v-for="section in slotStatSections" :key="section.key" class="rounded-2xl bg-base-100 shadow-md">
                    <div class="p-5">
                        <h2 class="mb-4 text-xl font-bold">{{ section.label }}</h2>
                        <div class="space-y-2">
                            <div
                                v-for="item in section.items.slice(0, 6)"
                                :key="`${section.key}-${item.id}`"
                                class="rounded-xl bg-base-200 p-3"
                            >
                                <div class="flex items-center gap-2">
                                    <RouterLink :to="getSlotStatLink(section.key, item.id)">
                                        <img :src="getSlotStatIcon(section.key, item.id)" class="size-9 rounded-full object-cover" />
                                    </RouterLink>
                                    <div class="min-w-0 flex-1">
                                        <RouterLink
                                            :to="getSlotStatLink(section.key, item.id)"
                                            class="truncate text-sm font-medium link link-hover"
                                        >
                                            {{ getSlotStatName(section.key, item.id) }}
                                        </RouterLink>
                                        <div class="text-xs opacity-60">{{ item.submissionCount }} 次</div>
                                    </div>
                                    <div class="text-sm font-medium opacity-70">
                                        {{ formatSharePercent(item.submissionCount, section.total) }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
                <div class="rounded-2xl bg-base-100 shadow-md">
                    <div class="p-5">
                        <h2 class="mb-4 text-xl font-bold">角色溯源分布</h2>
                        <div class="space-y-2">
                            <div v-for="item in roleStats" :key="item.charId" class="rounded-xl bg-base-200 p-3">
                                <div class="flex items-center gap-2">
                                    <RouterLink :to="getCharLink(item.charId)">
                                        <img :src="getCharIcon(item.charId)" class="size-9 rounded-full object-cover" />
                                    </RouterLink>
                                    <div class="min-w-0 flex-1">
                                        <RouterLink :to="getCharLink(item.charId)" class="truncate text-sm font-medium link link-hover">{{
                                            getCharName(item.charId)
                                        }}</RouterLink>
                                        <div class="text-xs opacity-60">{{ item.submissionCount }} 次</div>
                                    </div>
                                </div>
                                <div class="mt-2 flex flex-wrap gap-1">
                                    <template
                                        v-for="distribution in formatLevelDistribution(item.gradeLevelDistribution)"
                                        :key="`${item.charId}-${distribution.label}`"
                                    >
                                        <span
                                            v-if="!shouldShowDistributionTooltip('support', item.charId, distribution.level)"
                                            class="badge badge-primary badge-sm transition-colors duration-200 hover:badge-secondary"
                                        >
                                            {{ distribution.label }} {{ distribution.percent }}
                                        </span>
                                        <FullTooltip v-else side="top">
                                            <template #tooltip>
                                                <div class="max-w-72 whitespace-normal break-words leading-snug">
                                                    {{ getDistributionTooltip("support", item.charId, distribution.level) }}
                                                </div>
                                            </template>
                                            <span class="badge badge-primary badge-sm transition-colors duration-200 hover:badge-secondary">
                                                {{ distribution.label }} {{ distribution.percent }}
                                            </span>
                                        </FullTooltip>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="rounded-2xl bg-base-100 shadow-md">
                    <div class="p-5">
                        <h2 class="mb-4 text-xl font-bold">武器熔铸分布</h2>
                        <div class="space-y-2">
                            <div v-for="item in weaponStats" :key="item.weaponId" class="rounded-xl bg-base-200 p-3">
                                <div class="flex items-center gap-2">
                                    <RouterLink :to="getWeaponLink(item.weaponId)">
                                        <img :src="getWeaponIcon(item.weaponId)" class="size-9 rounded object-cover" />
                                    </RouterLink>
                                    <div class="min-w-0 flex-1">
                                        <RouterLink
                                            :to="getWeaponLink(item.weaponId)"
                                            class="truncate text-sm font-medium link link-hover"
                                            >{{ getWeaponName(item.weaponId) }}</RouterLink
                                        >
                                        <div class="text-xs opacity-60">{{ item.submissionCount }} 次</div>
                                    </div>
                                </div>
                                <div class="mt-2 flex flex-wrap gap-1">
                                    <template
                                        v-for="distribution in formatLevelDistribution(item.skillLevelDistribution)"
                                        :key="`${item.weaponId}-${distribution.label}`"
                                    >
                                        <span
                                            v-if="!shouldShowDistributionTooltip('meleeWeapon', item.weaponId, distribution.level)"
                                            class="badge badge-primary badge-sm transition-colors duration-200 hover:badge-secondary"
                                        >
                                            {{ distribution.label }} {{ distribution.percent }}
                                        </span>
                                        <FullTooltip v-else side="top">
                                            <template #tooltip>
                                                <div class="max-w-72 whitespace-normal break-words leading-snug">
                                                    {{ getDistributionTooltip("meleeWeapon", item.weaponId, distribution.level) }}
                                                </div>
                                            </template>
                                            <span class="badge badge-primary badge-sm transition-colors duration-200 hover:badge-secondary">
                                                {{ distribution.label }} {{ distribution.percent }}
                                            </span>
                                        </FullTooltip>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
