<script setup lang="ts">
import {
    deleteGraphMutation,
    type Graph,
    graphsWithCountQuery,
    likeGraphMutation,
    pinGraphMutation,
    recommendGraphMutation,
    unlikeGraphMutation,
} from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import { formatDateTime } from "@/utils/time"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

const ui = useUIStore()

/**
 * 节点图管理页配置：对标构筑管理（搜索 / 点赞 / 推荐 / 置顶 / 删除）。
 */
const config: AdminCrudConfig<Graph> = {
    title: "节点图管理",
    description: "管理用户分享的节点图内容与互动状态",
    pageSize: 20,
    searchPlaceholder: "搜索节点图标题...",
    selectable: true,
    columns: [
        {
            key: "title",
            title: "标题",
            cellClass: "font-semibold",
        },
        {
            key: "views",
            title: "浏览",
            cellClass: "text-center text-base-content/60",
            formatter: value => String(value || 0),
        },
        {
            key: "likes",
            title: "点赞",
            cellClass: "text-center",
            formatter: value => String(value || 0),
        },
        {
            key: "status",
            title: "状态",
            cellClass: "text-center",
            accessor: item => ({ pinned: item.isPinned, recommended: item.isRecommended }),
            formatter: value => {
                const status = value as { pinned?: boolean; recommended?: boolean }
                const list: string[] = []
                if (status.pinned) list.push("置顶")
                if (status.recommended) list.push("推荐")
                return list.length ? list.join(" / ") : "普通"
            },
        },
        {
            key: "user",
            title: "作者",

            accessor: item => item.user?.name,
            formatter: value => String(value || "-"),
        },
        {
            key: "createdAt",
            title: "创建日期",
            cellClass: "text-base-content/70",
            formatter: value => (value ? formatDateTime(Number(value)) : "-"),
        },
    ],
    rowKey: item => item.id,
    async fetchList(params) {
        const result = await graphsWithCountQuery(
            {
                limit: params.pageSize,
                offset: (params.page - 1) * params.pageSize,
                search: params.search,
                userId: undefined,
            },
            { requestPolicy: "network-only" }
        )

        return {
            items: result?.graphs || [],
            total: result?.graphsCount || 0,
        }
    },
    rowActions: [
        {
            key: "toggleLike",
            label: "点赞",
            icon: "ri:thumb-up-line",
            tone: "neutral",
            async handler(item) {
                if (!item.isLiked) {
                    await likeGraphMutation({ id: item.id })
                    ui.showSuccessMessage("已点赞")
                    return
                }
                await unlikeGraphMutation({ id: item.id })
                ui.showSuccessMessage("已取消点赞")
            },
        },
        {
            key: "toggleRecommend",
            label: "推荐",
            icon: "ri:star-line",
            tone: "neutral",
            async handler(item) {
                await recommendGraphMutation({ id: item.id, recommended: !item.isRecommended })
                ui.showSuccessMessage("推荐设置已更新")
            },
        },
        {
            key: "togglePin",
            label: "置顶",
            icon: "ri:pushpin-2-line",
            tone: "neutral",
            async handler(item) {
                await pinGraphMutation({ id: item.id, pinned: !item.isPinned })
                ui.showSuccessMessage("置顶状态已更新")
            },
        },
    ],
    bulkActions: [
        {
            key: "batchDelete",
            label: "删除所选",
            tone: "error",
            minSelected: 1,
            async handler(items) {
                if (!items.length) {
                    return
                }

                if (!(await ui.showDialog("批量删除确认", `确定要删除选中的 ${items.length} 张节点图吗？`))) {
                    return
                }

                await Promise.all(items.map(item => deleteGraphMutation({ id: item.id })))
                ui.showSuccessMessage(`已删除 ${items.length} 张节点图`)
            },
        },
    ],
    delete: {
        title: "删除确认",
        description: "此操作无法撤销，确定要删除这张节点图吗？",
        async run(item) {
            await deleteGraphMutation({ id: item.id })
            ui.showSuccessMessage("节点图已删除")
        },
    },
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
