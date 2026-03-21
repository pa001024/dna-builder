<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import {
    equipShopAssetMutation,
    myShopSummaryQuery,
    redeemShopProductMutation,
    type ShopProduct,
    shopProductsQuery,
    type UserShopSummary,
} from "@/api/graphql"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"

type ShopTab = "all" | "title" | "name_card"

const ui = useUIStore()
const user = useUserStore()

const tab = ref<ShopTab>("all")
const loadingProducts = ref(false)
const loadingSummary = ref(false)
const actionProductId = ref<string | null>(null)
const NAME_EFFECT_STYLESHEET_ID = "dna-points-mall-name-effects"

const products = ref<ShopProduct[]>([])
const summary = ref<UserShopSummary | null>(null)

/**
 * 判断商品是否为称号类型。
 * @param product 商品
 */
function isTitleProduct(product: ShopProduct): boolean {
    return product.rewardType === "title"
}

/**
 * 判断商品是否为名字特效类型。
 * @param product 商品
 */
function isNameCardProduct(product: ShopProduct): boolean {
    return product.rewardType === "name_card"
}

/**
 * 将商品类型映射为更易读的中文标签。
 * @param product 商品
 */
function getRewardTypeLabel(product: ShopProduct): string {
    if (isTitleProduct(product)) return "称号"
    if (isNameCardProduct(product)) return "名字特效"
    return product.rewardType || "其他"
}

/**
 * 保障积分商城页加载名字特效样式表，前端仅消费类名。
 */
function ensureNameEffectStylesheet() {
    if (typeof document === "undefined") return
    const href = `${env.apiEndpoint.replace(/\/$/, "")}/api/chat/name-effects.css`
    const existed = document.getElementById(NAME_EFFECT_STYLESHEET_ID) as HTMLLinkElement | null
    if (existed) {
        existed.href = href
        return
    }
    const link = document.createElement("link")
    link.id = NAME_EFFECT_STYLESHEET_ID
    link.rel = "stylesheet"
    link.href = href
    document.head.appendChild(link)
}

/**
 * 将积分数字格式化为更易读的展示形式。
 * @param points 积分数值
 */
function formatPoints(points: number): string {
    return new Intl.NumberFormat("zh-CN").format(points)
}

/**
 * @description 返回积分商城预览使用的用户等级。
 * @returns 当前用户等级，未登录时回退为 1。
 */
function getPreviewUserLevel(): number {
    return user.level || 1
}

/**
 * @description 解析商城商品时间文本，兼容 `datetime-local` 与 ISO 文本。
 * @param value 原始时间文本。
 * @returns 时间戳；为空返回 `null`，格式非法返回 `Number.NaN`。
 */
function parseProductTime(value?: string): number | null {
    const text = String(value ?? "").trim()
    if (!text) return null
    const normalized = text.replace(" ", "T")
    const timestamp = new Date(normalized).getTime()
    return Number.isNaN(timestamp) ? Number.NaN : timestamp
}

/**
 * @description 判断商品当前是否仍在前台可展示时间窗中。
 * 未开始的商品可展示，已结束的商品隐藏。
 * @param product 商城商品。
 * @returns 是否可展示。
 */
function isProductAvailable(product: ShopProduct): boolean {
    const now = Date.now()
    const startTime = parseProductTime(product.startTime)
    const endTime = parseProductTime(product.endTime)

    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
        return false
    }
    if (endTime !== null && now > endTime) {
        return false
    }
    return true
}

/**
 * @description 判断商品当前是否允许兑换。
 * @param product 商城商品。
 * @returns 是否可购买。
 */
function isProductPurchasable(product: ShopProduct): boolean {
    const now = Date.now()
    const startTime = parseProductTime(product.startTime)
    const endTime = parseProductTime(product.endTime)

    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
        return false
    }
    if (startTime !== null && now < startTime) {
        return false
    }
    if (endTime !== null && now > endTime) {
        return false
    }
    return true
}

/**
 * @description 将商品投放时间格式化为用户可读文本。
 * @param product 商城商品。
 * @returns 时间范围文本。
 */
function formatProductAvailability(product: ShopProduct): string {
    if (!product.startTime && !product.endTime) {
        return "长期上架"
    }
    return `${product.startTime || "即时生效"} ~ ${product.endTime || "长期有效"}`
}

const pointsBalance = computed(() => summary.value?.points ?? null)
const ownedIdSet = computed(() => new Set(summary.value?.ownedAssetIds ?? []))

const equippedTitleId = computed(() => summary.value?.selectedTitleAssetId || "")
const equippedNameCardId = computed(() => summary.value?.selectedNameCardAssetId || "")

const selectedTitle = computed(() => summary.value?.selectedTitleAsset ?? null)
const selectedNameCard = computed(() => summary.value?.selectedNameCardAsset ?? null)

const filteredProducts = computed(() => {
    const list = products.value
        .filter(p => ownedIdSet.value.has(p.assetId) || isProductAvailable(p))
        .filter(p => {
            if (tab.value === "all") return true
            return p.rewardType === tab.value
        })
        .slice()

    // 使用后台配置的 sortOrder 做稳定排序，便于运营调整展示顺序
    list.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        if (a.pointsCost !== b.pointsCost) return a.pointsCost - b.pointsCost
        return a.name.localeCompare(b.name)
    })

    return list
})

/**
 * 拉取商品列表。该列表通常可匿名访问，但也可能根据后端策略需要鉴权。
 */
async function fetchProducts(): Promise<void> {
    loadingProducts.value = true
    try {
        const result = await shopProductsQuery({ limit: 200, offset: 0 }, { requestPolicy: "network-only" })
        products.value = result ?? []
    } catch (error) {
        console.error("拉取积分商城商品失败:", error)
        ui.showErrorMessage("拉取商品失败，请稍后重试")
        products.value = []
    } finally {
        loadingProducts.value = false
    }
}

/**
 * 拉取当前用户的积分/装扮摘要。仅在已登录时调用，避免匿名请求报错污染控制台。
 */
async function fetchSummary(): Promise<void> {
    if (!user.jwtToken) {
        summary.value = null
        return
    }

    loadingSummary.value = true
    try {
        const result = await myShopSummaryQuery(undefined, { requestPolicy: "network-only" })
        summary.value = result ?? null
    } catch (error) {
        console.error("拉取积分商城摘要失败:", error)
        ui.showErrorMessage("拉取积分信息失败，请稍后重试")
        summary.value = null
    } finally {
        loadingSummary.value = false
    }
}

/**
 * 兑换指定商品（会扣除积分并加入已拥有列表）。
 * @param product 商品
 */
async function redeemProduct(product: ShopProduct): Promise<void> {
    if (!user.jwtToken) {
        ui.showErrorMessage("请先登录 DNA Builder 账号")
        return
    }
    if (!summary.value) {
        ui.showErrorMessage("当前无法获取积分信息，请稍后重试")
        return
    }
    if (!isProductPurchasable(product)) {
        ui.showErrorMessage("该商品当前不在可兑换时间范围内")
        return
    }

    const ok = await ui.showDialog("确认兑换", `确定花费 ${formatPoints(product.pointsCost)} 积分兑换「${product.name}」吗？`)
    if (!ok) return

    actionProductId.value = product.id
    try {
        const result = await redeemShopProductMutation({ productId: product.id })
        if (result?.success) {
            ui.showSuccessMessage(result.message || "兑换成功")
            await fetchSummary()
        } else {
            ui.showErrorMessage(result?.message || "兑换失败")
        }
    } catch (error) {
        console.error("兑换商品失败:", error)
        ui.showErrorMessage("兑换失败，请稍后重试")
    } finally {
        actionProductId.value = null
    }
}

/**
 * 装备已拥有的称号/名字特效。
 * @param product 商品
 */
async function equipProduct(product: ShopProduct): Promise<void> {
    if (!user.jwtToken) {
        ui.showErrorMessage("请先登录 DNA Builder 账号")
        return
    }
    if (!ownedIdSet.value.has(product.assetId)) {
        ui.showErrorMessage("请先兑换该商品")
        return
    }

    actionProductId.value = product.id
    try {
        const result = await equipShopAssetMutation({ assetId: product.assetId })
        if (result?.success) {
            ui.showSuccessMessage(result.message || "已应用装扮")
            await fetchSummary()
        } else {
            ui.showErrorMessage(result?.message || "应用装扮失败")
        }
    } catch (error) {
        console.error("应用装扮失败:", error)
        ui.showErrorMessage("应用装扮失败，请稍后重试")
    } finally {
        actionProductId.value = null
    }
}

/**
 * 刷新页面核心数据：商品列表 +（已登录时）积分摘要。
 */
async function refreshAll(): Promise<void> {
    await fetchProducts()
    await fetchSummary()
}

onMounted(() => {
    ensureNameEffectStylesheet()
    fetchProducts()
    fetchSummary()
})

watch(
    () => user.jwtToken,
    () => {
        fetchSummary()
    }
)
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="bg-base-300/50 backdrop-blur-sm p-4 border-b border-base-200">
            <div class="flex items-center gap-2">
                <div class="text-lg font-bold">积分商城</div>
                <div class="ml-auto flex items-center gap-2">
                    <button class="btn btn-outline btn-sm" :disabled="loadingProducts || loadingSummary" @click="refreshAll">
                        <Icon icon="ri:refresh-line" class="w-4 h-4" />
                        刷新
                    </button>
                    <RouterLink to="/setting" class="btn btn-primary btn-sm">
                        <Icon icon="ri:settings-3-line" class="w-4 h-4" />
                        账号设置
                    </RouterLink>
                </div>
            </div>
        </div>

        <ScrollArea class="flex-1">
            <div class="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <!-- 左侧：积分与装扮 -->
                <div class="lg:col-span-1 space-y-4">
                    <div class="card bg-base-100 shadow-lg">
                        <div class="card-body p-4">
                            <div class="flex items-start justify-between">
                                <div>
                                    <div class="text-sm text-base-content/60">积分余额</div>
                                    <div class="text-3xl font-extrabold leading-tight">
                                        <span v-if="loadingSummary" class="loading loading-spinner loading-sm" />
                                        <span v-else>{{ pointsBalance === null ? "--" : formatPoints(pointsBalance) }}</span>
                                    </div>
                                </div>
                                <div class="badge badge-primary badge-outline">POINTS</div>
                            </div>
                            <div class="text-xs text-base-content/50 mt-2">
                                <span v-if="!user.jwtToken">登录后可查看积分并兑换装扮。</span>
                                <span v-else>积分用于兑换称号、名字特效等装扮。</span>
                            </div>
                        </div>
                    </div>

                    <div class="card bg-base-100 shadow-lg">
                        <div class="card-body p-4">
                            <div class="flex items-center justify-between">
                                <div class="text-sm font-bold">当前装扮</div>
                                <div class="text-xs text-base-content/50">预览以当前选择为准</div>
                            </div>

                            <div class="mt-3 rounded-xl bg-base-200/50 p-4">
                                <div class="flex items-start gap-2">
                                    <QQAvatar class="mt-2 size-8" :qq="user.qq || ''" :name="user.name || '用户'" />
                                    <div class="min-w-0 flex-1">
                                        <div class="flex min-h-5 w-full items-center gap-1.5 text-sm text-base-content/80">
                                            <span
                                                class="rounded-full bg-base-300/80 px-1.5 py-0.5 text-[10px] leading-none text-base-content/70"
                                            >
                                                LV{{ getPreviewUserLevel() }}
                                            </span>
                                            <span class="truncate" :class="selectedNameCard?.displayClass || ''">
                                                {{ user.name || "用户" }}
                                            </span>
                                            <span v-if="selectedTitle?.rewardName" :class="selectedTitle?.displayClass || ''">
                                                {{ selectedTitle.rewardName }}
                                            </span>
                                        </div>
                                        <div
                                            class="safe-html mt-1 inline-flex max-w-80 select-text flex-col gap-2 rounded-lg bg-base-100 p-2 text-sm text-base-content"
                                        >
                                            气泡预览
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-3 text-xs opacity-90">名字特效：{{ selectedNameCard?.rewardName || "默认" }}</div>
                            </div>

                            <div class="mt-3 text-xs text-base-content/50">你可以在商品列表中兑换并点击“使用”来切换装扮。</div>
                        </div>
                    </div>

                    <div class="card bg-base-100 shadow-lg">
                        <div class="card-body p-4">
                            <div class="text-sm font-bold">说明</div>
                            <div class="text-xs text-base-content/60 mt-2 space-y-1">
                                <div>称号会展示在昵称旁边，用于体现成就或身份。</div>
                                <div>名字特效会影响聊天中昵称的显示特效。</div>
                                <div>兑换与装备都需要登录账号。</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 右侧：商品列表 -->
                <div class="lg:col-span-2 space-y-4">
                    <div class="card bg-base-100 shadow-lg">
                        <div class="card-body p-4">
                            <div class="flex items-center gap-2">
                                <div class="text-sm font-bold">商品列表</div>
                                <div class="ml-auto tabs tabs-boxed">
                                    <a class="tab" :class="{ 'tab-active': tab === 'all' }" @click="tab = 'all'">全部</a>
                                    <a class="tab" :class="{ 'tab-active': tab === 'title' }" @click="tab = 'title'">称号</a>
                                    <a class="tab" :class="{ 'tab-active': tab === 'name_card' }" @click="tab = 'name_card'">名字特效</a>
                                </div>
                            </div>

                            <div v-if="loadingProducts" class="flex justify-center items-center py-10">
                                <span class="loading loading-spinner" />
                            </div>
                            <div v-else-if="filteredProducts.length === 0" class="py-10 text-center text-base-content/50">
                                暂无可兑换商品
                            </div>
                            <div v-else class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div v-for="p in filteredProducts" :key="p.id" class="card bg-base-200/40 border border-base-200">
                                    <div class="card-body p-4">
                                        <div class="flex items-start justify-between gap-3">
                                            <div class="min-w-0">
                                                <div class="font-bold text-base truncate">{{ p.name }}</div>
                                                <div class="mt-1 flex items-center gap-2">
                                                    <span class="badge badge-outline">{{ getRewardTypeLabel(p) }}</span>
                                                    <span v-if="ownedIdSet.has(p.assetId)" class="badge badge-success">已拥有</span>
                                                    <span v-else class="badge badge-ghost">未拥有</span>
                                                </div>
                                            </div>
                                            <div class="text-right">
                                                <div class="text-xs text-base-content/60">价格</div>
                                                <div class="font-extrabold">
                                                    {{ formatPoints(p.pointsCost) }}
                                                    <span class="text-xs font-normal text-base-content/60">积分</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div v-if="p.description" class="text-sm text-base-content/70 mt-3 line-clamp-2">
                                            {{ p.description }}
                                        </div>

                                        <div class="mt-3 text-xs text-base-content/55">投放时间：{{ formatProductAvailability(p) }}</div>

                                        <!-- 预览区 -->
                                        <div class="mt-3">
                                            <div v-if="isTitleProduct(p)" class="rounded-lg bg-base-200/50 p-3">
                                                <div class="text-xs opacity-90 mb-2">预览</div>
                                                <div class="flex items-start gap-2">
                                                    <QQAvatar class="mt-2 size-8" :qq="user.qq || ''" :name="user.name || '用户'" />
                                                    <div class="min-w-0 flex-1">
                                                        <div class="flex min-h-5 w-full items-center gap-1.5 text-sm text-base-content/80">
                                                            <span
                                                                class="rounded-full bg-base-300/80 px-1.5 py-0.5 text-[10px] leading-none text-base-content/70"
                                                            >
                                                                LV{{ getPreviewUserLevel() }}
                                                            </span>
                                                            <span class="truncate" :class="selectedNameCard?.displayClass || ''">
                                                                {{ user.name || "用户" }}
                                                            </span>
                                                            <span :class="p.displayClass || ''">
                                                                {{ p.rewardName || p.name }}
                                                            </span>
                                                        </div>
                                                        <div
                                                            class="safe-html mt-1 inline-flex max-w-80 select-text flex-col gap-2 rounded-lg bg-base-100 p-2 text-sm text-base-content"
                                                        >
                                                            装备后显示称号
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div v-else-if="isNameCardProduct(p)" class="rounded-lg bg-base-200/50 p-3">
                                                <div class="text-xs opacity-90 mb-2">预览</div>
                                                <div class="flex items-start gap-2">
                                                    <QQAvatar class="mt-2 size-8" :qq="user.qq || ''" :name="user.name || '用户'" />
                                                    <div class="min-w-0 flex-1">
                                                        <div class="flex min-h-5 w-full items-center gap-1.5 text-sm text-base-content/80">
                                                            <span
                                                                class="rounded-full bg-base-300/80 px-1.5 py-0.5 text-[10px] leading-none text-base-content/70"
                                                            >
                                                                LV{{ getPreviewUserLevel() }}
                                                            </span>
                                                            <span class="truncate" :class="p.displayClass || ''">{{
                                                                user.name || "用户"
                                                            }}</span>
                                                            <span
                                                                v-if="selectedTitle?.rewardName"
                                                                :class="selectedTitle?.displayClass || ''"
                                                            >
                                                                {{ selectedTitle.rewardName }}
                                                            </span>
                                                        </div>
                                                        <div
                                                            class="safe-html mt-1 inline-flex max-w-80 select-text flex-col gap-2 rounded-lg bg-base-100 p-2 text-sm text-base-content"
                                                        >
                                                            装备后显示昵称特效
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div v-else class="rounded-lg bg-base-100/70 border border-base-200 p-3">
                                                <div class="text-xs text-base-content/60">暂无预览</div>
                                            </div>
                                        </div>

                                        <div class="mt-4 flex items-center gap-2">
                                            <button
                                                v-if="!ownedIdSet.has(p.assetId)"
                                                class="btn btn-primary btn-sm"
                                                :disabled="
                                                    !user.jwtToken ||
                                                    pointsBalance === null ||
                                                    !isProductPurchasable(p) ||
                                                    pointsBalance < p.pointsCost ||
                                                    actionProductId === p.id
                                                "
                                                :title="
                                                    !user.jwtToken
                                                        ? '请先登录'
                                                        : pointsBalance === null
                                                          ? '积分信息未就绪'
                                                          : !isProductPurchasable(p)
                                                            ? '商品尚未开始兑换或已结束'
                                                            : pointsBalance < p.pointsCost
                                                              ? '积分不足'
                                                              : ''
                                                "
                                                @click="redeemProduct(p)"
                                            >
                                                <span v-if="actionProductId === p.id" class="loading loading-spinner loading-xs" />
                                                <span v-else>兑换</span>
                                            </button>

                                            <button
                                                v-else
                                                class="btn btn-outline btn-sm"
                                                :disabled="
                                                    actionProductId === p.id ||
                                                    (isTitleProduct(p) && p.assetId === equippedTitleId) ||
                                                    (isNameCardProduct(p) && p.assetId === equippedNameCardId)
                                                "
                                                @click="equipProduct(p)"
                                            >
                                                <span v-if="actionProductId === p.id" class="loading loading-spinner loading-xs" />
                                                <span v-else>
                                                    <span v-if="isTitleProduct(p) && p.assetId === equippedTitleId">已使用</span>
                                                    <span v-else-if="isNameCardProduct(p) && p.assetId === equippedNameCardId">已使用</span>
                                                    <span v-else>使用</span>
                                                </span>
                                            </button>

                                            <div class="ml-auto text-xs text-base-content/50">
                                                <span v-if="isTitleProduct(p)">称号</span>
                                                <span v-else-if="isNameCardProduct(p)">名片</span>
                                                <span v-else>其他</span>
                                                · ID: {{ p.id }}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ScrollArea>
    </div>
</template>
