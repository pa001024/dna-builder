<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import forge from "node-forge"
import { ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "reka-ui"
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import ContextMenu, { ContextMenuItem } from "@/components/contextmenu"
import type { QuickNavItem } from "@/components/HomeQuickNav.vue"
import type { POCardSize } from "@/components/POCard.vue"
import { useSettingStore } from "@/store/setting"
import { isValidHex } from "@/utils/customTheme"
import { getMoreItems, type MoreItem } from "@/utils/entry-util"
import { sha256 } from "@/utils/sha256"

const setting = useSettingStore()
const scriptUnlocked = useLocalStorage("script-unlocked", false)

/** 磁贴项：在入口基础上附加 Win10 磁贴的尺寸与纯色渐变主题。 */
type TileItem = MoreItem & {
    size: POCardSize
    gradient?: string
    glow?: string
}

/**
 * 全量入口列表：共享数据源 getMoreItems 按当前环境与解锁状态生成。
 */
const items = computed<MoreItem[]>(() => getMoreItems({ safeMode: setting.safeMode, scriptUnlocked: scriptUnlocked.value }))

/** 当前环境下可见的入口（过滤 show 为 false 的项）。 */
const visibleItems = computed(() => items.value.filter(item => item.show !== false))

/** 入口风格：false = Win10 磁贴（当前风格），true = Home 快捷入口风格；localStorage 持久化。 */
const useQuickNavStyle = useLocalStorage("po-style-v1", false)

/** Home 快捷入口风格条目：将可见入口映射为 HomeQuickNav 的 props 结构（标题复用 ${name}.title 键）。 */
const quickNavItems = computed<QuickNavItem[]>(() =>
    visibleItems.value.map(item => ({
        path: item.path,
        icon: item.icon,
        titleKey: `${item.name}.title`,
    }))
)

/**
 * 每个入口对应的磁贴尺寸（缺省 small）。大磁贴 2x2、宽磁贴 2x1，用于营造
 * Win10 开始屏幕式的疏密节奏。
 */
const TILE_SIZES: Record<string, POCardSize> = {
    "char-build": "large",
    database: "large",
    "dna-home": "large",
    "abyss-usage": "wide",
    timeline: "wide",
    "game-launcher": "wide",
    "skin-colorize": "wide",
    "script-list": "wide",
    ranking: "wide",
    levelup: "wide",
    "mod-manager": "wide",
    "map-tool": "wide",
    "skin-gacha": "wide",
}

/** 兜底基础色：入口未配置主题时使用（与 POCard 默认渐变同源）。 */
const DEFAULT_TILE_COLOR = "#2b6cb0"

/**
 * 由单一基础色以 OKLCH 方式生成磁贴主题（渐变 + 辉光）。
 * 浅色端 = 基础色向白色混合提升明度，深色端 = 基础色向黑色混合压暗，
 * 辉光 = 基础色向白色轻度混合的浅色调；全部经 color-mix(in oklch, …) 在 OKLCH 空间插值。
 * @param color 基础色（任意 CSS 颜色值，如 #f5576c）
 * @returns 渐变背景与辉光强调色
 */
function makeTileTheme(color: string): { gradient: string; glow: string } {
    const light = `color-mix(in oklch, ${color} 58%, white)`
    const dark = `color-mix(in oklch, ${color} 78%, black)`
    const glow = `color-mix(in oklch, ${color} 50%, white)`
    return {
        gradient: `linear-gradient(135deg, ${light}, ${dark})`,
        glow,
    }
}

/**
 * 每个入口的基础色（单一色值），磁贴渐变/辉光由 makeTileTheme 以 OKLCH 派生。
 */
const TILE_THEMES: Record<string, string> = {
    "char-build": "#f5576c",
    guides: "#f7971e",
    counter: "#fc466b",
    "build-compare": "#a6c1ee",
    "dna-home": "#4facfe",
    database: "#00c6ff",
    levelup: "#43e97b",
    achievement: "#7f00ff",
    "abyss-usage": "#30cfd0",
    ranking: "#f83600",
    setting: "#12c2e9",
    "game-launcher": "#00c6ff",
    "mod-manager": "#7f00ff",
    chat: "#4facfe",
    flow: "#fc466b",
    inventory: "#43e97b",
    timeline: "#a6c1ee",
    help: "#f7971e",
    "game-accounts": "#f5576c",
    unpack: "#30cfd0",
    "skin-colorize": "#12c2e9",
    "map-tool": "#43e97b",
    "race-lottery": "#fa709a",
    "script-list": "#7f00ff",
}

/**
 * 右键菜单可选配色：单一基础色（渐变由 makeTileTheme 以 OKLCH 派生），供「切换颜色」子菜单选择。
 */
const TILE_PALETTE: { name: string; color: string }[] = [
    { name: "pink", color: "#f5576c" },
    { name: "orange", color: "#f7971e" },
    { name: "yellow", color: "#fde047" },
    { name: "green", color: "#43e97b" },
    { name: "cyan", color: "#4facfe" },
    { name: "blue", color: "#00c6ff" },
    { name: "purple", color: "#7f00ff" },
    { name: "red", color: "#f83600" },
    { name: "teal", color: "#30cfd0" },
    { name: "gray", color: "#9ca3af" },
]

/** 右键菜单可选尺寸（与 POCard 的 小/宽/大 对应）。 */
const SIZE_OPTIONS: POCardSize[] = ["small", "wide", "large"]

/** 磁贴的自定义覆盖（右键菜单设置，localStorage 持久化）。 */
type TileOverride = {
    size?: POCardSize
    /** 基础色（渐变/辉光由 makeTileTheme 以 OKLCH 派生）。 */
    color?: string
    /** 兼容旧版数据：已生成的渐变与辉光（存在时直接使用）。 */
    gradient?: string
    glow?: string
}

/** 每个磁贴的颜色/尺寸覆盖表：key 为入口名。 */
const tileOverrides = useLocalStorage<Record<string, TileOverride>>("po-tile-overrides-v1", {})

/**
 * 将可见入口装饰为磁贴项：附加尺寸与主题（基础色 → OKLCH 派生渐变）。
 * 优先应用右键菜单的自定义覆盖；旧版已存 gradient/glow 覆盖时直接沿用。
 * @param list 可见入口列表
 * @returns 装饰后的磁贴项列表
 */
function decorate(list: MoreItem[]): TileItem[] {
    return list.map(item => {
        const override = tileOverrides.value[item.name]
        const theme =
            override?.gradient != null
                ? { gradient: override.gradient, glow: override.glow ?? "" }
                : makeTileTheme(override?.color ?? TILE_THEMES[item.name] ?? DEFAULT_TILE_COLOR)
        return {
            ...item,
            size: override?.size ?? TILE_SIZES[item.name] ?? "small",
            gradient: theme.gradient,
            glow: theme.glow,
        }
    })
}

/** 应用右键菜单选择的基础色（渐变/辉光由 OKLCH 派生）。 */
function setTileColor(name: string, color: string) {
    tileOverrides.value = {
        ...tileOverrides.value,
        [name]: { ...tileOverrides.value[name], color },
    }
}

/** 磁贴当前基础色（自定义覆盖优先，用于自定义取色器预填）。 */
function currentTileColor(name: string): string {
    return tileOverrides.value[name]?.color ?? TILE_THEMES[name] ?? DEFAULT_TILE_COLOR
}

/** 自定义颜色弹窗状态：目标磁贴名与临时色值（确定时才应用）。 */
const customColorState = reactive({
    tile: "",
    hex: DEFAULT_TILE_COLOR,
})

/** 打开自定义颜色弹窗：预填当前基础色，用原生取色器/hex 输入选色。 */
function openCustomColor(tile: string) {
    customColorState.tile = tile
    customColorState.hex = currentTileColor(tile)
    void nextTick(() => {
        ;(document.getElementById("po-tile-color-modal") as HTMLDialogElement | null)?.showModal()
    })
}

/** 确定：应用自定义基础色并关闭弹窗。 */
function applyCustomColor() {
    if (customColorState.tile && isValidHex(customColorState.hex)) {
        setTileColor(customColorState.tile, customColorState.hex.toLowerCase())
    }
    closeCustomColor()
}

/** 关闭自定义颜色弹窗。 */
function closeCustomColor() {
    ;(document.getElementById("po-tile-color-modal") as HTMLDialogElement | null)?.close()
}

/** 手动输入 hex：非法输入回退为当前值。 */
function onCustomHexInput(event: Event) {
    const input = event.target as HTMLInputElement
    const value = input.value.trim()
    if (isValidHex(value)) {
        customColorState.hex = value.toLowerCase()
    } else {
        input.value = customColorState.hex
    }
}

/** 应用右键菜单选择的尺寸。 */
function setTileSize(name: string, size: POCardSize) {
    tileOverrides.value = {
        ...tileOverrides.value,
        [name]: { ...tileOverrides.value[name], size },
    }
}

/** 清除磁贴的自定义覆盖，恢复默认配色与尺寸。 */
function resetTileOverride(name: string) {
    const next = { ...tileOverrides.value }
    delete next[name]
    tileOverrides.value = next
}

/** 判断磁贴是否存在自定义覆盖（决定是否显示「恢复默认」）。 */
function hasOverride(name: string): boolean {
    return !!tileOverrides.value[name]
}

/** 尺寸菜单项左侧的小方块预览（按 1x1 / 2x1 / 2x2 比例）。 */
function tileSizePreviewStyle(size: POCardSize): { width: string; height: string } {
    if (size === "wide") return { width: "1rem", height: "0.55rem" }
    if (size === "large") return { width: "1rem", height: "1rem" }
    return { width: "0.7rem", height: "0.7rem" }
}

/** 用户自定义磁贴排序（长按拖拽后写入，localStorage 持久化）。 */
const tileOrder = useLocalStorage<string[]>("po-tile-order-v1", [])

/**
 * 按保存的排序重组磁贴：已保存项按顺序排列，新增/未知项按原顺序追加末尾。
 * @param list 装饰后的磁贴项
 * @returns 应用用户排序后的列表
 */
function applyOrder(list: TileItem[]): TileItem[] {
    const order = tileOrder.value
    if (!order.length) return list
    const byName = new Map(list.map(tile => [tile.name, tile]))
    const seen = new Set<string>()
    const ordered: TileItem[] = []
    for (const name of order) {
        const tile = byName.get(name)
        if (tile && !seen.has(name)) {
            ordered.push(tile)
            seen.add(name)
        }
    }
    for (const tile of list) {
        if (!seen.has(tile.name)) ordered.push(tile)
    }
    return ordered
}

/** 当前渲染的磁贴列表：可见项/自定义覆盖变化时重建并保留用户排序。 */
const tileList = ref<TileItem[]>([])
watch(
    [visibleItems, tileOverrides],
    () => {
        tileList.value = applyOrder(decorate(visibleItems.value))
    },
    { immediate: true }
)

/** 长按触发拖拽的时长（毫秒）。 */
const LONG_PRESS_MS = 380
/** 长按等待期内允许的指针位移（px，超出视为滚动/滑动意图而取消长按）。 */
const DRAG_MOVE_THRESHOLD = 8

/** 拖拽过程状态：指针位置、幽灵卡片尺寸与抓取偏移（仿 Win10 手感）。 */
const dragState = reactive({
    active: false,
    name: "",
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    offX: 0,
    offY: 0,
})

/** 拖拽中的磁贴当前索引（随实时重排更新）。 */
let dragIndex = -1
/** 上一次的落点磁贴元素（同一落点只交换一次，防止来回抖动）。 */
let lastTargetEl: HTMLElement | null = null
/** 长按计时器句柄。 */
let pressTimer: number | undefined
/** 按下时的指针坐标（用于长按等待期的位移判定）。 */
let pressStartX = 0
let pressStartY = 0
/** 按下时记录的 pointerId（用于进入拖拽后捕获指针）。 */
let pressPointerId = 0
/** 是否刚经历长按/拖拽（用于吞掉随后的 click，避免误导航）。 */
let justDragged = false
/** justDragged 的兜底清理计时器。 */
let suppressClickTimer: number | undefined
/** 当前按压/拖拽的磁贴根元素。 */
let pressedEl: HTMLElement | null = null

/**
 * 磁贴按下：启动长按计时；等待期间位移超过阈值则取消（视为滚动）。
 * @param event 指针事件
 * @param name 磁贴名称
 */
function onTilePointerDown(event: PointerEvent, name: string) {
    if (dragState.active || (event.pointerType === "mouse" && event.button !== 0)) return
    // 新的按下视为离开拖拽状态：解除点击抑制（拖拽释放的合成 click 没有 pointerdown，仍会被吞掉）
    justDragged = false
    pressedEl = event.currentTarget as HTMLElement
    pressPointerId = event.pointerId
    pressStartX = event.clientX
    pressStartY = event.clientY
    clearTimeout(pressTimer)
    pressTimer = window.setTimeout(() => beginDrag(event, name), LONG_PRESS_MS)
}

/**
 * 磁贴指针移动：拖拽中实时跟随与重排；长按等待期位移超阈值则取消长按。
 * @param event 指针事件
 */
function onTilePointerMove(event: PointerEvent) {
    if (dragState.active) {
        updateDrag(event)
        return
    }
    if (pressTimer !== undefined && Math.hypot(event.clientX - pressStartX, event.clientY - pressStartY) > DRAG_MOVE_THRESHOLD) {
        clearTimeout(pressTimer)
        pressTimer = undefined
    }
}

/** 磁贴指针释放：结束拖拽并持久化排序。 */
function onTilePointerUp() {
    clearTimeout(pressTimer)
    pressTimer = undefined
    if (dragState.active) endDrag()
}

/** 磁贴指针取消（滚动/系统打断）：取消长按并结束拖拽。 */
function onTilePointerCancel() {
    clearTimeout(pressTimer)
    pressTimer = undefined
    if (dragState.active) endDrag()
}

/**
 * 进入拖拽模式：捕获指针、记录幽灵尺寸，并禁用容器触摸滚动。
 * @param event 触发长按的指针事件
 * @param name 磁贴名称
 */
function beginDrag(event: PointerEvent, name: string) {
    if (dragState.active) return
    const index = tileList.value.findIndex(tile => tile.name === name)
    if (index < 0) return
    dragIndex = index
    lastTargetEl = null
    dragState.active = true
    dragState.name = name
    dragState.x = event.clientX
    dragState.y = event.clientY
    if (pressedEl) {
        const rect = pressedEl.getBoundingClientRect()
        dragState.w = pressedEl.offsetWidth
        dragState.h = pressedEl.offsetHeight
        dragState.offX = event.clientX - rect.left
        dragState.offY = event.clientY - rect.top
        pressedEl.setPointerCapture?.(pressPointerId)
    }
    justDragged = true
    clearTimeout(suppressClickTimer)
    if (pressedEl?.parentElement) pressedEl.parentElement.style.touchAction = "none"
}

/**
 * 拖拽跟随：更新幽灵位置，以指针正下方的磁贴为落点实时重排。
 * 同一落点只交换一次（lastTargetEl 去重），避免指针停在原位时来回抖动。
 * @param event 指针事件
 */
function updateDrag(event: PointerEvent) {
    dragState.x = event.clientX
    dragState.y = event.clientY
    autoScroll()
    // 指针正下方的磁贴即为落点（幽灵 pointer-events: none，不干扰命中；大磁贴中心远，不能按中心距离判断）
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-po-name]") as HTMLElement | null
    if (!under || under.dataset.poName === dragState.name) {
        lastTargetEl = null
        return
    }
    if (under === lastTargetEl) return
    const targetIndex = Number(under.dataset.poIndex)
    if (targetIndex === dragIndex || Number.isNaN(targetIndex)) return
    const list = [...tileList.value]
    const [item] = list.splice(dragIndex, 1)
    list.splice(targetIndex, 0, item)
    tileList.value = list
    dragIndex = targetIndex
    lastTargetEl = under
    // 重排经 Vue nextTick 移动被捕获的 DOM 节点，Chromium 会因此释放指针捕获
    // （lostpointercapture），需在节点移动完成后重新捕获
    void nextTick(() => {
        pressedEl?.setPointerCapture?.(pressPointerId)
    })
}

/** 拖拽接近滚动容器上下边缘时自动滚动（便于跨行/跨屏排序）。 */
function autoScroll() {
    const grid = pressedEl?.parentElement
    const viewport = grid?.closest("[data-reka-scroll-area-viewport]") as HTMLElement | null
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    if (dragState.y < rect.top + 64) viewport.scrollTop -= 12
    else if (dragState.y > rect.bottom - 64) viewport.scrollTop += 12
}

/** 结束拖拽：恢复触摸滚动、持久化排序，并抑制随后的一次 click。 */
function endDrag() {
    dragState.active = false
    lastTargetEl = null
    if (pressedEl?.parentElement) pressedEl.parentElement.style.touchAction = ""
    pressedEl = null
    tileOrder.value = tileList.value.map(tile => tile.name)
    clearTimeout(suppressClickTimer)
    suppressClickTimer = window.setTimeout(() => {
        justDragged = false
    }, 600)
}

/**
 * 网格点击捕获：刚结束长按/拖拽时吞掉该 click，避免误导航。
 * @param event 点击事件
 */
function onGridClickCapture(event: MouseEvent) {
    if (!justDragged) return
    justDragged = false
    event.preventDefault()
    event.stopPropagation()
}

/** 长按/拖拽期间屏蔽右键菜单（触屏长按释放后会补发 contextmenu）。 */
function onGridContextMenu(event: MouseEvent) {
    if (pressTimer !== undefined || dragState.active || justDragged) event.preventDefault()
}

/** 幽灵卡片的渲染数据：当前拖拽的磁贴项。 */
const ghostTile = computed(() => tileList.value.find(tile => tile.name === dragState.name) ?? null)

/** 幽灵卡片样式：外层仅做定位（以抓取点为锚跟随指针），缩放/倾斜交给内层卡片动画。 */
const ghostStyle = computed(() => ({
    width: `${dragState.w}px`,
    height: `${dragState.h}px`,
    transform: `translate3d(${dragState.x - dragState.offX}px, ${dragState.y - dragState.offY}px, 0)`,
}))

let hh: string[] = []

/**
 * 计算字符串的 SHA1。
 * @param input 输入字符串。
 * @returns 十六进制摘要。
 */
const sha1 = (input: string) => {
    const md = forge.md.sha1.create()
    md.update(input, "utf8")
    return md.digest().toHex()
}

/**
 * 生成当前输入序列的校验串。
 * @param history 最近 5 次输入。
 * @param input 当前输入字符。
 * @returns 校验串。
 */
const buildSignature = (history: string[], input: string) => {
    const signature = `${sha1(`0:${history[0] ?? ""}`)}${sha1(`1:${history[1] ?? ""}`)}${sha1(`2:${history[2] ?? ""}`)}${sha1(`3:${history[3] ?? ""}`)}${sha1(`4:${history[4] ?? ""}`)}${sha1(`5:${input}`)}`

    return sha256(signature)
}

const scriptSignature = "c43801e66e06857150b1930ae4a9831af5259aeb7d65ed7d73d83176adabec97"

/**
 * 处理 More 页面全局按键输入。
 * @param event 键盘事件。
 */
const handleKeydown = (event: KeyboardEvent) => {
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) {
        return
    }

    const input = event.key.toLowerCase()
    const history = hh.slice(-5)
    const signature = buildSignature(history, input)

    if (signature === scriptSignature) {
        scriptUnlocked.value = !scriptUnlocked.value
        hh = []
        return
    }

    hh = [...history, input].slice(-5)
}

onMounted(() => {
    document.addEventListener("keydown", handleKeydown)
})

onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleKeydown)
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- Win10 磁贴画布：auto-fit 自动填充列，未占满宽度时整组居中（每行共享同一轨道偏移） -->
        <div class="mx-auto min-h-full w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <!-- 顶部工具行：右上角入口风格切换（磁贴 / Home 快捷入口） -->
            <div class="sticky top-0 z-10 mb-6 flex justify-end">
                <label
                    class="flex cursor-pointer items-center gap-2 rounded-lg border border-base-content/15 bg-base-100/80 px-3 py-1.5 shadow-sm backdrop-blur-sm"
                    :title="$t('more.style.title')"
                >
                    <span class="text-xs font-medium transition-colors" :class="useQuickNavStyle ? 'text-base-content/40' : 'text-primary'">
                        {{ $t("more.style.tile") }}
                    </span>
                    <input
                        v-model="useQuickNavStyle"
                        type="checkbox"
                        class="toggle toggle-sm toggle-primary"
                        :aria-label="$t('more.style.title')"
                    />
                    <span class="text-xs font-medium transition-colors" :class="useQuickNavStyle ? 'text-primary' : 'text-base-content/40'">
                        {{ $t("more.style.quicknav") }}
                    </span>
                </label>
            </div>
            <!-- TransitionGroup：拖拽交换时其余磁贴以 FLIP 平滑滑动让位（仿 Win10 开始屏幕） -->
            <TransitionGroup
                v-if="!useQuickNavStyle"
                tag="div"
                name="po-tile"
                class="po-grid"
                @click.capture="onGridClickCapture"
                @contextmenu="onGridContextMenu"
                @dragstart.capture.prevent
            >
                <ContextMenu
                    v-for="(item, index) in tileList"
                    :key="item.name"
                    class="po-tile-rise po-tile-slot"
                    :class="[`po-tile-slot--${item.size}`, { 'po-tile-dragging': dragState.active && dragState.name === item.name }]"
                    :style="{ animationDelay: `${0.08 + index * 0.03}s` }"
                    :data-po-name="item.name"
                    :data-po-index="index"
                    @pointerdown="(event: PointerEvent) => onTilePointerDown(event, item.name)"
                    @pointermove="onTilePointerMove"
                    @pointerup="onTilePointerUp"
                    @pointercancel="onTilePointerCancel"
                >
                    <POCard
                        :size="item.size"
                        :to="item.path"
                        :icon="item.icon"
                        :title="$t(`${item.name}.title`)"
                        :description="$t(`${item.name}.desc`)"
                        :gradient="item.gradient"
                        :glow="item.glow"
                    />
                    <template #menu>
                        <!-- 切换颜色：弹出调色板子菜单 -->
                        <ContextMenuSub>
                            <ContextMenuSubTrigger class="po-tile-menu-item">
                                <Icon class="size-4 mr-2" icon="ri:palette-line" />
                                {{ $t("more.contextMenu.changeColor") }}
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent
                                class="min-w-55 z-30 bg-base-100/80 outline-none rounded-lg p-2 shadow-lg will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade"
                            >
                                <ContextMenuItem
                                    v-for="color in TILE_PALETTE"
                                    :key="color.name"
                                    class="po-tile-menu-item"
                                    @click="setTileColor(item.name, color.color)"
                                >
                                    <span
                                        class="size-3 mr-2 rounded-full shrink-0"
                                        :style="{ background: makeTileTheme(color.color).gradient }"
                                    />
                                    {{ $t(`more.contextMenu.color.${color.name}`) }}
                                </ContextMenuItem>
                                <!-- 自定义颜色：弹出取色器弹窗 -->
                                <ContextMenuItem class="po-tile-menu-item" @click="openCustomColor(item.name)">
                                    <span
                                        class="size-3 mr-2 rounded-full shrink-0"
                                        :style="{
                                            background:
                                                'conic-gradient(#f5576c, #f7971e, #fde047, #43e97b, #00c6ff, #7f00ff, #f83600, #f5576c)',
                                        }"
                                    />
                                    {{ $t("more.contextMenu.customColor") }}
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <!-- 切换大小：弹出 小/宽/大 子菜单 -->
                        <ContextMenuSub>
                            <ContextMenuSubTrigger class="po-tile-menu-item">
                                <Icon class="size-4 mr-2" icon="ri:grid-line" />
                                {{ $t("more.contextMenu.changeSize") }}
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent
                                class="min-w-55 z-30 bg-base-100/80 outline-none rounded-lg p-2 shadow-lg will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade"
                            >
                                <ContextMenuItem
                                    v-for="size in SIZE_OPTIONS"
                                    :key="size"
                                    class="po-tile-menu-item"
                                    @click="setTileSize(item.name, size)"
                                >
                                    <span
                                        class="mr-2 rounded-xs border border-base-content/40 shrink-0"
                                        :style="tileSizePreviewStyle(size)"
                                    />
                                    {{ $t(`more.contextMenu.size.${size}`) }}
                                    <Icon v-if="item.size === size" class="size-4 ml-auto" icon="ri:checkbox-circle-fill" />
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <!-- 恢复默认（仅存在自定义覆盖时显示） -->
                        <ContextMenuItem v-if="hasOverride(item.name)" class="po-tile-menu-item" @click="resetTileOverride(item.name)">
                            <Icon class="size-4 mr-2" icon="ri:restart-line" />
                            {{ $t("more.contextMenu.reset") }}
                        </ContextMenuItem>
                    </template>
                </ContextMenu>
            </TransitionGroup>
            <!-- Home 快捷入口风格：复用首页快捷导航样式，auto-fill 自适应列数 -->
            <HomeQuickNav v-else autofill :items="quickNavItems" />
        </div>
        <!-- 拖拽幽灵：Teleport 到 body，外层定位跟随指针，内层卡片做“浮起”缩放动画 -->
        <Teleport to="body">
            <div v-if="dragState.active && ghostTile" class="po-drag-ghost" :style="ghostStyle" aria-hidden="true">
                <div class="po-drag-ghost__card">
                    <POCard
                        :size="ghostTile.size"
                        :to="ghostTile.path"
                        :icon="ghostTile.icon"
                        :title="$t(`${ghostTile.name}.title`)"
                        :description="$t(`${ghostTile.name}.desc`)"
                        :gradient="ghostTile.gradient"
                        :glow="ghostTile.glow"
                        :tilt="false"
                    />
                </div>
            </div>
        </Teleport>
    </ScrollArea>

    <!-- 自定义颜色弹窗：原生取色器 + hex 输入，确定后应用为基础色 -->
    <dialog id="po-tile-color-modal" class="modal z-40">
        <div class="modal-box">
            <h3 class="text-lg font-bold">{{ $t("more.contextMenu.customColor") }}</h3>
            <div class="mt-5 flex flex-col items-center gap-4">
                <!-- 原生取色器：直接选取任意颜色 -->
                <input
                    v-model="customColorState.hex"
                    type="color"
                    class="h-16 w-28 cursor-pointer rounded-lg border border-base-content/20 bg-transparent p-1"
                />
                <!-- 手动 hex 输入（非法输入自动回退） -->
                <input
                    :value="customColorState.hex"
                    type="text"
                    class="input input-sm input-bordered w-36 text-center font-mono"
                    @input="onCustomHexInput"
                />
                <!-- 预览：OKLCH 派生后的磁贴渐变 -->
                <span class="h-8 w-36 rounded-lg" :style="{ background: makeTileTheme(customColorState.hex).gradient }" />
            </div>
            <div class="modal-action">
                <button class="btn btn-sm" @click="closeCustomColor">{{ $t("more.contextMenu.cancel") }}</button>
                <button class="btn btn-sm btn-primary" @click="applyCustomColor">{{ $t("more.contextMenu.confirm") }}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>{{ $t("more.contextMenu.cancel") }}</button>
        </form>
    </dialog>
</template>

<style scoped>
/* Win10 磁贴画布：auto-fit 自动填充列，行高与列宽取同一单元格尺寸，保证各尺寸磁贴严格对齐。
   justify-content: center 使未占满宽度的行整组居中（auto-fit 折叠空轨道，各行共享同一偏移）。 */
.po-grid {
    --po-cell: clamp(5.25rem, 9vw, 7.5rem);
    display: grid;
    grid-template-columns: repeat(auto-fit, var(--po-cell));
    grid-auto-rows: var(--po-cell);
    grid-auto-flow: dense;
    justify-content: center;
    gap: 0.75rem;
}

/* 磁贴跨度：右键菜单包装层（ContextMenu 触发元素）按 POCard 三种尺寸映射到网格占位 */
.po-grid :deep(.po-tile-slot) {
    grid-column: span 1;
    grid-row: span 1;
    min-width: 0;
    min-height: 0;
}

.po-grid :deep(.po-tile-slot--large) {
    grid-column: span 2;
    grid-row: span 2;
}

.po-grid :deep(.po-tile-slot--wide) {
    grid-column: span 2;
    grid-row: span 1;
}

/* 包装层内的磁贴占满单元格（网格拉伸不再直接作用于 POCard 根元素） */
.po-grid :deep(.po-tile-slot .po-card) {
    width: 100%;
    height: 100%;
}

/* 右键菜单项：与全站 ContextMenu 使用一致的高亮/禁用样式 */
.po-tile-menu-item {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    font-size: 0.875rem;
    line-height: 1;
    color: var(--color-base-content);
    border-radius: 0.5rem;
    position: relative;
    user-select: none;
    outline: none;
    cursor: pointer;
    white-space: nowrap;
}

.po-tile-menu-item[data-highlighted] {
    background: var(--color-primary);
    color: var(--color-base-100);
}

.po-tile-menu-item[data-disabled] {
    color: var(--color-base-content);
    opacity: 0.6;
    pointer-events: none;
}

/* 磁贴一次性入场动画：轻量上浮淡入，逐块错峰显现，仅播放一次。
   fill 用 backwards（不用 both）：结束后动画不再钉住 transform，FLIP 位移动画才能接管 */
.po-tile-rise {
    animation: po-tile-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes po-tile-rise {
    from {
        opacity: 0;
        transform: translateY(10px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

/* TransitionGroup 移动过渡：拖拽交换时其余磁贴平滑滑动让位（FLIP） */
.po-tile-move {
    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 拖拽中的磁贴：原位整体隐藏（visibility 保留网格占位形成空槽，不参与指针命中），仅留镜像跟随指针（仿 Win10） */
.po-tile-dragging {
    visibility: hidden;
}

/* 拖拽幽灵外层：fixed 以抓取点为锚跟随指针，只负责定位；不响应指针事件 */
.po-drag-ghost {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 60;
    pointer-events: none;
}

/* 拖拽幽灵内层卡片：明显缩小 + 轻微倾斜 + 大投影，入场时播放“浮起”动画；
   缩小让空槽四周边缘露出，形成明确的脱离网格悬浮感（仿 Win10） */
.po-drag-ghost__card {
    width: 100%;
    height: 100%;
    animation: po-ghost-lift 0.16s cubic-bezier(0.22, 1, 0.36, 1) both;
    filter: drop-shadow(0 18px 32px rgba(0, 0, 0, 0.5));
}

/* 幽灵内的 POCard 撑满外层尺寸（与网格内一致，保证镜像与原磁贴同尺寸） */
.po-drag-ghost__card :deep(.po-card) {
    width: 100%;
    height: 100%;
}

@keyframes po-ghost-lift {
    from {
        transform: scale(1) rotate(0deg);
    }
    to {
        transform: scale(0.85) rotate(2deg);
    }
}

/* 减少动态偏好：关闭入场与浮起动画（浮起改为静态缩小态） */
@media (prefers-reduced-motion: reduce) {
    .po-tile-rise {
        animation: none;
    }

    .po-tile-move {
        transition: none;
    }

    .po-drag-ghost__card {
        animation: none;
        transform: scale(0.85) rotate(2deg);
    }
}
</style>
