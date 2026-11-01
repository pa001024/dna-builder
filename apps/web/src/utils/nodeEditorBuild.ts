import { buffData, charData, charMap, LeveledModHelper } from "@/data"
import { type CharBuild, type DotFrequencySettings, defaultDotFrequencySettings } from "@/data/CharBuild"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import {
    CHAR_SKILL_LEVEL_DEFAULT,
    CHAR_SKILL_LEVEL_MAX,
    CHAR_SKILL_LEVEL_MIN,
    type CharSettings,
    type CharSkillLevels,
    createDefaultCharSettings,
    MOD_SLOT_COUNTS,
    MOD_SLOT_TYPES,
    MOD_VARIANT_MAX_COUNT,
    type ModSlot,
    type ModSlotType,
    type ModVariant,
    normalizeCharSettings,
    normalizeCharSkillLevels,
    normalizeModVariantLetter,
    serializeCharSettings,
} from "@/data/charSettings"
import { isPetRelatedBuffName, normalizeTraitSlots } from "@/data/petTrait"
import { NodeType } from "@/store/nodeEditorTypes"
import {
    BUFF_MERGE_INPUT,
    CORE_INPUT,
    NUMERIC_PARAM_PORTS,
    PortType,
    parseCustomVariableVectorPortId,
    resolvePort,
    vectorDecomposePortId,
} from "@/utils/nodeEditorPorts"

/**
 * 节点图求值所需的输入节点集合。
 * 核心节点按端口收集直接相连的输入；预览构筑则收集图中全部输入节点。
 */
export interface NodeBuildInputs {
    charInput?: BuildGraphNode
    meleeWeapon?: BuildGraphNode
    rangedWeapon?: BuildGraphNode
    modInputs: BuildGraphNode[]
    buffInputs: BuildGraphNode[]
    effectInput?: BuildGraphNode
    petInput?: BuildGraphNode
    enemyInput?: BuildGraphNode
    customVarsInput?: BuildGraphNode
    dotInput?: BuildGraphNode
    /** 同类输入出现多次时记录的类型名（单连接端口不应出现） */
    duplicates: string[]
}

/** 节点图节点（只依赖编辑器内部的最小字段，避免和 store 类型互相引用） */
export interface BuildGraphNode {
    id: string
    type?: string
    data: Record<string, any>
}

/** 节点图边 */
export interface BuildGraphEdge {
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
}

/** 节点图组装出的构筑上下文 */
export interface NodeBuildContext {
    charId: number
    settings: CharSettings
    charBuild: CharBuild
    missing: string[]
}

/** 节点编辑器的 MOD 槽位数据（与 CharSettings 同形，可复用变体工具函数） */
export interface NodeModSettings {
    charMods: ModSlot[]
    meleeMods: ModSlot[]
    rangedMods: ModSlot[]
    skillWeaponMods: ModSlot[]
    auraMod: number
    modVariantIndex: number
    modVariants: ModVariant[]
}

const INPUT_TYPE_SET = new Set<string>([
    NodeType.CHAR_INPUT,
    NodeType.MELEE_WEAPON_INPUT,
    NodeType.RANGED_WEAPON_INPUT,
    NodeType.MOD_INPUT,
    NodeType.BUFF_INPUT,
    NodeType.EFFECT_INPUT,
    NodeType.PET_INPUT,
    NodeType.ENEMY_INPUT,
    NodeType.CUSTOM_VARS_INPUT,
    NodeType.DOT_INPUT,
])

/** 浅拷贝普通数据（节点数据来自响应式代理，不能让 worker 直接接到 proxy） */
export function clonePlain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

function toFiniteNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function createEmptySlots(count: number): ModSlot[] {
    return Array.from({ length: count }, () => null)
}

/**
 * 把任意槽位数组归一化为固定长度，空槽保持 null。
 * @param slots 原始槽位
 * @param count 目标槽位数
 * @returns 归一化槽位
 */
function normalizeSlots(slots: unknown, count: number): ModSlot[] {
    const list = Array.isArray(slots) ? slots : []
    return Array.from({ length: count }, (_, index) => {
        const slot = list[index]
        if (!Array.isArray(slot) || slot.length < 2) return null
        const id = Number(slot[0])
        const level = Number(slot[1])
        return Number.isFinite(id) && id > 0 && Number.isFinite(level) ? [id, level] : null
    })
}

/**
 * 归一化一份 MOD 变体。
 * @param variant 原始变体
 * @returns 完整变体
 */
function normalizeVariant(variant: any): ModVariant {
    const result = { 中枢: toFiniteNumber(variant?.中枢, 0) } as ModVariant
    MOD_SLOT_TYPES.forEach(type => {
        result[type] = normalizeSlots(variant?.[type], MOD_SLOT_COUNTS[type])
    })
    return result
}

/**
 * 解析 MOD 类型对应的槽位类型。
 * @param modType MOD 的 `类型` 字段
 * @returns 槽位类型；无法归类时返回 null
 */
function resolveModSlotType(modType: string): ModSlotType | null {
    if (modType === "角色" || modType === "近战" || modType === "远程") return modType
    if (modType.startsWith("同律")) return "同律"
    return null
}

/** MOD 槽位类型 → 节点设置字段 */
const MOD_SLOT_SETTING_KEYS = {
    角色: "charMods",
    近战: "meleeMods",
    远程: "rangedMods",
    同律: "skillWeaponMods",
} as const

/**
 * 将旧版 `mods` / `modLevels` 平铺数据按 MOD 类型迁入槽位。
 * @param mods 旧版 MOD id 列表
 * @param levels 旧版 MOD 等级列表
 * @returns 迁移后的槽位集合
 */
function migrateLegacyMods(mods: unknown, levels: unknown): NodeModSettings {
    const settings: NodeModSettings = {
        charMods: createEmptySlots(MOD_SLOT_COUNTS.角色),
        meleeMods: createEmptySlots(MOD_SLOT_COUNTS.近战),
        rangedMods: createEmptySlots(MOD_SLOT_COUNTS.远程),
        skillWeaponMods: createEmptySlots(MOD_SLOT_COUNTS.同律),
        auraMod: 0,
        modVariantIndex: 0,
        modVariants: [],
    }
    if (!Array.isArray(mods)) return settings
    const levelList = Array.isArray(levels) ? levels : []
    mods.forEach((rawId, index) => {
        const id = Number(rawId)
        if (!Number.isFinite(id) || id <= 0) return
        try {
            const mod = LeveledModHelper.fromId(id)
            const type = resolveModSlotType(mod.类型)
            if (!type) return
            const slots = settings[MOD_SLOT_SETTING_KEYS[type]]
            const emptyIndex = slots.indexOf(null)
            if (emptyIndex >= 0) {
                slots[emptyIndex] = [id, toFiniteNumber(levelList[index], 10)]
            }
        } catch (error) {
            console.warn("节点 MOD 迁移失败", id, error)
        }
    })
    return settings
}

/**
 * 读取/归一化 MOD 节点数据：新格式优先，旧版平铺数据自动迁移。
 * @param data 节点数据（原地补齐默认字段）
 * @returns 可直接读写的 MOD 设置
 */
export function ensureNodeModSettings(data: Record<string, any>): NodeModSettings {
    if (!data.modSettings) {
        data.modSettings = migrateLegacyMods(data.mods, data.modLevels)
    }
    const settings = data.modSettings as NodeModSettings
    settings.charMods = normalizeSlots(settings.charMods, MOD_SLOT_COUNTS.角色)
    settings.meleeMods = normalizeSlots(settings.meleeMods, MOD_SLOT_COUNTS.近战)
    settings.rangedMods = normalizeSlots(settings.rangedMods, MOD_SLOT_COUNTS.远程)
    settings.skillWeaponMods = normalizeSlots(settings.skillWeaponMods, MOD_SLOT_COUNTS.同律)
    settings.auraMod = toFiniteNumber(settings.auraMod, 0)
    settings.modVariantIndex = Math.max(0, Math.min(MOD_VARIANT_MAX_COUNT - 1, toFiniteNumber(settings.modVariantIndex, 0)))
    settings.modVariants = Array.isArray(settings.modVariants)
        ? settings.modVariants.map(normalizeVariant).slice(0, MOD_VARIANT_MAX_COUNT - 1)
        : []
    return settings
}

/**
 * 把一份 MOD 设置合并到目标设置：目标空槽由来源补齐，避免同图多个 MOD 节点互相覆盖。
 * @param target 目标设置（原地修改）
 * @param source 来源设置
 */
export function mergeNodeModSettings(target: NodeModSettings, source: NodeModSettings) {
    ;(["charMods", "meleeMods", "rangedMods", "skillWeaponMods"] as const).forEach(key => {
        target[key] = target[key].map((slot, index) => slot ?? source[key][index] ?? null)
    })
    if (!target.auraMod) target.auraMod = source.auraMod
    if (target.modVariants.length === 0 && source.modVariants.length > 0) {
        target.modVariants = source.modVariants
        target.modVariantIndex = source.modVariantIndex
    }
}

/**
 * 读取/归一化 BUFF 节点数据：兼容旧版 `buffs: string[]` + `buffLevels: number[]`。
 * @param data 节点数据
 * @returns BUFF 条目 `[名称, 等级, 覆盖率?]`
 */
export function readNodeBuffEntries(data: Record<string, any>): [string, number, number?][] {
    const raw = data.buffs
    if (Array.isArray(raw) && raw.every(item => Array.isArray(item))) {
        return raw
            .map(item => {
                const name = String(item[0] ?? "")
                const level = toFiniteNumber(item[1], 1)
                const coverage = item[2]
                const entry: [string, number, number?] = [name, level]
                if (typeof coverage === "number" && Number.isFinite(coverage) && coverage !== 1) entry.push(coverage)
                return entry
            })
            .filter(item => item[0] !== "")
    }
    if (Array.isArray(raw)) {
        const levels = Array.isArray(data.buffLevels) ? data.buffLevels : []
        return raw
            .map((name, index): [string, number] => [String(name ?? ""), toFiniteNumber(levels[index], 1)])
            .filter(item => item[0] !== "")
    }
    return []
}

/**
 * 读取/归一化自定义 BUFF 条目。
 * @param data 节点数据
 * @returns 自定义 BUFF 属性条目
 */
export function readNodeCustomBuff(data: Record<string, any>): [string, number][] {
    if (!Array.isArray(data.customBuff)) return []
    return data.customBuff
        .filter((item: unknown) => Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "number")
        .map((item: [string, number]) => [item[0], item[1]])
}

/** BUFF 合并模式：并集保留两边全部条目，交集只保留两边共有的条目 */
export type BuffMergeMode = "union" | "intersect"

/**
 * 读取 BUFF 合并节点的模式，未知取值回退为并集。
 * @param data 节点数据
 * @returns 合并模式
 */
export function readBuffMergeMode(data: Record<string, any>): BuffMergeMode {
    return data.mergeMode === "intersect" ? "intersect" : "union"
}

/** 向量计算节点的统计模式 */
export const VECTOR_CALC_MODES = [
    { mode: "sum", label: "求和", description: "全部取值的总和" },
    { mode: "mean", label: "平均", description: "全部取值的算术平均" },
    { mode: "variance", label: "方差", description: "总体方差：与平均值之差平方的平均" },
    { mode: "std", label: "标准差", description: "总体标准差：方差的平方根" },
    { mode: "min", label: "最小值", description: "全部取值中的最小值" },
    { mode: "max", label: "最大值", description: "全部取值中的最大值" },
    { mode: "median", label: "中位数", description: "排序后居中的取值" },
    { mode: "count", label: "数量", description: "有效取值的个数" },
] as const

/** 向量计算节点的统计模式 */
export type VectorCalcMode = (typeof VECTOR_CALC_MODES)[number]["mode"]

/**
 * 读取向量计算节点的模式，未知取值回退为求和。
 * @param data 节点数据
 * @returns 统计模式
 */
export function readVectorCalcMode(data: Record<string, any>): VectorCalcMode {
    const mode = typeof data.mode === "string" ? data.mode : "sum"
    return (VECTOR_CALC_MODES as readonly { mode: string }[]).some(item => item.mode === mode) ? (mode as VectorCalcMode) : "sum"
}

/**
 * 按模式聚合一维向量，调用方保证全部取值为有限数值。
 * @param mode 统计模式
 * @param values 一维向量取值
 * @returns 聚合结果；空向量返回 undefined
 */
export function computeVectorStat(mode: VectorCalcMode, values: number[]): number | undefined {
    if (values.length === 0) return undefined
    switch (mode) {
        case "count":
            return values.length
        case "min":
            return Math.min(...values)
        case "max":
            return Math.max(...values)
        case "median": {
            const sorted = [...values].sort((a, b) => a - b)
            const middle = Math.floor(sorted.length / 2)
            return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
        }
        case "mean":
        case "variance":
        case "std": {
            const mean = values.reduce((sum, value) => sum + value, 0) / values.length
            if (mode === "mean") return mean
            const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
            return mode === "variance" ? variance : Math.sqrt(variance)
        }
        default:
            return values.reduce((sum, value) => sum + value, 0)
    }
}

/**
 * 收集种子及其全部下游并按拓扑序排列：上游在前，子图外的输入走缓存不约束顺序。
 * @param seedIds 变化起点
 * @param edges 全图边
 * @returns 拓扑序 id；环路兜底按发现顺序追加，保证一个不少
 */
export function sortDownstreamIds(seedIds: string[], edges: { source: string; target: string }[]): string[] {
    const affected = new Set<string>(seedIds)
    const queue = [...affected]
    while (queue.length > 0) {
        const current = queue.shift()!
        edges.forEach(edge => {
            if (edge.source !== current || affected.has(edge.target)) return
            affected.add(edge.target)
            queue.push(edge.target)
        })
    }
    const inDegree = new Map<string, number>()
    affected.forEach(id => inDegree.set(id, 0))
    edges.forEach(edge => {
        if (affected.has(edge.source) && affected.has(edge.target)) inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    })
    const ready = [...affected].filter(id => (inDegree.get(id) ?? 0) === 0)
    const ordered: string[] = []
    const pushed = new Set<string>()
    while (ready.length > 0) {
        const current = ready.shift()!
        ordered.push(current)
        pushed.add(current)
        edges.forEach(edge => {
            if (edge.source !== current || !affected.has(edge.target)) return
            const next = (inDegree.get(edge.target) ?? 1) - 1
            inDegree.set(edge.target, next)
            if (next === 0 && !pushed.has(edge.target)) ready.push(edge.target)
        })
    }
    affected.forEach(id => {
        if (!pushed.has(id)) ordered.push(id)
    })
    return ordered
}

/** 读取 BUFF 覆盖率，缺省视为满覆盖 */
function buffEntryCoverage(entry: [string, number, number?]) {
    return typeof entry[2] === "number" && Number.isFinite(entry[2]) ? entry[2] : 1
}

/** 按覆盖率写回 BUFF 条目：满覆盖时省略第三项 */
function createBuffEntry(name: string, level: number, coverage: number): [string, number, number?] {
    return coverage >= 1 ? [name, level] : [name, level, coverage]
}

/**
 * 合并两组 BUFF 条目：
 * 并集保留两边全部 BUFF，同名条目取等级更高的一份（等级相同取覆盖率更高的）；
 * 交集只保留两边共有的 BUFF，等级与覆盖率取较低值。
 * @param left 左侧 BUFF 条目
 * @param right 右侧 BUFF 条目
 * @param mode 合并模式
 * @returns 合并后的 BUFF 条目，顺序按左侧优先
 */
export function mergeBuffEntries(left: [string, number, number?][], right: [string, number, number?][], mode: BuffMergeMode) {
    if (mode === "intersect") {
        const rightByName = new Map(right.map(entry => [entry[0], entry]))
        const seen = new Set<string>()
        const result: [string, number, number?][] = []
        left.forEach(entry => {
            const other = rightByName.get(entry[0])
            if (!other || seen.has(entry[0])) return
            seen.add(entry[0])
            result.push(
                createBuffEntry(entry[0], Math.min(entry[1], other[1]), Math.min(buffEntryCoverage(entry), buffEntryCoverage(other)))
            )
        })
        return result
    }
    const merged = new Map<string, [string, number, number?]>()
    for (const entry of [...left, ...right]) {
        const current = merged.get(entry[0])
        const stronger =
            !current || entry[1] > current[1] || (entry[1] === current[1] && buffEntryCoverage(entry) > buffEntryCoverage(current))
        if (stronger) merged.set(entry[0], entry)
    }
    return [...merged.values()]
}

function addInput(inputs: NodeBuildInputs, node: BuildGraphNode) {
    switch (node.type) {
        case NodeType.CHAR_INPUT:
            if (inputs.charInput) inputs.duplicates.push("角色")
            else inputs.charInput = node
            break
        case NodeType.MELEE_WEAPON_INPUT:
            if (inputs.meleeWeapon) inputs.duplicates.push("近战武器")
            else inputs.meleeWeapon = node
            break
        case NodeType.RANGED_WEAPON_INPUT:
            if (inputs.rangedWeapon) inputs.duplicates.push("远程武器")
            else inputs.rangedWeapon = node
            break
        case NodeType.MOD_INPUT:
            inputs.modInputs.push(node)
            break
        case NodeType.BUFF_INPUT:
            inputs.buffInputs.push(node)
            break
        case NodeType.EFFECT_INPUT:
            if (inputs.effectInput) inputs.duplicates.push("特效")
            else inputs.effectInput = node
            break
        case NodeType.PET_INPUT:
            if (inputs.petInput) inputs.duplicates.push("魔灵")
            else inputs.petInput = node
            break
        case NodeType.ENEMY_INPUT:
            if (inputs.enemyInput) inputs.duplicates.push("敌人")
            else inputs.enemyInput = node
            break
        case NodeType.CUSTOM_VARS_INPUT:
            if (inputs.customVarsInput) inputs.duplicates.push("自定义变量组")
            else inputs.customVarsInput = node
            break
        case NodeType.DOT_INPUT:
            if (inputs.dotInput) inputs.duplicates.push("DOT")
            else inputs.dotInput = node
            break
    }
}

function createInputs(): NodeBuildInputs {
    return { modInputs: [], buffInputs: [], duplicates: [] }
}

/** BUFF 来源解析结果：BUFF 条目、自定义 BUFF 属性与队友配置 */
interface ResolvedBuffSource {
    buffs: [string, number, number?][]
    customBuff: [string, number][]
    team?: ReturnType<typeof readNodeTeamSettings>
}

/** 创建空的 BUFF 来源数据 */
function createEmptyBuffSource(): ResolvedBuffSource {
    return { buffs: [], customBuff: [] }
}

/**
 * 递归解析 BUFF 来源：合并节点按自身模式合并两路上游，其余节点直接读取节点数据。
 * @param node 来源节点
 * @param byId 节点索引
 * @param edges 全部边
 * @param visited 递归路径上的合并节点，用于防止环
 * @returns 解析后的 BUFF 数据
 */
function resolveBuffSourceFromNode(
    node: BuildGraphNode,
    byId: Map<string, BuildGraphNode>,
    edges: BuildGraphEdge[],
    visited: Set<string>
): ResolvedBuffSource {
    if (node.type !== NodeType.BUFF_MERGE) {
        return {
            buffs: readNodeBuffEntries(node.data),
            customBuff: readNodeCustomBuff(node.data),
            team: readNodeTeamSettings(node.data),
        }
    }
    if (visited.has(node.id)) return createEmptyBuffSource()
    visited.add(node.id)
    let left = createEmptyBuffSource()
    let right = createEmptyBuffSource()
    edges.forEach(edge => {
        if (edge.target !== node.id) return
        const source = byId.get(edge.source)
        if (!source) return
        if (edge.targetHandle === BUFF_MERGE_INPUT.left) left = resolveBuffSourceFromNode(source, byId, edges, visited)
        else if (edge.targetHandle === BUFF_MERGE_INPUT.right) right = resolveBuffSourceFromNode(source, byId, edges, visited)
    })
    visited.delete(node.id)
    return {
        buffs: mergeBuffEntries(left.buffs, right.buffs, readBuffMergeMode(node.data)),
        // 自定义 BUFF 属性与队友配置沿用多个 BUFF 节点接入核心时的口径：后一路优先，缺失时回退前一路
        customBuff: right.customBuff.length > 0 ? right.customBuff : left.customBuff,
        team: right.team ?? left.team,
    }
}

/**
 * 解析 BUFF 端口的来源节点：合并节点返回带合并结果的数据副本，其他节点原样返回。
 * 核心节点组装构筑时读取的是节点数据，因此合并结果必须在收集阶段解析，不能依赖求值顺序。
 * @param node 来源节点
 * @param nodes 全部节点
 * @param edges 全部边
 * @returns 可供构筑组装读取的节点
 */
export function resolveBuffSourceNode(node: BuildGraphNode, nodes: BuildGraphNode[], edges: BuildGraphEdge[]): BuildGraphNode {
    if (node.type !== NodeType.BUFF_MERGE) return node
    const resolved = resolveBuffSourceFromNode(node, new Map(nodes.map(item => [item.id, item])), edges, new Set())
    return {
        ...node,
        data: {
            label: node.data.label,
            buffs: resolved.buffs,
            customBuff: resolved.customBuff,
            ...(resolved.team ?? {}),
        },
    }
}

/** 核心节点端口 handle → 输入集合字段 */
const CORE_HANDLE_FIELDS: Record<string, keyof NodeBuildInputs> = {
    [CORE_INPUT.char]: "charInput",
    [CORE_INPUT.meleeWeapon]: "meleeWeapon",
    [CORE_INPUT.rangedWeapon]: "rangedWeapon",
    [CORE_INPUT.effect]: "effectInput",
    [CORE_INPUT.pet]: "petInput",
    [CORE_INPUT.enemy]: "enemyInput",
    [CORE_INPUT.customVariables]: "customVarsInput",
    [CORE_INPUT.dot]: "dotInput",
}

/**
 * 按核心节点的端口 handle 收集直接相连的输入节点。
 * 端口语义严格按连线字面解析：不扫描节点类型，也不从下游反向收集。
 * @param nodes 全部节点
 * @param edges 全部边
 * @param coreId 核心节点 id
 * @returns 输入节点集合
 */
export function collectCoreInputNodes(nodes: BuildGraphNode[], edges: BuildGraphEdge[], coreId: string): NodeBuildInputs {
    const byId = new Map(nodes.map(node => [node.id, node]))
    const inputs = createInputs()
    edges.forEach(edge => {
        if (edge.target !== coreId) return
        const source = byId.get(edge.source)
        if (!source) return
        const handle = edge.targetHandle ?? ""
        if (handle === CORE_INPUT.mod) {
            inputs.modInputs.push(source)
            return
        }
        if (handle === CORE_INPUT.buff) {
            // BUFF 合并节点在此展开为合并后的数据，核心节点仍按“一路 BUFF 输入”读取
            inputs.buffInputs.push(resolveBuffSourceNode(source, nodes, edges))
            return
        }
        const field = CORE_HANDLE_FIELDS[handle]
        if (!field) return
        const record = inputs as unknown as Record<string, BuildGraphNode | undefined>
        const current = record[field]
        if (current && current.id !== source.id) {
            inputs.duplicates.push(INPUT_TYPE_SET.has(source.type ?? "") ? (source.data.label ?? source.type!) : handle)
            return
        }
        record[field] = source
    })
    return inputs
}

/**
 * 收集整张图的输入节点（用于没有核心节点时给编辑器提供预览构筑）。
 * @param nodes 全部节点
 * @returns 输入节点集合
 */
export function collectAllInputs(nodes: BuildGraphNode[]): NodeBuildInputs {
    const inputs = createInputs()
    nodes.forEach(node => {
        if (INPUT_TYPE_SET.has(node.type ?? "")) addInput(inputs, node)
    })
    return inputs
}

/**
 * 读取节点数据中的自定义变量。
 * @param data 节点数据
 * @returns 自定义变量 `[名称, 表达式]`
 */
export function readNodeCustomVariables(data: Record<string, any>): [string, string][] {
    if (!Array.isArray(data.customVariables)) return []
    return data.customVariables
        .filter((item: unknown) => Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "string")
        .map((item: [string, string]) => [item[0], item[1]])
}

/**
 * 读取 BUFF 节点附带的助战 BUFF。
 * @param data BUFF 节点数据
 * @returns BUFF 条目
 */
export function readNodeTeamBuffs(data: Record<string, any>): [string, number][] {
    if (!Array.isArray(data.teamBuffs)) return []
    return data.teamBuffs
        .filter((item: unknown) => Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "number")
        .map((item: [string, number]) => [item[0], item[1]])
}

/**
 * 队友变化时同步助战 BUFF：移除旧来源独有的条目，追加新来源条目，同名条目保留现有等级。
 * 助战 BUFF 必须直接写进 `buffs`，与构筑页选择队友的行为一致；
 * 不再保留独立的 `teamBuffs` 覆盖层，否则会绕过标准构筑里手选的等级和条目。
 * @param buffs 当前 BUFF 列表
 * @param previousIds 变更前的队友角色 / 武器 id
 * @param nextIds 变更后的队友角色 / 武器 id
 * @returns 同步后的 BUFF 列表
 */
export function reconcileTeamBuffs(
    buffs: readonly [string, number, number?][],
    previousIds: readonly unknown[],
    nextIds: readonly unknown[]
): [string, number, number?][] {
    const previousNames = new Set(deriveTeamBuffs(previousIds).map(([name]) => name))
    const nextEntries = deriveTeamBuffs(nextIds)
    const nextNames = new Set(nextEntries.map(([name]) => name))
    const result = buffs
        .filter(([name]) => !previousNames.has(name) || nextNames.has(name))
        .map(buff => [...buff] as [string, number, number?])
    const existing = new Set(result.map(([name]) => name))
    nextEntries.forEach(([name, level]) => {
        if (existing.has(name)) return
        existing.add(name)
        result.push([name, level])
    })
    return result
}

/**
 * 旧图迁移：把独立存放的助战 BUFF 派生层并入普通 BUFF 列表。
 *
 * 旧版有两种写法：导入构筑时同时写入标准构筑的 `buffs` 与派生的 `teamBuffs`，
 * 后者会覆盖用户手选的等级并混入未选择的条目（求值偏高的根因）；
 * 由节点 UI 选择队友时则只写派生层、`buffs` 里没有对应条目。
 * 因此仅当 `buffs` 完全没有助战条目时才并入，否则以 `buffs` 为准直接丢弃派生层。
 * @param buffs 节点 BUFF 列表
 * @param teamBuffs 旧派生助战 BUFF
 * @returns 合并后的 BUFF 列表
 */
export function migrateLegacyTeamBuffs(
    buffs: readonly [string, number, number?][],
    teamBuffs: readonly [string, number][]
): [string, number, number?][] {
    const existing = new Set(buffs.map(([name]) => name))
    if (teamBuffs.some(([name]) => existing.has(name))) return buffs.map(buff => [...buff] as [string, number, number?])
    const result = buffs.map(buff => [...buff] as [string, number, number?])
    teamBuffs.forEach(([name, level]) => {
        if (existing.has(name)) return
        existing.add(name)
        result.push([name, level])
    })
    return result
}

/**
 * 根据队友角色 / 队友武器推导助战 BUFF（默认满级），与构筑页选择队友时的行为一致。
 * @param ids 队友角色与队友武器 id
 * @returns 助战 BUFF 条目
 */
export function deriveTeamBuffs(ids: readonly unknown[]): [string, number][] {
    const idSet = new Set(ids.filter((id): id is number => typeof id === "number" && id > 0))
    if (idSet.size === 0) return []
    const result: [string, number][] = []
    const seen = new Set<string>()
    buffData.forEach(buff => {
        if (typeof buff.id !== "number" || !idSet.has(buff.id) || isPetRelatedBuffName(buff.名称) || seen.has(buff.名称)) return
        const level = buff.mx || 1
        if (level <= 0) return
        seen.add(buff.名称)
        result.push([buff.名称, level])
    })
    return result
}

/**
 * 读取 DOT 频率节点设置。
 * @param data DOT 节点数据
 * @returns 归一化后的 DOT 频率设置
 */
export function readNodeDotSettings(data: Record<string, any>): DotFrequencySettings {
    const raw = data?.dotSettings ?? {}
    return {
        skill: toFiniteNumber(raw.skill, 0),
        melee: toFiniteNumber(raw.melee, 0),
        ranged: toFiniteNumber(raw.ranged, 0),
        skillweapon: toFiniteNumber(raw.skillweapon, 0),
        forceOwnAdditionalDamage: raw.forceOwnAdditionalDamage === true,
    }
}

/** 读取兼容旧格式的队友 id / 武器 id（数字或 "-"） */
function toTeamValue(value: unknown, fallback: number | "-"): number | "-" {
    if (value === "-") return "-"
    return toFiniteNumber(value, typeof fallback === "number" ? fallback : 0) || "-"
}

/** BUFF 节点上的队友配置字段 */
const TEAM_DATA_KEYS = [
    "team1",
    "team1Weapon",
    "team1Build",
    "team1BuildVariant",
    "team2",
    "team2Weapon",
    "team2Build",
    "team2BuildVariant",
] as const

/**
 * 读取 BUFF 节点携带的队友配置；节点没有队友字段时返回 undefined。
 * @param data BUFF 节点数据
 * @returns 队友配置
 */
function readNodeTeamSettings(data: Record<string, any>) {
    if (!TEAM_DATA_KEYS.some(key => data[key] !== undefined)) return undefined
    return {
        team1: toTeamValue(data.team1, "-"),
        team1Weapon: toTeamValue(data.team1Weapon, "-"),
        team1Build: typeof data.team1Build === "string" ? data.team1Build : "-",
        team1BuildVariant: normalizeModVariantLetter(data.team1BuildVariant),
        team2: toTeamValue(data.team2, "-"),
        team2Weapon: toTeamValue(data.team2Weapon, "-"),
        team2Build: typeof data.team2Build === "string" ? data.team2Build : "-",
        team2BuildVariant: normalizeModVariantLetter(data.team2BuildVariant),
    }
}

/**
 * 按节点图输入组装完整 CharSettings。
 * @param inputs 输入节点集合
 * @param coreData 核心节点数据（用于读取已选技能）
 * @param options 选项：`fallbackChar` 为 true 时无角色输入则使用第一个角色（预览构筑用）
 * @returns 角色 id、配置与缺失输入
 */
export function createSettingsFromNodeInputs(
    inputs: NodeBuildInputs,
    coreData: Record<string, any> = {},
    options: { fallbackChar?: boolean; baseBuild?: NodeBuildContext } = {}
): { charId: number; settings: CharSettings; missing: string[] } {
    const charNode = inputs.charInput
    // 角色节点只提供自身字段；其余输入全部由对应节点接线，不再读取隐藏的完整配置快照
    // 有构筑输入时以它的配置为基底，连线输入只覆盖对应项目
    const base = options.baseBuild ? clonePlain(options.baseBuild.settings) : createDefaultCharSettings()
    const data = charNode?.data ?? {}
    const missing: string[] = []

    base.charLevel = toFiniteNumber(data.charLevel, base.charLevel)
    base.hpPercent = toFiniteNumber(data.hpPercent, base.hpPercent)
    base.resonanceGain = toFiniteNumber(data.resonanceGain, base.resonanceGain)
    base.extraMastery = typeof data.extraMastery === "string" ? data.extraMastery : base.extraMastery
    base.charSkillLevel = normalizeCharSkillLevels(
        (data.charSkillLevel ?? data.skillLevel ?? base.charSkillLevel ?? CHAR_SKILL_LEVEL_DEFAULT) as CharSkillLevels | number
    )

    // 以下字段都有独立输入端口：未连线时必须为空，不能回退到角色节点携带的导入快照
    // 有构筑输入时保留构筑里的对应项目，只有连线输入才覆盖
    if (!options.baseBuild) {
        base.meleeWeapon = 0
        base.meleeWeaponLevel = 80
        base.meleeWeaponRefine = 5
        base.rangedWeapon = 0
        base.rangedWeaponLevel = 80
        base.rangedWeaponRefine = 5
        base.charMods = createEmptySlots(MOD_SLOT_COUNTS.角色)
        base.meleeMods = createEmptySlots(MOD_SLOT_COUNTS.近战)
        base.rangedMods = createEmptySlots(MOD_SLOT_COUNTS.远程)
        base.skillWeaponMods = createEmptySlots(MOD_SLOT_COUNTS.同律)
        base.auraMod = 0
        base.modVariants = []
        base.modVariantIndex = 0
        base.buffs = []
        base.customBuff = []
        base.team1 = "-"
        base.team1Weapon = "-"
        base.team1Build = "-"
        base.team1BuildVariant = "A"
        base.team2 = "-"
        base.team2Weapon = "-"
        base.team2Build = "-"
        base.team2BuildVariant = "A"
        base.useGlobal = false
        base.effectConfig = {}
        base.petId = 0
        base.petLevel = 3
        base.petCoverage = 1
        base.petAutoCoverage = true
        base.traits = normalizeTraitSlots([])
        base.customVariables = []
        base.targetFunction = ""
        base.dotSettings = { ...defaultDotFrequencySettings }
    }

    const charName = typeof data.charName === "string" ? data.charName : ""
    const explicitCharId = toFiniteNumber(data.charId, 0)
    const resolvedCharId = charIdFromNode(charName, explicitCharId)
    const charId = resolvedCharId > 0 ? resolvedCharId : options.fallbackChar ? (charData[0]?.id ?? 0) : (options.baseBuild?.charId ?? 0)
    if (charId <= 0) missing.push("角色")

    const melee = inputs.meleeWeapon?.data
    if (melee) {
        base.meleeWeapon = toFiniteNumber(melee.weapon ?? melee.meleeWeapon, base.meleeWeapon)
        base.meleeWeaponLevel = toFiniteNumber(melee.level ?? melee.weaponLevel, base.meleeWeaponLevel)
        base.meleeWeaponRefine = toFiniteNumber(melee.refine ?? melee.refineLevel, base.meleeWeaponRefine)
    }
    const ranged = inputs.rangedWeapon?.data
    if (ranged) {
        base.rangedWeapon = toFiniteNumber(ranged.weapon ?? ranged.rangedWeapon, base.rangedWeapon)
        base.rangedWeaponLevel = toFiniteNumber(ranged.level ?? ranged.weaponLevel, base.rangedWeaponLevel)
        base.rangedWeaponRefine = toFiniteNumber(ranged.refine ?? ranged.refineLevel, base.rangedWeaponRefine)
    }

    if (inputs.modInputs.length > 0) {
        const modSettings: NodeModSettings = {
            charMods: createEmptySlots(MOD_SLOT_COUNTS.角色),
            meleeMods: createEmptySlots(MOD_SLOT_COUNTS.近战),
            rangedMods: createEmptySlots(MOD_SLOT_COUNTS.远程),
            skillWeaponMods: createEmptySlots(MOD_SLOT_COUNTS.同律),
            auraMod: 0,
            modVariantIndex: 0,
            modVariants: [],
        }
        // 在副本上归一化：createSettings 可能在渲染期间被调用，不能改动节点响应式数据
        inputs.modInputs.forEach(node => mergeNodeModSettings(modSettings, ensureNodeModSettings(clonePlain(node.data))))
        base.charMods = modSettings.charMods
        base.meleeMods = modSettings.meleeMods
        base.rangedMods = modSettings.rangedMods
        base.skillWeaponMods = modSettings.skillWeaponMods
        base.auraMod = modSettings.auraMod
        base.modVariantIndex = modSettings.modVariantIndex
        base.modVariants = modSettings.modVariants
    }

    if (inputs.buffInputs.length > 0) {
        const buffs: [string, number, number?][] = []
        let customBuff: [string, number][] = []
        inputs.buffInputs.forEach(node => {
            buffs.push(...readNodeBuffEntries(node.data))
            const nodeCustomBuff = readNodeCustomBuff(node.data)
            if (nodeCustomBuff.length > 0) customBuff = nodeCustomBuff
            // 队友配置与 BUFF 同属一个节点，后连接的 BUFF 节点覆盖前面的队友配置
            const team = readNodeTeamSettings(node.data)
            if (team) {
                base.team1 = team.team1
                base.team1Weapon = team.team1Weapon
                base.team1Build = team.team1Build
                base.team1BuildVariant = team.team1BuildVariant
                base.team2 = team.team2
                base.team2Weapon = team.team2Weapon
                base.team2Build = team.team2Build
                base.team2BuildVariant = team.team2BuildVariant
            }
        })
        // 助战 BUFF 已由节点在队友变化时写入 buffs；旧图的 teamBuffs 派生字段不再作为隐藏覆盖层参与求值
        base.buffs = buffs
        base.customBuff = customBuff
    }

    const effect = inputs.effectInput?.data
    if (effect) {
        base.useGlobal = typeof effect.useGlobal === "boolean" ? effect.useGlobal : base.useGlobal
        base.effectConfig =
            effect.effectConfig && typeof effect.effectConfig === "object"
                ? (clonePlain(effect.effectConfig) as Record<string, number>)
                : {}
    }

    const pet = inputs.petInput?.data
    if (pet) {
        base.petId = toFiniteNumber(pet.petId, base.petId)
        base.petLevel = toFiniteNumber(pet.petLevel, base.petLevel)
        base.petCoverage = toFiniteNumber(pet.petCoverage, base.petCoverage)
        base.petAutoCoverage = typeof pet.petAutoCoverage === "boolean" ? pet.petAutoCoverage : base.petAutoCoverage
        base.traits = normalizeTraitSlots(pet.traits)
    }

    const enemy = inputs.enemyInput?.data
    if (enemy) {
        base.enemyId = toFiniteNumber(enemy.enemyId, base.enemyId)
        base.enemyLevel = toFiniteNumber(enemy.enemyLevel, base.enemyLevel)
        base.enemyResistance = toFiniteNumber(enemy.enemyResistance, base.enemyResistance)
        base.imbalance = typeof enemy.imbalance === "boolean" ? enemy.imbalance : base.imbalance
    }

    const dot = inputs.dotInput?.data
    if (dot) base.dotSettings = readNodeDotSettings(dot)

    if (inputs.customVarsInput) base.customVariables = readNodeCustomVariables(inputs.customVarsInput.data)
    if (typeof coreData.selectedSkill === "string" && coreData.selectedSkill.trim() !== "") {
        base.baseName = coreData.selectedSkill
    } else if (!options.baseBuild) {
        base.baseName = ""
    }

    if (inputs.duplicates.length > 0) {
        missing.push(`重复输入: ${[...new Set(inputs.duplicates)].join("、")}`)
    }
    return { charId, settings: base, missing }
}

function charIdFromNode(charName: string, explicitId: number): number {
    if (charName) {
        const char = charMap.get(charName)
        if (char) return char.id
    }
    return explicitId
}

/**
 * 从节点图输入创建构筑上下文（含 CharBuild 实例，供 MOD/BUFF 编辑器与表达式校验使用）。
 * @param inputs 输入节点集合
 * @param coreData 核心节点数据
 * @param options 选项
 * @returns 构筑上下文；角色无效时返回缺失信息
 */
export function createBuildContextFromInputs(
    inputs: NodeBuildInputs,
    coreData: Record<string, any> = {},
    options: { fallbackChar?: boolean; baseBuild?: NodeBuildContext } = {}
): { context?: NodeBuildContext; missing: string[]; error?: string } {
    const { charId, settings, missing } = createSettingsFromNodeInputs(inputs, coreData, options)
    if (charId <= 0) {
        return { missing }
    }
    try {
        const charBuild = createCharBuildFromSettings(charId, settings)
        return { context: { charId, settings, charBuild, missing }, missing }
    } catch (error) {
        console.error("节点图构筑创建失败", error)
        return { missing, error: error instanceof Error ? error.message : String(error) }
    }
}

/** 向量输入节点携带的变量覆盖 */
export interface VariableVectorInput {
    id: string
    variable: string
    values: number[]
    label: string
}

/** 构筑向量的一个维度 */
export interface BuildVectorDimension {
    /** 维度名称（变量名 / MOD / BUFF） */
    label: string
    /** 每个元素的展示标签 */
    values: string[]
}

/** 构筑向量：多维组合展开后的构筑与组合标签 */
export interface BuildVector {
    dimensions: BuildVectorDimension[]
    /** 每个构筑对应的组合标签（与 contexts 顺序一致） */
    labels: string[]
    contexts: NodeBuildContext[]
}

/** 核心节点一次组装的构筑集合 */
export interface CoreBuildSet {
    contexts: NodeBuildContext[]
    vector?: BuildVector
    missing: string[]
    error?: string
}

/** 单次核心组装的组合上限，避免向量维度爆炸 */
export const MAX_BUILD_COMBINATIONS = 64

/** 带标题的向量：目标函数节点的向量输出，也是图表节点的输入 */
export interface LabeledVector {
    /** 图表标题 */
    title: string
    /** 每个数据点的分类标签 */
    labels: string[]
    values: number[]
    /** 数值含义（如「数值」「期望伤害」） */
    valueLabel?: string
}

/**
 * 按顺序配对标签与有限数值，跳过无效值并保持标签对齐。
 * @param rawValues 原始数值列表
 * @param rawLabels 原始标签列表
 * @returns 对齐后的标签与数值
 */
function pickVectorEntries(rawValues: unknown, rawLabels: unknown) {
    const valueList = Array.isArray(rawValues) ? rawValues : []
    const labelList = Array.isArray(rawLabels) ? rawLabels : []
    const labels: string[] = []
    const values: number[] = []
    valueList.forEach((value, index) => {
        if (typeof value !== "number" || !Number.isFinite(value)) return
        const label = labelList[index]
        labels.push(typeof label === "string" && label.trim() ? label.trim() : String(index + 1))
        values.push(value)
    })
    return { labels, values }
}

/**
 * 归一化向量输入：兼容目标函数的带标题向量、向量输入节点的原始数值列表与纯数值数组；
 * 单个数值（含 `{ value }` 结果）按单元素向量处理。
 * @param value 上游输出
 * @param fallbackTitle 没有标题时的回退名称
 * @returns 图表向量；没有有效数值时返回 undefined
 */
export function normalizeLabeledVector(value: unknown, fallbackTitle = "向量"): LabeledVector | undefined {
    const source = Array.isArray(value)
        ? { values: value }
        : value && typeof value === "object"
          ? (value as Record<string, any>)
          : undefined
    if (typeof value === "number") {
        return Number.isFinite(value) ? { title: fallbackTitle, labels: [fallbackTitle], values: [value] } : undefined
    }
    if (!source) return undefined
    if (!Array.isArray(source.values)) {
        const scalar = source.value
        return typeof scalar === "number" && Number.isFinite(scalar)
            ? { title: fallbackTitle, labels: [fallbackTitle], values: [scalar] }
            : undefined
    }
    const { labels, values } = pickVectorEntries(source.values, source.labels)
    if (values.length === 0) return undefined
    const rawTitle = typeof source.title === "string" ? source.title.trim() : ""
    const rawLabel = typeof source.label === "string" ? source.label.trim() : ""
    const valueLabel = typeof source.valueLabel === "string" && source.valueLabel.trim() ? source.valueLabel.trim() : undefined
    return {
        title: rawTitle || rawLabel || fallbackTitle,
        labels,
        values,
        ...(valueLabel ? { valueLabel } : {}),
    }
}

/**
 * 读取数值输出端口的单个值：支持数值输入节点、数学节点与逐项属性输出。
 * @param node 来源节点
 * @param handleId 输出端口 id
 * @returns 数值；无法解析时返回 undefined
 */
function readNodeNumberValue(node: BuildGraphNode, handleId?: string | null): number | undefined {
    const data = node.data ?? {}
    if (node.type === NodeType.NUMBER_INPUT && typeof data.value === "number") return data.value
    const result = data.result
    if (typeof result === "number") return result
    if (result && typeof result === "object") {
        if (handleId && typeof result[handleId] === "number") return result[handleId]
        if (typeof result.value === "number") return result.value
        if (typeof result.expectedDamage === "number") return result.expectedDamage
    }
    const vectors = data.attributeVectorValues
    if (handleId && vectors && Array.isArray(vectors[handleId]) && vectors[handleId].length === 1) return vectors[handleId][0]
    if (typeof data.value === "number") return data.value
    return undefined
}

/**
 * 读取输出端口的向量取值：向量输出归一为有限数值数组，数值输出包装为单元素数组。
 * @param node 来源节点
 * @param handleId 输出端口 id
 * @returns 数值列表；没有有效值时返回空数组
 */
export function readNodeVectorValues(node: BuildGraphNode, handleId?: string | null): number[] {
    const data = node.data ?? {}
    const port = resolvePort(node.type ?? "", handleId, "output", data)
    if (port?.type === PortType.NUMBER) {
        const value = readNodeNumberValue(node, handleId)
        return value === undefined ? [] : [value]
    }
    const vectors = data.attributeVectorValues
    if (handleId && vectors && Array.isArray(vectors[handleId])) {
        return vectors[handleId].filter((value: unknown): value is number => typeof value === "number" && Number.isFinite(value))
    }
    const candidates = [handleId ? data.result?.[handleId] : undefined, data.vectorResult, data.result?.vector, data.result, data]
    for (const candidate of candidates) {
        const normalized = normalizeLabeledVector(candidate)
        if (normalized) return normalized.values
    }
    return []
}

/**
 * 读取目标函数节点的带标题向量输出：优先使用向量求值结果，标量结果包装为单元素向量。
 * @param data 目标函数节点数据
 * @returns 带标题向量；还没有结果时返回 undefined
 */
export function createExpressionVectorOutput(data: Record<string, any>): LabeledVector | undefined {
    const title = typeof data.label === "string" && data.label.trim() ? data.label.trim() : "目标函数"
    const vector = data.vectorResult
    if (vector && typeof vector === "object") {
        const { labels, values } = pickVectorEntries(vector.values, vector.labels)
        if (values.length > 0) {
            const valueLabel = typeof vector.valueLabel === "string" && vector.valueLabel.trim() ? vector.valueLabel.trim() : undefined
            return { title, labels, values, ...(valueLabel ? { valueLabel } : {}) }
        }
    }
    const value = data.result?.value
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined
    return { title, labels: [title], values: [value], valueLabel: "数值" }
}

/**
 * 向量分解输出：按下标把向量各分量展开为独立数值，端口 id 与下标一一对应。
 * @param value 上游输出（带标题向量 / 纯数值数组 / 向量输入节点数据）
 * @param fallbackTitle 没有标题时的回退名称
 * @returns 标签、数值与端口输出；没有有效数值时返回 undefined
 */
export function createVectorDecomposeOutput(value: unknown, fallbackTitle = "向量") {
    const vector = normalizeLabeledVector(value, fallbackTitle)
    if (!vector) return undefined
    const outputs: Record<string, number> = {}
    vector.values.forEach((item, index) => {
        outputs[vectorDecomposePortId(index)] = item
    })
    return { labels: vector.labels, values: vector.values, outputs }
}

/**
 * 生成多输入向量的展示标签：同名节点追加序号，避免组合行无法区分。
 * @param nodes 输入节点
 * @param fallbackPrefix 节点没有名称时的前缀
 * @returns 与节点顺序一致的标签
 */
function createUniqueInputLabels(nodes: BuildGraphNode[], fallbackPrefix: string): string[] {
    const seen = new Map<string, number>()
    return nodes.map((node, index) => {
        const raw = typeof node.data.label === "string" ? node.data.label.trim() : ""
        const base = raw || `${fallbackPrefix}${index + 1}`
        const count = (seen.get(base) ?? 0) + 1
        seen.set(base, count)
        return count === 1 ? base : `${base} #${count}`
    })
}

/**
 * 读取连接到自定义变量组的向量输入。每个变量行有独立端口，
 * 覆盖只作用于该行对应的变量；旧图的共享 `vectors` 端口按向量节点记录的变量名兼容。
 * @param nodes 全部节点
 * @param edges 全部边
 * @param customVarsNodeId 自定义变量组节点 id
 * @returns 向量输入列表
 */
export function collectVariableVectors(nodes: BuildGraphNode[], edges: BuildGraphEdge[], customVarsNodeId?: string): VariableVectorInput[] {
    if (!customVarsNodeId) return []
    const byId = new Map(nodes.map(node => [node.id, node]))
    const varsNode = byId.get(customVarsNodeId)
    if (!varsNode) return []
    const names = readNodeCustomVariables(varsNode.data).map(([name]) => name)
    const result = new Map<string, VariableVectorInput>()
    edges.forEach(edge => {
        if (edge.target !== customVarsNodeId) return
        const source = byId.get(edge.source)
        if (!source) return
        const sourcePort = resolvePort(source.type ?? "", edge.sourceHandle, "output", source.data)
        if (!sourcePort || (sourcePort.type !== PortType.VECTOR && sourcePort.type !== PortType.NUMBER)) return
        let index = parseCustomVariableVectorPortId(edge.targetHandle)
        const legacyHandle = !edge.targetHandle || edge.targetHandle === "vectors"
        if (index === undefined && legacyHandle) {
            const legacyVariable = typeof source.data.variable === "string" ? source.data.variable.trim() : ""
            index = names.findIndex(name => name.trim() === legacyVariable)
        }
        if (index === undefined || index < 0 || index >= names.length) return
        const variable = names[index]
        if (!variable.trim()) return
        const values = readNodeVectorValues(source, edge.sourceHandle)
        if (!variable || values.length === 0) return
        result.set(variable, {
            id: source.id,
            variable,
            values,
            label: typeof source.data.label === "string" && source.data.label.trim() ? source.data.label : "向量",
        })
    })
    return [...result.values()]
}

/** 输入节点数值参数上的连线输入 */
export interface NumericParamVectorInput {
    /** 参数所属输入节点 id */
    nodeId: string
    /** 参数端口 id */
    paramId: string
    /** 参数名称，用于组合标签 */
    paramLabel: string
    /** 维度名称：输入节点标题 + 参数名 */
    label: string
    values: number[]
}

/**
 * 收集角色 / 武器输入节点数值参数上的连线取值。
 * 只有这些输入节点被核心使用时才参与构筑展开。
 * @param nodes 全部节点
 * @param edges 全部边
 * @param inputs 核心节点的输入节点集合
 * @returns 参数向量输入列表
 */
export function collectNumericParamVectors(
    nodes: BuildGraphNode[],
    edges: BuildGraphEdge[],
    inputs: NodeBuildInputs
): NumericParamVectorInput[] {
    const byId = new Map(nodes.map(node => [node.id, node]))
    const owners = [inputs.charInput, inputs.meleeWeapon, inputs.rangedWeapon].filter((node): node is BuildGraphNode => Boolean(node))
    const result: NumericParamVectorInput[] = []
    owners.forEach(owner => {
        const params = NUMERIC_PARAM_PORTS[owner.type as NodeType] ?? []
        params.forEach(param => {
            const edge = edges.find(item => item.target === owner.id && item.targetHandle === param.id)
            if (!edge) return
            const source = byId.get(edge.source)
            if (!source) return
            const values = readNodeVectorValues(source, edge.sourceHandle).map(value => normalizeNumericParamValue(param.id, value))
            if (values.length === 0) return
            const ownerLabel = typeof owner.data.label === "string" ? owner.data.label.trim() : ""
            result.push({
                nodeId: owner.id,
                paramId: param.id,
                paramLabel: param.label,
                label: ownerLabel ? `${ownerLabel}·${param.label}` : param.label,
                values,
            })
        })
    })
    return result
}

/** 核心节点的构筑输入：上游构筑向量与合并模式 */
export interface CoreIncomingBuild {
    contexts: NodeBuildContext[]
    dimensions: BuildVectorDimension[]
    labels: string[]
    /** override 用连线输入覆盖构筑的对应项目；append 同时产出原构筑与叠加后的构筑 */
    mode: "override" | "append"
}

/** 本地输入产生的一个向量维度 */
interface LocalDimension {
    label: string
    values: string[]
    kind: "variable" | "mod" | "buff" | "param"
    vector?: VariableVectorInput
    param?: NumericParamVectorInput
}

/**
 * 收集本地输入产生的向量维度：变量向量、数值参数、多个 MOD / BUFF 输入。
 * @param inputs 核心节点输入集合
 * @param variableVectors 自定义变量向量
 * @param paramVectors 输入节点数值参数向量
 * @param variableNames 生效配置里的变量名；只有其中存在的变量才参与向量
 * @returns 向量维度定义
 */
function createLocalDimensions(
    inputs: NodeBuildInputs,
    variableVectors: VariableVectorInput[],
    paramVectors: NumericParamVectorInput[],
    variableNames: string[]
): LocalDimension[] {
    const names = new Set(variableNames)
    const definitions: LocalDimension[] = []
    variableVectors.forEach(vector => {
        if (!names.has(vector.variable) || vector.values.length === 0) return
        definitions.push({
            label: vector.variable,
            kind: "variable",
            values: vector.values.map(value => `${vector.variable}=${value}`),
            vector,
        })
    })
    paramVectors.forEach(param => {
        if (param.values.length === 0) return
        definitions.push({
            label: param.label,
            kind: "param",
            values: param.values.map(value => `${param.paramLabel}=${value}`),
            param,
        })
    })
    if (inputs.modInputs.length > 1) {
        definitions.push({ label: "MOD", kind: "mod", values: createUniqueInputLabels(inputs.modInputs, "MOD") })
    }
    if (inputs.buffInputs.length > 1) {
        definitions.push({ label: "BUFF", kind: "buff", values: createUniqueInputLabels(inputs.buffInputs, "BUFF") })
    }
    return definitions
}

/**
 * 生成各维度的取值组合（笛卡尔积）。
 * @param sizes 各维度取值数量
 * @returns 组合列表
 */
function createCombos(sizes: number[]): number[][] {
    const combos: number[][] = []
    const collect = (index: number, current: number[]) => {
        if (index === sizes.length) {
            combos.push([...current])
            return
        }
        for (let value = 0; value < sizes[index]; value++) {
            current.push(value)
            collect(index + 1, current)
            current.pop()
        }
    }
    collect(0, [])
    return combos
}

/** 是否连了任何输入节点（构筑输入之外） */
function hasWiredInputs(inputs: NodeBuildInputs): boolean {
    return Boolean(
        inputs.charInput ||
            inputs.meleeWeapon ||
            inputs.rangedWeapon ||
            inputs.effectInput ||
            inputs.petInput ||
            inputs.enemyInput ||
            inputs.customVarsInput ||
            inputs.dotInput ||
            inputs.modInputs.length > 0 ||
            inputs.buffInputs.length > 0
    )
}

/**
 * 收敛参数取值：越界值按端口范围取整，保证向量标签与实际取值一致。
 * @param paramId 参数端口 id
 * @param value 原始取值
 * @returns 实际写入构筑的取值
 */
export function normalizeNumericParamValue(paramId: string, value: number): number {
    switch (paramId) {
        case "charLevel":
            return Math.max(1, Math.min(80, Math.round(value)))
        case "skillE":
        case "skillQ":
        case "skillPassive":
            return Math.max(CHAR_SKILL_LEVEL_MIN, Math.min(CHAR_SKILL_LEVEL_MAX, Math.round(value)))
        case "level":
            return Math.max(1, Math.min(90, Math.round(value)))
        case "refine":
            return Math.max(0, Math.min(5, Math.round(value)))
        default:
            return value
    }
}

/**
 * 把参数向量取值写入输入节点数据副本。
 * @param data 节点数据副本
 * @param paramId 参数端口 id
 * @param value 取值
 */
function applyNumericParamValue(data: Record<string, any>, paramId: string, value: number) {
    const normalized = normalizeNumericParamValue(paramId, value)
    switch (paramId) {
        case "charLevel":
            data.charLevel = normalized
            break
        case "skillE":
        case "skillQ":
        case "skillPassive": {
            const levels = normalizeCharSkillLevels(
                (data.charSkillLevel ?? data.skillLevel ?? CHAR_SKILL_LEVEL_DEFAULT) as CharSkillLevels | number
            )
            const index = paramId === "skillE" ? 0 : paramId === "skillQ" ? 1 : 2
            levels[index] = normalized
            data.charSkillLevel = [...levels]
            break
        }
        case "level":
            data.level = normalized
            break
        case "refine":
            data.refine = normalized
            break
    }
}

/**
 * 按参数维度替换输入节点的数据副本，避免改写原节点。
 * @param inputs 本次组合的输入集合（原地替换）
 * @param definitions 维度定义
 * @param combo 本次组合的维度取值下标
 */
function applyParamDimensions(inputs: NodeBuildInputs, definitions: LocalDimension[], combo: number[]) {
    const patched = new Map<string, Record<string, any>>()
    definitions.forEach((definition, dimension) => {
        if (definition.kind !== "param" || !definition.param) return
        const value = definition.param.values[combo[dimension]]
        if (typeof value !== "number" || !Number.isFinite(value)) return
        const owner = [inputs.charInput, inputs.meleeWeapon, inputs.rangedWeapon].find(node => node?.id === definition.param!.nodeId)
        if (!owner) return
        const data = patched.get(owner.id) ?? { ...owner.data }
        applyNumericParamValue(data, definition.param.paramId, value)
        patched.set(owner.id, data)
    })
    if (patched.size === 0) return
    const replace = (node?: BuildGraphNode) => {
        if (!node) return node
        const data = patched.get(node.id)
        return data ? { ...node, data } : node
    }
    inputs.charInput = replace(inputs.charInput)
    inputs.meleeWeapon = replace(inputs.meleeWeapon)
    inputs.rangedWeapon = replace(inputs.rangedWeapon)
}

/**
 * 按一组维度取值组装构筑上下文；baseBuild 存在时在它的配置上覆盖连线输入对应项目。
 * @returns 构筑上下文、组合标签与缺失信息
 */
function createContextForCombo(
    inputs: NodeBuildInputs,
    coreData: Record<string, any>,
    definitions: LocalDimension[],
    combo: number[],
    baseBuild?: NodeBuildContext
): { context?: NodeBuildContext; label: string; missing: string[]; error?: string } {
    const modDimension = definitions.findIndex(definition => definition.kind === "mod")
    const buffDimension = definitions.findIndex(definition => definition.kind === "buff")
    const comboInputs: NodeBuildInputs = {
        ...inputs,
        modInputs: modDimension >= 0 ? [inputs.modInputs[combo[modDimension]]] : inputs.modInputs,
        buffInputs: buffDimension >= 0 ? [inputs.buffInputs[combo[buffDimension]]] : inputs.buffInputs,
    }
    applyParamDimensions(comboInputs, definitions, combo)
    const label = combo.map((value, dimension) => definitions[dimension].values[value]).join("+")
    const { charId, settings, missing } = createSettingsFromNodeInputs(comboInputs, coreData, { baseBuild })
    if (charId <= 0) return { label, missing }
    definitions.forEach((definition, dimension) => {
        if (definition.kind !== "variable" || !definition.vector) return
        const value = definition.vector.values[combo[dimension]]
        const position = settings.customVariables.findIndex(([variable]) => variable === definition.vector!.variable)
        if (position >= 0) settings.customVariables[position] = [definition.vector.variable, String(value)]
    })
    try {
        const charBuild = createCharBuildFromSettings(charId, settings)
        return { context: { charId, settings, charBuild, missing }, label, missing }
    } catch (error) {
        return { label, missing, error: error instanceof Error ? error.message : String(error) }
    }
}

/**
 * 有构筑输入时的组装：覆盖模式把连线输入叠在输入构筑上；
 * 追加模式额外保留原构筑，产出「原构筑 + 叠加后」的向量。
 * @returns 构筑集合与组合标签
 */
function createContextsWithIncomingBuild(
    inputs: NodeBuildInputs,
    variableVectors: VariableVectorInput[],
    paramVectors: NumericParamVectorInput[],
    coreData: Record<string, any>,
    incoming: CoreIncomingBuild
): CoreBuildSet {
    const baseContexts = incoming.contexts
    // 连线了自定义变量组时用它替换构筑里的变量，向量维度按替换后的变量名过滤
    const variableNames = inputs.customVarsInput
        ? readNodeCustomVariables(inputs.customVarsInput.data).map(([name]) => name)
        : baseContexts[0].settings.customVariables.map(([name]) => name)
    const definitions = createLocalDimensions(inputs, variableVectors, paramVectors, variableNames)
    const combos = createCombos(definitions.map(definition => definition.values.length))
    const keepOriginal = incoming.mode === "append" && hasWiredInputs(inputs)
    const total = baseContexts.length * combos.length + (keepOriginal ? baseContexts.length : 0)
    if (total > MAX_BUILD_COMBINATIONS) {
        return { contexts: [], missing: [`输入组合过多（${total}），最多支持 ${MAX_BUILD_COMBINATIONS} 组`] }
    }
    const overlayContexts: NodeBuildContext[] = []
    const overlayLabels: string[] = []
    let missing: string[] = []
    for (const [index, baseContext] of baseContexts.entries()) {
        const baseLabel = baseContexts.length > 1 ? incoming.labels[index]?.trim() || `构筑${index + 1}` : ""
        for (const combo of combos) {
            const result = createContextForCombo(inputs, coreData, definitions, combo, baseContext)
            if (result.error) return { contexts: [], missing: [], error: result.error }
            if (!result.context) return { contexts: [], missing: result.missing }
            overlayContexts.push(result.context)
            overlayLabels.push([baseLabel, result.label].filter(item => item !== "").join("+"))
            if (missing.length === 0 && result.missing.length > 0) missing = result.missing
        }
    }
    if (keepOriginal) {
        const labels = [
            ...baseContexts.map(
                (_, index) => incoming.labels[index]?.trim() || (baseContexts.length > 1 ? `原构筑${index + 1}` : "原构筑")
            ),
            ...overlayLabels.map(label => label || "叠加输入"),
        ]
        const contexts = [...baseContexts, ...overlayContexts]
        return { contexts, missing, vector: { dimensions: [{ label: "组合", values: labels }], labels, contexts } }
    }
    const dimensions = [...incoming.dimensions, ...definitions.map(({ label, values }) => ({ label, values }))]
    if (dimensions.length === 0 && overlayContexts.length === 1) return { contexts: overlayContexts, missing }
    return {
        contexts: overlayContexts,
        missing,
        vector: { dimensions, labels: overlayLabels, contexts: overlayContexts },
    }
}

/**
 * 根据节点输入与向量输入组装构筑集合。
 * 每个自定义变量向量、数值参数向量产生一维；多个 MOD / BUFF 输入也各自产生一维，按笛卡尔积展开为构筑向量。
 * 有构筑输入时以输入构筑为基底，按模式覆盖或追加。
 * @param inputs 核心节点输入集合
 * @param variableVectors 自定义变量向量
 * @param coreData 核心节点数据
 * @param incoming 上游构筑输入与合并模式
 * @param paramVectors 输入节点数值参数向量
 * @returns 构筑集合与组合标签
 */
export function createBuildContextsFromInputs(
    inputs: NodeBuildInputs,
    variableVectors: VariableVectorInput[] = [],
    coreData: Record<string, any> = {},
    incoming?: CoreIncomingBuild,
    paramVectors: NumericParamVectorInput[] = []
): CoreBuildSet {
    if (incoming && incoming.contexts.length > 0) {
        return createContextsWithIncomingBuild(inputs, variableVectors, paramVectors, coreData, incoming)
    }
    const base = createSettingsFromNodeInputs(inputs, coreData)
    if (base.charId <= 0) return { contexts: [], missing: base.missing }
    const definitions = createLocalDimensions(
        inputs,
        variableVectors,
        paramVectors,
        base.settings.customVariables.map(([name]) => name)
    )
    const combos = createCombos(definitions.map(definition => definition.values.length))
    if (combos.length > MAX_BUILD_COMBINATIONS) {
        return { contexts: [], missing: [`输入组合过多（${combos.length}），最多支持 ${MAX_BUILD_COMBINATIONS} 组`] }
    }
    const contexts: NodeBuildContext[] = []
    const labels: string[] = []
    for (const combo of combos) {
        const result = createContextForCombo(inputs, coreData, definitions, combo)
        if (result.error) return { contexts: [], missing: [], error: result.error }
        if (!result.context) return { contexts: [], missing: result.missing }
        contexts.push(result.context)
        labels.push(result.label)
    }
    if (definitions.length === 0) return { contexts, missing: base.missing }
    return {
        contexts,
        missing: base.missing,
        vector: {
            dimensions: definitions.map(definition => ({ label: definition.label, values: definition.values })),
            labels,
            contexts,
        },
    }
}

/**
 * 从标准 charSettings JSON 文本创建构筑上下文。
 * 角色必须由角色端口提供，不再从 JSON 读取 charId。
 * @param text 标准 charSettings 文本
 * @param char 角色端口提供的角色（名称 / id）
 * @returns 构筑上下文或错误
 */
export function createBuildContextFromJSONText(
    text: string,
    char: { charName?: string; charId?: number } = {}
): { context?: NodeBuildContext; error?: string } {
    const trimmed = text.trim()
    if (!trimmed) return {}
    const portCharId = charIdFromNode(typeof char.charName === "string" ? char.charName : "", toFiniteNumber(char.charId, 0))
    if (!(portCharId > 0)) return { error: "缺少角色：请连接角色输入" }
    try {
        const parsed = JSON.parse(trimmed)
        let rawSettings = parsed?.charSettings ?? parsed?.settings ?? parsed
        if (typeof rawSettings === "string") rawSettings = JSON.parse(rawSettings)
        return createBuildContextFromSettings(portCharId, rawSettings)
    } catch (error) {
        return { error: `JSON 解析失败: ${error instanceof Error ? error.message : String(error)}` }
    }
}

/**
 * 从角色 id 与配置对象创建构筑上下文。
 * @param charId 角色 id
 * @param rawSettings 构筑配置
 * @returns 构筑上下文或错误
 */
export function createBuildContextFromSettings(charId: number, rawSettings: unknown): { context?: NodeBuildContext; error?: string } {
    if (!Number.isFinite(charId) || charId <= 0) return { error: "缺少角色 id（charId）" }
    if (!rawSettings || typeof rawSettings !== "object") return { error: "缺少构筑配置（charSettings）" }
    try {
        const settings = normalizeCharSettings(clonePlain(rawSettings) as Partial<CharSettings>)
        const charBuild = createCharBuildFromSettings(charId, settings)
        return { context: { charId, settings, charBuild, missing: [] } }
    } catch (error) {
        return { error: `构筑创建失败: ${error instanceof Error ? error.message : String(error)}` }
    }
}

/**
 * 将构筑上下文序列化为标准 charSettings 文本（不带 charId，角色由角色端口提供）。
 * @param context 构筑上下文
 * @returns JSON 文本
 */
export function serializeBuildContext(context: NodeBuildContext): string {
    return serializeCharSettings(context.settings)
}

/**
 * 生成指定目标函数/自定义变量下的配置副本（不修改原配置）。
 * @param settings 基础配置
 * @param targetFunction 目标函数覆盖
 * @param customVariables 额外的自定义变量
 * @returns 配置副本
 */
export function withExpressionSettings(
    settings: CharSettings,
    targetFunction: string | undefined,
    customVariables?: [string, string][]
): CharSettings {
    if (targetFunction === undefined && (!customVariables || customVariables.length === 0)) return settings
    const mergedVariables =
        customVariables && customVariables.length > 0
            ? ([...new Map([...settings.customVariables, ...customVariables]).entries()] as [string, string][])
            : settings.customVariables
    return {
        ...settings,
        targetFunction: targetFunction ?? settings.targetFunction,
        customVariables: mergedVariables,
    }
}
