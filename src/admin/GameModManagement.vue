<script setup lang="ts">
import {
    approveGameModMutation,
    deleteGameModMutation,
    pinGameModMutation,
    recommendGameModMutation,
    rejectGameModMutation,
    setGameModActiveMutation,
    updateGameModMutation,
} from "@/api/gen/api-mutations"
import { gameModsCountQuery, gameModsQuery } from "@/api/gen/api-queries"
import type { GameMod } from "@/api/gen/api-types"
import { formatDateTime } from "@/utils/time"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

/**
 * 分类显示名。
 * @param category 分类值。
 * @returns 中文显示名。
 */
function categoryLabel(category: string) {
    return (
        {
            char: "角色",
            weapon: "武器",
            other: "其他",
            standalone: "独立",
        }[category] || category
    )
}

/**
 * 审核状态显示名。
 * @param status 审核状态值。
 * @returns 中文显示名。
 */
function statusLabel(status: string) {
    return (
        {
            pending: "待审核",
            approved: "已通过",
            rejected: "已拒绝",
        }[status] || status
    )
}

/**
 * 游戏补丁 MOD 管理页配置。
 */
const config: AdminCrudConfig<GameMod> = {
    title: "MOD 分享管理",
    description: "审核用户发布的游戏补丁 MOD：通过后其他用户可见；支持推荐、置顶、上架/下架与删除",
    pageSize: 10,
    searchPlaceholder: "搜索 MOD 名称...",
    filters: [
        {
            key: "category",
            type: "select",
            label: "适用分类",
            options: [
                { label: "角色", value: "char" },
                { label: "武器", value: "weapon" },
                { label: "其他", value: "other" },
                { label: "独立", value: "standalone" },
            ],
        },
        {
            key: "status",
            type: "select",
            label: "审核状态",
            options: [
                { label: "待审核", value: "pending" },
                { label: "已通过", value: "approved" },
                { label: "已拒绝", value: "rejected" },
            ],
        },
    ],
    columns: [
        {
            key: "name",
            title: "名称",
            cellClass: "px-8 py-5 text-sm text-base-content font-medium max-w-xs truncate",
        },
        {
            key: "category",
            title: "分类",
            type: "badge",
            accessor: item => item.category,
            formatter: value => categoryLabel(String(value)),
            badgeClass: (_, value) => {
                const map: Record<string, string> = {
                    char: "badge-primary",
                    weapon: "badge-secondary",
                    other: "badge-info",
                    standalone: "badge-warning",
                }
                return map[String(value)] || "badge-ghost"
            },
        },
        {
            key: "entity",
            title: "适用实体",
            accessor: item => item.entity || "—",
            formatter: value => String(value || "—"),
            cellClass: "px-8 py-5 text-sm text-base-content/85 max-w-[8rem] truncate",
        },
        {
            key: "user",
            title: "作者",
            accessor: item => item.user?.name,
            formatter: value => String(value || "-"),
        },
        {
            key: "stats",
            title: "数据",
            accessor: item => ({ downloads: item.downloads, views: item.views }),
            formatter: value => {
                const stats = value as { downloads: number; views: number }
                return `下载 ${stats.downloads || 0} / 浏览 ${stats.views || 0}`
            },
        },
        {
            key: "status",
            title: "审核状态",
            type: "badge",
            accessor: item => item.status,
            formatter: value => statusLabel(String(value)),
            badgeClass: (_, value) => {
                const map: Record<string, string> = {
                    pending: "badge-warning",
                    approved: "badge-success",
                    rejected: "badge-error",
                }
                return map[String(value)] || "badge-ghost"
            },
        },
        {
            key: "flags",
            title: "状态",
            accessor: item => ({ active: item.isActive, pinned: item.isPinned, recommended: item.isRecommended }),
            formatter: value => {
                const status = value as { active?: boolean; pinned?: boolean; recommended?: boolean }
                const values: string[] = []
                if (status.active === false) values.push("已下架")
                if (status.recommended) values.push("推荐")
                if (status.pinned) values.push("置顶")
                return values.length ? values.join(" / ") : "已上架"
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
        const common = {
            search: params.search || undefined,
            category: params.filters.category ? String(params.filters.category) : undefined,
            status: params.filters.status ? String(params.filters.status) : undefined,
        }
        const [items, total] = await Promise.all([
            gameModsQuery(
                { ...common, limit: params.pageSize, offset: (params.page - 1) * params.pageSize, sortBy: "latest" },
                { requestPolicy: "network-only" }
            ),
            gameModsCountQuery(common),
        ])
        return {
            items: items || [],
            total: total || 0,
        }
    },
    form: {
        editTitle: "编辑 MOD 信息",
        fields: [
            {
                key: "name",
                label: "名称",
                type: "text",
                required: true,
                placeholder: "MOD 名称",
            },
            {
                key: "description",
                label: "描述",
                type: "textarea",
                placeholder: "MOD 描述（支持 markdown）",
            },
            {
                key: "category",
                label: "适用分类",
                type: "select",
                required: true,
                options: [
                    { label: "角色", value: "char" },
                    { label: "武器", value: "weapon" },
                    { label: "其他", value: "other" },
                    { label: "独立", value: "standalone" },
                ],
            },
            {
                key: "entity",
                label: "适用实体",
                type: "text",
                placeholder: "角色名/武器名/自定义实体名，独立分类可留空",
            },
            {
                key: "source",
                label: "来源",
                type: "text",
                placeholder: "转载来源说明（可含链接，前端自动转为可点击链接），留空表示原创",
            },
        ],
        editInitialValues(item) {
            return {
                name: item.name,
                description: item.description || "",
                category: item.category,
                entity: item.entity || "",
                source: item.source || "",
            }
        },
        validate(form) {
            if (!form.name || !String(form.name).trim()) {
                return "请输入 MOD 名称"
            }
            return null
        },
        async update(item, form) {
            await updateGameModMutation({
                id: item.id,
                input: {
                    name: String(form.name).trim(),
                    description: String(form.description || "").trim() || undefined,
                    category: String(form.category),
                    entity: String(form.entity || "").trim(),
                    source: String(form.source || "").trim() || undefined,
                },
            })
        },
    },
    rowActions: [
        {
            key: "approve",
            label: "通过",
            icon: "ri:checkbox-circle-fill",
            tone: "primary",
            visible: item => item.status !== "approved",
            async handler(item) {
                await approveGameModMutation({ id: item.id })
            },
        },
        {
            key: "reject",
            label: "拒绝",
            icon: "ri:close-circle-line",
            tone: "error",
            visible: item => item.status !== "rejected",
            async handler(item) {
                await rejectGameModMutation({ id: item.id })
            },
        },
        {
            key: "toggleActive",
            label: "下架",
            icon: "ri:stop-line",
            tone: "neutral",
            visible: item => item.isActive !== false && item.status === "approved",
            async handler(item) {
                await setGameModActiveMutation({ id: item.id, active: false })
            },
        },
        {
            key: "toggleActiveOn",
            label: "上架",
            icon: "ri:eye-line",
            tone: "neutral",
            visible: item => item.isActive === false && item.status === "approved",
            async handler(item) {
                await setGameModActiveMutation({ id: item.id, active: true })
            },
        },
        {
            key: "togglePin",
            label: "置顶",
            icon: "ri:pushpin-2-line",
            tone: "neutral",
            async handler(item) {
                await pinGameModMutation({ id: item.id, pinned: !item.isPinned })
            },
        },
        {
            key: "toggleRecommend",
            label: "推荐",
            icon: "ri:star-line",
            tone: "neutral",
            async handler(item) {
                await recommendGameModMutation({ id: item.id, recommended: !item.isRecommended })
            },
        },
    ],
    delete: {
        title: "删除确认",
        description: item => `确定要删除「${item.name}」这个 MOD 吗？将同时删除其存储文件。`,
        async run(item) {
            await deleteGameModMutation({ id: item.id })
        },
    },
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
