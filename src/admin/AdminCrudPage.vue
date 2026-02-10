<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { useUIStore } from "@/store/ui"
import type { AdminCrudColumnConfig, AdminCrudConfig, AdminCrudFieldConfig } from "./crud-config"

/**
 * 组件参数定义
 */
const props = defineProps<{
    config: AdminCrudConfig<any>
}>()

const ui = useUIStore()

const loading = ref(false)
const submitting = ref(false)
const page = ref(1)
const items = ref<any[]>([])
const total = ref(0)
const search = ref("")
const filters = reactive<Record<string, string | number>>({})
const selectedKeys = ref<Array<string | number>>([])

const createDialogOpen = ref(false)
const editDialogOpen = ref(false)
const editingItem = ref<any | null>(null)
const createForm = reactive<Record<string, any>>({})
const editForm = reactive<Record<string, any>>({})

/**
 * 计算总页数
 */
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / props.config.pageSize)))

/**
 * 获取列头样式
 * @param column 列配置
 */
function getHeaderClass(column: AdminCrudColumnConfig) {
    return column.headerClass || "px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider"
}

/**
 * 获取单元格样式
 * @param column 列配置
 * @param item 行数据
 * @param value 单元格值
 */
function getCellClass(column: AdminCrudColumnConfig, item: any, value: unknown) {
    if (typeof column.cellClass === "function") {
        return column.cellClass(item, value)
    }
    return column.cellClass || "px-8 py-5 whitespace-nowrap text-sm text-base-content/85"
}

/**
 * 获取标记样式
 * @param column 列配置
 * @param item 行数据
 * @param value 单元格值
 */
function getBadgeClass(column: AdminCrudColumnConfig, item: any, value: unknown) {
    if (typeof column.badgeClass === "function") {
        return column.badgeClass(item, value)
    }
    return column.badgeClass || "badge badge-sm badge-ghost"
}

/**
 * 获取列值
 * @param column 列配置
 * @param item 行数据
 */
function getCellValue(column: AdminCrudColumnConfig, item: any): unknown {
    if (column.accessor) {
        return column.accessor(item)
    }
    return item[column.key]
}

/**
 * 渲染列文本
 * @param column 列配置
 * @param item 行数据
 */
function renderCellText(column: AdminCrudColumnConfig, item: any): string {
    const value = getCellValue(column, item)
    if (column.formatter) {
        return column.formatter(value, item)
    }
    if (value === null || value === undefined || value === "") {
        return "-"
    }
    return String(value)
}

/**
 * 初始化筛选参数
 */
function initFilters() {
    for (const filter of props.config.filters || []) {
        filters[filter.key] = filter.defaultValue ?? ""
    }
}

/**
 * 重置表单
 * @param form 表单对象
 * @param fields 字段配置
 * @param values 目标值
 */
function resetForm(form: Record<string, any>, fields: AdminCrudFieldConfig[], values: Record<string, any>) {
    const keys = Object.keys(form)
    for (const key of keys) {
        delete form[key]
    }

    for (const field of fields) {
        if (values[field.key] !== undefined) {
            form[field.key] = values[field.key]
            continue
        }

        if (field.type === "number") {
            form[field.key] = field.min ?? 0
            continue
        }

        form[field.key] = ""
    }
}

/**
 * 获取创建表单初始值
 */
function getCreateInitialValues() {
    return props.config.form?.createInitialValues?.() || {}
}

/**
 * 获取编辑表单初始值
 * @param item 当前编辑项
 */
function getEditInitialValues(item: any) {
    return props.config.form?.editInitialValues?.(item) || {}
}

/**
 * 刷新列表
 */
async function fetchList() {
    loading.value = true
    try {
        const result = await props.config.fetchList({
            page: page.value,
            pageSize: props.config.pageSize,
            search: search.value,
            filters,
        })
        items.value = result.items || []
        total.value = result.total || 0

        if (props.config.selectable) {
            const validKeys = new Set(items.value.map((item, index) => props.config.rowKey(item, index)))
            selectedKeys.value = selectedKeys.value.filter(key => validKeys.has(key))
        }
    } catch (error) {
        console.error("获取列表失败:", error)
        ui.showErrorMessage("获取列表失败")
    } finally {
        loading.value = false
    }
}

/**
 * 执行查询
 */
function handleSearch() {
    page.value = 1
    fetchList()
}

/**
 * 处理筛选变更
 */
function handleFilterChange() {
    page.value = 1
    fetchList()
}

/**
 * 切换分页
 * @param newPage 页码
 */
function handlePageChange(newPage: number) {
    if (newPage < 1) {
        page.value = 1
    } else if (newPage > totalPages.value) {
        page.value = totalPages.value
    } else {
        page.value = newPage
    }
    fetchList()
}

/**
 * 打开创建对话框
 */
function openCreateDialog() {
    const fields = props.config.form?.fields || []
    resetForm(createForm, fields, getCreateInitialValues())
    createDialogOpen.value = true
}

/**
 * 关闭创建对话框
 */
function closeCreateDialog() {
    createDialogOpen.value = false
}

/**
 * 打开编辑对话框
 * @param item 行数据
 */
function openEditDialog(item: any) {
    editingItem.value = item
    const fields = props.config.form?.fields || []
    resetForm(editForm, fields, getEditInitialValues(item))
    editDialogOpen.value = true
}

/**
 * 关闭编辑对话框
 */
function closeEditDialog() {
    editDialogOpen.value = false
    editingItem.value = null
}

/**
 * 处理创建提交
 */
async function submitCreate() {
    if (!props.config.form?.create) return

    const errorMsg = props.config.form.validate?.(createForm, "create", null)
    if (errorMsg) {
        ui.showErrorMessage(errorMsg)
        return
    }

    submitting.value = true
    try {
        await props.config.form.create(createForm)
        await fetchList()
        closeCreateDialog()
    } catch (error) {
        console.error("创建失败:", error)
        ui.showErrorMessage("创建失败")
    } finally {
        submitting.value = false
    }
}

/**
 * 处理编辑提交
 */
async function submitEdit() {
    if (!props.config.form?.update || !editingItem.value) return

    const errorMsg = props.config.form.validate?.(editForm, "edit", editingItem.value)
    if (errorMsg) {
        ui.showErrorMessage(errorMsg)
        return
    }

    submitting.value = true
    try {
        await props.config.form.update(editingItem.value, editForm)
        await fetchList()
        closeEditDialog()
    } catch (error) {
        console.error("更新失败:", error)
        ui.showErrorMessage("更新失败")
    } finally {
        submitting.value = false
    }
}

/**
 * 处理删除
 * @param item 行数据
 */
async function handleDelete(item: any) {
    if (!props.config.delete) return

    const title = props.config.delete.title || "删除确认"
    const description =
        typeof props.config.delete.description === "function"
            ? props.config.delete.description(item)
            : props.config.delete.description || "确定要删除该记录吗？"

    if (!(await ui.showDialog(title, description))) {
        return
    }

    try {
        await props.config.delete.run(item)
        await fetchList()
    } catch (error) {
        console.error("删除失败:", error)
        ui.showErrorMessage("删除失败")
    }
}

/**
 * 触发行操作
 * @param actionKey 操作键
 * @param item 行数据
 */
async function handleRowAction(actionKey: string, item: any) {
    if (actionKey === "edit") {
        openEditDialog(item)
        return
    }

    if (actionKey === "delete") {
        await handleDelete(item)
        return
    }

    const action = props.config.rowActions?.find(itemAction => itemAction.key === actionKey)
    if (!action) return
    await action.handler(item)
    await fetchList()
}

/**
 * 获取操作按钮样式
 * @param tone 按钮语义
 */
function getActionClass(tone: "primary" | "error" | "neutral" = "neutral") {
    if (tone === "primary") {
        return "text-primary hover:text-primary/80"
    }

    if (tone === "error") {
        return "text-error hover:text-error/80"
    }

    return "text-base-content/80 hover:text-base-content"
}

/**
 * 判断是否支持创建
 */
const canCreate = computed(() => Boolean(props.config.form?.create))

/**
 * 判断是否支持编辑
 */
const canEdit = computed(() => Boolean(props.config.form?.update))

/**
 * 判断是否支持删除
 */
const canDelete = computed(() => Boolean(props.config.delete))

/**
 * 获取创建按钮文字
 */
const createButtonText = computed(() => props.config.form?.createButtonText || `创建${props.config.title}`)

/**
 * 计算选中数据
 */
const selectedItems = computed(() => {
    if (!props.config.selectable) {
        return [] as any[]
    }
    const keySet = new Set(selectedKeys.value)
    return items.value.filter((item, index) => keySet.has(props.config.rowKey(item, index)))
})

/**
 * 判断是否全选
 */
const selectedAll = computed(() => props.config.selectable && items.value.length > 0 && selectedKeys.value.length === items.value.length)

/**
 * 切换单项选择
 * @param item 当前行数据
 * @param index 行下标
 */
function toggleSelectItem(item: any, index: number) {
    if (!props.config.selectable) return
    const key = props.config.rowKey(item, index)
    if (selectedKeys.value.includes(key)) {
        selectedKeys.value = selectedKeys.value.filter(selectedKey => selectedKey !== key)
        return
    }
    selectedKeys.value.push(key)
}

/**
 * 全选或取消全选
 */
function toggleSelectAll() {
    if (!props.config.selectable) return
    if (selectedAll.value) {
        selectedKeys.value = []
        return
    }
    selectedKeys.value = items.value.map((item, index) => props.config.rowKey(item, index))
}

/**
 * 执行批量操作
 * @param actionKey 批量操作键
 */
async function handleBulkAction(actionKey: string) {
    const action = props.config.bulkActions?.find(itemAction => itemAction.key === actionKey)
    if (!action) return
    await action.handler(selectedItems.value)
    await fetchList()
}

/**
 * 初始化页面
 */
onMounted(() => {
    initFilters()
    fetchList()
})
</script>

<template>
    <div class="animate-fadeIn p-6 bg-base-200/50 min-h-screen">
        <div class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
                <h2 class="text-2xl font-semibold text-base-content">{{ config.title }}</h2>
                <p v-if="config.description" class="text-sm text-base-content/70 mt-1">{{ config.description }}</p>
            </div>
            <button
                v-if="canCreate"
                class="btn btn-primary px-6 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 font-medium"
                @click="openCreateDialog"
            >
                <Icon icon="ri:add-line" />
                <span>{{ createButtonText }}</span>
            </button>
        </div>

        <div
            v-if="config.searchPlaceholder || (config.filters && config.filters.length > 0)"
            class="card bg-base-100 shadow-sm border border-base-300 p-6 mb-6 hover:shadow-md transition-all duration-300"
        >
            <div class="flex flex-col md:flex-row gap-4 items-end">
                <div v-if="config.searchPlaceholder" class="flex-1">
                    <input
                        v-model="search"
                        type="text"
                        :placeholder="config.searchPlaceholder"
                        class="input input-bordered w-full"
                        @keyup.enter="handleSearch"
                    />
                </div>

                <template v-for="filter in config.filters || []" :key="filter.key">
                    <div v-if="filter.type === 'select'" class="w-full md:w-48">
                        <select v-model="filters[filter.key]" class="select select-bordered w-full" @change="handleFilterChange">
                            <option value="">全部</option>
                            <option v-for="option in filter.options || []" :key="String(option.value)" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div v-else class="w-full md:w-48">
                        <input
                            v-model="filters[filter.key]"
                            type="text"
                            :placeholder="filter.placeholder || filter.label || ''"
                            class="input input-bordered w-full"
                            @keyup.enter="handleSearch"
                        />
                    </div>
                </template>

                <button class="btn btn-primary px-8" @click="handleSearch">
                    <Icon icon="ri:search-line" />
                    <span>搜索</span>
                </button>
            </div>

            <div v-if="config.selectable && selectedItems.length > 0" class="mt-4 flex items-center gap-2">
                <button class="btn btn-sm btn-ghost" @click="toggleSelectAll">
                    {{ selectedAll ? "取消全选" : "全选" }}
                </button>
                <button
                    v-for="bulkAction in config.bulkActions || []"
                    :key="bulkAction.key"
                    class="btn btn-sm"
                    :class="{
                        'btn-primary': (bulkAction.tone || 'neutral') === 'primary',
                        'btn-error': (bulkAction.tone || 'neutral') === 'error',
                    }"
                    :disabled="selectedItems.length < (bulkAction.minSelected || 1)"
                    @click="handleBulkAction(bulkAction.key)"
                >
                    {{ bulkAction.label }}
                </button>
            </div>
        </div>

        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:shadow-md transition-all duration-300">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead class="bg-base-200">
                        <tr>
                            <th v-if="config.selectable" class="px-4 py-4 text-left w-12">
                                <input type="checkbox" class="checkbox checkbox-sm" :checked="selectedAll" @click="toggleSelectAll" />
                            </th>
                            <th v-for="column in config.columns" :key="column.key" :class="getHeaderClass(column)">{{ column.title }}</th>
                            <th v-if="canEdit || canDelete || (config.rowActions && config.rowActions.length > 0)" class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(item, index) in items"
                            :key="String(config.rowKey(item, index))"
                            class="hover:bg-base-200/50 transition-colors duration-200"
                            :class="{ 'bg-base-200/30': index % 2 === 0 }"
                        >
                            <td v-if="config.selectable" class="px-4 py-5">
                                <input
                                    type="checkbox"
                                    class="checkbox checkbox-sm checkbox-primary"
                                    :checked="selectedKeys.includes(config.rowKey(item, index))"
                                    @click.stop="toggleSelectItem(item, index)"
                                />
                            </td>
                            <td v-for="column in config.columns" :key="column.key" :class="getCellClass(column, item, getCellValue(column, item))">
                                <span v-if="column.type === 'badge'" class="badge badge-sm" :class="getBadgeClass(column, item, getCellValue(column, item))">
                                    {{ renderCellText(column, item) }}
                                </span>
                                <span v-else>{{ renderCellText(column, item) }}</span>
                            </td>
                            <td v-if="canEdit || canDelete || (config.rowActions && config.rowActions.length > 0)" class="px-8 py-5 whitespace-nowrap text-sm font-medium">
                                <div class="flex items-center gap-4">
                                    <button
                                        v-if="canEdit"
                                        class="transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        :class="getActionClass('primary')"
                                        @click="handleRowAction('edit', item)"
                                    >
                                        <Icon icon="ri:edit-line" class="group-hover:scale-110 transition-transform duration-200" />
                                        <span class="group-hover:underline">编辑</span>
                                    </button>
                                    <button
                                        v-if="canDelete"
                                        class="transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        :class="getActionClass('error')"
                                        @click="handleRowAction('delete', item)"
                                    >
                                        <Icon icon="ri:delete-bin-line" class="group-hover:scale-110 transition-transform duration-200" />
                                        <span class="group-hover:underline">删除</span>
                                    </button>

                                    <button
                                        v-for="action in config.rowActions || []"
                                        v-show="action.visible ? action.visible(item) : true"
                                        :key="action.key"
                                        class="transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        :class="getActionClass(action.tone || 'neutral')"
                                        :disabled="action.disabled ? action.disabled(item) : false"
                                        @click="handleRowAction(action.key, item)"
                                    >
                                        <Icon v-if="action.icon" :icon="action.icon" class="group-hover:scale-110 transition-transform duration-200" />
                                        <span class="group-hover:underline">{{ action.label }}</span>
                                    </button>
                                </div>
                            </td>
                        </tr>

                        <tr v-if="!loading && items.length === 0">
                            <td :colspan="config.columns.length + (config.selectable ? 2 : 1)" class="px-8 py-10 text-center text-sm text-base-content/70">
                                {{ config.emptyText || "暂无数据" }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>

            <PageFoot :page="page" :pageSize="config.pageSize" :totalPages="totalPages" :count="total" @update:page="handlePageChange" />
        </div>

        <div v-if="loading" class="absolute inset-0 bg-base-200/60 flex items-center justify-center z-50">
            <span class="loading loading-spinner loading-lg"></span>
        </div>

        <Dialog v-if="canCreate && config.form" v-model:open="createDialogOpen" :title="config.form.createTitle || `创建${config.title}`">
            <template #content>
                <div class="space-y-4 py-4">
                    <div v-for="field in config.form.fields" :key="field.key" class="space-y-2">
                        <label class="text-sm font-medium text-base-content">
                            {{ field.label }}
                            <span v-if="field.required" class="text-error">*</span>
                        </label>

                        <select
                            v-if="field.type === 'select'"
                            v-model="createForm[field.key]"
                            class="select select-bordered w-full"
                            :disabled="submitting"
                        >
                            <option v-for="option in field.options || []" :key="String(option.value)" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>

                        <textarea
                            v-else-if="field.type === 'textarea'"
                            v-model="createForm[field.key]"
                            class="textarea textarea-bordered w-full h-32"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                        ></textarea>

                        <input
                            v-else-if="field.type === 'number'"
                            v-model.number="createForm[field.key]"
                            type="number"
                            class="input input-bordered w-full"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                            :min="field.min"
                            :max="field.max"
                            :step="field.step"
                        />

                        <input
                            v-else
                            v-model="createForm[field.key]"
                            :type="field.type"
                            class="input input-bordered w-full"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                        />
                    </div>
                </div>
            </template>
            <template #actions>
                <button class="btn" :disabled="submitting" @click="closeCreateDialog">取消</button>
                <button class="btn btn-primary" :disabled="submitting" @click="submitCreate">
                    <span v-if="submitting" class="loading loading-spinner loading-sm mr-2"></span>
                    创建
                </button>
            </template>
        </Dialog>

        <Dialog
            v-if="canEdit && config.form"
            v-model:open="editDialogOpen"
            :title="config.form.editTitle || `编辑${config.title}`"
            :description="editingItem ? `编辑记录` : ''"
        >
            <template #content>
                <div class="space-y-4 py-4">
                    <div v-for="field in config.form.fields" :key="field.key" class="space-y-2">
                        <label class="text-sm font-medium text-base-content">
                            {{ field.label }}
                            <span v-if="field.required" class="text-error">*</span>
                        </label>

                        <select
                            v-if="field.type === 'select'"
                            v-model="editForm[field.key]"
                            class="select select-bordered w-full"
                            :disabled="submitting"
                        >
                            <option v-for="option in field.options || []" :key="String(option.value)" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>

                        <textarea
                            v-else-if="field.type === 'textarea'"
                            v-model="editForm[field.key]"
                            class="textarea textarea-bordered w-full h-32"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                        ></textarea>

                        <input
                            v-else-if="field.type === 'number'"
                            v-model.number="editForm[field.key]"
                            type="number"
                            class="input input-bordered w-full"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                            :min="field.min"
                            :max="field.max"
                            :step="field.step"
                        />

                        <input
                            v-else
                            v-model="editForm[field.key]"
                            :type="field.type"
                            class="input input-bordered w-full"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                        />
                    </div>
                </div>
            </template>
            <template #actions>
                <button class="btn" :disabled="submitting" @click="closeEditDialog">取消</button>
                <button class="btn btn-primary" :disabled="submitting" @click="submitEdit">
                    <span v-if="submitting" class="loading loading-spinner loading-sm mr-2"></span>
                    保存
                </button>
            </template>
        </Dialog>
    </div>
</template>

