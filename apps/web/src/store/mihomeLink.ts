import { StorageSerializers, useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import type { AfkEvent } from "@/api/afkSupport"
import { type MiHomeScene, mihomeListScenes, mihomeLogout, mihomeQrBegin, mihomeQrWait, mihomeRunScene, mihomeStatus } from "@/api/mihome"

/**
 * 老键迁移：`setting_mijia_*` → `setting_mihome_*`，命中一次即搬走。
 * @param newKey 新键
 * @param oldKey 老键
 */
function migrateStorageKey(newKey: string, oldKey: string) {
    try {
        if (typeof localStorage === "undefined") return
        if (localStorage.getItem(newKey) !== null) return
        const legacy = localStorage.getItem(oldKey)
        if (legacy === null) return
        localStorage.setItem(newKey, legacy)
        localStorage.removeItem(oldKey)
    } catch {
        // 隐私模式等不可写存储：保持内存值即可
    }
}

migrateStorageKey("setting_mihome_enabled", "setting_mijia_enabled")
migrateStorageKey("setting_mihome_rules", "setting_mijia_rules")
migrateStorageKey("setting_mihome_scenes", "setting_mijia_scenes")

/** 米家联动支持的事件种类：副本完成 / 指定物品掉落 / 铸造完成。 */
export type MiHomeRuleKind = "dungeon_complete" | "item_drop" | "craft_complete"

/** 一条事件绑定：命中时执行对应的手动场景。 */
export interface MiHomeRule {
    id: string
    enabled: boolean
    kind: MiHomeRuleKind
    /** 副本 ID；空串表示任意副本（仅 dungeon_complete 用）。 */
    dungeonId: string
    /** 物品名子串；空串表示任意物品（item_drop / craft_complete 用）。 */
    itemName: string
    /** 最低品质 1-5；1 表示不限（仅 item_drop 用）。 */
    minRarity: number
    sceneId: string
    homeId: string
    /** 场景名的本地快照：服务端改名或离线时照样能展示。 */
    sceneName: string
}

/** 新规则的草稿（表单用，无 id）。 */
export type MiHomeRuleDraft = Omit<MiHomeRule, "id">

/**
 * 生成规则 id：优先 crypto.randomUUID，降级为时间 + 随机。
 * @returns 唯一 id
 */
function newRuleId() {
    try {
        return crypto.randomUUID()
    } catch {
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }
}

/**
 * 判断一条规则是否命中当前事件。
 * @param rule 规则
 * @param event 管道事件
 * @returns 命中时为 true
 */
export function matchMiHomeRule(rule: MiHomeRule, event: AfkEvent) {
    if (!rule.enabled || !rule.sceneId) return false
    if (rule.kind === "dungeon_complete") {
        if (event.kind !== "dungeon" || event.status !== "complete") return false
        return !rule.dungeonId || event.id === rule.dungeonId
    }
    if (rule.kind === "item_drop") {
        if (event.kind !== "reward") return false
        const nameHit = !rule.itemName.trim() || event.name.includes(rule.itemName.trim())
        return nameHit && event.rarity >= Math.min(5, Math.max(1, rule.minRarity))
    }
    if (rule.kind === "craft_complete") {
        if (event.kind !== "craft") return false
        return !rule.itemName.trim() || event.name.includes(rule.itemName.trim())
    }
    return false
}

export const useMiHomeLinkStore = defineStore("mihomeLink", {
    state: () => ({
        enabled: useLocalStorage("setting_mihome_enabled", false),
        rules: useLocalStorage<MiHomeRule[]>("setting_mihome_rules", [], {
            serializer: StorageSerializers.object,
            writeDefaults: false,
        }),
        sceneCache: useLocalStorage<MiHomeScene[]>("setting_mihome_scenes", [], {
            serializer: StorageSerializers.object,
            writeDefaults: false,
        }),
        /** 登录态：null 表示还没查过。 */
        loggedIn: null as boolean | null,
        /** 待扫的登录二维码内容（前端自渲染）；空串表示没有进行中的扫码。 */
        qrUrl: "",
        /** 长轮询地址，与 qrUrl 配对回传。 */
        qrLp: "",
        qrBusy: false,
        loginBusy: false,
        scenes: [] as MiHomeScene[],
        scenesBusy: false,
        statusBusy: false,
        lastError: "",
        /** 规则 id → 最近一次触发时刻（毫秒），供列表展示“上次执行”。 */
        lastFiredAt: {} as Record<string, number>,
        /** 规则 id → 最近一次触发错误（成功时清空）。 */
        fireError: {} as Record<string, string>,
        firingId: "" as string,
    }),
    getters: {
        /** 当前生效的场景列表： live 为空时退回缓存，保证离线也能编辑规则。 */
        effectiveScenes(state): MiHomeScene[] {
            return state.scenes.length > 0 ? state.scenes : state.sceneCache
        },
        enabledRules(state): MiHomeRule[] {
            return state.rules.filter(rule => rule.enabled && rule.sceneId)
        },
    },
    actions: {
        setEnabled(enabled: boolean) {
            this.enabled = enabled
        },
        /**
         * 启动时初始化：查登录态，已登录且无场景缓存时静默拉一次。
         */
        async init() {
            await this.refreshStatus()
            if (this.loggedIn && this.effectiveScenes.length === 0) {
                try {
                    await this.refreshScenes()
                } catch {
                    // 静默失败：用户点刷新时再看错误
                }
            }
        },
        /**
         * 刷新登录态。
         * @returns 是否已登录
         */
        async refreshStatus() {
            if (this.statusBusy) return this.loggedIn === true
            this.statusBusy = true
            this.lastError = ""
            try {
                const status = await mihomeStatus()
                this.loggedIn = status.logged_in
                return status.logged_in
            } catch (error) {
                this.lastError = String(error instanceof Error ? error.message : error)
                return false
            } finally {
                this.statusBusy = false
            }
        },
        /**
         * 取扫码登录的二维码：token 有效直接记为已登录并拉场景。
         */
        async beginQr() {
            if (this.qrBusy) return
            this.qrBusy = true
            this.lastError = ""
            try {
                const data = await mihomeQrBegin()
                if (data.already) {
                    this.loggedIn = true
                    this.qrUrl = ""
                    this.qrLp = ""
                    await this.refreshScenes()
                    return
                }
                this.loggedIn = false
                this.qrUrl = data.login_url
                this.qrLp = data.lp
            } catch (error) {
                this.lastError = String(error instanceof Error ? error.message : error)
                throw error
            } finally {
                this.qrBusy = false
            }
        },
        /**
         * 等待扫码结果：成功后记为已登录并拉场景，超时/失败抛错。
         */
        async waitQr() {
            if (this.loginBusy || !this.qrUrl) return
            this.loginBusy = true
            this.lastError = ""
            try {
                await mihomeQrWait({ login_url: this.qrUrl, lp: this.qrLp })
                this.loggedIn = true
                this.qrUrl = ""
                this.qrLp = ""
                await this.refreshScenes()
            } catch (error) {
                this.lastError = String(error instanceof Error ? error.message : error)
                throw error
            } finally {
                this.loginBusy = false
            }
        },
        /**
         * 收起二维码（不等后端长轮询：它最多 2 分钟后自行结束，无副作用）。
         */
        cancelQr() {
            this.qrUrl = ""
            this.qrLp = ""
        },
        /**
         * 退出登录：清登录态与 live 场景（缓存保留，供规则展示场景名）。
         */
        async logout() {
            this.lastError = ""
            try {
                await mihomeLogout()
            } catch (error) {
                this.lastError = String(error instanceof Error ? error.message : error)
                throw error
            }
            this.loggedIn = false
            this.scenes = []
            this.qrUrl = ""
            this.qrLp = ""
        },
        /**
         * 刷新手动场景列表并更新缓存。
         * @returns 场景列表
         */
        async refreshScenes() {
            if (this.scenesBusy) return this.effectiveScenes
            this.scenesBusy = true
            this.lastError = ""
            try {
                const list = await mihomeListScenes()
                this.scenes = list
                this.sceneCache = list
                this.loggedIn = true
                return list
            } catch (error) {
                this.lastError = String(error instanceof Error ? error.message : error)
                throw error
            } finally {
                this.scenesBusy = false
            }
        },
        /**
         * 按场景 id 找展示名：live → 缓存 → 规则快照。
         * @param sceneId 场景 id
         * @param fallback 规则里存的快照名
         * @returns 展示名
         */
        sceneNameOf(sceneId: string, fallback = "") {
            const hit = this.scenes.find(scene => scene.scene_id === sceneId) ?? this.sceneCache.find(scene => scene.scene_id === sceneId)
            return hit?.name || fallback || sceneId
        },
        /**
         * 新增一条绑定。
         * @param draft 表单草稿
         * @returns 新规则 id
         */
        addRule(draft: MiHomeRuleDraft) {
            const rule: MiHomeRule = { ...draft, id: newRuleId() }
            this.rules = [...this.rules, rule]
            return rule.id
        },
        /**
         * 更新一条绑定。
         * @param id 规则 id
         * @param patch 部分字段
         */
        updateRule(id: string, patch: Partial<MiHomeRuleDraft>) {
            this.rules = this.rules.map(rule => (rule.id === id ? { ...rule, ...patch } : rule))
        },
        /**
         * 删除一条绑定。
         * @param id 规则 id
         */
        removeRule(id: string) {
            this.rules = this.rules.filter(rule => rule.id !== id)
        },
        /**
         * 对实时事件做匹配并触发（回放事件不触发，与通知口径一致）。
         * @param event 管道事件
         * @param replayed 是否来自连接瞬间的历史回放
         */
        maybeFire(event: AfkEvent, replayed: boolean) {
            if (replayed || !this.enabled) return
            for (const rule of this.enabledRules) {
                if (!matchMiHomeRule(rule, event)) continue
                void this.fireRule(rule.id).catch(() => {})
            }
        },
        /**
         * 执行一条规则绑定的场景（命中触发与“立即执行”共用）。
         * @param id 规则 id
         */
        async fireRule(id: string) {
            const rule = this.rules.find(item => item.id === id)
            if (!rule?.sceneId) return
            this.firingId = id
            try {
                await mihomeRunScene({ scene_id: rule.sceneId, home_id: rule.homeId })
                this.lastFiredAt = { ...this.lastFiredAt, [id]: Date.now() }
                this.fireError = { ...this.fireError, [id]: "" }
            } catch (error) {
                const message = String(error instanceof Error ? error.message : error)
                this.fireError = { ...this.fireError, [id]: message }
                throw error
            } finally {
                if (this.firingId === id) this.firingId = ""
            }
        },
    },
})
