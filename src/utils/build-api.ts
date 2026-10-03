import { useLocalStorage } from "@vueuse/core"
import type { Ref } from "vue"
import type { CharSettings, ModSlot, ModSlotType } from "@/composables/useCharSettings"
import {
    addModVariant,
    createDefaultCharSettings,
    getModVariantIndex,
    getModVariantLetter,
    getModVariantSlots,
    MOD_SLOT_COUNTS,
    normalizeCharSettings,
    removeLastModVariant,
    serializeCharSettings,
    setModVariantAura,
} from "@/composables/useCharSettings"
import type { CharBuild, ModTypeKey } from "@/data"
import {
    buffData,
    charData,
    LeveledBuffHelper,
    LeveledCharHelper,
    LeveledModHelper,
    LeveledMonsterHelper,
    LeveledPetHelper,
    LeveledWeaponHelper,
    modData,
    weaponData,
} from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { modMap, monsterData, monsterMap, petMap, weaponMap, weaponNameMap } from "@/data/d"
import petData, { petEntrys } from "@/data/d/pet.data"
import { normalizeTraitSlots, TRAIT_MAX_LEVEL, TRAIT_SLOT_COUNT, type TraitSlot } from "@/data/petTrait"
import type { useInvStore } from "@/store/inv"
import type {
    ApiResult,
    BuffEntry,
    BuffView,
    BuildApi,
    BuildState,
    CharBuildView,
    CharEntry,
    ModEntry,
    ModSlotView,
    ModType,
    PetEntry,
    TraitEntry,
    TraitView,
    WeaponEntry,
} from "@/utils/build-api.contract"
import { clickBuildTarget, pressBuildKey, readBuildPage, selectBuildOption, typeBuildText } from "@/utils/build-ui-driver"

export interface BuildApiHost {
    charSettings: Ref<CharSettings>
    selectedChar: Ref<string>
    charBuild: Ref<CharBuild>
    inv: ReturnType<typeof useInvStore>
    setChar: (name: string) => void
}

let current: BuildApi | null = null
let deadline = 0

export function setBuildApi(api: BuildApi | null): void {
    current = api
}

export function getBuildApi(): BuildApi | null {
    return current
}

export function setBuildDeadline(at: number): void {
    deadline = at
}

const charById = new Map(charData.map(item => [item.id, item]))
const charByName = new Map(charData.map(item => [item.名称, item]))
const modByName = new Map(modData.map(item => [item.名称, item]))
const weaponByName = new Map(weaponData.map(item => [item.名称, item]))
const petByName = new Map(petData.map(item => [item.名称, item]))
const buffByName = new Map(buffData.map(item => [item.名称, item]))
const monsterByName = new Map(monsterData.map(item => [item.n, item]))
const traitByBid = new Map<number, string>()
const traitBidsByName = new Map<string, number>()

for (const entry of petEntrys) {
    if (!traitByBid.has(entry.bid)) {
        traitByBid.set(entry.bid, entry.name)
    }
    traitBidsByName.set(entry.name, entry.bid)
}

const MOD_TYPES: ModType[] = ["角色", "近战", "远程", "同律"]

/** 契约里的槽位类型 → CharBuild / 库存侧的键名（两者命名不同，别混用） */
const MOD_TYPE_KEY: Record<ModType, ModTypeKey> = {
    角色: "charMods",
    近战: "meleeMods",
    远程: "rangedMods",
    同律: "skillMods",
}
const RESONANCE_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3]

function fail(error: string): ApiResult {
    return { ok: false, error, message: error }
}

function ok(message: string, damage?: number): ApiResult {
    return { ok: true, message, ...(damage === undefined ? {} : { damage }) }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function modEffectText(item: (typeof modData)[number]): string[] {
    const raw = (item as { 效果?: unknown }).效果
    if (typeof raw === "string") {
        return [raw]
    }
    if (Array.isArray(raw)) {
        return raw.map(entry => (typeof entry === "string" ? entry : String(entry))).slice(0, 6)
    }
    return []
}

function readDamage(build: CharBuild | null | undefined): number {
    try {
        const value = build?.calculate?.()
        return Number.isFinite(value) ? (value as number) : 0
    } catch {
        return 0
    }
}

function readAttributes(build: CharBuild | null | undefined): Record<string, number> {
    const raw = build?.calculateWeaponAttributes?.() ?? {}
    const out: Record<string, number> = {}

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === "number") {
            out[key] = value
        }
    }

    return out
}

function wrapBuild(build: CharBuild): CharBuildView {
    return {
        damage: async () => readDamage(build),
        attributes: async () => readAttributes(build),
        async bonus(attr, prefix = "角色", includeMods = true) {
            return build.getTotalBonus(attr, prefix, { includeMods })
        },
        async fullness() {
            return build.getFullnessWeaponSources().map(item => ({
                weapon: (item.weapon as { 名称?: string }).名称 ?? "",
                triggerRate: item.triggerRate,
                conversionRate: item.conversionRate,
                value: item.value,
            }))
        },
        async cost(type?: ModType) {
            if (type) {
                return { used: build.getModCost(type), cap: build.getModCap(type) }
            }
            const out = {} as Record<ModType, { used: number; cap: number }>
            for (const key of MOD_TYPES) {
                out[key] = { used: build.getModCost(key), cap: build.getModCap(key) }
            }
            return out
        },
        async mods(type) {
            return build.getMods(type).map(item => ({
                name: item?.名称 ?? "",
                level: item?.等级 ?? 0,
                tolerance: item?.耐受 ?? 0,
            }))
        },
        weapons: async () => ({ 近战: build.meleeWeapon.名称, 远程: build.rangedWeapon.名称 }),
        skills: async () => build.allSkills.map(item => item.名称),
        async variable(name) {
            const hit = build.customVariables.find(item => item[0] === name)
            if (!hit) {
                throw new Error(`当前构筑没有自定义变量「${name}」`)
            }
            return build.evaluateCustomVariableDefinition(hit[0], hit[1])
        },
        async eval(expression) {
            return build.evaluateAST(expression)
        },
        raw: build,
    } as CharBuildView
}

/**
 * 把等级化实例之类的活对象转成能跨线程传输的纯数据（结构化克隆不认类实例上的方法）。
 * @param value 原始值
 * @returns 纯数据
 */
export function toPlain(value: unknown): Record<string, unknown> {
    try {
        return JSON.parse(JSON.stringify(value ?? null)) as Record<string, unknown>
    } catch {
        return { 名称: String(value) }
    }
}

function parseSettings(json: string | Record<string, unknown>): CharSettings | null {
    try {
        const raw = typeof json === "string" ? JSON.parse(json) : json
        if (!raw || typeof raw !== "object") {
            return null
        }
        return normalizeCharSettings(raw as Partial<CharSettings>)
    } catch {
        return null
    }
}

export function createBuildApi(host: BuildApiHost): BuildApi {
    const logs: string[] = []
    const buildCache = new Map<string, CharBuild>()

    function cachedBuild(charId: number, settings: CharSettings): CharBuild {
        const key = `${charId}|${serializeCharSettings(settings)}`
        const hit = buildCache.get(key)
        if (hit) {
            return hit
        }
        const made = createCharBuildFromSettings(charId, settings, host.inv)
        buildCache.set(key, made)
        if (buildCache.size > 64) {
            const oldest = buildCache.keys().next().value
            if (oldest !== undefined) {
                buildCache.delete(oldest)
            }
        }
        return made
    }

    function record(text: string): void {
        logs.push(text)
        if (logs.length > 200) {
            logs.shift()
        }
    }

    function checkDeadline(): void {
        if (deadline && Date.now() > deadline) {
            throw new Error("执行超时：请把长任务拆成几段，或缩小循环次数")
        }
    }

    function damage(): number {
        return readDamage(host.charBuild.value)
    }

    function resolveMod(input: { name?: string; id?: number }): (typeof modData)[number] | null {
        if (typeof input.id === "number" && input.id > 0) {
            return modMap.get(input.id) ?? null
        }
        if (typeof input.name === "string" && input.name.trim()) {
            const mod = modByName.get(input.name.trim())
            if (mod) {
                return mod
            }
            const byId = Number(input.name)
            return Number.isFinite(byId) ? (modMap.get(byId) ?? null) : null
        }
        return null
    }

    function resolveWeapon(input: { name?: string; id?: number }): (typeof weaponData)[number] | null {
        if (typeof input.id === "number" && input.id > 0) {
            return weaponMap.get(input.id) ?? null
        }
        if (typeof input.name === "string" && input.name.trim()) {
            const weapon = weaponByName.get(input.name.trim())
            if (weapon) {
                return weapon
            }
            const byId = Number(input.name)
            return Number.isFinite(byId) ? (weaponMap.get(byId) ?? null) : null
        }
        return null
    }

    function resolveTraitBid(input: { name?: string; bid?: number }): number | null {
        if (typeof input.bid === "number" && input.bid > 0) {
            return traitByBid.has(input.bid) ? input.bid : null
        }
        if (typeof input.name === "string" && input.name.trim()) {
            return traitBidsByName.get(input.name.trim()) ?? null
        }
        return null
    }

    function currentTraits(): TraitSlot[] {
        return normalizeTraitSlots(host.charSettings.value.traits)
    }

    function writeTraits(list: ({ name?: string; bid?: number; level?: number } | null)[]): ApiResult {
        const slots: TraitSlot[] = Array.from({ length: TRAIT_SLOT_COUNT }, () => null)
        const used = new Set<number>()
        const names: string[] = []

        for (let index = 0; index < Math.min(TRAIT_SLOT_COUNT, list.length); index += 1) {
            const item = list[index]
            if (!item) {
                continue
            }
            const bid = resolveTraitBid(item)
            if (bid === null) {
                return fail(`找不到潜质「${item.name ?? item.bid}」，请用 build.data.traits({ keyword }) 查准确名称`)
            }
            if (used.has(bid)) {
                return fail(`潜质「${traitByBid.get(bid)}」重复占用多个槽位，同一潜质只能占一槽`)
            }
            used.add(bid)
            const level = clamp(Math.round(item.level ?? TRAIT_MAX_LEVEL), 1, TRAIT_MAX_LEVEL)
            slots[index] = [bid, level]
            names.push(`${traitByBid.get(bid)} r${level + 2}`)
        }

        host.charSettings.value.traits = slots
        record(`魔灵潜质设为 ${names.join("、") || "（全空）"}`)
        return ok(`魔灵潜质已更新：${names.join("、") || "（全空）"}`, damage())
    }

    function writeMods(type: ModType, list: ({ name?: string; id?: number; level?: number } | null)[], variant?: string): ApiResult {
        const index = variant ? getModVariantIndex(variant) : host.charSettings.value.modVariantIndex
        const slots = getModVariantSlots(host.charSettings.value, type, index)
        const next: ([number, number] | null)[] = Array.from({ length: MOD_SLOT_COUNTS[type] }, (_, position) => {
            const item = list[position]
            if (!item) {
                return null
            }
            const mod = resolveMod(item)
            return mod ? ([mod.id, clamp(Math.round(item.level ?? 10), 0, 10)] as [number, number]) : null
        })
        const names: string[] = []
        const missing: string[] = []

        for (const item of list) {
            if (!item) {
                continue
            }
            const mod = resolveMod(item)
            if (mod) {
                names.push(mod.名称)
            } else {
                missing.push(String(item.name ?? item.id))
            }
        }

        if (missing.length) {
            return fail(`找不到魔之楔：${missing.join("、")}，请用 build.data.mods({ keyword }) 查准确名称`)
        }

        slots.splice(0, slots.length, ...(next as ModSlot[]))
        record(`${type}MOD${variant ? `（配置 ${getModVariantLetter(index)}）` : ""} 设为 ${names.join("、") || "（全空）"}`)
        return ok(`${type}MOD 已更新：${names.join("、") || "（全空）"}`, damage())
    }

    function state(): BuildState {
        const settings = host.charSettings.value
        const build = host.charBuild.value
        const charId = build?.char?.id ?? charByName.get(host.selectedChar.value)?.id ?? 0
        const mods = {} as BuildState["mods"]

        for (const type of MOD_TYPES) {
            const slots = getModVariantSlots(settings, type)
            mods[type] = Array.from({ length: MOD_SLOT_COUNTS[type] }, (_, position): ModSlotView => {
                const slot = slots[position]
                return {
                    index: position,
                    id: slot ? slot[0] : null,
                    name: slot ? (modMap.get(slot[0])?.名称 ?? `#${slot[0]}`) : null,
                    level: slot ? slot[1] : null,
                }
            })
        }

        const pet = petMap.get(settings.petId)
        const aura = modMap.get(settings.auraMod)
        const traits = currentTraits()

        return {
            char: host.selectedChar.value,
            charId,
            charLevel: settings.charLevel,
            skillLevel: settings.charSkillLevel,
            hpPercent: settings.hpPercent,
            resonanceGain: settings.resonanceGain,
            isRouge: settings.isRouge,
            extraMastery: settings.extraMastery,
            imbalance: settings.imbalance,
            useGlobal: settings.useGlobal,
            timelineDPS: settings.timelineDPS,
            variant: getModVariantLetter(settings.modVariantIndex),
            variantCount: 1 + (settings.modVariants?.length ?? 0),
            aura: aura ? { id: aura.id, name: aura.名称 } : null,
            melee: {
                id: settings.meleeWeapon,
                name: weaponMap.get(settings.meleeWeapon)?.名称 ?? `#${settings.meleeWeapon}`,
                level: settings.meleeWeaponLevel,
                refine: settings.meleeWeaponRefine,
            },
            ranged: {
                id: settings.rangedWeapon,
                name: weaponMap.get(settings.rangedWeapon)?.名称 ?? `#${settings.rangedWeapon}`,
                level: settings.rangedWeaponLevel,
                refine: settings.rangedWeaponRefine,
            },
            mods,
            pet: pet
                ? {
                      id: settings.petId,
                      name: pet.名称,
                      level: settings.petLevel,
                      coverage: settings.petCoverage,
                      autoCoverage: settings.petAutoCoverage,
                  }
                : null,
            traits: Array.from({ length: TRAIT_SLOT_COUNT }, (_, index): TraitView => {
                const slot = traits[index]
                return {
                    index,
                    bid: slot ? slot[0] : null,
                    name: slot ? (traitByBid.get(slot[0]) ?? `#${slot[0]}`) : null,
                    level: slot ? slot[1] : null,
                }
            }),
            buffs: settings.buffs.map(([name, level, coverage]): BuffView => ({ name, level, coverage: coverage ?? 1 })),
            customBuff: settings.customBuff.map(([property, value]) => ({ property, value })),
            team: {
                1: readTeam(1, settings),
                2: readTeam(2, settings),
            },
            enemy: {
                id: settings.enemyId,
                name: monsterMap.get(settings.enemyId)?.n ?? `#${settings.enemyId}`,
                level: settings.enemyLevel,
                resistance: settings.enemyResistance,
            },
            base: settings.baseName,
            target: settings.targetFunction,
            variables: settings.customVariables.map(([name, expression]) => ({ name, expression })),
            dot: { ...settings.dotSettings },
            damage: readDamage(build),
        }
    }

    function readTeam(slot: 1 | 2, settings: CharSettings): BuildState["team"][1] {
        const charKey = slot === 1 ? "team1" : "team2"
        const weaponKey = slot === 1 ? "team1Weapon" : "team2Weapon"
        const buildKey = slot === 1 ? "team1Build" : "team2Build"
        const variantKey = slot === 1 ? "team1BuildVariant" : "team2BuildVariant"
        const charId = settings[charKey]
        const weaponId = settings[weaponKey]

        return {
            slot,
            char: typeof charId === "number" ? (charById.get(charId)?.名称 ?? `#${charId}`) : null,
            weapon: typeof weaponId === "number" ? (weaponMap.get(weaponId)?.名称 ?? `#${weaponId}`) : null,
            build: settings[buildKey] === "-" ? null : settings[buildKey],
            variant: settings[variantKey],
        }
    }

    const api: BuildApi = {
        state: async () => state(),
        damage: async () => damage(),
        async attributes() {
            return readAttributes(host.charBuild.value)
        },
        async log() {
            return [...logs]
        },

        async char(name) {
            checkDeadline()
            const char = charByName.get(name.trim())
            if (!char) {
                return fail(
                    `找不到角色「${name}」，可用角色示例：${charData
                        .slice(0, 8)
                        .map(item => item.名称)
                        .join("、")}`
                )
            }
            host.setChar(char.名称)
            record(`切换角色为 ${char.名称}`)
            return ok(`已切换角色为 ${char.名称}`)
        },

        async level(input) {
            checkDeadline()
            const settings = host.charSettings.value
            if (input.char !== undefined) {
                settings.charLevel = clamp(Math.round(input.char), 1, 80)
            }
            if (input.skill !== undefined) {
                settings.charSkillLevel = clamp(Math.round(input.skill), 1, 12)
            }
            record(`等级设为 角色${settings.charLevel} 技能${settings.charSkillLevel}`)
            return ok(`角色等级 ${settings.charLevel}，技能等级 ${settings.charSkillLevel}`, damage())
        },

        async settings(input) {
            checkDeadline()
            const settings = host.charSettings.value
            const touched: string[] = []

            if (input.hpPercent !== undefined) {
                settings.hpPercent = clamp(input.hpPercent, 0, 1)
                touched.push(`血量${Math.round(settings.hpPercent * 100)}%`)
            }
            if (input.resonanceGain !== undefined) {
                const nearest = RESONANCE_STEPS.reduce((best, step) =>
                    Math.abs(step - input.resonanceGain!) < Math.abs(best - input.resonanceGain!) ? step : best
                )
                settings.resonanceGain = nearest
                touched.push(`和鸣增益${nearest}`)
            }
            if (input.isRouge !== undefined) {
                settings.isRouge = input.isRouge === true
                touched.push(`Rouge${settings.isRouge ? "开" : "关"}`)
            }
            if (input.extraMastery !== undefined) {
                settings.extraMastery = input.extraMastery
                touched.push(`额外精通${input.extraMastery || "无"}`)
            }
            if (input.imbalance !== undefined) {
                settings.imbalance = input.imbalance === true
                touched.push(`失衡${settings.imbalance ? "开" : "关"}`)
            }
            if (input.useGlobal !== undefined) {
                settings.useGlobal = input.useGlobal === true
                touched.push(`全局背包特效${settings.useGlobal ? "开" : "关"}`)
            }
            if (input.timelineDPS !== undefined) {
                settings.timelineDPS = input.timelineDPS === true
                touched.push(`时间轴DPS${settings.timelineDPS ? "开" : "关"}`)
            }

            if (!touched.length) {
                return fail("没有给出要修改的字段")
            }

            record(`基本设置：${touched.join("、")}`)
            return ok(`已更新 ${touched.join("、")}`, damage())
        },

        async weapon(input) {
            checkDeadline()
            const weapon = resolveWeapon(input)
            if (!weapon) {
                return fail(`找不到武器「${input.name ?? input.id}」，请用 build.data.weapons({ keyword }) 查准确名称`)
            }
            const settings = host.charSettings.value
            const isMelee = input.slot === "melee"
            const prefix = isMelee ? "meleeWeapon" : "rangedWeapon"
            const level = input.level ?? (isMelee ? settings.meleeWeaponLevel : settings.rangedWeaponLevel)
            const refine = input.refine ?? (isMelee ? settings.meleeWeaponRefine : settings.rangedWeaponRefine)
            settings[prefix] = weapon.id
            settings[`${prefix}Level` as "meleeWeaponLevel"] = clamp(Math.round(level), 1, 80)
            settings[`${prefix}Refine` as "meleeWeaponRefine"] = clamp(Math.round(refine), 1, 5)
            record(`${isMelee ? "近战" : "远程"}武器换为 ${weapon.名称}（Lv.${level} 精炼${refine}）`)
            return ok(`已装备${isMelee ? "近战" : "远程"}武器 ${weapon.名称}`, damage())
        },

        async effect(input) {
            checkDeadline()
            const source = input.source === "weapon" ? "weapon" : "mod"
            const found = source === "mod" ? resolveMod(input) : resolveWeapon(input)
            if (!found) {
                return fail(`找不到${source === "mod" ? "魔之楔" : "武器"}「${input.name ?? input.id}」`)
            }
            const level = clamp(Math.round(input.level), 0, 10)
            if (source === "mod") {
                host.inv.setBuffLv(found.id, level)
            } else {
                host.inv.setWBuffLv(found.id, level)
            }
            record(`${found.名称} 特效等级设为 ${level}`)
            return ok(`${found.名称} 特效等级已设为 ${level}`, damage())
        },

        async mod(input) {
            checkDeadline()
            const slots = getModVariantSlots(host.charSettings.value, input.type)
            if (input.slot < 0 || input.slot >= MOD_SLOT_COUNTS[input.type]) {
                return fail(`${input.type}只有 ${MOD_SLOT_COUNTS[input.type]} 个槽位，slot 需在 0-${MOD_SLOT_COUNTS[input.type] - 1} 之间`)
            }
            const remove = !input.name && !input.id
            const mod = remove ? null : resolveMod(input)
            if (!remove && !mod) {
                return fail(`找不到魔之楔「${input.name ?? input.id}」，请用 build.data.mods({ keyword }) 查准确名称`)
            }
            slots[input.slot] = mod ? [mod.id, clamp(Math.round(input.level ?? 10), 0, 10)] : null
            record(`${input.type}槽 ${input.slot + 1} ${mod ? `装上 ${mod.名称}` : "已卸下"}`)
            return ok(mod ? `${input.type}槽 ${input.slot + 1} 装上 ${mod.名称}` : `${input.type}槽 ${input.slot + 1} 已卸下`, damage())
        },

        async mods(input) {
            checkDeadline()
            return writeMods(input.type, input.list, input.variant)
        },

        async aura(nameOrId) {
            checkDeadline()
            const mod =
                typeof nameOrId === "number"
                    ? (modMap.get(nameOrId) ?? null)
                    : (modByName.get(String(nameOrId).trim()) ?? modMap.get(Number(nameOrId)) ?? null)
            if (!mod) {
                return fail(`找不到魔之楔「${nameOrId}」`)
            }
            setModVariantAura(host.charSettings.value, mod.id)
            record(`中枢魔之楔换为 ${mod.名称}`)
            return ok(`中枢魔之楔已设为 ${mod.名称}`, damage())
        },

        async variant(letter) {
            checkDeadline()
            const index = getModVariantIndex(letter)
            const settings = host.charSettings.value
            if (index > settings.modVariants.length) {
                return fail(`没有配置 ${String(letter).toUpperCase()}，当前只有 ${settings.modVariants.length + 1} 份`)
            }
            settings.modVariantIndex = index
            record(`切换到 MOD 变体 ${getModVariantLetter(index)}`)
            return ok(`已切换到配置 ${getModVariantLetter(index)}`, damage())
        },

        async addVariant() {
            checkDeadline()
            const index = addModVariant(host.charSettings.value)
            if (index < 0) {
                return fail("已有 A/B/C 三份配置，不能再新增")
            }
            record(`新增 MOD 变体 ${getModVariantLetter(index)}`)
            return ok(`已新增配置 ${getModVariantLetter(index)} 并切换过去`, damage())
        },

        async removeVariant() {
            checkDeadline()
            const removed = removeLastModVariant(host.charSettings.value)
            if (!removed) {
                return fail("只有配置 A 时不能删除")
            }
            record("删除末尾的 MOD 变体")
            return ok(`已删除末尾配置，当前在配置 ${getModVariantLetter(host.charSettings.value.modVariantIndex)}`, damage())
        },

        async pet(input) {
            checkDeadline()
            const pet =
                typeof input.id === "number" && input.id > 0
                    ? (petMap.get(input.id) ?? null)
                    : input.name
                      ? (petByName.get(input.name.trim()) ?? petMap.get(Number(input.name)) ?? null)
                      : null
            if (!pet) {
                return fail(`找不到魔灵「${input.name ?? input.id}」，请用 build.data.pets({ keyword }) 查准确名称`)
            }
            const settings = host.charSettings.value
            settings.petId = pet.id
            if (input.level !== undefined) {
                settings.petLevel = clamp(Math.round(input.level), 0, 3)
            }
            if (input.coverage !== undefined) {
                settings.petCoverage = clamp(input.coverage, 0, 1)
                settings.petAutoCoverage = false
            }
            if (input.autoCoverage !== undefined) {
                settings.petAutoCoverage = input.autoCoverage === true
            }
            record(`魔灵换为 ${pet.名称}（突破${settings.petLevel}）`)
            return ok(`已选择魔灵 ${pet.名称}`, damage())
        },

        async trait(input) {
            checkDeadline()
            const slots = currentTraits()
            if (input.slot < 0 || input.slot >= TRAIT_SLOT_COUNT) {
                return fail(`潜质只有 ${TRAIT_SLOT_COUNT} 个槽位，slot 需在 0-${TRAIT_SLOT_COUNT - 1} 之间`)
            }
            const list = slots.map(slot => (slot ? { bid: slot[0], level: slot[1] } : null)) as ({
                bid?: number
                level?: number
            } | null)[]
            if (input.name === "" || input.bid === 0) {
                list[input.slot] = null
            } else {
                const bid = resolveTraitBid(input)
                if (bid === null) {
                    return fail(`找不到潜质「${input.name ?? input.bid}」，请用 build.data.traits({ keyword }) 查准确名称`)
                }
                list[input.slot] = { bid, level: input.level }
            }
            return writeTraits(list)
        },

        async traits(list) {
            checkDeadline()
            return writeTraits(list)
        },

        async buff(name, level, coverage) {
            checkDeadline()
            const buff = buffByName.get(String(name).trim())
            if (!buff) {
                return fail(`找不到 BUFF「${name}」，请用 build.data.buffs({ keyword }) 查准确名称`)
            }
            return api.buffs([{ name: buff.名称, level, coverage }])
        },

        async removeBuff(name) {
            checkDeadline()
            const settings = host.charSettings.value
            const index = settings.buffs.findIndex(item => item[0] === String(name).trim())
            if (index === -1) {
                return fail(`当前没有启用 BUFF「${name}」`)
            }
            settings.buffs.splice(index, 1)
            record(`移除 BUFF ${name}`)
            return ok(`已移除 BUFF ${name}`, damage())
        },

        async buffs(list) {
            checkDeadline()
            const settings = host.charSettings.value
            const missing: string[] = []
            const next: [string, number, number?][] = []

            for (const item of list ?? []) {
                const buff = buffByName.get(String(item.name).trim())
                if (!buff) {
                    missing.push(String(item.name))
                    continue
                }
                const level = item.level ?? 1
                if (level <= 0) {
                    continue
                }
                next.push(item.coverage === undefined ? [buff.名称, level] : [buff.名称, level, clamp(item.coverage, 0, 1)])
            }

            if (missing.length) {
                return fail(`找不到 BUFF：${missing.join("、")}，请用 build.data.buffs({ keyword }) 查准确名称`)
            }

            settings.buffs = next
            record(`BUFF 设为 ${next.map(item => `${item[0]}×${item[1]}`).join("、") || "（清空）"}`)
            return ok(`已设置 ${next.length} 个 BUFF`, damage())
        },

        async customBuff(property, value) {
            checkDeadline()
            const settings = host.charSettings.value
            const index = settings.customBuff.findIndex(item => item[0] === property)
            if (value === 0) {
                if (index !== -1) {
                    settings.customBuff.splice(index, 1)
                }
                record(`移除自定义 BUFF ${property}`)
                return ok(`已移除自定义 BUFF ${property}`, damage())
            }
            const entry: [string, number] = [property, value]
            if (index === -1) {
                settings.customBuff.push(entry)
            } else {
                settings.customBuff[index] = entry
            }
            record(`自定义 BUFF ${property} = ${value}`)
            return ok(`自定义 BUFF ${property} 已设为 ${value}`, damage())
        },

        async team(input) {
            checkDeadline()
            const settings = host.charSettings.value
            const charKey = input.slot === 1 ? "team1" : "team2"
            const weaponKey = input.slot === 1 ? "team1Weapon" : "team2Weapon"
            const buildKey = input.slot === 1 ? "team1Build" : "team2Build"
            const variantKey = input.slot === 1 ? "team1BuildVariant" : "team2BuildVariant"

            if (input.clear) {
                settings[charKey] = "-"
                settings[weaponKey] = "-"
                settings[buildKey] = "-"
                record(`清空协战位 ${input.slot}`)
                return ok(`已清空协战位 ${input.slot}`, damage())
            }

            if (input.char !== undefined) {
                const char = charByName.get(input.char.trim())
                if (!char) {
                    return fail(`找不到协战角色「${input.char}」`)
                }
                if (char.id === (host.charBuild.value?.char?.id ?? 0)) {
                    return fail(`协战角色不能是当前角色 ${char.名称}`)
                }
                settings[charKey] = char.id
            }

            if (input.weapon !== undefined) {
                const weapon = weaponByName.get(input.weapon.trim()) ?? weaponNameMap.get(input.weapon.trim()) ?? null
                if (!weapon) {
                    return fail(`找不到协战武器「${input.weapon}」`)
                }
                settings[weaponKey] = weapon.id
            }

            if (input.build !== undefined) {
                const trimmed = input.build.trim()
                settings[buildKey] = trimmed && trimmed !== "-" ? trimmed : "-"
            }

            if (input.variant !== undefined) {
                settings[variantKey] = input.variant
            }

            const view = readTeam(input.slot, settings)
            record(`协战位 ${input.slot} 设为 ${view.char ?? "空"} / ${view.weapon ?? "空"}`)
            return ok(`协战位 ${input.slot}：${view.char ?? "空"} / ${view.weapon ?? "空"}`, damage())
        },

        async enemy(input) {
            checkDeadline()
            const settings = host.charSettings.value
            const monster =
                typeof input.id === "number" && input.id > 0
                    ? (monsterMap.get(input.id) ?? null)
                    : input.name
                      ? (monsterByName.get(input.name.trim()) ?? null)
                      : null

            if ((input.id !== undefined || input.name !== undefined) && !monster) {
                return fail(`找不到敌人「${input.name ?? input.id}」`)
            }
            if (monster) {
                settings.enemyId = monster.id
            }
            if (input.level !== undefined) {
                settings.enemyLevel = clamp(Math.round(input.level), 1, 200)
            }
            if (input.resistance !== undefined) {
                settings.enemyResistance = input.resistance
            }
            record(`敌人设为 ${monster?.n ?? settings.enemyId}`)
            return ok(`敌人已设为 ${monster?.n ?? settings.enemyId}`, damage())
        },

        async base(name) {
            checkDeadline()
            host.charSettings.value.baseName = name
            record(`计算技能设为 ${name || "（空）"}`)
            return ok(`计算技能已设为 ${name || "（空）"}`, damage())
        },

        async target(expr) {
            checkDeadline()
            host.charSettings.value.targetFunction = expr
            record(`目标函数设为 ${expr}`)
            return ok("目标函数已更新", damage())
        },

        async variable(name, expression) {
            checkDeadline()
            const settings = host.charSettings.value
            const list = settings.customVariables.filter(item => item[0] !== name)
            if (expression.trim()) {
                list.push([name, expression])
            }
            settings.customVariables = list
            record(`自定义变量 ${name} ${expression.trim() ? `= ${expression}` : "已删除"}`)
            return ok(`自定义变量 ${name} ${expression.trim() ? "已更新" : "已删除"}`, damage())
        },

        async dot(input) {
            checkDeadline()
            const settings = host.charSettings.value
            const keys = ["skill", "melee", "ranged", "skillweapon"] as const

            for (const key of keys) {
                const value = input[key]
                if (typeof value === "number") {
                    settings.dotSettings[key] = Math.max(0, value)
                }
            }
            if (input.forceOwnAdditionalDamage !== undefined) {
                settings.dotSettings.forceOwnAdditionalDamage = input.forceOwnAdditionalDamage === true
            }
            record(`DOT 频率设为 ${keys.map(key => `${key}=${settings.dotSettings[key]}`).join(" ")}`)
            return ok(`DOT 频率已更新`, damage())
        },

        async autoSolve(input = {}) {
            checkDeadline()
            const settings = host.charSettings.value
            const autoBuildSetting = useLocalStorage("autobuild.setting", {
                useInv: true,
                includeTypes: [] as ModSlotType[],
                preserveTypes: [] as ModSlotType[],
                includeMelee: false,
                includeRanged: false,
            })
            const includeTypes = (input.includeTypes ?? autoBuildSetting.value.includeTypes).map(type => MOD_TYPE_KEY[type])
            const preserveTypes = (input.preserveTypes ?? autoBuildSetting.value.preserveTypes).map(type => MOD_TYPE_KEY[type])
            const useInv = input.useInv ?? autoBuildSetting.value.useInv
            const includeMelee = input.includeMelee ?? autoBuildSetting.value.includeMelee
            const includeRanged = input.includeRanged ?? autoBuildSetting.value.includeRanged
            const build = createCharBuildFromSettings(host.charBuild.value?.char?.id ?? 0, settings, host.inv)
            const { newBuild, iter } = build.autoBuild({
                includeTypes,
                preserveTypes,
                fixedMelee: !includeMelee,
                fixedRanged: !includeRanged,
                enableLog: false,
                modOptions: host.inv.getModsWithCount(useInv, includeTypes),
                meleeOptions: host.inv.getMeleeWeapons(useInv, build.char.属性),
                rangedOptions: host.inv.getRangedWeapons(useInv, build.char.属性),
            })

            if (input.apply) {
                const pairs: [ModType, unknown[]][] = [
                    ["角色", newBuild.charMods],
                    ["近战", newBuild.meleeMods],
                    ["远程", newBuild.rangedMods],
                    ["同律", newBuild.skillMods],
                ]
                for (const [type, mods] of pairs) {
                    const slots = getModVariantSlots(settings, type)
                    slots.splice(
                        0,
                        slots.length,
                        ...Array.from({ length: MOD_SLOT_COUNTS[type] }, (_, index) => {
                            const mod = mods[index] as { modId: number; level: number } | undefined
                            return mod ? ([mod.modId, mod.level] as ModSlot) : null
                        })
                    )
                }
                host.charSettings.value = {
                    ...settings,
                    meleeWeapon: newBuild.meleeWeapon.id,
                    meleeWeaponLevel: newBuild.meleeWeapon.等级,
                    meleeWeaponRefine: newBuild.meleeWeapon.精炼,
                    rangedWeapon: newBuild.rangedWeapon.id,
                    rangedWeaponLevel: newBuild.rangedWeapon.等级,
                    rangedWeaponRefine: newBuild.rangedWeapon.精炼,
                }
                record("已应用自动求解结果")
            }

            return {
                applied: input.apply === true,
                damage: input.apply ? damage() : readDamage(newBuild),
                weapons: { 近战: newBuild.meleeWeapon.名称, 远程: newBuild.rangedWeapon.名称 },
                mods: newBuild.mods.map(mod => mod.toString()),
                iterations: iter,
            }
        },

        async reset() {
            checkDeadline()
            const keep = host.charSettings.value
            host.charSettings.value = normalizeCharSettings({
                ...createDefaultCharSettings(),
                meleeWeapon: keep.meleeWeapon,
                rangedWeapon: keep.rangedWeapon,
            })
            record("恢复默认配置")
            return ok("已恢复默认配置", damage())
        },

        async patch(partial) {
            checkDeadline()
            const settings = host.charSettings.value
            const keys: string[] = []

            for (const [key, value] of Object.entries(partial ?? {})) {
                if (!(key in settings)) {
                    continue
                }
                ;(settings as unknown as Record<string, unknown>)[key] = value
                keys.push(key)
            }

            if (!keys.length) {
                return fail("没有可写入的字段（字段名需与构筑设置一致）")
            }

            record(`直接改写了 ${keys.join("、")}`)
            return ok(`已改写 ${keys.join("、")}`, damage())
        },

        async export() {
            return serializeCharSettings(host.charSettings.value)
        },

        async import(json) {
            checkDeadline()
            const parsed = parseSettings(json)
            if (!parsed) {
                return fail("构筑 JSON 无法解析，请检查格式")
            }
            host.charSettings.value = parsed
            record("导入构筑 JSON 并覆盖当前配置")
            return ok("已导入构筑 JSON", damage())
        },

        async simulate(json, charName) {
            checkDeadline()
            const parsed = parseSettings(json)
            if (!parsed) {
                throw new Error("构筑 JSON 无法解析，请检查格式")
            }
            const charId = charByName.get(charName ?? host.selectedChar.value)?.id ?? host.charBuild.value?.char?.id ?? 0
            return wrapBuild(cachedBuild(charId, parsed))
        },

        async raw() {
            return JSON.parse(serializeCharSettings(host.charSettings.value)) as CharSettings
        },

        async current() {
            const build = host.charBuild.value
            if (!build) {
                throw new Error("配装页还没生成构筑实例，稍后再试")
            }
            return wrapBuild(build)
        },

        compute: {
            async char(idOrName, level) {
                return toPlain(LeveledCharHelper.fromId(idOrName, level))
            },
            async mod(id, level, buffLv) {
                return toPlain(LeveledModHelper.fromId(id, level, buffLv))
            },
            async weapon(idOrName, refine, level, effectLv) {
                return toPlain(LeveledWeaponHelper.fromId(idOrName, refine, level, effectLv))
            },
            async buff(name, level) {
                return toPlain(LeveledBuffHelper.fromName(name, level))
            },
            async pet(id, level) {
                return toPlain(LeveledPetHelper.fromId(id, level))
            },
            async monster(id, level, isRouge) {
                return toPlain(LeveledMonsterHelper.fromId(id, level, isRouge))
            },
            async build(charIdOrName, settings) {
                checkDeadline()
                const charId = charByName.get(String(charIdOrName))?.id ?? Number(charIdOrName) ?? 0
                const normalized = normalizeCharSettings(settings as Partial<CharSettings>)
                return wrapBuild(cachedBuild(charId, normalized))
            },
        },

        util: {
            async normalize(settings) {
                return normalizeCharSettings(settings as Partial<CharSettings>)
            },
            async serialize(settings) {
                return serializeCharSettings(normalizeCharSettings(settings as Partial<CharSettings>))
            },
            async defaults() {
                return createDefaultCharSettings()
            },
            async clone(settings) {
                return JSON.parse(JSON.stringify(settings ?? {})) as CharSettings
            },
        },

        data: {
            async mods(query = {}) {
                const keyword = query.keyword?.trim()
                return modData
                    .filter(item => (query.type ? item.类型 === query.type : true))
                    .filter(item => (query.series ? item.系列 === query.series : true))
                    .filter(item => (keyword ? item.名称.includes(keyword) || item.系列.includes(keyword) : true))
                    .slice(0, query.limit ?? 30)
                    .map(
                        (item): ModEntry => ({
                            id: item.id,
                            名称: item.名称,
                            类型: item.类型 as ModType,
                            系列: item.系列,
                            品质: item.品质,
                            耐受: item.耐受,
                            词条: modEffectText(item),
                        })
                    )
            },
            async weapons(query = {}) {
                const keyword = query.keyword?.trim()
                return weaponData
                    .filter(item => (query.type ? item.类型.includes(query.type) : true))
                    .filter(item => (keyword ? item.名称.includes(keyword) : true))
                    .slice(0, query.limit ?? 30)
                    .map(
                        (item): WeaponEntry => ({
                            id: item.id,
                            名称: item.名称,
                            类型: item.类型,
                            伤害类型: item.伤害类型,
                            攻击: item.攻击,
                            暴击: item.暴击,
                            暴伤: item.暴伤,
                            触发: item.触发,
                        })
                    )
            },
            async chars(query = {}) {
                const keyword = query.keyword?.trim()
                return charData
                    .filter(item => (keyword ? item.名称.includes(keyword) : true))
                    .slice(0, 40)
                    .map((item): CharEntry => ({ id: item.id, 名称: item.名称, 属性: item.属性 ?? "" }))
            },
            async buffs(query = {}) {
                const keyword = query.keyword?.trim()
                return buffData
                    .filter(item => (keyword ? item.名称.includes(keyword) || (item.描述 ?? "").includes(keyword) : true))
                    .slice(0, query.limit ?? 40)
                    .map((item): BuffEntry => ({ 名称: item.名称, 描述: item.描述 ?? "" }))
            },
            async pets(query = {}) {
                const keyword = query.keyword?.trim()
                return petData
                    .filter(item => (keyword ? item.名称.includes(keyword) : true))
                    .slice(0, 40)
                    .map((item): PetEntry => ({ id: item.id, 名称: item.名称, 描述: item.描述 }))
            },
            async traits(query = {}) {
                const keyword = query.keyword?.trim()
                return petEntrys
                    .filter(item => (keyword ? item.name.includes(keyword) || item.desc.includes(keyword) : true))
                    .slice(0, 40)
                    .map(
                        (item): TraitEntry => ({
                            id: item.id,
                            bid: item.bid,
                            名称: item.name,
                            r: item.r,
                            level: item.r - 2,
                            描述: item.desc,
                        })
                    )
            },
        },

        ui: {
            async readPage(query = {}) {
                return readBuildPage({
                    scope: query.scope ?? "auto",
                    maxNodes: query.maxNodes,
                    contains: query.contains,
                })
            },
            async click(target) {
                return clickBuildTarget({ ...target, settle: 160 })
            },
            async type(target, text) {
                return typeBuildText({ ...target, text, clear: true })
            },
            async select(target, option) {
                return selectBuildOption({ ...target, option })
            },
            async press(key) {
                return pressBuildKey({ key })
            },
        },
    }

    return api
}
