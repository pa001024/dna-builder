import { computed, type Ref, readonly, ref, watch } from "vue"
import type { TranscendGearItemConfig } from "@/data"
import { gearItemKey } from "@/utils/transcend-gear/gain"
import { createAffixIncomeCandidates, type GearAffixIncomeSource, requestAffixIncomes, withGearItem } from "@/utils/transcend-gear/income"

/**
 * 预览卡片逐词条收益：按住 Shift 且预览卡挂载时按需请求，
 * 按「上下文键 + 构筑位 + 槽位 + 物品」缓存；松开 Shift / 关闭预览不丢缓存，再次按住直接复用。
 * 无构筑上下文（纯库存 / DB）不请求、不显示。
 */

/** 缓存上限（每项是一整件装备的逐词条收益表） */
const CACHE_LIMIT = 128
const resultCache = new Map<string, Record<string, number | null>>()
const pendingRequests = new Map<string, Promise<Record<string, number | null> | null>>()

/**
 * 写入缓存（插入序 LRU，超出上限淘汰最早项）。
 * @param key 缓存键
 * @param value 收益表
 */
function writeCache(key: string, value: Record<string, number | null>) {
    resultCache.delete(key)
    resultCache.set(key, value)
    if (resultCache.size > CACHE_LIMIT) {
        const oldest = resultCache.keys().next().value
        if (oldest !== undefined) resultCache.delete(oldest)
    }
}

/**
 * 取某物品的逐词条收益：命中缓存直接返回，未命中合并同一键的在飞请求。
 * @param key 缓存键
 * @param source 收益上下文
 * @param item 预览物品
 * @param slotId 装备位
 * @returns 收益表；请求失败为 null（下次按 Shift 重试）
 */
function loadAffixIncomes(
    key: string,
    source: GearAffixIncomeSource,
    item: TranscendGearItemConfig,
    slotId: number
): Promise<Record<string, number | null> | null> {
    const cached = resultCache.get(key)
    if (cached) return Promise.resolve(cached)
    const existing = pendingRequests.get(key)
    if (existing) return existing
    const request = requestAffixIncomes({
        side: source.side,
        baselineGear: withGearItem(source.gear, slotId, item),
        slotId,
        // 角色门控（专属词条 charIds）与构筑位角色同口径；无角色上下文时不做门控判定
        candidates: createAffixIncomeCandidates(item, { charId: source.charId }),
        gainContext: source.gainContext,
    })
        .then(result => {
            // 无启用侧时回退装备者自身侧的结果不冒充团队合计：界面隐藏（配置恢复后由上下文键重新取数）
            const incomes = result.target === "owner" ? {} : result.incomes
            writeCache(key, incomes)
            return incomes
        })
        .catch(() => null)
        .finally(() => pendingRequests.delete(key))
    pendingRequests.set(key, request)

    return request
}

/** 逐词条收益的取数选项 */
export interface GearAffixIncomesOptions {
    /** 收益上下文（宿主具备完整构筑时传入） */
    source: () => GearAffixIncomeSource | null | undefined
    /** 预览物品 */
    item: () => TranscendGearItemConfig | null | undefined
    /** 预览物品所在装备位 */
    slotId: () => number
    /** 是否处于 Shift 详情态 */
    enabled: () => boolean
}

/**
 * 订阅预览卡逐词条收益（Shift 详情态）。
 * @param options 上下文 / 物品 / 装备位 / 启用状态
 * @returns 词条行 key → 相对收益比例
 */
export function useGearAffixIncomes(options: GearAffixIncomesOptions): Readonly<Ref<Record<string, number | null>>> {
    const incomes = ref<Record<string, number | null>>({})
    const cacheKey = computed(() => {
        if (!options.enabled()) return null
        const source = options.source()
        const item = options.item()
        if (!source || !item) return null
        // 口径（团队合计 / 旧单侧）+ owner side + 构筑位角色 id 共同参与缓存键：换口径 / 换侧 / 换角色必须重新取数
        return [
            source.gainContext.buildTeamSnapshots ? "team-total:v1" : "single-side:v0",
            source.key,
            source.side,
            options.slotId(),
            gearItemKey(item),
            source.charId ?? 0,
        ].join("\u0000")
    })

    watch(
        cacheKey,
        async key => {
            if (!key) {
                incomes.value = {}
                return
            }
            const source = options.source()
            const item = options.item()
            if (!source || !item) return
            const result = await loadAffixIncomes(key, source, item, options.slotId())
            // 请求期间切换物品 / 松开 Shift：旧结果不得回填
            if (cacheKey.value === key) incomes.value = result ?? {}
        },
        { immediate: true }
    )

    return readonly(incomes)
}
