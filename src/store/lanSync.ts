import type { UnlistenFn } from "@tauri-apps/api/event"
import { useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import { watch } from "vue"
import {
    type LanSyncDeviceInput,
    type LanSyncIncomingPayload,
    type LanSyncPairedDevice,
    type LanSyncPairRequestPayload,
    type LanSyncSnapshot,
    type LanSyncStatus,
    lanSyncRemoveDevice,
    lanSyncResolvePair,
    lanSyncStart,
    lanSyncStatus,
    lanSyncStop,
    lanSyncUpdateSnapshot,
    onLanSyncIncoming,
    onLanSyncPaired,
    onLanSyncPairRequest,
} from "@/api/lanSync"
import { parseDnaUserImportJson } from "@/utils/dna-user-import"
import { db, type UDNAUser } from "./db"
import { useSettingStore } from "./setting"
import { useUIStore } from "./ui"
import { useUserStore } from "./user"

/** 事件取消监听函数放在模块级，避免进入 pinia 响应式包装 */
let unlistenIncoming: UnlistenFn | null = null
let unlistenPaired: UnlistenFn | null = null
let unlistenPairRequest: UnlistenFn | null = null

export const useLanSyncStore = defineStore("lanSync", {
    state: () => {
        return {
            // 开关持久化：应用重启后按此恢复服务（需同时满足可信网络确认）
            enabled: useLocalStorage("setting_lan_sync_enabled", false),
            // 可信网络确认勾选：未勾选时不允许开启服务
            trustedConfirmed: useLocalStorage("setting_lan_sync_trusted", false),
            // 已配对设备（含 token），重启后据此免配对恢复
            pairedDevices: useLocalStorage<LanSyncDeviceInput[]>("setting_lan_sync_devices", []),
            // Rust 侧服务运行状态（会话内瞬态）
            status: null as LanSyncStatus | null,
            // 待用户弹窗确认的配对请求队列（Rust 侧挂起等待应答）
            pendingPairRequests: [] as LanSyncPairRequestPayload[],
            busy: false,
            lastError: "",
        }
    },
    getters: {
        /**
         * 服务是否正在运行。
         */
        running(state) {
            return state.status?.running ?? false
        },
    },
    actions: {
        /**
         * 应用启动时初始化：注册事件监听，并按持久化开关恢复服务（不阻塞启动）。
         */
        async init() {
            if (unlistenIncoming || unlistenPaired || unlistenPairRequest) return
            unlistenIncoming = await onLanSyncIncoming(payload => {
                void this.handleIncoming(payload)
            })
            unlistenPaired = await onLanSyncPaired(device => {
                this.addPairedDevice(device)
            })
            unlistenPairRequest = await onLanSyncPairRequest(payload => {
                this.pushPairRequest(payload)
            })
            // 桌面端 DOB 登录态变化时自动刷新快照（DNA 账号列表无响应式，靠同步时机兜底）
            const user = useUserStore()
            watch(
                () => user.jwtToken,
                () => {
                    void this.pushSnapshot()
                }
            )
            if (this.enabled && this.trustedConfirmed) {
                void this.enable()
            }
        },
        /**
         * 开启局域网同步服务并注入当前账号快照。
         */
        async enable() {
            const ui = useUIStore()
            if (this.busy || this.running) return
            this.busy = true
            this.lastError = ""
            try {
                this.status = await lanSyncStart(this.pairedDevices)
                await this.pushSnapshot()
                this.enabled = true
            } catch (error) {
                this.enabled = false
                this.lastError = error instanceof Error ? error.message : String(error)
                ui.showErrorMessage(this.lastError)
            } finally {
                this.busy = false
            }
        },
        /**
         * 停止局域网同步服务。
         */
        async disable() {
            const ui = useUIStore()
            if (this.busy) return
            this.busy = true
            try {
                await lanSyncStop()
                this.status = null
                this.enabled = false
            } catch (error) {
                this.lastError = error instanceof Error ? error.message : String(error)
                ui.showErrorMessage(this.lastError)
            } finally {
                this.busy = false
            }
        },
        /**
         * 设置页开关入口：开启前校验可信网络确认勾选（提示由 UI 层负责）。
         * @param on 目标开关状态
         */
        async toggle(on: boolean) {
            if (on && !this.trustedConfirmed) {
                this.enabled = false
                return
            }
            if (on) {
                await this.enable()
            } else {
                await this.disable()
            }
        },
        /**
         * 可信网络确认变化：取消勾选时立即停服（安全兜底）。
         * @param confirmed 是否确认可信网络
         */
        async setTrustedConfirmed(confirmed: boolean) {
            this.trustedConfirmed = confirmed
            if (!confirmed && this.running) {
                await this.disable()
            }
        },
        /**
         * 采集当前账号状态生成同步快照。
         * @returns 可注入 Rust 侧的账号快照
         */
        async collectSnapshot(): Promise<LanSyncSnapshot> {
            const user = useUserStore()
            const setting = useSettingStore()
            const dnaUsers = await db.dnaUsers.toArray()
            const current = dnaUsers.find(user => user.id === setting.dnaUserId)
            return {
                dob: user.jwtToken ? { token: user.jwtToken, profile: user.profile ?? null, name: user.name ?? "" } : null,
                dnaUsers: dnaUsers.map(({ id: _id, ...rest }) => rest),
                currentDnaUid: current?.uid ?? "",
                updatedAt: Date.now(),
            }
        },
        /**
         * 将最新快照注入 Rust 侧（服务未运行时跳过）。
         */
        async pushSnapshot() {
            if (!this.running) return
            await lanSyncUpdateSnapshot(await this.collectSnapshot())
        },
        /**
         * 刷新运行状态（用于设置页展示已配对设备的活跃时间）。
         */
        async refreshStatus() {
            if (!this.running) return
            this.status = await lanSyncStatus()
        },
        /**
         * 处理手机端的配对请求：入队交给专用弹窗（LanSyncPairDialog）展示，
         * 用户在弹窗上决定后由 resolvePairRequest 应答 Rust 侧。
         * @param payload 配对请求事件载荷
         */
        pushPairRequest(payload: LanSyncPairRequestPayload) {
            // 同一设备重复发起时丢弃旧请求（Rust 侧旧通道会超时自动关闭）
            this.pendingPairRequests = [...this.pendingPairRequests.filter(request => request.deviceId !== payload.deviceId), payload]
        },
        /**
         * 应答配对请求：把用户的决定回传 Rust 并移出队列。
         * @param payload 配对请求载荷
         * @param approved 是否允许
         */
        async resolvePairRequest(payload: LanSyncPairRequestPayload, approved: boolean) {
            this.pendingPairRequests = this.pendingPairRequests.filter(request => request.requestId !== payload.requestId)
            try {
                await lanSyncResolvePair(payload.requestId, approved)
            } catch {
                // 请求已过期（超时/服务停止），静默忽略
            }
        },
        /**
         * 删除已配对设备并吊销 token。
         * @param token 设备 token
         */
        async removeDevice(token: string) {
            this.status = await lanSyncRemoveDevice(token)
            this.pairedDevices = this.pairedDevices.filter(device => device.token !== token)
        },
        /**
         * 记录新配对设备（lan-sync-paired 事件），同一设备重复配对时覆盖旧记录。
         * @param device 配对成功事件载荷
         */
        addPairedDevice(device: LanSyncPairedDevice) {
            this.pairedDevices = [
                ...this.pairedDevices.filter(d => d.deviceId !== device.deviceId),
                { deviceId: device.deviceId, deviceName: device.deviceName, token: device.token },
            ]
            void this.refreshStatus()
        },
        /**
         * 导入手机端推送的账号数据（lan-sync-incoming 事件）：
         * DOB 覆盖本地登录态，DNA 账号按 uid 合并，完成后回注快照唤醒 /sync 响应。
         * @param payload 手机端推送的账号数据
         */
        async handleIncoming(payload: LanSyncIncomingPayload) {
            try {
                if (payload.dob?.token) {
                    await this.importDobAccount(payload.dob)
                }
                if (payload.dnaUsers?.length) {
                    await this.importDnaUsers(payload.dnaUsers)
                }
            } catch (error) {
                console.error("导入局域网同步账号失败:", error)
            } finally {
                await this.pushSnapshot()
            }
        },
        /**
         * 导入 DOB（社区）账号：token 变化时覆盖本地登录态并异步刷新资料。
         * @param account 手机端推送的 DOB 账号
         */
        async importDobAccount(account: { token: string; profile?: unknown }) {
            const user = useUserStore()
            if (user.jwtToken === account.token) return
            user.jwtToken = account.token
            if (account.profile) {
                user.profile = account.profile as typeof user.profile
            }
            // 资料以服务端为准，静默刷新一次
            try {
                await user.refreshProfile()
            } catch (error) {
                console.warn("刷新社区账号资料失败:", error)
            }
        },
        /**
         * 导入 DNA（皎皎角）游戏账号：按 uid 合并，本地已有则覆盖凭据字段，否则新增。
         * @param users 手机端推送的账号列表（宽松 JSON，逐条解析校验）
         */
        async importDnaUsers(users: Record<string, unknown>[]) {
            for (const raw of users) {
                let parsed: UDNAUser
                try {
                    parsed = parseDnaUserImportJson(JSON.stringify(raw))
                } catch {
                    continue
                }
                const existing = await db.dnaUsers.where("uid").equals(parsed.uid).first()
                if (existing) {
                    await db.dnaUsers.update(existing.id, parsed)
                } else {
                    await db.dnaUsers.add(parsed)
                }
            }
        },
    },
})
