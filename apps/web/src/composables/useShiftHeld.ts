import { type Ref, readonly, ref } from "vue"

/**
 * 全局 Shift 按住状态（模块级单例）：预览装备卡据此展开专属词条的生效字段。
 *
 * 在 window 捕获阶段监听 keydown / keyup（焦点在输入框或子组件阻止冒泡时仍能感知），
 * 窗口失焦 / 页面隐藏时复位，避免松开 Shift 后卡在展开态。
 * 无 window 环境（SSR / node 测试）安全降级为恒 false，不注册任何监听。
 * 监听在模块加载时即挂载：用户先按住 Shift 再首次打开预览，也要立即进入详情态。
 */

const shiftHeld = ref(false)
const shiftHeldState = readonly(shiftHeld)
let listening = false

/**
 * 更新 Shift 状态（相同值不触发响应式更新）。
 * @param value 是否按住
 */
function setShiftHeld(value: boolean) {
    if (shiftHeld.value !== value) shiftHeld.value = value
}

/**
 * keydown：Shift 本体或其组合键（`shiftKey`）都视为按住。
 * @param event 键盘事件
 */
function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Shift" || event.shiftKey) setShiftHeld(true)
}

/**
 * keyup：释放 Shift 本体，或任意按键释放时 `shiftKey` 已为 false（Shift 在窗口外松开）。
 * @param event 键盘事件
 */
function handleKeyUp(event: KeyboardEvent) {
    if (event.key === "Shift" || !event.shiftKey) setShiftHeld(false)
}

/** 窗口失焦复位 */
function resetShiftHeld() {
    setShiftHeld(false)
}

/** 页面切走后复位（keyup 可能收不到） */
function handleVisibilityChange() {
    if (window.document.hidden) resetShiftHeld()
}

/** 挂载单例监听（幂等；无 window 的 SSR / node 环境跳过） */
function ensureShiftHeldListeners() {
    if (listening || typeof window === "undefined") return
    listening = true
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("keyup", handleKeyUp, true)
    window.addEventListener("blur", resetShiftHeld)
    window.document.addEventListener("visibilitychange", handleVisibilityChange)
}

// 模块加载即预热：首次 useShiftHeld（首张预览卡挂载）之前已按住的 Shift 也能被记录
ensureShiftHeldListeners()

/**
 * Shift 按住状态（单例，所有订阅者共享）。
 * @returns 只读响应式状态：按住 Shift 为 true
 */
export function useShiftHeld(): Readonly<Ref<boolean>> {
    ensureShiftHeldListeners()

    return shiftHeldState
}
