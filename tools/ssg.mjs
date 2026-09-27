#!/usr/bin/env node
/**
 * SSG 预渲染：构建完成后为主要路由生成静态 HTML。
 *
 * 流程：
 *   1. 装一套最小 DOM 桩（应用在 setup 阶段会读写 localStorage / document）；
 *   2. 起一个 middlewareMode 的 Vite 开发服务器，用 ssrLoadModule 载入
 *      src/ssr/entry-server.ts —— 走同一份插件链（Vue SFC、别名、数据包壳模块重写），
 *      但只按需转换真正被渲染到的模块，不必等一次完整 SSR 打包；
 *   3. 逐个路由 renderToString，把结果与各自的 SEO 信息塞进 dist/index.html 模板，
 *      写成 dist/<route>/index.html；
 *   4. 按同一份路由清单生成 dist/robots.txt 与 dist/sitemap.xml。
 *
 * 客户端不做 hydration：主应用启动时会整体替换 #app 的内容，静态标记只服务爬虫与首屏。
 * 仅在网页版构建（`pnpm build`）时执行；桌面端构建（DNA_BUILDER_APP_BUILD=1）直接跳过。
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { installDomStubs } from "./ssg-dom-stub.mjs"

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** 站点主域：canonical / og:url 用它拼绝对地址 */
const SITE_ORIGIN = "https://dna-builder.cn"

/** 预渲染语言（与 index.html 的 lang 一致，也是 search engine 抓到的版本） */
const PRERENDER_LANGUAGE = "zh-CN"

/**
 * 预渲染的页面清单：主要路由 + 各自的 SEO 文案。
 * 顺序即构建日志顺序，path 必须与 src/router.ts 中的路由一致。
 */
const PAGES = [
    {
        path: "/",
        title: "DNA Builder - 二重螺旋构筑工具与资料库",
        description:
            "Duet Night Abyss Builder 是一款免费的二重螺旋角色构建工具，支持角色属性计算、装备搭配、技能规划和构建分享。提供详细的游戏数据和实用的配置方案。",
        keywords: "二重螺旋,Duet Night Abyss,构筑工具,角色构建,装备搭配,游戏工具,角色计算,构建分享",
    },
    {
        path: "/download",
        title: "APP 下载 - DOB Mobile 二重螺旋安卓客户端",
        description:
            "下载 DOB Mobile 安卓客户端：二重螺旋资料库查询、构筑与伤害计算、数据包在线更新，与网页版数据实时同步。手机扫码或直接下载 APK 安装包。",
        keywords: "二重螺旋APP,DOB Mobile,二重螺旋安卓版,DOB Mobile下载,二重螺旋资料库,APK下载",
        jsonLd: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "DOB Mobile",
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Android",
            description: "二重螺旋（Duet Night Abyss）资料库与构筑工具的安卓客户端。",
            offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
        },
    },
    {
        path: "/db",
        title: "资料库 - 二重螺旋角色武器怪物数据查询",
        description: "二重螺旋资料库：角色、武器、魔之楔、怪物、地图、副本、掉落物、书籍与称号全数据查询，支持全文检索。",
        keywords: "二重螺旋资料库,二重螺旋图鉴,角色数据,武器数据,怪物数据",
    },
    {
        path: "/char",
        title: "角色构筑 - 二重螺旋构筑与属性计算",
        description: "二重螺旋角色构筑工具：搭配武器、魔之楔与词条，实时计算属性与伤害，支持构筑码分享与多套构筑对比。",
        keywords: "二重螺旋构筑,角色配装,属性计算,伤害计算,构筑分享",
    },
    {
        path: "/guides",
        title: "攻略 - 二重螺旋玩家攻略与心得",
        description: "二重螺旋玩家攻略聚合：版本活动、角色养成、副本打法与配队思路，支持按标签与作者筛选。",
        keywords: "二重螺旋攻略,二重螺旋配队,版本活动,养成攻略",
    },
    {
        path: "/more",
        title: "全部功能 - DNA Builder 二重螺旋工具箱",
        description: "DNA Builder 全部功能入口：构筑、资料库、成就统计、深渊使用率、时间轴、地图、皮肤染剂与脚本工具。",
        keywords: "二重螺旋工具,DNA Builder功能,深渊统计,成就统计",
    },
    {
        path: "/help",
        title: "帮助中心 - DNA Builder 使用指南",
        description: "DNA Builder 使用指南：构筑、资料库、数据包与桌面端功能的上手说明与常见问题。",
        keywords: "DNA Builder帮助,使用教程,常见问题",
    },
]

/**
 * 屏蔽收录的路由前缀：私人数据页、后台，以及只有桌面端能用的浮窗路由。
 * 交给搜索引擎的 robots.txt 用，与预渲染清单独立。
 */
const DISALLOW_PATHS = [
    "/admin",
    "/api/",
    "/chat",
    "/counter",
    "/game-accounts",
    "/inventory",
    "/setting",
    "/skill-cd-overlay",
    "/screen-bar",
]

/** 预渲染失败时记录的路由 */
const failures = []

/**
 * 转义 HTML 文本，避免文案里的引号破坏属性。
 * @param {string} text 原始文本
 * @returns {string} 转义结果
 */
function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * 移除模板里已有的 head 标签（title / description / keywords / canonical / og / twitter / ld+json）。
 * 这些标签在构建产物里可能跨行，用非贪婪匹配整体删掉，稍后统一注入。
 * og / twitter / ld+json 只有本脚本会写，一并清掉是为了让 `pnpm ssg` 重跑幂等 ——
 * 重跑时模板就是上一次的产物，只清 title 那几项会让 og 标签一轮轮叠加。
 * @param {string} html 模板
 * @returns {string} 清理后的模板
 */
function stripSeoTags(html) {
    return html
        .replace(/[ \t]*<title>[\s\S]*?<\/title>\s*/gi, "")
        .replace(/[ \t]*<meta\s+name="(?:description|keywords)"[\s\S]*?\/>\s*/gi, "")
        .replace(/[ \t]*<link\s+rel="canonical"[\s\S]*?\/>\s*/gi, "")
        .replace(/[ \t]*<meta\s+property="og:[\s\S]*?\/>\s*/gi, "")
        .replace(/[ \t]*<meta\s+name="twitter:[\s\S]*?\/>\s*/gi, "")
        .replace(/[ \t]*<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, "")
}

/**
 * 生成页面的 SEO 头部标签。
 * @param {object} page 页面配置
 * @returns {string} head 标签
 */
function buildSeoHead(page) {
    const url = `${SITE_ORIGIN}${page.path === "/" ? "/" : page.path}`
    const tags = [
        `<title>${escapeHtml(page.title)}</title>`,
        `<meta name="description" content="${escapeHtml(page.description)}" />`,
        page.keywords ? `<meta name="keywords" content="${escapeHtml(page.keywords)}" />` : "",
        `<link rel="canonical" href="${url}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="DNA Builder" />`,
        `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
        `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
        `<meta property="og:url" content="${url}" />`,
        `<meta property="og:image" content="${SITE_ORIGIN}/app-icon.png" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        page.jsonLd ? `<script type="application/ld+json">${JSON.stringify(page.jsonLd)}</script>` : "",
    ]
    return tags.filter(Boolean).join("\n        ")
}

/**
 * 移除应用渲染结果里的 HTML 注释。
 * 模板注释已由 vite.config.ts 的 `comments: false` 在编译期丢掉，这里收拾编译器仍会输出的
 * 结构化注释：SSR 片段的 `<!--[-->` / `<!--]-->` 锚点、空分支与占位的 `<!---->`、teleport 锚点。
 * 客户端挂载时会整体替换 #app，去掉它们不影响运行（本产物不做 hydration）。
 * @param {string} html 应用渲染结果
 * @returns {string} 去掉注释的 HTML
 */
function stripHtmlComments(html) {
    return html.replace(/<!--[\s\S]*?-->/g, "")
}

/**
 * 生成 robots.txt：全站可收录，仅屏蔽私人数据页与桌面端专用路由。
 * @returns {string} robots.txt 内容
 */
function buildRobotsTxt() {
    return [
        "# 本文件由 tools/ssg.mjs 在构建时生成，请勿手工修改",
        "User-agent: *",
        "Allow: /",
        ...DISALLOW_PATHS.map(item => `Disallow: ${item}`),
        "",
        `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
        "",
    ].join("\n")
}

/**
 * 生成 sitemap.xml：列出全部预渲染路由。
 * @param {string} lastmod 构建日期（YYYY-MM-DD）
 * @returns {string} sitemap.xml 内容
 */
function buildSitemapXml(lastmod) {
    const urls = PAGES.map(page => {
        const loc = `${SITE_ORIGIN}${page.path === "/" ? "/" : page.path}`
        return `    <url>\n        <loc>${escapeHtml(loc)}</loc>\n        <lastmod>${lastmod}</lastmod>\n    </url>`
    }).join("\n")
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/**
 * 预渲染结果落位的区间：模板里从 `<div id="app">` 到 `</body>` 之间的内容完全由本脚本掌管
 * （构建产物中只有空的 `<div id="app"></div>`，而 dist/index.html 本身也是首页的产物，
 * 重复执行时这段区间已经是上一次的预渲染标记与守卫脚本）。
 * 之所以整段替换而不是替换空容器占位符：`pnpm ssg` 单独重跑时占位符早已被替换掉，
 * 那时再找一个不存在的 `<div id="app"></div>` 会静默失败，页面停在旧内容上。
 */
const APP_REGION_RE = /[ \t]*<div id="app">[\s\S]*(?=<\/body>)/i

/**
 * 把预渲染结果写进 HTML 模板。
 * @param {string} template 构建产物中的 HTML 模板
 * @param {object} page 页面配置
 * @param {string | null} appHtml 应用渲染结果；为 null 表示渲染失败，退化成空容器
 * @returns {string} 最终 HTML
 */
function buildPageHtml(template, page, appHtml) {
    let html = stripSeoTags(template)
    html = html.replace("</head>", `        ${buildSeoHead(page)}\n    </head>`)

    if (!APP_REGION_RE.test(html)) {
        throw new Error('HTML 模板里找不到 #app 容器（<div id="app">…</body>）')
    }

    const container = appHtml === null ? "" : stripHtmlComments(appHtml)
    // 首页模板是 SPA 回退的兜底文件：非 "/" 路径由 nginx 回退到它，这里先清空静态标记，
    // 免得深链进来先闪一下首页内容（主应用挂载时同样会清空容器）。
    const guard =
        page.path === "/" && appHtml !== null
            ? `\n        <script>\n            if (location.pathname !== "/") document.getElementById("app").replaceChildren()\n        </script>`
            : ""
    return html.replace(APP_REGION_RE, `<div id="app">${container}</div>${guard}\n    `)
}

/**
 * 解析命令行参数。
 * @param {string[]} argv 参数列表
 * @returns {{ only: string | null }} 解析结果
 */
function parseArgs(argv) {
    const onlyArg = argv.find(arg => arg.startsWith("--only="))
    return { only: onlyArg ? onlyArg.slice("--only=".length) : null }
}

/**
 * 主流程：起 Vite 服务器、渲染路由、写盘。
 */
async function main() {
    if (process.env.DNA_BUILDER_APP_BUILD === "1") {
        console.log("⏭️  桌面端构建：跳过 SSG 预渲染（仅网页版生成静态页）")
        return
    }

    if (process.env.DNA_SSG_SKIP === "1") {
        console.log("⏭️  DNA_SSG_SKIP=1：跳过 SSG 预渲染")
        return
    }

    const { only } = parseArgs(process.argv.slice(2))
    const pages = only ? PAGES.filter(page => page.path === only) : PAGES
    if (pages.length === 0) {
        throw new Error(`--only=${only} 没有匹配到任何预渲染路由`)
    }

    // 桩必须在加载应用模块之前装好：env.ts 等模块初始化时就会读 window
    installDomStubs()

    const { createServer } = await import("vite")
    const server = await createServer({
        root: ROOT_DIR,
        server: { middlewareMode: true },
        appType: "custom",
        logLevel: "warn",
    })

    const outDir = path.resolve(server.config.root, server.config.build.outDir)
    const templatePath = path.join(outDir, "index.html")
    if (!fs.existsSync(templatePath)) {
        await server.close()
        throw new Error(`未找到构建产物 ${templatePath}，请先执行 vite build`)
    }
    const template = fs.readFileSync(templatePath, "utf8")

    console.log(`🖨️  SSG 预渲染 ${pages.length} 个路由 -> ${path.relative(ROOT_DIR, outDir)}`)

    let renderer
    try {
        renderer = await server.ssrLoadModule("/src/ssr/entry-server.ts")
    } catch (error) {
        await server.close()
        throw new Error(`加载预渲染入口失败：${error instanceof Error ? error.message : String(error)}`)
    }

    for (const page of pages) {
        const started = Date.now()
        let appHtml = null
        try {
            appHtml = await renderer.renderRoute(page.path, { language: PRERENDER_LANGUAGE, rootDir: ROOT_DIR })
            if (!appHtml || appHtml.length < 100) {
                throw new Error(`渲染结果异常（${appHtml ? `${appHtml.length} 字节` : "空"}）`)
            }
        } catch (error) {
            // 单个路由渲染失败不应该阻断发布：退化成"只有 SEO 头的 SPA 外壳"，行为与改造前一致
            failures.push({ path: page.path, message: error instanceof Error ? error.message : String(error) })
            console.warn(`⚠️  ${page.path} 渲染失败，回退为 SPA 外壳：${failures[failures.length - 1].message}`)
        }

        const html = buildPageHtml(template, page, appHtml)
        const target = page.path === "/" ? templatePath : path.join(outDir, page.path.replace(/^\//, ""), "index.html")
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, html)
        console.log(
            `   ${appHtml ? "✅" : "⚠️ "} ${page.path.padEnd(11)} ${String(html.length).padStart(7)}B  ${String(Date.now() - started).padStart(5)}ms  -> ${path.relative(outDir, target)}`
        )
    }

    await server.close()

    // SEO 附属文件不随 --only 过滤：始终按完整路由清单生成，重复执行结果一致
    const lastmod = new Date().toISOString().slice(0, 10)
    fs.writeFileSync(path.join(outDir, "robots.txt"), buildRobotsTxt())
    fs.writeFileSync(path.join(outDir, "sitemap.xml"), buildSitemapXml(lastmod))
    console.log(`   ✅ robots.txt + sitemap.xml（收录 ${PAGES.length} 个路由，屏蔽 ${DISALLOW_PATHS.length} 条路径）`)

    if (failures.length > 0) {
        console.warn(`\n⚠️  ${failures.length} 个路由回退为 SPA 外壳：${failures.map(item => item.path).join(", ")}`)
    }
    console.log("✅ SSG 预渲染完成")
}

main().catch(error => {
    console.error("SSG 预渲染失败:", error)
    process.exit(1)
})
