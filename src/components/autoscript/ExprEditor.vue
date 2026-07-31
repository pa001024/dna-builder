<script setup lang="ts">
import type { ExprOperand, FlowExpr } from "@/utils/autoscript/types"
import Icon from "../Icon.vue"

const props = withDefaults(
    defineProps<{
        expr: FlowExpr | undefined
        variables: string[]
        clearable?: boolean
    }>(),
    { clearable: true },
)

const emit = defineEmits<{
    (e: "update", expr: FlowExpr | undefined): void
    (e: "pickCoord", apply: (x: number, y: number, color?: number) => void): void
}>()

const CMP_OPS = ["==", "!=", ">", "<", ">=", "<="] as const

function update(expr: FlowExpr | undefined) {
    emit("update", expr)
}

function toGroup(op: "and" | "or") {
    const current = props.expr
    if (current && (current.op === "and" || current.op === "or") && current.op === op) return
    update({ op, items: current ? [current] : [defaultCall()] })
}

function defaultCall(): FlowExpr {
    return { op: "call", fn: "colorExists", x: 0, y: 0, color: 0xffffff, tolerance: 10 }
}

function defaultCmp(): FlowExpr {
    return { op: "cmp", left: { type: "var", name: props.variables[0] ?? "" }, cmp: "==", right: { type: "literal", value: "" } }
}

function wrapNot() {
    if (!props.expr) return
    update({ op: "not", item: props.expr })
}

function setCallField(expr: Extract<FlowExpr, { op: "call" }>, field: string, value: unknown) {
    update({ ...expr, [field]: value } as FlowExpr)
}

/** 将抓取到的坐标和颜色一次性写入颜色检查条件。 */
function applyPickedCall(x: number, y: number, color?: number) {
    if (props.expr?.op !== "call") return
    update({ ...props.expr, x, y, ...(color == null ? {} : { color }) })
}

function setOperand(side: "left" | "right", operand: ExprOperand) {
    if (props.expr?.op !== "cmp") return
    update({ ...props.expr, [side]: operand })
}

function operandType(operand: ExprOperand): string {
    return operand.type
}

function changeOperandType(side: "left" | "right", type: string) {
    if (props.expr?.op !== "cmp") return
    if (type === "var") setOperand(side, { type: "var", name: props.variables[0] ?? "" })
    else if (type === "colorCheck") setOperand(side, { type: "colorCheck", x: 0, y: 0, color: 0xffffff, tolerance: 10 })
    else setOperand(side, { type: "literal", value: "" })
}

function setColorCheck(side: "left" | "right", field: "x" | "y" | "color" | "tolerance", value: number) {
    if (props.expr?.op !== "cmp") return
    const operand = props.expr[side]
    if (operand.type !== "colorCheck") return
    setOperand(side, { ...operand, [field]: value })
}

function setGroupItem(index: number, item: FlowExpr) {
    if (!props.expr || (props.expr.op !== "and" && props.expr.op !== "or")) return
    const items = [...props.expr.items]
    items[index] = item
    update({ ...props.expr, items })
}

function addGroupItem() {
    if (!props.expr || (props.expr.op !== "and" && props.expr.op !== "or")) return
    update({ ...props.expr, items: [...props.expr.items, defaultCall()] })
}

function removeGroupItem(index: number) {
    if (!props.expr || (props.expr.op !== "and" && props.expr.op !== "or")) return
    const items = props.expr.items.filter((_, i) => i !== index)
    if (items.length === 1) update(items[0])
    else if (items.length === 0) update(undefined)
    else update({ ...props.expr, items })
}

function pickCoordFor(apply: (x: number, y: number, color?: number) => void) {
    emit("pickCoord", apply)
}

function onKindChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value
    if (value === "call") update(defaultCall())
    else if (value === "cmp") update(defaultCmp())
    else if (value === "and") toGroup("and")
    else toGroup("or")
}

function parseLiteralInput(raw: string): string | number | boolean {
    const num = Number(raw)
    if (raw !== "" && Number.isFinite(num)) return num
    if (raw === "true") return true
    if (raw === "false") return false
    return raw
}

function onLiteralInput(side: "left" | "right", event: Event) {
    setOperand(side, { type: "literal", value: parseLiteralInput((event.target as HTMLInputElement).value) })
}

function onVarSelect(side: "left" | "right", event: Event) {
    setOperand(side, { type: "var", name: (event.target as HTMLSelectElement).value })
}

function onCmpOpChange(event: Event) {
    if (props.expr?.op !== "cmp") return
    update({ ...props.expr, cmp: (event.target as HTMLSelectElement).value as (typeof CMP_OPS)[number] })
}

function onCallFieldInput(field: "x" | "y" | "tolerance", event: Event) {
    if (props.expr?.op !== "call") return
    setCallField(props.expr, field, Number((event.target as HTMLInputElement).value))
}

function onCallColorInput(event: Event) {
    if (props.expr?.op !== "call") return
    setCallField(props.expr, "color", parseInt((event.target as HTMLInputElement).value.replace("#", ""), 16) || 0)
}

function onCallFnChange(event: Event) {
    if (props.expr?.op !== "call") return
    setCallField(props.expr, "fn", (event.target as HTMLSelectElement).value)
}

function onOperandTypeChange(side: "left" | "right", event: Event) {
    changeOperandType(side, (event.target as HTMLSelectElement).value)
}

function onColorCheckInput(side: "left" | "right", field: "x" | "y", event: Event) {
    setColorCheck(side, field, Number((event.target as HTMLInputElement).value))
}

function onGroupItemUpdate(index: number, expr: FlowExpr | undefined) {
    setGroupItem(index, expr ?? defaultCall())
}

function onNotItemUpdate(expr: FlowExpr | undefined) {
    update({ op: "not", item: expr ?? defaultCall() })
}
</script>

<template>
    <div class="expr-editor flex flex-col gap-1">
        <div class="flex items-center gap-1 flex-wrap">
            <template v-if="!expr || expr.op === 'call' || expr.op === 'cmp'">
                <select class="select select-xs select-bordered" :value="expr?.op ?? 'call'" @change="onKindChange">
                    <option value="call">颜色检查</option>
                    <option value="cmp">比较</option>
                    <option value="and">全部满足 (and)</option>
                    <option value="or">任一满足 (or)</option>
                </select>
                <button v-if="expr" class="btn btn-xs btn-ghost" title="取反" @click="wrapNot"><Icon icon="ri:prohibited-line" class="w-3 h-3" />非</button>
                <button v-if="expr && clearable" class="btn btn-xs btn-ghost text-error" title="清空条件" @click="update(undefined)">
                    <Icon icon="ri:close-line" class="w-3 h-3" />
                </button>
            </template>
            <template v-else-if="expr.op === 'and' || expr.op === 'or'">
                <span class="badge badge-sm">{{ expr.op === "and" ? "全部满足 (and)" : "任一满足 (or)" }}</span>
                <button class="btn btn-xs btn-ghost" @click="toGroup(expr.op === 'and' ? 'or' : 'and')">切换 {{ expr.op === "and" ? "or" : "and" }}</button>
                <button class="btn btn-xs btn-ghost" @click="addGroupItem"><Icon icon="ri:add-line" class="w-3 h-3" />条件</button>
            </template>
            <template v-else-if="expr.op === 'not'">
                <span class="badge badge-sm badge-warning">非 (not)</span>
                <button class="btn btn-xs btn-ghost" @click="update(expr.item)">移除取反</button>
            </template>
        </div>

        <!-- 颜色检查 -->
        <div v-if="expr?.op === 'call'" class="flex items-center gap-1 flex-wrap">
            <select class="select select-xs select-bordered" :value="expr.fn" @change="onCallFnChange">
                <option value="colorExists">颜色存在</option>
                <option value="colorNotExists">颜色不存在</option>
            </select>
            <input type="number" class="input input-xs input-bordered w-16" :value="expr.x" placeholder="x" @input="onCallFieldInput('x', $event)" />
            <input type="number" class="input input-xs input-bordered w-16" :value="expr.y" placeholder="y" @input="onCallFieldInput('y', $event)" />
            <input
                type="text"
                class="input input-xs input-bordered w-20 font-mono"
                :value="'#' + expr.color.toString(16).toUpperCase().padStart(6, '0')"
                @input="onCallColorInput"
            />
            <input
                type="number"
                class="input input-xs input-bordered w-14"
                :value="expr.tolerance"
                title="容差"
                @input="onCallFieldInput('tolerance', $event)"
            />
            <button
                class="btn btn-xs btn-ghost"
                title="抓取坐标与颜色"
                @click="pickCoordFor(applyPickedCall)"
            >
                <Icon icon="ri:crosshair-2-line" class="w-3 h-3" />
            </button>
        </div>

        <!-- 比较 -->
        <div v-else-if="expr?.op === 'cmp'" class="flex items-center gap-1 flex-wrap">
            <template v-for="side in ['left', 'right'] as const" :key="side">
                <select class="select select-xs select-bordered" :value="operandType(expr[side])" @change="onOperandTypeChange(side, $event)">
                    <option value="var">变量</option>
                    <option value="literal">字面量</option>
                    <option value="colorCheck">颜色检查</option>
                </select>
                <select
                    v-if="expr[side].type === 'var'"
                    class="select select-xs select-bordered w-24"
                    :value="(expr[side] as any).name"
                    @change="onVarSelect(side, $event)"
                >
                    <option value="" disabled>选择变量</option>
                    <option v-for="name in variables" :key="name" :value="name">{{ name }}</option>
                </select>
                <input
                    v-else-if="expr[side].type === 'literal'"
                    class="input input-xs input-bordered w-20"
                    :value="String((expr[side] as any).value)"
                    placeholder="值"
                    @input="onLiteralInput(side, $event)"
                />
                <span v-else class="flex items-center gap-1">
                    <input
                        type="number"
                        class="input input-xs input-bordered w-14"
                        :value="(expr[side] as any).x"
                        placeholder="x"
                        @input="onColorCheckInput(side, 'x', $event)"
                    />
                    <input
                        type="number"
                        class="input input-xs input-bordered w-14"
                        :value="(expr[side] as any).y"
                        placeholder="y"
                        @input="onColorCheckInput(side, 'y', $event)"
                    />
                </span>
                <select v-if="side === 'left'" class="select select-xs select-bordered w-16" :value="expr.cmp" @change="onCmpOpChange">
                    <option v-for="op in CMP_OPS" :key="op" :value="op">{{ op }}</option>
                </select>
            </template>
        </div>

        <!-- and/or 子条件 -->
        <div v-else-if="expr?.op === 'and' || expr?.op === 'or'" class="flex flex-col gap-1 pl-3 border-l-2 border-base-300">
            <div v-for="(item, index) in expr.items" :key="index" class="flex items-start gap-1">
                <ExprEditor
                    :expr="item"
                    :variables="variables"
                    :clearable="clearable"
                    class="flex-1"
                    @update="onGroupItemUpdate(index, $event)"
                    @pickCoord="emit('pickCoord', $event)"
                />
                <button class="btn btn-xs btn-ghost text-error" @click="removeGroupItem(index)"><Icon icon="ri:close-line" class="w-3 h-3" /></button>
            </div>
        </div>

        <!-- not 子条件 -->
        <div v-else-if="expr?.op === 'not'" class="pl-3 border-l-2 border-warning">
            <ExprEditor
                :expr="expr.item"
                :variables="variables"
                :clearable="clearable"
                @update="onNotItemUpdate"
                @pickCoord="emit('pickCoord', $event)"
            />
        </div>
    </div>
</template>

<script lang="ts">
export default { name: "ExprEditor" }
</script>
