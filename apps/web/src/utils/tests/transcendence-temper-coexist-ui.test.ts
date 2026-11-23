import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * U135 源码锚点：淬炼候选池不再按「已存在 affixId」排除，随机词条同 id 的词条可选；
 * 组件渲染依赖 Tauri / store（无 @vue/test-utils 环境），纯逻辑由 `getTemperCandidates` 单测覆盖。
 */

/**
 * 读取淬炼 tab 组件源码。
 * @returns 源码文本
 */
function temperTabSource(): string {
    return readFileSync(
        fileURLToPath(new URL("../../components/transcend-build/craft/TranscendCraftTemperTab.vue", import.meta.url)),
        "utf8"
    )
}

/**
 * 读取做装相关组件源码。
 * @param relativePath 相对 `components/transcend-build/` 的路径
 * @returns 源码文本
 */
function buildComponentSource(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(`../../components/transcend-build/${relativePath}`, import.meta.url)), "utf8")
}

describe("淬炼 tab：与随机词条同 id 共存", () => {
    const source = temperTabSource()

    it("候选池改用共享 getTemperCandidates，不再按已存在 id 排除", () => {
        expect(source).not.toContain("present.has")
        expect(source).not.toContain("getGearTemperingAffixPool")
        expect(source).toContain("getTemperCandidates(props.item, props.charId")
        // 基础 / 专属 / 快照 / 角色门控由候选函数与禁用态保留
        expect(source).toContain("isSnapshotBlocked")
        expect(source).toContain(":data-temper-blocked=\"isSnapshotBlocked(affix) ? 'snapshot' : undefined\"")
    })

    it("应用后 emit 新物品（同 id 时由 applyTemper 返回改造后的物品）", () => {
        expect(source).toContain("const next = applyTemper(props.item, { affixId: affix.id, ancient })")
        expect(source).toContain('if (next !== props.item) emit("apply", next)')
        expect(source).toContain('@click="applyTempering(affix)"')
    })
})

describe("做装表单 / 精锻 tab：同 id 随机 + 淬炼双行", () => {
    it("TranscendGearCreate 按行对象编辑，替换 / 删除 / 改值都不动同 id 淬炼行", () => {
        const create = buildComponentSource("TranscendGearCreate.vue")
        expect(create).toContain('roll === target ? createAffixRoll(affix, "random"')
        expect(create).toContain("randomAffixes.value.filter(roll => roll !== target)")
        expect(create).toContain("roll === target ? { ...roll, ...patch } : roll")
        expect(create).toContain("replaceRandomAffix(roll, value)")
        expect(create).toContain("updateRandomAffix(roll, {")
    })

    it("Forge tab 最终目标选项按 affixId 去重，目标行 / 随机结果行按下标定位", () => {
        const forge = buildComponentSource("craft/TranscendCraftForgeTab.vue")
        expect(forge).toContain("seen.has(roll.affixId)")
        expect(forge).toContain("seen.add(roll.affixId)")
        expect(forge).toContain("line.affixIndex === index")
        expect(forge).toContain("lastRolledAffixIndex.value = index")
        expect(forge).toContain(':data-final-target="finalAffixId"')
    })
})
