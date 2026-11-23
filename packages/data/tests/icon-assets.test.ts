import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { collectDnaSeasonImageUrls } from "../../../tools/webp-import-lib"
import { charAccessoryData, hairData, skinData, weaponAccessoryData, weaponSkinData } from "../d/accessory.data"
import charData from "../d/char.data"
import { buffTypes, seasons } from "../d/dnaseason.data"
import { baseNames, generateGroups, uniqueEquips } from "../d/dnaseasonequip.data"
import { stages, talents } from "../d/dnaseasonprogress.data"
import { challenges } from "../d/dnaseasonrift.data"
import { resourceData } from "../d/resource.data"
import { LeveledChar } from "../leveled/LeveledChar"
import { LeveledSkill } from "../leveled/LeveledSkill"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const publicImgsDir = path.join(rootDir, "apps", "web", "public", "imgs")

/**
 * 允许缺失的图标：每条都必须写明「为什么不能补」。
 *
 * Bixiao（碧霄吟）武器皮肤在数据里有 12 种武器类型，官方导出与 pak 只存在 9 种
 * （Bow/Cannon/Claymore/Katana/Machinegun/Pistol/Polearm/Shotgun/Swordwhip）；
 * 缺失的 Sword/Dualblade/Crossbow 在导出目录与 pak 中均 0 命中。9 张现存的 Bixiao
 * 头像互不相同（MD5 各异，23–35KB），说明每种武器类型都是独立立绘，不能跨武器别名。
 */
const ALLOWED_MISSING: Record<string, string> = {
    "/imgs/webp/T_Head_Sword_Bixiao.webp": "官方导出/pak 无单手剑碧霄吟头像；其余 9 种武器贴图互不相同，不能跨武器别名",
    "/imgs/webp/T_Head_Dualblade_Bixiao.webp": "官方导出/pak 无双刃碧霄吟头像；其余 9 种武器贴图互不相同，不能跨武器别名",
    "/imgs/webp/T_Head_Crossbow_Bixiao.webp": "官方导出/pak 无双枪碧霄吟头像；其余 9 种武器贴图互不相同，不能跨武器别名",
    "/imgs/webp/T_Head_Lilikou.webp": "角色莉莉可尚未实装，导出目录与 pak 均无头像贴图",
    "/imgs/res/T_Phantom_Lilikou.webp": "莉莉可尚未实装，导出目录与 pak 均无该幻影贴图",
    "/imgs/res/T_CharPiece_Lilikou.webp": "莉莉可尚未实装，导出目录与 pak 均无该角色碎片贴图",
    "/imgs/res/T_Resource_Gesture_Liuli.webp": "琉璃动作资源未导出，pak 内无同名贴图",
    "/imgs/res/T_Guide_ChapterItem_003.webp":
        "待补图：上游 Resource.json 给镇痛剂(3000019)的 T_Guide_ChapterItem_003 无对应贴图；本地仅有 4 位编号 00xx 系列，正确映射无法确证，不猜测",
}

/** 数据侧 URL 拼装口径：与 webp-import 的数据评估、以及各页面视图保持一致 */
const DATA_URL_RULES = {
    /** 角色头像：数据里是短名，LeveledChar 补 T_Head_ 前缀 */
    char: (icon: string) => LeveledChar.url(icon),
    /** 角色技能 / 子技能 / 同律武器技能：数据里是短名，LeveledSkill 补 T_Skill_ 前缀 */
    skill: (icon: string) => LeveledSkill.url(icon),
    /** 资源 / 深境罗盘：icon 已是完整 T_ 贴图名，统一走 /imgs/res */
    resource: (icon: string) => `/imgs/res/${icon}.webp`,
    /** 饰品：T_Head_ 开头走 /imgs/webp，其余立绘走 /imgs/fashion */
    accessory: (icon: string) => (icon.startsWith("T_Head_") ? `/imgs/webp/${icon}.webp` : `/imgs/fashion/${icon}.webp`),
} as const

/** 递归收集技能子树里的全部 icon（含 子技能 等嵌套容器） */
function collectIconValues(value: unknown, out: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectIconValues(item, out)
        }
        return
    }
    if (!value || typeof value !== "object") {
        return
    }
    const record = value as Record<string, unknown>
    for (const [key, child] of Object.entries(record)) {
        if (key === "icon" && typeof child === "string" && child) {
            out.add(child)
        } else {
            collectIconValues(child, out)
        }
    }
}

/** 枚举数据层真实引用的图标 URL（与运行时视图同一套拼装规则） */
function collectDataIconUrls(): Set<string> {
    const urls = new Set<string>()
    const skillIcons = new Set<string>()
    for (const char of charData) {
        for (const skill of char.技能 ?? []) {
            collectIconValues(skill, skillIcons)
        }
        for (const skillWeapon of char.同律武器 ?? []) {
            for (const skill of skillWeapon.技能 ?? []) {
                collectIconValues(skill, skillIcons)
            }
        }
    }
    for (const char of charData) {
        if (char.icon) {
            urls.add(DATA_URL_RULES.char(char.icon))
        }
    }
    for (const icon of skillIcons) {
        urls.add(DATA_URL_RULES.skill(icon))
    }
    for (const resource of resourceData) {
        if (resource.icon) {
            urls.add(DATA_URL_RULES.resource(resource.icon))
        }
    }
    for (const accessory of [...charAccessoryData, ...weaponAccessoryData, ...weaponSkinData, ...hairData, ...skinData]) {
        if (accessory.icon) {
            urls.add(DATA_URL_RULES.accessory(accessory.icon))
        }
    }
    for (const url of collectDnaSeasonImageUrls({
        seasons,
        buffTypes,
        baseNames,
        uniqueEquips,
        generateGroups,
        stages,
        talents,
        challenges,
    })) {
        urls.add(url)
    }
    return urls
}

/** `/imgs/...` → public/imgs 下的实际文件路径 */
function fileOf(url: string): string {
    return path.join(publicImgsDir, url.slice("/imgs/".length))
}

describe("数据图标资源回归", () => {
    it("命名漂移已修正并落到实际文件", () => {
        const subSkill = charData
            .find(char => char.技能.some(skill => skill.id === 510101))
            ?.技能.find(skill => skill.id === 510101)
            ?.子技能?.find(skill => skill.id === 510111)
        expect(subSkill?.icon).toBe("Songlu01_2")
        expect(fs.existsSync(fileOf(LeveledSkill.url(subSkill?.icon))), "T_Skill_Songlu01_2.webp 未入库").toBe(true)

        const cases = [
            { id: 6100115, icon: "T_Head_JT_Jingjie" },
            { id: 6100124, icon: "T_Head_JT_Tiequan" },
        ]
        for (const item of cases) {
            const resource = resourceData.find(entry => entry.id === item.id)
            expect(resource?.icon, `资源 ${item.id} 的 icon 应为 ${item.icon}`).toBe(item.icon)
            const url = DATA_URL_RULES.resource(item.icon)
            expect(fs.existsSync(fileOf(url)), `${url} 未入库`).toBe(true)
        }
    })

    it("数据引用的图标 URL 要么有文件，要么命中带理由的 allowlist", () => {
        const urls = collectDataIconUrls()
        const missing = [...urls].filter(url => !fs.existsSync(fileOf(url))).sort()
        const unexpected = missing.filter(url => !(url in ALLOWED_MISSING))

        expect(unexpected, `出现未登记缺口:\n${unexpected.join("\n")}`).toEqual([])
        // allowlist 与真实缺口严格相等：补上资源后必须同步删条目，避免清单腐化
        expect(missing, "allowlist 与真实缺口不一致").toEqual(Object.keys(ALLOWED_MISSING).sort())
    })
})
