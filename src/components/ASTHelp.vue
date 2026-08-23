<script setup lang="ts">
import { t } from "i18next"
import { debounce } from "lodash-es"
import { computed, defineComponent, h, ref, type VNode, watch } from "vue"
import type { CharBuild, LeveledSkill } from "@/data"
import { CharBuild as CharBuildClass } from "@/data"
import { type ASTNode, parseAST } from "@/data/ast"
import CodeEditor from "./CodeEditor.vue"

const props = defineProps<{
    skill?: LeveledSkill
    charBuild?: CharBuild
}>()

const model = defineModel<boolean>()
const emit = defineEmits(["select"])

const inputExpression = ref("")
const astTree = ref<ASTNode | null>(null)
const parseError = ref("")
// CodeMirror 代码编辑器实例（language="ast"）。编辑器内部状态不随失焦丢失，光标位置始终准确。
const codeEditorRef = ref<InstanceType<typeof CodeEditor> | null>(null)
// 最近一次光标位置（由编辑器 cursor 事件同步），用于插入上下文判断与提示。
const cursorPos = ref(0)
// 属性修改区：当前选中的临时属性与数值
const attrValue = ref("1")
// AST 语言用到的内置宏名（词法阶段会被替换，编辑器中按宏高亮）。
const astMacros = new Set(Object.keys(CharBuildClass.macros))

const skillName = props.skill?.字段[0].名称 || "[幻象]伤害"

const examples = [
    { label: t("ast-help.examples.baseStats"), expr: "攻击 + 防御" },
    { label: t("ast-help.examples.specialValue"), expr: "[攻击]" },
    { label: t("ast-help.examples.expectedDamage"), expr: skillName },
    { label: t("ast-help.examples.critDamage"), expr: skillName + ".暴击" },
    { label: t("ast-help.examples.temporaryAttrs"), expr: "[攻击]{增伤:0.1}.暴击" },
    { label: t("ast-help.examples.functions"), expr: "max(攻击, 防御) * 2" },
    { label: t("ast-help.examples.namespace"), expr: "伊卡洛斯::伤害" },
    { label: t("ast-help.examples.complex"), expr: "(" + skillName + ") / max(Q::神智消耗, 20)" },
]

const internals = CharBuildClass.macros

const operators = {
    "+": t("ast-help.operators.add"),
    "-": t("ast-help.operators.sub"),
    "*": t("ast-help.operators.mul"),
    "/": t("ast-help.operators.div"),
    "%": t("ast-help.operators.mod"),
    "//": t("ast-help.operators.floordiv"),
}

const functions = {
    "min(...)": t("ast-help.functions.min"),
    "max(...)": t("ast-help.functions.max"),
    "floor(x)": t("ast-help.functions.floor"),
    "ceil(x)": t("ast-help.functions.ceil"),
    "or(...)": t("ast-help.functions.or"),
    "log(x)": t("ast-help.functions.log"),
    "power(x, y)": t("ast-help.functions.power"),
    "hp(x)": t("ast-help.functions.hp"),
}

const members = {
    N: t("ast-help.members.n"),
    暴击: t("ast-help.members.crit"),
    未暴击: t("ast-help.members.noCrit"),
    触发: t("ast-help.members.trigger"),
    未触发: t("ast-help.members.noTrigger"),
    暴击触发: t("ast-help.members.critTrigger"),
    未触发暴击: t("ast-help.members.noTriggerCrit"),
    触发未暴击: t("ast-help.members.triggerNoCrit"),
    未暴击未触发: t("ast-help.members.noCritNoTrigger"),
}

// 关键字说明：方括号特殊字段，倍率固定为 100%（不受威力影响），可直接用作自定义伤害字段。
// [近战]/[远程]/[同律] 分别引用对应武器类别的攻击字段，等价于 近战::[攻击] 等。
const keywords: Record<string, string> = {
    "[攻击]": t("ast-help.keywords.attack"),
    "[防御]": t("ast-help.keywords.defense"),
    "[生命]": t("ast-help.keywords.hp"),
    "[近战]": t("ast-help.keywords.melee"),
    "[远程]": t("ast-help.keywords.ranged"),
    "[同律]": t("ast-help.keywords.colaw"),
}

const namespaces = computed(() => ["E", "Q", "P", "近战", "远程", "同律", ...(props.charBuild?.allSkills.map(v => v.名称) || [])])

// 各参考分组的英文小标（纯英文，可配等宽/大字距）。
const groupKickers: Record<string, string> = {
    operators: "OPERATORS",
    functions: "FUNCTIONS",
    keywords: "KEYWORDS",
    members: "MEMBERS",
    namespaces: "NAMESPACES",
}

// 参考内容按类别分组，用于分区展示。
const referenceGroups = computed(() => {
    const groups: { key: string; title: string; items: Record<string, string> }[] = [
        { key: "operators", title: t("ast-help.operatorsTitle"), items: operators },
        { key: "functions", title: t("ast-help.functionsTitle"), items: functions },
        { key: "keywords", title: t("ast-help.keywordsTitle"), items: keywords },
        { key: "members", title: t("ast-help.membersTitle"), items: members },
        {
            key: "namespaces",
            title: t("ast-help.namespacesTitle"),
            items: Object.fromEntries(namespaces.value.map(ns => [ns + "::", ""])),
        },
    ]
    return groups
})

// 函数条目点击后插入的可编辑文本（仅函数名 + 左括号）。
const functionInserts: Record<string, string> = {
    "min(...)": "min(",
    "max(...)": "max(",
    "floor(x)": "floor(",
    "ceil(x)": "ceil(",
    "or(...)": "or(",
    "log(x)": "log(",
    "power(x, y)": "power(",
    "hp(x)": "hp(",
}

// 属性修改区：可插入的临时属性，按用途分组。展示原始属性名（即表达式中实际输入的写法）。
const attributeGroups: { key: string; title: string; items: string[] }[] = [
    { key: "basic", title: t("ast-help.attrGroups.basic"), items: ["攻击", "生命", "防御", "护盾", "神智"] },
    {
        key: "damage",
        title: t("ast-help.attrGroups.damage"),
        items: [
            "增伤",
            "独立增伤",
            "武器伤害",
            "技能伤害",
            "属性穿透",
            "无视防御",
            "技能无视防御",
            "技能威力",
            "技能速度",
            "技能范围",
            "技能倍率加数",
            "技能倍率乘数",
            "技能倍率赋值",
            "失衡易伤",
            "昂扬",
            "背水",
            "减伤",
        ],
    },
    {
        key: "weapon",
        title: t("ast-help.attrGroups.weapon"),
        items: [
            "暴击",
            "暴伤",
            "触发",
            "攻速",
            "多重",
            "追加伤害",
            "武器倍率",
            "装填",
            "弹匣",
            "弹药",
            "召唤物属性继承比例",
            "召唤物攻击速度",
            "召唤物范围",
            "召唤物伤害",
            "有效生命",
        ],
    },
    {
        key: "convert",
        title: t("ast-help.attrGroups.convert"),
        items: ["转切割", "转贯穿", "转震荡", "转灾厄", "转属克", "转属逆"],
    },
]

/**
 * 在光标处插入文本（由 CodeMirror 内部 dispatch 完成，光标自动移到插入文本之后，不丢失位置）。
 * 编辑器会将更新回写 v-model，随后重新解析表达式。
 * @param text 要插入的文本
 * @returns void
 */
function insertAtCursor(text: string) {
    codeEditorRef.value?.insertAtCursor(text)
    parseExpression()
}

/**
 * 插入伤害类型成员；若插入点前不是 "." 则自动补充，如 [攻击] → [攻击].暴击。
 * @param name 成员名称
 * @returns void
 */
function insertMember(name: string) {
    const editor = codeEditorRef.value
    if (!editor) return
    const before = inputExpression.value.slice(0, editor.getCursor())
    const needsDot = before[before.length - 1] !== "."
    editor.insertAtCursor((needsDot ? "." : "") + name)
    parseExpression()
}

/**
 * 插入参考条目（运算符/函数/关键字/成员/命名空间）。
 * @param groupKey 分组 key
 * @param name 条目名称
 * @returns void
 */
function insertReference(groupKey: string, name: string) {
    if (groupKey === "members") {
        insertMember(name)
        return
    }
    if (groupKey === "functions") {
        insertAtCursor(functionInserts[name] ?? name)
        return
    }
    insertAtCursor(name)
}

/**
 * 解析 { } 块内容为 [名称, 值文本] 条目（按顶层逗号切分，尊重括号嵌套）。
 * @param content { } 内部的文本
 * @returns 名称与值文本条目列表
 */
function parseBraceContent(content: string): [string, string][] {
    const entries: [string, string][] = []
    let depth = 0
    let start = 0
    const flush = (end: number) => {
        const pair = content.slice(start, end).trim()
        if (!pair) return
        const colon = pair.indexOf(":")
        if (colon < 0) return
        entries.push([pair.slice(0, colon).trim(), pair.slice(colon + 1).trim()])
    }
    for (let i = 0; i < content.length; i++) {
        const ch = content[i]
        if (ch === "(" || ch === "[" || ch === "{") depth++
        else if (ch === ")" || ch === "]" || ch === "}") depth--
        else if (ch === "," && depth === 0) {
            flush(i)
            start = i + 1
        }
    }
    flush(content.length)
    return entries
}

/**
 * 查找光标所在或紧邻的 { } 临时属性块。
 * @param input 完整表达式
 * @param cursor 光标位置
 * @returns 块起止位置；找不到时返回 undefined
 */
function findBraceBlockAt(input: string, cursor: number): { start: number; end: number } | undefined {
    // 1) 光标位于某个未闭合 { 块内：向左找最近的未配对 {
    let depth = 0
    let open = -1
    for (let i = cursor - 1; i >= 0; i--) {
        const ch = input[i]
        if (ch === "}") depth++
        else if (ch === "{") {
            if (depth === 0) {
                open = i
                break
            }
            depth--
        }
    }
    if (open !== -1) {
        let d = 0
        for (let i = open + 1; i < input.length; i++) {
            if (input[i] === "{") d++
            else if (input[i] === "}") {
                if (d === 0) return { start: open, end: i }
                d--
            }
        }
        return undefined
    }
    // 2) 光标紧贴某个已闭合 } 之后：取光标前最近一个 } 及其匹配的 {
    let close = -1
    for (let i = cursor - 1; i >= 0; i--) {
        if (input[i] === "}") {
            close = i
            break
        }
    }
    if (close !== -1) {
        let d = 0
        for (let i = close - 1; i >= 0; i--) {
            if (input[i] === "}") d++
            else if (input[i] === "{") {
                if (d === 0) return { start: i, end: close }
                d--
            }
        }
    }
    return undefined
}

// 与 AST 词法器一致的标识符字符集（src/data/ast.ts）
const AST_IDENT_RE = /[a-zA-Z0-9_\u4e00-\u9fa5·[\]]/

/**
 * 准确获取光标所在/紧邻的 token（与 AST 词法器的标识符字符集一致）。
 * 优先取「结束于或包含光标」的 token，其次取「起始于光标」的 token。
 * @param input 完整表达式
 * @param cursor 光标位置
 * @returns token 的起止位置与文本；无 token 时返回 undefined
 */
function getTokenAtCursor(input: string, cursor: number): { start: number; end: number; text: string } | undefined {
    const pos = Math.max(0, Math.min(cursor, input.length))
    let start = pos
    while (start > 0 && AST_IDENT_RE.test(input[start - 1])) start--
    let end = pos
    while (end < input.length && AST_IDENT_RE.test(input[end])) end++
    if (start === end) return undefined
    return { start, end, text: input.slice(start, end) }
}

/**
 * 根据光标位置判断属性修改区的插入方式。
 * @param input 完整表达式
 * @param cursor 光标位置
 * @returns merge（合并进现有 { }）/ append（追加到字段后）/ plain（光标处直接插入）
 */
function getFieldContext(
    input: string,
    cursor: number
): { kind: "merge"; braceStart: number; braceEnd: number; content: string } | { kind: "append" } | { kind: "plain" } {
    const block = findBraceBlockAt(input, cursor)
    if (block && cursor > block.start && cursor <= block.end + 1) {
        return {
            kind: "merge",
            braceStart: block.start,
            braceEnd: block.end,
            content: input.slice(block.start + 1, block.end),
        }
    }
    // 光标紧跟字段标识符之后（或位于标识符内部，且非纯数字）→ 追加 { }
    // 光标恰好位于 token 起始处（如 |攻击）不算，避免在字段前插入临时属性。
    const token = getTokenAtCursor(input, cursor)
    if (token && token.start < cursor && cursor <= token.end && !/^\d+(\.\d+)?$/.test(token.text)) {
        return { kind: "append" }
    }
    return { kind: "plain" }
}

// 光标处字段上下文（随输入与光标变化实时更新）
const fieldContext = computed(() => getFieldContext(inputExpression.value, cursorPos.value))

// 属性修改区的插入方式提示文本
const attrContextHint = computed(() => {
    switch (fieldContext.value.kind) {
        case "merge":
            return t("ast-help.attrContextMerge")
        case "append":
            return t("ast-help.attrContextAppend")
        default:
            return t("ast-help.attrContextPlain")
    }
})

/**
 * 点击属性修改区条目：根据光标上下文插入或合并临时属性 {属性:数值}。
 * 光标在 [攻击] 后 → 追加 {xx:1}；光标在 {xx:1} 之后或之间 → 合并为 {xx:1,yy:1}。
 * @param attrName 属性名
 * @returns void
 */
function insertTemporaryAttribute(attrName: string) {
    const value = attrValue.value.trim() || "1"
    // 点击时读取编辑器实时光标（CodeMirror 状态不随失焦丢失），据此做插入上下文判断
    const editor = codeEditorRef.value
    const cursor = editor?.getCursor() ?? cursorPos.value
    const context = getFieldContext(inputExpression.value, cursor)
    if (context.kind === "merge") {
        const entries = parseBraceContent(context.content)
        const existingIndex = entries.findIndex(([name]) => name === attrName)
        if (existingIndex >= 0) {
            entries[existingIndex] = [attrName, value]
        } else {
            entries.push([attrName, value])
        }
        const newContent = entries.map(([name, val]) => `${name}:${val}`).join(",")
        // 用替换区间的方式合并 { } 块：其余文本与光标位置不受影响（CodeMirror dispatch）
        editor?.replaceRange(context.braceStart, context.braceEnd + 1, "{" + newContent + "}")
        parseExpression()
        return
    }
    insertAtCursor(`{${attrName}:${value}}`)
}

function parseExpression() {
    if (!inputExpression.value.trim()) {
        astTree.value = null
        parseError.value = ""
        return
    }
    if (props.charBuild) {
        parseError.value = props.charBuild.validateAST(inputExpression.value) || ""
        if (parseError.value) return
        try {
            astTree.value = parseAST(inputExpression.value, CharBuildClass.macros)
        } catch (e: any) {
            parseError.value = e.message || t("ast-help.parseError")
            astTree.value = null
        }
        return
    }
    try {
        astTree.value = parseAST(inputExpression.value)
        parseError.value = ""
    } catch (e: any) {
        parseError.value = e.message || t("ast-help.parseError")
        astTree.value = null
    }
}

function applyExpression() {
    if (inputExpression.value && !parseError.value) {
        emit("select", inputExpression.value)
        model.value = false
    }
}

watch(
    inputExpression,
    debounce(() => {
        parseExpression()
    }, 300)
)

// AST 树渲染：递归生成带颜色高亮的 VNode，便于区分不同节点类型。
const nodeColors = {
    number: "text-cyan-400",
    property: "text-emerald-400",
    binary: "text-amber-300",
    unary: "text-rose-300",
    function: "text-violet-300",
    member_access: "text-sky-300",
    temporary_attributes: "text-pink-300",
} as const

function renderNodeVNode(node: ASTNode, depth = 0): VNode {
    const indent = "  ".repeat(depth)
    const color = nodeColors[node.type as keyof typeof nodeColors] || "text-base-content/80"

    switch (node.type) {
        case "number":
            return h("span", { class: color }, indent + `数字: ${node.value}`)
        case "property": {
            const ns = (node as any).namespace
            return h("span", { class: color }, [indent + (ns ? `${ns}::` : ""), h("span", { class: "font-semibold" }, node.name)])
        }
        case "binary":
            return h("span", { class: color }, [
                indent + `(${operators[node.operator as keyof typeof operators] || node.operator})`,
                h("br"),
                renderNodeVNode(node.left, depth + 1),
                h("br"),
                renderNodeVNode(node.right, depth + 1),
            ])
        case "unary":
            return h("span", { class: color }, [indent + `(${node.operator})`, h("br"), renderNodeVNode(node.argument, depth + 1)])
        case "function": {
            const ns = (node as any).namespace
            const name = functions[node.name as keyof typeof functions] || node.name
            return h("span", { class: color }, [
                indent + (ns ? `${ns}::` : "") + name,
                h("span", { class: "text-base-content/40" }, "("),
                ...node.args.map(arg => [h("br"), renderNodeVNode(arg, depth + 1)]),
                h("span", { class: "text-base-content/40" }, " ".repeat(depth) + ")"),
            ])
        }
        case "member_access":
            return h("span", { class: color }, [
                indent + (members[node.property as keyof typeof members] || node.property),
                h("br"),
                renderNodeVNode(node.object, depth + 1),
            ])
        case "temporary_attributes":
            return h("span", { class: color }, [
                indent + "临时属性: { ",
                ...node.attributes.flatMap(attr => [
                    h("span", { class: "text-pink-300 font-semibold" }, attr.name),
                    h("span", { class: "text-base-content/40" }, " = "),
                    renderNodeVNode(attr.value, 0),
                ]),
                h("span", { class: "text-base-content/40" }, " }"),
                h("br"),
                renderNodeVNode(node.target, depth + 1),
            ])
        default:
            return h("span", { class: "text-base-content/60" }, indent + `未知节点: ${(node as any).type}`)
    }
}

const astTreeVNodes = computed(() => (astTree.value ? renderNodeVNode(astTree.value) : null))

// 将 AST VNode 包装为单根节点，方便直接渲染（含中文节点名，不套等宽字体）。
const AstTreeRenderer = defineComponent({
    props: {
        node: { type: Object as import("vue").PropType<VNode | null>, default: null },
    },
    render() {
        const node = this.node
        return h("div", { class: "text-[13px] leading-relaxed whitespace-pre-wrap" }, node ?? "")
    },
})

// 语法条目圆点的颜色。
const syntaxDotColors: Record<string, string> = {
    number: "bg-cyan-400",
    property: "bg-emerald-400",
    special: "bg-teal-400",
    skill: "bg-indigo-400",
    namespace: "bg-violet-400",
    operator: "bg-amber-400",
    function: "bg-rose-400",
    member: "bg-sky-400",
    temporary: "bg-pink-400",
}

// 参考分组中条目文字的颜色。
const badgeColors: Record<string, string> = {
    operators: "text-amber-400",
    functions: "text-violet-300",
    keywords: "text-teal-300",
    members: "text-sky-300",
    namespaces: "text-base-content/70",
}
</script>

<template>
    <div class="flex h-[80vh] flex-col overflow-hidden">
        <!-- 顶部标题栏 -->
        <div class="flex items-center gap-3 border-b border-base-content/15 bg-base-100/40 px-4 py-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xs bg-linear-to-br from-primary/20 to-accent/20 text-primary">
                <Icon icon="ri:function-line" class="h-5 w-5" />
            </div>
            <div class="min-w-0">
                <p class="text-[10px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">AST</p>
                <h3 class="text-base font-bold leading-tight text-base-content">{{ $t("ast-help.title") }}</h3>
                <p class="truncate text-xs text-base-content/50">
                    {{ $t("ast-help.syntaxDesc") }}
                </p>
            </div>
            <button class="btn btn-circle btn-ghost btn-sm ml-auto" aria-label="close" @click="model = false">
                <Icon icon="ri:close-line" class="h-4 w-4" />
            </button>
        </div>

        <div class="flex min-h-0 flex-1 gap-4 p-4">
            <!-- 左侧：帮助内容 -->
            <div class="w-[46%] min-w-0 space-y-3 overflow-y-auto pr-1 stagger-rise">
                <!-- 点击插入提示 -->
                <div
                    class="flex items-center gap-2 rounded-xs border border-dashed border-base-content/15 bg-base-content/3 px-3 py-2 text-xs text-base-content/55"
                >
                    <Icon icon="ri:cursor-line" class="h-3.5 w-3.5 shrink-0" />
                    <span>{{ $t("ast-help.insertHint") }}</span>
                </div>

                <!-- 表达式语法 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="SYNTAX" :title="$t('ast-help.syntaxTitle')" />
                    <div class="space-y-1.5 text-[13px] leading-relaxed text-base-content/70">
                        <p
                            v-for="itemKey in [
                                'number',
                                'property',
                                'special',
                                'skill',
                                'namespace',
                                'operator',
                                'function',
                                'member',
                                'temporary',
                            ]"
                            :key="itemKey"
                            class="flex items-start gap-2"
                        >
                            <span class="mt-0.5 inline-flex h-1.5 w-1.5 shrink-0 rounded-full" :class="syntaxDotColors[itemKey]" />
                            <span>
                                <strong class="font-semibold text-base-content/90">
                                    {{ $t(`ast-help.syntaxItems.${itemKey}.label`) }}
                                </strong>
                                ：{{ $t(`ast-help.syntaxItems.${itemKey}.desc`) }}
                            </span>
                        </p>
                    </div>
                </section>

                <!-- 运算符 / 函数 / 关键字 / 伤害类型 / 命名空间（全部可点击插入） -->
                <section
                    v-for="group in referenceGroups"
                    :key="group.key"
                    class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <SectionHeader no-animate compact :kicker="groupKickers[group.key]" :title="group.title" />
                    <div class="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <button
                            v-for="(desc, name) in group.items"
                            :key="name"
                            type="button"
                            class="group flex min-w-0 cursor-pointer items-center gap-2 rounded-xs border border-transparent bg-base-content/3 px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5"
                            @click="insertReference(group.key, name)"
                        >
                            <span class="shrink-0 text-xs font-semibold" :class="badgeColors[group.key]">{{ name }}</span>
                            <span v-if="desc" class="min-w-0 truncate text-xs text-base-content/70">{{ desc }}</span>
                            <Icon
                                icon="ri:add-line"
                                class="ml-auto h-3 w-3 shrink-0 text-base-content/25 transition-colors group-hover:text-primary"
                            />
                        </button>
                    </div>
                </section>

                <!-- 属性修改 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('ast-help.attrTitle')" />
                    <div class="mt-1 flex items-center gap-2">
                        <span class="shrink-0 text-xs text-base-content/55">{{ $t("ast-help.attrValueLabel") }}</span>
                        <input
                            v-model="attrValue"
                            type="number"
                            step="0.01"
                            class="input input-sm input-bordered w-24 rounded-xs font-mono tabular-nums"
                        />
                        <span class="ml-auto truncate text-xs text-base-content/45">{{ attrContextHint }}</span>
                    </div>
                    <div v-for="group in attributeGroups" :key="group.key" class="mt-2.5">
                        <div class="mb-1 text-[11px] tracking-wide text-base-content/55">{{ group.title }}</div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="item in group.items"
                                :key="item"
                                type="button"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border border-base-content/20 px-2 py-0.5 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                @click="insertTemporaryAttribute(item)"
                            >
                                {{ item }}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 示例表达式 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="EXAMPLES" :title="$t('ast-help.examplesTitle')" />
                    <div class="mt-1 space-y-1.5">
                        <button
                            v-for="ex in examples"
                            :key="ex.expr"
                            class="group flex w-full items-center justify-between gap-3 rounded-xs border border-transparent bg-base-content/3 px-3 py-2 text-left transition-all duration-200 hover:border-primary/40 hover:bg-primary/5"
                            @click="insertAtCursor(ex.expr)"
                        >
                            <span class="truncate text-[13px] text-base-content/80">{{ ex.label }}</span>
                            <span class="shrink-0 text-xs text-primary select-all group-hover:text-primary/80">{{ ex.expr }}</span>
                            <Icon
                                icon="ri:add-line"
                                class="h-3.5 w-3.5 shrink-0 text-base-content/30 transition group-hover:text-primary"
                            />
                        </button>
                    </div>
                </section>

                <!-- 内置宏 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="MACROS" :title="$t('ast-help.macrosTitle')" />
                    <div class="mt-1 space-y-1.5">
                        <button
                            v-for="(expr, label) in internals"
                            :key="label"
                            class="group flex w-full items-center justify-between gap-3 rounded-xs border border-transparent bg-base-content/3 px-3 py-1.5 text-left transition-all duration-200 hover:border-primary/40 hover:bg-primary/5"
                            @click="insertAtCursor(label)"
                        >
                            <span class="truncate text-[13px] text-base-content/80">{{ label }}</span>
                            <span class="shrink-0 text-xs text-primary select-all">{{ expr }}</span>
                        </button>
                    </div>
                </section>
            </div>

            <!-- 右侧：表达式编辑器 + AST -->
            <div class="flex min-w-0 flex-1 flex-col gap-4">
                <section class="flex min-h-0 flex-1 flex-col rounded-xs border border-base-content/10 bg-base-100/60 p-4 shadow-sm">
                    <label class="mb-2 flex items-center gap-2 text-sm font-semibold text-base-content/90">
                        <Icon icon="ri:pencil-line" class="h-4 w-4 text-primary" />
                        {{ $t("ast-help.inputLabel") }}
                    </label>
                    <!-- CodeMirror 编辑器：AST 专用上色器，点击插入不丢失光标，光标事件驱动上下文提示 -->
                    <div class="h-44 shrink-0 overflow-hidden rounded-xs border border-base-content/15 bg-base-content/3">
                        <CodeEditor
                            ref="codeEditorRef"
                            v-model="inputExpression"
                            language="ast"
                            :ast-macros="astMacros"
                            class="h-full w-full"
                            @cursor="cursorPos = $event"
                        />
                    </div>
                    <div
                        v-if="parseError"
                        class="mt-2 flex items-start gap-2 rounded-xs border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
                    >
                        <Icon icon="ri:error-warning-line" class="mt-0.5 h-4 w-4 shrink-0" />
                        <span class="min-w-0">{{ parseError }}</span>
                    </div>

                    <label class="mb-2 mt-4 flex items-center gap-2 text-sm font-semibold text-base-content/90">
                        <Icon icon="ri:node-tree" class="h-4 w-4 text-primary" />
                        {{ $t("ast-help.astTitle") }}
                    </label>
                    <div class="min-h-0 flex-1 overflow-auto rounded-xs border border-dashed border-base-content/15 bg-base-content/3 p-4">
                        <AstTreeRenderer v-if="astTreeVNodes" :node="astTreeVNodes" />
                        <div v-else class="flex h-full flex-col items-center justify-center gap-2 text-base-content/35">
                            <Icon icon="ri:code-s-slash-line" class="h-8 w-8" />
                            <span class="text-sm">{{ $t("ast-help.astPlaceholder") }}</span>
                        </div>
                    </div>
                </section>

                <div class="flex shrink-0 gap-2">
                    <button class="btn btn-primary flex-1" :disabled="!inputExpression || !!parseError" @click="applyExpression">
                        <Icon icon="radix-icons:check" class="h-4 w-4" />
                        {{ $t("ast-help.apply") }}
                    </button>
                    <button class="btn btn-ghost" @click="inputExpression = ''">
                        <Icon icon="ri:delete-bin-line" class="h-4 w-4" />
                        {{ $t("ast-help.clear") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
