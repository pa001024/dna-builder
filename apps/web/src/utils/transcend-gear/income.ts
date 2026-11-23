import {
    affixes,
    createTranscendBuild,
    getTranscendSideGearGroup,
    slots,
    TRANSCEND_BUFF_MAP,
    type TranscendBuildSettings,
    type TranscendGearCraftState,
    type TranscendGearGroup,
    type TranscendGearItemConfig,
    type TranscendGearSuppress,
    type TranscendSlotGroup,
    UNIQUE_AFFIX_MAP,
} from "@/data"
import { type CharBuildWorkerSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { isDataAvailable } from "@/utils/data-pack/data-pack-bridge"
import { getAffixAttrs, getAffixById, getAffixModeledValues, getAffixUniqueEquips } from "@/utils/transcendence-gear"
import { type GearAffixLine, getAffixSkillLevelInfo, isUniqueGearLine } from "./display"
import { relativeGain } from "./gain"
import { isAffixAllowedForChar } from "./generation"
import type { GearIncomeFailure, GearIncomeRequest, GearIncomeResponse } from "./income.worker"

/** 收益请求的候选物品（快照由客户端在主线程组装） */
export interface GearIncomeInput {
    key: string
    item: TranscendGearItemConfig
}

/**
 * 升华装备收益 worker 客户端：在当前数据包实例上组装「替换该槽位后的构筑快照」，
 * 再交给 worker 只做伤害求值与差分。基准 / 候选快照都来自主线程，页面换包、安全模式或
 * 新增角色时与页面伤害保持一致；失败 / 超时明确 reject，候选失败逐项返回。
 */

export interface GearIncomeResult {
    /** 基准口径的伤害：团队合计（旧单侧路径 = 该侧伤害） */
    baseline: number
    incomes: Record<string, number>
    failures: GearIncomeFailure[]
    /** 口径标记：team = 目标函数卡启用侧合计；owner = 无启用侧时回退装备者自身侧；缺省 = 旧单侧路径 */
    target?: GearIncomeTarget
}

/** 收益测量口径 */
export type GearIncomeTarget = "team" | "owner"

/**
 * 收益快照的组装选项：只由收益链路传入，不写入物品 / 设置 / 存档 / 分享。
 */
export interface GearIncomeBuildOptions {
    /** 专属词条组件的解析抑制（技能等级 / 建模属性隔离） */
    suppress?: TranscendGearSuppress
}

/** 团队合计中的单侧快照（side 决定请求可读性与测试断言） */
export interface GearIncomeSideSnapshot {
    side: TranscendSlotGroup
    build: CharBuildWorkerSnapshot
}

/** 团队合计快照组：参与侧 + 口径标记 */
export interface GearTeamSnapshots {
    /** 参与合计的启用侧（主控 → 协战一 → 协战二）；owner 回退时只有一项 */
    sides: GearIncomeSideSnapshot[]
    /** team = 目标函数卡启用侧合计；owner = 无启用侧时回退装备者自身侧 */
    target: GearIncomeTarget
}

/**
 * 宿主构筑快照来源（U91b）：原构筑页把升华装备并入完整构筑（MOD / BUFF / 时间轴）后，
 * 相对收益必须与页面实际结果同口径，不能再构造「只有升华层」的独立构筑。
 */
export interface GearGainContext {
    /** 缓存键：宿主完整设置 + 数据包；MOD / BUFF / 时间轴变化必须使缓存失效 */
    key: string
    /**
     * 构造某构筑位的单侧构筑快照（旧宿主 / 测试兼容；生产收益链路优先用 `buildTeamSnapshots`）。
     * @param side 构筑位
     * @param gear 该位的装备组（缺省 = 宿主当前装备组）
     * @param options 收益专用组装选项（组件抑制；缺省 = 完整构筑口径）
     * @returns 快照；无法构建或该位目标表达式非法时为 null
     */
    buildSnapshot(side: TranscendSlotGroup, gear?: TranscendGearGroup, options?: GearIncomeBuildOptions): CharBuildWorkerSnapshot | null
    /**
     * 构造团队合计快照（U137）：把 `gear` 写入 owner side 的装备组后，按目标函数卡口径
     * 重建所有启用侧（`mainTargetEnabled` / `assistN.enabled`、charId > 0）。
     * 无任何启用侧时回退 owner 侧并标记 `target: "owner"`；任一启用侧失败 / 目标非法时返回 null。
     * @param ownerSide 装备所属构筑位
     * @param gear 该位装备组（缺省 = 宿主当前装备组）
     * @param options 收益专用组装选项（组件抑制）
     * @returns 参与侧快照与口径标记；不可求值时为 null
     */
    buildTeamSnapshots?(
        ownerSide: TranscendSlotGroup,
        gear?: TranscendGearGroup,
        options?: GearIncomeBuildOptions
    ): GearTeamSnapshots | null
}

/** 单次请求超时（伤害计算含表达式求值，正常远低于此值） */
const REQUEST_TIMEOUT_MS = 20_000

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, { resolve: (value: GearIncomeResult) => void; reject: (reason: Error) => void; timer: number }>()

/** 重置 worker 并拒绝全部未完成请求 */
function resetWorker(error: Error): void {
    worker?.terminate()
    worker = null
    for (const entry of pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(error)
    }
    pending.clear()
}

/** 获取 worker（首次调用创建） */
function getWorker(): Worker {
    if (!worker) {
        const instance = new Worker(new URL("./income.worker.ts", import.meta.url), { type: "module" })
        instance.onmessage = (event: MessageEvent<GearIncomeResponse>) => {
            const entry = pending.get(event.data.id)
            if (!entry) return
            pending.delete(event.data.id)
            clearTimeout(entry.timer)
            if (event.data.error || event.data.incomes === undefined || event.data.baseline === undefined) {
                entry.reject(new Error(event.data.error || "gear income failed"))
                return
            }
            entry.resolve({
                baseline: event.data.baseline,
                incomes: event.data.incomes,
                failures: event.data.failures ?? [],
            })
        }
        instance.onerror = () => resetWorker(new Error("装备收益 worker 出错，已重置"))
        worker = instance
    }
    return worker
}

/**
 * 把候选物品写入设置对应装备组（三组一人一套；同槽旧物品 / 旧词条一并替换）。
 * 纯函数：不修改入参，也不写激活变体——计算只读顶层三组，变体无需参与候选求值。
 * @param settings 当前构筑设置
 * @param side 构筑位
 * @param slotId 装备位
 * @param item 候选物品
 * @returns 替换该槽后的新设置
 */
export function withItem(
    settings: TranscendBuildSettings,
    side: TranscendSlotGroup,
    slotId: number,
    item: TranscendGearItemConfig
): TranscendBuildSettings {
    const key = side === "main" ? "mainGear" : side === "assist1" ? "assist1Gear" : "assist2Gear"
    const source = settings.transcend[key] as { slotId?: number }[] | undefined
    const group = (Array.isArray(source) ? source : []).filter(entry => Math.round(Number(entry.slotId)) !== slotId)
    return {
        ...settings,
        transcend: {
            ...settings.transcend,
            [key]: [...group, { slotId, item }],
        },
    }
}

/**
 * 用候选物品替换装备组中的槽位（纯函数；同槽旧物品移除，其余槽位原样保留）。
 * 宿主快照收益按「装备组」构造候选，不经过 `withItem` 的整套设置拷贝。
 * @param group 装备组
 * @param slotId 装备位
 * @param item 候选物品（null 表示清空该槽）
 * @returns 新的装备组（按装备位排序）
 */
export function withGearItem(group: readonly unknown[], slotId: number, item: TranscendGearItemConfig | null): TranscendGearGroup {
    const id = Math.round(Number(slotId))
    const next: TranscendGearGroup = []
    for (const raw of Array.isArray(group) ? group : []) {
        const entrySlot = Math.round(Number((raw as { slotId?: number } | null)?.slotId))
        if (entrySlot === id) continue
        next.push(raw as TranscendGearGroup[number])
    }
    if (item) next.push({ slotId: id, item })
    return next.sort((left, right) => Math.round(Number(left.slotId)) - Math.round(Number(right.slotId)))
}

/**
 * 升华收益所需数据是否可用：数据包已水合，且版本门限后的词条 / 槽位表非空。
 * 安全模式下 `applyVersionGate` 会清空 1.8 的升华表，此时 hydrated 仍为 true，
 * 必须显式判空，否则候选会被算成 0.0。
 * @param affixTable 词条表（测试可注入）
 * @param slotTable 槽位表（测试可注入）
 * @returns 可计算为 true
 */
export function isGearIncomeDataReady(affixTable: readonly unknown[] = affixes, slotTable: readonly unknown[] = slots): boolean {
    return isDataAvailable() && affixTable.length > 0 && slotTable.length > 0
}

/** 在主线程用当前数据构造构筑快照 */
function buildSnapshot(
    settings: TranscendBuildSettings,
    side: TranscendSlotGroup,
    slotId?: number,
    item?: TranscendGearItemConfig
): { snapshot?: CharBuildWorkerSnapshot; error?: string } {
    if (!isGearIncomeDataReady()) return { error: "data-unavailable" }
    const next = item && slotId !== undefined ? withItem(settings, side, slotId, item) : settings
    const built = createTranscendBuild(next, side)
    if (!built) return { error: "build-unavailable" }
    // 各构筑位有独立目标表达式：按重建后的构筑校验，不能用顶层镜像（仅等于主控值）
    const error = built.build.validateAST(typeof built.build.targetFunction === "string" ? built.build.targetFunction : "")
    if (error) return { error }
    return { snapshot: createWorkerSnapshot(built.build) }
}

/** 团队入口不可用时的单侧兼容回退 */
function teamSnapshotsOf(
    context: GearGainContext,
    side: TranscendSlotGroup,
    gear: TranscendGearGroup,
    options?: GearIncomeBuildOptions
): { sides: GearIncomeSideSnapshot[]; target?: GearIncomeTarget } | null {
    if (context.buildTeamSnapshots) {
        const team = context.buildTeamSnapshots(side, gear, options)
        return team ? { sides: team.sides, target: team.target } : null
    }
    const single = options ? context.buildSnapshot(side, gear, options) : context.buildSnapshot(side, gear)
    return single ? { sides: [{ side, build: single }] } : null
}

/**
 * 请求候选装备的收益（相对目标函数卡的团队合计；旧路径 = 当前该侧伤害）。
 * 传入 `gainContext` 时基准 / 候选快照全部由宿主构造（完整 MOD / BUFF / 时间轴口径）；
 * 未传时保留旧的「升华层独立构筑」口径（仅测试 / 兼容）。
 * @param payload 请求体（设置、构筑位、槽位、候选物品、可选宿主快照上下文）
 * @returns 基准合计、key → 伤害差与候选失败列表
 */
export function requestGearIncomes(payload: {
    settings: TranscendBuildSettings
    side: TranscendSlotGroup
    slotId: number
    candidates: GearIncomeInput[]
    gainContext?: GearGainContext
}): Promise<GearIncomeResult> {
    let baselineSides: GearIncomeSideSnapshot[]
    let target: GearIncomeTarget | undefined
    const candidates: { key: string; builds: GearIncomeSideSnapshot[] }[] = []
    const failures: GearIncomeFailure[] = []
    // 候选在主线程逐件构建快照，成本 / 消息体积随库存条数线性增长；库存极大时需分批（见 U21B-REPORT §8）
    if (payload.gainContext) {
        if (!isGearIncomeDataReady()) return Promise.reject(new Error("data-unavailable"))
        const context = payload.gainContext
        const baseGear = getTranscendSideGearGroup(payload.settings.transcend, payload.side)
        const baseline = teamSnapshotsOf(context, payload.side, baseGear)
        if (!baseline) return Promise.reject(new Error("build-unavailable"))
        baselineSides = baseline.sides
        target = baseline.target
        for (const candidate of payload.candidates) {
            const team = teamSnapshotsOf(context, payload.side, withGearItem(baseGear, payload.slotId, candidate.item))
            if (!team) {
                failures.push({ key: candidate.key, error: "build-unavailable" })
                continue
            }
            candidates.push({ key: candidate.key, builds: team.sides })
        }
    } else {
        const baseline = buildSnapshot(payload.settings, payload.side)
        if (!baseline.snapshot) return Promise.reject(new Error(baseline.error ?? "build-unavailable"))
        baselineSides = [{ side: payload.side, build: baseline.snapshot }]
        for (const candidate of payload.candidates) {
            const built = buildSnapshot(payload.settings, payload.side, payload.slotId, candidate.item)
            if (!built.snapshot) {
                failures.push({ key: candidate.key, error: built.error ?? "build-unavailable" })
                continue
            }
            candidates.push({ key: candidate.key, builds: [{ side: payload.side, build: built.snapshot }] })
        }
    }

    return postIncomeRequest(baselineSides, candidates, failures, target)
}

/**
 * 把已组装好的基准 / 候选团队快照交给 worker 求值（主线程失败项一并合并回结果）。
 * @param baselineSides 基准参与侧快照
 * @param candidates 候选参与侧快照
 * @param failures 主线程组装阶段已失败的候选
 * @param target 口径标记（team / owner；旧单侧路径缺省）
 * @returns 基准合计、key → 伤害差分与失败列表
 */
function postIncomeRequest(
    baselineSides: GearIncomeSideSnapshot[],
    candidates: { key: string; builds: GearIncomeSideSnapshot[] }[],
    failures: GearIncomeFailure[],
    target?: GearIncomeTarget
): Promise<GearIncomeResult> {
    const instance = getWorker()
    const id = ++requestId
    const request: GearIncomeRequest = { id, baseline: baselineSides, candidates }
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            resetWorker(new Error("装备收益计算超时"))
        }, REQUEST_TIMEOUT_MS)
        pending.set(id, {
            resolve: value => resolve({ ...value, failures: [...failures, ...value.failures], target }),
            reject,
            timer,
        })
        // Vue 响应式代理无法结构化克隆：统一转普通数据后再投递
        instance.postMessage(JSON.parse(JSON.stringify(request)))
    })
}

/**
 * 预览卡片逐词条收益上下文（宿主具备完整构筑时传入；纯库存 / DB 无上下文时不显示）。
 * `gear` 为当前构筑位装备组，基准会把预览物品放入预览槽位。
 */
export interface GearAffixIncomeSource {
    /** 缓存键前缀：宿主完整设置 + 数据包（与 `GearGainContext.key` 同源） */
    key: string
    /** 构筑位 */
    side: TranscendSlotGroup
    /** 该构筑位当前装备组 */
    gear: TranscendGearGroup
    gainContext: GearGainContext
    /** 该构筑位角色 id（角色门控收益取数用；缺省 / 0 表示无角色上下文，不做门控判定） */
    charId?: number
}

/** 普通词条行收益 key：与 `GearAffixLine.affixIndex` 对齐 */
export function getAffixIncomeKey(affixIndex: number, affixId: number): string {
    return `affix:${affixIndex}:${affixId}`
}

/** 专属词条整体收益 key（去掉该 Plan 4 词条的差分） */
export function getUniqueAffixIncomeKey(affixId: number): string {
    return `unique:${affixId}`
}

/** 专属词条组件收益 key 前缀：`unique-component:<affixId>:<行 key>` */
export function getUniqueComponentIncomePrefix(affixId: number): string {
    return `unique-component:${affixId}:`
}

/**
 * 从收益表里取出某专属词条的组件收益，按行 key（`skill:<type>` / `modeled:<index>:<name>`）索引。
 * @param incomes 收益表
 * @param affixId 专属词条 id
 * @returns 行 key → 收益比例
 */
export function pickUniqueComponentIncomes(
    incomes: Readonly<Record<string, number | null>>,
    affixId: number
): Record<string, number | null> {
    const prefix = getUniqueComponentIncomePrefix(affixId)
    const picked: Record<string, number | null> = {}
    for (const [key, value] of Object.entries(incomes)) {
        if (!key.startsWith(prefix)) continue
        picked[key.slice(prefix.length)] = value
    }
    return picked
}

/**
 * 去掉指定下标的词条（用于逐条收益候选）：craft 下标同步重映射，
 * 保证候选仍代表「只去掉该条」——`finalMasterwork` 等由 craft 下标决定，不搬迁会让效果迁移到别的词条。
 * 目标正是被删词条时清除并同步清零次数，位于其后的下标按被删数量前移；`enchantSnapshot` 同口径。
 * @param item 装备物品
 * @param indices 被去掉的词条在 `affixes` 中的原下标集合
 * @returns 只去掉这些词条的候选物品
 */
function withoutAffixIndices(item: TranscendGearItemConfig, indices: ReadonlySet<number>): TranscendGearItemConfig {
    const affixRolls = Array.isArray(item.affixes) ? item.affixes : []
    const affixes = affixRolls.filter((_, other) => !indices.has(other))
    const craft = item.craft
    if (!craft) return { ...item, affixes }
    const shiftOf = (index: number): number => {
        let shift = 0
        for (const removed of indices) if (removed < index) shift += 1
        return index - shift
    }
    const remap = (value: number | undefined): number | undefined => {
        if (value === undefined) return undefined
        if (indices.has(value)) return undefined
        return shiftOf(value)
    }
    const finalMasterworkAffixIndex = remap(craft.finalMasterworkAffixIndex)
    const temperingAffixIndex = remap(craft.temperingAffixIndex)
    const enchantAffixIndex = remap(craft.enchantAffixIndex)
    const nextCraft: TranscendGearCraftState = {
        masterworkLevel: craft.masterworkLevel,
        temperingCount: temperingAffixIndex === undefined ? 0 : craft.temperingCount,
        enchantCount: enchantAffixIndex === undefined ? 0 : craft.enchantCount,
    }
    if (finalMasterworkAffixIndex !== undefined) nextCraft.finalMasterworkAffixIndex = finalMasterworkAffixIndex
    if (temperingAffixIndex !== undefined) nextCraft.temperingAffixIndex = temperingAffixIndex
    if (enchantAffixIndex !== undefined) nextCraft.enchantAffixIndex = enchantAffixIndex
    if (enchantAffixIndex !== undefined && craft.enchantSnapshot) {
        const snapshotIndex = remap(craft.enchantSnapshot.affixIndex)
        if (snapshotIndex !== undefined) nextCraft.enchantSnapshot = { ...craft.enchantSnapshot, affixIndex: snapshotIndex }
    }
    return { ...item, affixes, craft: nextCraft }
}

/** 去掉单个下标（既有 U120 口径） */
function withoutAffixIndex(item: TranscendGearItemConfig, index: number): TranscendGearItemConfig {
    return withoutAffixIndices(item, new Set([index]))
}

/**
 * 去掉专属词条后的候选物品：清空 `uniqueAffix`（`kind` 保留，解析器不再展开该词条），
 * 并移除数组内同 id 的重复数据（脏存档 / OCR 会把专属词条同时写进 `affixes`，只清字段会让效果残留）。
 * craft 下标随数组内移除同步重映射，其余字段原样保留。
 * @param item 装备物品
 * @param affixId 专属词条 id
 * @returns 去掉该专属词条的候选物品
 */
export function withoutUniqueAffix(item: TranscendGearItemConfig, affixId: number): TranscendGearItemConfig {
    const indices = new Set<number>()
    const affixRolls = Array.isArray(item.affixes) ? item.affixes : []
    affixRolls.forEach((roll, index) => {
        if (roll.affixId === affixId) indices.add(index)
    })
    const next = withoutAffixIndices(item, indices)
    if (item.uniqueAffix?.affixId !== affixId) return next
    return { ...next, uniqueAffix: undefined }
}

/** 收益候选：物品 + 可选的组件抑制（抑制不写入物品，随请求一次性生效） */
export interface AffixIncomeCandidate {
    key: string
    item: TranscendGearItemConfig
    /** 组件候选的解析抑制（技能等级 / 建模属性）；整体候选不传 */
    suppress?: TranscendGearSuppress
}

/**
 * 词条行的整体收益 key：专属行（含数组内同 id 脏数据）统一走 `unique:<affixId>`，
 * 普通行按数组下标；基础 / 无下标行无收益语义。
 * @param line 词条行
 * @returns 收益 key；不适用时为 undefined
 */
export function getAffixLineIncomeKey(line: Pick<GearAffixLine, "unique" | "source" | "affixIndex" | "roll">): string | undefined {
    if (isUniqueGearLine(line)) return getUniqueAffixIncomeKey(line.roll.affixId)
    if (line.affixIndex === undefined || line.affixIndex < 0) return undefined
    return getAffixIncomeKey(line.affixIndex, line.roll.affixId)
}

/**
 * 专属词条实际挂载的手写 BUFF 属性键（剥 `@` 前缀）：只对这些键做组件抑制，
 * 展示值名与 BUFF attr 键不对齐的行不产出候选（避免空转与同名错配）。
 * @param affixId 专属词条 id
 * @returns 属性键集合
 */
export function getUniqueAffixMountedAttrKeys(affixId: number): ReadonlySet<string> {
    const keys = new Set<string>()
    for (const name of UNIQUE_AFFIX_MAP[affixId]?.buffs ?? []) {
        const attr = TRANSCEND_BUFF_MAP.get(name)?.attr
        if (!attr) continue
        for (const key of Object.keys(attr)) keys.add(key.startsWith("@") ? key.slice(1) : key)
    }
    return keys
}

/**
 * 专属词条的组件候选：只覆盖界面上实际渲染的明细分支（技能等级优先，其次数据属性，最后建模值）。
 * 数据属性分支（`attr:<index>:<name>`）暂未提供隔离手段，不产出候选（界面不显示该行收益）；
 * 建模行只在该展示名命中实际挂载的 BUFF 属性键时产出候选。
 * @param affixId 专属词条 id
 * @returns 行 key 对齐的组件候选；无可隔离组件时为空数组
 */
function createUniqueComponentCandidates(affixId: number): { key: string; suppress: TranscendGearSuppress }[] {
    const affix = getAffixById(affixId)
    // 与 `getUniqueAffixDetailRows` 同判定：只有被唯一装引用的 Plan 4 词条才有明细行
    if (affix?.plan !== 4 || !getAffixUniqueEquips(affixId).length) return []
    const prefix = getUniqueComponentIncomePrefix(affixId)
    const skillLevel = getAffixSkillLevelInfo(affix)
    if (skillLevel.isSkillLevel) {
        // 技能等级行按类型分行；抑制选项是词条级，多个类型行共享同一候选值（任务口径）
        return skillLevel.skillTypes.map(type => ({
            key: `${prefix}skill:${type}`,
            suppress: { affixId, skillLevel: true },
        }))
    }
    if (getAffixAttrs(affix).length) return []
    const mounted = getUniqueAffixMountedAttrKeys(affixId)
    const modeled: { key: string; suppress: TranscendGearSuppress }[] = []
    for (const [index, value] of getAffixModeledValues(affixId).entries()) {
        if (!mounted.has(value.name)) continue
        modeled.push({ key: `${prefix}modeled:${index}:${value.name}`, suppress: { affixId, attrs: [value.name] } })
    }
    return modeled
}

/**
 * 逐条移除普通词条后的候选物品：只过滤 `affixes`（专属词条不在数组内，不参与），
 * craft 下标随移除同步重映射（最终精锻 / 淬炼 / 附魔不迁移），其余字段（孔位 / 专属）原样保留。
 * 专属整体候选 `unique:<affixId>` 与组件候选 `unique-component:<affixId>:<行 key>` 追加在后；
 * 角色门控不匹配（`isAffixAllowedForChar`）时整组（含明细行）不产出候选，界面因此不显示收益。
 * @param item 装备物品
 * @param options 可选的构筑位角色 id（0 / 缺省 = 无角色上下文，不做门控判定）
 * @returns 候选列表
 */
export function createAffixIncomeCandidates(item: TranscendGearItemConfig, options: { charId?: number } = {}): AffixIncomeCandidate[] {
    const affixRolls = Array.isArray(item.affixes) ? item.affixes : []
    const uniqueAffixId = item.uniqueAffix?.affixId
    const candidates: AffixIncomeCandidate[] = []
    for (const [index, roll] of affixRolls.entries()) {
        if (uniqueAffixId !== undefined && roll.affixId === uniqueAffixId) continue
        candidates.push({ key: getAffixIncomeKey(index, roll.affixId), item: withoutAffixIndex(item, index) })
    }
    if (uniqueAffixId !== undefined) {
        const affix = getAffixById(uniqueAffixId)
        const charId = options.charId ?? 0
        const gated = affix !== undefined && charId > 0 && !isAffixAllowedForChar(affix, charId)
        if (!gated) {
            candidates.push({ key: getUniqueAffixIncomeKey(uniqueAffixId), item: withoutUniqueAffix(item, uniqueAffixId) })
            for (const component of createUniqueComponentCandidates(uniqueAffixId)) {
                candidates.push({ ...component, item })
            }
        }
    }
    return candidates
}

/** 逐词条收益请求：基准 = 预览物品（全部词条），候选 = 去掉该条后的同一物品 */
export interface AffixIncomeRequest {
    side: TranscendSlotGroup
    /** 已放入预览物品的基准装备组 */
    baselineGear: TranscendGearGroup
    /** 预览物品所在装备位 */
    slotId: number
    /** 逐条移除普通词条后的候选物品（专属组件候选可带抑制选项） */
    candidates: AffixIncomeCandidate[]
    gainContext: GearGainContext
}

export interface AffixIncomeResult {
    /** 词条 key → 去掉该词条后的相对收益比例（正号百分比口径）；算不出为 null */
    incomes: Record<string, number | null>
    failures: GearIncomeFailure[]
    /** 口径标记：team = 目标函数卡启用侧合计；owner = 无启用侧回退装备者自身侧；缺省 = 旧单侧路径 */
    target?: GearIncomeTarget
}

/**
 * 请求预览物品逐条词条的相对收益：`(全量 - 去掉该条) / 去掉该条`，与装备相对收益同口径。
 * 基准 / 候选均按目标函数卡的团队合计求值（候选只改写 owner side 的装备组）。
 * worker 差分是「候选 - 基准」，因此基准取全量物品、候选取去掉一条后的物品。
 * @param payload 请求体
 * @returns key → 收益比例与候选失败列表
 */
export function requestAffixIncomes(payload: AffixIncomeRequest): Promise<AffixIncomeResult> {
    if (!payload.candidates.length) return Promise.resolve({ incomes: {}, failures: [] })
    if (!isGearIncomeDataReady()) return Promise.reject(new Error("data-unavailable"))
    const baseline = teamSnapshotsOf(payload.gainContext, payload.side, payload.baselineGear)
    if (!baseline) return Promise.reject(new Error("build-unavailable"))
    const candidates: { key: string; builds: GearIncomeSideSnapshot[] }[] = []
    const failures: GearIncomeFailure[] = []
    for (const candidate of payload.candidates) {
        const team = teamSnapshotsOf(
            payload.gainContext,
            payload.side,
            withGearItem(payload.baselineGear, payload.slotId, candidate.item),
            candidate.suppress
                ? {
                      suppress: {
                          ...candidate.suppress,
                          // 收敛到 owner 侧 + 当前装备位：同词条装在别的侧时不重复扣除
                          ownerSide: candidate.suppress.ownerSide ?? payload.side,
                          slotId: candidate.suppress.slotId ?? payload.slotId,
                      },
                  }
                : undefined
        )
        if (!team) {
            failures.push({ key: candidate.key, error: "build-unavailable" })
            continue
        }
        candidates.push({ key: candidate.key, builds: team.sides })
    }

    return postIncomeRequest(baseline.sides, candidates, failures, baseline.target).then(result => {
        const incomes: Record<string, number | null> = {}
        for (const candidate of payload.candidates) {
            const delta = result.incomes[candidate.key]
            incomes[candidate.key] = typeof delta === "number" ? relativeGain(result.baseline, result.baseline + delta) : null
        }
        return { incomes, failures: result.failures, target: result.target }
    })
}
