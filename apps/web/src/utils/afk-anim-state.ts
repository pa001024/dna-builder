import { ref } from "vue"

/**
 * 狩月动画的唯一状态源（主窗口与独立小窗共用）。
 *
 * 两个窗口是两个 webview，JS 内存不互通；这里把动画需要的东西全部落到
 * localStorage，并在窗口之间用 `storage` 事件同步。主窗口收到管道事件时写入，
 * 页头与小窗都只读这一份，避免两边各记一套、画面不一致。
 */

/** 动画状态在 localStorage 中的键。 */
export const AFK_ANIM_STATE_KEY = "dna.afkAnimState"

/** 快照里保留的掉落条数（一场副本的掉落可能不止几条）。 */
const REWARD_KEEP = 60
/** 快照里保留的提示条数。 */
const NOTICE_KEEP = 4

/** 一条掉落（当前进行中场次里的物品）。 */
export type AfkRunDrop = {
    /** 物品 id（管道不一定给） */
    id: number | null
    name: string
    rarity: number
    count: number
    /** 接收时刻（毫秒） */
    at: number
}

/** 一条需要在小窗提示的消息。 */
export type AfkAnimNotice = { text: string; at: number }

/** 动画状态。 */
export type AfkAnimState = {
    /** 最近一条角色事件 */
    character: { id: number; state: string; name: string; scene: string | null } | null
    /** 当前进行中场次的掉落，按到达顺序（不在副本里时为空） */
    runDrops: AfkRunDrop[]
    /** 当前背景场景（刷新后沿用） */
    scene: string
    /** 待提示的消息，最新的在后 */
    notices: AfkAnimNotice[]
}

/** 空状态。 */
function emptyState(): AfkAnimState {
    return { character: null, runDrops: [], scene: "", notices: [] }
}

/**
 * 从 localStorage 读取动画状态。
 * @returns 状态；没有或损坏时返回空状态
 */
export function readAfkAnimState(): AfkAnimState {
    try {
        const raw = localStorage.getItem(AFK_ANIM_STATE_KEY)
        if (!raw) return emptyState()
        const parsed = JSON.parse(raw) as Partial<AfkAnimState>
        return {
            character: parsed.character ?? null,
            runDrops: Array.isArray(parsed.runDrops)
                ? parsed.runDrops.slice(-REWARD_KEEP).map(drop => ({
                      id: typeof drop.id === "number" ? drop.id : null,
                      name: drop.name,
                      rarity: drop.rarity,
                      count: drop.count,
                      at: drop.at,
                  }))
                : [],
            scene: typeof parsed.scene === "string" ? parsed.scene : "",
            notices: Array.isArray(parsed.notices) ? parsed.notices.slice(-NOTICE_KEEP) : [],
        }
    } catch {
        return emptyState()
    }
}

/**
 * 覆盖写入动画状态。
 * @param state 新状态
 */
export function writeAfkAnimState(state: AfkAnimState): void {
    try {
        localStorage.setItem(
            AFK_ANIM_STATE_KEY,
            JSON.stringify({
                character: state.character,
                scene: state.scene ?? "",
                runDrops: (state.runDrops ?? []).slice(-REWARD_KEEP),
                notices: (state.notices ?? []).slice(-NOTICE_KEEP),
            })
        )
    } catch (cause) {
        console.error("写入狩月动画状态失败", cause)
    }
}

/** 合并更新：只改传入的字段。 */
export function patchAfkAnimState(patch: Partial<AfkAnimState>): AfkAnimState {
    const next = { ...readAfkAnimState(), ...patch }
    writeAfkAnimState(next)
    shared.value = next
    return next
}

/** 同一窗口内的响应式副本（storage 事件不会在本窗口触发，需要自己更新）。 */
const shared = ref<AfkAnimState>(typeof window === "undefined" ? emptyState() : readAfkAnimState())

/**
 * 取响应式的动画状态。
 *
 * 返回的 ref 会在同窗口写入时更新，也会在其他窗口写入时通过 `storage` 事件更新。
 * @returns 动画状态
 */
export function useAfkAnimState() {
    if (typeof window !== "undefined" && !listening) {
        listening = true
        window.addEventListener("storage", event => {
            if (event.key !== AFK_ANIM_STATE_KEY) return
            refreshFromStorage()
        })
        // Tauri 的多个 webview 不保证派发 storage 事件（信息条也靠轮询兜底），
        // 这里按原始字符串比对低频轮询，保证小窗能拿到主窗口写入的场次与掉落
        window.setInterval(refreshFromStorage, 1000)
    }
    return shared
}

/** storage 监听只挂一次。 */
let listening = false
/** 上一次读到的原始串：轮询时没变化就不重复解析。 */
let lastRaw: string | null = null

/**
 * 从 localStorage 重新读取状态（内容没变时不动响应式对象）。
 */
function refreshFromStorage(): void {
    let raw: string | null = null
    try {
        raw = localStorage.getItem(AFK_ANIM_STATE_KEY)
    } catch (cause) {
        console.error("读取狩月动画状态失败", cause)
        return
    }
    if (raw === lastRaw) return
    lastRaw = raw
    shared.value = readAfkAnimState()
}
