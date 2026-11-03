import type { Node } from "@vue-flow/core"
import { NodeType } from "@/store/nodeEditor"
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
    BASIC = "basic", // 基础组件（分组 / 标签 / 文本 / 数值 / 向量）
    BUILD_SOURCE = "build-source", // 构筑来源（JSON / 在线构筑）
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
        [NodeType.BUFF_INPUT]: "BUFF与队友",
        [NodeType.EFFECT_INPUT]: "特效设置",
        [NodeType.PET_INPUT]: "魔灵设置",
        [NodeType.ENEMY_INPUT]: "敌人设置",
        [NodeType.CUSTOM_VARS_INPUT]: "自定义变量组",
        [NodeType.CORE_CALC]: "核心计算",
        [NodeType.ATTR_CALC]: "计算属性",
        [NodeType.WEAPON_ATTR_CALC]: "计算武器属性",
        [NodeType.ADD_CALC]: "加法计算",
        [NodeType.MULTIPLY_CALC]: "乘法计算",
        [NodeType.EXPRESSION_CALC]: "表达式计算",
        [NodeType.HUB_CALC]: "集线节点",
        [NodeType.BUFF_MERGE]: "BUFF合并",
        [NodeType.ATTR_OUTPUT]: "属性输出",
        [NodeType.WEAPON_OUTPUT]: "武器输出",
        [NodeType.CHART]: "图表",
        [NodeType.AST_EXPRESSION_CALC]: "目标函数",
        [NodeType.CUSTOM_EXPRESSION]: "自定义变量求值",
        [NodeType.GROUP]: "分组",
        [NodeType.LABEL]: "标签",
        [NodeType.TEXT_INPUT]: "文本输入",
        [NodeType.NUMBER_INPUT]: "数值输入",
        [NodeType.VECTOR_INPUT]: "向量输入",
        [NodeType.VECTOR_DECOMPOSE]: "向量分解",
        [NodeType.VECTOR_CALC]: "向量计算",
        [NodeType.DOT_INPUT]: "DOT频率",
        [NodeType.MIND_MAP]: "思维导图",
        [NodeType.JSON_BUILD]: "JSON构筑",
        [NodeType.ONLINE_BUILD]: "在线构筑",
        [NodeType.JSON_EXPORT]: "JSON导出",
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
        label: "BUFF与队友",
        category: NodeCategory.INPUT,
        icon: "ri:flashlight-line",
        description: "添加 Buff 并设置协战队友（队友用于过滤 Buff）",
    },
    {
        type: NodeType.EFFECT_INPUT,
        label: "特效设置",
        category: NodeCategory.INPUT,
        icon: "ri:sparkling-line",
        description: "设置 MOD / 武器特效等级",
    },
    {
        type: NodeType.PET_INPUT,
        label: "魔灵设置",
        category: NodeCategory.INPUT,
        icon: "ri:ghost-2-line",
        description: "选择魔灵与潜质",
    },
    {
        type: NodeType.CUSTOM_VARS_INPUT,
        label: "自定义变量组",
        category: NodeCategory.INPUT,
        icon: "ri:code-s-slash-line",
        description: "定义表达式变量（不参与求值）",
    },
    {
        type: NodeType.ENEMY_INPUT,
        label: "敌人设置",
        category: NodeCategory.INPUT,
        icon: "ri:skull-line",
        description: "设置敌人等级和抗性",
    },
    {
        type: NodeType.DOT_INPUT,
        label: "DOT频率",
        category: NodeCategory.INPUT,
        icon: "ri:time-line",
        description: "配置技能 / 武器 DOT 每秒触发次数",
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
        type: NodeType.VECTOR_CALC,
        label: "向量计算",
        category: NodeCategory.CALCULATION,
        icon: "ri:bar-chart-line",
        description: "对一维向量（或接入的多个数值）求和、平均、方差等并输出数值",
    },
    {
        type: NodeType.HUB_CALC,
        label: "集线节点",
        category: NodeCategory.CALCULATION,
        icon: "ri:git-branch-line",
        description: "将构筑原样传递给输出",
    },
    {
        type: NodeType.BUFF_MERGE,
        label: "BUFF合并",
        category: NodeCategory.CALCULATION,
        icon: "ri:git-merge-line",
        description: "合并两个 BUFF 输入，可选并集或交集",
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
        type: NodeType.CHART,
        label: "图表",
        category: NodeCategory.OUTPUT,
        icon: "ri:line-chart-line",
        description: "把向量（或接入的多个数值）绘制为折线图或柱状图",
    },
    // 特殊节点
    {
        type: NodeType.AST_EXPRESSION_CALC,
        label: "目标函数",
        category: NodeCategory.SPECIAL,
        icon: "ri:function-line",
        description: "自定义表达式计算",
    },
    {
        type: NodeType.CUSTOM_EXPRESSION,
        label: "自定义变量求值",
        category: NodeCategory.SPECIAL,
        icon: "ri:function-line",
        description: "选择构筑中的自定义变量并输出数值",
    },
    // 基础组件
    {
        type: NodeType.GROUP,
        label: "分组",
        category: NodeCategory.BASIC,
        icon: "ri:group-line",
        description: "带标题的分组框，可拖动与缩放",
    },
    {
        type: NodeType.LABEL,
        label: "标签",
        category: NodeCategory.BASIC,
        icon: "ri:pushpin-2-line",
        description: "在画布上添加说明文字",
    },
    {
        type: NodeType.TEXT_INPUT,
        label: "文本输入",
        category: NodeCategory.BASIC,
        icon: "ri:edit-line",
        description: "输出一段文本",
    },
    {
        type: NodeType.NUMBER_INPUT,
        label: "数值输入",
        category: NodeCategory.BASIC,
        icon: "ri:hashtag",
        description: "输出一个数值，可接入计算节点",
    },
    {
        type: NodeType.VECTOR_INPUT,
        label: "向量输入",
        category: NodeCategory.BASIC,
        icon: "ri:sort-number-asc",
        description: "输入一组数值，接入自定义变量组做批量取值",
    },
    {
        type: NodeType.VECTOR_DECOMPOSE,
        label: "向量分解",
        category: NodeCategory.BASIC,
        icon: "ri:split-cells-horizontal",
        description: "把向量（或接入的多个数值）拆成独立的数值输出",
    },
    {
        type: NodeType.MIND_MAP,
        label: "思维导图",
        category: NodeCategory.BASIC,
        icon: "ri:node-tree",
        description: "内嵌思维导图：七种布局、拖整枝改父子、多选框选",
    },
    // 构筑来源
    {
        type: NodeType.JSON_BUILD,
        label: "JSON构筑",
        category: NodeCategory.BUILD_SOURCE,
        icon: "ri:file-code-line",
        description: "接收角色与标准 charSettings 文本并输出构筑",
    },
    {
        type: NodeType.ONLINE_BUILD,
        label: "在线构筑",
        category: NodeCategory.BUILD_SOURCE,
        icon: "ri:cloud-line",
        description: "从在线构筑列表选择并输出构筑",
    },
    {
        type: NodeType.JSON_EXPORT,
        label: "JSON导出",
        category: NodeCategory.OUTPUT,
        icon: "ri:file-copy-line",
        description: "将构筑导出为 JSON 文本，可复制或传给其他节点",
    },
]
