import type { Router } from "vue-router"

/**
 * 外部深链（`dobapp://…`）到应用内路径的映射，与 dob-app（`lib/core/router/deep_link.dart`）同构。
 *
 * 链接形态是 `dobapp://<host>/<段…>`：协议名固定 `dobapp`，host 决定「打开什么」，
 * 路径段当作参数。host 是两处共同的约定——本文件的 `DEEP_LINK_PREFIXES` 与
 * 桌面端 `tauri.conf.json` 里 `plugins.deep-link.desktop.schemes` 下的 scheme
 * 注册（没注册的协议系统根本不会把链接交给本应用），新增链接类型两处都要改。
 *
 * 单段参数（构筑 id、方案 id…）允许两种等价写法，网页侧挑顺手的即可：
 *
 *     dobapp://open-build/123          // 路径段
 *     dobapp://open-build?id=123       // 查询参数
 */
export const DEEP_LINK_SCHEME = "dobapp"

/** host → 应用内路径前缀（前缀自带前导 `/`，与路由表写法一致）。 */
const DEEP_LINK_PREFIXES: Record<string, string> = {
    "open-build": "/build",
    "open-dye": "/skin-colorize",
    "open-graph": "/graph",
}

/**
 * 允许不带 id 的裸链接直接落到前缀页面的 host。
 * 构筑链接没有 id 就没有目的地（详情页必须带 id）；染色分享相反，
 * `dobapp://open-dye` 应打开画廊（`/skin-colorize` 列表页）。
 */
const BARE_ALLOWED = new Set(["open-dye"])

/**
 * 单个路径段解码后按应用内路径的写法重新编码，避免 id 里的 `/`、`?` 破坏路由。
 * @param raw URL 路径里的原始段（仍是百分号编码形态）
 * @returns 编码后的单段
 */
function encodeSegment(raw: string): string {
    try {
        return encodeURIComponent(decodeURIComponent(raw))
    } catch {
        return raw
    }
}

/**
 * 解析链接，返回可直接交给 `router.push` 的应用内路径。
 *
 * 不是深链、协议不对、host 不认识、id 缺失——一律返回 null，由调用方静默忽略：
 * 链接可能来自别人复制粘贴时的笔误，甚至就是另一个应用的同名协议，
 * 报错给用户看没有意义。
 * @param url 待解析的原始链接
 * @returns 应用内路径；无法识别时返回 null
 */
export function deepLinkPathFor(url: string | null | undefined): string | null {
    if (!url) {
        return null
    }
    let parsed: URL
    try {
        parsed = new URL(url.trim())
    } catch {
        return null
    }
    if (parsed.protocol.toLowerCase() !== `${DEEP_LINK_SCHEME}:`) {
        return null
    }
    // 非特殊协议的 host 保持原大小写，这里手动归一（与 Dart 侧 `host.toLowerCase()` 同口径）
    const host = parsed.hostname.toLowerCase()
    const prefix = DEEP_LINK_PREFIXES[host]
    if (!prefix) {
        return null
    }
    const segments = parsed.pathname
        .split("/")
        .filter(segment => segment.length > 0)
        .map(encodeSegment)
    if (segments.length > 0) {
        return `${prefix}/${segments.join("/")}`
    }
    const id = parsed.searchParams.get("id")?.trim() ?? ""
    if (id) {
        return `${prefix}/${encodeURIComponent(id)}`
    }
    return BARE_ALLOWED.has(host) ? prefix : null
}

/**
 * 拼构筑深链：`dobapp://open-build/<id>`，落到 `/build/:id` 中转页。
 * @param buildId 构筑 id
 * @returns 可直接放在网页 `<a href>` 里的深链
 */
export function buildDeepLink(buildId: string): string {
    return `${DEEP_LINK_SCHEME}://open-build/${encodeURIComponent(buildId)}`
}

/**
 * 拼染色深链：带 id 落方案详情，裸链接落画廊。
 * @param planId 染色方案 id，不传即画廊链接
 * @returns 可直接放在网页 `<a href>` 里的深链
 */
export function dyePlanDeepLink(planId?: string): string {
    return planId ? `${DEEP_LINK_SCHEME}://open-dye/${encodeURIComponent(planId)}` : `${DEEP_LINK_SCHEME}://open-dye`
}

/**
 * 拼节点图深链：`dobapp://open-graph/<id>`，落到 `/graph/:id` 中转页。
 * @param graphId 节点图 id
 * @returns 可直接放在网页 `<a href>` 里的深链
 */
export function graphDeepLink(graphId: string): string {
    return `${DEEP_LINK_SCHEME}://open-graph/${encodeURIComponent(graphId)}`
}

/**
 * 打开一条深链，返回是否真的跳转了。
 *
 * 链接可能来自任何地方（手输、旧版网页、别的应用），解析不出与应用内没有的页面
 * 都只记录、不抛异常：用户点到一条用不上的链接，不该看到任何报错界面。
 * @param router vue-router 实例
 * @param url 深链原文
 * @returns 是否跳转
 */
export function openDeepLink(router: Router, url: string | null | undefined): boolean {
    if (!url) {
        return false
    }
    const path = deepLinkPathFor(url)
    if (path === null) {
        console.debug(`忽略无法识别的深链：${url}`)
        return false
    }
    if (router.resolve(path).matched.length === 0) {
        console.debug(`深链指向的路由未注册：${path}`)
        return false
    }
    void router.push(path).catch(error => {
        console.debug(`深链跳转失败：${path}`, error)
    })
    return true
}

/**
 * 注册桌面端深链监听：冷启动链接与运行中收到的链接都会打开。
 *
 * 先订阅再取启动链接：订阅之前到达的热启链接由插件暂存、随启动链接一并交回，
 * 反过来先取启动链接的话，中间这段窗口里到的链接会两头都接不到
 * （与 dob-app `app.dart` 的 `_bootstrap` 顺序同理）。
 * @param router vue-router 实例
 * @returns 取消监听的函数
 */
export async function setupDeepLink(router: Router): Promise<() => void> {
    const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link")
    const unlisten = await onOpenUrl(urls => {
        for (const url of urls) {
            openDeepLink(router, url)
        }
    })
    const current = await getCurrent().catch(() => null)
    if (current) {
        for (const url of current) {
            openDeepLink(router, url)
        }
    }
    return unlisten
}
