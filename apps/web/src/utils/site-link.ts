/**
 * 站内链接工具。
 *
 * AI 回复中的站内链接**统一以 history 模式书写**（形如 `/map-tool`），不随运行环境变化：
 * 模型不需要知道当前是 hash 还是 history 模式，也不需要为 Tauri 桌面端改写法。
 * 渲染层再按当前路由模式把它转换成可直接点击的地址（hash 模式下为 `#/map-tool`）。
 *
 * 这样做的另一个好处是：链接文本对用户保持干净（不会出现 `#`），
 * 而 `<a href>` 始终是可用的真实地址，中键新开、悬停看地址都正常。
 */

/** 站内链接的路径前缀：本应用的资料库与功能页统一挂在根路径下 */
const INTERNAL_PATH_PREFIXES = [
    "/db",
    "/map-tool",
    "/char",
    "/weapon",
    "/mod",
    "/setting",
    "/points-mall",
    "/race-lottery",
    "/skin-gacha",
    "/counter",
    "/more",
    "/login",
] as const

/**
 * 判断文本是否为本应用内部的站内路径（history 模式写法）。
 *
 * 命中条件：以 `/` 开头且落在已知前缀内。
 * 刻意排除 `//host`（协议相对地址）与带 scheme 的绝对地址，避免把外链误判成站内链接。
 * @param href 待判断的地址
 * @returns 是否为站内路径
 */
export function isInternalSitePath(href: string): boolean {
    const value = href?.trim()

    if (!value?.startsWith("/") || value.startsWith("//")) {
        return false
    }

    // 带 query / hash 时只比对路径部分
    const pathOnly = value.split(/[?#]/)[0]

    return INTERNAL_PATH_PREFIXES.some(prefix => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`))
}

/**
 * 判断当前是否处于 hash 路由模式。
 *
 * 判定依据是 vue-router 的实际实现而不是 `env.isApp`：
 * hash 模式下 `createWebHashHistory` 的 `base` 一定是 `#` 结尾的，
 * 而 `createWebHistory` 的 base 是普通路径（`/` 或自定义 base），
 * 两种实现的 base 形态互斥，所以这个判据对两种模式都可靠，也不依赖 `import.meta.env.BASE_URL`。
 * @param history vue-router 的 history 对象
 * @returns 是否为 hash 模式
 */
export function isHashHistory(history: { base?: string } | undefined | null): boolean {
    return Boolean(history?.base?.endsWith("#"))
}

/**
 * 把站内链接转换成当前路由模式下的可点击地址。
 *
 * hash 模式下补 `#` 前缀；history 模式下原样返回。
 * 外链（`http://`、`https://`、`mailto:` 等）与锚点不做任何处理。
 * @param href 原始地址（AI 输出一律为 history 模式写法）
 * @param hashMode 当前是否为 hash 路由模式
 * @returns 可直接用于 `<a href>` 的地址
 */
export function toRouterHref(href: string, hashMode: boolean): string {
    const value = href?.trim()

    if (!value) {
        return ""
    }

    // 非站内地址（外链 / 锚点 / mailto）保持原样，交给浏览器处理
    if (!isInternalSitePath(value)) {
        return value
    }

    return hashMode ? `#${value}` : value
}

/**
 * 解析站内链接为 vue-router 可用的目标路径。
 *
 * 去掉 hash 前缀后返回，用于 `router.push()`。
 * @param href 原始地址
 * @returns 路由路径；不是站内链接时返回 null
 */
export function parseSiteRoute(href: string): string | null {
    const value = href?.trim()

    if (!value) {
        return null
    }

    // 容错：模型偶尔会在 history 写法前多写一个 `#`
    const normalized = value.startsWith("#/") ? value.slice(1) : value

    return isInternalSitePath(normalized) ? normalized : null
}
