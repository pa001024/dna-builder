import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { formatSkillLevelBonus, isAttrValueVisible } from "@/data"

/** 读取组件源码（相对本测试文件） */
function componentSource(relative: string): string {
    return readFileSync(new URL(relative, import.meta.url), "utf8")
}

const LEVEL_KEYS = ["E技能等级", "Q技能等级", "P技能等级"]

describe("U99b 技能等级加成属性展示", () => {
    it("格式化行为：正值 +N、负值 -N、0 为 +0 且面板隐藏", () => {
        expect(formatSkillLevelBonus(8)).toBe("+8")
        expect(formatSkillLevelBonus(-3)).toBe("-3")
        expect(formatSkillLevelBonus(0)).toBe("+0")
        expect(isAttrValueVisible(8)).toBe(true)
        expect(isAttrValueVisible(-3)).toBe(true)
        expect(isAttrValueVisible(0)).toBe(false)
        expect(isAttrValueVisible(Number.NaN)).toBe(false)
        expect(isAttrValueVisible(undefined)).toBe(false)
    })

    for (const [name, path] of [
        ["CharAttrShow.vue", "../../components/CharAttrShow.vue"],
        ["TranscendAttrPanel.vue", "../../components/transcend-build/TranscendAttrPanel.vue"],
    ] as const) {
        it(`${name}：三键走共享格式化且先于百分比兜底，0 值走统一可见性过滤`, () => {
            const source = componentSource(path)
            const levelIndex = source.indexOf('SKILL_LEVEL_ATTR_KEYS = new Set(["E技能等级", "Q技能等级", "P技能等级"])')
            expect(levelIndex, "缺少等级键集合").toBeGreaterThan(-1)
            const branch = source.indexOf(
                '<template v-else-if="SKILL_LEVEL_ATTR_KEYS.has(key)">{{ formatDynamicSource(key, val) }}</template>'
            )
            const percent = source.indexOf("+(val * 100).toFixed(2)")
            expect(branch, "缺少 +N 展示分支").toBeGreaterThan(-1)
            expect(branch, "等级分支必须先于百分比兜底").toBeLessThan(percent)
            // 三键分支调用共享格式化（行为由上方用例覆盖），不是本地手写百分比 / Lv.
            expect(source).toContain("if (SKILL_LEVEL_ATTR_KEYS.has(key)) {\n        return formatSkillLevelBonus(value)")
            expect(source).toContain("isAttrValueVisible(v)")
        })
    }

    it("EquipmentPreview.vue：角色属性卡片走共享格式化并隐藏 0 值", () => {
        const source = componentSource("../../components/EquipmentPreview.vue")
        expect(source).toContain('const SKILL_LEVEL_ATTR_KEYS = new Set(["E技能等级", "Q技能等级", "P技能等级"])')
        const formatLine = source.split("\n").find(line => line.includes("SKILL_LEVEL_ATTR_KEYS.has(key)) return"))
        expect(formatLine, "缺少等级键格式化分支").toBeDefined()
        expect(formatLine).toContain("formatSkillLevelBonus(value)")
        expect(source).toContain("isAttrValueVisible(v)")
        expect(source).toContain("{{ formatCharAttrValue(key, val) }}")
    })

    it("六语言翻译齐全（属性名即根键，E/Q/P → 官方技能等级规范名）", () => {
        const expected: Record<string, string[]> = {
            en: ["Combat Skill Level", "Ultimate Skill Level", "Passive Skill Level"],
            ja: ["バトルスキルLv.", "必殺技スキルLv.", "パッシブスキルLv."],
            ko: ["전투 스킬 레벨", "궁극기 레벨", "패시브 스킬 레벨"],
            fr: ["Niveau de compétence de combat", "Niveau de compétence ultime", "Niveau de compétence passive"],
            "zh-CN": ["战技技能等级", "终结技技能等级", "被动技能等级"],
            "zh-TW": ["戰技技能等級", "終結技技能等級", "被動技能等級"],
        }
        for (const [locale, values] of Object.entries(expected)) {
            const file = new URL(`../../../public/i18n/${locale}/translation.json`, import.meta.url)
            const translations = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
            LEVEL_KEYS.forEach((key, index) => {
                expect(translations[key], `${locale} ${key}`).toBe(values[index])
            })
        }
    })
})
