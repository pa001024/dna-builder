import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

/**
 * 桌面分身的前后端契约封装。
 *
 * 克隆窗口 label 为 `desktop-clone`，承载路由 `/desktop-clone`；命令与事件名与
 * `apps/web/src-tauri/src/submodules/desktop_clone` 保持一致。凭据只在对话框组件内存中，
 * 本模块不接触 localStorage。
 */

/** 克隆窗口的 Tauri label（capabilities 按此授权）。 */
export const DESKTOP_CLONE_WINDOW_LABEL = "desktop-clone"

/** 事件名：完整状态快照。 */
export const CLONE_EVENT_STATUS = "desktop-clone:status"
/** 事件名：需要重新输入账号密码。 */
export const CLONE_EVENT_CREDENTIALS_REQUIRED = "desktop-clone:credentials-required"
/** 事件名：系统关闭按钮被拦截，等待前端确认。 */
export const CLONE_EVENT_CLOSE_REQUESTED = "desktop-clone:close-requested"
/** 事件名：已连接时修改热键路由/静音，需要重连。 */
export const CLONE_EVENT_RECONNECT_REQUIRED = "desktop-clone:reconnect-required"
/** 事件名：控件报告的实际鼠标模式。 */
export const CLONE_EVENT_MOUSE_MODE_CHANGED = "desktop-clone:mouse-mode-changed"

export type CloneState =
    | "unsupported"
    | "idle"
    | "preparing"
    | "awaiting-credentials"
    | "connecting"
    | "connected"
    | "disconnected"
    | "error"
    | "closing"

export type SmallWindowMode = "off" | "500" | "1280"
export type KeyboardHookMode = "local" | "remote"
export type MouseMode = "normal" | "game"
export type CloneSendKeyAction = "switch-window" | "show-desktop" | "task-manager"

export interface CloneCapability {
    supported: boolean
    reason: string | null
    editionId: string
    productName: string
    build: number
    displayVersion: string
    elevated: boolean
    childSessionsEnabled: boolean
    termServiceRunning: boolean
    remoteDesktopDenied: boolean
    activeChildSessionId: number | null
    activeXAvailable: boolean
    atlAvailable: boolean
}

export interface CloneProgram {
    id: string
    name: string
    path: string
    args: string
    elevated: boolean
}

export interface CloneOptions {
    alwaysOnTop: boolean
    smartSizing: boolean
    aspectLock: boolean
    smallWindow: SmallWindowMode
    keyboardHook: KeyboardHookMode
    mouseMode: MouseMode
    muted: boolean
    programs: CloneProgram[]
}

export interface CloneError {
    code: string
    message: string
}

export interface CloneStatus {
    state: CloneState
    capability: CloneCapability
    sessionId: number | null
    error: CloneError | null
    options: CloneOptions
    chromeHeight: number
    overlayVisible: boolean
}

export interface CloneCredentialsPayload {
    usernameHint: string
}

export interface CloneReconnectPayload {
    reason: "keyboard-hook" | "mute"
}

export interface CloneMouseModePayload {
    relative: boolean
    /** 控件拒绝相对鼠标时的降级原因（此时 `relative` 恒为 false，选项已回写普通模式）。 */
    degraded?: string
}

/** 选项默认值（与 Rust `CloneOptions::default` 对齐）。 */
export function createDefaultCloneOptions(): CloneOptions {
    return {
        alwaysOnTop: false,
        smartSizing: true,
        aspectLock: true,
        smallWindow: "off",
        keyboardHook: "local",
        mouseMode: "normal",
        muted: false,
        programs: [],
    }
}

export function desktopCloneStatus(): Promise<CloneStatus> {
    return invoke<CloneStatus>("desktop_clone_status")
}

export function desktopCloneCapability(): Promise<CloneCapability> {
    return invoke<CloneCapability>("desktop_clone_capability")
}

export function desktopClonePrepare(): Promise<CloneCapability> {
    return invoke<CloneCapability>("desktop_clone_prepare")
}

export function desktopCloneOpen(): Promise<void> {
    return invoke("desktop_clone_open")
}

export function desktopCloneConnect(username: string, password: string): Promise<void> {
    return invoke("desktop_clone_connect", { username, password })
}

export function desktopCloneDisconnect(): Promise<void> {
    return invoke("desktop_clone_disconnect")
}

export function desktopCloneReconnect(): Promise<void> {
    return invoke("desktop_clone_reconnect")
}

export function desktopCloneCloseSession(logoff: boolean): Promise<void> {
    return invoke("desktop_clone_close_session", { logoff })
}

export function desktopCloneHide(): Promise<void> {
    return invoke("desktop_clone_hide")
}

export function desktopCloneGetOptions(): Promise<CloneOptions> {
    return invoke<CloneOptions>("desktop_clone_get_options")
}

export function desktopCloneSetOptions(options: CloneOptions): Promise<CloneOptions> {
    return invoke<CloneOptions>("desktop_clone_set_options", { options })
}

export function desktopCloneSetOverlayVisible(visible: boolean): Promise<void> {
    return invoke("desktop_clone_set_overlay_visible", { visible })
}

export function desktopCloneSetChromeHeight(height: number): Promise<void> {
    return invoke("desktop_clone_set_chrome_height", { height })
}

/** 返回实际投送通道（`control` / `remote-action` / 含 `send-input` 的降级说明）。 */
export function desktopCloneSendKeys(action: CloneSendKeyAction): Promise<string> {
    return invoke<string>("desktop_clone_send_keys", { action })
}

/** 返回 Task Scheduler 任务名。 */
export function desktopCloneLaunchProgram(id: string): Promise<string> {
    return invoke<string>("desktop_clone_launch_program", { id })
}

export function desktopCloneDiagnose(): Promise<string> {
    return invoke<string>("desktop_clone_diagnose")
}

export function listenCloneStatus(handler: (status: CloneStatus) => void): Promise<UnlistenFn> {
    return listen<CloneStatus>(CLONE_EVENT_STATUS, event => handler(event.payload))
}

export function listenCloneCredentialsRequired(handler: (payload: CloneCredentialsPayload) => void): Promise<UnlistenFn> {
    return listen<CloneCredentialsPayload>(CLONE_EVENT_CREDENTIALS_REQUIRED, event => handler(event.payload))
}

export function listenCloneCloseRequested(handler: () => void): Promise<UnlistenFn> {
    return listen(CLONE_EVENT_CLOSE_REQUESTED, () => handler())
}

export function listenCloneReconnectRequired(handler: (payload: CloneReconnectPayload) => void): Promise<UnlistenFn> {
    return listen<CloneReconnectPayload>(CLONE_EVENT_RECONNECT_REQUIRED, event => handler(event.payload))
}

export function listenCloneMouseModeChanged(handler: (payload: CloneMouseModePayload) => void): Promise<UnlistenFn> {
    return listen<CloneMouseModePayload>(CLONE_EVENT_MOUSE_MODE_CHANGED, event => handler(event.payload))
}

/** 把 invoke 的拒绝值转成可展示文本（后端返回的是字符串）。 */
export function toCloneErrorMessage(cause: unknown): string {
    if (typeof cause === "string") return cause
    if (cause instanceof Error) return cause.message
    try {
        return JSON.stringify(cause)
    } catch {
        return String(cause)
    }
}

/**
 * 把后端错误文本/错误码映射到 i18n 键；无法识别时返回空串，由调用方回退原文。
 * 后端 `CredentialFailure` 的消息里带有 Win32 登录错误码，这里按码与原文双重匹配。
 */
export function cloneErrorI18nKey(code: string | null | undefined, message: string | null | undefined): string {
    const text = message ?? ""
    if (/1326|账号或密码错误/.test(text)) return "desktop_clone.error.bad_credentials"
    if (/1327|账户限制/.test(text)) return "desktop_clone.error.account_restricted"
    if (/1330|密码已过期/.test(text)) return "desktop_clone.error.password_expired"
    if (/1331|账户已被禁用/.test(text)) return "desktop_clone.error.account_disabled"
    if (/1385|远程登录的权限/.test(text)) return "desktop_clone.error.no_remote_permission"
    if (/1907|修改密码/.test(text)) return "desktop_clone.error.password_change_required"
    switch (code) {
        case "credentials-required":
            return "desktop_clone.error.credentials_required"
        case "prepare-failed":
            return "desktop_clone.error.prepare_failed"
        case "window-failed":
            return "desktop_clone.error.window_failed"
        case "connect-failed":
            return "desktop_clone.error.connect_failed"
        case "logon-error":
            return "desktop_clone.error.logon_failed"
        case "disconnected":
            return "desktop_clone.error.disconnected"
        case "fatal":
            return "desktop_clone.error.fatal"
        default:
            return ""
    }
}
