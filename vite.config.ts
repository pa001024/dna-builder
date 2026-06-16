import fs from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import vueJsx from "@vitejs/plugin-vue-jsx"
import RekaResolver from "reka-ui/resolver"
import graphqlTag from "rollup-plugin-graphql-tag"
import Component from "unplugin-vue-components/vite"
import { defineConfig } from "vite"
import { chunkSplitPlugin } from "vite-plugin-chunk-split"
import { dataPackRewritePlugin } from "./src/data/data-pack-rewrite-plugin"

const host = process.env.TAURI_DEV_HOST
const mockDataPackDir = resolve(__dirname, "mock/data-pack")

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
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
            "dna-api": resolve(__dirname, "externals/dna-api/src/index.ts"),
            "node:async_hooks": resolve(__dirname, "src/polyfills/async_hooks.ts"),
            async_hooks: resolve(__dirname, "src/polyfills/async_hooks.ts"),
        },
    },
    plugins: [
        stripPublicImgsPlugin(),
        dataPackRewritePlugin(),
        vue(),
        vueJsx(),
        tailwindcss(),
        Component({
            dts: "./src/components.d.ts",
            resolvers: [
                RekaResolver(),

                // RadixVueResolver({
                //   prefix: '' // use the prefix option to add Prefix to the imported components
                // })
            ],
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
    ],
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
        fs: {
            allow: ["."],
        },
        middlewareMode: false,
        configureServer(server) {
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
                // "**/externals/**",
                // ...
            ],
        },
    },
}))
