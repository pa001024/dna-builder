import type { UnlistenFn } from "@tauri-apps/api/event"
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { defineStore } from "pinia"
import { markRaw } from "vue"
import type { AfkEvent } from "@/api/afkSupport"
import {
    getLogAnalysisStatus,
    type LogAnalysisLifecycleEvent,
    type LogAnalysisStatus,
    type LogBatch,
    type LogEvent,
    onLogAnalysisBatch,
    onLogAnalysisLifecycle,
    onLogAnalysisStatus,
    startLogAnalysis,
    stopLogAnalysis,
} from "@/api/logAnalysis"
import { env } from "@/env"
import { analyzeLog } from "@/utils/log-analysis/analysis"
import type { AnalysisSession } from "@/utils/log-analysis/types"
import { collectLogDungeonName, logEventToAfkEvent } from "@/utils/log-ledger"
import { useAfkLedgerStore } from "./afkLedger"
import { useGameStore } from "./game"

/** 原始事件滚动上限：超出后丢弃最旧事件，避免长时间监听吃满内存 */
const MAX_EVENTS = 200000
/** 超出上限的缓冲量：每批都裁剪会把数组搬来搬去，攒够一批再裁 */
const EVENT_TRIM_SLACK = 8192
/** 派生分析节流：高频分包下最多每 500ms 重算一次会话 */
const ANALYSIS_THROTTLE_MS = 500

/** 非响应式事件缓冲：原始事件可达十万级，放进 state 会被逐层代理 */
const logEvents: LogEvent[] = []
/** 监听只挂一次：unlisten 与初始化 Promise 放模块级，避免进入 Pinia 响应式包装 */
let listenersReady = false
let listenersPromise: Promise<void> | null = null
const unlistenFns: UnlistenFn[] = []
/** 派生分析节流的计时状态 */
let analysisTimer: number | null = null
let lastAnalysisAt = 0
/** 任务栏播报的副本名（当前版本 name 常为空，保留最后一次非空值） */
const dungeonNames = new Map<number, string>()

/** 会话切换项：index 为 sessions 数组下标，time 为 Unix epoch 秒。 */
export interface LogAnalysisSessionOption {
    index: number
    label: string
    time: number
}

export const useLogAnalysisStore = defineStore("logAnalysis", {
    state: () => ({
        running: false,
        fromStart: useLocalStorage("game.log_analysis_from_start", true),
        status: null as LogAnalysisStatus | null,
        /** 已收到的原始事件总数（事件本身放在模块级缓冲） */
        eventCount: 0,
        /** 节流后的会话分析结果 */
        sessions: [] as AnalysisSession[],
        /** 只同步开始监听之后的新事件（真实 epoch 毫秒，null 表示未监听） */
        ledgerFrom: null as number | null,
        /** -1 表示「最新」（跟随最后一个会话） */
        selectedSessionIndex: -1,
        /** 是否把开始监听之后的新事件同步到狩月账本 */
        feedLedger: useLocalStorage("game.log_analysis_feed_ledger", true),
        lastError: null as string | null,
        /** 前端派生分析异常（与后端监听错误分开显示） */
        analysisError: null as string | null,
    }),
    getters: {
        /** 日志固定位于游戏目录下；未配置游戏路径时为空串。 */
        logPath(): string {
            const gameDir = useGameStore().gameDir
            return gameDir ? `${gameDir}EM\\Saved\\Logs\\EM.log` : ""
        },
        /** 实际选中的会话下标；未选中或越界时跟随最新。 */
        effectiveSessionIndex(state): number {
            const index = state.selectedSessionIndex
            return index >= 0 && index < state.sessions.length ? index : state.sessions.length - 1
        },
        selectedSession(): AnalysisSession | null {
            return this.sessions[this.effectiveSessionIndex] ?? null
        },
        hasData(state): boolean {
            return state.eventCount > 0
        },
        sessionOptions(): LogAnalysisSessionOption[] {
            return this.sessions.map((session, index) => ({
                index,
                label: session.label || `#${index + 1}`,
                time: session.settleT ?? session.end,
            }))
        },
    },
    actions: {
        /**
         * 开始监听游戏目录下的日志文件；成功后清空旧数据并等待后端分包。
         * @returns 是否成功发起监听
         */
        async start(): Promise<boolean> {
            this.lastError = null
            try {
                const path = this.logPath.trim()
                if (!path) {
                    this.lastError = "未配置游戏路径，无法定位日志文件"
                    return false
                }
                this.reset()
                this.ledgerFrom = null
                const info = await startLogAnalysis(path, this.fromStart)
                this.running = true
                // 只同步开始监听之后的新事件；历史回放与已由官方管道落库的数据不重复写
                this.ledgerFrom = info.startedAt * 1000 - 2000
                this.status = {
                    running: true,
                    path: info.path,
                    bytesRead: 0,
                    linesRead: 0,
                    fileSize: info.fileSize,
                    startedAt: info.startedAt,
                    error: null,
                }
                return true
            } catch (error) {
                this.running = false
                this.status = null
                this.lastError = error instanceof Error ? error.message : String(error)
                return false
            }
        },
        /** 停止监听；保留已收到的事件与状态，便于停止后继续查看。 */
        async stop(): Promise<boolean> {
            try {
                await stopLogAnalysis()
                this.running = false
                if (this.status) this.status = { ...this.status, running: false }
                return true
            } catch (error) {
                this.lastError = error instanceof Error ? error.message : String(error)
                return false
            }
        },
        /** 清空原始事件与会话选择（文件截断时由后端 lifecycle reset 触发）。 */
        reset() {
            logEvents.length = 0
            dungeonNames.clear()
            this.eventCount = 0
            this.sessions = []
            this.analysisError = null
            this.selectedSessionIndex = -1
            if (analysisTimer !== null) {
                window.clearTimeout(analysisTimer)
                analysisTimer = null
            }
            lastAnalysisAt = 0
        },
        /** 追加分包事件并同步状态计数；超过滚动上限时丢弃最旧事件。 */
        applyBatch(batch: LogBatch) {
            if (batch.events.length) {
                logEvents.push(...batch.events)
                if (logEvents.length > MAX_EVENTS + EVENT_TRIM_SLACK) logEvents.splice(0, logEvents.length - MAX_EVENTS)
                this.eventCount = logEvents.length
                try {
                    this.publishToLedger(batch.events)
                } catch (error) {
                    // 账本写入失败不能影响日志分析本身
                    console.error("日志事件同步到狩月账本失败", error)
                }
                this.touchAnalysis()
            }
            let path = this.status?.path ?? null
            if (!path) {
                // 游戏 store 异常时不能阻断事件接收，状态栏路径允许留空
                try {
                    path = this.logPath || null
                } catch {
                    path = null
                }
            }
            this.status = {
                running: this.running,
                path,
                bytesRead: batch.bytesRead,
                linesRead: batch.linesRead,
                fileSize: batch.fileSize,
                startedAt: this.status?.startedAt ?? null,
                error: this.status?.error ?? null,
            }
        },
        /** 跑一次派生分析；异常只记录，不打断后续分包。 */
        runAnalysis() {
            try {
                this.sessions = markRaw(analyzeLog(logEvents))
                this.analysisError = null
            } catch (error) {
                this.analysisError = t("log-analysis.analysis_failed", {
                    message: error instanceof Error ? error.message : String(error),
                })
                console.error("日志分析失败", error)
            }
        },
        /** 节流重算会话：分包很快时不重复跑整份日志的派生分析。 */
        touchAnalysis() {
            const now = Date.now()
            const wait = ANALYSIS_THROTTLE_MS - (now - lastAnalysisAt)
            if (wait <= 0) {
                if (analysisTimer !== null) {
                    window.clearTimeout(analysisTimer)
                    analysisTimer = null
                }
                lastAnalysisAt = now
                this.runAnalysis()
                return
            }
            if (analysisTimer !== null) return
            analysisTimer = window.setTimeout(() => {
                analysisTimer = null
                lastAnalysisAt = Date.now()
                this.runAnalysis()
            }, wait)
        },
        /**
         * 把开始监听后的新事件映射为账本事件；掉落与副本完成由账本按指纹 + 时间去重。
         * @param events 本批事件
         */
        publishToLedger(events: LogEvent[]) {
            // 副本名要连历史回放一起收集，后续实时事件才能带上名字
            const target = this.feedLedger ? this.ledgerFrom : null
            if (target === null) {
                for (const event of events) collectLogDungeonName(dungeonNames, event)
                return
            }
            const mapped: AfkEvent[] = []
            for (const event of events) {
                collectLogDungeonName(dungeonNames, event)
                // 日志行时间戳本身就是 UTC epoch 秒，直接换成毫秒即可与管道同基
                const receivedAt = Math.round(event.t * 1000)
                if (receivedAt < target) continue
                const afkEvent = logEventToAfkEvent(event, dungeonNames, receivedAt)
                if (afkEvent) mapped.push(afkEvent)
            }
            if (mapped.length) useAfkLedgerStore().recordMany(mapped, false)
        },
        /** 应用状态事件（每秒心跳），同时恢复页面刷新后的运行态。 */
        applyStatus(status: LogAnalysisStatus) {
            this.status = status
            this.running = status.running
            if (status.running && this.ledgerFrom === null && status.startedAt !== null) this.ledgerFrom = status.startedAt * 1000 - 2000
            if (status.error) this.lastError = status.error
        },
        /** 应用生命周期事件：reset 清空数据，error 记录并停止，started/stopped 同步运行态。 */
        applyLifecycle(lifecycle: LogAnalysisLifecycleEvent) {
            switch (lifecycle.state) {
                case "started":
                    this.running = true
                    this.lastError = null
                    break
                case "stopped":
                    this.running = false
                    if (this.status) this.status = { ...this.status, running: false }
                    break
                case "reset":
                    this.reset()
                    if (this.status) this.status = { ...this.status, bytesRead: 0, linesRead: 0 }
                    break
                case "error":
                    this.running = false
                    this.lastError = lifecycle.message ?? lifecycle.reason ?? "日志分析出错"
                    if (this.status) this.status = { ...this.status, running: false, error: this.lastError }
                    break
            }
        },
        /** 幂等注册三路事件监听（组件卸载不取消），注册后补拉一次当前状态。 */
        async initListeners(): Promise<void> {
            if (!env.isApp || listenersReady) return
            if (!listenersPromise) {
                listenersPromise = (async () => {
                    try {
                        unlistenFns.push(
                            await onLogAnalysisBatch(batch => {
                                this.applyBatch(batch)
                            })
                        )
                        unlistenFns.push(
                            await onLogAnalysisStatus(status => {
                                this.applyStatus(status)
                            })
                        )
                        unlistenFns.push(
                            await onLogAnalysisLifecycle(lifecycle => {
                                this.applyLifecycle(lifecycle)
                            })
                        )
                        listenersReady = true
                    } catch (error) {
                        for (const unlisten of unlistenFns.splice(0)) unlisten()
                        throw error
                    } finally {
                        listenersPromise = null
                    }
                    try {
                        this.applyStatus(await getLogAnalysisStatus())
                    } catch (error) {
                        console.error("读取日志分析状态失败", error)
                    }
                })()
            }
            const pending = listenersPromise
            await pending
        },
        /** 切换会话；非整数或越界由 effectiveSessionIndex 回落到「最新」。 */
        selectSession(index: number) {
            this.selectedSessionIndex = Number.isInteger(index) && index >= 0 ? index : -1
        },
    },
})
