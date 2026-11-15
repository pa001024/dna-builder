import { mkdirSync } from "node:fs"
import { test } from "@playwright/test"

/**
 * 皮肤卡通渲染的固定机位基准图（P4 标定 / R1 视觉基准）。
 *
 * 只有显式设置 `TOON_BASELINE=1` 才会跑：它不是一个断言型用例，而是「生成基准图」的工具，
 * 默认跳过，避免 `test:e2e` 顺带产出二进制文件。浏览器默认用系统 Edge
 * （很多机器没有装 Chrome），可用 `TOON_BROWSER` 覆盖。
 *
 *   TOON_BASELINE=1 pnpm --filter dna-builder test:e2e tests/e2e/skin-toon-baseline.spec.ts
 */
const outDir = process.env.TOON_OUT_DIR ?? ".tmp/skin-toon-baseline"
const channel = (process.env.TOON_BROWSER ?? "msedge") as "chrome" | "msedge" | "chromium"
const width = Number(process.env.TOON_WIDTH ?? 512)
const height = Number(process.env.TOON_HEIGHT ?? 768)
/**
 * 可选染色码（`C...` 开头）：填了就按该方案染色，否则用材质自带配色。
 * 与参考图对比时必须带上参考图那套方案，否则比的是两件衣服。
 */
const dyeCode = process.env.TOON_DYE_CODE

/** 四类代表皮肤：参考图皮肤（含公告板帽子）/ 丝袜 / 羽翼 BodyDN / 薄纱 SilkTran */
const skins: [number, string][] = [
    [180101, "feina-subuyu"],
    [18010010, "feina-winter"],
    [110201, "wing-bodydn"],
    [18010011, "gauze-silktran"],
]
const angles: [string, number][] = [
    ["front", 0],
    ["quarter", 35],
    ["side", 90],
    ["back", 180],
]

test.skip(!process.env.TOON_BASELINE, "设置 TOON_BASELINE=1 才生成卡通渲染基准图")
// 只产出图片：录像/轨迹会要求 ffmpeg 与额外磁盘，这台机器都没装
test.use({ channel, viewport: { width, height }, video: "off", trace: "off" })

test("卡通渲染基准图：4 类皮肤 × 4 机位", async ({ page }) => {
    mkdirSync(outDir, { recursive: true })
    await page.goto("/?hideUpdateInfo=1", { waitUntil: "domcontentloaded" })
    await page.evaluate(
        ({ width, height }) => {
            document.body.innerHTML = ""
            document.body.style.margin = "0"
            document.body.style.background = "#101014"
            const host = document.createElement("div")
            host.id = "toon-host"
            host.style.width = `${width}px`
            host.style.height = `${height}px`
            document.body.append(host)
        },
        { width, height }
    )

    for (const [skinId, label] of skins) {
        for (const [angleLabel, degrees] of angles) {
            await page.evaluate(
                async ({ id, degrees, dyeCode }: { id: number; degrees: number; dyeCode?: string }) => {
                    const runtime = await import("/src/utils/skin-model-runtime.ts")
                    const mod = await import("/src/utils/skin-model-renderer.ts")
                    const w = window as any
                    const host = document.getElementById("toon-host") as HTMLElement
                    host.innerHTML = ""
                    w.__toon?.viewer?.dispose?.()
                    const url = await runtime.downloadModel(id)
                    const viewer = new mod.SkinModelRenderer(host)
                    w.__toon = { viewer }
                    await viewer.load(url)
                    const ids = dyeCode ? (await import("/src/utils/skin-colorize.ts")).decodeSkinColorizeCode(dyeCode).colorIds : []
                    viewer.setColors(ids, [])
                    // 停动画并固定到首帧：否则每次截图姿态不同，基准图无法比对
                    if (viewer.mixer) {
                        viewer.mixer.setTime(0)
                        viewer.mixer.stopAllAction()
                    }
                    viewer.playing = false
                    if (viewer.request) {
                        cancelAnimationFrame(viewer.request)
                        viewer.request = 0
                    }
                    // 直接用渲染器的默认构图：默认距离已按包围盒收紧（角色约占画布高度 90%），
                    // 再乘系数会裁掉头顶/脚。
                    const distance = viewer.distance
                    const radians = (degrees * Math.PI) / 180
                    viewer.camera.position.set(
                        viewer.center.x + Math.sin(radians) * distance,
                        viewer.center.y,
                        viewer.center.z + Math.cos(radians) * distance
                    )
                    viewer.controls.target.copy(viewer.center)
                    viewer.controls.update()
                    viewer.render()
                },
                { id: skinId, degrees, dyeCode }
            )
            await page.waitForTimeout(400)
            await page.locator("canvas").screenshot({ path: `${outDir}/${label}-${angleLabel}.png` })
            console.log(`  ${outDir}/${label}-${angleLabel}.png`)
        }
    }
})
