<script setup lang="ts">
import { deleteUserMutation, type User, updateUserMutation, usersWithCountQuery } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

const ui = useUIStore()

/**
 * @description 复制用户 ID，方便后台直接发放商品等操作。
 * @param item 用户记录。
 */
async function copyUserId(item: User) {
    await navigator.clipboard.writeText(item.id)
    ui.showSuccessMessage(`已复制用户 ID: ${item.id}`)
}

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
            key: "level",
            title: "等级",
            formatter: value => `Lv.${String(value || 1)}`,
        },
        {
            key: "experience",
            title: "经验",
            formatter: value => String(value || 0),
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
    rowActions: [
        {
            key: "copy-id",
            label: "复制ID",
            icon: "ri:file-copy-line",
            handler: copyUserId,
        },
    ],
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
