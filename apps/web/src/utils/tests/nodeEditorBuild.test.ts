import { describe, expect, it } from "vitest"
import { createDefaultCharSettings } from "@/composables/useCharSettings"
import { modData } from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { NodeType } from "@/store/nodeEditorTypes"
import {
    type BuildGraphNode,
    collectCoreInputNodes,
    collectNumericParamVectors,
    collectVariableVectors,
    computeVectorStat,
    createBuildContextFromInputs,
    createBuildContextFromJSONText,
    createBuildContextsFromInputs,
    createExpressionVectorOutput,
    createSettingsFromNodeInputs,
    createVectorDecomposeOutput,
    deriveTeamBuffs,
    ensureNodeModSettings,
    mergeBuffEntries,
    migrateLegacyTeamBuffs,
    type NodeBuildInputs,
    normalizeLabeledVector,
    normalizeNumericParamValue,
    readNodeVectorValues,
    readVectorCalcMode,
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

    it("BUFF 合并：并集保留两边条目，同名取最高等级", () => {
        expect(
            mergeBuffEntries(
                [
                    ["攻击", 2],
                    ["防御", 3],
                ],
                [
                    ["攻击", 5, 0.5],
                    ["暴击", 1],
                ],
                "union"
            )
        ).toEqual([
            ["攻击", 5, 0.5],
            ["防御", 3],
            ["暴击", 1],
        ])
        // 等级相同时取覆盖率更高的一份
        expect(mergeBuffEntries([["极速", 3, 0.5]], [["极速", 3]], "union")).toEqual([["极速", 3]])
    })

    it("BUFF 合并：交集只保留两边共有条目，等级与覆盖率取较低值", () => {
        expect(
            mergeBuffEntries(
                [
                    ["攻击", 2],
                    ["防御", 3, 0.6],
                ],
                [
                    ["攻击", 5, 0.5],
                    ["暴击", 1],
                ],
                "intersect"
            )
        ).toEqual([["攻击", 2, 0.5]])
    })

    it("核心节点的 BUFF 端口穿透合并节点读取合并结果", () => {
        const nodes: BuildGraphNode[] = [
            {
                id: "buffA",
                type: NodeType.BUFF_INPUT,
                data: {
                    label: "BUFF A",
                    buffs: [
                        ["攻击", 2],
                        ["防御", 3],
                    ],
                },
            },
            {
                id: "buffB",
                type: NodeType.BUFF_INPUT,
                data: {
                    label: "BUFF B",
                    buffs: [
                        ["攻击", 5, 0.5],
                        ["暴击", 1],
                    ],
                    customBuff: [["攻击", 10]],
                    team1: 3101,
                    team1Weapon: 10206,
                },
            },
            { id: "merge", type: NodeType.BUFF_MERGE, data: { label: "合并", mergeMode: "union" } },
        ]
        const edges = [
            { source: "buffA", target: "merge", sourceHandle: "buff", targetHandle: "left" },
            { source: "buffB", target: "merge", sourceHandle: "buff", targetHandle: "right" },
            { source: "merge", target: "core", sourceHandle: "buff", targetHandle: CORE_INPUT.buff },
        ]

        const collected = collectCoreInputNodes(nodes, edges, "core")
        expect(collected.buffInputs).toHaveLength(1)
        expect(collected.buffInputs[0].data).toMatchObject({
            label: "合并",
            buffs: [
                ["攻击", 5, 0.5],
                ["防御", 3],
                ["暴击", 1],
            ],
            // 自定义 BUFF 属性与队友配置取后一路
            customBuff: [["攻击", 10]],
            team1: 3101,
            team1Weapon: 10206,
        })

        // 交集模式随节点数据切换
        nodes[2].data.mergeMode = "intersect"
        expect(collectCoreInputNodes(nodes, edges, "core").buffInputs[0].data.buffs).toEqual([["攻击", 2, 0.5]])
    })

    it("BUFF 合并节点可串联，子合并先按自身模式求值", () => {
        const nodes: BuildGraphNode[] = [
            {
                id: "a",
                type: NodeType.BUFF_INPUT,
                data: {
                    buffs: [
                        ["攻击", 1],
                        ["防御", 2],
                    ],
                },
            },
            {
                id: "b",
                type: NodeType.BUFF_INPUT,
                data: {
                    buffs: [
                        ["攻击", 4],
                        ["暴击", 3],
                    ],
                },
            },
            { id: "inner", type: NodeType.BUFF_MERGE, data: { mergeMode: "intersect" } },
            {
                id: "c",
                type: NodeType.BUFF_INPUT,
                data: {
                    buffs: [
                        ["攻击", 2],
                        ["防御", 5],
                    ],
                },
            },
            { id: "outer", type: NodeType.BUFF_MERGE, data: { mergeMode: "union" } },
        ]
        const edges = [
            { source: "a", target: "inner", targetHandle: "left" },
            { source: "b", target: "inner", targetHandle: "right" },
            { source: "inner", target: "outer", targetHandle: "left" },
            { source: "c", target: "outer", targetHandle: "right" },
            { source: "outer", target: "core", targetHandle: CORE_INPUT.buff },
        ]

        const collected = collectCoreInputNodes(nodes, edges, "core")
        // inner 交集 = [攻击1]；outer 并集 = [攻击2, 防御5]
        expect(collected.buffInputs[0].data.buffs).toEqual([
            ["攻击", 2],
            ["防御", 5],
        ])
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

    it("覆盖模式：连线输入覆盖输入构筑的对应项目，其余项目保留", () => {
        const { inputs: baseInputs } = createInputs()
        const base = createBuildContextFromInputs(baseInputs)
        expect(base.context).toBeDefined()

        // 本地只连自定义变量组：角色与其余项目来自输入构筑
        const localInputs: NodeBuildInputs = {
            modInputs: [],
            buffInputs: [],
            customVarsInput: {
                id: "vars2",
                type: NodeType.CUSTOM_VARS_INPUT,
                data: { customVariables: [["额外", "9"]] },
            },
            duplicates: [],
        }
        const result = createBuildContextsFromInputs(
            localInputs,
            [],
            {},
            {
                contexts: [base.context!],
                dimensions: [],
                labels: [""],
                mode: "override",
            }
        )
        expect(result.contexts).toHaveLength(1)
        expect(result.missing).toEqual([])
        expect(result.vector).toBeUndefined()
        expect(result.contexts[0].charId).toBe(CHAR_ID)
        expect(result.contexts[0].settings.charLevel).toBe(base.context!.settings.charLevel)
        expect(result.contexts[0].settings.customVariables).toEqual([["额外", "9"]])
    })

    it("追加模式：原构筑与叠加后的构筑同时产出", () => {
        const mod = modData.find(item => item.类型 === "角色" && item.系列 !== "羽蛇")
        expect(mod).toBeDefined()
        const { inputs: baseInputs } = createInputs()
        const base = createBuildContextFromInputs(baseInputs)
        const localInputs: NodeBuildInputs = {
            modInputs: [{ id: "mod", type: NodeType.MOD_INPUT, data: { label: "MOD A", mods: [mod!.id], modLevels: [7] } }],
            buffInputs: [],
            duplicates: [],
        }
        const result = createBuildContextsFromInputs(
            localInputs,
            [],
            {},
            {
                contexts: [base.context!],
                dimensions: [],
                labels: [""],
                mode: "append",
            }
        )
        expect(result.contexts).toHaveLength(2)
        expect(result.vector?.labels).toEqual(["原构筑", "叠加输入"])
        expect(result.vector?.dimensions).toEqual([{ label: "组合", values: ["原构筑", "叠加输入"] }])
        expect(result.contexts[0].settings.charMods.every(slot => slot === null)).toBe(true)
        expect(result.contexts[1].settings.charMods).toContainEqual([mod!.id, 7])
        // 两组都保留输入构筑的自定义变量
        expect(result.contexts[1].settings.customVariables).toEqual([
            ["倍率", "2"],
            ["额外", "3"],
        ])
    })

    it("追加模式没有连线输入时不重复产出", () => {
        const { inputs: baseInputs } = createInputs()
        const base = createBuildContextFromInputs(baseInputs)
        const result = createBuildContextsFromInputs(
            { modInputs: [], buffInputs: [], duplicates: [] },
            [],
            {},
            {
                contexts: [base.context!],
                dimensions: [],
                labels: [""],
                mode: "append",
            }
        )
        expect(result.contexts).toHaveLength(1)
        expect(result.vector).toBeUndefined()
    })

    it("构筑输入本身是向量时逐组覆盖，维度与标签保留", () => {
        const { inputs: baseInputs } = createInputs()
        const base = createBuildContextFromInputs(baseInputs)
        const result = createBuildContextsFromInputs(
            { modInputs: [], buffInputs: [], duplicates: [] },
            [],
            {},
            {
                contexts: [base.context!, base.context!],
                dimensions: [{ label: "MOD", values: ["A", "B"] }],
                labels: ["A", "B"],
                mode: "override",
            }
        )
        expect(result.contexts).toHaveLength(2)
        expect(result.vector?.dimensions).toEqual([{ label: "MOD", values: ["A", "B"] }])
        expect(result.vector?.labels).toEqual(["A", "B"])
    })

    it("旧版平铺 MOD 数据迁移到对应槽位", () => {
        const mod = modData.find(item => item.类型 === "角色" && item.系列 !== "羽蛇")
        expect(mod).toBeDefined()

        const data: Record<string, any> = { mods: [mod!.id], modLevels: [7] }
        const settings = ensureNodeModSettings(data)
        expect(settings.charMods).toContainEqual([mod!.id, 7])
        expect(settings.meleeMods.every(slot => slot === null)).toBe(true)
    })

    it("目标函数输出带标题的向量：向量结果沿用组合标签，标量结果包装为单元素", () => {
        const vector = createExpressionVectorOutput({
            label: "综合DPS",
            vectorResult: { labels: ["倍率=1", "倍率=2"], values: [10, 20], valueLabel: "数值" },
        })
        expect(vector).toEqual({ title: "综合DPS", labels: ["倍率=1", "倍率=2"], values: [10, 20], valueLabel: "数值" })

        expect(createExpressionVectorOutput({ label: "木桩伤害", result: { value: 5 } })).toEqual({
            title: "木桩伤害",
            labels: ["木桩伤害"],
            values: [5],
            valueLabel: "数值",
        })
        expect(createExpressionVectorOutput({ label: "目标函数", result: { value: Number.NaN } })).toBeUndefined()
        expect(createExpressionVectorOutput({})).toBeUndefined()
    })

    it("图表向量归一化：带标题向量与向量输入节点数值列表", () => {
        expect(normalizeLabeledVector({ title: "综合DPS", labels: ["一", "二"], values: [1, 2] })).toEqual({
            title: "综合DPS",
            labels: ["一", "二"],
            values: [1, 2],
        })
        expect(normalizeLabeledVector({ label: "向量输入", values: [3, 4] })).toEqual({
            title: "向量输入",
            labels: ["1", "2"],
            values: [3, 4],
        })
        expect(normalizeLabeledVector([1, 2])).toEqual({ title: "向量", labels: ["1", "2"], values: [1, 2] })
        expect(normalizeLabeledVector({ values: [1, Number.NaN] })).toEqual({ title: "向量", labels: ["1"], values: [1] })
        expect(normalizeLabeledVector({ values: [Number.NaN] })).toBeUndefined()
        expect(normalizeLabeledVector({ values: [] })).toBeUndefined()
        expect(normalizeLabeledVector(null)).toBeUndefined()
    })

    it("向量分解把各分量按端口顺序展开为数值", () => {
        expect(createVectorDecomposeOutput([3, 4])).toEqual({
            labels: ["1", "2"],
            values: [3, 4],
            outputs: { "value-0": 3, "value-1": 4 },
        })
        expect(createVectorDecomposeOutput({ title: "综合DPS", labels: ["一", "二"], values: [1, 2] })).toEqual({
            labels: ["一", "二"],
            values: [1, 2],
            outputs: { "value-0": 1, "value-1": 2 },
        })
        // 有效值保留原标签位置，端口按过滤后的顺序编号
        expect(createVectorDecomposeOutput({ values: [1, Number.NaN, 3] })).toEqual({
            labels: ["1", "3"],
            values: [1, 3],
            outputs: { "value-0": 1, "value-1": 3 },
        })
        expect(createVectorDecomposeOutput(null)).toBeUndefined()
        expect(createVectorDecomposeOutput({ values: [] })).toBeUndefined()
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

    it("数值输出接入向量端口时按单元素向量读取", () => {
        expect(readNodeVectorValues({ id: "num", type: NodeType.NUMBER_INPUT, data: { value: 7 } }, "value")).toEqual([7])
        expect(readNodeVectorValues({ id: "vec", type: NodeType.VECTOR_INPUT, data: { values: [1, 2] } }, "vector")).toEqual([1, 2])
        expect(readNodeVectorValues({ id: "expr", type: NodeType.EXPRESSION_CALC, data: { result: { value: 3 } } }, "value")).toEqual([3])
        expect(
            readNodeVectorValues({ id: "ast", type: NodeType.AST_EXPRESSION_CALC, data: { vectorResult: { values: [4, 5] } } }, "vector")
        ).toEqual([4, 5])
        expect(normalizeLabeledVector(6)).toEqual({ title: "向量", labels: ["向量"], values: [6] })
    })

    it("数值参数取值按端口范围收敛", () => {
        expect(normalizeNumericParamValue("charLevel", 100)).toBe(80)
        expect(normalizeNumericParamValue("charLevel", 0)).toBe(1)
        expect(normalizeNumericParamValue("skillE", 0)).toBe(1)
        expect(normalizeNumericParamValue("level", 120)).toBe(90)
        expect(normalizeNumericParamValue("refine", 9)).toBe(5)
    })

    it("数值可以覆盖自定义变量端口", () => {
        const nodes: BuildGraphNode[] = [
            { id: "vars", type: NodeType.CUSTOM_VARS_INPUT, data: { customVariables: [["倍率", "1"]] } },
            { id: "num", type: NodeType.NUMBER_INPUT, data: { value: 7 } },
        ]
        const edges = [{ source: "num", target: "vars", sourceHandle: "value", targetHandle: "vector-0" }]
        expect(collectVariableVectors(nodes, edges, "vars")).toEqual([{ id: "num", variable: "倍率", values: [7], label: "向量" }])
    })

    it("角色与武器数值参数由连线驱动并展开为构筑维度", () => {
        const { inputs } = createInputs()
        const weaponNode: BuildGraphNode = {
            id: "melee",
            type: NodeType.MELEE_WEAPON_INPUT,
            data: { label: "近战武器", weapon: 0, level: 80, refine: 5 },
        }
        const charNode = inputs.charInput!
        charNode.data.label = "角色配置"
        const nodes: BuildGraphNode[] = [
            charNode,
            weaponNode,
            { id: "levels", type: NodeType.VECTOR_INPUT, data: { label: "等级向量", values: [1, 2, 3] } },
            { id: "skill", type: NodeType.NUMBER_INPUT, data: { value: 9 } },
            { id: "refine", type: NodeType.NUMBER_INPUT, data: { value: 4 } },
        ]
        const edges = [
            { source: "levels", target: "char", sourceHandle: "vector", targetHandle: "charLevel" },
            { source: "skill", target: "char", sourceHandle: "value", targetHandle: "skillE" },
            { source: "refine", target: "melee", sourceHandle: "value", targetHandle: "refine" },
        ]
        const withWeapon = { ...inputs, meleeWeapon: weaponNode }
        const paramVectors = collectNumericParamVectors(nodes, edges, withWeapon)
        expect(paramVectors).toEqual([
            { nodeId: "char", paramId: "charLevel", paramLabel: "等级", label: "角色配置·等级", values: [1, 2, 3] },
            { nodeId: "char", paramId: "skillE", paramLabel: "E 技能等级", label: "角色配置·E 技能等级", values: [9] },
            { nodeId: "melee", paramId: "refine", paramLabel: "精炼等级", label: "近战武器·精炼等级", values: [4] },
        ])

        const result = createBuildContextsFromInputs(withWeapon, [], {}, undefined, paramVectors)
        expect(result.contexts).toHaveLength(3)
        expect(result.contexts.map(context => context.settings.charLevel)).toEqual([1, 2, 3])
        expect(result.contexts.every(context => context.settings.charSkillLevel[0] === 9)).toBe(true)
        expect(result.contexts.every(context => context.settings.meleeWeaponRefine === 4)).toBe(true)
        expect(result.vector?.dimensions).toEqual([
            { label: "角色配置·等级", values: ["等级=1", "等级=2", "等级=3"] },
            { label: "角色配置·E 技能等级", values: ["E 技能等级=9"] },
            { label: "近战武器·精炼等级", values: ["精炼等级=4"] },
        ])
    })

    it("向量统计按模式聚合一维向量", () => {
        const values = [2, 4, 4, 4, 5, 5, 7, 9]
        expect(computeVectorStat("sum", values)).toBe(40)
        expect(computeVectorStat("mean", values)).toBe(5)
        expect(computeVectorStat("variance", values)).toBe(4)
        expect(computeVectorStat("std", values)).toBe(2)
        expect(computeVectorStat("min", values)).toBe(2)
        expect(computeVectorStat("max", values)).toBe(9)
        expect(computeVectorStat("median", values)).toBe(4.5)
        expect(computeVectorStat("median", [3, 1, 2])).toBe(2)
        expect(computeVectorStat("count", values)).toBe(8)
        expect(computeVectorStat("sum", [])).toBeUndefined()
        expect(readVectorCalcMode({})).toBe("sum")
        expect(readVectorCalcMode({ mode: "std" })).toBe("std")
        expect(readVectorCalcMode({ mode: "unknown" })).toBe("sum")
    })
})
