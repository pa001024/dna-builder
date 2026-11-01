import { describe, expect, it } from "vitest"
import { NodeType } from "@/store/nodeEditorTypes"
import {
    CHAR_ATTR_OUTPUT_KEYS,
    CORE_INPUT,
    canConnectPorts,
    getNodePorts,
    PortType,
    resolvePort,
    WEAPON_ATTR_OUTPUT_KEYS,
} from "@/utils/nodeEditorPorts"

describe("nodeEditorPorts", () => {
    it("核心节点带构筑输入，且输入端口覆盖全部构筑输入", () => {
        const ports = getNodePorts(NodeType.CORE_CALC)
        expect(ports.outputs).toEqual([{ id: "build", type: PortType.BUILD, label: "构筑" }])
        expect(ports.inputs.map(port => port.type)).toEqual([
            PortType.BUILD,
            PortType.CHAR,
            PortType.MELEE_WEAPON,
            PortType.RANGED_WEAPON,
            PortType.MOD,
            PortType.BUFF,
            PortType.EFFECT,
            PortType.PET,
            PortType.ENEMY,
            PortType.CUSTOM_VARS,
            PortType.DOT,
        ])
        expect(ports.inputs[0]).toEqual({ id: CORE_INPUT.build, type: PortType.BUILD, label: "构筑", multiple: false })
        expect(ports.inputs.find(port => port.id === CORE_INPUT.mod)?.multiple).toBe(true)
        expect(ports.inputs.find(port => port.id === CORE_INPUT.buff)?.multiple).toBe(true)
    })

    it("自定义变量组每个变量一个向量输入端口", () => {
        const ports = getNodePorts(NodeType.CUSTOM_VARS_INPUT, {
            customVariables: [
                ["倍率", "1"],
                ["额外", "2"],
            ],
        })
        expect(ports.inputs).toEqual([
            { id: "vector-0", type: PortType.VECTOR, label: "倍率", multiple: false },
            { id: "vector-1", type: PortType.VECTOR, label: "额外", multiple: false },
        ])
        expect(ports.outputs).toEqual([{ id: "customVariables", type: PortType.CUSTOM_VARS, label: "自定义变量组" }])
        expect(getNodePorts(NodeType.CUSTOM_VARS_INPUT, {}).inputs).toEqual([])
        expect(getNodePorts(NodeType.CUSTOM_VARS_INPUT, { customVariables: [["", "1"]] }).inputs[0].label).toBe("变量1")
    })

    it("核心输出在有向量维度时显示构筑[维度]", () => {
        const ports = getNodePorts(NodeType.CORE_CALC, { vectorDimensions: [3, 3] })
        expect(ports.outputs[0]).toEqual({ id: "build", type: PortType.BUILD, label: "构筑[3][3]" })
        expect(getNodePorts(NodeType.CORE_CALC, { vectorDimensions: [] }).outputs[0].label).toBe("构筑")
    })

    it("属性节点逐项输出端口：单个构筑为数值、向量构筑为向量", () => {
        const charPorts = getNodePorts(NodeType.ATTR_CALC)
        expect(charPorts.inputs[0].type).toBe(PortType.BUILD)
        expect(charPorts.outputs[0]).toEqual({ id: "attrs", type: PortType.ATTRS, label: "角色属性" })
        expect(charPorts.outputs).toHaveLength(CHAR_ATTR_OUTPUT_KEYS.length + 1)
        expect(charPorts.outputs.slice(1).every(port => port.type === PortType.NUMBER)).toBe(true)
        expect(charPorts.outputs[1]).toEqual({ id: "攻击", type: PortType.NUMBER, label: "攻击" })

        const vectorPorts = getNodePorts(NodeType.ATTR_CALC, { attrOutputVector: true })
        expect(vectorPorts.outputs.slice(1).every(port => port.type === PortType.VECTOR)).toBe(true)

        const weaponPorts = getNodePorts(NodeType.WEAPON_ATTR_CALC)
        expect(weaponPorts.outputs[0]).toEqual({ id: "attrs", type: PortType.WEAPON_ATTRS, label: "武器属性" })
        expect(weaponPorts.outputs).toHaveLength(WEAPON_ATTR_OUTPUT_KEYS.length + 1)
    })

    it("表达式计算按 inputCount 生成精确端口", () => {
        const ports = getNodePorts(NodeType.EXPRESSION_CALC, { inputCount: 3 })
        expect(ports.inputs.map(port => port.id)).toEqual(["input1", "input2", "input3"])
        expect(ports.outputs.map(port => port.type)).toEqual([PortType.NUMBER])
    })

    it("不同类型端口不能连接", () => {
        const core = getNodePorts(NodeType.CORE_CALC)
        const build = core.outputs[0]
        const customVars = core.inputs.find(port => port.id === CORE_INPUT.customVariables)!
        const buildInput = getNodePorts(NodeType.ATTR_CALC).inputs[0]
        expect(canConnectPorts(build, buildInput)).toBe(true)
        expect(canConnectPorts(customVars, buildInput)).toBe(false)
    })

    it("在线构筑可选连接角色输入用于筛选", () => {
        const ports = getNodePorts(NodeType.ONLINE_BUILD)
        expect(ports.inputs).toEqual([{ id: "char", type: PortType.CHAR, label: "角色过滤", multiple: false }])
        expect(ports.outputs).toEqual([{ id: "build", type: PortType.BUILD, label: "构筑" }])

        const charOutput = getNodePorts(NodeType.CHAR_INPUT).outputs[0]
        expect(canConnectPorts(charOutput, ports.inputs[0])).toBe(true)
    })

    it("基础组件端口：文本 / 数值输入作为图源，分组与标签没有端口", () => {
        expect(getNodePorts(NodeType.TEXT_INPUT).outputs).toEqual([{ id: "text", type: PortType.STRING, label: "文本" }])
        expect(getNodePorts(NodeType.NUMBER_INPUT).outputs).toEqual([{ id: "value", type: PortType.NUMBER, label: "数值" }])
        expect(getNodePorts(NodeType.GROUP)).toEqual({ inputs: [], outputs: [] })
        expect(getNodePorts(NodeType.LABEL)).toEqual({ inputs: [], outputs: [] })

        const textOutput = getNodePorts(NodeType.TEXT_INPUT).outputs[0]
        const numberInput = getNodePorts(NodeType.ADD_CALC).inputs[0]
        expect(canConnectPorts(textOutput, numberInput)).toBe(false)
    })

    it("目标函数输出数值与带标题向量，图表节点接收向量", () => {
        const ast = getNodePorts(NodeType.AST_EXPRESSION_CALC)
        expect(ast.outputs).toEqual([
            { id: "value", type: PortType.NUMBER, label: "数值" },
            { id: "vector", type: PortType.VECTOR, label: "向量" },
        ])
        const chart = getNodePorts(NodeType.CHART)
        expect(chart.inputs).toEqual([{ id: "vector", type: PortType.VECTOR, label: "向量", multiple: false }])
        expect(chart.outputs).toEqual([])
        expect(canConnectPorts(ast.outputs[1], chart.inputs[0])).toBe(true)

        // 原始向量输入节点同样可以接入图表
        const rawVector = getNodePorts(NodeType.VECTOR_INPUT).outputs[0]
        expect(canConnectPorts(rawVector, chart.inputs[0])).toBe(true)
    })

    it("角色与武器输入节点的数值参数作为可选向量输入", () => {
        const charPorts = getNodePorts(NodeType.CHAR_INPUT)
        expect(charPorts.inputs).toEqual([
            { id: "charLevel", type: PortType.VECTOR, label: "等级", multiple: false },
            { id: "skillE", type: PortType.VECTOR, label: "E 技能等级", multiple: false },
            { id: "skillQ", type: PortType.VECTOR, label: "Q 技能等级", multiple: false },
            { id: "skillPassive", type: PortType.VECTOR, label: "被动技能等级", multiple: false },
        ])
        expect(getNodePorts(NodeType.MELEE_WEAPON_INPUT).inputs.map(port => port.id)).toEqual(["level", "refine"])
        expect(getNodePorts(NodeType.RANGED_WEAPON_INPUT).inputs.map(port => port.id)).toEqual(["level", "refine"])

        const numberOutput = getNodePorts(NodeType.NUMBER_INPUT).outputs[0]
        const vectorOutput = getNodePorts(NodeType.VECTOR_INPUT).outputs[0]
        expect(canConnectPorts(numberOutput, charPorts.inputs[0])).toBe(true)
        expect(canConnectPorts(vectorOutput, charPorts.inputs[0])).toBe(true)
        expect(canConnectPorts(charPorts.outputs[0], charPorts.inputs[0])).toBe(false)
        expect(canConnectPorts(vectorOutput, getNodePorts(NodeType.ADD_CALC).inputs[0])).toBe(false)
    })

    it("向量分解按向量长度生成逐项数值输出", () => {
        expect(getNodePorts(NodeType.VECTOR_DECOMPOSE)).toEqual({
            inputs: [{ id: "vector", type: PortType.VECTOR, label: "向量", multiple: false }],
            outputs: [],
        })

        const ports = getNodePorts(NodeType.VECTOR_DECOMPOSE, { vectorLabels: ["倍率=1", "倍率=2"] })
        expect(ports.outputs).toEqual([
            { id: "value-0", type: PortType.NUMBER, label: "倍率=1" },
            { id: "value-1", type: PortType.NUMBER, label: "倍率=2" },
        ])
        expect(getNodePorts(NodeType.VECTOR_DECOMPOSE, { vectorLabels: [""] }).outputs[0].label).toBe("数值1")

        const vectorOutput = getNodePorts(NodeType.VECTOR_INPUT).outputs[0]
        expect(canConnectPorts(vectorOutput, ports.inputs[0])).toBe(true)
        expect(canConnectPorts(ports.outputs[0], getNodePorts(NodeType.ADD_CALC).inputs[0])).toBe(true)
        expect(resolvePort(NodeType.VECTOR_DECOMPOSE, "value-1", "output", { vectorLabels: ["a", "b"] })?.type).toBe(PortType.NUMBER)
    })

    it("向量计算节点输入一维向量并输出数值", () => {
        const ports = getNodePorts(NodeType.VECTOR_CALC)
        expect(ports.inputs).toEqual([{ id: "vector", type: PortType.VECTOR, label: "向量", multiple: false }])
        expect(ports.outputs).toEqual([{ id: "value", type: PortType.NUMBER, label: "数值" }])
        const vectorOutput = getNodePorts(NodeType.VECTOR_INPUT).outputs[0]
        expect(canConnectPorts(vectorOutput, ports.inputs[0])).toBe(true)
        expect(canConnectPorts(ports.outputs[0], getNodePorts(NodeType.ADD_CALC).inputs[0])).toBe(true)
    })

    it("BUFF 合并节点接收两路 BUFF 并输出一路 BUFF", () => {
        const ports = getNodePorts(NodeType.BUFF_MERGE)
        expect(ports.inputs).toEqual([
            { id: "left", type: PortType.BUFF, label: "BUFF A", multiple: false },
            { id: "right", type: PortType.BUFF, label: "BUFF B", multiple: false },
        ])
        expect(ports.outputs).toEqual([{ id: "buff", type: PortType.BUFF, label: "BUFF" }])
        expect(canConnectPorts(getNodePorts(NodeType.BUFF_INPUT).outputs[0], ports.inputs[0])).toBe(true)
        const coreBuff = getNodePorts(NodeType.CORE_CALC).inputs.find(port => port.id === CORE_INPUT.buff)!
        expect(canConnectPorts(ports.outputs[0], coreBuff)).toBe(true)
    })

    it("JSON 构筑节点接收角色与标准 charSettings 文本并输出构筑", () => {
        const ports = getNodePorts(NodeType.JSON_BUILD)
        expect(ports.inputs).toEqual([
            { id: "char", type: PortType.CHAR, label: "角色", multiple: false },
            { id: "text", type: PortType.STRING, label: "构筑 JSON", multiple: false },
        ])
        expect(ports.outputs).toEqual([{ id: "build", type: PortType.BUILD, label: "构筑" }])
        expect(canConnectPorts(getNodePorts(NodeType.CHAR_INPUT).outputs[0], ports.inputs[0])).toBe(true)
        expect(canConnectPorts(getNodePorts(NodeType.TEXT_INPUT).outputs[0], ports.inputs[1])).toBe(true)
        expect(canConnectPorts(getNodePorts(NodeType.JSON_EXPORT).outputs[0], ports.inputs[1])).toBe(true)
    })

    it("唯一端口在旧边没有 handle 时可以自动解析", () => {
        expect(resolvePort(NodeType.CHAR_INPUT, null, "output")?.id).toBe("char")
        expect(resolvePort(NodeType.CORE_CALC, null, "input")).toBeUndefined()
        expect(resolvePort(NodeType.MOD_INPUT, "mod", "output")?.type).toBe(PortType.MOD)
    })
})
