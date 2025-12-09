import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import vueJsx from "@vitejs/plugin-vue-jsx"
import Component from "unplugin-vue-components/vite"
import RadixVueResolver from "radix-vue/resolver"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig(async () => ({
    test: {
        includeSource: ["src/**/*.{js,ts}"],
    },
    define: {
        "import.meta.vitest": "undefined",
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
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/xn--chq26veyq\.icu\/api\/.+/,
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "api-cache",
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 60 * 60 * 24, // 1 day
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
        watch: {
            // 3. tell Vite to ignore watching `src-tauri`
            ignored: ["**/src-tauri/**", "**/*.d.ts", "**/*.md", "**/*.test.ts"],
        },
    },
}))
