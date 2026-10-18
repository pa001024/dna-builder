import { nanoid } from "nanoid"
import { defineStore } from "pinia"
import { computed, ref, watch } from "vue"
import { generateCode } from "@/utils/autoscript/codegen"
import { type AutoScriptDoc, type ConfigVar, createDefaultDoc, type FlowNode } from "@/utils/autoscript/types"

const STORAGE_KEY = "autoscript-doc-v1"

/** 创建带唯一 ID 的节点。 */
export function createFlowNode<T extends Omit<FlowNode, "id">>(node: T): FlowNode {
    return { id: `n_${nanoid(8)}`, ...node } as FlowNode
}

/** 节点默认工厂（由调色板使用）。 */
export function createNodeByKind(kind: FlowNode["kind"]): FlowNode {
    switch (kind) {
        case "mouseClick":
            return createFlowNode({ kind, x: 800, y: 450, button: "left" })
        case "mouseDown":
            return createFlowNode({ kind, x: 800, y: 450, button: "left" })
        case "mouseUp":
            return createFlowNode({ kind, x: 800, y: 450, button: "left" })
        case "keyPress":
            return createFlowNode({ kind, key: "q" })
        case "keyDown":
            return createFlowNode({ kind, key: "shift" })
        case "keyUp":
            return createFlowNode({ kind, key: "shift" })
        case "sleep":
            return createFlowNode({ kind, ms: 500 })
        case "waitColor":
            return createFlowNode({ kind, x: 0, y: 0, color: 0xffffff, tolerance: 10, timeout: 20000 })
        case "capFrame":
            return createFlowNode({ kind })
        case "setStatus":
            return createFlowNode({ kind, title: "状态", payload: "" })
        case "setConfig":
            return createFlowNode({ kind, name: "", value: "" })
        case "playDsl":
            return createFlowNode({ kind, dsl: "L(800,450)0.1 q" })
        case "stopPlay":
            return createFlowNode({ kind })
        case "code":
            return createFlowNode({ kind, source: "" })
        case "loop":
            return createFlowNode({ kind, loopType: "forever", count: 10, body: [] })
        case "if":
            return createFlowNode({
                kind,
                condition: { op: "call", fn: "colorExists", x: 0, y: 0, color: 0xffffff, tolerance: 10 },
                thenBody: [],
                elseBody: [],
            })
        case "switch":
            return createFlowNode({ kind, subjectVar: "", cases: [{ id: `c_${nanoid(6)}`, match: "", body: [] }], defaultBody: [] })
        case "functionDef":
            return createFlowNode({ kind, funcName: "新函数", body: [] })
        case "functionCall":
            return createFlowNode({ kind, funcName: "" })
        case "break":
            return createFlowNode({ kind })
        case "continue":
            return createFlowNode({ kind })
    }
}

/** 深遍历所有节点（含容器子级）。 */
export function walkNodes(nodes: FlowNode[], visit: (node: FlowNode, list: FlowNode[], index: number) => void) {
    const walk = (list: FlowNode[]) => {
        list.forEach((node, index) => {
            visit(node, list, index)
            if (node.kind === "loop") walk(node.body)
            else if (node.kind === "if") {
                walk(node.thenBody)
                walk(node.elseBody)
            } else if (node.kind === "switch") {
                for (const switchCase of node.cases) walk(switchCase.body)
                walk(node.defaultBody)
            } else if (node.kind === "functionDef") walk(node.body)
        })
    }
    walk(nodes)
}

export const useAutoScriptStore = defineStore("autoScript", () => {
    const doc = ref<AutoScriptDoc>(createDefaultDoc())
    const selectedNodeId = ref<string | null>(null)

    const generated = computed(() => generateCode(doc.value))

    /** 收集全部函数定义名（供 functionCall 下拉）。 */
    const functionNames = computed(() => {
        const names: string[] = []
        walkNodes(doc.value.main, node => {
            if (node.kind === "functionDef" && node.funcName.trim()) names.push(node.funcName.trim())
        })
        return [...new Set(names)]
    })

    /** 可引用的变量名（config 变量 + waitColor/playDsl 输出）。 */
    const variableNames = computed(() => {
        const names = doc.value.configVars.map(configVar => configVar.varName || configVar.name).filter(Boolean)
        walkNodes(doc.value.main, node => {
            if ((node.kind === "waitColor" || node.kind === "playDsl") && node.saveAs?.trim()) names.push(node.saveAs.trim())
        })
        return [...new Set(names)]
    })

    /** 按 ID 查找节点及其所在列表。 */
    function locateNode(id: string): { node: FlowNode; list: FlowNode[]; index: number } | null {
        let found: { node: FlowNode; list: FlowNode[]; index: number } | null = null
        walkNodes(doc.value.main, (node, list, index) => {
            if (node.id === id) found = { node, list, index }
        })
        return found
    }

    const selectedNode = computed(() => (selectedNodeId.value ? (locateNode(selectedNodeId.value)?.node ?? null) : null))

    /** 在目标列表的指定位置插入节点（省略 list 时插入 main 末尾）。 */
    function insertNode(node: FlowNode, list?: FlowNode[], index?: number) {
        const target = list ?? doc.value.main
        target.splice(index ?? target.length, 0, node)
        selectedNodeId.value = node.id
    }

    /** 删除节点。 */
    function removeNode(id: string) {
        const located = locateNode(id)
        if (!located) return
        located.list.splice(located.index, 1)
        if (selectedNodeId.value === id) selectedNodeId.value = null
    }

    /** 移动节点到目标列表的指定位置。 */
    function moveNode(id: string, targetList: FlowNode[], targetIndex: number) {
        const located = locateNode(id)
        if (!located) return
        // 防止把容器拖进自己内部
        let invalid = false
        if (["loop", "if", "switch", "functionDef"].includes(located.node.kind)) {
            const descendantIds = new Set<string>()
            walkNodes([located.node], node => descendantIds.add(node.id))
            walkNodes(targetList, node => {
                if (descendantIds.has(node.id) && node.id !== located.node.id) invalid = true
            })
        }
        if (invalid) return
        located.list.splice(located.index, 1)
        // 同列表内向前移动时索引回退
        const adjustedIndex = located.list === targetList && located.index < targetIndex ? targetIndex - 1 : targetIndex
        targetList.splice(Math.max(0, Math.min(adjustedIndex, targetList.length)), 0, located.node)
    }

    /** 克隆节点（重新分配所有 ID）。 */
    function cloneNode(id: string) {
        const located = locateNode(id)
        if (!located) return
        const raw = JSON.parse(JSON.stringify(located.node)) as FlowNode
        walkNodes([raw], node => {
            node.id = `n_${nanoid(8)}`
            if (node.kind === "switch") {
                for (const switchCase of node.cases) switchCase.id = `c_${nanoid(6)}`
            }
        })
        located.list.splice(located.index + 1, 0, raw)
    }

    function addConfigVar() {
        const index = doc.value.configVars.length + 1
        const configVar: ConfigVar = {
            name: `配置${index}`,
            desc: "",
            kind: "number",
            options: [],
            defaultValue: 0,
            varName: `cfg${index}`,
        }
        doc.value.configVars.push(configVar)
    }

    function removeConfigVar(index: number) {
        doc.value.configVars.splice(index, 1)
    }

    function resetDoc() {
        doc.value = createDefaultDoc()
        selectedNodeId.value = null
    }

    function loadDoc(raw: AutoScriptDoc) {
        doc.value = raw
        selectedNodeId.value = null
    }

    /** 将录制得到的节点追加到主流程末尾。 */
    function appendRecordedNodes(nodes: FlowNode[]) {
        if (nodes.length === 0) return
        doc.value.main.push(...nodes)
    }

    // 草稿持久化
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) doc.value = { ...createDefaultDoc(), ...(JSON.parse(stored) as AutoScriptDoc) }
    } catch (error) {
        console.error("读取 AutoScript 草稿失败", error)
    }
    watch(
        doc,
        value => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
            } catch (error) {
                console.error("保存 AutoScript 草稿失败", error)
            }
        },
        { deep: true }
    )

    return {
        doc,
        selectedNodeId,
        selectedNode,
        generated,
        functionNames,
        variableNames,
        locateNode,
        insertNode,
        removeNode,
        moveNode,
        cloneNode,
        addConfigVar,
        removeConfigVar,
        resetDoc,
        loadDoc,
        appendRecordedNodes,
    }
})
