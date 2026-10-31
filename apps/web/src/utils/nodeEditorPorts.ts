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
    DAMAGE = "damage",
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
    [PortType.DAMAGE]: { label: "伤害", color: "#e11d48" },
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

/** 核心节点的输入 handle id：组装构筑时按这些 id 精确取值 */
export const CORE_INPUT = {
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

/** 各节点类型的固定端口；表达式计算的动态端口由 getNodePorts 生成 */
export const NODE_PORTS: Partial<Record<NodeType, NodePortSchema>> = {
    [NodeType.CHAR_INPUT]: { inputs: [], outputs: [output("char", PortType.CHAR, "角色")] },
    [NodeType.MELEE_WEAPON_INPUT]: { inputs: [], outputs: [output("weapon", PortType.MELEE_WEAPON, "近战武器")] },
    [NodeType.RANGED_WEAPON_INPUT]: { inputs: [], outputs: [output("weapon", PortType.RANGED_WEAPON, "远程武器")] },
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
    [NodeType.SKILL_DMG_CALC]: {
        inputs: [BUILD_INPUT],
        outputs: [
            output("damage", PortType.DAMAGE, "伤害结果"),
            output("expectedDamage", PortType.NUMBER, "期望伤害"),
            output("noHpDamage", PortType.NUMBER, "无生命伤害"),
        ],
    },
    [NodeType.WEAPON_DMG_CALC]: {
        inputs: [BUILD_INPUT],
        outputs: [
            output("damage", PortType.DAMAGE, "伤害结果"),
            output("expectedDamage", PortType.NUMBER, "期望伤害"),
            output("physicalDamage", PortType.NUMBER, "物理"),
            output("elementDamage", PortType.NUMBER, "元素"),
        ],
    },
    [NodeType.ATTR_OUTPUT]: { inputs: [input("attrs", PortType.ATTRS, "角色属性")], outputs: [] },
    [NodeType.WEAPON_OUTPUT]: { inputs: [input("attrs", PortType.WEAPON_ATTRS, "武器属性")], outputs: [] },
    [NodeType.DAMAGE_OUTPUT]: { inputs: [input("damage", PortType.DAMAGE, "伤害结果")], outputs: [] },
    [NodeType.FULL_CALC]: { inputs: [BUILD_INPUT], outputs: [NUMBER_OUTPUT] },
    // 目标函数除标量结果外还输出带标题的向量，供图表节点绘制
    [NodeType.AST_EXPRESSION_CALC]: {
        inputs: [BUILD_INPUT],
        outputs: [NUMBER_OUTPUT, output("vector", PortType.VECTOR, "向量")],
    },
    [NodeType.CUSTOM_EXPRESSION]: { inputs: [BUILD_INPUT], outputs: [NUMBER_OUTPUT] },
    [NodeType.CHART]: { inputs: [input("vector", PortType.VECTOR, "向量")], outputs: [] },
    [NodeType.ADD_CALC]: {
        inputs: [
            input("a", PortType.NUMBER, "a"),
            input("b", PortType.NUMBER, "b"),
            input("c", PortType.NUMBER, "c"),
            input("d", PortType.NUMBER, "d"),
        ],
        outputs: [output("value", PortType.NUMBER, "数值")],
    },
    [NodeType.MULTIPLY_CALC]: {
        inputs: [
            input("a", PortType.NUMBER, "a"),
            input("b", PortType.NUMBER, "b"),
            input("c", PortType.NUMBER, "c"),
            input("d", PortType.NUMBER, "d"),
        ],
        outputs: [output("value", PortType.NUMBER, "数值")],
    },
    [NodeType.HUB_CALC]: { inputs: [BUILD_INPUT], outputs: [output("build", PortType.BUILD, "构筑")] },
    // 基础组件：分组 / 标签没有端口，文本与数值输入作为图源
    [NodeType.GROUP]: { inputs: [], outputs: [] },
    [NodeType.LABEL]: { inputs: [], outputs: [] },
    [NodeType.TEXT_INPUT]: { inputs: [], outputs: [output("text", PortType.STRING, "文本")] },
    [NodeType.NUMBER_INPUT]: { inputs: [], outputs: [NUMBER_OUTPUT] },
    [NodeType.VECTOR_INPUT]: { inputs: [], outputs: [output("vector", PortType.VECTOR, "向量")] },
    // 构筑来源：JSON 文本 / 在线构筑
    [NodeType.JSON_BUILD]: {
        inputs: [input("text", PortType.STRING, "构筑 JSON")],
        outputs: [output("build", PortType.BUILD, "构筑")],
    },
    [NodeType.ONLINE_BUILD]: {
        inputs: [input("char", PortType.CHAR, "角色过滤")],
        outputs: [output("build", PortType.BUILD, "构筑")],
    },
}

/**
 * 读取节点的端口定义；表达式计算按 inputCount 生成动态输入端口。
 * @param type 节点类型
 * @param data 节点数据
 * @returns 端口集合
 */
export function getNodePorts(type: string, data: Record<string, any> = {}): NodePortSchema {
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
    if (type === NodeType.EXPRESSION_CALC) {
        const rawCount = Number(data.inputCount)
        const count = Number.isFinite(rawCount) ? Math.min(5, Math.max(1, Math.round(rawCount))) : 2
        return {
            inputs: Array.from({ length: count }, (_, index) =>
                input(`input${index + 1}`, PortType.NUMBER, String.fromCharCode(97 + index))
            ),
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
 * 判断两个端口是否允许连接：类型必须完全一致。
 * @param source 输出端口
 * @param target 输入端口
 * @returns 是否允许
 */
export function canConnectPorts(source?: PortDef, target?: PortDef) {
    return Boolean(source && target && source.type === target.type)
}

/**
 * 读取端口颜色。
 * @param type 端口类型
 * @returns 颜色值
 */
export function portColor(type: PortType | undefined) {
    return type ? PORT_META[type].color : PORT_META[PortType.NUMBER].color
}
