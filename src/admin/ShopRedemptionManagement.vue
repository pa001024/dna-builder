<script setup lang="ts">
import {
    adminGrantShopProductMutation,
    adminRevokeShopProductMutation,
    adminShopRedemptionsWithCountQuery,
    type ShopRedemption,
    shopProductsQuery,
    usersQuery,
} from "@/api/graphql"
import { formatDateTime } from "@/utils/time"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

const DIRECT_GRANT_LOOKUP_LIMIT = 500

/**
 * @description 规范化文本，便于前端做名称精确匹配。
 * @param value 原始文本。
 * @returns 去首尾空格后的文本。
 */
function normalizeLookupText(value: unknown): string {
    return String(value ?? "").trim()
}

/**
 * @description 根据输入的用户 ID / 名称 / 邮箱解析最终用户 ID。
 * 不改后端搜索接口时，这里通过批量拉取用户列表后在前端做精确匹配。
 * @param form 直接发放表单数据。
 * @returns 解析后的用户 ID。
 * @throws Error 当未匹配到或匹配到多个用户时抛出异常。
 */
async function resolveGrantUserId(form: Record<string, unknown>): Promise<string> {
    const directUserId = normalizeLookupText(form.userId)
    if (directUserId) {
        return directUserId
    }

    const userEmail = normalizeLookupText(form.userEmail)
    if (!userEmail) {
        throw new Error("用户 ID 或用户邮箱不能为空")
    }

    const users = await usersQuery(
        {
            limit: 2,
            offset: 0,
            search: userEmail,
        },
        { requestPolicy: "network-only" }
    )

    const matchedUsers = (users || []).filter(item => {
        return item.email === userEmail
    })

    if (matchedUsers.length === 1) {
        return matchedUsers[0].id
    }

    if (matchedUsers.length > 1) {
        throw new Error("匹配到多个同名用户，请改用用户 ID 或邮箱")
    }

    throw new Error(`未找到邮箱对应用户：${userEmail}`)
}

/**
 * @description 根据输入的商品 ID / 商品名称解析最终商品 ID。
 * @param form 直接发放表单数据。
 * @returns 解析后的商品 ID。
 * @throws Error 当未匹配到或匹配到多个商品时抛出异常。
 */
async function resolveGrantProductId(form: Record<string, unknown>): Promise<string> {
    const directProductId = normalizeLookupText(form.productId)
    if (directProductId) {
        return directProductId
    }

    const productKeyword = normalizeLookupText(form.productKeyword)
    if (!productKeyword) {
        throw new Error("商品 ID 或商品名称不能为空")
    }

    const products = await shopProductsQuery(
        {
            limit: DIRECT_GRANT_LOOKUP_LIMIT,
            offset: 0,
            activeOnly: false,
        },
        { requestPolicy: "network-only" }
    )

    const matchedProducts = (products || []).filter(item => {
        return item.id === productKeyword || item.name === productKeyword || item.rewardName === productKeyword
    })

    if (matchedProducts.length === 1) {
        return matchedProducts[0].id
    }

    if (matchedProducts.length > 1) {
        throw new Error("匹配到多个同名商品，请改用商品 ID")
    }

    throw new Error(`未找到商品：${productKeyword}`)
}

/**
 * @description 商城兑换记录页配置。
 */
const config: AdminCrudConfig<ShopRedemption> = {
    title: "商城兑换记录",
    description: "查看用户积分兑换流水，便于核对商城商品投放效果",
    pageSize: 20,
    searchPlaceholder: "搜索用户或商品...",
    columns: [
        {
            key: "user",
            title: "用户",
            accessor: item => item.user?.name || item.user?.email || item.userId,
            formatter: value => String(value || "-"),
        },
        {
            key: "product",
            title: "兑换商品",
            accessor: item => item.product?.name || item.product?.rewardName || item.productId,
            formatter: value => String(value || "-"),
        },
        {
            key: "rewardType",
            title: "类型",
            type: "badge",
            accessor: item => item.product?.rewardType || "",
            formatter: value => (String(value) === "title" ? "称号" : "名字特效"),
            badgeClass: (_, value) => (String(value) === "title" ? "badge badge-sm badge-secondary" : "badge badge-sm badge-info"),
        },
        {
            key: "pointsCost",
            title: "消耗积分",
            formatter: value => `${String(value || 0)} 积分`,
        },
        {
            key: "createdAt",
            title: "兑换时间",
            formatter: value => (value ? formatDateTime(Number(value)) : "-"),
        },
    ],
    rowKey: item => item.id,
    async fetchList(params) {
        const result = await adminShopRedemptionsWithCountQuery(
            {
                limit: params.pageSize,
                offset: (params.page - 1) * params.pageSize,
                search: params.search,
            },
            { requestPolicy: "network-only" }
        )

        return {
            items: result?.adminShopRedemptions || [],
            total: result?.adminShopRedemptionsCount || 0,
        }
    },
    form: {
        createTitle: "直接发放商品",
        createButtonText: "直接发放",
        fields: [
            { key: "userId", label: "用户 ID", type: "text", placeholder: "优先使用 ID，留空时可用邮箱精确匹配" },
            { key: "userEmail", label: "用户邮箱", type: "email", placeholder: "用户 ID 留空时，按邮箱精确匹配" },
            { key: "productId", label: "商品 ID", type: "text", placeholder: "优先使用 ID，留空时可用商品名称匹配" },
            { key: "productKeyword", label: "商品名称", type: "text", placeholder: "商品 ID 留空时，按商品名称精确匹配" },
        ],
        validate(form) {
            if (!normalizeLookupText(form.userId) && !normalizeLookupText(form.userEmail)) return "用户 ID 或用户邮箱 至少填写一项"
            if (!normalizeLookupText(form.productId) && !normalizeLookupText(form.productKeyword)) return "商品 ID 或商品名称 至少填写一项"
            return null
        },
        async create(form) {
            const userId = await resolveGrantUserId(form)
            const productId = await resolveGrantProductId(form)
            await adminGrantShopProductMutation({
                userId,
                productId,
            })
        },
    },
    rowActions: [
        {
            key: "revoke-by-row",
            label: "撤回此商品",
            tone: "error",
            async handler(item) {
                await adminRevokeShopProductMutation({
                    userId: item.userId,
                    productId: item.productId,
                })
            },
        },
    ],
    bulkActions: [],
}
</script>

<template>
    <div class="space-y-4">
        <AdminCrudPage :config="config" />
    </div>
</template>
