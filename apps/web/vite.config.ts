import fs from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import vueJsx from "@vitejs/plugin-vue-jsx"
import RekaResolver from "reka-ui/resolver"
// @ts-expect-error
import graphqlTag from "rollup-plugin-graphql-tag"
import Component from "unplugin-vue-components/vite"
import { defineConfig } from "vite"
import { chunkSplitPlugin } from "vite-plugin-chunk-split"
import { VitePWA } from "vite-plugin-pwa"
import { i18nHmrPlugin } from "./src/i18n-hmr-plugin"
import { dataPackRewritePlugin } from "./src/utils/data-pack/data-pack-rewrite-plugin"

const host = process.env.TAURI_DEV_HOST
const mockDataPackDir = resolve(__dirname, "mock/data-pack")
const mockPluginsDir = resolve(__dirname, "mock/plugins")
const isAppBuild = process.env.DNA_BUILDER_APP_BUILD === "1"
const isDisableRewrite = process.env.DISABLE_REWRITE === "1"
/** 每次构建唯一：注册 sw.js 时带在 URL 上，绕过 CDN 对 SW 脚本的缓存 */
const buildId = Date.now().toString(36)

/**
 * 从构建产物中剔除 public/imgs 资源。
 */
function stripPublicImgsPlugin(): import("vite").Plugin {
    let outDir = resolve(__dirname, "dist")

    return {
        name: "dna-builder-strip-public-imgs",
        configResolved(config) {
            outDir = resolve(config.root, config.build.outDir)
        },
        closeBundle() {
            fs.rmSync(resolve(outDir, "imgs"), { recursive: true, force: true })
        },
    }
}

// https://vite.dev/config/
export default defineConfig(async () => ({
    test: {
        includeSource: ["src/**/*.{js,ts}"],
    },
    define: {
        "import.meta.vitest": "undefined",
        __APP_BUILD__: JSON.stringify(isAppBuild),
        __WEB_BUILD__: JSON.stringify(!isAppBuild),
        __BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
        alias: [
            // 数据包（packages/data）源码直引：必须排在 "@" 之前，Vite 按顺序取首个命中的前缀
            { find: "@/data", replacement: resolve(__dirname, "../../packages/data") },
            // 技能模拟包（workspace 内但未声明为 web 依赖，用 alias 直引源码，避免 lockfile 变更）
            { find: /^dna-builder-skill-sim\/core$/, replacement: resolve(__dirname, "../../packages/skill-sim/src/core/index.ts") },
            {
                find: /^dna-builder-skill-sim\/runtime$/,
                replacement: resolve(__dirname, "../../packages/skill-sim/src/runtime/index.ts"),
            },
            {
                find: /^dna-builder-skill-sim\/schema$/,
                replacement: resolve(__dirname, "../../packages/skill-sim/src/schema/index.ts"),
            },
            { find: /^dna-builder-skill-sim$/, replacement: resolve(__dirname, "../../packages/skill-sim/src/index.ts") },
            { find: "@", replacement: resolve(__dirname, "src") },
            // "dna-api": resolve(__dirname, "../../packages/dna-api/src/index.ts"),
            { find: "node:async_hooks", replacement: resolve(__dirname, "src/polyfills/async_hooks.ts") },
            { find: "async_hooks", replacement: resolve(__dirname, "src/polyfills/async_hooks.ts") },
        ],
    },
    plugins: [
        ...(isAppBuild ? [stripPublicImgsPlugin()] : []),
        i18nHmrPlugin(),
        // 仅在构建时启用数据包重写插件，dev 启动（command 为 serve）时直接使用源码数据模块
        ...(!isDisableRewrite ? [dataPackRewritePlugin()] : []),
        vue({
            template: {
                // 模板注释不进产物：默认值取自 compiler 的构建模式（prod 关、dev 开），
                // 而 SSG 预渲染跑在 middlewareMode 开发服务器里，走的是 dev 编译器，
                // 不显式关掉的话 dist/*/index.html 里会留下一堆 <!-- 中文说明 -->。
                compilerOptions: {
                    comments: false,
                },
            },
        }),
        vueJsx(),
        tailwindcss(),
        Component({
            dts: "./src/components.d.ts",
            resolvers: [RekaResolver()],
        }),
        chunkSplitPlugin({
            strategy: "default",
            customSplitting: {
                // DNA/DB 两类页面存在交叉依赖，拆成独立 chunk 容易形成循环引用，统一合并到同一块避免闭环
                // db: [/src\/views\/DB/],
            },
        }),
        graphqlTag({
            include: ["src/**/*.{vue,js,ts}"],
        }),
        VitePWA({
            registerType: "autoUpdate",
            // 注册逻辑在 main.ts 里手写（需要给 sw.js 加构建号查询参数），禁止插件再注入一份
            injectRegister: false,
            includeAssets: [],
            includeManifestIcons: false,
            manifest: {
                name: "DNA Builder",
                short_name: "DNA Builder",
                description: "A character builder and damage calculator for Duet Night Abyss",
                theme_color: "#ffffff",
                icons: [
                    {
                        src: "app-icon.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "app-icon.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                    {
                        src: "app-icon.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "any maskable",
                    },
                ],
            },
            workbox: {
                // 只预缓存一个稳定的小文件：预缓存全量产物会让每次发版重下约 40MB，
                // 且新 SW 激活时会清掉旧 chunk，仍开着旧页面的标签页随后加载懒模块就会白屏。
                // 保留一条清单也为了让生成器输出 cleanupOutdatedCaches()，清掉旧版留下的全量缓存。
                globPatterns: ["manifest.webmanifest"],
                // 关闭导航回退：导航交给下面的 NetworkFirst，在线时永远拿到最新 index.html
                navigateFallback: undefined,
                skipWaiting: true,
                clientsClaim: true,
                runtimeCaching: [
                    {
                        // 页面导航：优先网络（发版后立即生效），断网时回退到最近一次访问的 HTML
                        urlPattern: ({ request, url }) =>
                            request.mode === "navigate" && !url.pathname.startsWith("/api") && !url.pathname.startsWith("/graphql"),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "page-cache",
                            networkTimeoutSeconds: 3,
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 60 * 60 * 24 * 7,
                            },
                        },
                    },
                    {
                        // 构建产物文件名带内容哈希，同一 URL 的内容不会变：按需缓存，
                        // 且不随版本清理，旧页面的旧 chunk 仍能命中，避免发版后白屏
                        urlPattern: ({ url }) => url.pathname.startsWith("/assets/"),
                        handler: "CacheFirst",
                        options: {
                            cacheName: "assets-cache",
                            expiration: {
                                maxEntries: 600,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                            cacheableResponse: {
                                statuses: [200],
                            },
                        },
                    },
                    {
                        urlPattern: /\.json$/,
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "res-cache",
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "image-cache",
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },
                ],
            },
        }),
    ],
    // 这些依赖只被懒加载 chunk 首次引入：它们由 unplugin-vue-components 自动注册的组件
    // （DNAGameInfo、CharHPCurve、GameSimulator、CodeEditor、ResourceTreeGraph、Sidebar 等）在运行时才带入，
    // Vite 启动时的依赖扫描器无法跟踪这种插件注入的 import，会在用户首次进入对应页面时才"新发现"依赖，
    // 触发 "optimized dependencies changed. reloading page" 整页刷新。
    // 这里显式预声明，让它们从启动时就进入预构建缓存（node_modules/.vite），避免进页面被强制 reload。
    optimizeDeps: {
        include: [
            "html-to-image",
            "echarts",
            "three",
            "@antv/g",
            "@antv/g6",
            "@codemirror/commands",
            "@codemirror/lang-javascript",
            "@codemirror/language",
            "@codemirror/state",
            "@codemirror/view",
            "@lezer/highlight",
            "gsap",
            "js-ini",
            "@tauri-apps/plugin-updater",
            "@tauri-apps/plugin-process",
            "@tauri-apps/api/path",
            "zod",
            "@chenglou/pretext",
            "bcryptjs",
            "lexical",
            "@lexical/plain-text",
            "@lexical/history",
            "@vue-flow/background",
            "@vue-flow/controls",
            "@vue-flow/core",
            "@vue-flow/minimap",
        ],
    },
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, "index.html"),
                login: resolve(__dirname, "login_jjj.html"),
            },
        },
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    css: {
        preprocessorOptions: {
            less: {
                javascriptEnabled: true,
            },
        },
    },
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: 1421,
              }
            : undefined,
        proxy: {
            // 代理API请求到后端服务器
            "/api/v1": {
                target: "http://localhost:8887",
                changeOrigin: true,
                secure: false,
            },
        },
        // "@/data" 别名指向 workspace 根下的 packages/data（项目根之外），必须显式放行
        fs: {
            allow: [".", resolve(__dirname, "..", "..", "packages")],
        },
        middlewareMode: false,
        configureServer(server: {
            middlewares: {
                use: (arg0: string, arg1: { (req: any, res: any, next: any): void; (req: any, res: any, next: any): void }) => void
            }
        }) {
            server.middlewares.use("/mock/plugins", (req, res, next) => {
                const url = req.url || "/"
                const filePath = url === "/" ? "plugins.json" : url.replace(/^\//, "")
                const absPath = resolve(mockPluginsDir, filePath)
                if (!absPath.startsWith(mockPluginsDir)) {
                    res.statusCode = 403
                    res.end("Forbidden")
                    return
                }

                fs.readFile(absPath, (error, buffer) => {
                    if (error) {
                        next()
                        return
                    }

                    res.statusCode = 200
                    if (absPath.endsWith(".json")) {
                        res.setHeader("Content-Type", "application/json; charset=utf-8")
                    } else if (absPath.endsWith(".zip")) {
                        res.setHeader("Content-Type", "application/zip")
                    }
                    res.end(buffer)
                })
            })
            server.middlewares.use("/mock/data-pack", (req, res, next) => {
                const url = req.url || "/"
                const filePath = url === "/" ? "latest.json" : url.replace(/^\//, "")
                const absPath = resolve(mockDataPackDir, filePath)
                if (!absPath.startsWith(mockDataPackDir)) {
                    res.statusCode = 403
                    res.end("Forbidden")
                    return
                }

                fs.readFile(absPath, (error, buffer) => {
                    if (error) {
                        next()
                        return
                    }

                    res.statusCode = 200
                    if (absPath.endsWith(".json")) {
                        res.setHeader("Content-Type", "application/json; charset=utf-8")
                    } else if (absPath.endsWith(".zip")) {
                        res.setHeader("Content-Type", "application/zip")
                    }
                    res.end(buffer)
                })
            })
        },
        watch: {
            // 3. tell Vite to ignore watching `src-tauri`
            ignored: [
                "**/src-tauri/**",
                "**/*.md",
                "**/*.test.ts",
                "**/mcp_server/**",
                "**/server/**",
                "**/sdk/**",
                "**/.tmp/**",
                "**/.agents/**",
                "**/tools/**",
                // "**/packages/**",
                // ...
            ],
        },
    },
}))
