import { resolve } from "node:path"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vitest/config"

export default defineConfig({
    // 插件宿主（host.ts）直接导出 .vue 组件，单测 import 链会经过它们
    plugins: [vue()],
    test: {
        setupFiles: [resolve(__dirname, "src/test/vitest-setup.ts")],
        // 124+ 文件并发 transform + import 极吃内存，封顶 4 worker（峰值约 2GB）
        maxWorkers: 4,
        // 只运行 Web 应用自身的测试；tools 的测试由仓库根 vitest.config.ts 负责，
        // node_modules、apps/server、packages、e2e 等自动排除
        include: ["src/**/*.test.ts"],
    },
    resolve: {
        alias: [
            // 数据包（packages/data）源码直引：必须排在 "@" 之前，按顺序取首个命中的前缀
            { find: "@/data", replacement: resolve(__dirname, "../../packages/data") },
            // 技能模拟包（workspace 内但未声明为 web 依赖，与 vite.config.ts 保持一致）
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
            { find: "dna-api", replacement: resolve(__dirname, "../../packages/dna-api/src/index.ts") },
            { find: "node:async_hooks", replacement: resolve(__dirname, "src/polyfills/async_hooks.ts") },
            { find: "async_hooks", replacement: resolve(__dirname, "src/polyfills/async_hooks.ts") },
        ],
    },
})
