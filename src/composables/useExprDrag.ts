import { computed, onScopeDispose, ref } from "vue"

/** 抓起的字段负载 */
export interface ExprDragPayload {
    /** 插入表达式时写入的文本（已含命名空间与强制属性后缀），同时也是浮动标签的显示内容 */
    expr: string
    /** 展示名，用于触控抓起的提示文案 */
    label: string
}

/** 放置回调：由表达式输入区注册，负责把字段真正写进对应输入框 */
export type ExprDropHandler = (targetKey: string, payload: ExprDragPayload) => void

/** 触发拖动所需的最小指针位移（px），小于该值视为点击 */
const DRAG_THRESHOLD = 6

/** 放置目标选择器：带 data-expr-drop 属性的元素均可接收字段 */
const DROP_TARGET_SELECTOR = "[data-expr-drop]"

/** click 吞掉窗口（ms）：覆盖 pointerup 到 click 之间的间隔 */
const CLICK_SWALLOW_MS = 350

/** 鼠标点击插入后浮动标签的保留时长（ms） */
const CLICK_FLASH_MS = 700

/** 已抓起的字段（拖动中，或触控点击抓起后等待放置） */
const payload = ref<ExprDragPayload | null>(null)
/** 鼠标点击插入后的短暂浮动反馈：内容为刚刚写入表达式的字符串 */
const clickFlash = ref<ExprDragPayload | null>(null)
/** 是否处于指针拖动中（鼠标按下并超过位移阈值） */
const dragging = ref(false)
/** 是否由触控点击抓起（触控不支持拖动，改为「点击抓起 → 点击放置」） */
const touchPicked = ref(false)
/** 浮动标签的视口坐标 */
const ghostPosition = ref({ x: 0, y: 0 })
/** 当前指针悬停的放置目标 key（拖动中实时更新） */
const hoveredDropKey = ref<string | null>(null)

/** 浮动标签内容：拾取中的字段优先，其次是鼠标点击后的短暂反馈 */
const floatingPayload = computed(() => payload.value ?? clickFlash.value)

/** 指针按下但尚未判定为拖动 / 点击的字段 */
let pressedPayload: ExprDragPayload | null = null
/** 指针起点与指针类型 */
let startX = 0
let startY = 0
let pointerType = ""
/** 需要吞掉 click 的截止时间戳（拖动结束或触控抓起后吞掉源行自身的点击） */
let swallowClickUntil = 0
/** 已注册的放置回调 */
let dropHandler: ExprDropHandler | null = null
/** 全局指针监听是否已挂载 */
let listening = false
/** 鼠标点击浮动反馈的定时器 */
let flashTimer: number | undefined

/**
 * 查找指针位置下方的放置目标。
 * @param x 视口 x 坐标
 * @param y 视口 y 坐标
 * @returns 放置目标 key；未命中返回 null
 */
function findDropTarget(x: number, y: number): string | null {
    const element = document.elementFromPoint(x, y)
    const target = element?.closest<HTMLElement>(DROP_TARGET_SELECTOR)
    return target?.dataset.exprDrop ?? null
}

/** 挂载全局指针监听（拖动、抓起与点击反馈期间都需要跨元素追踪指针以驱动浮动标签） */
function listen() {
    if (listening) return
    listening = true
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerCancel)
}

/** 卸载全局指针监听 */
function unlisten() {
    if (!listening) return
    listening = false
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerCancel)
}

/** 按当前状态挂载 / 卸载全局指针监听：仅在手势中、已抓起或点击反馈期间需要 */
function syncListening() {
    if (pressedPayload || payload.value || clickFlash.value) listen()
    else unlisten()
}

/** 清空鼠标点击的浮动反馈（含定时器） */
function clearClickFlash() {
    if (flashTimer !== undefined) {
        window.clearTimeout(flashTimer)
        flashTimer = undefined
    }
    clickFlash.value = null
}

/**
 * 鼠标点击插入后的短暂浮动反馈：浮动标签继续跟随指针，显示刚写入表达式的字符串。
 * @param field 已插入的字段
 */
function showClickFlash(field: ExprDragPayload) {
    clearClickFlash()
    clickFlash.value = field
    flashTimer = window.setTimeout(() => {
        flashTimer = undefined
        clickFlash.value = null
        syncListening()
    }, CLICK_FLASH_MS)
    syncListening()
}

/**
 * 清空抓取状态。
 * @param swallowClick 是否一并吞掉本次手势随后的 click
 */
function reset(swallowClick = false) {
    if (swallowClick) swallowClickUntil = performance.now() + CLICK_SWALLOW_MS
    payload.value = null
    pressedPayload = null
    dragging.value = false
    touchPicked.value = false
    hoveredDropKey.value = null
    syncListening()
}

/**
 * 指针移动：浮动标签始终跟随指针；按住时超过阈值进入拖动状态并实时更新悬停目标。
 * @param event 指针移动事件
 */
function onPointerMove(event: PointerEvent) {
    if (!pressedPayload) {
        // 触控抓起或点击反馈期间：只更新浮动标签位置
        if (payload.value || clickFlash.value) ghostPosition.value = { x: event.clientX, y: event.clientY }
        return
    }
    // 触控不参与拖动：拖动会与列表滚动冲突，触控改用「点击抓起 → 点击放置」
    if (pointerType === "touch") return
    if (!dragging.value) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) return
        dragging.value = true
        payload.value = pressedPayload
    }
    ghostPosition.value = { x: event.clientX, y: event.clientY }
    hoveredDropKey.value = findDropTarget(event.clientX, event.clientY)
}

/**
 * 指针抬起：拖动命中放置目标则写入字段；触控点击转为「已抓起」等待点击放置；
 * 鼠标点击保留源行原有的追加行为，并给出跟随指针的浮动反馈。
 * @param event 指针抬起事件
 */
function onPointerUp(event: PointerEvent) {
    const pressed = pressedPayload
    if (!pressed) return
    if (dragging.value) {
        const targetKey = findDropTarget(event.clientX, event.clientY)
        if (targetKey) dropHandler?.(targetKey, pressed)
        reset(true)
        return
    }
    if (pointerType === "touch") {
        // 触控点击：抓起字段并吞掉源行 click，避免同时把字段追加到目标函数
        payload.value = pressed
        touchPicked.value = true
        ghostPosition.value = { x: event.clientX, y: event.clientY }
        pressedPayload = null
        swallowClickUntil = performance.now() + CLICK_SWALLOW_MS
        syncListening()
        return
    }
    // 鼠标点击：先清空按下状态，再展示「刚插入的字符串」浮动反馈
    reset()
    showClickFlash(pressed)
}

/** 指针被系统取消（如触控转为滚动）：直接丢弃本次手势 */
function onPointerCancel() {
    reset()
}

/**
 * 指针按下时抓起字段，等待判定「点击」还是「拖动」。
 * 源行需要在 pointerdown 中调用，并在自身 click 处理器里用 consumeExprDragClick 让位给拖动 / 触控抓起。
 * @param field 抓起的字段负载
 * @param event 指针按下事件
 */
export function startExprDrag(field: ExprDragPayload, event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    // 触控再次点击同一字段：取消已抓起的字段
    if (event.pointerType === "touch" && touchPicked.value && payload.value?.expr === field.expr) {
        reset(true)
        return
    }
    clearClickFlash()
    pressedPayload = field
    pointerType = event.pointerType
    startX = event.clientX
    startY = event.clientY
    ghostPosition.value = { x: event.clientX, y: event.clientY }
    dragging.value = false
    swallowClickUntil = 0
    syncListening()
}

/**
 * 源行 click 处理器调用：若本次手势已被拖动 / 触控抓起接管，则返回 true 并吞掉这次点击。
 * @returns 是否忽略该次点击
 */
export function consumeExprDragClick(): boolean {
    if (performance.now() >= swallowClickUntil) return false
    swallowClickUntil = 0
    return true
}

/** 清除当前抓起的字段与点击浮动反馈（提示条的取消按钮、组件卸载时调用） */
export function clearExprDrag() {
    clearClickFlash()
    reset()
}

/**
 * 注册放置回调，表达式输入区据此把字段写入目标输入框。
 * 重复注册时以最后一次为准，组件卸载后自动注销。
 * @param handler 放置回调
 */
export function registerExprDropHandler(handler: ExprDropHandler) {
    dropHandler = handler
    onScopeDispose(() => {
        if (dropHandler === handler) dropHandler = null
    })
}

/**
 * 表达式字段拖拽 / 放置状态（模块级单例）。
 * 编写侧（角色属性、武器属性、技能字段行）与放置侧（表达式与自定义变量输入框）共享同一份抓取状态。
 * @returns 抓取状态与操作函数
 */
export function useExprDrag() {
    return {
        /** 已抓起的字段（拖动中或触控抓起后） */
        payload,
        /** 浮动标签内容（已抓起的字段，或鼠标点击后的短暂反馈） */
        floatingPayload,
        /** 浮动标签坐标 */
        ghostPosition,
        /** 是否处于指针拖动中 */
        dragging,
        /** 是否由触控点击抓起 */
        touchPicked,
        /** 当前悬停的放置目标 key */
        hoveredDropKey,
        /** 是否处于可放置状态（拖动中或触控已抓起） */
        dropReady: computed(() => dragging.value || touchPicked.value),
        startExprDrag,
        consumeExprDragClick,
        clearExprDrag,
        registerExprDropHandler,
    }
}
