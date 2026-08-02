import type {
    AutoScriptDoc,
    ColorCallExpr,
    ConfigVar,
    ExprOperand,
    FlowExpr,
    FlowNode,
    MouseButton,
    RoiCallExpr,
    SwitchCase,
} from "./types"

const INDENT = "    "

export interface CodegenIssue {
    level: "warn" | "error"
    message: string
}

export interface CodegenResult {
    code: string
    issues: CodegenIssue[]
}

/** 生成合法的 JS 标识符（非法字符转下划线，数字开头加前缀；支持 CJK 等 Unicode 标识符字符）。 */
export function toIdentifier(name: string, fallbackPrefix = "v"): string {
    const normalized = String(name ?? "").replace(/[^\p{L}\p{N}_$]/gu, "_")
    if (!normalized) return fallbackPrefix
    return /^[0-9]/.test(normalized) ? `${fallbackPrefix}_${normalized}` : normalized
}

function jsString(value: string): string {
    return JSON.stringify(String(value ?? ""))
}

function jsLiteral(value: string | number | boolean): string {
    if (typeof value === "string") return jsString(value)
    if (typeof value === "boolean") return value ? "true" : "false"
    return Number.isFinite(value) ? String(value) : "0"
}

function jsColor(color: number): string {
    const hex = Math.max(0, Math.floor(color)).toString(16).toUpperCase().padStart(6, "0")
    return `0x${hex}`
}

function jsButton(button: MouseButton): string {
    return button === "left" ? "" : `, ${jsString(button)}`
}

function jsOptionalNumber(value: number | undefined): string {
    return value == null || !Number.isFinite(value) ? "undefined" : String(Math.round(value))
}

/** 生成区域特征识别调用。 */
function emitRoiCall(expr: RoiCallExpr): string {
    const filter = expr.useFilter ? `, 1, ${jsColor(expr.filterColor)}, ${Math.round(expr.filterTolerance)}` : ""
    return `c.croi(c.frame.roi(${Math.round(expr.x)}, ${Math.round(expr.y)}, ${Math.round(expr.width)}, ${Math.round(expr.height)}), ${jsString(expr.hash)}, ${Math.round(expr.tolerance)}${filter})`
}

/** 生成单点颜色检查调用。 */
function emitColorCall(expr: ColorCallExpr): string {
    return `cc(c.frame, ${Math.round(expr.x)}, ${Math.round(expr.y)}, ${jsColor(expr.color)}, ${Math.round(expr.tolerance)})`
}

/** 编译条件操作数。 */
function emitOperand(operand: ExprOperand): string {
    if (operand.type === "var") return toIdentifier(operand.name)
    if (operand.type === "colorCheck") {
        return `cc(c.frame, ${Math.round(operand.x)}, ${Math.round(operand.y)}, ${jsColor(operand.color)}, ${Math.round(operand.tolerance)})`
    }
    return jsLiteral(operand.value)
}

/** 编译布尔条件表达式。 */
export function emitExpr(expr: FlowExpr | undefined): string {
    if (!expr) return "true"
    switch (expr.op) {
        case "and": {
            const items = expr.items.map(item => `(${emitExpr(item)})`)
            return items.length ? items.join(" && ") : "true"
        }
        case "or": {
            const items = expr.items.map(item => `(${emitExpr(item)})`)
            return items.length ? items.join(" || ") : "false"
        }
        case "not":
            return `!(${emitExpr(expr.item)})`
        case "cmp":
            return `${emitOperand(expr.left)} ${expr.cmp} ${emitOperand(expr.right)}`
        case "call": {
            if (expr.fn === "roiExists" || expr.fn === "roiNotExists") {
                const check = emitRoiCall(expr)
                return expr.fn === "roiExists" ? check : `!${check}`
            }
            const check = emitColorCall(expr as ColorCallExpr)
            return expr.fn === "colorExists" ? check : `!${check}`
        }
        default:
            return "true"
    }
}

interface EmitContext {
    issues: CodegenIssue[]
    /** 已定义的函数名（fn_ 前缀） */
    functions: Set<string>
    /** 已声明的变量名（config 变量 + 节点输出） */
    declaredVars: Set<string>
    /** 当前循环深度（break/continue 校验） */
    loopDepth: number
}

function emitComment(node: FlowNode): string[] {
    return node.comment?.trim() ? [`// ${node.comment.trim()}`] : []
}

function emitAction(node: FlowNode, ctx: EmitContext): string[] {
    switch (node.kind) {
        case "mouseClick":
            return [`c.mc(${jsOptionalNumber(node.x)}, ${jsOptionalNumber(node.y)}${jsButton(node.button)})`]
        case "mouseDown":
            return [`c.md(${jsOptionalNumber(node.x)}, ${jsOptionalNumber(node.y)}${jsButton(node.button)})`]
        case "mouseUp":
            return [`c.mu(${jsOptionalNumber(node.x)}, ${jsOptionalNumber(node.y)}${jsButton(node.button)})`]
        case "keyPress":
            return node.duration != null && node.duration > 0
                ? [`await c.kb(${jsString(node.key)}, ${Math.round(node.duration)})`]
                : [`await c.kb(${jsString(node.key)})`]
        case "keyDown":
            return [`kd(c.hwnd, ${jsString(node.key)})`]
        case "keyUp":
            return [`ku(c.hwnd, ${jsString(node.key)})`]
        case "sleep":
            return [`await sleep(${Math.max(0, Math.round(node.ms))})`]
        case "waitColor": {
            const timeout = node.timeout != null && node.timeout > 0 ? `, ${Math.round(node.timeout)}` : ""
            const call = `await c.waitColor(${Math.round(node.x)}, ${Math.round(node.y)}, ${jsColor(node.color)}, ${Math.round(node.tolerance)}${timeout})`
            if (node.saveAs?.trim()) {
                const varName = toIdentifier(node.saveAs.trim(), "w")
                if (!ctx.declaredVars.has(varName)) {
                    ctx.declaredVars.add(varName)
                    return [`const ${varName} = ${call}`]
                }
                return [`${varName} = ${call}`]
            }
            return [call]
        }
        case "capFrame":
            return ["c.cap()"]
        case "setStatus":
            return [`setStatus(${jsString(node.title)}, ${jsString(node.payload)})`]
        case "setConfig":
            return [`setConfig(${jsString(node.name)}, ${jsString(node.value)})`]
        case "playDsl": {
            const call = `c.play(${jsString(node.dsl)})`
            if (node.saveAs?.trim()) {
                const varName = toIdentifier(node.saveAs.trim(), "play")
                if (!ctx.declaredVars.has(varName)) {
                    ctx.declaredVars.add(varName)
                    return [`const ${varName} = ${call}`]
                }
                return [`${varName} = ${call}`]
            }
            return [`await ${call}`]
        }
        case "stopPlay":
            return ["c.stopPlay()"]
        case "code":
            return node.source
                .split("\n")
                .map(line => line.trimEnd())
                .filter(line => line.length > 0)
        default:
            return []
    }
}

function emitNodes(nodes: FlowNode[], ctx: EmitContext, depth: number): string[] {
    const lines: string[] = []
    for (const node of nodes) {
        lines.push(...emitNode(node, ctx, depth))
    }
    return lines
}

function emitBlock(body: FlowNode[], ctx: EmitContext, depth: number, emptyPlaceholder: string): string[] {
    const lines = emitNodes(body, ctx, depth + 1)
    if (lines.length === 0) {
        return [`${INDENT.repeat(depth + 1)}${emptyPlaceholder}`]
    }
    return lines.map(line => (line ? INDENT.repeat(depth + 1) + line : line))
}

function emitNode(node: FlowNode, ctx: EmitContext, depth: number): string[] {
    const pad = INDENT.repeat(depth)
    const comments = emitComment(node).map(line => pad + line)

    switch (node.kind) {
        case "loop": {
            let header: string
            if (node.loopType === "forever") {
                header = "while (true) {"
            } else if (node.loopType === "count") {
                header = `for (let i = 0; i < ${Math.max(0, Math.round(node.count ?? 0))}; i++) {`
            } else {
                header = `while (${emitExpr(node.condition)}) {`
            }
            ctx.loopDepth += 1
            const body = emitBlock(node.body, ctx, depth, "// (空循环体)")
            ctx.loopDepth -= 1
            return [...comments, pad + header, ...body, `${pad}}`]
        }
        case "if": {
            const thenLines = emitBlock(node.thenBody, ctx, depth, "// (空分支)")
            const lines = [...comments, `${pad}if (${emitExpr(node.condition)}) {`, ...thenLines, `${pad}}`]
            if (node.elseBody.length > 0) {
                const elseLines = emitBlock(node.elseBody, ctx, depth, "// (空分支)")
                lines[lines.length - 1] = `${pad}} else {`
                lines.push(...elseLines, `${pad}}`)
            }
            return lines
        }
        case "switch": {
            const lines = [...comments, `${pad}switch (${toIdentifier(node.subjectVar)}) {`]
            for (const switchCase of node.cases) {
                lines.push(`${pad}${INDENT}case ${jsString(switchCase.match)}:`)
                const caseBody = emitSwitchCaseBody(switchCase, ctx, depth + 2)
                lines.push(...caseBody, `${pad}${INDENT}${INDENT}break`)
            }
            if (node.defaultBody.length > 0) {
                lines.push(`${pad}${INDENT}default:`)
                lines.push(...emitNodes(node.defaultBody, ctx, depth + 2).map(line => INDENT.repeat(depth + 2) + line))
            }
            lines.push(`${pad}}`)
            return lines
        }
        case "functionDef": {
            // functionDef 由 generateCode 顶层收集，不内联输出
            return []
        }
        case "functionCall": {
            const fnName = `fn_${toIdentifier(node.funcName, "unnamed")}`
            if (!ctx.functions.has(fnName)) {
                ctx.issues.push({ level: "warn", message: `调用了未定义的函数: ${node.funcName || "(未命名)"}` })
                return [...comments, `${pad}// TODO: 未定义的函数 ${node.funcName || "(未命名)"}`]
            }
            return [...comments, `${pad}await ${fnName}()`]
        }
        case "break": {
            if (ctx.loopDepth <= 0) {
                ctx.issues.push({ level: "warn", message: "break 位于循环之外" })
                return [...comments, `${pad}// break (不在循环内)`]
            }
            return [...comments, `${pad}break`]
        }
        case "continue": {
            if (ctx.loopDepth <= 0) {
                ctx.issues.push({ level: "warn", message: "continue 位于循环之外" })
                return [...comments, `${pad}// continue (不在循环内)`]
            }
            return [...comments, `${pad}continue`]
        }
        default:
            return [...comments, ...emitAction(node, ctx).map(line => pad + line)]
    }
}

function emitSwitchCaseBody(switchCase: SwitchCase, ctx: EmitContext, depth: number): string[] {
    const lines = emitNodes(switchCase.body, ctx, depth)
    if (lines.length === 0) return []
    return lines.map(line => INDENT.repeat(depth) + line)
}

function emitConfigVar(configVar: ConfigVar): string {
    const varName = toIdentifier(configVar.varName || configVar.name, "cfg")
    let format: string
    if (configVar.kind === "select" || configVar.kind === "multi-select") {
        format = `{ type: ${jsString(configVar.kind)}, options: ${JSON.stringify(configVar.options)} }`
    } else {
        format = jsString(configVar.kind)
    }
    const defaultValue = JSON.stringify(
        configVar.defaultValue ??
            (configVar.kind === "number" ? 0 : configVar.kind === "boolean" ? false : configVar.kind === "multi-select" ? [] : "")
    )
    return `const ${varName} = readConfig(${jsString(configVar.name)}, ${jsString(configVar.desc)}, ${format}, ${defaultValue})`
}

/**
 * 收集 main 流程中的函数定义。
 * @param nodes 流程节点
 * @returns 函数定义节点列表
 */
function collectFunctionDefs(nodes: FlowNode[]): (FlowNode & { kind: "functionDef" })[] {
    const defs: (FlowNode & { kind: "functionDef" })[] = []
    const walk = (list: FlowNode[]) => {
        for (const node of list) {
            if (node.kind === "functionDef") {
                defs.push(node)
                walk(node.body)
                continue
            }
            if (node.kind === "loop") walk(node.body)
            else if (node.kind === "if") {
                walk(node.thenBody)
                walk(node.elseBody)
            } else if (node.kind === "switch") {
                for (const switchCase of node.cases) walk(switchCase.body)
                walk(node.defaultBody)
            }
        }
    }
    walk(nodes)
    return defs
}

/**
 * 将图形化脚本文档编译为合法的引擎 JS 代码。
 * @param doc 图形化脚本文档
 * @returns 生成结果（代码与告警）
 */
export function generateCode(doc: AutoScriptDoc): CodegenResult {
    const ctx: EmitContext = {
        issues: [],
        functions: new Set(),
        declaredVars: new Set(),
        loopDepth: 0,
    }

    const functionDefs = collectFunctionDefs(doc.main)
    const seenFnNames = new Set<string>()
    for (const def of functionDefs) {
        const fnName = `fn_${toIdentifier(def.funcName, "unnamed")}`
        if (seenFnNames.has(fnName)) {
            ctx.issues.push({ level: "warn", message: `函数重名: ${def.funcName}` })
            continue
        }
        seenFnNames.add(fnName)
        ctx.functions.add(fnName)
    }
    for (const configVar of doc.configVars) {
        ctx.declaredVars.add(toIdentifier(configVar.varName || configVar.name, "cfg"))
    }

    const lines: string[] = []
    lines.push('import { Cap } from "cap"')
    lines.push("")
    lines.push(
        `const c = new Cap(getWindowByProcessName(${jsString(doc.processName || "EM-Win64-Shipping.exe")})${doc.frameless ? ", { frameless: true }" : ""})`
    )

    if (doc.configVars.length > 0) {
        lines.push("")
        for (const configVar of doc.configVars) {
            lines.push(emitConfigVar(configVar))
        }
    }

    for (const def of functionDefs) {
        const fnName = `fn_${toIdentifier(def.funcName, "unnamed")}`
        if (!ctx.functions.has(fnName)) continue // 重名函数已在收集阶段告警并跳过
        lines.push("")
        lines.push(`async function ${fnName}() {`)
        const bodyLines = emitNodes(def.body, ctx, 1)
        if (bodyLines.length === 0) {
            lines.push(`${INDENT}// (空函数体)`)
        } else {
            lines.push(...bodyLines.map(line => INDENT + line))
        }
        lines.push("}")
    }

    lines.push("")
    lines.push("async function main() {")
    const mainNodes = doc.main.filter(node => node.kind !== "functionDef")
    const mainLines = emitNodes(mainNodes, ctx, 1)
    if (mainLines.length === 0) {
        lines.push(`${INDENT}// (空流程，请从左侧拖入节点)`)
    } else {
        lines.push(...mainLines.map(line => INDENT + line))
    }
    lines.push("}")
    lines.push("")
    lines.push("main()")
    lines.push("")

    return { code: lines.join("\n"), issues: ctx.issues }
}
