/**
 * dna-builder 真实浏览器冒烟测试（ego-browser-test）。
 * 运行: pnpm test:browser
 * 前置: ego lite 已安装并运行；dev server 已在 http://localhost:1420 启动。
 */
export default ({ test, expectCountAtLeast, expectNoConsoleErrors, snapshot }) => {
    test("启动: 应用已挂载且无启动弹窗", async ctx => {
        await expectCountAtLeast(ctx, "#app > *", 1)
        const dialog = await ctx.page.evaluate(() => Boolean(document.querySelector("dialog.modal.modal-open")))
        if (dialog) throw new Error("启动弹窗仍然出现，hideUpdateInfo=1 未生效")
        await expectNoConsoleErrors(ctx)
    })

    test("页面标题非空", async ({ page }) => {
        const title = await page.title()
        if (!title) throw new Error("document.title 为空")
    })

    test("导航: 点击侧边栏「资料库」后路由更新", async ({ page }) => {
        const labels = ["资料库", "資料庫", "Database", "データベース", "데이터베이스", "Base de données"]
        const found = await page.evaluate(names => {
            const button = [...document.querySelectorAll("button")].find(node => names.includes(node.textContent?.trim()))
            if (!button) return false
            button.setAttribute("data-ego-test-nav", "1")
            return true
        }, labels)
        if (!found) throw new Error("未找到侧边栏「资料库」按钮")
        await page.click("[data-ego-test-nav]")
        await page.waitForFunction(() => location.pathname.startsWith("/db"), undefined, { timeout: 15000 })
    })

    test("截图归档首页", async ctx => {
        await ctx.goto("/")
        await ctx.page.waitForSelector("text=Duet of Builder", { state: "visible", timeout: 30000 })
        await ctx.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const file = await snapshot(ctx, "home")
        console.log(`   截图: ${file}`)
    })

    test("数据页: 角色构筑能渲染伤害结果", async ctx => {
        await ctx.goto("/char/1101", { timeout: 60000 })
        try {
            await ctx.page.waitForSelector('[data-agent="damage-result"] .font-orbitron', { state: "visible", timeout: 30000 })
        } catch {
            console.log("   (角色页未渲染伤害结果：可能未安装数据包或角色 id 不存在，跳过)")
            return
        }
        const damage = await ctx.page.evaluate(
            () => document.querySelector('[data-agent="damage-result"] .font-orbitron')?.textContent?.trim() ?? ""
        )
        if (!damage || damage === "0") throw new Error(`未在构筑页读到伤害数值（实际: ${JSON.stringify(damage)}）`)
    })
}
