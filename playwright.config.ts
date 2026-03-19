import { defineConfig, devices } from "@playwright/test"

const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:1420"

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 120000,
    expect: {
        timeout: 15000,
    },
    fullyParallel: false,
    reporter: "list",
    use: {
        baseURL: frontendUrl,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
            },
        },
    ],
})
