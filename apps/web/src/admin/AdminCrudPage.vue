<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { useUIStore } from "@/store/ui"
import AdminPageHeader from "./AdminPageHeader.vue"
import {
    ADMIN_BADGE,
    ADMIN_BADGE_ERROR,
    ADMIN_BADGE_NEUTRAL,
    ADMIN_BADGE_PRIMARY,
    ADMIN_BADGE_SUCCESS,
    ADMIN_BADGE_WARNING,
    ADMIN_BTN,
    ADMIN_BTN_PRIMARY,
    ADMIN_CHIP,
    ADMIN_CHIP_OFF,
    ADMIN_CHIP_ON,
    ADMIN_EMPTY,
    ADMIN_INPUT,
    ADMIN_INPUT_NUM,
    ADMIN_NUM,
    ADMIN_ROW,
    ADMIN_ROW_ACTION,
    ADMIN_ROW_TONE_ERROR,
    ADMIN_ROW_TONE_NEUTRAL,
    ADMIN_ROW_TONE_PRIMARY,
    ADMIN_STAT_CELL,
    ADMIN_STAT_LABEL,
    ADMIN_STAT_VALUE,
    ADMIN_TD,
    ADMIN_TH,
} from "./admin-ui"
import type { AdminCrudColumnConfig, AdminCrudConfig, AdminCrudFieldConfig, AdminCrudFilterConfig } from "./crud-config"

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
 * 获取单元格样式
 * @param column 列配置
 * @param item 行数据
 * @param value 单元格值
 */
function getCellClass(column: AdminCrudColumnConfig, item: any, value: unknown) {
    const extra = typeof column.cellClass === "function" ? column.cellClass(item, value) : column.cellClass
    return [ADMIN_TD, extra].filter(Boolean).join(" ")
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
 * 方章配色：按列名语义给三种色，未命中一律中性
 * @param column 列配置
 * @param item 行数据
 */
function badgeClassOf(column: AdminCrudColumnConfig, item: any) {
    const extra = typeof column.badgeClass === "function" ? column.badgeClass(item, getCellValue(column, item)) : column.badgeClass
    return [ADMIN_BADGE, sanitizeBadgeClass(extra)].filter(Boolean).join(" ")
}

/**
 * 兼容历史配置里遗留的 daisyUI 徽章类：颜色用 admin 方章令牌替代，其余（badge / badge-sm 等）丢弃，
 * 避免组件库的徽章配色把文字压成深色、在深色主题下读不清。
 * @param raw 列配置给的类名
 */
function sanitizeBadgeClass(raw?: string) {
    if (!raw) return ADMIN_BADGE_NEUTRAL
    const tokens = raw.split(/\s+/).filter(Boolean)
    const legacy = tokens.filter(token => token === "badge" || token.startsWith("badge-"))
    if (legacy.length === 0) return raw
    const toneMap: Record<string, string> = {
        "badge-primary": ADMIN_BADGE_PRIMARY,
        "badge-secondary": ADMIN_BADGE_PRIMARY,
        "badge-accent": ADMIN_BADGE_PRIMARY,
        "badge-info": ADMIN_BADGE_SUCCESS,
        "badge-success": ADMIN_BADGE_SUCCESS,
        "badge-warning": ADMIN_BADGE_WARNING,
        "badge-error": ADMIN_BADGE_ERROR,
        "badge-ghost": ADMIN_BADGE_NEUTRAL,
        "badge-neutral": ADMIN_BADGE_NEUTRAL,
    }
    const rest = tokens.filter(token => !legacy.includes(token))
    const tone = legacy.map(token => toneMap[token]).find(Boolean) || ADMIN_BADGE_NEUTRAL
    return [...rest, tone].join(" ")
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
 * 将字段值标准化为表单控件可接受的值。
 * @param field 字段配置
 * @param value 原始字段值
 * @returns 表单字段值
 */
function normalizeFormFieldValue(field: AdminCrudFieldConfig, value: unknown) {
    if (field.type !== "datetime-local" || value === null || value === undefined || value === "") {
        return value
    }

    const date =
        value instanceof Date
            ? value
            : typeof value === "number" || /^\d+$/.test(String(value).trim())
              ? new Date(Number(value))
              : new Date(String(value).replace(" ", "T"))

    if (Number.isNaN(date.getTime())) {
        return ""
    }

    const pad = (item: number) => String(item).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
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
            form[field.key] = normalizeFormFieldValue(field, values[field.key])
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
 * 当前是否有任何检索条件（用于空态文案区分「没数据」与「没匹配」）
 */
const hasQuery = computed(() => {
    if (search.value.trim()) return true
    return Object.values(filters).some(value => value !== "" && value !== null && value !== undefined)
})

/**
 * 清空所有检索条件
 */
function resetQuery() {
    search.value = ""
    initFilters()
    handleSearch()
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
 * 删除行数据
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
 * 行操作按钮语义色
 * @param tone 按钮语义
 */
function getActionClass(tone: "primary" | "error" | "neutral" = "neutral") {
    if (tone === "primary") {
        return ADMIN_ROW_TONE_PRIMARY
    }

    if (tone === "error") {
        return ADMIN_ROW_TONE_ERROR
    }

    return ADMIN_ROW_TONE_NEUTRAL
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
 * 是否显示操作列
 */
const hasRowActions = computed(() => canEdit.value || canDelete.value || (props.config.rowActions || []).length > 0)

/**
 * 表格总列数（用于空态跨列）
 */
const columnSpan = computed(
    () => props.config.columns.length + (props.config.selectable ? 1 : 0) + (hasRowActions.value ? 1 : 0)
)

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
const selectedAll = computed(
    () => props.config.selectable && items.value.length > 0 && selectedKeys.value.length === items.value.length
)

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

/** 下拉型筛选的可选项：显式给了空值选项就用配置的，否则补一个「全部」 */
function filterOptions(filter: AdminCrudFilterConfig) {
    const options = filter.options || []
    if (options.some(option => option.value === "")) {
        return options
    }
    return [{ label: "全部", value: "" }, ...options]
}

/** 文本型筛选是否填了值（决定方章是否高亮） */
function hasFilterValue(filter: AdminCrudFilterConfig) {
    const value = filters[filter.key]
    return value !== "" && value !== null && value !== undefined
}

/** 当前页数量（统计开本里可诚实推导的量） */
const pageCount = computed(() => items.value.length)

/**
 * 初始化页面
 */
onMounted(() => {
    initFilters()
    fetchList()
})
</script>

<template>
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-5">
        <AdminPageHeader kicker="Records" :title="config.title" :description="config.description">
            <template #actions>
                <button v-if="canCreate" :class="ADMIN_BTN_PRIMARY" @click="openCreateDialog">
                    <Icon icon="ri:add-line" class="h-3.5 w-3.5" />
                    <span>{{ createButtonText }}</span>
                </button>
            </template>
        </AdminPageHeader>

        <!-- 统计开本：只放接口能给口径的量（总数 + 本页条数 + 页码），不做推算 -->
        <div class="flex border-b border-base-content/10">
            <div :class="ADMIN_STAT_CELL" class="pl-0">
                <p :class="ADMIN_STAT_LABEL">Total</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ total.toLocaleString() }}</span>
                    <span class="text-[10.5px] text-base-content/40">条</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">On Page</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ pageCount }}</span>
                    <span class="text-[10.5px] text-base-content/40">条</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Page</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ page }}</span>
                    <span class="text-[10.5px] text-base-content/40">/ {{ totalPages }}</span>
                </p>
            </div>
            <button
                v-if="config.selectable"
                :class="ADMIN_STAT_CELL"
                class="cursor-pointer text-left transition-colors duration-150 hover:bg-base-content/4"
                @click="toggleSelectAll"
            >
                <p :class="ADMIN_STAT_LABEL">Selected</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="[ADMIN_NUM, selectedItems.length ? 'text-primary' : '']">{{ selectedItems.length }}</span>
                    <span class="text-[10.5px] text-base-content/40">项</span>
                </p>
            </button>
            <div class="ml-auto flex items-center pr-0.5 text-[10.5px] text-base-content/35">
                {{ loading ? "同步中…" : "已同步" }}
            </div>
        </div>

        <!-- 检索条：下划线输入 + 方章筛选 + 方章按钮 -->
        <div
            v-if="config.searchPlaceholder || (config.filters && config.filters.length > 0)"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-base-content/10 py-2.5"
        >
            <div v-if="config.searchPlaceholder" class="relative w-full max-w-72">
                <Icon icon="ri:search-line" class="absolute top-1/2 left-0 h-3.5 w-3.5 -translate-y-1/2 text-base-content/35" />
                <input
                    v-model="search"
                    type="text"
                    :placeholder="config.searchPlaceholder"
                    :class="ADMIN_INPUT"
                    class="pr-10 pl-5"
                    @keyup.enter="handleSearch"
                />
                <kbd
                    class="pointer-events-none absolute right-0 bottom-1.5 border border-base-content/15 px-1 text-[9px] tracking-[0.08em] text-base-content/30"
                >
                    ENTER
                </kbd>
            </div>

            <template v-for="filter in config.filters || []" :key="filter.key">
                <!-- 下拉型筛选用方章组，避免引入第二套表单控件 -->
                <div v-if="filter.type === 'select'" class="flex flex-wrap items-center gap-1">
                    <span v-if="filter.label" class="mr-0.5 shrink-0 text-[10.5px] tracking-wide text-base-content/40">{{ filter.label }}</span>
                    <button
                        v-for="option in filterOptions(filter)"
                        :key="String(option.value)"
                        :class="[ADMIN_CHIP, filters[filter.key] === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="
                            filters[filter.key] = option.value;
                            handleFilterChange()
                        "
                    >
                        {{ option.label }}
                    </button>
                </div>
                <div v-else class="relative w-36">
                    <input
                        v-model="filters[filter.key]"
                        type="text"
                        :placeholder="filter.placeholder || filter.label || ''"
                        :class="[ADMIN_INPUT, 'pr-3', hasFilterValue(filter) ? 'border-primary/60' : '']"
                        @keyup.enter="handleSearch"
                    />
                </div>
            </template>

            <button :class="ADMIN_BTN" @click="handleSearch">
                <Icon icon="ri:search-line" class="h-3.25 w-3.25" />
                <span>查询</span>
            </button>
            <button v-if="hasQuery" :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" @click="resetQuery">重置</button>

            <span class="ml-auto font-orbitron text-[11px] tabular-nums text-base-content/40">{{ total }} 条</span>
        </div>

        <!-- 批量操作条 -->
        <div
            v-if="config.selectable && selectedItems.length > 0"
            class="flex flex-wrap items-center gap-2 border-b border-base-content/10 bg-primary/5 px-1 py-1.5"
        >
            <span class="font-orbitron text-[11px] tabular-nums text-primary">已选 {{ selectedItems.length }}</span>
            <button :class="ADMIN_BTN" @click="toggleSelectAll">{{ selectedAll ? "取消全选" : "全选本页" }}</button>
            <button
                v-for="bulkAction in config.bulkActions || []"
                :key="bulkAction.key"
                :class="[
                    ADMIN_BTN,
                    bulkAction.tone === 'error' ? 'border-error/50 text-error hover:border-error' : '',
                    bulkAction.tone === 'primary' ? 'border-primary/60 text-primary' : '',
                ]"
                :disabled="selectedItems.length < (bulkAction.minSelected || 1)"
                @click="handleBulkAction(bulkAction.key)"
            >
                {{ bulkAction.label }}
            </button>
            <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" class="ml-auto" @click="selectedKeys = []">清空选择</button>
        </div>

        <div class="relative min-w-0 flex-1">
            <div v-if="loading" class="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/15">
                <div class="h-full w-1/3 animate-pulse bg-primary" />
            </div>

            <ScrollArea horizontal>
                <table class="w-full min-w-170 border-collapse text-left">
                    <thead>
                        <tr class="bg-base-content/3">
                            <th v-if="config.selectable" class="w-9" :class="ADMIN_TH">
                                <input
                                    type="checkbox"
                                    class="admin-check"
                                    :checked="selectedAll"
                                    @click="toggleSelectAll"
                                />
                            </th>
                            <th v-for="column in config.columns" :key="column.key" :class="[ADMIN_TH, column.headerClass]">
                                {{ column.title }}
                            </th>
                            <th v-if="hasRowActions" class="text-right" :class="ADMIN_TH">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(item, index) in items"
                            :key="String(config.rowKey(item, index))"
                            :class="[ADMIN_ROW, selectedKeys.includes(config.rowKey(item, index)) ? 'bg-primary/8' : '']"
                        >
                            <td v-if="config.selectable" :class="ADMIN_TD">
                                <input
                                    type="checkbox"
                                    class="admin-check"
                                    :checked="selectedKeys.includes(config.rowKey(item, index))"
                                    @click.stop="toggleSelectItem(item, index)"
                                />
                            </td>
                            <td
                                v-for="column in config.columns"
                                :key="column.key"
                                :class="getCellClass(column, item, getCellValue(column, item))"
                            >
                                <span v-if="column.type === 'badge'" :class="badgeClassOf(column, item)">
                                    {{ renderCellText(column, item) }}
                                </span>
                                <span v-else>{{ renderCellText(column, item) }}</span>
                            </td>
                            <td v-if="hasRowActions" class="text-right" :class="ADMIN_TD">
                                <div class="flex items-center justify-end gap-2.5 whitespace-nowrap">
                                    <button
                                        v-if="canEdit"
                                        :class="[ADMIN_ROW_ACTION, getActionClass('primary')]"
                                        @click="handleRowAction('edit', item)"
                                    >
                                        编辑
                                    </button>
                                    <button
                                        v-if="canDelete"
                                        :class="[ADMIN_ROW_ACTION, getActionClass('error')]"
                                        @click="handleRowAction('delete', item)"
                                    >
                                        删除
                                    </button>
                                    <button
                                        v-for="action in config.rowActions || []"
                                        v-show="action.visible ? action.visible(item) : true"
                                        :key="action.key"
                                        :class="[ADMIN_ROW_ACTION, getActionClass(action.tone || 'neutral')]"
                                        :disabled="action.disabled ? action.disabled(item) : false"
                                        @click="handleRowAction(action.key, item)"
                                    >
                                        {{ action.label }}
                                    </button>
                                </div>
                            </td>
                        </tr>

                        <tr v-if="!loading && items.length === 0">
                            <td :colspan="columnSpan" class="border-b border-base-content/10">
                                <div :class="ADMIN_EMPTY">
                                    <Icon icon="ri:inbox-line" class="h-6.5 w-6.5 text-base-content/20" />
                                    <p class="text-[12.5px] text-base-content/55">
                                        {{ hasQuery ? "没有符合条件的结果" : config.emptyText || "暂无数据" }}
                                    </p>
                                    <button v-if="hasQuery" :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_PRIMARY]" class="mt-1" @click="resetQuery">
                                        清空检索条件
                                    </button>
                                    <button v-else-if="canCreate" :class="ADMIN_BTN" class="mt-1" @click="openCreateDialog">
                                        <Icon icon="ri:add-line" class="h-3.25 w-3.25" />
                                        <span>{{ createButtonText }}</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>

            <PageFoot :page="page" :pageSize="config.pageSize" :totalPages="totalPages" :count="total" @update:page="handlePageChange" />
        </div>

        <Dialog v-if="canCreate && config.form" v-model:open="createDialogOpen" :title="config.form.createTitle || `创建${config.title}`">
            <template #content>
                <div class="space-y-4 py-1">
                    <div v-for="field in config.form.fields" :key="field.key" class="space-y-1.5">
                        <label class="block text-[11px] tracking-wide text-base-content/55">
                            {{ field.label }}
                            <span v-if="field.required" class="text-error">*</span>
                        </label>

                        <Select v-if="field.type === 'select'" v-model="createForm[field.key]" class="w-full" :disabled="submitting">
                            <SelectItem v-for="option in field.options || []" :key="String(option.value)" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </Select>

                        <textarea
                            v-else-if="field.type === 'textarea'"
                            v-model="createForm[field.key]"
                            :class="ADMIN_INPUT"
                            class="h-24 resize-none py-1"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                        ></textarea>

                        <input
                            v-else-if="field.type === 'number'"
                            v-model.number="createForm[field.key]"
                            type="number"
                            :class="ADMIN_INPUT_NUM"
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
                            :class="ADMIN_INPUT"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                        />
                    </div>
                </div>
            </template>
            <template #actions>
                <div class="flex justify-end gap-2">
                    <button :class="ADMIN_BTN" :disabled="submitting" @click="closeCreateDialog">取消</button>
                    <button :class="ADMIN_BTN_PRIMARY" :disabled="submitting" @click="submitCreate">
                        {{ submitting ? "创建中…" : "创建" }}
                    </button>
                </div>
            </template>
        </Dialog>

        <Dialog
            v-if="canEdit && config.form"
            v-model:open="editDialogOpen"
            :title="config.form.editTitle || `编辑${config.title}`"
            :description="editingItem ? '编辑记录' : ''"
        >
            <template #content>
                <div class="space-y-4 py-1">
                    <div v-for="field in config.form.fields" :key="field.key" class="space-y-1.5">
                        <label class="block text-[11px] tracking-wide text-base-content/55">
                            {{ field.label }}
                            <span v-if="field.required" class="text-error">*</span>
                        </label>

                        <Select v-if="field.type === 'select'" v-model="editForm[field.key]" class="w-full" :disabled="submitting">
                            <SelectItem v-for="option in field.options || []" :key="String(option.value)" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </Select>

                        <textarea
                            v-else-if="field.type === 'textarea'"
                            v-model="editForm[field.key]"
                            :class="ADMIN_INPUT"
                            class="h-24 resize-none py-1"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                        ></textarea>

                        <input
                            v-else-if="field.type === 'number'"
                            v-model.number="editForm[field.key]"
                            type="number"
                            :class="ADMIN_INPUT_NUM"
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
                            :class="ADMIN_INPUT"
                            :placeholder="field.placeholder"
                            :disabled="submitting"
                        />
                    </div>
                </div>
            </template>
            <template #actions>
                <div class="flex justify-end gap-2">
                    <button :class="ADMIN_BTN" :disabled="submitting" @click="closeEditDialog">取消</button>
                    <button :class="ADMIN_BTN_PRIMARY" :disabled="submitting" @click="submitEdit">
                        {{ submitting ? "保存中…" : "保存" }}
                    </button>
                </div>
            </template>
        </Dialog>
    </div>
</template>