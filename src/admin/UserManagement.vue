<script setup lang="ts">
import { deleteUserMutation, type User, updateUserMutation, usersWithCountQuery } from "@/api/graphql"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

/**
 * 用户管理页配置
 */
const config: AdminCrudConfig<User> = {
    title: "用户管理",
    description: "管理系统用户和权限",
    pageSize: 20,
    searchPlaceholder: "搜索用户邮箱...",
    columns: [
        {
            key: "id",
            title: "ID",
            cellClass: "px-8 py-5 whitespace-nowrap text-sm font-medium text-base-content font-mono",
        },
        {
            key: "email",
            title: "邮箱",
            formatter: value => String(value || "-"),
        },
        {
            key: "name",
            title: "用户名",
            cellClass: "px-8 py-5 whitespace-nowrap text-sm text-base-content/85 font-medium",
            formatter: value => String(value || "-"),
        },
        {
            key: "qq",
            title: "QQ",
            formatter: value => String(value || "-"),
        },
        {
            key: "roles",
            title: "角色",
            type: "badge",
            formatter: value => String(value || "user"),
            badgeClass: (_, value) => (value === "admin" ? "badge-primary" : "badge-ghost"),
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
        const result = await usersWithCountQuery(
            {
                limit: params.pageSize,
                offset: (params.page - 1) * params.pageSize,
                search: params.search,
            },
            { requestPolicy: "network-only" }
        )

        return {
            items: result?.users || [],
            total: result?.usersCount || 0,
        }
    },
    form: {
        editTitle: "编辑用户",
        fields: [
            {
                key: "email",
                label: "邮箱",
                type: "email",
                required: true,
                placeholder: "user@example.com",
            },
            {
                key: "roles",
                label: "角色",
                type: "select",
                required: true,
                options: [
                    { label: "user", value: "user" },
                    { label: "admin", value: "admin" },
                ],
            },
        ],
        editInitialValues(item) {
            return {
                email: item.email || "",
                roles: item.roles || "user",
            }
        },
        validate(form) {
            if (!form.email || !String(form.email).match(/.+@.+\..+/)) {
                return "请输入有效的邮箱地址"
            }

            if (!form.roles) {
                return "请选择用户角色"
            }

            return null
        },
        async update(item, form) {
            await updateUserMutation({
                id: item.id,
                email: String(form.email),
                roles: String(form.roles),
            })
        },
    },
    delete: {
        title: "删除确认",
        description: "确定要删除这个用户吗？",
        async run(item) {
            await deleteUserMutation({ id: item.id })
        },
    },
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
