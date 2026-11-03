import { NodeType } from "@/store/nodeEditorTypes"

/**
 * 节点端口类型。不同类型使用不同颜色，且只允许同类型相连。
 */
export enum PortType {
    CHAR = "char",
    MELEE_WEAPON = "melee-weapon",
    RANGED_WEAPON = "ranged-weapon",
    MOD = "mod",
    BUFF = "buff",
    EFFECT = "effect",
    PET = "pet",
    ENEMY = "enemy",
    CUSTOM_VARS = "custom-vars",
    BUILD = "build",
    NUMBER = "number",
    STRING = "string",
    VECTOR = "vector",
    DOT = "dot",
    ATTRS = "attrs",
    WEAPON_ATTRS = "weapon-attrs",
}

/** 端口类型元信息 */
export interface PortMeta {
    label: string
    color: string
}

/** 端口类型 → 名称与颜色 */
export const PORT_META: Record<PortType, PortMeta> = {
    [PortType.CHAR]: { label: "角色", color: "#22c55e" },
    [PortType.MELEE_WEAPON]: { label: "近战武器", color: "#f87171" },
    [PortType.RANGED_WEAPON]: { label: "远程武器", color: "#fb923c" },
    [PortType.MOD]: { label: "MOD", color: "#a855f7" },
    [PortType.BUFF]: { label: "BUFF", color: "#eab308" },
    [PortType.EFFECT]: { label: "特效", color: "#ec4899" },
    [PortType.PET]: { label: "魔灵", color: "#8b5cf6" },
    [PortType.ENEMY]: { label: "敌人", color: "#b91c1c" },
    [PortType.CUSTOM_VARS]: { label: "自定义变量", color: "#14b8a6" },
    [PortType.BUILD]: { label: "构筑", color: "#3b82f6" },
    [PortType.NUMBER]: { label: "数值", color: "#94a3b8" },
    [PortType.STRING]: { label: "文本", color: "#22d3ee" },
    [PortType.VECTOR]: { label: "向量", color: "#a3e635" },
    [PortType.DOT]: { label: "DOT 频率", color: "#f97316" },
    [PortType.ATTRS]: { label: "角色属性", color: "#10b981" },
    [PortType.WEAPON_ATTRS]: { label: "武器属性", color: "#d97706" },
}

/** 单个端口定义 */
export interface PortDef {
    id: string
    type: PortType
    label: string
    /** 允许接入多条边（如 MOD / BUFF 输入） */
    multiple?: boolean
}

/** 节点输入输出端口集合 */
export interface NodePortSchema {
    inputs: PortDef[]
    outputs: PortDef[]
}

const input = (id: string, type: PortType, label: string, multiple = false): PortDef => ({ id, type, label, multiple })
const output = (id: string, type: PortType, label: string): PortDef => ({ id, type, label })

const BUILD_INPUT = input("build", PortType.BUILD, "构筑")
const NUMBER_OUTPUT = output("value", PortType.NUMBER, "数值")
/** 向量消费端口的输入：允许多路数值 / 向量接入，按连线顺序合成一个向量 */
const VECTOR_INPUT = input("vector", PortType.VECTOR, "向量", true)

/** 输入节点上可被连线驱动的数值参数 */
export interface NumericParamPort {
    id: string
    label: string
}

/**
 * 角色 / 武器输入节点的可选数值参数输入端口。
 * 端口为向量类型：接入单个数值时按单元素向量处理，接入向量时按取值展开构筑。
 */
export const NUMERIC_PARAM_PORTS: Partial<Record<NodeType, readonly NumericParamPort[]>> = {
    [NodeType.CHAR_INPUT]: [
        { id: "charLevel", label: "等级" },
        { id: "skillE", label: "E 技能等级" },
        { id: "skillQ", label: "Q 技能等级" },
        { id: "skillPassive", label: "被动技能等级" },
    ],
    [NodeType.MELEE_WEAPON_INPUT]: [
        { id: "level", label: "武器等级" },
        { id: "refine", label: "精炼等级" },
    ],
    [NodeType.RANGED_WEAPON_INPUT]: [
        { id: "level", label: "武器等级" },
        { id: "refine", label: "精炼等级" },
    ],
}

/**
 * 读取节点类型的数值参数输入端口。
 * @param type 节点类型
 * @returns 数值参数端口
 */
export function numericParamPorts(type: string): PortDef[] {
    return (NUMERIC_PARAM_PORTS[type as NodeType] ?? []).map(param => input(param.id, PortType.VECTOR, param.label))
}

/**
 * 自定义变量组的向量输入端口 id：每个变量一行独立端口。
 * @param index 变量行下标
 * @returns 端口 id
 */
export function customVariableVectorPortId(index: number) {
    return `vector-${index}`
}

/**
 * 解析自定义变量组的向量输入端口 id。
 * @param handleId 端口 id
 * @returns 变量行下标；不是变量向量端口时返回 undefined
 */
export function parseCustomVariableVectorPortId(handleId: string | null | undefined) {
    const match = /^vector-(\d+)$/.exec(handleId ?? "")
    return match ? Number(match[1]) : undefined
}

/**
 * 向量分解节点的输出端口 id：每个下标对应向量中的一个分量。
 * @param index 分量下标
 * @returns 端口 id
 */
export function vectorDecomposePortId(index: number) {
    return `value-${index}`
}

/** BUFF 合并节点的输入 handle id：构筑组装按这两个端口解析上游 */
export const BUFF_MERGE_INPUT = {
    left: "left",
    right: "right",
} as const

/** 核心节点的输入 handle id：组装构筑时按这些 id 精确取值 */
export const CORE_INPUT = {
    build: "build",
    char: "char",
    meleeWeapon: "meleeWeapon",
    rangedWeapon: "rangedWeapon",
    mod: "mod",
    buff: "buff",
    effect: "effect",
    pet: "pet",
    enemy: "enemy",
    customVariables: "customVariables",
    dot: "dot",
} as const

/** 各节点类型的固定端口；加法 / 乘法 / 表达式计算的动态端口由 getNodePorts 生成 */
export const NODE_PORTS: Partial<Record<NodeType, NodePortSchema>> = {
    [NodeType.CHAR_INPUT]: {
        inputs: numericParamPorts(NodeType.CHAR_INPUT),
        outputs: [output("char", PortType.CHAR, "角色")],
    },
    [NodeType.MELEE_WEAPON_INPUT]: {
        inputs: numericParamPorts(NodeType.MELEE_WEAPON_INPUT),
        outputs: [output("weapon", PortType.MELEE_WEAPON, "近战武器")],
    },
    [NodeType.RANGED_WEAPON_INPUT]: {
        inputs: numericParamPorts(NodeType.RANGED_WEAPON_INPUT),
        outputs: [output("weapon", PortType.RANGED_WEAPON, "远程武器")],
    },
    [NodeType.MOD_INPUT]: { inputs: [], outputs: [output("mod", PortType.MOD, "MOD")] },
    [NodeType.BUFF_INPUT]: { inputs: [], outputs: [output("buff", PortType.BUFF, "BUFF / 队友")] },
    [NodeType.EFFECT_INPUT]: { inputs: [], outputs: [output("effect", PortType.EFFECT, "特效设置")] },
    [NodeType.PET_INPUT]: { inputs: [], outputs: [output("pet", PortType.PET, "魔灵设置")] },
    [NodeType.ENEMY_INPUT]: { inputs: [], outputs: [output("enemy", PortType.ENEMY, "敌人设置")] },
    [NodeType.CUSTOM_VARS_INPUT]: {
        inputs: [],
        outputs: [output("customVariables", PortType.CUSTOM_VARS, "自定义变量组")],
    },
    [NodeType.DOT_INPUT]: { inputs: [], outputs: [output("dot", PortType.DOT, "DOT 频率")] },
    [NodeType.CORE_CALC]: {
        inputs: [
            input(CORE_INPUT.build, PortType.BUILD, "构筑"),
            input(CORE_INPUT.char, PortType.CHAR, "角色"),
            input(CORE_INPUT.meleeWeapon, PortType.MELEE_WEAPON, "近战武器"),
            input(CORE_INPUT.rangedWeapon, PortType.RANGED_WEAPON, "远程武器"),
            input(CORE_INPUT.mod, PortType.MOD, "MOD", true),
            input(CORE_INPUT.buff, PortType.BUFF, "BUFF / 队友", true),
            input(CORE_INPUT.effect, PortType.EFFECT, "特效设置"),
            input(CORE_INPUT.pet, PortType.PET, "魔灵设置"),
            input(CORE_INPUT.enemy, PortType.ENEMY, "敌人设置"),
            input(CORE_INPUT.customVariables, PortType.CUSTOM_VARS, "自定义变量组"),
            input(CORE_INPUT.dot, PortType.DOT, "DOT 频率"),
        ],
        outputs: [output("build", PortType.BUILD, "构筑")],
    },
    [NodeType.ATTR_CALC]: { inputs: [BUILD_INPUT], outputs: [output("attrs", PortType.ATTRS, "角色属性")] },
    [NodeType.WEAPON_ATTR_CALC]: { inputs: [BUILD_INPUT], outputs: [output("attrs", PortType.WEAPON_ATTRS, "武器属性")] },
    [NodeType.ATTR_OUTPUT]: { inputs: [input("attrs", PortType.ATTRS, "角色属性")], outputs: [] },
    [NodeType.WEAPON_OUTPUT]: { inputs: [input("attrs", PortType.WEAPON_ATTRS, "武器属性")], outputs: [] },
    // 目标函数的输出端口随构筑类型切换：标量构筑输出数值，向量构筑输出向量
    [NodeType.AST_EXPRESSION_CALC]: {
        inputs: [BUILD_INPUT],
        outputs: [NUMBER_OUTPUT],
    },
    [NodeType.CUSTOM_EXPRESSION]: { inputs: [BUILD_INPUT], outputs: [NUMBER_OUTPUT] },
    [NodeType.CHART]: { inputs: [VECTOR_INPUT], outputs: [] },
    [NodeType.HUB_CALC]: { inputs: [BUILD_INPUT], outputs: [output("build", PortType.BUILD, "构筑")] },
    [NodeType.BUFF_MERGE]: {
        inputs: [input(BUFF_MERGE_INPUT.left, PortType.BUFF, "BUFF A"), input(BUFF_MERGE_INPUT.right, PortType.BUFF, "BUFF B")],
        outputs: [output("buff", PortType.BUFF, "BUFF")],
    },
    // 基础组件：分组 / 标签没有端口，文本与数值输入作为图源
    [NodeType.GROUP]: { inputs: [], outputs: [] },
    [NodeType.LABEL]: { inputs: [], outputs: [] },
    [NodeType.TEXT_INPUT]: { inputs: [], outputs: [output("text", PortType.STRING, "文本")] },
    [NodeType.NUMBER_INPUT]: { inputs: [], outputs: [NUMBER_OUTPUT] },
    [NodeType.VECTOR_INPUT]: { inputs: [], outputs: [output("vector", PortType.VECTOR, "向量")] },
    // 输出端口数量由上游向量长度决定，在 getNodePorts 中按 vectorLabels 生成
    [NodeType.VECTOR_DECOMPOSE]: { inputs: [VECTOR_INPUT], outputs: [] },
    [NodeType.VECTOR_CALC]: { inputs: [VECTOR_INPUT], outputs: [NUMBER_OUTPUT] },
    // 思维导图是内嵌独立子画布，不参与构筑连线
    [NodeType.MIND_MAP]: { inputs: [], outputs: [] },
    // 构筑来源：JSON 文本 / 在线构筑
    [NodeType.JSON_BUILD]: {
        inputs: [input("char", PortType.CHAR, "角色"), input("text", PortType.STRING, "构筑 JSON")],
        outputs: [output("build", PortType.BUILD, "构筑")],
    },
    [NodeType.ONLINE_BUILD]: {
        inputs: [input("char", PortType.CHAR, "角色过滤")],
        outputs: [output("build", PortType.BUILD, "构筑")],
    },
    [NodeType.JSON_EXPORT]: {
        inputs: [BUILD_INPUT],
        outputs: [output("text", PortType.STRING, "JSON 文本")],
    },
}

/** 计算属性节点可逐项输出的角色属性（对齐 CharAttrShow：不列召唤物 / 异常数量等内部量） */
export const CHAR_ATTR_OUTPUT_KEYS = [
    "攻击",
    "生命",
    "护盾",
    "防御",
    "神智",
    "技能威力",
    "技能耐久",
    "技能效益",
    "技能范围",
    "昂扬",
    "背水",
    "增伤",
    "元素增伤",
    "物理增伤",
    "属性攻击",
    "武器伤害",
    "技能伤害",
    "技能追伤",
    "独立增伤",
    "技能独立增伤",
    "属性穿透",
    "无视防御",
    "技能无视防御",
    "技能速度",
    "失衡易伤",
    "歧视",
    "秽兽增伤",
    "军团增伤",
    "神弃者增伤",
    "神使增伤",
    "华胥增伤",
    "技能倍率加数",
    "技能倍率乘数",
    "技能倍率赋值",
    "召唤物伤害",
    "召唤物独立增伤",
    "减伤",
    "有效生命",
    "转切割",
    "转贯穿",
    "转震荡",
    "转灾厄",
    "转充盈",
    "转属克",
    "转属逆",
    "充盈威力",
    "技能触发",
    "魔灵CD",
    "魔灵CD缩减",
    "神智回复",
] as const

/** 计算武器属性节点可逐项输出的武器属性（对齐 WeaponTab） */
export const WEAPON_ATTR_OUTPUT_KEYS = [
    "攻击",
    "暴击",
    "暴伤",
    "触发",
    "攻速",
    "多重",
    "增伤",
    "装填",
    "弹匣",
    "弹药",
    "独立增伤",
    "追加伤害",
    "武器倍率",
    "充盈转化",
    "秽兽增伤",
    "军团增伤",
    "神弃者增伤",
    "神使增伤",
    "华胥增伤",
] as const

/**
 * 属性节点的逐项输出端口：向量构筑输出向量，单个构筑输出数值。
 * @param keys 属性键名
 * @param vector 是否向量构筑
 * @returns 端口定义
 */
function attributeOutputPorts(keys: readonly string[], vector: boolean): PortDef[] {
    const type = vector ? PortType.VECTOR : PortType.NUMBER
    return keys.map(key => output(key, type, key))
}

/**
 * 读取节点的端口定义；表达式计算按 inputCount 生成动态输入端口。
 * @param type 节点类型
 * @param data 节点数据
 * @returns 端口集合
 */
export function getNodePorts(type: string, data: Record<string, any> = {}): NodePortSchema {
    if (type === NodeType.AST_EXPRESSION_CALC) {
        // 向量构筑的目标函数只暴露向量输出，标量构筑只暴露数值输出
        return {
            inputs: [BUILD_INPUT],
            outputs: [data.astOutputVector === true ? output("vector", PortType.VECTOR, "向量") : NUMBER_OUTPUT],
        }
    }
    if (type === NodeType.ATTR_CALC || type === NodeType.WEAPON_ATTR_CALC) {
        const base = NODE_PORTS[type]!
        const keys = type === NodeType.ATTR_CALC ? CHAR_ATTR_OUTPUT_KEYS : WEAPON_ATTR_OUTPUT_KEYS
        return { ...base, outputs: [...base.outputs, ...attributeOutputPorts(keys, Boolean(data.attrOutputVector))] }
    }
    if (type === NodeType.CUSTOM_VARS_INPUT) {
        const variables = Array.isArray(data.customVariables) ? data.customVariables : []
        return {
            inputs: variables.map((item: unknown, index: number) => {
                const name = Array.isArray(item) && typeof item[0] === "string" ? item[0].trim() : ""
                return input(customVariableVectorPortId(index), PortType.VECTOR, name || `变量${index + 1}`)
            }),
            outputs: [output("customVariables", PortType.CUSTOM_VARS, "自定义变量组")],
        }
    }
    if (type === NodeType.VECTOR_DECOMPOSE) {
        const labels = Array.isArray(data.vectorLabels)
            ? data.vectorLabels.filter((label: unknown): label is string => typeof label === "string")
            : []
        return {
            inputs: [VECTOR_INPUT],
            outputs: labels.map((label, index) => output(vectorDecomposePortId(index), PortType.NUMBER, label || `数值${index + 1}`)),
        }
    }
    if (type === NodeType.CORE_CALC) {
        const dimensions = Array.isArray(data.vectorDimensions)
            ? data.vectorDimensions.filter((value: unknown) => typeof value === "number" && value > 0)
            : []
        const base = NODE_PORTS[NodeType.CORE_CALC]!
        if (dimensions.length === 0) return base
        return {
            ...base,
            outputs: [output("build", PortType.BUILD, `构筑${dimensions.map((size: number) => `[${size}]`).join("")}`)],
        }
    }
    if (type === NodeType.ADD_CALC || type === NodeType.MULTIPLY_CALC || type === NodeType.EXPRESSION_CALC) {
        // 加乘沿用 a-e 端口 id，旧图连线不断；表达式沿用 inputN 端口 id
        const fallback = type === NodeType.EXPRESSION_CALC ? 2 : 4
        const rawCount = Number(data.inputCount)
        const count = Number.isFinite(rawCount) ? Math.min(5, Math.max(1, Math.round(rawCount))) : fallback
        return {
            inputs: Array.from({ length: count }, (_, index) => {
                const label = String.fromCharCode(97 + index)
                return input(type === NodeType.EXPRESSION_CALC ? `input${index + 1}` : label, PortType.NUMBER, label)
            }),
            outputs: [output("value", PortType.NUMBER, "数值")],
        }
    }
    return NODE_PORTS[type as NodeType] ?? { inputs: [], outputs: [] }
}

/**
 * 查找指定端口的定义；兼容旧图中没有 handle id、但节点只有一个端口的情况。
 * @param type 节点类型
 * @param handleId 边上的 handle id
 * @param direction 输入或输出
 * @param data 节点数据
 * @returns 端口定义
 */
export function resolvePort(
    type: string,
    handleId: string | null | undefined,
    direction: "input" | "output",
    data: Record<string, any> = {}
): PortDef | undefined {
    const ports = direction === "input" ? getNodePorts(type, data).inputs : getNodePorts(type, data).outputs
    if (handleId) return ports.find(port => port.id === handleId)
    return ports.length === 1 ? ports[0] : undefined
}

/**
 * 判断输出类型能否接入输入类型：类型一致，或数值接入向量输入（单个值视为单元素向量）。
 * @param sourceType 输出端口类型
 * @param targetType 输入端口类型
 * @returns 是否兼容
 */
export function isPortTypeCompatible(sourceType: PortType, targetType: PortType) {
    return sourceType === targetType || (sourceType === PortType.NUMBER && targetType === PortType.VECTOR)
}

/**
 * 判断两个端口是否允许连接。
 * @param source 输出端口
 * @param target 输入端口
 * @returns 是否允许
 */
export function canConnectPorts(source?: PortDef, target?: PortDef) {
    return Boolean(source && target && isPortTypeCompatible(source.type, target.type))
}

/**
 * 读取端口颜色。
 * @param type 端口类型
 * @returns 颜色值
 */
export function portColor(type: PortType | undefined) {
    return type ? PORT_META[type].color : PORT_META[PortType.NUMBER].color
}
