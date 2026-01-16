import type { Edge, Node } from "@vue-flow/core"
import { nanoid } from "nanoid"
import type { CharSettings } from "@/composables/useCharSettings"
import { NodeType, useNodeEditorStore } from "@/store/nodeEditor"

/**
 * 从CharSettings导入数据到节点编辑器
 * @param settings 角色设置数据
 * @returns 创建的节点ID映射
 */
export function importCharSettingsToNodeEditor(charName: string, settings: CharSettings) {
    const store = useNodeEditorStore()

    // 创建新图
    store.clearGraph()
    store.currentGraphId = null
    store.currentGraphName = `导入 - ${charName}`

    // 节点ID映射，用于后续连接
    const nodeIds: Record<string, string> = {}

    // 节点位置配置（自动排版）
    const nodeWidth = 250
    const nodeHeight = 300
    const horizontalSpacing = 150
    const verticalSpacing = 100
    const startX = 50
    const startY = 100
    let i = 1

    // 创建角色输入节点
    const charInputNode: Node = {
        id: `char-input-${nanoid(6)}`,
        type: NodeType.CHAR_INPUT,
        position: { x: startX, y: startY },
        data: {
            label: "角色输入",
            charName,
            charLevel: settings.charLevel,
            baseName: settings.baseName,
            hpPercent: settings.hpPercent,
            resonanceGain: settings.resonanceGain,
            isRouge: settings.isRouge,
            charSkillLevel: settings.charSkillLevel,
        },
    }
    store.addNode(charInputNode)
    nodeIds.charInput = charInputNode.id

    // 创建近战武器输入节点
    const meleeWeaponNode: Node = {
        id: `melee-weapon-${nanoid(6)}`,
        type: NodeType.MELEE_WEAPON_INPUT,
        position: { x: startX, y: startY + nodeHeight + verticalSpacing },
        data: {
            label: "近战武器输入",
            weapon: settings.meleeWeapon,
            level: settings.meleeWeaponLevel,
            refine: settings.meleeWeaponRefine,
        },
    }
    store.addNode(meleeWeaponNode)
    nodeIds.meleeWeapon = meleeWeaponNode.id

    // 创建远程武器输入节点
    const rangedWeaponNode: Node = {
        id: `ranged-weapon-${nanoid(6)}`,
        type: NodeType.RANGED_WEAPON_INPUT,
        position: { x: startX, y: startY + (nodeHeight + verticalSpacing) * ++i },
        data: {
            label: "远程武器输入",
            weapon: settings.rangedWeapon,
            level: settings.rangedWeaponLevel,
            refine: settings.rangedWeaponRefine,
        },
    }
    store.addNode(rangedWeaponNode)
    nodeIds.rangedWeapon = rangedWeaponNode.id

    const allmods = [settings.charMods, settings.meleeMods, settings.rangedMods, settings.skillWeaponMods].flatMap(mods =>
        mods.filter(mod => mod !== null)
    )
    // 创建MOD节点
    const modNode: Node = {
        id: `mod-${nanoid(6)}`,
        type: NodeType.MOD_INPUT,
        position: { x: startX, y: startY + (nodeHeight + verticalSpacing) * ++i },
        data: {
            label: "MOD输入",
            mods: allmods ? allmods.map(mod => mod[0]) : [],
            modLevels: allmods ? allmods.map(mod => mod[1]) : [],
        },
    }
    store.addNode(modNode)
    nodeIds.mod = modNode.id

    // 创建敌人输入节点
    const enemyInputNode: Node = {
        id: `enemy-input-${nanoid(6)}`,
        type: NodeType.ENEMY_INPUT,
        position: { x: startX, y: startY + (nodeHeight + verticalSpacing) * ++i },
        data: {
            label: "敌人设置",
            enemyId: settings.enemyId,
            enemyLevel: settings.enemyLevel,
            enemyResistance: settings.enemyResistance,
            imbalance: settings.imbalance,
        },
    }
    store.addNode(enemyInputNode)
    nodeIds.enemyInput = enemyInputNode.id

    // 创建BUFF输入节点
    const buffInputNode: Node = {
        id: `buff-input-${nanoid(6)}`,
        type: NodeType.BUFF_INPUT,
        position: { x: startX, y: startY + (nodeHeight + verticalSpacing) * ++i },
        data: {
            label: "BUFF设置",
            buffs: settings.buffs.map(buff => buff[0]),
            buffLevels: settings.buffs.map(buff => buff[1]),
        },
    }
    store.addNode(buffInputNode)
    nodeIds.buffInput = buffInputNode.id

    // 创建集线节点(hub)
    const hubNode: Node = {
        id: `hub-calc-${nanoid(6)}`,
        type: NodeType.HUB_CALC,
        position: { x: startX + nodeWidth + horizontalSpacing, y: startY + (nodeHeight + verticalSpacing) * 2 },
        data: {
            label: "集线节点",
        },
    }
    store.addNode(hubNode)
    nodeIds.hub = hubNode.id

    // 创建核心计算节点
    const coreCalcNode: Node = {
        id: `core-calc-${nanoid(6)}`,
        type: NodeType.CORE_CALC,
        position: { x: startX + (nodeWidth + horizontalSpacing) * 2, y: startY + (nodeHeight + verticalSpacing) * 2 },
        data: {
            label: "核心计算",
        },
    }
    store.addNode(coreCalcNode)
    nodeIds.coreCalc = coreCalcNode.id

    // 创建目标函数节点
    const astNode: Node = {
        id: `ast-calc-${nanoid(6)}`,
        type: NodeType.AST_EXPRESSION_CALC,
        position: { x: startX + (nodeWidth + horizontalSpacing) * 3, y: startY + (nodeHeight + verticalSpacing) * 2 },
        data: {
            label: "目标函数",
            expression: settings.targetFunction,
        },
    }
    store.addNode(astNode)
    nodeIds.ast = astNode.id

    // 连接所有输入节点到集线节点
    const inputNodeIds = [nodeIds.charInput, nodeIds.meleeWeapon, nodeIds.rangedWeapon, nodeIds.mod, nodeIds.enemyInput, nodeIds.buffInput]

    inputNodeIds.forEach(inputNodeId => {
        const edge: Edge = {
            id: `e-${inputNodeId}-${nodeIds.hub}`,
            source: inputNodeId,
            target: nodeIds.hub,
        }
        store.addEdge(edge)
    })

    // 连接集线节点到核心计算节点
    const hubToCoreEdge: Edge = {
        id: `e-${nodeIds.hub}-${nodeIds.coreCalc}`,
        source: nodeIds.hub,
        target: nodeIds.coreCalc,
    }
    store.addEdge(hubToCoreEdge)

    // 连接核心计算节点到目标函数节点
    const coreToAstEdge: Edge = {
        id: `e-${nodeIds.coreCalc}-${nodeIds.ast}`,
        source: nodeIds.coreCalc,
        target: nodeIds.ast,
    }
    store.addEdge(coreToAstEdge)

    // 触发计算 - 清除缓存并计算所有节点
    store.clearCache()
    // 计算核心节点，会自动递归计算所有输入节点
    store.calculateNode(nodeIds.coreCalc)
    // 计算目标函数节点
    store.calculateNode(nodeIds.ast)

    store.saveGraphToDB(store.currentGraphName)

    return nodeIds
}
