/**
 * @file U7 parity 用的 CharBuild 适配器（测试侧；U8 可提升到 src/adapters）。
 *
 * IR 的 DamageAction 只带字段名 + tag，不带技能归属；这里用 `packages/data` 的 E/Q 技能表
 * 把 (field, tag) 解析回 CharBuild 的 `E::字段` / `Q::字段` 命名空间，再委托
 * `calculateTargetFunction()`——数值公式仍由 CharBuild 权威计算，不重写。
 */

import type { CharBuildSettingsInput } from "dna-builder-data/CharBuildHelper"
import { createCharBuildFromSettings } from "dna-builder-data/CharBuildHelper"
import { charMap } from "dna-builder-data/d"
import { CharBuildDamageOracle } from "../../src/core/oracle"

interface RawSkillField {
    名称: string
    tag?: string[]
}

interface RawSkill {
    id: number
    名称: string
    字段?: RawSkillField[]
}

export interface ParityHarness {
    build: ReturnType<typeof createCharBuildFromSettings>
    attrs: ReturnType<ReturnType<typeof createCharBuildFromSettings>["calculateWeaponAttributes"]>
    oracle: CharBuildDamageOracle
    /** 冻结基线同口径：CharBuild 的 E/Q 槽位命名空间 */
    damageFor(slot: "E" | "Q", field: string): number
    resolve(field: string, tag: string): { slot: "E" | "Q"; field: string } | undefined
}

export function createParityHarness(charId: number, settings: CharBuildSettingsInput): ParityHarness {
    const build = createCharBuildFromSettings(charId, settings)
    const attrs = build.calculateWeaponAttributes()
    const skills = ((charMap.get(charId)?.技能 ?? []) as unknown as RawSkill[]).slice(0, 2)
    const slots = ["E", "Q"] as const

    const damageFor = (slot: "E" | "Q", field: string): number => build.calculateTargetFunction(attrs, `${slot}::${field}`)

    const resolve = (field: string, tag: string): { slot: "E" | "Q"; field: string } | undefined => {
        const tags = tag
            .split(",")
            .map(value => value.trim())
            .filter(Boolean)
        let fallback: { slot: "E" | "Q"; field: string } | undefined
        for (const [index, skill] of skills.entries()) {
            const slot = slots[index]!
            for (const candidate of skill.字段 ?? []) {
                if (candidate.名称 !== field) continue
                const item = { slot, field: candidate.名称 }
                if (tags.length === 0) return item
                if (tags.every(value => candidate.tag?.includes(value))) return item
                fallback ??= item
            }
        }
        return fallback
    }

    const oracle = new CharBuildDamageOracle(req => {
        const resolved = resolve(req.skillField, req.tag)
        if (!resolved) throw new Error(`无法在角色 ${charId} 的 E/Q 中定位字段 ${req.skillField}（tag=${req.tag}）`)
        return { damage: damageFor(resolved.slot, resolved.field), kind: "charbuild" }
    })

    return { build, attrs, oracle, damageFor, resolve }
}
