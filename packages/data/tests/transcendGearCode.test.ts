import { describe, expect, it } from "vitest"
import { createDefaultTranscendBuildSettings, createTranscendBuildShare, normalizeTranscendBuildSettings } from "../transcendBuild"
import type { TranscendGearGroup, TranscendGearItemConfig } from "../transcendGear"
import { normalizeGearItem, normalizeTranscendGearGroups } from "../transcendGear"
import {
    decodeTranscendGearCode,
    encodeTranscendGearCode,
    TRANSCEND_GEAR_CODE_PREFIX,
    TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX,
    TranscendGearCodeError,
} from "../transcendGearCode"
import { applyEnchant, applyTemper } from "../transcendGearCraft"

/** 头盔：品质 / 强度 / 名称 / 词条（含太古 + 终造） / 双孔 */
const helmet: TranscendGearItemConfig = {
    kind: "normal",
    slotType: 1,
    rarityId: 5,
    equipBaseScore: 50,
    iconId: 1001,
    nameId: 1002,
    seasonId: 1,
    affixes: [
        { affixId: 1001, rollLevel: 3, masterworkLevel: 2, ancient: true, finalMasterwork: true },
        { affixId: 102, rollLevel: 5, masterworkLevel: 10, ancient: false, finalMasterwork: false },
    ],
    sockets: [
        { socketIndex: 0, gemId: 7001101 },
        { socketIndex: 1, gemId: 7001102 },
    ],
    socketCount: 2,
}

/** 协战护符：暗金 + 专属词条 */
const amulet: TranscendGearItemConfig = {
    kind: "unique",
    slotType: 8,
    uniqueId: 1001,
    uniqueAffix: { affixId: 2001, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
    affixes: [{ affixId: 1501, rollLevel: 4, masterworkLevel: 1, ancient: false, finalMasterwork: false }],
}

const mainGroup = (): TranscendGearGroup => [{ slotId: 1, item: helmet }]
const assistGroup = (): TranscendGearGroup => [{ slotId: 9, item: amulet }]
const assist2Group = (): TranscendGearGroup => [{ slotId: 13, item: amulet }]

/** 手写位流（与编码器同格式）：用于构造编码器不会产出的畸形内容 */
class TestBitWriter {
    private readonly bytes: number[] = []
    private buffer = 0
    private bits = 0

    writeBits(value: number, count: number): void {
        for (let offset = count - 1; offset >= 0; offset -= 1) this.writeBit((value >> offset) & 1)
    }

    writeVarint(value: number): void {
        this.align()
        let rest = value
        while (rest >= 0x80) {
            this.bytes.push((rest & 0x7f) | 0x80)
            rest = Math.floor(rest / 0x80)
        }
        this.bytes.push(rest)
    }

    writeRawBytes(values: readonly number[]): void {
        this.align()
        this.bytes.push(...values)
    }

    finish(): Uint8Array {
        this.align()
        return Uint8Array.from(this.bytes)
    }

    private writeBit(bit: number): void {
        this.buffer = (this.buffer << 1) | bit
        this.bits += 1
        if (this.bits === 8) {
            this.bytes.push(this.buffer)
            this.buffer = 0
            this.bits = 0
        }
    }

    private align(): void {
        if (this.bits === 0) return
        this.bytes.push((this.buffer << (8 - this.bits)) & 0xff)
        this.buffer = 0
        this.bits = 0
    }
}

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

/** 无填充 base64url（与编码器一致） */
function toCode(bytes: Uint8Array): string {
    let text = ""
    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index]
        const second = index + 1 < bytes.length ? bytes[index + 1] : -1
        const third = index + 2 < bytes.length ? bytes[index + 2] : -1
        text += BASE64URL[first >> 2]
        text += BASE64URL[((first & 0x03) << 4) | (second >= 0 ? second >> 4 : 0)]
        if (second < 0) break
        text += BASE64URL[((second & 0x0f) << 2) | (third >= 0 ? third >> 6 : 0)]
        if (third < 0) break
        text += BASE64URL[third & 0x3f]
    }
    return `${TRANSCEND_GEAR_CODE_PREFIX}${text}`
}

interface RawRoll {
    affixId: number
    rollLevel?: number
    ancient?: boolean
}

interface RawCraft {
    /** 0 = 无最终精锻目标；其它为 0 基下标 + 1 */
    finalSlot?: number
    temperingSlot?: number
    enchantSlot?: number
    temperingCount?: number
    enchantCount?: number
}

interface RawSnapshot {
    /** 归一化后词条数组中的下标 */
    index: number
    roll: RawRoll
}

interface RawItem {
    unique?: boolean
    rarityIndex?: number
    equipBaseScore?: number
    iconId?: number | number[]
    uniqueId?: number
    uniqueAffix?: RawRoll
    affixes?: RawRoll[]
    masterworkLevel?: number
    craft?: RawCraft
    snapshot?: RawSnapshot
    socketCount?: number
    sockets?: { socketIndex: number; gemId: number }[]
}

/** 写一条词条 roll（同编码器：id / 档位 varint + 太古 1 位） */
function writeRawRoll(writer: TestBitWriter, roll: RawRoll): void {
    writer.writeVarint(roll.affixId)
    writer.writeVarint(roll.rollLevel ?? 1)
    writer.writeBits(roll.ancient ? 1 : 0, 1)
}

/** 写一件物品（同编码器）；`withSnapshot` 为真时在 craft 次数后写快照段（`TG4_`） */
function writeRawItem(writer: TestBitWriter, item: RawItem, withSnapshot = false): void {
    writer.writeBits(item.unique ? 1 : 0, 1)
    writer.writeBits(item.rarityIndex ?? 0, 3)
    writer.writeBits(item.equipBaseScore ?? 0, 6)
    if (Array.isArray(item.iconId)) writer.writeRawBytes(item.iconId)
    else writer.writeVarint(item.iconId ?? 0)
    writer.writeVarint(0)
    writer.writeVarint(0)
    writer.writeVarint(item.uniqueId ?? 0)
    writer.writeBits(item.uniqueAffix ? 1 : 0, 1)
    if (item.uniqueAffix) writeRawRoll(writer, item.uniqueAffix)
    const affixes = item.affixes ?? []
    writer.writeBits(affixes.length, 3)
    writer.writeBits(item.masterworkLevel ?? 0, 4)
    writer.writeBits(item.craft?.finalSlot ?? 0, 3)
    writer.writeBits(item.craft?.temperingSlot ?? 0, 3)
    writer.writeBits(item.craft?.enchantSlot ?? 0, 3)
    writer.writeVarint(item.craft?.temperingCount ?? 0)
    writer.writeVarint(item.craft?.enchantCount ?? 0)
    if (withSnapshot) {
        writer.writeBits(item.snapshot ? 1 : 0, 1)
        if (item.snapshot) {
            writer.writeBits(item.snapshot.index, 3)
            writeRawRoll(writer, item.snapshot.roll)
        }
    }
    for (const roll of affixes) writeRawRoll(writer, roll)
    const sockets = item.sockets ?? []
    writer.writeBits(item.socketCount ?? 0, 5)
    writer.writeBits(sockets.length, 4)
    for (const socket of sockets) {
        writer.writeBits(socket.socketIndex, 2)
        writer.writeVarint(socket.gemId)
    }
}

/** 按槽位 1-8 / 9-12 / 13-16 顺序写一份装备码（同编码器布局） */
function craftCode(entries: { slotId: number; item: RawItem }[]): string {
    return writeGroupCode(entries, false)
}

/** 按 `TG4_` 布局（物品块含附魔快照段）写一份装备码：用于构造快照畸形内容 */
function craftSnapshotCode(entries: { slotId: number; item: RawItem }[]): string {
    return writeGroupCode(entries, true)
}

function writeGroupCode(entries: { slotId: number; item: RawItem }[], withSnapshot: boolean): string {
    const bySlot = new Map(entries.map(entry => [entry.slotId, entry.item]))
    const writer = new TestBitWriter()
    const slotIds = [...Array.from({ length: 8 }, (_, index) => index + 1), ...Array.from({ length: 8 }, (_, index) => index + 9)]
    for (const slotId of slotIds) {
        const item = bySlot.get(slotId)
        writer.writeBits(item ? 1 : 0, 1)
        if (item) writeRawItem(writer, item, withSnapshot)
    }
    const body = toCode(writer.finish()).slice(TRANSCEND_GEAR_CODE_PREFIX.length)
    return `${withSnapshot ? TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX : TRANSCEND_GEAR_CODE_PREFIX}${body}`
}

/** 按 post-U32b 旧布局（12 槽）写一份 `TG2_` 装备码：用于兼容解码测试 */
function craftLegacyCode(entries: { slotId: number; item: RawItem }[]): string {
    const bySlot = new Map(entries.map(entry => [entry.slotId, entry.item]))
    const writer = new TestBitWriter()
    for (const slotId of [...Array.from({ length: 8 }, (_, index) => index + 1), 9, 10, 11, 12]) {
        const item = bySlot.get(slotId)
        writer.writeBits(item ? 1 : 0, 1)
        if (item) writeRawItem(writer, item)
    }
    return `TG2_${toCode(writer.finish()).slice(TRANSCEND_GEAR_CODE_PREFIX.length)}`
}

/** 断言抛错的类别（可接受多个合法类别） */
function expectCodeError(
    fn: () => unknown,
    codes: "format" | "truncated" | "invalid" | readonly ("format" | "truncated" | "invalid")[]
): void {
    let captured: unknown = null
    try {
        fn()
    } catch (error) {
        captured = error
    }
    expect(captured).toBeInstanceOf(TranscendGearCodeError)
    const allowed = Array.isArray(codes) ? codes : [codes]
    expect(allowed).toContain((captured as TranscendGearCodeError).code)
}

describe("装备短码", () => {
    it("往返一致，且等于同口径归一化结果", () => {
        const code = encodeTranscendGearCode(mainGroup(), assistGroup(), assist2Group())
        expect(code.startsWith(TRANSCEND_GEAR_CODE_PREFIX)).toBe(true)
        const decoded = decodeTranscendGearCode(code)
        const expected = normalizeTranscendGearGroups([mainGroup(), assistGroup(), assist2Group()])
        expect(decoded).toEqual(expected)
        expect(encodeTranscendGearCode(decoded.mainGear, decoded.assist1Gear, decoded.assist2Gear)).toBe(code)
    })

    it("只包含三组装备，不含角色 / 天赋 / 环境字段", () => {
        const decoded = decodeTranscendGearCode(encodeTranscendGearCode(mainGroup(), assistGroup(), assist2Group()))
        expect(Object.keys(decoded).sort()).toEqual(["assist1Gear", "assist2Gear", "mainGear"])
        expect(decoded).not.toHaveProperty("transcend")
        expect(decoded).not.toHaveProperty("settings")
        expect(decoded).not.toHaveProperty("charId")
    })

    it("淬炼与随机词条同 id 可往返：craft 下标指向淬炼行，随机同 id 重复仍非法", () => {
        const twin: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 1,
            affixes: [
                { affixId: 1001, rollLevel: 3, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
                { affixId: 1001, rollLevel: 420, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "tempering" },
            ],
            craft: { masterworkLevel: 0, temperingAffixIndex: 1, temperingCount: 1, enchantCount: 0 },
        }
        const code = encodeTranscendGearCode([{ slotId: 1, item: twin }], [])
        const decoded = decodeTranscendGearCode(code)
        const item = (decoded.mainGear[0] as { item: TranscendGearItemConfig }).item
        expect(item.affixes.map(roll => [roll.affixId, roll.source, roll.rollLevel])).toEqual([
            [1001, "random", 3],
            [1001, "tempering", 420],
        ])
        expect(item.craft?.temperingAffixIndex).toBe(1)
        expect(encodeTranscendGearCode(decoded.mainGear, decoded.assist1Gear, decoded.assist2Gear)).toBe(code)

        // 没有淬炼行时，两条同 id 随机词条仍是畸形码
        const duplicate = craftCode([{ slotId: 1, item: { affixes: [{ affixId: 1001 }, { affixId: 1001 }] } }])
        expectCodeError(() => decodeTranscendGearCode(duplicate), "invalid")
    })

    it("确定性：词条顺序保留、孔位顺序无关，空装备也能往返", () => {
        const reordered: TranscendGearItemConfig = {
            ...helmet,
            affixes: [...helmet.affixes].reverse(),
            sockets: [...(helmet.sockets ?? [])].reverse(),
        }
        // 词条顺序属于物品语义（craft 下标按数组位置），编码不得重排成 affixId 顺序
        expect(encodeTranscendGearCode([{ slotId: 1, item: reordered }], assistGroup(), assist2Group())).not.toBe(
            encodeTranscendGearCode(mainGroup(), assistGroup(), assist2Group())
        )
        const roundtrip = decodeTranscendGearCode(encodeTranscendGearCode([{ slotId: 1, item: reordered }], []))
        expect((roundtrip.mainGear[0] as { item: TranscendGearItemConfig }).item.affixes.map(roll => roll.affixId)).toEqual(
            [...helmet.affixes].reverse().map(roll => roll.affixId)
        )
        // 孔位按 socketIndex 归一化，纯展示顺序不影响编码
        const socketSwapped: TranscendGearItemConfig = { ...helmet, sockets: [...(helmet.sockets ?? [])].reverse() }
        expect(encodeTranscendGearCode([{ slotId: 1, item: socketSwapped }], assistGroup(), assist2Group())).toBe(
            encodeTranscendGearCode(mainGroup(), assistGroup(), assist2Group())
        )
        const empty = decodeTranscendGearCode(encodeTranscendGearCode([], []))
        expect(empty).toEqual({ mainGear: [], assist1Gear: [], assist2Gear: [] })
    })

    it("短码自身往返保留未知词条，但进入构筑后被严格归一化丢弃（codec 往返 ≠ 构筑端到端保留）", () => {
        const unknown: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 2,
            affixes: [{ affixId: 999999, rollLevel: 7, masterworkLevel: 3, ancient: false, finalMasterwork: false }],
        }
        const decoded = decodeTranscendGearCode(encodeTranscendGearCode([{ slotId: 2, item: unknown }], []))
        const entry = decoded.mainGear[0] as { item: TranscendGearItemConfig }
        expect(entry.item.affixes[0]).toMatchObject({ affixId: 999999, rollLevel: 7, masterworkLevel: 3 })

        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = decoded.mainGear
        settings.transcend.gearVariants = [
            { id: "A", mainGear: decoded.mainGear, assist1Gear: decoded.assist1Gear, assist2Gear: decoded.assist2Gear },
        ]
        const built = normalizeTranscendBuildSettings(settings, undefined, { preserveUnknownIds: true })
        expect(built.transcend.mainGear).toHaveLength(1)
        expect((built.transcend.mainGear[0] as { item: TranscendGearItemConfig }).item.affixes).toEqual([])
    })

    it("仅开孔未镶嵌的装备可往返（socketCount 有值、sockets 为空）", () => {
        const opened: TranscendGearItemConfig = { kind: "normal", slotType: 1, affixes: [], socketCount: 2 }
        const decoded = decodeTranscendGearCode(encodeTranscendGearCode([{ slotId: 1, item: opened }], []))
        const entry = decoded.mainGear[0] as { item: TranscendGearItemConfig }
        expect(entry.item.socketCount).toBe(2)
        expect(entry.item.sockets).toBeUndefined()
        expect(encodeTranscendGearCode(decoded.mainGear, decoded.assist1Gear, decoded.assist2Gear)).toBe(
            encodeTranscendGearCode([{ slotId: 1, item: opened }], [])
        )
    })

    it("5 条非基础词条 / 重复孔位 / 超上限已开孔数严格报 invalid", () => {
        const fiveRandom = craftCode([
            {
                slotId: 1,
                item: { affixes: [1001, 1002, 1003, 1004, 1005].map(affixId => ({ affixId })) },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(fiveRandom), "invalid")

        const duplicateSocket = craftCode([
            {
                slotId: 1,
                item: {
                    socketCount: 2,
                    sockets: [
                        { socketIndex: 0, gemId: 7001101 },
                        { socketIndex: 0, gemId: 7001102 },
                    ],
                },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(duplicateSocket), "invalid")

        const tooManySockets = craftCode([{ slotId: 1, item: { socketCount: 3 } }])
        expectCodeError(() => decodeTranscendGearCode(tooManySockets), "invalid")

        const assistSocket = craftCode([{ slotId: 9, item: { socketCount: 1 } }])
        expectCodeError(() => decodeTranscendGearCode(assistSocket), "invalid")
    })

    it("超长 varint / 超出安全整数严格报 invalid", () => {
        const nineBytes = craftCode([{ slotId: 1, item: { iconId: [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01] } }])
        expectCodeError(() => decodeTranscendGearCode(nineBytes), "invalid")

        const unsafe = craftCode([{ slotId: 1, item: { iconId: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f] } }])
        expectCodeError(() => decodeTranscendGearCode(unsafe), "invalid")
    })

    it("尾部多 1 个字符 / 非规范尾部 / 非法填充严格报错", () => {
        const code = encodeTranscendGearCode(mainGroup(), assistGroup())
        expectCodeError(() => decodeTranscendGearCode(`${code}A`), ["truncated", "invalid"])
        expectCodeError(() => decodeTranscendGearCode(`${code}===`), "format")
        // 末尾字符的低位（对齐填充位）必须为 0：翻转最低位构造非规范尾部
        const body = code.slice(TRANSCEND_GEAR_CODE_PREFIX.length)
        if (body.length % 4 === 2 || body.length % 4 === 3) {
            const last = body.at(-1)!
            const nonCanonical = `${code.slice(0, -1)}${BASE64URL[BASE64URL.indexOf(last) ^ 1]}`
            expectCodeError(() => decodeTranscendGearCode(nonCanonical), "invalid")
        }
    })

    it("编码侧同样拒绝不可编码条目（null / 非法装备位 / 槽型不一致 / 重复槽位）", () => {
        expectCodeError(() => encodeTranscendGearCode([null] as unknown as TranscendGearGroup, []), "invalid")
        expectCodeError(() => encodeTranscendGearCode([{ slotId: 13, item: helmet }] as TranscendGearGroup, []), "invalid")
        expectCodeError(() => encodeTranscendGearCode([{ slotId: 2, item: helmet }], []), "invalid")
        expectCodeError(
            () =>
                encodeTranscendGearCode(
                    [
                        { slotId: 1, item: helmet },
                        { slotId: 1, item: helmet },
                    ],
                    []
                ),
            "invalid"
        )
        expectCodeError(() => encodeTranscendGearCode([{ item: helmet }] as unknown as TranscendGearGroup, []), "invalid")
    })

    it("允许夹杂空白；错误前缀 / 非法字符 / 截断 / 多余数据都报错", () => {
        const code = encodeTranscendGearCode(mainGroup(), assistGroup())
        const wrapped = `${code.slice(0, 12)}\n${code.slice(12)}  `
        expect(decodeTranscendGearCode(wrapped)).toEqual(decodeTranscendGearCode(code))

        expect(() => decodeTranscendGearCode("")).toThrow(TranscendGearCodeError)
        expect(() => decodeTranscendGearCode("XX123")).toThrow(TranscendGearCodeError)
        expect(() => decodeTranscendGearCode(`${TRANSCEND_GEAR_CODE_PREFIX}!!!`)).toThrow(TranscendGearCodeError)
        expect(() => decodeTranscendGearCode(code.slice(0, Math.floor(code.length / 2)))).toThrow(TranscendGearCodeError)
        expect(() => decodeTranscendGearCode(`${code}AAAA`)).toThrow(TranscendGearCodeError)
    })

    it("v1 平铺词条无法导出时明确报错", () => {
        const legacy = [{ slotId: 3, affixId: 101, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }]
        expect(() => encodeTranscendGearCode(legacy, [])).toThrow(TranscendGearCodeError)
    })

    it("长度显著短于完整构筑 JSON", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = mainGroup()
        settings.transcend.assist1Gear = assistGroup()
        settings.transcend.assist2Gear = assist2Group()
        const full = createTranscendBuildShare(settings)
        const short = encodeTranscendGearCode(mainGroup(), assistGroup(), assist2Group())
        expect(short.length).toBeLessThan(full.length / 4)
    })

    it("craft 状态往返：精锻 10 / 最终目标 / 淬炼 / 附魔 / 次数", () => {
        const crafted: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 3,
            rarityId: 5,
            equipBaseScore: 50,
            affixes: [
                { affixId: 101, rollLevel: 50, masterworkLevel: 10, ancient: false, finalMasterwork: false, source: "base" },
                { affixId: 1002, rollLevel: 100, masterworkLevel: 10, ancient: true, finalMasterwork: true, source: "random" },
                { affixId: 1006, rollLevel: 10, masterworkLevel: 10, ancient: false, finalMasterwork: false, source: "tempering" },
                { affixId: 1024, rollLevel: 20, masterworkLevel: 10, ancient: false, finalMasterwork: false, source: "enchant" },
            ],
            craft: {
                masterworkLevel: 10,
                finalMasterworkAffixIndex: 1,
                temperingAffixIndex: 2,
                temperingCount: 2,
                enchantAffixIndex: 3,
                enchantCount: 3,
            },
        }
        const group: TranscendGearGroup = [{ slotId: 3, item: crafted }]
        const code = encodeTranscendGearCode(group, [])
        const decoded = decodeTranscendGearCode(code)
        const expected = normalizeTranscendGearGroups([group, []])
        expect(decoded).toEqual(expected)
        const item = (decoded.mainGear[0] as { item: TranscendGearItemConfig }).item
        expect(item.craft).toEqual({
            masterworkLevel: 10,
            finalMasterworkAffixIndex: 1,
            temperingAffixIndex: 2,
            temperingCount: 2,
            enchantAffixIndex: 3,
            enchantCount: 3,
        })
        expect(item.affixes.map(roll => roll.source)).toEqual(["base", "random", "tempering", "enchant"])
        expect(encodeTranscendGearCode(decoded.mainGear, decoded.assist1Gear, decoded.assist2Gear)).toBe(code)

        // 词条顺序是物品语义：编码不重排，往返后数组与 craft 下标保持不变
        const reorderedAffixes = [...crafted.affixes].reverse()
        const indexOfId = (affixId: number): number => reorderedAffixes.findIndex(roll => roll.affixId === affixId)
        const reordered = {
            ...crafted,
            affixes: reorderedAffixes,
            craft: {
                ...crafted.craft!,
                finalMasterworkAffixIndex: indexOfId(1002),
                temperingAffixIndex: indexOfId(1006),
                enchantAffixIndex: indexOfId(1024),
            },
        }
        const reorderedDecoded = decodeTranscendGearCode(encodeTranscendGearCode([{ slotId: 3, item: reordered }], []))
        const reorderedItem = (reorderedDecoded.mainGear[0] as { item: TranscendGearItemConfig }).item
        expect(reorderedItem.affixes.map(roll => roll.affixId)).toEqual(reorderedAffixes.map(roll => roll.affixId))
        expect(reorderedItem.craft).toEqual(reordered.craft)
    })

    it("craft 非法：未满级最终 / 下标越界 / 目标无公式 / 7 条词条均报 invalid", () => {
        const finalWithoutMax = craftCode([
            {
                slotId: 3,
                item: { masterworkLevel: 9, craft: { finalSlot: 1 }, affixes: [{ affixId: 1001 }] },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(finalWithoutMax), "invalid")

        const finalOutOfRange = craftCode([
            {
                slotId: 3,
                item: { masterworkLevel: 10, craft: { finalSlot: 3 }, affixes: [{ affixId: 1001 }] },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(finalOutOfRange), "invalid")

        const baseTarget = craftCode([
            {
                slotId: 3,
                item: { masterworkLevel: 10, craft: { finalSlot: 1 }, affixes: [{ affixId: 101 }] },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(baseTarget), "invalid")

        const temperingOutOfRange = craftCode([
            {
                slotId: 3,
                item: { craft: { temperingSlot: 2 }, affixes: [{ affixId: 1001 }] },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(temperingOutOfRange), "invalid")

        // 7 条词条（1 基础 + 5 随机 + 1 淬炼）超出随机词条上限
        const seven = craftCode([
            {
                slotId: 3,
                item: {
                    affixes: [101, 1001, 1002, 1003, 1004, 1005, 1006].map(affixId => ({ affixId })),
                    craft: { temperingSlot: 6 },
                },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(seven), "invalid")

        // 6 条合法（1 基础 + 4 随机 + 1 淬炼）
        const six = craftCode([
            {
                slotId: 3,
                item: {
                    affixes: [101, 1001, 1002, 1003, 1004, 1006].map(affixId => ({ affixId })),
                    craft: { temperingSlot: 6 },
                },
            },
        ])
        expect(decodeTranscendGearCode(six).mainGear).toHaveLength(1)
    })

    it("旧版 TG1_ 前缀明确拒绝；TG2_ 兼容解码为协战一、协战二为空", () => {
        const code = encodeTranscendGearCode(mainGroup(), assistGroup())
        expect(code.startsWith("TG3_")).toBe(true)
        expectCodeError(() => decodeTranscendGearCode(`TG1_${code.slice(TRANSCEND_GEAR_CODE_PREFIX.length)}`), "format")

        const legacy = decodeTranscendGearCode(
            craftLegacyCode([
                {
                    slotId: 9,
                    item: { unique: true, uniqueId: 1001, uniqueAffix: { affixId: 2001 }, affixes: [{ affixId: 1501, rollLevel: 4 }] },
                },
            ])
        )
        expect(legacy.mainGear).toEqual([])
        expect(legacy.assist1Gear.map(entry => entry.slotId)).toEqual([9])
        expect(legacy.assist2Gear).toEqual([])
        expect(encodeTranscendGearCode(legacy.mainGear, legacy.assist1Gear, legacy.assist2Gear)).toMatch(/^TG3_/)
    })

    it("编码侧按组校验槽位：错组槽位报 invalid", () => {
        expectCodeError(() => encodeTranscendGearCode([{ slotId: 9, item: amulet }], []), "invalid")
        expectCodeError(() => encodeTranscendGearCode([], [{ slotId: 1, item: helmet }]), "invalid")
        expectCodeError(() => encodeTranscendGearCode([], [], [{ slotId: 9, item: amulet }]), "invalid")
        expectCodeError(() => encodeTranscendGearCode([{ slotId: 13, item: amulet }], []), "invalid")
        expectCodeError(() => encodeTranscendGearCode([], [{ slotId: 16, item: amulet }]), "invalid")
    })

    it("编码侧拒绝会被归一化裁剪的词条 / 孔位与非法 craft 状态", () => {
        const sixRandom = [101, 1001, 1002, 1003, 1004, 1005].map(affixId => ({
            affixId,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        }))
        expectCodeError(
            () => encodeTranscendGearCode([{ slotId: 3, item: { kind: "normal", slotType: 3, affixes: sixRandom } }], []),
            "invalid"
        )
        expectCodeError(
            () =>
                encodeTranscendGearCode(
                    [
                        {
                            slotId: 1,
                            item: {
                                kind: "normal",
                                slotType: 1,
                                affixes: [],
                                sockets: [
                                    { socketIndex: 0, gemId: 7001101 },
                                    { socketIndex: 1, gemId: 7001102 },
                                    { socketIndex: 2, gemId: 7001103 },
                                ],
                            },
                        },
                    ],
                    []
                ),
            "invalid"
        )
        // craft 目标下标越界 / 未满级最终目标 / 精锻超上限：都不得被静默修正后编码
        const itemWithCraft = (craft: Record<string, unknown>) => ({
            kind: "normal" as const,
            slotType: 3,
            affixes: [{ affixId: 1001, rollLevel: 1, masterworkLevel: 10, ancient: false, finalMasterwork: false }],
            craft: craft as never,
        })
        expectCodeError(
            () =>
                encodeTranscendGearCode(
                    [
                        {
                            slotId: 3,
                            item: itemWithCraft({ masterworkLevel: 10, finalMasterworkAffixIndex: 9, temperingCount: 0, enchantCount: 0 }),
                        },
                    ],
                    []
                ),
            "invalid"
        )
        expectCodeError(
            () =>
                encodeTranscendGearCode(
                    [
                        {
                            slotId: 3,
                            item: itemWithCraft({ masterworkLevel: 5, finalMasterworkAffixIndex: 0, temperingCount: 0, enchantCount: 0 }),
                        },
                    ],
                    []
                ),
            "invalid"
        )
        expectCodeError(
            () =>
                encodeTranscendGearCode(
                    [{ slotId: 3, item: itemWithCraft({ masterworkLevel: 99, temperingCount: 0, enchantCount: 0 }) }],
                    []
                ),
            "invalid"
        )
    })

    it("解码严格核对：无目标槽的次数 / 基础太古位 / 专属档位与太古 / 词条档位被裁剪", () => {
        const countWithoutSlot = craftCode([{ slotId: 3, item: { affixes: [{ affixId: 101 }], craft: { temperingCount: 2 } } }])
        expectCodeError(() => decodeTranscendGearCode(countWithoutSlot), "invalid")

        const baseAncient = craftCode([{ slotId: 3, item: { affixes: [{ affixId: 101, ancient: true }] } }])
        expectCodeError(() => decodeTranscendGearCode(baseAncient), "invalid")

        const uniqueRoll = craftCode([
            {
                slotId: 9,
                item: { unique: true, uniqueId: 1001, uniqueAffix: { affixId: 2001, rollLevel: 5, ancient: true } },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(uniqueRoll), "invalid")

        const clampedRoll = craftCode([{ slotId: 3, item: { affixes: [{ affixId: 101, rollLevel: 999 }] } }])
        expectCodeError(() => decodeTranscendGearCode(clampedRoll), "invalid")
    })

    it("池外淬炼当前不校验池（spec gap）：往返保留词条与下标", () => {
        // 1002 属于池 202；槽型 3 的淬炼池为 201/203/205。归一化不校验池，仅 apply 层拒绝。
        const code = craftCode([
            {
                slotId: 3,
                item: {
                    affixes: [{ affixId: 1002 }],
                    craft: { temperingSlot: 1, temperingCount: 1 },
                },
            },
        ])
        const decoded = decodeTranscendGearCode(code)
        const item = (decoded.mainGear[0] as { item: TranscendGearItemConfig }).item
        expect(item.craft?.temperingAffixIndex).toBe(0)
        expect(item.affixes[0].source).toBe("tempering")
    })

    it("count>0 无目标：编码器拒绝原始状态，归一化后往返不再产出不可解码码", () => {
        const raw = {
            kind: "normal" as const,
            slotType: 3,
            affixes: [{ affixId: 1001, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
            craft: { masterworkLevel: 0, temperingCount: 2, enchantCount: 1 },
        }
        expectCodeError(() => encodeTranscendGearCode([{ slotId: 3, item: raw as never }], []), "invalid")

        // 归一化统一不变量：目标缺失时次数清零，因此归一化后的物品可编码并可解码
        const normalized = normalizeGearItem(raw as never, undefined, { preserveUnknown: true })!
        expect(normalized.craft).toEqual({ masterworkLevel: 0, temperingCount: 0, enchantCount: 0 })
        const code = encodeTranscendGearCode([{ slotId: 3, item: normalized }], [])
        const decoded = decodeTranscendGearCode(code)
        expect(decoded).toEqual(normalizeTranscendGearGroups([[{ slotId: 3, item: normalized }], []]))
        expect((decoded.mainGear[0] as { item: TranscendGearItemConfig }).item.craft).toEqual({
            masterworkLevel: 0,
            temperingCount: 0,
            enchantCount: 0,
        })
    })

    it("解码：enchantCount>0 但无附魔槽严格报 invalid", () => {
        const enchantWithoutSlot = craftCode([{ slotId: 3, item: { affixes: [{ affixId: 1001 }], craft: { enchantCount: 2 } } }])
        expectCodeError(() => decodeTranscendGearCode(enchantWithoutSlot), "invalid")
    })

    it("编码：craft 索引显式 null 视同缺省，不误判为归一化修正", () => {
        const itemWithNullCraft = {
            kind: "normal" as const,
            slotType: 3,
            affixes: [{ affixId: 1001, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
            craft: {
                masterworkLevel: 0,
                finalMasterworkAffixIndex: null,
                temperingAffixIndex: null,
                enchantAffixIndex: null,
                temperingCount: 0,
                enchantCount: 0,
            },
        }
        const code = encodeTranscendGearCode([{ slotId: 3, item: itemWithNullCraft as never }], [])
        const decoded = decodeTranscendGearCode(code)
        expect((decoded.mainGear[0] as { item: TranscendGearItemConfig }).item.craft).toEqual({
            masterworkLevel: 0,
            temperingCount: 0,
            enchantCount: 0,
        })
    })

    it("编码：item 为 null / 非对象时报类型化 invalid（不是原生 TypeError）", () => {
        expectCodeError(() => encodeTranscendGearCode([{ slotId: 1, item: null }] as unknown as TranscendGearGroup, []), "invalid")
        expectCodeError(() => encodeTranscendGearCode([{ slotId: 1, item: "bad" }] as unknown as TranscendGearGroup, []), "invalid")
    })

    it("解码：专属档位单独校验（ancient=false 也不能非 1）", () => {
        const uniqueBadRoll = craftCode([
            {
                slotId: 9,
                item: { unique: true, uniqueId: 1001, uniqueAffix: { affixId: 2001, rollLevel: 5, ancient: false } },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(uniqueBadRoll), "invalid")

        // 档位合法但 ancient 位为 1：同样被专属固定值口径拒绝
        const uniqueAncient = craftCode([
            {
                slotId: 9,
                item: { unique: true, uniqueId: 1001, uniqueAffix: { affixId: 2001, rollLevel: 1, ancient: true } },
            },
        ])
        expectCodeError(() => decodeTranscendGearCode(uniqueAncient), "invalid")
    })

    it("编码侧拒绝非安全整数 varint（iconId / 未知词条 / 宝石 id）", () => {
        const groupAtSlot3 = (patch: Partial<TranscendGearItemConfig>): TranscendGearGroup => [
            { slotId: 3, item: { kind: "normal", slotType: 3, affixes: [], ...patch } as TranscendGearItemConfig },
        ]
        expectCodeError(() => encodeTranscendGearCode(groupAtSlot3({ iconId: 2 ** 53 }), []), "invalid")
        expectCodeError(() => encodeTranscendGearCode(groupAtSlot3({ seasonId: 2 ** 53 }), []), "invalid")
        expectCodeError(
            () =>
                encodeTranscendGearCode(
                    groupAtSlot3({
                        affixes: [{ affixId: 2 ** 53, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
                    }),
                    []
                ),
            "invalid"
        )
        expectCodeError(
            () =>
                encodeTranscendGearCode(
                    groupAtSlot3({
                        affixes: [{ affixId: 999999, rollLevel: 2 ** 53, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
                    }),
                    []
                ),
            "invalid"
        )
        expectCodeError(
            () => encodeTranscendGearCode(groupAtSlot3({ socketCount: 1, sockets: [{ socketIndex: 0, gemId: 2 ** 53 }] }), []),
            "invalid"
        )
    })

    it("安全整数边界（大于 32 位的 varint）可往返", () => {
        const large: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 3,
            iconId: 2 ** 40,
            nameId: 2 ** 40 + 1,
            seasonId: 2 ** 40 + 2,
            affixes: [{ affixId: 2 ** 40 + 3, rollLevel: 2 ** 40 + 4, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
            socketCount: 1,
            sockets: [{ socketIndex: 0, gemId: 2 ** 40 + 5 }],
        }
        const code = encodeTranscendGearCode([{ slotId: 3, item: large }], [])
        const decoded = decodeTranscendGearCode(code)
        const entry = decoded.mainGear[0] as { item: TranscendGearItemConfig }
        expect(entry.item.iconId).toBe(2 ** 40)
        expect(entry.item.nameId).toBe(2 ** 40 + 1)
        expect(entry.item.seasonId).toBe(2 ** 40 + 2)
        expect(entry.item.affixes[0]).toMatchObject({ affixId: 2 ** 40 + 3, rollLevel: 2 ** 40 + 4 })
        expect(entry.item.sockets).toEqual([{ socketIndex: 0, gemId: 2 ** 40 + 5 }])
        expect(encodeTranscendGearCode(decoded.mainGear, decoded.assist1Gear, decoded.assist2Gear)).toBe(code)
    })
})

describe("附魔快照短码与持久化", () => {
    /** 金色手套 + 淬炼 1006 + 附魔 1024：快照保存被替换的 1001 */
    const enchantedGlove = (): TranscendGearItemConfig => {
        const base: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 3,
            rarityId: 5,
            equipBaseScore: 50,
            affixes: [101, 1001].map(affixId => ({ affixId, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false })),
        }
        return applyEnchant(applyTemper(base, { affixId: 1006 }), 1, { affixId: 1024, rollLevel: 5 })
    }

    it("含快照输出 TG4_ 并完整往返；无快照仍是 TG3_", () => {
        const item = enchantedGlove()
        expect(item.craft?.enchantSnapshot).toBeDefined()
        const code = encodeTranscendGearCode([{ slotId: 3, item }], [])
        expect(code.startsWith(TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX)).toBe(true)
        const decoded = decodeTranscendGearCode(code)
        expect(decoded).toEqual(normalizeTranscendGearGroups([[{ slotId: 3, item }], []]))
        const entry = decoded.mainGear[0] as { item: TranscendGearItemConfig }
        expect(entry.item.craft?.enchantSnapshot).toEqual(item.craft?.enchantSnapshot)
        expect(encodeTranscendGearCode(decoded.mainGear, decoded.assist1Gear, decoded.assist2Gear)).toBe(code)

        const plain = applyTemper(
            {
                kind: "normal",
                slotType: 3,
                rarityId: 5,
                affixes: [101, 1001].map(affixId => ({
                    affixId,
                    rollLevel: 1,
                    masterworkLevel: 0,
                    ancient: false,
                    finalMasterwork: false,
                })),
            },
            { affixId: 1006 }
        )
        const plainCode = encodeTranscendGearCode([{ slotId: 3, item: plain }], [])
        expect(plainCode.startsWith(TRANSCEND_GEAR_CODE_PREFIX)).toBe(true)
        expect(
            (decodeTranscendGearCode(plainCode).mainGear[0] as { item: TranscendGearItemConfig }).item.craft?.enchantSnapshot
        ).toBeUndefined()
    })

    it("快照畸形码严格报 invalid（越界 / 无附魔槽 / 词条重复 / 档位被归一化修正）", () => {
        const affixes = [{ affixId: 101 }, { affixId: 1006 }, { affixId: 1024 }]
        const craft = { temperingSlot: 2, enchantSlot: 3, temperingCount: 1, enchantCount: 1 }
        const valid = craftSnapshotCode([{ slotId: 3, item: { affixes, craft, snapshot: { index: 1, roll: { affixId: 1001 } } } }])
        const decoded = decodeTranscendGearCode(valid)
        const entry = decoded.mainGear[0] as { item: TranscendGearItemConfig }
        expect(entry.item.craft?.enchantSnapshot).toEqual({
            affixIndex: 1,
            roll: { affixId: 1001, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
        })

        expectCodeError(
            () =>
                decodeTranscendGearCode(
                    craftSnapshotCode([{ slotId: 3, item: { affixes, craft, snapshot: { index: 4, roll: { affixId: 1001 } } } }])
                ),
            "invalid"
        )
        expectCodeError(
            () =>
                decodeTranscendGearCode(
                    craftSnapshotCode([
                        {
                            slotId: 3,
                            item: { affixes, craft: { ...craft, enchantSlot: 0 }, snapshot: { index: 1, roll: { affixId: 1001 } } },
                        },
                    ])
                ),
            "invalid"
        )
        expectCodeError(
            () =>
                decodeTranscendGearCode(
                    craftSnapshotCode([{ slotId: 3, item: { affixes, craft, snapshot: { index: 2, roll: { affixId: 1024 } } } }])
                ),
            "invalid"
        )
        expectCodeError(
            () =>
                decodeTranscendGearCode(
                    craftSnapshotCode([
                        { slotId: 3, item: { affixes, craft, snapshot: { index: 1, roll: { affixId: 1001, rollLevel: 999 } } } },
                    ])
                ),
            "invalid"
        )
    })

    it("构筑设置 JSON 往返保留快照（含二次归一化幂等）", () => {
        const item = enchantedGlove()
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [{ slotId: 3, item }]
        const restored = normalizeTranscendBuildSettings(JSON.parse(JSON.stringify(settings)), undefined, { preserveUnknownIds: true })
        const entry = restored.transcend.mainGear[0] as { item: TranscendGearItemConfig }
        expect(entry.item.craft?.enchantSnapshot).toEqual(item.craft?.enchantSnapshot)

        const twice = normalizeTranscendBuildSettings(JSON.parse(JSON.stringify(restored)), undefined, { preserveUnknownIds: true })
        expect((twice.transcend.mainGear[0] as { item: TranscendGearItemConfig }).item.craft?.enchantSnapshot).toEqual(
            item.craft?.enchantSnapshot
        )
    })
})

describe("短码字节冻结（golden）", () => {
    /** 无快照：精锻 10 + 最终 / 淬炼 / 附魔目标 + 次数 */
    const frozenCrafted: TranscendGearItemConfig = {
        kind: "normal",
        slotType: 3,
        rarityId: 5,
        equipBaseScore: 50,
        affixes: [
            { affixId: 101, rollLevel: 50, masterworkLevel: 10, ancient: false, finalMasterwork: false, source: "base" },
            { affixId: 1002, rollLevel: 100, masterworkLevel: 10, ancient: true, finalMasterwork: true, source: "random" },
            { affixId: 1006, rollLevel: 10, masterworkLevel: 10, ancient: false, finalMasterwork: false, source: "tempering" },
            { affixId: 1024, rollLevel: 20, masterworkLevel: 10, ancient: false, finalMasterwork: false, source: "enchant" },
        ],
        craft: {
            masterworkLevel: 10,
            finalMasterworkAffixIndex: 1,
            temperingAffixIndex: 2,
            temperingCount: 2,
            enchantAffixIndex: 3,
            enchantCount: 3,
        },
    }

    /** 含快照：快照档位 7 + 太古，验证 TG4 布局不漂移 */
    const frozenEnchanted: TranscendGearItemConfig = {
        kind: "normal",
        slotType: 3,
        rarityId: 5,
        equipBaseScore: 50,
        affixes: [
            { affixId: 101, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "base" },
            { affixId: 1006, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "tempering" },
            { affixId: 1024, rollLevel: 5, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "enchant" },
        ],
        craft: {
            masterworkLevel: 0,
            temperingAffixIndex: 1,
            temperingCount: 1,
            enchantAffixIndex: 2,
            enchantCount: 1,
            enchantSnapshot: {
                affixIndex: 1,
                roll: { affixId: 1001, rollLevel: 7, masterworkLevel: 0, ancient: true, finalMasterwork: false, source: "random" },
            },
        },
    }

    it("无快照物品输出 TG3_ 字面量（布局不得漂移）", () => {
        const code = encodeTranscendGearCode([{ slotId: 3, item: frozenCrafted }], [])
        expect(code).toBe("TG3_K5AAAAAASk4AAgNlMgDqB2SA7gcKAIAIFAAAAA")
        expect(decodeTranscendGearCode(code).mainGear).toHaveLength(1)
    })

    it("含快照物品输出 TG4_ 字面量（快照段紧跟 craft 次数）", () => {
        const code = encodeTranscendGearCode([{ slotId: 3, item: frozenEnchanted }], [])
        expect(code).toBe("TG4_K5AAAAAAMAmAAQGQ6QcHgGUyAO4H9AMAgAgFAAAA")
        const entry = decodeTranscendGearCode(code).mainGear[0] as { item: TranscendGearItemConfig }
        expect(entry.item.craft?.enchantSnapshot).toEqual(frozenEnchanted.craft?.enchantSnapshot)
        expect(encodeTranscendGearCode([{ slotId: 3, item: entry.item }], [])).toBe(code)
    })
})
