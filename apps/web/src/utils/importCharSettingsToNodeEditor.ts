import type { Node } from "@vue-flow/core"
import { nanoid } from "nanoid"
import { nextTick } from "vue"
import type { CharSettings } from "@/composables/useCharSettings"
import { normalizeCharSkillLevels } from "@/composables/useCharSettings"
import { NodeType, useNodeEditorStore } from "@/store/nodeEditor"
import { clonePlain } from "@/utils/nodeEditorBuild"
import { CORE_INPUT } from "@/utils/nodeEditorPorts"

type NodeEditorStore = ReturnType<typeof useNodeEditorStore>

/** 导入时的排布列：基础输入与附加输入分列，避免节点高度差异造成重叠 */
const INPUT_COLUMNS: NodeType[][] = [
    [NodeType.CHAR_INPUT, NodeType.MELEE_WEAPON_INPUT, NodeType.RANGED_WEAPON_INPUT, NodeType.MOD_INPUT, NodeType.ENEMY_INPUT],
    [NodeType.BUFF_INPUT, NodeType.EFFECT_INPUT, NodeType.PET_INPUT, NodeType.CUSTOM_VARS_INPUT, NodeType.DOT_INPUT],
]

const LAYOUT_GAP_X = 160
const LAYOUT_GAP_Y = 64
const FALLBACK_NODE_WIDTH = 280
const FALLBACK_NODE_HEIGHT = 160

interface LayoutNode {
    id: string
    type?: string
    position: { x: number; y: number }
}

/**
 * 读取节点在画布上的实际渲染尺寸。
 * @param node 节点
 * @returns 宽高；节点尚未渲染时使用默认值
 */
function measureNode(node: LayoutNode) {
    const element = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${node.id}"]`)
    return {
        width: element?.offsetWidth || FALLBACK_NODE_WIDTH,
        height: element?.offsetHeight || FALLBACK_NODE_HEIGHT,
    }
}

/**
 * 等待节点挂载并完成尺寸测量；超时后退回默认尺寸。
 * @param nodes 需要排布的节点
 */
async function waitForRenderedNodes(nodes: LayoutNode[]) {
    const deadline = performance.now() + 1000
    while (performance.now() < deadline) {
        const ready = nodes.every(node => {
            const element = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${node.id}"]`)
            return Boolean(element && element.offsetWidth > 0 && element.offsetHeight > 0)
        })
        if (ready) return
        await new Promise(resolve => setTimeout(resolve, 16))
    }
}

/**
 * 按节点实际大小排布导入的图：输入节点分列堆叠，核心与目标函数按内容高度垂直居中。
 * @param store 节点编辑器 store
 */
async function layoutImportedNodes(store: NodeEditorStore) {
    await nextTick()
    await waitForRenderedNodes(store.nodes as LayoutNode[])
    const byType = new Map<string, LayoutNode>()
    store.nodes.forEach(node => {
        if (node.type && !byType.has(node.type)) byType.set(node.type, node as LayoutNode)
    })
    const columns = INPUT_COLUMNS.map(types => types.map(type => byType.get(type)).filter((node): node is LayoutNode => Boolean(node)))
    const metrics = columns.map(nodes => {
        const sizes = nodes.map(measureNode)
        return {
            nodes,
            sizes,
            width: Math.max(0, ...sizes.map(size => size.width)),
            height: sizes.reduce((sum, size) => sum + size.height, 0) + LAYOUT_GAP_Y * Math.max(0, nodes.length - 1),
        }
    })
    const contentHeight = Math.max(0, ...metrics.map(column => column.height))
    let x = 0
    metrics.forEach(column => {
        let y = (contentHeight - column.height) / 2
        column.nodes.forEach((node, index) => {
            node.position = { x: Math.round(x), y: Math.round(y) }
            y += column.sizes[index].height + LAYOUT_GAP_Y
        })
        x += column.width + LAYOUT_GAP_X
    })
    const core = byType.get(NodeType.CORE_CALC)
    if (!core) return
    const coreSize = measureNode(core)
    core.position = { x: Math.round(x), y: Math.round((contentHeight - coreSize.height) / 2) }
    x += coreSize.width + LAYOUT_GAP_X
    const ast = byType.get(NodeType.AST_EXPRESSION_CALC)
    if (ast) {
        const astSize = measureNode(ast)
        ast.position = { x: Math.round(x), y: Math.round(core.position.y + (coreSize.height - astSize.height) / 2) }
    }
}

/**
 * 从 CharSettings 导入数据到节点编辑器。
 * 每一种输入都落到独立节点，并通过带类型的端口直连核心节点；核心只产出构筑，不在核心上求值。
 * 队友配置与 BUFF 合并到同一节点（BUFF 候选依赖队友来源过滤），自定义变量组不创建求值节点。
 * 节点位置在渲染后按实际尺寸重新排布。
 * @param charName 角色名称
 * @param settings 角色设置数据
 * @returns 创建的节点 ID 映射
 */
export async function importCharSettingsToNodeEditor(charName: string, settings: CharSettings) {
    const store = useNodeEditorStore()
    store.beginHistoryBatch()
    try {
        return await importCharSettingsToNodeEditorInner(charName, settings)
    } finally {
        store.endHistoryBatch(`导入构筑 - ${charName}`)
    }
}

/**
 * 导入后的节点规格：每一种输入都落到独立节点，并通过带类型的端口直连核心节点。
 * 单独抽出便于在不依赖渲染的情况下校验「导入图」与「标准构筑」的求值口径一致。
 */
export interface ImportedGraphSpec {
    nodes: { id: string; type: NodeType; data: Record<string, any> }[]
    edges: { source: string; target: string; sourceHandle: string; targetHandle: string }[]
    coreId: string
    astId?: string
}

/**
 * 把 CharSettings 映射为节点图规格。
 * 队友配置与 BUFF 合并到同一节点（BUFF 候选依赖队友来源过滤），自定义变量组不创建求值节点。
 * @param charName 角色名称
 * @param settings 角色设置数据
 * @returns 节点与连线的规格
 */
export function createImportedGraphSpec(charName: string, settings: CharSettings): ImportedGraphSpec {
    const nodes: ImportedGraphSpec["nodes"] = []
    const edges: ImportedGraphSpec["edges"] = []
    const ids = {
        char: `char-input-${nanoid(6)}`,
        melee: `melee-weapon-${nanoid(6)}`,
        ranged: `ranged-weapon-${nanoid(6)}`,
        mod: `mod-${nanoid(6)}`,
        enemy: `enemy-input-${nanoid(6)}`,
        buff: `buff-input-${nanoid(6)}`,
        effect: `effect-input-${nanoid(6)}`,
        pet: `pet-input-${nanoid(6)}`,
        customVars: `custom-vars-input-${nanoid(6)}`,
        dot: `dot-input-${nanoid(6)}`,
        core: `core-calc-${nanoid(6)}`,
        ast: `ast-calc-${nanoid(6)}`,
    }

    // 角色输入：只保存角色节点自身负责的字段，其余配置由各自输入节点提供
    nodes.push({
        id: ids.char,
        type: NodeType.CHAR_INPUT,
        data: {
            label: "角色输入",
            charName,
            charLevel: settings.charLevel,
            hpPercent: settings.hpPercent,
            resonanceGain: settings.resonanceGain,
            extraMastery: settings.extraMastery,
            charSkillLevel: [...normalizeCharSkillLevels(settings.charSkillLevel)],
        },
    })
    nodes.push({
        id: ids.melee,
        type: NodeType.MELEE_WEAPON_INPUT,
        data: { label: "近战武器输入", weapon: settings.meleeWeapon, level: settings.meleeWeaponLevel, refine: settings.meleeWeaponRefine },
    })
    nodes.push({
        id: ids.ranged,
        type: NodeType.RANGED_WEAPON_INPUT,
        data: {
            label: "远程武器输入",
            weapon: settings.rangedWeapon,
            level: settings.rangedWeaponLevel,
            refine: settings.rangedWeaponRefine,
        },
    })
    nodes.push({
        id: ids.mod,
        type: NodeType.MOD_INPUT,
        data: {
            label: "MOD输入",
            modSettings: {
                charMods: clonePlain(settings.charMods),
                meleeMods: clonePlain(settings.meleeMods),
                rangedMods: clonePlain(settings.rangedMods),
                skillWeaponMods: clonePlain(settings.skillWeaponMods),
                auraMod: settings.auraMod,
                modVariantIndex: settings.modVariantIndex,
                modVariants: clonePlain(settings.modVariants),
            },
        },
    })
    nodes.push({
        id: ids.enemy,
        type: NodeType.ENEMY_INPUT,
        data: {
            label: "敌人设置",
            enemyId: settings.enemyId,
            enemyLevel: settings.enemyLevel,
            enemyResistance: settings.enemyResistance,
            imbalance: settings.imbalance,
        },
    })
    // 队友配置与 BUFF 合并：BUFF 编辑器直接使用这里的队友角色/武器过滤候选。
    // 助战 BUFF 已在标准构筑的 buffs 里，直接原样带入，不再另外派生一层覆盖值。
    nodes.push({
        id: ids.buff,
        type: NodeType.BUFF_INPUT,
        data: {
            label: "BUFF与队友",
            buffs: settings.buffs.map(buff => [...buff]),
            customBuff: clonePlain(settings.customBuff),
            team1: settings.team1,
            team1Weapon: settings.team1Weapon,
            team1Build: settings.team1Build,
            team1BuildVariant: settings.team1BuildVariant,
            team2: settings.team2,
            team2Weapon: settings.team2Weapon,
            team2Build: settings.team2Build,
            team2BuildVariant: settings.team2BuildVariant,
        },
    })
    nodes.push({
        id: ids.effect,
        type: NodeType.EFFECT_INPUT,
        data: { label: "特效设置", useGlobal: settings.useGlobal, effectConfig: clonePlain(settings.effectConfig) },
    })
    nodes.push({
        id: ids.pet,
        type: NodeType.PET_INPUT,
        data: {
            label: "魔灵设置",
            petId: settings.petId,
            petLevel: settings.petLevel,
            petCoverage: settings.petCoverage,
            petAutoCoverage: settings.petAutoCoverage,
            traits: clonePlain(settings.traits),
        },
    })
    nodes.push({
        id: ids.customVars,
        type: NodeType.CUSTOM_VARS_INPUT,
        data: { label: "自定义变量组", customVariables: settings.customVariables.map(variable => [...variable]) },
    })
    nodes.push({
        id: ids.dot,
        type: NodeType.DOT_INPUT,
        data: { label: "DOT频率", dotSettings: clonePlain(settings.dotSettings) },
    })

    // 核心节点：只负责组装构筑
    nodes.push({
        id: ids.core,
        type: NodeType.CORE_CALC,
        data: { label: "核心计算", selectedSkill: settings.baseName },
    })

    const connect = (source: string, sourceHandle: string, targetHandle: string) => {
        edges.push({ source, target: ids.core, sourceHandle, targetHandle })
    }
    connect(ids.char, "char", CORE_INPUT.char)
    connect(ids.melee, "weapon", CORE_INPUT.meleeWeapon)
    connect(ids.ranged, "weapon", CORE_INPUT.rangedWeapon)
    connect(ids.mod, "mod", CORE_INPUT.mod)
    connect(ids.buff, "buff", CORE_INPUT.buff)
    connect(ids.effect, "effect", CORE_INPUT.effect)
    connect(ids.pet, "pet", CORE_INPUT.pet)
    connect(ids.enemy, "enemy", CORE_INPUT.enemy)
    connect(ids.customVars, "customVariables", CORE_INPUT.customVariables)
    connect(ids.dot, "dot", CORE_INPUT.dot)

    // 目标函数是显式求值节点，接在核心的构筑输出之后
    const astId = settings.targetFunction.trim() ? ids.ast : undefined
    if (astId) {
        nodes.push({
            id: astId,
            type: NodeType.AST_EXPRESSION_CALC,
            data: { label: "目标函数", expression: settings.targetFunction },
        })
        edges.push({ source: ids.core, target: astId, sourceHandle: "build", targetHandle: "build" })
    }

    return { nodes, edges, coreId: ids.core, astId }
}

async function importCharSettingsToNodeEditorInner(charName: string, settings: CharSettings) {
    const store = useNodeEditorStore()

    // 创建新图（导入过程整体作为一个撤销步骤）
    store.clearGraph({ resetHistory: false })
    store.currentGraphId = null
    store.currentGraphName = `导入 - ${charName}`

    const spec = createImportedGraphSpec(charName, settings)
    const nodeIds: Record<string, string> = {}
    spec.nodes.forEach(item => {
        const node: Node = { id: item.id, type: item.type, position: { x: 0, y: 0 }, data: item.data }
        store.addNode(node)
    })
    /** 节点类型 → 调用方沿用的 id 键名 */
    const ID_KEYS: Record<string, string> = {
        [NodeType.CHAR_INPUT]: "charInput",
        [NodeType.MELEE_WEAPON_INPUT]: "meleeWeapon",
        [NodeType.RANGED_WEAPON_INPUT]: "rangedWeapon",
        [NodeType.MOD_INPUT]: "mod",
        [NodeType.ENEMY_INPUT]: "enemyInput",
        [NodeType.BUFF_INPUT]: "buffInput",
        [NodeType.EFFECT_INPUT]: "effectInput",
        [NodeType.PET_INPUT]: "petInput",
        [NodeType.CUSTOM_VARS_INPUT]: "customVarsInput",
        [NodeType.DOT_INPUT]: "dotInput",
    }
    spec.nodes.forEach(item => {
        const key = ID_KEYS[item.type]
        if (key) nodeIds[key] = item.id
    })
    nodeIds.coreCalc = spec.coreId
    if (spec.astId) nodeIds.ast = spec.astId
    spec.edges.forEach(edge => {
        store.addEdge({ id: `e-${edge.source}-${edge.target}`, ...edge })
    })

    // 等待节点挂载后按实际渲染尺寸排布
    await layoutImportedNodes(store)

    // 触发一次完整计算（核心组装构筑，求值节点各自调度 worker）
    store.recalculateAllNodes()

    await store.saveGraphToDB(store.currentGraphName)

    return nodeIds
}
