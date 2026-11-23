import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { CUSTOM_BUFF_PROPERTIES } from "@/utils/customBuffProperties"
import { weaponMap } from "../d"
import { affixes } from "../d/dnaseasonequip.data"
import { TRANSCEND_BUFFS } from "../transcendBuffs"

/**
 * 词条语义约束（U43）：手写建模、上游词缀、自定义 BUFF 调色板都不得出现游戏里不存在的组合。
 *
 * 官方口径（RESEARCH-AFFIX-SEM.md）：下落/普攻/滑行是近战武器技能字段的 tag，远程字段只有
 * `远程/武器`、`爆炸`、`Ray`、`Shotgun*`；多重/装填/弹匣/弹药是远程武器专属。
 */

/** 调色板消费方：组件必须继续使用导出的常量，避免测试导入与组件实现脱钩 */
const PALETTE_CONSUMER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/web/src/components/CustomBuffEditor.vue")

/** 读取调色板属性列表（`apps/web/src/utils/customBuffProperties.ts` 的导出常量，避免源码文本解析漂移） */
function readPalette(): string[] {
    return [...CUSTOM_BUFF_PROPERTIES]
}

/** 非法组合：远程 × 近战攻击细分 */
const ILLEGAL_REMOTE_ATTACK_TYPE = /远程.*?(普攻|下落|滑行)/
/** 非法组合：近战 × 远程弹药/射击物理 */
const ILLEGAL_MELEE_AMMO = /近战.*?(多重|装填|弹匣|弹药)/

/** 调色板额外禁用：远程蓄力在语义上成立，但远程伤害字段没有攻击类型 tag，引擎永远不会读取 */
const DEAD_REMOTE_CHARGED = /远程.*?蓄力/

/** 旧手写建模死键：不得再出现在任何建模 / 词缀 / 调色板数据中 */
const REMOVED_NAMES = ["近战下落增伤", "远程下落增伤", "远程普攻独立增伤"]

function findViolations(names: string[], patterns: RegExp[]): string[] {
    return names.filter(name => patterns.some(pattern => pattern.test(name)))
}

describe("词条语义约束（U43）", () => {
    const palette = readPalette()
    const handwrittenAttrs = TRANSCEND_BUFFS.flatMap(buff => Object.keys(buff.attr ?? {}).map(key => key.replace(/^@/, "")))
    const affixNames = [...new Set(affixes.flatMap(affix => (affix.addAttrs ?? []).map(attr => attr.attr)))]

    it("调色板可解析且精确锁定 178 项", () => {
        // 203 - 36（18 远程攻击细分 + 12 近战弹药 + 6 远程蓄力死路径）；U44 起含 赛季增伤，U14b 起含六元素增伤；
        // U72 起追伤聚合「追加伤害」改为只读、可写项换成七分量（-1 + 7）；
        // U101c 删除「异常数量」可写项（-1）
        expect(palette).toHaveLength(178)
        expect(palette).toContain("近战下落增伤")
        expect(palette).toContain("远程多重")
    })

    it("CustomBuffEditor 仍消费导出的调色板常量（源码守卫）", () => {
        const source = readFileSync(PALETTE_CONSUMER, "utf8")

        expect(source).toContain("import { CUSTOM_BUFF_PROPERTIES }")
        expect(source).toContain('v-for="prop in CUSTOM_BUFF_PROPERTIES"')
    })

    it("近战蓄力 6 项仍在（未被误删）", () => {
        for (const key of [
            "普通近战蓄力增伤",
            "普通近战蓄力独立增伤",
            "近战蓄力增伤",
            "近战蓄力独立增伤",
            "同律近战蓄力增伤",
            "同律近战蓄力独立增伤",
        ]) {
            expect(palette, key).toContain(key)
        }
    })

    it("手写建模 attr 不含 远程×(普攻|下落|滑行) 与 近战×(多重|装填|弹匣|弹药)", () => {
        expect(findViolations(handwrittenAttrs, [ILLEGAL_REMOTE_ATTACK_TYPE, ILLEGAL_MELEE_AMMO])).toEqual([])
    })

    it("上游词缀 addAttrs 不含非法组合", () => {
        expect(affixNames.length).toBeGreaterThan(0)
        expect(findViolations(affixNames, [ILLEGAL_REMOTE_ATTACK_TYPE, ILLEGAL_MELEE_AMMO])).toEqual([])
    })

    it("调色板不含 远程×(普攻|下落|滑行|蓄力) 与 近战×(多重|装填|弹匣|弹药)", () => {
        expect(findViolations(palette, [ILLEGAL_REMOTE_ATTACK_TYPE, ILLEGAL_MELEE_AMMO, DEAD_REMOTE_CHARGED])).toEqual([])
    })

    it("上游数据自证：远程武器字段没有攻击类型 tag，近战武器字段没有弹药类 tag", () => {
        const rangedTags = new Set<string>()
        const meleeTags = new Set<string>()
        const ammoKeys = ["多重", "装填", "弹匣", "弹药"]
        const attackTypeTags = ["普攻", "普通攻击", "蓄力攻击", "下落攻击", "滑行攻击"]
        let meleeAmmoFields = 0
        let rangedAttackTypeFields = 0

        for (const weapon of weaponMap.values()) {
            const isRanged = weapon.类型?.includes("远程") === true
            for (const skill of weapon.技能 ?? []) {
                for (const field of skill.字段 ?? []) {
                    for (const tag of field.tag ?? []) {
                        if (isRanged) rangedTags.add(tag)
                        else meleeTags.add(tag)
                    }
                    if (isRanged && (field.tag ?? []).some(tag => attackTypeTags.includes(tag))) rangedAttackTypeFields += 1
                    if (!isRanged && ammoKeys.some(key => field.名称.includes(key))) meleeAmmoFields += 1
                }
            }
        }

        expect(rangedTags.size).toBeGreaterThan(0)
        expect(meleeTags.size).toBeGreaterThan(0)
        expect([...rangedTags].filter(tag => attackTypeTags.includes(tag))).toEqual([])
        expect(rangedAttackTypeFields).toBe(0)
        expect(meleeAmmoFields).toBe(0)
    })

    it("旧手写死键不再出现在建模与词缀数据中", () => {
        expect(handwrittenAttrs.filter(name => REMOVED_NAMES.includes(name))).toEqual([])
        expect(affixNames.filter(name => REMOVED_NAMES.includes(name))).toEqual([])
        // 调色板里的「近战下落增伤」是引擎合法的带前缀键（近战 + 官方裸键下落增伤），不在此列；
        // 远程两个死键由上面的组合规则覆盖。
        expect(palette.filter(name => REMOVED_NAMES.includes(name) && /远程/.test(name))).toEqual([])
    })
})
