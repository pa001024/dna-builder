import { describe, expect, it } from "vitest"
import { createDefaultCharSettings } from "@/composables/useCharSettings"
import { modData } from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { NodeType } from "@/store/nodeEditorTypes"
import {
    type BuildGraphNode,
    collectCoreInputNodes,
    collectVariableVectors,
    createBuildContextFromInputs,
    createBuildContextFromJSONText,
    createBuildContextsFromInputs,
    createSettingsFromNodeInputs,
    deriveTeamBuffs,
    ensureNodeModSettings,
    migrateLegacyTeamBuffs,
    type NodeBuildInputs,
    reconcileTeamBuffs,
    withExpressionSettings,
} from "@/utils/nodeEditorBuild"
import { CORE_INPUT } from "@/utils/nodeEditorPorts"

const CHAR_ID = 3104

/**
 * 构造节点图输入：角色节点携带角色级配置，自定义变量由独立输入端口提供。
 * @returns 节点图输入与原始配置
 */
function createInputs() {
    const settings = {
        ...createDefaultCharSettings(),
        baseName: "潜入夜色",
    }
    const charNode: BuildGraphNode = {
        id: "char",
        type: NodeType.CHAR_INPUT,
        data: { charId: CHAR_ID, charName: "法露茜", charLevel: 80 },
    }
    const customVarsNode: BuildGraphNode = {
        id: "vars",
        type: NodeType.CUSTOM_VARS_INPUT,
        data: {
            customVariables: [
                ["倍率", "2"],
                ["额外", "3"],
            ],
        },
    }
    const inputs: NodeBuildInputs = {
        charInput: charNode,
        modInputs: [],
        buffInputs: [],
        customVarsInput: customVarsNode,
        duplicates: [],
    }
    return { inputs, settings }
}

describe("nodeEditorBuild", () => {
    it("自定义变量组作为输入参与构筑，目标函数不在核心上求值", () => {
        const { inputs } = createInputs()
        const { charId, settings } = createSettingsFromNodeInputs(inputs)

        expect(charId).toBe(CHAR_ID)
        expect(settings.targetFunction).toBe("")
        expect(settings.customVariables).toEqual([
            ["倍率", "2"],
            ["额外", "3"],
        ])
    })

    it("未连接自定义变量组时不会回退到角色节点旧快照", () => {
        const { inputs } = createInputs()
        inputs.charInput!.data.settings = {
            ...createDefaultCharSettings(),
            targetFunction: "旧目标",
            customVariables: [["旧变量", "1"]],
        }
        inputs.customVarsInput = undefined

        const { settings: resolved } = createSettingsFromNodeInputs(inputs)
        expect(resolved.targetFunction).toBe("")
        expect(resolved.customVariables).toEqual([])
    })

    it("角色节点只读取自身显式字段，忽略旧 settings 快照", () => {
        const { inputs } = createInputs()
        inputs.charInput!.data.extraMastery = "长柄"
        inputs.charInput!.data.settings = {
            ...createDefaultCharSettings(),
            charLevel: 1,
            isRouge: true,
            extraMastery: "双枪",
        }

        const { settings: resolved } = createSettingsFromNodeInputs(inputs)
        expect(resolved.charLevel).toBe(80)
        expect(resolved.isRouge).toBe(false)
        expect(resolved.extraMastery).toBe("长柄")
    })

    it("自定义变量可在 wasm/TS 同口径的目标函数中求值", () => {
        const { inputs } = createInputs()
        const { context } = createBuildContextFromInputs(inputs)
        expect(context).toBeDefined()

        const charBuild = context!.charBuild
        const attack = charBuild.calculateAttributes().攻击
        expect(charBuild.calculateTargetFunction(undefined, "倍率 * 攻击")).toBeCloseTo(attack * 2, 6)
        expect(charBuild.calculateTargetFunction(undefined, "额外 * 攻击")).toBeCloseTo(attack * 3, 6)
    })

    it("没有角色输入时不创建构筑上下文", () => {
        const { inputs } = createInputs()
        const { context, missing } = createBuildContextFromInputs({ ...inputs, charInput: undefined })
        expect(context).toBeUndefined()
        expect(missing).toContain("角色")
    })

    it("核心节点按端口 handle 收集输入，不再扫描下游节点", () => {
        const { inputs } = createInputs()
        const charNode = inputs.charInput!
        const customVarsNode = inputs.customVarsInput!
        const buffNode: BuildGraphNode = { id: "buff", type: NodeType.BUFF_INPUT, data: { buffs: [] } }
        const enemyNode: BuildGraphNode = { id: "enemy", type: NodeType.ENEMY_INPUT, data: {} }
        const nodes = [charNode, customVarsNode, buffNode, enemyNode]
        const edges = [
            { source: "char", target: "core", sourceHandle: "char", targetHandle: CORE_INPUT.char },
            { source: "vars", target: "core", sourceHandle: "customVariables", targetHandle: CORE_INPUT.customVariables },
            { source: "buff", target: "core", sourceHandle: "buff", targetHandle: CORE_INPUT.buff },
            { source: "enemy", target: "core", sourceHandle: "enemy", targetHandle: CORE_INPUT.enemy },
        ]

        const collected = collectCoreInputNodes(nodes, edges, "core")
        expect(collected.charInput?.id).toBe("char")
        expect(collected.customVarsInput?.id).toBe("vars")
        expect(collected.buffInputs.map(node => node.id)).toEqual(["buff"])
        expect(collected.enemyInput?.id).toBe("enemy")

        // 未连接端口的节点不会被静默并入核心
        const onlyChar = collectCoreInputNodes(nodes, [edges[0]], "core")
        expect(onlyChar.customVarsInput).toBeUndefined()
    })

    it("BUFF 节点携带的队友 / 特效 / 魔灵输入按端口写入构筑配置", () => {
        const { inputs } = createInputs()
        inputs.buffInputs.push({
            id: "buff",
            type: NodeType.BUFF_INPUT,
            data: { buffs: [["助战50攻", 2]], team1: 3101, team1Weapon: 10206 },
        })
        inputs.effectInput = {
            id: "effect",
            type: NodeType.EFFECT_INPUT,
            data: { useGlobal: true, effectConfig: { "m:1": 3 } },
        }
        inputs.petInput = {
            id: "pet",
            type: NodeType.PET_INPUT,
            data: { petId: 300001, petLevel: 2, petCoverage: 0.5, petAutoCoverage: false, traits: [] },
        }

        const { settings } = createSettingsFromNodeInputs(inputs)
        expect(settings.team1).toBe(3101)
        expect(settings.team1Weapon).toBe(10206)
        expect(settings.buffs).toContainEqual(["助战50攻", 2])
        expect(settings.useGlobal).toBe(true)
        expect(settings.effectConfig).toEqual({ "m:1": 3 })
        expect(settings.petId).toBe(300001)
        expect(settings.petLevel).toBe(2)
        expect(settings.petCoverage).toBe(0.5)
        expect(settings.petAutoCoverage).toBe(false)
    })

    it("助战 BUFF 作为普通 BUFF 参与求值，等级以用户手选的条目为准", () => {
        const { inputs } = createInputs()
        inputs.buffInputs.push({
            id: "buff",
            type: NodeType.BUFF_INPUT,
            data: {
                buffs: [["煜明7溯", 2]],
                team1: 4201,
                team2: 2401,
                team1Weapon: 10203,
                team2Weapon: 10502,
            },
        })

        const { settings } = createSettingsFromNodeInputs(inputs)
        expect(settings.buffs).toContainEqual(["煜明7溯", 2])
        // 节点未手选的助战条目不会以隐藏派生层混入
        expect(settings.buffs.filter(([name]) => name === "煜明7溯")).toHaveLength(1)
        expect(settings.buffs.every(([name]) => name !== "煜明E")).toBe(true)
    })

    it("切换队友时助战 BUFF 作为普通条目增删，保留手选等级", () => {
        const ids = [2401, 10502, 4201, 10203]
        const initial = reconcileTeamBuffs([["煜明7溯", 2]], [], ids)
        expect(initial).toContainEqual(["煜明7溯", 2])
        expect(initial.map(([name]) => name)).toContain("煜明助战")

        // 取消煜明队友：其来源的助战条目（含手选的 煜明7溯）一并移除，与构筑页换队友的行为一致
        const removed = reconcileTeamBuffs(initial, ids, [2401, 10502])
        expect(removed.some(([name]) => name === "煜明助战")).toBe(false)
        expect(removed.some(([name]) => name === "煜明7溯")).toBe(false)

        // 切回煜明：重新补齐助战条目（顺序不影响求值）
        const restored = reconcileTeamBuffs(removed, [2401, 10502], ids)
        expect([...restored.map(([name]) => name)].sort()).toEqual([...initial.map(([name]) => name)].sort())
    })

    it("旧图 teamBuffs 派生层迁移：buffs 已含助战条目时直接丢弃覆盖层", () => {
        const buffs: [string, number][] = [
            ["煜明7溯", 2],
            ["扶疏助战", 1],
        ]
        const overlay = deriveTeamBuffs([2401, 10502, 4201, 10203])
        const migrated = migrateLegacyTeamBuffs(buffs, overlay)
        expect(migrated).toEqual(buffs)
        expect(migrated.some(([name, level]) => name === "煜明7溯" && level === 2)).toBe(true)
    })

    it("旧图 teamBuffs 派生层迁移：buffs 缺失助战条目时按派生层补齐", () => {
        const migrated = migrateLegacyTeamBuffs([], [["扶疏助战", 1]])
        expect(migrated).toEqual([["扶疏助战", 1]])
    })

    it("DOT 频率节点写入构筑配置", () => {
        const { inputs } = createInputs()
        inputs.dotInput = {
            id: "dot",
            type: NodeType.DOT_INPUT,
            data: { dotSettings: { skill: 2, melee: 1, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: true } },
        }
        const { settings } = createSettingsFromNodeInputs(inputs)
        expect(settings.dotSettings).toEqual({ skill: 2, melee: 1, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: true })
    })

    it("JSON 构筑文本解析为构筑上下文", () => {
        const { settings } = createInputs()
        const json = JSON.stringify({ charId: CHAR_ID, charSettings: JSON.stringify(settings) })
        const { context, error } = createBuildContextFromJSONText(json)
        expect(error).toBeUndefined()
        expect(context?.charId).toBe(CHAR_ID)
        expect(context?.settings.baseName).toBe("潜入夜色")

        expect(createBuildContextFromJSONText("{not json}").error).toContain("JSON 解析失败")
        expect(createBuildContextFromJSONText("{}").error).toContain("charId")
    })

    it("自定义变量向量按变量名覆盖并展开为二维构筑", () => {
        const { inputs } = createInputs()
        const result = createBuildContextsFromInputs(inputs, [
            { id: "v1", variable: "倍率", values: [1, 2, 3], label: "向量1" },
            { id: "v2", variable: "额外", values: [10, 20, 30], label: "向量2" },
        ])
        expect(result.contexts).toHaveLength(9)
        expect(result.vector?.dimensions.map(dimension => dimension.values.length)).toEqual([3, 3])
        expect(result.vector?.labels).toHaveLength(9)
        expect(result.contexts[0].settings.customVariables.find(([name]) => name === "倍率")?.[1]).toBe("1")
        expect(result.contexts[1].settings.customVariables.find(([name]) => name === "额外")?.[1]).toBe("20")
        expect(result.contexts[4].settings.customVariables.find(([name]) => name === "倍率")?.[1]).toBe("2")
    })

    it("多个 MOD / BUFF 输入视为向量维度", () => {
        const { inputs } = createInputs()
        inputs.modInputs = [
            { id: "modA", type: NodeType.MOD_INPUT, data: { label: "MOD A" } },
            { id: "modB", type: NodeType.MOD_INPUT, data: { label: "MOD B" } },
        ]
        inputs.buffInputs = [
            { id: "buffA", type: NodeType.BUFF_INPUT, data: { label: "BUFF A", buffs: [] } },
            { id: "buffB", type: NodeType.BUFF_INPUT, data: { label: "BUFF B", buffs: [] } },
        ]
        const result = createBuildContextsFromInputs(inputs)
        expect(result.contexts).toHaveLength(4)
        expect(result.vector?.dimensions.map(dimension => dimension.values)).toEqual([
            ["MOD A", "MOD B"],
            ["BUFF A", "BUFF B"],
        ])
    })

    it("同名 MOD 输入的向量取值追加序号", () => {
        const { inputs } = createInputs()
        inputs.modInputs = [
            { id: "modA", type: NodeType.MOD_INPUT, data: { label: "MOD输入" } },
            { id: "modB", type: NodeType.MOD_INPUT, data: { label: "MOD输入" } },
        ]
        const result = createBuildContextsFromInputs(inputs)
        expect(result.vector?.dimensions[0].values).toEqual(["MOD输入", "MOD输入 #2"])
    })

    it("向量节点按变量行端口分别覆盖对应变量", () => {
        const nodes: BuildGraphNode[] = [
            {
                id: "vars",
                type: NodeType.CUSTOM_VARS_INPUT,
                data: {
                    customVariables: [
                        ["倍率", "1"],
                        ["额外", "2"],
                    ],
                },
            },
            { id: "vecA", type: NodeType.VECTOR_INPUT, data: { values: [1, 2], label: "倍率向量" } },
            { id: "vecB", type: NodeType.VECTOR_INPUT, data: { values: [10, 20], label: "额外向量" } },
        ]
        const edges = [
            { source: "vecA", target: "vars", sourceHandle: "vector", targetHandle: "vector-0" },
            { source: "vecB", target: "vars", sourceHandle: "vector", targetHandle: "vector-1" },
        ]
        expect(collectVariableVectors(nodes, edges, "vars")).toEqual([
            { id: "vecA", variable: "倍率", values: [1, 2], label: "倍率向量" },
            { id: "vecB", variable: "额外", values: [10, 20], label: "额外向量" },
        ])
    })

    it("旧图共享向量端口按向量节点的变量名兼容", () => {
        const nodes: BuildGraphNode[] = [
            { id: "vars", type: NodeType.CUSTOM_VARS_INPUT, data: { customVariables: [["倍率", "1"]] } },
            { id: "vec", type: NodeType.VECTOR_INPUT, data: { variable: "倍率", values: [1, 2], label: "向量输入" } },
        ]
        const edges = [{ source: "vec", target: "vars", sourceHandle: "vector", targetHandle: "vectors" }]
        expect(collectVariableVectors(nodes, edges, "vars")).toEqual([{ id: "vec", variable: "倍率", values: [1, 2], label: "向量输入" }])
    })

    it("核心节点连接两个 MOD 时自动展开为构筑向量", () => {
        const { inputs } = createInputs()
        const modA: BuildGraphNode = { id: "modA", type: NodeType.MOD_INPUT, data: { label: "MOD A" } }
        const modB: BuildGraphNode = { id: "modB", type: NodeType.MOD_INPUT, data: { label: "MOD B" } }
        const nodes = [inputs.charInput!, inputs.customVarsInput!, modA, modB]
        const edges = [
            { source: "char", target: "core", sourceHandle: "char", targetHandle: CORE_INPUT.char },
            { source: "vars", target: "core", sourceHandle: "customVariables", targetHandle: CORE_INPUT.customVariables },
            { source: "modA", target: "core", sourceHandle: "mod", targetHandle: CORE_INPUT.mod },
            { source: "modB", target: "core", sourceHandle: "mod", targetHandle: CORE_INPUT.mod },
        ]
        const collected = collectCoreInputNodes(nodes, edges, "core")
        expect(collected.modInputs.map(node => node.id)).toEqual(["modA", "modB"])

        const result = createBuildContextsFromInputs(collected)
        expect(result.contexts).toHaveLength(2)
        expect(result.vector?.dimensions).toEqual([{ label: "MOD", values: ["MOD A", "MOD B"] }])
    })

    it("旧版平铺 MOD 数据迁移到对应槽位", () => {
        const mod = modData.find(item => item.类型 === "角色" && item.系列 !== "羽蛇")
        expect(mod).toBeDefined()

        const data: Record<string, any> = { mods: [mod!.id], modLevels: [7] }
        const settings = ensureNodeModSettings(data)
        expect(settings.charMods).toContainEqual([mod!.id, 7])
        expect(settings.meleeMods.every(slot => slot === null)).toBe(true)
    })

    it("表达式覆盖不修改原配置", () => {
        const { settings } = createInputs()
        const next = withExpressionSettings(settings, "1 + 1", [["a", "1"]])

        expect(next).not.toBe(settings)
        expect(next.targetFunction).toBe("1 + 1")
        expect(next.customVariables).toEqual([["a", "1"]])
        expect(settings.targetFunction).toBe("")
        expect(settings.customVariables).toHaveLength(0)
    })

    it("同一份导入配置可重复创建构筑", () => {
        const { settings } = createInputs()
        expect(() => createCharBuildFromSettings(CHAR_ID, settings)).not.toThrow()
        expect(() => createCharBuildFromSettings(CHAR_ID, settings)).not.toThrow()
    })

    it("未装备中枢魔之楔（auraMod 为 0）时仍可创建构筑", () => {
        const { settings } = createInputs()
        expect(() => createCharBuildFromSettings(CHAR_ID, { ...settings, auraMod: 0 })).not.toThrow()
    })
})
