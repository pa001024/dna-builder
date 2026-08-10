import type { FlowNode } from "@/utils/autoscript/types"
import type { IconTypes } from "../Icon.vue"

export interface PaletteEntry {
    kind: FlowNode["kind"]
    label: string
    icon: IconTypes
    category: "action" | "control"
    hint?: string
}

export const PALETTE: PaletteEntry[] = [
    // 流程控制
    { kind: "loop", label: "循环", icon: "ri:refresh-line", category: "control", hint: "次数 / while 条件 / 无限" },
    { kind: "if", label: "条件判断", icon: "ri:git-branch-line", category: "control", hint: "if - else" },
    { kind: "switch", label: "多条件分支", icon: "ri:list-check-3", category: "control", hint: "switch - case - default" },
    { kind: "functionDef", label: "函数定义", icon: "ri:function-line", category: "control" },
    { kind: "functionCall", label: "函数调用", icon: "ri:play-circle-line", category: "control" },
    { kind: "break", label: "跳出循环", icon: "ri:close-circle-line", category: "control" },
    { kind: "continue", label: "继续循环", icon: "ri:skip-forward-line", category: "control" },
    // 动作
    { kind: "mouseClick", label: "鼠标点击", icon: "ri:cursor-line", category: "action" },
    { kind: "mouseDown", label: "鼠标按下", icon: "ri:drag-move-line", category: "action" },
    { kind: "mouseUp", label: "鼠标抬起", icon: "ri:drag-move-line", category: "action" },
    { kind: "keyPress", label: "按键", icon: "ri:keyboard-line", category: "action" },
    { kind: "keyDown", label: "按键按下", icon: "ri:keyboard-fill", category: "action" },
    { kind: "keyUp", label: "按键抬起", icon: "ri:keyboard-fill", category: "action" },
    { kind: "sleep", label: "等待", icon: "ri:time-line", category: "action" },
    { kind: "waitColor", label: "等待颜色", icon: "ri:eye-line", category: "action", hint: "可保存结果到变量" },
    { kind: "capFrame", label: "截图刷新", icon: "ri:screenshot-line", category: "action" },
    { kind: "playDsl", label: "DSL 宏", icon: "ri:magic-line", category: "action", hint: "c.play()" },
    { kind: "stopPlay", label: "停止宏", icon: "ri:stop-circle-line", category: "action" },
    { kind: "setStatus", label: "状态输出", icon: "ri:information-line", category: "action" },
    { kind: "setConfig", label: "写入配置", icon: "ri:settings-3-line", category: "action" },
    { kind: "code", label: "自定义代码", icon: "ri:code-s-slash-line", category: "action" },
]

export const NODE_LABELS: Record<FlowNode["kind"], string> = Object.fromEntries(PALETTE.map(entry => [entry.kind, entry.label])) as Record<
    FlowNode["kind"],
    string
>

export const CONTAINER_KINDS: FlowNode["kind"][] = ["loop", "if", "switch", "functionDef"]

/** 节点的子列表插槽定义。 */
export interface SlotDef {
    key: string
    label: string
}

export function getNodeSlots(node: FlowNode): (SlotDef & { list: FlowNode[] })[] {
    switch (node.kind) {
        case "loop":
            return [{ key: "body", label: "循环体", list: node.body }]
        case "if":
            return [
                { key: "then", label: "满足条件", list: node.thenBody },
                { key: "else", label: "否则", list: node.elseBody },
            ]
        case "switch": {
            const slots = node.cases.map((switchCase, index) => ({
                key: `case:${switchCase.id}`,
                label: `case ${index + 1}${switchCase.match ? ` "${switchCase.match}"` : ""}`,
                list: switchCase.body,
            }))
            slots.push({ key: "default", label: "default", list: node.defaultBody })
            return slots
        }
        case "functionDef":
            return [{ key: "body", label: "函数体", list: node.body }]
        default:
            return []
    }
}
