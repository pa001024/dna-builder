#!/usr/bin/env bun

import { existsSync, readdirSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as ts from "typescript"

/** 仓库根：本文件位于 `<root>/tools/` 下，与调用方 cwd 无关 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
/** 同级仓库的默认上游根（与 tools/import-attr-i18n.ts 等兄弟工具一致） */
const DEFAULT_UPSTREAM_ROOT = path.resolve(REPO_ROOT, "..", "DuetNightAbyssData2")

/** 命令行 --upstream（最高优先级，与兄弟工具对齐）；vitest（node）下无 Bun 全局时退回 process.argv，保证纯函数可被测试 import */
const CLI_UPSTREAM = (() => {
    const args = typeof Bun === "undefined" ? process.argv : Bun.argv
    const index = args.indexOf("--upstream")
    return index >= 0 ? args[index + 1] : undefined
})()

/**
 * 上游仓库根目录（Lua 数据层所在）：`--upstream` > `.env` 的 DNA_UPSTREAM > 同级 `../DuetNightAbyssData2`。
 * Bun 会自动读取项目根 `.env` 并注入 process.env，无需额外加载。
 */
function resolveUpstreamRoot(): string {
    const configured = CLI_UPSTREAM ?? process.env.DNA_UPSTREAM
    return configured ? path.resolve(configured) : DEFAULT_UPSTREAM_ROOT
}

/** 上游仓库根目录 */
const UPSTREAM_ROOT = resolveUpstreamRoot()
/**
 * 多语言数据集根目录（final/i18n）：`.env` 的 DNA_UPSTREAM_I18N > `<仓库根>/final/i18n`。
 * 允许把 i18n 产物目录指到别处（如只拿到 final 产物的机器），优先级同「.env > 默认」。
 */
const SOURCE_ROOT = process.env.DNA_UPSTREAM_I18N ? path.resolve(process.env.DNA_UPSTREAM_I18N) : path.join(UPSTREAM_ROOT, "final", "i18n")
const WEB_DIR = path.resolve(REPO_ROOT, "apps", "web")
const TARGET_DIR = path.resolve(REPO_ROOT, "packages", "data", "d")
const LOCALES = ["cn", "en", "fr", "jp", "kr", "tc"] as const
type Locale = (typeof LOCALES)[number]

/** 打包进数据包的语言（简体中文是 fallbackLng，留在 public/i18n 不进包） */
const TRANSLATION_LOCALES = ["tc", "en", "jp", "kr", "fr"] as const
type TranslationLocale = (typeof TRANSLATION_LOCALES)[number]

/** 打包语言 → 目标文件里的变量名 */
const TRANSLATION_VARS: Record<TranslationLocale, string> = {
    tc: "translationsTc",
    en: "translationsEn",
    jp: "translationsJa",
    kr: "translationsKo",
    fr: "translationsFr",
}

/**
 * 直读上游 Lua 数据层的取数器。
 *
 * 上游 `out/*.json` 是 `bun out export-raw` 对 `Script/Datas/*.lua` 的原样导出，属本地生成物
 * （上游 .gitignore 忽略 `out/`），故本工具不再依赖它，改为复用上游 `src/lua` 的 LuaDataManager
 * 直接执行 Lua 表，取回后按 deepSortJson 排序，产物与旧的 out JSON 逐键一致。
 *
 * 模块用绝对路径动态 import（打不开就报错），不写进本仓库依赖，也不硬编码任何上游路径。
 */
type LuaDataManagerLike = {
    loadScriptValue(relativePath: string): { value?: unknown; error?: string }
}

type LuaLoader = {
    manager: LuaDataManagerLike
    deepSortJson: (value: unknown) => any
}

let luaLoaderPromise: Promise<LuaLoader> | null = null
const luaTableCache = new Map<string, unknown>()

async function getLuaLoader(): Promise<LuaLoader> {
    if (!luaLoaderPromise) {
        const managerPath = path.join(UPSTREAM_ROOT, "src", "lua", "LuaDataManager.ts")
        const sortPath = path.join(UPSTREAM_ROOT, "src", "lua", "deepSort.ts")
        if (!existsSync(managerPath)) {
            throw new Error(`上游 Lua 取数模块不存在：${managerPath}（请检查 .env 的 DNA_UPSTREAM 是否指向 DuetNightAbyssData2 仓库根）`)
        }
        luaLoaderPromise = Promise.all([import(pathToFileURL(managerPath).href), import(pathToFileURL(sortPath).href)]).then(
            ([managerMod, sortMod]) => ({
                manager: new managerMod.LuaDataManager(UPSTREAM_ROOT),
                deepSortJson: sortMod.deepSortJson,
            })
        )
    }
    return luaLoaderPromise
}

/**
 * 读取一张 Script/Datas 下的 Lua 表，返回键深度排序后的 JS 值（与旧的 out/<name>.json 等价）。
 * 结果按表名缓存，避免同一张表（如 TextMap_I18n、Resource）被重复执行。
 */
async function readLuaTable(name: string): Promise<any> {
    if (luaTableCache.has(name)) {
        return luaTableCache.get(name)
    }
    const { manager, deepSortJson } = await getLuaLoader()
    const { value, error } = manager.loadScriptValue(path.join("Script", "Datas", `${name}.lua`))
    if (value === undefined) {
        throw new Error(`读取上游 Lua 表 ${name} 失败：${error ?? "未知错误"}`)
    }
    const sorted = deepSortJson(value)
    luaTableCache.set(name, sorted)
    return sorted
}

/**
 * 前端自造展示名 → 官方文本表 ID 的映射。
 *
 * 少数展示名由前端从数值生成，上游各模块数据集里没有对应文本，按位置比对拿不到译文。
 * 这类词在**官方文本表**（`Script/Datas/TextMap_I18n.lua`）里有权威译名，只是 ID 与模块字段不相干，
 * 因此单独按 ID 取。键是前端实际输出的中文，值是官方 TextMapId。
 */
export const SUPPLEMENTAL_TEXT_MAP_IDS: Record<string, string> = {
    // 迷津房间类型：名称来自游戏脚本 Script/Datas/RougeLikeRoomType.lua，
    // 不在任何一个 i18n 模块数据集里，只能按官方文本表 ID 取权威译名
    战斗: "RougeLike_RoomType_Name_1",
    休整: "RougeLike_RoomType_Name_4",
    奇遇: "RougeLike_RoomType_Name_3",
    高危战斗: "RougeLike_RoomType_Name_5",
    // 钓鱼出现时段
    上午: "UI_Fishing_DayAndNight_Cont_1",
    下午: "UI_Fishing_DayAndNight_Cont_2",
    夜晚: "UI_Fishing_DayAndNight_Cont_3",
    // 钓鱼界面从枚举值生成的展示名（出现时段之外的几项）。
    // 这几个词在 `Fish.json` / `FishingSpot.json` 里没有对应字段，官方文本表却给了权威 ID，
    // 因此按 ID 取；UI_Fishing_AutoSmallToBig 与 UI_Fishing_SmallToBig 同义，取其一即可。
    异种: "UI_Fishing_FishType_2",
    珍鳞: "UI_Fishing_FishType_3",
    珍鳞异种: "UI_Fishing_FishType_4",
    授渔以鱼: "UI_Fishing_SmallToBig",
    鱼饵: "UI_Fishing_FishingLure",
    鱼竿: "UI_Fishing_FishingRod",
    // 模拟器「钓100次」按钮：上游按钓获/图鉴语境给的是同一个词，逐字取官方译名
    钓一次: "UI_Fishing_StartFishing",
    // 密函「获取途径」标签：这三个词由前端 `walnut.data.ts` 自己写死，
    // 不在任何 i18n 模块数据集里（`Walnut.json` 只含名称与奖励），
    // 但官方文本表里有同义的权威 ID —— 按 ID 取，避免另造界面键。
    副本: "UI_Dungeon_Tab_WalnutDungeon",
    委托密函商店: "MAIN_UI_WALNUTBAG",
    // 资源「获取途径」分区标题：详情页与搜索/ Agent 字段用的都是这个中文词，
    // 上游各模块数据集里没有它，按官方文本表 ID 取权威译名。
    获取途径: "UI_Tips_Obtining",
    // 迷津合作模式 Mod 装备部位：界面显示的是「近战武器 / 远程武器」单数形式，
    // 官方文本表只有整句里出现的这些词，故按装备部位条目的 ID 取权威译名
    近战武器: "UI_BAG_Meleeweapon",
    远程武器: "UI_BAG_Longrange",
    "弓（长弓）": "WeaponType_Bow02",
    "弓（短弓）": "WeaponType_Bow01",
    // 招式字段 `tag` 里的「战技 / 终结技」：上游模块数据集里没有这两个词条，
    // 官方文本表里有独立的同形条目（引导与键位提示用的技能名），按 ID 取权威译名。
    战技: "Guide_HighlightButton_Skill1",
    终结技: "Guide_HighlightButton_Skill2",
    // 剧情占位符 {nickname} / {nickname2} 的主角默认名，官方分别给了独立 ID
    维塔: "PlayerDefaultName",
    墨斯: "ExPlayerDefaultName",
    秽兽: "UI_Archive_Tab_InfectionEnemy",
    最大耐受: "UI_Mod_CostIncrease",
    放生获得: "UI_Pet_DecomposeResultResource",
    魔灵: "MAIN_UI_PET",
    魔灵潜质: "MAINUIGUIDE_TITLE_PETTRAIN",
    失活魔灵: "Pet_ResourcePet",
    活力魔灵: "Pet_BattlePet",
    // ---- 以下为对照表必须保留的展示名（与上同等效力）：位置配对拿不到或配不对的中文正典，
    // 按 ID 取权威译名。每条都经 5 语逐条审计：配对一致的已删，剩下的至少在一门语言或引用上扛事。
    称号: "UI_PersonalPage_Title_Name",
    神智: "MAINUIGUIDE_TITLE_SP",
    不朽剧目: "Abyss_Infinite",
    经典剧目: "Abyss_Normal",
    热映剧目: "Abyss_Rotate",

    技能范围: "Attr_SkillRange_Name",
    技能耐久: "Attr_SkillSustain_Name",
    技能威力: "Attr_SkillIntensity_Name",
    技能效益: "Attr_SkillEfficiency_Name",
    充盈威力: "Attr_HyperTriggerRate_Name",
    充盈转化: "Attr_HyperTriggerConvertRate_Name",
    攻击范围: "Attr_AttackRange_Name",
    弹药转化率: "Attr_BulletConver_Name",
    攻击: "Attr_ATK_Name",
    护盾: "Attr_ES_Name",
    生命: "Attr_Hp_Name",
    防御: "Attr_DEF_Name",
    子弹爆炸范围: "Attr_AttackRange_Bullet_Name",
    最大弹药: "Attr_BulletMax_Name",
    武器精通: "Attr_ExcelWeaponTag_Name",

    档案: "UI_Chardata_Data",
    出生地: "UI_Chardata_Char_BrithPlace",
    生日: "UI_Chardata_Char_Brithday",
    语音: "UI_CharVoice_Tab",

    暗属性: "UI_Attr_Dark_Name",
    火属性: "UI_Attr_Fire_Name",
    光属性: "UI_Attr_Light_Name",
    雷属性: "UI_Attr_Thunder_Name",
    水属性: "UI_Attr_Water_Name",
    风属性: "UI_Attr_Wind_Name",
    追加伤害: "TERM_Common_AdditionalDmg",
    技能追加伤害: "TERM_Common_AdditionalDmg_Skill",
    技能速度: "TERM_Common_SkillSpeed",
    属性攻击: "Tag_ATK_Attr",
    背水: "Tag_EnmityValue",

    基础: "UI_CameraSystem_Basic",
    技能: "MAIN_UI_SKILL",
    减伤: "Tag_DmgReducion",
    取消: "AFDayEvent_Photo_Cancel",
    全部: "UI_ALL",
    任意: "UI_ImpressionShop_UnlockCon_Any",
    溯源: "MAIN_UI_CARDLEVEL",
    头像: "UI_HeadFrame_Head",
    头像框: "UI_HeadFrame_Frame",
    遗物: "UI_RLArchiveTitle_Treasure",
    灾厄熔炼: "UI_Armory_HyperStrengthen",
    烛芯: "UI_RLArchiveTitle_Blessing",
}

/**
 * 前端展示名 -> 官方中文正典（B类：能用游戏官方名翻译的；A类自创公式键只留 public/i18n）。
 *
 * 学上游 create_translation.py 的 EX_T / root-keys：对照表里只认展示名，上游模块与文本表里
 * 只有正典（如「暴击」->「暴击率」）。导入时按正典查 TextMapContent 取各语言译文，查不到
 * 则按展示名本身回退再查一次；都查不到或译文与展示名相同则跳过（上游改名后旧键自然消失）。
 * 本表每条正典都至少一门语言可解析；新增请先确认正典在 TextMap 存在。
 */
export const TRANSLATION_ALIASES: Record<string, string> = {
    百首: "百首之",
    暴击: "暴击率",
    暴伤: "暴击伤害",
    不死鸟: "不死鸟之",
    触发: "触发概率",
    弹匣: "弹匣容量",
    弹药: "最大弹药",
    多重: "多重射击",
    攻速: "攻击速度",
    海妖: "海妖之",
    换生灵: "换生灵之",
    黄衣: "黄衣之",
    技能伤害: "造成技能伤害",
    金乌: "金乌之",
    近战: "近战武器",
    巨鲸: "巨鲸之",
    冥犬: "冥犬之",
    牧神: "牧神之",
    普攻增伤: "普通攻击伤害",
    歧视: "阵营增伤",
    契约者: "契约者之",
    囚狼: "囚狼之",
    人面狮: "人面狮之",
    审判者: "审判者之",
    狮鹫: "狮鹫之",
    属性穿透: "全属性穿透",
    属性伤: "属性攻击",
    同律近战: "近战同律武器",
    同律远程: "远程同律武器",
    下落增伤: "下落攻击伤害",
    邪龙: "邪龙之",
    蓄力增伤: "蓄力攻击伤害",
    焰灵: "焰灵之",
    夜魔: "夜魔之",
    夜使: "夜使之",
    异化冥犬: "异化冥犬之",
    异化夜魔: "异化夜魔之",
    羽蛇: "羽蛇之",
    远程: "远程武器",
    增伤: "造成的伤害",
    中庭蛇: "中庭蛇之",
    装填: "子弹装填速度",
}

/**
 * 官方文本表 ID → 应用语言字段。
 */
const TEXT_MAP_LOCALE_FIELDS: Record<TranslationLocale, string> = {
    tc: "ContentTC",
    en: "ContentEN",
    jp: "ContentJP",
    kr: "ContentKR",
    fr: "ContentFR",
}

/**
 * 无官方依据、纯前端自造的展示名译名表。
 *
 * 两类词在官方文本表里都搜不到同义 ID，只能人工指定，键必须与前端实际输出的中文完全一致：
 * - 成就品质：前端把 `quality` 显示成「铜/银/金」；
 * - 魔灵类型之一的「活动魔灵」（`pet.data.ts` 的 `类型: 3`，即无由生这类活动支援魔灵）：
 *   官方只提供了「活力魔灵」（`Pet_BattlePet`）与「失活魔灵」（`Pet_ResourcePet`）两个分类名，
 *   译名按这两个词的构词风格补。
 *
 * 另有「伤害类型」与「招式名」的裸词：官方文本表只有带后缀的整词，没有单独的词条，
 * 只能照官方构词法截取（`灾厄攻击` = Calamity Attack ⇒ 灾厄 = Calamity；
 * `普通攻击伤害` = Normal Attack DMG ⇒ 普通攻击 = Normal Attack）；
 * 招式字段的 `tag` 里还用了缩写「普攻」（= 普通攻击），官方同样没有单独词条，一并按此补。
 *
 * 武器专属机制名同理：`weapon.data.ts` 里写死的技能名「羽化」与招式字段名「[羽化]伤害」「[羽化]额外伤害」
 * 在上游模块数据集里没有独立词条，官方文本表也只有整句里的 `[羽化]`。
 * 译名照官方整句取（en `[Eclosion]`、fr `[Éclosion]`、kr `[우화]`、jp/tc `[羽化]`）；
 * tag 里的「充盈」按官方构词法从「充盈伤害」(Overflow Damage)、「充盈威力」(Overflow Intensity) 截取。
 *
 * 钓鱼界面里由前端**文案模板 + 数值**拼出来的句子没有官方原文，不进这张表——
 * 它们走 `translations.data.ts` 里对应的**整句模板键**（如「额外奖励(概率:{{prob}})」），
 * 由界面直接 `$t` 取用，避免在此处按词硬拼出语法不通的译文。
 */
const SUPPLEMENTAL_TRANSLATIONS: Record<TranslationLocale, Record<string, string>> = {
    tc: {
        铜: "銅",
        银: "銀",
        活动魔灵: "活動魔靈",
        守护机关1: "守護機關1",
        灾厄: "災厄",
        普通攻击: "普通攻擊",
        普攻: "普攻",
        羽化: "羽化",
        "[羽化]伤害": "[羽化]傷害",
        "[羽化]额外伤害": "[羽化]額外傷害",
        充盈: "充盈",
        // 上游 translation.json 曾含、现按位置配对拿不到的对照（旧 translations.data.ts 存量回填）
        独立增伤: "獨立增傷",
        段数: "段數",
        额外字段: "額外欄位",
        贯穿: "貫穿",
        削韧: "削韌",
        延迟: "延遲",
        连段: "連段",
        震荡: "震盪",
        // 角色/武器属性名（CharAttr/WeaponAttr）：独立词条，上游模块位置配对拿不到
        // 官方译名照抄上游 final/i18n/<locale>/translation.json；缺失的按官方构词法补
        // （增伤 Damage Dealt、技能追加伤害 Additional Skill DMG、独立增伤 Independent damage increase 等家族）
        无视防御: "無視防禦",
        有效生命: "有效生命",
        失衡易伤: "失衡易傷",
        元素增伤: "元素增傷",
        物理增伤: "物理增傷",
        技能追伤: "技能追加傷害",
        技能独立增伤: "技能獨立增傷",
        技能无视防御: "技能無視防禦",
        技能触发: "技能觸發",
        技能倍率加数: "技能倍率加數",
        技能倍率乘数: "技能倍率乘數",
        技能倍率赋值: "技能倍率賦值",
        召唤物属性继承比例: "召喚物屬性繼承比例",
        召唤物攻击速度: "召喚物攻擊速度",
        召唤物范围: "召喚物範圍",
        召唤物独立增伤: "召喚物獨立增傷",
        转切割: "轉切割",
        转贯穿: "轉貫穿",
        转震荡: "轉震盪",
        转灾厄: "轉災厄",
        转充盈: "轉充盈",
        转属克: "轉屬剋",
        转属逆: "轉屬逆",
        异常数量: "異常數量",
        武器倍率: "武器倍率",
        召唤物攻击速度转化: "召喚物攻擊速度轉化",
        召唤物范围转化: "召喚物範圍轉化",
        固定攻击: "固定攻擊",
        固定生命: "固定生命",
    },
    en: {
        铜: "Bronze",
        银: "Silver",
        活动魔灵: "Event Geniemon",
        守护机关1: "Guard Device 1",
        灾厄: "Calamity",
        普通攻击: "Normal Attack",
        普攻: "Normal Attack",
        羽化: "Eclosion",
        "[羽化]伤害": "[Eclosion] Damage",
        "[羽化]额外伤害": "[Eclosion] Bonus Damage",
        充盈: "Overflow",
        // Restored from legacy translations.data.ts (present in upstream translation.json, unreachable by positional pairing)
        独立增伤: "Independent damage increase",
        段数: "Hits",
        额外字段: "Extra Fields",
        贯穿: "Spike",
        宝物组: "Treasure group",
        弹片伤害: "Bullet DMG",
        祝福组: "Blessing group",
        削韧: "Toughness Damage",
        延迟: "Delay",
        卡肉: "Hit Stop",
        连段: "Combo",
        切割: "Slash",
        震荡: "Smash",
        // Char/Weapon attr names: standalone terms unreachable by positional pairing.
        // Official translations copied from upstream final/i18n/en/translation.json;
        // missing ones follow official wording (Damage Dealt / Additional Skill DMG /
        // Independent damage increase families).
        无视防御: "Ignore defense",
        有效生命: "Effective HP",
        失衡易伤: "Unbalanced and prone to injury",
        元素增伤: "Elemental Damage Dealt",
        物理增伤: "Physical Damage Dealt",
        技能追伤: "Additional Skill DMG",
        技能独立增伤: "Independent Skill damage increase",
        技能无视防御: "Skill Ignore Defense",
        技能触发: "Skill Trigger",
        技能倍率加数: "Additive Skill Multiplier",
        技能倍率乘数: "Multiplicative Skill Multiplier",
        技能倍率赋值: "Skill Multiplier (Set)",
        召唤物属性继承比例: "Summon Attribute Inheritance",
        召唤物攻击速度: "Summon Attack Speed",
        召唤物范围: "Summon Range",
        召唤物独立增伤: "Independent Summon damage increase",
        转切割: "Convert to Slash",
        转贯穿: "Convert to Spike",
        转震荡: "Convert to Smash",
        转灾厄: "Convert to Calamity",
        转充盈: "Convert to Overflow",
        转属克: "Convert to Counter Element",
        转属逆: "Convert to Weak Element",
        异常数量: "Anomaly Count",
        武器倍率: "Weapon Multiplier",
        召唤物攻击速度转化: "Summon ATK Speed Conversion",
        召唤物范围转化: "Summon Range Conversion",
        固定攻击: "Flat ATK",
        固定生命: "Flat HP",
    },
    jp: {
        铜: "銅",
        银: "銀",
        活动魔灵: "イベントジェネモン",
        守护机关1: "守護装置1",
        灾厄: "災厄",
        普通攻击: "通常攻撃",
        普攻: "通常攻撃",
        羽化: "羽化",
        "[羽化]伤害": "[羽化]ダメージ",
        "[羽化]额外伤害": "[羽化]追加ダメージ",
        充盈: "チャージ",
        独立增伤: "独立ダメージ増加",
        额外字段: "追加フィールド",
        贯穿: "貫通",
        宝物组: "宝物グループ",
        弹片伤害: "破片によるダメージ",
        祝福组: "祝福グループ",
        削韧: "靭性削り",
        延迟: "遅延",
        卡肉: "ヒットストップ",
        连段: "コンボ",
        切割: "切断",
        震荡: "衝撃",
        // Char/Weapon 属性名：独立词条，位置配对拿不到。官方译名照抄上游 translation.json，缺失按官方构词补。
        无视防御: "防御無視",
        有效生命: "有効生命",
        失衡易伤: "バランスが崩れて怪我をしやすい",
        元素增伤: "元素ダメージ増加",
        物理增伤: "物理ダメージ増加",
        技能追伤: "スキル追加ダメージ",
        技能独立增伤: "スキル独立ダメージ増加",
        技能无视防御: "スキル防御無視",
        技能触发: "スキル発動",
        技能倍率加数: "スキル倍率加算",
        技能倍率乘数: "スキル倍率乗算",
        技能倍率赋值: "スキル倍率設定",
        召唤物属性继承比例: "召喚ユニット属性継承率",
        召唤物攻击速度: "召喚ユニット攻撃速度",
        召唤物范围: "召喚ユニット範囲",
        召唤物独立增伤: "召喚ユニット独立ダメージ増加",
        转切割: "切断変換",
        转贯穿: "貫通変換",
        转震荡: "衝撃変換",
        转灾厄: "災厄変換",
        转充盈: "チャージ変換",
        转属克: "カウンター属性変換",
        转属逆: "逆属性変換",
        异常数量: "異常数",
        武器倍率: "武器倍率",
        召唤物攻击速度转化: "召喚ユニット攻撃速度変換",
        召唤物范围转化: "召喚ユニット範囲変換",
        固定攻击: "固定攻撃力",
        固定生命: "固定HP",
    },
    kr: {
        铜: "동",
        银: "은",
        活动魔灵: "이벤트 마령",
        守护机关1: "수호 기관 1",
        灾厄: "재앙",
        普通攻击: "기본 공격",
        普攻: "기본 공격",
        羽化: "우화",
        "[羽化]伤害": "[우화] 대미지",
        "[羽化]额外伤害": "[우화] 추가 대미지",
        充盈: "오버차지",
        独立增伤: "독립 피해 증가",
        段数: "타수",
        额外字段: "추가 필드",
        贯穿: "관통",
        宝物组: "보물 그룹",
        弹片伤害: "파편 손상",
        祝福组: "축복 그룹",
        削韧: "강인도削减",
        延迟: "지연",
        卡肉: "히트 스톱",
        连段: "콤보",
        切割: "베기",
        震荡: "진동",
        // Char/Weapon 속성명: 위치 매칭으로 수집 불가. 공식 번역은 upstream translation.json 그대로, 나머지는 공식 조어법 준용.
        无视防御: "방어 무시",
        有效生命: "유효 수명",
        失衡易伤: "불균형하고 부상당하기 쉬운",
        元素增伤: "속성 피해 증가",
        物理增伤: "물리 피해 증가",
        技能追伤: "스킬 추가 대미지",
        技能独立增伤: "스킬 독립 피해 증가",
        技能无视防御: "스킬 방어 무시",
        技能触发: "스킬 발동",
        技能倍率加数: "스킬 배율 가산",
        技能倍率乘数: "스킬 배율 승산",
        技能倍率赋值: "스킬 배율 설정",
        召唤物属性继承比例: "소환물 속성 계승 비율",
        召唤物攻击速度: "소환물 공격 속도",
        召唤物范围: "소환물 범위",
        召唤物独立增伤: "소환물 독립 피해 증가",
        转切割: "베기 전환",
        转贯穿: "관통 전환",
        转震荡: "진동 전환",
        转灾厄: "재앙 전환",
        转充盈: "오버차지 전환",
        转属克: "카운터 속성 전환",
        转属逆: "역속성 전환",
        异常数量: "이상 개수",
        武器倍率: "무기 배율",
        召唤物攻击速度转化: "소환물 공격 속도 전환",
        召唤物范围转化: "소환물 범위 전환",
        固定攻击: "고정 공격",
        固定生命: "고정 HP",
    },
    fr: {
        铜: "Bronze",
        银: "Argent",
        活动魔灵: "Géniemon d'événement",
        守护机关1: "Dispositif de garde 1",
        灾厄: "Calamité",
        普通攻击: "Attaque normale",
        普攻: "Attaque normale",
        羽化: "Éclosion",
        "[羽化]伤害": "[Éclosion] Dégâts",
        "[羽化]额外伤害": "[Éclosion] Dégâts supplémentaires",
        充盈: "Surabondance",
        独立增伤: "Augmentation de dégâts indépendante",
        段数: "Nombre de coups",
        额外字段: "Champs supplémentaires",
        贯穿: "perforants",
        宝物组: "Groupe de trésors",
        弹片伤害: "Dégâts de projectiles",
        祝福组: "Groupe de bénédictions",
        削韧: "Dégâts de ténacité",
        延迟: "Délai",
        卡肉: "Hit Stop",
        连段: "Combo",
        切割: "tranchants",
        震荡: "contondants",
        // Noms d'attributs Char/Weapon : termes isolés hors appariement positionnel.
        // Traductions officielles reprises de upstream translation.json, le reste suit la phraséologie officielle.
        无视防御: "Ignore la défense",
        有效生命: "PV effectifs",
        失衡易伤: "Déséquilibré et vulnérable aux blessures",
        元素增伤: "Augmentation de dégâts élémentaires",
        物理增伤: "Augmentation de dégâts physiques",
        技能追伤: "Dégâts de compétence supplémentaires",
        技能独立增伤: "Augmentation de dégâts indépendants de compétence",
        技能无视防御: "Ignore la défense (compétence)",
        技能触发: "Déclenchement de compétence",
        技能倍率加数: "Multiplicateur de compétence (additif)",
        技能倍率乘数: "Multiplicateur de compétence (multiplicatif)",
        技能倍率赋值: "Multiplicateur de compétence (fixe)",
        召唤物属性继承比例: "Héritage des attributs des invocations",
        召唤物攻击速度: "Vitesse d'attaque des invocations",
        召唤物范围: "Portée des invocations",
        召唤物独立增伤: "Augmentation de dégâts indépendants des invocations",
        转切割: "Conversion tranchante",
        转贯穿: "Conversion perforante",
        转震荡: "Conversion contondante",
        转灾厄: "Conversion calamité",
        转充盈: "Conversion de Surabondance",
        转属克: "Conversion en contre-élément",
        转属逆: "Conversion en élément désavantageux",
        异常数量: "Nombre d'anomalies",
        武器倍率: "Multiplicateur d'arme",
        召唤物攻击速度转化: "Conversion de vitesse d'attaque des invocations",
        召唤物范围转化: "Conversion de portée des invocations",
        固定攻击: "ATQ fixe",
        固定生命: "PV fixes",
    },
}

/**
 * 上游 i18n 源里承载「零散游戏文案」的各模块数据集。
 *
 * 与 translation.json（已是一张扁平的「中文原文 → 译文」表）不同，这里每个文件都是
 * **按语言独立的数据集**：结构与字段名在简繁/各语言下一致，只有文本值不同。
 * 因此按位置同步遍历两侧，即可把同一字段的简体中文原文与目标语言译文配成对照。
 */
export const TRANSLATION_SOURCE_FILES = [
    "AbyssBuff.json",
    "AbyssDungeon.json",
    "Achievement.json",
    "BackpackPuzzleItem.json",
    "BackpackPuzzleLevel.json",
    "BookSeriesArchive.json",
    "Char.json",
    "CharAccessory.json",
    "Clue.json",
    "Cutoff.json",
    "Dispatch.json",
    "Draft.json",
    "Dungeon.json",
    "DynQuest.json",
    "Event.json",
    "ExtraExcelWeapon.json",
    "ExtractionTreasure.json",
    "ExtractionTreasureBag.json",
    "ExtractionTreasureContainer.json",
    "ExtractionTreasureMechanism.json",
    "Fish.json",
    "FishingSpot.json",
    "ForgeLevelQuest.json",
    "Hair.json",
    "HardBoss.json",
    "HeadFrame.json",
    "HeadSculpture.json",
    "ImpressionShop.json",
    "IronSurvivalMonsterSpawn.json",
    "IronTicket.json",
    "Mod.json",
    "Monster.json",
    "MonsterStrongAffixes.json",
    "Mount.json",
    "Music.json",
    "MusicScore.json",
    "Npc.json",
    "OptReward.json",
    "Pet.json",
    "PetEntry.json",
    "QuestChain.json",
    "RaidBuff.json",
    "Region.json",
    "RegionPoint.json",
    "RegionReputation.json",
    "Resource.json",
    "Review.json",
    "Reward.json",
    "RobotEquip.json",
    "RougeLikeBlessing.json",
    "RougeLikeBlessingGroup.json",
    "RougeLikeContract.json",
    "RougeLikeRoom.json",
    "RougeLikeStoryEvent.json",
    "RougeLikeTalent.json",
    "RougeLikeTalentBranch.json",
    "RougeLikeTreasure.json",
    "RougeLikeTreasureGroup.json",
    "RougeProClass.json",
    "RougeProContract.json",
    "RougeProConvert.json",
    "RougeProDifficulty.json",
    "RougeProEffect.json",
    "RougeProSeason.json",
    "RougeProShopRandom.json",
    "RougeProTalent.json",
    "RougeProTreasure.json",
    "RougeProTreasureGroup.json",
    "RougeProTreasureRandom.json",
    "RougePro_Defence.json",
    "RougePro_Event.json",
    "RougePro_EventArea.json",
    "RougePro_Exterminate.json",
    "RougePro_KillEliteMob.json",
    "RougePro_MSRound.json",
    "RougePro_MonsterSP.json",
    "RougePro_Occupation.json",
    "RougePro_RewardDropBox.json",
    "RougePro_Room.json",
    "RougePro_SabotagePro.json",
    "RougePro_SurvivalPro.json",
    "ShopItem.json",
    "Skin.json",
    "SkinGacha.json",
    "SkinGachaCumulative.json",
    "SkinGachaItem.json",
    "SkinGachaTab.json",
    "SkinGachaType.json",
    "SoloTreasure.json",
    "SoloTreasureDrop.json",
    "SoloTreasureGamePlay.json",
    "SubRegion.json",
    "Title.json",
    "TitleFrame.json",
    "TreasureHuntProgress.json",
    "TreasureHuntRepeatDungeon.json",
    "TreasureHuntStoryDungeon.json",
    "Walnut.json",
    "Weapon.json",
    "WeaponAccessory.json",
    "WeaponSkin.json",
    "Wiki.json",
] as const

/**
 * 不参与对照表生成的模块。
 *
 * 这四个模块在前端已有按语言切分的独立 data 文件（`quest.*.data.ts` / `partytopic.*.data.ts` /
 * `charvoice.*.data.ts` / `charext.*.data.ts`），组件按数据语言直接加载对应数据集，
 * 不经 i18next，因此收进对照表只会白占包体（合计约 3.8MB）。
 * storySummary 只有简体中文，无法构成对照。
 */
export const TRANSLATION_EXCLUDED_SOURCES = new Set([
    "QuestStory.json",
    "PartyTopic.json",
    "CharVoice.json",
    "CharDataTarget.json",
    "storySummary.json",
])

type MappingContext = {
    /** 目标文件绝对路径 */
    targetFile: string
    /** 目标文件原始文本 */
    originalText: string
    /** 目标文件 AST */
    sourceFile: ts.SourceFile
}

type Mapping = {
    source: string | ((context: MappingContext) => Promise<GeneratedReplacement[]> | GeneratedReplacement[])
    targetStem: string
    targetVar: string
    locales?: readonly string[]
    targetVars?: Partial<Record<Locale, string>>
    postProcess?: (value: unknown) => unknown
}

type GeneratedReplacement = {
    targetVar: string
    /** 原始 JS 值，写入前才序列化，便于与文件现有值做语义 diff */
    value: unknown
    /**
     * 可选：对目标文件做额外文本改写（返回替换区间，null 表示无改动）。
     * 用于 PreRaidRank 导入时按当前赛季从奖励表补齐 PreRaidRankRewardVersions。
     */
    augment?: () => { start: number; end: number; text: string } | null
}

/** 限时奖池活动行裁剪后保留的前端有用字段。
 *
 * 上游 `LimitedPrizePool` 原始行还带一堆前端用不到的资源路径
 * （`BigPrizeBPPath` / `ProcessBPPath` / `ResultBPPath` / `HistoryBPPath` / `RoundBPPath` 及其 Mobile 版、
 * `BigPrizeVideoPath` / `BigPrizeSoundEffects` / `ProcessSoundEffects`），全部丢掉，
 * 只保留模拟器与集齐奖励 UI 真正消费的三个字段。
 */
type TrimmedLimitedPrizePool = {
    EventId: number
    LimitedPrizePoolId: number[]
    ExtraItem?: Record<string, [number, number, number]>
}

/**
 * 归一化限时奖池的 ExtraItem（集齐奖励）。
 *
 * 上游 Lua 形状：以奖品档位索引（1-based，对应当轮 `LimitedPrizeItem.Type/Id/Count` 的下标，
 * 允许稀疏，如玩偶池只有 2/3/4）为键、`[物品类型索引, 物品ID, 数量]` 三元组为值的表。
 * 经 LuaDataManager 导出后，稠密表（1~N 连续）变成 JS 数组、稀疏表变成对象，两种形状都要收敛。
 *
 * 对齐游戏内 UI（`WBP_LimitedPrizePool_Dialog_CollectReward_C:BuildCategoryContents` /
 * `WBP_LimitedPrizePool_CollectReward_Doll_C:HasValidCollectRewardData`）：
 * 以 PrizeIndex 取 `ExtraInfo = ExtraItem[PrizeIndex]`，`ExtraInfo[1]` 经 `ItemUtils.GetItemType`
 * （0=Char … 6=Resource 7=HeadFrame 8=HeadSculpture 9=Background）解析为奖励类型，
 * `ExtraInfo[2]` 为奖励物品 ID、`ExtraInfo[3]` 为数量；同时用同一下标取当轮奖品的
 * `Type/Id/Count` 作为集齐判定条件。
 *
 * @param extra 上游原始 ExtraItem（数组或对象）。
 * @param eventId 所属活动 ID（仅用于报错定位）。
 * @returns 归一化后的 `档位索引字符串 -> [类型索引, 物品ID, 数量]`，缺失/空表时返回 undefined。
 */
function normalizeLimitedPrizeExtraItem(extra: unknown, eventId: string | number): Record<string, [number, number, number]> | undefined {
    if (extra === undefined || extra === null) {
        return undefined
    }
    const entries: Array<[string, unknown]> = Array.isArray(extra)
        ? extra.map((item, index) => [String(index + 1), item] as [string, unknown])
        : isRecord(extra)
          ? Object.entries(extra)
          : []
    if (!Array.isArray(extra) && !isRecord(extra)) {
        throw new Error(`LimitedPrizePool[${eventId}].ExtraItem 形状异常：既不是数组也不是对象`)
    }
    const record: Record<string, [number, number, number]> = {}
    for (const [key, item] of entries) {
        const index = Number(key)
        if (!Number.isInteger(index) || index <= 0) {
            throw new Error(`LimitedPrizePool[${eventId}].ExtraItem 键异常：${key}`)
        }
        if (!Array.isArray(item) || item.length !== 3 || !item.every(part => typeof part === "number")) {
            throw new Error(`LimitedPrizePool[${eventId}].ExtraItem[${key}] 形状异常：应为 [物品类型索引, 物品ID, 数量] 三元组`)
        }
        record[String(index)] = [item[0], item[1], item[2]]
    }
    // 按档位索引数值排序，保证同样输入产出同样的文件内容
    const sorted: Record<string, [number, number, number]> = {}
    for (const key of Object.keys(record).sort((left, right) => Number(left) - Number(right))) {
        sorted[key] = record[key]
    }
    return Object.keys(sorted).length > 0 ? sorted : undefined
}

/**
 * 裁剪限时奖池活动表，只保留前端有用的字段。
 * @param pools 上游 `LimitedPrizePool` 原始表（以 EventId 为键）。
 * @returns 以 EventId 为键的裁剪表。
 */
function trimLimitedPrizePools(pools: unknown): Record<string, TrimmedLimitedPrizePool> {
    if (!isRecord(pools)) {
        throw new Error("LimitedPrizePool 后处理只支持对象源")
    }
    const trimmed: Record<string, TrimmedLimitedPrizePool> = {}
    for (const [key, row] of Object.entries(pools)) {
        if (!isRecord(row)) {
            throw new Error(`LimitedPrizePool[${key}] 不是对象`)
        }
        const { EventId, LimitedPrizePoolId, ExtraItem } = row as Record<string, unknown>
        if (typeof EventId !== "number" || !Array.isArray(LimitedPrizePoolId)) {
            throw new Error(`LimitedPrizePool[${key}] 缺少 EventId / LimitedPrizePoolId`)
        }
        const trimmedRow: TrimmedLimitedPrizePool = {
            EventId,
            LimitedPrizePoolId: LimitedPrizePoolId as number[],
        }
        const extra = normalizeLimitedPrizeExtraItem(ExtraItem, key)
        if (extra) {
            trimmedRow.ExtraItem = extra
        }
        trimmed[key] = trimmedRow
    }
    return trimmed
}

const MAPPINGS: Mapping[] = [
    { source: "AbyssBuff", targetStem: "abyss", targetVar: "abyssBuffs", locales: ["cn"] },
    { source: "AbyssDungeon", targetStem: "abyss", targetVar: "abyssDungeons", locales: ["cn"] },
    { source: "Achievement", targetStem: "achievement", targetVar: "t", locales: ["cn"] },
    { source: "BackpackPuzzleItem", targetStem: "backpackpuzzle", targetVar: "backpackPuzzleItems", locales: ["cn"] },
    { source: "BackpackPuzzleLevel", targetStem: "backpackpuzzle", targetVar: "backpackPuzzleLevels", locales: ["cn"] },
    { source: "BookSeriesArchive", targetStem: "book", targetVar: "booksData", locales: ["cn"] },
    { source: "Char", targetStem: "char", targetVar: "t", locales: ["cn"] },
    { source: "CharAccessory", targetStem: "accessory", targetVar: "charAccessoryData", locales: ["cn"] },
    { source: "Clue", targetStem: "clue", targetVar: "clueData", locales: ["cn"] },
    {
        // 角色档案：正文走 Quest 模式（按 id 取文本），不分语言文件——
        // 各语言共用一份中文结构（charExtData），名称 / 解锁条件 / 正文的译文按语言各压成一张
        // id→文本大表（charExtTextTc/En/Fr/Jp/Kr），随同一文件下发，不进 translations 对照表。
        // 转换在导入阶段完成（见 buildCharExtDataWithTextTables）。
        source: async () => {
            const { charExtData, textTables } = await buildCharExtDataWithTextTables()
            return [
                { targetVar: "charExtData", value: charExtData },
                ...TRANSLATION_LOCALES.map(locale => ({
                    targetVar: CHAR_EXT_TEXT_VARS[locale],
                    value: textTables[locale],
                })),
            ]
        },
        targetStem: "charext",
        targetVar: "charExtData",
    },
    {
        // 角色语音：台词走 Quest 模式（按 id 取文本），不分语言文件——
        // 各语言共用一份中文结构（charVoiceData），名称 / 台词的译文按语言各压成一张
        // id→文本大表（charVoiceTextTc/En/Fr/Jp/Kr），随同一文件下发，不进 translations 对照表。
        // 上游已有 tc / fr 语音文本，一并纳入（此前只导出了 en / jp / kr）。
        // 转换在导入阶段完成（见 buildCharVoiceDataWithTextTables）。
        source: async () => {
            const { charVoiceData, textTables } = await buildCharVoiceDataWithTextTables()
            return [
                { targetVar: "charVoiceData", value: charVoiceData },
                ...TRANSLATION_LOCALES.map(locale => ({
                    targetVar: CHAR_VOICE_TEXT_VARS[locale],
                    value: textTables[locale],
                })),
            ]
        },
        targetStem: "charvoice",
        targetVar: "charVoiceData",
    },
    { source: "Draft", targetStem: "draft", targetVar: "t", locales: ["cn"] },
    { source: "Dungeon", targetStem: "dungeon", targetVar: "dungeonsData", locales: ["cn"] },
    { source: "Dispatch", targetStem: "dynquest", targetVar: "t", locales: ["cn"] },
    { source: "Cutoff", targetStem: "cutoff", targetVar: "cutoffData", locales: ["cn"] },
    { source: "ExtraExcelWeapon", targetStem: "charext", targetVar: "charExtraExcelWeapon", locales: ["cn"] },
    {
        source: "Event",
        targetStem: "event",
        targetVar: "eventData",
        locales: ["cn"],
        postProcess: value => {
            if (!Array.isArray(value)) {
                throw new Error("Event 后处理只支持数组源")
            }
            const event = value.find(row => isRecord(row) && row.id === 1030031)
            if (!isRecord(event)) {
                console.warn("[warn] Event 后处理跳过：快照无 Event[1030031]（老版本尚无该活动）")
                return value
            }
            event.startTime = 1785142800
            return value
        },
    },
    {
        source: async () => {
            return [
                {
                    targetVar: "modConvertData",
                    value: await readLuaTable("ModConvertId2ModId"),
                },
            ]
        },
        targetStem: "convert",
        targetVar: "modConvertData",
    },
    {
        source: async () => {
            return [
                {
                    targetVar: "dynamicRewardMap",
                    value: await readLuaTable("DynamicReward"),
                },
            ]
        },
        targetStem: "hardboss",
        targetVar: "dynamicRewardMap",
    },
    { source: "Fish", targetStem: "fish", targetVar: "fishs", locales: ["cn"] },
    { source: "FishingSpot", targetStem: "fish", targetVar: "fishingSpots", locales: ["cn"] },
    { source: "HardBoss", targetStem: "hardboss", targetVar: "hardBossData", locales: ["cn"] },
    { source: "Hair", targetStem: "accessory", targetVar: "hairData", locales: ["cn"] },
    { source: "IronTicket", targetStem: "iconticket", targetVar: "iconticketData", locales: ["cn"] },
    { source: "HeadSculpture", targetStem: "headsculpture", targetVar: "headSculptureData", locales: ["cn"] },
    { source: "TitleFrame", targetStem: "titleframe", targetVar: "titleFrameData", locales: ["cn"] },
    { source: "HeadFrame", targetStem: "accessory", targetVar: "headFrameData", locales: ["cn"] },
    { source: "ImpressionShop", targetStem: "shop", targetVar: "imprShopData", locales: ["cn"] },
    { source: "Mod", targetStem: "mod", targetVar: "t", locales: ["cn"] },
    { source: "Monster", targetStem: "monster", targetVar: "monsterData", locales: ["cn"] },
    { source: "MonsterStrongAffixes", targetStem: "monstertag", targetVar: "monsterTagData", locales: ["cn"] },
    { source: "Mount", targetStem: "mount", targetVar: "mountData", locales: ["cn"] },
    { source: "Music", targetStem: "music", targetVar: "musicData", locales: ["cn"] },
    { source: "MusicScore", targetStem: "music", targetVar: "musicScoreData", locales: ["cn"] },
    { source: "Npc", targetStem: "npc", targetVar: "npcData", locales: ["cn"] },
    { source: "OptReward", targetStem: "optreward", targetVar: "optRewardData", locales: ["cn"] },
    // 容器实体表：ExtractionTreasureMechanism 的超集（额外带 UnitBPPath 外形与 SoloTreasureDrop 爆率），故取代前者
    { source: "ExtractionTreasureContainer", targetStem: "solotreasure", targetVar: "extractionTreasureContainerData", locales: ["cn"] },
    { source: "ExtractionTreasure", targetStem: "solotreasure", targetVar: "extractionTreasureData", locales: ["cn"] },
    { source: "ExtractionTreasureBag", targetStem: "solotreasure", targetVar: "extractionTreasureBagData", locales: ["cn"] },
    { source: "SoloTreasure", targetStem: "solotreasure", targetVar: "soloTreasureData", locales: ["cn"] },
    { source: "SoloTreasureGamePlay", targetStem: "solotreasure", targetVar: "soloTreasureGamePlayData", locales: ["cn"] },
    { source: "TreasureHuntProgress", targetStem: "solotreasure", targetVar: "treasureHuntProgressData", locales: ["cn"] },
    { source: "TreasureHuntRepeatDungeon", targetStem: "solotreasure", targetVar: "treasureHuntRepeatDungeonData", locales: ["cn"] },
    { source: "TreasureHuntStoryDungeon", targetStem: "solotreasure", targetVar: "treasureHuntStoryDungeonData", locales: ["cn"] },
    {
        // 光阴集：对话走 Quest 模式（按 id 取文本），不分语言文件——
        // 各语言共用一份中文结构（partyTopicData），名称 / 描述 / 回忆名 / 回忆描述 / 对话的译文
        // 按语言各压成一张 id→文本大表（partyTopicTextTc/En/Fr/Jp/Kr），随同一文件下发，
        // 不进 translations 对照表。转换在导入阶段完成（见 buildPartyTopicDataWithTextTables）。
        source: async () => {
            const { partyTopicData, textTables } = await buildPartyTopicDataWithTextTables()
            return [
                { targetVar: "partyTopicData", value: partyTopicData },
                ...TRANSLATION_LOCALES.map(locale => ({
                    targetVar: PARTY_TOPIC_TEXT_VARS[locale],
                    value: textTables[locale],
                })),
            ]
        },
        targetStem: "partytopic",
        targetVar: "partyTopicData",
    },
    { source: "Pet", targetStem: "pet", targetVar: "t", locales: ["cn"] },
    { source: "PetEntry", targetStem: "pet", targetVar: "petEntrys", locales: ["cn"] },
    {
        // 魔灵潘神：对话走 Quest 模式（按 id 取文本），但不分语言文件——
        // 各语言共用一份中文结构（panData），对话与名称的译文按语言各压成一张 id→文本大表
        // （panDialoguesTc/En/Jp/Kr/Fr），随同一文件下发，不进 translations 对照表。
        // 转换在导入阶段完成（见 buildPanDataWithDialogueTables）。
        source: async () => {
            const { panData, dialogueTables } = await buildPanDataWithDialogueTables()
            return [
                { targetVar: "panData", value: panData },
                ...TRANSLATION_LOCALES.map(locale => ({
                    targetVar: PAN_DIALOGUE_VARS[locale],
                    value: dialogueTables[locale],
                })),
            ]
        },
        targetStem: "pan",
        targetVar: "panData",
    },
    {
        source: async () => {
            // 魔灵潜质抽取权重表（PetToEntry），直读上游 Lua 表
            return [
                {
                    targetVar: "petToEntey",
                    value: await readLuaTable("PetToEntry"),
                },
            ]
        },
        targetStem: "pet",
        targetVar: "petToEntey",
    },
    { source: "QuestChain", targetStem: "questchain", targetVar: "questChainDataRaw", locales: ["cn"] },
    {
        // 任务剧情：对话走 Quest 模式（按 id 取文本），不分语言文件——
        // 各语言共用一份中文结构（questData），任务名 / 任务描述 / 节点名 / 对话 / 说话人 / 选项的译文
        // 按语言各压成一张 id→文本大表（questTextTc/En/Fr/Jp/Kr），随同一文件下发，
        // 不进 translations 对照表。转换在导入阶段完成（见 buildQuestDataWithTextTables）。
        source: async () => {
            const { questData, textTables } = await buildQuestDataWithTextTables()
            return [
                { targetVar: "questData", value: questData },
                ...TRANSLATION_LOCALES.map(locale => ({
                    targetVar: QUEST_TEXT_VARS[locale],
                    value: textTables[locale],
                })),
            ]
        },
        targetStem: "quest",
        targetVar: "questData",
    },
    {
        // 任务剧情 AI 总结：按任务链 ID 记录 AI 生成的整链剧情摘要（目前仅简体中文导出）
        source: "storySummary",
        targetStem: "storysummary",
        targetVar: "storySummaryData",
        locales: ["cn"],
    },
    {
        source: async context => {
            const [raidCalculation, raidDungeon, raidSeason, preRaidRank, reward, raidFloor, raidSeasonFloorMax] = await Promise.all([
                readLuaTable("RaidCalculation"),
                readLuaTable("RaidDungeon"),
                readLuaTable("RaidSeason"),
                readLuaTable("PreRaidRank"),
                readLuaTable("Reward"),
                readLuaTable("RaidFloor"),
                readLuaTable("RaidSeasonFloorMax"),
            ])

            const preRaidRanks = preRaidRank as PreRaidRankRow[]
            const seasons = raidSeason as Record<string, { PreRaidRank?: number }>
            const rewards = reward as Record<string, RewardRow>

            // 当前赛季：导出配置只代表当前赛季状态，取 RaidSeason 中最大赛季
            const currentSeason = Object.keys(seasons)
                .map(Number)
                .sort((a, b) => b - a)[0]
            const currentConfig =
                currentSeason === undefined
                    ? undefined
                    : preRaidRanks.find(row => row.PreRaidRank === seasons[String(currentSeason)]?.PreRaidRank)

            // PreRaidRank：只影响当前赛季，旧赛季保持文件中的原值
            const preRaidRankRecord = literalToValue(findVariableInitializerNode(context.sourceFile, "PreRaidRank")) as Record<
                string,
                PreRaidRankRow
            >
            if (currentSeason !== undefined && currentConfig) {
                preRaidRankRecord[String(currentSeason)] = {
                    IsOnline: currentConfig.IsOnline,
                    PreRaidRank: currentConfig.PreRaidRank,
                    RankName: currentConfig.RankName,
                    RankPercent: currentConfig.RankPercent,
                    RankReward: currentConfig.RankReward,
                }
            }

            return [
                {
                    targetVar: "RaidCalculation",
                    value: raidCalculation,
                },
                {
                    targetVar: "RaidDungeon",
                    value: raidDungeon,
                },
                {
                    targetVar: "RaidSeason",
                    value: raidSeason,
                },
                {
                    targetVar: "RaidFloor",
                    value: raidFloor,
                },
                {
                    targetVar: "RaidSeasonFloorMax",
                    value: raidSeasonFloorMax,
                },
                {
                    targetVar: "PreRaidRank",
                    value: preRaidRankRecord,
                    // 导入 PreRaidRank 时，按当前赛季从奖励表补齐 PreRaidRankRewardVersions 缺失条目
                    augment: () => {
                        if (currentSeason === undefined || !currentConfig) {
                            return null
                        }
                        return augmentPreRaidRankRewardVersions(context.sourceFile, currentSeason, currentConfig, rewards)
                    },
                },
            ]
        },
        targetStem: "raid",
        targetVar: "RaidCalculation",
    },
    {
        source: "RaidBuff",
        targetStem: "raid",
        targetVar: "RaidBuff",
        locales: ["cn"],
        postProcess: value => {
            if (!Array.isArray(value)) {
                throw new Error("RaidBuff 后处理只支持数组源")
            }
            const raidBuff = value.map(v => {
                const { RaidBuffParameter, ...rest } = v
                return rest
            })
            return raidBuff
        },
    },
    {
        source: "Region",
        targetStem: "region",
        targetVar: "t",
        locales: ["cn"],
        postProcess: value => {
            if (!Array.isArray(value)) {
                throw new Error("Region 后处理只支持数组源")
            }
            const nextValue = value.filter(row => !isRecord(row) || row.id !== 3001)
            if (nextValue.length === value.length) {
                // throw new Error("后处理找不到 Region[3001]")
            }
            return nextValue
        },
    },
    { source: "RegionReputation", targetStem: "reputation", targetVar: "reputationData", locales: ["cn"] },
    { source: "Resource", targetStem: "resource", targetVar: "resourceData", locales: ["cn"] },
    { source: "Reward", targetStem: "reward", targetVar: "t", locales: ["cn"] },
    { source: "Review", targetStem: "review", targetVar: "reviewData", locales: ["cn"] },
    { source: "RobotEquip", targetStem: "autochess", targetVar: "robotEquips", locales: ["cn"] },
    {
        source: "RougeLikeBlessing",
        targetStem: "rouge",
        targetVar: "rougeLikeBlessings",
        locales: ["cn"],
    },
    {
        source: "RougeLikeBlessingGroup",
        targetStem: "rouge",
        targetVar: "rougeLikeBlessingGroups",
        locales: ["cn"],
    },
    {
        source: "RougeLikeTalentBranch",
        targetStem: "rouge",
        targetVar: "rougeLikeTalentBranches",
        locales: ["cn"],
    },
    {
        source: "RougeLikeTreasureGroup",
        targetStem: "rouge",
        targetVar: "rougeLikeTreasureGroups",
        locales: ["cn"],
    },
    {
        source: "RougeLikeContract",
        targetStem: "rouge",
        targetVar: "rougeLikeContracts",
        locales: ["cn"],
    },
    {
        source: "RougeLikeRoom",
        targetStem: "rouge",
        targetVar: "rougeLikeRooms",
        locales: ["cn"],
    },
    {
        source: "RougeLikeStoryEvent",
        targetStem: "rouge",
        targetVar: "rougeLikeStoryEvents",
        locales: ["cn"],
    },
    {
        source: "RougeLikeTalent",
        targetStem: "rouge",
        targetVar: "rougeLikeTalents",
        locales: ["cn"],
    },
    {
        source: "RougeLikeTreasure",
        targetStem: "rouge",
        targetVar: "rougeLikeTreasures",
        locales: ["cn"],
    },
    {
        source: "RougePro_Event",
        targetStem: "rouge",
        targetVar: "rougeProEvents",
        locales: ["cn"],
    },
    {
        source: "RougePro_Room",
        targetStem: "rouge",
        targetVar: "rougeProRooms",
        locales: ["cn"],
    },
    {
        source: "RougeProClass",
        targetStem: "rouge",
        targetVar: "rougeProClasses",
        locales: ["cn"],
    },
    {
        source: "RougeProContract",
        targetStem: "rouge",
        targetVar: "rougeProContracts",
        locales: ["cn"],
    },
    {
        source: "RougeProDifficulty",
        targetStem: "rouge",
        targetVar: "rougeProDifficulties",
        locales: ["cn"],
    },
    {
        source: "RougeProEffect",
        targetStem: "rouge",
        targetVar: "rougeProEffects",
        locales: ["cn"],
    },
    {
        source: "RougeProSeason",
        targetStem: "rouge",
        targetVar: "rougeProSeasons",
        locales: ["cn"],
    },
    {
        source: "RougeProTalent",
        targetStem: "rouge",
        targetVar: "rougeProTalents",
        locales: ["cn"],
    },
    {
        source: "RougeProTreasure",
        targetStem: "rouge",
        targetVar: "rougeProTreasures",
        locales: ["cn"],
    },
    {
        source: "RougeProTreasureGroup",
        targetStem: "rouge",
        targetVar: "rougeProTreasureGroups",
        locales: ["cn"],
    },
    { source: "ShopItem", targetStem: "shop", targetVar: "shopData_i", locales: ["cn"] },
    {
        // Skin 改走函数源：上游 Skin.json 自带 bust（见上游 skinModule），此处仅做可 serving
        // 过滤（resolveSkinBust），不做游戏逻辑推导。注意 -f 过滤名由 "Skin" 变为目标 stem
        // "accessory"（函数源按目标文件匹配）。
        source: async () => {
            const skinText = await readFile(path.join(SOURCE_ROOT, "cn", "Skin.json"), "utf-8")
            const skinRows = JSON.parse(skinText) as SkinImportRow[]
            const bustDir = path.resolve(WEB_DIR, "public", "imgs", "bust")
            const bustFileNames = new Set(
                existsSync(bustDir) ? readdirSync(bustDir).filter(name => name.toLowerCase().endsWith(".webp")) : []
            )
            return [
                {
                    targetVar: "skinData",
                    value: skinRows.map(row => resolveSkinBust(row, bustFileNames)),
                },
            ]
        },
        targetStem: "accessory",
        targetVar: "skinData",
    },
    { source: "SkinGacha", targetStem: "skingacha", targetVar: "skinGachaData", locales: ["cn"] },
    { source: "SkinGachaItem", targetStem: "skingacha", targetVar: "skinGachaItems", locales: ["cn"] },
    { source: "SkinGachaTab", targetStem: "skingacha", targetVar: "skinGachaTabs", locales: ["cn"] },
    { source: "SkinGachaType", targetStem: "skingacha", targetVar: "skinGachaTypes", locales: ["cn"] },
    { source: "SkinGachaCumulative", targetStem: "skingacha", targetVar: "skinGachaCumulative", locales: ["cn"] },
    {
        source: async () => {
            return [
                {
                    targetVar: "gachaProbabilities",
                    value: await readLuaTable("GachaProbability"),
                },
            ]
        },
        targetStem: "skingacha",
        targetVar: "gachaProbabilities",
    },
    { source: "SubRegion", targetStem: "subregion", targetVar: "subRegionData", locales: ["cn", "en", "fr", "jp", "kr", "tc"] },
    { source: "Title", targetStem: "title", targetVar: "titleData", locales: ["cn"] },
    { source: "Walnut", targetStem: "walnut", targetVar: "t", locales: ["cn"] },
    { source: "Weapon", targetStem: "weapon", targetVar: "t", locales: ["cn"] },
    { source: "WeaponAccessory", targetStem: "accessory", targetVar: "weaponAccessoryData", locales: ["cn"] },
    { source: "WeaponSkin", targetStem: "accessory", targetVar: "weaponSkinData", locales: ["cn"] },
    { source: "Wiki", targetStem: "wiki", targetVar: "wikiData", locales: ["cn"] },
    {
        source: async () => {
            const seasons = await readLuaTable("AbyssSeason")
            const levels = await readLuaTable("AbyssLevel")

            const seasonRows = Object.values(seasons as Record<string, AbyssSeasonRow>)
                .filter(row => row.AbyssType === 3)
                .sort((a, b) => a.AbyssStartTime - b.AbyssStartTime)

            if (!seasonRows.length) {
                throw new Error("没有找到不朽剧目赛季数据")
            }

            const rules: Record<number, { abyssId: number; levelIds: number[]; initLevels: number[]; levelAddOn: number }> = {}
            for (const season of seasonRows) {
                const levelIds = season.AbyssLevelId
                const levelRows = levelIds.map(levelId => {
                    const levelRow = levels[String(levelId)]
                    if (!levelRow) {
                        throw new Error(`赛季 ${season.AbyssSeasonId} 找不到 AbyssLevel[${levelId}]`)
                    }
                    return levelRow
                })
                const levelAddOns = [...new Set(levelRows.map(row => row.LevelAddOn ?? 0))]
                if (levelAddOns.length !== 1) {
                    throw new Error(`赛季 ${season.AbyssSeasonId} 的 LevelAddOn 不一致: ${levelAddOns.join(",")}`)
                }

                rules[season.AbyssSeasonId] = {
                    abyssId: season.AbyssId,
                    levelIds: [...levelIds],
                    initLevels: levelRows.map(row => row.InitLevel),
                    levelAddOn: levelAddOns[0],
                }
            }

            const defaultSeasonId = seasonRows[seasonRows.length - 1].AbyssSeasonId
            return [
                {
                    targetVar: "immortalMonsterLevelRules",
                    value: rules,
                },
                {
                    targetVar: "defaultImmortalSeasonId",
                    value: defaultSeasonId,
                },
            ]
        },
        targetStem: "abyss",
        targetVar: "immortalMonsterLevelRules",
    },
    {
        source: async () => {
            const [costRules, items, pools] = await Promise.all([
                readLuaTable("LimitedPrizeCostRule"),
                readLuaTable("LimitedPrizeItem"),
                readLuaTable("LimitedPrizePool"),
            ])

            return [
                {
                    targetVar: "limitedPrizeCostRules",
                    value: costRules,
                },
                {
                    targetVar: "limitedPrizeItems",
                    value: items,
                },
                {
                    targetVar: "limitedPrizePools",
                    value: trimLimitedPrizePools(pools),
                },
            ]
        },
        targetStem: "limitedprize",
        targetVar: "limitedPrizeCostRules",
    },
    {
        source: async () => {
            const rows = (await readLuaTable("Condition")) as Record<string, RougeConditionRow>
            const conditions = Object.values(rows).map((row): RougeRoomCondition => {
                const { ConditionId, ConditionLogic, ConditionMap, IsNot, Remark } = row
                return {
                    id: ConditionId,
                    logic: ConditionLogic,
                    map: ConditionMap,
                    isNot: IsNot,
                    remark: Remark,
                }
            })
            conditions.sort((a, b) => a.id - b.id)
            const record: Record<number, RougeRoomCondition> = {}
            for (const condition of conditions) {
                const row: RougeRoomCondition = {
                    id: condition.id,
                    logic: condition.logic,
                    map: condition.map,
                }
                if (condition.isNot !== undefined) {
                    row.isNot = condition.isNot
                }
                if (condition.remark !== undefined) {
                    row.remark = condition.remark
                }
                record[condition.id] = row
            }
            return [
                {
                    targetVar: "conditionsMap",
                    value: record,
                },
            ]
        },
        targetStem: "condition",
        targetVar: "conditionsMap",
    },
    {
        source: async () => {
            const [ironSurvival, ironSurvivalDungeon] = await Promise.all([
                readLuaTable("IronSurvival"),
                readLuaTable("IronSurvivalDungeon"),
            ])

            return [
                {
                    targetVar: "ironSurvivalData",
                    value: ironSurvival,
                },
                {
                    targetVar: "ironSurvivalDungeonData",
                    value: ironSurvivalDungeon,
                },
            ]
        },
        targetStem: "ironsurvival",
        targetVar: "ironSurvivalData",
    },
    {
        source: async () => {
            const drops = (await readLuaTable("MonsterLevelDrop")) as Record<string, MonsterLevelDropRow>
            const record: Record<number, MonsterLevelDropRow> = {}
            for (const [key, row] of Object.entries(drops)) {
                record[Number(key)] = row
            }

            return [
                {
                    targetVar: "monsterLevelDropData",
                    value: record,
                },
            ]
        },
        targetStem: "ironsurvival",
        targetVar: "monsterLevelDropData",
    },
    {
        source: async () => {
            const [swatch, specialSwatch, textMap, resource, globalConstant] = await Promise.all([
                readLuaTable("Swatch"),
                readLuaTable("SpecialSwatch"),
                readLuaTable("TextMap_I18n") as Promise<Record<string, { TextMapContent?: string }>>,
                readLuaTable("Resource"),
                readLuaTable("GlobalConstant") as Promise<Record<string, { ConstantValue?: unknown }>>,
            ])
            const resources = recordValues(resource)
            const resourceNames = new Map(
                resources.map(resource => [String(resource.ResourceId ?? resource.id), String(resource.ResourceName ?? "")])
            )
            const swatches = recordValues(swatch)
                .filter(swatch => Array.isArray(swatch.ColorNumber))
                .map(swatch => {
                    // 历史版本（如 1.1）表里没有 HairResourceID 字段，Number(undefined) 会得到 NaN；
                    // NaN 落进 .data.ts 会写成标识符字面量，工具自身无法回读。统一按 0（无发色染剂）处理。
                    const resourceId = Number(swatch.ResourceID) || 0
                    const hairResourceId = Number(swatch.HairResourceID) || 0
                    return {
                        id: Number(swatch.ColorID),
                        name: translateTextMap(textMap, resourceNames.get(String(resourceId)) || ""),
                        rgb: swatch.ColorNumber,
                        resourceId,
                        hairResourceId,
                        hairResourceName: translateTextMap(textMap, resourceNames.get(String(hairResourceId)) || ""),
                        sort: Number(swatch.Sort) || 0,
                    }
                })
                .sort((left, right) => left.sort - right.sort)
            const specialSwatches = recordValues(specialSwatch)
                .map(swatch => {
                    const resourceId = Number(swatch.ResourceID) || 0
                    return {
                        id: Number(swatch.SepcialColorID),
                        name: translateTextMap(textMap, resourceNames.get(String(resourceId)) || ""),
                        resourceId,
                        materialName: String(swatch.LinkedMaterial ?? ""),
                        materialPath: String(swatch.MaterialPath ?? ""),
                    }
                })
                .sort((left, right) => left.id - right.id)
            const maxColorParts = Number(globalConstant.CharColorPart?.ConstantValue) || 0
            const defaultColorId = Number(globalConstant.CharDefaultColor?.ConstantValue) || 0
            return [
                {
                    targetVar: "skinColorizeSwatches",
                    value: swatches,
                },
                {
                    targetVar: "skinColorizeSpecialSwatches",
                    value: specialSwatches,
                },
                {
                    targetVar: "skinColorizeMaxColorParts",
                    value: maxColorParts,
                },
                {
                    targetVar: "skinColorizeDefaultColorId",
                    value: defaultColorId,
                },
            ]
        },
        targetStem: "skin-colorize",
        targetVar: "skinColorizeSwatches",
    },
    {
        source: async () => {
            const [defence, ironSurvivalDungeon] = await Promise.all([
                readLuaTable("Defence") as Promise<Record<string, Record<string, unknown>>>,
                readLuaTable("IronSurvivalDungeon") as Promise<Record<string, unknown>>,
            ])
            const dungeonIds = new Set(Object.keys(ironSurvivalDungeon))
            const calamity: Record<number, Record<string, unknown>> = {}
            for (const [key, row] of Object.entries(defence)) {
                if (dungeonIds.has(key)) {
                    calamity[Number(key)] = row
                }
            }

            return [
                {
                    targetVar: "defenceData",
                    value: calamity,
                },
            ]
        },
        targetStem: "ironsurvival",
        targetVar: "defenceData",
    },
    {
        // 游戏内文案的多语言对照表：把上游 final/i18n/<locale> 里除简体中文外的各语言数据集
        // 压成「zh-CN 原文 → 目标语言译文」的扁平映射，随数据包一起下发。
        //
        // 上游各语言是**独立数据集**（不是文本表映射），所以中文原文必须从对应语言的同名字段取
        // ——即两个语言包按同一位置遍历得到的字符串才构成一对。简体中文不进表：它是 fallbackLng，
        // 且键与值同形，各语言缺失时由 i18next 回落得到原文。
        //
        // 输出是**全新生成**：当期模块位置配对（数组行按 id，术语字典按索引）+ 别名表
        // （TRANSLATION_ALIASES，展示名按中文正典查 TextMap 现场解析）+ 前端自造展示名
        // （SUPPLEMENTAL_*），完整重写，不读任何存量条目。上游各语言的
        // translation.json（本地生成物，不进版本库，会残留改名旧键）不再参与合并。
        source: async () => {
            const tables = await buildTranslationTables()

            return TRANSLATION_LOCALES.map(locale => ({
                targetVar: TRANSLATION_VARS[locale],
                value: tables[locale],
            }))
        },
        targetStem: "translations",
        targetVar: TRANSLATION_VARS.tc,
        targetVars: TRANSLATION_VARS,
    },
]

/**
 * 解析指定导出的 i18n 源模块。
 *
 * @returns 未指定时返回 null，指定时返回模块名集合
 */
function parseFileTypes(): Set<string> | null {
    const fileTypeIndex = Bun.argv.findIndex(arg => arg === "-f" || arg === "--file-types")
    if (fileTypeIndex < 0) {
        return null
    }

    const fileTypes: string[] = []
    for (const arg of Bun.argv.slice(fileTypeIndex + 1)) {
        if (arg.startsWith("-")) {
            break
        }
        fileTypes.push(arg)
    }
    if (fileTypes.length === 0) {
        throw new Error("-f 需要至少指定一个模块名，例如：-f Weapon")
    }

    const availableFileTypes = new Set(
        MAPPINGS.flatMap(mapping => (typeof mapping.source === "string" ? [mapping.source] : [mapping.targetStem]))
    )
    const unknownFileTypes = fileTypes.filter(fileType => !availableFileTypes.has(fileType))
    if (unknownFileTypes.length > 0) {
        throw new Error(`未知模块：${unknownFileTypes.join(", ")}`)
    }
    return new Set(fileTypes)
}

/**
 * 判断映射是否命中指定的源模块。
 *
 * @param mapping 数据映射
 * @param fileTypes 指定的模块名集合
 * @returns 是否应执行该映射
 */
function shouldProcessMapping(mapping: Mapping, fileTypes: Set<string> | null): boolean {
    if (fileTypes === null) {
        return true
    }
    // 字符串源按源模块名匹配，函数源按目标文件 stem 匹配
    if (typeof mapping.source === "string") {
        return fileTypes.has(mapping.source)
    }
    return fileTypes.has(mapping.targetStem)
}

type MonsterLevelDropRow = {
    BaseProbability: number[]
    EndTime: number
    MonsterLevel: number[]
    MonsterLevelDropId: number
    MonsterLevelDropView: number
    ProbabilityUp: number[]
    RewardId: number[]
    StartTime: number
}

type RougeConditionRow = {
    ConditionId: number
    ConditionLogic: "AND" | "OR"
    ConditionMap: Record<string, unknown>
    IsNot?: boolean
    Remark?: string
}

type RougeRoomCondition = {
    id: number
    logic: "AND" | "OR"
    map: Record<string, unknown>
    isNot?: boolean
    remark?: string
}

/** PreRaidRank 导出行（前端 PreRaidRankItem 的源数据，按 PreRaidRank 配置ID 展开到各赛季） */
type PreRaidRankRow = {
    IsOnline: boolean[]
    PreRaidRank: number
    RankName: string[]
    RankPercent: number[]
    RankReward: number[]
}

/** Reward 奖励表行 */
type RewardRow = {
    Count: number[][]
    Id: number[]
    Mode: string
    RewardId: number
    Type: string[]
}

/** 未映射到任何 data 文件的上游源表（ExtractionTreasureMechanism 已被容器实体表取代） */
const SKIPPED_SOURCES = ["ExtractionTreasureMechanism", "RegionPoint", "RewardView", "translation"]

/**
 * 判断属性名是否可以直接作为标识符输出。
 *
 * 注意：`・`（U+30FB 片假名中点）带 Unicode 属性 ID_Continue，正则会放行，
 * 但 V8 等 JS 解析器不接受它做标识符（曾产出 `黎瑟・浴火的衣饰:` 这种整模块解析失败的坏键）。
 * 因此显式排除，命中时走 JSON.stringify 加引号。
 */
function isIdentifierKey(key: string): boolean {
    return /^[$_\p{ID_Start}][$\u200C\p{ID_Continue}]*$/u.test(key) && !key.includes("・")
}

/**
 * 将任意 JSON 值序列化为 TypeScript 语法。
 */
function formatTsValue(value: unknown, indent = 0): string {
    const pad = "    ".repeat(indent)
    const nextPad = "    ".repeat(indent + 1)

    if (value === null) {
        return "null"
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return "[]"
        }
        const items = value.map(item => `${nextPad}${formatTsValue(item, indent + 1)}`).join(",\n")
        return `[\n${items}\n${pad}]`
    }
    switch (typeof value) {
        case "string":
            return JSON.stringify(value)
        case "number":
        case "boolean":
            return String(value)
        case "object": {
            const entries = Object.entries(value as Record<string, unknown>)
            if (entries.length === 0) {
                return "{}"
            }
            const items = entries
                .map(([key, entryValue]) => {
                    const formattedKey = isIdentifierKey(key) ? key : JSON.stringify(key)
                    return `${nextPad}${formattedKey}: ${formatTsValue(entryValue, indent + 1)}`
                })
                .join(",\n")
            return `{\n${items}\n${pad}}`
        }
        default:
            throw new Error(`不支持的 JSON 值类型: ${String(value)}`)
    }
}

/**
 * 判断任意值是否为普通对象。
 * @param value 待判断的值。
 * @returns 是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * 术语字典字段名：值是「展示名 -> 文本」的字典，且键本身会被翻译（如技能术语名 交响→交響、
 * 奖励名 铜币→銅幣）。这类字典不能按 `target[key]` 取值（键已改名必然 miss，整棵子树全丢），
 * 必须按索引配对键与值。口径对齐上游 create_translation.py 的 FIELD_CONFIG
 * （奖励 / 技能.术语解释 / 技能.字段 这三类字典字段）。
 */
const TERM_DICT_FIELDS = new Set(["奖励", "术语解释", "字段"])

/**
 * 按「同一位置」比较源语言与目标语言的值，收集对照条目。
 *
 * 上游各语言是独立数据集，同一字段在不同语言下只是文本不同、结构一致，
 * 因此按下标/键名同步遍历两侧即可配成条目。
 *
 * ⚠️ 过滤条件只能是「译文与原文完全相同」——上游未翻译的字段就是原样照抄中文
 * （`Char.json` 的 `行为` 脚本串、专有名词等都是这种情况）。
 * **不能**用「译文里含汉字」来判定未翻译：繁体与日文本身就用汉字，
 * 那样会把 zh-TW / ja 的九成以上有效译文误删。
 * @param source 源语言（简体中文）节点。
 * @param target 目标语言节点。
 * @param table 输出对照表。
 * @param parentKey 父字段名（术语字典按索引配对键与值，见 TERM_DICT_FIELDS）。
 */
export function collectTranslationPairs(source: unknown, target: unknown, table: Map<string, string>, parentKey?: string): void {
    if (typeof source === "string") {
        if (typeof target !== "string") {
            return
        }
        if (!source.trim() || !target.trim() || source === target) {
            return
        }
        if (!/[\u4e00-\u9fff]/.test(source)) {
            return
        }
        table.set(source, target)
        return
    }

    if (Array.isArray(source)) {
        if (!Array.isArray(target)) {
            return
        }
        // 上游各语言由同一份 Lua 按同一顺序渲染，数组一律按下标配对：按 id 配对会在同 id 多行
        // （如 Reward 子奖励里 HeadFrame 与 TitleFrame 共用 10041）时以后行覆盖前行，把
        // 「华彩殿堂·闪烁」错配成「華彩殿堂·9」。
        source.forEach((item, index) => collectTranslationPairs(item, target[index], table))
        return
    }

    if (isRecord(source) && isRecord(target)) {
        // 术语字典：键本身是展示名且已被翻译，按索引配对键与值（上游同逻辑，zip 到较短一边）
        if (parentKey !== undefined && TERM_DICT_FIELDS.has(parentKey)) {
            const sourceEntries = Object.entries(source)
            const targetEntries = Object.entries(target)
            const count = Math.min(sourceEntries.length, targetEntries.length)
            for (let index = 0; index < count; index++) {
                const [sourceKey, sourceValue] = sourceEntries[index]
                const [targetKey, targetValue] = targetEntries[index]
                collectTranslationPairs(sourceKey, targetKey, table)
                collectTranslationPairs(sourceValue, targetValue, table, sourceKey)
            }
            return
        }
        for (const [key, item] of Object.entries(source)) {
            collectTranslationPairs(item, target[key], table, key)
        }
    }
}

/**
 * 把别名表的展示名按中文正典查 TextMap 取译文写入对照表（强制覆盖位置配对的结果）。
 * @param table 输出对照表。
 * @param locale 打包语言。
 * @param textMap 官方文本表（TextMap_I18n）。
 */
export function applyTranslationAliases(
    table: Map<string, string>,
    locale: TranslationLocale,
    textMap: Record<string, Record<string, string>>
): void {
    const field = TEXT_MAP_LOCALE_FIELDS[locale]
    const contentIndex = new Map<string, Record<string, string>>()
    for (const row of Object.values(textMap)) {
        const content = row?.TextMapContent
        if (typeof content === "string" && content && !contentIndex.has(content)) {
            contentIndex.set(content, row)
        }
    }
    for (const [key, canonical] of Object.entries(TRANSLATION_ALIASES)) {
        const text =
            contentIndex.get(canonical)?.[field]?.replace("{空格}", " ") ??
            (canonical === key ? undefined : contentIndex.get(key)?.[field]?.replace("{空格}", " "))
        if (!text || text === key) {
            continue
        }
        table.set(key, text)
    }
}

/**
 * 收集称号对照：后缀（`suf: true`）只补缺不覆盖。
 *
 * 英文后缀自带前导空格（" Rebecca"，供游戏内前缀+后缀直接拼接），按文件顺序后写入会把
 * 角色名（Char.json 的 "Rebecca"）等正常翻译覆盖掉；后缀优先级最低，已有键一律保留。
 * 仅后缀行走补缺，前缀与来源文案仍正常写入。
 * @param source 简体中文 Title 行数组。
 * @param target 目标语言 Title 行数组。
 * @param table 输出对照表。
 */
export function collectTitlePairs(source: unknown, target: unknown, table: Map<string, string>): void {
    const rowsOf = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : [])
    const sourceRows = rowsOf(source)
    const targetRows = rowsOf(target)
    const normalSource: unknown[] = []
    const normalTarget: unknown[] = []
    const suffixSource: unknown[] = []
    const suffixTarget: unknown[] = []
    // 各语言同顺序渲染，按下标拆组后相对顺序不变，配对仍正确
    const count = Math.min(sourceRows.length, targetRows.length)
    for (let index = 0; index < count; index++) {
        if (sourceRows[index].suf === true || targetRows[index].suf === true) {
            suffixSource.push(sourceRows[index])
            suffixTarget.push(targetRows[index])
        } else {
            normalSource.push(sourceRows[index])
            normalTarget.push(targetRows[index])
        }
    }
    collectTranslationPairs(normalSource, normalTarget, table)
    const suffixTable = new Map<string, string>()
    collectTranslationPairs(suffixSource, suffixTarget, suffixTable)
    for (const [key, value] of suffixTable) {
        if (!table.has(key)) table.set(key, value.trimStart())
    }
}

/**
 * 生成各语言的「简体中文原文 → 译文」对照表。
 *
 * 输出 = 当期模块位置配对（数组按下标，术语字典按索引，全新生成，不读任何存量条目）
 * + 别名表（TRANSLATION_ALIASES，前端展示名按中文正典查 TextMap 现场解析，强制覆盖）
 * + 前端自造展示名（SUPPLEMENTAL_*，强制覆盖）。translations.data.ts 每次都是完整重写，
 * 上游改名/删文案后旧键自然消失，不再保留（必须保留的请收进上述两处静态声明，显式、可 review）。
 * @returns 打包语言 → 对照表
 */
async function buildTranslationTables(): Promise<Record<TranslationLocale, Record<string, string>>> {
    const tables = {} as Record<TranslationLocale, Record<string, string>>

    for (const locale of TRANSLATION_LOCALES) {
        const table = new Map<string, string>()

        for (const fileName of TRANSLATION_SOURCE_FILES) {
            if (TRANSLATION_EXCLUDED_SOURCES.has(fileName)) {
                continue
            }

            // 上游偶有模块在某种语言下缺失，跳过即可
            const [sourceText, targetText] = await Promise.all([
                readFile(path.join(SOURCE_ROOT, "cn", fileName), "utf8").catch(() => null),
                readFile(path.join(SOURCE_ROOT, locale, fileName), "utf8").catch(() => null),
            ])
            if (!sourceText || !targetText) {
                continue
            }

            if (fileName === "Title.json") {
                collectTitlePairs(JSON.parse(sourceText), JSON.parse(targetText), table)
                continue
            }

            collectTranslationPairs(JSON.parse(sourceText), JSON.parse(targetText), table)
        }

        const textMap = (await readLuaTable("TextMap_I18n")) as Record<string, Record<string, string>>
        const field = TEXT_MAP_LOCALE_FIELDS[locale]

        // 静态存量强制覆盖：引用式（按中文正典查 TextMap 现场解析）+ 逐语言冻结旧值
        applyTranslationAliases(table, locale, textMap)

        // 前端自造展示名：先按官方 TextMapId 取权威译名，再用人工表兜底。
        // 两者都**强制覆盖**——上游按位置比对可能在别的语境下撞出同名键，
        // 这种同名不同义必须以前端明确指定的展示名为准。
        //
        // 但这里的键就是全局翻译键，**与游戏原文同形的词一律不能进表**：
        // 稀有度「白/绿/蓝/紫/金/红」曾按 BackpackResource_RarityN 覆盖，结果把剧情人物「白」
        // 翻成了 White——界面已改为只用色块表示稀有度（见 `src/utils/rarity-utils.ts`），不再需要译文。
        for (const [key, textMapId] of Object.entries(SUPPLEMENTAL_TEXT_MAP_IDS)) {
            const text = textMap[textMapId]?.[field]?.trim()
            if (text) {
                table.set(key, text)
            }
        }

        for (const [key, value] of Object.entries(SUPPLEMENTAL_TRANSLATIONS[locale])) {
            table.set(key, value)
        }

        // 按键排序，保证同样输入产出同样的文件内容（避免无意义的 diff）
        const sorted: Record<string, string> = {}
        for (const key of [...table.keys()].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))) {
            sorted[key] = table.get(key)!
        }

        tables[locale] = sorted
        console.log(`[i18n][translations] ${locale}: ${Object.keys(sorted).length} 条`)
    }

    return tables
}

/**
 * 将游戏导出的对象索引或对象数组统一为行数组。
 * @param value 游戏导出的 JSON 值。
 * @returns 对象行数组。
 */
function recordValues(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.filter(isRecord)
    return isRecord(value) ? Object.values(value).filter(isRecord) : []
}

/** 对话语言 → pan.data.ts 里的 id→文本大表变量名（与 TRANSLATION_VARS 同构） */
const PAN_DIALOGUE_VARS: Record<TranslationLocale, string> = {
    tc: "panDialoguesTc",
    en: "panDialoguesEn",
    jp: "panDialoguesJp",
    kr: "panDialoguesKr",
    fr: "panDialoguesFr",
}

/** 潘神某语言的 id→文本大表：键为对话 id（72xxxxxx）或潘神 id（1xxx，两区间不重叠），值为对应语言文本 */
type PanDialogueTable = Record<number, string>

/**
 * 读取 6 个语言的 Pan.json，产出中文全量结构 + 各语言 id→文本大表。
 *
 * 配对一律按 id（Region 按 Region id，组按 ExploreGroup id，组内对话按对话 id），不依赖数组顺序；
 * 与原文相同的条目（如 `{空格}` 占位行）不进表，调用方查不到时回退中文原文。
 * 潘神名称一并按潘神 id 进表（地图点位标签的多语言显示用），不再另建表。
 * @returns 中文结构与各语言大表（键按数值升序，保证同样输入产出同样的文件内容）
 */
async function buildPanDataWithDialogueTables(): Promise<{
    panData: unknown
    dialogueTables: Record<TranslationLocale, PanDialogueTable>
}> {
    const rowsByLocale = new Map<string, any[]>()
    for (const locale of ["cn", ...TRANSLATION_LOCALES]) {
        const text = await readFile(path.join(SOURCE_ROOT, locale, "Pan.json"), "utf-8")
        rowsByLocale.set(locale, JSON.parse(text))
    }
    const cnRows = rowsByLocale.get("cn") ?? []
    const dialogueTables = {} as Record<TranslationLocale, PanDialogueTable>
    for (const locale of TRANSLATION_LOCALES) {
        const table: PanDialogueTable = {}
        const rowsById = new Map<number, any>((rowsByLocale.get(locale) ?? []).map((row: any) => [row?.id, row]))
        for (const cnRow of cnRows) {
            const row = rowsById.get(cnRow?.id)
            if (!row) {
                continue
            }
            if (typeof row.name === "string" && row.name !== cnRow.name) {
                table[cnRow.id] = row.name
            }
            const groupsById = new Map<number, any>((row.groups ?? []).map((group: any) => [group?.id, group]))
            for (const group of cnRow.groups ?? []) {
                const translatedGroup = groupsById.get(group?.id)
                if (!translatedGroup) {
                    continue
                }
                const dialoguesById = new Map<number, any>(
                    (translatedGroup.dialogues ?? []).map((dialogue: any) => [dialogue?.id, dialogue])
                )
                for (const dialogue of group.dialogues ?? []) {
                    const translated = dialoguesById.get(dialogue?.id)
                    if (translated && typeof translated.content === "string" && translated.content !== dialogue.content) {
                        table[dialogue.id] = translated.content
                    }
                }
            }
        }
        const sorted: PanDialogueTable = {}
        for (const key of Object.keys(table)
            .map(Number)
            .sort((left, right) => left - right)) {
            sorted[key] = table[key]
        }
        dialogueTables[locale] = sorted
    }
    return { panData: cnRows, dialogueTables }
}

/** id→文本大表：键为裸 id（全局唯一的对话 id）或 `${id}#${字段}` 复合键，见各模块构建函数 */
type IdTextTable = Record<string, string>

/**
 * 大表写入：译文非空且与中文不同才收录（与 translations 对照表、Pan 大表同口径）。
 * 中文侧缺字段时只要译文非空就收（上游偶有某语言多出字段，丢了就对不上 locale 文件）。
 * @param table 输出大表
 * @param key 裸 id 或复合键
 * @param cn 中文原文
 * @param translated 目标语言文本
 */
function putIdText(table: IdTextTable, key: string | number, cn: unknown, translated: unknown): void {
    if (typeof translated !== "string" || !translated.trim() || translated === cn) {
        return
    }
    table[String(key)] = translated
}

/**
 * 按字符串序排大表的键，保证同样输入产出同样的文件内容。
 * @param table 未排序的大表
 * @returns 键有序的新表
 */
function sortIdTextTable(table: IdTextTable): IdTextTable {
    const sorted: IdTextTable = {}
    for (const key of Object.keys(table).sort()) {
        sorted[key] = table[key]
    }
    return sorted
}

/**
 * 读某模块 6 个语言的上游数据集（数组或对象索引都行，统一收成行数组）。
 * @param name 上游模块名（如 QuestStory）
 * @returns 语言 → 行数组
 */
async function readI18nRows(name: string): Promise<Map<string, any[]>> {
    const rowsByLocale = new Map<string, any[]>()
    for (const locale of ["cn", ...TRANSLATION_LOCALES]) {
        const text = await readFile(path.join(SOURCE_ROOT, locale, `${name}.json`), "utf-8")
        const parsed = JSON.parse(text)
        rowsByLocale.set(locale, Array.isArray(parsed) ? parsed : Object.values(parsed))
    }
    return rowsByLocale
}

/** 对话语言 → quest.data.ts 里的 id→文本大表变量名（与 TRANSLATION_VARS 同构） */
const QUEST_TEXT_VARS: Record<TranslationLocale, string> = {
    tc: "questTextTc",
    en: "questTextEn",
    jp: "questTextJp",
    kr: "questTextKr",
    fr: "questTextFr",
}

/** 对话语言 → partytopic.data.ts 里的 id→文本大表变量名 */
const PARTY_TOPIC_TEXT_VARS: Record<TranslationLocale, string> = {
    tc: "partyTopicTextTc",
    en: "partyTopicTextEn",
    jp: "partyTopicTextJp",
    kr: "partyTopicTextKr",
    fr: "partyTopicTextFr",
}

/** 对话语言 → charvoice.data.ts 里的 id→文本大表变量名 */
const CHAR_VOICE_TEXT_VARS: Record<TranslationLocale, string> = {
    tc: "charVoiceTextTc",
    en: "charVoiceTextEn",
    jp: "charVoiceTextJp",
    kr: "charVoiceTextKr",
    fr: "charVoiceTextFr",
}

/** 对话语言 → charext.data.ts 里的 id→文本大表变量名 */
const CHAR_EXT_TEXT_VARS: Record<TranslationLocale, string> = {
    tc: "charExtTextTc",
    en: "charExtTextEn",
    jp: "charExtTextJp",
    kr: "charExtTextKr",
    fr: "charExtTextFr",
}

/**
 * 递归收集选项文本（选项可嵌套，统一用 `${选项id}#option` 复合键，不占用对话裸 id 空间）。
 * @param table 输出大表
 * @param cnOptions 中文选项数组
 * @param options 目标语言选项数组
 */
function collectOptionTexts(table: IdTextTable, cnOptions: any, options: any): void {
    const byId = new Map<any, any>((options ?? []).map((option: any) => [option?.id, option]))
    for (const cnOption of cnOptions ?? []) {
        const option = byId.get(cnOption?.id)
        if (!option) {
            continue
        }
        putIdText(table, `${cnOption.id}#option`, cnOption.content, option.content)
        collectOptionTexts(table, cnOption.options, option.options)
    }
}

/**
 * 读 6 个语言的 QuestStory，产出中文全量结构 + 各语言 id→文本大表。
 *
 * 键口径：对话正文用裸对话 id（重复 id 在各语言下内容一致，已逐一验证）；
 * 任务 id 与对话 id 有 274 处数值重叠，任务名 / 任务描述必须用复合键；
 * 选项与说话人同样用复合键；节点名各语言与中文完全相同（2656 个全量比对零差异），
 * 按规则自动跳过，计入以防上游将来翻译它们。
 * @returns 中文结构与各语言大表
 */
async function buildQuestDataWithTextTables(): Promise<{
    questData: unknown
    textTables: Record<TranslationLocale, IdTextTable>
}> {
    const rowsByLocale = await readI18nRows("QuestStory")
    const cnRows = rowsByLocale.get("cn") ?? []
    const textTables = {} as Record<TranslationLocale, IdTextTable>
    for (const locale of TRANSLATION_LOCALES) {
        const table: IdTextTable = {}
        const storiesById = new Map((rowsByLocale.get(locale) ?? []).map(row => [row?.id, row]))
        for (const cnStory of cnRows) {
            const story = storiesById.get(cnStory?.id)
            if (!story) {
                continue
            }
            const questsById = new Map<any, any>((story.quests ?? []).map((quest: any) => [quest?.id, quest]))
            for (const cnQuest of cnStory.quests ?? []) {
                const quest = questsById.get(cnQuest?.id)
                if (!quest) {
                    continue
                }
                putIdText(table, `${cnQuest.id}#name`, cnQuest.name, quest.name)
                putIdText(table, `${cnQuest.id}#desc`, cnQuest.desc, quest.desc)
                const nodesById = new Map<any, any>((quest.nodes ?? []).map((node: any) => [node?.id, node]))
                for (const cnNode of cnQuest.nodes ?? []) {
                    const node = nodesById.get(cnNode?.id)
                    if (!node) {
                        continue
                    }
                    putIdText(table, `${cnNode.id}#name`, cnNode.name, node.name)
                    const questionsById = new Map<any, any>((node.questions ?? []).map((question: any) => [question?.id, question]))
                    for (const cnQuestion of cnNode.questions ?? []) {
                        const question = questionsById.get(cnQuestion?.id)
                        if (!question) {
                            continue
                        }
                        putIdText(table, `${cnQuestion.id}#name`, cnQuestion.name, question.name)
                        putIdText(table, `${cnQuestion.id}#tips`, cnQuestion.tips, question.tips)
                    }
                    const answersById = new Map<any, any>((node.answers ?? []).map((answer: any) => [answer?.id, answer]))
                    for (const cnAnswer of cnNode.answers ?? []) {
                        const answer = answersById.get(cnAnswer?.id)
                        if (!answer) {
                            continue
                        }
                        putIdText(table, `${cnAnswer.id}#name`, cnAnswer.name, answer.name)
                        putIdText(table, `${cnAnswer.id}#desc`, cnAnswer.desc, answer.desc)
                    }
                    const dialoguesById = new Map<any, any>((node.dialogues ?? []).map((dialogue: any) => [dialogue?.id, dialogue]))
                    for (const cnDialogue of cnNode.dialogues ?? []) {
                        const dialogue = dialoguesById.get(cnDialogue?.id)
                        if (!dialogue) {
                            continue
                        }
                        putIdText(table, cnDialogue.id, cnDialogue.content, dialogue.content)
                        putIdText(table, `${cnDialogue.id}#speaker`, cnDialogue.speakerName, dialogue.speakerName)
                        collectOptionTexts(table, cnDialogue.options, dialogue.options)
                    }
                }
            }
        }
        textTables[locale] = sortIdTextTable(table)
    }
    return { questData: cnRows, textTables }
}

/**
 * 读 6 个语言的 PartyTopic，产出中文全量结构 + 各语言 id→文本大表。
 *
 * 键口径：对话正文用裸对话 id（59 组重复 id 内容一致，已验证；另有 3 行对话序列不一致，
 * 故不能按位置配对）；行级名称 / 描述 / 回忆名 / 回忆描述用 `${行id}#${字段}` 复合键。
 * @returns 中文结构与各语言大表
 */
async function buildPartyTopicDataWithTextTables(): Promise<{
    partyTopicData: unknown
    textTables: Record<TranslationLocale, IdTextTable>
}> {
    const rowsByLocale = await readI18nRows("PartyTopic")
    const cnRows = rowsByLocale.get("cn") ?? []
    const textTables = {} as Record<TranslationLocale, IdTextTable>
    for (const locale of TRANSLATION_LOCALES) {
        const table: IdTextTable = {}
        const rowsById = new Map((rowsByLocale.get(locale) ?? []).map(row => [row?.id, row]))
        for (const cnRow of cnRows) {
            const row = rowsById.get(cnRow?.id)
            if (!row) {
                continue
            }
            putIdText(table, `${cnRow.id}#name`, cnRow.name, row.name)
            putIdText(table, `${cnRow.id}#desc`, cnRow.desc, row.desc)
            putIdText(table, `${cnRow.id}#memoryName`, cnRow.memoryName, row.memoryName)
            putIdText(table, `${cnRow.id}#memoryDesc`, cnRow.memoryDesc, row.memoryDesc)
            const dialoguesById = new Map<any, any>((row.dialogues ?? []).map((dialogue: any) => [dialogue?.id, dialogue]))
            for (const cnDialogue of cnRow.dialogues ?? []) {
                const dialogue = dialoguesById.get(cnDialogue?.id)
                if (!dialogue) {
                    continue
                }
                putIdText(table, cnDialogue.id, cnDialogue.content, dialogue.content)
                // 媒体标记（StoryMediaMarker）没有 content，只有 name，用复合键收录
                if (typeof cnDialogue.content !== "string" && typeof cnDialogue.name === "string") {
                    putIdText(table, `${cnDialogue.id}#name`, cnDialogue.name, dialogue.name)
                }
                collectOptionTexts(table, cnDialogue.options, dialogue.options)
            }
        }
        textTables[locale] = sortIdTextTable(table)
    }
    return { partyTopicData: cnRows, textTables }
}

/**
 * 读 6 个语言的 CharVoice，产出中文全量结构 + 各语言 id→文本大表。
 *
 * 键口径：名称与台词共享行 id，一律用 `${行id}#name` / `${行id}#text` 复合键；
 * `res` 是音频资源路径、`hide` / `companioCharId` 是结构字段，不进表。
 * @returns 中文结构与各语言大表
 */
async function buildCharVoiceDataWithTextTables(): Promise<{
    charVoiceData: unknown
    textTables: Record<TranslationLocale, IdTextTable>
}> {
    const rowsByLocale = await readI18nRows("CharVoice")
    const cnRows = rowsByLocale.get("cn") ?? []
    const textTables = {} as Record<TranslationLocale, IdTextTable>
    for (const locale of TRANSLATION_LOCALES) {
        const table: IdTextTable = {}
        const rowsById = new Map((rowsByLocale.get(locale) ?? []).map(row => [row?.id, row]))
        for (const cnRow of cnRows) {
            const row = rowsById.get(cnRow?.id)
            if (!row) {
                continue
            }
            putIdText(table, `${cnRow.id}#name`, cnRow.name, row.name)
            putIdText(table, `${cnRow.id}#text`, cnRow.text, row.text)
        }
        textTables[locale] = sortIdTextTable(table)
    }
    return { charVoiceData: cnRows, textTables }
}

/**
 * 读 6 个语言的 CharDataTarget，产出中文全量结构 + 各语言 id→文本大表。
 *
 * 键口径：名称 / 解锁条件 / 正文共享行 id，一律用 `${行id}#name` / `#unlock` / `#text` 复合键。
 * @returns 中文结构与各语言大表
 */
async function buildCharExtDataWithTextTables(): Promise<{
    charExtData: unknown
    textTables: Record<TranslationLocale, IdTextTable>
}> {
    const rowsByLocale = await readI18nRows("CharDataTarget")
    const cnRows = rowsByLocale.get("cn") ?? []
    const textTables = {} as Record<TranslationLocale, IdTextTable>
    for (const locale of TRANSLATION_LOCALES) {
        const table: IdTextTable = {}
        const rowsById = new Map((rowsByLocale.get(locale) ?? []).map(row => [row?.id, row]))
        for (const cnRow of cnRows) {
            const row = rowsById.get(cnRow?.id)
            if (!row) {
                continue
            }
            putIdText(table, `${cnRow.id}#name`, cnRow.name, row.name)
            putIdText(table, `${cnRow.id}#unlock`, cnRow.unlock, row.unlock)
            putIdText(table, `${cnRow.id}#text`, cnRow.text, row.text)
        }
        textTables[locale] = sortIdTextTable(table)
    }
    return { charExtData: cnRows, textTables }
}

/**
 * 读取本地化文本，缺失时保留原始 key。
 * @param textMap 本地化文本表。
 * @param key 文本 key。
 * @returns 本地化文本。
 */
function translateTextMap(textMap: Record<string, { TextMapContent?: string }>, key: string): string {
    return textMap[key]?.TextMapContent || key
}

/** 上游 Skin.lua 单行（立绘字段 bust 已由上游 skinModule 直接输出，此处不再解析 Lua）。 */
type SkinImportRow = {
    id: number
    icon: string
    bust?: string
    [key: string]: unknown
}

/**
 * 皮肤立绘的可 serving 判定：仅当上游给出的 bust 基名对应文件已落盘
 * （`public/imgs/bust/<基名>.webp`，即皮肤立绘缩略图的实际来源）时保留。
 *
 * 上游 Skin.json 的 bust 表达游戏侧引用关系（BigIcon / 基础皮肤派生），不保证资源已打包：
 * 月石皮等无 bust 的行天然没有立绘；个别 BigIcon 指向资源缺失（如妮弗尔夫人）与主角基础皮肤
 * （无对应立绘文件）的行在此过滤，避免前端拼出 404。新增立绘 webp 后重跑本导入即可带出。
 * 文件名按大小写精确匹配：Windows 开发机不区分大小写，`existsSync` 会把 `T_Bust_SpLise`
 * 误判为存在，而 Linux 对象存储区分大小写，真实文件是 `T_Bust_SPLise`。因此先读目录构造
 * 精确名集合；候选名大小写不一致但能唯一对应到真实文件时，纠正为真实文件名（如 4103）。
 * @param row Skin.json 行
 * @param bustFileNames public/imgs/bust 下精确文件名集合（含 .webp 后缀）
 * @returns 保留落盘 bust 的行（无 bust 时原样返回）
 */
function resolveSkinBust(row: SkinImportRow, bustFileNames: Set<string>): SkinImportRow {
    if (!row.bust) {
        return row
    }
    const fileName = `${row.bust}.webp`
    if (bustFileNames.has(fileName)) {
        return row
    }
    const actual = [...bustFileNames].filter(name => name.toLowerCase() === fileName.toLowerCase())
    if (actual.length === 1) {
        return { ...row, bust: actual[0].slice(0, -".webp".length) }
    }
    const { bust: _dropped, ...rest } = row
    return rest as SkinImportRow
}

/**
 * 在变量初始化表达式中寻找第一个数组或对象字面量。
 */
function findFirstCollectionLiteral(node: ts.Node): ts.ArrayLiteralExpression | ts.ObjectLiteralExpression | null {
    if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) {
        return node
    }
    let found: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression | null = null
    ts.forEachChild(node, child => {
        if (found) {
            return
        }
        const candidate = findFirstCollectionLiteral(child)
        if (candidate) {
            found = candidate
        }
    })
    return found
}

/**
 * 深度比较两个 JSON 兼容值是否完全一致（区分键顺序，保证文件向导出数据收敛）。
 * @param left 现有值。
 * @param right 导出值。
 * @returns 是否一致。
 */
function deepEqual(left: unknown, right: unknown): boolean {
    if (left === right) {
        return true
    }
    // NaN !== NaN，但语义上等价，否则带 NaN 的数据每轮都会被判为「已变更」
    if (typeof left === "number" && typeof right === "number" && Number.isNaN(left) && Number.isNaN(right)) {
        return true
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]))
    }
    if (isRecord(left) && isRecord(right)) {
        const leftKeys = Object.keys(left)
        const rightKeys = Object.keys(right)
        // 键顺序也参与比较：顺序变化同样视为变更，避免文件长期与导出数据不同序
        return (
            leftKeys.length === rightKeys.length &&
            leftKeys.join("\u0000") === rightKeys.join("\u0000") &&
            leftKeys.every(key => deepEqual(left[key], right[key]))
        )
    }
    return false
}

/**
 * 从 AST 字面量节点还原 JS 值，用于与导出数据做语义比较。
 *
 * 目标文件由本工具生成并经 Biome 格式化，仅包含纯 JSON 数据字面量，
 * 遇到其他语法即视为无法比较并抛错。
 *
 * @param node 字面量表达式节点。
 * @returns 还原后的 JS 值。
 */
function literalToValue(node: ts.Node): unknown {
    if (ts.isArrayLiteralExpression(node)) {
        return node.elements.map(element => {
            if (ts.isOmittedExpression(element)) {
                throw new Error("数组字面量包含省略元素，无法还原值")
            }
            return literalToValue(element)
        })
    }
    if (ts.isObjectLiteralExpression(node)) {
        const result: Record<string, unknown> = {}
        for (const property of node.properties) {
            if (!ts.isPropertyAssignment(property)) {
                throw new Error(`对象字面量包含不支持的属性形式: ${ts.SyntaxKind[property.kind]}`)
            }
            const { name } = property
            if (!ts.isIdentifier(name) && !ts.isStringLiteral(name) && !ts.isNumericLiteral(name)) {
                throw new Error(`对象字面量包含不支持的属性名: ${ts.SyntaxKind[name.kind]}`)
            }
            result[name.text] = literalToValue(property.initializer)
        }
        return result
    }
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
        return ts.isNumericLiteral(node) ? Number(node.text) : node.text
    }
    // 负数字面量（如 -1）
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
        const operand = node.operand
        if (ts.isNumericLiteral(operand)) {
            return -Number(operand.text)
        }
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
        return true
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
        return false
    }
    if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.UndefinedKeyword) {
        return null
    }
    // NaN / Infinity 在 TS 里是标识符而非字面量，历史生成结果可能带（如缺失数值字段），需单独还原
    if (ts.isIdentifier(node)) {
        if (node.text === "NaN") {
            return Number.NaN
        }
        if (node.text === "Infinity") {
            return Number.POSITIVE_INFINITY
        }
    }
    throw new Error(`不支持的字面量语法: ${ts.SyntaxKind[node.kind]}`)
}

/**
 * 还原字面量节点，失败时补充目标文件与变量名，便于定位无法比较的数据。
 *
 * @param node 字面量节点。
 * @param filePath 该节点所在文件路径。
 * @param targetVar 该节点所属变量名。
 * @returns 还原后的 JS 值。
 */
function readLiteralOrThrow(node: ts.Node, filePath: string, targetVar: string): unknown {
    try {
        return literalToValue(node)
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`无法还原 ${path.relative(process.cwd(), filePath)} 中 ${targetVar} 的现有值：${reason}`)
    }
}

/**
 * 根据变量名定位目标数组的替换区间对应的字面量节点。
 */
function findReplacementNode(sourceFile: ts.SourceFile, targetVar: string): ts.ArrayLiteralExpression | ts.ObjectLiteralExpression {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) {
                continue
            }
            const collectionNode =
                ts.isArrayLiteralExpression(declaration.initializer) || ts.isObjectLiteralExpression(declaration.initializer)
                    ? declaration.initializer
                    : findFirstCollectionLiteral(declaration.initializer)
            if (!collectionNode) {
                throw new Error(`在 ${sourceFile.fileName} 中找不到 ${targetVar} 的数组或对象字面量`)
            }
            return collectionNode
        }
    }
    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

/**
 * 根据变量名定位变量初始化表达式节点。
 */
function findVariableInitializerNode(sourceFile: ts.SourceFile, targetVar: string): ts.Expression {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) {
                continue
            }
            return declaration.initializer
        }
    }
    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

/**
 * 为 PreRaidRankRewardVersions 补齐缺失赛季的排位奖励条目。
 * 当当前赛季（如 1006）在版本表中缺失时，从 Reward 奖励表查询最新的物品ID
 * （称号框ID 与资源数量）生成 createPreRaidRankReward 条目并插入版本表末尾。
 * @param sourceFile 目标文件 AST。
 * @param season 当前赛季。
 * @param config 当前赛季的 PreRaidRank 配置（含排名名与奖励组ID）。
 * @param rewards Reward 奖励表。
 * @returns 替换区间；无需改动时返回 null。
 */
function augmentPreRaidRankRewardVersions(
    sourceFile: ts.SourceFile,
    season: number,
    config: PreRaidRankRow,
    rewards: Record<string, RewardRow>
): { start: number; end: number; text: string } | null {
    const initializer = findVariableInitializerNode(sourceFile, "PreRaidRankRewardVersions")
    if (!ts.isObjectLiteralExpression(initializer)) {
        throw new Error("PreRaidRankRewardVersions 的初始化表达式必须是对象字面量")
    }

    // 版本表中已存在该赛季则跳过
    for (const property of initializer.properties) {
        if (!ts.isPropertyAssignment(property)) {
            continue
        }
        const existing = Number(property.name.getText(sourceFile).replace(/"/g, ""))
        if (existing === season) {
            return null
        }
    }

    // 从奖励表查询各排名的奖励组内容（称号框ID + 资源数量），构建 createPreRaidRankReward 调用
    const seasonTail = season % 100
    const titleSuffix = seasonTail === 1 ? "" : `·${seasonTail}`
    const calls = config.RankReward.map((rewardId, index) => {
        const reward = rewards[String(rewardId)]
        if (!reward) {
            throw new Error(`PreRaidRank 奖励组 ${rewardId} 不在 Reward 表中`)
        }
        const titleId = extractFirstTitleFrameId(reward)
        const rankName = config.RankName[index] ?? "?"
        const titleName = `${rankName}级狩月人${titleSuffix}`
        const coinCount = extractResourceCount(reward, 220)
        const moduleCount = extractResourceCount(reward, 201)
        const weaponModuleCount = extractResourceCount(reward, 202)
        return `        createPreRaidRankReward(${rewardId}, ${titleId}, ${JSON.stringify(titleName)}, ${coinCount}, ${moduleCount}, ${weaponModuleCount})`
    })

    // 生成当前赛季条目，插入到对象字面量闭合括号之前
    const block = `    ${season}: [\n${calls.join(",\n")}\n    ],`
    const end = initializer.getEnd()
    return { start: end - 1, end: end - 1, text: `\n${block}` }
}

/**
 * 从奖励组中取第一个称号框ID。
 * @param reward 奖励组行。
 * @returns 称号框ID。
 */
function extractFirstTitleFrameId(reward: RewardRow): number {
    const index = reward.Type.indexOf("TitleFrame")
    if (index < 0) {
        throw new Error(`奖励组 ${reward.RewardId} 中找不到 TitleFrame`)
    }
    return reward.Id[index]
}

/**
 * 从奖励组中取指定资源的数量。
 * @param reward 奖励组行。
 * @param resourceId 资源ID。
 * @returns 资源数量。
 */
function extractResourceCount(reward: RewardRow, resourceId: number): number {
    const index = reward.Id.indexOf(resourceId)
    if (index < 0) {
        throw new Error(`奖励组 ${reward.RewardId} 中找不到资源 ${resourceId}`)
    }
    return reward.Count[index]?.[0] ?? 0
}

/**
 * 将单个目标文件中的多个数组替换应用到文本上。
 */
function applyReplacements(fileText: string, replacements: Array<{ start: number; end: number; text: string }>): string {
    let result = fileText
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
        result = `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`
    }
    return result
}

type AbyssSeasonRow = {
    AbyssEndTime: number
    AbyssId: number
    AbyssLevelId: number[]
    AbyssSeasonId: number
    AbyssStartTime: number
    AbyssType: number
}

/**
 * 收集映射会写入的变量名。
 *
 * 每个映射至少写一个变量；带 language-series targetVars 的映射会写多个语言变量。
 * @param mapping 数据映射。
 * @returns 变量名列表（去重）。
 */
function collectMappingVars(mapping: Mapping): string[] {
    const names = [mapping.targetVar, ...Object.values(mapping.targetVars ?? {})]
    return [...new Set(names)]
}

/**
 * 读取函数源的目标文件；文件尚不存在时按映射声明的变量生成空骨架。
 *
 * 函数源第一次运行时目标 data 文件还不存在（如 translations.data.ts），
 * 先落一份空对象字面量让后续的 AST 定位与语义 diff 逻辑可以直接复用。
 * @param filePath 目标文件绝对路径。
 * @param skeletonVars 骨架需要声明的变量名。
 * @returns 目标文件内容。
 */
async function readOrCreateSkeleton(filePath: string, skeletonVars: string[]): Promise<string> {
    try {
        return await readFile(filePath, "utf-8")
    } catch {
        const header = "// 该文件由 tools/import-i18n-data.ts 生成，请勿手工编辑。\n\n"
        const body = skeletonVars.map(name => `export const ${name}: Record<string, string> = {}`).join("\n\n")
        const skeleton = `${header}${body}\n`
        await writeFile(filePath, skeleton, "utf-8")
        return skeleton
    }
}

/**
 * 不交给 Biome 处理的生成文件（相对仓库根目录）。
 *
 * 它们是纯机器生成的字面量，格式已由 formatTsValue 固定；体量也远超 Biome 的
 * maxSize，传进去只会让 biome 报「paths were provided but ignored」而非零退出。
 */
const BIOME_SKIPPED_FILES = new Set(["packages/data/d/translations.data.ts", "packages/data/d/quest.data.ts"])

/**
 * 仅对本次实际写入的文件执行 Biome 格式化，避免全仓库扫描。
 * @param files 本次变更文件的相对路径列表。
 * @returns Biome 非零退出时抛出错误。
 */
async function formatWithBiome(files: string[]): Promise<void> {
    const targets = files.filter(file => !BIOME_SKIPPED_FILES.has(file.replaceAll("\\", "/")))
    if (targets.length === 0) {
        return
    }
    // 通过 process.execPath（即当前 bun 可执行文件）调用 `bun x biome`，规避 Windows 下 .cmd 垫片问题
    const proc = Bun.spawn([process.execPath, "x", "biome", "check", "--write", "--linter-enabled=false", ...targets], {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
        throw new Error(`Biome 格式化失败，退出码 ${exitCode}`)
    }
}

/**
 * 执行导入。
 */
async function main() {
    const fileTypes = parseFileTypes()
    const grouped = new Map<string, Mapping[]>()
    for (const mapping of MAPPINGS) {
        if (typeof mapping.source === "function" || !shouldProcessMapping(mapping, fileTypes)) {
            continue
        }
        const list = grouped.get(mapping.targetStem) ?? []
        list.push(mapping)
        grouped.set(mapping.targetStem, list)
    }

    const updatedFiles: string[] = []
    // 因数据无变化而跳过的变量数量
    let skippedCount = 0

    for (const [targetStem, mappings] of grouped) {
        for (const locale of LOCALES) {
            const targetFile = locale === "cn" ? `${targetStem}.data.ts` : `${targetStem}.${locale}.data.ts`
            const filePath = path.join(TARGET_DIR, targetFile)
            let originalText: string
            try {
                originalText = await readFile(filePath, "utf-8")
            } catch {
                continue
            }

            const sourceFile = ts.createSourceFile(filePath, originalText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
            const replacements: Array<{ start: number; end: number; text: string }> = []

            for (const mapping of mappings) {
                const supportedLocales = mapping.locales ?? ["cn"]
                if (!supportedLocales.includes(locale)) {
                    continue
                }

                const sourcePath = path.join(SOURCE_ROOT, locale, `${mapping.source}.json`)
                const jsonText = await readFile(sourcePath, "utf-8")
                const sourceValue = JSON.parse(jsonText)
                const parsed = mapping.postProcess?.(sourceValue) ?? sourceValue
                const targetVar = mapping.targetVars?.[locale] ?? mapping.targetVar
                const node = findReplacementNode(sourceFile, targetVar)
                // 语义 diff：文件现有值与导出数据一致时跳过
                if (deepEqual(readLiteralOrThrow(node, filePath, targetVar), parsed)) {
                    skippedCount++
                    continue
                }
                replacements.push({
                    start: node.getStart(sourceFile),
                    end: node.getEnd(),
                    text: formatTsValue(parsed, 0),
                })
            }

            if (replacements.length === 0) {
                continue
            }

            const nextText = applyReplacements(originalText, replacements)
            if (nextText !== originalText) {
                await writeFile(filePath, nextText, "utf-8")
                updatedFiles.push(path.relative(process.cwd(), filePath))
            }
        }
    }

    for (const mapping of MAPPINGS) {
        if (typeof mapping.source !== "function" || !shouldProcessMapping(mapping, fileTypes)) {
            continue
        }

        const targetFile = path.join(TARGET_DIR, `${mapping.targetStem}.data.ts`)
        // 函数源的目标文件可能是新引入的（如 translations.data.ts），缺失时先落一份空骨架，
        // 让后续的 AST 定位与语义 diff 逻辑可以原样复用。
        const originalText = await readOrCreateSkeleton(targetFile, collectMappingVars(mapping))
        const sourceFile = ts.createSourceFile(targetFile, originalText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
        const context: MappingContext = { targetFile, originalText, sourceFile }
        const generatedReplacements = await mapping.source(context)
        const replacements: Array<{ start: number; end: number; text: string }> = []
        for (const replacement of generatedReplacements) {
            // 额外文本改写（如按当前赛季从奖励表补齐 PreRaidRankRewardVersions）
            if (replacement.augment) {
                const span = replacement.augment()
                if (span) {
                    replacements.push(span)
                }
            }
            const node = findVariableInitializerNode(sourceFile, replacement.targetVar)
            // 语义 diff：文件现有值与导出数据一致时跳过
            if (deepEqual(readLiteralOrThrow(node, targetFile, replacement.targetVar), replacement.value)) {
                skippedCount++
                continue
            }
            replacements.push({
                start: node.getStart(sourceFile),
                end: node.getEnd(),
                text: formatTsValue(replacement.value, 0),
            })
        }

        if (replacements.length === 0) {
            continue
        }

        const nextText = applyReplacements(originalText, replacements)
        if (nextText !== originalText) {
            await writeFile(targetFile, nextText, "utf-8")
            updatedFiles.push(path.relative(process.cwd(), targetFile))
        }
    }

    console.log(`已更新 ${updatedFiles.length} 个文件`)
    if (skippedCount > 0) {
        console.log(`已跳过 ${skippedCount} 个无变化的变量（未落盘）`)
    }
    for (const file of updatedFiles) {
        console.log(`- ${file}`)
    }

    await formatWithBiome(updatedFiles)

    if (SKIPPED_SOURCES.length > 0) {
        console.log(`已跳过未对应到现有 data 文件的源表：${SKIPPED_SOURCES.join(", ")}`)
    }
}

// 直接执行时才跑导入；被测试 import 时只取纯函数，不触发导入。
if (import.meta.main) {
    main().catch(error => {
        console.error(error)
        process.exit(1)
    })
}
