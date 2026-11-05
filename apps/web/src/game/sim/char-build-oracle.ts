/**
 * CharBuild 伤害 oracle：core 只决定「何时 / 对谁 / 用哪个字段」，数值仍由 packages/data 结算。
 *
 * 与旧沙盒的差别只有一处：旧代码调用 `calculateRandomDamage`（内部 Math.random 掷暴击与 ±5% 浮动），
 * 这里取**期望值**（暴击期望乘区 = 1、浮动期望 = 1），因此同一事件序列逐位可复现。
 * 护盾 / 防御的分段结算顺序与 `calculateRandomDamage` 完全一致，core 的护盾吸收再还原同样结果。
 *
 * IR 的 `damage.field` 只有字段名（如「伤害」），不含技能基名；这里用 manifest 反查候选技能，
 * 歧义时取当前激活技能（`setActiveSkill`）。core 的 `DamageRequest` 缺 skillId，属于已知 API 缺口。
 */

import type { DamageOracle, DamageRequest, DamageResult } from "dna-builder-skill-sim/core"
import type { Action, SkillBehaviorDoc } from "dna-builder-skill-sim/schema"
import { type CharBuild, LeveledMonster } from "@/data"

export interface CharBuildDamagerOptions {
    charBuild: CharBuild
    doc: SkillBehaviorDoc
    /** 结算失败（字段 / 技能找不到时仍会走默认倍率，这里的失败指异常） */
    onError?: (error: unknown, request: DamageRequest) => void
}

export class CharBuildDamager {
    private readonly charBuild: CharBuild
    private readonly fieldSkills = new Map<string, number[]>()
    private readonly monsterCache = new Map<string, LeveledMonster>()
    private readonly onError?: (error: unknown, request: DamageRequest) => void
    private activeSkillId: number | undefined

    readonly oracle: DamageOracle

    constructor(options: CharBuildDamagerOptions) {
        this.charBuild = options.charBuild
        this.onError = options.onError
        for (const skill of Object.values(options.doc.skills)) {
            for (const field of collectDamageFields(skill.phases.flatMap(phase => phase.actions))) {
                const list = this.fieldSkills.get(field) ?? []
                if (!list.includes(skill.id)) list.push(skill.id)
                this.fieldSkills.set(field, list)
            }
        }
        this.oracle = { apply: request => this.evaluate(request) }
    }

    /** 当前激活技能：只用于消解同名字段的歧义 */
    setActiveSkill(skillId: number | undefined): void {
        this.activeSkillId = skillId
    }

    evaluate(request: DamageRequest): DamageResult {
        const { baseName, field } = this.resolveField(request.skillField)
        const enemy = this.monsterFor(request)
        const previousEnemy = this.charBuild.enemy
        const previousBaseName = this.charBuild.baseName
        this.charBuild.enemy = enemy
        // 字段（如「伤害」）的解析作用域由 baseName 决定：临时切到本次技能，结算完还原
        this.charBuild.baseName = baseName
        try {
            const [attrs] = this.charBuild.calculateByBasename(baseName)
            const damage = this.charBuild.calculateTargetFunction(attrs, field)
            const defenseMultiplier = this.charBuild.calculateDefenseMultiplier(attrs, undefined, (attrs.weapon?.暴击 || 0) === 0)
            return { damage: applyShieldSplit(damage, request.target.shield, defenseMultiplier), kind: "expected" }
        } catch (error) {
            this.onError?.(error, request)
            return { damage: 0, kind: "error" }
        } finally {
            this.charBuild.enemy = previousEnemy
            this.charBuild.baseName = previousBaseName
        }
    }

    private resolveField(skillField: string): { baseName: string; field: string } {
        const separator = skillField.indexOf("::")
        if (separator >= 0) {
            return { baseName: skillField.slice(0, separator), field: skillField.slice(separator + 2) || "伤害" }
        }
        const candidates = this.fieldSkills.get(skillField) ?? []
        const chosen =
            candidates.length === 1
                ? candidates[0]
                : this.activeSkillId !== undefined && candidates.includes(this.activeSkillId)
                  ? this.activeSkillId
                  : candidates[0]
        const baseName = chosen === undefined ? this.fallbackBaseName() : this.skillName(chosen)
        return { baseName: baseName ?? this.fallbackBaseName(), field: skillField }
    }

    private skillName(skillId: number): string | undefined {
        return this.charBuild.allSkills.find(skill => skill.id === skillId)?.名称
    }

    private fallbackBaseName(): string {
        return this.charBuild.baseName || this.charBuild.char.技能[0]?.名称 || "伤害"
    }

    private monsterFor(request: DamageRequest): LeveledMonster {
        const { level, def, maxHp, shield, id, meta } = request.target
        const faction = typeof meta?.faction === "number" ? meta.faction : 1
        const key = `${level}|${def}|${maxHp}|${faction}`
        let monster = this.monsterCache.get(key)
        if (!monster) {
            monster = new LeveledMonster({ id: 0, n: id, f: faction, atk: 0, def, hp: maxHp, es: shield }, level)
            monster.def = def
            monster.hp = maxHp
            this.monsterCache.set(key, monster)
        }
        monster.currentHP = request.target.hp
        monster.currentShield = shield
        return monster
    }
}

/** 与 CharBuild.calculateRandomDamage 相同的护盾 / 防御分段（只去掉随机项） */
function applyShieldSplit(damage: number, shield: number, defenseMultiplier: number): number {
    if (!Number.isFinite(damage) || damage <= 0) return 0
    if (shield > 0) return damage >= shield ? shield + (damage - shield) * defenseMultiplier : damage
    return damage * defenseMultiplier
}

function collectDamageFields(actions: readonly Action[]): string[] {
    const fields: string[] = []
    for (const action of actions) {
        if (action.kind === "damage") fields.push(action.field)
        else if (action.kind === "branch") fields.push(...collectDamageFields(action.then), ...collectDamageFields(action.else ?? []))
    }
    return fields
}
