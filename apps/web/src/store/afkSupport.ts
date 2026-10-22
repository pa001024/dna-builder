import type { UnlistenFn } from "@tauri-apps/api/event"
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { defineStore } from "pinia"
import {
    AFK_PIPE_NAME,
    type AfkBridgeStatus,
    type AfkEvent,
    afkBridgeStart,
    afkBridgeStatus,
    afkBridgeStop,
    onAfkEvent,
    onAfkStatus,
} from "@/api/afkSupport"
import { env } from "@/env"
import { useAfkLedgerStore } from "@/store/afkLedger"
import { notifySystem, useForgeAlarm } from "@/store/forgeAlarm"
import { useUIStore } from "@/store/ui"
import { afkDungeonName } from "@/utils/afk-ledger"

/** 最近事件在内存里保留的条数。 */
const AFK_EVENT_KEEP = 50
/** 内容去重窗口：官方浮窗会重复推送同一条（实测一秒内同一副本完成 40+ 次）。 */
const AFK_DEDUPE_WINDOW_MS = 3000
/**
 * 连接后的「积压回放」窗口：游戏连上管道时会一次性补发历史事件
 * （实测 100 条 / 1 秒），这段时间内的事件只入列表、不弹提示。
 */
const AFK_REPLAY_WINDOW_MS = 3000

/** 事件取消监听函数放在模块级，避免进入 pinia 响应式包装。 */
let unlistenEvent: UnlistenFn | null = null
let unlistenStatus: UnlistenFn | null = null
/** 去重表：内容键 → 上次下发时刻，模块级同样避免响应式开销。 */
const dedupeAt = new Map<string, number>()

/**
 * 事件去重用的内容键：只取会改变展示语义的字段。
 * @param event 协议事件
 * @returns 去重键
 */
function dedupeKey(event: AfkEvent): string {
    switch (event.kind) {
        case "reward":
            return `reward|${event.id ?? ""}|${event.name}|${event.count}`
        case "craft":
            return `craft|${event.name}|${event.count}`
        case "dungeon":
            return `dungeon|${event.id}|${event.status}`
        case "character":
            return `character|${event.id}|${event.state}`
        case "monster":
            return `monster|${event.id}`
        case "chat":
            return `chat|${event.team}|${event.world}|${event.party}`
        case "language":
            return `language|${event.lang}`
        default:
            return `control|${event.action}`
    }
}

/**
 * 事件的一行摘要（设置页列表与提示文案共用）。
 * @param event 协议事件
 * @returns 展示文本
 */
export function formatAfkEvent(event: AfkEvent): string {
    switch (event.kind) {
        case "reward":
            return t("afk-support.reward", { name: event.name, count: event.count })
        case "craft":
            return t("afk-support.craft_done", { name: event.name, count: event.count })
        case "dungeon":
            return t(event.status === "complete" ? "afk-support.dungeon_complete" : "afk-support.dungeon_enter", {
                name: afkDungeonName(event.id, event.name),
            })
        case "character":
            return t("afk-support.character", { name: event.name || event.id, state: event.state })
        case "monster":
            return t("afk-support.monster", { id: event.id })
        case "chat":
            return t("afk-support.chat", { team: event.team, world: event.world, party: event.party })
        case "language":
            return t("afk-support.language", { lang: event.lang })
        default:
            return t("afk-support.control", { action: event.action })
    }
}

export const useAfkSupportStore = defineStore("afkSupport", {
    state: () => {
        return {
            /** 持久化开关：应用重启后按此恢复接收端 */
            enabled: useLocalStorage("setting_afk_support_enabled", false),
            /** 副本完成桌面通知开关：与接收端总开关独立，默认开 */
            notifyDungeon: useLocalStorage("setting_afk_notify_dungeon", true),
            /** Rust 侧运行状态（会话内瞬态） */
            status: null as AfkBridgeStatus | null,
            /** 最近事件，最新的在后 */
            events: [] as AfkEvent[],
            /** 最近一次连接建立时刻（本地毫秒），用于判定回放窗口 */
            connectedAt: 0,
            busy: false,
            lastError: "",
        }
    },
    getters: {
        /** 接收端是否在跑（含等连接）。 */
        running(state) {
            return state.status?.running ?? false
        },
        /** 游戏是否已连上管道。 */
        connected(state) {
            return state.status?.connected ?? false
        },
        /** 管道名（仅展示）。 */
        pipeName() {
            return AFK_PIPE_NAME
        },
    },
    actions: {
        /**
         * 应用启动时初始化：注册事件监听，并按持久化开关恢复接收端（不阻塞启动）。
         */
        async init() {
            if (!env.isApp || unlistenEvent || unlistenStatus) return
            unlistenEvent = await onAfkEvent(event => {
                this.handleEvent(event)
            })
            unlistenStatus = await onAfkStatus(status => {
                this.applyStatus(status)
            })
            try {
                this.applyStatus(await afkBridgeStatus())
            } catch (error) {
                this.lastError = String(error)
            }
            if (this.enabled) {
                await this.setEnabled(true)
            }
        },
        /**
         * 开关接收端：开 → 建管道等游戏连；关 → 释放管道实例。
         * @param enabled 目标状态
         */
        async setEnabled(enabled: boolean) {
            if (!env.isApp) return
            if (this.busy) return
            this.busy = true
            this.lastError = ""
            try {
                const status = enabled ? await afkBridgeStart() : await afkBridgeStop()
                this.applyStatus(status)
                this.enabled = enabled
            } catch (error) {
                this.lastError = String(error)
                // 启动失败（常见：管道被官方工具占用）时开关回落到真实状态
                this.enabled = false
            } finally {
                this.busy = false
            }
        },
        /**
         * 应用 Rust 侧状态快照。
         * @param status 状态快照
         */
        applyStatus(status: AfkBridgeStatus | null) {
            const wasConnected = this.status?.connected ?? false
            this.status = status
            if (!status?.running) this.lastError = ""
            else if (status.lastError) this.lastError = status.lastError
            else if (status.connected) this.lastError = ""
            if (status?.connected && !wasConnected) {
                this.connectedAt = Date.now()
                useAfkLedgerStore().beginSession(this.connectedAt)
            }
            if (!status?.connected) {
                this.connectedAt = 0
            }
        },
        /**
         * 处理一条协议事件：去重 → 入列表 → 按需提示。
         * @param event 协议事件
         */
        handleEvent(event: AfkEvent) {
            const key = dedupeKey(event)
            const now = Date.now()
            const last = dedupeAt.get(key)
            if (last !== undefined && now - last < AFK_DEDUPE_WINDOW_MS) return
            dedupeAt.set(key, now)
            // 表会随事件类型/内容增长，定期清理过期项
            if (dedupeAt.size > 256) {
                for (const [k, at] of dedupeAt) {
                    if (now - at >= AFK_DEDUPE_WINDOW_MS) dedupeAt.delete(k)
                }
            }

            this.events.push(event)
            if (this.events.length > AFK_EVENT_KEEP) {
                this.events.splice(0, this.events.length - AFK_EVENT_KEEP)
            }

            // 连接瞬间的积压回放不代表「刚刚发生」，只记录不打扰
            const replayed = this.connectedAt !== 0 && now - this.connectedAt < AFK_REPLAY_WINDOW_MS
            useAfkLedgerStore().record(event, replayed)
            if (replayed) return
            this.announce(event)
        },
        /**
         * 对需要用户注意的事件弹提示。铸造完成事件优先于本地排期提醒，
         * 收到即撤销 `useForgeAlarm` 里的排期，避免同一件事提醒两次。
         * @param event 协议事件
         */
        announce(event: AfkEvent) {
            const ui = useUIStore()
            if (event.kind === "craft") {
                const forgeAlarm = useForgeAlarm()
                // 只撤掉同一产物的本地排期；别的铸造提醒不能因为这条事件被误取消
                if (forgeAlarm.alarm.value?.title === event.name) forgeAlarm.cancel()
                void notifySystem(t("afk-support.notify_title"), formatAfkEvent(event))
                ui.showSuccessMessage(formatAfkEvent(event))
                return
            }
            if (event.kind === "dungeon" && event.status === "complete") {
                if (this.notifyDungeon) void notifySystem(t("afk-support.notify_title"), formatAfkEvent(event))
                ui.showSuccessMessage(formatAfkEvent(event))
            }
        },
        /**
         * 开关副本完成的桌面通知；只影响系统通知，不影响接收端与页内提示。
         * @param enabled 是否发送系统通知
         */
        setNotifyDungeon(enabled: boolean) {
            this.notifyDungeon = enabled
        },
        /**
         * 清空内存里的事件列表（不影响 Rust 侧统计）。
         */
        clearEvents() {
            this.events = []
            dedupeAt.clear()
        },
    },
})
