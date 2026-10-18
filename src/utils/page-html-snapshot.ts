/**
 * 把资料库页面渲染成净化后的 HTML / 结构化文本。
 *
 * 资料检索 Agent 只能读原始数据，页面里「只有渲染后才有」的成品内容读不到：活动页内嵌的子玩法
 * 模块（永恒梦魇 / 高难挑战、忘川夜话、试锋芒、签到、拍照任务、盲盒掉落…）、组件现算出来的
 * 组合文案与表格。这里在离屏容器里用真实组件树把目标路由挂载一次，取回 innerHTML 后按白名单
 * 净化，不触碰当前界面的 DOM 与标题。
 *
 * 交互态内容（需要点开页签 / 折叠面板才出现）由 `clicks` 逐次点击后重新采集，
 * 点击目标只接受容器内的可点击元素，不会跑到页面外去操作。
 */

import i18next from "i18next"
import I18NextVue from "i18next-vue"
import { createPinia } from "pinia"
import { createApp, defineComponent, h, nextTick, type App as VueApp } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"
import { isDataAvailable, registerDataPackHydrationCallback } from "@/utils/data-pack/data-pack-bridge"

/** 允许渲染的站内路径前缀：只开放资料库，避免把工具变成任意页面渲染器 */
const ALLOWED_PATH_PREFIX = "/db"

/** 净化时保留的标签：只留文本语义结构，不含任何可执行 / 可加载 / 可交互元素 */
const ALLOWED_TAGS = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "div",
    "span",
    "br",
    "hr",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "section",
    "article",
    "header",
    "footer",
    "main",
    "aside",
    "nav",
    "figure",
    "figcaption",
    "details",
    "summary",
    "blockquote",
    "pre",
    "code",
    "b",
    "strong",
    "em",
    "i",
    "u",
    "s",
    "small",
    "sub",
    "sup",
    "mark",
    "del",
    "a",
    "label",
    "button",
    "time",
    "abbr",
]

/** 净化时保留的属性：只有链接目标与表格跨格有意义，其余（class / style / on*）一律丢弃 */
const ALLOWED_ATTR = ["href", "colspan", "rowspan", "title", "datetime"]

/** 空壳也保留的标签：空单元格 / 空行在表格里有语义 */
const KEEP_EMPTY_TAGS = new Set(["td", "th", "tr", "table", "tbody", "thead", "tfoot", "br", "hr"])

/** 文本化时分行的块级标签 */
const BLOCK_TAGS = new Set([
    "div",
    "p",
    "section",
    "article",
    "header",
    "footer",
    "main",
    "aside",
    "nav",
    "figure",
    "figcaption",
    "details",
    "summary",
    "blockquote",
    "ul",
    "ol",
    "dl",
    "dt",
    "dd",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "label",
    "button",
    "form",
    "fieldset",
])

/** 点击时允许命中的元素：按钮、链接、页签与选项项 */
const CLICKABLE_SELECTOR = 'button, a, [role="tab"], [role="button"], summary, label, li'

/** 「ID 123」这类复制 ID 按钮的标签，点击不会有新内容 */
const ID_BUTTON_LABEL = /^ID\s*\d+$/

/** 页面快照渲染选项 */
export interface PageSnapshotOptions {
    /** 挂载后（以及每次点击后）等待界面落定的毫秒数，默认 240，上限 2000 */
    settleMs?: number
    /** 整体耗时上限毫秒数，默认 8000，上限 20000；超时后不再点击，直接采集当前内容 */
    timeoutMs?: number
    /** 渲染完成后依次点击的目标：按钮 / 页签的名称（可含文本片段）或 CSS 选择器，最多 4 个 */
    clicks?: string[]
}

/** 页面快照结果 */
export interface PageSnapshotResult {
    /** 收敛后的站内路径 */
    path: string
    /** 净化后的 HTML（无脚本、无样式、无内联事件） */
    html: string
    /** 页面标题（优先取 h1 / h2，取不到时退回路径） */
    title: string
    /** 渲染时 i18next 使用的语言 */
    language: string
    /** 渲染期间捕获的组件错误（局部区块崩掉时其余内容仍可用） */
    errors: string[]
    /** 没能点到的目标（名称写错或元素不存在） */
    missingClicks: string[]
    /** 页面上的可点击项名称（供模型挑选下一轮的 clicks） */
    clickable: string[]
    /** 渲染时游戏数据是否已就绪（数据包未安装 / 仍在加载时为 false） */
    dataReady: boolean
}

/**
 * 把模型给出的页面地址收敛成站内路径。
 *
 * 模型可能直接抄完整 URL、hash 路由写法或省略前导斜杠，这里统一归一化；
 * 非资料库路径一律拒绝，避免误渲染站内其它页面。
 * @param raw 原始路径
 * @returns 站内路径；不在 /db 下时返回 null
 */
export function normalizeSnapshotPath(raw: unknown): string | null {
    let text = `${raw ?? ""}`.trim()

    if (!text) {
        return null
    }

    // 完整 URL → 只留 path，hash 路由 → 取 # 之后的部分
    text = text.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, "")
    const hashIndex = text.indexOf("#")
    if (hashIndex >= 0) {
        text = text.slice(hashIndex + 1)
    }

    if (!text.startsWith("/")) {
        text = `/${text}`
    }

    if (text !== ALLOWED_PATH_PREFIX && !text.startsWith(`${ALLOWED_PATH_PREFIX}/`)) {
        return null
    }

    return text
}

/**
 * 渲染指定资料库页面并返回净化后的 HTML。
 * @param path 站内路径，如 `/db/event/103036`
 * @param options 渲染选项
 * @returns 页面快照
 */
export async function renderPageSnapshot(path: string, options: PageSnapshotOptions = {}): Promise<PageSnapshotResult> {
    const target = normalizeSnapshotPath(path)

    if (!target) {
        throw new Error(`只支持资料库页面（${ALLOWED_PATH_PREFIX} 开头）的路径："${path}"`)
    }

    const settleMs = clampNumber(options.settleMs ?? 240, 0, 2000)
    const timeoutMs = clampNumber(options.timeoutMs ?? 8000, 1000, 20000)
    const deadline = Date.now() + timeoutMs
    const clicks = (options.clicks ?? [])
        .map(item => `${item ?? ""}`.trim())
        .filter(Boolean)
        .slice(0, 4)

    const errors: string[] = []
    const missingClicks: string[] = []
    // 数据包水合完成前数据模块是空的：先等一等，别把「数据还没到」误报成「页面不存在」
    const dataReady = await waitForDataPackHydration(Math.min(timeoutMs, 4000))
    const container = createSnapshotContainer()
    const titleBefore = document.title
    let app: VueApp<Element> | null = null
    let rawHtml = ""
    let title = ""
    let clickable: string[] = []

    try {
        const { routes } = await import("@/router")
        const router = createRouter({ history: createMemoryHistory(), routes: [...routes] })
        router.onError(error => {
            errors.push(describeError(error))
        })

        await router.push(target)
        await router.isReady()

        if (!router.currentRoute.value.matched.length) {
            throw new Error(`资料库里没有这个页面：${target}`)
        }

        const Root = defineComponent({ name: "PageSnapshotRoot", render: () => h(RouterView) })
        const instance = createApp(Root)
        app = instance
        // 单个区块渲染失败不应该让整页作废：记下错误继续采集其余内容
        instance.config.errorHandler = error => {
            errors.push(describeError(error))
        }
        instance.config.warnHandler = () => {}
        // 主应用注册的尺寸拖拽指令在这里不需要生效，占位即可（否则会产生解析警告）
        instance.directive("h-resize-for", {})
        instance.use(createPinia()).use(I18NextVue, { i18next }).use(router)
        instance.mount(container)

        await nextTick()
        await settle(settleMs, deadline)

        for (const click of clicks) {
            if (Date.now() >= deadline) {
                missingClicks.push(click)
                continue
            }

            const element = findClickTarget(container, click)

            if (!element) {
                missingClicks.push(click)
                continue
            }

            element.click()
            await nextTick()
            await settle(settleMs, deadline)
        }

        title = resolveSnapshotTitle(container, target)
        clickable = collectClickableLabels(container)
        rawHtml = container.innerHTML
    } catch (error) {
        errors.push(describeError(error))
    } finally {
        try {
            app?.unmount()
        } catch (error) {
            errors.push(describeError(error))
        }
        container.remove()
        // 页面组件可能改写文档标题，快照结束后恢复，避免污染当前标签页
        document.title = titleBefore
    }

    const html = await sanitizePageHtml(rawHtml)

    if (!html.trim()) {
        throw new Error(
            dataReady ? reasonOfFirstError(errors) || `页面没有渲染出内容：${target}` : "游戏数据还没就绪（数据包仍在加载中），稍后重试"
        )
    }

    return {
        path: target,
        html,
        title: title || target,
        language: `${i18next.language ?? ""}`,
        errors,
        missingClicks,
        clickable,
        dataReady,
    }
}

/** 等待数据包水合的挂起resolve集合 */
const hydrationWaiters = new Set<() => void>()
/** 水合回调只需注册一次（注册入口不提供注销） */
let hydrationCallbackRegistered = false

/**
 * 等待游戏数据就绪：数据包安装 / 切换时模块导出先是空的，
 * 水合完成后才回填。数据直读源码时（`DISABLE_REWRITE=1`）立即返回。
 * @param timeoutMs 最长等待毫秒数
 * @returns 等待期间醒来时数据是否已就绪
 */
async function waitForDataPackHydration(timeoutMs: number): Promise<boolean> {
    if (isDataAvailable()) {
        return true
    }

    if (!hydrationCallbackRegistered) {
        hydrationCallbackRegistered = true
        registerDataPackHydrationCallback(() => {
            for (const resolve of [...hydrationWaiters]) {
                resolve()
            }

            hydrationWaiters.clear()
        })
    }

    return await new Promise<boolean>(resolve => {
        let settled = false
        let timer = 0

        const onHydrated = (): void => finish(true)

        function finish(value: boolean): void {
            if (settled) {
                return
            }

            settled = true
            hydrationWaiters.delete(onHydrated)
            window.clearTimeout(timer)
            resolve(value)
        }

        timer = window.setTimeout(() => finish(isDataAvailable()), Math.max(0, timeoutMs))
        hydrationWaiters.add(onHydrated)
    })
}

/**
 * 按白名单净化 HTML：丢弃脚本 / 样式 / 媒体 / 内联事件与所有表现层属性，
 * 再去掉渲染残留的空壳节点、把连续空白压成单个空格。
 * @param rawHtml 渲染出的原始 HTML
 * @returns 净化后的 HTML
 */
export async function sanitizePageHtml(rawHtml: string): Promise<string> {
    if (!rawHtml.trim()) {
        return ""
    }

    const { default: DOMPurify } = await import("dompurify")
    const clean = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [...ALLOWED_TAGS],
        ALLOWED_ATTR: [...ALLOWED_ATTR],
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
        KEEP_CONTENT: true,
    }) as unknown as string
    const doc = new DOMParser().parseFromString(`<div id="page-snapshot-root">${clean}</div>`, "text/html")
    const root = doc.getElementById("page-snapshot-root")

    if (!root) {
        return ""
    }

    pruneEmptyElements(root)
    dropSelectOptions(root)
    collapseTextNodes(root)

    return root.innerHTML.trim()
}

/**
 * 去掉下拉框的候选项列表。
 *
 * reka-ui 的 Select 会把全部选项（等级选择器有 240 个）铺进 DOM，读出来就是一串
 * 挤在一起的数字，对读页面内容毫无意义；当前取值由触发器本身展示。
 * @param root 净化后的根元素
 */
function dropSelectOptions(root: Element): void {
    for (const list of root.querySelectorAll('[role="listbox"], [role="option"], [role="menu"]')) {
        list.remove()
    }
}

/**
 * 把净化后的 HTML 转成结构化文本：标题带 `#`、列表带 `-`、表格按 `|` 分列、站内链接保留路径。
 * @param html 净化后的 HTML
 * @returns 纯文本
 */
export function pageSnapshotToText(html: string): string {
    if (!html.trim()) {
        return ""
    }

    const doc = new DOMParser().parseFromString(`<div id="page-snapshot-root">${html}</div>`, "text/html")
    const root = doc.getElementById("page-snapshot-root")

    if (!root) {
        return ""
    }

    return normalizeTextLines(walkElementToText(root, 0))
}

/**
 * 创建一个离屏容器：留在文档里并保持布局（图表、滚动监听都能正常工作），
 * 但对用户不可见、不可交互。
 * @returns 容器元素
 */
function createSnapshotContainer(): HTMLElement {
    const container = document.createElement("div")
    container.setAttribute("data-page-snapshot", "")
    container.style.cssText =
        "position:fixed;top:0;left:-12000px;width:1280px;height:1024px;overflow:hidden;visibility:hidden;pointer-events:none;z-index:-1;"
    document.body.appendChild(container)

    return container
}

/**
 * 渲染后等待界面落定：图表与异步子组件通常在 nextTick 之后才开始绘制。
 * @param ms 等待毫秒数
 * @param deadline 耗时上限时间戳
 */
async function settle(ms: number, deadline: number): Promise<void> {
    const remaining = Math.max(0, deadline - Date.now())
    await new Promise<void>(resolve => {
        window.setTimeout(resolve, Math.min(ms, remaining))
    })
}

/**
 * 在容器内定位点击目标：先按 CSS 选择器试（以 `#` / `.` / `[` 开头时），
 * 否则按可见文本匹配，多个命中时取文本最短（最具体）的那个。
 * @param root 快照容器
 * @param key 点击目标
 * @returns 命中的元素；找不到时为 null
 */
function findClickTarget(root: HTMLElement, key: string): HTMLElement | null {
    const target = key.trim()

    if (/^[#.[]/.test(target)) {
        try {
            const bySelector = root.querySelector(target)

            if (bySelector instanceof HTMLElement) {
                return bySelector
            }
        } catch {
            // 选择器写错就退回文本匹配
        }
    }

    const candidates = [...root.querySelectorAll<HTMLElement>(CLICKABLE_SELECTOR)].filter(element => normalizeLabel(element) !== "")
    const exact = candidates.find(element => normalizeLabel(element) === target)

    if (exact) {
        return exact
    }

    const partial = candidates
        .filter(element => normalizeLabel(element).includes(target))
        .sort((a, b) => normalizeLabel(a).length - normalizeLabel(b).length)

    return partial[0] ?? null
}

/**
 * 取元素的可见文本并压掉多余空白。
 * @param element 元素
 * @returns 单行文本
 */
function normalizeLabel(element: Element): string {
    return (element.textContent ?? "").replace(/\s+/g, " ").trim()
}

/**
 * 收集页面上的可点击项名称，供模型挑选下一轮的点击目标。
 * @param root 快照容器
 * @param limit 数量上限
 * @returns 去重后的名称列表
 */
function collectClickableLabels(root: HTMLElement, limit = 40): string[] {
    const labels: string[] = []
    const seen = new Set<string>()

    for (const element of root.querySelectorAll<HTMLElement>(CLICKABLE_SELECTOR)) {
        const text = normalizeLabel(element)

        // 复制 ID 之类的按钮点开也不产出内容，不进候选
        if (!text || text.length > 24 || ID_BUTTON_LABEL.test(text) || seen.has(text)) {
            continue
        }

        seen.add(text)
        labels.push(text)

        if (labels.length >= limit) {
            break
        }
    }

    return labels
}

/**
 * 取页面标题：优先指向本页的链接文字（详情页的条目名就写在标题行的链接里），
 * 其次首个 h1 / h2，最后退到页面头部区。
 * @param root 快照容器
 * @param path 渲染的站内路径
 * @returns 标题；取不到时为空串
 */
function resolveSnapshotTitle(root: HTMLElement, path: string): string {
    const barePath = path.split("?")[0]
    const selfLink = [...root.querySelectorAll("a")].find(link => link.getAttribute("href") === barePath)
    const heading = root.querySelector("h1") ?? root.querySelector("h2") ?? root.querySelector("header")
    const title = selfLink ? normalizeLabel(selfLink) : heading ? normalizeLabel(heading) : ""

    return title.slice(0, 120)
}

/**
 * 后序删除净化后只剩空壳的节点（图标、装饰性分隔、空的容器）。
 * @param root 净化后的根元素
 */
function pruneEmptyElements(root: Element): void {
    for (const child of [...root.children]) {
        pruneEmptyElements(child)

        if (KEEP_EMPTY_TAGS.has(child.tagName.toLowerCase())) {
            continue
        }

        if (normalizeLabel(child) !== "") {
            continue
        }

        // 表格单元格与分隔线在文本为空时也有意义，保留它们的祖先链
        if (child.querySelector("br, hr, td, th") !== null) {
            continue
        }

        child.remove()
    }
}

/**
 * 把文本节点里的连续空白压成单个空格（`pre` 内保持原样）。
 * @param root 净化后的根元素
 */
function collapseTextNodes(root: Element): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []

    while (walker.nextNode()) {
        nodes.push(walker.currentNode as Text)
    }

    for (const node of nodes) {
        if (node.parentElement?.tagName.toLowerCase() === "pre") {
            continue
        }

        node.nodeValue = (node.nodeValue ?? "").replace(/[\s\u00a0]+/g, " ")
    }
}

/**
 * 递归遍历元素并拼出结构化文本。
 * @param element 当前元素
 * @param listDepth 列表嵌套层级（用于缩进）
 * @returns 文本片段
 */
function walkElementToText(element: Element, listDepth: number): string {
    const tag = element.tagName.toLowerCase()

    if (tag === "br") {
        return "\n"
    }

    if (tag === "hr") {
        return "\n---\n"
    }

    if (/^h[1-6]$/.test(tag)) {
        return `\n\n${"#".repeat(Number(tag[1]) || 3)} ${childrenToText(element, listDepth)}\n\n`
    }

    if (tag === "li") {
        return `\n${"  ".repeat(listDepth)}- ${childrenToText(element, listDepth + 1)}`
    }

    if (tag === "tr") {
        const cells = [...element.children]
            .filter(cell => ["td", "th"].includes(cell.tagName.toLowerCase()))
            .map(cell => normalizeTextLines(childrenToText(cell, listDepth)).replace(/\n/g, " ").trim())

        return cells.length ? `\n| ${cells.join(" | ")} |` : "\n"
    }

    if (tag === "a") {
        const text = normalizeLabel(element)
        const href = element.getAttribute("href") ?? ""

        if (!text) {
            return ""
        }

        return href.startsWith("/") ? `[${text}](${href})` : text
    }

    if (tag === "strong" || tag === "b") {
        const text = normalizeLabel(element)
        return text ? `**${text}**` : ""
    }

    if (tag === "td" || tag === "th") {
        return childrenToText(element, listDepth)
    }

    if (BLOCK_TAGS.has(tag)) {
        const text = childrenToText(element, listDepth)
        return text.trim() === "" ? "\n" : `\n${text}\n`
    }

    return childrenToText(element, listDepth)
}

/**
 * 拼接元素所有子节点的文本。
 * @param element 元素
 * @param listDepth 列表嵌套层级
 * @returns 文本片段
 */
function childrenToText(element: Element, listDepth: number): string {
    let text = ""

    for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            text += (child.nodeValue ?? "").replace(/[\s\u00a0]+/g, " ")
            continue
        }

        if (child.nodeType === Node.ELEMENT_NODE) {
            text += walkElementToText(child as Element, listDepth)
        }
    }

    return text
}

/**
 * 规范化文本行：行内多余空白压成单个空格、去掉首尾空白、折叠连续空行。
 * @param raw 原始文本
 * @returns 规整后的文本
 */
function normalizeTextLines(raw: string): string {
    const lines = raw.split("\n").map(line => line.replace(/[ \t\u00a0]+/g, " ").trim())
    const result: string[] = []

    for (const line of lines) {
        if (line === "") {
            if (result.length > 0 && result[result.length - 1] !== "") {
                result.push("")
            }
            continue
        }

        result.push(line)
    }

    return result.join("\n").trim()
}

/**
 * 把错误收敛成一行文本。
 * @param error 任意异常
 * @returns 错误信息
 */
function describeError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`
    }

    return `${error ?? "未知错误"}`
}

/**
 * 取第一条渲染错误作为失败原因。
 * @param errors 渲染期错误
 * @returns 错误文本；没有错误时为空串
 */
function reasonOfFirstError(errors: string[]): string {
    return errors[0] ?? ""
}

/**
 * 数值裁剪。
 * @param value 原始数值
 * @param min 下限
 * @param max 上限
 * @returns 裁剪后的数值
 */
function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min
    }

    return Math.min(Math.max(value, min), max)
}
