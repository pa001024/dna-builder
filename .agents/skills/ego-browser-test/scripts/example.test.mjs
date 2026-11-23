/**
 * ego-browser-test 最小模板：复制到 apps/web/tests/browser/ 后改用例。
 * 运行: pnpm test:browser
 */
export default ({ test, expectVisible, expectNoConsoleErrors }) => {
    test("首页可加载", async ctx => {
        await ctx.goto("/")
        await expectVisible(ctx, "#app")
        await expectNoConsoleErrors(ctx)
    })
}
