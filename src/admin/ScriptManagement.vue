<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import {
    deleteScriptMutation,
    pinScriptMutation,
    recommendScriptMutation,
    scriptCategoriesQuery,
    type Script,
    type ScriptCategory,
    scriptsCountQuery,
    scriptsQuery,
    updateScriptMutation,
} from "@/api/graphql"
import AdminCrudPage from "./AdminCrudPage.vue"
import type { AdminCrudConfig } from "./crud-config"

const scriptCategories = ref<ScriptCategory[]>([])
const extraCategoryNames = ref<string[]>([])

/**
 * 获取脚本分类选项。
 * @returns 下拉组件可用的分类选项
 */
const categoryOptions = computed(() => {
    const names = new Set([
        ...scriptCategories.value.map(category => category.name),
        ...extraCategoryNames.value,
    ])
    return [...names].map(name => ({
        label: name,
        value: name,
    }))
})

/**
 * 拉取脚本分类列表。
 */
async function fetchScriptCategories() {
    try {
        const result = await scriptCategoriesQuery(undefined, { requestPolicy: "network-only" })
        scriptCategories.value = result || []
    } catch (error) {
        console.error("获取脚本分类失败:", error)
        scriptCategories.value = []
    }
}

/**
 * 脚本管理页配置
 */
const config = computed<AdminCrudConfig<Script>>(() => ({
    title: "脚本管理",
    description: "管理用户上传的脚本内容",
    pageSize: 10,
    searchPlaceholder: "搜索脚本标题...",
    filters: [
        {
            key: "category",
            type: "select",
            label: "脚本分类",
            options: categoryOptions.value,
        },
    ],
    columns: [
        {
            key: "title",
            title: "标题",
            cellClass: "px-8 py-5 text-sm text-base-content font-medium max-w-xs truncate",
        },
        {
            key: "category",
            title: "分类",
            type: "badge",
            formatter: value => {
                const category = String(value || "")
                return category || "-"
            },
            badgeClass: "badge-ghost",
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
        const variables = {
            limit: params.pageSize,
            offset: (params.page - 1) * params.pageSize,
            search: params.search,
            category: String(params.filters.category || ""),
        }

        const [items, total] = await Promise.all([
            scriptsQuery(variables, { requestPolicy: "network-only" }),
            scriptsCountQuery(
                {
                    search: params.search,
                    category: String(params.filters.category || ""),
                },
                { requestPolicy: "network-only" }
            ),
        ])

        const categoryNames = new Set((items || []).map(item => item.category).filter(Boolean))
        extraCategoryNames.value = [...categoryNames].filter(name => !scriptCategories.value.some(category => category.name === name))

        return {
            items: items || [],
            total: total || 0,
        }
    },
    form: {
        editTitle: "编辑脚本",
        fields: [
            {
                key: "title",
                label: "标题",
                type: "text",
                required: true,
                placeholder: "脚本标题",
            },
            {
                key: "category",
                label: "分类",
                type: "select",
                required: true,
                options: categoryOptions.value,
            },
            {
                key: "description",
                label: "描述",
                type: "textarea",
                placeholder: "脚本描述（可选）",
            },
            {
                key: "content",
                label: "内容",
                type: "textarea",
                required: true,
                placeholder: "脚本内容",
            },
        ],
        editInitialValues(item) {
            return {
                title: item.title,
                description: item.description || "",
                content: item.content,
                category: item.category,
            }
        },
        validate(form) {
            if (!form.title || !String(form.title).trim()) {
                return "请输入脚本标题"
            }
            if (!form.category) {
                return "请选择脚本分类"
            }
            if (!form.content || !String(form.content).trim()) {
                return "请输入脚本内容"
            }
            return null
        },
        async update(item, form) {
            await updateScriptMutation({
                id: item.id,
                input: {
                    title: String(form.title),
                    description: form.description ? String(form.description) : "",
                    content: String(form.content),
                    category: String(form.category),
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
                await pinScriptMutation({ id: item.id, pinned: !item.isPinned })
            },
        },
        {
            key: "toggleRecommend",
            label: "推荐",
            icon: "ri:star-line",
            tone: "neutral",
            async handler(item) {
                await recommendScriptMutation({ id: item.id, recommended: !item.isRecommended })
            },
        },
    ],
    delete: {
        title: "删除确认",
        description: "确定要删除这个脚本吗？",
        async run(item) {
            await deleteScriptMutation({ id: item.id })
        },
    },
}))

onMounted(async () => {
    await fetchScriptCategories()
})
</script>

<template>
    <AdminCrudPage :config="config" />
</template>
