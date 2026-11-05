/**
 * ingest：读取导出器产物（单文件或按角色分片），做别名归一与合并，不解释语义。
 * 版本不支持时整份文件跳过（不猜测），并在 diagnostics 里报 error。
 */

import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import type {
    AuthoredBehavior,
    SkillAssetBuff,
    SkillAssetCharacter,
    SkillAssetDoc,
    SkillAssetSkill,
    SkillAuthoredOverridesDoc,
} from "../schema/asset"
import { validateSkillAssetDoc } from "../schema/validate-asset"
import { checkSchemaVersion } from "../schema/versions"
import { type Diagnostic, diagnostic, hasErrors, type SkillDataIndex } from "./types"
import { isU2Document, normalizeU2Document, type U2AuthoredBuff } from "./u2-adapter"

export interface IngestOptions {
    /** 外部 authored override：技能 id → 人工语义（`--overrides`） */
    overrides?: Record<string, AuthoredBehavior>
    /** packages/data 索引；提供后用其口径归一 U2 的归属/槽位/字段 */
    index?: SkillDataIndex
    /** 显式 authored buff（U2 缺少数值证据时由调用方注入） */
    authoredBuffs?: U2AuthoredBuff[]
}

export interface IngestResult {
    doc: SkillAssetDoc
    /** 实际读取的文件（绝对路径） */
    files: string[]
    diagnostics: Diagnostic[]
    ok: boolean
}

const OVERRIDE_FILE_PATTERN = /override/i

export async function ingestSkillAsset(input: string | SkillAssetDoc, options: IngestOptions = {}): Promise<IngestResult> {
    if (typeof input !== "string") {
        return ingestParsed([{ doc: input, source: "<memory>" }], [], options)
    }
    const diagnostics: Diagnostic[] = []
    const info = await stat(input).catch(() => undefined)
    if (!info) {
        diagnostics.push(diagnostic("error", "ingest.missing-input", "", `输入不存在：${input}`))
        return { doc: emptyDoc(), files: [], diagnostics, ok: false }
    }
    const files: string[] = []
    const shards: { doc: SkillAssetDoc; source: string }[] = []
    if (info.isDirectory()) {
        const entries = await readdir(input, { withFileTypes: true })
        const names = entries
            .filter(entry => entry.isFile() && entry.name.endsWith(".json") && !OVERRIDE_FILE_PATTERN.test(entry.name))
            .map(entry => entry.name)
            .sort()
        if (names.length === 0) {
            diagnostics.push(diagnostic("error", "ingest.empty-input", "", `目录内没有 *.json 分片：${input}`))
            return { doc: emptyDoc(), files: [], diagnostics, ok: false }
        }
        for (const name of names) {
            const file = path.join(input, name)
            files.push(file)
            const shard = await readShard(file, diagnostics, options)
            if (shard) shards.push({ doc: shard, source: file })
        }
    } else {
        files.push(input)
        const shard = await readShard(input, diagnostics, options)
        if (shard) shards.push({ doc: shard, source: input })
    }
    return ingestParsed(shards, files, options, diagnostics)
}

function emptyDoc(): SkillAssetDoc {
    return { schemaVersion: 1, skills: {}, buffs: {}, characters: [] }
}

async function readShard(file: string, diagnostics: Diagnostic[], options: IngestOptions = {}): Promise<SkillAssetDoc | undefined> {
    let text: string
    try {
        text = await readFile(file, "utf8")
    } catch (error) {
        diagnostics.push(diagnostic("error", "ingest.read", "", `读取失败 ${file}: ${String(error)}`))
        return undefined
    }
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch (error) {
        diagnostics.push(diagnostic("error", "ingest.parse", "", `JSON 解析失败 ${file}: ${String(error)}`))
        return undefined
    }
    return normalizeShard(raw, file, diagnostics, options)
}

/** 别名归一：导出器字段大小写 / 原始 fmodel 结构 → 契约字段。未知字段原样保留。 */
export function normalizeShard(
    raw: unknown,
    source: string,
    diagnostics: Diagnostic[],
    options: Pick<IngestOptions, "index" | "authoredBuffs"> = {}
): SkillAssetDoc | undefined {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        diagnostics.push(diagnostic("error", "ingest.type", "", `${source} 不是 JSON 对象`))
        return undefined
    }
    if (isU2Document(raw)) {
        const normalized = normalizeU2Document(raw, { index: options.index, authoredBuffs: options.authoredBuffs })
        diagnostics.push(...normalized.diagnostics)
        return normalized.doc
    }
    const value = raw as Record<string, unknown>
    const version = checkSchemaVersion(value.schemaVersion, "asset")
    if (!version.ok) {
        diagnostics.push(diagnostic("error", "ingest.version", "schemaVersion", version.message ?? "不支持的 schemaVersion"))
        return undefined
    }
    const doc: SkillAssetDoc = {
        schemaVersion: 1,
        exporter: isRecord(value.exporter) ? normalizeExporter(value.exporter) : undefined,
        characters: Array.isArray(value.characters) ? value.characters.map(normalizeCharacter) : [],
        skills: {},
        buffs: {},
    }
    const rawSkills = isRecord(value.skills) ? value.skills : {}
    if (!isRecord(value.skills)) {
        diagnostics.push(diagnostic("error", "ingest.type", "skills", `${source} 缺少 skills 对象`))
    }
    for (const [key, rawSkill] of Object.entries(rawSkills)) {
        if (!isRecord(rawSkill)) {
            diagnostics.push(diagnostic("error", "ingest.type", path.join("skills", key), "技能条目必须是对象"))
            continue
        }
        doc.skills[key] = normalizeSkill(key, rawSkill, diagnostics)
    }
    if (isRecord(value.buffs)) {
        for (const [key, rawBuff] of Object.entries(value.buffs)) {
            if (!isRecord(rawBuff)) {
                diagnostics.push(diagnostic("error", "ingest.type", path.join("buffs", key), "buff 条目必须是对象"))
                continue
            }
            doc.buffs![key] = normalizeBuff(key, rawBuff)
        }
    }
    return doc
}

function normalizeExporter(value: Record<string, unknown>): SkillAssetDoc["exporter"] {
    return {
        gitCommit: pickString(value.gitCommit),
        parserVersion: pickNumber(value.parserVersion),
        gameVersion: pickString(value.gameVersion),
        generatedAt: pickString(value.generatedAt),
    }
}

function normalizeCharacter(value: unknown): SkillAssetCharacter {
    const raw = isRecord(value) ? value : {}
    const id = pickNumber(raw.id) ?? 0
    const skills = Array.isArray(raw.skills) ? raw.skills.map(pickNumber).filter((n): n is number => n !== undefined) : []
    if (Array.isArray(raw.技能)) skills.push(...raw.技能.map(pickNumber).filter((n): n is number => n !== undefined))
    return {
        id,
        nameKey: pickString(raw.nameKey) ?? pickString(raw.name) ?? pickString(raw.名称) ?? String(id),
        skills: [...new Set(skills)],
    }
}

function normalizeSkill(key: string, raw: Record<string, unknown>, diagnostics: Diagnostic[]): SkillAssetSkill {
    const skillPath = joinPath("skills", key)
    const id = pickNumber(raw.id) ?? Number(key)
    const lua = isRecord(raw.lua) ? raw.lua : isRecord(raw.Lua) ? raw.Lua : undefined
    const sources = isRecord(raw.sources) ? raw.sources : isRecord(raw.Sources) ? raw.Sources : undefined
    const montage = isRecord(raw.montage) ? raw.montage : undefined
    const blueprint = isRecord(raw.blueprint) ? raw.blueprint : isRecord(raw.Blueprint) ? raw.Blueprint : undefined
    const authored = isRecord(raw.authored) ? (raw.authored as unknown as AuthoredBehavior) : undefined
    const normalized: SkillAssetSkill = {
        id: Number.isFinite(id) ? id : undefined,
        characterId: pickNumber(raw.characterId) ?? pickNumber(raw.CharacterId),
        slot: pickString(raw.slot) ?? pickString(raw.Slot),
        lua: lua as SkillAssetSkill["lua"],
        sources: sources
            ? {
                  montage: pickString(sources.montage) ?? pickString(sources.MontagePath),
                  bpPackages: pickStringArray(sources.bpPackages) ?? pickStringArray(sources.BPPackages),
                  animBPs: pickStringArray(sources.animBPs) ?? pickStringArray(sources.AnimBPs),
              }
            : undefined,
        montage: montage ? normalizeMontage(montage) : undefined,
        sequences: Array.isArray(raw.sequences) ? (raw.sequences as SkillAssetSkill["sequences"]) : undefined,
        blueprint: blueprint as SkillAssetSkill["blueprint"],
        animBP: isRecord(raw.animBP) ? (raw.animBP as SkillAssetSkill["animBP"]) : undefined,
        authored,
    }
    if (!Number.isFinite(id)) diagnostics.push(diagnostic("error", "ingest.skill-id", skillPath, `技能 id 无法从键或 id 字段解析：${key}`))
    return normalized
}

function normalizeMontage(raw: Record<string, unknown>): NonNullable<SkillAssetSkill["montage"]> {
    const notifiesRaw = Array.isArray(raw.notifies) ? raw.notifies : Array.isArray(raw.Notifies) ? raw.Notifies : []
    const branchingRaw = Array.isArray(raw.branchingPoints)
        ? raw.branchingPoints
        : Array.isArray(raw.BranchingPointMarkers)
          ? raw.BranchingPointMarkers
          : []
    const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : Array.isArray(raw.CompositeSections) ? raw.CompositeSections : []
    return {
        length: pickNumber(raw.length) ?? pickNumber(raw.SequenceLength),
        sections: sectionsRaw.map(section => {
            const item = isRecord(section) ? section : {}
            return {
                name: pickString(item.name) ?? pickString(item.SectionName) ?? "",
                begin: pickNumber(item.begin) ?? pickNumber(item.StartTime) ?? 0,
                length: pickNumber(item.length) ?? pickNumber(item.Duration) ?? 0,
                next: pickString(item.next) ?? pickString(item.NextSectionName),
            }
        }),
        segments: normalizeSegments(raw),
        notifies: notifiesRaw.map(notify => {
            const item = isRecord(notify) ? notify : {}
            return {
                ...item,
                name: pickString(item.name) ?? pickString(item.NotifyName) ?? "",
                time: pickNumber(item.time) ?? pickNumber(item.LinkValue) ?? pickNumber(item.BeginTime) ?? 0,
                duration: pickNumber(item.duration) ?? pickNumber(item.Duration),
                payload: isRecord(item.payload) ? (item.payload as Record<string, unknown>) : undefined,
            }
        }),
        branchingPoints: branchingRaw.map(point => {
            const item = isRecord(point) ? point : {}
            return {
                notifyIndex: pickNumber(item.notifyIndex),
                time: pickNumber(item.time) ?? pickNumber(item.LinkValue) ?? 0,
                type: pickString(item.type) ?? pickString(item.BranchingPointType) ?? "Unknown",
            }
        }),
    }
}

function normalizeSegments(raw: Record<string, unknown>): NonNullable<SkillAssetSkill["montage"]>["segments"] {
    if (Array.isArray(raw.segments)) return raw.segments as NonNullable<SkillAssetSkill["montage"]>["segments"]
    const tracks = Array.isArray(raw.SlotAnimTracks) ? raw.SlotAnimTracks : []
    const segments: NonNullable<NonNullable<SkillAssetSkill["montage"]>["segments"]> = []
    for (const track of tracks) {
        const item = isRecord(track) ? track : {}
        const animTrack = isRecord(item.AnimTrack) ? item.AnimTrack : {}
        const animSegments = Array.isArray(animTrack.AnimSegments) ? animTrack.AnimSegments : []
        for (const segment of animSegments) {
            const seg = isRecord(segment) ? segment : {}
            const reference = isRecord(seg.AnimReference) ? seg.AnimReference : {}
            segments.push({
                sequence: pickString(reference.ObjectName) ?? pickString(reference.ObjectPath) ?? "",
                start: pickNumber(seg.AnimStartTime) ?? 0,
                end: pickNumber(seg.AnimEndTime) ?? 0,
                rate: pickNumber(seg.AnimPlayRate),
            })
        }
    }
    return segments.length > 0 ? segments : undefined
}

function normalizeBuff(key: string, raw: Record<string, unknown>): SkillAssetBuff {
    const lua = isRecord(raw.lua) ? raw.lua : undefined
    const props = isRecord(raw.props) ? raw.props : isRecord(raw.Properties) ? raw.Properties : undefined
    const id = typeof raw.id === "string" || typeof raw.id === "number" ? raw.id : /^\d+$/.test(key) ? Number(key) : key
    return { id, name: pickString(raw.name), lua, props, bpPackages: pickStringArray(raw.bpPackages) }
}

function mergeAssets(shards: { doc: SkillAssetDoc; source: string }[], diagnostics: Diagnostic[]): SkillAssetDoc {
    const merged: SkillAssetDoc = { schemaVersion: 1, skills: {}, buffs: {}, characters: [] }
    const characters = new Map<number, SkillAssetCharacter>()
    for (const { doc, source } of shards) {
        if (!merged.exporter && doc.exporter) merged.exporter = doc.exporter
        for (const character of doc.characters ?? []) {
            const existing = characters.get(character.id)
            if (!existing) {
                characters.set(character.id, { ...character, skills: [...(character.skills ?? [])] })
            } else {
                existing.skills = [...new Set([...(existing.skills ?? []), ...(character.skills ?? [])])]
                if (!existing.nameKey && character.nameKey) existing.nameKey = character.nameKey
            }
        }
        for (const [key, skill] of Object.entries(doc.skills)) {
            if (merged.skills[key]) {
                diagnostics.push(
                    diagnostic("error", "ingest.duplicate-skill", joinPath("skills", key), `技能 ${key} 在多个分片重复（${source}）`)
                )
                continue
            }
            merged.skills[key] = skill
        }
        for (const [key, buff] of Object.entries(doc.buffs ?? {})) {
            if (merged.buffs![key]) {
                diagnostics.push(
                    diagnostic("warn", "ingest.duplicate-buff", joinPath("buffs", key), `buff ${key} 在多个分片重复（${source}），保留首个`)
                )
                continue
            }
            merged.buffs![key] = buff
        }
    }
    merged.characters = [...characters.values()].sort((a, b) => a.id - b.id)
    return merged
}

function ingestParsed(
    shards: { doc: SkillAssetDoc; source: string }[],
    files: string[],
    options: IngestOptions,
    initial: Diagnostic[] = []
): IngestResult {
    const diagnostics = [...initial]
    const merged = mergeAssets(shards, diagnostics)
    applyOverrides(merged, options.overrides, diagnostics)
    const validation = validateSkillAssetDoc(merged)
    for (const issue of validation.errors) diagnostics.push(diagnostic("error", issue.code, issue.path, issue.message))
    for (const issue of validation.warnings) diagnostics.push(diagnostic("warn", issue.code, issue.path, issue.message))
    return { doc: merged, files, diagnostics, ok: !hasErrors(diagnostics) }
}

/** `--overrides`：按技能 id 叠加 authored；目标技能不存在时只 warn（允许先写覆盖再等导出器） */
export function applyOverrides(
    doc: SkillAssetDoc,
    overrides: Record<string, AuthoredBehavior> | undefined,
    diagnostics: Diagnostic[]
): void {
    if (!overrides) return
    for (const [skillId, authored] of Object.entries(overrides)) {
        const skill = doc.skills[skillId]
        if (!skill) {
            diagnostics.push(
                diagnostic("warn", "ingest.orphan-override", joinPath("skills", skillId), `override 引用的技能 ${skillId} 不在导出数据中`)
            )
            continue
        }
        skill.authored = authored
    }
}

/** 读取 overrides JSON；接受 `{ schemaVersion, skills }` 或裸 `{ skillId: authored }` */
export async function loadOverrides(file: string): Promise<{ overrides: Record<string, AuthoredBehavior>; diagnostics: Diagnostic[] }> {
    const diagnostics: Diagnostic[] = []
    try {
        const raw = JSON.parse(await readFile(file, "utf8")) as unknown
        if (!isRecord(raw)) {
            diagnostics.push(diagnostic("error", "ingest.overrides", "", `${file} 不是 JSON 对象`))
            return { overrides: {}, diagnostics }
        }
        const doc = raw as unknown as Partial<SkillAuthoredOverridesDoc>
        if (doc.schemaVersion !== undefined) {
            const version = checkSchemaVersion(doc.schemaVersion, "behavior")
            if (!version.ok)
                diagnostics.push(diagnostic("error", "ingest.overrides-version", "schemaVersion", version.message ?? "不支持的版本"))
        }
        const map = isRecord(doc.skills) ? doc.skills : raw
        const overrides: Record<string, AuthoredBehavior> = {}
        for (const [key, value] of Object.entries(map)) {
            if (key === "schemaVersion" || key === "skills") continue
            if (!isRecord(value)) {
                diagnostics.push(diagnostic("error", "ingest.overrides", key, `override ${key} 必须是对象`))
                continue
            }
            overrides[key] = value as unknown as AuthoredBehavior
        }
        return { overrides, diagnostics }
    } catch (error) {
        diagnostics.push(diagnostic("error", "ingest.overrides", "", `读取 overrides 失败 ${file}: ${String(error)}`))
        return { overrides: {}, diagnostics }
    }
}

function pickNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

function pickString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined
}

function pickStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    return value.filter((item): item is string => typeof item === "string")
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function joinPath(base: string, key: string | number): string {
    return base ? `${base}.${key}` : String(key)
}
