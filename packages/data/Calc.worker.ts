import {
    type PanelKind,
    runWasmAutobuild,
    runWasmEvaluate,
    runWasmIncome,
    runWasmPanels,
    takeWasmSessionSetupMs,
    type WasmIncomeItem,
} from "./CalcWasm"
import { type CharBuild, type ModTypeKey, ModTypeMap } from "./CharBuild"
import { createCharBuildFromSettings } from "./CharBuildHelper"
import { type CharBuildWorkerSnapshot, createBuildFromSnapshot, createWorkerSnapshot } from "./CharBuildSnapshot"
import type { CharSettings } from "./charSettings"
import type { Buff, Mod, Weapon } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { LeveledMod, LeveledModWithCount } from "./leveled/LeveledMod"
import { LeveledWeapon } from "./leveled/LeveledWeapon"

// 兼容旧引用：快照类型统一由 CharBuildSnapshot 提供
export type { CharBuildWorkerSnapshot } from "./CharBuildSnapshot"

/** 候选 BUFF（按「加入该 BUFF 后的伤害变化」或「移除该 BUFF 后的伤害变化」求收益） */
export type IncomeBuffItem = {
    key: string
    data: Buff
    level: number
    minus: boolean
    /** 覆盖率（0-1，默认1表示100%） */
    coverage?: number
    /** 特效挂载点（MOD / 武器 id）：特效 BUFF 不在 BUFF 表里，按特效等级求收益 */
    pid?: number
    /** 特效挂载类型（`Mod` / `Weapon`），与 `pid` 一起标识特效归属 */
    pt?: string
}

/** 候选魔之楔（按整槽替换求收益） */
export type IncomeModItem = {
    key: string
    data: Mod
    level: number
    buffLv?: number
    effect?: Buff
}

/** 候选魔之楔落槽位置：选楔弹窗正在编辑的槽位，同请求内全部候选共用 */
export type IncomeReplaceSlot = {
    type: string
    index: number
}

/** 已装备魔之楔（按移除对应槽位求收益） */
export type IncomeEquippedModItem = {
    key: string
    type: string
    index: number
}

/** 已装备 BUFF（含魔灵与魔灵潜质：按移除该 BUFF 后重算的方式求边际收益） */
export type IncomeEquippedBuffItem = {
    key: string
    data: Buff
    level: number
    /** 覆盖率（0-1，默认1表示100%） */
    coverage?: number
}

export type TargetValueItem = {
    key: string
    build: CharBuildWorkerSnapshot
    settings?: CharSettings
    charId?: number
}

export type CalcModOption = {
    data: Mod
    level: number
    buffLv?: number
    effect?: Buff
    count: number
}

export type CalcWeaponOption = {
    data: Weapon
    refine: number
    level: number
    effectLv?: number
    effect?: Buff
    forgeEffective: boolean
}

export type CalcWasmSource = {
    charId?: number
    settings?: CharSettings
}

export type CalcAutobuildRequest = CalcWasmSource & {
    id: number
    kind: "autobuild"
    build: CharBuildWorkerSnapshot
    includeTypes: ModTypeKey[]
    preserveTypes: ModTypeKey[]
    fixedMelee: boolean
    fixedRanged: boolean
    modOptions: CalcModOption[]
    meleeOptions: CalcWeaponOption[]
    rangedOptions: CalcWeaponOption[]
    enableLog: boolean
}

export type CalcIncomeRequest = CalcWasmSource & {
    id: number
    kind?: "income"
    build: CharBuildWorkerSnapshot
    buffs?: IncomeBuffItem[]
    mods?: IncomeModItem[]
    /** 候选魔之楔的落槽位置：有则按替换该槽位求收益，无则退化为附加口径 */
    replaceSlot?: IncomeReplaceSlot
    equippedMods?: IncomeEquippedModItem[]
    equippedBuffs?: IncomeEquippedBuffItem[]
    skillInherit?: string
}

/** 节点编辑器的构筑求值请求：直接给角色 id 与完整配置，由 wasm 求值 */
export type CalcEvaluateRequest = {
    id: number
    kind: "evaluate"
    charId: number
    settings: CharSettings
    /** 覆盖 settings.targetFunction（如目标函数节点的表达式） */
    targetFunction?: string
    /** 覆盖 settings.baseName（武器伤害节点切到武器技能口径） */
    baseName?: string
    /** TS 回退时用于选择伤害口径；wasm 以 targetFunction 求值结果为准 */
    damageKind?: "skill" | "weapon"
    /** 附带面板数组：与目标值同一次装配计算，复用请求 */
    panels?: PanelKind[]
}

/** 面板请求：只算属性 / 武器面板，不跑目标函数与伤害明细（后者开销远大于面板） */
export type CalcPanelsRequest = {
    id: number
    kind: "panels"
    charId: number
    settings: CharSettings
    /** 需要的面板类型（角色 + 武器槽）；同一构筑一次装配批量计算 */
    panels: PanelKind[]
}

/** 批量面板结果：面板键 → 属性表；构筑没有对应武器时该槽缺席 */
export type CalcBuildPanels = Partial<Record<PanelKind, Record<string, number>>>

/** 构筑求值结果（属性 / 武器面板 / 附带面板 / 目标值 / 伤害明细） */
export interface CalcBuildEvaluation {
    attributes: Record<string, number>
    weapon: Record<string, number> | null
    /** 请求附带的面板；未请求时为空对象 */
    panels: CalcBuildPanels
    targetValue: number
    damage: {
        expectedDamage: number
        noHpDamage: number
        physicalDamage: number
        elementDamage: number
        higherCritExpectedTrigger: number
        lowerCritExpectedTrigger: number
    } | null
    targetFunction: string
    error: string | null
    engine: "ts" | "wasm"
}

export type CalcTargetValuesRequest = {
    id: number
    kind: "targetValues"
    builds: TargetValueItem[]
}

/** 实时日志消息：每生成一行构筑日志即回传主线程 */
export interface CalcLogMessage {
    id: number
    type: "log"
    message: string
}

export type CalcResponse = {
    id: number
    type: "result"
    newBuild?: CharBuildWorkerSnapshot
    log?: string
    iter?: number
    incomes?: Record<string, number>
    values?: Record<string, number>
    failed?: string[]
    settings?: CharSettings
    evaluation?: CalcBuildEvaluation
    panels?: CalcBuildPanels
    engine?: "ts" | "wasm"
    wasmError?: string
    error?: string
    /** worker 端处理耗时（毫秒）：不含消息排队与 worker 冷启动加载时间 */
    elapsedMs?: number
    /** 本次响应前完成的 wasm 建表耗时（毫秒）：单独计入性能统计，不计入请求耗时 */
    wasmSetupMs?: number
}

export type CalcWorkerMessage = CalcLogMessage | CalcResponse

/**
 * 从快照恢复带数量的 MOD 选项实例。
 * @param mod MOD 选项快照
 * @returns 带数量的 MOD 实例
 */
function createModOption(mod: CalcModOption) {
    return new LeveledModWithCount(mod.data, mod.level, mod.buffLv, mod.count, mod.effect)
}

/**
 * 从快照恢复武器选项实例。
 * @param weapon 武器选项快照
 * @returns 武器实例
 */
function createWeaponOption(weapon: CalcWeaponOption) {
    const leveled = new LeveledWeapon(weapon.data, weapon.refine, weapon.level, weapon.effectLv, weapon.effect)
    leveled.setForgeEffective(weapon.forgeEffective)
    return leveled
}

function wasmReady(request: CalcWasmSource): request is CalcWasmSource & { charId: number; settings: CharSettings } {
    return request.charId !== undefined && request.settings !== undefined
}

/**
 * 收益请求的 wasm 配置来源：显式配置优先，其次用构筑快照自带的原始配置。
 * 两条路径都覆盖不了时返回 undefined，交由 TS 快照口径计算。
 * @param request 收益请求
 * @returns 角色 id 与配置；不可用时为 undefined
 */
function incomeWasmSource(request: CalcIncomeRequest): { charId: number; settings: CharSettings } | undefined {
    if (request.charId !== undefined && request.settings !== undefined) {
        return { charId: request.charId, settings: request.settings }
    }
    if (!request.build.settings) return undefined
    return { charId: request.charId ?? request.build.char.data.id, settings: request.build.settings }
}

/**
 * 目标值条目的 wasm 配置来源：显式配置优先，其次用构筑快照自带的原始配置。
 * 两条路径都覆盖不了时返回 undefined，交由 TS 快照口径计算。
 * @param item 目标值条目
 * @returns 角色 id 与配置；不可用时为 undefined
 */
function targetWasmSource(item: TargetValueItem): { charId: number; settings: CharSettings } | undefined {
    if (item.charId !== undefined && item.settings !== undefined) {
        return { charId: item.charId, settings: item.settings }
    }
    if (!item.build.settings) return undefined
    return { charId: item.charId ?? item.build.char.data.id, settings: item.build.settings }
}

/**
 * 用构筑快照里实际生效的特效等级覆盖配置。
 * 配置可能按背包/全局等级取特效（useGlobal），worker 没有背包快照，直接交给 wasm 会退回特效上限。
 * @param settings 构筑配置
 * @param build 构筑快照
 * @returns 补齐特效等级后的配置副本
 */
function settingsWithBuildEffectLevels(settings: CharSettings, build: CharBuildWorkerSnapshot): CharSettings {
    const effectConfig = { ...(settings.effectConfig ?? {}) }
    const setMod = (mod: CharBuildWorkerSnapshot["charMods"][number]) => {
        if (mod && mod.buffLv !== undefined) effectConfig[`m:${mod.data.id}`] = mod.buffLv
    }
    build.charMods.forEach(setMod)
    build.meleeMods.forEach(setMod)
    build.rangedMods.forEach(setMod)
    build.skillMods.forEach(setMod)
    const setWeapon = (weapon: CharBuildWorkerSnapshot["melee"]) => {
        if (weapon.data.id && weapon.effectLv !== undefined) effectConfig[`w:${weapon.data.id}`] = weapon.effectLv
    }
    setWeapon(build.melee)
    setWeapon(build.ranged)
    return { ...settings, effectConfig }
}

/** 请求开始处理的时刻：worker 冷启动加载与消息排队不计入计算耗时 */
const requestStartedAt = new Map<number, number>()

/**
 * 回传结果并附带 worker 端处理耗时。
 * wasm 请求必须传入调用自身的耗时：多个请求可能同时等待同一个已就绪会话，
 * 若按「收到消息」或「会话就绪」计时，会把同批其他请求的计算时间重复计入。
 * @param response 结果体（不含 type / elapsedMs）
 * @param elapsedMs 本次请求自身的计算耗时；缺省按收到消息至当前时刻计算
 */
function postResult(response: Omit<CalcResponse, "type" | "elapsedMs">, elapsedMs?: number) {
    const startedAt = requestStartedAt.get(response.id)
    requestStartedAt.delete(response.id)
    // 建表耗时只随首个完成的响应上报一次，由主线程单独记账
    const wasmSetupMs = takeWasmSessionSetupMs()
    self.postMessage({
        ...response,
        type: "result",
        elapsedMs: elapsedMs ?? (startedAt === undefined ? undefined : performance.now() - startedAt),
        ...(wasmSetupMs === undefined ? {} : { wasmSetupMs }),
    } satisfies CalcResponse)
}

self.onmessage = (
    event: MessageEvent<CalcAutobuildRequest | CalcIncomeRequest | CalcTargetValuesRequest | CalcEvaluateRequest | CalcPanelsRequest>
) => {
    const request = event.data
    requestStartedAt.set(request.id, performance.now())
    if (request.kind === "evaluate") {
        void handleEvaluate(request)
        return
    }
    if (request.kind === "panels") {
        void handlePanels(request)
        return
    }
    if (request.kind === "targetValues") {
        void handleTargetValues(request)
        return
    }
    if (request.kind === "autobuild") {
        if (wasmReady(request)) {
            void handleAutobuildWasm(request)
            return
        }
        handleAutobuildTs(request)
        return
    }
    const incomeSource = incomeWasmSource(request)
    if (incomeSource) {
        void handleIncomeWasm({ ...request, ...incomeSource })
        return
    }
    handleIncomeTs(request)
}

/**
 * 节点编辑器求值：优先走 wasm（与界面数值口径一致），不可用时回退 TS 构筑实例。
 * @param request 求值请求
 */
async function handleEvaluate(request: CalcEvaluateRequest) {
    const { id } = request
    try {
        let evaluation: CalcBuildEvaluation
        let engine: "ts" | "wasm" = "wasm"
        let elapsedMs: number | undefined
        try {
            const call = await runWasmEvaluate({
                charId: request.charId,
                settings: request.settings,
                targetFunction: request.targetFunction,
                baseName: request.baseName,
                panels: request.panels,
            })
            elapsedMs = call.elapsedMs
            evaluation = { ...call.value, engine: "wasm" }
        } catch (error) {
            console.warn("wasm 构筑求值失败，回退 TS", error)
            evaluation = evaluateTs(request)
            engine = "ts"
        }
        postResult({ id, evaluation, engine }, elapsedMs)
    } catch (error) {
        postResult({
            id,
            error: error instanceof Error ? error.message : String(error),
        })
    }
}

/**
 * TS 回退求值：按节点请求的伤害口径现建构筑实例，返回与 wasm 结果同形的扁平数据。
 * @param request 求值请求
 * @returns 构筑求值结果
 */
function evaluateTs(request: CalcEvaluateRequest): CalcBuildEvaluation {
    const settings =
        request.targetFunction === undefined && request.baseName === undefined
            ? request.settings
            : {
                  ...request.settings,
                  targetFunction: request.targetFunction ?? request.settings.targetFunction,
                  baseName: request.baseName ?? request.settings.baseName,
              }
    const build = createCharBuildFromSettings(request.charId, settings)
    const attributes = build.calculateAttributes()
    const weaponAttrs = build.calculateWeaponAttributes()
    const targetFunction = settings.targetFunction || "伤害"
    let targetValue = 0
    let error: string | null = null
    try {
        targetValue = build.calculateTargetFunction(weaponAttrs, targetFunction)
    } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason)
    }
    let damage: CalcBuildEvaluation["damage"] = null
    try {
        const result =
            request.damageKind === "weapon"
                ? build.calculateWeaponDamage(weaponAttrs, build.selectedWeapon || build.meleeWeapon)
                : build.calculateSkillDamage(weaponAttrs)
        damage = {
            expectedDamage: result.expectedDamage,
            noHpDamage: result.noHpDamage,
            physicalDamage: result.physicalDamage ?? 0,
            elementDamage: result.elementDamage ?? 0,
            higherCritExpectedTrigger: result.higherCritExpectedTrigger ?? 0,
            lowerCritExpectedTrigger: result.lowerCritExpectedTrigger ?? 0,
        }
    } catch (reason) {
        console.warn("TS 伤害求值失败", reason)
    }
    return {
        attributes: attributes as unknown as Record<string, number>,
        weapon: (weaponAttrs.weapon as unknown as Record<string, number>) ?? null,
        panels: request.panels?.length ? computePanelsTs(build, request.panels) : {},
        targetValue,
        damage,
        targetFunction,
        error,
        engine: "ts",
    }
}

/**
 * 武器面板求值：只算面板（同一构筑一次装配批量取多个槽位），不跑目标函数与伤害明细。
 * @param request 面板请求
 */
async function handlePanels(request: CalcPanelsRequest) {
    const { id } = request
    try {
        let panels: CalcBuildPanels
        let engine: "ts" | "wasm" = "wasm"
        let elapsedMs: number | undefined
        try {
            const call = await runWasmPanels({ charId: request.charId, settings: request.settings, panels: request.panels })
            elapsedMs = call.elapsedMs
            panels = call.value.panels
        } catch (error) {
            console.warn("wasm 面板求值失败，回退 TS", error)
            panels = evaluatePanelsTs(request)
            engine = "ts"
        }
        postResult({ id, panels, engine }, elapsedMs)
    } catch (error) {
        postResult({
            id,
            error: error instanceof Error ? error.message : String(error),
        })
    }
}

/**
 * TS 回退的面板计算：角色面板与各武器槽面板。
 * @param build 构筑实例
 * @param panels 需要的面板类型
 * @returns 面板键 → 属性表
 */
function computePanelsTs(build: CharBuild, panels: PanelKind[]): CalcBuildPanels {
    const result: CalcBuildPanels = {}
    panels.forEach(panel => {
        if (panel === "char") {
            result.char = build.calculateAttributes() as unknown as Record<string, number>
            return
        }
        const weapon = panel === "melee" ? build.meleeWeapon : panel === "ranged" ? build.rangedWeapon : build.skillWeapon
        if (!weapon) return
        const weaponAttrs = build.calculateWeaponAttributes(weapon)
        if (weaponAttrs.weapon) result[panel] = weaponAttrs.weapon as unknown as Record<string, number>
    })
    return result
}

/**
 * TS 回退的面板求值。
 * @param request 面板请求
 * @returns 面板键 → 属性表
 */
function evaluatePanelsTs(request: CalcPanelsRequest): CalcBuildPanels {
    return computePanelsTs(createCharBuildFromSettings(request.charId, request.settings), request.panels)
}

function handleAutobuildTs(request: CalcAutobuildRequest, wasmError?: string) {
    const { id } = request
    try {
        const build = createBuildFromSnapshot(request.build)
        const { newBuild, log, iter } = build.autoBuild({
            includeTypes: request.includeTypes,
            preserveTypes: request.preserveTypes,
            fixedMelee: request.fixedMelee,
            fixedRanged: request.fixedRanged,
            modOptions: request.modOptions.map(createModOption),
            meleeOptions: request.meleeOptions.map(createWeaponOption),
            rangedOptions: request.rangedOptions.map(createWeaponOption),
            enableLog: request.enableLog,
            // 实时回传每一行构筑日志
            onLog: message => {
                self.postMessage({ id, type: "log", message } satisfies CalcLogMessage)
            },
        })
        // 批量计算最终构筑各槽位已装备 MOD 的边际收益，避免主线程重复计算
        const incomes: Record<string, number> = {}
        request.includeTypes.forEach(key => {
            newBuild[key].forEach((_, index) => {
                incomes[`${key}:${index}`] = newBuild.calcEquippedModIncome(ModTypeMap[key], index)
            })
        })
        postResult({
            id,
            newBuild: createWorkerSnapshot(newBuild),
            log,
            iter,
            incomes,
            engine: "ts",
            ...(wasmError ? { wasmError } : {}),
        })
    } catch (error) {
        postResult({
            id,
            error: error instanceof Error ? error.message : String(error),
        })
    }
}

async function handleAutobuildWasm(request: CalcAutobuildRequest & { charId: number; settings: CharSettings }) {
    const { id } = request
    try {
        const call = await runWasmAutobuild({
            charId: request.charId,
            settings: request.settings,
            includeTypes: request.includeTypes,
            preserveTypes: request.preserveTypes,
            fixedMelee: request.fixedMelee,
            fixedRanged: request.fixedRanged,
            modOptions: request.modOptions,
            meleeOptions: request.meleeOptions,
            rangedOptions: request.rangedOptions,
        })
        postResult(
            {
                id,
                settings: call.value.settings,
                log: call.value.log.join("\n"),
                iter: call.value.iters,
                engine: "wasm",
            },
            call.elapsedMs
        )
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn("wasm 自动配装失败，回退 TS", reason)
        handleAutobuildTs(request, reason)
    }
}

/**
 * TS 口径的收益计算（wasm 不可用时整体回退）。
 *
 * 基线一律由 TS 构筑自算，不接受外部传入：wasm 与 TS 对默认目标函数（如裸标识符
 * 「伤害」）的取值并不完全一致，混用两份引擎的基线会让整列收益按两者的比值平移，
 * 利好 BUFF 也会显示成负收益。
 * @param request 收益请求
 * @returns 键 → 收益
 */
function calcIncomesTs(request: CalcIncomeRequest): Record<string, number> {
    const build = createBuildFromSnapshot(request.build)
    const incomes: Record<string, number> = {}
    const hasItems =
        (request.buffs?.length ?? 0) +
            (request.mods?.length ?? 0) +
            (request.equippedMods?.length ?? 0) +
            (request.equippedBuffs?.length ?? 0) >
        0
    // 基准伤害整请求只算一次：各候选计算前后都会恢复构筑原状，基准与逐项现算完全一致
    const baseValue = hasItems ? build.calculate() : 0
    request.buffs?.forEach(buff => {
        const leveled = new LeveledBuff(buff.data, buff.level)
        if (buff.coverage !== undefined) {
            leveled.coverage = buff.coverage
        }
        incomes[buff.key] = build.calcIncome(leveled, buff.minus, baseValue)
    })
    request.mods?.forEach(mod => {
        const leveled = new LeveledMod(mod.data, mod.level, mod.buffLv, mod.effect)
        incomes[mod.key] = request.replaceSlot
            ? build.calcReplacementModIncome(request.replaceSlot.type, request.replaceSlot.index, leveled, baseValue)
            : build.calcIncome(leveled, false, baseValue)
    })
    request.equippedMods?.forEach(mod => {
        incomes[mod.key] = build.calcEquippedModIncome(mod.type, mod.index, baseValue)
    })
    request.equippedBuffs?.forEach(buff => {
        const leveled = new LeveledBuff(buff.data, buff.level)
        if (buff.coverage !== undefined) {
            leveled.coverage = buff.coverage
        }
        incomes[buff.key] = build.calcEquippedBuffIncome(leveled, baseValue)
    })
    return incomes
}

function handleIncomeTs(request: CalcIncomeRequest) {
    try {
        const incomes = calcIncomesTs(request)
        postResult({ id: request.id, incomes, engine: "ts" })
    } catch (error) {
        postResult({
            id: request.id,
            error: error instanceof Error ? error.message : String(error),
        })
    }
}

async function handleIncomeWasm(request: CalcIncomeRequest & { charId: number; settings: CharSettings }) {
    const { id } = request
    try {
        const items: WasmIncomeItem[] = []
        request.buffs?.forEach(buff => {
            // 特效 BUFF 挂在 MOD / 武器实例上，不在 BUFF 表里：按特效等级改写求收益（移除即置 0）
            if (buff.pid !== undefined && buff.pt) {
                items.push({
                    key: buff.key,
                    kind: "effect_set",
                    owner: buff.pt,
                    id: buff.pid,
                    level: buff.minus ? 0 : buff.level,
                })
                return
            }
            // 已装备 BUFF 按真实移除求边际收益；候选 BUFF 按附加求收益
            if (buff.minus) items.push({ key: buff.key, kind: "buff_remove", name: buff.data.名称 })
            else items.push({ key: buff.key, kind: "buff_add", name: buff.data.名称, level: buff.level, coverage: buff.coverage })
        })
        request.mods?.forEach(mod => {
            if (request.replaceSlot) {
                items.push({
                    key: mod.key,
                    kind: "mod_replace",
                    slot: request.replaceSlot.type,
                    index: request.replaceSlot.index,
                    id: mod.data.id,
                    level: mod.level,
                    buffLevel: mod.buffLv,
                })
            } else {
                items.push({ key: mod.key, kind: "mod_add", id: mod.data.id, level: mod.level, buffLevel: mod.buffLv })
            }
        })
        request.equippedMods?.forEach(mod => {
            items.push({ key: mod.key, kind: "mod_remove", slot: mod.type, index: mod.index })
        })
        request.equippedBuffs?.forEach(buff => {
            items.push({ key: buff.key, kind: "buff_remove", name: buff.data.名称 })
        })
        const call = await runWasmIncome({
            charId: request.charId,
            settings: settingsWithBuildEffectLevels(request.settings, request.build),
            skillInherit: request.skillInherit,
            items,
        })
        // 全部收益项（含已装备 BUFF 的移除收益）都由同一次 wasm 调用的基线换算
        postResult({ id, incomes: { ...call.value.values }, engine: "wasm" }, call.elapsedMs)
    } catch (error) {
        console.warn("wasm 收益计算失败，回退 TS", error)
        handleIncomeTs(request)
    }
}

async function handleTargetValues(request: CalcTargetValuesRequest) {
    const values: Record<string, number> = {}
    const failed: string[] = []
    const wasmItems: { item: TargetValueItem; charId: number; settings: CharSettings }[] = []
    const tsItems: TargetValueItem[] = []
    for (const item of request.builds) {
        const source = targetWasmSource(item)
        if (!source) {
            tsItems.push(item)
            continue
        }
        // 配置里的特效等级可能按全局背包取，快照里的实际等级才是这份构筑的生效值
        wasmItems.push({ item, charId: source.charId, settings: settingsWithBuildEffectLevels(source.settings, item.build) })
    }
    let elapsedMs: number | undefined
    let wasmUsed = false
    if (wasmItems.length > 0) {
        try {
            const first = wasmItems[0]
            const call = await runWasmIncome({
                charId: first.charId,
                settings: first.settings,
                items: wasmItems.map(entry => ({
                    key: entry.item.key,
                    kind: "target",
                    charId: entry.charId,
                    settings: entry.settings,
                })),
            })
            elapsedMs = call.elapsedMs
            wasmUsed = true
            Object.assign(values, call.value.values)
        } catch (error) {
            console.warn("wasm 目标值失败，回退 TS", error)
            tsItems.push(...wasmItems.map(entry => entry.item))
        }
    }
    const tsStartedAt = performance.now()
    for (const item of tsItems) {
        try {
            const value = createBuildFromSnapshot(item.build).calculate()
            if (Number.isFinite(value)) {
                values[item.key] = value
            } else {
                failed.push(item.key)
            }
        } catch (error) {
            failed.push(`${item.key}:${error instanceof Error ? error.message : String(error)}`)
        }
    }
    for (const [key, value] of Object.entries(values)) {
        if (!Number.isFinite(value)) {
            delete values[key]
            failed.push(key)
        }
    }
    postResult(
        {
            id: request.id,
            values,
            ...(failed.length > 0 ? { failed } : {}),
            engine: wasmUsed ? "wasm" : "ts",
        },
        elapsedMs === undefined ? undefined : elapsedMs + (performance.now() - tsStartedAt)
    )
}
