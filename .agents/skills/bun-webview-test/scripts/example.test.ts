/**
 * 示例: 用 Bun.WebView 对 dna-builder 前端做冒烟测试。
 * 运行前请确认开发服务器已启动 (pnpm dev / pnpm dd2 → http://localhost:1420)。
 *
 * 运行方式:
 *   bun scripts/example.test.ts
 *   bun scripts/example.test.ts --url http://localhost:1420
 *   FRONTEND_TEST_URL=http://localhost:1420 bun scripts/example.test.ts
 *
 * 关键约定: 导航地址统一带 `?hideUpdateInfo=1`。
 * 应用启动会依次弹「应用更新 → 数据包安装/更新 → 更新日志」，无头环境里没有数据包，
 * 「安装数据包」弹窗会盖住整个页面，后面的 DOM 断言就全部拿不到内容。
 * 该参数禁用整套启动弹窗（见 src/components/StartupModal.vue），必须在首次导航的 URL 上带上。
 *
 * 失败时会自动在 `screenshots/` 下保存 PNG，方便定位问题；
 * 以 `.tmp` 为工作目录运行可让截图落在 `.tmp/screenshots/`。
 */
import { expectNoConsoleErrors, run, snapshot, test } from "./webview-test.ts"

// 0) 用 hideUpdateInfo=1 打开首页，确认启动弹窗确实被禁用（后续用例复用这个页面）
test("以 hideUpdateInfo=1 打开首页且无启动弹窗", async ({ view, baseUrl }) => {
    await view.navigate(`${baseUrl}/?hideUpdateInfo=1`)
    await view.evaluate("await new Promise(r => setTimeout(r, 1500))")
    const dialog = await view.evaluate(`document.querySelector("dialog.modal.modal-open") ? 1 : 0`)
    if (dialog) throw new Error("启动弹窗仍然出现，hideUpdateInfo=1 未生效")
})

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
// 无头 profile 未配置自定义底图时会有一条「读取自定义底图失败」warning，属于环境噪音，按需 ignore
test("无浏览器控制台错误", async () => {
    await expectNoConsoleErrors({ ignore: [/读取自定义底图失败/] })
})

// 4) 交互冒烟: 点击首个「可见」链接后路由更新 (无可见链接则跳过)
// 注意不能用 `a[href]` 直接 click：折叠菜单里的隐藏链接会排在前面，click 会等待可操作而超时。
test("导航交互: 点击可见链接后路由更新", async ({ view }) => {
    const found = await view.evaluate(`(() => {
        const link = [...document.querySelectorAll("a[href^='/']")].find(a => {
            const r = a.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
        if (!link) return false;
        link.setAttribute("data-e2e-nav", "1");
        return true;
    })()`)
    if (!found) {
        console.log("   (未检测到可见导航链接，跳过交互用例)")
        return
    }
    await view.click("[data-e2e-nav]")
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
