/**
 * 商店检索：跨商店 / 主标签 / 子标签 / 商品字段的关键词匹配与高亮摘要。
 *
 * 列表页与详情页共用同一口径：命中判断同时看原文与当前语言译文（游戏原文即翻译键），
 * 纯字母查询再兜底拼音；高亮只对「关键词是原文/译文的子串」生效，拼音命中不标字符。
 */

import type { Shop, ShopItem } from "@/data/d/shop.data"
import { getRewardTypeText } from "@/data/enum-text"
import { buildKeywordSnippet, buildPlainSnippet, type HighlightSnippet } from "@/utils/keyword-highlight"
import { matchPinyin } from "@/utils/pinyin-utils"

/** 商品命中字段：由调用方映射成展示文案 */
export type ShopItemMatchField = "name" | "type" | "price" | "cond" | "id"

/** 命中字段 → 展示文案 i18n key */
export const SHOP_MATCH_FIELD_LABEL_KEYS: Record<ShopItemMatchField, string> = {
    name: "db-shop-list.field_name",
    type: "common.type",
    price: "common.price",
    cond: "db-shop-list.field_cond",
    id: "shop-item.item_id",
}

/** 商品命中信息 */
export interface ShopItemSearchHit {
    itemId: number
    /** 商品名称（游戏原文） */
    itemName: string
    /** 所属主标签名 */
    mainTabName: string
    /** 所属子标签名 */
    subTabName: string
    /** 命中的字段 */
    field: ShopItemMatchField
    /** 命中字段的展示文本（已截断高亮） */
    snippet: HighlightSnippet
}

/** 单个商店的检索结果 */
export interface ShopSearchResult {
    shop: Shop
    /** 商店自身（名称 / ID）是否命中 */
    shopMatched: boolean
    /** 主标签 / 子标签名命中的摘要 */
    tabSnippets: HighlightSnippet[]
    /** 命中商品，键为商品 ID */
    itemHits: Map<number, ShopItemSearchHit>
}

/** 商品可检索字段（仅名称参与拼音匹配，其余字段只做子串匹配） */
interface ShopItemSearchField {
    field: ShopItemMatchField
    text: string
    enablePinyin: boolean
}

/**
 * 判断文本是否命中关键词：原文/译文子串优先，纯字母查询再兜底拼音。
 * @param text 游戏原文
 * @param keyword 已小写化的关键词
 * @param translate 游戏原文翻译函数
 * @param enablePinyin 是否允许拼音匹配
 * @returns 是否命中
 */
function isShopTextMatched(text: string, keyword: string, translate: (text: string) => string, enablePinyin: boolean): boolean {
    if (!text) {
        return false
    }

    if (text.toLowerCase().includes(keyword)) {
        return true
    }

    const translated = translate(text)
    if (translated?.toLowerCase().includes(keyword)) {
        return true
    }

    if (!enablePinyin) {
        return false
    }

    return matchPinyin(text, keyword).match || (translated !== "" && matchPinyin(translated, keyword).match)
}

/**
 * 为一条命中文本生成摘要：优先在译文上高亮，译文未命中时回落到原文。
 * @param text 游戏原文
 * @param keyword 已小写化的关键词
 * @param translate 游戏原文翻译函数
 * @param enablePinyin 是否允许拼音匹配
 * @returns 命中摘要；未命中时返回 null
 */
function buildTextSnippet(
    text: string,
    keyword: string,
    translate: (text: string) => string,
    enablePinyin = true
): HighlightSnippet | null {
    if (!isShopTextMatched(text, keyword, translate, enablePinyin)) {
        return null
    }

    const translated = translate(text)
    const snippet = buildKeywordSnippet(translated, keyword) ?? buildKeywordSnippet(text, keyword)
    if (snippet) {
        return snippet
    }

    return buildPlainSnippet(translated || text)
}

/**
 * 收集商品可检索字段。
 * @param item 商品
 * @returns 字段列表
 */
function collectShopItemFields(item: ShopItem): ShopItemSearchField[] {
    const fields: ShopItemSearchField[] = [
        { field: "name", text: item.typeName, enablePinyin: true },
        { field: "type", text: getRewardTypeText(item.itemType), enablePinyin: true },
        { field: "price", text: item.priceName, enablePinyin: false },
        { field: "id", text: `${item.id}`, enablePinyin: false },
        { field: "id", text: `${item.typeId}`, enablePinyin: false },
    ]
    if (item.cond) {
        fields.push({ field: "cond", text: item.cond, enablePinyin: false })
    }
    return fields
}

/**
 * 匹配单个商品的全部字段，命中第一个即返回。
 * @param item 商品
 * @param keyword 已小写化的关键词
 * @param translate 游戏原文翻译函数
 * @param mainTabName 所属主标签名
 * @param subTabName 所属子标签名
 * @returns 命中信息；未命中时返回 null
 */
function matchShopItem(
    item: ShopItem,
    keyword: string,
    translate: (text: string) => string,
    mainTabName: string,
    subTabName: string
): ShopItemSearchHit | null {
    for (const { field, text, enablePinyin } of collectShopItemFields(item)) {
        const snippet = buildTextSnippet(text, keyword, translate, enablePinyin)
        if (snippet) {
            return { itemId: item.id, itemName: item.typeName, mainTabName, subTabName, field, snippet }
        }
    }
    return null
}

/**
 * 按关键词检索商店：命中商店自身文本或任意商品字段即算命中。
 * @param shops 商店数据
 * @param rawKeyword 关键词
 * @param translate 游戏原文翻译函数（保证语言切换后结果可重算）
 * @returns 命中商店的检索结果；关键词为空时返回空数组
 */
export function searchShopData(shops: readonly Shop[], rawKeyword: string, translate: (text: string) => string): ShopSearchResult[] {
    const keyword = rawKeyword.trim().toLowerCase()
    if (!keyword) {
        return []
    }

    const results: ShopSearchResult[] = []
    for (const shop of shops) {
        const shopMatched = Boolean(buildTextSnippet(shop.name, keyword, translate) ?? buildTextSnippet(shop.id, keyword, translate))

        const tabSnippets: HighlightSnippet[] = []
        const itemHits = new Map<number, ShopItemSearchHit>()
        for (const mainTab of shop.mainTabs) {
            const mainTabSnippet = buildTextSnippet(mainTab.name, keyword, translate)
            if (mainTabSnippet) {
                tabSnippets.push(mainTabSnippet)
            }

            for (const subTab of mainTab.subTabs) {
                const subTabSnippet = buildTextSnippet(subTab.name, keyword, translate, false)
                if (subTabSnippet) {
                    tabSnippets.push(subTabSnippet)
                }

                for (const item of subTab.items) {
                    if (itemHits.has(item.id)) {
                        continue
                    }
                    const hit = matchShopItem(item, keyword, translate, mainTab.name, subTab.name)
                    if (hit) {
                        itemHits.set(item.id, hit)
                    }
                }
            }
        }

        if (shopMatched || tabSnippets.length || itemHits.size) {
            results.push({ shop, shopMatched, tabSnippets, itemHits })
        }
    }

    return results
}
