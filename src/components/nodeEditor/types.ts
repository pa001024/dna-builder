import type { Node } from "@vue-flow/core"
import { NodeType } from "../../store/nodeEditor"
import type { IconTypes } from "../Icon.vue"

/**
 * 节点数据接口
 */
export interface NodeData {
    label: string
    type: NodeType
    // 节点特定数据
    [key: string]: any
}

/**
 * 边数据接口
 */
export interface EdgeData {
    // 边特定数据（如数据类型、标签等）
    [key: string]: any
}

/**
 * 调色板节点项
 */
export interface PaletteItem {
    type: NodeType
    label: string
    category: NodeCategory
    icon?: IconTypes
    description?: string
}

/**
 * 节点分类
 */
export enum NodeCategory {
    INPUT = "input", // 输入节点
    CALCULATION = "calculation", // 计算节点
    OUTPUT = "output", // 输出节点
    SPECIAL = "special", // 特殊节点（AST等）
}

/**
 * 创建节点
 */
export function createNode(id: string, type: NodeType, position: { x: number; y: number }, data: Partial<NodeData> = {}): Node<NodeData> {
    return {
        id,
        type: type as string, // @vue-flow expects string for type
        position,
        data: {
            type,
            label: getDefaultLabel(type),
            ...data,
        },
    }
}

/**
 * 获取节点默认标签
 */
export function getDefaultLabel(type: NodeType): string {
    const labels: Record<NodeType, string> = {
        [NodeType.CHAR_INPUT]: "角色输入",
        [NodeType.WEAPON_INPUT]: "武器输入",
        [NodeType.MELEE_WEAPON_INPUT]: "近战武器输入",
        [NodeType.RANGED_WEAPON_INPUT]: "远程武器输入",
        [NodeType.MOD_INPUT]: "MOD输入",
        [NodeType.BUFF_INPUT]: "Buff输入",
        [NodeType.ENEMY_INPUT]: "敌人设置",
        [NodeType.CORE_CALC]: "核心计算",
        [NodeType.ATTR_CALC]: "计算属性",
        [NodeType.WEAPON_ATTR_CALC]: "计算武器属性",
        [NodeType.SKILL_DMG_CALC]: "计算技能伤害",
        [NodeType.WEAPON_DMG_CALC]: "计算武器伤害",
        [NodeType.FULL_CALC]: "完整计算",
        [NodeType.ADD_CALC]: "加法计算",
        [NodeType.MULTIPLY_CALC]: "乘法计算",
        [NodeType.EXPRESSION_CALC]: "表达式计算",
        [NodeType.HUB_CALC]: "集线节点",
        [NodeType.ATTR_OUTPUT]: "属性输出",
        [NodeType.WEAPON_OUTPUT]: "武器输出",
        [NodeType.DAMAGE_OUTPUT]: "伤害输出",
        [NodeType.AST_EXPRESSION_CALC]: "目标函数",
    }
    return labels[type] || type
}

/**
 * 调色板配置
 */
export const PALETTE_ITEMS: PaletteItem[] = [
    // 输入节点
    {
        type: NodeType.CHAR_INPUT,
        label: "角色输入",
        category: NodeCategory.INPUT,
        icon: "ri:user-line",
        description: "选择角色并设置等级",
    },
    {
        type: NodeType.MELEE_WEAPON_INPUT,
        label: "近战武器输入",
        category: NodeCategory.INPUT,
        icon: "ri:sword-line",
        description: "选择近战武器",
    },
    {
        type: NodeType.RANGED_WEAPON_INPUT,
        label: "远程武器输入",
        category: NodeCategory.INPUT,
        icon: "ri:crosshair-line",
        description: "选择远程武器",
    },
    {
        type: NodeType.MOD_INPUT,
        label: "MOD输入",
        category: NodeCategory.INPUT,
        icon: "ri:grid-line",
        description: "添加角色/武器MOD",
    },
    {
        type: NodeType.BUFF_INPUT,
        label: "Buff输入",
        category: NodeCategory.INPUT,
        icon: "ri:flashlight-line",
        description: "添加Buff加成",
    },
    {
        type: NodeType.ENEMY_INPUT,
        label: "敌人设置",
        category: NodeCategory.INPUT,
        icon: "ri:skull-line",
        description: "设置敌人等级和抗性",
    },
    // 计算节点
    {
        type: NodeType.CORE_CALC,
        label: "核心节点",
        category: NodeCategory.CALCULATION,
        icon: "ri:cpu-line",
        description: "所有输入都需要连接到核心节点",
    },
    {
        type: NodeType.ATTR_CALC,
        label: "计算属性",
        category: NodeCategory.CALCULATION,
        icon: "ri:calculator-line",
        description: "计算角色基础属性",
    },
    {
        type: NodeType.WEAPON_ATTR_CALC,
        label: "计算武器属性",
        category: NodeCategory.CALCULATION,
        icon: "ri:sword-line",
        description: "计算武器属性",
    },
    {
        type: NodeType.SKILL_DMG_CALC,
        label: "计算技能伤害",
        category: NodeCategory.CALCULATION,
        icon: "ri:magic-line",
        description: "计算技能伤害",
    },
    {
        type: NodeType.WEAPON_DMG_CALC,
        label: "计算武器伤害",
        category: NodeCategory.CALCULATION,
        icon: "ri:crosshair-line",
        description: "计算武器伤害",
    },
    {
        type: NodeType.FULL_CALC,
        label: "完整计算",
        category: NodeCategory.CALCULATION,
        icon: "ri:refresh-line",
        description: "执行所有计算",
    },
    {
        type: NodeType.ADD_CALC,
        label: "加法计算",
        category: NodeCategory.CALCULATION,
        icon: "ri:add-line",
        description: "计算输入值的总和",
    },
    {
        type: NodeType.MULTIPLY_CALC,
        label: "乘法计算",
        category: NodeCategory.CALCULATION,
        icon: "ri:calculator-line",
        description: "计算输入值的乘积",
    },
    {
        type: NodeType.EXPRESSION_CALC,
        label: "表达式计算",
        category: NodeCategory.CALCULATION,
        icon: "ri:equalizer-line",
        description: "根据输入值计算表达式结果",
    },
    {
        type: NodeType.HUB_CALC,
        label: "集线节点",
        category: NodeCategory.CALCULATION,
        icon: "ri:git-branch-line",
        description: "将所有输入集线到一起原样传递给输出",
    }, // 输出节点
    {
        type: NodeType.ATTR_OUTPUT,
        label: "属性输出",
        category: NodeCategory.OUTPUT,
        icon: "ri:bar-chart-line",
        description: "显示角色属性",
    },
    {
        type: NodeType.WEAPON_OUTPUT,
        label: "武器输出",
        category: NodeCategory.OUTPUT,
        icon: "ri:bar-chart-line",
        description: "显示武器属性",
    },
    {
        type: NodeType.DAMAGE_OUTPUT,
        label: "伤害输出",
        category: NodeCategory.OUTPUT,
        icon: "ri:fire-line",
        description: "显示伤害计算结果",
    },
    // 特殊节点
    {
        type: NodeType.AST_EXPRESSION_CALC,
        label: "目标函数",
        category: NodeCategory.SPECIAL,
        icon: "ri:function-line",
        description: "自定义表达式计算",
    },
]
