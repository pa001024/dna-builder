<script setup lang="ts">
import {
    deleteGuideMutation,
    type Guide,
    guidesWithCountQuery,
    pinGuideMutation,
    recommendGuideMutation,
    updateGuideMutation,
} from "@/api/graphql"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

/**
 * 攻略管理页配置
 */
const config: AdminCrudConfig<Guide> = {
    title: "攻略管理",
    description: "管理用户发布的攻略内容",
    pageSize: 10,
    searchPlaceholder: "搜索攻略标题...",
    filters: [
        {
            key: "type",
            type: "select",
            label: "攻略类型",
            options: [
                { label: "角色攻略", value: "char" },
                { label: "任务攻略", value: "mission" },
                { label: "其他", value: "other" },
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
            key: "type",
            title: "类型",
            type: "badge",
            formatter: value => {
                const type = String(value || "")
                if (type === "char") return "角色攻略"
                if (type === "mission") return "任务攻略"
                if (type === "other") return "其他"
                if (type === "text") return "图文"
                if (type === "image") return "一图流"
                return type || "-"
            },
            badgeClass: (_, value) => {
                const type = String(value || "")
                if (type === "char" || type === "text") return "badge-primary"
                if (type === "mission" || type === "image") return "badge-secondary"
                return "badge-ghost"
            },
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
            accessor: item => ({ views: item.views, likes: item.likes }),
            formatter: value => {
                const stats = value as { views: number; likes: number }
                return `${stats.views || 0} / ${stats.likes || 0}`
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
    ],
    rowKey: item => item.id,
    async fetchList(params) {
        const result = await guidesWithCountQuery(
            {
                limit: params.pageSize,
                offset: (params.page - 1) * params.pageSize,
                search: params.search,
                type: String(params.filters.type || ""),
            },
            { requestPolicy: "network-only" }
        )

        return {
            items: result?.guides || [],
            total: result?.guidesCount || 0,
        }
    },
    form: {
        editTitle: "编辑攻略",
        fields: [
            {
                key: "title",
                label: "标题",
                type: "text",
                required: true,
                placeholder: "攻略标题",
            },
            {
                key: "type",
                label: "类型",
                type: "select",
                required: true,
                options: [
                    { label: "角色攻略", value: "char" },
                    { label: "任务攻略", value: "mission" },
                    { label: "其他", value: "other" },
                ],
            },
            {
                key: "content",
                label: "内容",
                type: "textarea",
                required: true,
                placeholder: "攻略内容（支持Markdown）",
            },
        ],
        editInitialValues(item) {
            return {
                title: item.title,
                type: item.type,
                content: item.content,
                charId: item.charId,
            }
        },
        validate(form) {
            if (!form.title || !String(form.title).trim()) {
                return "请输入攻略标题"
            }
            if (!form.type) {
                return "请选择攻略类型"
            }
            if (!form.content || !String(form.content).trim()) {
                return "请输入攻略内容"
            }
            return null
        },
        async update(item, form) {
            await updateGuideMutation({
                id: item.id,
                input: {
                    title: String(form.title),
                    type: String(form.type) as Guide["type"],
                    content: String(form.content),
                    images: item.images || [],
                    charId: form.charId ? Number(form.charId) : undefined,
                    buildId: item.buildId,
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
                await pinGuideMutation({ id: item.id, pinned: !item.isPinned })
            },
        },
        {
            key: "toggleRecommend",
            label: "推荐",
            icon: "ri:star-line",
            tone: "neutral",
            async handler(item) {
                await recommendGuideMutation({ id: item.id, recommended: !item.isRecommended })
            },
        },
    ],
    delete: {
        title: "删除确认",
        description: "确定要删除这个攻略吗？",
        async run(item) {
            await deleteGuideMutation({ id: item.id })
        },
    },
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
