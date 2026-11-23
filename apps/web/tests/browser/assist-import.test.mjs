/**
 * 协战构筑导入（顶层 setting → 内嵌 setting）真实浏览器测试。
 * 覆盖：协战面板导入入口、本地页签导入、JSON 页签导入、空武器自动填入、分享页签渲染。
 * 通过 localStorage 种子 + 备份恢复隔离用户数据，跑完后现场复原。
 * 运行: pnpm test:browser -- assist-import
 */
export default ({ test, expectNoConsoleErrors, snapshot }) => {
    const MAIN_CHAR = 1101
    const ASSIST_CHAR = 4101
    const MELEE_WEAPON = 10101
    const MAIN_KEY = `build.${MAIN_CHAR}`
    const ASSIST_KEY = `build.${ASSIST_CHAR}`

    test("协战导入: 本地/JSON/武器填入全链路", async ctx => {
        const { page } = ctx
        let backup = null

        const restore = async () => {
            if (!backup) return
            try {
                await page.evaluate(
                    ({ MAIN_KEY, ASSIST_KEY, backup }) => {
                        if (backup.main === null) localStorage.removeItem(MAIN_KEY)
                        else localStorage.setItem(MAIN_KEY, backup.main)
                        if (backup.assist === null) localStorage.removeItem(ASSIST_KEY)
                        else localStorage.setItem(ASSIST_KEY, backup.assist)
                    },
                    { MAIN_KEY, ASSIST_KEY, backup }
                )
                await ctx.goto(`/char/${MAIN_CHAR}`, { timeout: 60000 })
                await page.waitForSelector('[data-agent="damage-result"] .font-orbitron', { state: "visible", timeout: 30000 })
            } catch (error) {
                console.log(`   (现场恢复失败，需人工检查 localStorage: ${error?.message ?? error})`)
            }
        }

        try {
            await ctx.goto(`/char/${MAIN_CHAR}`, { timeout: 60000 })
            let ready = await page
                .waitForSelector('[data-agent="damage-result"] .font-orbitron', { state: "visible", timeout: 30000 })
                .then(() => true)
                .catch(() => false)
            if (!ready) {
                console.log("   (未渲染伤害结果，尝试安装数据包)")
                await page.evaluate(
                    `(async () => { const pack = await import("/src/utils/data-pack/data-pack.ts"); return await pack.downloadDataPack() })()`
                )
                await ctx.goto(`/char/${MAIN_CHAR}`, { timeout: 60000 })
                ready = await page
                    .waitForSelector('[data-agent="damage-result"] .font-orbitron', { state: "visible", timeout: 60000 })
                    .then(() => true)
                    .catch(() => false)
            }
            if (!ready) {
                console.log("   (跳过：数据未就绪)")
                return
            }

            backup = await page.evaluate(
                ({ MAIN_KEY, ASSIST_KEY }) => {
                    return { main: localStorage.getItem(MAIN_KEY), assist: localStorage.getItem(ASSIST_KEY) }
                },
                { MAIN_KEY, ASSIST_KEY }
            )

            const openImportDialog = async () => {
                await page.click('[data-tab="assist1:char"]')
                await page.waitForSelector("[data-assist-import]", { state: "visible", timeout: 15000 })
                await page.click("[data-assist-import]")
                await page.waitForSelector("[data-assist-import-dialog]", { state: "visible", timeout: 15000 })
            }
            const confirmImport = async () => {
                await page.waitForFunction(() => !document.querySelector("[data-assist-import-confirm]")?.disabled, undefined, {
                    timeout: 15000,
                })
                await page.click("[data-assist-import-confirm]")
                await page.waitForFunction(() => !document.querySelector("[data-assist-import-dialog]"), undefined, { timeout: 15000 })
            }

            // 场景 A：本地页签导入（武器已配置，只取对应槽位等级）
            await page.evaluate(
                ({ MAIN_KEY, ASSIST_KEY, ASSIST_CHAR, MELEE_WEAPON }) => {
                    const mainRaw = localStorage.getItem(MAIN_KEY)
                    const main = mainRaw ? JSON.parse(mainRaw) : {}
                    main.team1 = ASSIST_CHAR
                    main.team1Weapon = MELEE_WEAPON
                    localStorage.setItem(MAIN_KEY, JSON.stringify(main))
                    localStorage.setItem(
                        ASSIST_KEY,
                        JSON.stringify({
                            charLevel: 37,
                            baseName: "涡旋电场",
                            targetFunction: "654+321",
                            customVariables: [["mk", "1+2"]],
                            meleeWeaponLevel: 61,
                            meleeWeaponRefine: 2,
                            charMods: [[31524, 5]],
                            buffs: [["榛子大冲击", 1]],
                            customBuff: [["攻击", 100]],
                            effectConfig: { "m:31524": 2 },
                        })
                    )
                },
                { MAIN_KEY, ASSIST_KEY, ASSIST_CHAR, MELEE_WEAPON }
            )
            await ctx.goto(`/char/${MAIN_CHAR}`, { timeout: 60000 })
            await page.waitForSelector('[data-agent="damage-result"] .font-orbitron', { state: "visible", timeout: 30000 })

            await openImportDialog()
            await page.waitForSelector('[data-assist-import-choice="current"]', { state: "visible", timeout: 15000 })
            await confirmImport()
            await page.waitForFunction(
                ({ MAIN_KEY }) => {
                    try {
                        return JSON.parse(localStorage.getItem(MAIN_KEY))?.assist1?.charLevel === 37
                    } catch {
                        return false
                    }
                },
                { MAIN_KEY },
                { timeout: 15000 }
            )
            const afterLocal = await page.evaluate(({ MAIN_KEY }) => JSON.parse(localStorage.getItem(MAIN_KEY)), { MAIN_KEY })
            if (afterLocal.assist1.baseName !== "涡旋电场") throw new Error(`本地导入 baseName 错误: ${afterLocal.assist1.baseName}`)
            if (afterLocal.assist1.targetFunction !== "654+321") throw new Error("本地导入 targetFunction 错误")
            if (afterLocal.assist1.weaponLevel !== 61 || afterLocal.assist1.weaponRefine !== 2) {
                throw new Error(`本地导入武器等级错误: ${afterLocal.assist1.weaponLevel}/${afterLocal.assist1.weaponRefine}`)
            }
            if (afterLocal.assist1.charMods?.[0]?.[0] !== 31524) throw new Error("本地导入 MOD 未搬运")
            if (afterLocal.assist1.buffs?.[0]?.[0] !== "榛子大冲击") throw new Error("本地导入 BUFF 未搬运")
            if (afterLocal.team1Weapon !== MELEE_WEAPON) throw new Error("已有武器不应被改写")
            console.log("   场景 A 通过：本地导入 + 武器槽位映射")

            // 场景 B：JSON 页签导入
            await openImportDialog()
            await page.click('[data-assist-import-tab="json"]')
            await page.waitForSelector("[data-assist-import-json]", { state: "visible", timeout: 15000 })
            await page.fill(
                "[data-assist-import-json]",
                JSON.stringify({ charLevel: 53, baseName: "战术节能", targetFunction: "111*2", meleeWeaponLevel: 70, meleeWeaponRefine: 3 })
            )
            await confirmImport()
            await page.waitForFunction(
                ({ MAIN_KEY }) => {
                    try {
                        const assist = JSON.parse(localStorage.getItem(MAIN_KEY))?.assist1
                        return assist?.charLevel === 53 && assist?.baseName === "战术节能"
                    } catch {
                        return false
                    }
                },
                { MAIN_KEY },
                { timeout: 15000 }
            )
            console.log("   场景 B 通过：JSON 导入")

            // 场景 C：分享页签渲染（不断言网络结果：列表/空/失败任一出现即过）
            await openImportDialog()
            await page.click('[data-assist-import-tab="share"]')
            const shareOutcome = await page
                .waitForFunction(
                    () =>
                        document.querySelectorAll("[data-assist-import-choice]").length > 0 ||
                        /暂无|失败|failed|none|なし|없습니다/i.test(
                            document.querySelector("[data-assist-import-dialog]")?.textContent ?? ""
                        ),
                    undefined,
                    { timeout: 30000 }
                )
                .then(() => "settled")
                .catch(() => "timeout")
            console.log(`   场景 C 分享页签: ${shareOutcome}`)
            if (shareOutcome === "timeout") throw new Error("分享页签 30s 内无任何渲染结果")
            await snapshot(ctx, "assist-import-share")
            await page.click("[data-assist-import-close]")
            await page.waitForFunction(() => !document.querySelector("[data-assist-import-dialog]"), undefined, { timeout: 15000 })
            await expectNoConsoleErrors(ctx)

            // 场景 D：空武器时按来源推荐填入 team1Weapon
            await page.evaluate(
                ({ MAIN_KEY, ASSIST_KEY, MELEE_WEAPON }) => {
                    const main = JSON.parse(localStorage.getItem(MAIN_KEY))
                    main.team1Weapon = "-"
                    localStorage.setItem(MAIN_KEY, JSON.stringify(main))
                    localStorage.setItem(
                        ASSIST_KEY,
                        JSON.stringify({
                            charLevel: 45,
                            baseName: "涡旋电场",
                            meleeWeapon: MELEE_WEAPON,
                            rangedWeapon: 0,
                            meleeWeaponLevel: 70,
                        })
                    )
                },
                { MAIN_KEY, ASSIST_KEY, MELEE_WEAPON }
            )
            await ctx.goto(`/char/${MAIN_CHAR}`, { timeout: 60000 })
            await page.waitForSelector('[data-agent="damage-result"] .font-orbitron', { state: "visible", timeout: 30000 })
            await openImportDialog()
            await confirmImport()
            await page.waitForFunction(
                ({ MAIN_KEY, MELEE_WEAPON }) => {
                    try {
                        const main = JSON.parse(localStorage.getItem(MAIN_KEY))
                        return main?.team1Weapon === MELEE_WEAPON && main?.assist1?.charLevel === 45
                    } catch {
                        return false
                    }
                },
                { MAIN_KEY, MELEE_WEAPON },
                { timeout: 15000 }
            )
            console.log("   场景 D 通过：空武器自动填入")
            await expectNoConsoleErrors(ctx)
        } finally {
            await restore()
        }
    })
}
