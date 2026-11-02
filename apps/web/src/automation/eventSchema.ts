/** 条件字段/值枚举：规则编辑器的字段列与值列只允许下拉选择，不再手输。 */
import { MIHAN_TYPES } from "@/utils/mihan-meta"

export interface CondValueOption {
    value: string | number
    labelKey?: string
    label?: string
}

export interface CondFieldDef {
    field: string
    labelKey: string
    /** 枚举值（下拉框）；"dungeons" 表示从账本副本列表取；缺省为自由文本。 */
    values?: CondValueOption[] | "dungeons"
}

/** 事件 kind → 可匹配字段（data 单层键）。 */
export const EVENT_SCHEMA: Record<string, CondFieldDef[]> = {
    dungeon: [
        {
            field: "status",
            labelKey: "automation.field_status",
            values: [
                { value: "enter", labelKey: "automation.value_enter" },
                { value: "complete", labelKey: "automation.value_complete" },
            ],
        },
        { field: "id", labelKey: "automation.field_id", values: "dungeons" },
        { field: "name", labelKey: "automation.field_name" },
    ],
    reward: [
        { field: "name", labelKey: "automation.field_name" },
        {
            field: "rarity",
            labelKey: "automation.field_rarity",
            values: [5, 4, 3, 2, 1].map(n => ({ value: n, labelKey: `afk-ledger.rarity_${n}` })),
        },
        { field: "count", labelKey: "automation.field_count" },
    ],
    craft: [{ field: "name", labelKey: "automation.field_name" }],
    character: [
        { field: "state", labelKey: "automation.field_state" },
        { field: "scene", labelKey: "automation.field_scene" },
        { field: "name", labelKey: "automation.field_name" },
    ],
    monster: [{ field: "id", labelKey: "automation.field_id" }],
    chat: [
        { field: "team", labelKey: "automation.field_team" },
        { field: "world", labelKey: "automation.field_world" },
        { field: "party", labelKey: "automation.field_party" },
    ],
    language: [{ field: "lang", labelKey: "automation.field_lang" }],
    control: [{ field: "action", labelKey: "automation.field_action" }],
    commission_refresh: [
        { field: "mission", labelKey: "automation.field_mission" },
        {
            field: "type",
            labelKey: "automation.field_type",
            values: MIHAN_TYPES.map(name => ({ value: name, label: name })),
        },
    ],
}

/**
 * 给定事件 kind 取字段；kind 为空表示不限种类，返回全量。
 * @param kind 已选 kind
 */
export function schemaFieldsFor(kind?: string): CondFieldDef[] {
    const out: CondFieldDef[] = []
    const seen = new Set<string>()
    const pool = kind ? [kind] : Object.keys(EVENT_SCHEMA)
    for (const item of pool) {
        for (const def of EVENT_SCHEMA[item] ?? []) {
            if (!seen.has(def.field)) {
                seen.add(def.field)
                out.push(def)
            }
        }
    }
    return out
}

/**
 * 给定 kind + 字段取值的下拉选项；无枚举/自由文本返回 null。
 * @param kind 已选 kind
 * @param field 字段名
 */
export function resolveValueOptions(kind: string | undefined, field: string): CondValueOption[] | "dungeons" | null {
    const pool = kind ? [kind] : Object.keys(EVENT_SCHEMA)
    const hits: (CondValueOption[] | "dungeons")[] = []
    for (const item of pool) {
        const def = (EVENT_SCHEMA[item] ?? []).find(entry => entry.field === field)
        if (def?.values) hits.push(def.values)
    }
    if (hits.length === 1) return hits[0]
    return null
}
