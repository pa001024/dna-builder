import { describe, expect, it } from "vitest"
import { affixes, inlays, uniqueEquips } from "../d"
import { resolveGearEffects } from "../transcend"
import { createDefaultTranscendBuildSettings, createTranscendBuildShare, parseTranscendBuildShare } from "../transcendBuild"
import {
    applyGearEntriesToGroup,
    canonicalGearString,
    flattenEquippedGear,
    getGearItemSocketCount,
    getSlotBaseAffixId,
    getSlotMaxInlayCount,
    getTranscendGearGroupKeyOfSlot,
    getTranscendSlotType,
    migrateV1GearToV2,
    normalizeGearItem,
    normalizeTranscendGearGroups,
    resolveEnchantSnapshot,
    resolveInlayAffixId,
    TRANSCEND_GEAR_HASH_PREFIX,
    TRANSCEND_SLOT_MAX,
    type TranscendEquippedGear,
    type TranscendGearAffixRoll,
    type TranscendGearDatasets,
    type TranscendGearEntry,
    type TranscendGearItemConfig,
} from "../transcendGear"
import { encodeTranscendGearCode } from "../transcendGearCode"
import { normalizeTranscendSettings, type TranscendSettings } from "../transcendSettings"

const roll = (affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll => ({
    affixId,
    rollLevel: 1,
    masterworkLevel: 0,
    ancient: false,
    finalMasterwork: false,
    ...patch,
})

const entry = (slotId: number, affixId: number, patch: Partial<TranscendGearEntry> = {}): TranscendGearEntry => ({
    slotId,
    ...roll(affixId),
    ...patch,
})

const item = (patch: Partial<TranscendGearItemConfig> & Pick<TranscendGearItemConfig, "slotType">): TranscendGearItemConfig => ({
    kind: "normal",
    affixes: [],
    ...patch,
})

const equipped = (slotId: number, patch: Partial<TranscendGearItemConfig>): TranscendEquippedGear => ({
    slotId,
    item: item({ slotType: getTranscendSlotType(slotId), ...patch }),
})

const gearSettings = (patch: Partial<TranscendSettings>): TranscendSettings => ({
    enabled: true,
    talentLevels: [],
    mainGear: [],
    assist1Gear: [],
    assist2Gear: [],
    gearVariants: [{ id: "A", mainGear: [], assist1Gear: [], assist2Gear: [] }],
    activeGearVariant: "A",
    ...patch,
})

/** 头盔宝石：槽型 1 → 3101（火属性攻击），槽型 2 → 3102，槽型 5-7 → 3103 */
const HELMET_GEM = 7001101
/** 同色第二档宝石：槽型 1 → 3111 */
const HELMET_GEM_2 = 7001102

describe("槽位与分组口径", () => {
    it("固定 16 位：主控 1-8、协战一 9-12、协战二 13-16", () => {
        expect(TRANSCEND_SLOT_MAX).toBe(16)
        const groups = Array.from({ length: 16 }, (_, index) => getTranscendGearGroupKeyOfSlot(index + 1))
        expect(groups.slice(0, 8).every(group => group === "main")).toBe(true)
        expect(groups.slice(8, 12).every(group => group === "assist1")).toBe(true)
        expect(groups.slice(12, 16).every(group => group === "assist2")).toBe(true)
        expect(getTranscendGearGroupKeyOfSlot(0)).toBeNull()
        expect(getTranscendGearGroupKeyOfSlot(17)).toBeNull()
        expect(getTranscendGearGroupKeyOfSlot(Number.NaN)).toBeNull()
    })

    it("协战二 13-16 复用槽型 8-11", () => {
        expect([13, 14, 15, 16].map(getTranscendSlotType)).toEqual([8, 9, 10, 11])
        expect([9, 10, 11, 12].map(getTranscendSlotType)).toEqual([8, 9, 10, 11])
    })
})

describe("物品归一化", () => {
    it("有序数组去重：乱序输入保持原顺序，重复 id 保留首次位置、后者覆盖值", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(105, { rollLevel: 2 }), roll(101), roll(103), roll(105, { rollLevel: 7 })],
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes.map(roll => roll.affixId)).toEqual([105, 101, 103])
        expect(normalized.affixes.find(entry => entry.affixId === 105)?.rollLevel).toBe(7)
        expect(warnings.some(message => message.includes("105") && message.includes("重复"))).toBe(true)
    })

    it("淬炼与随机词条同 id 共存：保两行与顺序，淬炼下标按来源定位", () => {
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(1001, { source: "random" }), roll(101), roll(1001, { source: "tempering", rollLevel: 9 })],
            })
        )!
        expect(normalized.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [1001, "random"],
            [101, "base"],
            [1001, "tempering"],
        ])
        expect(normalized.craft?.temperingAffixIndex).toBe(2)
        expect(normalized.affixes[2].rollLevel).toBe(9)
    })

    it("裁剪保持输入顺序：基础 / 淬炼不因来源被移到首尾", () => {
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(1001), roll(101), roll(1006, { source: "tempering" })],
            })
        )!
        expect(normalized.affixes.map(entry => entry.affixId)).toEqual([1001, 101, 1006])
        expect(normalized.affixes[1].source).toBe("base")
        expect(normalized.craft?.temperingAffixIndex).toBe(2)
    })

    it("重复 id 的 craft 下标映射到保留（首次）位置", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(1001, { rollLevel: 1 }), roll(101), roll(1001, { rollLevel: 5, masterworkLevel: 10 })],
                craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 2, temperingCount: 0, enchantCount: 0 },
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes.map(entry => entry.affixId)).toEqual([1001, 101])
        expect(normalized.affixes[0].rollLevel).toBe(5)
        expect(normalized.craft?.finalMasterworkAffixIndex).toBe(0)
        expect(warnings.some(message => message.includes("1001") && message.includes("重复"))).toBe(true)
    })

    it("附魔快照下标越界 / 目标行已不存在时丢弃并告警", () => {
        const warnings: string[] = []
        const context = { hasAffixData: true, baseAffixId: 101, masterworkLevel: 0, rawAffixCount: 2, warnings }
        expect(resolveEnchantSnapshot({ affixIndex: 2, roll: roll(1001) }, [roll(101), roll(1006)], context)).toBeUndefined()
        expect(warnings.some(message => message.includes("越界"))).toBe(true)

        warnings.length = 0
        // 原始数组有该下标，但归一化去重 / 裁剪后行数变少：悬空下标直接丢弃，不钳到其它行
        expect(resolveEnchantSnapshot({ affixIndex: 1, roll: roll(1001) }, [roll(101)], { ...context, rawAffixCount: 3 })).toBeUndefined()
        expect(warnings.some(message => message.includes("不存在"))).toBe(true)
    })

    it("归一化时快照下标因去重悬空：丢弃快照并告警", () => {
        const warnings: string[] = []
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101), roll(1001), roll(1001, { rollLevel: 4 })],
                craft: {
                    masterworkLevel: 0,
                    temperingCount: 0,
                    enchantAffixIndex: 1,
                    enchantCount: 1,
                    enchantSnapshot: { affixIndex: 2, roll: roll(1024) },
                },
            }),
            undefined,
            { warnings }
        )!
        expect(normalized.affixes.map(entry => entry.affixId)).toEqual([101, 1001])
        expect(normalized.craft?.enchantSnapshot).toBeUndefined()
        expect(warnings.some(message => message.includes("enchantSnapshot") && message.includes("不存在"))).toBe(true)
    })

    it("旧版 affixId 升序数组：读取后顺序不变，craft 目标仍指向同一词条", () => {
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [
                    roll(101, { source: "base" }),
                    roll(1001),
                    roll(1006, { source: "tempering" }),
                    roll(1024, { source: "enchant" }),
                ],
                craft: {
                    masterworkLevel: 10,
                    finalMasterworkAffixIndex: 1,
                    temperingAffixIndex: 2,
                    temperingCount: 1,
                    enchantAffixIndex: 3,
                    enchantCount: 1,
                },
            })
        )!
        expect(normalized.affixes.map(entry => entry.affixId)).toEqual([101, 1001, 1006, 1024])
        expect(normalized.craft).toMatchObject({ finalMasterworkAffixIndex: 1, temperingAffixIndex: 2, enchantAffixIndex: 3 })
    })

    it("普通词条上限 1 基础 + 4 随机，同词条去重（后者覆盖）", () => {
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                affixes: [roll(101, { rollLevel: 2 }), roll(102), roll(103), roll(104), roll(105), roll(106), roll(101, { rollLevel: 5 })],
            })
        )!
        // 1 条基础词条 + 最多 4 条随机词条
        expect(normalized.affixes).toHaveLength(5)
        expect(normalized.affixes.find(roll => roll.affixId === 101)?.rollLevel).toBe(5)
    })

    it("暗金：专属词条 1 条 + 普通词条上限 1 基础 + 4 随机；缺 uniqueId 时降级为普通装备", () => {
        const unique = normalizeGearItem(
            item({
                slotType: 1,
                kind: "unique",
                uniqueId: 1001,
                uniqueAffix: roll(2001),
                affixes: [roll(101), roll(102), roll(103), roll(104), roll(105)],
            })
        )!
        expect(unique.kind).toBe("unique")
        expect(unique.uniqueId).toBe(1001)
        expect(unique.uniqueAffix?.affixId).toBe(2001)
        expect(unique.affixes).toHaveLength(5)

        const missingId = normalizeGearItem(item({ slotType: 1, kind: "unique", uniqueAffix: roll(2001) }))!
        expect(missingId.kind).toBe("normal")
        expect(missingId.uniqueId).toBeUndefined()
        expect(missingId.uniqueAffix).toBeUndefined()
    })

    it("专属词条 roll / 精造固定为 1 档 / 0 次（不提供养成控件）", () => {
        const normalized = normalizeGearItem(
            item({
                slotType: 1,
                kind: "unique",
                uniqueId: 1001,
                uniqueAffix: roll(2001, { rollLevel: 50, masterworkLevel: 10, ancient: true, finalMasterwork: true }),
            })
        )!
        expect(normalized.uniqueAffix).toEqual({ ...roll(2001), source: "unique" })
    })

    it("库存写入（preserveUnknown）保留未知词条与缺失专属词条的暗金", () => {
        const unknownAffix = normalizeGearItem(item({ slotType: 1, affixes: [roll(999999)] }), undefined, { preserveUnknown: true })!
        expect(unknownAffix.affixes).toHaveLength(1)

        const halfUnique = normalizeGearItem(item({ slotType: 1, kind: "unique", uniqueId: 1001 }), undefined, {
            preserveUnknown: true,
        })!
        expect(halfUnique.kind).toBe("unique")
        expect(halfUnique.uniqueId).toBe(1001)
        expect(halfUnique.uniqueAffix).toBeUndefined()
    })

    it("槽型非法返回 null；未知词条在数据表可用时剔除、表为空时保留", () => {
        expect(normalizeGearItem(item({ slotType: 99 }))).toBeNull()
        expect(normalizeGearItem(null)).toBeNull()
        expect(normalizeGearItem(item({ slotType: 1, affixes: [roll(999999)] }))!.affixes).toEqual([])
        expect(normalizeGearItem(item({ slotType: 1, affixes: [roll(999999)] }), { affixes: [] })!.affixes).toHaveLength(1)
    })

    it("legacyUnique 判定门槛：词条表与唯一装目录同时可用，现行暗金不误标", () => {
        const current = uniqueEquips.find(equip => equip.slot === 1)!
        const currentItem = item({ kind: "unique", slotType: 1, uniqueId: current.id, uniqueAffix: roll(current.affixId) })
        expect(normalizeGearItem(currentItem)!.legacyUnique).toBeUndefined()

        const legacyItem = item({
            kind: "unique",
            slotType: 1,
            uniqueId: 1001,
            uniqueAffix: roll(2001),
            nameSnapshot: "泽被万物护符",
            iconSnapshot: "T_BreakRes_Wind02",
        })
        // 安全模式（词条表为空）：无法判定，不新标但沿用已落盘标记
        expect(normalizeGearItem(legacyItem, { affixes: [] })!.legacyUnique).toBeUndefined()
        expect(normalizeGearItem({ ...legacyItem, legacyUnique: true }, { affixes: [] })!.legacyUnique).toBe(true)
        // 旧包 / 空目录：词条表可用也不得误标
        const emptyCatalog = normalizeGearItem(legacyItem, { uniqueEquips: [] })!
        expect(emptyCatalog.kind).toBe("unique")
        expect(emptyCatalog.legacyUnique).toBeUndefined()
        // 两个数据源都可用才标记
        expect(normalizeGearItem(legacyItem)!.legacyUnique).toBe(true)
    })

    it("legacyUnique 幂等：normal 条目的跨槽遗留词条在重入后仍标记", () => {
        const once = normalizeGearItem(item({ slotType: 1, affixes: [roll(2001)] }))!
        expect(once.legacyUnique).toBe(true)
        expect(normalizeGearItem(JSON.parse(JSON.stringify(once)))!.legacyUnique).toBe(true)
        // 安全模式无法重算：沿用已落盘标记
        expect(normalizeGearItem(once, { affixes: [] })!.legacyUnique).toBe(true)
        // 词条在当前槽型有现行暗金（非跨槽遗留）：不标记
        const current = uniqueEquips.find(equip => equip.slot === 1)!
        expect(normalizeGearItem(item({ slotType: 1, affixes: [roll(current.affixId)] }))!.legacyUnique).toBeUndefined()
    })

    it("孔位：按槽型孔数上限、允许同宝石多孔、同孔位去重", () => {
        expect(getSlotMaxInlayCount(1)).toBe(2)
        expect(getSlotMaxInlayCount(8)).toBe(0)
        const two = normalizeGearItem(
            item({
                slotType: 1,
                sockets: [
                    { socketIndex: 0, gemId: HELMET_GEM },
                    { socketIndex: 1, gemId: HELMET_GEM },
                    { socketIndex: 1, gemId: HELMET_GEM_2 },
                    { socketIndex: 2, gemId: HELMET_GEM_2 },
                ],
            })
        )!
        // 同一宝石可在两个孔位各计一次；越界孔位丢弃；同孔位先出现优先
        expect(two.sockets).toEqual([
            { socketIndex: 0, gemId: HELMET_GEM },
            { socketIndex: 1, gemId: HELMET_GEM },
        ])
        expect(two.socketCount).toBe(2)

        const ring = normalizeGearItem(item({ slotType: 7, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] }))!
        expect(ring.sockets).toEqual([{ socketIndex: 0, gemId: HELMET_GEM }])
        expect(ring.socketCount).toBe(1)
    })

    it("已开孔数：缺省按已镶嵌数推断，可显式更大，低于已镶嵌所需时抬高，超上限截断", () => {
        // 缺省：只有 1 颗宝石 → 1 孔
        expect(normalizeGearItem(item({ slotType: 1, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] }))!.socketCount).toBe(1)
        // 显式更大：已开孔 2、只镶嵌 1 颗（1 个空孔）
        const opened = normalizeGearItem(item({ slotType: 1, socketCount: 2, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] }))!
        expect(opened.socketCount).toBe(2)
        expect(opened.sockets).toEqual([{ socketIndex: 0, gemId: HELMET_GEM }])
        // 显式 0 但有宝石 → 抬到已镶嵌所需
        expect(
            normalizeGearItem(item({ slotType: 1, socketCount: 0, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] }))!.socketCount
        ).toBe(1)
        // 孔位在 1 号（0 号空）：按最大下标抬高到 2
        expect(normalizeGearItem(item({ slotType: 1, sockets: [{ socketIndex: 1, gemId: HELMET_GEM }] }))!.socketCount).toBe(2)
        // 显式已开孔数低于孔下标：抬高到 2，宝石不丢
        const raised = normalizeGearItem(item({ slotType: 1, socketCount: 1, sockets: [{ socketIndex: 1, gemId: HELMET_GEM }] }))!
        expect(raised.socketCount).toBe(2)
        expect(raised.sockets).toEqual([{ socketIndex: 1, gemId: HELMET_GEM }])
        // 已开孔 2、0 颗宝石：两个空孔
        const empty = normalizeGearItem(item({ slotType: 1, socketCount: 2 }))!
        expect(empty.socketCount).toBe(2)
        expect(empty.sockets).toBeUndefined()
        // 超过槽型上限 → 截到 2（1 号孔在上限内，保留）
        const clamped = normalizeGearItem(item({ slotType: 1, socketCount: 9, sockets: [{ socketIndex: 1, gemId: HELMET_GEM }] }))!
        expect(clamped.socketCount).toBe(2)
        expect(clamped.sockets).toEqual([{ socketIndex: 1, gemId: HELMET_GEM }])
        // 戒指上限 1：已开孔 2 截到 1，1 号孔被裁掉
        const ring = normalizeGearItem(item({ slotType: 7, socketCount: 2, sockets: [{ socketIndex: 1, gemId: HELMET_GEM }] }))!
        expect(ring.socketCount).toBe(1)
        expect(ring.sockets).toBeUndefined()
    })

    it("已开孔数：0 孔不产生字段，安全模式（槽位表为空）跳过上限裁剪", () => {
        expect(normalizeGearItem(item({ slotType: 1, socketCount: 0 }))!.socketCount).toBeUndefined()
        const safe = normalizeGearItem(item({ slotType: 8, socketCount: 3, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] }), {
            slots: [],
        })!
        expect(safe.socketCount).toBe(3)
        expect(safe.sockets).toEqual([{ socketIndex: 0, gemId: HELMET_GEM }])
    })

    it("槽型 8-11（无镶嵌孔）不保留任何宝石；槽位表不可用时才跳过裁剪", () => {
        for (const slotType of [8, 9, 10, 11]) {
            const normalized = normalizeGearItem(item({ slotType, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] }))!
            expect(normalized.sockets, `slotType ${slotType}`).toBeUndefined()
        }
        // 安全模式（槽位表为空）下无法判断孔数，保留配置
        const safe = normalizeGearItem(item({ slotType: 8, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] }), { slots: [] })!
        expect(safe.sockets).toEqual([{ socketIndex: 0, gemId: HELMET_GEM }])
    })

    it("未知宝石保留 gemId 与快照，不删除", () => {
        const normalized = normalizeGearItem(
            item({ slotType: 1, sockets: [{ socketIndex: 0, gemId: 999999, nameSnapshot: "未知宝石", iconSnapshot: "icon" }] })
        )!
        expect(normalized.sockets).toEqual([{ socketIndex: 0, gemId: 999999, nameSnapshot: "未知宝石", iconSnapshot: "icon" }])
    })

    it("装备组：同槽位后者覆盖，槽型与装备位不一致被剔除；三组按槽位归位", () => {
        const groups = normalizeTranscendGearGroups([
            [equipped(3, { affixes: [roll(101)] })],
            [equipped(9, { affixes: [roll(1501)] }), equipped(3, { affixes: [roll(102)] }), { slotId: 7, item: item({ slotType: 1 }) }],
            [equipped(13, { affixes: [roll(1501)] })],
        ])
        expect(groups.mainGear.map(item => item.slotId)).toEqual([3])
        expect((groups.mainGear[0] as TranscendEquippedGear).item.affixes[0].affixId).toBe(102)
        expect(groups.assist1Gear.map(item => item.slotId)).toEqual([9])
        expect((groups.assist1Gear[0] as TranscendEquippedGear).item.affixes[0].affixId).toBe(1501)
        expect(groups.assist2Gear.map(item => item.slotId)).toEqual([13])
        expect((groups.assist2Gear[0] as TranscendEquippedGear).item.affixes[0].affixId).toBe(1501)
    })
})

describe("展平适配器", () => {
    it("普通词条 + 暗金专属词条都落到装备位", () => {
        const { entries, warnings } = flattenEquippedGear([
            equipped(1, { kind: "unique", uniqueId: 1001, uniqueAffix: roll(2001), affixes: [roll(101)] }),
        ])
        expect(warnings).toEqual([])
        expect(entries.map(item => item.affixId)).toEqual([2001, 101])
        expect(entries.every(item => item.slotId === 1)).toBe(true)
    })

    it("宝石按物品槽型解析：同一宝石在不同槽型得到不同词缀", () => {
        expect(resolveInlayAffixId(HELMET_GEM, 1)).toBe(3101)
        expect(resolveInlayAffixId(HELMET_GEM, 2)).toBe(3102)
        expect(resolveInlayAffixId(HELMET_GEM, 7)).toBe(3103)
        expect(resolveInlayAffixId(HELMET_GEM, 9)).toBeNull()
        expect(resolveInlayAffixId(999999, 1)).toBeNull()

        const helmet = flattenEquippedGear([equipped(1, { sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] })])
        expect(helmet.entries).toEqual([
            {
                slotId: 1,
                affixId: 3101,
                rollLevel: 1,
                masterworkLevel: 0,
                ancient: false,
                finalMasterwork: false,
                gemId: HELMET_GEM,
                socketIndex: 0,
            },
        ])
        const ring = flattenEquippedGear([equipped(7, { sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] })])
        expect(ring.entries[0].affixId).toBe(3103)
    })

    it("双孔宝石都计入；同一颗宝石两颗孔各计一次", () => {
        const { entries } = flattenEquippedGear([
            equipped(1, {
                sockets: [
                    { socketIndex: 0, gemId: HELMET_GEM },
                    { socketIndex: 1, gemId: HELMET_GEM_2 },
                ],
            }),
        ])
        expect(entries).toHaveLength(2)
        const result = resolveGearEffects(entries, "main")
        expect(result.entries).toHaveLength(2)
        // 无 socketIndex 的重复条目仍按 (slotId, affixId) 去重
        expect(resolveGearEffects([entry(1, 3101), entry(1, 3101)], "main").entries).toHaveLength(1)
        const perSocket = resolveGearEffects(
            [entry(1, 3101, { socketIndex: 0, gemId: HELMET_GEM }), entry(1, 3101, { socketIndex: 1, gemId: HELMET_GEM_2 })],
            "main"
        )
        expect(perSocket.entries).toHaveLength(2)

        const duplicate = flattenEquippedGear([
            equipped(1, {
                sockets: [
                    { socketIndex: 0, gemId: HELMET_GEM },
                    { socketIndex: 1, gemId: HELMET_GEM },
                ],
            }),
        ])
        expect(duplicate.entries.map(item => [item.affixId, item.socketIndex])).toEqual([
            [3101, 0],
            [3101, 1],
        ])
        expect(resolveGearEffects(duplicate.entries, "main").entries).toHaveLength(2)
    })

    it("同 id 随机 + 淬炼双行展平为两条 entry，并保留来源类", () => {
        const normalized = normalizeGearItem(
            item({
                slotType: 3,
                rarityId: 5,
                equipBaseScore: 50,
                affixes: [roll(101), roll(1001), roll(1001, { rollLevel: 2 })],
                craft: { masterworkLevel: 0, temperingAffixIndex: 2, temperingCount: 1, enchantCount: 0 },
            })
        )!
        const { entries } = flattenEquippedGear([{ slotId: 3, item: normalized }])
        expect(entries.map(entry => [entry.affixId, entry.source])).toEqual([
            [101, "base"],
            [1001, "random"],
            [1001, "tempering"],
        ])
        expect(entries[2].rollLevel).toBe(2)
    })

    it("同槽宝石词缀与同 id 随机行并存：孔位仍区分，两条都计入", () => {
        const gemAffixId = 1001
        const { entries } = flattenEquippedGear(
            [equipped(3, { affixes: [roll(gemAffixId)], sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] })],
            { inlays: [{ id: HELMET_GEM, affixIdsBySlot: { [String(gemAffixId)]: [3] } }] }
        )
        expect(entries.map(item => [item.affixId, item.socketIndex])).toEqual([
            [gemAffixId, undefined],
            [gemAffixId, 0],
        ])
        const result = resolveGearEffects(entries, "main")
        expect(result.entries).toHaveLength(2)
        expect(result.buffs.map(buff => buff.key)).toEqual(["gear:3:-:1001:other", "gear:3:0:1001:other"])
    })

    it("未知宝石保留在物品上并告警，不产生词条", () => {
        const { entries, warnings } = flattenEquippedGear([equipped(1, { sockets: [{ socketIndex: 0, gemId: 999999 }] })])
        expect(entries).toEqual([])
        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toContain("999999")
    })

    it("槽型与装备位不一致时告警并跳过", () => {
        const { entries, warnings } = flattenEquippedGear([{ slotId: 7, item: item({ slotType: 1, affixes: [roll(101)] }) }])
        expect(entries).toEqual([])
        expect(warnings[0]).toContain("不一致")
    })

    it("v1 平铺条目原样透传（安全模式）", () => {
        const { entries } = flattenEquippedGear([entry(3, 101, { rollLevel: 7 })])
        expect(entries).toEqual([entry(3, 101, { rollLevel: 7 })])
    })
})

describe("v1 → v2 迁移", () => {
    const uniqueEquip = uniqueEquips[0]
    /** 暗金专属词条的装备位（槽型 1-7 与主控同号） */
    const slotIdOfUnique = uniqueEquip.slot <= 7 ? uniqueEquip.slot : uniqueEquip.slot + 1

    it("普通词条按装备位合成为物品，解析结果与 v1 等价", () => {
        const entries = [entry(3, 101, { rollLevel: 25, masterworkLevel: 10 }), entry(7, 106, { rollLevel: 50 })]
        const v1 = resolveGearEffects(entries, "main")
        const migrated = migrateV1GearToV2(gearSettings({ mainGear: entries }))
        const items = migrated.mainGear
        expect(items).toHaveLength(2)
        expect(items.map(item => item.slotId)).toEqual([3, 7])
        const v2 = resolveGearEffects(flattenEquippedGear(items).entries, "main")
        expect(v2.attrs).toEqual(v1.attrs)
        expect(v2.buffs.map(buff => buff.buff.名称).sort()).toEqual(v1.buffs.map(buff => buff.buff.名称).sort())
        expect(v2.entries.map(item => [item.slotId, item.affixId, item.value])).toEqual(
            v1.entries.map(item => [item.slotId, item.affixId, item.value])
        )
    })

    it("Plan 4 词条唯一命中转为暗金（带 uniqueId），专属词条固定档位", () => {
        const migrated = migrateV1GearToV2(
            gearSettings({ mainGear: [entry(slotIdOfUnique, uniqueEquip.affixId, { rollLevel: 50, masterworkLevel: 10 })] })
        )
        const result = migrated.mainGear[0] as TranscendEquippedGear
        expect(result.slotId).toBe(slotIdOfUnique)
        expect(result.item.kind).toBe("unique")
        expect(result.item.uniqueId).toBe(uniqueEquip.id)
        expect(result.item.uniqueAffix).toEqual({ ...roll(uniqueEquip.affixId), source: "unique" })
        expect(result.item.affixes).toEqual([])
        // 迁移回填暗金展示快照（安全模式 / 缺包时离线展示）
        expect(result.item.nameSnapshot).toBe(uniqueEquip.name)
        expect(result.item.iconSnapshot).toBe(uniqueEquip.icon)
        expect(flattenEquippedGear(migrated.mainGear).entries).toEqual([
            { ...entry(slotIdOfUnique, uniqueEquip.affixId), source: "unique" },
        ])
    })

    it("重复专属词条先去重，迁移结果再归一化幂等", () => {
        const migrated = migrateV1GearToV2(
            gearSettings({
                mainGear: [entry(slotIdOfUnique, uniqueEquip.affixId), entry(slotIdOfUnique, uniqueEquip.affixId)],
            })
        )
        const result = migrated.mainGear[0] as TranscendEquippedGear
        expect(result.item.uniqueAffix?.affixId).toBe(uniqueEquip.affixId)
        expect(result.item.affixes).toEqual([])
        const again = normalizeTranscendSettings(migrated)
        expect(again.mainGear).toEqual(migrated.mainGear)
    })

    it("多命中取最小 id 并记录候选；无命中保留为普通词条", () => {
        const datasets: TranscendGearDatasets = {
            uniqueEquips: [
                { id: 900, slot: 1, affixId: 2001 },
                { id: 800, slot: 1, affixId: 2001 },
            ],
        }
        const migrated = migrateV1GearToV2(gearSettings({ mainGear: [entry(1, 2001)] }), datasets)
        const item = (migrated.mainGear[0] as TranscendEquippedGear).item
        expect(item.kind).toBe("unique")
        expect(item.uniqueId).toBe(800)
        expect(item.legacyAmbiguousUnique).toEqual([800, 900])

        const noMatch = migrateV1GearToV2(gearSettings({ mainGear: [entry(1, 101)] }), datasets)
        const normal = (noMatch.mainGear[0] as TranscendEquippedGear).item
        expect(normal.kind).toBe("normal")
        expect(normal.affixes.map(roll => roll.affixId)).toEqual([101])
    })

    it("v1 遗留唯一装词条失去候选：保留词条并标记 legacy，不误配到别的槽型", () => {
        const migrated = migrateV1GearToV2(gearSettings({ mainGear: [entry(1, 2001)] }))
        const result = migrated.mainGear[0] as TranscendEquippedGear
        expect(result.item.kind).toBe("normal")
        expect(result.item.legacyUnique).toBe(true)
        expect(result.item.uniqueId).toBeUndefined()
        expect(flattenEquippedGear(migrated.mainGear).entries.map(entry => entry.affixId)).toEqual([2001])
        // 归一化重入后标记仍成立
        const again = normalizeTranscendGearGroups([migrated.mainGear]).mainGear[0] as TranscendEquippedGear
        expect(again.item.legacyUnique).toBe(true)
    })

    it("v1 现行槽型命中当前唯一装：不误标 legacy，重入后仍无标记", () => {
        const migrated = migrateV1GearToV2(gearSettings({ mainGear: [entry(slotIdOfUnique, uniqueEquip.affixId)] }))
        const result = migrated.mainGear[0] as TranscendEquippedGear
        expect(result.item.kind).toBe("unique")
        expect(result.item.uniqueId).toBe(uniqueEquip.id)
        expect(result.item.legacyUnique).toBeUndefined()
        const again = normalizeTranscendGearGroups([migrated.mainGear]).mainGear[0] as TranscendEquippedGear
        expect(again.item.legacyUnique).toBeUndefined()
    })

    it("同槽「遗留词条 + 现行暗金」：现行暗金不标 legacy（与词条顺序无关）", () => {
        const current = uniqueEquips.find(equip => equip.slot === 1)!
        for (const entries of [
            [entry(1, current.affixId), entry(1, 2001)],
            [entry(1, 2001), entry(1, current.affixId)],
        ]) {
            const migrated = migrateV1GearToV2(gearSettings({ mainGear: entries }))
            const result = (migrated.mainGear[0] as TranscendEquippedGear).item
            expect(result.kind).toBe("unique")
            expect(result.uniqueId).toBe(current.id)
            expect(result.affixes.map(roll => roll.affixId)).toContain(2001)
            expect(result.legacyUnique).toBeUndefined()
            const again = normalizeTranscendGearGroups([migrated.mainGear]).mainGear[0] as TranscendEquippedGear
            expect(again.item.legacyUnique).toBeUndefined()
        }
    })

    it("跨槽遗留词条进入 resolveGearEffects 被忽略并告警（不保证计入计算）", () => {
        const migrated = migrateV1GearToV2(gearSettings({ mainGear: [entry(1, 2001)] }))
        const resolved = resolveGearEffects(flattenEquippedGear(migrated.mainGear).entries, "main")
        expect(resolved.entries).toEqual([])
        expect(resolved.warnings.some(warning => warning.includes("2001") && warning.includes("不能装备在装备位 1"))).toBe(true)
    })

    it("v2 遗留唯一装 id：保留条目与快照并标记 legacy，不抛错", () => {
        const legacyItem = item({
            kind: "unique",
            slotType: 1,
            uniqueId: 1001,
            uniqueAffix: { ...roll(2001, { source: "unique" }) },
            nameSnapshot: "泽被万物护符",
            iconSnapshot: "T_BreakRes_Wind02",
        })
        const normalized = normalizeGearItem(legacyItem, undefined, { preserveUnknown: true })!
        expect(normalized).toMatchObject({
            kind: "unique",
            uniqueId: 1001,
            legacyUnique: true,
            nameSnapshot: "泽被万物护符",
            iconSnapshot: "T_BreakRes_Wind02",
        })
        expect(normalized.uniqueAffix?.affixId).toBe(2001)
        expect(() => normalizeTranscendGearGroups([[{ slotId: 1, item: legacyItem }]])).not.toThrow()
    })

    it("数据表为空时不迁移并返回原样", () => {
        const settings = gearSettings({ mainGear: [entry(3, 101)] })
        const migrated = migrateV1GearToV2(settings, { affixes: [] })
        expect(migrated).toBe(settings)
        expect(migrated.mainGear).toEqual([entry(3, 101)])
        expect(normalizeTranscendGearGroups([settings.mainGear], { affixes: [] }).mainGear).toEqual([entry(3, 101)])
    })

    it("幂等：重复迁移结果一致", () => {
        const settings = gearSettings({ mainGear: [entry(slotIdOfUnique, uniqueEquip.affixId), entry(3, 101)] })
        const once = migrateV1GearToV2(settings)
        const twice = migrateV1GearToV2(once)
        expect(twice).toBe(once)
        expect(twice).toEqual(once)
    })

    it("跨组按装备位归组（1-8 主控、9-12 协战一、13-16 协战二）", () => {
        const migrated = migrateV1GearToV2(
            gearSettings({
                mainGear: [entry(13, 1501)],
                assist1Gear: [entry(3, 101), entry(9, 1502)],
                assist2Gear: [entry(16, 1501)],
            })
        )
        expect(migrated.mainGear.map(item => item.slotId)).toEqual([3])
        expect(migrated.assist1Gear.map(item => item.slotId)).toEqual([9])
        expect(migrated.assist2Gear.map(item => item.slotId)).toEqual([13, 16])
    })
})

describe("规范化 hash 字符串", () => {
    const base = item({ slotType: 7, affixes: [roll(101, { rollLevel: 3 }), roll(102)] })

    it("前缀 tg3，词条顺序无关", () => {
        const reordered = item({ slotType: 7, affixes: [roll(102), roll(101, { rollLevel: 3 })] })
        expect(canonicalGearString(base).startsWith(`${TRANSCEND_GEAR_HASH_PREFIX}#`)).toBe(true)
        expect(canonicalGearString(reordered)).toBe(canonicalGearString(base))
    })

    it("孔位计入且顺序无关；带宝石与不带宝石不同（双孔用 1-4 号槽）", () => {
        const sockets = item({
            slotType: 1,
            affixes: [roll(101)],
            sockets: [
                { socketIndex: 1, gemId: HELMET_GEM_2 },
                { socketIndex: 0, gemId: HELMET_GEM },
            ],
        })
        const reordered = item({
            slotType: 1,
            affixes: [roll(101)],
            sockets: [
                { socketIndex: 0, gemId: HELMET_GEM },
                { socketIndex: 1, gemId: HELMET_GEM_2 },
            ],
        })
        expect(canonicalGearString(sockets)).toBe(canonicalGearString(reordered))
        expect(canonicalGearString(sockets)).not.toBe(canonicalGearString(item({ slotType: 1, affixes: [roll(101)] })))
    })

    it("同一宝石不同 socketIndex 不同", () => {
        const left = item({ slotType: 7, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] })
        const right = item({ slotType: 7, sockets: [{ socketIndex: 1, gemId: HELMET_GEM }] })
        expect(canonicalGearString(left)).not.toBe(canonicalGearString(right))
    })

    it("已开孔数不参与 tg3 canonical", () => {
        const base = item({ slotType: 1, affixes: [roll(101)] })
        expect(canonicalGearString({ ...base, socketCount: 2 })).toBe(canonicalGearString(base))
        expect(canonicalGearString({ ...base, socketCount: 2, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] })).not.toBe(
            canonicalGearString(base)
        )
    })

    it("展示快照不参与；暗金 uniqueId 参与（同 affixId 不同暗金可区分）", () => {
        expect(canonicalGearString(item({ ...base, nameSnapshot: "某某头盔", iconSnapshot: "icon_a" }))).toBe(canonicalGearString(base))
        // 迁移候选 id 只作展示，不参与 hash
        expect(canonicalGearString(item({ ...base, legacyAmbiguousUnique: [800, 900] }))).toBe(canonicalGearString(base))
        // legacyUnique 同样只是展示标记：canonical 与装备短码都不应变化
        expect(canonicalGearString({ ...base, legacyUnique: true })).toBe(canonicalGearString(base))
        const group = (gearItem: TranscendGearItemConfig) => [{ slotId: 7, item: gearItem }]
        expect(encodeTranscendGearCode(group({ ...base, legacyUnique: true }), [])).toBe(encodeTranscendGearCode(group(base), []))

        const uniqueA = item({ slotType: 1, kind: "unique", uniqueId: 1001, uniqueAffix: roll(2001) })
        const uniqueB = item({ slotType: 1, kind: "unique", uniqueId: 1002, uniqueAffix: roll(2001) })
        expect(canonicalGearString(uniqueA)).not.toBe(canonicalGearString(uniqueB))
        expect(canonicalGearString(uniqueA)).not.toBe(canonicalGearString(base))
    })

    it("戒指位 7 / 8 的同一物品字符串相同", () => {
        const ring7: TranscendEquippedGear = { slotId: 7, item: base }
        const ring8: TranscendEquippedGear = { slotId: 8, item: base }
        expect(canonicalGearString(ring7.item)).toBe(canonicalGearString(ring8.item))
        expect(getTranscendSlotType(7)).toBe(getTranscendSlotType(8))
    })

    it("craft 为空数组按无 craft 处理（hash / 展平与旧物品一致）", () => {
        const legacy = item({
            slotType: 3,
            affixes: [roll(101, { masterworkLevel: 3 }), roll(1001, { masterworkLevel: 3, finalMasterwork: true })],
        })
        const arrayCraft = { ...legacy, craft: [] as never }
        expect(canonicalGearString(arrayCraft)).toBe(canonicalGearString(legacy))
        expect(flattenEquippedGear([{ slotId: 3, item: arrayCraft }]).entries).toEqual(
            flattenEquippedGear([{ slotId: 3, item: legacy }]).entries
        )
    })

    it("附魔快照参与 hash：不同快照不同，归一化后不变，无快照也不同", () => {
        const snapshotItem = item({
            slotType: 3,
            affixes: [roll(101), roll(1006, { source: "tempering" }), roll(1024, { source: "enchant" })],
            craft: {
                masterworkLevel: 0,
                temperingAffixIndex: 1,
                temperingCount: 1,
                enchantAffixIndex: 2,
                enchantCount: 1,
                enchantSnapshot: { affixIndex: 1, roll: roll(1001) },
            },
        })
        const otherSnapshot = {
            ...snapshotItem,
            craft: { ...snapshotItem.craft!, enchantSnapshot: { affixIndex: 1, roll: roll(1002) } },
        }
        expect(canonicalGearString(otherSnapshot)).not.toBe(canonicalGearString(snapshotItem))
        expect(canonicalGearString(normalizeGearItem(snapshotItem)!)).toBe(canonicalGearString(snapshotItem))

        const withoutSnapshot = {
            ...snapshotItem,
            craft: { masterworkLevel: 0, temperingAffixIndex: 1, temperingCount: 1, enchantAffixIndex: 2, enchantCount: 1 },
        }
        expect(canonicalGearString(withoutSnapshot)).not.toBe(canonicalGearString(snapshotItem))
    })
})

describe("v1 风格回写适配器（按槽位合并）", () => {
    const ring: TranscendEquippedGear = equipped(7, {
        kind: "unique",
        uniqueId: 1001,
        uniqueAffix: roll(2001),
        affixes: [roll(106)],
        sockets: [{ socketIndex: 0, gemId: HELMET_GEM }],
        nameSnapshot: "暗金戒指快照",
        iconSnapshot: "ring_icon",
    })
    const glove: TranscendEquippedGear = equipped(3, { affixes: [roll(101)] })

    it("编辑一个槽不会破坏其它槽的暗金 / 孔位 / 快照", () => {
        // 旧面板提交的是整侧展平结果：其它槽的专属 / 宝石条目同样在列表中
        const entries = flattenEquippedGear([glove, ring]).entries
        entries.push(entry(3, 102))
        const next = applyGearEntriesToGroup([glove, ring], entries)
        expect(next.map(item => item.slotId)).toEqual([3, 7])
        const edited = next.find(item => item.slotId === 3) as TranscendEquippedGear
        expect(edited.item.affixes.map(roll => roll.affixId)).toEqual([101, 102])
        const kept = next.find(item => item.slotId === 7) as TranscendEquippedGear
        expect(kept.item).toMatchObject({
            kind: "unique",
            uniqueId: 1001,
            uniqueAffix: roll(2001),
            sockets: [{ socketIndex: 0, gemId: HELMET_GEM }],
            nameSnapshot: "暗金戒指快照",
            iconSnapshot: "ring_icon",
        })
    })

    it("零贡献物品（只有专属词条 / 只有孔位）不会被删除", () => {
        const uniqueOnly = equipped(5, { kind: "unique", uniqueId: 1001, uniqueAffix: roll(2001) })
        const socketOnly = equipped(1, { sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] })
        const next = applyGearEntriesToGroup([uniqueOnly, socketOnly], [])
        expect(next.map(item => item.slotId)).toEqual([1, 5])
    })

    it("清空某槽全部词条则卸下该槽物品", () => {
        const next = applyGearEntriesToGroup([glove, ring], flattenEquippedGear([ring]).entries)
        expect(next.map(item => item.slotId)).toEqual([7])
    })

    it("新槽位由词条创建普通物品；宝石条目（gemId）不参与", () => {
        const next = applyGearEntriesToGroup(
            [],
            [entry(4, 101, { rollLevel: 4 }), entry(4, 102), entry(4, 3101, { gemId: HELMET_GEM, socketIndex: 0 })]
        )
        expect(next).toHaveLength(1)
        expect(next[0].slotId).toBe(4)
        expect(next[0].item.affixes.map(roll => roll.affixId)).toEqual([101, 102])
    })

    it("新槽位保持提交顺序，craft 下标按该顺序计算", () => {
        const next = applyGearEntriesToGroup(
            [],
            [entry(3, 1002, { masterworkLevel: 10, finalMasterwork: true }), entry(3, 101, { masterworkLevel: 10 }), entry(3, 1003)]
        )
        const created = next[0].item
        expect(created.affixes.map(roll => roll.affixId)).toEqual([1002, 101, 1003])
        expect(created.craft).toMatchObject({ masterworkLevel: 10, finalMasterworkAffixIndex: 0 })
    })
})

describe("物品元数据扩展（品质 / 强度 / 名称 / 赛季）", () => {
    it("品质只接受 1/2/3/4/5/10；强度钳制到 1-50；名称 / 赛季保留正整数", () => {
        const full = normalizeGearItem(
            item({
                slotType: 1,
                rarityId: 5,
                equipBaseScore: 37,
                iconId: 1001,
                nameId: 1001,
                seasonId: 1,
            })
        )!
        expect(full.rarityId).toBe(5)
        expect(full.equipBaseScore).toBe(37)
        expect(full.iconId).toBe(1001)
        expect(full.nameId).toBe(1001)
        expect(full.seasonId).toBe(1)

        expect(normalizeGearItem(item({ slotType: 1, rarityId: 6 }))!.rarityId).toBeUndefined()
        expect(normalizeGearItem(item({ slotType: 1, rarityId: 10 }))!.rarityId).toBe(10)
        expect(normalizeGearItem(item({ slotType: 1, equipBaseScore: 0 }))!.equipBaseScore).toBe(1)
        expect(normalizeGearItem(item({ slotType: 1, equipBaseScore: 99 }))!.equipBaseScore).toBe(50)
        expect(normalizeGearItem(item({ slotType: 1, equipBaseScore: "x" as never }))!.equipBaseScore).toBeUndefined()
        expect(normalizeGearItem(item({ slotType: 1, iconId: -3 }))!.iconId).toBeUndefined()
    })

    it("旧物品（无新字段）归一化后不产生新字段，hash 保持不变", () => {
        const legacy = item({ slotType: 3, affixes: [roll(101, { rollLevel: 12 }), roll(102)] })
        const before = canonicalGearString(legacy)
        const normalized = normalizeGearItem(legacy)!
        expect(normalized.rarityId).toBeUndefined()
        expect(normalized.equipBaseScore).toBeUndefined()
        expect(normalized.iconId).toBeUndefined()
        expect(normalized.nameId).toBeUndefined()
        expect(normalized.seasonId).toBeUndefined()
        expect(canonicalGearString(normalized)).toBe(before)
    })

    it("新元数据与词缀来源不参与 hash（旧存档 / 库存不失配）", () => {
        const base = item({ slotType: 1, affixes: [roll(101), roll(102)] })
        const withMeta = item({
            slotType: 1,
            rarityId: 5,
            equipBaseScore: 50,
            iconId: 1001,
            nameId: 1001,
            seasonId: 1,
            affixes: [roll(101, { source: "base" }), roll(102, { source: "random" })],
        })
        expect(canonicalGearString(withMeta)).toBe(canonicalGearString(base))
    })

    it("词缀来源按槽位基础词条推断：基础 / 随机 / 专属", () => {
        const normal = normalizeGearItem(
            item({
                slotType: 3,
                rarityId: 5,
                equipBaseScore: 50,
                affixes: [roll(101), roll(102, { source: "random" })],
            })
        )!
        expect(normal.affixes.find(roll => roll.affixId === 101)?.source).toBe("base")
        expect(normal.affixes.find(roll => roll.affixId === 102)?.source).toBe("random")

        const unique = normalizeGearItem(
            item({
                slotType: 1,
                rarityId: 10,
                kind: "unique",
                uniqueId: 1001,
                uniqueAffix: roll(2001),
                affixes: [roll(102)],
            })
        )!
        expect(unique.uniqueAffix?.source).toBe("unique")
        expect(unique.affixes[0].source).toBe("base")
    })

    it("数据表不可用时保留显式来源，缺省标 unknown", () => {
        const normalized = normalizeGearItem(item({ slotType: 1, affixes: [roll(101, { source: "base" }), roll(102)] }), {
            affixes: [],
            slots: [],
        })!
        expect(normalized.affixes.find(roll => roll.affixId === 101)?.source).toBe("base")
        expect(normalized.affixes.find(roll => roll.affixId === 102)?.source).toBe("unknown")
    })

    it("数据表可用但词条不存在：preserveUnknown 保留并标 unknown，不伪装 random", () => {
        const normalized = normalizeGearItem(item({ slotType: 1, affixes: [roll(102), roll(999999)] }), undefined, {
            preserveUnknown: true,
        })!
        expect(normalized.affixes.find(roll => roll.affixId === 102)?.source).toBe("base")
        expect(normalized.affixes.find(roll => roll.affixId === 999999)?.source).toBe("unknown")
        expect(normalizeGearItem(item({ slotType: 1, affixes: [roll(102), roll(999999)] }))!.affixes.map(roll => roll.affixId)).toEqual([
            102,
        ])
    })

    it("普通词条上限：1 条基础 + 4 条随机，超出截断", () => {
        const randomIds = affixes
            .filter(affix => affix.plan === 2 && affix.id !== 102)
            .slice(0, 5)
            .map(affix => affix.id)
        expect(randomIds).toHaveLength(5)
        const normalized = normalizeGearItem(item({ slotType: 1, affixes: [roll(102), ...randomIds.map(affixId => roll(affixId))] }))!
        expect(normalized.affixes).toHaveLength(5)
        expect(normalized.affixes.filter(roll => roll.source === "base")).toHaveLength(1)
        expect(normalized.affixes.filter(roll => roll.source === "random")).toHaveLength(4)
    })

    it("槽位基础词条查询：槽型 1-11 有值，未知槽型为 null", () => {
        expect(getSlotBaseAffixId(1)).toBe(102)
        expect(getSlotBaseAffixId(3)).toBe(101)
        expect(getSlotBaseAffixId(99)).toBeNull()
    })

    it("已开孔数读取：显式值优先，缺省按孔位下标推断（旧存档 / 分享）", () => {
        expect(getGearItemSocketCount(item({ slotType: 1 }))).toBe(0)
        expect(getGearItemSocketCount(item({ slotType: 1, socketCount: 2 }))).toBe(2)
        expect(getGearItemSocketCount(item({ slotType: 1, sockets: [{ socketIndex: 0, gemId: HELMET_GEM }] }))).toBe(1)
        expect(getGearItemSocketCount(item({ slotType: 1, sockets: [{ socketIndex: 1, gemId: HELMET_GEM }] }))).toBe(2)
        expect(getGearItemSocketCount(item({ slotType: 1, socketCount: 1, sockets: [{ socketIndex: 1, gemId: HELMET_GEM }] }))).toBe(2)
        expect(getGearItemSocketCount(null)).toBe(0)
    })

    it("装备组往返：已开孔数与重复宝石不丢失，再归一化幂等", () => {
        const settings = gearSettings({
            mainGear: [
                equipped(1, {
                    socketCount: 2,
                    sockets: [
                        { socketIndex: 0, gemId: HELMET_GEM },
                        { socketIndex: 1, gemId: HELMET_GEM },
                    ],
                }),
            ],
        })
        const once = normalizeTranscendSettings(settings)
        const item = (once.mainGear[0] as TranscendEquippedGear).item
        expect(item.socketCount).toBe(2)
        expect(item.sockets).toHaveLength(2)
        const twice = normalizeTranscendSettings(JSON.parse(JSON.stringify(once)))
        expect(twice.mainGear).toEqual(once.mainGear)
    })

    it("分享 JSON 往返：已开孔数与重复宝石保留", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [
            equipped(1, {
                socketCount: 2,
                sockets: [
                    { socketIndex: 0, gemId: HELMET_GEM },
                    { socketIndex: 1, gemId: HELMET_GEM },
                ],
            }),
        ]
        const parsed = parseTranscendBuildShare(createTranscendBuildShare(settings))!
        expect(parsed.settings.main.charId).toBe(1101)
        // 分享往返与归一化同口径（装备级 craft 状态由归一化补齐）
        const expected = normalizeTranscendGearGroups([
            settings.transcend.mainGear,
            settings.transcend.assist1Gear,
            settings.transcend.assist2Gear,
        ])
        expect(parsed.settings.transcend.mainGear).toEqual(expected.mainGear)
        expect(parsed.settings.transcend.assist1Gear).toEqual(expected.assist1Gear)
        expect(parsed.settings.transcend.assist2Gear).toEqual(expected.assist2Gear)
        const shared = parsed.settings.transcend.mainGear[0] as TranscendEquippedGear
        expect(shared.item.socketCount).toBe(2)
        expect(shared.item.sockets).toHaveLength(2)
    })

    it("分享 JSON 往返保持词条数组顺序（含 craft 下标）", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [
            equipped(3, {
                affixes: [roll(1003), roll(101), roll(1006, { source: "tempering" }), roll(1001)],
                craft: { masterworkLevel: 0, temperingAffixIndex: 2, temperingCount: 1, enchantCount: 0 },
            }),
        ]
        const parsed = parseTranscendBuildShare(createTranscendBuildShare(settings))!
        const shared = parsed.settings.transcend.mainGear[0] as TranscendEquippedGear
        expect(shared.item.affixes.map(entry => entry.affixId)).toEqual([1003, 101, 1006, 1001])
        expect(shared.item.craft?.temperingAffixIndex).toBe(2)
    })
})

describe("数据自检", () => {
    it("宝石目录覆盖槽型 1-7，槽型 8-11 无孔位", () => {
        for (const slotType of [1, 2, 3, 4]) expect(getSlotMaxInlayCount(slotType)).toBe(2)
        for (const slotType of [5, 6, 7]) expect(getSlotMaxInlayCount(slotType)).toBe(1)
        for (const slotType of [8, 9, 10, 11]) expect(getSlotMaxInlayCount(slotType)).toBe(0)
        expect(inlays.length).toBeGreaterThan(0)
        expect(affixes.some(affix => affix.id === 3101)).toBe(true)
    })
})
