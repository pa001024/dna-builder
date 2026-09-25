<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { formatModName, LeveledMod, LeveledWeaponHelper, modDraftMap, modMap, resourceMap, weaponDraftMap, weaponMap } from "@/data"
import { Walnut } from "@/data/d/walnut.data"
import { WalnutSequenceSimulator } from "@/utils/walnut-utils"

const props = defineProps<{
    walnut: Walnut
}>()

const { t: $t } = useTranslation()

/**
 * 把密函类型（1=角色 2=武器 3=魔之楔）转成展示名。
 *
 * 返回值是**游戏原文**，交给模板里的 `$t` 取译文——`角色` / `武器` / `魔之楔`
 * 三个词已在数据包对照表里，不要另造界面键。
 * @param type 密函类型
 * @returns 展示名原文
 */
function getWalnutTypeName(type: number): string {
    return type === 1 ? "角色" : type === 2 ? "武器" : "魔之楔"
}

interface RewardLinkInfo {
    icon: string
    text: string
    to: string
}

/**
 * 根据奖励项反查对应设计稿。
 * @param reward 奖励项
 * @returns 设计稿数据或 null
 */
function getDraftByReward(reward: Walnut["奖励"][number]) {
    if (!reward.d) {
        return null
    }

    if (reward.type === "Mod") {
        return modDraftMap.get(reward.id) ?? null
    }

    if (reward.type === "Weapon") {
        return weaponDraftMap.get(reward.id) ?? null
    }

    return null
}

// 草稿数据，用于 DBDraftDetailItem 组件
const draft = computed(() => {
    return getDraftByReward(props.walnut.奖励[0]) ?? null
})

// 模拟开函相关状态
const simulator = new WalnutSequenceSimulator()
const openResults = ref<number[][]>([])
const isAutoOpening = ref(false)
const autoOpenTimer = ref<number | null>(null)
const totalOpens = ref(0)
const goldCount = ref(0)

// 奖励数量统计
const rewardCounts = ref<Record<string, number>>({})

// 武器部件数量统计
const weaponPartCounts = ref<Record<string, number>>({})

// 按稀有度排序的奖励统计
const sortedRewardCounts = computed(() => {
    // 直接使用索引访问奖励，索引越小，稀有度越高
    return Object.entries(rewardCounts.value)
        .map(([name, count]) => {
            // 查找奖励在数组中的索引，索引越小稀有度越高
            const index = props.walnut.奖励.findIndex(r => r.name === name)
            return {
                d: props.walnut.奖励[index]?.d || 0,
                name: props.walnut.奖励[index]?.name || name,
                count,
                rarity: index + 1, // 索引+1作为稀有度，1最高
            }
        })
        .sort((a, b) => a.rarity - b.rarity) // 稀有度值越小越稀有，排在前面
})

/**
 * 预计算每个奖励对应的跳转信息，避免模板重复查表。
 */
const rewardLinkItems = computed(() =>
    props.walnut.奖励.map(reward => ({
        reward,
        links: getRewardLinks(reward),
        icon: getRewardIcon(reward),
    }))
)

/**
 * 获取奖励对应的图标地址。
 * @param reward 奖励项
 * @returns 图标地址
 */
function getRewardIcon(reward: Walnut["奖励"][number]): string {
    if (reward.d) {
        const draft = getDraftByReward(reward)
        if (!draft) {
            return "/imgs/webp/T_Head_Empty.webp"
        }

        if (draft.t === "Mod") {
            return LeveledMod.url(modMap.get(draft.p)?.icon)
        }

        if (draft.t === "Weapon") {
            return LeveledWeaponHelper.idToUrl(draft.p)
        }

        return "/imgs/webp/T_Head_Empty.webp"
    }

    if (reward.type === "Mod") {
        return LeveledMod.url(modMap.get(reward.id)?.icon)
    }

    if (reward.type === "Weapon") {
        return LeveledWeaponHelper.idToUrl(reward.id)
    }

    if (reward.type === "Resource") {
        const resource = resourceMap.get(reward.id)
        return resource?.icon ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }

    return "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 获取奖励对应的跳转链接。
 *
 * 链接文案在这里就翻译好，因为模板里只渲染 `link.text`。
 * 用 `$t`（来自 `useTranslation`）而不是模块级 `t`：游戏原文里含 `.` / `:` 时
 * 会被 i18next 当键路径切分，而 `useTranslation` 的 `t` 已经按项目的取词口径配置过。
 * @param reward 奖励项
 * @returns 跳转链接列表
 */
function getRewardLinks(reward: Walnut["奖励"][number]): RewardLinkInfo[] {
    const links: RewardLinkInfo[] = []

    if (reward.d) {
        const draft = getDraftByReward(reward)
        if (draft) {
            links.push({
                icon: "/imgs/webp/T_Head_Empty.webp",
                text: `${$t("UI_FORGING_BLUEPRINT")}${$t(draft.n)}`,
                to: `/db/draft/${draft.id}`,
            })
            return links
        }
    }

    if (reward.type === "Mod") {
        const mod = modMap.get(reward.id)
        if (mod) {
            links.push({
                icon: LeveledMod.url(mod.icon),
                text: formatModName(mod.系列, mod.名称, $t),
                to: `/db/mod/${mod.id}`,
            })
        }
    } else if (reward.type === "Weapon") {
        const weapon = weaponMap.get(reward.id)
        if (weapon) {
            links.push({
                icon: LeveledWeaponHelper.idToUrl(weapon.id),
                text: $t(weapon.名称),
                to: `/db/weapon/${weapon.id}`,
            })
        }
    } else if (reward.type === "Resource") {
        const resource = resourceMap.get(reward.id)
        if (resource) {
            links.push({
                icon: resource.icon ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp",
                text: $t(resource.name),
                to: `/db/resource/${resource.id}`,
            })
        }
    }

    return links
}

// 获取奖励的颜色类名
function getRewardColor(rarity: number): string {
    switch (rarity) {
        case 1: // 金，稀有度最高
            return "text-yellow-500 font-bold"
        case 2: // 大银
            return "text-blue-400 font-semibold"
        case 3: // 小银
            return "text-cyan-400"
        default: // 铜
            return "text-gray-500"
    }
}

// 概率数据
const probabilityData = computed(() => {
    const data = []
    for (let n = 1; n <= 19; n++) {
        const prob = WalnutSequenceSimulator.calculateGoldProbability(n)
        data.push({
            n,
            probability: parseFloat(prob.toFixed(6)),
        })
    }
    return data
})

/**
 * 判断是否为武器部件奖励
 */
function isWeaponPart(name: string): boolean {
    // 根据实际脚本提取的部件后缀，匹配固定的部件后缀
    const weaponPartSuffixes = [
        "的上弓臂",
        "的下弓臂",
        "的刀刃",
        "的右刀刃",
        "的左刀刃",
        "的弓弦",
        "的握柄",
        "的枪机",
        "的枪管",
        "的枪身",
        "的饰物",
    ]

    return weaponPartSuffixes.some(suffix => name.endsWith(suffix))
}

/**
 * 对奖励索引进行排序
 */
function sortRewards(rewards: number[]): number[] {
    // 映射奖励索引到实际奖励对象
    const rewardObjects = rewards.map(index => {
        const reward = props.walnut.奖励[index]
        return {
            index,
            name: reward?.name || $t("db-walnut-detail.unknown"),
            isGold: index === 0, // 索引0为金奖
            rarity: index + 1, // 索引+1作为稀有度，1最高
            count: reward?.count || 1,
        }
    })

    // 排序逻辑
    return rewardObjects
        .sort((a, b) => {
            // 规则1: 金奖必须排第一
            if (a.isGold && !b.isGold) {
                return -1
            }
            if (!a.isGold && b.isGold) {
                return 1
            }

            // 规则2: 根据密函类型应用不同的排序规则
            if (props.walnut.类型 === 2) {
                // 武器类型：应用部件排序规则
                // 检查是否为武器部件
                const aIsPart = isWeaponPart(a.name)
                const bIsPart = isWeaponPart(b.name)

                if (aIsPart && bIsPart) {
                    // 都是部件，选择当前获取最少的
                    const aCount = weaponPartCounts.value[a.name] || 0
                    const bCount = weaponPartCounts.value[b.name] || 0
                    return aCount - bCount
                } else if (aIsPart) {
                    // a是部件，b不是，部件优先
                    return -1
                } else if (bIsPart) {
                    // b是部件，a不是，部件优先
                    return 1
                }
                // 如果都不是部件，按照稀有度排序
                return a.rarity - b.rarity
            } else {
                // 非武器类型：按照稀有度排序
                return a.rarity - b.rarity
            }
        })
        .map(reward => reward.index)
}

/**
 * 手动开一次密函
 */
function openOnce() {
    let result = simulator.open()

    // 对奖励进行排序
    result = sortRewards(result)

    // 只统计第一个奖励
    const index = result[0]
    const reward = props.walnut.奖励[index]
    if (!reward) return

    // 更新奖励统计，乘以奖励数量
    rewardCounts.value[reward.name] = (rewardCounts.value[reward.name] || 0) + reward.count

    // 如果是武器部件，单独统计，乘以奖励数量
    if (isWeaponPart(reward.name)) {
        weaponPartCounts.value[reward.name] = (weaponPartCounts.value[reward.name] || 0) + reward.count
    }

    openResults.value.unshift(result)
    totalOpens.value++

    // 检查是否出金（索引为0的奖励为金）
    if (index === 0) {
        goldCount.value++
    }

    // 最多保留50条记录
    if (openResults.value.length > 200) {
        openResults.value.pop()
    }
}

function openWalnut(n: number) {
    for (let i = 0; i < n; i++) {
        openOnce()
    }
}

/**
 * 开始自动开密函
 */
function startAutoOpen() {
    if (isAutoOpening.value) return

    isAutoOpening.value = true
    autoOpenTimer.value = setInterval(() => {
        openOnce()
    }, 100) as unknown as number
}

/**
 * 停止自动开密函
 */
function stopAutoOpen() {
    if (!isAutoOpening.value) return

    isAutoOpening.value = false
    if (autoOpenTimer.value) {
        clearInterval(autoOpenTimer.value)
        autoOpenTimer.value = null
    }
}

/**
 * 重置模拟数据
 */
function resetSimulation() {
    stopAutoOpen()
    openResults.value = []
    totalOpens.value = 0
    goldCount.value = 0
    // 重置奖励统计
    rewardCounts.value = {}
    weaponPartCounts.value = {}
}
watch(() => props.walnut.奖励, resetSimulation)

/**
 * 获取奖励索引对应的信息
 */
function getRewardInfo(index: number) {
    const reward = props.walnut.奖励[index]
    return {
        index,
        name: reward?.name || $t("db-walnut-detail.unknown"),
        count: reward?.count || 1,
        d: reward?.d || 0,
        links: reward ? getRewardLinks(reward) : [],
    }
}

/**
 * 获取奖励索引对应的颜色类名
 */
function getRewardTypeColor(index: number): string {
    switch (index) {
        case 0: // 金
            return "text-yellow-500 font-bold"
        case 1: // 大银
            return "text-blue-400"
        case 2: // 小银
            return "text-cyan-400"
        default: // 铜
            return "text-gray-300"
    }
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 密函档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Walnut File
            </p>
            <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content sm:text-2xl">{{ $t(walnut.名称) }}</span>
                <CopyID :id="walnut.id" />
            </div>
            <!-- 元信息行：稀有度 / 类型 / 模式 -->
            <div class="relative mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                <span class="font-orbitron text-[13px] font-semibold text-primary">{{
                    $t("db-walnut-detail.rarity_stars", { count: walnut.稀有度 })
                }}</span>
                <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                <span>{{ $t(getWalnutTypeName(walnut.类型)) }}</span>
                <template v-if="walnut.模式">
                    <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                    <span>{{ $t(walnut.模式) }}</span>
                </template>
            </div>
        </header>

        <!-- 获取途径 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('db-walnut-detail.source_section')" />
            <div class="flex flex-wrap gap-1.5">
                <span
                    v-for="way in walnut.获取途径"
                    :key="way"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-0.5 text-xs text-base-content/75"
                >
                    {{ $t(way) }}
                </span>
            </div>
        </section>

        <!-- 奖励列表 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="REWARDS" :title="$t('db-walnut-detail.reward_list')" />
            <div class="overflow-x-auto">
                <table class="w-full min-w-100">
                    <thead>
                        <tr class="border-b border-base-content/20">
                            <th class="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">ID</th>
                            <th class="px-3 py-2 text-left text-[10px] text-base-content/40">{{ $t("db-walnut-detail.col_name") }}</th>
                            <th class="px-3 py-2 text-left text-[10px] text-base-content/40">{{ $t("db-walnut-detail.col_count") }}</th>
                            <th class="px-3 py-2 text-left text-[10px] text-base-content/40">
                                {{ $t("db-walnut-detail.col_pool_range") }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(item, index) in rewardLinkItems"
                            :key="index"
                            class="border-b border-base-content/10 transition-colors duration-200 hover:bg-base-content/4"
                        >
                            <td class="px-3 py-2 font-mono text-xs tabular-nums text-base-content/45">{{ item.reward.id }}</td>
                            <td class="px-3 py-2 text-sm">
                                <div class="flex items-center gap-2">
                                    <img :src="item.icon" :alt="item.reward.name" class="size-6 shrink-0 rounded-xs object-cover" />
                                    <template v-if="item.links.length > 0">
                                        <span v-for="(link, linkIndex) in item.links" :key="link.to" class="inline-flex items-center gap-1">
                                            <SRouterLink
                                                :to="link.to"
                                                class="text-primary underline-offset-2 transition-colors duration-150 hover:underline"
                                            >
                                                {{ link.text }}
                                            </SRouterLink>
                                            <span v-if="linkIndex < item.links.length - 1" class="mx-1 text-base-content/50">/</span>
                                        </span>
                                    </template>
                                    <span v-else>{{ item.reward.d ? `${$t("UI_FORGING_BLUEPRINT")}${$t(item.reward.name)}` : $t(item.reward.name) }}</span>
                                </div>
                            </td>
                            <td class="px-3 py-2">
                                <span class="font-orbitron text-[13px] font-semibold text-primary">{{
                                    item.reward.count
                                }}</span>
                            </td>
                            <td class="px-3 py-2 font-mono text-xs tabular-nums text-base-content/55">
                                {{ index > 0 ? `0~${props.walnut.参数[index]}` : 1 }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="mt-4 text-xs leading-relaxed text-base-content/55">
                {{ $t("db-walnut-detail.mechanism_note") }}
            </p>
        </section>

        <!-- 设计稿 -->
        <div v-if="draft" class="overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm">
            <DBDraftDetailItem :draft="draft" />
        </div>

        <!-- 模拟开函 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SIMULATOR" :title="$t('db-walnut-detail.simulator')" />

            <!-- 统计信息 -->
            <div class="mb-3 grid grid-cols-3 gap-1.5">
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <div class="mb-0.5 text-[11px] text-base-content/55">{{ $t("db-walnut-detail.total_opens") }}</div>
                    <div class="font-orbitron text-lg font-semibold text-primary">{{ totalOpens }}</div>
                </div>
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <div class="mb-0.5 text-[11px] text-base-content/55">{{ $t("db-walnut-detail.gold_count") }}</div>
                    <div class="font-orbitron text-lg font-semibold text-yellow-500">{{ goldCount }}</div>
                </div>
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <div class="mb-0.5 text-[11px] text-base-content/55">{{ $t("db-walnut-detail.gold_rate") }}</div>
                    <div class="font-orbitron text-lg font-semibold text-primary">
                        {{ totalOpens > 0 ? ((goldCount / totalOpens) * 100).toFixed(2) : 0 }}%
                    </div>
                </div>
            </div>

            <!-- 操作按钮 -->
            <div class="mb-3 flex flex-wrap justify-center gap-2">
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                        isAutoOpening
                            ? 'border-base-content/20 text-base-content/40'
                            : 'border-primary bg-primary font-semibold text-primary-content'
                    "
                    :disabled="isAutoOpening"
                    @click="openOnce"
                >
                    {{ $t("db-walnut-detail.open_once") }}
                </button>
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                        isAutoOpening
                            ? 'border-base-content/20 text-base-content/40'
                            : 'border-primary bg-primary font-semibold text-primary-content'
                    "
                    :disabled="isAutoOpening"
                    @click="openWalnut(65)"
                >
                    {{ $t("db-walnut-detail.open_65") }}
                </button>
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        isAutoOpening
                            ? 'border-error bg-error/10 font-semibold text-error'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="isAutoOpening ? stopAutoOpen() : startAutoOpen()"
                >
                    {{ isAutoOpening ? $t("db-walnut-detail.stop_auto") : $t("db-walnut-detail.start_auto") }}
                </button>
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border border-error/40 px-2 text-[11px] text-error/80 transition-colors duration-150 hover:border-error hover:bg-error/10 hover:text-error"
                    @click="resetSimulation"
                >
                    {{ $t("db-walnut-detail.reset_data") }}
                </button>
            </div>

            <!-- 开函结果 -->
            <div class="mb-3">
                <div class="mb-2 text-[11px] tracking-wide text-base-content/55">{{ $t("db-walnut-detail.open_results") }}</div>
                <div class="max-h-48 overflow-y-auto rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div v-if="openResults.length === 0" class="py-4 text-center text-base-content/55">
                        {{ $t("db-walnut-detail.no_open_records") }}
                    </div>
                    <div v-else class="grid grid-cols-1 gap-1">
                        <div
                            v-for="(result, index) in openResults"
                            :key="index"
                            class="flex items-center gap-2 rounded-xs p-1 text-xs transition-colors duration-150 hover:bg-base-content/4"
                        >
                            <span class="w-8 shrink-0 font-mono tabular-nums text-base-content/40">{{ totalOpens - index }}</span>
                            <div class="flex flex-1 gap-0.5">
                                <span
                                    v-for="(reward, rIndex) in result.map(v => getRewardInfo(v))"
                                    :key="rIndex"
                                    class="rounded-xs px-1.5 py-0.5 text-xs font-medium"
                                    :class="[getRewardTypeColor(reward.index), rIndex === 0 ? 'underline' : '']"
                                >
                                    <template v-if="reward.links.length > 0">
                                        <span v-for="(link, linkIndex) in reward.links" :key="link.to" class="inline-flex items-center">
                                            <SRouterLink
                                                :to="link.to"
                                                class="transition-colors duration-150 hover:text-primary hover:underline"
                                            >
                                                {{ link.text }}
                                            </SRouterLink>
                                            <span v-if="linkIndex < reward.links.length - 1" class="mx-1 text-base-content/50">/</span>
                                        </span>
                                    </template>
                                    <span v-else>{{ $t(reward.name) }}</span>
                                    {{ reward.count > 1 ? `*${reward.count}` : "" }}
                                </span>
                            </div>
                            <span v-if="result.includes(0)" class="text-xs font-bold text-yellow-500"> ✨ </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 奖励数量统计 -->
            <div class="mb-3">
                <div class="mb-2 text-[11px] tracking-wide text-base-content/55">{{ $t("db-walnut-detail.reward_stats") }}</div>
                <div class="max-h-40 overflow-y-auto rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div v-if="Object.keys(rewardCounts).length === 0" class="py-4 text-center text-base-content/55">
                        {{ $t("db-walnut-detail.no_stats") }}
                    </div>
                    <div v-else class="grid grid-cols-2 gap-2">
                        <div
                            v-for="reward in sortedRewardCounts"
                            :key="reward.name"
                            class="flex items-center justify-between rounded-xs p-2 text-xs transition-colors duration-150 hover:bg-base-content/4"
                        >
                            <div>
                                <span :class="getRewardColor(reward.rarity)">
                                    <span>{{ $t(reward.name) }}</span></span
                                >
                            </div>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary"
                                >*{{ reward.count }}</span
                            >
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div class="mb-2 text-[11px] tracking-wide text-base-content/55">{{ $t("db-walnut-detail.gold_probability") }}</div>
                <div class="overflow-x-auto rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <table class="w-full min-w-100">
                        <thead>
                            <tr class="border-b border-base-content/20">
                                <th class="px-3 py-2 text-left text-[10px] text-base-content/40">
                                    {{ $t("db-walnut-detail.col_opens_n") }}
                                </th>
                                <th class="px-3 py-2 text-left text-[10px] text-base-content/40">
                                    {{ $t("db-walnut-detail.col_at_least_once") }}
                                </th>
                                <th class="px-3 py-2 text-left text-[10px] text-base-content/40">
                                    {{ $t("db-walnut-detail.col_exact_this_time") }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="(item, index) in probabilityData"
                                :key="item.n"
                                class="border-b border-base-content/10 transition-colors duration-200 hover:bg-base-content/4"
                            >
                                <td class="px-3 py-1.5 font-mono text-xs tabular-nums text-base-content/45">{{ item.n }}</td>
                                <td class="px-3 py-1.5 font-mono text-xs tabular-nums text-base-content/70">
                                    {{ (item.probability * 100).toFixed(2) }}%
                                </td>
                                <td class="px-3 py-1.5 font-mono text-xs tabular-nums text-base-content/70">
                                    {{
                                        +(
                                            (index === 0 ? item.probability : item.probability - probabilityData[index - 1].probability) *
                                            100
                                        ).toFixed(2)
                                    }}%
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    </div>
</template>
