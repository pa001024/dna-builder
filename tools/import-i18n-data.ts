#!/usr/bin/env bun

import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as ts from "typescript"

/** 同级仓库的默认上游根（与 tools/import-attr-i18n.ts 等兄弟工具一致） */
const DEFAULT_UPSTREAM_ROOT = path.resolve("..", "DuetNightAbyssData2")

/** 命令行 --upstream（最高优先级，与兄弟工具对齐） */
const CLI_UPSTREAM = (() => {
    const index = Bun.argv.indexOf("--upstream")
    return index >= 0 ? Bun.argv[index + 1] : undefined
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
const TARGET_DIR = path.resolve("src", "data", "d")
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
const SUPPLEMENTAL_TEXT_MAP_IDS: Record<string, string> = {
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
    梦魇残声: "MAIN_UI_HARDBOSS",
    委托密函商店: "MAIN_UI_WALNUTBAG",
    // 迷津合作模式 Mod 装备部位：界面显示的是「近战武器 / 远程武器」单数形式，
    // 官方文本表只有整句里出现的这些词，故按装备部位条目的 ID 取权威译名
    近战武器: "UI_BAG_Meleeweapon",
    远程武器: "UI_BAG_Longrange",
    "弓（长弓）": "WeaponType_Bow02",
    "弓（短弓）": "WeaponType_Bow01",
    // 远程武器的基础招式名「射击」：`weapon.data.ts` 里弓/枪类技能的 `名称` 直接用
    // `WeaponSkillType.射击`（枚举值），官方文本表里唯一同形词条就是这条 HUD 提示，按 ID 取权威译名。
    射击: "UI_EventHud_Shoot",
    // 招式字段 `tag` 里的「战技 / 终结技」：上游模块数据集里没有这两个词条，
    // 官方文本表里有独立的同形条目（引导与键位提示用的技能名），按 ID 取权威译名。
    战技: "Guide_HighlightButton_Skill1",
    终结技: "Guide_HighlightButton_Skill2",
    // 剧情占位符 {nickname} / {nickname2} 的主角默认名，官方分别给了独立 ID
    维塔: "PlayerDefaultName",
    墨斯: "ExPlayerDefaultName",
    秽兽: "UI_Archive_Tab_InfectionEnemy",
    神弃者同盟: "UI_Archive_Tab_AllianceEnemy",
    最大耐受: "UI_Mod_CostIncrease",
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
    },
}

/**
 * 上游 i18n 源里承载「零散游戏文案」的各模块数据集。
 *
 * 与 translation.json（已是一张扁平的「中文原文 → 译文」表）不同，这里每个文件都是
 * **按语言独立的数据集**：结构与字段名在简繁/各语言下一致，只有文本值不同。
 * 因此按位置同步遍历两侧，即可把同一字段的简体中文原文与目标语言译文配成对照。
 */
const TRANSLATION_SOURCE_FILES = [
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
    "RewardView.json",
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
    "translation.json",
] as const

/**
 * 不参与对照表生成的模块。
 *
 * 这四个模块在前端已有按语言切分的独立 data 文件（`quest.*.data.ts` / `partytopic.*.data.ts` /
 * `charvoice.*.data.ts` / `charext.*.data.ts`），组件按数据语言直接加载对应数据集，
 * 不经 i18next，因此收进对照表只会白占包体（合计约 3.8MB）。
 * storySummary 只有简体中文，无法构成对照。
 */
const TRANSLATION_EXCLUDED_SOURCES = new Set([
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
        source: "CharDataTarget",
        targetStem: "charext",
        targetVar: "charExtData",
        targetVars: {
            en: "charExtData_en",
            fr: "charExtData_fr",
            jp: "charExtData_jp",
            kr: "charExtData_kr",
            tc: "charExtData_tc",
        },
        locales: ["cn", "en", "fr", "jp", "kr", "tc"],
    },
    {
        source: "CharVoice",
        targetStem: "charvoice",
        targetVar: "charVoiceData",
        targetVars: {
            en: "charVoiceData_en",
            jp: "charVoiceData_jp",
            kr: "charVoiceData_kr",
        },
        locales: ["cn", "en", "jp", "kr"],
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
                // throw new Error("后处理找不到 Event[1030031]")
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
        source: "PartyTopic",
        targetStem: "partytopic",
        targetVar: "partyTopicData",
        targetVars: {
            en: "partyTopicData_en",
            fr: "partyTopicData_fr",
            jp: "partyTopicData_jp",
            kr: "partyTopicData_kr",
            tc: "partyTopicData_tc",
        },
        locales: ["cn", "en", "fr", "jp", "kr", "tc"],
    },
    { source: "Pet", targetStem: "pet", targetVar: "t", locales: ["cn"] },
    { source: "PetEntry", targetStem: "pet", targetVar: "petEntrys", locales: ["cn"] },
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
        source: "QuestStory",
        targetStem: "quest",
        targetVar: "questData",
        targetVars: {
            en: "questData_en",
            fr: "questData_fr",
            jp: "questData_jp",
            kr: "questData_kr",
            tc: "questData_tc",
        },
        locales: ["cn", "en", "fr", "jp", "kr", "tc"],
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
            const [raidCalculation, raidDungeon, raidSeason, preRaidRank, reward] = await Promise.all([
                readLuaTable("RaidCalculation"),
                readLuaTable("RaidDungeon"),
                readLuaTable("RaidSeason"),
                readLuaTable("PreRaidRank"),
                readLuaTable("Reward"),
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
    { source: "Skin", targetStem: "accessory", targetVar: "skinData", locales: ["cn"] },
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
                    value: pools,
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
 */
function isIdentifierKey(key: string): boolean {
    return /^[$_\p{ID_Start}][$\u200C\p{ID_Continue}]*$/u.test(key)
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
 */
function collectTranslationPairs(source: unknown, target: unknown, table: Map<string, string>): void {
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
        source.forEach((item, index) => collectTranslationPairs(item, target[index], table))
        return
    }

    if (isRecord(source) && isRecord(target)) {
        for (const [key, item] of Object.entries(source)) {
            collectTranslationPairs(item, target[key], table)
        }
    }
}

/**
 * 生成各语言的「简体中文原文 → 译文」对照表。
 *
 * 逐个模块比对简体中文与目标语言的数据集：同位置的字符串配成一条对照。
 * 这样名称、描述、技能文本、熔炼文案（含数值的模板句）等**一切非枚举文本**都能覆盖，
 * 不依赖前端是否已经把该字段接到 i18next 上。
 *
 * `translation.json` 是游戏内文本表的权威对照，最后合并以它的译法为准
 * （同一中文在其他模块可能有不同译法，如「外观」）。
 * @returns 打包语言 → 对照表
 */
async function buildTranslationTables(): Promise<Record<TranslationLocale, Record<string, string>>> {
    const tables = {} as Record<TranslationLocale, Record<string, string>>

    for (const locale of TRANSLATION_LOCALES) {
        const table = new Map<string, string>()

        for (const fileName of TRANSLATION_SOURCE_FILES) {
            if (TRANSLATION_EXCLUDED_SOURCES.has(fileName) || fileName === "translation.json") {
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

            collectTranslationPairs(JSON.parse(sourceText), JSON.parse(targetText), table)
        }

        // 权威表最后写入，覆盖其它模块的译法
        const authoritativeText = await readFile(path.join(SOURCE_ROOT, locale, "translation.json"), "utf8").catch(() => null)
        if (authoritativeText) {
            const authoritative = JSON.parse(authoritativeText) as Record<string, unknown>
            for (const [key, value] of Object.entries(authoritative)) {
                if (typeof value === "string" && value.trim() && value !== key && /[\u4e00-\u9fff]/.test(key)) {
                    table.set(key, value)
                }
            }
        }

        // 前端自造展示名：先按官方 TextMapId 取权威译名，再用人工表兜底。
        // 两者都**强制覆盖**——上游按位置比对可能在别的语境下撞出同名键，
        // 这种同名不同义必须以前端明确指定的展示名为准。
        //
        // 但这里的键就是全局翻译键，**与游戏原文同形的词一律不能进表**：
        // 稀有度「白/绿/蓝/紫/金/红」曾按 BackpackResource_RarityN 覆盖，结果把剧情人物「白」
        // 翻成了 White——界面已改为只用色块表示稀有度（见 `src/utils/rarity-utils.ts`），不再需要译文。
        const textMap = (await readLuaTable("TextMap_I18n")) as Record<string, Record<string, string>>
        const field = TEXT_MAP_LOCALE_FIELDS[locale]
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

/**
 * 读取本地化文本，缺失时保留原始 key。
 * @param textMap 本地化文本表。
 * @param key 文本 key。
 * @returns 本地化文本。
 */
function translateTextMap(textMap: Record<string, { TextMapContent?: string }>, key: string): string {
    return textMap[key]?.TextMapContent || key
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
const BIOME_SKIPPED_FILES = new Set(["src/data/d/translations.data.ts"])

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

main().catch(error => {
    console.error(error)
    process.exit(1)
})
