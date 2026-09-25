<script setup lang="ts">
/**
 * 时间线编辑器（独立工具）。
 *
 * 布局对齐 Endaxis：最左是仅图标的功能区，其右是「可折叠的技能库 / BUFF 库」独立一列，
 * 再右是时间轴——时间轴最左侧固定一列纵向排列的角色槽（头像 / 近战武器 / 远程武器 / 魔之楔），
 * 角色槽可拖动重排，整组轨道随之换位，右侧网格是按角色分组的轨道行。
 *
 * 数据契约使用自有的 `TimelineDoc`（角色槽 → 轨道 → 时间块），不依赖构筑页的「当前角色」与旧时间线存档；
 * 角色数值仍复用 `CharBuild` 结算，但槽位内的武器 / 魔之楔是**槽位级覆盖**，不会污染构筑页配置。
 * 交互统一走 Pointer 会话：一次按下到松开只存在一种语义（移动 / 缩放 / 框选 / 平移 / 血量点），
 * 时间换算统一为「客户端坐标 − 视口原点 + 滚动量 − 角色槽栏宽」，缩放保留鼠标锚点。
 */
import { useLocalStorage } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { groupBy } from "lodash-es"
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"

import type { CharSettings } from "@/composables/useCharSettings"
import { getModVariantAura, getModVariantSlots, useCharSettings } from "@/composables/useCharSettings"
import {
    buffData,
    CharBuild,
    charData,
    charMap,
    LeveledBuff,
    LeveledBuffHelper,
    LeveledCharHelper,
    LeveledModHelper,
    type LeveledSkillField,
    LeveledWeaponHelper,
    modData,
    weaponData,
} from "@/data"
import { createBuffSelectContext, isBuffSelectable } from "@/data/buffFilter"
import { getModBuffLvFromSetting, getWBuffLvFromSetting } from "@/data/effectLv"
import { collectPetBuffs, collectTraitBuffs, getEffectivePetLevel, getPetBaseCd, resolvePetCoverage } from "@/data/petTrait"
import {
    countLoadoutMods,
    createEmptyDoc,
    createEmptyModSlots,
    createTrack,
    ensureSlotLoadout,
    ensureSlotTracks,
    nextTimelineId,
    parseDoc,
    serializeDoc,
    slotModSlots,
    TIMELINE_MOD_SLOT_TYPES,
    type TimelineBlock,
    type TimelineDoc,
    type TimelineModSlot,
    type TimelineModSlotType,
    type TimelineSlot,
    type TimelineSlotLoadout,
    type TimelineTrackKind,
} from "@/data/timeline-doc"
import { useInvStore } from "@/store/inv"
import { useUIStore } from "@/store/ui"
import { formatProp, formatSkillProp } from "@/util"

const { t } = useTranslation()
const ui = useUIStore()

const MIN_PPS = 12
const MAX_PPS = 400
const LANE_HEIGHT = 40
const RULER_HEIGHT = 28
const CHART_HEIGHT = 72
const DEFAULT_END = 120
/** 角色槽卡宽度（时间轴左侧第一列） */
const RAIL_WIDTH = 272
/** 轨道名列宽度（时间轴左侧第二列，名称独立成列，不占用轨道内容） */
const TRACK_NAME_WIDTH = 108
/** 时间网格左边界：角色栏 + 轨道名列 */
const GRID_LEFT = RAIL_WIDTH + TRACK_NAME_WIDTH
/** 角色槽卡最小高度：头像行 + 近战 + 远程 + 魔之楔行 */
const SLOT_HEIGHT = 132
/** 默认角色（首次进入时填入第 1 个槽位） */
const DEFAULT_CHAR = charData.some(char => char.名称 === "赛琪") ? "赛琪" : charData[0]?.名称 || ""

/** 时间块在轨道内的垂直留白 */
const BLOCK_INSET = 6

/** MOD 品质筛选项（顺序即界面顺序） */
const MOD_QUALITIES = ["全部", "金", "紫", "蓝", "绿", "白"]

/** 血量曲线采样点 */
interface HealthPoint {
    id: string
    time: number
    value: number
}

/** 布局行：一条轨道 */
interface LaneRow {
    slotIndex: number
    trackId: string
    trackName: string
    kind: TimelineTrackKind
    top: number
    height: number
}

/** 布局行：一个角色槽（时间轴左侧固定列的卡片） */
interface SlotRow {
    slotIndex: number
    top: number
    height: number
}

/** Pointer 会话语义 */
type PointerMode = "move" | "resize-left" | "resize-right" | "marquee" | "pan" | "health"

interface PointerSession {
    mode: PointerMode
    startClientX: number
    startClientY: number
    startScrollLeft: number
    startScrollTop: number
    /** 本次交互显式命中的时间块（缩放边缘时可能未被选中） */
    targetId: string | null
    /** 按下瞬间目标块的起止快照，缩放始终以此为基准，避免逐帧累积 */
    targetStartTime: number
    targetDuration: number
    /** 拖拽时各成员的初始快照：起点时间、所属轨道与轨道类型 */
    origins: Map<string, { startTime: number; trackId: string; slotIndex: number; kind: TimelineTrackKind }>
    active: boolean
}

/** 库 → 轨道的拖拽负载 */
interface DragPayload {
    kind: TimelineTrackKind
    name: string
    /** BUFF 等级 */
    lv?: number
    /** 落轨后的默认时长（秒） */
    duration: number
}

// #region 文档与持久化

const working = useLocalStorage<TimelineDoc>("timeline-editor.working", createEmptyDoc())
const schemes = useLocalStorage<TimelineDoc[]>("timeline-editor.schemes", [])
/** 技能库列是否收起 */
const libCollapsed = useLocalStorage("timeline-editor.lib-collapsed", false)

const docName = ref(working.value.name || "")
const slots = reactive<TimelineSlot[]>(working.value.slots?.length ? working.value.slots : createEmptyDoc().slots)
const blocks = reactive<TimelineBlock[]>(working.value.blocks || [])
const healthPoints = reactive<HealthPoint[]>(
    (working.value.hp || []).map((point, index) => ({ id: `hp-${index}`, time: point[0], value: point[1] }))
)

if (slots.every(slot => !slot.charName)) {
    slots[0].charName = DEFAULT_CHAR
    ensureSlotTracks(slots[0])
}

/** 方案下拉里的名称输入 */
const schemeNameInput = ref(docName.value)

let persistTimer = 0

/**
 * 落盘当前文档（防抖，避免拖拽期间频繁写 localStorage）。
 */
const persistWorking = () => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
        working.value = {
            version: working.value.version,
            name: docName.value,
            slots: JSON.parse(JSON.stringify(slots)),
            blocks: blocks.map(block => ({ ...block })),
            hp: healthPoints.map(point => [point.time, point.value] as [number, number]),
        }
    }, 300) as unknown as number
}

watch([slots, blocks, healthPoints, docName], persistWorking, { deep: true })

/**
 * 用给定文档整体替换画布。
 * @param doc 目标文档
 */
const applyDoc = (doc: TimelineDoc) => {
    docName.value = doc.name
    schemeNameInput.value = doc.name
    slots.splice(0, slots.length, ...JSON.parse(JSON.stringify(doc.slots)))
    blocks.splice(0, blocks.length, ...doc.blocks.map(block => ({ ...block })))
    healthPoints.splice(0, healthPoints.length, ...doc.hp.map((point, index) => ({ id: `hp-${index}`, time: point[0], value: point[1] })))
    selectedIds.value.clear()
    recomputeAllProps()
    nextTick(resetView)
}

// #endregion

// #region 时间坐标与缩放

const pps = ref(56)
const viewportRef = ref<HTMLElement | null>(null)
const chartRef = ref<HTMLElement | null>(null)
const scrollLeft = ref(0)
const scrollTop = ref(0)
/** 视口在定位父元素内的顶部偏移，供框选层换算 */
const viewportTop = ref(0)

/**
 * 时间（秒）→ 内容像素。
 * @param time 时间（秒）
 * @returns 像素偏移
 */
const timeToPx = (time: number) => time * pps.value

/**
 * 内容像素 → 时间（秒）。
 * @param px 像素偏移
 * @returns 时间（秒）
 */
const pxToTime = (px: number) => px / pps.value

/**
 * 客户端坐标 → 内容坐标（含滚动量）。
 * 内容坐标以整个滚动内容左上角为原点，因此横向包含角色槽栏宽度。
 * @param clientX 客户端 X
 * @param clientY 客户端 Y
 * @returns 内容坐标
 */
function clientToContent(clientX: number, clientY: number) {
    const rect = viewportRef.value?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
        x: clientX - rect.left + (viewportRef.value?.scrollLeft || 0),
        y: clientY - rect.top + (viewportRef.value?.scrollTop || 0),
    }
}

/**
 * 内容 X → 时间（秒）：减去角色栏与轨道名列的宽度得到网格内偏移。
 * @param contentX 内容 X
 * @returns 时间（秒）
 */
const contentXToTime = (contentX: number) => pxToTime(contentX - GRID_LEFT)

/**
 * 客户端 X → 时间（秒）。
 * @param clientX 客户端 X
 * @returns 时间（秒）
 */
const clientXToTime = (clientX: number) => contentXToTime(clientToContent(clientX, 0).x)

/**
 * 按当前缩放选择吸附步长：放大到 1px 不足 0.05s 时改用帧级（1/60s）吸附。
 * @returns 吸附步长（秒）
 */
const snapStep = () => (pps.value > 0 && 1 / pps.value < 0.05 ? 1 / 60 : 0.05)

/**
 * 时间吸附到当前栅格（不小于 0）。
 * @param time 原始时间
 * @returns 吸附后的时间
 */
const snapTime = (time: number) => {
    const step = snapStep()
    return Math.max(0, +(Math.round(time / step) * step).toFixed(4))
}

/**
 * 格式化时间：mm:ss.mmm。
 * @param seconds 秒
 * @returns 时间文本
 */
const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.round((seconds % 1) * 1000)
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`
}

/**
 * 格式化时长。
 * @param seconds 秒
 * @returns 时长文本
 */
const formatDuration = (seconds: number): string => {
    if (seconds >= 1) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 2)}s`
    return `${Math.round(seconds * 1000)}ms`
}

let wheelRaf = 0
let pendingWheel: { deltaY: number; deltaX: number; ctrl: boolean; shift: boolean; clientX: number } | null = null

/**
 * 滚轮：Ctrl 缩放（保留鼠标锚点），Shift / 横向滚动平移。
 * @param event 滚轮事件
 */
const onWheel = (event: WheelEvent) => {
    const isZoom = event.ctrlKey || event.metaKey
    const isPan = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)
    if (!isZoom && !isPan) return
    event.preventDefault()
    pendingWheel = { deltaY: event.deltaY, deltaX: event.deltaX, ctrl: isZoom, shift: isPan, clientX: event.clientX }
    if (wheelRaf) return
    wheelRaf = requestAnimationFrame(() => {
        wheelRaf = 0
        const payload = pendingWheel
        pendingWheel = null
        if (!payload) return
        if (payload.ctrl) {
            zoomBy(payload.deltaY < 0 ? 1.1 : 1 / 1.1, payload.clientX)
        } else if (viewportRef.value) {
            viewportRef.value.scrollLeft += payload.shift ? payload.deltaY || payload.deltaX : payload.deltaX
        }
    })
}

/**
 * 刷新视口在定位父元素内的顶部偏移。
 */
const updateViewportTop = () => {
    viewportTop.value = viewportRef.value?.offsetTop || 0
}

/**
 * 按倍率缩放并保持给定 X 对应的时间不动。
 * @param factor 缩放倍率
 * @param anchorClientX 锚点客户端 X；为空时以网格区中心为锚点
 */
const zoomBy = (factor: number, anchorClientX?: number) => {
    const viewport = viewportRef.value
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const anchorX = anchorClientX === undefined ? rect.left + GRID_LEFT + (rect.width - GRID_LEFT) / 2 : anchorClientX
    const gridOffset = anchorX - rect.left - GRID_LEFT
    const anchorTime = pxToTime(viewport.scrollLeft + gridOffset)
    pps.value = Math.max(MIN_PPS, Math.min(MAX_PPS, pps.value * factor))
    nextTick(() => {
        viewport.scrollLeft = timeToPx(anchorTime) - gridOffset
    })
}

/**
 * 重置视图到默认缩放并回到起点。
 */
const resetView = () => {
    pps.value = 56
    nextTick(() => {
        if (viewportRef.value) viewportRef.value.scrollLeft = 0
    })
}

/**
 * 同步滚动状态（供刻度、框选层与曲线联动）。
 */
const onScroll = () => {
    scrollLeft.value = viewportRef.value?.scrollLeft || 0
    scrollTop.value = viewportRef.value?.scrollTop || 0
    if (chartRef.value && viewportRef.value && chartRef.value.scrollLeft !== viewportRef.value.scrollLeft) {
        chartRef.value.scrollLeft = viewportRef.value.scrollLeft
    }
}

/**
 * 曲线区横向滚动时反向同步主视口。
 */
const onChartScroll = () => {
    if (chartRef.value && viewportRef.value && viewportRef.value.scrollLeft !== chartRef.value.scrollLeft) {
        viewportRef.value.scrollLeft = chartRef.value.scrollLeft
    }
}

const zoomPercent = computed(() => Math.round((pps.value / 56) * 100))

// #endregion

// #region 布局

/**
 * 角色槽行与轨道行的纵向布局。
 * 每个角色占一条与其轨道共行的「band」：左列角色卡、中列轨道名、右侧轨道内容处于同一水平带，
 * band 高度取「角色卡最小高度」与「该角色全部轨道高度」的较大者。
 */
const layout = computed(() => {
    const slotRows: SlotRow[] = []
    const rows: LaneRow[] = []
    let y = 0
    slots.forEach((slot, slotIndex) => {
        const bandHeight = Math.max(SLOT_HEIGHT, slot.tracks.length * LANE_HEIGHT)
        slotRows.push({ slotIndex, top: y, height: bandHeight })
        let laneY = y
        for (const track of slot.tracks) {
            rows.push({ slotIndex, trackId: track.id, trackName: track.name, kind: track.kind, top: laneY, height: LANE_HEIGHT })
            laneY += LANE_HEIGHT
        }
        y += bandHeight
    })
    return { slotRows, rows, height: y }
})

const contentHeight = computed(() => RULER_HEIGHT + layout.value.height)
const timelineEndTime = computed(() => {
    const lastBlockEnd = blocks.reduce((max, block) => Math.max(max, block.startTime + block.duration), 0)
    const lastHp = healthPoints.reduce((max, point) => Math.max(max, point.time), 0)
    return Math.max(DEFAULT_END, Math.ceil(Math.max(lastBlockEnd, lastHp) + 10))
})
const contentWidth = computed(() => timeToPx(timelineEndTime.value))

/**
 * 按轨道 id 取时间块（保持插入顺序）。
 * @param trackId 轨道 id
 * @returns 该轨道的时间块
 */
const blocksOfTrack = (trackId: string) => blocks.filter(block => block.trackId === trackId)

/**
 * 定位时间块所属槽位序号。
 * @param trackId 轨道 id
 * @returns 槽位序号；未找到返回 -1
 */
const slotIndexOfTrack = (trackId: string) => slots.findIndex(slot => slot.tracks.some(track => track.id === trackId))

/**
 * 按轨道 id 查找所属槽位与轨道。
 * @param trackId 轨道 id
 * @returns 槽位与轨道；未找到返回 undefined
 */
const localTrack = (trackId: string) => {
    for (const slot of slots) {
        const track = slot.tracks.find(item => item.id === trackId)
        if (track) return { slot, track }
    }
    return undefined
}

/**
 * 按客户端 Y 命中轨道行（不含角色槽卡的空白区）。
 * @param clientY 客户端 Y
 * @returns 命中的轨道行；未命中返回 null
 */
const laneAtClientY = (clientY: number) => {
    const { y } = clientToContent(0, clientY)
    const localY = y - RULER_HEIGHT
    return layout.value.rows.find(row => localY >= row.top && localY < row.top + row.height) ?? null
}

const selectedIds = ref<Set<string>>(new Set())
const hoveredBlockId = ref<string | null>(null)
const session = ref<PointerSession | null>(null)
const marquee = reactive({ active: false, startX: 0, startY: 0, endX: 0, endY: 0 })

/**
 * 清空选区。
 */
const clearSelection = () => selectedIds.value.clear()

/**
 * 选中单个时间块。
 * @param id 时间块 id
 */
const selectOnly = (id: string) => {
    selectedIds.value.clear()
    selectedIds.value.add(id)
}

/**
 * 判断时间块是否选中。
 * @param block 时间块
 * @returns 是否选中
 */
const isSelected = (block: TimelineBlock) => selectedIds.value.has(block.id)

/**
 * 时间块样式（左/宽按统一时间坐标换算）。
 * @param block 时间块
 * @returns 样式对象
 */
const blockStyle = (block: TimelineBlock) => ({
    left: `${timeToPx(block.startTime)}px`,
    width: `${Math.max(6, timeToPx(block.duration))}px`,
    top: `${BLOCK_INSET}px`,
    height: `${LANE_HEIGHT - BLOCK_INSET * 2}px`,
    backgroundColor: blockColor(block),
})

const SKILL_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#0ea5e9", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"]
const BUFF_COLORS = ["#10b981", "#22c55e", "#84cc16", "#65a30d"]

/**
 * 按标签稳定散列取块配色（技能与 BUFF 各用一套色系）。
 * @param block 时间块
 * @returns 颜色值
 */
const blockColor = (block: TimelineBlock) => {
    let hash = 0
    for (let i = 0; i < block.label.length; i++) hash = (hash * 31 + block.label.charCodeAt(i)) >>> 0
    const palette = block.lv ? BUFF_COLORS : SKILL_COLORS
    return palette[hash % palette.length]
}

// #endregion

// #region 轨道增删与重命名

const editTrackId = ref("")
const editTrackName = ref("")

/**
 * 为槽位添加轨道。
 * @param slotIndex 槽位序号
 * @param kind 轨道类型
 */
const addTrack = (slotIndex: number, kind: TimelineTrackKind) => {
    const slot = slots[slotIndex]
    if (!slot) return
    const count = slot.tracks.filter(track => track.kind === kind).length + 1
    const track = createTrack(kind, kind === "skill" ? `技能 ${count}` : `BUFF ${count}`)
    if (kind === "buff") slot.tracks.push(track)
    else {
        const firstBuff = slot.tracks.findIndex(item => item.kind === "buff")
        if (firstBuff === -1) slot.tracks.push(track)
        else slot.tracks.splice(firstBuff, 0, track)
    }
}

/**
 * 删除轨道及其时间块。
 * @param trackId 轨道 id
 */
const removeTrack = (trackId: string) => {
    const slotIndex = slotIndexOfTrack(trackId)
    if (slotIndex === -1) return
    const slot = slots[slotIndex]
    for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].trackId === trackId) {
            selectedIds.value.delete(blocks[i].id)
            delete blockProps[blocks[i].id]
            blocks.splice(i, 1)
        }
    }
    slot.tracks.splice(
        slot.tracks.findIndex(track => track.id === trackId),
        1
    )
}

/**
 * 进入轨道重命名。
 * @param trackId 轨道 id
 * @param name 当前名称
 */
const startEditTrackName = (trackId: string, name: string) => {
    editTrackId.value = trackId
    editTrackName.value = name
    nextTick(() => {
        const input = document.getElementById(`track-name-input`) as HTMLInputElement | null
        input?.focus()
        input?.select()
    })
}

/**
 * 提交轨道重命名。
 */
const finishEditTrackName = () => {
    if (!editTrackId.value) return
    const trimmed = editTrackName.value.trim()
    const found = localTrack(editTrackId.value)
    if (!trimmed) {
        ui.showErrorMessage(t("timeline.trackNameRequired"))
    } else if (trimmed.length > 30) {
        ui.showErrorMessage(t("timeline.trackNameTooLong"))
    } else if (found) {
        found.track.name = trimmed
    }
    editTrackId.value = ""
}

// #endregion

// #region 角色槽：角色、武器与构建

const inv = useInvStore()
const charOptions = charData.map(char => ({ value: char.名称, label: char.名称, elm: char.属性 }))

/**
 * 角色头像地址。
 * @param name 角色名
 * @returns 头像 URL
 */
const charIcon = (name: string) => {
    const icon = charMap.get(name)?.icon
    return icon ? `/imgs/webp/T_Head_${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 武器图标地址。
 * @param id 武器 id
 * @returns 图标 URL；未找到时返回空头像
 */
const weaponIcon = (id: number) => {
    try {
        return LeveledWeaponHelper.fromId(id)?.url || "/imgs/webp/T_Head_Empty.webp"
    } catch {
        return "/imgs/webp/T_Head_Empty.webp"
    }
}

/**
 * 近战武器下拉选项（按类别分组）。
 */
const meleeWeaponOptions = weaponData.filter(weapon => weapon.类型[0] === "近战")

/**
 * 远程武器下拉选项（按类别分组）。
 */
const rangedWeaponOptions = weaponData.filter(weapon => weapon.类型[0] === "远程")

/** 空武器在下拉中的哨兵值：id 0 无法作为可选项传递，统一改用该字符串 */
const EMPTY_WEAPON = "-"

/**
 * 武器下拉的显示值：未装备（id 为 0）时用哨兵，保证「空武器」项能被选中。
 * @param id 武器 id
 * @returns 下拉值
 */
const weaponSelectValue = (id: number) => (id > 0 ? id : EMPTY_WEAPON)

/**
 * 把武器下拉返回值还原成武器 id。
 * @param value 下拉值
 * @returns 武器 id；选择空武器时为 0
 */
const weaponSelectToId = (value: unknown) => (value === EMPTY_WEAPON ? 0 : Number(value) || 0)

const activeSlotIndex = ref(0)
const activeSlot = computed(() => slots[activeSlotIndex.value])

const slotCharIds = computed(() => slots.map(slot => charMap.get(slot.charName)?.id || 0))
const slotSettings = [
    useCharSettings(computed(() => slotCharIds.value[0])),
    useCharSettings(computed(() => slotCharIds.value[1])),
    useCharSettings(computed(() => slotCharIds.value[2])),
    useCharSettings(computed(() => slotCharIds.value[3])),
]

/**
 * 按槽位角色名与设置构造角色构建。
 *
 * 槽位的装备覆盖只作用于这一次构造，不写回构筑页配置；
 * 覆盖存在时强制读「配置 A」的槽位字段（覆盖数组正是写在 A 的字段上）。
 * @param charName 角色名
 * @param settings 角色设置
 * @param loadout 槽位装备覆盖
 * @returns 角色构建
 */
function createSlotBuild(charName: string, settings: CharSettings, loadout?: TimelineSlotLoadout) {
    const char = LeveledCharHelper.fromId(charName, settings.charLevel)
    const petLevel = getEffectivePetLevel(settings.petLevel, settings.traits)
    const petCoverage = resolvePetCoverage(settings.petId, petLevel, settings.traits, settings.petCoverage, settings.petAutoCoverage)
    const effective: CharSettings = loadout ? { ...settings, modVariantIndex: 0 } : settings
    // 槽位覆盖允许显式置 0（空武器），因此武器用 undefined 判定是否覆盖，而非真值判定；
    // 中枢魔之楔没有「无」这一选项，0 视为未覆盖，避免 fromId(0) 查表抛错。
    if (loadout?.meleeWeapon !== undefined) effective.meleeWeapon = loadout.meleeWeapon
    if (loadout?.rangedWeapon !== undefined) effective.rangedWeapon = loadout.rangedWeapon
    if (loadout?.auraMod) effective.auraMod = loadout.auraMod
    if (loadout?.mods) {
        if (loadout.mods.角色) effective.charMods = loadout.mods.角色
        if (loadout.mods.近战) effective.meleeMods = loadout.mods.近战
        if (loadout.mods.远程) effective.rangedMods = loadout.mods.远程
        if (loadout.mods.同律) effective.skillWeaponMods = loadout.mods.同律
    }
    const getBuffLv = (modId: number) => (effective.useGlobal ? inv.getBuffLv(modId) : getModBuffLvFromSetting(effective.effectConfig, modId))
    const getWBuffLv = (weaponId: number) =>
        effective.useGlobal ? inv.getWBuffLv(weaponId, char.属性) : getWBuffLvFromSetting(effective.effectConfig, weaponId, char.属性)
    return new CharBuild({
        char,
        auraMod: LeveledModHelper.fromId(getModVariantAura(effective)),
        charMods: getModVariantSlots(effective, "角色")
            .filter(mod => mod !== null)
            .map(m => LeveledModHelper.fromId(m[0], m[1], getBuffLv(m[0]))),
        meleeMods: getModVariantSlots(effective, "近战")
            .filter(mod => mod !== null)
            .map(m => LeveledModHelper.fromId(m[0], m[1], getBuffLv(m[0]))),
        rangedMods: getModVariantSlots(effective, "远程")
            .filter(mod => mod !== null)
            .map(m => LeveledModHelper.fromId(m[0], m[1], getBuffLv(m[0]))),
        skillMods: getModVariantSlots(effective, "同律")
            .filter(mod => mod !== null)
            .map(m => LeveledModHelper.fromId(m[0], m[1], getBuffLv(m[0]))),
        skillLevel: settings.charSkillLevel,
        buffs: [
            ...settings.buffs
                .map(v => {
                    try {
                        return LeveledBuffHelper.fromName(v[0], v[1])
                    } catch {
                        return null
                    }
                })
                .filter((b): b is LeveledBuff => b !== null),
            ...collectTraitBuffs(settings.traits),
            ...collectPetBuffs(settings.petId, petLevel, petCoverage),
        ],
        petBaseCd: getPetBaseCd(settings.petId),
        melee: LeveledWeaponHelper.fromId(effective.meleeWeapon, settings.meleeWeaponRefine, settings.meleeWeaponLevel, getWBuffLv(effective.meleeWeapon)),
        ranged: LeveledWeaponHelper.fromId(
            effective.rangedWeapon,
            settings.rangedWeaponRefine,
            settings.rangedWeaponLevel,
            getWBuffLv(effective.rangedWeapon)
        ),
        baseName: settings.baseName,
        imbalance: settings.imbalance,
        hpPercent: settings.hpPercent,
        resonanceGain: settings.resonanceGain,
        enemyId: settings.enemyId,
        enemyLevel: settings.enemyLevel,
        enemyResistance: settings.enemyResistance,
        targetFunction: settings.targetFunction,
        teamWeapons: [settings.team1Weapon, settings.team2Weapon],
    })
}

/**
 * 各槽位的角色构建（未分配角色为空）。
 */
const slotBuilds = computed(() =>
    slots.map((slot, index) => {
        const settings = slotSettings[index]?.value
        return slot.charName && settings ? createSlotBuild(slot.charName, settings, slot.loadout) : null
    })
)

const activeBuild = computed(() => slotBuilds.value[activeSlotIndex.value])

/**
 * 取槽位的装备覆盖对象（不存在时不创建，用于只读读取）。
 * @param slotIndex 槽位序号
 * @returns 装备覆盖
 */
const slotLoadout = (slotIndex: number) => slots[slotIndex]?.loadout

/**
 * 取槽位的装备覆盖对象，不存在时创建。
 * @param slotIndex 槽位序号
 * @returns 装备覆盖；槽位不存在返回 undefined
 */
const writeLoadout = (slotIndex: number) => {
    const slot = slots[slotIndex]
    return slot ? ensureSlotLoadout(slot) : undefined
}

/**
 * 槽位生效的近战武器 id（未覆盖时取构筑页配置）。
 * @param slotIndex 槽位序号
 * @returns 武器 id
 */
const slotMeleeWeapon = (slotIndex: number) => slotLoadout(slotIndex)?.meleeWeapon ?? slotSettings[slotIndex]?.value.meleeWeapon ?? 0

/**
 * 槽位生效的远程武器 id（未覆盖时取构筑页配置）。
 * @param slotIndex 槽位序号
 * @returns 武器 id
 */
const slotRangedWeapon = (slotIndex: number) => slotLoadout(slotIndex)?.rangedWeapon ?? slotSettings[slotIndex]?.value.rangedWeapon ?? 0

/**
 * 改写槽位近战武器。
 * @param slotIndex 槽位序号
 * @param id 下拉值（武器 id 或空武器哨兵）
 */
const setSlotMeleeWeapon = (slotIndex: number, id: unknown) => {
    const loadout = writeLoadout(slotIndex)
    if (!loadout) return
    loadout.meleeWeapon = weaponSelectToId(id)
    recomputeAllProps()
}

/**
 * 改写槽位远程武器。
 * @param slotIndex 槽位序号
 * @param id 下拉值（武器 id 或空武器哨兵）
 */
const setSlotRangedWeapon = (slotIndex: number, id: unknown) => {
    const loadout = writeLoadout(slotIndex)
    if (!loadout) return
    loadout.rangedWeapon = weaponSelectToId(id)
    recomputeAllProps()
}

/**
 * 槽位生效的某类魔之楔槽位：未覆盖时直接展示构筑页当前生效的配置。
 * @param slotIndex 槽位序号
 * @param type 槽位类型
 * @returns 槽位数组（只读）
 */
const effectiveModSlots = (slotIndex: number, type: TimelineModSlotType): TimelineModSlot[] => {
    const override = slotLoadout(slotIndex)?.mods?.[type]
    if (override) return override
    const settings = slotSettings[slotIndex]?.value
    if (!settings) return createEmptyModSlots(type)
    return getModVariantSlots(settings, type)
}

/**
 * 取槽位某类魔之楔槽位的可写数组：首次修改时以当前生效配置为基准复制，避免丢掉构筑页的编配。
 * @param slotIndex 槽位序号
 * @param type 槽位类型
 * @returns 可写槽位数组
 */
const modSlotWriter = (slotIndex: number, type: TimelineModSlotType): TimelineModSlot[] => {
    const loadout = writeLoadout(slotIndex)
    if (!loadout) return []
    if (!loadout.mods?.[type]) {
        const baseline = effectiveModSlots(slotIndex, type)
        const copy = createEmptyModSlots(type)
        baseline.slice(0, copy.length).forEach((item, index) => {
            copy[index] = item ? ([item[0], item[1]] as [number, number]) : null
        })
        loadout.mods = { ...(loadout.mods || {}), [type]: copy }
    }
    return slotModSlots(loadout, type)
}

/**
 * 槽位已装备的魔之楔数量（有覆盖时统计覆盖，否则统计构筑页配置）。
 * @param slotIndex 槽位序号
 * @returns 数量
 */
const modEquippedCount = (slotIndex: number) => {
    const loadout = slotLoadout(slotIndex)
    if (loadout?.mods) return countLoadoutMods(loadout)
    return TIMELINE_MOD_SLOT_TYPES.reduce((sum, type) => sum + effectiveModSlots(slotIndex, type).filter(Boolean).length, 0)
}

// 槽位角色变化时补齐默认轨道，并刷新已有块的数值快照
watch(
    () => slots.map(slot => slot.charName),
    names => {
        slots.forEach((slot, index) => {
            if (names[index]) ensureSlotTracks(slot)
        })
        recomputeAllProps()
    }
)

// #endregion

// #region 角色槽拖动重排

const slotDragFrom = ref(-1)
const slotDragTarget = ref(-1)

/**
 * 按客户端 Y 命中角色槽卡片序号。
 * @param clientY 客户端 Y
 * @returns 槽位序号
 */
const slotIndexAtClientY = (clientY: number) => {
    const { y } = clientToContent(0, clientY)
    const localY = y - RULER_HEIGHT
    const rows = layout.value.slotRows
    for (const row of rows) {
        if (localY >= row.top && localY < row.top + row.height) return row.slotIndex
    }
    return localY < 0 ? 0 : rows.length - 1
}

/**
 * 手柄按下：进入角色槽拖动排序会话。
 * @param event 指针事件
 * @param slotIndex 起始槽位序号
 */
const onSlotHandleDown = (event: PointerEvent, slotIndex: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    slotDragFrom.value = slotIndex
    slotDragTarget.value = slotIndex
    window.addEventListener("pointermove", onSlotDragMove)
    window.addEventListener("pointerup", onSlotDragUp)
    window.addEventListener("pointercancel", onSlotDragUp)
}

/**
 * 拖动中：更新落点高亮。
 * @param event 指针事件
 */
const onSlotDragMove = (event: PointerEvent) => {
    if (slotDragFrom.value < 0) return
    slotDragTarget.value = slotIndexAtClientY(event.clientY)
}

/**
 * 拖动结束：按落点重排角色槽（轨道与时间块随槽位一起换位）。
 */
const onSlotDragUp = () => {
    const from = slotDragFrom.value
    const to = slotDragTarget.value
    if (from >= 0 && to >= 0 && from !== to) {
        const [moved] = slots.splice(from, 1)
        slots.splice(to, 0, moved)
        activeSlotIndex.value = to
    }
    slotDragFrom.value = -1
    slotDragTarget.value = -1
    window.removeEventListener("pointermove", onSlotDragMove)
    window.removeEventListener("pointerup", onSlotDragUp)
    window.removeEventListener("pointercancel", onSlotDragUp)
}

// #endregion

// #region 技能库 / BUFF 库

/** 技能库当前页签 */
const libTab = ref<TimelineTrackKind>("skill")

/**
 * 解析技能的默认落轨时长：召唤物持续时间 → 持续时间字段 → 冷却 → 1s。
 * @param skill 技能
 * @returns 默认时长（秒）
 */
function resolveSkillDuration(skill: { 字段?: { 名称: string; 值: number }[]; 召唤物持续时间?: { 值: number }; skillData?: { cd?: number } }) {
    const summon = skill.召唤物持续时间?.值
    if (summon && summon > 0) return summon
    const durationField = skill.字段?.find(field => field.名称.includes("持续时间"))
    if (durationField?.值 && durationField.值 > 0) return durationField.值
    const cd = skill.skillData?.cd
    if (cd && cd > 0) return cd
    return 1
}

/**
 * 当前槽位的技能库。
 */
const skillLibrary = computed(() => {
    const build = activeBuild.value
    if (!build) return []
    return build.allSkills.map(skill => ({
        name: skill.名称,
        type: skill.类型,
        duration: resolveSkillDuration(skill),
        icon: skill.url,
    }))
})

/**
 * 当前槽位的 BUFF 库。
 */
const buffLibrary = computed(() => {
    const build = activeBuild.value
    const settings = slotSettings[activeSlotIndex.value]?.value
    if (!build || !settings) return []
    const ctx = createBuffSelectContext({
        charElm: build.char.属性,
        mainIds: [charMap.get(activeSlot.value?.charName || "")?.id, build.meleeWeapon?.id, build.rangedWeapon?.id].filter(
            (id): id is number => typeof id === "number" && id > 0
        ),
        phantomIds: [
            charMap.get(settings.team1 as string)?.id,
            charMap.get(settings.team2 as string)?.id,
            settings.team1Weapon as number,
            settings.team2Weapon as number,
        ].filter((id): id is number => typeof id === "number"),
    })
    return buffData.filter(buff => isBuffSelectable(buff, ctx)).map(buff => ({ name: buff.名称, mx: buff.mx ?? 1 }))
})

/** BUFF 库中各 BUFF 的落轨等级（默认 1） */
const buffLvs = reactive<Record<string, number>>({})

/**
 * 取 BUFF 的落轨等级。
 * @param name BUFF 名
 * @returns 等级
 */
const buffLvOf = (name: string) => buffLvs[name] || 1

/**
 * 调整 BUFF 落轨等级。
 * @param name BUFF 名
 * @param mx 最大等级
 * @param delta 变化量
 */
const stepBuffLv = (name: string, mx: number, delta: number) => {
    const next = Math.min(mx, Math.max(1, (buffLvs[name] || 1) + delta))
    buffLvs[name] = next
}

// #endregion

// #region 时间块增删与数值快照

/** 时间块的属性快照（不落盘，按插入时/载入时的构建计算） */
const blockProps = reactive<Record<string, unknown>>({})

/**
 * 计算单个时间块的属性快照。
 * @param block 时间块
 */
const computeProps = (block: TimelineBlock) => {
    const slotIndex = slotIndexOfTrack(block.trackId)
    const build = slotBuilds.value[slotIndex]
    if (!build) {
        delete blockProps[block.id]
        return
    }
    if (block.lv) {
        try {
            blockProps[block.id] = LeveledBuffHelper.fromName(block.label, block.lv).getProperties()
        } catch {
            delete blockProps[block.id]
        }
        return
    }
    const skill = build.allSkills.find(item => item.名称 === block.label)
    if (!skill) {
        delete blockProps[block.id]
        return
    }
    blockProps[block.id] = skill.getFieldsWithAttr(build.calculateAttributes())
}

/**
 * 重算全部时间块的属性快照。
 */
const recomputeAllProps = () => {
    for (const block of blocks) computeProps(block)
}

/** 技能块的字段快照（供 tooltip 渲染） */
const skillFieldsOf = (block: TimelineBlock) => (block.lv ? undefined : (blockProps[block.id] as LeveledSkillField[] | undefined))

/** BUFF 块的属性快照（供 tooltip 渲染） */
const buffPropsOf = (block: TimelineBlock) => (block.lv ? (blockProps[block.id] as Record<string, number> | undefined) : undefined)

/**
 * 在指定轨道与时间插入时间块。
 * @param trackId 轨道 id
 * @param startTime 起始时间（秒）
 * @param payload 拖拽负载
 * @returns 新时间块
 */
const addBlock = (trackId: string, startTime: number, payload: DragPayload): TimelineBlock => {
    const block: TimelineBlock = {
        id: nextTimelineId("b"),
        trackId,
        startTime: snapTime(startTime),
        duration: Math.max(0.1, payload.duration),
        label: payload.name,
    }
    if (payload.kind === "buff") block.lv = payload.lv || 1
    const slotIndex = slotIndexOfTrack(trackId)
    const build = slotBuilds.value[slotIndex]
    if (build) {
        if (block.lv) {
            try {
                blockProps[block.id] = LeveledBuffHelper.fromName(block.label, block.lv).getProperties()
            } catch {
                /* 未收录的 BUFF 不展示属性 */
            }
        } else {
            const skill = build.allSkills.find(item => item.名称 === block.label)
            if (skill) {
                const attrs = build.calculateAttributes()
                blockProps[block.id] = skill.getFieldsWithAttr(attrs)
                const summon = skill.召唤物持续时间
                if (summon?.值) block.duration = Math.max(0.1, summon.值)
            }
        }
    }
    blocks.push(block)
    selectOnly(block.id)
    return block
}

/**
 * 删除指定时间块。
 * @param id 时间块 id
 */
const removeBlock = (id: string) => {
    const index = blocks.findIndex(block => block.id === id)
    if (index !== -1) blocks.splice(index, 1)
    selectedIds.value.delete(id)
    delete blockProps[id]
}

/**
 * 删除当前选中的时间块。
 */
const deleteSelectedBlocks = () => {
    if (selectedIds.value.size === 0) return
    for (let i = blocks.length - 1; i >= 0; i--) {
        if (selectedIds.value.has(blocks[i].id)) {
            delete blockProps[blocks[i].id]
            blocks.splice(i, 1)
        }
    }
    selectedIds.value.clear()
}

// #endregion

// #region 库 → 轨道拖拽

const dragPayload = ref<DragPayload | null>(null)
const dragPreview = reactive({ trackId: "", time: 0, duration: 1, valid: false })

/**
 * 库条目开始拖拽。
 * @param event 拖拽事件
 * @param payload 拖拽负载
 */
const onLibDragStart = (event: DragEvent, payload: DragPayload) => {
    dragPayload.value = payload
    event.dataTransfer?.setData("text/plain", payload.name)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy"
}

/**
 * 拖拽结束：清理负载与预览。
 */
const onLibDragEnd = () => {
    dragPayload.value = null
    dragPreview.trackId = ""
    dragPreview.valid = false
}

/**
 * 拖拽悬停轨道：命中同类型轨道时给出落点预览。
 * @param event 拖拽事件
 * @param row 轨道行
 */
const onLaneDragOver = (event: DragEvent, row: LaneRow) => {
    const payload = dragPayload.value
    if (!payload) return
    event.preventDefault()
    if (payload.kind !== row.kind) {
        dragPreview.valid = false
        dragPreview.trackId = ""
        return
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    dragPreview.valid = true
    dragPreview.trackId = row.trackId
    dragPreview.duration = payload.duration
    dragPreview.time = snapTime(clientXToTime(event.clientX))
}

/**
 * 离开轨道行时清除预览。
 * @param row 轨道行
 */
const onLaneDragLeave = (row: LaneRow) => {
    if (dragPreview.trackId === row.trackId) dragPreview.trackId = ""
}

/**
 * 落下：按落点时间插入时间块，类型不匹配时提示。
 * @param event 拖拽事件
 * @param row 轨道行
 */
const onLaneDrop = (event: DragEvent, row: LaneRow) => {
    const payload = dragPayload.value
    if (!payload) return
    event.preventDefault()
    if (payload.kind !== row.kind) {
        ui.showErrorMessage(t("timeline.kindMismatch"))
        onLibDragEnd()
        return
    }
    activeSlotIndex.value = row.slotIndex
    addBlock(row.trackId, clientXToTime(event.clientX), payload)
    onLibDragEnd()
}

/**
 * 拖拽预览样式。
 */
const previewStyle = computed(() => ({
    left: `${timeToPx(dragPreview.time)}px`,
    width: `${Math.max(6, timeToPx(dragPreview.duration))}px`,
    top: `${BLOCK_INSET}px`,
    height: `${LANE_HEIGHT - BLOCK_INSET * 2}px`,
}))

// #endregion

// #region Pointer 会话

/**
 * 统一的 Pointer 按下入口：按命中目标确定本次会话语义。
 * @param event 指针事件
 * @param block 命中的时间块（可为空）
 * @param edge 命中的边缘
 */
const onPointerDown = (event: PointerEvent, block?: TimelineBlock, edge?: "left" | "right") => {
    if (event.button === 1) {
        event.preventDefault()
        startSession("pan", event, null)
        return
    }
    if (event.button !== 0) return

    if (block) {
        // 缩放边缘时目标块可能未被选中，因此缩放只认按下瞬间的目标，不认选区
        if (edge) {
            startSession(edge === "left" ? "resize-left" : "resize-right", event, block)
            return
        }
        if (event.ctrlKey || event.metaKey) {
            if (selectedIds.value.has(block.id)) selectedIds.value.delete(block.id)
            else selectedIds.value.add(block.id)
        } else if (!selectedIds.value.has(block.id)) {
            selectOnly(block.id)
        }
        const lane = laneAtClientY(event.clientY)
        if (lane) activeSlotIndex.value = lane.slotIndex
        startSession("move", event, block)
        return
    }

    const lane = laneAtClientY(event.clientY)
    if (!lane) return
    activeSlotIndex.value = lane.slotIndex
    clearSelection()
    updateViewportTop()
    const start = clientToContent(event.clientX, event.clientY)
    marquee.active = true
    marquee.startX = start.x
    marquee.startY = start.y
    marquee.endX = start.x
    marquee.endY = start.y
    startSession("marquee", event, null)
}

/**
 * 窗口失焦时兜底结束会话，避免拖拽状态卡死。
 */
const onWindowBlur = () => stopSession()

/**
 * 启动一次 Pointer 会话：记录初始快照并挂到 window，
 * 保证指针移出元素甚至移出窗口后仍能连续拖拽/框选。
 * @param mode 会话语义
 * @param event 指针事件
 * @param target 本次显式命中的时间块
 */
const startSession = (mode: PointerMode, event: PointerEvent, target: TimelineBlock | null) => {
    const origins = new Map<string, { startTime: number; trackId: string; slotIndex: number; kind: TimelineTrackKind }>()
    if (mode === "move") {
        for (const block of blocks) {
            if (!selectedIds.value.has(block.id)) continue
            const found = localTrack(block.trackId)
            if (found) {
                origins.set(block.id, {
                    startTime: block.startTime,
                    trackId: block.trackId,
                    slotIndex: slots.indexOf(found.slot),
                    kind: found.track.kind,
                })
            }
        }
    }
    session.value = {
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: viewportRef.value?.scrollLeft || 0,
        startScrollTop: viewportRef.value?.scrollTop || 0,
        targetId: target?.id || null,
        targetStartTime: target?.startTime || 0,
        targetDuration: target?.duration || 0,
        origins,
        active: true,
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
    window.addEventListener("blur", onWindowBlur)
}

/**
 * 结束会话并解绑 window 监听。
 */
const stopSession = () => {
    session.value = null
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerUp)
    window.removeEventListener("blur", onWindowBlur)
}

/**
 * 指针移动（window 级）：按会话语义更新选区、时间块位置或视图滚动。
 * @param event 指针事件
 */
function onPointerMove(event: PointerEvent) {
    const current = session.value
    if (!current?.active) return

    if (current.mode === "pan") {
        if (viewportRef.value) {
            viewportRef.value.scrollLeft = current.startScrollLeft - (event.clientX - current.startClientX)
            viewportRef.value.scrollTop = current.startScrollTop - (event.clientY - current.startClientY)
        }
        return
    }

    if (current.mode === "marquee") {
        const point = clientToContent(event.clientX, event.clientY)
        marquee.endX = point.x
        marquee.endY = point.y
        return
    }

    // 时间偏移直接由「客户端位移 / 像素比」得到，不涉及受滚动影响的 rect
    const offset = (event.clientX - current.startClientX) / pps.value

    if (current.mode === "move") {
        const targetRow = laneAtClientY(event.clientY)
        // 整组位移：先算出保证不越过 0 点的统一补偿，避免组内相对位置被钳制破坏
        let rawShift = offset
        for (const origin of current.origins.values()) {
            rawShift = Math.max(rawShift, -origin.startTime)
        }
        for (const block of blocks) {
            const origin = current.origins.get(block.id)
            if (!origin) continue
            block.startTime = snapTime(origin.startTime + rawShift)
            // 纵向只能落到同一槽位、同类型轨道，避免技能跑到别的角色或其他类型轨道上
            if (targetRow && targetRow.slotIndex === origin.slotIndex && targetRow.kind === origin.kind) {
                block.trackId = targetRow.trackId
            }
        }
        return
    }

    // 缩放：始终以按下瞬间的快照为基准，逐帧用同一基准计算，避免累积放大
    const target = blocks.find(block => block.id === current.targetId)
    if (!target) return
    if (current.mode === "resize-left") {
        const right = current.targetStartTime + current.targetDuration
        const nextStart = Math.max(0, Math.min(right - 0.1, snapTime(current.targetStartTime + offset)))
        target.startTime = nextStart
        target.duration = +(right - nextStart).toFixed(3)
    } else if (current.mode === "resize-right") {
        target.duration = Math.max(0.1, +(current.targetDuration + offset).toFixed(3))
    }
}

/**
 * 指针抬起（window 级）：结束会话，框选时提交命中结果。
 * @param event 指针事件
 */
function onPointerUp(event: PointerEvent) {
    const current = session.value
    if (!current?.active) return
    if (current.mode === "marquee") {
        const point = clientToContent(event.clientX, event.clientY)
        marquee.endX = point.x
        marquee.endY = point.y
        commitMarquee()
        marquee.active = false
    }
    stopSession()
}

/**
 * 按框选矩形计算命中的时间块并写入选区。
 * 内容 X 减去角色栏与轨道名列宽度后才是网格内偏移。
 */
const commitMarquee = () => {
    const minX = Math.min(marquee.startX, marquee.endX) - GRID_LEFT
    const maxX = Math.max(marquee.startX, marquee.endX) - GRID_LEFT
    const minY = Math.min(marquee.startY, marquee.endY) - RULER_HEIGHT
    const maxY = Math.max(marquee.startY, marquee.endY) - RULER_HEIGHT
    if (maxX - minX < 3 && maxY - minY < 3) return
    for (const row of layout.value.rows) {
        if (row.top + row.height < minY || row.top > maxY) continue
        for (const block of blocksOfTrack(row.trackId)) {
            const left = timeToPx(block.startTime)
            const right = left + Math.max(timeToPx(block.duration), 6)
            if (right >= minX && left <= maxX) selectedIds.value.add(block.id)
        }
    }
}

/**
 * 框选层样式：定位基准为不随滚动移动的视口外层，
 * 因此用「内容坐标 − 滚动量 + 视口偏移」，与鼠标保持像素级一致。
 */
const marqueeStyle = computed(() => ({
    left: `${Math.min(marquee.startX, marquee.endX) - scrollLeft.value}px`,
    top: `${viewportTop.value + Math.min(marquee.startY, marquee.endY) - scrollTop.value}px`,
    width: `${Math.abs(marquee.endX - marquee.startX)}px`,
    height: `${Math.abs(marquee.endY - marquee.startY)}px`,
}))

/**
 * 全局键盘快捷键：删除、Esc 取消、缩放。
 * @param event 键盘事件
 */
const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    const typing = !!target && (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable)
    if (typing) return
    if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        deleteSelectedBlocks()
    } else if (event.key === "Escape") {
        stopSession()
        marquee.active = false
        clearSelection()
    } else if (event.key === "+" || event.key === "=") {
        zoomBy(1.2)
    } else if (event.key === "-" || event.key === "_") {
        zoomBy(1 / 1.2)
    }
}

// #endregion

// #region 刻度

/**
 * 按当前缩放计算刻度步长，保证标签间距不小于 56px。
 */
const markStep = computed(() => {
    const candidates = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]
    return candidates.find(step => step * pps.value >= 56) || 60
})

/**
 * 可见刻度（含主/次刻度与标签）。
 */
const timeMarks = computed(() => {
    const marks: { time: number; left: number; major: boolean; label: string }[] = []
    const step = markStep.value
    for (let time = 0; time <= timelineEndTime.value + step; time += step) {
        const rounded = +time.toFixed(3)
        const major = Math.abs(rounded % (step * 5)) < 1e-6 || step >= 5
        marks.push({ time: rounded, left: timeToPx(rounded), major, label: formatTime(rounded) })
    }
    return marks
})

const gridStyle = computed(() => ({
    backgroundImage: `linear-gradient(to right, color-mix(in oklab, currentColor 12%, transparent) 0 1px, transparent 1px 100%)`,
    backgroundSize: `${pps.value * markStep.value}px 100%`,
}))

// #endregion

// #region 魔之楔编配弹窗

const modDialogSlot = ref(-1)
const modDialogType = ref<TimelineModSlotType>("角色")
const modPickerIndex = ref(-1)
const modKeyword = ref("")
const modQuality = ref("全部")

const modDialogOpen = computed({
    get: () => modDialogSlot.value >= 0,
    set: value => {
        if (!value) closeModDialog()
    },
})

/**
 * 打开某槽位的魔之楔编配弹窗。
 * @param slotIndex 槽位序号
 */
const openModDialog = (slotIndex: number) => {
    activeSlotIndex.value = slotIndex
    modDialogSlot.value = slotIndex
    modDialogType.value = "角色"
    modPickerIndex.value = -1
    modKeyword.value = ""
    modQuality.value = "全部"
}

/**
 * 关闭魔之楔弹窗并退出挑选态。
 */
const closeModDialog = () => {
    modDialogSlot.value = -1
    modPickerIndex.value = -1
}

/**
 * 弹窗所属槽位的角色构建（用于展示魔之楔是否生效）。
 */
const dialogBuild = computed(() => (modDialogSlot.value >= 0 ? slotBuilds.value[modDialogSlot.value] : null))

/**
 * 弹窗当前类型的槽位数组（未覆盖时展示构筑页配置）。
 */
const dialogSlots = computed<TimelineModSlot[]>(() =>
    modDialogSlot.value < 0 ? [] : effectiveModSlots(modDialogSlot.value, modDialogType.value)
)

/**
 * 当前类型的可选魔之楔：按类型与限定（角色 / 武器类别 / 伤害类型）过滤，光环系列单独走中枢槽位。
 */
const dialogModOptions = computed(() => {
    const build = dialogBuild.value
    const type = modDialogType.value
    if (!build) return []
    return modData.filter(mod => {
        if (mod.系列 === "羽蛇") return false
        const expectedType = type === "同律" ? build.skillWeapon?.类型 : type
        if (!expectedType || mod.类型 !== expectedType) return false
        const limit = mod.限定
        if (!limit) return true
        if (type === "角色") {
            return typeof limit === "number" ? limit === build.char.id : limit === build.char.名称 || limit === build.char.属性
        }
        if (type === "近战") return typeof limit === "string" && [build.meleeWeapon.类别, build.meleeWeapon.伤害类型].includes(limit)
        if (type === "远程") return typeof limit === "string" && [build.rangedWeapon.类别, build.rangedWeapon.伤害类型].includes(limit)
        return typeof limit === "string" && [build.skillWeapon?.类别, build.skillWeapon?.伤害类型].includes(limit)
    })
})

/**
 * 中枢魔之楔（光环）可选项。
 */
const auraModOptions = modData.filter(mod => mod.系列 === "羽蛇")

/**
 * 弹窗内「挑选魔之楔」列表（按品质与关键字过滤）。
 */
const pickerMods = computed(() => {
    const keyword = modKeyword.value.trim()
    return dialogModOptions.value
        .filter(mod => modQuality.value === "全部" || mod.品质 === modQuality.value)
        .filter(mod => !keyword || `${mod.系列}${mod.名称}${mod.属性 || ""}`.includes(keyword))
        .map(mod => LeveledModHelper.fromId(mod.id, inv.getModLv(mod.id, mod.品质) || 10, inv.getBuffLv(mod.id)))
})

/**
 * 槽位数组中某个槽位对应的魔之楔实例。
 * @param slot 槽位数据
 * @returns 魔之楔实例；空槽返回 null
 */
const toLeveledMod = (slot: TimelineModSlot) => (slot ? LeveledModHelper.optionalFromId(slot[0], slot[1], inv.getBuffLv(slot[0])) : null)

/**
 * 槽位是否极化（耐受减半）。
 * @param index 槽位索引
 * @returns 是否极化
 */
const isModPolset = (index: number) => dialogBuild.value?.getModCostTransfer(modDialogType.value)?.includes(index) ?? false

/**
 * 打开挑选弹窗。
 * @param index 目标槽位索引
 */
const openModPicker = (index: number) => {
    modPickerIndex.value = index
    modKeyword.value = ""
    modQuality.value = "全部"
}

/**
 * 把选中的魔之楔写入目标槽位。
 * @param modId 魔之楔 id
 */
const assignMod = (modId: number) => {
    const index = modPickerIndex.value
    if (modDialogSlot.value < 0 || index < 0) return
    const target = modSlotWriter(modDialogSlot.value, modDialogType.value)
    if (index >= target.length) return
    const quality = modData.find(mod => mod.id === modId)?.品质
    target[index] = [modId, Math.max(1, inv.getModLv(modId, quality) || 10)]
    modPickerIndex.value = -1
    recomputeAllProps()
}

/**
 * 清空槽位数组中的某一格。
 * @param index 槽位索引
 */
const clearModAt = (index: number) => {
    if (modDialogSlot.value < 0) return
    const target = modSlotWriter(modDialogSlot.value, modDialogType.value)
    if (index >= target.length) return
    target[index] = null
    recomputeAllProps()
}

/**
 * 调整槽位数组中的某一格的魔之楔等级。
 * @param index 槽位索引
 * @param level 等级
 */
const setModLevelAt = (index: number, level: number) => {
    if (modDialogSlot.value < 0) return
    const target = modSlotWriter(modDialogSlot.value, modDialogType.value)
    const slot = target[index]
    if (!slot) return
    target[index] = [slot[0], Math.max(0, Math.round(level))]
    recomputeAllProps()
}

/**
 * 交换槽位数组中的两格。
 * @param index1 槽位索引
 * @param index2 槽位索引
 */
const swapModAt = (index1: number, index2: number) => {
    if (modDialogSlot.value < 0) return
    const target = modSlotWriter(modDialogSlot.value, modDialogType.value)
    const first = target[index1]
    target[index1] = target[index2] ?? null
    target[index2] = first ?? null
    recomputeAllProps()
}

/**
 * 弹窗内当前生效的中枢魔之楔 id。
 */
const dialogAuraMod = computed(() => {
    const override = slotLoadout(modDialogSlot.value)?.auraMod
    if (override) return override
    const settings = slotSettings[modDialogSlot.value]?.value
    return settings ? getModVariantAura(settings) : 0
})

/**
 * 改写中枢魔之楔。
 * @param id 魔之楔 id
 */
const setDialogAuraMod = (id: number) => {
    const loadout = writeLoadout(modDialogSlot.value)
    if (!loadout) return
    loadout.auraMod = Number(id)
    recomputeAllProps()
}

/**
 * 清空该槽位的装备覆盖，恢复为构筑页配置。
 */
const resetSlotLoadout = () => {
    const slot = slots[modDialogSlot.value]
    if (!slot) return
    slot.loadout = undefined
    recomputeAllProps()
}

const dragModIndex = ref(-1)
const dropModIndex = ref(-1)

/**
 * 弹窗内拖动槽位：记录起点。
 * @param index 槽位索引
 */
const onModDragStart = (index: number) => {
    dragModIndex.value = index
}

/**
 * 弹窗内拖动槽位：记录悬停目标。
 * @param index 槽位索引
 */
const onModDragOver = (index: number) => {
    if (dragModIndex.value >= 0 && dragModIndex.value !== index) dropModIndex.value = index
}

/**
 * 弹窗内拖动槽位：落点交换。
 */
const onModDragEnd = () => {
    if (dragModIndex.value >= 0 && dropModIndex.value >= 0) swapModAt(dragModIndex.value, dropModIndex.value)
    dragModIndex.value = -1
    dropModIndex.value = -1
}

// #endregion

// #region 血量曲线

const showHealthCurve = ref(true)
const hover = reactive({ active: false, x: 0, time: 0, value: 0 })

/**
 * 血量曲线折线路径。
 */
const healthCurvePath = computed(() => {
    const sorted = [...healthPoints].sort((a, b) => a.time - b.time)
    if (sorted.length === 0) return ""
    return sorted
        .map((point, index) => `${index === 0 ? "M" : "L"} ${timeToPx(point.time)} ${CHART_HEIGHT - (point.value / 100) * CHART_HEIGHT}`)
        .join(" ")
})

/**
 * 血量曲线填充路径（闭合到底部）。
 */
const healthCurveFillPath = computed(() => {
    const sorted = [...healthPoints].sort((a, b) => a.time - b.time)
    if (sorted.length === 0) return ""
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const y = (value: number) => CHART_HEIGHT - (value / 100) * CHART_HEIGHT
    const body = sorted.map(point => `L ${timeToPx(point.time)} ${y(point.value)}`).join(" ")
    return `M 0 ${y(first.value)} ${body} L ${timeToPx(last.time)} ${y(last.value)} L 0 ${CHART_HEIGHT} Z`
})

/**
 * 按时间线性插值出血量值。
 * @param time 时间（秒）
 * @returns 血量百分比
 */
const healthValueAt = (time: number) => {
    const sorted = [...healthPoints].sort((a, b) => a.time - b.time)
    if (sorted.length === 0) return 0
    if (time <= sorted[0].time) return sorted[0].value
    const last = sorted[sorted.length - 1]
    if (time >= last.time) return last.value
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].time >= time) {
            const prev = sorted[i - 1]
            const next = sorted[i]
            const ratio = (time - prev.time) / (next.time - prev.time || 1)
            return prev.value + (next.value - prev.value) * ratio
        }
    }
    return last.value
}

/**
 * 新增血量采样点并按时间排序。
 * @param time 时间（秒）
 * @param value 血量百分比
 */
const addHealthPoint = (time: number, value: number) => {
    healthPoints.push({
        id: nextTimelineId("hp"),
        time: Math.max(0, +time.toFixed(2)),
        value: Math.max(0, Math.min(100, Math.round(value))),
    })
    healthPoints.sort((a, b) => a.time - b.time)
}

/**
 * 删除血量采样点。
 * @param id 采样点 id
 */
const deleteHealthPoint = (id: string) => {
    const index = healthPoints.findIndex(point => point.id === id)
    if (index !== -1) healthPoints.splice(index, 1)
}

/**
 * 曲线区按下：命中采样点进入拖拽，否则新增采样点。
 * @param event 指针事件
 * @param index 采样点索引
 */
const onChartPointerDown = (event: PointerEvent, index?: number) => {
    const target = event.target as HTMLElement
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const time = pxToTime(event.clientX - rect.left - GRID_LEFT + (chartRef.value?.scrollLeft || 0))
    const value = Math.max(0, Math.min(100, 100 - ((event.clientY - rect.top) / CHART_HEIGHT) * 100))
    if (index === undefined) {
        if (target.tagName === "circle") return
        addHealthPoint(time, value)
        return
    }
    const point = healthPoints[index]
    if (!point) return
    const surface = event.currentTarget as HTMLElement
    const move = (moveEvent: PointerEvent) => {
        const bounds = surface.getBoundingClientRect()
        point.time = Math.max(0, +pxToTime(moveEvent.clientX - bounds.left - GRID_LEFT + (chartRef.value?.scrollLeft || 0)).toFixed(2))
        point.value = Math.max(0, Math.min(100, Math.round(100 - ((moveEvent.clientY - bounds.top) / CHART_HEIGHT) * 100)))
    }
    const up = () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        healthPoints.sort((a, b) => a.time - b.time)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
}

/**
 * 曲线区悬停：更新十字线与数值提示。
 * @param event 鼠标事件
 */
const onChartHover = (event: MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    hover.active = true
    hover.x = event.clientX - rect.left - GRID_LEFT
    hover.time = pxToTime(hover.x + (chartRef.value?.scrollLeft || 0))
    hover.value = healthValueAt(hover.time)
}

// #endregion

// #region 方案存档

/**
 * 当前画布序列化为文档。
 * @returns 文档
 */
const currentDoc = (): TimelineDoc => ({
    version: 3,
    name: docName.value || "未命名方案",
    slots: JSON.parse(JSON.stringify(slots)),
    blocks: blocks.map(block => ({ ...block })),
    hp: healthPoints.map(point => [point.time, point.value] as [number, number]),
})

/**
 * 保存当前画布到方案（同名覆盖）。
 */
const saveScheme = () => {
    const name = schemeNameInput.value.trim() || docName.value
    if (!name) {
        ui.showErrorMessage(t("timeline.schemeNameRequired"))
        return
    }
    docName.value = name
    const doc = currentDoc()
    const index = schemes.value.findIndex(item => item.name === name)
    if (index === -1) schemes.value.push(doc)
    else schemes.value[index] = doc
}

/**
 * 载入方案。
 * @param index 方案索引
 */
const loadScheme = (index: number) => {
    const doc = schemes.value[index]
    if (!doc) return
    applyDoc(JSON.parse(JSON.stringify(doc)))
}

/**
 * 删除方案。
 * @param index 方案索引
 */
const deleteScheme = (index: number) => schemes.value.splice(index, 1)

/**
 * 导出当前画布为 JSON 文件。
 */
const exportDocJson = () => {
    const doc = currentDoc()
    const url = URL.createObjectURL(new Blob([serializeDoc(doc)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${doc.name}.json`
    a.click()
    URL.revokeObjectURL(url)
}

/**
 * 导入 JSON 方案（重名时二次确认覆盖）。
 */
const importDocJson = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.click()
    input.addEventListener("change", event => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.readAsText(file)
        reader.onload = async () => {
            const doc = parseDoc(reader.result as string)
            if (!doc) {
                ui.showErrorMessage(t("timeline.importJsonFailed"))
                return
            }
            const index = schemes.value.findIndex(item => item.name === doc.name)
            if (index !== -1) {
                const ok = await ui.showDialog(t("timeline.overwrite_confirm_title"), t("timeline.overwrite_confirm_message", { name: doc.name }))
                if (!ok) return
                schemes.value[index] = doc
            } else {
                schemes.value.push(doc)
            }
            applyDoc(JSON.parse(JSON.stringify(doc)))
        }
    })
}

// #endregion

const totalDuration = computed(() => blocks.reduce((max, block) => Math.max(max, block.startTime + block.duration), 0))

onMounted(() => {
    window.addEventListener("keydown", onKeyDown)
    updateViewportTop()
    window.addEventListener("resize", updateViewportTop)
    recomputeAllProps()
})
onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeyDown)
    window.removeEventListener("resize", updateViewportTop)
    if (slotDragFrom.value >= 0) onSlotDragUp()
    stopSession()
    clearTimeout(persistTimer)
    if (wheelRaf) cancelAnimationFrame(wheelRaf)
})
</script>

<template>
    <div class="flex h-full min-h-0 bg-base-200 text-base-content">
        <!-- 左侧：功能区（仅图标）+ 可折叠的技能库列 -->
        <aside
            class="flex flex-none flex-col border-r border-base-content/10 bg-base-100 transition-[width] duration-150"
            :style="{ width: libCollapsed ? '38px' : '272px' }"
        >
            <!-- 功能区：仅图标，置于左栏顶部 -->
            <div class="flex flex-none flex-wrap items-center gap-0.5 border-b border-base-content/10 p-1">
                <button type="button" class="grid size-7 place-items-center text-base-content/70 hover:bg-base-content/10" :title="$t('timeline.zoomOut')" @click="zoomBy(1 / 1.25)">
                    <Icon icon="ri:zoom-out-line" class="size-4" />
                </button>
                <button type="button" class="grid size-7 place-items-center text-base-content/70 hover:bg-base-content/10" :title="$t('timeline.zoomIn')" @click="zoomBy(1.25)">
                    <Icon icon="ri:zoom-in-line" class="size-4" />
                </button>
                <button type="button" class="grid size-7 place-items-center text-base-content/70 hover:bg-base-content/10" :title="$t('timeline.resetView')" @click="resetView">
                    <Icon icon="ri:restart-line" class="size-4" />
                </button>
                <button
                    type="button"
                    class="grid size-7 place-items-center hover:bg-base-content/10"
                    :class="showHealthCurve ? 'text-primary' : 'text-base-content/50'"
                    :title="$t('timeline.healthCurve')"
                    @click="showHealthCurve = !showHealthCurve"
                >
                    <Icon icon="ri:heart-pulse-line" class="size-4" />
                </button>

                <div class="dropdown dropdown-bottom dropdown-end">
                    <button type="button" tabindex="0" class="grid size-7 place-items-center text-base-content/70 hover:bg-base-content/10" :title="$t('timeline.load_save')">
                        <Icon icon="ri:folder-line" class="size-4" />
                    </button>
                    <div tabindex="0" class="card card-sm dropdown-content z-50 mt-1 w-72 border border-base-content/10 bg-base-100 shadow-lg">
                        <div class="card-body gap-2">
                            <h2 class="card-title text-sm">{{ $t("timeline.save_scheme") }}</h2>
                            <input
                                v-model="schemeNameInput"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent px-0.5 pb-1 text-[13px] outline-none focus:border-primary"
                                :placeholder="$t('timeline.schemeNamePlaceholder')"
                                @click.stop
                            />
                            <div class="flex gap-2">
                                <button type="button" class="flex-1 border border-primary/40 bg-primary/10 py-1 text-xs text-primary" @click="saveScheme">
                                    {{ $t("timeline.save") }}
                                </button>
                                <button type="button" class="flex-1 border border-base-content/15 py-1 text-xs" @click="exportDocJson">
                                    {{ $t("timeline.export_json") }}
                                </button>
                                <button type="button" class="flex-1 border border-base-content/15 py-1 text-xs" @click="importDocJson">
                                    {{ $t("timeline.import_json") }}
                                </button>
                            </div>
                            <ul class="max-h-56 space-y-1 overflow-y-auto">
                                <li
                                    v-for="(scheme, index) in schemes"
                                    :key="scheme.name"
                                    class="flex items-center gap-1 border border-base-content/10 px-2 py-1"
                                    :class="{ 'bg-primary/10': scheme.name === docName }"
                                >
                                    <span class="link link-hover min-w-0 flex-1 truncate text-[13px]" :title="$t('timeline.click_to_load')" @click="loadScheme(index)">
                                        {{ scheme.name }}
                                    </span>
                                    <button type="button" class="grid size-6 place-items-center text-base-content/60 hover:text-error" :title="$t('common.delete')" @click="deleteScheme(index)">
                                        <Icon icon="ri:delete-bin-line" class="size-3.5" />
                                    </button>
                                </li>
                                <li v-if="schemes.length === 0" class="px-2 py-1 text-xs text-base-content/40">{{ $t("timeline.no_scheme") }}</li>
                            </ul>
                        </div>
                    </div>
                </div>
                <button type="button" class="grid size-7 place-items-center text-base-content/70 hover:bg-base-content/10" :title="$t('timeline.new_scheme')" @click="docName = ''; schemeNameInput = ''">
                    <Icon icon="ri:file-add-line" class="size-4" />
                </button>

                <button
                    type="button"
                    class="grid size-7 place-items-center text-base-content/70 hover:bg-base-content/10"
                    :title="libCollapsed ? $t('timeline.expandLibrary') : $t('timeline.collapseLibrary')"
                    @click="libCollapsed = !libCollapsed"
                >
                    <Icon :icon="libCollapsed ? 'ri:arrow-right-s-line' : 'ri:arrow-left-s-line'" class="size-4" />
                </button>
            </div>

            <!-- 技能库 / BUFF 库：独立一列，可折叠 -->
            <template v-if="!libCollapsed">
                <div class="flex flex-none items-center border-b border-base-content/10 px-1.5 py-1">
                    <button
                        type="button"
                        class="px-2 py-0.5 text-[11px] tracking-wide"
                        :class="libTab === 'skill' ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:text-base-content/80'"
                        @click="libTab = 'skill'"
                    >
                        {{ $t("timeline.skillLibrary") }}
                    </button>
                    <button
                        type="button"
                        class="px-2 py-0.5 text-[11px] tracking-wide"
                        :class="libTab === 'buff' ? 'bg-success/10 text-success' : 'text-base-content/50 hover:text-base-content/80'"
                        @click="libTab = 'buff'"
                    >
                        {{ $t("timeline.buffLibrary") }}
                    </button>
                    <span class="ml-auto pr-1 font-orbitron text-[11px] tabular-nums text-base-content/40">
                        {{ libTab === "skill" ? skillLibrary.length : buffLibrary.length }}
                    </span>
                </div>

                <div v-if="activeSlot?.charName" class="flex min-h-0 flex-1 flex-col">
                    <div class="flex flex-none items-center gap-1.5 border-b border-base-content/10 px-2 py-1.5">
                        <img :src="charIcon(activeSlot.charName)" :alt="activeSlot.charName" class="size-6 shrink-0 border border-base-content/15 object-cover object-top" />
                        <span class="min-w-0 flex-1 truncate text-[13px]">{{ activeSlot.charName }}</span>
                        <span class="text-[10px] text-base-content/40">{{ $t("timeline.libraryOf") }}</span>
                    </div>

                    <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
                        <!-- 技能库 -->
                        <div v-if="libTab === 'skill'" class="space-y-1">
                            <div
                                v-for="skill in skillLibrary"
                                :key="skill.name"
                                draggable="true"
                                class="flex cursor-grab items-center gap-2 border border-base-content/10 bg-base-100 px-1.5 py-1 hover:border-primary/60 hover:bg-primary/5 active:cursor-grabbing"
                                @dragstart="onLibDragStart($event, { kind: 'skill', name: skill.name, duration: skill.duration })"
                                @dragend="onLibDragEnd"
                            >
                                <img :src="skill.icon" :alt="skill.name" class="size-6 shrink-0 object-cover" />
                                <span class="min-w-0 flex-1 truncate text-[13px]">{{ skill.name }}</span>
                                <span class="font-orbitron shrink-0 text-[11px] tabular-nums text-base-content/50">{{ skill.duration.toFixed(3) }}s</span>
                            </div>
                            <div v-if="skillLibrary.length === 0" class="px-2 py-4 text-center text-[12px] text-base-content/40">{{ $t("timeline.libraryEmpty") }}</div>
                        </div>

                        <!-- BUFF 库 -->
                        <div v-else class="space-y-1">
                            <div v-for="buff in buffLibrary" :key="buff.name" class="flex items-center gap-2 border border-base-content/10 bg-base-100 px-1.5 py-1 hover:border-success/60 hover:bg-success/5">
                                <div
                                    draggable="true"
                                    class="flex min-w-0 flex-1 cursor-grab items-center gap-2 active:cursor-grabbing"
                                    @dragstart="onLibDragStart($event, { kind: 'buff', name: buff.name, lv: buffLvOf(buff.name), duration: 5 })"
                                    @dragend="onLibDragEnd"
                                >
                                    <span class="min-w-0 flex-1 truncate text-[13px]">{{ buff.name }}</span>
                                </div>
                                <span v-if="buff.mx > 1" class="flex shrink-0 items-center gap-1">
                                    <button type="button" class="grid size-4 place-items-center text-base-content/50 hover:text-primary" @click.stop="stepBuffLv(buff.name, buff.mx, -1)">
                                        <Icon icon="ri:subtract-line" class="size-3" />
                                    </button>
                                    <span class="font-orbitron w-4 text-center text-[11px] tabular-nums">{{ buffLvOf(buff.name) }}</span>
                                    <button type="button" class="grid size-4 place-items-center text-base-content/50 hover:text-primary" @click.stop="stepBuffLv(buff.name, buff.mx, 1)">
                                        <Icon icon="ri:add-line" class="size-3" />
                                    </button>
                                </span>
                            </div>
                            <div v-if="buffLibrary.length === 0" class="px-2 py-4 text-center text-[12px] text-base-content/40">{{ $t("timeline.libraryEmpty") }}</div>
                        </div>
                    </div>

                    <div class="flex-none border-t border-base-content/10 px-2 py-1 text-[11px] leading-tight text-base-content/40">
                        {{ $t("timeline.dragHint") }}
                    </div>
                </div>

                <div v-else class="flex min-h-0 flex-1 items-center justify-center px-3 text-center text-[13px] text-base-content/40">
                    {{ $t("timeline.pickChar") }}
                </div>
            </template>

            <div v-else class="min-h-0 flex-1" />
        </aside>

        <!-- 右侧：时间轴（最左为角色槽栏，其后为时间网格） -->
        <section class="relative flex min-w-0 flex-1 flex-col">
            <div class="relative flex min-h-0 flex-1 flex-col">
                <div ref="viewportRef" class="relative min-h-0 flex-1 overflow-auto" @scroll.passive="onScroll" @wheel="onWheel">
                    <div class="relative flex" :style="{ width: `${GRID_LEFT + contentWidth}px`, height: `${contentHeight}px` }">
                        <!-- 固定列组：角色栏 + 轨道名列，横向滚动时整体吸附在最左 -->
                        <div class="sticky left-0 z-30 flex flex-none" :style="{ height: `${contentHeight}px` }" @pointerdown.stop>
                            <!-- 第一列：角色槽 -->
                            <div id="slot-column" class="relative flex-none border-r border-base-content/10 bg-base-100" :style="{ width: `${RAIL_WIDTH}px` }">
                                <!-- 左上角块：与刻度同高 -->
                                <div class="sticky top-0 z-40 flex items-center gap-1.5 border-b border-base-content/15 bg-base-100 px-2" :style="{ height: `${RULER_HEIGHT}px` }">
                                    <Icon icon="ri:group-2-line" class="size-3.5 text-base-content/50" />
                                    <span class="text-[11px] text-base-content/50">{{ $t("timeline.charRail") }}</span>
                                </div>

                                <!-- 4 个角色槽（纵向排列，可拖动重排） -->
                                <div
                                    v-for="row in layout.slotRows"
                                    :key="slots[row.slotIndex].id"
                                    class="group absolute inset-x-0 flex flex-col gap-1 border-b border-base-content/15 px-1.5 py-1.5 transition-colors"
                                    :class="[
                                        activeSlotIndex === row.slotIndex ? 'bg-primary/5' : '',
                                        slotDragFrom === row.slotIndex ? 'opacity-60' : '',
                                        slotDragFrom >= 0 && slotDragTarget === row.slotIndex && slotDragFrom !== row.slotIndex ? 'ring-1 ring-primary ring-inset' : '',
                                    ]"
                                    :style="{ top: `${RULER_HEIGHT + row.top}px`, height: `${row.height}px` }"
                                    @click="activeSlotIndex = row.slotIndex"
                                >
                                    <!-- 头像 + 角色选择 + 拖拽手柄 -->
                                    <div class="flex flex-none items-center gap-1.5">
                                        <button
                                            type="button"
                                            class="grid size-5 shrink-0 cursor-grab place-items-center text-base-content/35 hover:text-primary active:cursor-grabbing"
                                            :title="$t('timeline.slotDragHint')"
                                            @pointerdown.stop="onSlotHandleDown($event, row.slotIndex)"
                                        >
                                            <Icon icon="ri:draggable" class="size-3.5" />
                                        </button>
                                        <img
                                            v-if="slots[row.slotIndex].charName"
                                            :src="charIcon(slots[row.slotIndex].charName)"
                                            :alt="slots[row.slotIndex].charName"
                                            class="size-8 shrink-0 border border-base-content/15 object-cover object-top"
                                        />
                                        <div v-else class="grid size-8 shrink-0 place-items-center border border-dashed border-base-content/25 text-base-content/30">
                                            <Icon icon="ri:user-line" class="size-4" />
                                        </div>
                                        <Select
                                            :model-value="slots[row.slotIndex].charName || '-'"
                                            class="min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[13px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                                            :placeholder="$t('timeline.selectSlot')"
                                            @update:model-value="slots[row.slotIndex].charName = $event === '-' ? '' : String($event)"
                                        >
                                            <SelectItem value="-">{{ $t("timeline.emptySlot") }}</SelectItem>
                                            <template v-for="charWithElm in groupBy(charOptions, 'elm')" :key="charWithElm[0].elm">
                                                <SelectLabel class="p-2 text-sm font-semibold text-primary">{{ $t(charWithElm[0].elm) }}</SelectLabel>
                                                <SelectGroup>
                                                    <SelectItem v-for="char in charWithElm" :key="char.value" :value="char.value">{{ $t(char.label) }}</SelectItem>
                                                </SelectGroup>
                                            </template>
                                        </Select>
                                    </div>

                                    <!-- 近战武器 -->
                                    <div class="flex flex-none items-center gap-1.5">
                                        <span class="w-6 shrink-0 text-[10px] text-base-content/45">{{ $t("timeline.meleeWeapon") }}</span>
                                        <img :src="weaponIcon(slotMeleeWeapon(row.slotIndex))" alt="" class="size-5 shrink-0 object-cover" />
                                        <Select
                                            :model-value="weaponSelectValue(slotMeleeWeapon(row.slotIndex))"
                                            class="min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                                            @update:model-value="setSlotMeleeWeapon(row.slotIndex, $event)"
                                        >
                                            <SelectItem :value="EMPTY_WEAPON">{{ $t("timeline.emptyWeapon") }}</SelectItem>
                                            <template v-for="group in groupBy(meleeWeaponOptions, '类型')" :key="group[0].类型[1]">
                                                <SelectLabel class="p-2 text-sm font-semibold text-primary">{{ $t(group[0].类型[1]) }}</SelectLabel>
                                                <SelectGroup>
                                                    <SelectItem v-for="weapon in group" :key="weapon.id" :value="weapon.id">{{ $t(weapon.名称) }}</SelectItem>
                                                </SelectGroup>
                                            </template>
                                        </Select>
                                    </div>

                                    <!-- 远程武器 -->
                                    <div class="flex flex-none items-center gap-1.5">
                                        <span class="w-6 shrink-0 text-[10px] text-base-content/45">{{ $t("timeline.rangedWeapon") }}</span>
                                        <img :src="weaponIcon(slotRangedWeapon(row.slotIndex))" alt="" class="size-5 shrink-0 object-cover" />
                                        <Select
                                            :model-value="weaponSelectValue(slotRangedWeapon(row.slotIndex))"
                                            class="min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                                            @update:model-value="setSlotRangedWeapon(row.slotIndex, $event)"
                                        >
                                            <SelectItem :value="EMPTY_WEAPON">{{ $t("timeline.emptyWeapon") }}</SelectItem>
                                            <template v-for="group in groupBy(rangedWeaponOptions, '类型')" :key="group[0].类型[1]">
                                                <SelectLabel class="p-2 text-sm font-semibold text-primary">{{ $t(group[0].类型[1]) }}</SelectLabel>
                                                <SelectGroup>
                                                    <SelectItem v-for="weapon in group" :key="weapon.id" :value="weapon.id">{{ $t(weapon.名称) }}</SelectItem>
                                                </SelectGroup>
                                            </template>
                                        </Select>
                                    </div>

                                    <!-- 魔之楔 + 轨道增删 -->
                                    <div class="mt-auto flex flex-none items-center gap-1">
                                        <button
                                            type="button"
                                            class="flex min-w-0 flex-1 items-center gap-1 border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/70 hover:border-primary/60 hover:text-primary"
                                            :title="$t('timeline.modTitle')"
                                            @click.stop="openModDialog(row.slotIndex)"
                                        >
                                            <Icon icon="ri:apps-2-line" class="size-3.5 shrink-0" />
                                            <span class="truncate">{{ $t("timeline.modTitle") }}</span>
                                            <span class="ml-auto font-orbitron shrink-0 tabular-nums">{{ modEquippedCount(row.slotIndex) }}</span>
                                        </button>
                                        <button
                                            v-if="slots[row.slotIndex].charName"
                                            type="button"
                                            class="grid size-5 shrink-0 place-items-center border border-base-content/15 text-base-content/60 hover:border-primary/60 hover:text-primary"
                                            :title="$t('timeline.addSkillTrack')"
                                            @click.stop="addTrack(row.slotIndex, 'skill')"
                                        >
                                            <Icon icon="ri:add-line" class="size-3" />
                                        </button>
                                        <button
                                            v-if="slots[row.slotIndex].charName"
                                            type="button"
                                            class="grid size-5 shrink-0 place-items-center border border-base-content/15 text-base-content/60 hover:border-success/60 hover:text-success"
                                            :title="$t('timeline.addBuffTrack')"
                                            @click.stop="addTrack(row.slotIndex, 'buff')"
                                        >
                                            <Icon icon="ri:add-line" class="size-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- 第二列：轨道名（独立成列，不占用轨道内容区） -->
                            <div id="track-name-column" class="relative flex-none border-r border-base-content/10 bg-base-100" :style="{ width: `${TRACK_NAME_WIDTH}px` }">
                                <div class="sticky top-0 z-40 flex items-center gap-1 border-b border-base-content/15 bg-base-100 px-1.5" :style="{ height: `${RULER_HEIGHT}px` }">
                                    <Icon icon="ri:list-check-2" class="size-3.5 text-base-content/50" />
                                    <span class="text-[11px] text-base-content/50">{{ $t("timeline.trackRail") }}</span>
                                </div>

                                <div
                                    v-for="row in layout.rows"
                                    :key="`name-${row.trackId}`"
                                    class="group absolute inset-x-0 flex items-center gap-1 border-b border-base-content/10 px-1.5"
                                    :style="{ top: `${RULER_HEIGHT + row.top}px`, height: `${row.height}px` }"
                                >
                                    <template v-if="editTrackId === row.trackId">
                                        <input
                                            id="track-name-input"
                                            v-model="editTrackName"
                                            class="w-full min-w-0 rounded-none border-b border-base-content/25 bg-transparent px-0.5 pb-0.5 text-[11px] outline-none focus:border-primary"
                                            @click.stop
                                            @pointerdown.stop
                                            @blur="finishEditTrackName"
                                            @keyup.enter="finishEditTrackName"
                                            @keyup.escape="editTrackId = ''"
                                        />
                                    </template>
                                    <template v-else>
                                        <span
                                            class="min-w-0 flex-1 cursor-text truncate rounded-xs px-0.5"
                                            :class="row.kind === 'buff' ? 'text-success' : 'text-primary'"
                                            :title="row.trackName"
                                            @dblclick.stop="startEditTrackName(row.trackId, row.trackName)"
                                        >
                                            {{ row.trackName }}
                                        </span>
                                        <button
                                            type="button"
                                            class="grid size-4 shrink-0 place-items-center opacity-0 transition-opacity group-hover:opacity-100 hover:text-error"
                                            :title="$t('common.delete')"
                                            @pointerdown.stop
                                            @click.stop="removeTrack(row.trackId)"
                                        >
                                            <Icon icon="ri:close-line" class="size-3" />
                                        </button>
                                    </template>
                                </div>
                            </div>
                        </div>

                        <!-- 时间网格 -->
                        <div id="lane-column" class="relative flex-none" :style="{ width: `${contentWidth}px` }">
                            <!-- 刻度（纵向滚动时吸顶） -->
                            <div class="sticky top-0 z-20 border-b border-base-content/15 bg-base-100/95 backdrop-blur-sm" :style="{ height: `${RULER_HEIGHT}px` }">
                                <div
                                    v-for="mark in timeMarks"
                                    :key="`mark-${mark.time}`"
                                    class="absolute bottom-0 border-l border-base-content/25 font-orbitron text-[10px] tabular-nums text-base-content/50"
                                    :class="mark.major ? 'h-full pl-1' : 'h-2'"
                                    :style="{ left: `${mark.left}px` }"
                                >
                                    <span v-if="mark.major" class="absolute bottom-0.5 whitespace-nowrap">{{ mark.label }}</span>
                                </div>
                            </div>

                            <!-- 轨道行 -->
                            <div class="relative" :style="{ height: `${layout.height}px` }">
                                <div
                                    v-for="row in layout.rows"
                                    :key="`lane-${row.trackId}`"
                                    class="group absolute inset-x-0 border-b border-base-content/10"
                                    :class="dragPreview.trackId === row.trackId && dragPreview.valid ? 'bg-primary/5' : ''"
                                    :style="{ top: `${row.top}px`, height: `${row.height}px`, ...gridStyle }"
                                    @pointerdown="onPointerDown($event)"
                                    @dragover.prevent="onLaneDragOver($event, row)"
                                    @dragleave="onLaneDragLeave(row)"
                                    @drop.prevent="onLaneDrop($event, row)"
                                >
                                    <ContextMenu v-for="block in blocksOfTrack(row.trackId)" :key="block.id">
                                        <template #menu>
                                            <ContextMenuItem
                                                class="cursor-pointer px-3 py-1.5 text-[13px] outline-none data-highlighted:bg-primary data-highlighted:text-primary-content"
                                                @click="removeBlock(block.id)"
                                            >
                                                {{ $t("common.delete") }}
                                            </ContextMenuItem>
                                        </template>
                                        <FullTooltip side="bottom">
                                            <template #tooltip>
                                                <div v-if="skillFieldsOf(block)" class="flex max-h-64 w-56 flex-col overflow-y-auto">
                                                    <div class="px-2 py-1 text-[13px] text-base-content/70">{{ block.label }}</div>
                                                    <div v-for="(val, index) in skillFieldsOf(block)" :key="index" class="flex flex-col px-2 py-1">
                                                        <div class="flex items-center justify-between gap-4 text-xs">
                                                            <span class="text-base-content/50">{{ val.名称 }}</span>
                                                            <span class="font-orbitron tabular-nums text-primary">{{ formatSkillProp(val.名称, val) }}</span>
                                                        </div>
                                                        <div v-if="val.影响" class="flex items-center justify-between gap-4 text-[11px] text-base-content/50">
                                                            <span>{{ $t("timeline.attributeImpact") }}</span>
                                                            <span>{{ val.影响 }}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div v-else-if="buffPropsOf(block)" class="flex max-h-64 w-56 flex-col overflow-y-auto">
                                                    <div class="px-2 py-1 text-[13px] text-base-content/70">{{ block.label }} Lv.{{ block.lv }}</div>
                                                    <div v-for="(val, prop) in buffPropsOf(block)" :key="prop" class="flex items-center justify-between gap-4 px-2 py-1 text-xs">
                                                        <span class="text-base-content/50">{{ prop }}</span>
                                                        <span class="font-orbitron tabular-nums text-primary">{{ formatProp(prop as any, val) }}</span>
                                                    </div>
                                                </div>
                                                <div v-else class="px-2 py-1 text-[13px] text-base-content/70">{{ block.label }}</div>
                                            </template>
                                            <div
                                                :data-id="block.id"
                                                :title="`${formatTime(block.startTime)} / ${formatDuration(block.duration)}`"
                                                class="absolute flex cursor-grab items-center overflow-hidden border border-black/20 px-1 text-[11px] leading-tight shadow-sm transition-shadow select-none"
                                                :class="isSelected(block) ? 'z-20 ring-2 ring-primary' : 'z-10 hover:z-20'"
                                                :style="blockStyle(block)"
                                                @pointerdown.stop="onPointerDown($event, block)"
                                                @dragstart.prevent
                                                @mouseenter="hoveredBlockId = block.id"
                                                @mouseleave="hoveredBlockId = null"
                                            >
                                                <span class="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-black/0 hover:bg-white/25" @pointerdown.stop="onPointerDown($event, block, 'left')" />
                                                <span class="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-black/0 hover:bg-white/25" @pointerdown.stop="onPointerDown($event, block, 'right')" />
                                                <span class="pointer-events-none truncate px-2 text-white/95">{{ block.label }}</span>
                                            </div>
                                        </FullTooltip>
                                    </ContextMenu>

                                    <!-- 拖拽落点预览 -->
                                    <div
                                        v-if="dragPreview.trackId === row.trackId && dragPreview.valid"
                                        class="pointer-events-none absolute z-30 border border-primary border-dashed bg-primary/25"
                                        :style="previewStyle"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 框选层：滚动容器外层，按「内容坐标 − 滚动量」定位，与鼠标一致 -->
                <div v-if="marquee.active" class="pointer-events-none absolute z-40 border border-primary bg-primary/15" :style="marqueeStyle" />

                <!-- 血量曲线：与主视口共享横向滚动 -->
                <div v-if="showHealthCurve" ref="chartRef" class="flex-none overflow-x-auto overflow-y-hidden border-t border-base-content/10 bg-base-100" @scroll.passive="onChartScroll">
                    <div
                        class="relative cursor-crosshair"
                        :style="{ width: `${GRID_LEFT + contentWidth}px`, height: `${CHART_HEIGHT}px` }"
                        @pointerdown="onChartPointerDown($event)"
                        @mousemove.passive="onChartHover($event)"
                        @mouseleave="hover.active = false"
                    >
                        <div
                            class="absolute inset-y-0 left-0 z-10 flex items-center justify-end border-r border-base-content/10 bg-base-100 px-2"
                            :style="{ width: `${GRID_LEFT}px` }"
                        >
                            <span class="text-[11px] text-error">{{ $t("timeline.healthLabel") }}</span>
                        </div>
                        <svg class="absolute inset-y-0" :style="{ left: `${GRID_LEFT}px` }" :width="contentWidth" :height="CHART_HEIGHT">
                            <path v-if="healthPoints.length > 0" :d="healthCurveFillPath" fill="color-mix(in oklab, var(--color-error) 18%, transparent)" />
                            <path v-if="healthPoints.length > 0" :d="healthCurvePath" fill="none" stroke="var(--color-error)" stroke-width="1.5" stroke-linejoin="round" />
                            <line v-if="hover.active" :x1="hover.x" y1="0" :x2="hover.x" :y2="CHART_HEIGHT" stroke="var(--color-primary)" stroke-width="1" stroke-dasharray="3 3" />
                            <circle
                                v-for="point in healthPoints"
                                :key="point.id"
                                :cx="timeToPx(point.time)"
                                :cy="CHART_HEIGHT - (point.value / 100) * CHART_HEIGHT"
                                r="4"
                                fill="var(--color-error)"
                                class="cursor-move"
                                @pointerdown.stop="onChartPointerDown($event, healthPoints.indexOf(point))"
                                @contextmenu.prevent="deleteHealthPoint(point.id)"
                            />
                        </svg>
                    </div>
                </div>

                <!-- 状态栏 -->
                <div class="flex flex-none items-center gap-3 border-t border-base-content/10 bg-base-100 px-3 py-1">
                    <span class="font-orbitron text-[11px] tabular-nums text-base-content/50">{{ selectedIds.size }} / {{ blocks.length }}</span>
                    <span class="font-orbitron text-[11px] tabular-nums text-base-content/50">{{ $t("timeline.totalTime") }} {{ formatDuration(totalDuration) }}</span>
                    <span class="ml-auto font-orbitron text-[11px] tabular-nums text-base-content/50">{{ zoomPercent }}%</span>
                </div>
            </div>
        </section>
    </div>

    <!-- 魔之楔编配弹窗 -->
    <Teleport to="body">
        <dialog class="modal" :class="{ 'modal-open': modDialogOpen }">
            <div class="modal-box flex h-11/12 max-w-11/12 flex-col gap-0 p-0">
                <div class="flex flex-none items-center gap-2 border-b border-base-content/10 px-3 py-2">
                    <img
                        v-if="modDialogSlot >= 0 && slots[modDialogSlot]?.charName"
                        :src="charIcon(slots[modDialogSlot].charName)"
                        alt=""
                        class="size-6 border border-base-content/15 object-cover object-top"
                    />
                    <span class="text-[13px] font-medium">
                        {{ $t("timeline.modDialogTitle") }}
                        <span v-if="modDialogSlot >= 0 && slots[modDialogSlot]?.charName" class="text-base-content/50">
                            · {{ slots[modDialogSlot].charName }}
                        </span>
                    </span>
                    <button type="button" class="ml-auto grid size-6 place-items-center text-base-content/50 hover:text-base-content" @click="modDialogOpen = false">
                        <Icon icon="ri:close-line" class="size-4" />
                    </button>
                </div>

                <div class="flex flex-none items-center gap-1 border-b border-base-content/10 px-3 py-1.5">
                    <button
                        v-for="type in TIMELINE_MOD_SLOT_TYPES"
                        :key="type"
                        type="button"
                        class="px-2 py-0.5 text-[12px]"
                        :class="modDialogType === type ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:text-base-content/80'"
                        @click="modDialogType = type; modPickerIndex = -1"
                    >
                        {{ $t(type) }}
                    </button>
                    <div v-if="modDialogType === '角色'" class="ml-4 flex items-center gap-2">
                        <span class="text-[11px] text-base-content/50">{{ $t("timeline.auraMod") }}</span>
                        <Select
                            :model-value="dialogAuraMod"
                            class="w-44 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                            @update:model-value="setDialogAuraMod($event)"
                        >
                            <SelectItem v-for="mod in auraModOptions" :key="mod.id" :value="mod.id">{{ $t(mod.名称) }}</SelectItem>
                        </Select>
                    </div>
                    <button type="button" class="ml-auto border border-base-content/15 px-2 py-0.5 text-[11px] text-base-content/60 hover:border-primary/60 hover:text-primary" @click="resetSlotLoadout">
                        {{ $t("timeline.resetLoadout") }}
                    </button>
                </div>

                <!-- 槽位网格 -->
                <div v-if="modPickerIndex < 0" class="min-h-0 flex-1 overflow-y-auto p-3">
                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                        <ModItem
                            v-for="(slot, index) in dialogSlots"
                            :key="index"
                            :mod="toLeveledMod(slot)"
                            :index="index"
                            :char-build="dialogBuild || undefined"
                            :polset="isModPolset(index)"
                            :selected="undefined"
                            control
                            :class="{
                                'opacity-50': dragModIndex === index,
                                'ring-2 ring-primary': dropModIndex === index && dragModIndex !== index,
                            }"
                            @click="!slot && openModPicker(index)"
                            @remove-mod="clearModAt(index)"
                            @lv-change="setModLevelAt(index, $event)"
                            @drag-start="onModDragStart(index)"
                            @drag-end="onModDragEnd"
                            @mouseenter="dragModIndex >= 0 && onModDragOver(index)"
                        />
                    </div>
                    <div v-if="dialogSlots.length === 0" class="py-10 text-center text-[13px] text-base-content/40">{{ $t("timeline.modUnavailable") }}</div>
                </div>

                <!-- 挑选魔之楔 -->
                <template v-else>
                    <div class="flex flex-none flex-wrap items-center gap-2 border-b border-base-content/10 px-3 py-2">
                        <button type="button" class="grid size-6 place-items-center text-base-content/50 hover:text-base-content" @click="modPickerIndex = -1">
                            <Icon icon="ri:arrow-left-line" class="size-4" />
                        </button>
                        <span class="text-[12px] text-base-content/70">{{ $t("timeline.selectModSlot", { slot: modPickerIndex + 1 }) }}</span>
                        <input
                            v-model="modKeyword"
                            class="w-44 rounded-none border-b border-base-content/25 bg-transparent px-0.5 pb-0.5 text-[12px] outline-none focus:border-primary"
                            :placeholder="$t('timeline.modSearch')"
                        />
                        <div class="flex items-center gap-1">
                            <button
                                v-for="quality in MOD_QUALITIES"
                                :key="quality"
                                type="button"
                                class="px-1.5 py-0.5 text-[11px]"
                                :class="modQuality === quality ? 'bg-primary/10 text-primary' : 'text-base-content/45 hover:text-base-content/80'"
                                @click="modQuality = quality"
                            >
                                {{ quality === "全部" ? $t("common.all") : $t(quality) }}
                            </button>
                        </div>
                        <span class="ml-auto font-orbitron text-[11px] tabular-nums text-base-content/40">{{ pickerMods.length }}</span>
                    </div>
                    <div class="min-h-0 flex-1 overflow-y-auto p-3">
                        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                            <ModItem
                                v-for="mod in pickerMods"
                                :key="mod.id"
                                :mod="mod"
                                :char-build="dialogBuild || undefined"
                                :selected="undefined"
                                noremove
                                @click="assignMod(mod.id)"
                            />
                        </div>
                        <div v-if="pickerMods.length === 0" class="py-10 text-center text-[13px] text-base-content/40">{{ $t("timeline.modEmpty") }}</div>
                    </div>
                </template>
            </div>
            <div class="modal-backdrop" @click="modDialogOpen = false" />
        </dialog>
    </Teleport>
</template>
