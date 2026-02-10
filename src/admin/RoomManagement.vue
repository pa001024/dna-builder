<script setup lang="ts">
import { createRoomMutation, deleteRoomMutation, type Room, roomsWithCountQuery, updateRoomMutation } from "@/api/graphql"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

/**
 * 房间管理页配置
 */
const config: AdminCrudConfig<Room> = {
    title: "房间管理",
    description: "管理房间信息和访问配置",
    pageSize: 20,
    columns: [
        {
            key: "name",
            title: "房间名称",
            cellClass: "px-8 py-5 text-sm text-base-content font-medium",
        },
        {
            key: "type",
            title: "类型",
            type: "badge",
            formatter: value => String(value || "-"),
            badgeClass: "badge-ghost",
        },
        {
            key: "maxUsers",
            title: "最大用户数",
            formatter: value => String(value || "-"),
        },
        {
            key: "owner",
            title: "房主",
            accessor: item => item.owner?.name,
            formatter: value => String(value || "-"),
        },
        {
            key: "createdAt",
            title: "创建时间",
            cellClass: "px-8 py-5 whitespace-nowrap text-sm text-base-content/70",
            formatter: value => String(value || "-"),
        },
    ],
    rowKey: item => item.id,
    async fetchList(params) {
        const result = await roomsWithCountQuery(
            {
                limit: params.pageSize,
                offset: (params.page - 1) * params.pageSize,
            },
            { requestPolicy: "network-only" }
        )

        return {
            items: result?.rooms || [],
            total: result?.roomsCount || 0,
        }
    },
    form: {
        createTitle: "创建房间",
        createButtonText: "创建房间",
        editTitle: "编辑房间",
        fields: [
            {
                key: "name",
                label: "房间名称",
                type: "text",
                required: true,
                placeholder: "房间名称",
            },
            {
                key: "type",
                label: "类型",
                type: "text",
                placeholder: "房间类型（可选）",
            },
            {
                key: "maxUsers",
                label: "最大用户数",
                type: "number",
                required: true,
                min: 1,
                max: 100,
                step: 1,
            },
        ],
        createInitialValues() {
            return {
                name: "",
                type: "",
                maxUsers: 10,
            }
        },
        editInitialValues(item) {
            return {
                name: item.name,
                type: item.type || "",
                maxUsers: item.maxUsers || 10,
            }
        },
        validate(form) {
            if (!form.name || !String(form.name).trim()) {
                return "请输入房间名称"
            }
            return null
        },
        async create(form) {
            await createRoomMutation({
                data: {
                    name: String(form.name),
                    type: String(form.type || ""),
                    maxUsers: Number(form.maxUsers || 0),
                },
            })
        },
        async update(item, form) {
            await updateRoomMutation({
                id: item.id,
                data: {
                    name: String(form.name),
                    type: String(form.type || ""),
                    maxUsers: Number(form.maxUsers || 0),
                },
            })
        },
    },
    delete: {
        title: "删除确认",
        description: "确定要删除这个房间吗？",
        async run(item) {
            await deleteRoomMutation({ id: item.id })
        },
    },
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
