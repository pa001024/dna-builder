<script setup lang="ts">
import {
    createShopProductMutation,
    deleteShopProductMutation,
    type ShopProduct,
    type ShopProductInput,
    shopProductsWithCountQuery,
    updateShopProductMutation,
} from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

const ui = useUIStore()

/**
 * @description 将后台表单值转换为商城商品输入对象。
 * @param form 后台表单值。
 * @returns 可直接提交给 GraphQL 的商品输入。
 */
function toShopProductInput(form: Record<string, unknown>): ShopProductInput {
    return {
        name: String(form.name ?? "").trim(),
        description: String(form.description ?? "").trim() || undefined,
        rewardType: String(form.rewardType ?? "title"),
        pointsCost: Number(form.pointsCost ?? 0),
        rewardKey: String(form.rewardKey ?? "").trim(),
        rewardName: String(form.rewardName ?? "").trim(),
        displayClass: String(form.displayClass ?? "").trim() || undefined,
        displayCss: String(form.displayCss ?? "").trim() || undefined,
        sortOrder: Number(form.sortOrder ?? 0),
        isActive: String(form.isActive ?? "true") === "true",
        startTime: String(form.startTime ?? "").trim() || undefined,
        endTime: String(form.endTime ?? "").trim() || undefined,
    }
}

/**
 * @description 将商城商品时间格式化为后台列表友好的文案。
 * @param startTime 开始时间。
 * @param endTime 结束时间。
 * @returns 时间范围字符串。
 */
function formatProductTimeRange(startTime?: string, endTime?: string): string {
    if (!startTime && !endTime) return "长期有效"
    return `${startTime || "即时生效"} ~ ${endTime || "长期有效"}`
}

/**
 * @description 校验后台表单里的时间范围是否合法。
 * @param startTime 开始时间文本。
 * @param endTime 结束时间文本。
 * @returns 校验错误信息；为空表示通过。
 */
function validateProductTimeRange(startTime?: unknown, endTime?: unknown): string | null {
    const normalizedStartTime = String(startTime ?? "").trim()
    const normalizedEndTime = String(endTime ?? "").trim()

    const startTimestamp = normalizedStartTime ? new Date(normalizedStartTime.replace(" ", "T")).getTime() : null
    const endTimestamp = normalizedEndTime ? new Date(normalizedEndTime.replace(" ", "T")).getTime() : null
    if (normalizedStartTime && (startTimestamp === null || Number.isNaN(startTimestamp))) {
        return "开始时间格式无效"
    }
    if (normalizedEndTime && (endTimestamp === null || Number.isNaN(endTimestamp))) {
        return "结束时间格式无效"
    }
    if (startTimestamp !== null && endTimestamp !== null && startTimestamp > endTimestamp) {
        return "开始时间不能晚于结束时间"
    }
    return null
}

/**
 * @description 复制商品 ID，方便后台直接发放商品。
 * @param item 商品记录。
 */
async function copyProductId(item: ShopProduct) {
    await navigator.clipboard.writeText(item.id)
    ui.showSuccessMessage(`已复制商品 ID: ${item.id}`)
}

/**
 * @description 商城商品管理页配置。
 */
const config: AdminCrudConfig<ShopProduct> = {
    title: "商城商品管理",
    description: "管理积分商城中的称号与名字特效商品",
    pageSize: 20,
    searchPlaceholder: "搜索商品名称或奖励名称...",
    filters: [
        {
            key: "rewardType",
            label: "商品类型",
            type: "select",
            defaultValue: "",
            options: [
                { label: "全部", value: "" },
                { label: "称号", value: "title" },
                { label: "名字特效", value: "name_card" },
            ],
        },
        {
            key: "activeOnly",
            label: "上架状态",
            type: "select",
            defaultValue: "",
            options: [
                { label: "全部", value: "" },
                { label: "仅上架", value: "true" },
                { label: "仅下架", value: "false" },
            ],
        },
    ],
    columns: [
        {
            key: "name",
            title: "商品名",
            cellClass: "px-8 py-5 text-sm text-base-content font-medium",
        },
        {
            key: "rewardType",
            title: "类型",
            type: "badge",
            formatter: value => (String(value) === "title" ? "称号" : "名字特效"),
            badgeClass: (_, value) => (String(value) === "title" ? "badge badge-sm badge-secondary" : "badge badge-sm badge-info"),
        },
        {
            key: "rewardName",
            title: "奖励展示名",
        },
        {
            key: "pointsCost",
            title: "价格",
            formatter: value => `${String(value || 0)} 积分`,
        },
        {
            key: "isActive",
            title: "状态",
            type: "badge",
            formatter: value => (value ? "上架" : "下架"),
            badgeClass: (_, value) => (value ? "badge badge-sm badge-success" : "badge badge-sm badge-ghost"),
        },
        {
            key: "timeRange",
            title: "投放时间",
            accessor: item => ({
                startTime: item.startTime,
                endTime: item.endTime,
            }),
            formatter: value => {
                const range = value as { startTime?: string; endTime?: string }
                return formatProductTimeRange(range.startTime, range.endTime)
            },
        },
        {
            key: "sortOrder",
            title: "排序",
            formatter: value => String(value || 0),
        },
    ],
    rowKey: item => item.id,
    async fetchList(params) {
        const rewardType = String(params.filters.rewardType ?? "")
        const activeFilter = String(params.filters.activeOnly ?? "")
        const result = await shopProductsWithCountQuery(
            {
                limit: params.pageSize,
                offset: (params.page - 1) * params.pageSize,
                search: params.search,
                rewardType: rewardType || undefined,
                activeOnly: activeFilter === "" ? undefined : activeFilter === "true",
            },
            { requestPolicy: "network-only" }
        )

        return {
            items: result?.shopProducts || [],
            total: result?.shopProductsCount || 0,
        }
    },
    form: {
        createTitle: "创建商城商品",
        editTitle: "编辑商城商品",
        createButtonText: "新建商品",
        fields: [
            { key: "name", label: "商品名称", type: "text", required: true, placeholder: "请输入商品名称" },
            {
                key: "rewardType",
                label: "商品类型",
                type: "select",
                required: true,
                options: [
                    { label: "称号", value: "title" },
                    { label: "名字特效", value: "name_card" },
                ],
            },
            { key: "rewardName", label: "奖励展示名", type: "text", required: true, placeholder: "例如：开拓者" },
            { key: "rewardKey", label: "奖励标识", type: "text", required: true, placeholder: "例如：title.trailblazer" },
            { key: "pointsCost", label: "积分价格", type: "number", required: true, min: 0 },
            { key: "sortOrder", label: "排序值", type: "number", required: true, min: 0 },
            { key: "startTime", label: "开始时间", type: "datetime-local", placeholder: "为空表示不限开始时间" },
            { key: "endTime", label: "结束时间", type: "datetime-local", placeholder: "为空表示不限结束时间" },
            { key: "displayClass", label: "展示类名", type: "text", placeholder: "例如：dna-name-effect-red" },
            {
                key: "displayCss",
                label: "展示 CSS",
                type: "textarea",
                placeholder: "例如：.dna-name-effect-red { color: #ef4444; font-weight: 700; }",
            },
            { key: "description", label: "商品描述", type: "textarea", placeholder: "请输入商品描述" },
            {
                key: "isActive",
                label: "是否上架",
                type: "select",
                required: true,
                options: [
                    { label: "上架", value: "true" },
                    { label: "下架", value: "false" },
                ],
            },
        ],
        createInitialValues() {
            return {
                rewardType: "title",
                pointsCost: 0,
                sortOrder: 0,
                isActive: "true",
            }
        },
        editInitialValues(item) {
            return {
                name: item.name || "",
                rewardType: item.rewardType || "title",
                rewardName: item.rewardName || "",
                rewardKey: item.rewardKey || "",
                pointsCost: item.pointsCost || 0,
                sortOrder: item.sortOrder || 0,
                startTime: item.startTime || "",
                endTime: item.endTime || "",
                displayClass: item.displayClass || "",
                displayCss: item.displayCss || "",
                description: item.description || "",
                isActive: item.isActive ? "true" : "false",
            }
        },
        validate(form) {
            if (!String(form.name ?? "").trim()) return "商品名称不能为空"
            if (!String(form.rewardName ?? "").trim()) return "奖励展示名不能为空"
            if (!String(form.rewardKey ?? "").trim()) return "奖励标识不能为空"
            if (!["title", "name_card"].includes(String(form.rewardType ?? ""))) return "请选择有效的商品类型"
            if (String(form.rewardType ?? "") === "name_card" && !String(form.displayClass ?? "").trim()) return "名字特效类名不能为空"
            if (String(form.rewardType ?? "") === "name_card" && !String(form.displayCss ?? "").trim()) return "名字特效 CSS 不能为空"
            if (Number(form.pointsCost ?? -1) < 0) return "积分价格不能小于 0"
            const timeRangeError = validateProductTimeRange(form.startTime, form.endTime)
            if (timeRangeError) return timeRangeError
            return null
        },
        async create(form) {
            await createShopProductMutation({
                data: toShopProductInput(form),
            })
        },
        async update(item, form) {
            await updateShopProductMutation({
                id: item.id,
                data: toShopProductInput(form),
            })
        },
    },
    delete: {
        title: "删除确认",
        description: item => `确定要删除商品「${item.name || "未命名商品"}」吗？`,
        async run(item) {
            await deleteShopProductMutation({ id: item.id })
        },
    },
    rowActions: [
        {
            key: "copy-id",
            label: "复制ID",
            icon: "ri:file-copy-line",
            handler: copyProductId,
        },
    ],
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
