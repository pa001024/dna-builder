import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        include: ["**/*.test.ts"],
        exclude: ["node_modules/**"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            reportsDirectory: "./coverage",
            include: ["**/*.ts"],
            exclude: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**", "**/node_modules/**", "**/dist/**", "**/coverage/**"],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 70,
                statements: 80,
            },
        },
    },
})
