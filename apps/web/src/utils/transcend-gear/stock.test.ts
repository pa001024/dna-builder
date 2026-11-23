import { describe, expect, it, vi } from "vitest"
import type { TranscendGearAffixRoll, TranscendGearItemConfig } from "@/data"
import { getGearDisplayName, getGearIconSrc } from "./catalog"
import { hashGearItem } from "./hash"
import { createMemoryTranscendGearRepo } from "./repo"
import { createTranscendGearStock } from "./stock"

const roll = (affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll => ({
    affixId,
    rollLevel: 1,
    masterworkLevel: 0,
    ancient: false,
    finalMasterwork: false,
    ...patch,
})

const item = (patch: Partial<TranscendGearItemConfig> = {}): TranscendGearItemConfig => ({
    kind: "normal",
    slotType: 3,
    affixes: [roll(101)],
    rarityId: 5,
    equipBaseScore: 50,
    iconId: 1001,
    seasonId: 1,
    ...patch,
})

describe("库存归属匹配", () => {
    it("同词缀不同基础名 / 品质 / 强度 / 赛季不算同一件；旧物品缺元数据视为通配", async () => {
        const repo = createMemoryTranscendGearRepo()
        await repo.add(item())
        const seedRows = await repo.list()
        const stock = createTranscendGearStock({
            hasIndexedDB: () => false,
            createMemoryRepo: rows => createMemoryTranscendGearRepo(rows?.length ? rows : seedRows),
        })
        await stock.init()
        expect(stock.owns(item())).toBe(true)
        expect(stock.ownedCount(item())).toBe(1)
        expect(stock.owns(item({ iconId: 1002 }))).toBe(false)
        expect(stock.owns(item({ rarityId: 4 }))).toBe(false)
        expect(stock.owns(item({ equipBaseScore: 49 }))).toBe(false)
        expect(stock.owns(item({ seasonId: 2 }))).toBe(false)
        // 旧存档没有元数据：不能因为 hash 相同就判为两件
        expect(stock.owns(item({ rarityId: undefined, equipBaseScore: undefined, iconId: undefined, seasonId: undefined }))).toBe(true)
    })

    it("旧 v2 无元数据物品可入库，缺失字段保持 undefined（不补造品质 / 强度），快照不入库", async () => {
        const legacy = item({
            rarityId: undefined,
            equipBaseScore: undefined,
            iconId: undefined,
            seasonId: undefined,
            nameSnapshot: "旧版头盔",
        })
        const repo = createMemoryTranscendGearRepo()
        const row = await repo.add(legacy)
        expect(row.item.rarityId).toBeUndefined()
        expect(row.item.equipBaseScore).toBeUndefined()
        expect(row.item.iconId).toBeUndefined()
        expect(row.item.seasonId).toBeUndefined()
        expect(row.item.nameSnapshot).toBeUndefined()
    })

    it("展示名 / 图标由当前数据解析，不依赖落库快照", async () => {
        const repo = createMemoryTranscendGearRepo()
        const row = await repo.add(item({ slotType: 3, iconId: 1007, nameId: 1001, affixes: [roll(101)] }))
        expect(row.item.nameSnapshot).toBeUndefined()
        expect(row.item.iconSnapshot).toBeUndefined()
        expect(getGearDisplayName(row.item, text => text ?? "", "zh-CN")).toContain("海蚀手套")
        expect(getGearIconSrc(row.item)).not.toBe("")
    })

    it("旧版本 hash 的库存行仍可命中（只读兜底，不改写库存）", async () => {
        const repo = createMemoryTranscendGearRepo()
        const row = await repo.add(item())
        const stale = { ...row, hash: "0000000000000000" }
        const stock = createTranscendGearStock({
            hasIndexedDB: () => false,
            createMemoryRepo: () => createMemoryTranscendGearRepo([stale]),
        })
        await stock.init()
        expect(stock.owns(item())).toBe(true)
        expect(stock.ownedCount(item())).toBe(1)
        expect(stock.rows.value[0].hash).toBe("0000000000000000")
    })

    it("旧库存真实行（无 craft、per-affix 精锻 + 最终）读取时还原 craft 再匹配，且不改写原行", async () => {
        const legacy: TranscendGearItemConfig = item({
            affixes: [roll(101, { masterworkLevel: 10 }), roll(1001, { masterworkLevel: 10, finalMasterwork: true })],
        })
        const legacyRow = {
            hash: hashGearItem(legacy),
            item: legacy,
            kind: "normal" as const,
            slotType: 3,
            affixIds: [101, 1001],
            createdAt: 1,
            updatedAt: 1,
        }
        const current: TranscendGearItemConfig = item({
            affixes: [
                roll(101, { masterworkLevel: 10, source: "base" }),
                roll(1001, { masterworkLevel: 10, finalMasterwork: true, source: "random" }),
            ],
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 1, temperingCount: 0, enchantCount: 0 },
        })
        const stock = createTranscendGearStock({
            hasIndexedDB: () => false,
            createMemoryRepo: () => createMemoryTranscendGearRepo([legacyRow]),
        })
        await stock.init()
        expect(stock.owns(current)).toBe(true)
        expect(stock.ownedCount(current)).toBe(1)
        expect(stock.owns(item({ affixes: [roll(101), roll(1002)] }))).toBe(false)
        expect(stock.rows.value[0].item.craft?.masterworkLevel).toBe(10)
        expect(stock.rows.value[0].hash).toBe(legacyRow.hash)
        // hydrate 返回新对象：种子行原对象不被改写
        expect(legacyRow.item.craft).toBeUndefined()
    })
})

describe("库存降级", () => {
    it("liveQuery 订阅失败：停止订阅、切内存仓储并保留当前行", async () => {
        const dexieRepo = createMemoryTranscendGearRepo()
        const seed = await dexieRepo.add(item())
        const memoryRepo = createMemoryTranscendGearRepo([seed])
        const unsubscribe = vi.fn()
        const stock = createTranscendGearStock({
            hasIndexedDB: () => true,
            createDexieRepo: () => dexieRepo,
            createMemoryRepo: rows => {
                expect(rows).toHaveLength(1)
                return memoryRepo
            },
            watch: (_loader, observer) => {
                setTimeout(() => observer.error(new Error("liveQuery failed")), 0)
                return { unsubscribe }
            },
        })
        await stock.init()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(stock.usingMemory.value).toBe(true)
        expect(stock.error.value).toContain("liveQuery failed")
        expect(stock.rows.value).toHaveLength(1)
        expect(stock.rows.value[0].hash).toBe(seed.hash)
        expect(unsubscribe).toHaveBeenCalled()

        await stock.add(item({ iconId: 1002 }))
        expect(stock.rows.value).toHaveLength(2)
        expect(stock.owns(item({ iconId: 1002 }))).toBe(true)
    })

    it("IndexedDB 不可用时直接使用内存仓储并保留种子行", async () => {
        const memoryRepo = createMemoryTranscendGearRepo()
        const seed = await memoryRepo.add(item())
        const stock = createTranscendGearStock({
            hasIndexedDB: () => false,
            createMemoryRepo: () => createMemoryTranscendGearRepo([seed]),
        })
        await stock.init()
        expect(stock.usingMemory.value).toBe(true)
        expect(stock.error.value).toContain("IndexedDB unavailable")
        expect(stock.rows.value).toHaveLength(1)
    })
})
