/**
 * 追伤七分量（武器面板口径）：`追加伤害` 是面板上的只读聚合，不得作为属性输入。
 * 伤害分池：武器池 `max(0, 1 + Σ 面板七分量)`，技能池只吃 `技能追伤`，两者不交叉。
 * 旧字面 `追加伤害` 在汇总入口迁移为 `自属性追伤`；动态 code 的裸写入重定向到当前面板。
 */

/** 追伤分量键的公共后缀：`<元素>属性追伤` */
const ADDITIONAL_DAMAGE_SUFFIX = "属性追伤"

/** 六元素追伤分量键（顺序与 U62 元素增伤字段一致） */
export const ADDITIONAL_DAMAGE_ELEMENT_KEYS = ["火属性追伤", "水属性追伤", "雷属性追伤", "风属性追伤", "光属性追伤", "暗属性追伤"] as const

/** 自属性追伤：按角色自身元素结算，对任意元素角色生效 */
export const SELF_ADDITIONAL_DAMAGE_KEY = "自属性追伤"

/**
 * `<元素>属性追伤` 键 → 元素名。
 * @param key 追伤分量键
 * @returns 元素名（如 `火属性追伤` → `火`）；非分量键原样返回
 */
export function additionalDamageElementOf(key: string): string {
    return key.endsWith(ADDITIONAL_DAMAGE_SUFFIX) ? key.slice(0, -ADDITIONAL_DAMAGE_SUFFIX.length) : key
}

/**
 * 推导 DOT 其余属性元素种数 = `{角色元素} ∪ {六元素追伤非零项}` 去重后 - 1。
 *
 * 自属性追伤并入角色元素桶、不新增元素；`技能追伤` 不计入（技能来源不产生其余属性）。
 * 非零按有限且 `!== 0` 判定（负值也视为存在该元素）。
 * @param record 属性记录（该来源的武器面板）
 * @param charElement 角色自身元素
 * @returns 其余属性元素种数（≥ 0）
 */
export function additionalDamageDotElementCount(record: object | undefined | null, charElement: string): number {
    const elements = new Set<string>([charElement])
    if (record) {
        const values = record as Record<string, unknown>
        for (const key of ADDITIONAL_DAMAGE_ELEMENT_KEYS) {
            const value = values[key]
            if (typeof value === "number" && Number.isFinite(value) && value !== 0) elements.add(additionalDamageElementOf(key))
        }
    }
    return Math.max(0, elements.size - 1)
}

/** 七分量键（六元素 + 自属性） */
export const ADDITIONAL_DAMAGE_KEYS = [...ADDITIONAL_DAMAGE_ELEMENT_KEYS, SELF_ADDITIONAL_DAMAGE_KEY] as const

/** 旧聚合键：只读聚合，装载时迁移为 自属性追伤 */
export const LEGACY_ADDITIONAL_DAMAGE_KEY = "追加伤害"

/** 已告警的迁移来源：同一来源只告警一次，避免属性热路径刷屏 */
const warnedSources = new Set<string>()

/**
 * 记录一次旧 `追加伤害` 键的迁移告警。
 * @param source 来源描述（数据文件 / MOD / BUFF / 动态表达式等）
 */
export function warnLegacyAdditionalDamage(source: string): void {
    if (warnedSources.has(source)) return
    warnedSources.add(source)
    console.warn(`[追伤] ${source} 使用旧属性键「${LEGACY_ADDITIONAL_DAMAGE_KEY}」，已按「${SELF_ADDITIONAL_DAMAGE_KEY}」计入`)
}

/** 清空告警去重缓存（测试用） */
export function resetAdditionalDamageWarnings(): void {
    warnedSources.clear()
}

/**
 * 旧属性键 → 规范化键。
 * @param key 属性键
 * @returns `追加伤害` 迁移为 `自属性追伤`，其余原样返回
 */
export function normalizeAdditionalDamageKey(key: string): string {
    return key === LEGACY_ADDITIONAL_DAMAGE_KEY ? SELF_ADDITIONAL_DAMAGE_KEY : key
}

/**
 * 求七分量之和（忽略缺失与非有限数值）。
 * @param record 属性记录（CharAttr / WeaponAttr / MOD 属性 / BUFF 数值表）
 * @returns 追伤聚合值
 */
export function sumAdditionalDamage(record: object | undefined | null): number {
    if (!record) return 0
    const values = record as Record<string, unknown>
    let sum = 0
    for (const key of ADDITIONAL_DAMAGE_KEYS) {
        const value = values[key]
        if (typeof value === "number" && Number.isFinite(value)) sum += value
    }
    return sum
}

/**
 * 把聚合值写成七分量之和（只读聚合语义）。
 * @param record 属性记录
 * @returns 原记录（便于链式调用）
 */
export function recomputeAdditionalDamage<T extends object>(record: T): T {
    ;(record as Record<string, unknown>)[LEGACY_ADDITIONAL_DAMAGE_KEY] = sumAdditionalDamage(record)
    return record
}

/** 读取有限数值，其余按 0 处理 */
function finiteNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** 动态 code 执行前在角色沙盒写入 0 值追伤键，让旧 code 的裸写落回沙盒（不作为角色属性输出） */
export function seedCharAdditionalDamage(attrs: object): void {
    const values = attrs as Record<string, unknown>
    for (const key of ADDITIONAL_DAMAGE_KEYS) if (typeof values[key] !== "number") values[key] = 0
    if (typeof values[LEGACY_ADDITIONAL_DAMAGE_KEY] !== "number") values[LEGACY_ADDITIONAL_DAMAGE_KEY] = 0
}

/** 动态 code 执行后把角色沙盒里的裸追伤写入重定向到武器面板，并移除角色侧键 */
export function redirectCharAdditionalDamage(attrs: object, panel: object | undefined, source: string): void {
    const values = attrs as Record<string, unknown>
    const panelValues = panel as Record<string, unknown> | undefined
    const componentKeys = ADDITIONAL_DAMAGE_KEYS.filter(key => {
        const value = values[key]
        return typeof value === "number" && Number.isFinite(value) && value !== 0
    })
    const legacy = values[LEGACY_ADDITIONAL_DAMAGE_KEY]
    const hasAggregate = typeof legacy === "number" && Number.isFinite(legacy) && legacy !== 0
    if (componentKeys.length > 0 || hasAggregate) {
        warnCharAdditionalDamageRedirect(source, !panelValues)
        if (panelValues) {
            for (const key of componentKeys) panelValues[key] = finiteNumber(panelValues[key]) + (values[key] as number)
            // 聚合写入没有分量信息：按自属性分量累加，不覆盖面板已有来源
            if (hasAggregate)
                panelValues[SELF_ADDITIONAL_DAMAGE_KEY] = finiteNumber(panelValues[SELF_ADDITIONAL_DAMAGE_KEY]) + (legacy as number)
            recomputeAdditionalDamage(panelValues)
        }
    }
    for (const key of ADDITIONAL_DAMAGE_KEYS) delete values[key]
    delete values[LEGACY_ADDITIONAL_DAMAGE_KEY]
}

/** 记录一次「角色属性追伤写入已重定向」的告警（同一来源只告警一次） */
function warnCharAdditionalDamageRedirect(source: string, noPanel: boolean): void {
    const warnKey = `redirect:${source}`
    if (warnedSources.has(warnKey)) return
    warnedSources.add(warnKey)
    console.warn(
        noPanel
            ? `[追伤] ${source} 写入了角色属性追伤，但角色不持有追伤且当前无武器面板，已忽略`
            : `[追伤] ${source} 写入角色属性追伤，已重定向到当前武器面板`
    )
}

/**
 * 记录一次「追伤元素后缀无法识别」的告警。
 * @param attr 原始属性名（如 `BonusDamage_Normal`）
 */
export function warnUnknownChaseSuffix(attr: string): void {
    const source = `追伤属性「${attr}」的元素无法识别`
    if (warnedSources.has(source)) return
    warnedSources.add(source)
    console.warn(`[追伤] ${source}，已按「${SELF_ADDITIONAL_DAMAGE_KEY}」计入`)
}

/** 旧 code 对聚合字段的写入方式 */
export type AggregateWriteMode = "scale" | "add" | "assign" | "mixed"

/**
 * 判断动态 code 是否对任一追伤分量做了赋值（排除 `==` 比较与只读引用）。
 * 同一段 code 既写聚合又写分量时，缩放/覆盖都不能整体套用，需按差值迁移。
 * @param compact 去除空白后的代码
 * @returns 是否写入了分量键
 */
function writesAdditionalDamageComponent(compact: string): boolean {
    return ADDITIONAL_DAMAGE_KEYS.some(key => new RegExp(`${key}(?:\\*=|\\/=|\\+=|-=|=)(?!=)`).test(compact))
}

/**
 * 从动态 code 推断对 `追加伤害` 的写入方式。
 *
 * 复合赋值：`*=` / `/=` → 七分量同比例缩放；`+=` / `-=` → 差值记入 `自属性追伤`。
 * 展开写法（`= 追加伤害 * k` / `= 追加伤害 + c`）按同一口径识别；纯赋值（`= 数值`）→ 覆盖式写入。
 * 同一段 code 还写入了任一分量键时返回 `mixed`：分量保留显式写入，聚合差值记入 `自属性追伤`，
 * 避免缩放对显式分量重复生效。无法识别时返回 undefined，由调用方按差值兜底。
 * @param code BUFF / 特效的动态代码
 * @returns 写入方式
 */
export function classifyAggregateWrite(code: string | undefined): AggregateWriteMode | undefined {
    if (!code?.includes(LEGACY_ADDITIONAL_DAMAGE_KEY)) return undefined
    const key = LEGACY_ADDITIONAL_DAMAGE_KEY
    const compact = code.replace(/\s+/g, "")
    // 同一段 code 还写入了分量：按差值兜底，显式分量写入不得再被整体缩放/覆盖
    if (writesAdditionalDamageComponent(compact)) return "mixed"
    if (compact.includes(`${key}*=`) || compact.includes(`${key}/=`)) return "scale"
    if (compact.includes(`${key}+=`) || compact.includes(`${key}-=`)) return "add"
    const assignIndex = compact.indexOf(`${key}=`)
    if (assignIndex < 0) return undefined
    // `追加伤害==...` 是比较而非写入
    if (compact[assignIndex + key.length + 1] === "=") return undefined
    const rhsStart = assignIndex + key.length + 1
    const rest = compact.slice(rhsStart)
    const end = rest.search(/[;},]/)
    const expression = end >= 0 ? rest.slice(0, end) : rest
    if (expression.includes(key)) {
        if (expression.includes("*") || expression.includes("/")) return "scale"
        if (expression.includes("+") || expression.includes("-")) return "add"
    }
    return "assign"
}

/** 聚合写入的迁移告警（同一来源只告警一次） */
function warnAggregateWrite(source: string, mode: AggregateWriteMode | undefined): void {
    const warnKey = `aggregate:${source}`
    if (warnedSources.has(warnKey)) return
    warnedSources.add(warnKey)
    const detail =
        mode === "scale"
            ? "按七分量同比例缩放"
            : mode === "mixed"
              ? `检测到分量写入，聚合差值记入「${SELF_ADDITIONAL_DAMAGE_KEY}」`
              : mode === "assign"
                ? `覆盖为「${SELF_ADDITIONAL_DAMAGE_KEY}」并清零其余六分量`
                : `按差值记入「${SELF_ADDITIONAL_DAMAGE_KEY}」`
    console.warn(`[追伤] ${source} 直接改写只读聚合「${LEGACY_ADDITIONAL_DAMAGE_KEY}」，已${detail}`)
}

/**
 * 旧 code 直接改写聚合 `追加伤害` 时，把写入迁移到七分量并重算聚合。
 *
 * - `*= / /=`：七分量同比例缩放（保持元素匹配口径）；
 * - `+= / -=`：差值记入 `自属性追伤`；
 * - 纯 `=`：覆盖为 `自属性追伤`，其余六分量清零；
 * - 聚合与分量混合写入：分量保留显式写入，聚合差值记入 `自属性追伤`（不重复缩放）；
 * - 无法识别：按差值兜底（不丢伤害）。
 * @param record 属性记录
 * @param before code 执行前的聚合值
 * @param source 告警来源
 * @param code 动态代码（用于识别写入方式）
 */
export function migrateAggregateAdditionalDamage(record: object, before: number, source: string, code?: string): void {
    const values = record as Record<string, unknown>
    const current = values[LEGACY_ADDITIONAL_DAMAGE_KEY]
    if (typeof current === "number" && Number.isFinite(current) && current !== before) {
        const mode = classifyAggregateWrite(code)
        warnAggregateWrite(source, mode)
        if (mode === "scale") {
            const factor = before !== 0 ? current / before : 1
            for (const key of ADDITIONAL_DAMAGE_KEYS) {
                const value = values[key]
                values[key] = (typeof value === "number" ? value : 0) * factor
            }
        } else if (mode === "assign") {
            for (const key of ADDITIONAL_DAMAGE_ELEMENT_KEYS) values[key] = 0
            values[SELF_ADDITIONAL_DAMAGE_KEY] = current
        } else {
            const self = values[SELF_ADDITIONAL_DAMAGE_KEY]
            values[SELF_ADDITIONAL_DAMAGE_KEY] = (typeof self === "number" ? self : 0) + (current - before)
        }
    }
    recomputeAdditionalDamage(record)
}
