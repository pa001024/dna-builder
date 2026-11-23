import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buffTypes, seasons } from "../packages/data/d/dnaseason.data"
import { baseNames, generateGroups, uniqueEquips } from "../packages/data/d/dnaseasonequip.data"
import { stages, talents } from "../packages/data/d/dnaseasonprogress.data"
import { challenges } from "../packages/data/d/dnaseasonrift.data"
import { collectDnaSeasonImageUrls, compileFilter, matchesFilter } from "./webp-import-lib"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const publicImgsDir = path.join(rootDir, "apps", "web", "public", "imgs")

const urls = collectDnaSeasonImageUrls({
    seasons,
    buffTypes,
    baseNames,
    uniqueEquips,
    generateGroups,
    stages,
    talents,
    challenges,
})

/**
 * 读取 `package.json` 中 `wi:dnaseason` 实际使用的过滤器文本。
 * 直接校验脚本而非测试内复制的正则，避免两者漂移。
 * @returns 过滤器文本
 */
function readDnaSeasonFilter(): string {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")) as { scripts?: Record<string, string> }
    const match = /--filter\s+"([^"]+)"/.exec(pkg.scripts?.["wi:dnaseason"] ?? "")
    if (!match) {
        throw new Error("package.json 的 wi:dnaseason 未定义 --filter")
    }
    return match[1]
}

describe("DNASeason 图片枚举完整性", () => {
    it("四张表产生了图片引用且没有异常插值", () => {
        expect(urls.length).toBeGreaterThan(0)
        expect(urls.some(url => url.includes("undefined") || url.includes("[object"))).toBe(false)
    })

    it("每个枚举出的 URL 都能落到 public/imgs 的实际文件", () => {
        const missing = urls.filter(url => !fs.existsSync(path.join(publicImgsDir, url.slice("/imgs/".length))))

        expect(missing, `缺少图片:\n${missing.join("\n")}`).toEqual([])
    })

    it("wi:dnaseason 覆盖全部赛季 / 天赋专属图标", () => {
        const filter = readDnaSeasonFilter()
        const { regex, error } = compileFilter(filter)
        const seasonSpecific = urls.filter(url => url.includes("/T_Season_") || url.includes("/T_Rouge_Talent_"))

        expect(error).toBeNull()
        expect(seasonSpecific.length).toBeGreaterThan(0)
        const unmatched = seasonSpecific.filter(url => !matchesFilter(regex, url.slice("/imgs/".length)))
        expect(unmatched, `过滤器 ${filter} 未覆盖:\n${unmatched.join("\n")}`).toEqual([])
    })

    it("wi:dnaseason 覆盖整套装备改造页签图标（5 张全部命中且文件存在）", () => {
        const { regex, error } = compileFilter(readDnaSeasonFilter())
        expect(error).toBeNull()

        const names = ["Sell", "Punch", "FinalForge", "Enchant", "Temper"]
        for (const name of names) {
            const target = `webp/T_Tab_Season_Craft_${name}.webp`
            expect(matchesFilter(regex, target), `${target} 未命中 wi:dnaseason`).toBe(true)
            expect(fs.existsSync(path.join(publicImgsDir, target)), `${target} 未入库`).toBe(true)
        }
    })

    it("过滤器未覆盖的仅限通用资源图标（断流结晶 / 古币），由全量 pnpm wi 负责", () => {
        const { regex } = compileFilter(readDnaSeasonFilter())
        const uncovered = urls.filter(url => !matchesFilter(regex, url.slice("/imgs/".length)))
        const generic = uncovered.filter(url => /\/T_(BreakRes|Coin)_/.test(url))

        expect(uncovered, `出现未知的未覆盖类别:\n${uncovered.join("\n")}`).toEqual(generic)
    })
})
