import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
    addTranscendGearVariant,
    affixes,
    createDefaultTranscendBuildSettings,
    createTranscendBuild,
    slots,
    switchTranscendGearVariant,
    syncActiveGearVariant,
    type TranscendBuildSettings,
} from "@/data"
import { type CharBuildWorkerSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { getBaseNameOptions } from "./catalog"
import { withoutItem } from "./gain"
import { buildGearItem } from "./generation"
import { isGearIncomeDataReady, requestGearIncomes, withGearItem, withItem } from "./income"
import { calculateIncomeResponse, type GearIncomeSideBuild } from "./income.worker"
import { calculateSnapshotDamage, calculateTeamSnapshotDamage, hasSameTeamSides } from "./income-core"

describe("收益数据就绪", () => {
    it("版本门限清空升华表时判定不可计算（hydration 仍为 true 也不能当 0 收益）", () => {
        expect(isGearIncomeDataReady([], [])).toBe(false)
        expect(isGearIncomeDataReady(affixes, [])).toBe(false)
        expect(isGearIncomeDataReady([], slots)).toBe(false)
        expect(isGearIncomeDataReady(affixes, slots)).toBe(true)
    })

    it("worker 模块图不直接引入 @/data 数据表，只消费主线程快照", () => {
        const source = readFileSync(new URL("./income.worker.ts", import.meta.url), "utf8")
        expect(source).toContain("./income-core")
        expect(source).not.toMatch(/from\s+["']@\/data["']/)
    })
})

describe("收益候选替换", () => {
    const item = (slotType: number) => ({ kind: "normal" as const, slotType, affixes: [] })
    const gear = (slotId: number, slotType: number) => ({ slotId, item: item(slotType) })

    /** 两份变体（A 有装备，B 为空模板），激活 A */
    function settingsWithVariants(): TranscendBuildSettings {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [gear(1, 1)]
        settings.transcend.assist1Gear = [gear(9, 8)]
        settings.transcend.assist2Gear = [gear(13, 8)]
        syncActiveGearVariant(settings.transcend)
        addTranscendGearVariant(settings.transcend)
        switchTranscendGearVariant(settings.transcend, "A")
        return settings
    }

    it("withItem 不修改入参（三组装备与全部变体保持原样）", () => {
        const settings = settingsWithVariants()
        const before = JSON.parse(JSON.stringify(settings))
        const candidate = item(1)
        const next = withItem(settings, "main", 1, candidate)
        expect(JSON.parse(JSON.stringify(settings))).toEqual(before)
        expect(next).not.toBe(settings)
        expect(next.transcend).not.toBe(settings.transcend)
        expect(next.transcend.mainGear).not.toBe(settings.transcend.mainGear)
        expect(next.transcend.mainGear).toHaveLength(1)
        expect(getSlot(next.transcend.mainGear, 1)?.item).toBe(candidate)
        // 计算只读顶层三组：不写激活变体，其它变体也不受影响
        expect(next.transcend.gearVariants).toBe(settings.transcend.gearVariants)
        expect(next.transcend.gearVariants[0]).toEqual(before.transcend.gearVariants[0])
    })

    it("协战一 / 协战二各写自己的组，其它组不变", () => {
        const settings = settingsWithVariants()
        const candidate = item(8)
        const next1 = withItem(settings, "assist1", 9, candidate)
        expect(next1.transcend.assist1Gear).toHaveLength(1)
        expect(next1.transcend.assist1Gear[0]).toEqual({ slotId: 9, item: candidate })
        expect(next1.transcend.assist2Gear).toBe(settings.transcend.assist2Gear)
        expect(next1.transcend.mainGear).toBe(settings.transcend.mainGear)

        const next2 = withItem(settings, "assist2", 13, candidate)
        expect(next2.transcend.assist2Gear).toHaveLength(1)
        expect(next2.transcend.assist2Gear[0]).toEqual({ slotId: 13, item: candidate })
        expect(next2.transcend.assist1Gear).toBe(settings.transcend.assist1Gear)
        expect(next2.transcend.mainGear).toBe(settings.transcend.mainGear)
    })

    it("同槽替换：旧物品被移除，其它槽位保留", () => {
        const settings = settingsWithVariants()
        settings.transcend.mainGear = [gear(1, 1), gear(2, 2)]
        const next = withItem(settings, "main", 1, item(1))
        expect(next.transcend.mainGear.map(entry => entry.slotId)).toEqual([2, 1])
        expect(next.transcend.mainGear).toHaveLength(2)
    })
})

/** 按槽位取装备条目（测试辅助） */
function getSlot(group: readonly unknown[], slotId: number): { slotId?: number; item?: unknown } | undefined {
    return (group as { slotId?: number; item?: unknown }[]).find(entry => Math.round(Number(entry.slotId)) === slotId)
}

describe("收益快照一致性", () => {
    it("worker 基准伤害 = 主线程同一构筑伤害（含升华装备效果）", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        const gear = buildGearItem(1, {
            rarityId: 5,
            equipBaseScore: 50,
            iconId: getBaseNameOptions(1)[0].id,
            randomAffixes: [],
        })
        settings.transcend.mainGear = [{ slotId: 1, item: gear }]
        const built = createTranscendBuild(settings, "main")!
        const direct = built.build.calculate()
        const viaSnapshot = calculateSnapshotDamage(createWorkerSnapshot(built.build))
        expect(viaSnapshot.error).toBeUndefined()
        expect(viaSnapshot.damage).toBeCloseTo(direct, 8)
    })

    it("含 310201 技能替换的升华构筑：收益快照与主线程伤害一致", () => {
        const settings = createDefaultTranscendBuildSettings(3102)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [
            { slotId: 1, affixId: 310201, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
        ]
        settings.main.baseName = "高温清扫"
        const built = createTranscendBuild(settings, "main")!
        expect(built.build.skillReplacements[310201]).toMatchObject({ id: 310212 })
        const direct = built.build.calculate()
        const viaSnapshot = calculateSnapshotDamage(createWorkerSnapshot(built.build))
        expect(viaSnapshot.error).toBeUndefined()
        expect(viaSnapshot.damage).toBeCloseTo(direct, 8)
    })

    it("快照损坏时返回明确错误，不当作 0", () => {
        const result = calculateSnapshotDamage({} as never)
        expect(result.damage).toBeUndefined()
        expect(result.error).toBeTruthy()
    })
})

/** 收益请求桩：只回传基准 1 与候选 0 差值，不重建构筑 */
class StubWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    postMessage(request: { id: number; candidates: { key: string }[] }) {
        queueMicrotask(() => {
            this.onmessage?.({
                data: {
                    id: request.id,
                    baseline: 1,
                    incomes: Object.fromEntries(request.candidates.map(candidate => [candidate.key, 0])),
                    failures: [],
                },
            } as unknown as MessageEvent)
        })
    }
    terminate() {}
}

/** 仅替换收益请求依赖的浏览器全局（node 测试环境没有 Worker / window） */
function installRuntimeStubs() {
    vi.stubGlobal("Worker", StubWorker)
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
}

/** 各构筑位目标表达式独立（U84a）：收益请求必须校验该构筑位自己的表达式 */
describe("收益请求按构筑位校验目标表达式", () => {
    /** 主控与协战一使用不同目标表达式；顶层 mirror 保持主控值（旧实现的错误来源） */
    function settingsWithSideTargets(mainTarget: string, assistTarget: string) {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.assist1 = { ...settings.main, enabled: true, targetFunction: assistTarget }
        settings.main.targetFunction = mainTarget
        settings.targetFunction = mainTarget
        return settings
    }

    const candidate = { key: "c1", item: { kind: "normal" as const, slotType: 9, affixes: [] } }

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("主控表达式非法不影响协战一请求（使用协战自己的表达式）", async () => {
        installRuntimeStubs()
        const result = await requestGearIncomes({
            settings: settingsWithSideTargets("1 +", "1"),
            side: "assist1",
            slotId: 10,
            candidates: [candidate],
        })
        expect(result.baseline).toBe(1)
        expect(result.incomes).toEqual({ c1: 0 })
    })

    it("协战一自己的表达式非法时明确失败", async () => {
        installRuntimeStubs()
        await expect(
            requestGearIncomes({ settings: settingsWithSideTargets("1", "1 +"), side: "assist1", slotId: 10, candidates: [] })
        ).rejects.toBeInstanceOf(Error)
    })
})

/** U91b-fix：宿主 gain context 的组装语义与失败分支 */
describe("withGearItem 与宿主收益上下文", () => {
    const item = (slotType: number) => ({ kind: "normal" as const, slotType, affixes: [] })
    const gear = (slotId: number, slotType: number) => ({ slotId, item: item(slotType) })
    const candidate = { key: "c1", item: item(2) }

    /** 主控两件装备（故意乱序，验证候选组会按装备位排序） */
    function settingsWithMainGear(): TranscendBuildSettings {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [gear(3, 3), gear(1, 1)]
        return settings
    }

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("withGearItem：替换指定槽位、按装备位排序、不修改原组、null 清空", () => {
        const original = [gear(3, 3), gear(1, 1)]
        const next = withGearItem(original, 2, candidate.item)

        expect(next.map(entry => entry.slotId)).toEqual([1, 2, 3])
        expect((next.find(entry => entry.slotId === 2) as { item?: unknown } | undefined)?.item).toBe(candidate.item)
        expect(original.map(entry => entry.slotId)).toEqual([3, 1])

        const cleared = withGearItem(next, 2, null)
        expect(cleared.map(entry => entry.slotId)).toEqual([1, 3])
    })

    it("带 gainContext：基准 = settings 当前组，候选 = 替换指定槽位（picker 语义）", async () => {
        installRuntimeStubs()
        const settings = settingsWithMainGear()
        const before = JSON.parse(JSON.stringify(settings))
        const buildSnapshot = vi.fn((_side: string, _gear?: unknown) => ({}) as CharBuildWorkerSnapshot)
        const result = await requestGearIncomes({
            settings,
            side: "main",
            slotId: 2,
            candidates: [candidate],
            gainContext: { key: "ctx", buildSnapshot },
        })

        expect(result.baseline).toBe(1)
        expect(result.incomes).toEqual({ c1: 0 })
        expect(buildSnapshot).toHaveBeenNthCalledWith(1, "main", settings.transcend.mainGear)
        const candidateGear = buildSnapshot.mock.calls[1][1] as { slotId: number; item?: unknown }[]
        expect(candidateGear.map(entry => entry.slotId)).toEqual([1, 2, 3])
        expect(candidateGear.find(entry => entry.slotId === 2)?.item).toBe(candidate.item)
        // 候选组是纯函数产物，原设置不被修改
        expect(JSON.parse(JSON.stringify(settings))).toEqual(before)
    })

    it("section 语义：基准组来自 withoutItem，候选只回填被清空的槽位", async () => {
        installRuntimeStubs()
        const settings = settingsWithMainGear()
        const baselineSettings = withoutItem(settings, "main", 1)
        const buildSnapshot = vi.fn((_side: string, _gear?: unknown) => ({}) as CharBuildWorkerSnapshot)
        await requestGearIncomes({
            settings: baselineSettings,
            side: "main",
            slotId: 1,
            candidates: [candidate],
            gainContext: { key: "ctx", buildSnapshot },
        })

        expect(buildSnapshot).toHaveBeenNthCalledWith(1, "main", baselineSettings.transcend.mainGear)
        const candidateGear = buildSnapshot.mock.calls[1][1] as { slotId: number; item?: unknown }[]
        expect(candidateGear.map(entry => entry.slotId)).toEqual([1, 3])
        expect(candidateGear.find(entry => entry.slotId === 1)?.item).toBe(candidate.item)
    })

    it("候选快照为 null 时逐项返回失败（界面占位，不当作 0%）", async () => {
        installRuntimeStubs()
        let calls = 0
        const buildSnapshot = vi.fn(() => (calls++ === 0 ? ({} as CharBuildWorkerSnapshot) : null))
        const result = await requestGearIncomes({
            settings: settingsWithMainGear(),
            side: "main",
            slotId: 2,
            candidates: [candidate],
            gainContext: { key: "ctx", buildSnapshot },
        })

        expect(result.incomes.c1).toBeUndefined()
        expect(result.failures).toEqual([{ key: "c1", error: "build-unavailable" }])
    })

    it("基准快照为 null 时明确 reject（不静默返回 0）", async () => {
        await expect(
            requestGearIncomes({
                settings: settingsWithMainGear(),
                side: "main",
                slotId: 2,
                candidates: [candidate],
                gainContext: { key: "ctx", buildSnapshot: () => null },
            })
        ).rejects.toThrow("build-unavailable")
    })
})

/** U137-fix：团队合计 worker 协议（侧集合 / 合计 / 失败语义） */
describe("U137-fix worker 协议：侧集合与合计", () => {
    const settings = createDefaultTranscendBuildSettings(1101)
    const workerBuild = createTranscendBuild(settings, "main")!
    const snapshot: CharBuildWorkerSnapshot = createWorkerSnapshot(workerBuild.build)
    const baseDamage = calculateSnapshotDamage(snapshot).damage!
    const side = (id: string): GearIncomeSideBuild => ({ side: id, build: snapshot })

    it("hasSameTeamSides：数量 / side id 不一致为 false，顺序无关", () => {
        expect(hasSameTeamSides(["main", "assist1", "assist2"], ["main", "assist1", "assist2"])).toBe(true)
        expect(hasSameTeamSides(["main", "assist1", "assist2"], ["assist2", "main", "assist1"])).toBe(true)
        expect(hasSameTeamSides(["main", "assist1", "assist2"], ["main", "assist1"])).toBe(false)
        expect(hasSameTeamSides(["main", "assist1", "assist2"], ["main", "assist1", "assist1"])).toBe(false)
    })

    it("baseline 3 侧 / 候选 2 侧：候选 failure，不用缩小分母的合计做差", () => {
        const response = calculateIncomeResponse({
            id: 1,
            baseline: [side("main"), side("assist1"), side("assist2")],
            candidates: [{ key: "c1", builds: [side("main"), side("assist1")] }],
        })

        expect(response.baseline).toBeCloseTo(baseDamage * 3, 8)
        expect(response.incomes).toEqual({})
        expect(response.failures).toEqual([{ key: "c1", error: "side-mismatch" }])
    })

    it("侧集合一致：候选合计 - 基准合计；顺序不同不影响", () => {
        const response = calculateIncomeResponse({
            id: 2,
            baseline: [side("main"), side("assist1")],
            candidates: [{ key: "c1", builds: [side("assist1"), side("main")] }],
        })

        expect(response.baseline).toBeCloseTo(baseDamage * 2, 8)
        expect(response.incomes?.c1).toBe(0)
        expect(response.failures).toEqual([])
    })

    it("基准任一侧失败 / 空数组：明确 error，不返回部分和", () => {
        expect(calculateIncomeResponse({ id: 3, baseline: [], candidates: [] }).error).toBe("build-unavailable")
        const broken = { ...snapshot, char: { ...snapshot.char, data: undefined } } as unknown as CharBuildWorkerSnapshot
        const response = calculateIncomeResponse({ id: 4, baseline: [side("main"), { side: "assist1", build: broken }], candidates: [] })
        expect(response.error).toBeTruthy()
        expect(response.baseline).toBeUndefined()
    })

    it("calculateTeamSnapshotDamage：空数组与任一侧失败返回错误", () => {
        expect(calculateTeamSnapshotDamage([]).error).toBe("build-unavailable")
        expect(calculateTeamSnapshotDamage([snapshot, snapshot]).damage).toBeCloseTo(baseDamage * 2, 8)
        expect(calculateTeamSnapshotDamage([snapshot, {} as CharBuildWorkerSnapshot]).error).toBeTruthy()
    })
})
