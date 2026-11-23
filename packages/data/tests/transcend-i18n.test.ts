import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { getAffixSummaryParts, getCoverageTokenKey } from "@/utils/transcendence-gear"
import { SUPPLEMENTAL_TRANSLATIONS } from "../../../tools/import-i18n-data"
import { type DnaSeasonAffix, affixes as dnaseasonAffixes, crafts as dnaseasonCrafts } from "../d/dnaseasonequip.data"
import { translationsEn, translationsFr, translationsJa, translationsKo, translationsTc } from "../d/translations.data"
import { TRANSCEND_BUFFS, UNIQUE_AFFIX_MAP } from "../transcendBuffs"

/** 数据包承载的 5 门语言（zh-CN 是 fallbackLng，键与值同形，不进对照表） */
const PACK_TABLES = { tc: translationsTc, en: translationsEn, jp: translationsJa, kr: translationsKo, fr: translationsFr } as const
type PackLocale = keyof typeof PACK_TABLES

const LOCALES = Object.keys(PACK_TABLES) as PackLocale[]

/** 数据包语言 → public/i18n 语言目录 */
const PACK_LOCALE_TO_UI: Record<PackLocale, string> = { tc: "zh-TW", en: "en", jp: "ja", kr: "ko", fr: "fr" }

/**
 * 全部手写词缀规范名 → 5 门语言的精确译文（回归锁；改数据时必须同步本表）。
 *
 * 2001 使用引擎裸键 `下落独立增伤`、2009 使用 `近战独立增伤` / `远程独立增伤`：三条都是本地构词、
 * 数据包无对照，译文由界面文案表承担（见 `UI_COINED_ATTR_NAMES`）。
 * U95 的元素弱点七键同理走界面文案表（官方短语「受到X属性伤害提升」）；2008 已从 `火属性增伤` 迁出。
 * 2002 的「近战普攻独立增伤」按 `RLBlessing_SimpleDesc_103`「近战武器普通攻击伤害提高。」
 * 与既有「独立增伤」条目组合——远程半边在游戏里不存在，已从数据表删除。
 */
const EXPECTED_ATTR_NAMES: Record<string, Record<PackLocale, string>> = {
    增伤: {
        tc: "造成的傷害",
        en: "Damage Dealt",
        jp: "与ダメージ",
        kr: "입힌 대미지",
        fr: "Dégâts infligés",
    },
    属性穿透: {
        tc: "全屬性穿透",
        en: "PEN Stats",
        jp: "全属性貫通",
        kr: "모든 속성 관통",
        fr: "Pénétration de tous les attributs",
    },
    技能伤害: {
        tc: "造成技能傷害",
        en: "Skill DMG Dealt",
        jp: "スキルダメージを与える",
        kr: "입히는 스킬 대미지",
        fr: "Dégâts de compétence infligés",
    },
    技能无视防御: {
        tc: "技能無視防禦",
        en: "Skill Ignore Defense",
        jp: "スキル防御無視",
        kr: "스킬 방어 무시",
        fr: "Ignore la défense (compétence)",
    },
    无视防御: {
        tc: "無視防禦",
        en: "Ignore defense",
        jp: "防御無視",
        kr: "방어 무시",
        fr: "Ignore la défense",
    },
    技能独立增伤: {
        tc: "技能獨立增傷",
        en: "Independent Skill damage increase",
        jp: "スキル独立ダメージ増加",
        kr: "스킬 독립 피해 증가",
        fr: "Augmentation de dégâts indépendants de compétence",
    },
    技能速度: {
        tc: "技能速度",
        en: "Skill SPD",
        jp: "スキル速度",
        kr: "스킬 속도",
        fr: "Vitesse de compétence",
    },
    昂扬: {
        tc: "昂揚",
        en: "Morale",
        jp: "高揚",
        kr: "격양",
        fr: "Vigueur",
    },
    武器伤害: {
        tc: "武器傷害",
        en: "Weapon DMG",
        jp: "武器ダメージ",
        kr: "무기 대미지",
        fr: "DGT d’arme",
    },
    独立增伤: {
        tc: "獨立增傷",
        en: "Independent damage increase",
        jp: "独立ダメージ増加",
        kr: "독립 피해 증가",
        fr: "Augmentation de dégâts indépendante",
    },
    移动速度: {
        tc: "移動速度",
        en: "Movement Speed",
        jp: "移動速度",
        kr: "이동 속도",
        fr: "Vitesse de déplacement",
    },
    近战普攻独立增伤: {
        tc: "近戰武器普通攻擊獨立增傷",
        en: "Independent Melee Weapon Normal Attack damage increase",
        jp: "近接武器通常攻撃独立ダメージ増加",
        kr: "근접 무기 기본 공격 독립 피해 증가",
        fr: "Augmentation de dégâts indépendants des attaques normales des armes de mêlée",
    },
    水属性追伤: {
        tc: "水屬性追加傷害",
        en: "Hydro Additional DMG",
        jp: "水属性追加ダメージ",
        kr: "물 속성 추가 대미지",
        fr: "Dégâts Hydro supplémentaires",
    },
    火属性追伤: {
        tc: "火屬性追加傷害",
        en: "Pyro Additional DMG",
        jp: "火属性追加ダメージ",
        kr: "불 속성 추가 대미지",
        fr: "Dégâts Pyro supplémentaires",
    },
    雷属性追伤: {
        tc: "雷屬性追加傷害",
        en: "Electro Additional DMG",
        jp: "雷属性追加ダメージ",
        kr: "번개 속성 추가 대미지",
        fr: "Dégâts Électro supplémentaires",
    },
    风属性追伤: {
        tc: "風屬性追加傷害",
        en: "Anemo Additional DMG",
        jp: "風属性追加ダメージ",
        kr: "바람 속성 추가 대미지",
        fr: "Dégâts Anémo supplémentaires",
    },
    暗属性追伤: {
        tc: "暗屬性追加傷害",
        en: "Umbro Additional DMG",
        jp: "闇属性追加ダメージ",
        kr: "어둠 속성 추가 대미지",
        fr: "Dégâts Umbro supplémentaires",
    },
    光属性追伤: {
        tc: "光屬性追加傷害",
        en: "Lumino Additional DMG",
        jp: "光属性追加ダメージ",
        kr: "빛 속성 추가 대미지",
        fr: "Dégâts Lumino supplémentaires",
    },
    自属性追伤: {
        tc: "自屬性追加傷害",
        en: "Own-Element Additional DMG",
        jp: "自属性追加ダメージ",
        kr: "자신 속성 추가 대미지",
        fr: "Dégâts supplémentaires de son propre élément",
    },
}

/**
 * 引擎组合键（`<攻击类型>独立增伤` / `<武器类型>独立增伤`）的界面译名：
 * 上游 AttrConfig 没有这些键，数据包对照表不收录，展示走 `public/i18n/*` 顶层键。
 */
const UI_COINED_ATTR_NAMES: Record<string, Record<string, string>> = {
    下落独立增伤: {
        "zh-CN": "下落独立增伤",
        "zh-TW": "下落攻擊獨立增傷",
        en: "Plunge independent damage increase",
        ja: "落下攻撃独立ダメージ増加",
        ko: "낙하 공격 독립 피해 증가",
        fr: "Augmentation de dégâts indépendante des attaques plongeantes",
    },
    近战独立增伤: {
        "zh-CN": "近战独立增伤",
        "zh-TW": "近戰獨立增傷",
        en: "Melee Weapon Independent DMG",
        ja: "近接武器独立ダメージ増加",
        ko: "근접 무기 독립 피해 증가",
        fr: "DGT indépendants des armes de mêlée",
    },
    远程独立增伤: {
        "zh-CN": "远程独立增伤",
        "zh-TW": "遠程獨立增傷",
        en: "Ranged Weapon Independent DMG",
        ja: "遠隔武器独立ダメージ増加",
        ko: "원거리 무기 독립 피해 증가",
        fr: "DGT indépendants des armes à distance",
    },
    // 元素弱点七键（U95）：本地按键名展示，界面文案用官方「受到X属性伤害提升」短语
    火属性弱点: {
        "zh-CN": "受到火属性伤害提升",
        "zh-TW": "受到火屬性傷害提升",
        en: "Pyro Damage Taken increased",
        ja: "受ける火属性ダメージアップ",
        ko: "받는 불 속성 대미지 상승",
        fr: "Augmentation des Dégâts Pyro subis",
    },
    水属性弱点: {
        "zh-CN": "受到水属性伤害提升",
        "zh-TW": "受到水屬性傷害提升",
        en: "Hydro Damage Taken increased",
        ja: "受ける水属性ダメージアップ",
        ko: "받는 물 속성 대미지 상승",
        fr: "Augmentation des Dégâts Hydro subis",
    },
    雷属性弱点: {
        "zh-CN": "受到雷属性伤害提升",
        "zh-TW": "受到雷屬性傷害提升",
        en: "Electro Damage Taken increased",
        ja: "受ける雷属性ダメージアップ",
        ko: "받는 번개 속성 대미지 상승",
        fr: "Augmentation des Dégâts Électro subis",
    },
    风属性弱点: {
        "zh-CN": "受到风属性伤害提升",
        "zh-TW": "受到風屬性傷害提升",
        en: "Anemo Damage Taken increased",
        ja: "受ける風属性ダメージアップ",
        ko: "받는 바람 속성 대미지 상승",
        fr: "Augmentation des Dégâts Anémo subis",
    },
    光属性弱点: {
        "zh-CN": "受到光属性伤害提升",
        "zh-TW": "受到光屬性傷害提升",
        en: "Lumino Damage Taken increased",
        ja: "受ける光属性ダメージアップ",
        ko: "받는 빛 속성 대미지 상승",
        fr: "Augmentation des Dégâts Lumino subis",
    },
    暗属性弱点: {
        "zh-CN": "受到暗属性伤害提升",
        "zh-TW": "受到暗屬性傷害提升",
        en: "Umbro Damage Taken increased",
        ja: "受ける闇属性ダメージアップ",
        ko: "받는 어둠 속성 대미지 상승",
        fr: "Augmentation des Dégâts Umbro subis",
    },
    全属性弱点: {
        "zh-CN": "受到全属性伤害提升",
        "zh-TW": "受到全屬性傷害提升",
        en: "All Element Damage Taken increased",
        ja: "受ける全属性ダメージアップ",
        ko: "받는 모든 속성 대미지 상승",
        fr: "Augmentation des Dégâts de tous les éléments subis",
    },
}

/**
 * 追伤七分量键（U70b-fix）。`EXPECTED_ATTR_NAMES` 额外收录 `光属性追伤` / `自属性追伤`：
 * 两者当前没有手写 buff 引用，但被武器 / MOD / BUFF 数据与覆盖 token 使用，必须独立定值锁。
 */
const CHASE_ATTR_KEYS = ["火属性追伤", "水属性追伤", "雷属性追伤", "风属性追伤", "光属性追伤", "暗属性追伤", "自属性追伤"] as const

/** 数据包对照表查询：只验证真实解析链路，缺键即失败（U70b 后不再有手写回落） */
function packText(locale: PackLocale, name: string): string | undefined {
    return PACK_TABLES[locale][name]
}

/** 仍然保留的复合名（2002 的「近战·普攻独立增伤」；其余远程/下落复合名已按官方口径删除） */
const KEPT_COMPOSED_NAMES = ["近战普攻独立增伤"]

/** 已删除的复合名（远程死键 + 被官方裸键取代的近战下落复合名） */
const REMOVED_COMPOSED_NAMES = ["近战下落增伤", "远程下落增伤", "远程普攻独立增伤"]

/** 手写词缀摘要的精确分段 */
const SUMMARY_CASES: Array<[number, string[]]> = [
    [2001, ["下落独立增伤"]],
    [2002, ["近战普攻独立增伤"]],
    [2015, ["昂扬", "技能速度"]],
    [2004, ["独立增伤"]],
    [240102, ["属性穿透"]],
]

/** 手写词缀规范名：`TRANSCEND_BUFFS[].attr` 的键（剥掉 `@` 前缀） */
function handwrittenAttrNames(): string[] {
    const names = new Set<string>()

    for (const buff of TRANSCEND_BUFFS) {
        for (const key of Object.keys(buff.attr ?? {})) {
            names.add(key.replace(/^@/, ""))
        }
    }

    return [...names]
}

/** 是否含中日韩统一表意文字（en/fr 译文不应出现中文回退） */
function hasCJK(text: string): boolean {
    return /[一-鿿]/.test(text)
}

/** 日文译文不应出现的简体专用字（增/伤/击/扬/动/战） */
function hasSimplifiedOnlyChar(text: string): boolean {
    return /[增伤击扬动战]/.test(text)
}

/** public/i18n 根目录 */
const I18N_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/web/public/i18n")
/** 界面文案 6 语言 */
const UI_LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr"] as const

/** 读取某语言的界面翻译资源 */
function readUiTranslation(locale: string): unknown {
    return JSON.parse(readFileSync(path.join(I18N_ROOT, locale, "translation.json"), "utf-8"))
}

/** 按点分键取值 */
function resolveDotKey(root: unknown, key: string): unknown {
    return key.split(".").reduce<unknown>((value, part) => {
        return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[part] : undefined
    }, root)
}

describe("升华打造类型官方文案（DB craft 块）", () => {
    /** 上游 DNASeasonEquip.json 导出的 CN 原文（U34：TextMap 标题 + 机制说明） */
    const EXPECTED_CRAFTS: Record<number, { title: string; desc: string }> = {
        1: { title: "精锻", desc: "精锻会提升物品的词缀数值" },
        2: { title: "精锻", desc: "最终精锻：随机强化一个已有词缀" },
        3: { title: "淬炼", desc: "淬炼可为装备新增一条词缀" },
        4: { title: "附魔", desc: "附魔会用新的词缀替换一条已有的词缀" },
        5: { title: "镶嵌", desc: "可为放入的装备添加镶孔、镶嵌宝石、拆取镶嵌的宝石" },
        6: { title: "镶嵌", desc: "可为放入的装备添加镶孔、镶嵌宝石、拆取镶嵌的宝石" },
        7: { title: "拆取", desc: "可为放入的装备添加镶孔、镶嵌宝石、拆取镶嵌的宝石" },
    }

    it("7 条打造类型逐条带官方标题与说明", () => {
        expect(dnaseasonCrafts.map(craft => craft.id)).toEqual([1, 2, 3, 4, 5, 6, 7])

        for (const craft of dnaseasonCrafts) {
            expect(craft, `craft ${craft.id}`).toMatchObject(EXPECTED_CRAFTS[craft.id])
        }
    })

    it("5 门打包语言均可解析（同形译文按对照表规则回退原文）", () => {
        for (const { title, desc } of Object.values(EXPECTED_CRAFTS)) {
            for (const locale of LOCALES) {
                // 对照表跳过「译文与原文同形」的条目（如繁中「附魔」），此时由 i18next 回落原文
                expect((PACK_TABLES[locale][title] ?? title).trim(), `${locale}:${title}`).toBeTruthy()
                expect((PACK_TABLES[locale][desc] ?? desc).trim(), `${locale}:${desc}`).toBeTruthy()
            }
        }
        // 逐语言抽查：标题取各语言 TextMap 原文，不做统一或再翻译
        expect(PACK_TABLES.en["精锻"]).toBe("Masterworking")
        expect(PACK_TABLES.en["淬炼"]).toBe("Tempering")
        expect(PACK_TABLES.en["附魔"]).toBe("Enchanting")
        expect(PACK_TABLES.en["镶嵌"]).toBe("Socket")
        expect(PACK_TABLES.en["拆取"]).toBe("Remove")
        expect(PACK_TABLES.fr["精锻"]).toBe("Perfectionnement")
        // 上游 CN 同为「镶嵌」，FR 面板标题 Sertissage / 页签 Sertir 两值；对照表以 CN 为键，
        // 后写入的 craft 6（SocketTabInlay）胜出 —— 记录实际解析值，差异见 U34 报告未决项
        expect(PACK_TABLES.fr["镶嵌"]).toBe("Sertir")
        expect(PACK_TABLES.jp["淬炼"]).toBe("焼き入れ")
        expect(PACK_TABLES.kr["附魔"]).toBe("마법 부여")
        expect(PACK_TABLES.tc["精锻"]).toBe("精鍛")
        // 按各语言原文导出，不做统一；1.8.7.1 上游 EN 已去掉 base stats，与 CN 同样只说词缀数值
        expect(PACK_TABLES.en["精锻会提升物品的词缀数值"]).toBe("Masterworking increases an item's affix values")
    })
})

describe("专属词缀 <H> 高亮标签（U37 导出器修复回归）", () => {
    /** U37 修复后恢复标签的 14 条 DescValues 专属词缀 */
    const TAGGED_AFFIX_IDS = [
        110201, 150203, 150401, 180101, 180102, 210101, 240102, 240103, 310201, 310202, 320301, 320302, 420101, 2030301,
    ] as const

    /** 官方 JP TextMap 原文即无标签的 1 条（1.8.7.1 已为 110201 / 180101 / 180102 补上标签；禁止人工回填） */
    const JP_UNTAGGED_AFFIX_IDS: readonly number[] = [420101]

    /**
     * 非 desc 字段快照：与官方 1.8.7.1 导出逐字段一致。
     * 该版本把 14 条带 AddSkillLevel 的专属词条从 1 级改为 10 级，并新增 SkillID 列表（非导出器改写）。
     */
    const FIELD_SNAPSHOTS: Record<number, Omit<DnaSeasonAffix, "desc">> = {
        110201: {
            id: 110201,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [1102],
            addSkillLevel: { skillIds: [110201] },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        150203: {
            id: 150203,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [1502],
            addSkillLevel: { skillIds: [150201] },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        150401: {
            id: 150401,
            plan: 4,
            minValue: 1,
            maxValue: 1,
            totalValueLevel: 1,
            charIds: [1504],
            passiveEffectId: 150411,
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        180101: {
            id: 180101,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [1801],
            addSkillLevel: { skillIds: [180101, 180112] },
            activateSkills: { "180101": 180112 },
            skillReplacements: {
                "180101": { id: 180112, 名称: "“在一个暖和的午后”", 类型: "伤害" },
            },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        180102: {
            id: 180102,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [1801],
            addSkillLevel: { skillIds: [180102, 180123] },
            activateSkills: { "180102": 180123 },
            skillReplacements: {
                "180102": { id: 180123, 名称: "“下午茶开始了！”", 类型: "增益" },
            },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        210101: {
            id: 210101,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [2101],
            addSkillLevel: { skillIds: [210101] },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        240102: {
            id: 240102,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [2401],
            addSkillLevel: { skillIds: [240102] },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        240103: {
            id: 240103,
            plan: 4,
            minValue: 1,
            maxValue: 1,
            totalValueLevel: 1,
            charIds: [2401],
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        310201: {
            id: 310201,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [3102],
            passiveEffectId: 310211,
            addSkillLevel: { skillIds: [310202] },
            skillReplacements: {
                "310201": { id: 310212, 名称: "高温清扫", 类型: "伤害" },
            },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        310202: {
            id: 310202,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [3102],
            passiveEffectId: 310212,
            addSkillLevel: { skillIds: [310203] },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        320301: {
            id: 320301,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [3203],
            addSkillLevel: { skillIds: [320302, 320312] },
            activateSkills: { "320302": 320312 },
            skillReplacements: {
                "320302": { id: 320312, 名称: "猫猫头出击！", 类型: "伤害" },
            },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        320302: {
            id: 320302,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [3203],
            passiveEffectId: 320311,
            addSkillLevel: { skillIds: [320303] },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        420101: {
            id: 420101,
            plan: 4,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            charIds: [4201],
            passiveEffectId: 420111,
            addSkillLevel: { skillIds: [420101] },
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
        2030301: {
            id: 2030301,
            plan: 4,
            minValue: 1,
            maxValue: 1,
            totalValueLevel: 1,
            passiveEffectId: 2030201,
            planName: "专属词缀",
            mappingStatus: "handwritten",
        },
    }

    const affixOf = (id: number): DnaSeasonAffix => {
        const affix = dnaseasonAffixes.find(item => item.id === id)

        if (!affix) {
            throw new Error(`affix ${id} not found`)
        }

        return affix
    }
    const affixDesc = (id: number): string => affixOf(id).desc ?? ""

    /** 去掉 desc 后的字段（逐字段精确比较，字段增删都会失败） */
    function nonDescFields(affix: DnaSeasonAffix): Record<string, unknown> {
        const fields: Record<string, unknown> = { ...affix }
        delete fields.desc
        return fields
    }

    it("110201 CN 原文保留官方 <H> 高亮（芙罗拉 / 第一根源）", () => {
        const desc = affixDesc(110201)

        expect(desc).toContain("<H>芙罗拉</>")
        expect(desc).toContain("<H>第一根源</>")
    })

    it("150201 / 240101 等原有高亮词条不回退", () => {
        expect(affixDesc(150201)).toContain("<H>妮弗尔夫人</>")
        expect(affixDesc(240101)).toContain("<H>扶疏</>")
    })

    it("14 条专属词缀 CN 均含 <H>，非 desc 字段与快照一致", () => {
        expect(TAGGED_AFFIX_IDS).toHaveLength(14)

        for (const id of TAGGED_AFFIX_IDS) {
            expect(affixDesc(id), `${id} desc`).toContain("<H>")
            expect(nonDescFields(affixOf(id)), `${id} fields`).toEqual(FIELD_SNAPSHOTS[id])
        }
    })

    it("14 条专属词缀逐语言命中对照表，仅 JP 1 条无标签", () => {
        const jpUntagged: number[] = []

        for (const id of TAGGED_AFFIX_IDS) {
            const cn = affixDesc(id)

            for (const locale of LOCALES) {
                const text = PACK_TABLES[locale][cn]

                expect(typeof text === "string" && text.trim().length > 0, `${locale}:${id} lookup`).toBe(true)

                if (locale === "jp" && JP_UNTAGGED_AFFIX_IDS.includes(id)) {
                    expect(text, `jp:${id} untagged`).not.toContain("<H>")
                    jpUntagged.push(id)
                } else {
                    expect(text, `${locale}:${id} tags`).toContain("<H>")
                }
            }
        }

        expect(jpUntagged).toEqual([...JP_UNTAGGED_AFFIX_IDS])
        expect(PACK_TABLES.en[affixDesc(110201)]).toContain("<H>Flora</>")
        expect(PACK_TABLES.tc[affixDesc(110201)]).toContain("<H>第一根源</>")
    })

    it("110201 数值字段无漂移", () => {
        // 1.8.7.1 官方导出：芙罗拉战技等级 +10（原 1 级），并新增 SkillID 升级字段
        expect(affixOf(110201)).toMatchObject({
            id: 110201,
            minValue: 10,
            maxValue: 10,
            totalValueLevel: 1,
            addSkillLevel: { skillIds: [110201] },
        })
    })
})

describe("手写词缀规范名 6 语言解析", () => {
    it("全部手写 attr 键在对应翻译源中均为非空译文", () => {
        const missing: string[] = []

        for (const name of handwrittenAttrNames()) {
            if (UI_COINED_ATTR_NAMES[name]) continue
            for (const locale of LOCALES) {
                const text = packText(locale, name)

                if (typeof text !== "string" || text.trim().length === 0) {
                    missing.push(`${locale}:${name}`)
                }
            }
        }

        expect(missing).toEqual([])
    })

    it("本地组合键 / 元素弱点六语言界面文案齐全", () => {
        for (const [name, values] of Object.entries(UI_COINED_ATTR_NAMES)) {
            for (const locale of UI_LOCALES) {
                const text = (readUiTranslation(locale) as Record<string, unknown>)[name]

                expect(typeof text, `${locale}:${name}`).toBe("string")
                expect(text, `${locale}:${name}`).toBe(values[locale])
            }
        }
    })

    it("规范名逐语言定值（21 个手写 attr + 2 个追伤 / 6 个元素弱点补充）", () => {
        const handwritten = new Set(handwrittenAttrNames())
        const expected = new Set([...Object.keys(EXPECTED_ATTR_NAMES), ...Object.keys(UI_COINED_ATTR_NAMES)])

        // 手写 buff 实际引用的 21 个名字必须是期望表的子集；期望表额外锁两个核心分量与六个未被手写引用的元素弱点键
        expect(handwritten.size).toBe(21)
        expect(expected.size).toBe(handwritten.size + 8)
        for (const name of handwritten) {
            expect([...expected], `未登记期望值：${name}`).toContain(name)
        }
        expect(new Set([...expected].filter(name => !handwritten.has(name)))).toEqual(
            new Set(["光属性追伤", "自属性追伤", "水属性弱点", "雷属性弱点", "风属性弱点", "光属性弱点", "暗属性弱点", "全属性弱点"])
        )

        for (const name of CHASE_ATTR_KEYS) {
            expect([...expected], `追伤键缺期望值：${name}`).toContain(name)
        }

        for (const [name, values] of Object.entries(EXPECTED_ATTR_NAMES)) {
            for (const locale of LOCALES) {
                expect(packText(locale, name), `${locale}:${name}`).toBe(values[locale])
            }
        }

        for (const [name, values] of Object.entries(UI_COINED_ATTR_NAMES)) {
            for (const locale of UI_LOCALES) {
                expect((readUiTranslation(locale) as Record<string, unknown>)[name], `${locale}:${name}`).toBe(values[locale])
            }
        }
    })

    it("非中文语言不出现中文回退", () => {
        const fallback: string[] = []
        const record = (locale: string, name: string, text: string) => {
            if (locale === "en" || locale === "fr") {
                if (hasCJK(text)) fallback.push(`${locale}:${name}=${text}`)
            } else if (locale === "jp" || locale === "ja") {
                if (hasSimplifiedOnlyChar(text)) fallback.push(`jp:${name}=${text}`)
            } else if (locale === "kr" || locale === "ko") {
                if (hasCJK(text) || !/[가-힣]/.test(text)) fallback.push(`kr:${name}=${text}`)
            }
        }

        for (const name of Object.keys(EXPECTED_ATTR_NAMES)) {
            for (const locale of LOCALES) {
                record(locale, name, packText(locale, name) ?? name)
            }
        }
        for (const [name, values] of Object.entries(UI_COINED_ATTR_NAMES)) {
            for (const [locale, text] of Object.entries(values)) {
                record(locale, name, text ?? name)
            }
        }

        expect(fallback).toEqual([])
    })

    it("2001/2002/2015 与专属词条摘要分段精确且逐段可译", () => {
        const nameText = (part: string, locale: PackLocale): string | undefined =>
            EXPECTED_ATTR_NAMES[part]?.[locale] ?? UI_COINED_ATTR_NAMES[part]?.[PACK_LOCALE_TO_UI[locale]]

        for (const [id, expectedParts] of SUMMARY_CASES) {
            const parts = getAffixSummaryParts({ id } as DnaSeasonAffix)

            expect(parts, `${id} 摘要分段`).toEqual(expectedParts)

            for (const locale of LOCALES) {
                for (const part of expectedParts) {
                    const text = nameText(part, locale)

                    expect(text, `${locale}:${id}:${part} 缺期望译文`).toBeDefined()
                    expect(
                        packText(locale, part) ?? UI_COINED_ATTR_NAMES[part]?.[PACK_LOCALE_TO_UI[locale]],
                        `${locale}:${id}:${part}`
                    ).toBe(text)
                }

                const text = expectedParts.map(part => nameText(part, locale)).join(" · ")

                if (locale === "en" || locale === "fr") {
                    expect(hasCJK(text), `${locale}:${id}`).toBe(false)
                }
            }
        }
    })

    it("仍保留的复合名在补充表与生成表逐字一致（1 键 × 5 语言）", () => {
        for (const locale of LOCALES) {
            for (const name of KEPT_COMPOSED_NAMES) {
                expect(PACK_TABLES[locale][name], `${locale}:${name}`).toBe(SUPPLEMENTAL_TRANSLATIONS[locale][name])
            }
        }
    })

    it("已删除的复合名不再出现在任一语言的对照表", () => {
        for (const locale of LOCALES) {
            for (const name of REMOVED_COMPOSED_NAMES) {
                expect(PACK_TABLES[locale]).not.toHaveProperty(name)
                expect(SUPPLEMENTAL_TRANSLATIONS[locale]).not.toHaveProperty(name)
            }
        }
    })

    it("建模覆盖 token 在 6 语言界面文案齐全（计数随 UNIQUE_AFFIX_MAP 动态统计）", () => {
        const tokens = new Set<string>()

        for (const mapping of Object.values(UNIQUE_AFFIX_MAP)) {
            for (const token of [...(mapping.included ?? []), ...(mapping.excluded ?? [])]) {
                tokens.add(token)
            }
        }

        const uiTranslations = new Map(UI_LOCALES.map(locale => [locale, readUiTranslation(locale)]))
        const missing: string[] = []

        for (const token of tokens) {
            // 追伤分量是属性名，由属性 i18n（生成器 FRONTEND_COINED_ATTRS）承担，不走 coverage 文案命名空间；
            // 「四属性追伤」是本地汇总口径（非单一属性），由界面 coverage 键承担，继续走下方分支
            if (token.endsWith("属性追伤") && token !== "四属性追伤") {
                for (const locale of LOCALES) {
                    expect(packText(locale, token), `${locale}:${token}`).toBeTruthy()
                }
                continue
            }

            const key = getCoverageTokenKey(token)

            if (!key) {
                missing.push(`key:${token}`)
                continue
            }

            for (const locale of UI_LOCALES) {
                const text = resolveDotKey(uiTranslations.get(locale), key)

                if (typeof text !== "string" || text.trim().length === 0) {
                    missing.push(`${locale}:${token}`)
                }
            }
        }

        expect(missing).toEqual([])
        // token 与界面文案键一一对应，数量随 UNIQUE_AFFIX_MAP 动态统计（标题不再硬编码）
        const coverageTokens = [...tokens].filter(token => !token.endsWith("属性追伤"))
        const missingKeys = coverageTokens.filter(token => getCoverageTokenKey(token) === undefined)

        expect(missingKeys).toEqual([])
        expect(new Set(coverageTokens.map(token => getCoverageTokenKey(token) as string)).size).toBe(coverageTokens.length)
    })
})

describe("追伤七分量 i18n 三源锁（U70b-fix）", () => {
    /** 打包语言 → public/i18n 语言目录 */
    const PACK_TO_UI: Record<PackLocale, string> = { tc: "zh-TW", en: "en", jp: "ja", kr: "ko", fr: "fr" }

    it("SUPPLEMENTAL_TRANSLATIONS = PACK_TABLES = public 根键（7 键 × 5 语言）", () => {
        for (const locale of LOCALES) {
            const ui = readUiTranslation(PACK_TO_UI[locale])

            for (const key of CHASE_ATTR_KEYS) {
                const supplemental = SUPPLEMENTAL_TRANSLATIONS[locale][key]
                expect(supplemental, `${locale}:${key} 未登记 SUPPLEMENTAL`).toBeTypeOf("string")
                expect(PACK_TABLES[locale][key], `${locale}:${key} PACK_TABLES 与 SUPPLEMENTAL`).toBe(supplemental)
                expect(resolveDotKey(ui, key), `${locale}:${key} public 根键与 SUPPLEMENTAL`).toBe(supplemental)
            }
        }
    })
})
