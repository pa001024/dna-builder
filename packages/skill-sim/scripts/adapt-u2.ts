#!/usr/bin/env bun
/**
 * @file U2 导出产物适配器。
 *
 * U2 的 `final/skill-behavior.json` 与 U3 `SkillAssetDoc` 契约同名不同形（顶置 `blueprints` /
 * `animBPs`、`lua.effects[].raw.TaskEffects`、notify payload 用 `properties`、`function` 而非 `fn`、
 * 负时间分支点等）。本脚本只做**确定性形状归一**，不解释游戏语义：
 * - 把技能引用到的顶置蓝图/AnimBP 挂回 `skill.blueprint` / `skill.animBP`；
 * - 展平 SkillEffects 的 `raw`；
 * - 把 notify 的 `properties` 提升为 payload，并按 `通知名称` 关联 EffectId；
 * - 按 `packages/data` 索引口径归一技能归属与槽位（共享 T 技能只归属一个角色）；
 * - 注入显式标注的 authored buff（黎瑟 Q 负电荷 410122，来自 U5 pilot fixture）。
 *
 * 产物是可重复的 `SkillAssetDoc` JSON；manifest 仍由 `tools/skill-workflow.ts` 生成。
 */

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { createGameDataIndex } from "../src/pipeline/data-index.ts"
import type { SkillAssetBuff, SkillAssetDoc, SkillAssetEffect, SkillAssetSkill } from "../src/schema/asset.ts"

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
    blueprintErrors?: unknown[]
}

interface U2Buff {
    id: number | string
    lua?: Record<string, unknown>
    bpPackages?: string[]
    [key: string]: unknown
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

interface AuthoredBuff {
    id: number
    name?: string
    props?: Record<string, unknown>
    note?: string
}

const KNOWN_SLOTS = new Set(["E", "Q", "P", "A", "T", "R", "S", "unknown"])

function usage(): string {
    return [
        "用法：bun packages/skill-sim/scripts/adapt-u2.ts --input <final/skill-behavior.json> --out <asset.json> [--authored-buffs <file>]",
        "",
        "把 U2 导出器产物归一成 U3 `SkillAssetDoc`；不写游戏语义，不修改导出数据。",
    ].join("\n")
}

function parseArgs(argv: string[]): { input?: string; out?: string; authoredBuffs?: string; help: boolean } {
    const result: { input?: string; out?: string; authoredBuffs?: string; help: boolean } = { help: false }
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]!
        if (arg === "--help" || arg === "-h") result.help = true
        else if (arg === "--input") result.input = argv[++index]
        else if (arg === "--out") result.out = argv[++index]
        else if (arg === "--authored-buffs") result.authoredBuffs = argv[++index]
        else throw new Error(`未知参数：${arg}`)
    }
    return result
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

/** 把 U2 的 SkillEffects 条目（raw 嵌套）展平成 U3 `SkillAssetEffect` */
function normalizeEffects(effects: U2Effect[] | undefined): SkillAssetEffect[] {
    if (!Array.isArray(effects)) return []
    const result: SkillAssetEffect[] = []
    for (const raw of effects) {
        if (typeof raw !== "object" || raw === null) continue
        const item = asRecord(raw.raw)
        const taskEffects = (Array.isArray(item.TaskEffects) ? (item.TaskEffects as Record<string, unknown>[]) : []).map(task => {
            const normalized = { ...task }
            // 动态表达式（如 $Source:...$）不是 buff id：保留为 BuffIdExpression，避免被当引用校验
            if (typeof normalized.BuffId === "string" && normalized.BuffId.startsWith("$")) {
                normalized.BuffIdExpression = normalized.BuffId
                normalized.BuffId = undefined
            }
            return normalized
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

/** 与 packages/data 字段口径一致：排除半径/范围/提高等非伤害倍率字段 */
const NON_DAMAGE_FIELD = /半径|范围|提高|降低|减少|加成|比例|转化|持续|次数|数量|概率/

/**
 * `Rate: "#N"` 是 SkillDescValues 公式占位符；U2 产物没有公式，无法直接结构化。
 * 只在证据充分时保守解析：技能只有一个伤害候选字段，且 Lua 行为文本里的某个
 * `攻击NN.N%` 与该字段 1 级值一致 → 用该字段 10 级值替换 Rate（U3 按 10 级值匹配）。
 * 多候选字段 / 无行为文本时保持 `#N`，由 build 记录为无法解析，不猜测。
 */
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
        // U3 build 用 payload.EffectId 或 notify 名匹配 effects；U2 把效果名放在 properties.通知名称。
        // 同名 hit 可能对应多个 SkillEffects 条目（AddBuff + Damage + FX），按 U2 的 notifyNames 展开成多条 notify。
        const effectName = asString(properties.通知名称) ?? asString(properties.NotifyName)
        const effectIds = new Set(effects.map(effect => effect.TaskId).filter((id): id is number => typeof id === "number"))
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
        for (const raw of Array.isArray(blueprint.events) ? blueprint.events : []) {
            events.push(normalizeBytecode(raw))
        }
        for (const raw of Array.isArray(blueprint.variables) ? blueprint.variables : []) {
            variables.push(normalizeBytecode(raw))
        }
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

async function main(): Promise<number> {
    const args = parseArgs(process.argv.slice(2))
    if (args.help || !args.input || !args.out) {
        console.log(usage())
        return args.help ? 0 : 2
    }
    const source = JSON.parse(await Bun.file(args.input).text()) as U2Doc
    if (source.schemaVersion !== 1) throw new Error(`不支持的 schemaVersion：${source.schemaVersion}`)

    const index = createGameDataIndex()
    const dataOwner = new Map<number, number>()
    const declaredOwner = new Map<number, number>()
    for (const character of source.characters) {
        for (const skillId of character.skills ?? []) {
            if (!declaredOwner.has(skillId)) declaredOwner.set(skillId, character.id)
        }
    }
    for (const skill of Object.values(source.skills)) {
        const resolved = index.getSkill(skill.id)?.characterId
        const owner = resolved ?? skill.characterId ?? (skill.owner?.kind === "char" ? skill.owner.id : undefined)
        if (owner !== undefined) dataOwner.set(skill.id, owner)
    }

    // 共享协战技能只挂到 packages/data 索引认定的所属角色，避免 check 的重复归属门禁误报。
    const ownerSkills = new Map<number, number[]>()
    for (const [skillId, owner] of dataOwner) {
        const list = ownerSkills.get(owner) ?? []
        list.push(skillId)
        ownerSkills.set(owner, list)
    }
    // 槽位按角色技能原始顺序（而非 id 排序）判定 E/Q/P；第 4 项起是 A/T/协战，导出为 unknown。
    const characterOrder = new Map<number, number[]>()
    for (const character of source.characters) characterOrder.set(character.id, character.skills ?? [])

    const skills: Record<string, SkillAssetSkill> = {}
    let placeholderRateCount = 0
    for (const raw of Object.values(source.skills)) {
        const owner = dataOwner.get(raw.id)
        const slotOrder = (characterOrder.get(owner ?? -1) ?? []).indexOf(raw.id)
        const declared = asString(raw.slot)
        const slot =
            slotOrder === 0
                ? "E"
                : slotOrder === 1
                  ? "Q"
                  : slotOrder === 2
                    ? "P"
                    : slotOrder >= 3
                      ? "unknown"
                      : KNOWN_SLOTS.has(declared ?? "")
                        ? declared
                        : "unknown"
        const effects = normalizeEffects(raw.lua?.effects)
        const placeholderRates = resolvePlaceholderRates(effects, index.getSkill(raw.id), raw.lua?.behavior)
        placeholderRateCount += placeholderRates
        const lua: SkillAssetSkill["lua"] = {
            ...(raw.lua ?? {}),
            behavior: raw.lua?.behavior,
            fields: normalizeFields(raw.lua?.fields) as NonNullable<SkillAssetSkill["lua"]>["fields"],
            effects,
            buffIds: collectBuffIds(effects, raw.lua?.buffIds),
        }
        const inData = index.getSkill(raw.id) !== undefined
        skills[String(raw.id)] = {
            id: raw.id,
            characterId: inData ? dataOwner.get(raw.id) : undefined,
            slot,
            lua,
            sources: {
                montage: raw.sources?.montage ?? undefined,
                bpPackages: raw.sources?.bpPackages ?? [],
                animBPs: raw.sources?.animBPs ?? [],
            },
            montage: normalizeMontage(raw, effects),
            sequences: Array.isArray(raw.sequences) ? (raw.sequences as SkillAssetSkill["sequences"]) : undefined,
            blueprint: normalizeBlueprint(raw, source.blueprints ?? {}),
            animBP: normalizeAnimBP(raw, source.animBPs ?? {}),
        }
        const hasEvidence =
            skills[String(raw.id)]!.montage !== undefined ||
            skills[String(raw.id)]!.blueprint !== undefined ||
            effects.length > 0 ||
            (raw.lua?.behavior ?? "").length > 0 ||
            (skills[String(raw.id)]!.lua?.buffIds?.length ?? 0) > 0
        if (!hasEvidence) {
            // U3 schema 要求 sources 非空；显式标注为「无行为证据」的 authored 空技能，而不是伪造来源。
            skills[String(raw.id)]!.authored = { note: "U2 无 montage / SkillEffects / Lua 行为 / buffIds 证据，保留为空技能" }
        }
    }

    const buffs: Record<string, SkillAssetBuff> = {}
    for (const [key, buff] of Object.entries(source.buffs ?? {})) buffs[key] = normalizeBuff(key, buff)

    if (args.authoredBuffs) {
        const authored = JSON.parse(await Bun.file(args.authoredBuffs).text()) as AuthoredBuff[]
        for (const item of authored) {
            if (buffs[String(item.id)]) continue
            buffs[String(item.id)] = {
                id: item.id,
                name: item.name,
                lua: { authored: true, note: item.note },
                props: item.props,
            }
        }
    }

    const characters = source.characters.map(character => {
        const ownership = new Set(ownerSkills.get(character.id) ?? [])
        // 保留角色主技能顺序；共享 T 技能归属 data 索引的角色。
        const main = (character.skills ?? []).filter(skillId => ownership.has(skillId))
        const sub = (character.subSkills ?? []).filter(skillId => (dataOwner.get(skillId) ?? character.id) === character.id)
        return { id: character.id, nameKey: character.nameKey ?? String(character.id), skills: [...new Set([...main, ...sub])] }
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

    await mkdir(path.dirname(path.resolve(args.out)), { recursive: true })
    await writeFile(args.out, `${JSON.stringify(doc)}\n`, "utf8")
    const counts = {
        characters: doc.characters.length,
        skills: Object.keys(doc.skills).length,
        linkedBlueprints: Object.values(doc.skills).filter(skill => skill.blueprint).length,
        resolvedPlaceholderRates: placeholderRateCount,
        linkedAnimBPs: Object.values(doc.skills).filter(skill => skill.animBP).length,
        buffs: Object.keys(doc.buffs ?? {}).length,
    }
    console.log(`[adapt-u2] ${args.out}`)
    console.log(`  ${JSON.stringify(counts)}`)
    return 0
}

process.exit(await main())
