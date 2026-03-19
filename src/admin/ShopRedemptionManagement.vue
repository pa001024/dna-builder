<script setup lang="ts">
import { reactive } from "vue"
import {
    adminGrantShopProductMutation,
    adminRevokeShopProductMutation,
    adminShopRedemptionsWithCountQuery,
    type ShopRedemption,
} from "@/api/graphql"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

const revokeForm = reactive({
    userId: "",
    productId: "",
})

/**
 * @description 直接按用户 ID 和商品 ID 撤回商品。
 */
async function submitRevokeForm() {
    await adminRevokeShopProductMutation({
        userId: String(revokeForm.userId || "").trim(),
        productId: String(revokeForm.productId || "").trim(),
    })
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
            formatter: value => String(value || "-"),
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
            { key: "userId", label: "用户 ID", type: "text", required: true, placeholder: "请输入目标用户 ID" },
            { key: "productId", label: "商品 ID", type: "text", required: true, placeholder: "请输入要发放的商品 ID" },
        ],
        validate(form) {
            if (!String(form.userId ?? "").trim()) return "用户 ID 不能为空"
            if (!String(form.productId ?? "").trim()) return "商品 ID 不能为空"
            return null
        },
        async create(form) {
            await adminGrantShopProductMutation({
                userId: String(form.userId ?? "").trim(),
                productId: String(form.productId ?? "").trim(),
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
        <div class="card bg-base-100 shadow-sm">
            <div class="card-body p-4">
                <div class="text-sm font-semibold">直接撤回商品</div>
                <div class="text-xs text-base-content/60 mt-1">
                    输入用户 ID 和商品 ID，可直接撤回已发放/已兑换商品；若当前已装备会自动卸下。
                </div>
                <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input v-model="revokeForm.userId" class="input input-bordered w-full" placeholder="用户 ID" />
                    <input v-model="revokeForm.productId" class="input input-bordered w-full" placeholder="商品 ID" />
                    <button class="btn btn-error" @click="submitRevokeForm">直接撤回</button>
                </div>
            </div>
        </div>
    </div>
</template>
