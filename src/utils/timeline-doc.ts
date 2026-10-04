/**
 * 时间线编辑器自有数据模型。
 *
 * 与构建页使用的旧时间线存档（`RawTimelineData`，按角色名存储）完全解耦：
 * 本文件是时间线编辑器的唯一数据契约，编辑器不再依赖「当前角色」这一全局状态，
 * 而是以「角色槽位 → 轨道 → 时间块」三层结构描述一套循环。
 */

/** 轨道类型：技能轨只能放技能块，BUFF 轨只能放 BUFF 块 */
export type TimelineTrackKind = "skill" | "buff"

/** 轨道定义 */
export interface TimelineTrackDef {
    id: string
    kind: TimelineTrackKind
    name: string
}

/** 魔之楔槽位类型（与角色配置的槽位分组一致） */
export type TimelineModSlotType = "角色" | "近战" | "远程" | "同律"

/** 魔之楔槽位：`[魔之楔 id, 等级]`，null 表示空槽 */
export type TimelineModSlot = [number, number] | null

/** 各槽位类型的固定槽位数（角色/近战/远程各 8 槽，同律 4 槽） */
export const TIMELINE_MOD_SLOT_COUNTS: Record<TimelineModSlotType, number> = { 角色: 8, 近战: 8, 远程: 8, 同律: 4 }

/** 全部槽位类型（顺序即界面展示顺序：角色 → 近战 → 远程 → 同律） */
export const TIMELINE_MOD_SLOT_TYPES = Object.keys(TIMELINE_MOD_SLOT_COUNTS) as TimelineModSlotType[]

/**
 * 角色槽位的装备。
 *
 * 每一项都是「覆盖值」：未设置时沿用该角色在构筑页的配置，
 * 这样同一名角色放进多个槽位时可以各自换武器 / 换魔之楔而不互相污染。
 */
export interface TimelineSlotLoadout {
    /** 近战武器 id */
    meleeWeapon?: number
    /** 远程武器 id */
    rangedWeapon?: number
    /** 中枢魔之楔（光环）id */
    auraMod?: number
    /** 各槽位类型的魔之楔编配 */
    mods?: Partial<Record<TimelineModSlotType, TimelineModSlot[]>>
}

/** 角色槽位：一个槽位对应一名角色与其全部轨道 */
export interface TimelineSlot {
    id: string
    /** 角色名；空串表示未分配角色 */
    charName: string
    tracks: TimelineTrackDef[]
    /** 装备覆盖（武器 / 魔之楔）；未设置时沿用构筑页配置 */
    loadout?: TimelineSlotLoadout
}

/**
 * 创建一份空槽位数组（各槽均为空槽）。
 * @param type 槽位类型
 * @returns 空槽位数组
 */
export function createEmptyModSlots(type: TimelineModSlotType): TimelineModSlot[] {
    return Array.from({ length: TIMELINE_MOD_SLOT_COUNTS[type] }, () => null)
}

/**
 * 取得槽位的装备对象（不存在时原地创建），用于承载「与构筑页不同的装备」。
 * @param slot 角色槽位
 * @returns 装备对象
 */
export function ensureSlotLoadout(slot: TimelineSlot): TimelineSlotLoadout {
    if (!slot.loadout) slot.loadout = {}
    return slot.loadout
}

/**
 * 取得指定类型的魔之楔槽位数组（不存在时按默认槽位数补齐）。
 * @param loadout 装备对象
 * @param type 槽位类型
 * @returns 可读写的槽位数组
 */
export function slotModSlots(loadout: TimelineSlotLoadout, type: TimelineModSlotType): TimelineModSlot[] {
    if (!loadout.mods) loadout.mods = {}
    const current = loadout.mods[type]
    if (!Array.isArray(current) || current.length !== TIMELINE_MOD_SLOT_COUNTS[type]) {
        const next = createEmptyModSlots(type)
        ;(current || []).slice(0, next.length).forEach((item, index) => {
            next[index] = item ?? null
        })
        loadout.mods[type] = next
        return next
    }
    return current
}

/**
 * 统计槽位装备的魔之楔总数。
 * @param loadout 装备对象
 * @returns 已装备的魔之楔数量
 */
export function countLoadoutMods(loadout: TimelineSlotLoadout): number {
    return TIMELINE_MOD_SLOT_TYPES.reduce((sum, type) => sum + (loadout.mods?.[type]?.filter(Boolean).length || 0), 0)
}

/** 时间块：技能块或 BUFF 块 */
export interface TimelineBlock {
    id: string
    /** 所属轨道 id */
    trackId: string
    /** 起始时间（秒） */
    startTime: number
    /** 持续时间（秒） */
    duration: number
    /** 技能名或 BUFF 名 */
    label: string
    /** BUFF 等级；有值即为 BUFF 块 */
    lv?: number
}

/** 时间线文档：编辑器的一份完整方案 */
export interface TimelineDoc {
    version: number
    name: string
    slots: TimelineSlot[]
    blocks: TimelineBlock[]
    /** 血量曲线采样点 [时间, 血量百分比][] */
    hp: [number, number][]
}

/** 数据结构版本，用于导入时校验与升级 */
export const TIMELINE_DOC_VERSION = 3

/** 槽位数量上限（界面固定 4 个角色栏） */
export const TIMELINE_SLOT_COUNT = 4

let idSeed = 0

/**
 * 生成文档内唯一 id。
 * @param prefix id 前缀
 * @returns 唯一 id
 */
export const nextTimelineId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idSeed++).toString(36)}`

/**
 * 创建轨道。
 * @param kind 轨道类型
 * @param name 轨道名
 * @returns 轨道定义
 */
export function createTrack(kind: TimelineTrackKind, name: string): TimelineTrackDef {
    return { id: nextTimelineId("track"), kind, name }
}

/**
 * 创建角色槽位；指定角色时默认带一条技能轨与一条 BUFF 轨。
 * @param charName 角色名，空串表示空槽位
 * @returns 角色槽位
 */
export function createSlot(charName = ""): TimelineSlot {
    const slot: TimelineSlot = { id: nextTimelineId("slot"), charName, tracks: [] }
    if (charName) {
        slot.tracks.push(createTrack("skill", "技能 1"), createTrack("buff", "BUFF 1"))
    }
    return slot
}

/**
 * 保证槽位至少有一条技能轨与一条 BUFF 轨（用于分配角色后补齐）。
 * @param slot 角色槽位
 */
export function ensureSlotTracks(slot: TimelineSlot) {
    if (!slot.charName) return
    if (!slot.tracks.some(track => track.kind === "skill")) {
        slot.tracks.unshift(createTrack("skill", `技能 ${slot.tracks.filter(t => t.kind === "skill").length + 1}`))
    }
    if (!slot.tracks.some(track => track.kind === "buff")) {
        slot.tracks.push(createTrack("buff", `BUFF ${slot.tracks.filter(t => t.kind === "buff").length + 1}`))
    }
}

/**
 * 创建空文档（4 个空槽位）。
 * @param name 方案名
 * @returns 空文档
 */
export function createEmptyDoc(name = ""): TimelineDoc {
    return {
        version: TIMELINE_DOC_VERSION,
        name,
        slots: Array.from({ length: TIMELINE_SLOT_COUNT }, () => createSlot()),
        blocks: [],
        hp: [],
    }
}

/**
 * 深拷贝文档（用于方案保存/载入，避免共享同一份响应式对象）。
 * @param doc 源文档
 * @returns 拷贝后的文档
 */
export function cloneDoc(doc: TimelineDoc): TimelineDoc {
    return JSON.parse(JSON.stringify(doc)) as TimelineDoc
}

/**
 * 按轨道 id 查找所属槽位与轨道。
 * @param doc 文档
 * @param trackId 轨道 id
 * @returns 槽位与轨道；未找到返回 undefined
 */
export function findTrack(doc: TimelineDoc, trackId: string) {
    for (const slot of doc.slots) {
        const track = slot.tracks.find(item => item.id === trackId)
        if (track) return { slot, track }
    }
    return undefined
}

/**
 * 统计文档的时间块数量与总时长。
 * @param doc 文档
 * @returns 块数量与总时长（秒）
 */
export function docSummary(doc: TimelineDoc) {
    const end = doc.blocks.reduce((max, block) => Math.max(max, block.startTime + block.duration), 0)
    const hpEnd = doc.hp.reduce((max, point) => Math.max(max, point[0]), 0)
    return { blocks: doc.blocks.length, duration: Math.max(end, hpEnd) }
}

/**
 * 序列化文档为 JSON 文本。
 * @param doc 文档
 * @returns JSON 文本
 */
export function serializeDoc(doc: TimelineDoc): string {
    return JSON.stringify(doc, null, 2)
}

/**
 * 补全一份来自文件的装备对象：丢弃越界槽位，补齐缺失槽位数。
 * @param raw 原始装备数据
 * @returns 装备对象；无有效内容时返回 undefined
 */
function parseLoadout(raw: unknown): TimelineSlotLoadout | undefined {
    if (!raw || typeof raw !== "object") return undefined
    const source = raw as TimelineSlotLoadout
    const loadout: TimelineSlotLoadout = {}
    // 武器 id 为 0 是有意义的覆盖值（空武器），必须保留，否则导入后会被构筑页配置顶掉；
    // 中枢魔之楔没有「无」这一选项，0 视为未覆盖。
    if (typeof source.meleeWeapon === "number" && source.meleeWeapon >= 0) loadout.meleeWeapon = source.meleeWeapon
    if (typeof source.rangedWeapon === "number" && source.rangedWeapon >= 0) loadout.rangedWeapon = source.rangedWeapon
    if (typeof source.auraMod === "number" && source.auraMod > 0) loadout.auraMod = source.auraMod
    if (source.mods && typeof source.mods === "object") {
        loadout.mods = {}
        for (const type of TIMELINE_MOD_SLOT_TYPES) {
            const slots = source.mods[type]
            if (!Array.isArray(slots)) continue
            const next = createEmptyModSlots(type)
            slots.slice(0, next.length).forEach((item, index) => {
                if (Array.isArray(item) && typeof item[0] === "number") next[index] = [item[0], Number(item[1]) || 0]
            })
            loadout.mods[type] = next
        }
    }
    return Object.keys(loadout).length > 0 ? loadout : undefined
}

/**
 * 解析 JSON 文本为文档，并做结构补全（兼容缺字段的旧文件）。
 * @param text JSON 文本
 * @returns 文档；解析失败返回 null
 */
export function parseDoc(text: string): TimelineDoc | null {
    try {
        const raw = JSON.parse(text) as Partial<TimelineDoc>
        if (!raw || typeof raw !== "object") return null
        const slots = Array.isArray(raw.slots) ? raw.slots : []
        const doc: TimelineDoc = {
            version: TIMELINE_DOC_VERSION,
            name: typeof raw.name === "string" && raw.name ? raw.name : "导入方案",
            slots: Array.from({ length: TIMELINE_SLOT_COUNT }, (_, index) => {
                const source = slots[index]
                const charName = typeof source?.charName === "string" ? source.charName : ""
                const tracks = Array.isArray(source?.tracks)
                    ? source.tracks
                          .filter(track => track && typeof track.name === "string")
                          .map(track => ({
                              id: typeof track.id === "string" ? track.id : nextTimelineId("track"),
                              kind: track.kind === "buff" ? ("buff" as const) : ("skill" as const),
                              name: track.name,
                          }))
                    : []
                return {
                    id: typeof source?.id === "string" ? source.id : nextTimelineId("slot"),
                    charName,
                    tracks,
                    loadout: parseLoadout(source?.loadout),
                }
            }),
            blocks: [],
            hp: Array.isArray(raw.hp) ? raw.hp.filter((point): point is [number, number] => Array.isArray(point) && point.length >= 2) : [],
        }
        // 时间块按轨道 id 归位，丢弃指向不存在轨道的块
        const trackIds = new Set(doc.slots.flatMap(slot => slot.tracks.map(track => track.id)))
        doc.blocks = Array.isArray(raw.blocks)
            ? raw.blocks
                  .filter(block => block && typeof block.label === "string" && trackIds.has(block.trackId))
                  .map(block => ({
                      id: typeof block.id === "string" ? block.id : nextTimelineId("b"),
                      trackId: block.trackId,
                      startTime: Math.max(0, Number(block.startTime) || 0),
                      duration: Math.max(0.1, Number(block.duration) || 0.1),
                      label: block.label,
                      lv: typeof block.lv === "number" ? block.lv : undefined,
                  }))
            : []
        for (const slot of doc.slots) ensureSlotTracks(slot)
        return doc
    } catch {
        return null
    }
}
