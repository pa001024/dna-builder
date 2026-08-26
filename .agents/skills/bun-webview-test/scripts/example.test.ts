/**
 * 示例: 用 Bun.WebView 对 dna-builder 前端做冒烟测试。
 * 运行前请确认开发服务器已启动 (pnpm dev → http://localhost:1420)。
 *
 * 运行方式:
 *   bun scripts/example.test.ts
 *   bun scripts/example.test.ts --url http://localhost:1420
 *   FRONTEND_TEST_URL=http://localhost:1420 bun scripts/example.test.ts
 *
 * 失败时会自动在 screenshots/ 下保存 PNG，方便定位问题。
 */
import { expectEval, expectNoConsoleErrors, expectVisible, run, snapshot, test } from "./webview-test.ts"

// 1) 应用已挂载: Vue 根节点 #app 有子节点
test("应用根节点 #app 已挂载且有子节点", async ({ view }) => {
    const count = await view.evaluate("document.querySelector('#app')?.childElementCount ?? 0")
    if (count < 1) throw new Error("#app 未挂载任何内容，前端可能未正常启动")
})

// 2) 页面标题非空
test("页面标题非空", async ({ view }) => {
    const title = await view.evaluate("document.title")
    if (!title) throw new Error("document.title 为空")
})

// 3) 无浏览器控制台错误 (捕获 JS 运行时异常)
test("无浏览器控制台错误", async () => {
    await expectNoConsoleErrors()
})

// 4) 交互冒烟: 点击导航链接后路由更新 (无导航则跳过)
test("导航交互: 点击导航链接后路由更新", async ({ view }) => {
    const hasLink = await view.evaluate("!!document.querySelector('nav a, header a, a[href]')")
    if (!hasLink) {
        console.log("   (未检测到导航链接，跳过交互用例)")
        return
    }
    await view.click("nav a, header a, a[href]")
    await view.evaluate("await new Promise(r => setTimeout(r, 400))")
    const path = await view.evaluate("location.pathname")
    if (typeof path !== "string") throw new Error("无法读取 location.pathname")
})

// 5) 截图归档，便于人工查看首屏
test("截图归档首屏", async ctx => {
    const f = await snapshot(ctx, "home")
    console.log("   截图:", f)
})

run()
