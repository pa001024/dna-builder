import { clampVk, vkLabel } from "./virtual-key"

/**
 * 技能 CD 倒计时浮窗的共享类型与纯逻辑。
 *
 * 真实绘制在后端(`src-tauri/src/submodules/float_window.rs`):浮窗位置取"游戏窗口客户区内百分比",
 * 触发键为任意多条按键绑定。本模块集中前端侧的载荷类型、默认值与归一化/钳制规则,
 * 不依赖 Tauri 运行时,便于单测与复用。
 */

/** 单条按键绑定(字段与后端 `FloatWindowKeyBinding` 一一对应)。 */
export type FloatWindowKeyBinding = {
    /** 稳定标识;相同 id 复用同一个计时器,改设置不会打断进行中的倒计时 */
    id: string
    /** 显示标签;留空时后端按虚拟键码推导 */
    label: string
    /** Windows 虚拟键码(VK) */
    vk: number
    /** 该按键的完整冷却秒数 */
    cdSeconds: number
    /** 是否参与触发与绘制 */
    enabled: boolean
}

/** 浮窗配置载荷(字段与后端 `FloatWindowConfig` 一一对应)。 */
export type FloatWindowConfig = {
    /** 浮窗左上角相对游戏窗口客户区宽度的百分比(0 ~ 100) */
    anchorXPercent: number
    /** 浮窗左上角相对游戏窗口客户区高度的百分比(0 ~ 100) */
    anchorYPercent: number
    /** 整体缩放系数 */
    scale: number
    /** CD 归零后隐藏该行 */
    hideWhenReady: boolean
    /** 未检测到游戏窗口时隐藏浮窗 */
    hideWhenGameMissing: boolean
    /** 仅游戏窗口前台时响应按键 */
    gameOnlyTrigger: boolean
    /** 视为游戏窗口的进程名白名单;空数组表示使用后端内置默认 */
    processNames: string[]
    /** 圆盘衬底不透明度(0 ~ 1) */
    discAlpha: number
    /** 按键绑定列表 */
    keys: FloatWindowKeyBinding[]
    /** 圆环轨道底色(0xRRGGBB) */
    ringColor: number
    /** 冷却进度环颜色 */
    progressColor: number
    /** 就绪颜色 */
    readyColor: number
    /** 剩余秒数数字颜色 */
    textColor: number
    /** 冷却中标签颜色 */
    labelColor: number
    /** 圆盘底色 */
    discColor: number
}

/** 浮窗内单个计时器(后端回传运行态)。 */
export type FloatyTimer = {
    id: string
    label: string
    total: number
    remaining: number
}

/** 浮窗状态快照(字段与后端 `FloatWindowState` 一一对应)。 */
export type FloatWindowState = {
    enabled: boolean
    visible: boolean
    anchorXPercent: number
    anchorYPercent: number
    resolvedX: number
    resolvedY: number
    windowWidth: number
    windowHeight: number
    scale: number
    hideWhenReady: boolean
    hideWhenGameMissing: boolean
    gameOnlyTrigger: boolean
    /** 是否已定位到游戏窗口 */
    gameFound: boolean
    /** 游戏窗口客户区(屏幕物理像素) */
    clientLeft: number
    clientTop: number
    clientWidth: number
    clientHeight: number
    processNames: string[]
    keys: FloatWindowKeyBinding[]
    timers: FloatyTimer[]
}

/** 浮窗默认配色(与后端 Rust 默认值保持一致)。 */
export const SKILL_CD_OVERLAY_COLORS = {
    ringColor: 0x3f4a5c,
    progressColor: 0xf59e0b,
    readyColor: 0x22c55e,
    textColor: 0xf8fafc,
    labelColor: 0x9aa4b2,
    discColor: 0x161b22,
} as const

/** 浮窗默认数值(与后端 Rust 默认值保持一致)。 */
export const SKILL_CD_OVERLAY_DEFAULTS = {
    anchorXPercent: 77,
    anchorYPercent: 52,
    scale: 1,
    discAlpha: 0.78,
    cdSeconds: 2.7,
    /** 默认视为游戏窗口的进程名(与后端内置白名单首项一致) */
    processName: "EM-Win64-Shipping.exe",
} as const

/** 默认按键绑定的虚拟键码:E 键。 */
export const SKILL_CD_DEFAULT_VK = 0x45

/** 单条绑定的 CD 秒数区间。 */
export const SKILL_CD_MIN_SECONDS = 0.5
export const SKILL_CD_MAX_SECONDS = 600

/** 最多允许配置的按键数量(浮窗按行渲染,过多会超出屏幕)。 */
export const SKILL_CD_MAX_KEYS = 16

/** 锚点百分比区间。 */
export const ANCHOR_MIN_PERCENT = 0
export const ANCHOR_MAX_PERCENT = 100

/** 缩放系数区间(与后端一致)。 */
export const SKILL_CD_MIN_SCALE = 0.5
export const SKILL_CD_MAX_SCALE = 3

let bindingSeed = 0

/**
 * 钳制锚点百分比到合法区间。
 * @param value 候选值
 * @returns 0 ~ 100 之间的有限数;非法时返回 0
 */
export function clampAnchorPercent(value: number): number {
    if (!Number.isFinite(value)) return ANCHOR_MIN_PERCENT
    return Math.min(Math.max(value, ANCHOR_MIN_PERCENT), ANCHOR_MAX_PERCENT)
}

/**
 * 把锚点百分比进一步钳制为"浮窗完整落在客户区内"的取值。
 *
 * 锚点是浮窗左上角,因此最大可用百分比为 `100 - 浮窗自身尺寸占客户区的百分比`。
 * 拖拽预览与后端的位置钳制使用同一条规则,保证所见即所得。
 * @param value 锚点百分比
 * @param selfPercent 浮窗自身尺寸占客户区的百分比
 * @returns 钳制后的百分比
 */
export function clampAnchorInside(value: number, selfPercent: number): number {
    const limit = Math.max(ANCHOR_MIN_PERCENT, ANCHOR_MAX_PERCENT - (Number.isFinite(selfPercent) ? selfPercent : 0))
    return Math.min(clampAnchorPercent(value), limit)
}

/**
 * 钳制完整冷却秒数。
 * @param value 候选秒数
 * @returns 合法秒数;非法时返回默认 8 秒
 */
export function clampCdSeconds(value: number): number {
    if (!Number.isFinite(value)) return SKILL_CD_OVERLAY_DEFAULTS.cdSeconds
    return Math.min(Math.max(value, SKILL_CD_MIN_SECONDS), SKILL_CD_MAX_SECONDS)
}

/**
 * 钳制缩放系数。
 * @param value 候选缩放
 * @returns 0.5 ~ 3 之间的缩放;非法时返回 1
 */
export function clampScale(value: number): number {
    if (!Number.isFinite(value)) return SKILL_CD_OVERLAY_DEFAULTS.scale
    return Math.min(Math.max(value, SKILL_CD_MIN_SCALE), SKILL_CD_MAX_SCALE)
}

/**
 * 钳制圆盘不透明度。
 * @param value 候选不透明度(0 ~ 1)
 * @returns 0 ~ 1 之间的有限数;非法时返回默认值
 */
export function clampDiscAlpha(value: number): number {
    if (!Number.isFinite(value)) return SKILL_CD_OVERLAY_DEFAULTS.discAlpha
    return Math.min(Math.max(value, 0), 1)
}

/**
 * 解析进程名输入(支持逗号/换行/分号分隔、忽略大小写去重)。
 * @param raw 原始输入文本
 * @returns 进程名数组;空输入返回空数组(后端回退内置白名单)
 */
export function parseProcessNames(raw: string): string[] {
    const result: string[] = []
    const seen = new Set<string>()
    for (const piece of raw.split(/[\n,;，；]/)) {
        const name = piece.trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push(name)
    }
    return result
}

/**
 * 创建一条按键绑定。
 * @param partial 可选的初始字段
 * @returns 补齐字段后的绑定;`vk` 非法时回退默认键(E)
 */
export function createKeyBinding(partial: Partial<FloatWindowKeyBinding> = {}): FloatWindowKeyBinding {
    bindingSeed += 1
    const vk = clampVk(partial.vk ?? 0) || SKILL_CD_DEFAULT_VK
    return {
        id: partial.id ?? `key-${vk}-${Date.now().toString(36)}-${bindingSeed}`,
        label: partial.label ?? vkLabel(vk),
        vk,
        cdSeconds: clampCdSeconds(partial.cdSeconds ?? SKILL_CD_OVERLAY_DEFAULTS.cdSeconds),
        enabled: partial.enabled ?? true,
    }
}

/**
 * 归一化按键绑定列表(用于读取本地存储里的数据与用户输入)。
 *
 * 规则:剔除非法键码、钳制 CD、补全空标签、去掉启用状态下的重复键码、
 * 限制总条数;列表为空时补一条默认的 E 键绑定,保证设置页始终可编辑。
 * @param raw 原始数据(可能来自 JSON,形状不可信)
 * @returns 归一化后的绑定列表
 */
export function normalizeKeyBindings(raw: unknown): FloatWindowKeyBinding[] {
    const list = Array.isArray(raw) ? raw : []
    const result: FloatWindowKeyBinding[] = []
    const usedVk = new Set<number>()
    for (const item of list) {
        if (result.length >= SKILL_CD_MAX_KEYS) break
        if (!item || typeof item !== "object") continue
        const record = item as Record<string, unknown>
        const vk = clampVk(Number(record.vk))
        if (!vk) continue
        const enabled = record.enabled !== false
        if (enabled && usedVk.has(vk)) continue
        if (enabled) usedVk.add(vk)
        const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : vkLabel(vk)
        if (!label) continue
        result.push({
            id: typeof record.id === "string" && record.id ? record.id : `key-${vk}`,
            label,
            vk,
            cdSeconds: clampCdSeconds(Number(record.cdSeconds)),
            enabled,
        })
    }
    if (result.length === 0) {
        result.push(
            createKeyBinding({
                id: "key-69",
                label: "E",
                vk: SKILL_CD_DEFAULT_VK,
                enabled: true,
            })
        )
    }
    return result
}

/** 组装后端浮窗配置所需的设置片段。 */
export type SkillCdOverlaySettings = {
    anchorXPercent: number
    anchorYPercent: number
    scale: number
    discAlpha: number
    hideWhenReady: boolean
    hideWhenGameMissing: boolean
    gameOnlyTrigger: boolean
    processName: string
    keys: FloatWindowKeyBinding[]
}

/**
 * 把持久化设置组装成后端 `float_window_set` 的完整配置。
 * @param settings 设置片段
 * @returns 后端配置载荷
 */
export function buildFloatWindowConfig(settings: SkillCdOverlaySettings): FloatWindowConfig {
    return {
        anchorXPercent: clampAnchorPercent(settings.anchorXPercent),
        anchorYPercent: clampAnchorPercent(settings.anchorYPercent),
        scale: clampScale(settings.scale),
        hideWhenReady: settings.hideWhenReady,
        hideWhenGameMissing: settings.hideWhenGameMissing,
        gameOnlyTrigger: settings.gameOnlyTrigger,
        processNames: parseProcessNames(settings.processName),
        discAlpha: clampDiscAlpha(settings.discAlpha),
        keys: normalizeKeyBindings(settings.keys).map(key => ({ ...key })),
        ...SKILL_CD_OVERLAY_COLORS,
    }
}

/** 浮窗整组配置在 localStorage 中的唯一键:所有字段都放在这一个对象里。 */
export const SKILL_CD_OVERLAY_STORAGE_KEY = "setting_skill_cd_overlay"

/**
 * 持久化到 localStorage 的浮窗设置。
 *
 * 在"下发给后端的设置片段"之外补一个只参与本地管理的字段:总开关。整组设置存成
 * **一个对象、一个键**,而不是十余个散键,新增设置项时不必再动存储层。
 */
export type SkillCdOverlayStoredSettings = SkillCdOverlaySettings & {
    /** 总开关:是否启用浮窗 */
    enabled: boolean
}

/**
 * 创建一份默认的浮窗设置(与后端 Rust 侧默认值保持一致)。
 *
 * 每次调用都返回**新对象**:`useLocalStorage` 会把这个默认值直接作为 ref 的初值,
 * 复用同一个对象会让多个实例互相串改。
 * @returns 全新的默认设置
 */
export function createDefaultSkillCdOverlaySettings(): SkillCdOverlayStoredSettings {
    return {
        enabled: false,
        anchorXPercent: SKILL_CD_OVERLAY_DEFAULTS.anchorXPercent,
        anchorYPercent: SKILL_CD_OVERLAY_DEFAULTS.anchorYPercent,
        scale: SKILL_CD_OVERLAY_DEFAULTS.scale,
        discAlpha: SKILL_CD_OVERLAY_DEFAULTS.discAlpha,
        hideWhenReady: false,
        hideWhenGameMissing: true,
        gameOnlyTrigger: true,
        processName: SKILL_CD_OVERLAY_DEFAULTS.processName,
        keys: [],
    }
}
