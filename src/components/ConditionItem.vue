<script lang="ts" setup>
import { computed } from "vue"
import type { RougeCondition } from "@/data/d/condition.data"
import { rougeLikeBlessingGroups, rougeProTreasureGroups } from "@/data/d/rouge.data"

const props = defineProps<{
    condition: RougeCondition
}>()

const condition = computed(() => props.condition)

/** 片段类型：术语 / 运算符 / 数值 / 组名 / 括号 */
type SegmentType = "term" | "op" | "value" | "group" | "paren"

interface ConditionSegment {
    type: SegmentType
    text: string
}

interface ConditionClause {
    segments: ConditionSegment[]
}

const groupTypeNames: Record<string, string> = {
    Blessing: "祝福组",
    Treasure: "宝物组",
}

/**
 * 解析祝福组/宝物组名称。
 * @param type 组类型（Blessing / Treasure）
 * @param groupId 组 ID
 * @returns 组名称，无法解析时回退为 ID
 */
function getGroupName(type: string, groupId: number): string {
    if (type === "Blessing") {
        return rougeLikeBlessingGroups.find(group => group.id === groupId)?.name ?? String(groupId)
    }
    if (type === "Treasure") {
        return rougeProTreasureGroups.find(group => group.id === groupId)?.name ?? String(groupId)
    }
    return String(groupId)
}

/**
 * 格式化标量值为字符串。
 * @param value 值
 * @returns 字符串
 */
function formatScalar(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") {
        return String(value)
    }
    return JSON.stringify(value)
}

/**
 * 比较运算符取反。
 * @param op 原运算符
 * @returns 取反后的运算符
 */
function negateOp(op: string): string {
    if (op === "=") return "≠"
    if (op === "≠") return "="
    if (op === "≥") return "<"
    if (op === "≤") return ">"
    if (op === ">") return "≤"
    if (op === "<") return "≥"
    return op
}

/**
 * 将单条条件子句格式化为片段数组。
 * @param key 条件映射键
 * @param entry 子条件值
 * @param negated 是否取反（isNot）
 * @returns 子句片段
 */
function formatClause(key: string, entry: unknown, negated: boolean): ConditionClause {
    if (key === "RougeLikePassRoom") {
        const op = negated ? negateOp("≥") : "≥"
        return {
            segments: [
                { type: "term", text: "已通过层数" },
                { type: "op", text: op },
                { type: "value", text: `${entry}` },
            ],
        }
    }
    if (key === "RougeLikeDifficulty") {
        const id = Array.isArray(entry) ? entry[0] : entry
        const op = negated ? negateOp("=") : "="
        return {
            segments: [
                { type: "term", text: "肉鸽难度" },
                { type: "op", text: op },
                { type: "value", text: `${Number(id) - 100}` },
            ],
        }
    }
    if (key === "RougeLikeGroupMin" || key === "RougeLikeGroupMax") {
        const isMin = key === "RougeLikeGroupMin"
        const [type, groupId, count] = Array.isArray(entry) ? entry : [entry]
        const op = isMin ? (negated ? "<" : "≥") : negated ? ">" : "≤"
        return {
            segments: [
                { type: "term", text: `${groupTypeNames[type] ?? type}` },
                { type: "paren", text: "(" },
                { type: "group", text: getGroupName(type, groupId) },
                { type: "paren", text: ")" },
                { type: "op", text: op },
                { type: "value", text: `${count}` },
                { type: "term", text: "枚" },
            ],
        }
    }
    if (key === "RougeLikePreRoom") {
        const op = negated ? negateOp("=") : "="
        return {
            segments: [
                { type: "term", text: "前置房间" },
                { type: "op", text: op },
                { type: "value", text: `${entry}` },
            ],
        }
    }
    if (key === "RougeLikeManual") {
        const op = negated ? negateOp("=") : "="
        return {
            segments: [
                { type: "term", text: "手动记录" },
                { type: "op", text: op },
                {
                    type: "value",
                    text: (Array.isArray(entry) ? entry : [entry]).map(formatScalar).join(" / "),
                },
            ],
        }
    }

    // 通用回退：直接展示键与值
    const raw = Array.isArray(entry) ? (entry as unknown[]).map(formatScalar).join(", ") : formatScalar(entry)
    const op = negated ? negateOp("=") : "="
    return {
        segments: [
            { type: "term", text: key },
            { type: "op", text: op },
            { type: "value", text: raw },
        ],
    }
}

/**
 * 将条件映射展开为子句列表，并按 isNot 取反。
 */
const clauses = computed<ConditionClause[]>(() => {
    const entries: ConditionClause[] = []
    for (const [key, value] of Object.entries(condition.value.map)) {
        const arr = Array.isArray(value) ? value : [value]
        for (const entry of arr) {
            entries.push(formatClause(key, entry, condition.value.isNot ?? false))
        }
    }
    return entries
})

/**
 * 取反后子句间的连接逻辑（De Morgan）。
 */
const joinLogic = computed<"AND" | "OR">(() => {
    if (condition.value.isNot) {
        return condition.value.logic === "AND" ? "OR" : "AND"
    }
    return condition.value.logic
})
</script>

<template>
    <div class="rounded-md bg-base-100 p-3 space-y-1.5">
        <div class="flex items-center">
            <div v-if="condition.remark" class="text-sm text-base-content/80">{{ condition.remark }}</div>
            <div class="flex-1"></div>
            <CopyID :id="condition.id" />
        </div>
        <div class="flex flex-wrap items-center gap-1">
            <template v-for="(clause, index) in clauses" :key="index">
                <span v-if="index > 0" class="rounded bg-base-300/70 px-1.5 py-0.5 text-xs text-base-content/70">
                    {{ joinLogic }}
                </span>
                <span class="rounded bg-base-200 px-1.5 py-0.5 text-xs text-base-content/80">
                    <template v-for="(segment, segIndex) in clause.segments" :key="segIndex">
                        <span v-if="segment.type === 'term'" class="text-base-content/70">{{ $t(segment.text) }}</span>
                        <span
                            v-else-if="segment.type === 'op'"
                            class="px-0.5 font-semibold"
                            :class="segment.text === '≠' || segment.text === '>' || segment.text === '<' ? 'text-error' : 'text-primary'"
                        >
                            {{ segment.text }}
                        </span>
                        <span v-else-if="segment.type === 'group'" class="text-secondary">{{ $t(segment.text) }}</span>
                        <span v-else-if="segment.type === 'value'" class="font-medium">{{ segment.text }}</span>
                        <span v-else>{{ segment.text }}</span>
                    </template>
                </span>
            </template>
        </div>
    </div>
</template>
