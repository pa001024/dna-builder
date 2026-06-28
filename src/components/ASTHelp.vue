<script setup lang="ts">
import { t } from "i18next"
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
    { label: t("ast-help.examples.baseStats"), expr: "攻击 + 防御" },
    { label: t("ast-help.examples.specialValue"), expr: "[攻击]" },
    { label: t("ast-help.examples.expectedDamage"), expr: skillName },
    { label: t("ast-help.examples.critDamage"), expr: skillName + ".暴击" },
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
                <h4 class="font-semibold mb-2 text-base-content/90">{{ $t("ast-help.syntaxTitle") }}</h4>
                <div class="space-y-2 text-sm text-base-content/80">
                    <p>{{ $t("ast-help.syntaxDesc") }}</p>
                    <ul class="list-disc list-inside space-y-1 ml-2">
                        <li>
                            <strong>{{ $t("ast-help.syntaxItems.number.label") }}:</strong> {{ $t("ast-help.syntaxItems.number.desc") }}
                        </li>
                        <li>
                            <strong>{{ $t("ast-help.syntaxItems.property.label") }}:</strong> {{ $t("ast-help.syntaxItems.property.desc") }}
                        </li>
                        <li>
                            <strong>{{ $t("ast-help.syntaxItems.special.label") }}:</strong> {{ $t("ast-help.syntaxItems.special.desc") }}
                        </li>
                        <li>
                            <strong>{{ $t("ast-help.syntaxItems.skill.label") }}:</strong> {{ $t("ast-help.syntaxItems.skill.desc") }}
                        </li>
                        <li>
                            <strong>{{ $t("ast-help.syntaxItems.namespace.label") }}:</strong>
                            {{ $t("ast-help.syntaxItems.namespace.desc") }}
                        </li>
                        <li>
                            <strong>{{ $t("ast-help.syntaxItems.operator.label") }}:</strong> {{ $t("ast-help.syntaxItems.operator.desc") }}
                        </li>
                        <li>
                            <strong>{{ $t("ast-help.syntaxItems.function.label") }}:</strong> {{ $t("ast-help.syntaxItems.function.desc") }}
                        </li>
                        <li>
                            <strong>{{ $t("ast-help.syntaxItems.member.label") }}:</strong> {{ $t("ast-help.syntaxItems.member.desc") }}
                        </li>
                    </ul>
                </div>
            </div>

            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">{{ $t("ast-help.operatorsTitle") }}</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div v-for="(desc, op) in operators" :key="op" class="flex items-center gap-2">
                        <span class="badge badge-sm badge-info">{{ op }}</span>
                        <span class="text-base-content/80">{{ desc }}</span>
                    </div>
                </div>
            </div>

            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">{{ $t("ast-help.functionsTitle") }}</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div v-for="(desc, fn) in functions" :key="fn" class="flex items-center gap-2">
                        <span class="badge badge-sm badge-secondary select-all!">{{ fn }}</span>
                        <span class="text-base-content/80">{{ desc }}</span>
                    </div>
                </div>
            </div>

            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">{{ $t("ast-help.membersTitle") }}</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div v-for="(desc, member) in members" :key="member" class="flex items-center gap-2">
                        <span class="badge badge-sm badge-accent select-all!">.{{ member }}</span>
                        <span class="text-base-content/80">{{ desc }}</span>
                    </div>
                </div>
            </div>
            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">{{ $t("ast-help.namespacesTitle") }}</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div v-for="ns in namespaces" :key="ns" class="flex items-center gap-2">
                        <span class="badge badge-sm badge-accent select-all!">{{ ns }}::</span>
                    </div>
                </div>
            </div>

            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">{{ $t("ast-help.examplesTitle") }}</h4>
                <div class="space-y-2">
                    <button
                        v-for="ex in examples"
                        :key="ex.expr"
                        class="w-full text-left p-2 rounded bg-base-100 hover:bg-base-300 transition-colors duration-200 flex items-center justify-between group"
                        @click="selectExample(ex.expr)"
                    >
                        <span class="text-sm text-base-content/80">{{ ex.label }}</span>
                        <span class="text-xs font-mono text-primary group-hover:text-primary/80">{{ ex.expr }}</span>
                    </button>
                </div>
            </div>
            <div class="bg-base-200 rounded-lg p-4">
                <h4 class="font-semibold mb-2 text-base-content/90">{{ $t("ast-help.macrosTitle") }}</h4>
                <div class="space-y-2">
                    <button
                        v-for="(expr, label) in internals"
                        :key="label"
                        class="w-full text-left p-2 rounded bg-base-100 hover:bg-base-300 transition-colors duration-200 flex items-center justify-between group"
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
                <label class="text-sm font-semibold text-base-content/90">{{ $t("ast-help.inputLabel") }}</label>
                <textarea
                    v-model="inputExpression"
                    class="textarea grow font-mono text-sm w-full"
                    :placeholder="$t('ast-help.inputPlaceholder')"
                />
                <div v-if="parseError" class="text-error text-sm">
                    {{ parseError }}
                </div>
            </div>

            <div class="flex-1 flex flex-col gap-2 overflow-hidden">
                <label class="text-sm font-semibold text-base-content/90">{{ $t("ast-help.astTitle") }}</label>
                <div class="flex-1 bg-base-200 rounded-lg p-4 overflow-auto">
                    <pre v-if="astTree" class="text-sm font-mono whitespace-pre-wrap">{{ astTreeText }}</pre>
                    <div v-else class="text-base-content/40 text-sm">{{ $t("ast-help.astPlaceholder") }}</div>
                </div>
            </div>

            <div class="flex gap-2">
                <button class="btn btn-primary flex-1" :disabled="!inputExpression || !!parseError" @click="applyExpression">
                    <Icon icon="radix-icons:check" class="w-4 h-4" />
                    {{ $t("ast-help.apply") }}
                </button>
                <button class="btn btn-ghost" @click="inputExpression = ''">
                    <Icon icon="ri:delete-bin-line" class="w-4 h-4" />
                    {{ $t("ast-help.clear") }}
                </button>
            </div>
        </div>
    </div>
</template>
