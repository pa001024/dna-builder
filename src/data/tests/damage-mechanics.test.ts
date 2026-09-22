import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { listModules, queryModule } from "@/utils/db-search"
import {
    DAMAGE_MODES,
    DAMAGE_TERMS,
    getDamageFields,
    getDamageMode,
    listDamageModes,
    searchDamageSteps,
    searchDamageTerms,
} from "../damage-mechanics"

/**
 * 伤害机制索引的用例。
 *
 * 覆盖两件事：
 * 1. 索引自身的完整性（步骤 id 唯一、分组存在、核心结果步骤可达）；
 * 2. 索引与伤害公式页面（`src/views/DBDamageView.vue`）的一致性——页面的步骤定义是公式原文的来源，
 *    两边一旦漂移，Agent 就会照着一份过期的公式回答，所以这里直接比对页面源码文本。
 *
 * 页面源码用 fs 读取文本而不 import，避免把 .vue 拉进 node 测试的依赖图。
 */

/** 伤害公式页面源码 */
const VIEW_SOURCE = readFileSync(new URL("../../views/DBDamageView.vue", import.meta.url), "utf-8")

/**
 * 截取页面里某个 build*StepDefinitions 函数的函数体。
 * @param name 函数名
 * @returns 函数体文本
 */
function extractBuilderBody(name: string): string {
    const start = VIEW_SOURCE.indexOf(`function ${name}(`)

    expect(start).toBeGreaterThan(-1)

    const next = VIEW_SOURCE.indexOf("\nfunction ", start + 1)

    return VIEW_SOURCE.slice(start, next === -1 ? undefined : next)
}

/**
 * 从函数体里按出现顺序提取步骤的 id 与 formula。
 * formula 允许写成跨行的字符串（可能由多段字面量拼接），这里统一拼成一段再比对。
 * @param body 函数体文本
 * @returns 步骤的 id 与公式原文
 */
function extractViewSteps(body: string): Array<{ id: string; formula: string }> {
    const pattern = /id: "([^"]+)",\s*title: "[^"]*",\s*formula:\s*((?:"[^"]*"\s*)+)/g
    const steps: Array<{ id: string; formula: string }> = []

    for (const match of body.matchAll(pattern)) {
        const parts = [...match[2].matchAll(/"([^"]*)"/g)].map(item => item[1])

        steps.push({ id: match[1], formula: parts.join("") })
    }

    return steps
}

/** 页面三个构建函数对应的模式 */
const VIEW_BUILDERS: Array<{ mode: string; builder: string }> = [
    { mode: "weapon", builder: "buildWeaponStepDefinitions" },
    { mode: "skill", builder: "buildSkillStepDefinitions" },
    { mode: "dot", builder: "buildDotStepDefinitions" },
]

describe("伤害机制索引完整性", () => {
    it("三种结算模式齐备且模式 id 唯一", () => {
        const ids = DAMAGE_MODES.map(mode => mode.id)

        expect(ids).toEqual(["weapon", "skill", "dot"])
        expect(new Set(ids).size).toBe(ids.length)
    })

    it("每个模式的步骤 id 唯一、公式非空、分组都存在", () => {
        for (const mode of DAMAGE_MODES) {
            const stepIds = mode.steps.map(step => step.id)
            const groupTitles = mode.groups.map(group => group.title)

            expect(new Set(stepIds).size, `${mode.id} 步骤 id 重复`).toBe(stepIds.length)
            expect(stepIds.length).toBeGreaterThan(0)

            for (const step of mode.steps) {
                expect(step.formula.trim(), `${mode.id}.${step.id} 公式为空`).not.toBe("")
                expect(step.title.trim(), `${mode.id}.${step.id} 名称为空`).not.toBe("")
                expect(groupTitles, `${mode.id}.${step.id} 的分组 ${step.group} 不在参数分组里`).toContain(step.group)
            }
        }
    })

    it("核心结果步骤在各自模式的步骤列表里", () => {
        for (const mode of DAMAGE_MODES) {
            expect(
                mode.steps.some(step => step.id === mode.resultStepId),
                `${mode.id} 的核心结果步骤 ${mode.resultStepId} 不存在`
            ).toBe(true)
        }
    })

    it("术语条目有解释且术语名互不重复", () => {
        const terms = DAMAGE_TERMS.map(term => term.term)

        expect(new Set(terms).size).toBe(terms.length)

        for (const term of DAMAGE_TERMS) {
            expect(term.description.trim()).not.toBe("")
        }
    })
})

describe("索引与伤害公式页面一致", () => {
    for (const { mode, builder } of VIEW_BUILDERS) {
        it(`${mode} 模式的步骤顺序与公式原文与页面一致`, () => {
            const doc = getDamageMode(mode)

            expect(doc).toBeTruthy()

            const viewSteps = extractViewSteps(extractBuilderBody(builder))

            expect(viewSteps.length).toBeGreaterThan(0)
            expect(doc!.steps.map(step => ({ id: step.id, formula: step.formula }))).toEqual(viewSteps)
        })
    }
})

describe("检索行为", () => {
    it("按关键词命中步骤并给出所属模式", () => {
        const hits = searchDamageSteps("充盈")

        expect(hits.length).toBeGreaterThan(0)
        // 关键词可能在步骤名称、公式或所属分组上命中（如「触发溢出率」属于充盈分组）
        expect(hits.every(hit => `${hit.step.title}${hit.step.formula}${hit.step.group}`.includes("充盈"))).toBe(true)
        expect(hits.map(hit => hit.modeLabel)).toContain("武器伤害")
    })

    it("限定模式后只在模式内检索", () => {
        const hits = searchDamageSteps("防御", { mode: "dot" })

        expect(hits.every(hit => hit.mode === "dot")).toBe(true)
    })

    it("按别称命中术语（防御减伤 → 防御乘区）", () => {
        const terms = searchDamageTerms("防御减伤")

        expect(terms.map(term => term.term)).toContain("防御乘区")
    })

    it("关键词为空时按上限返回术语（默认上限 10，可显式放大）", () => {
        expect(searchDamageTerms("")).toHaveLength(Math.min(10, DAMAGE_TERMS.length))
        expect(searchDamageTerms("", 3)).toHaveLength(3)
        expect(searchDamageTerms("", DAMAGE_TERMS.length)).toHaveLength(DAMAGE_TERMS.length)
    })

    it("未知模式返回 undefined，概览仍列出三种模式", () => {
        expect(getDamageMode("not-exist")).toBeUndefined()
        expect(listDamageModes().map(item => item.id)).toEqual(["weapon", "skill", "dot"])
    })

    it("参数分组按关键词过滤，命中不到时返回空数组", () => {
        const fields = getDamageFields("weapon", "暴击")
        const flat = fields.flatMap(group => group.fields.map(field => field.label))

        expect(flat).toContain("基础暴击")
        expect(getDamageFields("weapon", "根本不存在的东西")).toEqual([])
        expect(getDamageFields("not-exist")).toEqual([])
    })
})

describe("资料库 damage 模块", () => {
    it("模块清单里能查到伤害机制模块", () => {
        const module = listModules().find(item => item.id === "damage")

        expect(module).toBeTruthy()
        expect(module!.path).toBe("/db/damage")
        expect(module!.versioned).toBe(false)
        expect(module!.count).toBeGreaterThan(0)
    })

    it("步骤条目数等于三个模式的步骤总数", () => {
        const stepCount = DAMAGE_MODES.reduce((sum, mode) => sum + mode.steps.length, 0)
        const result = queryModule("damage", { filters: { kind: "结算步骤" }, limit: 80 })

        expect(result.total).toBe(stepCount)
    })

    it("名词解释条目数等于术语总数", () => {
        const result = queryModule("damage", { filters: { kind: "名词解释" }, limit: 80 })

        expect(result.total).toBe(DAMAGE_TERMS.length)
    })

    it("按结算模式筛选只命中该模式的步骤", () => {
        const result = queryModule("damage", { filters: { mode: "DOT 伤害" }, limit: 80 })

        expect(result.total).toBe(getDamageMode("dot")!.steps.length)
        expect(result.entries.every(entry => entry.subtitle?.startsWith("DOT 伤害"))).toBe(true)
    })

    it("关键词能定位到具体步骤，并带上页面路径", () => {
        const result = queryModule("damage", { keyword: "暴击期望倍率" })

        expect(result.total).toBeGreaterThan(0)
        expect(result.entries.some(entry => entry.name === "暴击期望倍率")).toBe(true)
        expect(result.entries.every(entry => entry.path.startsWith("/db/damage"))).toBe(true)
    })
})
