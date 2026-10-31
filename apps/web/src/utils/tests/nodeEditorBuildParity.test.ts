import { describe, expect, it } from "vitest"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { liseFireBuildCharId, liseFireBuildSettings } from "@/data/tests/fixtures/liseFireBuild"
import { createImportedGraphSpec } from "@/utils/importCharSettingsToNodeEditor"
import { collectCoreInputNodes, createSettingsFromNodeInputs } from "@/utils/nodeEditorBuild"

/**
 * 用导入规格真实还原节点图求值路径：节点 → 核心端口收集 → 节点配置 → 构筑。
 * @returns 导入后的构筑配置
 */
function buildFromImportedNodes() {
    const spec = createImportedGraphSpec("黎瑟·浴火", liseFireBuildSettings)
    const inputs = collectCoreInputNodes(spec.nodes, spec.edges, spec.coreId)
    const coreData = spec.nodes.find(node => node.id === spec.coreId)?.data ?? {}
    return createSettingsFromNodeInputs(inputs, coreData)
}

describe("节点编辑器与标准构筑求值口径一致", () => {
    it("线上构筑迁移到节点后目标函数结果与标准构筑完全相同", () => {
        const standard = createCharBuildFromSettings(liseFireBuildCharId, liseFireBuildSettings)
        const { charId, settings } = buildFromImportedNodes()
        expect(charId).toBe(liseFireBuildCharId)

        // 目标函数改为由显式 AST 节点提供，其余配置字段必须与标准构筑逐项一致
        expect({ ...settings, targetFunction: liseFireBuildSettings.targetFunction }).toEqual(liseFireBuildSettings)

        const migrated = createCharBuildFromSettings(charId, settings)
        const target = "综合DPS"
        expect(migrated.calculateTargetFunction(undefined, target)).toBeCloseTo(standard.calculateTargetFunction(undefined, target), 6)
    })

    it("队友助战 BUFF 不会被节点额外派生出覆盖条目", () => {
        const { settings } = buildFromImportedNodes()
        const names = settings.buffs.map(([name]) => name)
        expect(names).toEqual(liseFireBuildSettings.buffs.map(([name]) => name))
        // 煜明7溯 在标准构筑里手选为 2 级，迁移后不能被满级覆盖
        expect(settings.buffs.find(([name]) => name === "煜明7溯")).toEqual(["煜明7溯", 2])
    })
})
