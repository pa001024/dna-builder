import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import vueJsx from "@vitejs/plugin-vue-jsx"
import Component from "unplugin-vue-components/vite"
import RadixVueResolver from "radix-vue/resolver"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"
import { resolve } from "path"
import { chunkSplitPlugin } from "vite-plugin-chunk-split"
import graphqlTag from "rollup-plugin-graphql-tag"
const host = process.env.TAURI_DEV_HOST

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
            // "dna-api": resolve(__dirname, "externals/dna-api/src/index.ts"),
        },
    },
    plugins: [
        vue(),
        vueJsx(),
        tailwindcss(),
        Component({
            dts: "./src/components.d.ts",
            resolvers: [
                RadixVueResolver(),

                // RadixVueResolver({
                //   prefix: '' // use the prefix option to add Prefix to the imported components
                // })
            ],
        }),
        chunkSplitPlugin({
            strategy: "default",
            customSplitting: {
                dna: [/src\/views\/DNA/],
                db: [/src\/views\/DB/],
            },
        }),
        graphqlTag({
            include: ["src/**/*.{vue,js,ts}"],
        }),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: [],
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
                navigateFallbackDenylist: [/^\/graphql/, /^\/api/],
                maximumFileSizeToCacheInBytes: 3000000,
                runtimeCaching: [
                    // {
                    //     urlPattern: /^https:\/\/xn--chq26veyq\.icu\/api\/.+/,
                    //     handler: "NetworkFirst",
                    //     options: {
                    //         cacheName: "api-cache",
                    //         expiration: {
                    //             maxEntries: 50,
                    //             maxAgeSeconds: 60 * 60 * 24, // 1 day
                    //         },
                    //     },
                    // },
                    {
                        urlPattern: /\.json$/,
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "res-cache",
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                            },
                        },
                    },
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif)$/,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "image-cache",
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                            },
                        },
                    },
                ],
            },
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
        watch: {
            // 3. tell Vite to ignore watching `src-tauri`
            ignored: [
                "**/src-tauri/**",
                "**/*.d.ts",
                "**/*.md",
                "**/*.test.ts",
                "**/mcp_server/**",
                "**/server/**",
                "**/externals/**",
                // ...
            ],
        },
    },
}))
