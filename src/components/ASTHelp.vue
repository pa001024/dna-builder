<script setup lang="ts">
import { t } from "i18next"
import { debounce } from "lodash-es"
import { computed, defineComponent, h, ref, type VNode, watch } from "vue"
import type { CharBuild, LeveledSkill } from "../data"
import { CharBuild as CharBuildClass } from "../data"
import { type ASTNode, parseAST } from "../data/ast"

const props = defineProps<{
    skill?: LeveledSkill
    charBuild?: CharBuild
}>()

const model = defineModel<boolean>()
const emit = defineEmits(["select"])

const inputExpression = ref("")
const astTree = ref<ASTNode | null>(null)
const parseError = ref("")

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

// 参考内容按类别分组，用于分区展示。
const referenceGroups = computed(() => {
    const groups: { key: string; title: string; icon: import("./Icon.vue").IconTypes; items: Record<string, string> }[] = [
        { key: "operators", title: t("ast-help.operatorsTitle"), icon: "ri:calculator-line", items: operators },
        { key: "functions", title: t("ast-help.functionsTitle"), icon: "ri:function-line", items: functions },
        { key: "members", title: t("ast-help.membersTitle"), icon: "ri:play-circle-line", items: members },
        {
            key: "namespaces",
            title: t("ast-help.namespacesTitle"),
            icon: "ri:box-3-line",
            items: Object.fromEntries(namespaces.value.map(ns => [ns + "::", ""])),
        },
    ]
    return groups
})

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

const namespaces = computed(() => ["E", "Q", "P", "近战", "远程", "同律", ...(props.charBuild?.allSkills.map(v => v.名称) || [])])

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

function selectExample(expr: string) {
    inputExpression.value = expr
    parseExpression()
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

// 将 AST VNode 包装为单根节点，方便在 <pre> 中直接渲染。
const AstTreeRenderer = defineComponent({
    props: {
        node: { type: Object as import("vue").PropType<VNode | null>, default: null },
    },
    render() {
        const node = this.node
        return h("pre", { class: "text-[13px] font-mono leading-relaxed whitespace-pre-wrap" }, node ?? "")
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
    members: "text-sky-300",
    namespaces: "text-base-content/70",
}
</script>

<template>
    <div class="flex h-[80vh] flex-col overflow-hidden">
        <!-- 顶部标题栏 -->
        <div class="flex items-center gap-3 border-b border-base-300/60 bg-base-100/60 px-4 py-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-accent/20 text-primary">
                <Icon icon="ri:function-line" class="h-5 w-5" />
            </div>
            <div class="min-w-0">
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
            <div class="w-[46%] min-w-0 space-y-3 overflow-y-auto pr-1">
                <!-- 表达式语法 -->
                <section class="rounded-2xl border border-base-300/50 bg-base-100/80 shadow-sm">
                    <header class="flex items-center gap-2 px-4 pt-3 pb-2">
                        <Icon icon="ri:book-open-line" class="h-4 w-4 text-primary" />
                        <h4 class="text-sm font-semibold text-base-content">{{ $t("ast-help.syntaxTitle") }}</h4>
                    </header>
                    <div class="space-y-1.5 px-4 pb-4 text-[13px] leading-relaxed text-base-content/70">
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

                <!-- 运算符 / 函数 / 伤害类型 / 命名空间 -->
                <section
                    v-for="group in referenceGroups"
                    :key="group.key"
                    class="rounded-2xl border border-base-300/50 bg-base-100/80 shadow-sm"
                >
                    <header class="flex items-center gap-2 px-4 pt-3 pb-2">
                        <Icon :icon="group.icon" class="h-4 w-4 text-primary" />
                        <h4 class="text-sm font-semibold text-base-content">{{ group.title }}</h4>
                    </header>
                    <div class="grid grid-cols-1 gap-x-3 gap-y-1 px-4 pb-4 sm:grid-cols-2">
                        <div
                            v-for="(desc, name) in group.items"
                            :key="name"
                            class="flex min-w-0 items-center gap-2 rounded-lg bg-base-200/40 px-2 py-1"
                        >
                            <code class="shrink-0 font-mono text-xs font-semibold" :class="badgeColors[group.key]">{{ name }}</code>
                            <span v-if="desc" class="min-w-0 truncate text-xs text-base-content/70">{{ desc }}</span>
                        </div>
                    </div>
                </section>

                <!-- 示例表达式 -->
                <section class="rounded-2xl border border-base-300/50 bg-base-100/80 shadow-sm">
                    <header class="flex items-center gap-2 px-4 pt-3 pb-2">
                        <Icon icon="ri:lightbulb-line" class="h-4 w-4 text-primary" />
                        <h4 class="text-sm font-semibold text-base-content">{{ $t("ast-help.examplesTitle") }}</h4>
                    </header>
                    <div class="space-y-1.5 px-4 pb-4">
                        <button
                            v-for="ex in examples"
                            :key="ex.expr"
                            class="group flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-base-200/40 px-3 py-2 text-left transition-all duration-200 hover:border-primary/40 hover:bg-primary/5"
                            @click="selectExample(ex.expr)"
                        >
                            <span class="truncate text-[13px] text-base-content/80">{{ ex.label }}</span>
                            <code class="shrink-0 font-mono text-xs text-primary group-hover:text-primary/80 select-all">
                                {{ ex.expr }}
                            </code>
                            <Icon
                                icon="ri:add-line"
                                class="h-3.5 w-3.5 shrink-0 text-base-content/30 transition group-hover:text-primary"
                            />
                        </button>
                    </div>
                </section>

                <!-- 内置宏 -->
                <section class="rounded-2xl border border-base-300/50 bg-base-100/80 shadow-sm">
                    <header class="flex items-center gap-2 px-4 pt-3 pb-2">
                        <Icon icon="ri:terminal-box-line" class="h-4 w-4 text-primary" />
                        <h4 class="text-sm font-semibold text-base-content">{{ $t("ast-help.macrosTitle") }}</h4>
                    </header>
                    <div class="space-y-1.5 px-4 pb-4">
                        <button
                            v-for="(expr, label) in internals"
                            :key="label"
                            class="group flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-base-200/40 px-3 py-1.5 text-left transition-all duration-200 hover:border-primary/40 hover:bg-primary/5"
                            @click="selectExample(label)"
                        >
                            <span class="truncate text-[13px] text-base-content/80">{{ label }}</span>
                            <code class="shrink-0 font-mono text-xs text-primary select-all">{{ expr }}</code>
                        </button>
                    </div>
                </section>
            </div>

            <!-- 右侧：表达式编辑器 + AST -->
            <div class="flex min-w-0 flex-1 flex-col gap-4">
                <section class="flex min-h-0 flex-1 flex-col rounded-2xl border border-base-300/50 bg-base-100/80 p-4 shadow-sm">
                    <label class="mb-2 flex items-center gap-2 text-sm font-semibold text-base-content/90">
                        <Icon icon="ri:pencil-line" class="h-4 w-4 text-primary" />
                        {{ $t("ast-help.inputLabel") }}
                    </label>
                    <textarea
                        v-model="inputExpression"
                        class="textarea min-h-20 grow resize-none font-mono text-sm leading-relaxed w-full"
                        :placeholder="$t('ast-help.inputPlaceholder')"
                        spellcheck="false"
                    />
                    <div
                        v-if="parseError"
                        class="mt-2 flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
                    >
                        <Icon icon="ri:error-warning-line" class="mt-0.5 h-4 w-4 shrink-0" />
                        <span class="min-w-0">{{ parseError }}</span>
                    </div>

                    <label class="mb-2 mt-4 flex items-center gap-2 text-sm font-semibold text-base-content/90">
                        <Icon icon="ri:node-tree" class="h-4 w-4 text-primary" />
                        {{ $t("ast-help.astTitle") }}
                    </label>
                    <div class="min-h-0 flex-1 overflow-auto rounded-xl border border-dashed border-base-300/70 bg-base-200/30 p-4">
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
