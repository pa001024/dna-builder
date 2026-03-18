import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, inArray } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"

const SHOP_REWARD_TYPES = {
    TITLE: "title",
    NAME_CARD: "name_card",
} as const

type ShopRewardType = (typeof SHOP_REWARD_TYPES)[keyof typeof SHOP_REWARD_TYPES]

export const typeDefs = /* GraphQL */ `
    type Query {
        shopProducts(limit: Int, offset: Int, search: String, rewardType: String, activeOnly: Boolean): [ShopProduct!]!
        shopProductsCount(search: String, rewardType: String, activeOnly: Boolean): Int!
        myShopItems: [UserShopItem!]!
        myShopSummary: UserShopSummary!
        adminShopRedemptions(limit: Int, offset: Int, search: String): [ShopRedemption!]!
        adminShopRedemptionsCount(search: String): Int!
    }

    type Mutation {
        redeemShopProduct(productId: String!): ShopRedeemResult!
        equipShopAsset(assetId: String!): ShopEquipResult!
        adminGrantShopProduct(userId: String!, productId: String!): ShopRedeemResult!
        adminRevokeShopProduct(userId: String!, productId: String!): ShopRedeemResult!
        createShopProduct(data: ShopProductInput!): ShopProduct!
        updateShopProduct(id: String!, data: ShopProductInput!): ShopProduct!
        deleteShopProduct(id: String!): Boolean!
    }

    type ShopAsset {
        id: String!
        rewardType: String!
        rewardKey: String!
        rewardName: String!
        displayClass: String
        displayCss: String
        createdAt: String
        updateAt: String
    }

    type ShopProduct {
        id: String!
        name: String!
        description: String
        assetId: String!
        rewardType: String!
        rewardKey: String!
        rewardName: String!
        displayClass: String
        displayCss: String
        pointsCost: Int!
        sortOrder: Int!
        isActive: Boolean!
        startTime: String
        endTime: String
        createdAt: String
        updateAt: String
        asset: ShopAsset!
    }

    type UserShopItem {
        id: String!
        userId: String!
        assetId: String!
        createdAt: String
        asset: ShopAsset!
    }

    type UserShopSummary {
        points: Int!
        selectedTitleAssetId: String
        selectedNameCardAssetId: String
        selectedTitleAsset: ShopAsset
        selectedNameCardAsset: ShopAsset
        ownedAssetIds: [String!]!
    }

    type ShopRedemption {
        id: String!
        userId: String!
        productId: String!
        assetId: String!
        pointsCost: Int!
        createdAt: String
        user: User
        product: ShopProduct
        asset: ShopAsset
    }

    type ShopRedeemResult {
        success: Boolean!
        message: String!
        awardedAsset: ShopAsset
        user: User
    }

    type ShopEquipResult {
        success: Boolean!
        message: String!
        user: User
        selectedTitleAsset: ShopAsset
        selectedNameCardAsset: ShopAsset
    }

    input ShopProductInput {
        name: String!
        description: String
        rewardType: String!
        pointsCost: Int!
        rewardKey: String!
        rewardName: String!
        displayClass: String
        displayCss: String
        sortOrder: Int!
        isActive: Boolean!
        startTime: String
        endTime: String
    }
`

type ShopProductRow = typeof schema.shopProducts.$inferSelect & {
    asset: typeof schema.shopAssets.$inferSelect
}

/**
 * @description 需要管理员权限时的统一断言。
 * @param context GraphQL 上下文。
 * @throws GraphQLError 当用户不是管理员时抛出。
 */
function requireAdmin(context: Context) {
    if (!context.user || !context.user.roles?.includes("admin")) {
        throw createGraphQLError("Unauthorized: Admin role required")
    }
}

/**
 * @description 校验奖励类型并约束为当前商城支持的两种值。
 * @param rewardType 原始奖励类型。
 * @returns 规范化后的奖励类型。
 */
function normalizeRewardType(rewardType: string): ShopRewardType {
    if (rewardType === SHOP_REWARD_TYPES.TITLE || rewardType === SHOP_REWARD_TYPES.NAME_CARD) {
        return rewardType
    }
    throw createGraphQLError("Invalid shop reward type")
}

/**
 * @description 将数据库资产记录序列化为 GraphQL 响应对象。
 * @param asset 奖励资产记录。
 * @returns 奖励资产响应。
 */
function serializeShopAsset(asset: typeof schema.shopAssets.$inferSelect | null | undefined) {
    if (!asset) return undefined
    return {
        ...asset,
    }
}

/**
 * @description 将数据库商品和关联资产拍平成前端友好的商品对象。
 * @param product 商品与资产关联记录。
 * @returns 拍平后的商品响应。
 */
function serializeShopProduct(product: ShopProductRow | null | undefined) {
    if (!product) return undefined
    return {
        id: product.id,
        name: product.name,
        description: product.description,
        assetId: product.assetId,
        rewardType: product.asset.rewardType,
        rewardKey: product.asset.rewardKey,
        rewardName: product.asset.rewardName,
        displayClass: product.asset.displayClass,
        displayCss: product.asset.displayCss,
        pointsCost: product.pointsCost,
        sortOrder: product.sortOrder,
        isActive: Boolean(product.isActive),
        startTime: product.startTime,
        endTime: product.endTime,
        createdAt: product.createdAt,
        updateAt: product.updateAt,
        asset: serializeShopAsset(product.asset)!,
    }
}

/**
 * @description 解析商城商品使用的本地日期时间文本。
 * 支持 `datetime-local` 常见的 `YYYY-MM-DDTHH:mm` / `YYYY-MM-DDTHH:mm:ss` 格式。
 * @param value 原始时间文本。
 * @returns 可比较的时间戳；为空时返回 `null`，格式非法时返回 `Number.NaN`。
 */
function parseShopDateTime(value?: string | null): number | null {
    const text = String(value ?? "").trim()
    if (!text) return null
    const normalized = text.replace(" ", "T")
    const timestamp = new Date(normalized).getTime()
    return Number.isNaN(timestamp) ? Number.NaN : timestamp
}

/**
 * @description 判断商品当前是否处于可展示/可兑换时间窗内。
 * @param product 商品记录。
 * @param nowTs 当前时间戳。
 * @returns 是否可用。
 */
function isShopProductAvailable(
    product: Pick<typeof schema.shopProducts.$inferSelect, "startTime" | "endTime">,
    nowTs = Date.now()
): boolean {
    const startTime = parseShopDateTime(product.startTime)
    const endTime = parseShopDateTime(product.endTime)

    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
        return false
    }
    if (startTime !== null && nowTs < startTime) {
        return false
    }
    if (endTime !== null && nowTs > endTime) {
        return false
    }
    return true
}

/**
 * @description 判断商品当前是否应继续在商城展示。
 * 未开始的商品允许提前展示，已结束的商品不再展示。
 * @param product 商品记录。
 * @param nowTs 当前时间戳。
 * @returns 是否展示。
 */
function shouldShowShopProduct(
    product: Pick<typeof schema.shopProducts.$inferSelect, "startTime" | "endTime">,
    nowTs = Date.now()
): boolean {
    const startTime = parseShopDateTime(product.startTime)
    const endTime = parseShopDateTime(product.endTime)

    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
        return false
    }
    if (endTime !== null && nowTs > endTime) {
        return false
    }
    return true
}

/**
 * @description 将商品表单输入转换为商品字段和资产字段，供创建/更新共用。
 * @param data GraphQL 商品输入。
 * @returns 规范化后的商品与资产字段。
 */
function normalizeShopProductInput(data: {
    name: string
    description?: string | null
    rewardType: string
    pointsCost: number
    rewardKey: string
    rewardName: string
    displayClass?: string | null
    displayCss?: string | null
    sortOrder: number
    isActive: boolean
    startTime?: string | null
    endTime?: string | null
}) {
    const rewardType = normalizeRewardType(String(data.rewardType))
    const name = String(data.name ?? "").trim()
    const rewardKey = String(data.rewardKey ?? "").trim()
    const rewardName = String(data.rewardName ?? "").trim()
    const displayClass = String(data.displayClass ?? "").trim()
    const displayCss = String(data.displayCss ?? "").trim()
    const startTime = String(data.startTime ?? "").trim()
    const endTime = String(data.endTime ?? "").trim()
    const parsedStartTime = parseShopDateTime(startTime)
    const parsedEndTime = parseShopDateTime(endTime)

    if (!name) {
        throw createGraphQLError("商品名称不能为空")
    }
    if (!rewardKey) {
        throw createGraphQLError("奖励标识不能为空")
    }
    if (!rewardName) {
        throw createGraphQLError("奖励显示名不能为空")
    }
    if (rewardType === SHOP_REWARD_TYPES.NAME_CARD && !displayClass) {
        throw createGraphQLError("名字特效类名不能为空")
    }
    if (rewardType === SHOP_REWARD_TYPES.NAME_CARD && !displayCss) {
        throw createGraphQLError("名字特效 CSS 不能为空")
    }
    if (!Number.isFinite(data.pointsCost) || data.pointsCost < 0) {
        throw createGraphQLError("商品积分价格无效")
    }
    if (!Number.isFinite(data.sortOrder)) {
        throw createGraphQLError("商品排序值无效")
    }
    if (Number.isNaN(parsedStartTime)) {
        throw createGraphQLError("开始时间格式无效")
    }
    if (Number.isNaN(parsedEndTime)) {
        throw createGraphQLError("结束时间格式无效")
    }
    if (parsedStartTime !== null && parsedEndTime !== null && parsedStartTime > parsedEndTime) {
        throw createGraphQLError("开始时间不能晚于结束时间")
    }

    return {
        product: {
            name,
            description: data.description ? String(data.description) : null,
            pointsCost: Math.floor(data.pointsCost),
            sortOrder: Math.floor(data.sortOrder),
            isActive: data.isActive ? 1 : 0,
            startTime: startTime || null,
            endTime: endTime || null,
        },
        asset: {
            rewardType,
            rewardKey,
            rewardName,
            displayClass: displayClass || null,
            displayCss: displayCss || null,
        },
    }
}

/**
 * @description 按奖励唯一键查找或创建奖励资产，确保同一资产可被多个商品复用。
 * @param tx 事务上下文。
 * @param assetValues 奖励资产字段。
 * @returns 奖励资产记录。
 */
async function findOrCreateShopAsset(
    tx: any,
    assetValues: {
        rewardType: ShopRewardType
        rewardKey: string
        rewardName: string
        displayClass: string | null
        displayCss: string | null
    }
) {
    const existing = await tx.query.shopAssets.findFirst({
        where: and(eq(schema.shopAssets.rewardType, assetValues.rewardType), eq(schema.shopAssets.rewardKey, assetValues.rewardKey)),
    })

    if (existing) {
        const [updated] = await tx
            .update(schema.shopAssets)
            .set({
                rewardName: assetValues.rewardName,
                displayClass: assetValues.displayClass,
                displayCss: assetValues.displayCss,
            })
            .where(eq(schema.shopAssets.id, existing.id))
            .returning()
        return updated
    }

    const [created] = await tx.insert(schema.shopAssets).values(assetValues).returning()
    return created
}

/**
 * @description 拉取商品列表并在内存中完成搜索与筛选，避免 join 过滤复杂化。
 * @param allowInactive 管理员场景是否允许查看下架商品。
 * @param args 查询参数。
 * @returns 过滤后的商品列表。
 */
async function loadFilteredShopProducts(
    allowInactive: boolean,
    args: { search?: string | null; rewardType?: string | null; activeOnly?: boolean | null }
) {
    const rows = await db.query.shopProducts.findMany({
        with: {
            asset: true,
        },
        orderBy: [schema.shopProducts.sortOrder, schema.shopProducts.createdAt],
    })

    const search = String(args.search ?? "")
        .trim()
        .toLowerCase()
    const rewardType = args.rewardType ? normalizeRewardType(String(args.rewardType)) : null
    const activeFilter = allowInactive ? args.activeOnly : true
    const shouldFilterAvailability = !allowInactive
    const nowTs = Date.now()

    return rows.filter(row => {
        if (activeFilter === true && !row.isActive) return false
        if (activeFilter === false && row.isActive) return false
        if (shouldFilterAvailability && !shouldShowShopProduct(row, nowTs)) return false
        if (rewardType && row.asset.rewardType !== rewardType) return false
        if (!search) return true
        const text = `${row.name} ${row.description ?? ""} ${row.asset.rewardName} ${row.asset.rewardKey}`.toLowerCase()
        return text.includes(search)
    })
}

/**
 * @description 读取后台兑换记录列表，并支持按用户、商品、资产关键字做内存筛选。
 * @param args 查询参数。
 * @returns 过滤后的兑换记录。
 */
async function loadAdminShopRedemptions(args: { limit?: number; offset?: number; search?: string | null }) {
    const search = String(args.search ?? "")
        .trim()
        .toLowerCase()
    const offset = args.offset || 0
    const limit = args.limit || 20
    const rows = await db.query.shopRedemptions.findMany({
        with: {
            user: true,
            product: {
                with: {
                    asset: true,
                },
            },
            asset: true,
        },
        orderBy: [desc(schema.shopRedemptions.createdAt)],
    })

    const filtered = rows.filter(item => {
        if (!search) return true
        const text =
            `${item.user?.name ?? ""} ${item.user?.email ?? ""} ${item.product?.name ?? ""} ${item.asset?.rewardName ?? ""} ${item.asset?.rewardKey ?? ""}`.toLowerCase()
        return text.includes(search)
    })

    return filtered.slice(offset, offset + limit).map(item => ({
        ...item,
        product: serializeShopProduct(item.product as ShopProductRow | undefined),
        asset: serializeShopAsset(item.asset),
    }))
}

/**
 * @description 读取当前用户的商城摘要，拥有与装备都基于奖励资产，而不是某一条商品记录。
 * @param userId 用户 ID。
 * @returns 当前用户的商城摘要。
 */
async function loadUserShopSummary(userId: string) {
    const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
    })
    if (!user) {
        throw createGraphQLError("User not found")
    }

    const ownedItems = await db.query.userShopItems.findMany({
        where: eq(schema.userShopItems.userId, userId),
        columns: {
            assetId: true,
        },
    })

    const selectedAssetIds = [user.selectedTitleAssetId, user.selectedNameCardAssetId].filter(Boolean) as string[]
    const selectedAssets = selectedAssetIds.length
        ? await db.query.shopAssets.findMany({
              where: inArray(schema.shopAssets.id, selectedAssetIds),
          })
        : []

    const selectedTitleAsset = selectedAssets.find(asset => asset.id === user.selectedTitleAssetId)
    const selectedNameCardAsset = selectedAssets.find(asset => asset.id === user.selectedNameCardAssetId)

    return {
        points: user.points ?? 0,
        selectedTitleAssetId: user.selectedTitleAssetId,
        selectedNameCardAssetId: user.selectedNameCardAssetId,
        selectedTitleAsset: serializeShopAsset(selectedTitleAsset),
        selectedNameCardAsset: serializeShopAsset(selectedNameCardAsset),
        ownedAssetIds: ownedItems.map(item => item.assetId),
    }
}

/**
 * @description 向指定用户直接发放商城商品，不扣积分，但会记录一条后台发放流水。
 * @param tx 事务上下文。
 * @param userId 目标用户 ID。
 * @param productId 商品 ID。
 * @returns 发放结果。
 */
async function grantShopProductToUser(tx: any, userId: string, productId: string) {
    const user = await tx.query.users.findFirst({
        where: eq(schema.users.id, userId),
    })
    if (!user) {
        throw createGraphQLError("User not found")
    }

    const product = await tx.query.shopProducts.findFirst({
        where: eq(schema.shopProducts.id, productId),
        with: {
            asset: true,
        },
    })
    if (!product || !product.asset) {
        throw createGraphQLError("商品不存在")
    }

    const existing = await tx.query.userShopItems.findFirst({
        where: and(eq(schema.userShopItems.userId, user.id), eq(schema.userShopItems.assetId, product.assetId)),
    })
    if (existing) {
        return {
            success: false,
            message: "该奖励已拥有，无需重复发放",
            user,
            awardedAsset: product.asset,
        }
    }

    await tx.insert(schema.userShopItems).values({
        userId: user.id,
        assetId: product.assetId,
    })
    await tx.insert(schema.shopRedemptions).values({
        userId: user.id,
        productId: product.id,
        assetId: product.assetId,
        pointsCost: 0,
    })

    return {
        success: true,
        message: "发放成功",
        user,
        awardedAsset: product.asset,
    }
}

/**
 * @description 从指定用户处撤回商城商品对应资产；若当前已装备则同步卸下。
 * @param tx 事务上下文。
 * @param userId 目标用户 ID。
 * @param productId 商品 ID。
 * @returns 撤回结果。
 */
async function revokeShopProductFromUser(tx: any, userId: string, productId: string) {
    const user = await tx.query.users.findFirst({
        where: eq(schema.users.id, userId),
    })
    if (!user) {
        throw createGraphQLError("User not found")
    }

    const product = await tx.query.shopProducts.findFirst({
        where: eq(schema.shopProducts.id, productId),
        with: {
            asset: true,
        },
    })
    if (!product || !product.asset) {
        throw createGraphQLError("商品不存在")
    }

    const ownedItem = await tx.query.userShopItems.findFirst({
        where: and(eq(schema.userShopItems.userId, user.id), eq(schema.userShopItems.assetId, product.assetId)),
    })
    if (!ownedItem) {
        return {
            success: false,
            message: "用户尚未拥有该商品，无法撤回",
            user,
            awardedAsset: product.asset,
        }
    }

    await tx.delete(schema.userShopItems).where(eq(schema.userShopItems.id, ownedItem.id))
    await tx
        .delete(schema.shopRedemptions)
        .where(
            and(
                eq(schema.shopRedemptions.userId, user.id),
                eq(schema.shopRedemptions.productId, product.id),
                eq(schema.shopRedemptions.assetId, product.assetId)
            )
        )

    const updateData =
        product.asset.rewardType === SHOP_REWARD_TYPES.TITLE
            ? { selectedTitleAssetId: user.selectedTitleAssetId === product.assetId ? null : user.selectedTitleAssetId }
            : { selectedNameCardAssetId: user.selectedNameCardAssetId === product.assetId ? null : user.selectedNameCardAssetId }

    const [updatedUser] = await tx.update(schema.users).set(updateData).where(eq(schema.users.id, user.id)).returning()

    return {
        success: true,
        message: "撤回成功",
        user: updatedUser,
        awardedAsset: product.asset,
    }
}

export const resolvers = {
    Query: {
        shopProducts: async (_parent, args, context) => {
            const allowInactive = !!context.user?.roles?.includes("admin")
            const filtered = await loadFilteredShopProducts(allowInactive, args ?? {})
            const offset = args?.offset || 0
            const limit = args?.limit || 50
            return filtered.slice(offset, offset + limit).map(item => serializeShopProduct(item)!)
        },
        shopProductsCount: async (_parent, args, context) => {
            const allowInactive = !!context.user?.roles?.includes("admin")
            const filtered = await loadFilteredShopProducts(allowInactive, args ?? {})
            return filtered.length
        },
        myShopItems: async (_parent, _args, context) => {
            if (!context.user) {
                throw createGraphQLError("Unauthorized")
            }

            const items = await db.query.userShopItems.findMany({
                where: eq(schema.userShopItems.userId, context.user.id),
                with: {
                    asset: true,
                },
                orderBy: [desc(schema.userShopItems.createdAt)],
            })

            return items.map(item => ({
                ...item,
                asset: serializeShopAsset(item.asset)!,
            }))
        },
        myShopSummary: async (_parent, _args, context) => {
            if (!context.user) {
                throw createGraphQLError("Unauthorized")
            }
            return await loadUserShopSummary(context.user.id)
        },
        adminShopRedemptions: async (_parent, args, context) => {
            requireAdmin(context)
            return await loadAdminShopRedemptions(args ?? {})
        },
        adminShopRedemptionsCount: async (_parent, args, context) => {
            requireAdmin(context)
            const rows = await loadAdminShopRedemptions({ ...args, limit: Number.MAX_SAFE_INTEGER, offset: 0 })
            return rows.length
        },
    },
    Mutation: {
        redeemShopProduct: async (_parent, { productId }, context) => {
            if (!context.user) {
                return {
                    success: false,
                    message: "Unauthorized",
                }
            }

            const result = await db.transaction(async tx => {
                const user = await tx.query.users.findFirst({
                    where: eq(schema.users.id, context.user!.id),
                })
                if (!user) {
                    throw createGraphQLError("User not found")
                }

                const product = await tx.query.shopProducts.findFirst({
                    where: eq(schema.shopProducts.id, productId),
                    with: {
                        asset: true,
                    },
                })
                if (!product || !product.isActive) {
                    throw createGraphQLError("商品不存在或已下架")
                }
                if (!isShopProductAvailable(product)) {
                    throw createGraphQLError("商品当前不在可兑换时间范围内")
                }

                const existing = await tx.query.userShopItems.findFirst({
                    where: and(eq(schema.userShopItems.userId, user.id), eq(schema.userShopItems.assetId, product.assetId)),
                })
                if (existing) {
                    return {
                        success: false,
                        message: "该奖励已拥有，无需重复兑换",
                        user,
                        awardedAsset: product.asset,
                    }
                }

                if ((user.points ?? 0) < product.pointsCost) {
                    return {
                        success: false,
                        message: "积分不足，无法兑换该商品",
                        user,
                        awardedAsset: product.asset,
                    }
                }

                await tx.insert(schema.userShopItems).values({
                    userId: user.id,
                    assetId: product.assetId,
                })
                await tx.insert(schema.shopRedemptions).values({
                    userId: user.id,
                    productId: product.id,
                    assetId: product.assetId,
                    pointsCost: product.pointsCost,
                })

                const [updatedUser] = await tx
                    .update(schema.users)
                    .set({
                        points: (user.points ?? 0) - product.pointsCost,
                    })
                    .where(eq(schema.users.id, user.id))
                    .returning()

                return {
                    success: true,
                    message: "兑换成功",
                    user: updatedUser,
                    awardedAsset: product.asset,
                }
            })

            return {
                ...result,
                awardedAsset: serializeShopAsset(result.awardedAsset),
            }
        },
        equipShopAsset: async (_parent, { assetId }, context) => {
            if (!context.user) {
                return {
                    success: false,
                    message: "Unauthorized",
                }
            }

            const result = await db.transaction(async tx => {
                const ownedItem = await tx.query.userShopItems.findFirst({
                    where: and(eq(schema.userShopItems.userId, context.user!.id), eq(schema.userShopItems.assetId, assetId)),
                    with: {
                        asset: true,
                    },
                })

                if (!ownedItem?.asset) {
                    return {
                        success: false,
                        message: "请先兑换该奖励后再装备",
                    }
                }

                const updateData =
                    ownedItem.asset.rewardType === SHOP_REWARD_TYPES.TITLE
                        ? { selectedTitleAssetId: ownedItem.asset.id }
                        : { selectedNameCardAssetId: ownedItem.asset.id }

                const [user] = await tx.update(schema.users).set(updateData).where(eq(schema.users.id, context.user!.id)).returning()

                return {
                    success: true,
                    message: ownedItem.asset.rewardType === SHOP_REWARD_TYPES.TITLE ? "称号已装备" : "名字特效已装备",
                    user,
                }
            })

            if (!result.success || !result.user) {
                return result
            }

            const summary = await loadUserShopSummary(context.user.id)
            return {
                ...result,
                selectedTitleAsset: summary.selectedTitleAsset,
                selectedNameCardAsset: summary.selectedNameCardAsset,
            }
        },
        adminGrantShopProduct: async (_parent, { userId, productId }, context) => {
            requireAdmin(context)
            const result = await db.transaction(async tx => {
                return await grantShopProductToUser(tx, userId, productId)
            })

            return {
                ...result,
                awardedAsset: serializeShopAsset(result.awardedAsset),
            }
        },
        adminRevokeShopProduct: async (_parent, { userId, productId }, context) => {
            requireAdmin(context)
            const result = await db.transaction(async tx => {
                return await revokeShopProductFromUser(tx, userId, productId)
            })

            return {
                ...result,
                awardedAsset: serializeShopAsset(result.awardedAsset),
            }
        },
        createShopProduct: async (_parent, { data }, context) => {
            requireAdmin(context)
            return await db.transaction(async tx => {
                const normalized = normalizeShopProductInput(data)
                const asset = await findOrCreateShopAsset(tx, normalized.asset)
                const [product] = await tx
                    .insert(schema.shopProducts)
                    .values({
                        ...normalized.product,
                        assetId: asset.id,
                    })
                    .returning()
                return serializeShopProduct({ ...product, asset })!
            })
        },
        updateShopProduct: async (_parent, { id, data }, context) => {
            requireAdmin(context)
            return await db.transaction(async tx => {
                const existing = await tx.query.shopProducts.findFirst({
                    where: eq(schema.shopProducts.id, id),
                })
                if (!existing) {
                    throw createGraphQLError("商品不存在")
                }
                const normalized = normalizeShopProductInput(data)
                const asset = await findOrCreateShopAsset(tx, normalized.asset)
                const [product] = await tx
                    .update(schema.shopProducts)
                    .set({
                        ...normalized.product,
                        assetId: asset.id,
                    })
                    .where(eq(schema.shopProducts.id, id))
                    .returning()
                return serializeShopProduct({ ...product, asset })!
            })
        },
        deleteShopProduct: async (_parent, { id }, context) => {
            requireAdmin(context)
            const result = await db.delete(schema.shopProducts).where(eq(schema.shopProducts.id, id)).returning()
            return result.length > 0
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
