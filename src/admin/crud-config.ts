import type { IconTypes } from "@/components/Icon.vue"

/**
 * 管理后台过滤项选项
 */
export interface AdminCrudFilterOption {
    label: string
    value: string | number
}

/**
 * 管理后台筛选配置
 */
export interface AdminCrudFilterConfig {
    key: string
    label?: string
    type: "text" | "select"
    placeholder?: string
    defaultValue?: string | number
    options?: AdminCrudFilterOption[]
}

/**
 * 管理后台表单字段选项
 */
export interface AdminCrudFieldOption {
    label: string
    value: string | number
}

/**
 * 管理后台表单字段配置
 */
export interface AdminCrudFieldConfig {
    key: string
    label: string
    type: "text" | "email" | "number" | "textarea" | "select" | "datetime-local"
    required?: boolean
    placeholder?: string
    options?: AdminCrudFieldOption[]
    min?: number
    max?: number
    step?: number
}

/**
 * 管理后台表格列配置
 */
export interface AdminCrudColumnConfig<TItem = any> {
    key: string
    title: string
    type?: "text" | "badge"
    headerClass?: string
    cellClass?: string | ((item: TItem, value: unknown) => string)
    badgeClass?: string | ((item: TItem, value: unknown) => string)
    accessor?: (item: TItem) => unknown
    formatter?: (value: unknown, item: TItem) => string
}

/**
 * 行操作按钮样式类型
 */
export type AdminCrudActionTone = "primary" | "error" | "neutral"

/**
 * 管理后台行操作配置
 */
export interface AdminCrudRowActionConfig<TItem = any> {
    key: string
    label: string
    icon?: IconTypes
    tone?: AdminCrudActionTone
    visible?: (item: TItem) => boolean
    disabled?: (item: TItem) => boolean
    handler: (item: TItem) => Promise<void> | void
}

/**
 * 列表查询参数
 */
export interface AdminCrudQueryParams {
    page: number
    pageSize: number
    search: string
    filters: Record<string, string | number>
}

/**
 * 列表查询返回值
 */
export interface AdminCrudQueryResult<TItem = any> {
    items: TItem[]
    total: number
}

/**
 * 管理后台表单配置
 */
export interface AdminCrudFormConfig<TItem = any> {
    fields: AdminCrudFieldConfig[]
    createTitle?: string
    createButtonText?: string
    editTitle?: string
    createInitialValues?: () => Record<string, any>
    editInitialValues?: (item: TItem) => Record<string, any>
    validate?: (form: Record<string, any>, mode: "create" | "edit", item: TItem | null) => string | null
    create?: (form: Record<string, any>) => Promise<void>
    update?: (item: TItem, form: Record<string, any>) => Promise<void>
}

/**
 * 删除配置
 */
export interface AdminCrudDeleteConfig<TItem = any> {
    title?: string
    description?: string | ((item: TItem) => string)
    run: (item: TItem) => Promise<void>
}

/**
 * 管理后台批量操作配置
 */
export interface AdminCrudBulkActionConfig<TItem = any> {
    key: string
    label: string
    tone?: AdminCrudActionTone
    minSelected?: number
    handler: (items: TItem[]) => Promise<void> | void
}

/**
 * 管理后台页面配置
 */
export interface AdminCrudConfig<TItem = any> {
    title: string
    description?: string
    emptyText?: string
    pageSize: number
    searchPlaceholder?: string
    filters?: AdminCrudFilterConfig[]
    columns: AdminCrudColumnConfig<TItem>[]
    fetchList: (params: AdminCrudQueryParams) => Promise<AdminCrudQueryResult<TItem>>
    rowKey: (item: TItem, index: number) => string | number
    form?: AdminCrudFormConfig<TItem>
    delete?: AdminCrudDeleteConfig<TItem>
    rowActions?: AdminCrudRowActionConfig<TItem>[]
    selectable?: boolean
    bulkActions?: AdminCrudBulkActionConfig<TItem>[]
}
