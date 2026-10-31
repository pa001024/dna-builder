import { describe, expect, it } from "vitest"
import { NodeType } from "@/store/nodeEditorTypes"
import { CORE_INPUT, canConnectPorts, getNodePorts, PortType, resolvePort } from "@/utils/nodeEditorPorts"

describe("nodeEditorPorts", () => {
    it("核心节点只输出构筑，且输入端口覆盖全部构筑输入", () => {
        const ports = getNodePorts(NodeType.CORE_CALC)
        expect(ports.outputs).toEqual([{ id: "build", type: PortType.BUILD, label: "构筑" }])
        expect(ports.inputs.map(port => port.type)).toEqual([
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

    it("唯一端口在旧边没有 handle 时可以自动解析", () => {
        expect(resolvePort(NodeType.CHAR_INPUT, null, "output")?.id).toBe("char")
        expect(resolvePort(NodeType.CORE_CALC, null, "input")).toBeUndefined()
        expect(resolvePort(NodeType.MOD_INPUT, "mod", "output")?.type).toBe(PortType.MOD)
    })
})
