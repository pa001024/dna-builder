<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { computed, ref } from "vue"
import { charAccessoryData, skinData, weaponSkinData } from "@/data/d/accessory.data"
import { resourceData } from "@/data/d/resource.data"
import rewardData from "@/data/d/reward.data"
import { type ShopItem, type ShopMainTab, shopData } from "@/data/d/shop.data"
import {
    gachaProbabilities,
    type SkinGacha,
    type SkinGachaReward,
    type SkinGachaTab,
    skinGachaCumulative,
    skinGachaData,
    skinGachaItems,
    skinGachaTabs,
} from "@/data/d/skingacha.data"
import { useUIStore } from "@/store/ui"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments, type StoryTextSegment } from "@/utils/story-text"

/** 紫色品质保底次数（固定 10 抽必出紫） */
const PURPLE_PITY = 10
/** 默认金色品质保底次数 */
const DEFAULT_GOLD_PITY = 90
/** 月石晶胚资源 id（充值货币，可 1:1 兑换月石） */
const RES_MOON_STONE = 99
/** 月石资源 id（通货，部分物资类项目的计价货币） */
const RES_MOON = 100
/** 限时抽卡资源 id（与普通抽卡资源分开显示） */
const RES_LIMITED_TICKET = 1004

/** 解析后的道具信息 */
type ResolvedItem = {
    id: number
    name: string
    icon: string
    rarity: number
    kind: "Resource" | "Skin" | "WeaponSkin" | "CharAccessory" | "Unknown"
}

/** 抽卡结果条目 */
type DrawResult = {
    star: 3 | 4 | 5
    count: number
    item: ResolvedItem
}

/** 保底计数状态 */
type PityState = {
    gold: number
    purple: number
}

/** 抽卡记录条目 */
type HistoryEntry = {
    /** 抽卡时间戳（毫秒） */
    time: number
    /** 卡池 id */
    gachaId: number
    /** 卡池名称 */
    gachaName: string
    /** 星级 */
    star: 3 | 4 | 5
    /** 道具名称 */
    itemName: string
    /** 道具图标 URL */
    icon: string
    /** 数量 */
    count: number
}

const ui = useUIStore()

// ========== 静态数据索引 ==========

const resourceMap = new Map(resourceData.map(item => [item.id, item]))
const skinMap = new Map(skinData.map(item => [item.id, item]))
const weaponSkinMap = new Map(weaponSkinData.map(item => [item.id, item]))
const accessoryMap = new Map(charAccessoryData.map(item => [item.id, item]))
const rewardMap = new Map(rewardData.map(item => [item.id, item]))
const gachaMap = new Map(skinGachaData.map(item => [item.id, item]))

/**
 * 卡池页签排序：遵循数据 SkinGachaTab.sequence 升序，同 sequence 按 tabId 升序。
 * @param tabs 页签列表
 * @returns 排序后的页签列表
 */
function sortTabsBySequence(tabs: SkinGachaTab[]): SkinGachaTab[] {
    return [...tabs].sort((a, b) => a.sequence - b.sequence || a.tabId - b.tabId)
}

/** 按页签顺序排列的卡池页签（遵循数据 SkinGachaTab.sequence） */
const orderedTabs = computed(() => sortTabsBySequence(skinGachaTabs))

// ========== 持久化状态 ==========

/** 资源持有数量 */
const resources = useLocalStorage<Record<number, number>>("skin-gacha.resources", {})
/** 各卡池保底计数 */
const pityMap = useLocalStorage<Record<number, PityState>>("skin-gacha.pity", {})
/** 各卡池累计抽数 */
const totalDrawsMap = useLocalStorage<Record<number, number>>("skin-gacha.total-draws", {})
/** 各卡池已领取的累计奖励 */
const claimedMap = useLocalStorage<Record<number, number[]>>("skin-gacha.claimed", {})
/** 累计充值花费（CNY） */
const totalSpentCny = useLocalStorage<number>("skin-gacha.spent-cny", 0)
/** 充值模拟开关：开启后需要先充值再抽卡，关闭后无限抽卡 */
const chargeEnabled = useLocalStorage<boolean>("skin-gacha.charge-enabled", true)
/** 商城项目已购买次数 */
const purchasedMap = useLocalStorage<Record<number, number>>("skin-gacha.purchased", {})
/** 抽卡记录（最近批次在前，最多保留 500 条） */
const drawHistory = useLocalStorage<HistoryEntry[]>("skin-gacha.history", [])
/** 当前选中的页签 id（默认选中排序后的第一个页签） */
const selectedTabId = useLocalStorage<number>("skin-gacha.selected-tab", sortTabsBySequence(skinGachaTabs)[0]?.tabId ?? 0)

// ========== 卡池选择 ==========

/** 当前选中页签 */
const selectedTab = computed(() => orderedTabs.value.find(tab => tab.tabId === selectedTabId.value) ?? orderedTabs.value[0])

/** 当前选中卡池（取页签下第一个卡池） */
const selectedGacha = computed<SkinGacha | undefined>(() => {
    const tab = selectedTab.value
    return tab ? gachaMap.get(tab.gachaIds[0]) : undefined
})

/**
 * 获取卡池主打皮肤（金色奖池中第一个角色皮肤）。
 * @param gacha 卡池
 * @returns 皮肤数据
 */
function getFeaturedSkin(gacha: SkinGacha) {
    const pool = skinGachaItems.find(item => item.id === gacha.star5ItemId)
    const reward = pool?.rewards.find(entry => entry.t === "Skin" || skinMap.has(entry.id))
    return reward ? skinMap.get(reward.id) : undefined
}

/** 背景大图是否回退到 Banner 图 */
const bgUseFallback = ref(false)

/**
 * 页面背景大图：卡池主打皮肤的半身立绘大图（走 CDN 全尺寸图），加载失败时回退到 Banner 缩略图。
 */
const bgImage = computed(() => {
    const gacha = selectedGacha.value
    const tab = selectedTab.value
    if (!gacha || !tab) return ""
    if (!bgUseFallback.value) {
        const skin = getFeaturedSkin(gacha)
        if (skin && skin.icon.startsWith("T_Head_")) {
            return `https://cdn.dna-builder.cn/img/res/${skin.icon.replace("T_Head", "T_Bust")}.webp`
        }
    }
    return `/imgs/webp/${tab.icon}.webp`
})

/**
 * 选择卡池页签（移动端选择后自动收起抽屉）。
 * @param tabId 页签 id
 */
function selectTab(tabId: number) {
    selectedTabId.value = tabId
    bgUseFallback.value = false
    showGachaDrawer.value = false
}

// ========== 道具解析 ==========

/**
 * 按 id 与类型提示解析道具信息（名称、图标、稀有度）。
 * @param id 道具 id
 * @param hint 类型提示（部分数据缺失时按 id 全量回退查找）
 * @returns 解析后的道具信息
 */
/**
 * 资源图标地址解析：常规资源在 /imgs/res/，头部类在 /imgs/webp/，时装类在 /imgs/fashion/。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function resolveResourceIconUrl(icon: string): string {
    if (!icon) return "/imgs/webp/T_Head_Empty.webp"
    if (icon.startsWith("T_Head_")) return `/imgs/webp/${icon}.webp`
    if (icon.startsWith("T_Fashion_")) return `/imgs/fashion/${icon}.webp`
    return `/imgs/res/${icon}.webp`
}

/**
 * 奖励图标地址解析（用于商城礼包/物资展示）：礼包类（T_Pack_*）在 /imgs/res/，
 * 头部类在 /imgs/webp/，时装类在 /imgs/fashion/，其余按 res 目录处理。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function resolveRewardIconUrl(icon: string): string {
    if (!icon) return "/imgs/webp/T_Head_Empty.webp"
    if (icon.startsWith("T_Head_")) return `/imgs/webp/${icon}.webp`
    if (icon.startsWith("T_Fashion_")) return `/imgs/fashion/${icon}.webp`
    return `/imgs/res/${icon}.webp`
}

function resolveItem(id: number, hint?: string): ResolvedItem {
    if (hint === "Resource" || !hint) {
        const resource = resourceMap.get(id)
        if (resource) {
            return { id, name: resource.name, icon: resolveResourceIconUrl(resource.icon), rarity: resource.rarity, kind: "Resource" }
        }
    }
    if (hint === "Skin" || !hint) {
        const skin = skinMap.get(id)
        if (skin) {
            return { id, name: skin.name, icon: resolveSkinIconUrl(skin.icon), rarity: skin.rarity, kind: "Skin" }
        }
    }
    const weaponSkin = weaponSkinMap.get(id)
    if (weaponSkin && (hint === "WeaponSkin" || !hint)) {
        return { id, name: weaponSkin.name, icon: resolveSkinIconUrl(weaponSkin.icon), rarity: weaponSkin.rarity, kind: "WeaponSkin" }
    }
    const accessory = accessoryMap.get(id)
    if (accessory && (hint === "CharAccessory" || !hint)) {
        return { id, name: accessory.name, icon: resolveSkinIconUrl(accessory.icon), rarity: accessory.rarity, kind: "CharAccessory" }
    }
    const resource = resourceMap.get(id)
    if (resource) {
        return { id, name: resource.name, icon: resolveResourceIconUrl(resource.icon), rarity: resource.rarity, kind: "Resource" }
    }
    return { id, name: `未知道具 ${id}`, icon: "/imgs/webp/T_Head_Empty.webp", rarity: 3, kind: "Unknown" }
}

// ========== 资源与消耗 ==========

/**
 * 获取资源持有数量。
 * @param resId 资源 id
 * @returns 持有数量
 */
function getResourceCount(resId: number): number {
    return resources.value[resId] ?? 0
}

/**
 * 增加资源持有数量。
 * @param resId 资源 id
 * @param count 增加数量
 */
function addResource(resId: number, count: number) {
    resources.value = { ...resources.value, [resId]: getResourceCount(resId) + count }
}

/**
 * 当前卡池展示的资源 id 列表（限时资源在前，与普通资源分开）。
 */
const displayResources = computed(() => {
    const gacha = selectedGacha.value
    if (!gacha) return []
    const limited = gacha.cost.res.filter(id => id === RES_LIMITED_TICKET)
    const normal = gacha.cost.res.filter(id => id !== RES_LIMITED_TICKET)
    return [...limited, ...normal]
})

/** 单/十连的实际消耗明细（显式展示在抽卡按钮上） */
type DrawCostPlan = {
    /** 现有余额实际消耗的抽卡道具明细（不含自动购买补足部分） */
    tickets: { resId: number; count: number }[]
    /** 自动购买补足部分消耗的月石/月石晶胚数量（1:1 合并计） */
    crystals: number
    /** 月石与月石晶胚余额是否足以支付自动购买部分 */
    affordable: boolean
}

/**
 * 计算当前卡池指定抽数的实际消耗计划：优先按 cost.res 顺序消耗已有抽卡道具，
 * 不足部分自动购买补足（消耗月石晶胚，月石计价项目按 1:1 抵扣）。
 * @param times 抽数（1 或 10）
 * @returns 消耗计划；无卡池或无可购买渠道时返回 null
 */
function planDrawCost(times: 1 | 10): DrawCostPlan | null {
    const gacha = selectedGacha.value
    if (!gacha) return null
    let need = times === 10 ? gacha.cost.num10 : times
    const tickets: { resId: number; count: number }[] = []
    // 1. 按卡池消耗顺序抵扣已有抽卡道具
    for (const resId of gacha.cost.res) {
        if (need <= 0) break
        const use = Math.min(getResourceCount(resId), need)
        if (use > 0) {
            tickets.push({ resId, count: use })
            need -= use
        }
    }
    // 2. 不足部分自动购买：取 cost.res 中可购买的资源（从后往前，限时沙漏不可购时购买普通沙漏）
    // 注意：自动购买部分不走沙漏余额，直接以货币结算，因此不计入 tickets
    let crystals = 0
    if (need > 0) {
        const buyResId = [...gacha.cost.res].reverse().find(resId => autoBuyItemMap.has(resId))
        const buyItem = buyResId !== undefined ? autoBuyItemMap.get(buyResId) : undefined
        if (!buyItem) return null
        crystals = need * buyItem.price
    }
    // 3. 月石（月石计价项目 1:1 抵扣晶胚）+ 月石晶胚合并判断支付能力
    const affordable = crystals <= getResourceCount(RES_MOON) + getResourceCount(RES_MOON_STONE)
    return { tickets, crystals, affordable }
}

/** 单抽实际消耗计划 */
const drawCost1 = computed(() => planDrawCost(1))
/** 十连实际消耗计划 */
const drawCost10 = computed(() => planDrawCost(10))

// ========== 抽卡逻辑 ==========

/**
 * 获取卡池当前保底计数。
 * @param gachaId 卡池 id
 * @returns 保底计数
 */
function getPity(gachaId: number): PityState {
    return pityMap.value[gachaId] ?? { gold: 0, purple: 0 }
}

/**
 * 更新卡池保底计数。
 * @param gachaId 卡池 id
 * @param pity 保底计数
 */
function setPity(gachaId: number, pity: PityState) {
    pityMap.value = { ...pityMap.value, [gachaId]: pity }
}

/**
 * 当前卡池距离金色保底的剩余次数。
 */
const goldRemaining = computed(() => {
    const gacha = selectedGacha.value
    if (!gacha) return 0
    const prob = gachaProbabilities[String(gacha.probabilityId)]
    const goldPity = prob?.ShowGetStar5Times ?? DEFAULT_GOLD_PITY
    return Math.max(1, goldPity - getPity(gacha.id).gold)
})

/**
 * 金色保底提示文案片段。模板 UI_SkinGacha_Guarantee_Special 已原样搬入 i18n，
 * 其中的 %d 占位符替换为当前卡池距离金色保底的剩余次数。
 */
const guaranteeSegments = computed<StoryTextSegment[]>(() =>
    parseStoryTextSegments(t("skin-gacha.guaranteeSpecial").replace("%d", String(goldRemaining.value)), DEFAULT_STORY_TEXT_CONFIG)
)

/**
 * 将卡池描述/说明文本解析为可渲染片段（%% 转义为百分号）。
 * @param text 原始文本
 * @returns 文本片段
 */
function parseRichText(text: string): StoryTextSegment[] {
    return parseStoryTextSegments(text.replace(/%%/g, "%"), DEFAULT_STORY_TEXT_CONFIG)
}

/**
 * 概率与规则说明文案片段。原文本中的 %d 占位符替换为当前卡池已进行的抽数（金色保底进度），
 * %% 转义为百分号。
 */
const warningSegments = computed<StoryTextSegment[]>(() => {
    const gacha = selectedGacha.value
    if (!gacha) return []
    return parseStoryTextSegments(
        gacha.warning.replace("%d", String(getPity(gacha.id).gold)).replace(/%%/g, "%"),
        DEFAULT_STORY_TEXT_CONFIG
    )
})

/**
 * 决定单次抽卡的星级（90 金保底 / 10 紫保底，两个保底独立计数，提前出即重置对应保底）。
 * @param gacha 卡池
 * @param pity 保底计数（原地修改）
 * @returns 星级
 */
function rollStar(gacha: SkinGacha, pity: PityState): 3 | 4 | 5 {
    const prob = gachaProbabilities[String(gacha.probabilityId)]
    const goldPity = prob?.ShowGetStar5Times ?? DEFAULT_GOLD_PITY
    const goldRate = (prob?.ProbabilityGold ?? 0) / 10000
    const purpleRate = (prob?.ProbabilityPurple ?? 0) / 10000

    pity.gold += 1
    pity.purple += 1

    if (pity.gold >= goldPity) {
        pity.gold = 0
        return 5
    }
    if (pity.purple >= PURPLE_PITY) {
        pity.purple = 0
        return 4
    }
    const roll = Math.random()
    if (roll < goldRate) {
        pity.gold = 0
        return 5
    }
    if (roll < goldRate + purpleRate) {
        pity.purple = 0
        return 4
    }
    return 3
}

/**
 * 从指定星级奖池中按权重抽取一个奖励（权重全为 -1 时等概率）。
 * @param poolId 奖池 id
 * @returns 奖励条目
 */
function pickReward(poolId: number): SkinGachaReward | null {
    const pool = skinGachaItems.find(item => item.id === poolId)
    if (!pool || pool.rewards.length === 0) return null
    const allUniform = pool.rewards.every(entry => entry.p < 0)
    if (allUniform) {
        return pool.rewards[Math.floor(Math.random() * pool.rewards.length)]
    }
    const total = pool.rewards.reduce((sum, entry) => sum + Math.max(0, entry.p), 0)
    let roll = Math.random() * total
    for (const entry of pool.rewards) {
        roll -= Math.max(0, entry.p)
        if (roll < 0) return entry
    }
    return pool.rewards[pool.rewards.length - 1]
}

/**
 * 发放奖励：资源类计入资源余额，外观类仅作记录展示。
 * @param results 抽卡结果
 */
function grantResults(results: DrawResult[]) {
    for (const result of results) {
        if (result.item.kind === "Resource") {
            addResource(result.item.id, result.count)
        }
    }
}

// ========== 抽卡动画与结果展示 ==========

/** 抽卡流程阶段：idle 空闲 / flash 播放入场动画 / results 展示奖励 */
const drawPhase = ref<"idle" | "flash" | "results">("idle")
/** 本次抽卡结果 */
const drawResults = ref<DrawResult[]>([])
/** 本次抽卡最高星级（决定入场动画颜色） */
const drawBestStar = computed<3 | 4 | 5>(() =>
    drawResults.value.some(r => r.star === 5) ? 5 : drawResults.value.some(r => r.star === 4) ? 4 : 3
)

/** 入场动画计时器 */
let flashTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 执行抽卡。
 * @param times 抽数（1 或 10）
 */
function pull(times: 1 | 10) {
    const gacha = selectedGacha.value
    if (!gacha || drawPhase.value !== "idle") return

    if (chargeEnabled.value) {
        const plan = planDrawCost(times)
        if (!plan || !plan.affordable) {
            ui.showErrorMessage("抽卡资源与月石晶胚不足，请先充值")
            showShop.value = true
            return
        }
        // 消耗抽卡道具（自动购买部分随买随用）
        for (const ticket of plan.tickets) {
            addResource(ticket.resId, -ticket.count)
        }
        // 自动购买补足部分支付月石/月石晶胚（月石不足时 1:1 消耗月石晶胚）
        if (plan.crystals > 0) {
            payPrice(RES_MOON, plan.crystals, "月石晶胚")
        }
    }

    // 逐抽决定星级并抽取奖励
    const pity = { ...getPity(gacha.id) }
    const results: DrawResult[] = []
    for (let i = 0; i < times; i++) {
        const star = rollStar(gacha, pity)
        const poolId = star === 5 ? gacha.star5ItemId : star === 4 ? gacha.star4ItemId : gacha.star3ItemId
        const reward = pickReward(poolId)
        if (!reward) continue
        results.push({ star, count: reward.c, item: resolveItem(reward.id, reward.t) })
    }
    setPity(gacha.id, pity)
    totalDrawsMap.value = { ...totalDrawsMap.value, [gacha.id]: (totalDrawsMap.value[gacha.id] ?? 0) + times }
    grantResults(results)

    // 记录抽卡历史（本批次按抽卡顺序插入最前）
    drawHistory.value = [
        ...results.map(result => ({
            time: Date.now(),
            gachaId: gacha.id,
            gachaName: gacha.name,
            star: result.star,
            itemName: result.item.name,
            icon: result.item.icon,
            count: result.count,
        })),
        ...drawHistory.value,
    ].slice(0, 500)

    drawResults.value = results
    drawPhase.value = "flash"
    flashTimer = setTimeout(() => {
        drawPhase.value = "results"
    }, 1400)
}

/**
 * 跳过入场动画，直接展示奖励。
 */
function skipFlash() {
    if (flashTimer) {
        clearTimeout(flashTimer)
        flashTimer = null
    }
    if (drawPhase.value === "flash") {
        drawPhase.value = "results"
    }
}

/**
 * 关闭奖励展示。
 */
function closeResults() {
    drawPhase.value = "idle"
    drawResults.value = []
}

// ========== 抽卡记录 ==========

/** 抽卡记录弹窗显示状态 */
const showHistory = ref(false)

/** 移动端卡池抽屉显示状态（默认收起，桌面端不使用） */
const showGachaDrawer = ref(false)

/** 抽卡统计（基于全部记录，参考主流抽卡统计软件版式） */
const historyStats = computed(() => {
    const total = drawHistory.value.length
    const gold = drawHistory.value.filter(entry => entry.star === 5).length
    const purple = drawHistory.value.filter(entry => entry.star === 4).length
    const blue = total - gold - purple
    const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(2)}%` : "-")
    return {
        total,
        gold,
        purple,
        blue,
        goldPct: pct(gold),
        purplePct: pct(purple),
        bluePct: pct(blue),
        /** 平均每金抽数 */
        avgGold: gold > 0 ? (total / gold).toFixed(1) : "-",
        /** 累计充值花费（CNY） */
        spentCny: totalSpentCny.value,
    }
})

/**
 * 格式化记录时间为 MM-DD HH:mm。
 * @param ts 时间戳（毫秒）
 * @returns 格式化时间文本
 */
function formatHistoryTime(ts: number): string {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 星级对应的文本颜色（金/紫/蓝）。
 * @param star 星级
 * @returns 样式类
 */
function getStarTextClass(star: number): string {
    if (star === 5) return "text-amber-500 dark:text-amber-300"
    if (star === 4) return "text-violet-500 dark:text-violet-300"
    return "text-sky-500 dark:text-sky-300"
}

/**
 * 清空全部记录（抽卡记录、保底进度、累计抽数与奖励领取、充值花费、购买记录与资源余额），
 * 点击后弹出确认弹窗。
 */
async function clearAllRecords() {
    const confirmed = await ui.showDialog("清空记录", "确定要清空所有抽卡记录、保底进度、累计奖励、充值花费与资源余额吗？此操作不可恢复。")
    if (!confirmed) return
    drawHistory.value = []
    pityMap.value = {}
    totalDrawsMap.value = {}
    claimedMap.value = {}
    totalSpentCny.value = 0
    purchasedMap.value = {}
    resources.value = {}
    ui.showSuccessMessage("已清空全部记录")
}

// ========== 累计奖励 ==========

/**
 * 当前卡池的累计抽数奖励配置。
 */
const currentCumulative = computed(() => {
    const gacha = selectedGacha.value
    return gacha ? skinGachaCumulative.find(item => item.gachaId === gacha.id) : undefined
})

/**
 * 当前卡池累计抽数。
 */
const currentTotalDraws = computed(() => {
    const gacha = selectedGacha.value
    return gacha ? (totalDrawsMap.value[gacha.id] ?? 0) : 0
})

/**
 * 领取累计抽数奖励。
 * @param rewardId 奖励 id
 * @param target 目标抽数
 */
function claimCumulative(rewardId: number, target: number) {
    const gacha = selectedGacha.value
    if (!gacha || currentTotalDraws.value < target) return
    const claimed = claimedMap.value[gacha.id] ?? []
    if (claimed.includes(rewardId)) return

    const reward = currentCumulative.value?.rewards.find(item => item.rewardId === rewardId)
    for (const item of reward?.items ?? []) {
        const resolved = resolveItem(item.id, item.t)
        if (resolved.kind === "Resource") {
            addResource(item.id, item.c)
        }
    }
    claimedMap.value = { ...claimedMap.value, [gacha.id]: [...claimed, rewardId] }
    ui.showSuccessMessage("领取成功")
}

/**
 * 累计奖励是否已领取。
 * @param rewardId 奖励 id
 * @returns 是否已领取
 */
function isClaimed(rewardId: number): boolean {
    const gacha = selectedGacha.value
    return gacha ? (claimedMap.value[gacha.id] ?? []).includes(rewardId) : false
}

// ========== 商城（模拟充值） ==========

/** 商城弹窗显示状态 */
const showShop = ref(false)
/** 概率说明弹窗显示状态 */
const showWarning = ref(false)
/** 商城当前主 tab */
const shopTabId = ref(160)
/** 商城礼箱（礼包）主 tab id */
const SHOP_TAB_PACK = 160
/** 商城物资主 tab id */
const SHOP_TAB_MATERIAL = 150

/** 抽卡道具资源 id 集合（所有卡池 cost.res 的并集），用于商城过滤与内容展示 */
const gachaResourceIds = new Set(skinGachaData.flatMap(gacha => gacha.cost.res))

/**
 * 抽卡资源 → 可用月石/月石晶胚无限次购买的商城项目（抽卡时沙漏不足自动购买补足）。
 * 选取价格最低的项目（月石计价按 1:1 视为月石晶胚等价）。
 */
const autoBuyItemMap = (() => {
    const map = new Map<number, ShopItem>()
    const shop = shopData.find(item => item.id === "Shop")
    for (const mainTab of shop?.mainTabs ?? []) {
        for (const subTab of mainTab.subTabs) {
            for (const item of subTab.items) {
                if (item.itemType !== "Resource" || !gachaResourceIds.has(item.typeId)) continue
                if (item.pay?.CNY || item.limit) continue
                if (item.priceType !== RES_MOON && item.priceType !== RES_MOON_STONE) continue
                const existing = map.get(item.typeId)
                if (!existing || item.price < existing.price) map.set(item.typeId, item)
            }
        }
    }
    return map
})()

/** 商城礼箱内含的抽卡道具信息 */
type GachaItemInfo = {
    id: number
    name: string
    icon: string
    count: number
}

/** 商城主 tab：礼箱 / 物资 / 月石晶胚（同游戏内商城） */
const shopMainTabs = computed<ShopMainTab[]>(() => {
    const shop = shopData.find(item => item.id === "Shop")
    return shop?.mainTabs.filter(tab => [SHOP_TAB_PACK, SHOP_TAB_MATERIAL, 110].includes(tab.id)) ?? []
})

/**
 * 解析礼箱（Reward）内含的抽卡道具列表（含几个、哪种）。
 * @param item 商城项目
 * @returns 内含的抽卡道具列表
 */
function getGachaItemsInPack(item: ShopItem): GachaItemInfo[] {
    if (item.itemType !== "Reward") return []
    const result: GachaItemInfo[] = []
    for (const child of rewardMap.get(item.typeId)?.child ?? []) {
        if (!gachaResourceIds.has(child.id)) continue
        const resource = resourceMap.get(child.id)
        if (!resource) continue
        result.push({ id: child.id, name: child.n ?? resource.name, icon: resolveResourceIconUrl(resource.icon), count: child.c })
    }
    return result
}

/**
 * 过滤后的商城主 tab：礼箱仅保留内含抽卡道具的项目，物资仅保留抽卡道具，
 * 月石晶胚（充值货币）保持不变。
 */
const filteredShopMainTabs = computed<ShopMainTab[]>(() =>
    shopMainTabs.value.map(mainTab => ({
        ...mainTab,
        subTabs: mainTab.subTabs
            .map(subTab => ({
                ...subTab,
                items: subTab.items.filter(item => {
                    if (mainTab.id === SHOP_TAB_PACK) {
                        return getGachaItemsInPack(item).length > 0
                    }
                    if (mainTab.id === SHOP_TAB_MATERIAL) {
                        return item.itemType === "Resource" && gachaResourceIds.has(item.typeId)
                    }
                    return true
                }),
            }))
            .filter(subTab => subTab.items.length > 0),
    }))
)

/**
 * 获取商城项目售价文案。
 * @param item 商城项目
 * @returns 售价文案
 */
function getShopPriceText(item: ShopItem): string {
    if (item.pay?.CNY) return `¥${item.pay.CNY}`
    return `${item.price} ${item.priceName}`
}

/**
 * 获取商城项目图标。
 * @param item 商城项目
 * @returns 图标 URL
 */
function getShopItemIcon(item: ShopItem): string {
    if (item.itemType === "Reward") {
        const icon = rewardMap.get(item.typeId)?.icon
        // 礼包/物资类奖励图标（T_Pack_* 等）位于 /imgs/res/，头部/时装类分别在 webp/fashion
        if (icon) return resolveRewardIconUrl(icon)
    }
    return resolveItem(item.typeId, item.itemType).icon
}

/**
 * 发放商城项目内容（资源直接入账，礼箱发放内含资源）。
 * @param item 商城项目
 */
function grantShopItem(item: ShopItem) {
    if (item.itemType === "Resource") {
        addResource(item.typeId, item.num)
        return
    }
    if (item.itemType === "Reward") {
        const reward = rewardMap.get(item.typeId)
        for (const child of reward?.child ?? []) {
            if (resourceMap.has(child.id)) {
                addResource(child.id, child.c)
            }
        }
    }
}

/**
 * 支付货币消耗：月石（100）不足时自动按 1:1 将月石晶胚（99）兑换为月石补足，
 * 优先消耗月石本体，不足部分消耗月石晶胚。
 * @param priceType 计价货币资源 id
 * @param price 价格
 * @param priceName 货币名称（用于错误提示）
 * @returns 是否支付成功
 */
function payPrice(priceType: number, price: number, priceName: string): boolean {
    // 月石计价时可 1:1 抵扣月石晶胚
    const available = getResourceCount(priceType) + (priceType === RES_MOON ? getResourceCount(RES_MOON_STONE) : 0)
    if (available < price) {
        ui.showErrorMessage(`${priceName}不足`)
        return false
    }
    const useMain = Math.min(getResourceCount(priceType), price)
    addResource(priceType, -useMain)
    if (price - useMain > 0) {
        addResource(RES_MOON_STONE, -(price - useMain))
    }
    return true
}

/**
 * 购买商城项目：CNY 项目记录累计花费并直接入账，其余消耗对应货币。
 * @param item 商城项目
 */
function buyShopItem(item: ShopItem) {
    const bought = purchasedMap.value[item.id] ?? 0
    if (item.limit && bought >= item.limit) {
        ui.showErrorMessage("已达购买上限")
        return
    }

    if (item.pay?.CNY) {
        // 模拟真实充值：仅记录实际消耗金额
        totalSpentCny.value += item.pay.CNY
        grantShopItem(item)
        ui.showSuccessMessage(`充值成功，累计花费 ¥${totalSpentCny.value}`)
    } else {
        if (!payPrice(item.priceType, item.price, item.priceName)) return
        grantShopItem(item)
        ui.showSuccessMessage(`已购买 ${item.typeName}`)
    }
    purchasedMap.value = { ...purchasedMap.value, [item.id]: bought + 1 }
}

/**
 * 获取商城项目剩余可购买次数。
 * @param item 商城项目
 * @returns 剩余次数，无限制时返回 null
 */
function getShopItemRemain(item: ShopItem): number | null {
    if (!item.limit) return null
    return Math.max(0, item.limit - (purchasedMap.value[item.id] ?? 0))
}

/**
 * 稀有度对应的卡片渐变样式（参考原神奖励卡片）。
 * @param rarity 稀有度
 * @returns 样式类
 */
function getRarityClass(rarity: number): string {
    if (rarity >= 5) return "from-amber-200/90 via-amber-400/80 to-amber-600/70 text-amber-950"
    if (rarity === 4) return "from-violet-300/90 via-violet-500/80 to-violet-700/70 text-violet-50"
    return "from-sky-200/90 via-sky-400/80 to-sky-600/70 text-sky-950"
}

/**
 * 星级对应的光晕颜色（抽卡入场动画）。
 * @param star 星级
 * @returns 样式类
 */
function getStarGlowClass(star: 3 | 4 | 5): string {
    if (star === 5) return "bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.55),rgba(251,191,36,0.12)_45%,transparent_70%)]"
    if (star === 4) return "bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.55),rgba(167,139,250,0.12)_45%,transparent_70%)]"
    return "bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.5),rgba(125,211,252,0.1)_45%,transparent_70%)]"
}
</script>

<template>
    <div class="h-full relative overflow-hidden bg-base-300">
        <!-- 页面背景：卡池主打皮肤大图（切换时淡入淡出） -->
        <Transition name="gacha-bg">
            <img
                :key="bgImage"
                :src="bgImage"
                alt=""
                aria-hidden="true"
                class="pointer-events-none absolute inset-0 size-full object-cover object-top-right"
                @error="bgUseFallback = true"
            />
        </Transition>
        <!-- 左侧遮罩渐变，保证可读性 -->
        <div class="pointer-events-none absolute inset-0 bg-linear-to-r from-base-300 via-base-300/70 to-transparent" />
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-base-300/90 to-transparent" />

        <div class="relative flex h-full">
            <!-- 移动端抽屉遮罩：点击关闭 -->
            <div
                v-if="showGachaDrawer"
                class="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-xs sm:hidden"
                @click="showGachaDrawer = false"
            />
            <!-- 左侧：卡池选择列表（移动端为左侧抽屉、默认收起；桌面端为常驻侧栏） -->
            <aside
                class="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r-2 border-primary/60 bg-base-100/95 shadow-xl transition-transform duration-200 sm:relative sm:z-auto sm:w-72 sm:translate-x-0 sm:bg-base-100/70 sm:shadow-none sm:backdrop-blur-sm"
                :class="showGachaDrawer ? 'translate-x-0' : '-translate-x-full'"
            >
                <header class="shrink-0 border-b border-base-content/10 px-4 pt-5 pb-4">
                    <p class="mb-1 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Skin Gacha
                    </p>
                    <h1 class="font-orbitron text-2xl font-bold tracking-tight">{{ $t("skin-gacha.title") }}</h1>
                    <p class="mt-1 text-xs text-base-content/55">{{ $t("skin-gacha.desc") }}</p>
                </header>
                <ScrollArea class="min-h-0 flex-1">
                    <div class="space-y-3 p-3">
                        <button
                            v-for="tab in orderedTabs"
                            :key="tab.tabId"
                            type="button"
                            class="group relative block w-full overflow-hidden rounded-xs border-2 text-left transition-all duration-150 cursor-pointer"
                            :class="
                                selectedTab?.tabId === tab.tabId
                                    ? 'border-primary shadow-[0_0_0_1px_var(--color-primary),0_8px_24px_-8px_var(--color-primary)]'
                                    : 'border-base-content/15 hover:border-primary/50'
                            "
                            @click="selectTab(tab.tabId)"
                        >
                            <img
                                :src="`/imgs/webp/${tab.icon}.webp`"
                                :alt="gachaMap.get(tab.gachaIds[0])?.name ?? tab.name"
                                loading="lazy"
                                class="aspect-16/7 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            />
                            <div class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2">
                                <div class="truncate text-sm font-bold text-white">
                                    {{ gachaMap.get(tab.gachaIds[0])?.name ?? tab.name }}
                                </div>
                                <div class="mt-0.5 flex items-center gap-1.5">
                                    <span class="rounded-xs bg-primary/90 px-1.5 py-px text-[10px] font-semibold text-primary-content">{{
                                        tab.name
                                    }}</span>
                                    <span
                                        v-if="selectedTab?.tabId === tab.tabId"
                                        class="rounded-xs bg-white/20 px-1.5 py-px text-[10px] font-semibold text-white"
                                    >
                                        当前卡池
                                    </span>
                                </div>
                            </div>
                        </button>
                    </div>
                </ScrollArea>
            </aside>

            <!-- 主区域 -->
            <main class="relative min-w-0 flex-1">
                <!-- 左上角（移动端）：展开卡池抽屉 -->
                <button
                    type="button"
                    class="absolute top-4 left-4 z-10 flex h-10 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 bg-base-100/80 px-3 text-xs font-medium text-base-content/70 backdrop-blur-sm transition-colors hover:border-primary/50 hover:text-primary sm:hidden"
                    @click="showGachaDrawer = true"
                >
                    <Icon icon="ri:menu-unfold-line" class="size-4" />
                    卡池
                </button>
                <!-- 右上角：资源 / 累计消耗 / 描述小字 -->
                <div class="absolute top-0 right-0 flex max-w-[70%] flex-col items-end gap-2 p-4">
                    <div class="flex flex-wrap items-center justify-end gap-2">
                        <!-- 月石晶胚 -->
                        <button
                            type="button"
                            class="flex h-9 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 bg-base-100/80 px-2.5 backdrop-blur-sm transition-colors hover:border-primary/50"
                            title="月石晶胚（点击打开商城）"
                            @click="showShop = true"
                        >
                            <img src="/imgs/res/T_Coin_Main_Lv1.webp" alt="月石晶胚" class="size-5 object-contain" />
                            <span class="text-sm font-bold tabular-nums">{{ getResourceCount(RES_MOON_STONE) }}</span>
                            <Icon icon="ri:add-line" class="size-3.5 text-primary" />
                        </button>
                        <!-- 抽卡资源（限时与普通分开显示） -->
                        <div
                            v-for="resId in displayResources"
                            :key="resId"
                            class="relative flex h-9 items-center gap-1.5 rounded-xs border bg-base-100/80 px-2.5 backdrop-blur-sm"
                            :class="resId === RES_LIMITED_TICKET ? 'border-warning/50' : 'border-base-content/15'"
                        >
                            <span
                                v-if="resId === RES_LIMITED_TICKET"
                                class="absolute -top-2 -left-1 rounded-xs bg-warning px-1 text-[9px] font-bold text-warning-content"
                            >
                                限时
                            </span>
                            <img
                                :src="resolveItem(resId, 'Resource').icon"
                                :alt="resolveItem(resId, 'Resource').name"
                                class="size-5 object-contain"
                            />
                            <span class="text-sm font-bold tabular-nums">{{ getResourceCount(resId) }}</span>
                        </div>
                        <!-- 充值模拟开关 -->
                        <button
                            type="button"
                            class="flex h-9 cursor-pointer items-center gap-1.5 rounded-xs border px-2.5 text-xs font-medium backdrop-blur-sm transition-colors"
                            :class="
                                chargeEnabled
                                    ? 'border-primary/50 bg-primary/10 text-primary'
                                    : 'border-base-content/15 bg-base-100/80 text-base-content/60 hover:border-primary/40'
                            "
                            :title="chargeEnabled ? '充值模拟已开启：抽卡消耗资源' : '充值模拟已关闭：无限抽卡'"
                            @click="chargeEnabled = !chargeEnabled"
                        >
                            <Icon :icon="chargeEnabled ? 'ri:toggle-fill' : 'ri:toggle-line'" class="size-4" />
                            {{ chargeEnabled ? "充值模拟" : "无限抽卡" }}
                        </button>
                    </div>
                    <div v-if="chargeEnabled" class="text-xs text-base-content/60">
                        累计花费 <span class="font-bold tabular-nums text-primary">¥{{ totalSpentCny }}</span>
                    </div>
                    <!-- 卡池描述小字 -->
                    <div v-if="selectedGacha" class="max-w-96 text-right text-[11px] leading-4 text-base-content/50">
                        <template v-for="(segment, index) in parseRichText(selectedGacha.desc)" :key="`desc-${index}`">
                            <span :class="{ 'text-primary font-semibold': segment.tone === 'highlight' }">{{ segment.text }}</span>
                        </template>
                    </div>
                    <button
                        v-if="selectedGacha?.warning"
                        type="button"
                        class="cursor-pointer text-[11px] text-base-content/45 underline decoration-dotted underline-offset-2 hover:text-primary"
                        @click="showWarning = true"
                    >
                        概率与规则说明
                    </button>
                </div>

                <!-- 右下角：卡池名 / 保底提示 / 累计奖励 / 抽卡按钮 -->
                <div v-if="selectedGacha" class="absolute right-0 bottom-0 flex flex-col items-end gap-3 p-5">
                    <div class="text-right">
                        <div class="text-[11px] font-semibold tracking-[0.3em] text-primary uppercase">{{ selectedTab?.name }}</div>
                        <h2 class="font-orbitron text-3xl font-bold tracking-tight drop-shadow-sm sm:text-4xl">{{ selectedGacha.name }}</h2>
                        <div
                            class="mt-1 inline-flex items-center gap-1.5 rounded-xs border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-300"
                        >
                            <Icon icon="ri:sparkling-fill" class="size-3.5" />
                            {{ selectedGacha.coreDes }}
                        </div>
                    </div>

                    <!-- 累计抽数奖励 -->
                    <div
                        v-if="currentCumulative"
                        class="flex items-center gap-1.5 rounded-xs border border-base-content/15 bg-base-100/80 px-2.5 py-1.5 backdrop-blur-sm"
                    >
                        <span class="mr-1 text-[11px] text-base-content/55">累计 {{ currentTotalDraws }} 抽</span>
                        <button
                            v-for="reward in currentCumulative.rewards"
                            :key="reward.rewardId"
                            type="button"
                            class="relative flex cursor-pointer items-center gap-1 rounded-xs border px-1.5 py-1 transition-colors"
                            :class="
                                isClaimed(reward.rewardId)
                                    ? 'border-base-content/10 opacity-40'
                                    : currentTotalDraws >= reward.target
                                      ? 'border-warning/60 bg-warning/15 animate-pulse'
                                      : 'border-base-content/15'
                            "
                            :disabled="isClaimed(reward.rewardId) || currentTotalDraws < reward.target"
                            :title="`${reward.target} 抽奖励：${reward.items.map(item => `${resolveItem(item.id, item.t).name}×${item.c}`).join('、')}`"
                            @click="claimCumulative(reward.rewardId, reward.target)"
                        >
                            <img
                                v-if="reward.items[0]"
                                :src="resolveItem(reward.items[0].id, reward.items[0].t).icon"
                                :alt="resolveItem(reward.items[0].id, reward.items[0].t).name"
                                class="size-5 object-contain"
                            />
                            <span class="text-[10px] font-bold tabular-nums">{{ reward.target }}</span>
                            <Icon
                                v-if="isClaimed(reward.rewardId)"
                                icon="ri:check-line"
                                class="absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-success text-success-content"
                            />
                        </button>
                    </div>

                    <!-- 保底剩余次数提示 -->
                    <div class="text-xs text-base-content/70">
                        <template v-for="(segment, index) in guaranteeSegments" :key="`guarantee-${index}`">
                            <span :class="{ 'text-primary font-bold tabular-nums': segment.tone === 'highlight' }">{{ segment.text }}</span>
                        </template>
                    </div>

                    <!-- 抽卡按钮（显式展示实际消耗：沙漏×N + 自动购买消耗的月石晶胚×N）；抽卡记录靠左，容不下时换行 -->
                    <div class="flex w-full flex-wrap items-center justify-end gap-3">
                        <!-- 抽卡记录入口（靠左） -->
                        <button
                            type="button"
                            class="mr-auto flex h-10 cursor-pointer items-center gap-1.5 px-3 text-xs font-medium text-base-content/70 transition-colors hover:border-primary/50 hover:text-primary"
                            @click="showHistory = true"
                        >
                            <Icon icon="ri:history-line" class="size-4" />
                            抽卡记录
                        </button>
                        <div class="flex-1"></div>
                        <!-- 抽卡按钮组（整体换行，靠右） -->
                        <div class="flex items-center gap-3">
                            <button
                                type="button"
                                class="flex h-12 min-w-32 cursor-pointer items-center justify-center gap-2 rounded-xs border border-base-content/25 bg-base-100/85 px-5 text-sm font-semibold backdrop-blur-sm transition-all duration-150 hover:border-primary/60 hover:bg-base-100 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
                                :disabled="drawPhase !== 'idle' || (chargeEnabled && !drawCost1?.affordable)"
                                @click="pull(1)"
                            >
                                <span>单抽</span>
                                <span class="flex items-center gap-1 text-xs text-base-content/60">
                                    <template v-if="drawCost1">
                                        <template v-for="(ticket, ti) in drawCost1.tickets" :key="`c1-${ticket.resId}`">
                                            <span v-if="ti > 0" class="text-base-content/40">+</span>
                                            <img
                                                :src="resolveItem(ticket.resId, 'Resource').icon"
                                                :alt="resolveItem(ticket.resId, 'Resource').name"
                                                class="size-4 object-contain"
                                            />
                                            <span>×{{ ticket.count }}</span>
                                        </template>
                                        <template v-if="drawCost1.crystals > 0">
                                            <span v-if="drawCost1.tickets.length > 0" class="text-base-content/40">+</span>
                                            <img src="/imgs/res/T_Coin_Main_Lv1.webp" alt="月石晶胚" class="size-4 object-contain" />
                                            <span>×{{ drawCost1.crystals }}</span>
                                        </template>
                                    </template>
                                    <template v-else>×1</template>
                                </span>
                            </button>
                            <button
                                type="button"
                                class="flex h-12 min-w-36 cursor-pointer items-center justify-center gap-2 rounded-xs bg-primary px-6 text-sm font-bold text-primary-content shadow-[0_8px_24px_-8px_var(--color-primary)] transition-all duration-150 hover:bg-primary/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
                                :disabled="drawPhase !== 'idle' || (chargeEnabled && !drawCost10?.affordable)"
                                @click="pull(10)"
                            >
                                <span>十连抽</span>
                                <span class="flex items-center gap-1 text-xs text-primary-content/80">
                                    <template v-if="drawCost10">
                                        <template v-for="(ticket, ti) in drawCost10.tickets" :key="`c10-${ticket.resId}`">
                                            <span v-if="ti > 0" class="text-primary-content/50">+</span>
                                            <img
                                                :src="resolveItem(ticket.resId, 'Resource').icon"
                                                :alt="resolveItem(ticket.resId, 'Resource').name"
                                                class="size-4 object-contain"
                                            />
                                            <span>×{{ ticket.count }}</span>
                                        </template>
                                        <template v-if="drawCost10.crystals > 0">
                                            <span v-if="drawCost10.tickets.length > 0" class="text-primary-content/50">+</span>
                                            <img src="/imgs/res/T_Coin_Main_Lv1.webp" alt="月石晶胚" class="size-4 object-contain" />
                                            <span>×{{ drawCost10.crystals }}</span>
                                        </template>
                                    </template>
                                    <template v-else>×10</template>
                                </span>
                            </button>
                        </div>
                    </div>
                    <div v-if="chargeEnabled && !drawCost10?.affordable" class="text-[11px] text-error">
                        抽卡资源与月石晶胚不足，点击右上角月石晶胚前往商城充值
                    </div>
                </div>
            </main>
        </div>

        <!-- 抽卡动画覆盖层（absolute 定位，不遮挡窗体控件） -->
        <div
            v-if="drawPhase !== 'idle'"
            class="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl"
            @click="drawPhase === 'flash' ? skipFlash() : undefined"
        >
            <!-- 入场动画：按最高星级显示光晕 -->
            <div v-if="drawPhase === 'flash'" class="pointer-events-none absolute inset-0 overflow-hidden">
                <div class="absolute inset-0 gacha-flash" :class="getStarGlowClass(drawBestStar)" />
                <div class="absolute inset-x-0 top-1/2 h-px gacha-beam bg-white/70" />
                <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-xs font-semibold tracking-[0.5em] text-white/70 uppercase">点击跳过</span>
                </div>
            </div>

            <!-- 奖励列表：依次从半透明模糊态往上弹入 -->
            <div v-else class="relative flex max-h-full w-full max-w-5xl flex-col items-center px-6" @click.stop>
                <div class="mb-5 text-center">
                    <div class="text-[11px] font-semibold tracking-[0.4em] text-white/60 uppercase">Wanhua Result</div>
                    <div class="mt-1 font-orbitron text-2xl font-bold text-white">获得奖励</div>
                </div>
                <div class="flex max-w-full flex-wrap items-end justify-center gap-3 overflow-y-auto pb-2">
                    <div
                        v-for="(result, index) in drawResults"
                        :key="index"
                        class="reward-card w-28 shrink-0 overflow-hidden rounded-md bg-linear-to-b shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]"
                        :class="getRarityClass(result.item.rarity)"
                        :style="{ '--i': index }"
                    >
                        <div class="relative flex h-28 items-center justify-center p-2">
                            <img
                                :src="result.item.icon"
                                :alt="result.item.name"
                                class="max-h-full max-w-full object-contain drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)]"
                            />
                            <span
                                class="absolute right-1 bottom-1 rounded-xs bg-black/45 px-1 text-[10px] font-bold text-white tabular-nums"
                                >×{{ result.count }}</span
                            >
                        </div>
                        <div class="bg-black/35 px-1.5 py-1.5 text-center">
                            <div class="truncate text-xs font-bold text-white">{{ result.item.name }}</div>
                            <div class="mt-0.5 text-[10px] tracking-wider text-white/70">
                                {{ "★".repeat(result.star) }}
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    class="mt-6 flex h-11 min-w-40 cursor-pointer items-center justify-center gap-2 rounded-xs bg-primary px-8 text-sm font-bold text-primary-content transition-colors hover:bg-primary/90 active:translate-y-px"
                    @click="closeResults"
                >
                    <Icon icon="ri:check-line" class="size-4" />
                    确定
                </button>
            </div>
        </div>

        <!-- 概率与规则说明弹窗 -->
        <DialogRoot v-model:open="showWarning">
            <DialogPortal>
                <DialogOverlay class="fixed inset-0 z-30 bg-gray-900/50 data-[state=open]:animate-overlayShow" />
                <DialogContent
                    class="fixed top-1/2 left-1/2 z-100 flex max-h-[85vh] w-[92vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg bg-base-100 shadow-lg data-[state=open]:animate-contentShow"
                >
                    <div class="shrink-0 p-5 pb-3">
                        <DialogTitle class="text-lg font-semibold">{{ selectedGacha?.name }} · 概率与规则说明</DialogTitle>
                    </div>
                    <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                        <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/85">
                            <template v-for="(segment, index) in warningSegments" :key="`warning-${index}`">
                                <span
                                    :class="{
                                        'text-primary font-semibold': segment.tone === 'highlight',
                                        'text-base-content font-bold': segment.tone === 'title',
                                    }"
                                    >{{ segment.text }}</span
                                >
                            </template>
                        </div>
                    </div>
                    <DialogClose class="btn btn-square btn-sm btn-ghost absolute top-2.5 right-2.5 text-lg" aria-label="close">
                        <Icon icon="radix-icons:cross2" />
                    </DialogClose>
                </DialogContent>
            </DialogPortal>
        </DialogRoot>

        <!-- 抽卡记录弹窗（统计 + 具体记录，版式参考主流抽卡统计软件） -->
        <DialogRoot v-model:open="showHistory">
            <DialogPortal>
                <DialogOverlay class="fixed inset-0 z-30 bg-gray-900/50 data-[state=open]:animate-overlayShow" />
                <DialogContent
                    class="fixed top-1/2 left-1/2 z-100 flex max-h-[85vh] w-[94vw] max-w-3xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg bg-base-100 shadow-lg data-[state=open]:animate-contentShow"
                >
                    <div class="flex shrink-0 items-center justify-between gap-3 border-b border-base-content/10 p-5 pb-3 pr-12">
                        <div>
                            <DialogTitle class="text-lg font-semibold">抽卡记录</DialogTitle>
                            <DialogDescription class="mt-1 text-xs text-base-content/55">
                                最近 {{ drawHistory.length }} 条记录（最多保留 500 条）
                            </DialogDescription>
                        </div>
                        <button
                            type="button"
                            class="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xs border border-error/40 bg-error/10 px-3 text-xs font-semibold text-error transition-colors hover:bg-error/20"
                            @click="clearAllRecords"
                        >
                            <Icon icon="ri:delete-bin-line" class="size-4" />
                            清空记录
                        </button>
                    </div>

                    <!-- 统计面板 -->
                    <div class="grid shrink-0 grid-cols-3 gap-2 px-5 pt-4 sm:grid-cols-6">
                        <div class="rounded-xs border border-base-content/10 bg-base-200/50 px-2 py-2 text-center">
                            <div class="text-lg font-bold tabular-nums">{{ historyStats.total }}</div>
                            <div class="text-[10px] text-base-content/55">总抽数</div>
                        </div>
                        <div class="rounded-xs border border-amber-500/25 bg-amber-500/8 px-2 py-2 text-center">
                            <div class="text-lg font-bold text-amber-500 tabular-nums dark:text-amber-300">{{ historyStats.gold }}</div>
                            <div class="text-[10px] text-base-content/55">金色 · {{ historyStats.goldPct }}</div>
                        </div>
                        <div class="rounded-xs border border-violet-500/25 bg-violet-500/8 px-2 py-2 text-center">
                            <div class="text-lg font-bold text-violet-500 tabular-nums dark:text-violet-300">{{ historyStats.purple }}</div>
                            <div class="text-[10px] text-base-content/55">紫色 · {{ historyStats.purplePct }}</div>
                        </div>
                        <div class="rounded-xs border border-sky-500/25 bg-sky-500/8 px-2 py-2 text-center">
                            <div class="text-lg font-bold text-sky-500 tabular-nums dark:text-sky-300">{{ historyStats.blue }}</div>
                            <div class="text-[10px] text-base-content/55">蓝色 · {{ historyStats.bluePct }}</div>
                        </div>
                        <div class="rounded-xs border border-base-content/10 bg-base-200/50 px-2 py-2 text-center">
                            <div class="text-lg font-bold tabular-nums">{{ historyStats.avgGold }}</div>
                            <div class="text-[10px] text-base-content/55">平均每金</div>
                        </div>
                        <div class="rounded-xs border border-base-content/10 bg-base-200/50 px-2 py-2 text-center">
                            <div class="text-lg font-bold text-primary tabular-nums">¥{{ historyStats.spentCny }}</div>
                            <div class="text-[10px] text-base-content/55">充值花费</div>
                        </div>
                    </div>

                    <!-- 具体记录列表 -->
                    <div class="min-h-0 flex-1 overflow-y-auto p-5">
                        <div v-if="drawHistory.length === 0" class="py-12 text-center text-sm text-base-content/45">暂无抽卡记录</div>
                        <div v-else class="space-y-1">
                            <div
                                v-for="(entry, index) in drawHistory"
                                :key="`${entry.time}-${index}`"
                                class="flex items-center gap-2.5 rounded-xs border border-base-content/10 bg-base-200/40 px-3 py-1.5"
                            >
                                <span class="w-24 shrink-0 text-[11px] text-base-content/50 tabular-nums">{{
                                    formatHistoryTime(entry.time)
                                }}</span>
                                <span
                                    class="hidden w-28 shrink-0 truncate text-[11px] text-base-content/60 sm:block"
                                    :title="entry.gachaName"
                                    >{{ entry.gachaName }}</span
                                >
                                <span class="w-12 shrink-0 text-center text-xs font-bold" :class="getStarTextClass(entry.star)">{{
                                    "★".repeat(entry.star)
                                }}</span>
                                <img :src="entry.icon" :alt="entry.itemName" loading="lazy" class="size-6 shrink-0 object-contain" />
                                <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ entry.itemName }}</span>
                                <span v-if="entry.count > 1" class="shrink-0 text-[11px] text-base-content/60 tabular-nums"
                                    >×{{ entry.count }}</span
                                >
                            </div>
                        </div>
                    </div>

                    <DialogClose class="btn btn-square btn-sm btn-ghost absolute top-2.5 right-2.5 text-lg" aria-label="close">
                        <Icon icon="radix-icons:cross2" />
                    </DialogClose>
                </DialogContent>
            </DialogPortal>
        </DialogRoot>

        <!-- 商城弹窗（模拟充值） -->
        <DialogRoot v-model:open="showShop">
            <DialogPortal>
                <DialogOverlay class="fixed inset-0 z-30 bg-gray-900/50 data-[state=open]:animate-overlayShow" />
                <DialogContent
                    class="fixed top-1/2 left-1/2 z-100 flex max-h-[85vh] w-[94vw] max-w-4xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg bg-base-100 shadow-lg data-[state=open]:animate-contentShow"
                >
                    <div class="shrink-0 border-b border-base-content/10 p-5 pb-3">
                        <div class="flex items-center justify-between gap-3 pr-8">
                            <div>
                                <DialogTitle class="text-lg font-semibold">商城</DialogTitle>
                                <DialogDescription class="mt-1 text-xs text-base-content/55">
                                    模拟充值：CNY 充值仅记录累计花费，不发起真实支付
                                </DialogDescription>
                            </div>
                            <div class="flex items-center gap-3 text-sm">
                                <span class="flex items-center gap-1.5">
                                    <img src="/imgs/res/T_Coin_Main_Lv1.webp" alt="月石晶胚" class="size-5 object-contain" />
                                    <b class="tabular-nums">{{ getResourceCount(RES_MOON_STONE) }}</b>
                                </span>
                                <span class="text-xs text-base-content/55">
                                    累计花费 <b class="tabular-nums text-primary">¥{{ totalSpentCny }}</b>
                                </span>
                            </div>
                        </div>
                        <AniTabs
                            v-model="shopTabId"
                            class="mt-3"
                            :tabs="filteredShopMainTabs.map(tab => ({ label: tab.name, value: tab.id }))"
                        />
                    </div>

                    <div class="min-h-0 flex-1 overflow-y-auto p-5">
                        <template v-for="mainTab in filteredShopMainTabs" :key="mainTab.id">
                            <div v-if="mainTab.id === shopTabId" class="space-y-5">
                                <section v-for="subTab in mainTab.subTabs" :key="subTab.id">
                                    <h3 class="mb-2 flex items-center gap-2 text-sm font-bold">
                                        <span class="h-3 w-1 bg-primary" aria-hidden="true" />
                                        {{ subTab.name }}
                                    </h3>
                                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                        <div
                                            v-for="item in subTab.items"
                                            :key="item.id"
                                            class="flex flex-col rounded-xs border border-base-content/12 bg-base-200/50 p-2.5 transition-colors hover:border-primary/40"
                                        >
                                            <div class="flex items-start gap-2">
                                                <img
                                                    :src="getShopItemIcon(item)"
                                                    :alt="item.typeName"
                                                    loading="lazy"
                                                    class="size-11 shrink-0 rounded-xs object-contain"
                                                />
                                                <div class="min-w-0 flex-1">
                                                    <div class="truncate text-xs font-bold" :title="item.typeName">{{ item.typeName }}</div>
                                                    <div class="mt-0.5 text-[10px] text-base-content/50">
                                                        <template v-if="item.num > 1">×{{ item.num }}</template>
                                                        <template v-if="getShopItemRemain(item) !== null">
                                                            · 剩 {{ getShopItemRemain(item) }}</template
                                                        >
                                                    </div>
                                                </div>
                                            </div>
                                            <!-- 礼箱内含的抽卡道具（含几个、哪种） -->
                                            <div v-if="getGachaItemsInPack(item).length" class="mt-1.5 flex flex-wrap items-center gap-1">
                                                <span
                                                    v-for="gi in getGachaItemsInPack(item)"
                                                    :key="gi.id"
                                                    class="inline-flex items-center gap-1 rounded-xs bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                                                    :title="`${gi.name} ×${gi.count}`"
                                                >
                                                    <img :src="gi.icon" alt="" class="size-3.5 object-contain" />
                                                    {{ gi.name }} ×{{ gi.count }}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                class="mt-2 flex h-8 cursor-pointer items-center justify-center gap-1 rounded-xs text-xs font-bold transition-all active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
                                                :class="
                                                    item.pay?.CNY
                                                        ? 'bg-amber-500 text-white hover:bg-amber-500/90'
                                                        : 'bg-primary text-primary-content hover:bg-primary/90'
                                                "
                                                :disabled="getShopItemRemain(item) === 0"
                                                :title="item.priceType === RES_MOON ? '月石不足时自动按 1:1 消耗月石晶胚' : undefined"
                                                @click="buyShopItem(item)"
                                            >
                                                <Icon v-if="item.pay?.CNY" icon="ri:bank-card-line" class="size-3.5" />
                                                {{ getShopItemRemain(item) === 0 ? "已售罄" : getShopPriceText(item) }}
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </template>
                    </div>

                    <DialogClose class="btn btn-square btn-sm btn-ghost absolute top-2.5 right-2.5 text-lg" aria-label="close">
                        <Icon icon="radix-icons:cross2" />
                    </DialogClose>
                </DialogContent>
            </DialogPortal>
        </DialogRoot>
    </div>
</template>

<style scoped>
/* 背景切换淡入淡出 */
.gacha-bg-enter-active,
.gacha-bg-leave-active {
    transition: opacity 0.45s ease;
}
.gacha-bg-enter-from,
.gacha-bg-leave-to {
    opacity: 0;
}

/* 抽卡入场动画：光晕扩散 */
@keyframes gacha-flash-in {
    0% {
        opacity: 0;
        transform: scale(0.6);
    }
    35% {
        opacity: 1;
        transform: scale(1.05);
    }
    100% {
        opacity: 0.9;
        transform: scale(1.25);
    }
}
.gacha-flash {
    animation: gacha-flash-in 1.4s ease-out both;
}

/* 抽卡入场动画：横向光束扫过 */
@keyframes gacha-beam-sweep {
    0% {
        opacity: 0;
        transform: scaleX(0);
    }
    30% {
        opacity: 1;
    }
    100% {
        opacity: 0;
        transform: scaleX(1);
    }
}
.gacha-beam {
    animation: gacha-beam-sweep 1.2s ease-out both;
    box-shadow: 0 0 24px 4px rgba(255, 255, 255, 0.55);
}

/* 奖励卡片：从半透明模糊态依次往上弹入 */
@keyframes reward-rise {
    0% {
        opacity: 0;
        transform: translateY(48px) scale(0.92);
        filter: blur(10px);
    }
    60% {
        filter: blur(2px);
    }
    100% {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
    }
}
.reward-card {
    animation: reward-rise 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
    animation-delay: calc(var(--i) * 90ms);
}
@media (prefers-reduced-motion: reduce) {
    .reward-card,
    .gacha-flash,
    .gacha-beam {
        animation: none;
    }
}
</style>
