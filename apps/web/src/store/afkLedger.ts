/**
 * 狩月账本的持久化与写入队列。
 *
 * 数据落在独立的 IndexedDB（`dna-afk`），只由主窗口写入；屏幕信息条读主窗口写出的
 * localStorage 快照，不直接打开数据库。管道事件按到达顺序串行落库，避免「掉落先于
 * 场次创建」把归属算错。
 */

import Dexie, { type Table } from "dexie"
import { defineStore } from "pinia"
import type { AfkEvent } from "@/api/afkSupport"
import { charMap, modMap, resourceMap, weaponMap } from "@/data/d"
import { patchAfkAnimState } from "@/utils/afk-anim-state"
import {
    AFK_LEDGER_DB_NAME,
    AFK_LEDGER_RETENTION_DAYS,
    AFK_LEDGER_STORAGE_KEY,
    type AfkDrop,
    type AfkDropType,
    type AfkLedgerSnapshot,
    type AfkRun,
    buildSnapshot,
    emptySnapshot,
    resolveCraftItem,
} from "@/utils/afk-ledger"

class AfkLedgerDatabase extends Dexie {
    runs!: Table<AfkRun, number>
    drops!: Table<AfkDrop, number>

    constructor() {
        super(AFK_LEDGER_DB_NAME)
        // 只有一个版本：账本从第一天起就带 status，不再保留 v1 的迁移路径
        this.version(2).stores({
            runs: "++id, startedAt, endedAt, sessionId, dungeonId, status",
            drops: "++id, at, runId, sessionId, dungeonId, rarity",
        })
    }
}

/**
 * 按掉落 id 与名称判断奖励类型。id 查不到时按名兜底（新物品/数据包滞后时不再错成资源）。
 * @param id 游戏奖励 id；铸造消息没有 id，传 null 走按名解析
 * @param name 游戏奖励名
 * @returns 展示类型
 */
function resolveDropType(id: number | null, name: string): AfkDropType {
    if (id !== null) {
        const mod = modMap.get(id)
        if (mod?.名称 === name) return "Mod"
        const resource = resourceMap.get(id)
        if (resource?.name === name) return "Resource"
        const weapon = weaponMap.get(id)
        if (weapon?.名称 === name) return "Weapon"
        const char = charMap.get(id)
        if (char?.名称 === name) return "Char"
        if (mod) return "Mod"
        if (resource) return "Resource"
        if (weapon) return "Weapon"
        if (char) return "Char"
    }
    // 铸造消息没有 id，或 id 在数据包里查不到：按名反查（武器铸造成品走这里）
    return resolveCraftItem(name).itemType
}

/** 当前打开的数据库实例；只在主窗口的动作里惰性创建。 */
let database: AfkLedgerDatabase | null = null
/** 备份文件格式版本。 */
const BACKUP_VERSION = 1

/** 重开应用时，超过这个时长还没结束的场次视为已中断，按完成收尾（兜底）。 */
const STALE_RUN_MS = 6 * 3600_000
/** 初始化去重：App 与页面可能同时触发 init。 */
let initPromise: Promise<void> | null = null
/** 最近一条已处理的完成回调（游戏会重复发同一条）。 */
let lastComplete: { id: string; at: number } | null = null
/** 最近完成的一场：重开挑战补场次时用它取副本与结束时刻。 */
let lastFinishedRun: { dungeonId: string; dungeonName: string; endedAt: number } | null = null
/** 完成之后是否还没收到 idle 角色事件（收到说明已经离开副本）。 */
let awaitingIdle = false

/**
 * 取数据库实例。
 * @returns IndexedDB 实例
 */
function ledgerDb() {
    return (database ??= new AfkLedgerDatabase())
}

/** 事件写入队列：保证 enter → reward → complete 的落库顺序与到达顺序一致。 */
let writeQueue: Promise<void> = Promise.resolve()
/** 快照刷新定时器（合并一次回放里的连续事件）。 */
let snapshotTimer: number | null = null

/**
 * 把「当前进行中场次」的掉落整体写进动画状态。
 *
 * 供两类时机调用：账本收到事件时增量刷新，以及动画窗口打开时一次性读取已掉落的东西
 * （不依赖之后还会不会来事件）。做成模块级函数：小窗只读，不该牵扯 Pinia store 的生命周期。
 */
export async function publishRunDrops(): Promise<void> {
    const db = ledgerDb()
    const running = await db.runs.where("status").equals("running").toArray()
    const run = running.sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run?.id) {
        patchAfkAnimState({ runDrops: [] })
        return
    }
    const drops = await db.drops.where("runId").equals(run.id).toArray()
    patchAfkAnimState({
        runDrops: drops
            .filter(drop => drop.kind === "reward")
            .sort((a, b) => a.at - b.at)
            .map(drop => ({
                id: drop.itemId,
                name: drop.itemName,
                rarity: drop.rarity,
                count: drop.count,
                at: drop.at,
            })),
    })
}

/** 当前进行中的场次（内存态，重启后由 init 收尾）。 */
type ActiveRun = {
    id: number
    dungeonId: string
    dungeonName: string
    startedAt: number
}

export const useAfkLedgerStore = defineStore("afkLedger", {
    state: () => ({
        initialized: false,
        /** 屏幕信息条读的统计快照 */
        snapshot: emptySnapshot() as AfkLedgerSnapshot,
        /** 当前连接会话（连接建立时刻） */
        sessionId: null as number | null,
        /** 正在进行的场次 */
        activeRun: null as ActiveRun | null,
        /** 页面用来感知新数据的版本号 */
        version: 0,
        busy: false,
        error: "",
    }),
    actions: {
        /**
         * 初始化：清理过期数据、收尾上次未结束的场次、生成首份快照。
         */
        async init() {
            if (this.initialized) return
            if (initPromise) {
                await initPromise
                return
            }
            this.busy = true
            this.error = ""
            initPromise = (async () => {
                try {
                    const db = ledgerDb()
                    const cutoff = Date.now() - AFK_LEDGER_RETENTION_DAYS * 86400000
                    await db.runs.where("startedAt").below(cutoff).delete()
                    await db.drops.where("at").below(cutoff).delete()
                    // 还没收到 complete 的场次：
                    // 最近的（可能是重开应用时游戏仍在跑）恢复成「进行中」，等它的 complete 收尾；
                    // 更早的视为已中断，按完成收尾并认领挂起的掉落，作为兜底
                    const openRuns = (await db.runs.filter(run => run.status === "running" || !run.status).toArray()).sort(
                        (a, b) => b.startedAt - a.startedAt
                    )
                    const now = Date.now()
                    for (const [index, run] of openRuns.entries()) {
                        if (run.id === undefined) continue
                        if (index === 0 && now - run.startedAt < STALE_RUN_MS) {
                            this.activeRun = {
                                id: run.id,
                                dungeonId: run.dungeonId,
                                dungeonName: run.dungeonName,
                                startedAt: run.startedAt,
                            }
                            continue
                        }
                        await db.runs.update(run.id, { endedAt: run.endedAt ?? run.startedAt, status: "done" })
                        await this.attachPending(run)
                    }
                    this.initialized = true
                    await this.refreshSnapshot()
                } catch (error) {
                    this.error = String(error)
                } finally {
                    this.busy = false
                }
            })()
            try {
                await initPromise
            } finally {
                initPromise = null
            }
        },
        /**
         * 开一个新的连接会话；上一个仍挂着的场次按未完成收尾。
         * @param at 连接建立时刻
         */
        beginSession(at: number) {
            writeQueue = writeQueue
                .then(async () => {
                    await this.init()
                    // 连接重建不等于场次结束：进行中的场次继续挂着，等它自己的 complete，
                    // 免得一次断线把一场正常战斗记成完成
                    this.sessionId = at
                    this.version += 1
                    this.scheduleSnapshot()
                })
                .catch(error => {
                    this.error = String(error)
                })
        },
        /**
         * 记录一条管道事件（回放事件由调用方过滤）。
         * @param event 管道事件
         * @param replayed 是否来自连接瞬间的历史回放
         */
        record(event: AfkEvent, replayed: boolean) {
            if (replayed) return
            writeQueue = writeQueue
                .then(async () => {
                    await this.init()
                    await this.applyEvent(event)
                })
                .catch(error => {
                    this.error = String(error)
                })
        },
        /**
         * 把一条事件落库。
         * @param event 管道事件
         */
        async applyEvent(event: AfkEvent) {
            const at = event.receivedAt || Date.now()
            if (event.kind === "dungeon") {
                if (event.status === "enter") await this.applyEnter(event.id, event.name, at)
                else await this.applyComplete(event.id, event.name, at)
            } else if (event.kind === "reward" || event.kind === "craft") {
                // 铸造产物与副本无关：永远不挂场次，页面用独立维度统计。
                // 只有名字没有 id，武器等成品在这里按名反查回填 id，否则展示层拿不到图标与详情链
                if (event.kind === "craft") {
                    const crafted = resolveCraftItem(event.name)
                    await ledgerDb().drops.add({
                        sessionId: this.sessionId ?? 0,
                        runId: null,
                        dungeonId: "",
                        dungeonName: "",
                        at,
                        kind: "craft",
                        itemId: crafted.itemId,
                        itemName: event.name,
                        itemType: crafted.itemType,
                        rarity: event.rarity,
                        count: event.count,
                    })
                } else {
                    // 游戏在「同一副本重新挑战」时不会重发开始事件：完成之后没等到 idle
                    // 就又掉落了，说明玩家已经重开，用上一场的结束时刻补一条开始事件，
                    // 掉落才能归到这一场而不是挂起
                    if (!this.activeRun && awaitingIdle && lastFinishedRun) {
                        awaitingIdle = false
                        await this.applyEnter(lastFinishedRun.dungeonId, lastFinishedRun.dungeonName, lastFinishedRun.endedAt)
                    }
                    // 有正在进行的场次就直接归给它（开始/结束成对时这是准确归属）；
                    // 没在副本里掉出来的先挂起，作为「错过开始帧」时的兜底
                    const active = this.activeRun
                    await ledgerDb().drops.add({
                        sessionId: this.sessionId ?? 0,
                        runId: active?.id ?? null,
                        dungeonId: active?.dungeonId ?? "",
                        dungeonName: active?.dungeonName ?? "",
                        at,
                        kind: "reward",
                        itemId: event.id,
                        itemName: event.name,
                        itemType: resolveDropType(event.id, event.name),
                        rarity: event.rarity,
                        count: event.count,
                    })
                    // 只有进行中的场次才进动画状态：动画画的永远是「这一场」的掉落
                    if (active) await publishRunDrops()
                }
            } else if (event.kind === "character") {
                // idle/death 等非战斗状态说明已经离开副本，重开挑战的补场次不再适用
                if (event.state !== "combat") awaitingIdle = false
                return
            } else {
                return
            }
            this.version += 1
            this.scheduleSnapshot()
        },
        /**
         * 处理场次开始。
         * @param dungeonId 副本 ID
         * @param dungeonName 副本名
         * @param at 接收时刻
         */
        async applyEnter(dungeonId: string, dungeonName: string, at: number) {
            const active = this.activeRun
            if (active && active.dungeonId === dungeonId && at - active.startedAt < 5000) return
            if (active) await this.closeActive(at)
            const id = await ledgerDb().runs.add({
                sessionId: this.sessionId ?? 0,
                dungeonId,
                dungeonName,
                startedAt: at,
                endedAt: null,
                status: "running",
            })
            this.activeRun = { id, dungeonId, dungeonName, startedAt: at }
            // 动画只画这一场的掉落：进场先把上一场清空
            await publishRunDrops()
        },
        /**
         * 处理场次完成。没有对应开始消息的完成帧直接忽略，避免把重复 complete 计成新场次。
         * @param dungeonId 副本 ID
         * @param dungeonName 副本名
         * @param at 接收时刻
         */
        async applyComplete(dungeonId: string, dungeonName: string, at: number) {
            // 同一条完成回调会在瞬间重复多次，按「副本 + 3 秒」去重
            if (lastComplete && lastComplete.id === dungeonId && at - lastComplete.at < 3000) return
            lastComplete = { id: dungeonId, at }
            const active = this.activeRun
            if (active && (!dungeonId || !active.dungeonId || dungeonId === active.dungeonId)) {
                const name = active.dungeonName || dungeonName
                await ledgerDb().runs.update(active.id, { endedAt: at, status: "done", dungeonName: name })
                this.activeRun = null
                lastFinishedRun = { dungeonId: active.dungeonId, dungeonName: name, endedAt: at }
                awaitingIdle = true
                await publishRunDrops()
                await this.attachPending({ ...active, dungeonName: name })
                return
            }
            // 开始与结束成对到达，或错过了开始帧：补一条已完成的场次，不能丢。
            // 先收掉挂着的那一场（不抢掉落），再把挂起的掉落整批归给这次完成的副本
            if (active) await this.closeActive(at, false)
            // 游戏「重新挑战」时不发开始信号：没收到 idle 就又来一条完成，说明上一场结束即重开，
            // 用上一场的结束时刻补开始时刻，否则时长会被记成 0
            const reopened =
                !active &&
                awaitingIdle &&
                lastFinishedRun &&
                (!dungeonId || !lastFinishedRun.dungeonId || dungeonId === lastFinishedRun.dungeonId)
                    ? lastFinishedRun
                    : null
            const startedAt = reopened ? Math.min(reopened.endedAt, at) : at
            const runDungeonId = dungeonId || reopened?.dungeonId || ""
            const runDungeonName = dungeonName || reopened?.dungeonName || ""
            const id = await ledgerDb().runs.add({
                sessionId: this.sessionId ?? 0,
                dungeonId: runDungeonId,
                dungeonName: runDungeonName,
                startedAt,
                endedAt: at,
                status: "done",
            })
            lastFinishedRun = { dungeonId: runDungeonId, dungeonName: runDungeonName, endedAt: at }
            awaitingIdle = true
            await publishRunDrops()
            await this.attachPending({ id, dungeonId: runDungeonId, dungeonName: runDungeonName })
        },
        /**
         * 把当前所有未归属的掉落整批挂到场次上。
         * @param run 目标场次
         */
        async attachPending(run: { id?: number; dungeonId: string; dungeonName: string }) {
            if (run.id === undefined) return
            await ledgerDb()
                .drops.toCollection()
                .filter(drop => drop.runId === null && drop.kind !== "craft")
                .modify({ runId: run.id, dungeonId: run.dungeonId, dungeonName: run.dungeonName })
        },
        /**
         * 收尾当前场次。账本不记录「中断」，一律按完成收尾。
         * @param at 结束时刻
         * @param flush 是否把挂起的掉落归给这一场（默认是）
         */
        async closeActive(at: number, flush = true) {
            const active = this.activeRun
            if (!active) return
            await ledgerDb().runs.update(active.id, { endedAt: at, status: "done" })
            this.activeRun = null
            lastFinishedRun = { dungeonId: active.dungeonId, dungeonName: active.dungeonName, endedAt: at }
            await publishRunDrops()
            if (flush) await this.attachPending(active)
        },
        /**
         * 刷新快照并写给屏幕信息条。
         */
        async refreshSnapshot() {
            const db = ledgerDb()
            const [runs, drops] = await Promise.all([db.runs.toArray(), db.drops.toArray()])
            this.snapshot = buildSnapshot(runs, drops, this.sessionId)
            try {
                localStorage.setItem(AFK_LEDGER_STORAGE_KEY, JSON.stringify(this.snapshot))
            } catch (error) {
                this.error = String(error)
            }
        },
        /**
         * 延迟合并刷新快照。
         */
        scheduleSnapshot() {
            if (snapshotTimer !== null) window.clearTimeout(snapshotTimer)
            snapshotTimer = window.setTimeout(() => {
                snapshotTimer = null
                void this.refreshSnapshot()
            }, 400)
        },
        /**
         * 查询页面时间范围内的场次与掉落；品质/物品/时段在页面上过滤，保证筛选项始终完整。
         * @param from 起始时间戳（含）；0 表示不限
         * @param to 结束时间戳（含）
         * @param dungeonId 副本筛选；空串表示全部
         * @returns 场次与掉落
         */
        async loadRange(from: number, to: number, dungeonId: string) {
            const db = ledgerDb()
            const [runs, drops] = await Promise.all([
                from > 0 ? db.runs.where("startedAt").between(from, to, true, true).toArray() : db.runs.toArray(),
                from > 0 ? db.drops.where("at").between(from, to, true, true).toArray() : db.drops.toArray(),
            ])
            // 掉落的场次可能落在查询区间之外（跨时段的战斗），补查一次，页面才能把副本名还原出来
            const loaded = new Set(runs.map(run => run.id))
            const missing = [...new Set(drops.map(drop => drop.runId).filter((id): id is number => id !== null && !loaded.has(id)))]
            const extraRuns = missing.length > 0 ? await db.runs.bulkGet(missing) : []
            const runIndex = new Map<number, AfkRun>()
            for (const run of [...runs, ...extraRuns]) {
                if (run?.id !== undefined) runIndex.set(run.id, run as AfkRun)
            }
            return {
                runs: dungeonId ? runs.filter(run => run.dungeonId === dungeonId) : runs,
                drops: dungeonId ? drops.filter(drop => drop.dungeonId === dungeonId) : drops,
                runIndex,
            }
        },
        /**
         * 导出全部场次与掉落。
         * @returns 备份内容（可直接序列化为 JSON）
         */
        async exportBackup() {
            const db = ledgerDb()
            const [runs, drops] = await Promise.all([db.runs.toArray(), db.drops.toArray()])
            return { version: BACKUP_VERSION, exportedAt: Date.now(), runs, drops }
        },
        /**
         * 导入备份：按自然键去重合并，不覆盖已有数据。
         * @param payload 备份内容
         * @returns 实际新增的场次 / 掉落 / 跳过的条数
         */
        async importBackup(payload: unknown) {
            if (!payload || typeof payload !== "object") throw new Error("invalid backup")
            const source = payload as { runs?: unknown; drops?: unknown }
            if (!Array.isArray(source.runs) || !Array.isArray(source.drops)) throw new Error("invalid backup")
            const db = ledgerDb()
            const result = { runs: 0, drops: 0, skipped: 0 }

            const runKey = (run: AfkRun) => `${run.dungeonId}|${run.startedAt}|${run.endedAt ?? ""}|${run.status}`
            const dropKey = (drop: AfkDrop) =>
                `${drop.kind}|${drop.itemId ?? ""}|${drop.itemName}|${drop.at}|${drop.count}|${drop.runId ?? ""}`

            const existingRuns = new Map<string, number>()
            for (const run of await db.runs.toArray()) {
                if (run.id !== undefined) existingRuns.set(runKey(run), run.id)
            }
            /** 备份里的旧 id → 本地 id，掉落的 runId 靠它重映射。 */
            const idMap = new Map<number, number>()
            for (const raw of source.runs) {
                const run = this.sanitizeRun(raw)
                if (!run) {
                    result.skipped += 1
                    continue
                }
                const key = runKey(run)
                const existing = existingRuns.get(key)
                if (existing !== undefined) {
                    if (run.id !== undefined) idMap.set(run.id, existing)
                    result.skipped += 1
                    continue
                }
                const { id, ...rest } = run
                const added = await db.runs.add(rest as AfkRun)
                existingRuns.set(key, added)
                if (id !== undefined) idMap.set(id, added)
                result.runs += 1
            }

            const existingDrops = new Set((await db.drops.toArray()).map(dropKey))
            for (const raw of source.drops) {
                const drop = this.sanitizeDrop(raw)
                if (!drop) {
                    result.skipped += 1
                    continue
                }
                if (drop.runId !== null) drop.runId = idMap.get(drop.runId) ?? null
                const key = dropKey(drop)
                if (existingDrops.has(key)) {
                    result.skipped += 1
                    continue
                }
                const { id, ...rest } = drop
                await db.drops.add(rest as AfkDrop)
                existingDrops.add(key)
                result.drops += 1
            }

            this.version += 1
            await this.refreshSnapshot()
            return result
        },
        /**
         * 校验并规整一条导入的场次。
         * @param raw 原始数据
         * @returns 合法场次；字段不完整时返回 null
         */
        sanitizeRun(raw: unknown): AfkRun | null {
            if (!raw || typeof raw !== "object") return null
            const run = raw as Record<string, unknown>
            const startedAt = Number(run.startedAt)
            if (!Number.isFinite(startedAt)) return null
            const endedAt = run.endedAt === null || run.endedAt === undefined ? null : Number(run.endedAt)
            if (endedAt !== null && !Number.isFinite(endedAt)) return null
            return {
                id: Number.isFinite(Number(run.id)) ? Number(run.id) : undefined,
                sessionId: Number(run.sessionId) || 0,
                dungeonId: String(run.dungeonId ?? ""),
                dungeonName: String(run.dungeonName ?? ""),
                startedAt,
                endedAt,
                status: run.status === "running" ? "running" : "done",
            }
        },
        /**
         * 校验并规整一条导入的掉落。
         * @param raw 原始数据
         * @returns 合法掉落；字段不完整时返回 null
         */
        sanitizeDrop(raw: unknown): AfkDrop | null {
            if (!raw || typeof raw !== "object") return null
            const drop = raw as Record<string, unknown>
            const at = Number(drop.at)
            const count = Number(drop.count)
            const name = typeof drop.itemName === "string" ? drop.itemName : ""
            if (!Number.isFinite(at) || !Number.isFinite(count) || !name) return null
            const kind = drop.kind === "craft" ? "craft" : "reward"
            // 旧备份里的铸造武器存的是 Resource + 空 id，导入时按名纠正，与实时写入口径一致
            const parsedId = drop.itemId === null || drop.itemId === undefined ? null : Number(drop.itemId)
            const fallback = parsedId === null ? resolveCraftItem(name) : null
            return {
                id: Number.isFinite(Number(drop.id)) ? Number(drop.id) : undefined,
                sessionId: Number(drop.sessionId) || 0,
                runId: drop.runId === null || drop.runId === undefined ? null : Number(drop.runId),
                dungeonId: String(drop.dungeonId ?? ""),
                dungeonName: String(drop.dungeonName ?? ""),
                at,
                kind,
                itemId: parsedId ?? fallback?.itemId ?? null,
                itemName: name,
                itemType: resolveDropType(parsedId, name),
                rarity: Math.min(5, Math.max(1, Number(drop.rarity) || 1)),
                count,
            }
        },
        /**
         * 清空全部账本数据（不可恢复）。
         */
        async clearAll() {
            this.busy = true
            try {
                const db = ledgerDb()
                await db.runs.clear()
                await db.drops.clear()
                this.activeRun = null
                lastComplete = null
                this.snapshot = { ...emptySnapshot(), sessionId: this.sessionId }
                localStorage.setItem(AFK_LEDGER_STORAGE_KEY, JSON.stringify(this.snapshot))
                this.version += 1
            } catch (error) {
                this.error = String(error)
            } finally {
                this.busy = false
            }
        },
    },
})
