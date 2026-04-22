<script setup lang="ts">
import {
    createSystemTodoMutation,
    deleteSystemTodoMutation,
    type Todo,
    type TodoInput,
    todosWithCountQuery,
    updateSystemTodoMutation,
} from "@/api/graphql"
import { formatDateTime } from "@/utils/time"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

/**
 * 将后台时间输入转换为时间戳。
 * @param value 时间输入值。
 * @returns 可提交的时间戳；为空或无效时返回 undefined。
 */
function parseTodoDateTime(value: unknown): number | undefined {
    const text = String(value ?? "").trim()
    if (!text) {
        return undefined
    }

    const timestamp = new Date(text.replace(" ", "T")).getTime()
    return Number.isNaN(timestamp) ? undefined : timestamp
}

/**
 * 待办管理页配置
 */
const config: AdminCrudConfig<Todo> = {
    title: "待办事项管理",
    description: "管理系统待办事项和任务",
    pageSize: 20,
    columns: [
        {
            key: "title",
            title: "标题",
            cellClass: "px-8 py-5 text-sm text-base-content font-medium max-w-xs truncate",
        },
        {
            key: "description",
            title: "描述",
            cellClass: "px-8 py-5 text-sm text-base-content/85 max-w-sm truncate",
            formatter: value => String(value || "-"),
        },
        {
            key: "timeRange",
            title: "时间范围",
            accessor: item => ({ startTime: item.startTime, endTime: item.endTime }),
            formatter: value => {
                const range = value as { startTime?: number; endTime?: number }
                if (!range.startTime || !range.endTime) {
                    return "-"
                }
                return `${formatDateTime(range.startTime)} ~ ${formatDateTime(range.endTime)}`
            },
        },
        {
            key: "user",
            title: "创建者",
            accessor: item => item.user?.name,
            formatter: value => String(value || "-"),
        },
        {
            key: "createdAt",
            title: "创建时间",
            cellClass: "px-8 py-5 whitespace-nowrap text-sm text-base-content/70",
            formatter: value => (value ? formatDateTime(Number(value)) : "-"),
        },
    ],
    rowKey: item => item.id,
    async fetchList(params) {
        const result = await todosWithCountQuery(
            {
                limit: params.pageSize,
                offset: (params.page - 1) * params.pageSize,
                type: "system",
            },
            { requestPolicy: "network-only" }
        )

        return {
            items: (result?.todos || []).map(todo => ({
                ...todo,
                description: todo.description ?? "",
                startTime: todo.startTime ?? 0,
                endTime: todo.endTime ?? 0,
            })),
            total: result?.todosCount || 0,
        }
    },
    form: {
        createTitle: "创建待办事项",
        createButtonText: "创建待办事项",
        editTitle: "编辑待办事项",
        fields: [
            {
                key: "title",
                label: "标题",
                type: "text",
                required: true,
                placeholder: "待办事项标题",
            },
            {
                key: "description",
                label: "描述",
                type: "textarea",
                placeholder: "待办事项描述（可选）",
            },
            {
                key: "startTime",
                label: "开始时间",
                type: "datetime-local",
            },
            {
                key: "endTime",
                label: "结束时间",
                type: "datetime-local",
            },
        ],
        createInitialValues() {
            return {
                title: "",
                description: "",
                startTime: "",
                endTime: "",
            }
        },
        editInitialValues(item) {
            return {
                title: item.title,
                description: item.description || "",
                startTime: item.startTime || "",
                endTime: item.endTime || "",
            }
        },
        validate(form) {
            if (!form.title || !String(form.title).trim()) {
                return "请输入待办事项标题"
            }
            return null
        },
        async create(form) {
            const input: TodoInput = {
                title: String(form.title),
                description: form.description ? String(form.description) : undefined,
            }
            input.startTime = parseTodoDateTime(form.startTime)
            input.endTime = parseTodoDateTime(form.endTime)
            await createSystemTodoMutation({ input })
        },
        async update(item, form) {
            const input: TodoInput = {
                title: String(form.title),
                description: form.description ? String(form.description) : undefined,
            }
            input.startTime = parseTodoDateTime(form.startTime)
            input.endTime = parseTodoDateTime(form.endTime)

            await updateSystemTodoMutation({
                id: item.id,
                input,
            })
        },
    },
    delete: {
        title: "删除确认",
        description: "确定要删除这个待办事项吗？",
        async run(item) {
            await deleteSystemTodoMutation({ id: item.id })
        },
    },
}
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
