import { computed, onScopeDispose, ref } from "vue"

/** 抓起的字段负载 */
export interface ExprDragPayload {
    /** 插入表达式时写入的文本（已含命名空间与强制属性后缀），同时也是浮动标签的显示内容 */
    expr: string
    /** 展示名，用于抓起的提示文案 */
    label: string
}

/** 放置回调：由表达式输入区注册，负责把字段真正写进对应输入框 */
export type ExprDropHandler = (targetKey: string, payload: ExprDragPayload) => void

/** 触发拖动所需的最小指针位移（px），小于该值视为点击 */
const DRAG_THRESHOLD = 6

/** 放置目标选择器：带 data-expr-drop 属性的元素均可接收字段 */
const DROP_TARGET_SELECTOR = "[data-expr-drop]"

/** 已抓起的字段（拖动中，或点击抓起后等待放置） */
const payload = ref<ExprDragPayload | null>(null)
/** 是否处于「点击抓起 → 点击放置」状态（鼠标与触控行为一致） */
const picked = ref(false)
/** 是否处于指针拖动中（鼠标按下并超过位移阈值） */
const dragging = ref(false)
/** 浮动标签的视口坐标 */
const ghostPosition = ref({ x: 0, y: 0 })
/** 当前指针悬停的放置目标 key（拖动或抓起期间实时更新） */
const hoveredDropKey = ref<string | null>(null)

/** 浮动标签内容：已抓起的字段（跟随指针，直到放入目标或再次点击该字段取消） */
const floatingPayload = computed(() => payload.value)

/** 指针按下但尚未判定为拖动 / 点击的字段 */
let pressedPayload: ExprDragPayload | null = null
/** 指针起点与指针类型 */
let startX = 0
let startY = 0
let pointerType = ""
/** 已注册的放置回调 */
let dropHandler: ExprDropHandler | null = null
/** 全局指针监听是否已挂载 */
let listening = false

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

/** 挂载全局指针监听（拖动与抓起期间都需要跨元素追踪指针以驱动浮动标签） */
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

/** 按当前状态挂载 / 卸载全局指针监听：仅在手势中或已抓起时需要 */
function syncListening() {
    if (pressedPayload || payload.value) listen()
    else unlisten()
}

/** 清空抓取状态（放置完成、取消按钮、组件卸载时调用） */
function reset() {
    payload.value = null
    pressedPayload = null
    dragging.value = false
    picked.value = false
    hoveredDropKey.value = null
    syncListening()
}

/**
 * 进入「已抓起」状态：浮动标签跟随指针，等待点击放置目标（或继续拖到目标上松开）放入。
 * 字段行自身不再有 click 行为，所以无需吞掉随后的 click。
 * @param field 抓起的字段
 * @param x 视口 x 坐标
 * @param y 视口 y 坐标
 */
function arm(field: ExprDragPayload, x: number, y: number) {
    payload.value = field
    picked.value = true
    pressedPayload = null
    dragging.value = false
    ghostPosition.value = { x, y }
    syncListening()
}

/**
 * 指针移动：浮动标签始终跟随指针；按住时超过阈值进入拖动状态并实时更新悬停目标。
 * @param event 指针移动事件
 */
function onPointerMove(event: PointerEvent) {
    if (!pressedPayload) {
        // 已抓起（点击抓起后等待放置）：浮动标签跟随指针，并实时高亮下方的放置目标
        if (!payload.value) return
        ghostPosition.value = { x: event.clientX, y: event.clientY }
        hoveredDropKey.value = findDropTarget(event.clientX, event.clientY)
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
 * 指针抬起：拖动命中放置目标则写入字段；未命中或纯点击则进入 / 切换「已抓起」状态，
 * 等待用户点击表达式或自定义变量输入框放入，再次点击同一字段即取消。
 * @param event 指针抬起事件
 */
function onPointerUp(event: PointerEvent) {
    const pressed = pressedPayload
    if (!pressed) return
    if (dragging.value) {
        const targetKey = findDropTarget(event.clientX, event.clientY)
        if (targetKey) {
            dropHandler?.(targetKey, pressed)
            reset()
            return
        }
        // 拖动未命中目标：保留抓取，让用户改用「点击输入框放入」
        arm(pressed, event.clientX, event.clientY)
        return
    }
    // 点击已抓起的同一字段：取消抓取
    if (picked.value && payload.value?.expr === pressed.expr) {
        reset()
        return
    }
    arm(pressed, event.clientX, event.clientY)
}

/** 指针被系统取消（如触控转为滚动）：直接丢弃本次手势 */
function onPointerCancel() {
    reset()
}

/**
 * 指针按下时记下字段，等待判定「点击抓起」还是「拖动放置」。
 * 字段行在 pointerdown 中调用；点击（未拖动）会在 pointerup 时进入「已抓起」状态并等待点击放置。
 * @param field 抓起的字段负载
 * @param event 指针按下事件
 */
export function startExprDrag(field: ExprDragPayload, event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    pressedPayload = field
    pointerType = event.pointerType
    startX = event.clientX
    startY = event.clientY
    ghostPosition.value = { x: event.clientX, y: event.clientY }
    dragging.value = false
    syncListening()
}

/** 清除当前抓起的字段（提示条的取消按钮、放置完成、组件卸载时调用） */
export function clearExprDrag() {
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
        /** 已抓起的字段（拖动中或点击抓起后） */
        payload,
        /** 浮动标签内容（已抓起的字段） */
        floatingPayload,
        /** 浮动标签坐标 */
        ghostPosition,
        /** 是否处于指针拖动中 */
        dragging,
        /** 是否已点击抓起（等待点击放置） */
        picked,
        /** 当前悬停的放置目标 key */
        hoveredDropKey,
        /** 是否处于可放置状态（拖动中或已抓起） */
        dropReady: computed(() => dragging.value || picked.value),
        startExprDrag,
        clearExprDrag,
        registerExprDropHandler,
    }
}
