import { describe, expect, it } from "vitest"
import {
    clampBarOffsetY,
    clampBarOpacity,
    clampBarScale,
    collectMihanEntries,
    createDefaultScreenBarConfig,
    createScreenBarItem,
    formatClock,
    formatCountdown,
    formatCountdownDays,
    getDayRefreshRemaining,
    getMihanRefreshRemaining,
    normalizeClockFormat,
    normalizeCountdownTarget,
    normalizeItemTitle,
    normalizeMihanMissions,
    normalizeMihanTypes,
    normalizeScreenBarConfig,
    normalizeScreenBarItems,
    parseScreenBarConfig,
    resolveScreenBarItem,
    SCREEN_BAR_DEFAULTS,
    SCREEN_BAR_MAX_FORMAT_LENGTH,
    SCREEN_BAR_MAX_ITEMS,
    SCREEN_BAR_MAX_TITLE_LENGTH,
} from "./screen-bar"

/** 固定参照时间:2026-01-05(周一) 09:07:03。 */
const SAMPLE = new Date(2026, 0, 5, 9, 7, 3)

describe("formatClock", () => {
    it("替换全部时间占位符", () => {
        expect(formatClock(SAMPLE, "YYYY-MM-DD HH:mm:ss")).toBe("2026-01-05 09:07:03")
    })

    it("长 token 优先于短 token", () => {
        expect(formatClock(SAMPLE, "MM")).toBe("01")
        expect(formatClock(SAMPLE, "M")).toBe("1")
        expect(formatClock(SAMPLE, "DD")).toBe("05")
        expect(formatClock(SAMPLE, "D")).toBe("5")
    })

    it("支持星期与中文模板", () => {
        expect(formatClock(SAMPLE, "ddd")).toBe("周一")
        expect(formatClock(SAMPLE, "dddd")).toBe("星期一")
        expect(formatClock(SAMPLE, "M月D日 dddd")).toBe("1月5日 星期一")
    })

    it("支持 12 小时制标记与两位年份", () => {
        expect(formatClock(SAMPLE, "A H:mm")).toBe("上午 9:07")
        expect(formatClock(new Date(2026, 0, 5, 15, 0, 0), "A")).toBe("下午")
        expect(formatClock(SAMPLE, "YY")).toBe("26")
    })

    it("空模板回退默认格式,未识别的字符原样保留", () => {
        expect(formatClock(SAMPLE, "   ")).toBe(formatClock(SAMPLE, SCREEN_BAR_DEFAULTS.clockFormat))
        expect(formatClock(SAMPLE, "现在是 H 点")).toBe("现在是 9 点")
    })
})

describe("倒计时格式化", () => {
    it("不足一小时输出 mm:ss", () => {
        expect(formatCountdown(65_000)).toBe("01:05")
        expect(formatCountdown(0)).toBe("00:00")
    })

    it("超过一小时输出 H:mm:ss", () => {
        expect(formatCountdown(3_723_000)).toBe("1:02:03")
        expect(formatCountdown(45_296_000)).toBe("12:34:56")
    })

    it("负数按 0 处理", () => {
        expect(formatCountdown(-5_000)).toBe("00:00")
        expect(formatCountdownDays(-5_000)).toBe("00:00")
    })

    it("带天数的格式只在跨天时带上天数", () => {
        expect(formatCountdownDays(3_723_000)).toBe("1:02:03")
        expect(formatCountdownDays(90_000_000)).toBe("1天 01:00:00")
    })
})

describe("getMihanRefreshRemaining", () => {
    it("整点上归零(与 store 的刷新时刻判定一致)", () => {
        expect(getMihanRefreshRemaining(new Date(2026, 0, 5, 9, 0, 0).getTime())).toBe(0)
    })

    it("整点后按剩余时间递减", () => {
        expect(getMihanRefreshRemaining(new Date(2026, 0, 5, 9, 0, 1).getTime())).toBe(3_599_000)
    })

    it("整点前一刻剩余到下一个整点", () => {
        expect(getMihanRefreshRemaining(new Date(2026, 0, 5, 9, 59, 59).getTime())).toBe(1_000)
    })
})

describe("getDayRefreshRemaining", () => {
    const DAY = 24 * 60 * 60 * 1000
    /** 与 `util.ts` 的 `useGameTimer` 同一口径:相对 UTC 零点的偏移再往后挪 3 小时。 */
    const offsetOf = (offsetDays: number) => offsetDays * DAY + 3 * 60 * 60 * 1000
    const CASES: Array<{ timer: "moling" | "zhouben"; cycle: number; offsetDays: number }> = [
        { timer: "moling", cycle: 3 * DAY, offsetDays: 1 },
        { timer: "zhouben", cycle: 7 * DAY, offsetDays: 3 },
    ]

    it("剩余时间落在周期内,且到期时刻正好落在刷新边界上", () => {
        const now = new Date(2026, 8, 21, 18, 32, 0).getTime()
        for (const { timer, cycle, offsetDays } of CASES) {
            const remaining = getDayRefreshRemaining(timer, now)
            expect(remaining).toBeGreaterThan(0)
            expect(remaining).toBeLessThanOrEqual(cycle)
            expect((now + remaining + offsetOf(offsetDays)) % cycle).toBe(0)
        }
    })

    it("同一时刻结果稳定,未跨过边界时随秒递减", () => {
        const now = new Date(2026, 8, 21, 18, 32, 0).getTime()
        const first = getDayRefreshRemaining("moling", now)
        expect(getDayRefreshRemaining("moling", now)).toBe(first)
        expect(getDayRefreshRemaining("moling", now + 1000)).toBe(first - 1000)
    })
})

describe("collectMihanEntries", () => {
    const data = [["驱离", "护送"], ["拆解", "驱逐", "避险"], ["调停"]]

    it("关注列表为空时不标命中(避免只看关注退化成什么都看)", () => {
        const entries = collectMihanEntries(data, [0, 1], [], false)
        expect(entries).toHaveLength(2)
        expect(entries[0].missions.every(mission => !mission.matched)).toBe(true)
        expect(entries[1].matchedCount).toBe(0)
    })

    it("标记命中但不隐藏未命中任务", () => {
        const entries = collectMihanEntries(data, [0, 1], ["护送"], false)
        expect(entries[0].missions).toEqual([
            { name: "驱离", matched: false },
            { name: "护送", matched: true },
        ])
        expect(entries[0].matchedCount).toBe(1)
    })

    it("onlyMatched 只保留命中的类型与任务", () => {
        const entries = collectMihanEntries(data, [0, 1, 2], ["护送"], true)
        expect(entries).toHaveLength(1)
        expect(entries[0].typeIndex).toBe(0)
        expect(entries[0].missions).toEqual([{ name: "护送", matched: true }])
    })

    it("onlyMatched 但一条关注都没选时返回空数组", () => {
        expect(collectMihanEntries(data, [0], [], true)).toEqual([])
    })

    it("未命中任何任务的类型整组丢弃", () => {
        const entries = collectMihanEntries(data, [0, 1, 2], ["护送"], true)
        expect(entries.map(entry => entry.typeIndex)).toEqual([0])
    })

    it("无命中且关注列表非空时返回空数组", () => {
        expect(collectMihanEntries(data, [0, 1, 2], ["不存在的任务"], true)).toEqual([])
    })

    it("容忍脏数据", () => {
        expect(collectMihanEntries(undefined, [0], [], false)).toEqual([])
        expect(collectMihanEntries([[], undefined as unknown as string[]], [0, 1], [], false)).toEqual([])
    })
})

describe("条目归一化", () => {
    it("剔除越界与重复的密函类型下标", () => {
        expect(normalizeMihanTypes([2, 0, 0, 3, -1, 1.5, "1"])).toEqual([0, 1, 2])
        expect(normalizeMihanTypes("0")).toEqual([])
    })

    it("模板去空白并截断超长内容", () => {
        expect(normalizeClockFormat("  HH:mm  ")).toBe("HH:mm")
        expect(normalizeClockFormat("")).toBe(SCREEN_BAR_DEFAULTS.clockFormat)
        expect(normalizeClockFormat("X".repeat(200))).toHaveLength(SCREEN_BAR_MAX_FORMAT_LENGTH)
        expect(normalizeClockFormat(42)).toBe(SCREEN_BAR_DEFAULTS.clockFormat)
    })

    it("标题去空白并截断", () => {
        expect(normalizeItemTitle("  更新倒计时  ")).toBe("更新倒计时")
        expect(normalizeItemTitle("字".repeat(100))).toHaveLength(SCREEN_BAR_MAX_TITLE_LENGTH)
        expect(normalizeItemTitle(null)).toBe("")
    })

    it("只接受可解析的目标时刻", () => {
        expect(normalizeCountdownTarget("2026-10-01T00:00")).toBe("2026-10-01T00:00")
        expect(normalizeCountdownTarget("明天")).toBe("")
        expect(normalizeCountdownTarget(123)).toBe("")
    })

    it("关注任务只保留已知任务名,按任务清单顺序去重", () => {
        expect(normalizeMihanMissions(["追缉", "驱离", "追缉"])).toEqual(["驱离", "追缉"])
        expect(normalizeMihanMissions(["不存在的任务", 3, null])).toEqual([])
        expect(normalizeMihanMissions("驱离")).toEqual([])
    })

    it("已下线的任务名从关注列表里丢掉(游戏里没有对应密函副本)", () => {
        expect(normalizeMihanMissions(["护送", "勘察/无尽", "迁移", "驱离"])).toEqual(["驱离"])
    })

    it("创建条目时补齐该类型的默认参数", () => {
        const clock = createScreenBarItem("clock")
        expect(clock).toMatchObject({ type: "clock", format: SCREEN_BAR_DEFAULTS.clockFormat })
        expect(createScreenBarItem("countdown")).toMatchObject({ type: "countdown", title: "", target: "" })
        expect(createScreenBarItem("mihan")).toMatchObject({ type: "mihan", types: [0, 1, 2], missions: [], onlyMatched: false })
        expect(createScreenBarItem("mihanRefresh")).toMatchObject({ type: "mihanRefresh" })
        expect(createScreenBarItem("moling")).toMatchObject({ type: "moling" })
        expect(createScreenBarItem("zhouben")).toMatchObject({ type: "zhouben" })
    })

    it("每次创建都拿到不同的 id", () => {
        const first = createScreenBarItem("clock")
        const second = createScreenBarItem("clock")
        expect(first.id).not.toBe(second.id)
    })

    it("丢弃无法识别的条目与重复 id", () => {
        const items = normalizeScreenBarItems([
            { id: "a", type: "clock", format: "HH:mm" },
            { id: "a", type: "clock", format: "HH:mm" },
            { id: "b", type: "weather" },
            { id: "c" },
            null,
            { id: "d", type: "mihan", types: [0] },
        ])
        expect(items).toHaveLength(2)
        expect(items[0]).toMatchObject({ id: "a", type: "clock" })
        expect(items[1]).toMatchObject({ id: "d", type: "mihan", types: [0] })
    })

    it("委托类型:字段缺失兜底全选,显式空数组保持为空", () => {
        const items = normalizeScreenBarItems([
            { id: "a", type: "mihan" },
            { id: "b", type: "mihan", types: [] },
        ])
        expect(items[0]).toMatchObject({ types: [0, 1, 2] })
        expect(items[1]).toMatchObject({ types: [] })
    })

    it("委托条目归一化关注任务", () => {
        const items = normalizeScreenBarItems([
            { id: "a", type: "mihan", types: [0], missions: ["驱离", "驱离", "不存在的任务"], onlyMatched: true },
        ])
        expect(items[0]).toMatchObject({ type: "mihan", missions: ["驱离"], onlyMatched: true })
    })

    it("按上限截断条目数量", () => {
        const raw = Array.from({ length: SCREEN_BAR_MAX_ITEMS + 5 }, (_, index) => ({ id: `i${index}`, type: "clock" }))
        expect(normalizeScreenBarItems(raw)).toHaveLength(SCREEN_BAR_MAX_ITEMS)
    })
})

describe("配置归一化", () => {
    it("默认配置包含时钟 / 委托 / 委托刷新三个条目", () => {
        const config = createDefaultScreenBarConfig()
        expect(config.items.map(item => item.type)).toEqual(["clock", "mihan", "mihanRefresh"])
        expect(config.enabled).toBe(false)
    })

    it("数值钳制到合法区间", () => {
        expect(clampBarScale(99)).toBe(2)
        expect(clampBarScale(0)).toBe(0.7)
        expect(clampBarScale(Number.NaN)).toBe(1)
        expect(clampBarOpacity(5)).toBe(1)
        expect(clampBarOffsetY(-10)).toBe(0)
        expect(clampBarOffsetY(9999)).toBe(400)
    })

    it("损坏的配置回退默认值", () => {
        const config = normalizeScreenBarConfig(null)
        expect(config.enabled).toBe(false)
        expect(config.items.map(item => item.type)).toEqual(["clock", "mihan", "mihanRefresh"])
        expect(config.opacity).toBe(SCREEN_BAR_DEFAULTS.opacity)
        expect(normalizeScreenBarConfig({ opacity: "abc", items: null }).opacity).toBe(SCREEN_BAR_DEFAULTS.opacity)
    })

    it("条目清空时回退默认条目", () => {
        const config = normalizeScreenBarConfig({ enabled: true, items: [] })
        expect(config.enabled).toBe(true)
        expect(config.items.map(item => item.type)).toEqual(["clock", "mihan", "mihanRefresh"])
    })

    it("保留合法字段并补齐缺失字段", () => {
        const config = normalizeScreenBarConfig({ enabled: true, scale: 1.5, items: [{ id: "a", type: "clock", format: "HH:mm" }] })
        expect(config.enabled).toBe(true)
        expect(config.scale).toBe(1.5)
        expect(config.ignoreCursorEvents).toBe(false)
        expect(config.offsetY).toBe(0)
        expect(config.items).toHaveLength(1)
    })

    it("补齐条目内部的新字段(旧数据缺 missions 会让设置页整页渲染不出来)", () => {
        const config = parseScreenBarConfig(
            JSON.stringify({ enabled: true, items: [{ id: "m1", type: "mihan", types: [0], onlyMatched: true }] })
        )
        expect(config.items).toEqual([{ id: "m1", type: "mihan", types: [0], missions: [], onlyMatched: true }])
    })

    it("解析存储字符串:缺失回退默认,损坏回退默认", () => {
        const types = ["clock", "mihan", "mihanRefresh"]
        expect(parseScreenBarConfig(null).items.map(item => item.type)).toEqual(types)
        expect(parseScreenBarConfig("").items.map(item => item.type)).toEqual(types)
        expect(parseScreenBarConfig("{oops").items.map(item => item.type)).toEqual(types)
    })
})

describe("resolveScreenBarItem", () => {
    const mihanData = [["驱离", "护送"], ["拆解"], ["调停"]]

    it("旧配置解析后能直接出渲染数据(不得抛 undefined 的字段访问)", () => {
        const config = parseScreenBarConfig(JSON.stringify({ items: [{ id: "m1", type: "mihan", types: [0], onlyMatched: true }] }))
        expect(() => resolveScreenBarItem(config.items[0], SAMPLE, mihanData)).not.toThrow()
    })

    it("委托条目按本条关注任务过滤", () => {
        const resolved = resolveScreenBarItem(
            { id: "m", type: "mihan", types: [0], missions: ["护送"], onlyMatched: true },
            SAMPLE,
            mihanData
        )
        if (resolved.type !== "mihan") throw new Error("类型应为 mihan")
        expect(resolved.emptyReason).toBe("noData")
        expect(resolved.entries).toEqual([{ typeIndex: 0, missions: [{ name: "护送", matched: true }], matchedCount: 1 }])
    })

    it("只看关注但未选任务时给出 noSelection,而不是静默展示全部", () => {
        const resolved = resolveScreenBarItem({ id: "n", type: "mihan", types: [0], missions: [], onlyMatched: true }, SAMPLE, mihanData)
        if (resolved.type !== "mihan") throw new Error("类型应为 mihan")
        expect(resolved.entries).toEqual([])
        expect(resolved.emptyReason).toBe("noSelection")
    })

    it("不开启过滤时展示所选类型的全部任务", () => {
        const resolved = resolveScreenBarItem({ id: "o", type: "mihan", types: [0], missions: [], onlyMatched: false }, SAMPLE, mihanData)
        if (resolved.type !== "mihan") throw new Error("类型应为 mihan")
        expect(resolved.emptyReason).toBe("noData")
        expect(resolved.entries[0].missions).toHaveLength(2)
    })

    it("类型全不选时给出 noTypeSelection,且读一次存储不会把它变回全选", () => {
        const config = parseScreenBarConfig(
            JSON.stringify({ items: [{ id: "p", type: "mihan", types: [], missions: [], onlyMatched: false }] })
        )
        expect(config.items[0]).toMatchObject({ types: [] })
        const resolved = resolveScreenBarItem(config.items[0], SAMPLE, mihanData)
        if (resolved.type !== "mihan") throw new Error("类型应为 mihan")
        expect(resolved.entries).toEqual([])
        expect(resolved.emptyReason).toBe("noTypeSelection")
    })

    it("三种定时刷新各自出倒计时文本", () => {
        expect(resolveScreenBarItem({ id: "r1", type: "mihanRefresh" }, SAMPLE, mihanData)).toEqual({
            id: "r1",
            type: "mihanRefresh",
            text: formatCountdown(getMihanRefreshRemaining(SAMPLE.getTime())),
        })
        expect(resolveScreenBarItem({ id: "r2", type: "moling" }, SAMPLE, mihanData)).toEqual({
            id: "r2",
            type: "moling",
            text: formatCountdownDays(getDayRefreshRemaining("moling", SAMPLE.getTime())),
        })
        expect(resolveScreenBarItem({ id: "r3", type: "zhouben" }, SAMPLE, mihanData)).toEqual({
            id: "r3",
            type: "zhouben",
            text: formatCountdownDays(getDayRefreshRemaining("zhouben", SAMPLE.getTime())),
        })
    })
})
