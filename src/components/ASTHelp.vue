<script setup lang="ts">
import { debounce } from "lodash-es"
import { computed, ref, watch } from "vue"
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
    { label: "基础属性", expr: "攻击 + 防御" },
    { label: "特殊值", expr: "[攻击]" },
    { label: "期望伤害", expr: skillName },
    { label: "暴击伤害", expr: skillName + ".暴击" },
    { label: "函数使用", expr: "max(攻击, 防御) * 2" },
    { label: "命名空间", expr: "伊卡洛斯::伤害" },
    { label: "复杂表达式", expr: "(" + skillName + ") / max(Q::神智消耗, 20)" },
]

const internals = CharBuildClass.macros

const operators = {
    "+": "加法",
    "-": "减法",
    "*": "乘法",
    "/": "除法",
    "%": "取模",
    "//": "整除",
}

const functions = {
    "min(...)": "最小值",
    "max(...)": "最大值",
    "floor(x)": "向下取整",
    "ceil(x)": "向上取整",
    "or(...)": "或运算",
    "log(x)": "自然对数",
    "power(x, y)": "幂运算",
    "hp(x)": "计算背水昂扬乘区(x为血量比例0~1)",
}

const members = {
    N: "不计算背水昂扬乘区",
    暴击: "暴击伤害",
    未暴击: "未暴击伤害",
    触发: "触发伤害",
    未触发: "未触发伤害",
    暴击触发: "暴击且触发",
    未触发暴击: "暴击且未触发",
    触发未暴击: "未暴击且触发",
    未暴击未触发: "未暴击且未触发",
}

const namespaces = computed(() => ["E", "Q", "近战", "远程", "同律", ...(props.charBuild?.allSkills.map(v => v.名称) || [])])

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
            parseError.value = e.message || "表达式解析错误"
            astTree.value = null
        }
        return
    }
    try {
        astTree.value = parseAST(inputExpression.value)
        parseError.value = ""
    } catch (e: any) {
        parseError.value = e.message || "表达式解析错误"
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

function renderNode(node: ASTNode, depth = 0): string {
    const indent = "  ".repeat(depth)
    switch (node.type) {
        case "number":
            return `${indent}数字: ${node.value}`
        case "property":
            const namespace = (node as any).namespace ? `${(node as any).namespace}::` : ""
            return `${indent}属性: ${namespace}${node.name}`
        case "binary":
            return `${indent}二元运算 (${operators[node.operator as keyof typeof operators] || node.operator})\n${renderNode(node.left, depth + 1)}\n${renderNode(node.right, depth + 1)}`
        case "unary":
            return `${indent}一元运算 (${node.operator})\n${renderNode(node.argument, depth + 1)}`
        case "function":
            const funcNamespace = (node as any).namespace ? `${(node as any).namespace}::` : ""
            return `${indent}函数: ${funcNamespace}${functions[node.name as keyof typeof functions] || node.name}\n${node.args.map(arg => renderNode(arg, depth + 1)).join("\n")}`
        case "member_access":
            return `${indent}成员访问: ${members[node.property as keyof typeof members] || node.property}\n${renderNode(node.object, depth + 1)}`
        default:
            return `${indent}未知节点: ${(node as any).type}`
    }
}

const astTreeText = computed(() => {
    if (!astTree.value) return ""
    return renderNode(astTree.value)
})
</script>

<template>
    <div class="flex gap-4 h-[70vh] overflow-hidden">
        <div class="flex-1 overflow-y-auto space-y-4 pr-2">
            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">表达式语法</h4>
                <div class="space-y-2 text-sm text-base-content/80">
                    <p>表达式用于计算伤害、属性值等，支持以下语法：</p>
                    <ul class="list-disc list-inside space-y-1 ml-2">
                        <li><strong>数字:</strong> 直接输入数字，如 100, 1.5</li>
                        <li><strong>属性:</strong> 角色属性名，如 攻击、防御、生命</li>
                        <li>
                            <strong>特殊值:</strong> 倍率固定为100%(不受威力影响) 用于自定义技能倍率，如 [攻击]*1.2
                            模拟120%倍率、以及[防御]、[生命]等
                        </li>
                        <li><strong>技能:</strong> 技能伤害字段，如 [幻象]伤害</li>
                        <li><strong>命名空间:</strong> 使用 :: 访问命名空间，如 伊卡洛斯::伤害</li>
                        <li><strong>运算符:</strong> +, -, *, /, %, //</li>
                        <li><strong>函数:</strong> min(), max(), floor(), ceil(), or(), log(), power()</li>
                        <li><strong>成员访问:</strong> 使用 . 访问伤害类型，如 .暴击、.未暴击</li>
                    </ul>
                </div>
            </div>

            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">运算符说明</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div v-for="(desc, op) in operators" :key="op" class="flex items-center gap-2">
                        <span class="badge badge-sm badge-info">{{ op }}</span>
                        <span class="text-base-content/80">{{ desc }}</span>
                    </div>
                </div>
            </div>

            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">函数说明</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div v-for="(desc, fn) in functions" :key="fn" class="flex items-center gap-2">
                        <span class="badge badge-sm badge-secondary select-all!">{{ fn }}</span>
                        <span class="text-base-content/80">{{ desc }}</span>
                    </div>
                </div>
            </div>

            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">伤害类型说明</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div v-for="(desc, member) in members" :key="member" class="flex items-center gap-2">
                        <span class="badge badge-sm badge-accent select-all!">.{{ member }}</span>
                        <span class="text-base-content/80">{{ desc }}</span>
                    </div>
                </div>
            </div>
            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">命名空间说明</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div v-for="ns in namespaces" :key="ns" class="flex items-center gap-2">
                        <span class="badge badge-sm badge-accent select-all!">{{ ns }}::</span>
                    </div>
                </div>
            </div>

            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">示例表达式</h4>
                <div class="space-y-2">
                    <button
                        v-for="ex in examples"
                        :key="ex.expr"
                        class="w-full text-left p-2 rounded bg-base-100 hover:bg-base-300 transition-colors flex items-center justify-between group"
                        @click="selectExample(ex.expr)"
                    >
                        <span class="text-sm text-base-content/80">{{ ex.label }}</span>
                        <span class="text-xs font-mono text-primary group-hover:text-primary/80">{{ ex.expr }}</span>
                    </button>
                </div>
            </div>
            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">内置宏</h4>
                <div class="space-y-2">
                    <button
                        v-for="(expr, label) in internals"
                        :key="label"
                        class="w-full text-left p-2 rounded bg-base-100 hover:bg-base-300 transition-colors flex items-center justify-between group"
                        @click="selectExample(label)"
                    >
                        <span class="text-sm text-base-content/80">{{ label }}</span>
                        <span class="text-xs font-mono text-primary group-hover:text-primary/80">{{ expr }}</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="flex-1 flex flex-col gap-4">
            <div class="flex-1 flex flex-col gap-2">
                <label class="text-sm font-semibold text-base-content/90">表达式输入</label>
                <textarea
                    v-model="inputExpression"
                    class="textarea grow font-mono text-sm w-full"
                    placeholder="输入表达式，如: 攻击 + 防御"
                />
                <div v-if="parseError" class="text-error text-sm">
                    {{ parseError }}
                </div>
            </div>

            <div class="flex-1 flex flex-col gap-2 overflow-hidden">
                <label class="text-sm font-semibold text-base-content/90">AST 树结构</label>
                <div class="flex-1 bg-base-200 rounded-lg p-4 overflow-auto">
                    <pre v-if="astTree" class="text-sm font-mono whitespace-pre-wrap">{{ astTreeText }}</pre>
                    <div v-else class="text-base-content/40 text-sm">输入表达式后显示AST树结构</div>
                </div>
            </div>

            <div class="flex gap-2">
                <button class="btn btn-primary flex-1" :disabled="!inputExpression || !!parseError" @click="applyExpression">
                    <Icon icon="radix-icons:check" class="w-4 h-4" />
                    应用表达式
                </button>
                <button class="btn btn-ghost" @click="inputExpression = ''">
                    <Icon icon="ri:delete-bin-line" class="w-4 h-4" />
                    清空
                </button>
            </div>
        </div>
    </div>
</template>
