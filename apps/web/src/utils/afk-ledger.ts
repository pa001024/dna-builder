/**
 * 狩月账本的数据模型与聚合。
 *
 * 把「小小狩月人」奖励管道里的事件整理成两类持久化记录：场次（run）与掉落（drop），
 * 并给页面、屏幕信息条提供只读聚合。这里不依赖 Dexie / Vue，便于单测。
 */

/** 账本独立的 IndexedDB 名：与主库 `dna` 分开，互不影响。 */
export const AFK_LEDGER_DB_NAME = "dna-afk"

/** 主窗口写给屏幕信息条的统计快照键。 */
export const AFK_LEDGER_STORAGE_KEY = "dna.afkLedger"

/** 金色品质阈值（游戏内 1=白 … 5=金）。 */
export const AFK_GOLD_RARITY = 5

/** 账本保留天数。 */
export const AFK_LEDGER_RETENTION_DAYS = 90

/**
 * 管道里会装扮成副本、但数据包副本表里没有的玩法。
 * 「迷津」的进入/完成事件用 id `20` 和占位名「测试场景」下发，必须在这里纠正展示名。
 */
export const AFK_DUNGEON_ALIASES: Record<string, string> = {
    "20": "迷津",
}

/**
 * 取副本在数据里的名字：已知的非副本玩法用别名，其余沿用游戏下发的名字。
 *
 * 这是纯函数，供聚合与单测使用；展示层要「带括号的完整名」请用
 * `dungeonDisplayName()`（依赖 i18n 与数据包索引）。
 * @param id 副本 ID
 * @param name 游戏下发的名字
 * @returns 名字
 */
export function afkDungeonName(id: string, name: string): string {
    return AFK_DUNGEON_ALIASES[id] ?? (name || id)
}

/** 一次挂机场次。 */
export type AfkRun = {
    /** 自增主键 */
    id?: number
    /** 所属连接会话（连接建立时刻） */
    sessionId: number
    /** 副本/委托 ID（官方消息里可能是字符串或数字） */
    dungeonId: string
    /** 副本/委托名 */
    dungeonName: string
    /** start 消息的本地接收时刻 */
    startedAt: number
    /** complete 消息的本地接收时刻；未结束为 null */
    endedAt: number | null
    /**
     * 场次状态：只有 enter 没有 complete 就是 running。
     * 写入时确定，查询与聚合都直接读它，不再用「有没有结束时间」去猜。
     */
    status: AfkRunStatus
}

/** 场次状态：进行中 / 已结束。 */
export type AfkRunStatus = "running" | "done"

/** 掉落物品类型（决定图标与详情链接）。 */
export type AfkDropType = "Mod" | "Resource" | "Weapon" | "Char"

/** 一条掉落。 */
export type AfkDrop = {
    /** 自增主键 */
    id?: number
    /** 所属连接会话 */
    sessionId: number
    /** 归属场次；等待下一次 complete 认领时为 null */
    runId: number | null
    /** 归属副本；尚未认领时为空串 */
    dungeonId: string
    dungeonName: string
    /** 接收时刻 */
    at: number
    /** 来源消息 */
    kind: "reward" | "craft"
    /** 物品 ID；craft 消息没有 ID */
    itemId: number | null
    /** 物品名（游戏原文） */
    itemName: string
    /** 物品类型（决定图标与详情链接） */
    itemType: AfkDropType
    /** 品质 1..5 */
    rarity: number
    /** 数量 */
    count: number
}

/** 计数三元组。 */
export type AfkTotals = {
    /** 完成场次 */
    runs: number
    /** 掉落件数（按 count 累加） */
    drops: number
    /** 金色件数 */
    gold: number
}

/** 单个副本在快照里的计数。 */
export type AfkDungeonTotals = {
    name: string
    today: AfkTotals
    session: AfkTotals
}

/** 写给屏幕信息条的快照。 */
export type AfkLedgerSnapshot = {
    /** 生成时刻 */
    updatedAt: number
    /** 当前连接会话；未知为 null */
    sessionId: number | null
    /** 今日计数 */
    today: AfkTotals
    /** 本次连接计数 */
    session: AfkTotals
    /** 已记录过的副本（含今日/本次为 0 的），供信息条选择来源 */
    dungeons: Record<string, AfkDungeonTotals>
}

/** 一份空快照。 */
export function emptyTotals(): AfkTotals {
    return { runs: 0, drops: 0, gold: 0 }
}

/** 一份空快照。 */
export function emptySnapshot(now = Date.now()): AfkLedgerSnapshot {
    return { updatedAt: now, sessionId: null, today: emptyTotals(), session: emptyTotals(), dungeons: {} }
}

/**
 * 本地时区当天 00:00。
 * @param ts 参考时间戳
 * @returns 当天零点时间戳
 */
export function startOfDay(ts: number): number {
    const date = new Date(ts)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
}

/**
 * 把场次与掉落聚合成屏幕信息条快照。
 * @param runs 全部场次
 * @param drops 全部掉落
 * @param sessionId 当前连接会话
 * @param now 参考时刻
 * @returns 快照
 */
export function buildSnapshot(runs: AfkRun[], drops: AfkDrop[], sessionId: number | null, now = Date.now()): AfkLedgerSnapshot {
    const dayStart = startOfDay(now)
    const today = emptyTotals()
    const session = emptyTotals()
    const dungeons: Record<string, AfkDungeonTotals> = {}

    const ensure = (id: string, name: string): AfkDungeonTotals | null => {
        if (!id) return null
        let entry = dungeons[id]
        if (!entry) {
            entry = { name: afkDungeonName(id, name), today: emptyTotals(), session: emptyTotals() }
            dungeons[id] = entry
        } else if (name) {
            entry.name = afkDungeonName(id, name)
        }
        return entry
    }

    for (const run of runs) {
        const entry = ensure(run.dungeonId, run.dungeonName)
        if (run.status !== "done") continue
        const isToday = run.startedAt >= dayStart
        const isSession = sessionId !== null && run.sessionId === sessionId
        if (isToday) {
            today.runs += 1
            if (entry) entry.today.runs += 1
        }
        if (isSession) {
            session.runs += 1
            if (entry) entry.session.runs += 1
        }
    }

    for (const drop of drops) {
        // 铸造产物不属于任何副本，走独立统计维度
        if (drop.kind === "craft") continue
        const entry = ensure(drop.dungeonId, drop.dungeonName)
        const isToday = drop.at >= dayStart
        const isSession = sessionId !== null && drop.sessionId === sessionId
        if (isToday) {
            today.drops += drop.count
            if (drop.rarity >= AFK_GOLD_RARITY) today.gold += drop.count
            if (entry) {
                entry.today.drops += drop.count
                if (drop.rarity >= AFK_GOLD_RARITY) entry.today.gold += drop.count
            }
        }
        if (isSession) {
            session.drops += drop.count
            if (drop.rarity >= AFK_GOLD_RARITY) session.gold += drop.count
            if (entry) {
                entry.session.drops += drop.count
                if (drop.rarity >= AFK_GOLD_RARITY) entry.session.gold += drop.count
            }
        }
    }

    return { updatedAt: now, sessionId, today, session, dungeons }
}

/**
 * 宽松校验从 localStorage 读到的快照。
 * @param raw 原始值
 * @returns 合法快照；形状不对时返回 null
 */
export function normalizeAfkSnapshot(raw: unknown): AfkLedgerSnapshot | null {
    if (!raw || typeof raw !== "object") return null
    const record = raw as Record<string, unknown>
    const totals = (value: unknown): AfkTotals | null => {
        if (!value || typeof value !== "object") return null
        const item = value as Record<string, unknown>
        const runs = Number(item.runs)
        const drops = Number(item.drops)
        const gold = Number(item.gold)
        if (!Number.isFinite(runs) || !Number.isFinite(drops) || !Number.isFinite(gold)) return null
        return { runs, drops, gold }
    }
    const today = totals(record.today)
    const session = totals(record.session)
    if (!today || !session) return null
    const dungeons: Record<string, AfkDungeonTotals> = {}
    if (record.dungeons && typeof record.dungeons === "object") {
        for (const [id, value] of Object.entries(record.dungeons as Record<string, unknown>)) {
            if (!value || typeof value !== "object") continue
            const item = value as Record<string, unknown>
            const todayTotals = totals(item.today)
            const sessionTotals = totals(item.session)
            if (!todayTotals || !sessionTotals) continue
            dungeons[id] = {
                name: typeof item.name === "string" ? item.name : id,
                today: todayTotals,
                session: sessionTotals,
            }
        }
    }
    return {
        updatedAt: Number(record.updatedAt) || 0,
        sessionId: typeof record.sessionId === "number" ? record.sessionId : null,
        today,
        session,
        dungeons,
    }
}

/** 趋势里的一格。 */
export type AfkTrendPoint = {
    /** 格子起点 */
    at: number
    /** 掉落件数 */
    drops: number
    /** 金色件数 */
    gold: number
}

/**
 * 按固定宽度分桶，供趋势图使用。
 * @param drops 掉落
 * @param from 起始时间
 * @param to 结束时间
 * @param bucketMs 桶宽
 * @returns 从 `from` 开始的连续桶
 */
export function trendBuckets(drops: AfkDrop[], from: number, to: number, bucketMs: number): AfkTrendPoint[] {
    const width = Math.max(1, bucketMs)
    const count = Math.max(1, Math.ceil((to - from) / width))
    const points: AfkTrendPoint[] = Array.from({ length: count }, (_, index) => ({ at: from + index * width, drops: 0, gold: 0 }))
    for (const drop of drops) {
        const index = Math.floor((drop.at - from) / width)
        if (index < 0 || index >= points.length) continue
        const point = points[index]
        point.drops += drop.count
        if (drop.rarity >= AFK_GOLD_RARITY) point.gold += drop.count
    }
    return points
}

/** 物品排行的一行。 */
export type AfkItemRow = {
    key: string
    itemId: number | null
    type: AfkDropType
    name: string
    rarity: number
    count: number
    dropCount: number
}

/**
 * 按物品聚合。
 * @param drops 掉落
 * @returns 按件数倒序的物品行
 */
export function groupDropsByItem(drops: AfkDrop[]): AfkItemRow[] {
    const map = new Map<string, AfkItemRow>()
    for (const drop of drops) {
        const key = `${drop.itemType}|${drop.itemId ?? "craft"}|${drop.itemName}`
        const row = map.get(key)
        if (row) {
            row.count += drop.count
            row.dropCount += 1
            row.rarity = Math.max(row.rarity, drop.rarity)
        } else {
            map.set(key, {
                key,
                itemId: drop.itemId,
                type: drop.itemType,
                name: drop.itemName,
                rarity: drop.rarity,
                count: drop.count,
                dropCount: 1,
            })
        }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** 副本产出的一行。 */
export type AfkDungeonRow = {
    id: string
    name: string
    /** 全部场次（含进行中） */
    runs: number
    /** 已收尾的场次：场均时长按它算 */
    completedRuns: number
    drops: number
    gold: number
    durationMs: number
    avgDrops: number
    avgDurationMs: number
}

/**
 * 按副本聚合场次与掉落。
 * @param runs 场次
 * @param drops 掉落
 * @returns 按掉落件数倒序的副本行
 */
export function groupStatsByDungeon(runs: AfkRun[], drops: AfkDrop[]): AfkDungeonRow[] {
    const map = new Map<string, AfkDungeonRow>()
    const ensure = (id: string, name: string): AfkDungeonRow | null => {
        if (!id) return null
        let row = map.get(id)
        if (!row) {
            row = {
                id,
                name: afkDungeonName(id, name),
                runs: 0,
                completedRuns: 0,
                drops: 0,
                gold: 0,
                durationMs: 0,
                avgDrops: 0,
                avgDurationMs: 0,
            }
            map.set(id, row)
        } else if (name) {
            row.name = afkDungeonName(id, name)
        }
        return row
    }
    for (const run of runs) {
        const row = ensure(run.dungeonId, run.dungeonName)
        if (!row) continue
        // 正在进行的场次也算一场，只是没有可用的时长（页面上显示「进行中」）
        row.runs += 1
        if (run.status !== "done") continue
        row.completedRuns += 1
        if (run.endedAt !== null) row.durationMs += Math.max(0, run.endedAt - run.startedAt)
    }
    for (const drop of drops) {
        // 铸造产物与副本无关，不能算进副本产出
        if (drop.kind === "craft") continue
        const row = ensure(drop.dungeonId, drop.dungeonName)
        if (!row) continue
        row.drops += drop.count
        if (drop.rarity >= AFK_GOLD_RARITY) row.gold += drop.count
    }
    return [...map.values()]
        .map(row => ({
            ...row,
            // 场均掉落只按已收尾的场次算，进行中的场次还没掉完
            avgDrops: row.completedRuns > 0 ? row.drops / row.completedRuns : 0,
            avgDurationMs: row.completedRuns > 0 ? row.durationMs / row.completedRuns : 0,
        }))
        .sort((a, b) => b.drops - a.drops || b.runs - a.runs)
}

/**
 * 是否为副本掉落（铸造产物走独立统计维度）。
 * @param drop 掉落
 * @returns 是副本掉落时为 true
 */
export function isDungeonDrop(drop: AfkDrop): boolean {
    return drop.kind !== "craft"
}

/**
 * 场次时长（未结束按当前时刻算）。
 * @param run 场次
 * @param now 参考时刻
 * @returns 毫秒
 */
export function runDuration(run: AfkRun, now = Date.now()): number {
    return Math.max(0, (run.endedAt ?? now) - run.startedAt)
}
