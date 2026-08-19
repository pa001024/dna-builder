<script setup lang="ts">
import {
    type DyePlan,
    deleteDyePlanMutation,
    dyePlansCountQuery,
    dyePlansQuery,
    pinDyePlanMutation,
    recommendDyePlanMutation,
    updateDyePlanMutation,
} from "@/api/graphql"
import { skinData } from "@/data/d/accessory.data"
import { formatDateTime } from "@/utils/time"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

/**
 * 染色方案管理页配置（含可选的发型染色码管理）
 */
const config: AdminCrudConfig<DyePlan> = {
    title: "染色方案管理",
    description: "管理用户发布的染色方案（支持筛选含发型染色码的方案）",
    pageSize: 10,
    searchPlaceholder: "搜索方案标题...",
    filters: [
        {
            key: "type",
            type: "select",
            label: "方案类型",
            options: [
                { label: "角色皮肤", value: "Char" },
                { label: "发型", value: "Hair" },
                { label: "武器", value: "Weapon" },
            ],
        },
        {
            key: "hasHair",
            type: "select",
            label: "发型染色码",
            options: [
                { label: "含发型", value: "1" },
                { label: "不含发型", value: "0" },
            ],
        },
    ],
    columns: [
        {
            key: "title",
            title: "标题",
            cellClass: "px-8 py-5 text-sm text-base-content font-medium max-w-xs truncate",
        },
        {
            key: "user",
            title: "作者",
            accessor: item => item.user?.name,
            formatter: value => String(value || "-"),
        },
        {
            key: "skin",
            title: "皮肤",
            accessor: item => skinData.find(skin => skin.id === item.skinId)?.name || `皮肤 #${item.skinId}`,
            cellClass: "px-8 py-5 text-sm text-base-content/85 max-w-xs truncate",
        },
        {
            key: "hair",
            title: "发型",
            type: "badge",
            accessor: item => item.hairCode,
            formatter: value => (value ? "含发型" : "无"),
            badgeClass: (_, value) => (value ? "badge-primary" : "badge-ghost"),
        },
        {
            key: "hairCode",
            title: "发型染色码",
            accessor: item => item.hairCode,
            formatter: value => String(value || "-"),
            cellClass: "px-8 py-5 text-sm font-mono text-base-content/70 max-w-[9rem] truncate",
        },
        {
            key: "colorIds",
            title: "染色",
            accessor: item => item.colorIds?.length || 0,
            formatter: value => `${value} 部位`,
        },
        {
            key: "stats",
            title: "数据",
            accessor: item => ({ views: item.views, likes: item.likes }),
            formatter: value => {
                const stats = value as { views: number; likes: number }
                return `浏览 ${stats.views || 0} / 赞 ${stats.likes || 0}`
            },
        },
        {
            key: "status",
            title: "状态",
            accessor: item => ({ pinned: item.isPinned, recommended: item.isRecommended }),
            formatter: value => {
                const status = value as { pinned?: boolean; recommended?: boolean }
                const values: string[] = []
                if (status.pinned) values.push("置顶")
                if (status.recommended) values.push("推荐")
                return values.length ? values.join(" / ") : "普通"
            },
        },
        {
            key: "createdAt",
            title: "创建时间",
            formatter: value => (value ? formatDateTime(Number(value)) : "-"),
        },
    ],
    rowKey: item => item.id,
    async fetchList(params) {
        const hasHair =
            params.filters.hasHair === "1" ? true : params.filters.hasHair === "0" ? false : undefined
        const common = {
            search: params.search,
            type: String(params.filters.type || ""),
            hasHair,
        }
        const [items, total] = await Promise.all([
            dyePlansQuery(
                { ...common, limit: params.pageSize, offset: (params.page - 1) * params.pageSize },
                { requestPolicy: "network-only" }
            ),
            dyePlansCountQuery(common),
        ])
        return {
            items: items || [],
            total: total || 0,
        }
    },
    form: {
        editTitle: "编辑染色方案",
        fields: [
            {
                key: "title",
                label: "标题",
                type: "text",
                required: true,
                placeholder: "方案标题",
            },
            {
                key: "desc",
                label: "描述",
                type: "textarea",
                placeholder: "方案描述",
            },
            {
                key: "hairCode",
                label: "发型染色码",
                type: "text",
                placeholder: "H 开头的发型染色码（可留空）",
            },
            {
                key: "isOriginal",
                label: "归属",
                type: "select",
                required: true,
                options: [
                    { label: "原创", value: "1" },
                    { label: "转载", value: "0" },
                ],
            },
            {
                key: "source",
                label: "来源",
                type: "text",
                placeholder: "转载来源链接或作者名称",
            },
        ],
        editInitialValues(item) {
            return {
                title: item.title,
                desc: item.desc || "",
                hairCode: item.hairCode || "",
                isOriginal: item.isOriginal ? "1" : "0",
                source: item.source || "",
            }
        },
        validate(form) {
            if (!form.title || !String(form.title).trim()) {
                return "请输入方案标题"
            }
            return null
        },
        async update(item, form) {
            await updateDyePlanMutation({
                id: item.id,
                input: {
                    title: String(form.title).trim(),
                    desc: String(form.desc || "").trim() || undefined,
                    type: item.type,
                    skinId: item.skinId,
                    colorIds: item.colorIds || [],
                    hairCode: String(form.hairCode || "").trim() || undefined,
                    imageUrl: item.imageUrl || undefined,
                    isOriginal: form.isOriginal === "1",
                    source: form.isOriginal === "0" ? String(form.source || "").trim() || undefined : undefined,
                },
            })
        },
    },
    rowActions: [
        {
            key: "togglePin",
            label: "置顶",
            icon: "ri:pushpin-2-line",
            tone: "neutral",
            async handler(item) {
                await pinDyePlanMutation({ id: item.id, pinned: !item.isPinned })
            },
        },
        {
            key: "toggleRecommend",
            label: "推荐",
            icon: "ri:star-line",
            tone: "neutral",
            async handler(item) {
                await recommendDyePlanMutation({ id: item.id, recommended: !item.isRecommended })
            },
        },
    ],
    delete: {
        title: "删除确认",
        description: item => `确定要删除「${item.title}」这个染色方案吗？`,
        async run(item) {
            await deleteDyePlanMutation({ id: item.id })
        },
    },
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
