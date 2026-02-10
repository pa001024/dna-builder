<script setup lang="ts">
import { useRoute } from "vue-router"
import { timelinesWithCountQuery } from "@/api/combined"
import {
    deleteTimelineMutation,
    likeTimelineMutation,
    pinTimelineMutation,
    recommendTimelineMutation,
    type Timeline,
    unlikeTimelineMutation,
} from "@/api/graphql"
import { charData } from "@/data"
import { useUIStore } from "@/store/ui"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

const route = useRoute()
const ui = useUIStore()

/**
 * 获取角色名称
 * @param charId 角色ID
 */
function charName(charId: number) {
    const char = charData.find(item => item.id === charId)
    return char ? char.名称 : `角色${charId}`
}

/**
 * 时间线管理页配置
 */
const config: AdminCrudConfig<Timeline> = {
    title: "时间线管理",
    description: "管理用户时间线与互动状态",
    pageSize: 20,
    searchPlaceholder: "搜索时间线标题...",
    selectable: true,
    columns: [
        {
            key: "title",
            title: "标题",
            cellClass: "px-2 text-sm font-semibold",
        },
        {
            key: "charId",
            title: "角色",
            cellClass: "px-2",
            formatter: value => charName(Number(value || 0)),
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
            cellClass: "px-2",
            accessor: item => item.user?.name,
            formatter: value => String(value || "-"),
        },
        {
            key: "createdAt",
            title: "创建日期",
            cellClass: "px-2 text-xs",
            formatter: value => {
                if (!value) return "-"
                return new Date(String(value)).toLocaleDateString()
            },
        },
    ],
    rowKey: item => item.id,
    async fetchList(params) {
        const result = await timelinesWithCountQuery(
            {
                limit: params.pageSize,
                offset: (params.page - 1) * params.pageSize,
                search: params.search,
                charId: route.query.charId ? parseInt(route.query.charId as string, 10) : undefined,
                userId: undefined,
            },
            { requestPolicy: "network-only" }
        )

        return {
            items: (result?.timelines || []) as Timeline[],
            total: result?.timelinesCount || 0,
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
                    await likeTimelineMutation({ id: item.id })
                    ui.showSuccessMessage("已点赞")
                    return
                }
                await unlikeTimelineMutation({ id: item.id })
                ui.showSuccessMessage("已取消点赞")
            },
        },
        {
            key: "toggleRecommend",
            label: "推荐",
            icon: "ri:star-line",
            tone: "neutral",
            async handler(item) {
                await recommendTimelineMutation({ id: item.id, recommended: !item.isRecommended })
                ui.showSuccessMessage("推荐设置已更新")
            },
        },
        {
            key: "togglePin",
            label: "置顶",
            icon: "ri:pushpin-2-line",
            tone: "neutral",
            async handler(item) {
                await pinTimelineMutation({ id: item.id, pinned: !item.isPinned })
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

                if (!(await ui.showDialog("批量删除确认", `确定要删除选中的 ${items.length} 条时间线吗？`))) {
                    return
                }

                await Promise.all(items.map(item => deleteTimelineMutation({ id: item.id })))
                ui.showSuccessMessage(`已删除 ${items.length} 条时间线`)
            },
        },
    ],
    delete: {
        title: "删除确认",
        description: "此操作无法撤销，确定要删除这个时间线吗？",
        async run(item) {
            await deleteTimelineMutation({ id: item.id })
            ui.showSuccessMessage("时间线已删除")
        },
    },
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
