import { slots } from "./d"
import {
    getGearItemSocketCount,
    getSlotBaseAffixId,
    getSlotMaxInlayCount,
    getTranscendGearGroupKeyOfSlot,
    getTranscendSlotType,
    isLegacyGearEntry,
    normalizeGearItem,
    TRANSCEND_ASSIST1_SLOT_MAX,
    TRANSCEND_ASSIST1_SLOT_MIN,
    TRANSCEND_ASSIST2_SLOT_MAX,
    TRANSCEND_ASSIST2_SLOT_MIN,
    TRANSCEND_EQUIP_BASE_SCORE_MAX,
    TRANSCEND_MAIN_SLOT_MAX,
    TRANSCEND_MAIN_SLOT_MIN,
    TRANSCEND_MASTERWORK_MAX,
    TRANSCEND_MAX_AFFIXES_PER_SLOT,
    TRANSCEND_MAX_ITEM_AFFIX_ROLLS,
    TRANSCEND_RARITY_IDS,
    type TranscendGearAffixRoll,
    type TranscendGearCraftState,
    type TranscendGearGroup,
    type TranscendGearGroupKey,
    type TranscendGearItemConfig,
} from "./transcendGear"

/**
 * 升华装备短码：编码主控 + 协战一 + 协战二三组装备（槽位 / 品质 / 强度 / 词条 / 装备级 craft 状态 / 孔位 / 已开孔数），
 * 不含角色、天赋、环境与展示快照。基础前缀 `TG3_`（三组一人一套 20 槽），正文为位打包 + base64url，
 * 长度远小于完整构筑 JSON；含附魔快照时升级为 `TG4_`（物品块追加 1 位标记 + 快照下标 3 位 + 快照词条），
 * 无快照的装备仍输出 `TG3_`。解码兼容 `TG3_` / `TG2_`（两组共用 12 槽）。
 * 两种布局都保持物品块中 affixes 的数组顺序（编码器写出归一化结果，不重排；快照下标按该数组位置核对）。
 */

/** 装备短码版本前缀（基础格式：三组一人一套 20 槽，不含附魔快照） */
export const TRANSCEND_GEAR_CODE_PREFIX = "TG3_"
/** 含附魔快照的短码前缀：物品块在 craft 次数后追加快照段，旧前缀解码不受影响 */
export const TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX = "TG4_"
/** 兼容解码的旧前缀：post-U32b 的两组共用 12 槽（协战 9-12 视为协战一，协战二为空） */
export const TRANSCEND_GEAR_CODE_LEGACY_PREFIX = "TG2_"

/** 装备短码错误类别：格式错误 / 内容截断 / 字段非法 */
export type TranscendGearCodeErrorCode = "format" | "truncated" | "invalid"

/** 装备短码解析 / 编码失败 */
export class TranscendGearCodeError extends Error {
    readonly code: TranscendGearCodeErrorCode

    constructor(code: TranscendGearCodeErrorCode, message: string) {
        super(message)
        this.name = "TranscendGearCodeError"
        this.code = code
    }
}

/** 解码结果：三组装备（槽位按 1-16 有序）；`TG2_` 解码时协战二为空 */
export interface TranscendGearCodePayload {
    mainGear: TranscendGearGroup
    assist1Gear: TranscendGearGroup
    assist2Gear: TranscendGearGroup
}

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const BASE64URL_INDEX = new Map([...BASE64URL_ALPHABET].map((char, index) => [char, index]))

/** 3 字节 → 4 字符（无填充） */
function toBase64Url(bytes: Uint8Array): string {
    let text = ""
    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index]
        const second = index + 1 < bytes.length ? bytes[index + 1] : -1
        const third = index + 2 < bytes.length ? bytes[index + 2] : -1
        text += BASE64URL_ALPHABET[first >> 2]
        text += BASE64URL_ALPHABET[((first & 0x03) << 4) | (second >= 0 ? second >> 4 : 0)]
        if (second < 0) break
        text += BASE64URL_ALPHABET[((second & 0x0f) << 2) | (third >= 0 ? third >> 6 : 0)]
        if (third < 0) break
        text += BASE64URL_ALPHABET[third & 0x3f]
    }
    return text
}

/** base64url → 字节（允许标准 base64 字符与末尾 `=` 填充，便于跨工具复制；尾部必须规范） */
function fromBase64Url(text: string): Uint8Array {
    if (!text) throw new TranscendGearCodeError("format", "装备码内容为空")
    const paddingIndex = text.indexOf("=")
    let body = text
    if (paddingIndex !== -1) {
        const padding = text.length - paddingIndex
        if (!/^={1,2}$/.test(text.slice(paddingIndex))) {
            throw new TranscendGearCodeError("format", "装备码的填充字符位置不合法")
        }
        const rest = paddingIndex % 4
        if (rest === 0 || rest + padding !== 4) throw new TranscendGearCodeError("format", "装备码的填充字符数量不合法")
        body = text.slice(0, paddingIndex)
    }
    if (body.length % 4 === 1) throw new TranscendGearCodeError("truncated", "装备码长度不完整")
    const bytes: number[] = []
    let buffer = 0
    let bits = 0
    for (const char of body) {
        const normalized = char === "+" ? "-" : char === "/" ? "_" : char
        const value = BASE64URL_INDEX.get(normalized)
        if (value === undefined) throw new TranscendGearCodeError("format", `装备码包含非法字符「${char}」`)
        buffer = (buffer << 6) | value
        bits += 6
        if (bits >= 8) {
            bits -= 8
            bytes.push((buffer >> bits) & 0xff)
            buffer &= (1 << bits) - 1
        }
    }
    // 规范尾部：不足一字节的剩余位必须为 0，否则是拼写错误或非规范编码
    if (bits > 0 && buffer !== 0) throw new TranscendGearCodeError("invalid", "装备码尾部不是规范编码")
    return Uint8Array.from(bytes)
}

/** 位写入器：定长位段 + 字节对齐的 LEB128 varint */
class GearCodeWriter {
    private readonly bytes: number[] = []
    private buffer = 0
    private bits = 0

    writeBits(value: number, count: number): void {
        for (let offset = count - 1; offset >= 0; offset -= 1) this.writeBit((value >> offset) & 1)
    }

    writeVarint(value: number, label = "数值"): void {
        this.align()
        const rest = Math.round(Number(value))
        if (!Number.isSafeInteger(rest) || rest < 0) {
            throw new TranscendGearCodeError("invalid", `装备码中的${label} ${String(value)} 超出可编码范围`)
        }
        let current = rest
        while (current >= 0x80) {
            this.bytes.push((current % 0x80) | 0x80)
            current = Math.floor(current / 0x80)
        }
        this.bytes.push(current)
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

/** 位读取器：与写入器对称，varint 前丢弃当前字节剩余位 */
class GearCodeReader {
    private index = 0
    private buffer = 0
    private bits = 0

    constructor(private readonly bytes: Uint8Array) {}

    readBits(count: number): number {
        let value = 0
        for (let offset = 0; offset < count; offset += 1) value = (value << 1) | this.readBit()
        return value >>> 0
    }

    readVarint(): number {
        this.align()
        let value = 0
        let factor = 1
        for (let offset = 0; offset < 8; offset += 1) {
            const byte = this.readByte()
            value += (byte & 0x7f) * factor
            if ((byte & 0x80) === 0) {
                if (!Number.isSafeInteger(value)) throw new TranscendGearCodeError("invalid", "装备码中的数值超出安全整数范围")
                return value
            }
            factor *= 0x80
        }
        throw new TranscendGearCodeError("invalid", "装备码中的数值超出范围")
    }

    /** 读完内容后校验没有多余字节，且尾部对齐填充位为 0 */
    assertEnd(): void {
        this.align()
        if (this.index < this.bytes.length) throw new TranscendGearCodeError("invalid", "装备码包含多余数据")
    }

    /** 对齐丢弃剩余位；写入器按 0 填充，非 0 说明不是规范编码 */
    private align(): void {
        if (this.bits > 0 && (this.buffer & ((1 << this.bits) - 1)) !== 0) {
            throw new TranscendGearCodeError("invalid", "装备码的对齐填充位不合法")
        }
        this.bits = 0
        this.buffer = 0
    }

    private readBit(): number {
        if (this.bits === 0) {
            this.buffer = this.readByte()
            this.bits = 8
        }
        this.bits -= 1
        return (this.buffer >> this.bits) & 1
    }

    private readByte(): number {
        if (this.index >= this.bytes.length) throw new TranscendGearCodeError("truncated", "装备码内容不完整")
        const byte = this.bytes[this.index]
        this.index += 1
        return byte
    }
}

/** 词条 roll → 位流：id / 档位为 varint，太古 1 位（精锻 / 最终精锻是装备级 craft 状态） */
function writeRoll(writer: GearCodeWriter, roll: TranscendGearAffixRoll): void {
    const affixId = Math.round(Number(roll.affixId))
    const rollLevel = Math.round(Number(roll.rollLevel))
    if (!Number.isSafeInteger(affixId) || affixId <= 0 || !Number.isSafeInteger(rollLevel) || rollLevel <= 0) {
        throw new TranscendGearCodeError("invalid", `装备词条 ${String(roll.affixId)}/${String(roll.rollLevel)} 不合法`)
    }
    writer.writeVarint(affixId, "词条 id")
    writer.writeVarint(rollLevel, "词条档位")
    writer.writeBits(roll.ancient ? 1 : 0, 1)
}

/** 位流 → 词条 roll（档位必须为正；精锻等级由装备级 craft 状态统一写入） */
function readRoll(reader: GearCodeReader): TranscendGearAffixRoll {
    const affixId = reader.readVarint()
    const rollLevel = reader.readVarint()
    const ancient = reader.readBits(1) === 1
    if (affixId <= 0 || rollLevel <= 0) {
        throw new TranscendGearCodeError("invalid", "装备码中的词条数据不合法")
    }
    return {
        affixId,
        rollLevel,
        masterworkLevel: 0,
        ancient,
        finalMasterwork: false,
    }
}

/** craft 下标 → 3 位槽（0 = 无，1..7 = 下标 + 1）；越界抛错，不静默丢弃 */
function craftIndexSlot(index: unknown, count: number, label: string): number {
    if (index === undefined || index === null) return 0
    const value = Math.round(Number(index))
    if (!Number.isFinite(value) || value < 0 || value >= count || value > 6) {
        throw new TranscendGearCodeError("invalid", `装备的${label}下标 ${String(index)} 超出可编码范围`)
    }
    return value + 1
}

/**
 * 物品 → 位流（调用方已归一化，词条 / 孔位有序）。
 * `withSnapshot` 为真时（`TG4_`）在 craft 次数后写附魔快照段：1 位存在标记 + 3 位下标 + 词条 roll。
 */
function writeItem(writer: GearCodeWriter, item: TranscendGearItemConfig, withSnapshot: boolean): void {
    const unique = item.kind === "unique"
    writer.writeBits(unique ? 1 : 0, 1)
    const rarityIndex = item.rarityId === undefined ? 0 : (TRANSCEND_RARITY_IDS as readonly number[]).indexOf(item.rarityId) + 1
    writer.writeBits(rarityIndex > 0 ? rarityIndex : 0, 3)
    writer.writeBits(item.equipBaseScore ?? 0, 6)
    writer.writeVarint(item.iconId ?? 0, "图标 id")
    writer.writeVarint(item.nameId ?? 0, "名称 id")
    writer.writeVarint(item.seasonId ?? 0, "赛季 id")
    writer.writeVarint(unique ? (item.uniqueId ?? 0) : 0, "暗金 id")
    writer.writeBits(unique && item.uniqueAffix ? 1 : 0, 1)
    if (unique && item.uniqueAffix) writeRoll(writer, item.uniqueAffix)
    const affixes = Array.isArray(item.affixes) ? item.affixes : []
    const craft = item.craft && typeof item.craft === "object" ? item.craft : undefined
    const masterworkLevel = Math.max(0, Math.min(TRANSCEND_MASTERWORK_MAX, Math.round(Number(craft?.masterworkLevel) || 0)))
    if (affixes.length > TRANSCEND_MAX_ITEM_AFFIX_ROLLS) {
        throw new TranscendGearCodeError("invalid", "装备词条数量超出装备码可表示范围")
    }
    writer.writeBits(affixes.length, 3)
    writer.writeBits(masterworkLevel, 4)
    writer.writeBits(craftIndexSlot(craft?.finalMasterworkAffixIndex, affixes.length, "最终精锻目标"), 3)
    writer.writeBits(craftIndexSlot(craft?.temperingAffixIndex, affixes.length, "淬炼词条"), 3)
    writer.writeBits(craftIndexSlot(craft?.enchantAffixIndex, affixes.length, "附魔词条"), 3)
    writer.writeVarint(Math.max(0, Math.round(Number(craft?.temperingCount) || 0)), "淬炼次数")
    writer.writeVarint(Math.max(0, Math.round(Number(craft?.enchantCount) || 0)), "附魔次数")
    const snapshot = withSnapshot ? craft?.enchantSnapshot : undefined
    if (withSnapshot) {
        writer.writeBits(snapshot ? 1 : 0, 1)
        if (snapshot) {
            const snapshotIndex = Math.round(Number(snapshot.affixIndex))
            if (!Number.isFinite(snapshotIndex) || snapshotIndex < 0 || snapshotIndex > 7) {
                throw new TranscendGearCodeError("invalid", `附魔快照下标 ${String(snapshot.affixIndex)} 超出装备码可表示范围`)
            }
            writer.writeBits(snapshotIndex, 3)
            writeRoll(writer, snapshot.roll)
        }
    }
    for (const roll of affixes) writeRoll(writer, roll)
    const sockets = Array.isArray(item.sockets) ? item.sockets : []
    const socketCount = getGearItemSocketCount(item)
    if (socketCount > 31 || sockets.length > 15 || sockets.some(socket => Math.round(socket.socketIndex) > 3)) {
        throw new TranscendGearCodeError("invalid", "装备孔位数据超出装备码可表示范围")
    }
    writer.writeBits(socketCount, 5)
    writer.writeBits(sockets.length, 4)
    for (const socket of sockets) {
        const gemId = Math.round(Number(socket.gemId))
        if (!Number.isSafeInteger(gemId) || gemId <= 0) {
            throw new TranscendGearCodeError("invalid", `装备码中的宝石 ${String(socket.gemId)} 不合法`)
        }
        writer.writeBits(Math.round(socket.socketIndex), 2)
        writer.writeVarint(gemId, "宝石 id")
    }
}

/**
 * 位流 → 物品（槽型由装备位推导）。
 * 严格校验所有可表示范围：不做裁剪 / 去重 / 截断，畸形内容一律抛错。
 * craft 下标按「词条位置」解码，并在归一化后按位置核对（归一化保持数组顺序）。
 * `withSnapshot`（`TG4_`）时额外读取附魔快照段，同样在归一化后逐字段核对。
 */
function readItem(reader: GearCodeReader, slotId: number, withSnapshot: boolean): TranscendGearItemConfig {
    const kind = reader.readBits(1) === 1 ? "unique" : "normal"
    const rarityIndex = reader.readBits(3)
    const equipBaseScore = reader.readBits(6)
    const iconId = reader.readVarint()
    const nameId = reader.readVarint()
    const seasonId = reader.readVarint()
    const uniqueId = reader.readVarint()
    const hasUniqueAffix = reader.readBits(1) === 1
    const uniqueAffix = hasUniqueAffix ? readRoll(reader) : undefined
    const affixCount = reader.readBits(3)
    const masterworkLevel = reader.readBits(4)
    const finalSlot = reader.readBits(3)
    const temperingSlot = reader.readBits(3)
    const enchantSlot = reader.readBits(3)
    const temperingCount = reader.readVarint()
    const enchantCount = reader.readVarint()
    let snapshotIndex: number | undefined
    let snapshotRoll: TranscendGearAffixRoll | undefined
    if (withSnapshot && reader.readBits(1) === 1) {
        snapshotIndex = reader.readBits(3)
        snapshotRoll = readRoll(reader)
    }
    if (masterworkLevel > TRANSCEND_MASTERWORK_MAX) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的精锻等级超出上限`)
    }
    if (temperingCount > 0 && temperingSlot === 0) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 有淬炼次数但没有淬炼词条`)
    }
    if (enchantCount > 0 && enchantSlot === 0) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 有附魔次数但没有附魔词条`)
    }
    for (const [label, slot] of [
        ["最终精锻", finalSlot],
        ["淬炼", temperingSlot],
        ["附魔", enchantSlot],
    ] as const) {
        if (slot > affixCount) throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的${label}目标下标越界`)
    }
    if (finalSlot > 0 && masterworkLevel < TRANSCEND_MASTERWORK_MAX) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 未精锻满级，不能有最终精锻目标`)
    }
    const affixes: TranscendGearAffixRoll[] = []
    const temperingIndex = temperingSlot > 0 ? temperingSlot - 1 : undefined
    const seenAffixKeys = new Set<string>()
    const seenAffixIds = new Set<number>()
    for (let index = 0; index < affixCount; index += 1) {
        const roll = readRoll(reader)
        // 淬炼行与同 id 随机行可共存（单件仍最多 1 条淬炼）；其余同 id 重复仍视为畸形码
        const key = `${index === temperingIndex ? "tempering" : "other"}:${roll.affixId}`
        if (seenAffixKeys.has(key)) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的词条 ${roll.affixId} 重复`)
        }
        seenAffixKeys.add(key)
        seenAffixIds.add(roll.affixId)
        affixes.push(roll)
    }
    if (snapshotRoll && snapshotIndex !== undefined) {
        if (enchantSlot === 0) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 有附魔快照但没有附魔词条`)
        }
        if (snapshotIndex > affixCount) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的附魔快照下标越界`)
        }
        if (seenAffixIds.has(snapshotRoll.affixId)) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的附魔快照词条 ${snapshotRoll.affixId} 与现有词条重复`)
        }
    }
    const socketCount = reader.readBits(5)
    const socketLength = reader.readBits(4)
    if (socketLength > socketCount) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的已镶嵌孔数超过已开孔数`)
    }
    const slotType = getTranscendSlotType(slotId)
    const hasSlotData = slots.length > 0
    const maxInlays = hasSlotData ? getSlotMaxInlayCount(slotType) : 0
    if (hasSlotData && socketCount > maxInlays) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的已开孔数 ${socketCount} 超过槽型上限 ${maxInlays}`)
    }
    const sockets: { socketIndex: number; gemId: number }[] = []
    const seenSockets = new Set<number>()
    for (let index = 0; index < socketLength; index += 1) {
        const socketIndex = reader.readBits(2)
        const gemId = reader.readVarint()
        if (gemId <= 0) throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的宝石数据不合法`)
        if (seenSockets.has(socketIndex)) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的孔位 ${socketIndex} 重复`)
        }
        seenSockets.add(socketIndex)
        if (socketIndex >= socketCount) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的孔位 ${socketIndex} 未开孔`)
        }
        if (hasSlotData && socketIndex >= maxInlays) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的孔位 ${socketIndex} 超过槽型上限`)
        }
        sockets.push({ socketIndex, gemId })
    }
    if (rarityIndex > TRANSCEND_RARITY_IDS.length || equipBaseScore > TRANSCEND_EQUIP_BASE_SCORE_MAX) {
        throw new TranscendGearCodeError("invalid", "装备码中的品质 / 强度不合法")
    }
    if (kind !== "unique" && (uniqueId > 0 || hasUniqueAffix)) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的普通装备带有暗金字段`)
    }
    if (kind === "unique" && uniqueId <= 0) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的暗金缺少 uniqueId`)
    }
    const uniqueAffixId = uniqueAffix?.affixId
    if (uniqueAffixId !== undefined && seenAffixIds.has(uniqueAffixId)) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的专属词条同时出现在普通词条中`)
    }
    const baseAffixId = getSlotBaseAffixId(slotType)
    if (baseAffixId !== null) {
        // 淬炼词条不占随机词条的 4 个名额（附魔只替换既有随机词条，仍计入）
        const randomCount = affixes.filter(
            (roll, index) => index !== temperingIndex && roll.affixId !== baseAffixId && roll.affixId !== uniqueAffixId
        ).length
        if (randomCount > TRANSCEND_MAX_AFFIXES_PER_SLOT) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的随机词条数量超出上限`)
        }
    }
    const craft: TranscendGearCraftState = { masterworkLevel, temperingCount, enchantCount }
    if (finalSlot > 0) craft.finalMasterworkAffixIndex = finalSlot - 1
    if (temperingIndex !== undefined) craft.temperingAffixIndex = temperingIndex
    if (enchantSlot > 0) craft.enchantAffixIndex = enchantSlot - 1
    if (snapshotRoll && snapshotIndex !== undefined) craft.enchantSnapshot = { affixIndex: snapshotIndex, roll: snapshotRoll }
    const raw: TranscendGearItemConfig = {
        kind,
        slotType,
        affixes,
        craft,
    }
    if (rarityIndex > 0) raw.rarityId = TRANSCEND_RARITY_IDS[rarityIndex - 1]
    if (equipBaseScore > 0) raw.equipBaseScore = equipBaseScore
    if (iconId > 0) raw.iconId = iconId
    if (nameId > 0) raw.nameId = nameId
    if (seasonId > 0) raw.seasonId = seasonId
    if (uniqueId > 0) raw.uniqueId = uniqueId
    if (uniqueAffix) raw.uniqueAffix = uniqueAffix
    if (socketCount > 0) raw.socketCount = socketCount
    if (sockets.length) raw.sockets = sockets
    const normalized = normalizeGearItem(raw, undefined, { preserveUnknown: true })
    if (!normalized) throw new TranscendGearCodeError("invalid", `装备码中的装备位 ${slotId} 数据不合法`)
    if (normalized.affixes.length !== affixes.length || (normalized.sockets?.length ?? 0) !== sockets.length) {
        throw new TranscendGearCodeError("invalid", `装备码中的装备位 ${slotId} 数据被归一化修正`)
    }
    // 逐条按位置核对归一化结果：ancient / 档位被归一化修正（无公式的太古、超上限档位等）同样视为畸形码。
    // 按位置而非 id 查表：同 id 的随机 + 淬炼两行不能被合并比较
    for (const [index, roll] of affixes.entries()) {
        const resolvedRoll = normalized.affixes[index]
        if (
            !resolvedRoll ||
            resolvedRoll.affixId !== roll.affixId ||
            resolvedRoll.ancient !== roll.ancient ||
            resolvedRoll.rollLevel !== roll.rollLevel
        ) {
            throw new TranscendGearCodeError("invalid", `装备码中的装备位 ${slotId} 的词条 ${roll.affixId} 数据被归一化修正`)
        }
    }
    if (uniqueAffix) {
        const resolvedUnique = normalized.uniqueAffix
        if (!resolvedUnique || resolvedUnique.rollLevel !== uniqueAffix.rollLevel || resolvedUnique.ancient !== uniqueAffix.ancient) {
            throw new TranscendGearCodeError("invalid", `装备码中的装备位 ${slotId} 的专属词条数据被归一化修正`)
        }
    }
    /** 解码下标对应的词条 id；归一化保持数组顺序，按位置核对 */
    const expectedAffixId = (slot: number): number | undefined => (slot > 0 ? affixes[slot - 1]?.affixId : undefined)
    const normalizedAffixId = (index: number | undefined): number | undefined =>
        index === undefined ? undefined : normalized.affixes[index]?.affixId
    const normalizedSnapshot = normalized.craft?.enchantSnapshot
    const snapshotMismatch =
        (snapshotRoll === undefined) !== (normalizedSnapshot === undefined) ||
        (snapshotRoll !== undefined &&
            snapshotIndex !== undefined &&
            normalizedSnapshot !== undefined &&
            (normalizedSnapshot.affixIndex !== snapshotIndex ||
                normalizedSnapshot.roll.affixId !== snapshotRoll.affixId ||
                normalizedSnapshot.roll.rollLevel !== snapshotRoll.rollLevel ||
                normalizedSnapshot.roll.ancient !== snapshotRoll.ancient))
    const craftMismatch =
        (normalized.craft?.masterworkLevel ?? 0) !== masterworkLevel ||
        (normalized.craft?.temperingCount ?? 0) !== temperingCount ||
        (normalized.craft?.enchantCount ?? 0) !== enchantCount ||
        normalizedAffixId(normalized.craft?.finalMasterworkAffixIndex) !== expectedAffixId(finalSlot) ||
        normalizedAffixId(normalized.craft?.temperingAffixIndex) !== expectedAffixId(temperingSlot) ||
        normalizedAffixId(normalized.craft?.enchantAffixIndex) !== expectedAffixId(enchantSlot) ||
        snapshotMismatch
    if (craftMismatch) {
        throw new TranscendGearCodeError("invalid", `装备码中的装备位 ${slotId} craft 状态不合法`)
    }
    return normalized
}

/** 三组装备的固定槽位区间（主控 1-8，协战一 9-12，协战二 13-16） */
const GROUP_SLOT_RANGES: Record<TranscendGearGroupKey, readonly [number, number]> = {
    main: [TRANSCEND_MAIN_SLOT_MIN, TRANSCEND_MAIN_SLOT_MAX],
    assist1: [TRANSCEND_ASSIST1_SLOT_MIN, TRANSCEND_ASSIST1_SLOT_MAX],
    assist2: [TRANSCEND_ASSIST2_SLOT_MIN, TRANSCEND_ASSIST2_SLOT_MAX],
}

/** 装备组的展示名（错误信息使用） */
const GROUP_LABELS: Record<TranscendGearGroupKey, string> = {
    main: "主控（1-8）",
    assist1: "协战一（9-12）",
    assist2: "协战二（13-16）",
}

/** 某装备分组的固定槽位（主控 1-8，协战一 9-12，协战二 13-16） */
function getGroupSlotIds(groupKey: TranscendGearGroupKey): number[] {
    const [start, end] = GROUP_SLOT_RANGES[groupKey]
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

/** 原始 craft 下标对应的词条 id（null / undefined / 越界 / 非数字为 0） */
function rawCraftTargetId(affixes: readonly unknown[], index: unknown): number {
    if (index === undefined || index === null) return 0
    const value = Math.round(Number(index))
    if (!Number.isFinite(value) || value < 0 || value >= affixes.length) return 0
    const roll = affixes[value]
    return roll && typeof roll === "object" ? Math.round(Number((roll as { affixId?: unknown }).affixId)) || 0 : 0
}

/** 归一化 craft 下标对应的词条 id（缺省为 0） */
function normalizedCraftTargetId(affixes: readonly TranscendGearAffixRoll[], index: number | undefined): number {
    return index === undefined ? 0 : Math.round(Number(affixes[index]?.affixId)) || 0
}

/**
 * 编码前校验旧 craft 对象：显式下标必须可编码（不越界），且归一化不会改写精锻 / 目标 / 次数 / 附魔快照。
 * @param slotId 装备位
 * @param rawCraft 原始 craft 状态
 * @param rawAffixes 原始词条（下标基准）
 * @param normalized 归一化后的物品
 */
function assertCraftEncodable(
    slotId: number,
    rawCraft: Partial<TranscendGearCraftState>,
    rawAffixes: readonly unknown[],
    normalized: TranscendGearItemConfig
): void {
    for (const [label, index] of [
        ["最终精锻目标", rawCraft.finalMasterworkAffixIndex],
        ["淬炼词条", rawCraft.temperingAffixIndex],
        ["附魔词条", rawCraft.enchantAffixIndex],
    ] as const) {
        if (index === undefined || index === null) continue
        const value = Math.round(Number(index))
        if (!Number.isFinite(value) || value < 0 || value >= rawAffixes.length) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的${label}下标 ${String(index)} 越界`)
        }
    }
    // 精锻等级 / 次数显式给出时必须本来就合法：不做静默截断（越界说明调用方状态已坏）
    const strictCount = (value: unknown, label: string, max: number): number => {
        if (value === undefined || value === null) return 0
        const count = Math.round(Number(value))
        if (!Number.isFinite(count) || count < 0 || count > max) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的${label} ${String(value)} 超出可编码范围`)
        }
        return count
    }
    const rawMasterwork = strictCount(rawCraft.masterworkLevel, "精锻等级", TRANSCEND_MASTERWORK_MAX)
    const rawTemperingCount = strictCount(rawCraft.temperingCount, "淬炼次数", Number.MAX_SAFE_INTEGER)
    const rawEnchantCount = strictCount(rawCraft.enchantCount, "附魔次数", Number.MAX_SAFE_INTEGER)
    const normalizedCraft = normalized.craft
    const changed =
        rawMasterwork !== (normalizedCraft?.masterworkLevel ?? 0) ||
        rawTemperingCount !== (normalizedCraft?.temperingCount ?? 0) ||
        rawEnchantCount !== (normalizedCraft?.enchantCount ?? 0) ||
        rawCraftTargetId(rawAffixes, rawCraft.finalMasterworkAffixIndex) !==
            normalizedCraftTargetId(normalized.affixes, normalizedCraft?.finalMasterworkAffixIndex) ||
        rawCraftTargetId(rawAffixes, rawCraft.temperingAffixIndex) !==
            normalizedCraftTargetId(normalized.affixes, normalizedCraft?.temperingAffixIndex) ||
        rawCraftTargetId(rawAffixes, rawCraft.enchantAffixIndex) !==
            normalizedCraftTargetId(normalized.affixes, normalizedCraft?.enchantAffixIndex) ||
        snapshotFields(rawCraft.enchantSnapshot) !== snapshotFields(normalizedCraft?.enchantSnapshot)
    if (changed) {
        throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的 craft 状态会被归一化修正，无法导出装备码`)
    }
}

/** 附魔快照的可编码字段（下标 / 词条 id / 档位 / 太古）；缺省为空串 */
function snapshotFields(snapshot: unknown): string {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return ""
    const value = snapshot as { affixIndex?: unknown; roll?: { affixId?: unknown; rollLevel?: unknown; ancient?: unknown } }
    return [
        Math.round(Number(value.affixIndex)),
        Math.round(Number(value.roll?.affixId)),
        Math.round(Number(value.roll?.rollLevel)),
        value.roll?.ancient === true ? 1 : 0,
    ].join(":")
}

/**
 * 按槽位排序并归一化后的物品表。
 * 任何不可编码条目（null / 非法或错组装备位 / 槽型不一致 / 重复槽位 / 归一化会裁剪词条或孔位）都抛错，
 * 不静默跳过或裁剪。
 * @param group 装备组
 * @param groupKey 装备组归属（主控 1-8 / 协战一 9-12 / 协战二 13-16）
 * @returns 装备位 → 归一化物品
 */
function indexItems(group: TranscendGearGroup, groupKey: TranscendGearGroupKey): Map<number, TranscendGearItemConfig> {
    const bySlot = new Map<number, TranscendGearItemConfig>()
    const allowedSlots = new Set(getGroupSlotIds(groupKey))
    for (const [index, entry] of (Array.isArray(group) ? group : []).entries()) {
        // v1 平铺词条无法表达成物品：明确报错而不是静默导出残缺的装备码
        if (isLegacyGearEntry(entry)) {
            throw new TranscendGearCodeError("invalid", `装备组第 ${index + 1} 项是未迁移的旧版装备词条，无法导出装备码`)
        }
        if (!entry || typeof entry !== "object" || !("item" in entry)) {
            throw new TranscendGearCodeError("invalid", `装备组第 ${index + 1} 项不是有效的装备槽`)
        }
        const rawSlotId = Number(entry.slotId)
        const slotId = Math.round(rawSlotId)
        if (!Number.isFinite(rawSlotId) || !Number.isSafeInteger(slotId) || !getTranscendGearGroupKeyOfSlot(slotId)) {
            throw new TranscendGearCodeError("invalid", `装备组第 ${index + 1} 项的装备位 ${String(entry.slotId)} 不合法（只接受 1-16）`)
        }
        if (!allowedSlots.has(slotId)) {
            throw new TranscendGearCodeError("invalid", `装备组第 ${index + 1} 项的装备位 ${slotId} 不属于${GROUP_LABELS[groupKey]}装备组`)
        }
        if (bySlot.has(slotId)) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 重复`)
        }
        const rawItem: unknown = entry.item
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的物品数据不合法`)
        }
        const item = rawItem as TranscendGearItemConfig
        const rawAffixes = Array.isArray(item.affixes) ? item.affixes : []
        const rawSockets = Array.isArray(item.sockets) ? item.sockets : []
        const normalized = normalizeGearItem(item, undefined, { preserveUnknown: true })
        if (!normalized) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的物品数据不合法`)
        }
        if (normalized.affixes.length !== rawAffixes.length) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的词条会被归一化裁剪，无法导出装备码`)
        }
        if ((normalized.sockets?.length ?? 0) !== rawSockets.length) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的孔位会被归一化裁剪，无法导出装备码`)
        }
        const rawCraft = item.craft
        if (rawCraft && typeof rawCraft === "object" && !Array.isArray(rawCraft)) {
            assertCraftEncodable(slotId, rawCraft as Partial<TranscendGearCraftState>, rawAffixes, normalized)
        }
        const expected = getTranscendSlotType(slotId)
        if (normalized.slotType !== expected) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的物品槽型 ${normalized.slotType} 与槽位槽型 ${expected} 不一致`)
        }
        if (normalized.kind === "unique" && !normalized.uniqueId) {
            throw new TranscendGearCodeError("invalid", `装备位 ${slotId} 的暗金缺少 uniqueId`)
        }
        bySlot.set(slotId, normalized)
    }
    return bySlot
}

/**
 * 编码装备短码：含主控 + 协战一 + 协战二三组装备，确定性输出（词条顺序保留、孔位顺序无关）。
 * 任一件装备带附魔快照时输出 `TG4_`（物品块含快照段），否则输出基础格式 `TG3_`。
 * @param mainGear 主控装备组（槽位 1-8）
 * @param assist1Gear 协战一装备组（槽位 9-12）
 * @param assist2Gear 协战二装备组（槽位 13-16）
 * @returns `TG4_` / `TG3_` + base64url 短码
 */
export function encodeTranscendGearCode(
    mainGear: TranscendGearGroup,
    assist1Gear: TranscendGearGroup,
    assist2Gear: TranscendGearGroup = []
): string {
    const groups: [TranscendGearGroupKey, TranscendGearGroup][] = [
        ["main", mainGear],
        ["assist1", assist1Gear],
        ["assist2", assist2Gear],
    ]
    const indexed = groups.map(([groupKey, group]) => [groupKey, indexItems(group, groupKey)] as const)
    const withSnapshot = indexed.some(([, items]) => [...items.values()].some(item => item.craft?.enchantSnapshot !== undefined))
    const writer = new GearCodeWriter()
    for (const [groupKey, items] of indexed) {
        for (const slotId of getGroupSlotIds(groupKey)) {
            const item = items.get(slotId)
            writer.writeBits(item ? 1 : 0, 1)
            if (item) writeItem(writer, item, withSnapshot)
        }
    }
    return `${withSnapshot ? TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX : TRANSCEND_GEAR_CODE_PREFIX}${toBase64Url(writer.finish())}`
}

/**
 * 解码装备短码：校验前缀、长度与字段范围，非法码抛 `TranscendGearCodeError`。
 * 兼容 `TG3_`（不含附魔快照）与 `TG2_`（post-U32b 两组共用 12 槽）：协战 9-12 解码为协战一，协战二为空。
 * @param code 剪贴板文本（允许夹杂空白）
 * @returns 主控 / 协战一 / 协战二三组装备
 */
export function decodeTranscendGearCode(code: string): TranscendGearCodePayload {
    if (typeof code !== "string") throw new TranscendGearCodeError("format", "装备码格式不正确")
    const compact = code.replace(/\s+/g, "")
    if (!compact) throw new TranscendGearCodeError("format", "装备码为空")
    const isLegacy = compact.startsWith(TRANSCEND_GEAR_CODE_LEGACY_PREFIX)
    const withSnapshot = compact.startsWith(TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX)
    if (!isLegacy && !withSnapshot && !compact.startsWith(TRANSCEND_GEAR_CODE_PREFIX)) {
        throw new TranscendGearCodeError(
            "format",
            `装备码必须以 ${TRANSCEND_GEAR_CODE_PREFIX} / ${TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX} / ${TRANSCEND_GEAR_CODE_LEGACY_PREFIX} 开头`
        )
    }
    const prefix = isLegacy
        ? TRANSCEND_GEAR_CODE_LEGACY_PREFIX
        : withSnapshot
          ? TRANSCEND_GEAR_CODE_SNAPSHOT_PREFIX
          : TRANSCEND_GEAR_CODE_PREFIX
    const body = compact.slice(prefix.length)
    if (!body) throw new TranscendGearCodeError("format", "装备码内容为空")
    const reader = new GearCodeReader(fromBase64Url(body))
    const mainGear: TranscendGearGroup = []
    const assist1Gear: TranscendGearGroup = []
    const assist2Gear: TranscendGearGroup = []
    // TG2 只编码 12 槽：协战 9-12 落入协战一，协战二保持为空
    const groups: [TranscendGearGroupKey, TranscendGearGroup][] = isLegacy
        ? [
              ["main", mainGear],
              ["assist1", assist1Gear],
          ]
        : [
              ["main", mainGear],
              ["assist1", assist1Gear],
              ["assist2", assist2Gear],
          ]
    for (const [groupKey, group] of groups) {
        for (const slotId of getGroupSlotIds(groupKey)) {
            if (reader.readBits(1) === 0) continue
            group.push({ slotId, item: readItem(reader, slotId, withSnapshot) })
        }
    }
    reader.assertEnd()
    return { mainGear, assist1Gear, assist2Gear }
}
