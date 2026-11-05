import type { UnlistenFn } from "@tauri-apps/api/event"
import { defineStore } from "pinia"
import { onScopeDispose, ref, watch } from "vue"
import {
    type CloneCapability,
    type CloneError,
    type CloneOptions,
    type CloneProgram,
    type CloneSendKeyAction,
    type CloneState,
    type CloneStatus,
    createDefaultCloneOptions,
    desktopCloneCloseSession,
    desktopCloneConnect,
    desktopCloneDiagnose,
    desktopCloneDisconnect,
    desktopCloneHide,
    desktopCloneLaunchProgram,
    desktopClonePrepare,
    desktopCloneReconnect,
    desktopCloneSendKeys,
    desktopCloneSetOptions,
    desktopCloneSetOverlayVisible,
    desktopCloneStatus,
    listenCloneCloseRequested,
    listenCloneCredentialsRequired,
    listenCloneMouseModeChanged,
    listenCloneReconnectRequired,
    listenCloneStatus,
    toCloneErrorMessage,
} from "@/api/desktop-clone"
import { env } from "@/env"

/**
 * 克隆窗口的桌面分身状态。
 *
 * 只在 label `desktop-clone` 的 webview 内使用：事件由后端 `emit_to("desktop-clone")` 定向发送，
 * 主窗口的 store 实例收不到。浏览器预览（非 Tauri）下所有命令直接跳过，避免调用不存在的 IPC。
 */

const FALLBACK_OPTIONS = createDefaultCloneOptions()

let unlisteners: UnlistenFn[] = []
let listening = false
/** 最近一次选项变更前的快照，用于「取消重连」时还原热键/静音。 */
let optionsBeforeChange: CloneOptions | null = null
/** 还原选项期间后端仍会发 reconnect-required，这里短暂吞掉以免弹层循环。 */
let reverting = false
/** 选项提交串行队列：连续编辑必须基于前一次提交后的状态，否则后一次会覆盖前一次。 */
let optionsQueue: Promise<void> = Promise.resolve()

const overlayCount = ref(0)
/** 后端当前是否已被要求展开 WebView2（避免重复 IPC；展开后原生宿主隐藏）。 */
let overlayExpanded = false
/** 最近一次展开/收起调用：打开弹层前必须 await 它，否则弹层会被 44px 条状视口裁切。 */
let overlayTransition: Promise<void> = Promise.resolve()

function requestOverlay(visible: boolean): Promise<void> {
    overlayExpanded = visible
    if (!env.isApp) return Promise.resolve()
    overlayTransition = desktopCloneSetOverlayVisible(visible).catch(cause => {
        console.error("切换桌面分身覆盖层失败", cause)
    })
    return overlayTransition
}

/** 占用一次「网页覆盖层」：任一弹层/状态层显示期间都占用，展开 WebView2 并隐藏原生 RDP 子窗口。 */
export function acquireCloneOverlay() {
    overlayCount.value += 1
    if (overlayCount.value === 1 && !overlayExpanded) void requestOverlay(true)
}

/** 释放一次覆盖层占用；计数归零才恢复条状 WebView2 与原生子窗口。 */
export function releaseCloneOverlay() {
    if (overlayCount.value === 0) return
    overlayCount.value -= 1
    if (overlayCount.value === 0 && overlayExpanded) void requestOverlay(false)
}

/**
 * 打开弹层前调用：等后端把 WebView2 展开到整窗再置真 `open`。
 *
 * 调用方 await 之后应立即打开弹层，随后的 `watchCloneOverlay` 只占计数、不会重复请求。
 */
export async function prepareCloneOverlay(): Promise<void> {
    if (overlayExpanded) {
        await overlayTransition
        return
    }
    await requestOverlay(true)
}

/** 组件卸载时强制复位，避免残留计数把原生子窗口永久藏起来。 */
export function resetCloneOverlay() {
    if (overlayCount.value === 0 && !overlayExpanded) return
    overlayCount.value = 0
    if (overlayExpanded) void requestOverlay(false)
}

/**
 * 绑定一个「打开即隐藏原生子窗口」的响应式开关。
 * @param source 开关状态 getter
 */
export function watchCloneOverlay(source: () => boolean) {
    let held = false
    const stop = watch(
        source,
        open => {
            if (open === held) return
            held = open
            if (open) acquireCloneOverlay()
            else releaseCloneOverlay()
        },
        { immediate: true }
    )
    onScopeDispose(() => {
        stop()
        if (!held) return
        held = false
        releaseCloneOverlay()
    })
}

function cloneOptions(options: CloneOptions): CloneOptions {
    return { ...options, programs: options.programs.map(program => ({ ...program })) }
}

function errorText(error: CloneError | null): string {
    return error?.message ?? ""
}

export const useDesktopCloneStore = defineStore("desktopClone", {
    state: () => ({
        status: null as CloneStatus | null,
        initialized: false,
        /** 首次/手动读取状态失败：界面必须给出重试入口，而不是停在空白页。 */
        loadFailed: false,
        /** 当前进行中的长操作，用于禁用按钮。 */
        busy: "" as "" | "connect" | "prepare" | "disconnect" | "reconnect" | "close",
        credentialsPrompt: null as { usernameHint: string } | null,
        closeRequested: false,
        reconnectPrompt: null as { reason: "keyboard-hook" | "mute" } | null,
        relativeMouse: null as boolean | null,
        /** 控件拒绝相对鼠标时的降级原因；后端已把 mouseMode 回写为 normal。 */
        mouseDegraded: "",
        lastError: "",
    }),
    getters: {
        state: (state): CloneState => state.status?.state ?? "idle",
        capability: (state): CloneCapability | null => state.status?.capability ?? null,
        options: (state): CloneOptions => state.status?.options ?? FALLBACK_OPTIONS,
        sessionId: (state): number | null => state.status?.sessionId ?? null,
        error: (state): CloneError | null => state.status?.error ?? null,
        connected: (state): boolean => state.status?.state === "connected",
        busyState: (state): boolean => state.busy !== "",
        errorMessage: (state): string => errorText(state.status?.error ?? null),
    },
    actions: {
        async init() {
            if (this.initialized) return
            if (!env.isApp) {
                this.initialized = true
                return
            }
            if (!listening) {
                listening = true
                const registered: UnlistenFn[] = []
                try {
                    registered.push(await listenCloneStatus(status => this.applyStatus(status)))
                    registered.push(
                        await listenCloneCredentialsRequired(payload => {
                            this.credentialsPrompt = payload
                            this.reconnectPrompt = null
                        })
                    )
                    registered.push(
                        await listenCloneCloseRequested(() => {
                            this.closeRequested = true
                        })
                    )
                    registered.push(
                        await listenCloneReconnectRequired(payload => {
                            if (reverting) return
                            this.reconnectPrompt = payload
                        })
                    )
                    registered.push(
                        await listenCloneMouseModeChanged(payload => {
                            this.relativeMouse = payload.relative
                            if (payload.degraded) this.mouseDegraded = payload.degraded
                        })
                    )
                } catch (cause) {
                    listening = false
                    this.lastError = toCloneErrorMessage(cause)
                    console.error("订阅桌面分身事件失败", cause)
                }
                unlisteners = registered
            }
            await this.refresh()
            this.initialized = true
        },
        dispose() {
            for (const unlisten of unlisteners) {
                try {
                    unlisten()
                } catch (cause) {
                    console.error("取消桌面分身事件订阅失败", cause)
                }
            }
            unlisteners = []
            listening = false
            this.initialized = false
            this.closeRequested = false
            this.credentialsPrompt = null
            this.reconnectPrompt = null
            this.mouseDegraded = ""
        },
        clearMouseDegraded() {
            this.mouseDegraded = ""
        },
        applyStatus(status: CloneStatus) {
            this.loadFailed = false
            // 主窗口（设置页）改了需要重连的选项时也走这里：先留下变更前快照，取消重连才能还原
            const previous = this.status
            if (previous) {
                const changed =
                    previous.options.keyboardHook !== status.options.keyboardHook || previous.options.muted !== status.options.muted
                if (changed) optionsBeforeChange = cloneOptions(previous.options)
            }
            this.status = status
        },
        async refresh() {
            if (!env.isApp) return
            try {
                this.status = await desktopCloneStatus()
                this.loadFailed = false
            } catch (cause) {
                this.loadFailed = true
                this.lastError = toCloneErrorMessage(cause)
                console.error("读取桌面分身状态失败", cause)
            }
        },
        async prepare() {
            this.busy = "prepare"
            this.lastError = ""
            try {
                const capability = await desktopClonePrepare()
                if (this.status) this.status.capability = capability
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
                throw cause
            } finally {
                this.busy = ""
            }
        },
        async connect(username: string, password: string) {
            this.busy = "connect"
            this.lastError = ""
            try {
                await desktopCloneConnect(username, password)
                this.credentialsPrompt = null
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
                throw cause
            } finally {
                this.busy = ""
            }
        },
        async disconnect() {
            this.busy = "disconnect"
            this.lastError = ""
            try {
                await desktopCloneDisconnect()
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
                throw cause
            } finally {
                this.busy = ""
            }
        },
        async reconnect() {
            this.busy = "reconnect"
            this.lastError = ""
            try {
                await desktopCloneReconnect()
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
                throw cause
            } finally {
                this.busy = ""
            }
        },
        async closeSession(logoff: boolean) {
            this.busy = "close"
            this.closeRequested = false
            this.reconnectPrompt = null
            try {
                await desktopCloneCloseSession(logoff)
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
                throw cause
            } finally {
                this.busy = ""
            }
        },
        async hide() {
            this.closeRequested = false
            this.credentialsPrompt = null
            this.reconnectPrompt = null
            try {
                await desktopCloneHide()
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
                throw cause
            }
        },
        setOptions(patch: Partial<CloneOptions>): Promise<void> {
            const run = optionsQueue
                .catch(() => undefined)
                .then(async () => {
                    const status = this.status
                    if (!status) return
                    // 队列执行到这里时，上一次提交的结果（或状态事件）已经写回
                    const before = status.options
                    optionsBeforeChange = cloneOptions(before)
                    try {
                        status.options = await desktopCloneSetOptions({ ...before, ...patch })
                        this.lastError = ""
                    } catch (cause) {
                        status.options = before
                        this.lastError = toCloneErrorMessage(cause)
                        throw cause
                    }
                })
            optionsQueue = run.catch(() => undefined)
            return run
        },
        async setPrograms(programs: CloneProgram[]) {
            await this.setOptions({ programs })
        },
        /** 取消重连：把热键路由/静音还原到变更前的值并重新持久化。 */
        async revertReconnectOption() {
            const prompt = this.reconnectPrompt
            const previous = optionsBeforeChange
            this.reconnectPrompt = null
            if (!prompt || !previous) return
            reverting = true
            try {
                const patch: Partial<CloneOptions> =
                    prompt.reason === "keyboard-hook" ? { keyboardHook: previous.keyboardHook } : { muted: previous.muted }
                await this.setOptions(patch)
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
            } finally {
                window.setTimeout(() => {
                    reverting = false
                }, 800)
            }
        },
        async sendKeys(action: CloneSendKeyAction): Promise<string> {
            try {
                return await desktopCloneSendKeys(action)
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
                throw cause
            }
        },
        async launchProgram(id: string): Promise<string> {
            try {
                return await desktopCloneLaunchProgram(id)
            } catch (cause) {
                this.lastError = toCloneErrorMessage(cause)
                throw cause
            }
        },
        diagnose(): Promise<string> {
            return desktopCloneDiagnose()
        },
    },
})
