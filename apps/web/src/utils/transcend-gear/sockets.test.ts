import { describe, expect, it } from "vitest"
import { crafts, type TranscendGearItemConfig } from "@/data"
import {
    addGearSocket,
    canToggleGearSocket,
    getGearPunchCost,
    getGearSocketState,
    resolveInitialSocketCount,
    setGearSocketCount,
    TRANSCEND_PUNCH_CRAFT_ID,
    toggleGearSocketCount,
} from "./sockets"

const item = (patch: Partial<TranscendGearItemConfig> & Pick<TranscendGearItemConfig, "slotType">): TranscendGearItemConfig => ({
    kind: "normal",
    affixes: [],
    ...patch,
})

describe("孔位三态", () => {
    it("已镶嵌 / 已开孔 / 上限分开统计", () => {
        const helmet = item({ slotType: 1, socketCount: 2, sockets: [{ socketIndex: 0, gemId: 7001101 }] })
        expect(getGearSocketState(helmet, 1)).toEqual({ opened: 2, used: 1, max: 2 })
        const ring = item({ slotType: 7 })
        expect(getGearSocketState(ring, 7)).toEqual({ opened: 0, used: 0, max: 1 })
        expect(getGearSocketState(ring, 8)).toEqual({ opened: 0, used: 0, max: 0 })
    })

    it("缺省已开孔数按已镶嵌孔位推断，并被槽型上限钳制", () => {
        const legacy = item({ slotType: 1, sockets: [{ socketIndex: 1, gemId: 7001101 }] })
        expect(getGearSocketState(legacy, 1)).toEqual({ opened: 2, used: 1, max: 2 })
        const overflow = item({ slotType: 1, socketCount: 9 })
        expect(getGearSocketState(overflow, 1).opened).toBe(2)
    })
})

describe("初始孔位点击切换", () => {
    it("未解锁孔位解锁到该槽；已解锁空槽再次点击收起", () => {
        expect(toggleGearSocketCount(0, 0, 0, 2)).toBe(1)
        expect(toggleGearSocketCount(1, 0, 0, 2)).toBe(0)
        expect(toggleGearSocketCount(0, 1, 0, 2)).toBe(2)
        expect(toggleGearSocketCount(2, 1, 0, 2)).toBe(1)
        expect(toggleGearSocketCount(2, 0, 0, 2)).toBe(0)
    })

    it("已镶嵌孔位由 min 钳制，关闭前面的空槽也不会拆掉后面的宝石", () => {
        expect(toggleGearSocketCount(2, 1, 2, 2)).toBe(2)
        expect(toggleGearSocketCount(2, 0, 2, 2)).toBe(2)
        expect(toggleGearSocketCount(1, 0, 1, 2)).toBe(1)
    })

    it("宝石在 0 号孔时可收起其后的空槽；点 0 号在纯函数下限钳制下只收起后面的空槽", () => {
        expect(toggleGearSocketCount(2, 1, 1, 2)).toBe(1)
        expect(toggleGearSocketCount(2, 0, 1, 2)).toBe(1)
    })

    it("已镶嵌孔位卡片只读：locked / opened 可切换，inlaid 不可切换", () => {
        expect(canToggleGearSocket("locked")).toBe(true)
        expect(canToggleGearSocket("opened")).toBe(true)
        expect(canToggleGearSocket("inlaid")).toBe(false)
    })

    it("上限 / 下限钳制：无孔槽型恒 0，单孔槽型不超 1", () => {
        expect(toggleGearSocketCount(0, 0, 0, 0)).toBe(0)
        expect(toggleGearSocketCount(0, 0, 0, 1)).toBe(1)
        expect(toggleGearSocketCount(1, 1, 0, 1)).toBe(1)
        expect(toggleGearSocketCount(1, 2, 0, 1)).toBe(1)
    })
})

describe("初始已开孔数", () => {
    it("新建无存档值为 0；编辑保留存档值 1 / 2", () => {
        expect(resolveInitialSocketCount(null, 0, 2)).toBe(0)
        expect(resolveInitialSocketCount(undefined, 0, 2)).toBe(0)
        expect(resolveInitialSocketCount(1, 0, 2)).toBe(1)
        expect(resolveInitialSocketCount(2, 0, 2)).toBe(2)
    })

    it("历史存档超过当前部位上限时按上限钳制；上限 0 恒为 0", () => {
        expect(resolveInitialSocketCount(9, 0, 2)).toBe(2)
        expect(resolveInitialSocketCount(3, 0, 1)).toBe(1)
        expect(resolveInitialSocketCount(2, 0, 0)).toBe(0)
        expect(resolveInitialSocketCount(null, 0, 0)).toBe(0)
    })

    it("已镶嵌需要更多孔时抬高到 min", () => {
        expect(resolveInitialSocketCount(0, 2, 2)).toBe(2)
        expect(resolveInitialSocketCount(1, 2, 2)).toBe(2)
    })
})

describe("打孔与开孔数", () => {
    it("每次 +1 孔，不添加宝石；达上限后原样返回", () => {
        const empty = item({ slotType: 1 })
        const once = addGearSocket(empty, 1)
        expect(once.socketCount).toBe(1)
        expect(once.sockets).toBeUndefined()
        const twice = addGearSocket(once, 1)
        expect(twice.socketCount).toBe(2)
        expect(addGearSocket(twice, 1)).toBe(twice)
    })

    it("单孔槽型（5-7）打孔一次即满；无孔槽型（8-11）不提供孔位", () => {
        const ring = addGearSocket(item({ slotType: 7 }), 7)
        expect(ring.socketCount).toBe(1)
        expect(addGearSocket(ring, 7)).toBe(ring)
        const charm = item({ slotType: 8, sockets: [{ socketIndex: 0, gemId: 7001101 }] })
        expect(addGearSocket(charm, 8)).toBe(charm)
        expect(getGearSocketState(charm, 8).max).toBe(0)
    })

    it("重复宝石允许：减少已开孔数只裁越界孔，不按宝石去重", () => {
        const two = item({
            slotType: 1,
            socketCount: 2,
            sockets: [
                { socketIndex: 0, gemId: 7001101 },
                { socketIndex: 1, gemId: 7001101 },
            ],
        })
        expect(setGearSocketCount(two, 1, 2).sockets).toHaveLength(2)
        const one = setGearSocketCount(two, 1, 1)
        expect(one.socketCount).toBe(1)
        expect(one.sockets).toEqual([{ socketIndex: 0, gemId: 7001101 }])
    })
})

describe("安全模式下的上限钳制", () => {
    it("上限为 0 时已开孔数不超过已镶嵌数，极端 socketCount 不产生巨量分配", () => {
        expect(getGearSocketState({ socketCount: 1000000 }, 8)).toEqual({ opened: 0, used: 0, max: 0 })
        const withSockets = { socketCount: 1000000, sockets: [{ socketIndex: 0, gemId: 7001101 }] }
        expect(getGearSocketState(withSockets, 8)).toEqual({ opened: 1, used: 1, max: 0 })
        // 有上限时仍按上限钳制
        expect(getGearSocketState({ socketCount: 1000000 }, 1)).toEqual({ opened: 2, used: 0, max: 2 })
    })
})

describe("打孔消耗", () => {
    it("从数据表 craft 5 读取材料与货币，不写死资源", () => {
        const craft = crafts.find(entry => entry.id === TRANSCEND_PUNCH_CRAFT_ID)
        expect(craft).toBeDefined()
        expect(getGearPunchCost()).toEqual([
            { id: 7000106, count: 1 },
            { id: 7000101, count: 450000 },
        ])
        expect(getGearPunchCost()).toEqual(getGearPunchCost(craft))
    })

    it("数据缺失时返回空消耗，不伪造资源", () => {
        expect(getGearPunchCost({ id: TRANSCEND_PUNCH_CRAFT_ID })).toEqual([])
    })
})
