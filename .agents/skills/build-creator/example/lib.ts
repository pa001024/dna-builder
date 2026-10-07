import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { CharBuild, ModTypeMap, ModTypeMaxSlot, buffMap, charMap, modData, modMap, weaponMap, type ModTypeKey } from "../../../../src/data"
import { createCharBuildFromSettings } from "../../../../src/data/CharBuildHelper"
import { createDefaultCharSettings } from "../../../../src/data/charSettings"
import { normalizeCharSettings } from "../../../../src/composables/useCharSettings"
import { LeveledModHelper, LeveledWeaponHelper } from "../../../../src/data/leveled/LeveledHelpers"
import { getPetBuffData, getPetTraits } from "../../../../src/data/petTrait"

export type SlotKey = "charMods" | "meleeMods" | "rangedMods"
export type ModSlotType = "角色" | "近战" | "远程"

export type AssistOption = { label: string; buffs: [string, number][] }
export type Spec = {
    charId: number
    base: Record<string, any>
    assist?: { axis: string; options: AssistOption[] }[]
    pets?: number[]
    required?: { charMods?: number[]; meleeMods?: number[]; rangedMods?: number[] }
    ablate?: { label: string; patch: Record<string, any> }[]
}

export type Cand = {
    id: number
    名称: string
    系列: string
    品质: string
    极性?: string
    耐受: number
    最大耐受?: number
    属性?: string
    限定?: string | number
}

export type State = { charMods: (Cand | null)[]; meleeMods: (Cand | null)[]; rangedMods: (Cand | null)[]; aura: Cand | null }

export const 亿 = (v: number) => (Number.isFinite(v) ? (v / 1e8).toFixed(3) : "N/A")

export function loadSpec(path = process.env.BUILD_SPEC ?? ".tmp/build-spec.json"): Spec {
    if (!existsSync(path)) {
        console.log(`缺少 spec 文件：${path}`)
        console.log(`先复制模板：cp .agents/skills/build-creator/example/spec.sample.json ${path}`)
        console.log(`再把 charId / base.meleeWeapon / base.rangedWeapon / customVariables 等填上。`)
        process.exit(0)
    }
    const spec: Spec = JSON.parse(readFileSync(path, "utf8"))
    if (!spec.charId) {
        console.log(`spec.charId 还是空的（${path}），先填一个真实角色 id。`)
        process.exit(0)
    }
    return spec
}

export function charOf(spec: Spec) {
    const c: any = charMap.get(spec.charId)
    if (!c) throw new Error(`角色 id ${spec.charId} 不在数据包里`)
    return c
}

export function baseSettings(spec: Spec): any {
    const c = charOf(spec)
    const 专武 = c.专武 as number | undefined
    const w: any = 专武 ? weaponMap.get(专武) : undefined
    const sig = w && (w.类型 as string[])?.includes("近战") ? { id: 专武!, type: "近战" as const } : w ? { id: 专武!, type: "远程" as const } : null
    return { ...createDefaultCharSettings(sig as any), ...spec.base }
}

export function patchOf(spec: Spec, patch: Record<string, any> = {}) {
    return { ...baseSettings(spec), ...patch }
}

export const settingsOf = patchOf

export function makeBuild(spec: Spec, patch: Record<string, any> = {}) {
    return createCharBuildFromSettings(spec.charId, normalizeCharSettings(patchOf(spec, patch) as any)) as any
}

export function evaluate(spec: Spec, patch: Record<string, any> = {}): number {
    try {
        const v = makeBuild(spec, patch).calculate()
        return Number.isFinite(v) ? v : Number.NaN
    } catch {
        return Number.NaN
    }
}

export function panel(build: any) {
    const a = build.calculateWeaponAttributes()
    return {
        充盈威力: a.充盈威力,
        生命: a.生命,
        攻击: Number(a.攻击),
        背水: a.背水,
        增伤: a.增伤,
        属性穿透: a.属性穿透,
    }
}

export function speciesOf(spec: Spec, id: number) {
    const w: any = weaponMap.get(id)
    return w ? { 伤害类型: w.伤害类型, 类别: (w.类型 as string[])?.[1] } : null
}

function 限定允许(spec: Spec, m: any, 类型: ModSlotType): boolean {
    if (m.限定 === undefined) return true
    const c = charOf(spec)
    if (类型 === "角色") {
        if (typeof m.限定 === "number") return c.id === m.限定
        return [c.名称, c.属性].includes(m.限定)
    }
    const s = speciesOf(spec, 类型 === "近战" ? spec.base.meleeWeapon : spec.base.rangedWeapon)
    if (!s) return false
    return typeof m.限定 === "string" && [s.伤害类型, s.类别].includes(m.限定)
}

export function modPool(spec: Spec, 类型: ModSlotType, opts: { aura?: boolean; exclude?: number[] } = {}): Cand[] {
    const c = charOf(spec)
    const out: Cand[] = []
    const specExclude: (number | string)[] = (spec as any).excludeMods ?? []
    for (const [id, raw] of modMap) {
        if (opts.exclude?.includes(id)) continue
        if (specExclude.includes(id) || specExclude.includes((raw as any).名称)) continue
        const m: any = raw
        if (m.类型 !== 类型) continue
        if (类型 === "角色") {
            const isAura = m.系列 === "羽蛇"
            if (!!opts.aura !== isAura) continue
        } else if (m.系列 === "羽蛇") continue
        if (m.属性 && m.属性 !== c.属性) continue
        if (!限定允许(spec, m, 类型)) continue
        out.push({ id, 名称: m.名称, 系列: m.系列, 品质: m.品质, 极性: m.极性, 耐受: m.耐受 ?? 0, 最大耐受: m.最大耐受, 属性: m.属性, 限定: m.限定 })
    }
    return out
}

const BUFF元数据 = new Set(["名称", "描述", "a", "lx", "mx", "id", "图标", "icon", "来源", "类型"])

function 归一对象(o: Record<string, any>): string {
    const ent = Object.entries(o).filter(([k]) => k !== "条件")
    ent.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    return JSON.stringify(Object.fromEntries(ent))
}

/**
 * 找出「队友携带的光环 BUFF 已经覆盖、自己再装会重复计算」的 MOD。
 *
 * 判据必须是**名字 + 数值签名双匹配**：光环 MOD 的 `生效`（去掉 `条件`）与 buffMap 项的
 * 属性字段完全一致，且 MOD 名 = BUFF 名去掉 `(属性)` 后缀。
 * 只按数值签名匹配会误伤实心同数值的无关 MOD（例如中枢 `51755 背水(风)` 与海妖
 * `56154 羽翼·鼓舞·背水` 都是 `背水 0.22`，但前者是中枢槽、完全不是同一个东西）。
 */
export function 光环自装排除(buffs: [string, number][]): number[] {
    const out = new Set<number>()
    for (const [name] of buffs) {
        const b: any = buffMap.get(name)
        if (!b) continue
        const 效果: Record<string, any> = {}
        for (const k of Object.keys(b)) if (!BUFF元数据.has(k)) 效果[k] = b[k]
        if (!Object.keys(效果).length) continue
        const sig = 归一对象(效果)
        const base = name.replace(/\([^)]*\)$/, "")
        for (const [id, m] of modMap) {
            const x: any = m
            if (x.名称 !== base) continue
            const 生: any = x.生效
            if (!生 || typeof 生 !== "object") continue
            if (归一对象(生) === sig) out.add(id)
        }
    }
    return [...out]
}

export const 归一系 = (m: Cand) => (m.系列 === "囚狼" && m.id > 100000 ? "囚狼1" : m.系列)

export function 互斥系(m: Cand): string[] {
    if (m.系列 === "囚狼" && m.id > 100000) return ["囚狼1"]
    if (m.系列 === "换生灵" || m.系列 === "海妖") return ["换生灵", "海妖"]
    return [m.系列]
}

export function legal(mods: (Cand | null)[]): boolean {
    const names = new Set<string>()
    const excluded = new Set<string>()
    for (const m of mods) {
        if (!m) continue
        if (m.系列 !== "契约者") {
            if (names.has(m.名称)) return false
            names.add(m.名称)
        }
        if (!(CharBuild.exclusiveSeries as string[]).includes(归一系(m))) continue
        const ex = 互斥系(m)
        for (const s of ex) if (excluded.has(s)) return false
        for (const s of ex) excluded.add(s)
    }
    return true
}

export function overCost(build: any): { key: SlotKey; cost: number; cap: number }[] {
    const 表: [SlotKey, ModSlotType][] = [
        ["charMods", "角色"],
        ["meleeMods", "近战"],
        ["rangedMods", "远程"],
    ]
    const out: { key: SlotKey; cost: number; cap: number }[] = []
    for (const [key, tab] of 表) {
        const cost = build.getModCostMax(tab)
        const cap = build.getModCap(tab)
        if (cost > cap) out.push({ key, cost, cap })
    }
    return out
}

export const toIds = (mods: (Cand | null)[]) => mods.map(m => (m ? [m.id, 10] : null))

export function requiredSlots(spec: Spec) {
    const out: Record<string, any> = {}
    for (const key of ["charMods", "meleeMods", "rangedMods"] as const) {
        const ids: number[] = (spec.required as any)?.[key] ?? []
        const arr: any[] = ids.slice(0, ModTypeMaxSlot[key]).map(id => [id, 10])
        while (arr.length < ModTypeMaxSlot[key]) arr.push(null)
        out[key] = arr
    }
    return out
}

export const modIdsOf = (build: any, key: SlotKey) => (build[key] as any[]).map(m => (m ? m.id : null))

export function dumpMods(build: any, key: SlotKey) {
    return (build[key] as any[]).map(m => (m ? `${m.名称}(${m.系列}/${m.品质}/${m.极性 ?? "无"}/${m.耐受})` : "空")).join("  ")
}

export function assistMatrix(spec: Spec): { label: string; buffs: [string, number][] }[] {
    const axes = spec.assist ?? []
    if (!axes.length) return [{ label: "（无辅助）", buffs: spec.base.buffs ?? [] }]
    let acc: { label: string; buffs: [string, number][] }[] = [{ label: "", buffs: [] }]
    for (const axis of axes) {
        const next: typeof acc = []
        for (const cur of acc) {
            for (const opt of axis.options) {
                next.push({ label: `${cur.label}${cur.label ? "+" : ""}${opt.label}`, buffs: [...cur.buffs, ...opt.buffs] })
            }
        }
        acc = next
    }
    return acc
}

export function withTeam(spec: Spec, buffs: [string, number][], patch: Record<string, any> = {}) {
    const base = spec.base.buffs ?? []
    return { ...patch, buffs: [...base, ...buffs] }
}

export const ASSIST_FILE = process.env.BUILD_ASSIST_FILE ?? ".tmp/build-assist.json"

export function saveChosenBuffs(label: string, buffs: [string, number][]) {
    writeFileSync(ASSIST_FILE, JSON.stringify({ label, buffs }, null, 1))
    console.log(`已写入 ${ASSIST_FILE}`)
}

export function chosenBuffs(): [string, number][] {
    if (!existsSync(ASSIST_FILE)) return []
    return JSON.parse(readFileSync(ASSIST_FILE, "utf8")).buffs ?? []
}

export function petCandidates(spec: Spec, patch: Record<string, any>, top = 5) {
    const rows: { petId: number; v: number }[] = []
    for (const petId of spec.pets ?? []) {
        const v = evaluate(spec, { ...patch, petId })
        rows.push({ petId, v })
    }
    rows.sort((a, b) => b.v - a.v)
    return { rows, best: rows.slice(0, top) }
}

export function traitGreedy(spec: Spec, patch: Record<string, any>) {
    // 候选 = 战斗潜质（有 buffName）**加上**「提升魔灵技能等级」类（如「老道」`petSkillLevelBonus`）。
    // 后者 buffName 为 null、不直接进属性结算，只通过 getEffectivePetLevel 抬魔灵等级，
    // 若按 `t.buffName` 过滤会被整类漏掉（实测该件单条边际 +4.4%，属搜索空间缺失）。
    const 候选 = getPetTraits().filter(t => t.buffName || t.petSkillLevelBonus)
    const 池 = new Map<number, any>()
    for (const t of 候选) {
        const cur = 池.get(t.bid)
        if (!cur || t.level > cur.level) 池.set(t.bid, t)
    }
    const slots: (any | null)[] = [null, null, null, null]
    const toTraits = () => slots.map(s => (s ? [s.bid, s.level] : null))
    const score = () => evaluate(spec, { ...patch, traits: toTraits() })
    let v = score()
    // 单槽贪心会被「成对才强」的组合卡住（如暴击率 + 暴击伤害：单收一条边际很小，
    // 一起收才显著）⇒ 每轮同时试「换 1 槽」与「成对换 2 槽」，取最优改进。
    for (let pass = 0; pass < 6; pass++) {
        let bestSwap: null | { i: number; a: any; j?: number; b?: any; v: number } = null
        const 试 = (i: number, a: any, j?: number, b?: any) => {
            const backupI = slots[i]
            const backupJ = j === undefined ? undefined : slots[j]
            slots[i] = a
            if (j !== undefined) slots[j] = b
            const nv = score()
            slots[i] = backupI
            if (j !== undefined) slots[j] = backupJ!
            if (nv > (bestSwap?.v ?? v) + 1 && (!bestSwap || nv > bestSwap.v)) bestSwap = { i, a, j, b, v: nv }
        }
        for (let i = 0; i < 4; i++) {
            for (const cand of 池.values()) {
                if (slots.some((s, k) => s && k !== i && (s as any).bid === cand.bid)) continue
                if (slots[i] && (slots[i] as any).bid === cand.bid) continue
                试(i, cand)
            }
        }
        for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) {
                for (const a of 池.values()) {
                    for (const b of 池.values()) {
                        if (a.bid === b.bid) continue
                        if ((slots[i] as any)?.bid === a.bid && (slots[j] as any)?.bid === b.bid) continue
                        const clash = slots.some((s, k) => s && k !== i && k !== j && ((s as any).bid === a.bid || (s as any).bid === b.bid))
                        if (clash) continue
                        试(i, a, j, b)
                    }
                }
            }
        }
        if (!bestSwap) break
        const sw = bestSwap as { i: number; a: any; j?: number; b?: any; v: number }
        slots[sw.i] = sw.a
        if (sw.j !== undefined) slots[sw.j] = sw.b
        v = sw.v
    }
    return { traits: toTraits(), v }
}

export function petActiveInfo(petId: number) {
    const d = getPetBuffData(petId)
    return { passive: d.passive?.名称 ?? null, active: d.active?.名称 ?? null }
}

function rng(seed: number) {
    let q = seed
    return () => ((q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}

export function optimize(
    spec: Spec,
    patch: Record<string, any>,
    opts: { seeds?: number; rounds?: number; passes?: number; log?: boolean } = {},
) {
    const { seeds = 6, rounds = 4, passes = 10, log = true } = opts
    const 光环排除 = 光环自装排除((patch.buffs ?? spec.base.buffs ?? []) as [string, number][])
    if (log) {
        console.log(
            `  队友光环已覆盖、自装会重复的 MOD：${光环排除.map(id => `${id}(${modMap.get(id)?.名称})`).join(", ") || "无"}`,
        )
    }
    const 角色池 = modPool(spec, "角色", { exclude: 光环排除 })
    const 近战池 = modPool(spec, "近战")
    const 远程池 = modPool(spec, "远程")
    const 中枢池 = modPool(spec, "角色", { aura: true })
    const 全部 = [...角色池, ...近战池, ...远程池, ...中枢池]
    const byId = new Map<number, Cand>(全部.map(m => [m.id, m]))
    const poolOf: Record<SlotKey, Cand[]> = { charMods: 角色池, meleeMods: 近战池, rangedMods: 远程池 }
    const 槽: SlotKey[] = ["charMods", "meleeMods", "rangedMods"]
    if (!中枢池.length) throw new Error("中枢候选为空：检查 spec.base.auraMod 与 modPool()")

    const req = spec.required ?? {}
    const 必带 = (key: SlotKey) => (req[key] ?? []).map(id => byId.get(id)!).filter(Boolean) as Cand[]

    const patchFor = (s: State) => ({ ...patch, charMods: toIds(s.charMods), meleeMods: toIds(s.meleeMods), rangedMods: toIds(s.rangedMods), auraMod: s.aura?.id ?? patch.auraMod })

    const sigOf = (s: State) =>
        `${s.aura?.id ?? 0}|${s.charMods.map(m => m?.id ?? 0).join(",")}|${s.meleeMods.map(m => m?.id ?? 0).join(",")}|${s.rangedMods.map(m => m?.id ?? 0).join(",")}`
    const memo = new Map<string, number>()

    function score(s: State): number {
        const sig = sigOf(s)
        const hit = memo.get(sig)
        if (hit !== undefined) return hit
        let out = -1
        if (槽.every(key => legal(s[key]))) {
            try {
                const b: any = makeBuild(spec, patchFor(s))
                if (!overCost(b).length) {
                    const v = b.calculate()
                    if (Number.isFinite(v)) out = v
                }
            } catch {
                out = -1
            }
        }
        memo.set(sig, out)
        return out
    }

    const clone = (s: State): State => ({ charMods: [...s.charMods], meleeMods: [...s.meleeMods], rangedMods: [...s.rangedMods], aura: s.aura })

    function climb(start: State, tag: string) {
        let cur = clone(start)
        let v = score(cur)
        for (let pass = 0; pass < passes; pass++) {
            let improved = false
            for (const a of 中枢池) {
                const next = clone(cur)
                next.aura = a
                const s = score(next)
                if (s > v + 1) {
                    v = s
                    cur = next
                    improved = true
                }
            }
            for (const key of 槽) {
                for (let i = 0; i < ModTypeMaxSlot[key]; i++) {
                    for (const cand of [null, ...poolOf[key]] as (Cand | null)[]) {
                        const next = clone(cur)
                        next[key][i] = cand
                        const s = score(next)
                        if (s > v + 1) {
                            v = s
                            cur = next
                            improved = true
                        }
                    }
                }
            }
            if (!improved) break
        }
        if (log) console.log(`  ${tag}: ${亿(v)} 亿`)
        return { v, state: cur }
    }

    function seedState(seed?: number): State {
        const s: State = { charMods: [], meleeMods: [], rangedMods: [], aura: 中枢池[0] ?? null }
        const 种子 = (key: SlotKey) => 必带(key)
        if (seed === undefined) {
            s.aura = byId.get(patch.auraMod) ?? s.aura
            for (const key of 槽) {
                const mods: (Cand | null)[] = Array(ModTypeMaxSlot[key]).fill(null)
                let i = 0
                for (const m of 种子(key)) mods[i++] = m
                s[key] = mods
            }
            return s
        }
        const r = rng(seed)
        const pick = (pl: Cand[]) => pl[Math.floor(r() * pl.length)]!
        s.aura = pick(中枢池)
        for (const key of 槽) {
            const pl = poolOf[key]
            const mods: (Cand | null)[] = Array(ModTypeMaxSlot[key]).fill(null)
            const fixed = 种子(key)
            let i = 0
            for (const m of fixed) mods[i++] = m
            for (; i < mods.length; i++) mods[i] = pick(pl)
            for (let t = 0; t < 400 && !legal(mods); t++) mods[fixed.length + Math.floor(r() * (mods.length - fixed.length))] = pick(pl)
            s[key] = mods
        }
        return s
    }

    let best = { v: -1, state: null as State | null }
    const starts: [State, string][] = [[seedState(), "必带种子"]]
    for (let i = 1; i <= seeds; i++) starts.push([seedState(i * 104729), `rand${i}`])
    for (const [st, tag] of starts) {
        const got = climb(st, tag)
        if (got.v > best.v) best = got
        if (!best.state) continue
        for (let r = 0; r < rounds; r++) {
            const p = clone(best.state)
            const key = 槽[Math.floor(rng(r + 1)() * 3)]!
            const i = Math.floor(rng(r + 7)() * ModTypeMaxSlot[key])
            const cands: (Cand | null)[] = [null, ...poolOf[key]]
            p[key][i] = cands[Math.floor(rng(r + 13)() * cands.length)]!
            const got2 = climb(p, `${tag}·扰动${r}`)
            if (got2.v > best.v) best = got2
        }
    }
    if (log) console.log(`  候选评估 ${memo.size} 次（含缓存）`)
    return best
}

export function stateToPatch(s: State) {
    return { charMods: toIds(s.charMods), meleeMods: toIds(s.meleeMods), rangedMods: toIds(s.rangedMods), auraMod: s.aura?.id }
}

export function ablation(
    spec: Spec,
    patch: Record<string, any>,
    items: { label: string; patch: Record<string, any> }[],
) {
    const base = evaluate(spec, patch)
    const rows = items.map(it => {
        const v = evaluate(spec, { ...patch, ...it.patch })
        return { label: it.label, v, delta: base > 0 && Number.isFinite(v) ? (v - base) / base : Number.NaN }
    })
    rows.sort((a, b) => a.delta - b.delta)
    return { base, rows }
}

export function printAblation(title: string, res: { base: number; rows: { label: string; v: number; delta: number }[] }) {
    console.log(`\n=== ${title} ===  基线 ${亿(res.base)} 亿`)
    for (const r of res.rows) {
        console.log(`  撤 ${r.label.padEnd(24)} ${亿(r.v).padStart(10)} 亿  ${(r.delta * 100).toFixed(2)}%`)
    }
}

export { CharBuild, ModTypeMap, ModTypeMaxSlot, charMap, modData, modMap, weaponMap, createCharBuildFromSettings, createDefaultCharSettings, normalizeCharSettings, LeveledModHelper, LeveledWeaponHelper, getPetBuffData, getPetTraits }
export type { ModTypeKey }
export function writeBuild(path: string, settings: any) {
    writeFileSync(path, JSON.stringify(settings, null, 1))
    console.log(`已写入 ${path}`)
}
