/**
 * U2 导出产物归一（`final/skill-behavior.json` → U3 `SkillAssetDoc`）。
 *
 * U2 与 U3 契约同名不同形：顶置 `blueprints` / `animBPs`、`lua.effects[].raw.TaskEffects`、
 * notify payload 用 `properties`、字节码写 `function` 而非 `fn`、负时间分支点等。
 * 这里只做确定性的形状归一与索引口径对齐，不解释游戏语义：
 * - 顶置蓝图/AnimBP 回挂到技能；
 * - SkillEffects 展平、notify 按 `通知名称` 展开、负时间 clamp；
 * - 主技能按角色顺序给 E/Q/P，**子技能一律 unknown**（不信任声明值，避免重复 E/Q）；
 * - 共享协战技能只归属 `packages/data` 索引认定的角色；角色技能表只保留主技能；
 * - 不在 `packages/data` 的技能 `characterId=0`（0 表示“无 data 技能语义”，含武器/宠物/缺失数据）；
 * - `Rate:"#N"` 仅在证据充分时保守解析（唯一伤害字段 + Lua 行为倍率）。
 *
 * ingest 直接调用本模块，因此 `tools/skill-workflow.ts build --input <U2>` 无需额外脚本。
 */

import type { SkillAssetBuff, SkillAssetDoc, SkillAssetEffect, SkillAssetSkill, SkillAssetTaskEffect } from "../schema/asset"
import type { Diagnostic, SkillDataIndex } from "./types"

export interface U2AuthoredBuff {
    id: number
    name?: string
    props?: Record<string, unknown>
    note?: string
}

export interface U2NormalizeOptions {
    index?: SkillDataIndex
    authoredBuffs?: U2AuthoredBuff[]
}

interface U2Notify {
    name?: string
    time?: number
    duration?: number
    endTime?: number
    payload?: {
        index?: number
        class?: string
        export?: string
        properties?: Record<string, unknown>
        payloadMatches?: number[]
        payloadSource?: string
    }
}

interface U2Effect {
    id?: number
    notifyNames?: string[]
    raw?: Record<string, unknown>
}

interface U2Skill {
    id: number
    characterId?: number | null
    owner?: { kind?: string; id?: number }
    slot?: string
    lua?: {
        behavior?: string
        fields?: unknown[]
        effects?: U2Effect[]
        buffIds?: unknown[]
        [key: string]: unknown
    }
    sources?: { montage?: string | null; montages?: string[]; bpPackages?: string[]; animBPs?: string[] }
    montage?: {
        asset?: string
        length?: number
        sections?: Record<string, unknown>[]
        segments?: Record<string, unknown>[]
        notifies?: U2Notify[]
        branchingPoints?: { notifyIndex?: number; time?: number; type?: string }[]
    } | null
    sequences?: unknown[]
    animBP?: unknown[] | null
}

interface U2Buff {
    id: number | string
    lua?: Record<string, unknown>
    bpPackages?: string[]
}

interface U2Doc {
    schemaVersion: number
    exporter?: Record<string, unknown>
    characters: { id: number; nameKey?: string; skills?: number[]; subSkills?: number[] }[]
    skills: Record<string, U2Skill>
    buffs: Record<string, U2Buff>
    blueprints?: Record<string, Record<string, unknown>>
    animBPs?: Record<string, Record<string, unknown>>
    coverage?: Record<string, unknown>
}

const NON_DAMAGE_FIELD = /半径|范围|提高|降低|减少|加成|比例|转化|持续|次数|数量|概率/

/** U2 顶层结构检测：有顶置蓝图/AnimBP 或技能带 owner/raw effects */
export function isU2Document(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    if (record.blueprints !== undefined || record.animBPs !== undefined) return true
    const skills = record.skills
    if (typeof skills !== "object" || skills === null || Array.isArray(skills)) return false
    for (const skill of Object.values(skills)) {
        if (typeof skill !== "object" || skill === null) continue
        const item = skill as Record<string, unknown>
        if (item.owner !== undefined) return true
        const lua = item.lua
        if (typeof lua === "object" && lua !== null) {
            const effects = (lua as Record<string, unknown>).effects
            if (Array.isArray(effects) && effects.some(effect => typeof effect === "object" && effect !== null && "raw" in effect)) {
                return true
            }
        }
    }
    return false
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined
}

function numeric(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/** 字节码表达式节点别名：U2 写 `function`，U3 `collectCalls` 认 `fn` */
function normalizeBytecode(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalizeBytecode)
    if (typeof value !== "object" || value === null) return value
    const node = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(node)) result[key] = normalizeBytecode(item)
    if (typeof node.function === "string" && result.fn === undefined) result.fn = node.function
    return result
}

function normalizeFields(fields: unknown[] | undefined): unknown[] {
    if (!Array.isArray(fields)) return []
    return fields.map(raw => {
        const field = asRecord(raw)
        const name = field.名称
        const normalized: Record<string, unknown> = { ...field }
        if (typeof name === "object" && name !== null) {
            const key = asString((name as Record<string, unknown>).key)
            normalized.名称 = key ?? JSON.stringify(name)
        } else if (typeof name === "string") {
            normalized.名称 = name
        }
        return normalized
    })
}

function normalizeEffects(effects: U2Effect[] | undefined): SkillAssetEffect[] {
    if (!Array.isArray(effects)) return []
    const result: SkillAssetEffect[] = []
    for (const raw of effects) {
        if (typeof raw !== "object" || raw === null) continue
        const item = asRecord(raw.raw)
        const taskEffects: SkillAssetTaskEffect[] = (
            Array.isArray(item.TaskEffects) ? (item.TaskEffects as Record<string, unknown>[]) : []
        ).map(task => {
            const normalized: Record<string, unknown> = { ...task }
            // 动态表达式（如 $Source:...$）不是 buff id：保留为 BuffIdExpression，避免被当引用校验
            if (typeof normalized.BuffId === "string" && normalized.BuffId.startsWith("$")) {
                normalized.BuffIdExpression = normalized.BuffId
                normalized.BuffId = undefined
            }
            return { Function: asString(normalized.Function) ?? "", ...normalized } as SkillAssetTaskEffect
        })
        result.push({
            ...item,
            TaskId: numeric(raw.id) ?? numeric(item.TaskId),
            NotifyName: Array.isArray(raw.notifyNames) ? (raw.notifyNames as string[]) : (item.NotifyName as string[] | undefined),
            TargetFilter: asString(item.TargetFilter),
            TaskEffects: taskEffects,
        })
    }
    return result
}

/** `Rate:"#N"` 只在唯一伤害字段 + Lua 行为倍率匹配时解析，否则保留占位由 build 记录缺口 */
function resolvePlaceholderRates(
    effects: SkillAssetEffect[],
    dataSkill: { fields?: { name: string; values: number | number[] }[] } | undefined,
    behavior: string | undefined
): number {
    if (!dataSkill?.fields || !behavior) return 0
    const candidates = dataSkill.fields.filter(field => field.name.includes("伤害") && !NON_DAMAGE_FIELD.test(field.name))
    if (candidates.length !== 1) return 0
    const candidate = candidates[0]!
    const base = typeof candidate.values === "number" ? candidate.values : candidate.values[0]
    if (base === undefined) return 0
    const rates = new Set(
        [...behavior.matchAll(/攻击([\d.]+)%/g)].map(match => Number(match[1]) / 100).filter(value => Number.isFinite(value))
    )
    if (![...rates].some(rate => Math.abs(rate - base) < 1e-6)) return 0
    const levelTen =
        typeof candidate.values === "number" ? candidate.values : (candidate.values[9] ?? candidate.values[candidate.values.length - 1])
    if (levelTen === undefined) return 0
    let resolved = 0
    for (const effect of effects) {
        for (const task of effect.TaskEffects ?? []) {
            if (task.Function !== "Damage" || typeof task.Rate !== "string" || !task.Rate.startsWith("#")) continue
            task.Rate = levelTen
            task.RateSource = "lua-behavior"
            resolved++
        }
    }
    return resolved
}

function collectBuffIds(effects: SkillAssetEffect[], extra: unknown[] | undefined): number[] {
    const ids = new Set<number>()
    for (const effect of effects) {
        for (const task of effect.TaskEffects ?? []) {
            if (task.Function === "AddBuff" && typeof task.BuffId === "number") ids.add(task.BuffId)
        }
    }
    for (const value of extra ?? []) if (typeof value === "number") ids.add(value)
    return [...ids].sort((a, b) => a - b)
}

function normalizeNotifies(notifies: U2Notify[] | undefined, effects: SkillAssetEffect[]): Record<string, unknown>[] {
    if (!Array.isArray(notifies)) return []
    const byNotifyName = new Map<string, number[]>()
    for (const effect of effects) {
        if (typeof effect.TaskId !== "number" || !Array.isArray(effect.NotifyName)) continue
        for (const name of effect.NotifyName) {
            const list = byNotifyName.get(name) ?? []
            list.push(effect.TaskId)
            byNotifyName.set(name, list)
        }
    }
    const effectIds = new Set(effects.map(effect => effect.TaskId).filter((id): id is number => typeof id === "number"))
    const result: Record<string, unknown>[] = []
    for (const raw of notifies) {
        const payload = asRecord(raw.payload)
        const properties = asRecord(payload.properties)
        const normalizedPayload: Record<string, unknown> = {
            ...properties,
            index: payload.index,
            class: payload.class,
            export: payload.export,
            payloadMatches: payload.payloadMatches,
            payloadSource: payload.payloadSource,
        }
        const effectName = asString(properties.通知名称) ?? asString(properties.NotifyName)
        const isSkillEffectNotify = String(raw.name ?? "").includes("SkillEffect")
        if (!isSkillEffectNotify) delete normalizedPayload.EffectId
        else if (typeof normalizedPayload.EffectId === "number" && !effectIds.has(normalizedPayload.EffectId))
            delete normalizedPayload.EffectId
        const matches = effectName ? (byNotifyName.get(effectName) ?? []) : []
        const base = {
            name: asString(raw.name) ?? "",
            time: Math.max(0, numeric(raw.time) ?? 0),
            duration: numeric(raw.duration),
            endTime: numeric(raw.endTime),
        }
        if (matches.length > 0) {
            for (const effectId of matches) result.push({ ...base, payload: { ...normalizedPayload, EffectId: effectId } })
        } else {
            result.push({ ...base, payload: normalizedPayload })
        }
    }
    return result
}

function normalizeMontage(skill: U2Skill, effects: SkillAssetEffect[]): SkillAssetSkill["montage"] | undefined {
    const montage = skill.montage
    if (!montage) return undefined
    return {
        length: numeric(montage.length),
        sections: (montage.sections ?? []).map(section => {
            const item = asRecord(section)
            return {
                name: asString(item.name) ?? "",
                begin: numeric(item.begin) ?? 0,
                length: numeric(item.length) ?? 0,
                next: asString(item.next) ?? null,
            }
        }),
        segments: (montage.segments ?? []).map(segment => {
            const item = asRecord(segment)
            return {
                sequence: asString(item.sequence) ?? "",
                start: numeric(item.start) ?? 0,
                end: numeric(item.end) ?? 0,
                rate: numeric(item.rate),
            }
        }),
        notifies: normalizeNotifies(montage.notifies, effects) as NonNullable<SkillAssetSkill["montage"]>["notifies"],
        branchingPoints: (montage.branchingPoints ?? []).map(point => ({
            notifyIndex: numeric(point.notifyIndex),
            time: Math.max(0, numeric(point.time) ?? 0),
            type: asString(point.type) ?? "Unknown",
        })),
    }
}

function normalizeBlueprint(skill: U2Skill, blueprints: Record<string, Record<string, unknown>>): SkillAssetSkill["blueprint"] | undefined {
    const packages = skill.sources?.bpPackages ?? []
    if (packages.length === 0) return undefined
    const functions = new Map<string, Record<string, unknown>>()
    const events: unknown[] = []
    const variables: unknown[] = []
    for (const packagePath of packages) {
        const blueprint = blueprints[packagePath]
        if (!blueprint) continue
        for (const raw of Array.isArray(blueprint.events) ? blueprint.events : []) events.push(normalizeBytecode(raw))
        for (const raw of Array.isArray(blueprint.variables) ? blueprint.variables : []) variables.push(normalizeBytecode(raw))
        for (const raw of Array.isArray(blueprint.functions) ? blueprint.functions : []) {
            const fn = asRecord(raw)
            const name = asString(fn.name)
            if (!name || functions.has(name)) continue
            functions.set(name, normalizeBytecode(fn) as Record<string, unknown>)
        }
    }
    if (functions.size === 0 && events.length === 0) return undefined
    return {
        events: events as NonNullable<SkillAssetSkill["blueprint"]>["events"],
        functions: [...functions.values()] as NonNullable<SkillAssetSkill["blueprint"]>["functions"],
        variables: variables as NonNullable<SkillAssetSkill["blueprint"]>["variables"],
    }
}

function normalizeAnimBP(skill: U2Skill, animBPs: Record<string, Record<string, unknown>>): SkillAssetSkill["animBP"] | undefined {
    const packagePath = skill.sources?.animBPs?.[0]
    if (!packagePath) return undefined
    const source = animBPs[packagePath]
    if (!source) return undefined
    return {
        stateMachines: Array.isArray(source.stateMachines) ? (source.stateMachines as Record<string, unknown>[]) : [],
        graph: Array.isArray(source.graph) ? (source.graph as Record<string, unknown>[]) : [],
    }
}

function normalizeBuff(key: string, buff: U2Buff): SkillAssetBuff {
    const props = asRecord(buff.lua)
    return {
        id: typeof buff.id === "string" || typeof buff.id === "number" ? buff.id : key,
        name: asString(props.Name) ?? asString(props.BuffName),
        lua: buff.lua,
        props,
        bpPackages: Array.isArray(buff.bpPackages) ? buff.bpPackages : undefined,
    }
}

function sortNumericRecord<T>(record: Record<string, T>): Record<string, T> {
    const result: Record<string, T> = {}
    for (const key of Object.keys(record).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))) result[key] = record[key]!
    return result
}

export function normalizeU2Document(
    raw: unknown,
    options: U2NormalizeOptions = {}
): {
    doc: SkillAssetDoc
    diagnostics: Diagnostic[]
} {
    const diagnostics: Diagnostic[] = []
    if (!isU2Document(raw)) {
        diagnostics.push({
            severity: "error",
            code: "u2.type",
            path: "",
            message: "不是 U2 SkillAssetDoc（缺少 blueprints/animBPs/owner/raw effects）",
        })
        return { doc: { schemaVersion: 1, characters: [], skills: {}, buffs: {} }, diagnostics }
    }
    const source = raw as U2Doc
    if (source.schemaVersion !== 1) {
        diagnostics.push({
            severity: "error",
            code: "u2.version",
            path: "schemaVersion",
            message: `不支持的 schemaVersion：${source.schemaVersion}`,
        })
        return { doc: { schemaVersion: 1, characters: [], skills: {}, buffs: {} }, diagnostics }
    }
    const index = options.index
    const dataOwner = new Map<number, number>()
    const inData = new Map<number, boolean>()
    for (const skill of Object.values(source.skills)) {
        const dataSkill = index?.getSkill(skill.id)
        inData.set(skill.id, Boolean(dataSkill))
        // packages/data 优先；缺失条目（子技能 / 非角色资产）保留 U2 声明归属，
        // 避免真实子技能被误标成 characterId=0（0 专门表示武器/MOD 等无角色语义）。
        const declared = skill.characterId ?? (skill.owner?.kind === "char" ? skill.owner.id : undefined)
        const owner = dataSkill?.characterId ?? declared
        if (owner !== undefined) dataOwner.set(skill.id, owner)
    }

    // 角色主技能顺序（用于 E/Q/P）；子技能不参与槽位判定。
    const mainOrder = new Map<number, number[]>()
    for (const character of source.characters) mainOrder.set(character.id, character.skills ?? [])
    const skills: Record<string, SkillAssetSkill> = {}
    let placeholderRateCount = 0
    for (const rawSkill of Object.values(source.skills)) {
        const owner = dataOwner.get(rawSkill.id)
        const slotOrder = (mainOrder.get(owner ?? -1) ?? []).indexOf(rawSkill.id)
        // 主技能按角色顺序 E/Q/P；子技能与非角色资产一律 unknown（不信任导出器的声明槽位）。
        const slot = slotOrder === 0 ? "E" : slotOrder === 1 ? "Q" : slotOrder === 2 ? "P" : "unknown"
        const effects = normalizeEffects(rawSkill.lua?.effects)
        placeholderRateCount += resolvePlaceholderRates(effects, index?.getSkill(rawSkill.id), rawSkill.lua?.behavior)
        const lua: SkillAssetSkill["lua"] = {
            ...(rawSkill.lua ?? {}),
            behavior: rawSkill.lua?.behavior,
            fields: normalizeFields(rawSkill.lua?.fields) as NonNullable<SkillAssetSkill["lua"]>["fields"],
            effects,
            buffIds: collectBuffIds(effects, rawSkill.lua?.buffIds),
        }
        const skill: SkillAssetSkill = {
            id: rawSkill.id,
            // 0 表示“无 packages/data 技能语义”（武器/宠物/缺失数据），不参与角色技能表。
            characterId: owner ?? 0,
            slot,
            lua,
            sources: {
                montage: rawSkill.sources?.montage ?? undefined,
                bpPackages: rawSkill.sources?.bpPackages ?? [],
                animBPs: rawSkill.sources?.animBPs ?? [],
            },
            montage: normalizeMontage(rawSkill, effects),
            sequences: Array.isArray(rawSkill.sequences) ? (rawSkill.sequences as SkillAssetSkill["sequences"]) : undefined,
            blueprint: normalizeBlueprint(rawSkill, source.blueprints ?? {}),
            animBP: normalizeAnimBP(rawSkill, source.animBPs ?? {}),
        }
        const hasEvidence =
            skill.montage !== undefined ||
            skill.blueprint !== undefined ||
            effects.length > 0 ||
            (rawSkill.lua?.behavior ?? "").length > 0 ||
            (skill.lua?.buffIds?.length ?? 0) > 0
        if (!hasEvidence) {
            // U3 schema 要求 sources 非空；显式标注为「无行为证据」的 authored 空技能，而不是伪造来源。
            skill.authored = { note: "U2 无 montage / SkillEffects / Lua 行为 / buffIds 证据，保留为空技能" }
        }
        skills[String(rawSkill.id)] = skill
    }

    // 每个角色最多一个 E/Q：主技能顺序已保证；再做一次防御性归一。
    for (const [characterId, order] of mainOrder) {
        const seen = new Set<string>()
        for (const skillId of order) {
            const skill = skills[String(skillId)]
            if (!skill) continue
            if (skill.slot === "E" || skill.slot === "Q" || skill.slot === "P") {
                if (seen.has(skill.slot)) {
                    diagnostics.push({
                        severity: "warn",
                        code: "u2.duplicate-slot",
                        path: `skills.${skillId}.slot`,
                        message: `角色 ${characterId} 出现重复槽位 ${skill.slot}，降级为 unknown`,
                    })
                    skill.slot = "unknown"
                } else {
                    seen.add(skill.slot)
                }
            }
        }
    }

    const buffs: Record<string, SkillAssetBuff> = {}
    for (const [key, buff] of Object.entries(source.buffs ?? {})) buffs[key] = normalizeBuff(key, buff)
    for (const item of options.authoredBuffs ?? []) {
        if (buffs[String(item.id)]) continue
        buffs[String(item.id)] = {
            id: item.id,
            name: item.name,
            lua: { authored: true, note: item.note },
            props: item.props,
        }
    }

    const characters = source.characters.map(character => {
        // U2 的 characters[].skills 本身就不含 subSkills；保留声明的主技能表（含共享协战技能）。
        // 槽位只由 mainOrder 前 3 项决定，其余主技能为 unknown，不影响 E/Q 解析。
        return {
            id: character.id,
            nameKey: character.nameKey ?? String(character.id),
            skills: [...new Set(character.skills ?? [])],
        }
    })

    const doc: SkillAssetDoc = {
        schemaVersion: 1,
        exporter: source.exporter
            ? {
                  gitCommit: asString(source.exporter.gitCommit),
                  parserVersion: typeof source.exporter.parserVersion === "number" ? source.exporter.parserVersion : undefined,
                  gameVersion: asString(source.exporter.gameVersion),
                  generatedAt: asString(source.exporter.generatedAt),
              }
            : undefined,
        characters: characters.sort((a, b) => a.id - b.id),
        skills: sortNumericRecord(skills),
        buffs: sortNumericRecord(buffs),
        coverage: source.coverage,
    }
    if (placeholderRateCount > 0) {
        diagnostics.push({
            severity: "info",
            code: "u2.rate-resolved",
            path: "skills",
            message: `按 Lua 行为文本保守解析了 ${placeholderRateCount} 个 Rate:"#N" 占位`,
        })
    }
    return { doc, diagnostics }
}
