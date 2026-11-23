import { describe, expect, it } from "vitest"
import type { TranscendGearEntry, TranscendGearItemConfig, TranscendSettings } from "@/data"
import {
    getEquippedGearItems,
    getEquippedItem,
    getLegacySlotEntries,
    getSideGearGroup,
    setSideGearGroup,
    setSlotItem,
    updateSlotItem,
} from "./settings"

const item = (slotType: number, patch: Partial<TranscendGearItemConfig> = {}): TranscendGearItemConfig => ({
    kind: "normal",
    slotType,
    affixes: [],
    ...patch,
})

const settings = (): TranscendSettings => ({
    enabled: true,
    talentLevels: [],
    mainGear: [],
    assist1Gear: [],
    assist2Gear: [],
    gearVariants: [{ id: "A", mainGear: [], assist1Gear: [], assist2Gear: [] }],
    activeGearVariant: "A",
})

describe("装备组物品级写入", () => {
    it("装备 / 替换 / 卸下只影响目标槽位，其它槽位与旧版条目保留", () => {
        const legacy: TranscendGearEntry = {
            slotId: 5,
            affixId: 104,
            rollLevel: 3,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        }
        const group = [{ slotId: 3, item: item(3) }, legacy]
        const equipped = setSlotItem(group, 1, item(1, { rarityId: 5 }))
        expect(equipped).toHaveLength(3)
        expect(getEquippedItem(equipped, 1)?.item.rarityId).toBe(5)
        expect(getEquippedItem(equipped, 3)?.item.slotType).toBe(3)
        expect(getLegacySlotEntries(equipped, 5)).toHaveLength(1)

        const replaced = setSlotItem(equipped, 1, item(1, { rarityId: 2 }))
        expect(replaced.filter(entry => entry.slotId === 1)).toHaveLength(1)
        expect(getEquippedItem(replaced, 1)?.item.rarityId).toBe(2)

        const removed = setSlotItem(replaced, 1, null)
        expect(getEquippedItem(removed, 1)).toBeNull()
        expect(getLegacySlotEntries(removed, 5)).toHaveLength(1)
    })

    it("同槽写入会移除该槽的 v1 条目，避免物品与旧词条并存", () => {
        const legacy: TranscendGearEntry = {
            slotId: 7,
            affixId: 102,
            rollLevel: 3,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        }
        const next = setSlotItem([legacy], 7, item(7))
        expect(next).toHaveLength(1)
        expect(getEquippedItem(next, 7)?.item.slotType).toBe(7)
        expect(getLegacySlotEntries(next, 7)).toHaveLength(0)
    })

    it("槽位非法时不写入并返回原列表副本", () => {
        const group = [{ slotId: 1, item: item(1) }]
        expect(setSlotItem(group, 99, item(1))).toHaveLength(1)
        expect(setSlotItem(null, 1, item(1))).toHaveLength(1)
    })

    it("孔位更新走同一条物品写回路径", () => {
        const group = [{ slotId: 1, item: item(1, { sockets: [{ socketIndex: 0, gemId: 7001101 }] }) }]
        const next = updateSlotItem(group, 1, item(1, { sockets: [{ socketIndex: 0, gemId: 7001102 }] }))
        expect(getEquippedItem(next, 1)?.item.sockets?.[0].gemId).toBe(7001102)
    })
})

describe("构筑位装备组读写", () => {
    it("按构筑位取 / 写装备组：三组一人一套，互不共用", () => {
        const value = settings()
        const assist1 = [{ slotId: 9, item: item(8) }]
        setSideGearGroup(value, "assist1", assist1)
        expect(getSideGearGroup(value, "assist1")).toBe(assist1)
        expect(getSideGearGroup(value, "main")).toEqual([])
        expect(getSideGearGroup(value, "assist2")).toEqual([])
        // 写入同步进当前激活变体
        expect(value.gearVariants[0].assist1Gear).toBe(assist1)
        const assist2 = [{ slotId: 13, item: item(8) }]
        setSideGearGroup(value, "assist2", assist2)
        expect(getSideGearGroup(value, "assist1")).toBe(assist1)
        expect(value.gearVariants[0].assist2Gear).toBe(assist2)
        setSideGearGroup(value, "assist2", [])
        expect(getSideGearGroup(value, "assist1")).toEqual(assist1)
        expect(value.gearVariants[0].assist2Gear).toEqual([])
    })

    it("库存「已装备」集合只读激活变体的三组装备", () => {
        const value = settings()
        value.mainGear = [{ slotId: 1, item: item(1) }]
        value.assist1Gear = [
            { slotId: 9, item: item(8) },
            { slotId: 10, item: item(9) },
        ]
        value.assist2Gear = [{ slotId: 13, item: item(8) }]
        value.gearVariants = [
            { id: "A", mainGear: value.mainGear, assist1Gear: value.assist1Gear, assist2Gear: value.assist2Gear },
            {
                id: "B",
                mainGear: [{ slotId: 2, item: item(2) }],
                assist1Gear: [{ slotId: 11, item: item(10) }],
                assist2Gear: [],
            },
        ]
        value.activeGearVariant = "A"
        const items = getEquippedGearItems(value)
        expect(items).toHaveLength(4)
        expect(items.map(entry => entry.slotType)).toEqual([1, 8, 9, 8])
        // 其它变体的物品不计入
        expect(items.some(entry => entry.slotType === 2 || entry.slotType === 10)).toBe(false)
    })
})
