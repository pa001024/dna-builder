/**
 * AutoScript 图形化脚本文档模型（IR）。
 * 流程为顺序执行器：自上而下按数组顺序执行，容器节点嵌套子流程。
 */

export type MouseButton = "left" | "right" | "middle" | "x1" | "x2"
export type ConfigVarKind = "number" | "string" | "boolean" | "select" | "multi-select"
export type CmpOp = "==" | "!=" | ">" | "<" | ">=" | "<="

export interface RoiSelection {
    x: number
    y: number
    width: number
    height: number
    hash: string
}

export interface RoiPickOptions {
    useFilter: boolean
    filterColor: number
    filterTolerance: number
}

export type ColorCallExpr = {
    op: "call"
    fn: "colorExists" | "colorNotExists"
    x: number
    y: number
    color: number
    tolerance: number
}

export type RoiCallExpr = {
    op: "call"
    fn: "roiExists" | "roiNotExists"
    x: number
    y: number
    width: number
    height: number
    hash: string
    tolerance: number
    useFilter: boolean
    filterColor: number
    filterTolerance: number
}

/** 条件操作数：字面量、变量引用、坐标颜色检查 */
export type ExprOperand =
    | { type: "literal"; value: string | number | boolean }
    | { type: "var"; name: string }
    | { type: "colorCheck"; x: number; y: number; color: number; tolerance: number }

/** 布尔条件表达式（图形组合，生成 JS 布尔表达式） */
export type FlowExpr =
    | { op: "and" | "or"; items: FlowExpr[] }
    | { op: "not"; item: FlowExpr }
    | { op: "cmp"; left: ExprOperand; cmp: CmpOp; right: ExprOperand }
    | ColorCallExpr
    | RoiCallExpr

/** 动作节点（叶子） */
export type ActionNode =
    | { kind: "mouseClick"; x?: number; y?: number; button: MouseButton }
    | { kind: "mouseDown"; x?: number; y?: number; button: MouseButton }
    | { kind: "mouseUp"; x?: number; y?: number; button: MouseButton }
    | { kind: "keyPress"; key: string; duration?: number }
    | { kind: "keyDown"; key: string }
    | { kind: "keyUp"; key: string }
    | { kind: "sleep"; ms: number }
    | { kind: "waitColor"; x: number; y: number; color: number; tolerance: number; timeout?: number; saveAs?: string }
    | { kind: "capFrame" }
    | { kind: "setStatus"; title: string; payload: string }
    | { kind: "setConfig"; name: string; value: string }
    | { kind: "playDsl"; dsl: string; saveAs?: string }
    | { kind: "stopPlay" }
    | { kind: "code"; source: string }

/** 流程控制节点（容器） */
export type ControlNode =
    | { kind: "loop"; loopType: "count" | "while" | "forever"; count?: number; condition?: FlowExpr; body: FlowNode[] }
    | { kind: "if"; condition: FlowExpr; thenBody: FlowNode[]; elseBody: FlowNode[] }
    | { kind: "switch"; subjectVar: string; cases: SwitchCase[]; defaultBody: FlowNode[] }
    | { kind: "functionDef"; funcName: string; body: FlowNode[] }
    | { kind: "functionCall"; funcName: string }
    | { kind: "break" }
    | { kind: "continue" }

export type FlowNode = FlowNodeBase & (ActionNode | ControlNode)

export interface FlowNodeBase {
    id: string
    comment?: string
}

export interface SwitchCase {
    id: string
    match: string
    body: FlowNode[]
}

/** readConfig 配置变量 */
export interface ConfigVar {
    /** 配置名（readConfig 第一参数，UI 显示） */
    name: string
    /** 配置描述 */
    desc: string
    kind: ConfigVarKind
    options: string[]
    defaultValue: string | number | boolean | string[]
    /** 生成的 JS 变量名 */
    varName: string
}

/** 图形化脚本文档 */
export interface AutoScriptDoc {
    /** 目标进程名（getWindowByProcessName 参数） */
    processName: string
    /** 是否无边框模式（Cap frameless，影响坐标偏移） */
    frameless: boolean
    configVars: ConfigVar[]
    main: FlowNode[]
}

export function createDefaultDoc(): AutoScriptDoc {
    return {
        processName: "EM-Win64-Shipping.exe",
        frameless: false,
        configVars: [],
        main: [],
    }
}
