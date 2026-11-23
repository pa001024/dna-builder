import { describe, expect, it } from "vitest"
import { normalizeGearItem, type TranscendGearAffixRoll, type TranscendGearItemConfig } from "@/data"
import { hashGearItem } from "./hash"
import { createMemoryTranscendGearRepo, TRANSCEND_GEAR_STOCK_KIND } from "./repo"

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
    ...patch,
})

describe("库存元数据往返", () => {
    it("品质 / 强度 / 基础名 / 赛季与词缀来源随物品持久化，导出导入后保持", async () => {
        const repo = createMemoryTranscendGearRepo()
        const source: TranscendGearItemConfig = item({
            slotType: 1,
            rarityId: 5,
            equipBaseScore: 50,
            iconId: 1001,
            nameId: 1001,
            seasonId: 1,
            affixes: [roll(102, { rollLevel: 50, source: "base" }), roll(1024, { rollLevel: 491, source: "random" })],
            nameSnapshot: "强力海蚀头盔",
            iconSnapshot: "T_Season_010101",
        })
        const row = await repo.add(source)
        const stored = await repo.get(row.id!)
        expect(stored?.item).toMatchObject({
            rarityId: 5,
            equipBaseScore: 50,
            iconId: 1001,
            nameId: 1001,
            seasonId: 1,
        })
        expect(stored?.item.affixes.find(roll => roll.affixId === 102)?.source).toBe("base")
        expect(stored?.item.affixes.find(roll => roll.affixId === 1024)?.source).toBe("random")

        const json = await repo.exportJson()
        const target = createMemoryTranscendGearRepo()
        const result = await target.importJson(json)
        expect(result.added).toBe(1)
        const imported = (await target.list())[0]
        expect(imported.hash).toBe(row.hash)
        expect(imported.item.rarityId).toBe(5)
        expect(imported.item.equipBaseScore).toBe(50)
        expect(imported.item.affixes.find(roll => roll.affixId === 1024)?.source).toBe("random")
    })
})

describe("持久化最小字段", () => {
    it("落库只存源字段：无展示快照与派生字段，读取时按 craft 还原且 hash 不变", async () => {
        const repo = createMemoryTranscendGearRepo()
        const source = item({
            slotType: 1,
            rarityId: 5,
            equipBaseScore: 50,
            iconId: 1001,
            nameId: 1001,
            seasonId: 1,
            affixes: [roll(102, { rollLevel: 50 }), roll(1024, { rollLevel: 500, ancient: true })],
            sockets: [{ socketIndex: 0, gemId: 7001101, nameSnapshot: "宝石名", iconSnapshot: "gem-icon" }],
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 1, temperingCount: 0, enchantCount: 0 },
            nameSnapshot: "强力海蚀头盔",
            iconSnapshot: "T_Season_010101",
        })
        const normalized = normalizeGearItem(source, undefined, { preserveUnknown: true })!
        const row = await repo.add(source)
        expect(row.item.nameSnapshot).toBeUndefined()
        expect(row.item.iconSnapshot).toBeUndefined()
        expect(row.item.sockets).toEqual([{ socketIndex: 0, gemId: 7001101 }])
        for (const affix of row.item.affixes) {
            expect(affix).not.toHaveProperty("masterworkLevel")
            expect(affix).not.toHaveProperty("finalMasterwork")
            expect(affix).not.toHaveProperty("source")
        }
        expect(row.hash).toBe(hashGearItem(normalized))

        const stored = (await repo.get(row.id!))!
        expect(hashGearItem(stored.item)).toBe(row.hash)
        expect(stored.item.affixes.every(affix => affix.masterworkLevel === 10)).toBe(true)
        expect(stored.item.affixes.find(affix => affix.affixId === 1024)?.finalMasterwork).toBe(true)
        expect(stored.item.affixes.find(affix => affix.affixId === 102)?.source).toBe("base")
        expect(stored.item.affixes.find(affix => affix.affixId === 1024)?.source).toBe("random")
        expect(stored.item.craft).toEqual(normalized.craft)
    })

    it("旧行（含快照、无 craft）读取时仍按词条还原派生字段，快照原样保留", async () => {
        const legacyItem = item({
            slotType: 1,
            nameSnapshot: "旧版头盔",
            iconSnapshot: "T_Season_010101",
            affixes: [roll(102, { masterworkLevel: 10 }), roll(1024, { masterworkLevel: 10, finalMasterwork: true })],
        })
        const repo = createMemoryTranscendGearRepo([
            { hash: "0000000000000000", item: legacyItem, kind: "normal", slotType: 1, affixIds: [102, 1024], createdAt: 1, updatedAt: 1 },
        ])
        const row = (await repo.get(1))!
        expect(row.item.nameSnapshot).toBe("旧版头盔")
        expect(row.item.craft?.masterworkLevel).toBe(10)
        expect(row.item.craft?.finalMasterworkAffixIndex).toBe(1)
        expect(row.item.affixes.every(affix => affix.masterworkLevel === 10)).toBe(true)
        expect(row.item.affixes.find(affix => affix.affixId === 1024)?.finalMasterwork).toBe(true)
    })

    it("导出只含最小物品（无 hash / 快照 / 派生字段），旧格式备份可导入且落库无快照", async () => {
        const source = createMemoryTranscendGearRepo()
        await source.add(item({ slotType: 1, nameSnapshot: "旧名", iconSnapshot: "old-icon", affixes: [roll(102, { rollLevel: 50 })] }))
        const payload = JSON.parse(await source.exportJson())
        expect(payload.items).toHaveLength(1)
        expect(payload.items[0]).not.toHaveProperty("hash")
        expect(payload.items[0]).not.toHaveProperty("nameSnapshot")
        expect(payload.items[0]).not.toHaveProperty("iconSnapshot")
        expect(payload.items[0].affixes[0]).toEqual({ affixId: 102, rollLevel: 50 })

        const legacyText = JSON.stringify({
            kind: TRANSCEND_GEAR_STOCK_KIND,
            exportedAt: 1,
            items: [
                {
                    hash: "deadbeefdeadbeef",
                    item: item({
                        slotType: 1,
                        nameSnapshot: "旧名",
                        iconSnapshot: "old-icon",
                        affixes: [roll(102, { rollLevel: 50, source: "base" })],
                    }),
                },
            ],
        })
        const target = createMemoryTranscendGearRepo()
        expect(await target.importJson(legacyText)).toEqual({ added: 1, skipped: 0, inferredSockets: 0 })
        expect((await target.list())[0].item.nameSnapshot).toBeUndefined()
        expect(JSON.parse(await target.exportJson()).items[0].nameSnapshot).toBeUndefined()
    })
})

describe("内存库存仓储", () => {
    it("新增：补 hash / 类型 / 词条索引与时间戳", async () => {
        const repo = createMemoryTranscendGearRepo()
        const row = await repo.add(item())
        expect(row.id).toBe(1)
        expect(row.hash).toMatch(/^[0-9a-f]{16}$/)
        expect(row.kind).toBe("normal")
        expect(row.slotType).toBe(3)
        expect(row.affixIds).toEqual([101])
        expect(row.createdAt).toBeGreaterThan(0)
        expect(row.updatedAt).toBe(row.createdAt)
        expect((await repo.get(1))?.hash).toBe(row.hash)
    })

    it("相同物品多份：多行、hash 相同", async () => {
        const repo = createMemoryTranscendGearRepo()
        await repo.add(item())
        await repo.add(item())
        const rows = await repo.list()
        expect(rows).toHaveLength(2)
        expect(rows[0].hash).toBe(rows[1].hash)
    })

    it("按槽型 / 类型筛选，按更新时间倒序", async () => {
        const repo = createMemoryTranscendGearRepo()
        const helm = await repo.add(item({ slotType: 1, affixes: [roll(101)] }))
        await new Promise(resolve => setTimeout(resolve, 2))
        const ring = await repo.add(item({ slotType: 7, affixes: [roll(106)] }))
        await new Promise(resolve => setTimeout(resolve, 2))
        const unique = await repo.add(item({ slotType: 1, kind: "unique", uniqueId: 1001, uniqueAffix: roll(2001), affixes: [] }))

        expect((await repo.list({ slotType: 1 })).map(row => row.id)).toEqual([unique.id, helm.id])
        expect((await repo.list({ kind: "unique" })).map(row => row.id)).toEqual([unique.id])
        expect((await repo.list({ slotType: 7 })).map(row => row.id)).toEqual([ring.id])
        expect((await repo.list())[0].id).toBe(unique.id)
    })

    it("更新：保留 createdAt，刷新 hash 与 updatedAt；缺行返回 null", async () => {
        const repo = createMemoryTranscendGearRepo()
        const row = await repo.add(item())
        await new Promise(resolve => setTimeout(resolve, 2))
        const updated = await repo.update(row.id!, item({ affixes: [roll(101, { rollLevel: 9 })] }))!
        expect(updated!.id).toBe(row.id)
        expect(updated!.createdAt).toBe(row.createdAt)
        expect(updated!.updatedAt).toBeGreaterThan(row.updatedAt)
        expect(updated!.hash).not.toBe(row.hash)
        expect(await repo.update(999, item())).toBeNull()
    })

    it("删除 / 清空", async () => {
        const repo = createMemoryTranscendGearRepo()
        const first = await repo.add(item())
        const second = await repo.add(item({ slotType: 7, affixes: [roll(106)] }))
        await repo.remove(first.id!)
        expect(await repo.get(first.id!)).toBeNull()
        expect(await repo.list()).toHaveLength(1)
        await repo.clear()
        expect(await repo.list()).toEqual([])
        expect(second.id).toBe(2)
    })

    it("非法物品拒绝写入；批量写入跳过非法项", async () => {
        const repo = createMemoryTranscendGearRepo()
        await expect(repo.add(item({ slotType: 99 }))).rejects.toThrow()
        const rows = await repo.addMany([item(), item({ slotType: 0 }), item({ slotType: 7, affixes: [roll(106)] })])
        expect(rows).toHaveLength(2)
        expect(await repo.list()).toHaveLength(2)
    })

    it("导出 / 导入往返；replace 用备份原子替换库存", async () => {
        const source = createMemoryTranscendGearRepo()
        await source.add(item())
        await source.add(item({ slotType: 1, sockets: [{ socketIndex: 0, gemId: 7001101 }] }))
        const text = await source.exportJson()
        const payload = JSON.parse(text)
        expect(payload.kind).toBe(TRANSCEND_GEAR_STOCK_KIND)
        expect(payload.items).toHaveLength(2)

        const target = createMemoryTranscendGearRepo()
        const merged = await target.importJson(text)
        expect(merged).toEqual({ added: 2, skipped: 0, inferredSockets: 0 })
        expect(await target.list()).toHaveLength(2)
        expect((await target.list()).map(row => row.hash).sort()).toEqual((await source.list()).map(row => row.hash).sort())

        const replaced = await target.importJson(text, { replace: true })
        expect(replaced.added).toBe(2)
        expect(await target.list()).toHaveLength(2)
    })

    it("导入跳过非法物品，兼容裸物品数组", async () => {
        const repo = createMemoryTranscendGearRepo()
        const result = await repo.importJson(JSON.stringify([item(), { slotType: 99 }, item({ slotType: 7, affixes: [roll(106)] })]))
        expect(result).toEqual({ added: 2, skipped: 1, inferredSockets: 0 })
        await expect(repo.importJson("not json")).rejects.toThrow()
        await expect(repo.importJson("{}")).rejects.toThrow()
    })

    it("importJson 重算 hash，不信任备份里的 hash", async () => {
        const repo = createMemoryTranscendGearRepo()
        const text = JSON.stringify({ kind: TRANSCEND_GEAR_STOCK_KIND, items: [{ hash: "deadbeefdeadbeef", item: item() }] })
        expect(await repo.importJson(text)).toEqual({ added: 1, skipped: 0, inferredSockets: 0 })
        const row = (await repo.list())[0]
        expect(row.hash).toBe(hashGearItem(item()))
        expect(row.hash).not.toBe("deadbeefdeadbeef")
    })

    it("未知 gemId 只存宝石 id，宝石快照不入库", async () => {
        const source = createMemoryTranscendGearRepo()
        await source.add(
            item({ slotType: 1, sockets: [{ socketIndex: 0, gemId: 999999, nameSnapshot: "未知宝石", iconSnapshot: "icon" }] })
        )
        expect((await source.list())[0].item.sockets).toEqual([{ socketIndex: 0, gemId: 999999 }])
        const target = createMemoryTranscendGearRepo()
        await target.importJson(await source.exportJson())
        expect((await target.list())[0].item.sockets).toEqual([{ socketIndex: 0, gemId: 999999 }])
    })

    it("affixIds 含宝石按槽解析出的词缀", async () => {
        const repo = createMemoryTranscendGearRepo()
        const row = await repo.add(item({ slotType: 1, affixes: [roll(101)], sockets: [{ socketIndex: 0, gemId: 7001101 }] }))
        expect(row.affixIds).toEqual([101, 3101])
    })

    it("导入旧数据：缺 socketCount 时按已镶嵌数推断并计入结果", async () => {
        const repo = createMemoryTranscendGearRepo()
        const legacy = item({
            slotType: 1,
            sockets: [
                { socketIndex: 0, gemId: 7001101 },
                { socketIndex: 1, gemId: 7001101 },
            ],
        })
        const result = await repo.importJson(JSON.stringify([legacy]))
        expect(result).toEqual({ added: 1, skipped: 0, inferredSockets: 1 })
        const saved = (await repo.list())[0].item
        expect(saved.socketCount).toBe(2)
        expect(saved.sockets).toHaveLength(2)
    })

    it("导入推断边界：socketCount 为 0 / null / 负数时也计数，显式正整数不计数", async () => {
        const sockets = [{ socketIndex: 0, gemId: 7001101 }]
        const backup = [
            { slotType: 1, sockets, socketCount: 0 },
            { slotType: 1, sockets, socketCount: null },
            { slotType: 1, sockets, socketCount: -2 },
            { slotType: 1, sockets, socketCount: "" },
            { slotType: 1, sockets, socketCount: 1 },
            { slotType: 1, sockets },
        ]
        const repo = createMemoryTranscendGearRepo()
        const result = await repo.importJson(JSON.stringify(backup))
        expect(result).toEqual({ added: 6, skipped: 0, inferredSockets: 5 })
        expect((await repo.list()).every(row => row.item.socketCount === 1)).toBe(true)
    })

    it("库存写入保留未知词条与缺专属词条的暗金（不按数据表裁剪）", async () => {
        const repo = createMemoryTranscendGearRepo()
        const unknown = await repo.add(item({ slotType: 1, affixes: [roll(999999)] }))
        expect(unknown.item.affixes[0].affixId).toBe(999999)
        const unique = await repo.add(item({ slotType: 1, kind: "unique", uniqueId: 1001 }))
        expect(unique.kind).toBe("unique")
        expect(unique.uniqueId).toBe(1001)
        expect(unique.item.uniqueAffix).toBeUndefined()
    })

    it("replace 校验失败时不清空已有库存", async () => {
        const repo = createMemoryTranscendGearRepo()
        await repo.add(item())
        await repo.add(item({ slotType: 7, affixes: [roll(106)] }))
        await expect(repo.importJson("not json", { replace: true })).rejects.toThrow()
        await expect(repo.importJson(JSON.stringify([{ slotType: 99 }]), { replace: true })).rejects.toThrow()
        expect(await repo.list()).toHaveLength(2)
    })
})
