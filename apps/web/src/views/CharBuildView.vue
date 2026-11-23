<script setup lang="ts">
import { type ITourStep, VTour } from "@globalhive/vuejs-tour"
import { useLocalStorage, useMediaQuery } from "@vueuse/core"
import { DNARoleCharsBean, DNARoleShowBean, DNAWeaponBean } from "dna-api"
import { useTranslation } from "i18next-vue"
import { cloneDeep, groupBy } from "lodash-es"
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { buildQuery, createBuildMutation } from "@/api/graphql"
import BuildTabRows, { type BuildTabRowItem } from "@/components/BuildTabRows.vue"
import type { BuildTabCard } from "@/components/BuildTabTooltip.vue"
import CharCalamityWeaponShow from "@/components/CharCalamityWeaponShow.vue"
import CharAssistPanel from "@/components/char-build/CharAssistPanel.vue"
import CharAssistWeaponPanel from "@/components/char-build/CharAssistWeaponPanel.vue"
import CharExtraMasteryPanel from "@/components/char-build/CharExtraMasteryPanel.vue"
import FloatingTargetCard, { type TargetDock } from "@/components/char-build/FloatingTargetCard.vue"
import type { TargetSideState } from "@/components/transcend-build/TranscendTargetPanel.vue"
import { requestBuildTraceIncomes, warmIncomeWorker } from "@/composables/useBuildIncomeWorker"
import { useCharRemote } from "@/composables/useCharRemote"
import {
    addModVariant,
    CharSettings,
    createDefaultCharSettings,
    getModVariantAura,
    getModVariantCount,
    getModVariantSlots,
    MOD_SLOT_COUNTS,
    MOD_SLOT_TYPES,
    type ModSlot,
    type ModSlotType,
    normalizeCharSettings,
    removeLastModVariant,
    type SignatureWeapon,
    serializeCharSettings,
    setModVariantAura,
    useCharSettings,
} from "@/composables/useCharSettings"
import { useExprDrag } from "@/composables/useExprDrag"
import { useGameText } from "@/composables/useGameText"
import {
    addTranscendGearVariant,
    buffData,
    buffMap,
    buildTranscendTeamSides,
    CHAR_SKILL_LEVEL_MIN,
    CharBuild,
    CharBuildTimeline,
    charData,
    charMap,
    formatModName,
    LeveledBuff,
    LeveledChar,
    LeveledCharHelper,
    LeveledModHelper,
    LeveledSkillWeapon,
    LeveledWeapon,
    LeveledWeaponHelper,
    type ModTypeKey,
    modData,
    monsterMap,
    removeTranscendGearVariant,
    serializeCharSettingsForShare,
    switchTranscendGearVariant,
    syncActiveGearVariant,
    type TranscendGearGroup,
    type TranscendSideLoadout,
    type TranscendSlotGroup,
    weaponData,
    weaponMap,
} from "@/data"
import { createBuffSelectContext, isBuffSelectable } from "@/data/buffFilter"
import {
    createBuffFromSettings,
    createBuffLevelResolver,
    resolveSideEffectiveSkillLevels,
    resolveTranscendEffectsForSettings,
} from "@/data/CharBuildHelper"
import { charExtraExcelWeapon } from "@/data/d/charext.data"
import { MaxMonsterLevelLimit } from "@/data/d/const.data"
import { getModBuffLvFromSetting, getWBuffLvFromSetting } from "@/data/effectLv"
import {
    collectPetBuffs,
    collectTraitBuffs,
    getEffectivePetLevel,
    getPetBaseCd,
    getPetTraitByLevel,
    getTraitPetLevelBonus,
    isPetRelatedBuffName,
    normalizeTraitSlots,
    resolvePetCoverage,
    TRAIT_SLOT_COUNT,
    type TraitSlot,
} from "@/data/petTrait"
import type { AssistSide } from "@/data/teamResolver"
import {
    applyTraceBuffOverrides,
    buildTraceRootCards,
    isHiddenLegacyTraceBuff,
    isOwnLegacyTraceBuff,
    resolveTraceOffRoots,
    setTraceRootActive,
    setTraceStackCoverage,
    setTraceStackLevel,
} from "@/data/traceEffects"
import { env } from "@/env"
import { waitForInitialLoad } from "@/i18n"
import { useInvStore } from "@/store/inv"
import { useSettingStore } from "@/store/setting"
import { useTimeline } from "@/store/timeline"
import { useTourStore } from "@/store/tour"
import { useUIStore } from "@/store/ui"
import { copyText, formatBigNumber, pasteText, roundBuffValue } from "@/util"
import {
    convertTopSettingsToAssist,
    createAssistPanelBuild,
    getAssistCharSkills,
    getAssistFacade,
    mapAssistPatch,
    resetAssistForChar,
} from "@/utils/char-assist"
import { applyCharTargetPatch, type CharTeamSnapshot, computeCharTeamSnapshot } from "@/utils/char-team"
import { dataPackBootstrapLoading, dataPackHydrationKey, isDataAvailable } from "@/utils/data-pack/data-pack-bridge"
import { inlineActionsToTimeline } from "@/utils/inlineActionsToTimeline"
import { isModAllowedInSlot, type ModLimitContext } from "@/utils/mod-equip"
import { SKILL_LEVEL_UI_MAX } from "@/utils/skill-level-ui"
import { getTranscendSideLabelKey, getUnlockAllTalentLevels, toggleAllTalentLevels } from "@/utils/transcend-build"
import {
    collectDerivedBuffEntries,
    createDerivedBuffSourceResolver,
    createTranscendEditorSettings,
    createTranscendGainContext,
    mergeSharedCharSettings,
    resolveMainTranscendInjection,
} from "@/utils/transcend-gear/gain-context"
import { setSideGearGroup } from "@/utils/transcend-gear/settings"

// 首屏外组件异步化：弹窗类与次级章节（07-11）内容不进首屏 chunk。
// DOBBuildShow（模板 ref 调方法）、简洁视图与 01-04 章节组件保持同步引入。
const loadAutoBuild = () => import("@/components/AutoBuild.vue")
const loadWeaponListView = () => import("@/components/WeaponListView.vue")
const loadMonsterListView = () => import("@/components/MonsterListView.vue")
const loadAIChatDialog = () => import("@/components/AIChatDialog.vue")
const loadCharActionEditor = () => import("@/components/CharActionEditor.vue")
const loadCharAssistImportDialog = () => import("@/components/char-build/CharAssistImportDialog.vue")
const loadEquipmentPreview = () => import("@/components/EquipmentPreview.vue")
const loadCommentSection = () => import("@/components/CommentSection.vue")
const loadTranscendGearSection = () => import("@/components/transcend-build/TranscendGearSection.vue")
const loadTranscendTalentEditor = () => import("@/components/transcend-build/TranscendTalentEditor.vue")
const AutoBuild = defineAsyncComponent(loadAutoBuild)
// 显式绑定（模板 ref 需要组件实例类型）：运行时仍走同一异步分包
const DOBBuildShow = defineAsyncComponent(() => import("@/components/DOBBuildShow.vue"))
const WeaponListView = defineAsyncComponent(loadWeaponListView)
const MonsterListView = defineAsyncComponent(loadMonsterListView)
const AIChatDialog = defineAsyncComponent(loadAIChatDialog)
const CharActionEditor = defineAsyncComponent(loadCharActionEditor)
const CharAssistImportDialog = defineAsyncComponent(loadCharAssistImportDialog)
const EquipmentPreview = defineAsyncComponent(loadEquipmentPreview)
const CommentSection = defineAsyncComponent(loadCommentSection)
// 升华两个 section 默认关闭且是重组件（库存 / 做装链）：只在 toggle 打开后才加载 chunk
const TranscendGearSection = defineAsyncComponent(loadTranscendGearSection)
const TranscendTalentEditor = defineAsyncComponent(loadTranscendTalentEditor)

//#region 角色
const inv = useInvStore()
const setting = useSettingStore()
const ui = useUIStore()
const route = useRoute()
const tourStore = useTourStore()
const { t, i18next } = useTranslation()
const { gt } = useGameText()
const dataPackTick = computed(() => dataPackHydrationKey.value)
const isCharBuildReady = computed(() => {
    dataPackTick.value
    // 用「数据可用」而非「水合过」做判断：DD2 形态（DISABLE_REWRITE=1）跳过水合直读源码数据，
    // 此时同样有数据，绝不能落到占位对象上。
    return isDataAvailable() && !!charMap.get(+route.params.charId)
})

/**
 * 创建数据包未就绪时使用的空构筑占位对象。
 * @returns 空构筑对象
 */
function createEmptyCharBuild() {
    return {
        char: {
            id: 0,
            名称: selectedChar.value || "",
            属性: "",
            技能: [],
            加成: {},
            精通: [],
            url: "",
        },
        meleeWeapon: { url: "", _originalWeaponData: { icon: "" }, isEmpty: true },
        rangedWeapon: { url: "", _originalWeaponData: { icon: "" }, isEmpty: true },
        skillWeapon: undefined,
        skillWeaponSkills: [],
        selectedSkillType: "角色",
        selectedSkill: undefined,
        skills: [],
        charSkills: [],
        targetFunction: "",
        isWeaponForgeEffective: () => true,
        validateAST: () => "",
        validateCustomVariable: () => "",
        calculateAttributes: () => ({}),
        calculate: () => 0,
        getIdentifierNames: () => [],
    } as unknown as CharBuild
}

// 路由
const selectedChar = computed(() => {
    dataPackTick.value
    return charMap.get(+route.params.charId)?.名称 || ""
})
const selectedCharId = computed(() => +route.params.charId)

/**
 * 解析角色专武（签名武器）信息。
 * @param charId 角色 id
 * @returns 专武 id 与所在槽位类型（近战/远程）；角色无专武或数据缺失时返回 null
 */
function getSignatureWeapon(charId: number): SignatureWeapon | null {
    const char = charMap.get(charId)
    if (!char?.专武) return null
    const weapon = weaponData.find(item => item.id === char.专武)
    if (!weapon) return null
    const type = weapon.类型[0]
    if (type !== "近战" && type !== "远程") return null
    return { id: char.专武, type }
}

const charSettings = useCharSettings(selectedCharId, getSignatureWeapon)
const charRemoteId = useCharRemote(selectedCharId)
const charProjectKey = computed(() => `project.${selectedCharId.value}`)
const charProject = useLocalStorage(charProjectKey, {
    selected: "",
    projects: [] as { name: string; charSettings: typeof charSettings.value }[],
})

// 获取实际数据
const charOptions = computed(() => {
    dataPackTick.value
    return charData.map(char => ({
        value: char.名称,
        label: char.名称,
        elm: char.属性,
        icon: LeveledChar.url(char.icon),
    }))
})
const modOptions = computed(() => {
    dataPackTick.value
    return modData
        .map(mod => ({
            value: mod.id,
            label: mod.名称,
            quality: mod.品质,
            type: mod.类型,
            limit: mod.属性 || mod.限定,
            ser: mod.系列,
            count: Math.min(inv.getModCount(mod.id, mod.品质), mod.系列 !== "契约者" ? 8 : 1),
            bufflv: getBuffLv(mod.id),
            lv: inv.getModLv(mod.id, mod.品质),
        }))
        .filter(mod => mod.count)
})

/**
 * 游戏内魔之楔面板的线性返回顺序。
 * 参考 GameStyleModView 的布局，按构筑页槽位记录对应的接口索引。
 */
const GAME_STYLE_MOD_SLOT_ORDER = [0, 2, 3, 1, 6, 4, 7, 5, 8] as const

/**
 * 将游戏接口返回的魔之楔列表重排为构筑页槽位顺序。
 * @param modes 游戏接口返回的模块数组
 * @returns 按构筑页槽位重排后的数组
 */
function reorderGameStyleModes<T>(modes: T[]): (T | null)[] {
    return GAME_STYLE_MOD_SLOT_ORDER.map(index => modes[index] ?? null)
}
/** 主控有效技能等级（基础 + 升华词条）：等级来源 BUFF 的只读等级 */
const mainSkillLevels = computed(() => resolveSideEffectiveSkillLevels(charSettings.value, "main", selectedCharId.value))
/** 等级来源 BUFF 的等级解析（表达式引用队友技能时取来源侧等级） */
const resolveBuffLevel = computed(() => createBuffLevelResolver(charSettings.value, "main", selectedCharId.value, mainSkillLevels.value))

const _buffOptions = reactive(
    buffData.map(buff => ({
        buff,
        value: createBuffFromSettings(buff.名称, buff.mx || 1, charSettings.value.customBuff),
        label: buff.名称,
        limit: buff.限定,
        description: buff.描述,
    }))
)
const buffOptions = computed(() => {
    dataPackTick.value
    const ctx = createBuffSelectContext({
        charElm: charBuild.value.char.属性,
        mainIds: [selectedCharId.value, charBuild.value.meleeWeapon?.id, charBuild.value.rangedWeapon?.id].filter(
            (id): id is number => typeof id === "number" && id > 0
        ),
        phantomIds: [
            charMap.get(charSettings.value.team1)?.id,
            charMap.get(charSettings.value.team2)?.id,
            charSettings.value.team1Weapon,
            charSettings.value.team2Weapon,
        ].filter((id): id is number => typeof id === "number"),
    })
    return (
        _buffOptions
            // 魔灵相关 BUFF（魔灵潜质 / 魔灵被动物 / 魔灵主动技）由魔灵面板与潜质槽位接管：
            // 从 BUFF 列表中移除，避免同一潜质或同一魔灵技能被重复叠加
            .filter(v => !isPetRelatedBuffName(v.label))
            // 已由溯源区接管 / 旧存档兼容的 `*溯` 条目从通用选择器隐藏
            .filter(v => !isHiddenLegacyTraceBuff(v.label))
            .filter(v => isBuffSelectable(v.buff, ctx))
            .map(v => {
                const b = charSettings.value.buffs.find(b => b[0] === v.label)
                const storedLv = b?.[1] ?? v.value.等级
                const coverage = b?.[2] ?? 1
                const value = createBuffFromSettings(v.label, storedLv, charSettings.value.customBuff, coverage, resolveBuffLevel.value)
                return {
                    value,
                    label: v.label,
                    limit: v.limit,
                    description: v.description,
                    lv: value.等级,
                    coverage,
                    buff: v.buff,
                }
            })
    )
})
// 近战和远程武器选项（team1/team2 助战武器，值统一为武器 id）
const meleeWeaponOptions = computed(() => {
    dataPackTick.value
    return weaponData
        .filter(weapon => weapon.类型[0] === "近战")
        .map(weapon => ({
            value: weapon.id,
            label: weapon.名称,
            type: weapon.类型[1],
            icon: LeveledWeapon.url(weapon.icon),
        }))
})
const rangedWeaponOptions = computed(() => {
    dataPackTick.value
    return weaponData
        .filter(weapon => weapon.类型[0] === "远程")
        .map(weapon => ({
            value: weapon.id,
            label: weapon.名称,
            type: weapon.类型[1],
            icon: LeveledWeapon.url(weapon.icon),
        }))
})

// 状态变量
const useGlobalEffects = () => charSettings.value.useGlobal
const effectConfig = () => charSettings.value.effectConfig || {}
const getBuffLv = (modId: number) => (useGlobalEffects() ? inv.getBuffLv(modId) : getModBuffLvFromSetting(effectConfig(), modId))
const getWBuffLv = (weaponId: number, elm: string) =>
    useGlobalEffects() ? inv.getWBuffLv(weaponId, elm) : getWBuffLvFromSetting(effectConfig(), weaponId, elm)
/**
 * 读取当前激活的 MOD 变体槽位（可直接写入）。
 * 变体 A 即 charMods 等既有字段，变体 B/C 存放在 charSettings.modVariants 中。
 * @param type 槽位类型
 * @returns 该类型的槽位数组
 */
function activeModSlots(type: ModSlotType) {
    return getModVariantSlots(charSettings.value, type)
}

/**
 * 把 MOD 变体的槽位实例化为可展示的魔之楔列表。
 * @param type 槽位类型
 * @returns 与槽位等长的魔之楔列表（空槽为 null）
 */
function readActiveMods(type: ModSlotType) {
    dataPackTick.value
    return activeModSlots(type).map(v => (v ? LeveledModHelper.optionalFromId(v[0], v[1], getBuffLv(v[0])) : null))
}

const selectedCharMods = computed(() => readActiveMods("角色"))
const selectedMeleeMods = computed(() => readActiveMods("近战"))
const selectedRangedMods = computed(() => readActiveMods("远程"))
const selectedSkillWeaponMods = computed(() => readActiveMods("同律"))
/** 当前激活的 MOD 变体索引（0/1/2 ↔ 配置 A/B/C），四个 MOD 编辑器共用同一份变体 */
const activeModVariant = computed(() => charSettings.value.modVariantIndex)
/** 已有 MOD 变体数量（1-3） */
const modVariantCount = computed(() => getModVariantCount(charSettings.value))
/** 当前激活变体的中枢魔之楔（光环）id：中枢随 MOD 配置一起切换 */
const activeAuraMod = computed(() => getModVariantAura(charSettings.value))
const selectedBuffs = computed(() => {
    dataPackTick.value
    const buffs = charSettings.value.buffs
        // 本角色已由溯源区接管的旧 `*溯` 条目不再单列；其他角色的旧条目保留手选能力
        .filter(([name]) => !isOwnLegacyTraceBuff(name, selectedCharId.value))
        .map(v => {
            try {
                return createBuffFromSettings(v[0], v[1], charSettings.value.customBuff, v[2], resolveBuffLevel.value)
            } catch (error) {
                console.error(error)
                charSettings.value.buffs = charSettings.value.buffs.filter(b => b[0] !== v[0])
                return null
            }
        })
        .filter(b => b !== null)
    // 溯源规则覆盖同名手动 BUFF 的字段：列表展示值与构筑实际计算值保持一致（如 菲娜被动(团队) 45%）。
    // 与工厂同源走 `resolveTranscendEffectsForSettings`，规则判定 `skillLevel` 条件时同样带上升华增量
    const overrides = resolveTranscendEffectsForSettings(charSettings.value, "main", {
        charId: selectedCharId.value,
        charElement: charMap.get(selectedCharId.value)?.属性,
        teamSides: buildTranscendTeamSides(charSettings.value, selectedCharId.value),
    }).buffOverrides
    return applyTraceBuffOverrides(buffs, overrides)
})

const team1Options = computed(() => [
    { value: "-" as number | "-", label: "无", elm: "", icon: `/imgs/1.png` },
    ...charOptions.value
        .map(char => ({
            value: (charMap.get(char.value)?.id ?? "-") as number | "-",
            label: char.label,
            elm: char.elm,
            icon: char.icon,
        }))
        .filter(char => char.value !== selectedCharId.value && char.value !== charSettings.value.team2),
])
const team2Options = computed(() => [
    { value: "-" as number | "-", label: "无", elm: "", icon: `/imgs/1.png` },
    ...charOptions.value
        .map(char => ({
            value: (charMap.get(char.value)?.id ?? "-") as number | "-",
            label: char.label,
            elm: char.elm,
            icon: char.icon,
        }))
        .filter(char => char.value !== selectedCharId.value && char.value !== charSettings.value.team1),
])

const teamWeaponOptions = computed(() => [
    { value: "-" as number | "-", label: "无", type: "", icon: `/imgs/1.png` },
    ...meleeWeaponOptions.value,
    ...rangedWeaponOptions.value,
])
const hpPercentOptions = [1, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 5)]
const resonanceGainOptions = [0, 0.5, 1, 1.5, 2, 2.5, 3]
const enemyResistanceOptions = [0, 0.5, -4]
const enemyLevelOptions = Array.from({ length: MaxMonsterLevelLimit }, (_, i) => i + 1)
const groupedTeam1Options = computed(() => groupBy(team1Options.value, "elm"))
const groupedTeam2Options = computed(() => groupBy(team2Options.value, "elm"))
const groupedTeamWeaponOptions = computed(() => groupBy(teamWeaponOptions.value, "type"))

const getInlineActions = () => {
    const raw = inlineActionsToTimeline(charSettings.value.actions, selectedChar.value)
    return CharBuildTimeline.fromRaw(raw)
}

//#region 魔灵与潜质
/** 潜质槽位对应的魔灵潜质 BUFF：与 BUFF 列表共用同一套加成汇总、收益与来源展示逻辑 */
const traitBuffs = computed(() => collectTraitBuffs(charSettings.value.traits))
/** 所选魔灵生效的被动物 / 主动技 BUFF（等级含潜质加成，主动按覆盖率缩放） */
const petBuffs = computed(() => collectPetBuffs(charSettings.value.petId, effectivePetLevel.value, effectivePetCoverage.value))
/** 魔灵生效技能等级（技能数值索引）= 突破等级 + 潜质加成（如「老道」+1） */
const effectivePetLevel = computed(() => getEffectivePetLevel(charSettings.value.petLevel, charSettings.value.traits))
/** 魔灵主动技生效覆盖率：自动按「持续时间 / 实际冷却」折算，手动用设置值 */
const effectivePetCoverage = computed(() =>
    resolvePetCoverage(
        charSettings.value.petId,
        effectivePetLevel.value,
        charSettings.value.traits,
        charSettings.value.petCoverage,
        charSettings.value.petAutoCoverage
    )
)
/** 潜质带来的魔灵技能等级加成（用于魔灵面板标注等级来源） */
const petLevelBonus = computed(() => getTraitPetLevelBonus(charSettings.value.traits))

// 创建CharBuild实例
/** 队友限定升华 BUFF 的三侧上下文：主控 id 取页面角色，协战 id / 启用位取 team1/team2 与 assistN */
const transcendTeamSides = computed(() => buildTranscendTeamSides(charSettings.value, selectedCharId.value))

const charBuild = computed(() => {
    dataPackTick.value
    if (!isCharBuildReady.value) {
        return createEmptyCharBuild()
    }
    try {
        const char = LeveledCharHelper.fromId(selectedChar.value, charSettings.value.charLevel)
        const melee = LeveledWeaponHelper.fromId(
            charSettings.value.meleeWeapon,
            charSettings.value.meleeWeaponRefine,
            charSettings.value.meleeWeaponLevel,
            getWBuffLv(charSettings.value.meleeWeapon, char.属性)
        )
        const ranged = LeveledWeaponHelper.fromId(
            charSettings.value.rangedWeapon,
            charSettings.value.rangedWeaponRefine,
            charSettings.value.rangedWeaponLevel,
            getWBuffLv(charSettings.value.rangedWeapon, char.属性)
        )
        // 主控升华注入：总开关关闭时为空（天赋 + 主控装备）；顺序与工厂同口径
        const transcendInjection = resolveMainTranscendInjection({
            transcend: charSettings.value.transcend,
            charId: selectedCharId.value,
            charElement: char.属性,
            charSkillLevel: charSettings.value.charSkillLevel,
            buffs: [...selectedBuffs.value, ...traitBuffs.value, ...petBuffs.value],
            teamSides: transcendTeamSides.value,
            traceSettings: charSettings.value,
        })
        const b = new CharBuild({
            char,
            auraMod: LeveledModHelper.fromId(getModVariantAura(charSettings.value)),
            charMods: selectedCharMods.value,
            meleeMods: selectedMeleeMods.value,
            rangedMods: selectedRangedMods.value,
            skillMods: selectedSkillWeaponMods.value,
            skillLevel: transcendInjection.skillLevel,
            // 魔灵（被动物 / 主动技）与魔灵潜质以 BUFF 形式附加在 BUFF 列表之后，共用加成汇总与来源展示
            buffs: transcendInjection.buffs,
            // 角色属性「魔灵CD」按所选魔灵主动技的原始冷却折算成秒
            petBaseCd: getPetBaseCd(charSettings.value.petId),
            melee,
            ranged,
            baseName: charSettings.value.baseName,
            imbalance: charSettings.value.imbalance,
            hpPercent: charSettings.value.hpPercent,
            resonanceGain: charSettings.value.resonanceGain,
            enemyId: charSettings.value.enemyId,
            enemyLevel: charSettings.value.enemyLevel,
            enemyResistance: charSettings.value.enemyResistance,
            targetFunction: charSettings.value.targetFunction,
            customVariables: charSettings.value.customVariables,
            timeline: charSettings.value.actions?.enable ? getInlineActions() : getTimelineByName(charSettings.value.baseName),
            teamWeapons: [charSettings.value.team1Weapon, charSettings.value.team2Weapon],
            extraMastery: char.额外精通?.includes(charSettings.value.extraMastery) ? charSettings.value.extraMastery : "",
            dotSettings: charSettings.value.dotSettings,
            // 升华词条派生的技能替换：角色技能与同律武器共用
            skillReplacements: transcendInjection.skillReplacements,
            // 收益计算把它带到 worker：wasm 直接用同一份配置复现构筑
            settings: charSettings.value,
        })
        return b
    } catch (e) {
        console.error(e)
        localStorage.removeItem(`build.${selectedCharId.value}`)
        return createEmptyCharBuild()
    }
})

/** buff 栏只读派生条目（升华装备 / 天赋 / 队友来源）：不写入 settings.buffs，随构筑重建自动增删 */
const derivedBuffs = computed(() =>
    collectDerivedBuffEntries(
        charBuild.value.buffs,
        charSettings.value.buffs.map(buff => buff[0]),
        { resolveSourceName: createDerivedBuffSourceResolver(charSettings.value, gt, i18next.language) }
    )
)

/** 溯源条目视图：每侧每根源一行（含关闭的根源，点击切换；等级 / 覆盖率与 BUFF 行一致） */
interface TraceCardView {
    side: "main" | "assist1" | "assist2"
    root: number
    active: boolean
    charId: number
    charName: string
    charIcon: string
    titleKey: string
    description: string
    buff: LeveledBuff
    income: number
    mx: number
    level: number
    coverage: number
    hasAttrs: boolean
}

/** 各构筑位角色 id（协战取 teamN，主控取当前页面角色） */
const traceSideCharIds = computed(() => ({
    main: selectedCharId.value,
    assist1: charMap.get(charSettings.value.team1)?.id ?? 0,
    assist2: charMap.get(charSettings.value.team2)?.id ?? 0,
}))

/**
 * 溯源条目：每侧每个根源一行，数值由 `buildTraceRootCards` 按当前激活集合求值，
 * 描述取 `char.溯源[n-1]` 游戏原文；收益在下面 worker 请求完成后并入。
 */
const traceCardItems = computed<Omit<TraceCardView, "income">[]>(() => {
    dataPackTick.value
    const charIds = traceSideCharIds.value
    const cards: Omit<TraceCardView, "income">[] = []
    for (const side of ["main", "assist1", "assist2"] as const) {
        const charId = charIds[side]
        if (charId <= 0) continue
        const char = charMap.get(charId)
        for (const card of buildTraceRootCards(charSettings.value, side, { charId })) {
            // 技能等级三键已并入 card.attrs（与构筑属性面板同源），不再单独合并
            const attr: Record<string, number> = { ...card.attrs }
            cards.push({
                side,
                root: card.root,
                active: card.active,
                charId,
                charName: gt(char?.名称 ?? ""),
                charIcon: char ? LeveledChar.url(char.icon) : "",
                titleKey: `char-build.root_${card.root}`,
                description: gt(char?.溯源?.[card.root - 1] ?? ""),
                buff: new LeveledBuff(
                    {
                        名称: `char-build.root_${card.root}`,
                        描述: "",
                        attr,
                        ...(card.mx > 1 ? { mx: card.mx, lx: 1 } : {}),
                    },
                    1
                ),
                mx: card.mx,
                level: card.level,
                coverage: card.coverage,
                hasAttrs: Object.keys(card.attrs).length > 0,
            })
        }
    }
    return cards
})

/** 溯源卡片收益（key = `${side}:${root}`），由 worker 在设置变化后 debounce 计算 */
const traceIncomes = ref<Record<string, number>>({})

/** 传给 BuffSectionBody 的溯源条目（收益为空时按 0 处理，行内不显示收益） */
const traceCards = computed<TraceCardView[]>(() =>
    traceCardItems.value.map(card => ({
        ...card,
        income: traceIncomes.value[`${card.side}:${card.root}`] ?? 0,
    }))
)

/** 待求收益的卡片条目（不含收益，避免收益回写再次触发 watcher） */
const traceIncomeItems = computed(() =>
    traceCardItems.value.map(card => ({ key: `${card.side}:${card.root}`, side: card.side, root: card.root, active: card.active }))
)

let traceIncomeTimer: ReturnType<typeof setTimeout> | undefined
let traceIncomeRequestId = 0

/** 设置变化后 debounce 请求溯源收益：每次最多 根源数 × 3 次重建，全部在 worker 内完成 */
function scheduleTraceIncomes(): void {
    // 卡片状态 / 设置已变：先清空旧收益，避免显示与当前开关相反的数值（worker 回包后覆盖）
    traceIncomes.value = {}
    if (traceIncomeTimer) clearTimeout(traceIncomeTimer)
    traceIncomeTimer = setTimeout(() => {
        traceIncomeTimer = undefined
        const items = traceIncomeItems.value
        if (!items.length || !isCharBuildReady.value) return
        const id = ++traceIncomeRequestId
        requestBuildTraceIncomes({
            // worker 需要可结构化克隆的纯数据：settings 用 JSON 洗消后下发（不再携带构筑快照）
            settings: JSON.parse(JSON.stringify(charSettings.value)),
            charId: selectedCharId.value,
            items,
        })
            .then(result => {
                if (id !== traceIncomeRequestId) return
                traceIncomes.value = result
            })
            .catch(error => console.error("溯源收益worker计算失败", error))
    }, 300)
}

onBeforeUnmount(() => {
    if (traceIncomeTimer) clearTimeout(traceIncomeTimer)
})

/**
 * 切换某构筑位某根源的激活状态：只写 `traceOffRoots`，构筑 computed 随设置变化重算。
 * @param side 构筑位
 * @param root 根源序号
 */
function toggleTrace(side: "main" | "assist1" | "assist2", root: number): void {
    const charId = traceSideCharIds.value[side]
    const target = side === "main" ? charSettings.value : charSettings.value[side]
    if (!target) return
    const active = !resolveTraceOffRoots(target.traceOffRoots, target.traceLevel, charId).includes(root)
    target.traceOffRoots = setTraceRootActive(target, root, !active, charId)
    // 卡片立即翻转：先清空旧收益，避免 debounce 窗口内显示与开关状态相反的数值
    traceIncomes.value = {}
}

/**
 * 设置某构筑位某根源的生效等级：只写 `traceStacks`，构筑 computed 随设置变化重算。
 * @param side 构筑位
 * @param root 根源序号
 * @param level 生效等级 1..mx
 */
function setTraceLevel(side: "main" | "assist1" | "assist2", root: number, level: number): void {
    const charId = traceSideCharIds.value[side]
    const target = side === "main" ? charSettings.value : charSettings.value[side]
    if (!target) return
    target.traceStacks = setTraceStackLevel(target, root, level, charId)
    traceIncomes.value = {}
}

/**
 * 设置某构筑位某根源的覆盖率：只写 `traceStacks`，构筑 computed 随设置变化重算。
 * @param side 构筑位
 * @param root 根源序号
 * @param coverage 覆盖率 0-1
 */
function setTraceCoverage(side: "main" | "assist1" | "assist2", root: number, coverage: number): void {
    const charId = traceSideCharIds.value[side]
    const target = side === "main" ? charSettings.value : charSettings.value[side]
    if (!target) return
    target.traceStacks = setTraceStackCoverage(target, root, coverage, charId)
    traceIncomes.value = {}
}

/**
 * 按槽位过滤 MOD 选项：类型 / 属性 / 限定走 CharBuild.isModSlotCompatible 同一口径。
 * @param key MOD 槽位类型
 * @returns 该槽位可选的 MOD 选项
 */
function filterModOptionsBySlot(key: ModTypeKey) {
    const rawById = new Map(modData.map(mod => [mod.id, mod]))
    return modOptions.value.filter(option => {
        const raw = rawById.get(option.value)
        if (!raw) return false
        // 中枢光环（羽蛇）随角色槽选项下发、由光环下拉使用，不占用普通槽位；仍需按属性 / 限定过滤
        if (key === "charMods" && raw.系列 === "羽蛇") return charBuild.value.isAuraCompatible(raw)
        return charBuild.value.isModSlotCompatible(raw, key)
    })
}

/**
 * 当前选中技能在技能等级三元组中的下标：0→E，1→Q，2 及之后→被动。
 * 与计算侧 resolveCharSkillLevel 同口径；未选中角色技能时为 -1（滑杆与技能字段区一并隐藏）。
 */
const selectedSkillLevelIndex = computed(() => {
    const index = charBuild.value.skills.findIndex(skill => skill.名称 === charSettings.value.baseName)
    if (index === -1) return -1
    if (index === 1) return 1
    if (index >= 2) return 2
    return 0
})

/**
 * 当前选中技能的等级：随 SkillTabs 切换跟随显示与编辑，UI 保持单个滑杆不变。
 * 写入时只替换三元组中的对应项并钳制到 1-30，其余两项不受影响。
 */
const currentSkillLevel = computed({
    get: () => {
        // 未选中角色技能时滑杆不渲染，此处仅为类型守卫（元组不允许负索引）
        if (selectedSkillLevelIndex.value === -1) return 10
        return charSettings.value.charSkillLevel?.[selectedSkillLevelIndex.value as 0 | 1 | 2] ?? 10
    },
    set: value => {
        if (selectedSkillLevelIndex.value === -1) return
        const current = Array.isArray(charSettings.value.charSkillLevel) ? [...charSettings.value.charSkillLevel] : [10, 10, 10]
        current[selectedSkillLevelIndex.value] = Math.max(CHAR_SKILL_LEVEL_MIN, Math.min(SKILL_LEVEL_UI_MAX, Math.round(value)))
        charSettings.value.charSkillLevel = current as [number, number, number]
    },
})

/**
 * 侧边栏页签展示数据。
 * 同律页签优先使用同律伤害技能图标，并通过 mask 适配不同主题。
 * 近战/远程武器槽位为空武器（未装备）时保留页签并标记 isEmpty，用于展示未装备空态。
 */
const charTabs = computed(() => {
    const meleeWeapon = charBuild.value.meleeWeapon
    const rangedWeapon = charBuild.value.rangedWeapon
    const tabs = [
        {
            name: "角色",
            url: charBuild.value.char.url,
            skillMaskUrl: "",
            isEmpty: false,
        },
        {
            name: "近战",
            url: meleeWeapon.isEmpty ? "" : meleeWeapon.url,
            skillMaskUrl: "",
            isEmpty: meleeWeapon.isEmpty,
        },
        {
            name: "远程",
            url: rangedWeapon.isEmpty ? "" : rangedWeapon.url,
            skillMaskUrl: "",
            isEmpty: rangedWeapon.isEmpty,
        },
    ]

    if (charBuild.value.skillWeapon) {
        const skillWeaponUrl = charBuild.value.skillWeapon.url
        const hasRealSkillWeaponIcon = !!charBuild.value.skillWeapon._originalWeaponData.icon && !skillWeaponUrl.endsWith("/_.webp")
        tabs.push({
            name: "同律",
            url: hasRealSkillWeaponIcon ? skillWeaponUrl : "",
            skillMaskUrl: hasRealSkillWeaponIcon
                ? ""
                : charBuild.value.skillWeaponSkills[0]?.url || charBuild.value.skillWeapon.技能?.[0]?.url || "",
            isEmpty: false,
        })
    }

    return tabs
})

/**
 * 获取未生效的武器加成属性集合。
 * @param weapon 目标武器
 * @returns 未生效的属性名集合
 */
function getIneffectiveWeaponBonusProps(weapon: LeveledWeapon) {
    if (charBuild.value.isWeaponForgeEffective(weapon)) return new Set<string>()
    return new Set([...weapon.baseProperties, ...Object.keys(weapon._effectiveBuffProps)])
}

/**
 * 解析侧边栏页签的 tooltip 卡片：角色走角色卡，近战/远程走武器卡；
 * 同律武器继承近战/远程时按被继承槽位的实际武器展示，未装备时返回空卡。
 * @param tab 页签信息
 * @returns tooltip 卡片数据
 */
function getBuildTabCard(tab: (typeof charTabs.value)[number]): BuildTabCard {
    // 流程门控：解析链条会调用熔炼/武器方法，未就绪直接返回空卡
    if (!isCharBuildReady.value) return { kind: "empty", title: tab.name }
    if (tab.name === "角色") {
        // 精通列表包含额外精通武器（如灾厄武器所需类型）
        const mastery = [...(charBuild.value.char.精通 || []), ...(charBuild.value.extraMastery ? [charBuild.value.extraMastery] : [])]
        return { kind: "char", char: charBuild.value.char, mastery }
    }

    const weapon =
        tab.name === "近战"
            ? charBuild.value.meleeWeapon
            : tab.name === "远程"
              ? charBuild.value.rangedWeapon
              : tab.name === "同律"
                ? charBuild.value.skillWeapon
                : undefined
    const resolved =
        weapon instanceof LeveledSkillWeapon && weapon.inherit
            ? weapon.inherit === "melee"
                ? charBuild.value.meleeWeapon
                : charBuild.value.rangedWeapon
            : weapon
    if (!resolved || (resolved instanceof LeveledWeapon && resolved.isEmpty)) {
        return { kind: "empty", title: tab.name, isEmpty: tab.isEmpty }
    }
    if (resolved instanceof LeveledWeapon) {
        return { kind: "weapon", weapon: resolved, ineffective: getIneffectiveWeaponBonusProps(resolved) }
    }
    return { kind: "skill", weapon: resolved }
}

/**
 * 把 MOD 槽位类型归一化为变体支持的槽位类型。
 * @param type 槽位类型文本
 * @returns 槽位类型；非 MOD 槽位类型返回 null
 */
function toModSlotType(type: string): ModSlotType | null {
    return MOD_SLOT_TYPES.includes(type as ModSlotType) ? (type as ModSlotType) : null
}

function selectMod(type: string, slotIndex: number, modId: number, lv: number) {
    const slotType = toModSlotType(type)
    if (slotType) {
        activeModSlots(slotType)[slotIndex] = [modId, lv]
    }
    updateCharBuild()
}

function removeMod(slotIndex: number, type: string) {
    const slotType = toModSlotType(type)
    if (slotType) {
        activeModSlots(slotType)[slotIndex] = null
    }
    updateCharBuild()
}

// 交换MOD位置
function swapMods(fromIndex: number, toIndex: number, type: string) {
    const slotType = toModSlotType(type)
    if (slotType) {
        const slots = activeModSlots(slotType)
        const temp = slots[fromIndex]
        slots[fromIndex] = slots[toIndex]
        slots[toIndex] = temp
    }
    updateCharBuild()
}

/**
 * 构造 MOD 限定校验上下文：角色 id/名称/属性，以及三把武器的类别与伤害类型。
 * @returns 校验上下文
 */
function createModLimitContext(): ModLimitContext {
    const pick = (weapon: LeveledWeapon | undefined) =>
        weapon && !weapon.isEmpty ? { 类别: weapon.类别, 伤害类型: weapon.伤害类型 as string } : null
    return {
        charId: charBuild.value.char.id,
        charName: charBuild.value.char.名称,
        charElement: charBuild.value.char.属性,
        melee: pick(charBuild.value.meleeWeapon),
        ranged: pick(charBuild.value.rangedWeapon),
        skill: pick(charBuild.value.skillWeapon as LeveledWeapon | undefined),
    }
}

/**
 * 剔除槽位中不再满足「限定」的魔之楔（换武器后原 MOD 可能已不适用）。
 * 只改动传入的槽位数组本身，由调用方决定何时刷新构筑。
 * @param slots 槽位数组（原地修改）
 * @param type 槽位类型
 * @param ctx 校验上下文
 * @returns 被剔除的魔之楔名称列表
 */
function stripIncompatibleSlots(slots: ModSlot[], type: ModSlotType, ctx: ModLimitContext) {
    const removed: string[] = []
    slots.forEach((slot, index) => {
        if (!slot) return
        const mod = LeveledModHelper.optionalFromId(slot[0], slot[1], getBuffLv(slot[0]))
        if (!mod || isModAllowedInSlot(mod, type, ctx)) return
        removed.push(formatModName(mod.系列, mod.名称, t))
        slots[index] = null
    })
    return removed
}

/**
 * 剔除当前激活变体中所有不再满足「限定」的魔之楔，并提示被移除的 MOD。
 * 武器更换后原 MOD 的限定（武器类别/伤害类型）可能已不匹配，继续保留会让构筑带上错误的加成。
 * @param reasonKey 提示文案中说明触发原因（如「更换近战武器」）的 i18n 键
 * @returns 是否有 MOD 被剔除
 */
function stripIncompatibleMods(reasonKey: string) {
    const ctx = createModLimitContext()
    const removed: string[] = []
    MOD_SLOT_TYPES.forEach(type => {
        removed.push(...stripIncompatibleSlots(activeModSlots(type), type, ctx))
    })
    // 非激活变体同样承载构筑数据（切回去即生效），一并清理
    charSettings.value.modVariants?.forEach(variant => {
        MOD_SLOT_TYPES.forEach(type => {
            removed.push(...stripIncompatibleSlots(variant[type] ?? [], type, ctx))
        })
    })
    if (removed.length) {
        ui.showErrorMessage(t("char-build.mods_removed_on_weapon_change", { reason: t(reasonKey), mods: removed.join("、") }))
    }
    return removed.length > 0
}

/**
 * 修改当前激活变体中某个槽位的魔之楔等级。
 * @param type 槽位类型
 * @param slotIndex 槽位索引
 * @param lv 新等级
 */
function setModLevel(type: ModSlotType, slotIndex: number, lv: number) {
    const slot = activeModSlots(type)[slotIndex]
    if (!slot) return
    slot[1] = lv
}

/**
 * 切换激活的 MOD 变体（四个 MOD 编辑器共用同一份变体）。
 * @param variantIndex 变体索引（0/1/2 ↔ A/B/C）
 */
function selectModVariant(variantIndex: number) {
    if (variantIndex === charSettings.value.modVariantIndex) return
    charSettings.value.modVariantIndex = variantIndex
    updateCharBuild()
}

/**
 * 写入当前激活变体的中枢魔之楔（光环）。
 * @param auraMod 中枢魔之楔 id
 */
function setActiveAuraMod(auraMod: number) {
    setModVariantAura(charSettings.value, auraMod)
    updateCharBuild()
}

/**
 * 追加一份 MOD 变体配置：以当前激活的变体为模板，并自动切换过去（A → A B → A B C）。
 */
function appendModVariant() {
    if (addModVariant(charSettings.value) === -1) return
    updateCharBuild()
}

/**
 * 移除末尾的 MOD 变体配置（仅当它是当前激活的变体时允许）。
 */
function dropModVariant() {
    if (!removeLastModVariant(charSettings.value)) return
    updateCharBuild()
}

// 切换BUFF选择
const toggleBuff = (buff: LeveledBuff) => {
    const index = charSettings.value.buffs.findIndex(v => v[0] === buff.名称)
    if (index > -1) {
        charSettings.value.buffs.splice(index, 1)
        teamBuffLvs.value[buff.名称] = 0
    } else {
        charSettings.value.buffs.push([buff.名称, buff.等级])
        teamBuffLvs.value[buff.名称] = buff.等级
    }
    updateCharBuild()
}
function setBuffLv(buff: LeveledBuff, lv: number) {
    const index = charSettings.value.buffs.findIndex(v => v[0] === buff.名称)
    if (index > -1) {
        charSettings.value.buffs[index][1] = lv
        teamBuffLvs.value[buff.名称] = lv
    }
    updateCharBuild()
}

/**
 * 设置BUFF覆盖率：覆盖率 >= 1 时回退为默认的两元素条目，否则追加第三元素（保留六位小数）。
 * @param buff 目标BUFF
 * @param coverage 覆盖率（0-1，如0.5表示50%）
 */
function setBuffCoverage(buff: LeveledBuff, coverage: number) {
    const index = charSettings.value.buffs.findIndex(v => v[0] === buff.名称)
    if (index === -1) return
    const [name, level] = charSettings.value.buffs[index]
    charSettings.value.buffs[index] = coverage >= 1 ? [name, level] : [name, level, roundBuffValue(coverage)]
    updateCharBuild()
}

const editingProjectIndex = ref(-1)
const editProjectName = ref("")

/**
 * 根据索引加载本地构筑方案
 * @param index 方案在列表中的索引
 * @returns void
 */
const loadConfigByIndex = (index: number) => {
    const project = charProject.value.projects[index]
    if (!project) {
        return
    }
    charProject.value.selected = project.name
    charSettings.value = normalizeCharSettings(cloneDeep(project.charSettings))
    charRemoteId.value = ""
    updateCharBuild()
}

/**
 * 保存当前构筑到指定方案
 * @param index 方案在列表中的索引
 * @returns void
 */
const saveConfig = (index: number) => {
    const project = charProject.value.projects[index]
    if (!project) {
        return
    }
    project.charSettings = cloneDeep(charSettings.value)
    charProject.value.selected = project.name
    ui.showSuccessMessage(t("char-build.project_saved"))
}

/**
 * 新建方案并保存当前构筑
 * @returns void
 */
const addProject = () => {
    const defaultName = `${selectedChar.value}${(~~(Math.random() * 1e6)).toString(36)}`
    const inputName = prompt(t("char-build.please_enter_config_name"), defaultName)?.trim()
    if (!inputName) {
        return
    }
    const existingIndex = charProject.value.projects.findIndex(project => project.name === inputName)
    if (existingIndex !== -1) {
        charProject.value.projects[existingIndex].charSettings = cloneDeep(charSettings.value)
        charProject.value.selected = inputName
        ui.showSuccessMessage(t("char-build.project_overwritten"))
        return
    }
    charProject.value.projects.push({
        name: inputName,
        charSettings: cloneDeep(charSettings.value),
    })
    charProject.value.selected = inputName
}

/**
 * 将当前构筑以纯 JSON 文本形式复制到剪贴板。
 * @returns Promise<void>
 */
const copyBuildToClipboard = async () => {
    try {
        // 本地剪贴板是复制 / 导入（无服务端上限）：保留全部升华变体；对外分享 / 上传才用分享安全序列化
        await copyText(serializeCharSettings(charSettings.value))
        ui.showSuccessMessage(t("char-build.copied_to_clipboard"))
    } catch (error) {
        ui.showErrorMessage(t("char-build.copy_failed"), error instanceof Error ? error.message : t("char-build.unknown_error"))
    }
}

/**
 * 从剪贴板读取纯 JSON 构筑文本并导入为当前构筑。
 * @returns Promise<void>
 */
const importBuildFromClipboard = async () => {
    try {
        const text = (await pasteText()).trim()
        if (!text) {
            ui.showErrorMessage(t("char-build.clipboard_empty"))
            return
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch {
            ui.showErrorMessage(t("char-build.import_format_invalid"))
            return
        }
        if (!parsed || typeof parsed !== "object") {
            ui.showErrorMessage(t("char-build.import_format_invalid"))
            return
        }
        charSettings.value = normalizeCharSettings(parsed as CharSettings)
        ui.showSuccessMessage(t("char-build.imported_from_clipboard"))
    } catch (error) {
        ui.showErrorMessage(t("char-build.import_failed"), error instanceof Error ? error.message : t("char-build.unknown_error"))
    }
}

/**
 * 开始编辑方案名称
 * @param index 方案在列表中的索引
 * @returns void
 */
const renameProject = (index: number) => {
    const project = charProject.value.projects[index]
    if (!project) {
        return
    }
    editProjectName.value = project.name
    editingProjectIndex.value = index
    nextTick(() => {
        const element = document.getElementById(`char-project-name-input-${index}`) as HTMLInputElement | null
        element?.focus()
    })
}

/**
 * 完成方案重命名并校验重名
 * @returns void
 */
const finishEditProjectName = () => {
    if (editingProjectIndex.value === -1) {
        return
    }
    const newName = editProjectName.value.trim()
    if (!newName) {
        ui.showErrorMessage(t("char-build.project_name_required"))
        return
    }
    const duplicate = charProject.value.projects.some((project, index) => index !== editingProjectIndex.value && project.name === newName)
    if (duplicate) {
        ui.showErrorMessage(t("char-build.project_name_exists"))
        return
    }
    const previousName = charProject.value.projects[editingProjectIndex.value].name
    charProject.value.projects[editingProjectIndex.value].name = newName
    if (charProject.value.selected === previousName) {
        charProject.value.selected = newName
    }
    editingProjectIndex.value = -1
}

/**
 * 删除指定方案
 * @param index 方案在列表中的索引
 * @returns Promise<void>
 */
const deleteProject = async (index: number) => {
    const project = charProject.value.projects[index]
    if (!project) {
        return
    }
    if (!(await ui.showDialog(t("todo.deleteConfirmTitle"), t("char-build.project_delete_confirm", { name: project.name })))) {
        return
    }
    charProject.value.projects.splice(index, 1)
    if (charProject.value.selected === project.name) {
        charProject.value.selected = ""
    }
}

// 从数据库加载分享的构筑
const loadSharedBuild = async (buildId: string) => {
    try {
        const build = await buildQuery({ id: buildId })
        if (build && build.charSettings) {
            const loadedSettings = JSON.parse(build.charSettings)
            // 将加载的设置应用到当前构筑
            applyLoadedSettings(loadedSettings, buildId)
        }
    } catch (error) {
        ui.showErrorMessage(t("char-build.load_build_failed"), error instanceof Error ? error.message : t("char-build.unknown_error"))
    }
}

/**
 * 应用外部载入的角色配置，并补齐当前版本缺失字段。
 * 旧分享不含升华字段时保留本地升华配置（不能因载入他人构筑而清空本地装备 / 天赋）。
 * @param loadedSettings 外部载入的角色配置
 * @param remoteId 来源分享构筑 id（空串表示非分享来源，会清空本地记录）
 * @returns void
 */
const applyLoadedSettings = (loadedSettings: CharSettings, remoteId = "") => {
    charSettings.value = mergeSharedCharSettings(loadedSettings, charSettings.value.transcend)
    charRemoteId.value = remoteId
    ui.showSuccessMessage(t("char-build.shared_build_loaded"))
}

/**
 * 重置当前角色配置为默认值（默认值会直接装备角色专武）。
 * @returns void
 */
const resetConfig = () => {
    Object.assign(charSettings.value, createDefaultCharSettings(getSignatureWeapon(selectedCharId.value)))
    charRemoteId.value = ""
}
//#endregion

//#region 模拟
const simulator_model_show = ref(false)
//#endregion
//#region 自动构建
const autobuild_model_show = ref(false)
let newBuild!: CharBuild

function applyAutobuild() {
    autobuild_model_show.value = false
    if (!newBuild) return
    charSettings.value.meleeWeapon = newBuild.meleeWeapon.id
    charSettings.value.meleeWeaponLevel = newBuild.meleeWeapon.等级
    charSettings.value.meleeWeaponRefine = newBuild.meleeWeapon.精炼
    charSettings.value.rangedWeapon = newBuild.rangedWeapon.id
    charSettings.value.rangedWeaponLevel = newBuild.rangedWeapon.等级
    charSettings.value.rangedWeaponRefine = newBuild.rangedWeapon.精炼
    // 自动构建结果写入当前激活的变体，避免覆盖用户正在查看的另一份配置
    replaceActiveModSlots(
        "角色",
        newBuild.charMods.filter(v => v !== null).map(v => [v.id, v.等级])
    )
    replaceActiveModSlots(
        "近战",
        newBuild.meleeMods.filter(v => v !== null).map(v => [v.id, v.等级])
    )
    replaceActiveModSlots(
        "远程",
        newBuild.rangedMods.filter(v => v !== null).map(v => [v.id, v.等级])
    )
    replaceActiveModSlots(
        "同律",
        newBuild.skillMods.filter(v => v !== null).map(v => [v.id, v.等级])
    )
    updateCharBuild()
}
//#endregion
//#region 配装分享弹窗
const share_model_show = ref(false)
const share_title = ref(``)
const share_desc = ref(``)
/**
 * 配装分享列表组件实例。
 * 该组件挂在 CollapsibleSection 的 lazy 插槽里，折叠时不会渲染，
 * 此时模板 ref 为 null，调用其方法前必须先判空。
 */
const buildShow = ref<InstanceType<typeof DOBBuildShow> | null>(null)

function openShareModal() {
    share_title.value = `${selectedChar.value}构筑`
    share_desc.value = ``
    share_model_show.value = true
}

async function confirmShare() {
    share_model_show.value = false
    await shareCharBuild(share_title.value, share_desc.value)
    // 分享区折叠时组件未挂载（ref 为 null），此时不刷新列表；
    // 重新展开会重新挂载组件并由其 onMounted 自行拉取最新列表。
    buildShow.value?.fetchBuilds()
}
//#endregion
//#region 时间线
const timelines = useTimeline(selectedChar)
function getTimelineByName(name: string) {
    const raw = timelines.value.find(v => v.name === name)
    if (!raw) return undefined
    return CharBuildTimeline.fromRaw(raw)
}

// 溯源收益 watcher 会读取 charBuild（经 getTimelineByName 依赖 timelines），必须注册在时间线初始化之后，避免 setup 期 TDZ
watch(() => [charBuild.value, traceIncomeItems.value], scheduleTraceIncomes, { immediate: true })

const pselectedChar = useLocalStorage("selectedChar", "赛琪")

onMounted(async () => {
    pselectedChar.value = selectedChar.value
    // 首屏先画 01-04，次级章节空闲后补挂（requestIdleCallback 800ms 兜底，低端机也不会拖太久）
    const mountDeferred = () => (deferredSectionsMounted.value = true)
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
        .requestIdleCallback
    if (idle) {
        idle(mountDeferred, { timeout: 800 })
        // 弹窗类 chunk 空闲预取：首次打开弹窗不再现场加载
        idle(
            () => {
                for (const load of [loadAutoBuild, loadWeaponListView, loadMonsterListView, loadAIChatDialog]) void load().catch(() => {})
            },
            { timeout: 3000 }
        )
    } else {
        setTimeout(mountDeferred, 350)
    }
    if (route.params.buildId && typeof route.params.buildId === "string") await loadSharedBuild(route.params.buildId)
})
//#endregion

// 更新CharBuild实例
function updateCharBuild() {
    if (!isCharBuildReady.value) {
        return
    }
    if (!monsterMap.has(charSettings.value.enemyId)) {
        charSettings.value.enemyId = 130
    }
    if (!charSettings.value.baseName && charBuild.value.char.技能[0]) {
        charSettings.value.baseName = charBuild.value.char.技能[0].名称
    }
    pad(charSettings.value.charMods, 8, null)
    pad(charSettings.value.meleeMods, 8, null)
    pad(charSettings.value.rangedMods, 8, null)
    pad(charSettings.value.skillWeaponMods, 4, null)
    // MOD 变体（B/C）与配置 A 保持同一套槽位结构，槽位索引才不会漂移
    charSettings.value.modVariants.forEach(variant => {
        MOD_SLOT_TYPES.forEach(type => {
            const slots = variant[type] ?? []
            pad(slots, MOD_SLOT_COUNTS[type], null)
            variant[type] = slots
        })
    })
    pad(charSettings.value.traits, TRAIT_SLOT_COUNT, null)
    charSettings.value.customVariables = charSettings.value.customVariables.filter(
        variable => Array.isArray(variable) && typeof variable[0] === "string" && typeof variable[1] === "string"
    )
    function pad<T>(arr: T[], length: number, value: T) {
        if (arr.length > length) {
            arr.length = length
            return
        }
        while (arr.length < length) {
            arr.push(value)
        }
        return arr
    }
}
watch(
    () => isCharBuildReady.value,
    ready => {
        if (ready) {
            updateCharBuild()
            // 预热共享收益 worker：首个面板打开前触发其内模块求值，避开冷启动卡顿（仅整页一次）
            warmIncomeWorker(charBuild.value)
        }
    },
    { immediate: true }
)

// 计算属性（含武器作用域）：充盈威力、召唤物攻击速度/范围/独立增伤等依赖武器转化词条，
// 需与伤害结算一致使用 calculateWeaponAttributes，否则召唤物独立增伤等会漏算转化部分
// 流程门控：构筑 API 只能在数据就绪后调用；未就绪（真无数据形态）直接返回空属性，
// 整页模板同样挂在 isCharBuildReady 门后，因此这里不会走到占位对象上调真方法。
const attributes = computed(() => {
    if (!isCharBuildReady.value) return {} as ReturnType<CharBuild["calculateWeaponAttributes"]>
    return charBuild.value.calculateWeaponAttributes()
})

//#region 魔灵与潜质（槽位操作）
/**
 * 复制并补齐/裁剪潜质槽位为 TRAIT_SLOT_COUNT 个（空槽为 null），保证槽位索引稳定。
 * @param traits 待处理的槽位
 * @returns 长度固定的槽位副本
 */
function copyTraitSlots(traits: readonly TraitSlot[]): TraitSlot[] {
    // 逐槽走一次归一化：顺手丢弃历史版本写入的非法槽位（如早期把潜质条目 id 直接存成数字）
    return Array.from({ length: TRAIT_SLOT_COUNT }, (_, index) => normalizeTraitSlots([traits[index]])[0])
}

/**
 * 选择潜质写入槽位：同一基础潜质已占其它槽位时先把那个槽位清空，
 * 保证四个槽位互不相同（同一潜质的两个等级档位共用同一条 BUFF，重复装备会让收益计算互相干扰）。
 * 槽位索引保持稳定（不压缩空槽），与魔之楔槽位一致，便于继续拖拽互换。
 * @param index 槽位索引
 * @param bid 基础潜质 id
 * @param level 潜质等级（1/2/3）
 */
function selectTrait(index: number, bid: number, level: number) {
    if (!getPetTraitByLevel(bid, level)) return
    charSettings.value.traits = copyTraitSlots(charSettings.value.traits).map((slot, slotIndex) => {
        if (slotIndex === index) return [bid, level] as TraitSlot
        return slot && slot[0] === bid ? null : slot
    })
    updateCharBuild()
}

/**
 * 移除槽位潜质（保留空槽，不压缩其它槽位）。
 * @param index 槽位索引
 */
function removeTrait(index: number) {
    const traits = copyTraitSlots(charSettings.value.traits)
    traits[index] = null
    charSettings.value.traits = traits
    updateCharBuild()
}

/**
 * 交换两个潜质槽位。
 * @param fromIndex 来源槽位索引
 * @param toIndex 目标槽位索引
 */
function swapTraits(fromIndex: number, toIndex: number) {
    const traits = copyTraitSlots(charSettings.value.traits)
    const temp = traits[fromIndex]
    traits[fromIndex] = traits[toIndex]
    traits[toIndex] = temp
    charSettings.value.traits = traits
    updateCharBuild()
}

/**
 * 魔灵或主动技覆盖率变更：刷新构筑（魔灵被动物 / 主动技 BUFF 随之进入加成汇总）。
 */
function handlePetChange() {
    updateCharBuild()
}
//#endregion

//#region Tour
const tour = ref<typeof VTour>()

// 定义按钮标签（使用 computed 支持 i18n 动态翻译）
const buttonLabels = computed(() => ({
    next: t("tour.next"),
    back: t("tour.back"),
    done: t("tour.done"),
    skip: t("tour.skip"),
}))

// 定义 tour 步骤（使用 computed 支持 i18n 动态翻译）
const steps = computed<ITourStep[]>(() => [
    {
        target: "[data-tour='char-tabs']",
        content: t("tour.char_tabs"),
        placement: "right",
    },
    {
        target: "[data-tour='weapon-select']",
        content: t("tour.weapon_select"),
        placement: "right",
    },
    {
        target: "[data-tour='skill-select']",
        content: t("tour.skill_select"),
        placement: "right",
    },
    {
        target: "[data-tour='target-function']",
        content: t("tour.target_function"),
        placement: "right",
    },
    {
        target: "[data-tour='damage-result']",
        content: t("tour.damage_result"),
        placement: "right",
    },
    {
        target: "[data-tour='char-mods']", // 4
        content: t("tour.char_mods"),
        placement: "right",
    },
    {
        target: "[data-tour='top-actions']",
        content: t("tour.top_actions"),
        placement: "bottom",
    },
    {
        target: "[data-tour='tour-button']",
        content: t("tour.finish"),
        placement: "bottom",
    },
])

// 处理 tour 步骤变化
function handleTourStep(index: number) {
    const step = steps.value[index]
    const target = document.querySelector(step.target)
    if (!target) return
    const elementRect = target.getBoundingClientRect()
    if (index === 0) {
        charTab.value = "近战"
    }
    const scrollArea = document.querySelector(
        index >= 5 ? "#char-build-scroll2 [data-reka-scroll-area-viewport]" : "#char-build-scroll1 [data-reka-scroll-area-viewport]"
    )
    if (!scrollArea) return
    const viewportHeight = scrollArea.clientHeight
    const viewportWidth = scrollArea.clientWidth

    // 计算滚动目标位置（垂直居中 + 可选偏移，水平同理）
    const scrollTop = scrollArea.scrollTop + elementRect.top - viewportHeight / 2 + elementRect.height / 2
    const scrollLeft = scrollArea.scrollLeft + elementRect.left - viewportWidth / 2 + elementRect.width / 2

    scrollArea.scrollTo({
        top: scrollTop,
        left: scrollLeft,
        behavior: "smooth",
    })
}

//#endregion

const teamBuffLvs = useLocalStorage("teamBuffLvs", {} as Record<string, number>)

/**
 * 合并并去重 BUFF 列表，同名 BUFF 仅保留一条记录，并保留可选的覆盖率（第三元素）。
 * @param buffs BUFF 列表
 * @returns 去重后的 BUFF 列表
 */
function dedupeBuffs(buffs: [string, number, number?][]): [string, number, number?][] {
    const uniqueBuffs = new Map<string, [number, number?]>()
    buffs.forEach(([name, level, coverage]) => {
        if (level > 0) {
            const previousCoverage = uniqueBuffs.get(name)?.[1]
            const nextCoverage = coverage ?? previousCoverage
            uniqueBuffs.set(name, nextCoverage === undefined ? [level] : [level, nextCoverage])
        }
    })
    return [...uniqueBuffs.entries()].map(([name, [level, coverage]]) => (coverage === undefined ? [name, level] : [name, level, coverage]))
}

/** 助战 BUFF 来源：数字=来源 id（角色 / 武器），字符串=旧格式角色名子串 */
type TeamBuffSource = string | number

/**
 * 一次性写回多个助战来源变更：先移除全部旧来源，再加入全部新来源，最后只序列化写回一次。
 * 同一次补丁同时换角色与武器时也只会重算一次 BUFF（避免两次整份写 localStorage）。
 */
function applyTeamBuffChanges(changes: readonly [newValue: TeamBuffSource, oldValue: TeamBuffSource][]) {
    const removals = changes.map(([, oldValue]) => oldValue).filter(value => value !== "-")
    const additions = changes.map(([newValue]) => newValue).filter(value => value !== "-")
    const newBuffs = charSettings.value.buffs.filter(([name]) => {
        const sourceId = buffMap.get(name)?.id
        return !removals.some(oldValue =>
            typeof oldValue === "number" ? sourceId === oldValue : name.includes(String(oldValue))
        )
    })
    for (const newValue of additions) {
        const teamBuffs = buffOptions.value.filter(v =>
            typeof newValue === "number" ? v.buff?.id === newValue : v.label.includes(String(newValue))
        )
        if (teamBuffs.length === 0) continue
        const buffs = teamBuffs
            .map(v => [v.label, teamBuffLvs.value[v.label] || v.value.等级] as [string, number])
            .filter(v => v[1] > 0)
        newBuffs.push(...buffs)
    }
    charSettings.value.buffs = dedupeBuffs(newBuffs)
    localStorage.setItem(`build.${selectedCharId.value}`, serializeCharSettings(charSettings.value))
}

function updateTeamBuff(newValue: string | number, oldValue: string | number) {
    applyTeamBuffChanges([[newValue, oldValue]])
}

// 外部调用接口
declare global {
    interface Window {
        setCharName: (name: string) => void
        setMod: (key: "charMods" | "meleeMods" | "rangedMods" | "skillWeaponMods", index: number, modId: number, level: number) => void
        setBuff: (buffId: string, level?: number) => void
    }
}

onMounted(async () => {
    window.setMod = (key: "charMods" | "meleeMods" | "rangedMods" | "skillWeaponMods", index: number, modId: number, level: number) => {
        if (index < 0 || index >= charSettings.value[key].length) return
        if (modId < 0) charSettings.value[key][index] = null
        else charSettings.value[key][index] = [modId, level]
    }
    window.setBuff = (buffId: string, level?: number) => {
        const buff = buffOptions.value.find(v => v.label === buffId)
        if (!buff) return
        if (level === undefined) level = buff.value.等级
        const index = charSettings.value.buffs.findIndex(v => v[0] === buffId)
        if (index === -1) {
            if (level > 0) charSettings.value.buffs.push([buffId, level])
        } else {
            if (level > 0) charSettings.value.buffs[index] = [buffId, level]
            else charSettings.value.buffs.splice(index, 1)
        }
    }
    await waitForInitialLoad()
    ui.title = t("char-build.title1", { charName: t(selectedChar.value) })

    // Tour 启动逻辑：检查是否已完成
    // 新手引导的锚点全部在专业模式的界面上，简洁模式下不启动，避免引导找不到目标元素
    const tourKey = `char-build`
    if (buildViewMode.value === "pro" && !tourStore.isTourCompleted(tourKey)) {
        // 延迟 1 秒后启动，等待组件完全渲染
        setTimeout(() => {
            tour.value?.startTour()
        }, 1000)
    }
})

onBeforeUnmount(() => {
    clearExprDrag()
    ui.title = ""
})

// 折叠状态
const collapsedSections = useLocalStorage("build-collapsed-sections", {
    detail: false,
    basic: false,
    mods: false,
    transcendGear: false,
    transcendTalent: false,
    effects: false,
    buffs: false,
    preview: false,
    actions: false,
    share: false,
    comments: false,
})

// 次级章节（07 特效 / 08 BUFF 大列表 / 09 动作 / 10 预览 / 11 评论）是否已补挂：
// 首渲染只挂 01-04（升华 section 关闭时也不挂），进页少一次大体量同步挂载；空闲后（或用户开合章节时）再挂载次级内容。
const deferredSectionsMounted = ref(false)

function toggleSection(section: keyof typeof collapsedSections.value) {
    // 用户一旦手动开合章节，说明已开始交互：次级章节立即补挂，避免点开展示空内容
    deferredSectionsMounted.value = true
    collapsedSections.value[section] = !collapsedSections.value[section]
}

/** 当前角色构筑页的评论目标 ID（按角色聚合讨论）。 */
const buildCommentTargetId = computed(() => `charbuild_${selectedCharId.value}`)
/** 评论数（用于章节 badge 展示）。 */
const buildCommentCount = ref(0)

const charTab = ref(charBuild.value.selectedSkillType)

//#region 左栏两行页签（主控标准页签 + 额外精通 + 协战角色 / 武器 / 额外精通）
/** 主控标准页签 key ↔ 旧 charTab 文本（charTab 继续只服务主控面板与 MOD 编辑器） */
const MAIN_TAB_NAME_BY_KEY: Record<string, string> = {
    "main:char": "角色",
    "main:melee": "近战",
    "main:ranged": "远程",
    "main:skillweapon": "同律",
}
const MAIN_TAB_KEY_BY_NAME: Record<string, string> = {
    角色: "main:char",
    近战: "main:melee",
    远程: "main:ranged",
    同律: "main:skillweapon",
}
/** 主控页签标签：额外精通用武器类型图标，其余沿用 charTabs 的图标与 tooltip */
const MAIN_TAB_LABEL_KEYS: Record<string, string> = {
    角色: "char-build.char",
    近战: "char-build.melee",
    远程: "char-build.ranged",
    同律: "char-build.skill",
}

/** 左栏当前上下文（ASCII key）：第二行与额外精通只切它，不回写 charTab */
const leftTabKey = ref(MAIN_TAB_KEY_BY_NAME[charTab.value] ?? "main:char")

/** 两个协战位的 facade（由 teamN / teamNWeapon / assistN 投影，纯函数） */
const assistFacades = computed(() => ({
    assist1: getAssistFacade(charSettings.value, "assist1"),
    assist2: getAssistFacade(charSettings.value, "assist2"),
}))

/** 左栏当前协战位（不在协战面板时为 null） */
const activeAssistSide = computed<AssistSide | null>(() => {
    if (leftTabKey.value.startsWith("assist1:")) return "assist1"
    if (leftTabKey.value.startsWith("assist2:")) return "assist2"
    return null
})

/** 左栏当前协战面板类型（char / weapon / extra） */
const activeAssistPanel = computed(() => leftTabKey.value.split(":")[1] ?? "")

/** 当前协战面板的构筑实例（额外精通面板不需要，避免无谓构造） */
const activeAssistBuild = computed(() => {
    const side = activeAssistSide.value
    if (!side || activeAssistPanel.value === "extra") return null
    return createAssistPanelBuild(charSettings.value, side, selectedCharId.value)
})

/** 当前协战面板的角色技能（有构筑时取构筑技能，保留技能替换） */
const activeAssistSkills = computed(() => {
    const side = activeAssistSide.value
    if (!side) return []
    return activeAssistBuild.value?.charSkills ?? getAssistCharSkills(charSettings.value, side)
})

/** 当前协战面板的面板属性 */
const activeAssistAttributes = computed(() => {
    const build = activeAssistBuild.value
    return build ? build.calculateWeaponAttributes() : undefined
})

/**
 * 主控标准页签 → 两行页签项。
 * @param tab charTabs 项
 * @returns 页签项
 */
function getMainCharTabItem(tab: (typeof charTabs.value)[number]): BuildTabRowItem {
    const key = MAIN_TAB_KEY_BY_NAME[tab.name] ?? "main:char"
    return {
        key,
        card: getBuildTabCard(tab),
        label: tab.name === "角色" ? gt(charBuild.value.char.名称) : t(MAIN_TAB_LABEL_KEYS[tab.name] ?? "char-build.char"),
        icon: tab.url || null,
        maskUrl: tab.skillMaskUrl || null,
        fallbackIcon:
            tab.name === "角色"
                ? "kezhou"
                : tab.name === "同律"
                  ? "ri:exchange-line"
                  : tab.name === "近战"
                    ? "ri:sword-line"
                    : "ri:crosshair-line",
        empty: tab.isEmpty,
    }
}

/**
 * 额外精通页签项：有值时用武器类型图标（mask 上色），否则虚线加号。
 * @param key 页签 key
 * @param value 当前额外精通武器类型
 * @param label 可访问名称
 * @returns 页签项
 */
function getExtraMasteryTabItem(key: string, value: string, label: string): BuildTabRowItem {
    return {
        key,
        card: { kind: "empty", title: label },
        label,
        maskUrl: value ? LeveledWeapon.typeUrl(value) : null,
        fallbackIcon: "ri:add-line",
        empty: !value,
    }
}

/**
 * 协战武器页签的未生效加成：按协战角色精通判定，不构造完整协战构筑。
 * @param weapon 目标武器
 * @param char 协战角色（页面内按协战等级构造）
 * @param extraMastery 协战额外精通武器类型
 * @returns 未生效的属性名集合
 */
function getAssistWeaponIneffective(weapon: LeveledWeapon, char: LeveledChar | undefined, extraMastery: string): ReadonlySet<string> {
    if (!char || !weapon.hasForge) return new Set<string>()
    const mastered = char.精通.includes(weapon.类别) || char.精通.includes("全部类型") || weapon.类别 === extraMastery
    if (mastered) return new Set<string>()
    return new Set([...weapon.baseProperties, ...Object.keys(weapon._effectiveBuffProps)])
}

/**
 * 单个协战位的三个页签项（角色 / 武器 / 额外精通，武器为单槽）。
 * 角色与武器 tooltip 与主控一致，仅标题注入协战位标签以区分同名页签。
 * @param side 协战位
 * @returns 页签项列表
 */
function getAssistTabItems(side: AssistSide): BuildTabRowItem[] {
    const facade = assistFacades.value[side]
    const sideLabel = t(getTranscendSideLabelKey(side))
    const charData = facade.charId > 0 ? charMap.get(facade.charId) : undefined
    const char = charData ? new LeveledChar(charData, facade.charLevel) : undefined
    const charLabel = `${sideLabel} · ${char ? gt(char.名称) : t("char-build.char")}`
    const weaponId = facade.meleeWeapon || facade.rangedWeapon
    const weaponData = weaponId > 0 ? weaponMap.get(weaponId) : undefined
    const weaponLabel = `${sideLabel} · ${t("char-build.weapon")}`
    const isMelee = facade.meleeWeapon > 0
    const weapon = weaponData
        ? LeveledWeaponHelper.fromId(
              weaponData.id,
              isMelee ? facade.meleeWeaponRefine : facade.rangedWeaponRefine,
              isMelee ? facade.meleeWeaponLevel : facade.rangedWeaponLevel
          )
        : undefined
    return [
        {
            key: `${side}:char`,
            card: char
                ? {
                      kind: "char",
                      char,
                      mastery: [...(char.精通 ?? []), ...(facade.extraMastery ? [facade.extraMastery] : [])],
                      title: `${gt(char.名称)} (${sideLabel})`,
                  }
                : { kind: "empty", title: charLabel },
            label: charLabel,
            icon: charData ? LeveledChar.url(charData.icon) : null,
            fallbackIcon: "ri:user-line",
            empty: facade.charId <= 0,
        },
        {
            key: `${side}:weapon`,
            card: weapon
                ? {
                      kind: "weapon",
                      weapon,
                      ineffective: getAssistWeaponIneffective(weapon, char, facade.extraMastery),
                      title: `${gt(weapon.名称)} (${sideLabel})`,
                  }
                : { kind: "empty", title: weaponLabel, isEmpty: true },
            label: weapon ? `${sideLabel} · ${gt(weapon.名称)}` : weaponLabel,
            icon: weaponData ? LeveledWeapon.url(weaponData.icon) : null,
            fallbackIcon: "ri:sword-line",
            empty: weaponId <= 0,
        },
        getExtraMasteryTabItem(`${side}:extra`, facade.extraMastery, `${sideLabel} · ${t("UI_Armory_ExtraExcelWeponTitle")}`),
    ]
}

/** 两行页签：第一行主控（角色 / 近战 / 远程 / 同律 / 额外精通），第二行两个协战位各 3 个 */
const charTabRows = computed<BuildTabRowItem[][]>(() => [
    [
        ...charTabs.value.map(getMainCharTabItem),
        getExtraMasteryTabItem(
            "main:extra",
            charSettings.value.extraMastery,
            selectedExtraMastery.value
                ? `${t("UI_Armory_ExtraExcelWeponTitle")} · ${t(selectedExtraMastery.value.名称)}`
                : t("UI_Armory_ExtraExcelWeponTitle")
        ),
    ],
    [...getAssistTabItems("assist1"), ...getAssistTabItems("assist2")],
])

/**
 * 切换左栏上下文：主控标准页签同步 charTab（MOD 编辑器口径），额外精通 / 协战只切 leftTabKey。
 * @param key 页签 key
 */
function selectLeftTab(key: string): void {
    leftTabKey.value = key
    const mainTabName = MAIN_TAB_NAME_BY_KEY[key]
    if (mainTabName) charTab.value = mainTabName
}

// charTab 被外部改写（tour / 旧入口）时，仅当左栏仍停在主控标准页签才同步 key，
// 协战与额外精通面板不被强制切走。
watch(charTab, value => {
    if (!MAIN_TAB_NAME_BY_KEY[leftTabKey.value]) return
    leftTabKey.value = MAIN_TAB_KEY_BY_NAME[value] ?? "main:char"
})

// 角色没有同律武器时第一行不渲染同律页签：仍停在该页签就回落到角色，避免左栏空白
watch(
    () => Boolean(charBuild.value.skillWeapon),
    hasSkillWeapon => {
        if (hasSkillWeapon || leftTabKey.value !== "main:skillweapon") return
        leftTabKey.value = "main:char"
        charTab.value = "角色"
    }
)

/**
 * 协战角色选择器要排除的角色：主控 + 另一协战。
 * @param side 当前协战位
 * @returns 排除的角色 id
 */
function getAssistExcludeIds(side: AssistSide): number[] {
    const other = side === "assist1" ? "assist2" : "assist1"
    return [charBuild.value.char.id, assistFacades.value[other].charId].filter(id => id > 0)
}

/**
 * 把协战面板补丁写回 teamN / teamNWeapon / assistN；换角色时复位技能与启用位。
 * 角色 / 武器变化与 TeamEditor 同口径：清关联构筑并重算助战 BUFF。
 * @param side 协战位
 * @param patch facade 补丁
 */
function updateAssistLoadout(side: AssistSide, patch: Partial<TranscendSideLoadout>): void {
    const teamKey = side === "assist1" ? "team1" : "team2"
    const weaponKey = side === "assist1" ? "team1Weapon" : "team2Weapon"
    const buildKey = side === "assist1" ? "team1Build" : "team2Build"
    const buildVariantKey = side === "assist1" ? "team1BuildVariant" : "team2BuildVariant"
    const previousCharId = assistFacades.value[side].charId
    const previousWeaponId = assistFacades.value[side].meleeWeapon || assistFacades.value[side].rangedWeapon
    const mapping = mapAssistPatch(charSettings.value, side, patch)
    // 收集本次补丁的角色 / 武器变化，最后只重算一次 BUFF（同补丁改两者也只写一次存档）
    const buffChanges: [TeamBuffSource, TeamBuffSource][] = []

    if (mapping.teamId !== undefined) {
        const nextTeamId = mapping.teamId > 0 ? mapping.teamId : "-"
        const previousValue = previousCharId > 0 ? previousCharId : "-"
        if (nextTeamId !== previousValue) {
            charSettings.value[teamKey] = nextTeamId
            charSettings.value[buildKey] = "-"
            charSettings.value[buildVariantKey] = "A"
            buffChanges.push([nextTeamId, previousValue])
        }
        Object.assign(charSettings.value[side], mapping.assist)
        if (nextTeamId !== previousValue) {
            Object.assign(charSettings.value[side], resetAssistForChar(charSettings.value, side))
        }
    } else {
        Object.assign(charSettings.value[side], mapping.assist)
    }

    if (mapping.weaponId !== undefined) {
        const nextWeaponId = mapping.weaponId > 0 ? mapping.weaponId : "-"
        const previousValue = previousWeaponId > 0 ? previousWeaponId : "-"
        if (nextWeaponId !== previousValue) {
            charSettings.value[weaponKey] = nextWeaponId
            buffChanges.push([nextWeaponId, previousValue])
        }
    }

    if (buffChanges.length > 0) applyTeamBuffChanges(buffChanges)
}

/**
 * 角色选择器回传：写入 teamN 并复位本位 loadout；选回当前角色时不做任何改动。
 * @param side 协战位
 * @param charId 角色 id（0 表示清空）
 */
function selectAssistChar(side: AssistSide, charId: number): void {
    const previousCharId = assistFacades.value[side].charId
    const nextCharId = charId > 0 ? charId : 0
    if (nextCharId === previousCharId) return
    charSettings.value[side === "assist1" ? "team1" : "team2"] = nextCharId > 0 ? nextCharId : "-"
    charSettings.value[side === "assist1" ? "team1Build" : "team2Build"] = "-"
    charSettings.value[side === "assist1" ? "team1BuildVariant" : "team2BuildVariant"] = "A"
    Object.assign(charSettings.value[side], resetAssistForChar(charSettings.value, side))
    updateTeamBuff(nextCharId > 0 ? nextCharId : "-", previousCharId > 0 ? previousCharId : "-")
}

//#region 协战构筑导入（顶层 setting → 内嵌 setting）
/** 正在导入的协战位（null 表示弹窗关闭） */
const assistImportSide = ref<AssistSide | null>(null)

/** 导入弹窗目标：协战角色 / 单武器 / 关联构筑（分享页签置顶用） */
const assistImportTarget = computed(() => {
    const side = assistImportSide.value
    if (!side) return null
    const facade = assistFacades.value[side]
    return {
        charId: facade.charId,
        weaponId: facade.meleeWeapon || facade.rangedWeapon,
        linkedBuildId: charSettings.value[side === "assist1" ? "team1Build" : "team2Build"] ?? "-",
    }
})

/**
 * 打开协战导入弹窗：未选角色时提示先选人。
 * @param side 协战位
 */
function openAssistImport(side: AssistSide): void {
    if (assistFacades.value[side].charId <= 0) {
        ui.showErrorMessage(t("char-build.assist_import_require_char"))
        return
    }
    assistImportSide.value = side
}

/**
 * 应用协战导入：源构筑转换为内嵌 setting 写回 assistN；空武器时按来源推荐填入 teamNWeapon 并重算助战 BUFF。
 * @param payload 源构筑与展示名
 */
function applyAssistImport(payload: { source: CharSettings; label: string }): void {
    const side = assistImportSide.value
    if (!side) return
    const weaponKey = side === "assist1" ? "team1Weapon" : "team2Weapon"
    const teamWeaponId = charSettings.value[weaponKey]
    const { assist, weaponId, baseNameFallback } = convertTopSettingsToAssist(
        payload.source,
        charSettings.value[side === "assist1" ? "team1" : "team2"],
        teamWeaponId,
        charSettings.value[side].enabled
    )
    Object.assign(charSettings.value[side], assist)
    const weaponFilled = weaponId > 0 && !(typeof teamWeaponId === "number" && teamWeaponId > 0)
    if (weaponFilled) {
        charSettings.value[weaponKey] = weaponId
        applyTeamBuffChanges([[weaponId, "-"]])
    }
    assistImportSide.value = null
    ui.showSuccessMessage(t("char-build.assist_import_success", { label: payload.label || t("char-build.assist_import") }))
    if (weaponFilled) {
        const weapon = weaponMap.get(weaponId)
        ui.showSuccessMessage(t("char-build.assist_import_weapon_filled", { name: weapon ? gt(weapon.名称) : `#${weaponId}` }))
    }
    if (baseNameFallback) ui.showErrorMessage(t("char-build.assist_import_basename_fallback"))
}
//#endregion
//#endregion

//#region 升华装备 / 升华天赋（唯一开关 = charSettings.transcend.enabled）
/** 「包含未开放阶段（理论值）」：只影响首次开启 / 全部解锁的天赋默认值 */
const includeUnreleasedStages = useLocalStorage("transcendBuild.includeUnreleasedStages", false)

/** 升华模块开关：开启 = 显示两个 section 并参与计算；关闭 = 隐藏且停用 */
const transcendEnabled = computed(() => charSettings.value.transcend.enabled)

/**
 * 头部 toggle：打开时若尚无天赋投入，按独立页旧默认（可达阶段满级）填充；写操作由 useLocalStorage 自动持久化。
 */
function toggleTranscend(): void {
    const transcend = charSettings.value.transcend
    const next = !transcend.enabled
    if (next && transcend.talentLevels.length === 0) {
        transcend.talentLevels = getUnlockAllTalentLevels([], includeUnreleasedStages.value)
    }
    transcend.enabled = next
}

/** 装备 / 天赋编辑器的宿主 facade：角色与队伍取当前页面，emit 只写 `charSettings.transcend` */
const transcendEditorSettings = computed(() => createTranscendEditorSettings(charSettings.value, selectedCharId.value))

/**
 * 写回某侧装备组（只替换 `transcend`，不写 facade 的 loadout 字段）。
 * @param side 构筑位
 * @param group 新装备组
 */
function onTranscendUpdateGear(side: TranscendSlotGroup, group: TranscendGearGroup): void {
    setSideGearGroup(charSettings.value.transcend, side, group)
}

/** 装备短码导入：三组一起替换并同步激活变体 */
function onTranscendReplaceGear(mainGear: TranscendGearGroup, assist1Gear: TranscendGearGroup, assist2Gear: TranscendGearGroup): void {
    const transcend = charSettings.value.transcend
    transcend.mainGear = mainGear
    transcend.assist1Gear = assist1Gear
    transcend.assist2Gear = assist2Gear
    syncActiveGearVariant(transcend)
}

/**
 * 切换装备变体（A/B/C）。
 * @param id 变体 id
 */
function onTranscendSelectGearVariant(id: string): void {
    switchTranscendGearVariant(charSettings.value.transcend, id)
}

/** 以当前装备为模板追加一份变体 */
function onTranscendAddGearVariant(): void {
    addTranscendGearVariant(charSettings.value.transcend)
}

/**
 * 删除装备变体。
 * @param id 变体 id
 */
function onTranscendRemoveGearVariant(id: string): void {
    removeTranscendGearVariant(charSettings.value.transcend, id)
}

/**
 * 写入天赋等级表。
 * @param levels 节点等级 `[talentId, level]`
 */
function onTranscendTalentLevels(levels: [number, number][]): void {
    charSettings.value.transcend.talentLevels = levels
}

/** 天赋全部开关：未满级补满目标口径，已满级清空所有等级（含目标外阶段）；是否启用只由头部 toggle 决定 */
function onTranscendUnlockAll(): void {
    charSettings.value.transcend.talentLevels = toggleAllTalentLevels(
        charSettings.value.transcend.talentLevels,
        includeUnreleasedStages.value
    )
}

/** 宿主完整构筑快照：装备相对收益按 MOD / BUFF / 时间轴合并后的口径计算 */
const transcendGainContext = computed(() =>
    createTranscendGainContext({
        settings: charSettings.value,
        charId: selectedCharId.value,
        inv,
        timeline: charSettings.value.actions?.enable ? getInlineActions() : getTimelineByName(charSettings.value.baseName),
        dataPackKey: dataPackHydrationKey.value,
    })
)
//#endregion

/**
 * 构筑页展示模式：
 * - simple：简洁模式（全屏 HUD 装配总览，只读，见 CharBuildSimpleView）
 * - pro：专业模式（原有的三栏编辑器）
 * 默认简洁模式，选择结果持久化，刷新后保持用户偏好。
 */
const buildViewMode = useLocalStorage<"simple" | "pro">("char-build-view-mode", "simple")

//#region 表达式字段拖拽 / 放置
/** 拖拽状态：放置目标（目标函数卡 / 自定义变量）由 `TranscendTargetPanel` 自行注册，本页只渲染浮动标签与提示条 */
const {
    payload: exprDragPayload,
    floatingPayload: exprFloatingPayload,
    dragging: exprDragging,
    ghostPosition: exprGhostPosition,
    clearExprDrag,
} = useExprDrag()
//#endregion

//#region 额外精通武器
/** 可选的额外精通武器类型：仅匹配角色「额外精通」字段。 */
const extraMasteryOptions = computed(() => {
    dataPackTick.value
    return charExtraExcelWeapon.filter(item => charBuild.value.char.额外精通?.includes(item.名称))
})

/**
 * 当前已选择的额外精通武器条目。
 */
const selectedExtraMastery = computed(() => extraMasteryOptions.value.find(item => item.名称 === charSettings.value.extraMastery) || null)
//#endregion

//#region 目标函数卡（左栏 / 浮动 / 吸附右侧三态）
/** 目标函数卡停靠状态：默认停左栏底部，可浮动或吸附为右侧第三栏 */
const targetDock = ref<TargetDock>("left")

/** 主控表达式草稿非法（不写回）：结果行对应旧提交值，需抑制显示 */
const targetDraftInvalid = ref(false)

/** 三人目标快照 memo：序列化设置与主控构筑实例都相同才复用，避免无关刷新重建协战构筑 */
let targetSnapshotCache: { key: string; mainBuild: CharBuild | null; snapshot: CharTeamSnapshot } | null = null

/** 三人目标快照：主控用页面构筑，协战由 `assistN` 重建；结果与表达式校验共用同一份 */
const charTeamSnapshot = computed(() => {
    if (!isCharBuildReady.value) return null
    const key = `${selectedCharId.value}|${serializeCharSettings(charSettings.value)}`
    const mainBuild = charBuild.value
    if (targetSnapshotCache?.key === key && targetSnapshotCache.mainBuild === mainBuild) return targetSnapshotCache.snapshot
    const snapshot = computeCharTeamSnapshot({
        settings: charSettings.value,
        charId: selectedCharId.value,
        mainBuild,
    })
    targetSnapshotCache = { key, mainBuild, snapshot }
    return snapshot
})

/** 目标面板三侧状态（未就绪时给空状态，模板门后不会渲染） */
const targetSides = computed(() => charTeamSnapshot.value?.settings ?? null)
/** 三侧构筑实例（表达式校验 / 预览） */
const targetSideBuilds = computed(() => charTeamSnapshot.value?.builds ?? null)

/** 目标面板初始构筑位：只跟随左栏当前上下文初始化，不建立双向联动 */
const targetInitialSide = computed<TranscendSlotGroup>(() => {
    const prefix = leftTabKey.value.split(":")[0]
    if (prefix === "assist1" || prefix === "assist2") return prefix
    return "main"
})

/**
 * 目标面板写回：主控表达式先经主控构筑校验，非法时不写回（保持原版口径）并标记草稿非法；
 * 其余字段直接落到 `CharSettings`（localStorage 深监听自动持久化）。
 * @param side 构筑位
 * @param patch 面板补丁
 */
function onTargetPatch(side: TranscendSlotGroup, patch: Partial<TargetSideState>): void {
    if (side === "main" && patch.targetFunction !== undefined) {
        if (isCharBuildReady.value && charBuild.value.validateAST(patch.targetFunction)) {
            targetDraftInvalid.value = true
            return
        }
        targetDraftInvalid.value = false
    }
    applyCharTargetPatch(charSettings.value, side, patch)
    updateCharBuild()
}

/** 召回目标卡：浮动 / 吸附态回到左栏底部 */
function recallTargetCard(): void {
    targetDock.value = "left"
}

/** 吸附三栏只在 lg 以上成立（与卡片内的 canDockRight 一致）；缩窄后自动召回，避免三栏挤压缩放主栏 */
const canDockRight = useMediaQuery("(min-width: 1024px)")
watch(canDockRight, value => {
    if (!value && targetDock.value === "right") recallTargetCard()
})

/** 切换角色后草稿标记失效（新角色从自己的提交值重建） */
watch(selectedCharId, () => {
    targetDraftInvalid.value = false
})

/** 切停靠态会重挂载目标面板并丢弃未提交草稿，非法标记随之失效 */
watch(targetDock, () => {
    targetDraftInvalid.value = false
})

/** 吸附态三栏轨道：左右最小宽度按可用宽度 clamp（25%），1024–1359px 下中栏仍恒为可用宽度的一半 */
const TARGET_GRID_COLUMNS = "minmax(min(340px, 25%), 1fr) minmax(0, 2fr) minmax(min(340px, 25%), 1fr)"
const targetGridStyle = computed(() => (targetDock.value === "right" ? { gridTemplateColumns: TARGET_GRID_COLUMNS } : undefined))
//#endregion

const charDetailExpend = ref(true)
const weapon_select_model_show = ref(false)
const weaponDefaultTab = ref("近战")
const monster_select_model_show = ref(false)
const enemyName = computed(() => monsterMap.get(charSettings.value.enemyId)?.n || "")
const newWeaponSelection = ref({ melee: 0, ranged: 0 })

/**
 * 近战/远程武器槽位是否为“未装备”空态（空武器 id 为 0）。
 */
const meleeWeaponEmpty = computed(() => charBuild.value.meleeWeapon?.isEmpty ?? true)
const rangedWeaponEmpty = computed(() => charBuild.value.rangedWeapon?.isEmpty ?? true)

/**
 * 角色详情「灾厄武器」子区的数据源：当前构筑的近战 / 远程武器。
 * 同律武器（LeveledSkillWeapon）没有熔炉字段，inherit 型复用同一把物理武器，故不入列。
 */
const calamityWeaponCandidates = computed(() => [charBuild.value.meleeWeapon, charBuild.value.rangedWeapon])

/**
 * 同律武器是否为 inherit 型且其继承槽位未装备（此时同律面板无属性可展示）。
 */
const skillWeaponInheritBaseEmpty = computed(() => {
    const skillWeapon = charBuild.value.skillWeapon
    if (!skillWeapon?.inherit) return false
    return skillWeapon.inherit === "melee" ? meleeWeaponEmpty.value : rangedWeaponEmpty.value
})

/**
 * 提交武器槽位选择（含卸下装备：id 为 0）。
 * 更换武器后同步处理：
 * 1. 清空被卸下槽位已装备的武器魔之楔（未装备的武器不承载魔之楔）；
 * 2. 剔除两把武器上限定已不匹配的魔之楔（如「锋锐·缠缚」限切割，换成贯穿武器后失效）并提示；
 * 3. 若当前技能属于被卸下的武器，回退到角色主技能，避免残留失效技能。
 * @param melee 近战武器 id（0 表示卸下）
 * @param ranged 远程武器 id（0 表示卸下）
 * @param closeModal 是否同时关闭武器选择弹窗
 */
function commitWeaponSelection(melee: number, ranged: number, closeModal = true) {
    const prevMelee = charSettings.value.meleeWeapon
    const prevRanged = charSettings.value.rangedWeapon
    const prevBaseName = charSettings.value.baseName
    const currentBuild = charBuild.value
    const droppingMelee = melee === 0 && prevMelee !== 0
    const droppingRanged = ranged === 0 && prevRanged !== 0
    const switchingMelee = melee !== prevMelee && !droppingMelee
    const switchingRanged = ranged !== prevRanged && !droppingRanged

    newWeaponSelection.value = { melee, ranged }
    charSettings.value.meleeWeapon = melee
    charSettings.value.rangedWeapon = ranged

    if (droppingMelee || droppingRanged) {
        if (droppingMelee) {
            charSettings.value.meleeMods = Array(8).fill(null)
        }
        if (droppingRanged) {
            charSettings.value.rangedMods = Array(8).fill(null)
        }
        // 在 charBuild 缓存失效前判断当前技能归属（成员判断基于变更前的武器技能列表）
        const wasMeleeSkill = droppingMelee && currentBuild.meleeWeaponSkills.some(skill => skill.名称 === prevBaseName)
        const wasRangedSkill = droppingRanged && currentBuild.rangedWeaponSkills.some(skill => skill.名称 === prevBaseName)
        if (wasMeleeSkill || wasRangedSkill) {
            charSettings.value.baseName = currentBuild.char.技能[0]?.名称 || ""
        }
    }
    // 换武器后按新武器重算限定：不匹配的魔之楔不能留在槽位里继续提供加成
    if (switchingMelee || switchingRanged) {
        const reasonKey =
            switchingMelee && switchingRanged
                ? "char-build.weapon_change_reason_both"
                : switchingMelee
                  ? "char-build.weapon_change_reason_melee"
                  : "char-build.weapon_change_reason_ranged"
        stripIncompatibleMods(reasonKey)
    }
    updateCharBuild()
    if (closeModal) {
        weapon_select_model_show.value = false
    }
}

function handleWeaponSelection(melee: number, ranged: number) {
    commitWeaponSelection(melee, ranged)
}
function applyWeaponSelection() {
    commitWeaponSelection(newWeaponSelection.value.melee, newWeaponSelection.value.ranged)
}

/**
 * 打开武器选择弹窗并定位到指定槽位类型。
 * @param tab 槽位类型（近战/远程）
 */
function openWeaponSelectForSlot(tab: "近战" | "远程") {
    weaponDefaultTab.value = tab
    weapon_select_model_show.value = true
}

function selectEnemy(id: number) {
    charSettings.value.enemyId = id
    updateCharBuild()
    monster_select_model_show.value = false
}

async function shareCharBuild(title: string, desc: string = "") {
    try {
        // 分享 / 上传用分享安全序列化（只带当前激活装备变体），满足服务端 20,000 上限
        const settingsString = serializeCharSettingsForShare(charSettings.value)
        const result = await createBuildMutation({
            input: {
                title,
                desc,
                charId: parseInt(route.params.charId as string),
                charSettings: settingsString,
            },
        })

        if (result) {
            const shareUrl = `${env.endpoint}/char/${route.params.charId}/${result.id}`
            await copyText(shareUrl)
            ui.showSuccessMessage(t("char-build.share_link_copied"))
        }
    } catch (error) {
        ui.showErrorMessage(t("char-build.share_failed"), error instanceof Error ? error.message : t("char-build.unknown_error"))
    }
}
;(globalThis as any).__chapterCounter = 1

let roleCache: DNARoleShowBean | null = null
/**
 * 从游戏同步指定角色/武器的魔之楔数据（含中枢光环）。
 * @param id 角色或武器ID
 * @param isWeapon 是否武器
 * @param isConWeapon 是否同律武器
 * @returns 解析后的魔之楔 [id, 等级] 列表、武器类型与光环ID；失败返回 null
 */
async function fetchGameMods(id: number, isWeapon: boolean, isConWeapon: boolean = false) {
    const dna = await setting.getDNAAPI()
    if (!dna) {
        ui.showErrorMessage(t("chat.needLogin"))
        return null
    }
    if (!roleCache) {
        await setting.startHeartbeat()
        try {
            const res = await dna.defaultRoleForTool()
            if (!res.success || !res.data?.roleInfo.roleShow.roleChars) {
                ui.showErrorMessage(t("char-build.fetch_char_info_failed"))
                return null
            }
            roleCache = res.data.roleInfo.roleShow
        } finally {
            await setting.stopHeartbeat()
        }
    }
    const chars = (roleCache.roleChars || []).reduce(
        (prev, cur) => {
            prev[+cur.charId] = cur
            return prev
        },
        {} as Record<number, DNARoleCharsBean>
    )
    const weapons = [...(roleCache.closeWeapons || []), ...(roleCache.langRangeWeapons || [])].reduce(
        (prev, cur) => {
            prev[+cur.weaponId] = cur
            return prev
        },
        {} as Record<number, DNAWeaponBean>
    )

    if (isWeapon || isConWeapon) {
        if (!weapons[id]) {
            ui.showErrorMessage(t("char-build.unavailable_weapon"))
            return null
        }
        const weapon = await dna.getWeaponDetail(id, weapons[id].weaponEid)
        if (!weapon.success || !weapon.data) {
            ui.showErrorMessage(t("char-build.fetch_weapon_info_failed"))
            return null
        }
        return {
            mods: reorderGameStyleModes(weapon.data.weaponDetail.modes)
                .slice(0, 8)
                .map(m => {
                    try {
                        if (!m?.id) return null
                        const mod = LeveledModHelper.fromId(+m.id, inv.getModLv(+m.id))
                        return [+m.id, mod.等级] as [number, number]
                    } catch {
                        return null
                    }
                }),
            weaponType: LeveledWeaponHelper.fromId(id).类型,
            auraMod: undefined,
        }
    }

    if (!chars[id]) {
        ui.showErrorMessage(t("char-build.unavailable_char"))
        return null
    }
    const char = await dna.getRoleDetail(id, chars[id].charEid)
    if (!char.success || !char.data) {
        ui.showErrorMessage(t("char-build.fetch_char_info_failed"))
        return null
    }
    const reorderedModes = reorderGameStyleModes(char.data.charDetail.modes)
    return {
        mods: reorderedModes
            .map(m => {
                try {
                    if (!m?.id) return null
                    const mod = LeveledModHelper.fromId(+m.id, m.level)
                    return [+m.id, mod.等级] as [number, number]
                } catch {
                    return null
                }
            })
            .slice(0, 8),
        weaponType: undefined,
        auraMod: reorderedModes[8]?.id ? +reorderedModes[8].id : undefined,
    }
}

/**
 * 用整份槽位替换当前激活变体在指定类型下的槽位（长度补齐到该类型的固定槽位数）。
 * @param type 槽位类型
 * @param slots 新的槽位列表
 */
function replaceActiveModSlots(type: ModSlotType, slots: ([number, number] | null)[]) {
    const target = activeModSlots(type)
    const padded = Array.from({ length: MOD_SLOT_COUNTS[type] }, (_, index) => slots[index] ?? null)
    target.splice(0, target.length, ...padded)
}

/**
 * 从游戏同步魔之楔到当前构筑（写入当前激活的变体）。
 * @param id 角色或武器 id
 * @param isWeapon 是否武器
 * @param isConWeapon 是否同律武器
 */
async function syncModFromGame(id: number, isWeapon: boolean, isConWeapon: boolean = false) {
    const data = await fetchGameMods(id, isWeapon, isConWeapon)
    if (!data) return
    if (isWeapon || isConWeapon) {
        if (data.weaponType === "近战") replaceActiveModSlots("近战", data.mods)
        else if (data.weaponType === "远程") replaceActiveModSlots("远程", data.mods)
    } else {
        replaceActiveModSlots("角色", data.mods)
        if (data.auraMod) setActiveAuraMod(data.auraMod)
    }
    updateCharBuild()
    localStorage.setItem(`build.${selectedCharId.value}`, serializeCharSettings(charSettings.value))
    ui.showSuccessMessage(t("char-build.sync_success"))
}
</script>

<template>
    <!-- 数据就绪前整页不求值：简洁/专业视图、全部弹窗（含常挂载的 AutoBuild）都挂在
         isCharBuildReady 门后，所有构筑 API 消费只在门后发生。真无数据形态（未安装数据包）
         落到 fallback；DD2 直读形态与已水合形态都有数据，不会进这里。 -->
    <div v-if="!isCharBuildReady" class="flex h-full flex-col items-center justify-center gap-2">
        <span class="loading loading-spinner loading-md" />
        <span class="text-sm text-base-content/60">{{
            dataPackBootstrapLoading ? $t("ai.loading") : $t("startup-modal.pack_install_hint")
        }}</span>
    </div>
    <template v-else>
        <!-- Tour 组件 -->
        <VTour
            ref="tour"
            :steps="steps"
            :button-labels="buttonLabels"
            backdrop
            highlight
            no-scroll
            @on-tour-step="handleTourStep"
            @on-tour-end="tourStore.markTourCompleted('char-build')"
        />

        <!-- 表达式字段拖拽 / 放置：浮动标签（内容 = 将要插入的字符串，跟随指针）+ 触控抓起的提示条（挂到 body，避免被滚动容器裁剪） -->
        <Teleport to="body">
            <div
                v-if="exprFloatingPayload"
                data-expr-float
                class="pointer-events-none fixed z-10000 rounded-xs border border-primary/50 bg-base-100/95 px-2 py-1 text-xs font-semibold whitespace-nowrap text-primary shadow-lg"
                :style="{ left: `${exprGhostPosition.x + 14}px`, top: `${exprGhostPosition.y + 16}px` }"
            >
                {{ exprFloatingPayload.expr }}
            </div>
            <div
                v-if="exprDragPayload && !exprDragging"
                data-expr-armed-hint
                class="fixed bottom-4 left-1/2 z-10000 flex -translate-x-1/2 items-center gap-2 rounded-xs border border-primary/40 bg-base-100/95 px-3 py-1.5 text-xs text-base-content shadow-lg"
            >
                <Icon icon="ri:drag-move-line" class="size-3.5 shrink-0 text-primary" />
                <span>{{ $t("char-build.drag_field_armed", { name: exprDragPayload.label }) }}</span>
                <button type="button" class="cursor-pointer font-semibold text-primary hover:underline" @click="clearExprDrag">
                    {{ $t("取消") }}
                </button>
            </div>
        </Teleport>

        <dialog class="modal" :class="{ 'modal-open': simulator_model_show }">
            <div class="modal-box bg-base-300 w-11/12 max-w-6xl p-0">
                <GameSimulator v-if="simulator_model_show" :char-build="charBuild" />
            </div>
            <div class="modal-backdrop" @click="simulator_model_show = false" />
        </dialog>
        <dialog class="modal" :class="{ 'modal-open': autobuild_model_show }">
            <div class="modal-box bg-base-300 w-11/12 max-w-6xl">
                <AutoBuild v-if="autobuild_model_show" :update="autobuild_model_show" :char-build="charBuild" :char-id="selectedCharId" :settings="charSettings" @change="newBuild = $event" />
                <div class="modal-action">
                    <form class="flex justify-end gap-2" method="dialog">
                        <button class="btn btn-primary" @click="applyAutobuild">
                            {{ $t("应用") }}
                        </button>
                        <button class="btn" @click="autobuild_model_show = false">
                            {{ $t("取消") }}
                        </button>
                    </form>
                </div>
            </div>
            <div class="modal-backdrop" @click="autobuild_model_show = false" />
        </dialog>
        <dialog class="modal" :class="{ 'modal-open': weapon_select_model_show }">
            <div class="modal-box bg-base-300 w-11/12 max-w-6xl p-0">
                <WeaponListView
                    v-if="weapon_select_model_show"
                    :char-build="charBuild"
                    :default-tab="weaponDefaultTab"
                    :melee="charSettings.meleeWeapon"
                    :ranged="charSettings.rangedWeapon"
                    :use-global="charSettings.useGlobal"
                    :char-settings="charSettings"
                    @change="handleWeaponSelection"
                />
                <div class="modal-action">
                    <form class="flex justify-end gap-2" method="dialog">
                        <button class="btn btn-primary" @click="applyWeaponSelection">
                            {{ $t("应用") }}
                        </button>
                        <button class="btn" @click="weapon_select_model_show = false">
                            {{ $t("取消") }}
                        </button>
                    </form>
                </div>
            </div>
            <div class="modal-backdrop" @click="weapon_select_model_show = false" />
        </dialog>
        <dialog class="modal" :class="{ 'modal-open': monster_select_model_show }">
            <div class="modal-box bg-base-300 w-11/12 max-w-6xl p-0">
                <MonsterListView
                    v-if="monster_select_model_show"
                    :selected-id="charSettings.enemyId"
                    :level="charSettings.enemyLevel"
                    @select="selectEnemy"
                />
                <div class="modal-action">
                    <button class="btn" @click="monster_select_model_show = false">{{ $t("common.close") }}</button>
                </div>
            </div>
            <div class="modal-backdrop" @click="monster_select_model_show = false" />
        </dialog>
        <!-- 配装分享弹窗 -->
        <DialogModel v-model="share_model_show" @submit="confirmShare" class="bg-base-300">
            <div class="space-y-4">
                <h3 class="text-xl font-bold">{{ $t("char-build.share_build") }}</h3>
                <div>
                    <label class="label" for="share-title">
                        <span class="label-text">{{ $t("char-build.title") }}</span>
                    </label>
                    <input
                        id="share-title"
                        v-model="share_title"
                        type="text"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        :placeholder="$t('char-build.enter_title')"
                        maxlength="50"
                    />
                </div>
                <div>
                    <label class="label" for="share-desc">
                        <span class="label-text">{{ $t("char-build.description") }}</span>
                    </label>
                    <textarea
                        id="share-desc"
                        v-model="share_desc"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary resize-none py-1"
                        :placeholder="$t('char-build.enter_description')"
                        rows="3"
                        maxlength="2000"
                    ></textarea>
                </div>
            </div>
        </DialogModel>
        <!-- 简洁模式：独立的全屏 HUD 装配总览（默认），与专业模式互斥渲染 -->
        <CharBuildSimpleView
            v-if="buildViewMode === 'simple'"
            :char-build="charBuild"
            :attributes="attributes"
            :char-settings="charSettings"
            :char-name="selectedChar"
            @switch-mode="buildViewMode = 'pro'"
            @use-build="applyLoadedSettings"
        />
        <div v-else data-agent-scope="page" data-agent-page="char-build" class="h-full flex flex-col relative">
            <!-- 背景图 -->
            <div
                class="inset-0 absolute opacity-40"
                :style="{
                backgroundImage: `url(${charBuild.char.bustUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }"
            />
            <!-- 顶栏（layout 级，无外边距） data-agent-exclude -->
            <header
                data-tour="top-actions"
                data-agent-exclude="chrome"
                class="relative z-10 flex-none border-b border-base-content/15 bg-base-100/40 backdrop-blur-sm"
            >
                <div class="flex min-w-0 items-center gap-2 px-2 py-1.5 sm:px-3">
                    <div class="flex min-w-0 flex-1 items-center gap-1.5">
                        <img
                            v-if="charBuild.char.属性"
                            :src="LeveledChar.elementUrl(charBuild.char.属性)"
                            :alt="$t(charBuild.char.属性 + '属性')"
                            class="h-6 w-3 shrink-0 object-cover"
                        />
                        <ImageFallback :src="charBuild.char.url" :alt="gt(selectedChar)" class="size-7 shrink-0 rounded-xs object-cover">
                            <Icon icon="ri:user-line" class="size-7 opacity-40" />
                        </ImageFallback>
                        <h1 class="min-w-0 flex-1 truncate text-sm font-bold leading-none">
                            {{ $t(selectedChar) || $t("char-build.title") }}
                        </h1>
                        <span class="shrink-0 border border-base-content/20 px-1 py-0 font-mono text-[9px] leading-4 tracking-wider text-base-content/50">
                            LV. <span class="font-orbitron">{{ charSettings.charLevel }}</span>
                        </span>
                    </div>
                    <!-- xs：工具栏限宽 + 横向滚动；sm+：按内容换行。按钮统一方形 icon-only，名称走 title -->
                    <div
                        class="flex min-w-0 max-w-[60%] shrink-0 flex-nowrap items-center gap-1 overflow-x-auto sm:max-w-none sm:flex-wrap sm:overflow-visible"
                    >
                        <button
                            data-agent="toggle-transcend"
                            data-agent-allow
                            class="btn btn-xs btn-square shrink-0"
                            :class="transcendEnabled ? 'btn-primary' : 'btn-ghost'"
                            :title="$t('transcend-build.enabled')"
                            :aria-pressed="transcendEnabled"
                            @click="toggleTranscend"
                        >
                            <Icon icon="ri:sparkling-line" class="size-3.5" />
                        </button>
                        <button
                            class="btn btn-xs btn-square btn-ghost shrink-0"
                            :title="$t('char-build.switch_to_simple')"
                            @click="buildViewMode = 'simple'"
                        >
                            <Icon icon="ri:focus-3-line" class="size-3.5" />
                        </button>
                        <button
                            class="btn btn-xs btn-square btn-ghost shrink-0"
                            data-tour="tour-button"
                            :title="$t('char-build.tour')"
                            @click="tour?.startTour()"
                        >
                            <Icon icon="ri:question-line" class="size-3.5" />
                        </button>
                        <button class="btn btn-xs btn-square btn-ghost shrink-0" :title="$t('char-build.share')" @click="openShareModal">
                            <Icon icon="ri:share-line" class="size-3.5" />
                        </button>
                        <OpenInAppButton
                            kind="build"
                            :id="route.params.buildId"
                            class="btn btn-xs btn-square btn-ghost shrink-0"
                            icon-class="size-3.5"
                        >
                            <span class="sr-only">{{ $t("deep-link.open_in_app") }}</span>
                        </OpenInAppButton>
                        <button
                            v-if="['黎瑟', '赛琪'].includes(selectedChar)"
                            class="btn btn-xs btn-square btn-ghost shrink-0"
                            :title="$t('char-build.simulator')"
                            @click="simulator_model_show = true"
                        >
                            <Icon icon="ri:game-line" class="size-3.5" />
                        </button>
                        <button
                            data-agent="open-auto-build"
                            data-agent-allow
                            class="btn btn-xs btn-square btn-secondary shrink-0"
                            :title="$t('char-build.auto_build')"
                            @click="autobuild_model_show = true"
                        >
                            <Icon icon="ri:robot-2-line" class="size-3.5" />
                        </button>
                        <button
                            class="btn btn-xs btn-square btn-success shrink-0"
                            :title="$t('build-compare.title')"
                            @click="$router.push('/char-build-compare')"
                        >
                            <Icon icon="ri:bar-chart-line" class="size-3.5" />
                        </button>
                        <div class="dropdown dropdown-end shrink-0">
                            <div
                                tabindex="0"
                                role="button"
                                class="btn btn-xs btn-square btn-primary shrink-0"
                                :title="$t('char-build.save_project')"
                            >
                                <Icon icon="ri:save-fill" class="size-3.5" />
                            </div>
                            <div
                                tabindex="0"
                                class="dropdown-content z-1 w-80 rounded-xs border border-base-content/15 bg-base-100/85 p-3 shadow-lg backdrop-blur-md sm:w-96"
                            >
                                <div class="space-y-2">
                                    <ul v-if="charProject.projects.length > 0" class="max-h-[60vh] overflow-y-auto">
                                        <li
                                            v-for="(project, index) in charProject.projects"
                                            :key="project.name"
                                            class="flex items-center gap-2 rounded-xs p-2 transition-colors duration-150"
                                            :class="{ 'bg-primary/10': project.name === charProject.selected }"
                                        >
                                            <input
                                                v-if="editingProjectIndex === index"
                                                :id="`char-project-name-input-${index}`"
                                                v-model="editProjectName"
                                                class="w-24 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-sm outline-none transition-colors duration-150 focus:border-primary sm:w-36"
                                                @blur="finishEditProjectName"
                                                @keyup.enter="finishEditProjectName"
                                                @keyup.escape="editingProjectIndex = -1"
                                            />
                                            <span
                                                v-else
                                                class="font-medium text-sm link link-primary link-hover"
                                                :title="$t('char-build.click_to_load')"
                                                @click="loadConfigByIndex(index)"
                                            >
                                                {{ project.name }}
                                            </span>
                                            <div
                                                class="ml-auto btn btn-xs btn-ghost btn-square border-0"
                                                :title="$t('char-build.rename')"
                                                @click="renameProject(index)"
                                            >
                                                <Icon icon="ri:pencil-fill" class="h-4 w-4" />
                                            </div>
                                            <div
                                                class="btn btn-xs btn-ghost btn-square border-0"
                                                :title="$t('char-build.save')"
                                                @click="saveConfig(index)"
                                            >
                                                <Icon icon="ri:save-fill" class="h-4 w-4" />
                                            </div>
                                            <div
                                                class="btn btn-xs btn-ghost btn-square border-0"
                                                :title="$t('common.delete')"
                                                @click="deleteProject(index)"
                                            >
                                                <Icon icon="ri:delete-bin-2-fill" class="h-4 w-4" />
                                            </div>
                                        </li>
                                    </ul>
                                    <div v-else class="text-sm opacity-70">
                                        {{ $t("char-build.no_saved_projects") }}
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button class="btn btn-primary btn-sm flex-1 min-w-20" @click="addProject()">
                                            {{ $t("char-build.new_project") }}
                                        </button>
                                        <button class="btn btn-outline btn-sm flex-1 min-w-20" @click="copyBuildToClipboard()">
                                            {{ $t("char-build.copy_to_clipboard") }}
                                        </button>
                                        <button class="btn btn-outline btn-sm flex-1 min-w-20" @click="importBuildFromClipboard()">
                                            {{ $t("char-build.import_from_clipboard") }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button class="btn btn-xs btn-square btn-ghost shrink-0" :title="$t('char-build.reset_config')" @click="resetConfig">
                            <Icon icon="ri:refresh-line" class="size-3.5" />
                        </button>
                    </div>
                </div>
            </header>
            <div
                class="flex-1 flex flex-col overflow-y-auto sm:overflow-hidden"
                :class="targetDock === 'right' ? 'lg:grid lg:grid-rows-[minmax(0,1fr)]' : 'sm:flex-row'"
                :style="targetGridStyle"
                :data-char-layout="targetDock === 'right' ? 'three-column' : 'two-column'"
            >
                <!-- 侧边栏 -->
                <ScrollArea
                    id="char-build-scroll1"
                    data-agent-scope="sidebar"
                    data-char-column="left"
                    class="flex-none"
                    :class="targetDock === 'right' ? 'lg:w-auto min-w-0' : 'sm:w-92'"
                >
                    <div class="m-2 flex flex-col gap-4">
                        <!-- 两行页签：主控 5 个（角色 / 近战 / 远程 / 同律 / 额外精通），协战各 3 个 -->
                        <BuildTabRows data-tour="char-tabs" :rows="charTabRows" :active-key="leftTabKey" @select="selectLeftTab" />
                        <!-- 角色 -->
                        <div
                            v-if="leftTabKey === 'main:char'"
                            data-char-tab-panel="main-char"
                            class="rounded-xs border border-base-content/10 bg-base-100/70 backdrop-blur-sm shadow-sm p-3 space-y-3"
                        >
                            <SectionHeader :title="$t(selectedChar) || $t('char-build.title')" no-animate compact>
                                <template #trailing>
                                    <span class="font-orbitron text-sm font-semibold text-primary tabular-nums"
                                        >Lv. {{ charSettings.charLevel }}</span
                                    >
                                </template>
                            </SectionHeader>
                            <div class="flex items-center gap-2 text-sm p-1">
                                <div class="flex-1">
                                    <input
                                        v-model.number="charSettings.charLevel"
                                        type="range"
                                        class="range range-primary range-xs w-full"
                                        min="1"
                                        max="80"
                                        step="1"
                                    />
                                </div>
                            </div>
                            <!-- 词条：collapse-content 自带 overflow: clip，会裁掉高亮行的 outline/阴影；用 overflow-clip-margin 外扩裁剪边界（负 margin 会让透明盒压住上方滑条与下方箭头的点击区） -->
                            <div class="collapse p-1" :class="{ 'collapse-open': charDetailExpend }">
                                <div class="space-y-1 collapse-content p-0 [overflow-clip-margin:12px]">
                                    <CharAttrShow :attributes="attributes" :char-build="charBuild" />
                                </div>
                            </div>
                            <div
                                class="flex justify-center items-center cursor-pointer p-2 hover:bg-base-100/60 transition-all duration-200"
                                @click="charDetailExpend = !charDetailExpend"
                            >
                                <Icon icon="radix-icons:chevron-down" :class="{ 'rotate-180': charDetailExpend }" />
                            </div>
                            <!-- 技能选择 -->
                            <div data-tour="skill-select">
                                <SkillTabs
                                    :skills="charBuild.charSkills"
                                    :selected-skill-name="charSettings.baseName"
                                    @select="charSettings.baseName = $event"
                                />
                            </div>
                            <div v-if="selectedSkillLevelIndex !== -1" class="flex items-center gap-4 text-sm p-1">
                                <div class="flex-1">
                                    <input
                                        v-model.number="currentSkillLevel"
                                        type="range"
                                        class="range range-primary range-xs w-full"
                                        :min="CHAR_SKILL_LEVEL_MIN"
                                        :max="SKILL_LEVEL_UI_MAX"
                                        step="1"
                                    />
                                </div>
                                <div class="flex-none">Lv. {{ currentSkillLevel }}</div>
                            </div>
                            <SkillFields
                                :skill="charBuild.selectedSkill"
                                :selected-identifiers="charBuild.getIdentifierNames(charBuild.targetFunction)"
                                :char-build="charBuild"
                                :attributes="attributes"
                            />
                        </div>

                        <!-- 武器 -->
                        <WeaponTab
                            v-if="leftTabKey === 'main:melee' && !meleeWeaponEmpty"
                            data-char-tab-panel="main-melee"
                            v-model:model-show="weapon_select_model_show"
                            @open-weapon-select="weaponDefaultTab = '近战'"
                            wkey="melee"
                            :char-build="charBuild"
                            :attributes="attributes"
                        />
                        <!-- 近战武器空槽：与已装备卡片一致的“点击名称+切换图标”换装入口 -->
                        <div
                            v-else-if="leftTabKey === 'main:melee'"
                            data-char-tab-panel="main-melee"
                            class="rounded-xs border border-dashed border-base-content/25 bg-base-100/40 backdrop-blur-sm shadow-sm p-3 space-y-3"
                        >
                            <SectionHeader no-animate compact>
                                <template #title>
                                    <div
                                        class="flex min-w-0 cursor-pointer items-center gap-1.5 text-[17px] font-semibold text-base-content/70 transition-colors duration-150 hover:text-primary"
                                        :title="$t('char-build.equip_weapon', { slot: $t('近战') })"
                                        @click="openWeaponSelectForSlot('近战')"
                                    >
                                        <span class="truncate">{{ $t("近战") }} · {{ $t("char-build.weapon_slot_not_equipped") }}</span>
                                        <Icon icon="ri:exchange-line" class="h-4 w-4 shrink-0 text-primary" />
                                    </div>
                                </template>
                            </SectionHeader>
                            <p class="text-xs text-base-content/50">{{ $t("char-build.weapon_slot_empty_desc") }}</p>
                        </div>
                        <WeaponTab
                            v-if="leftTabKey === 'main:ranged' && !rangedWeaponEmpty"
                            data-char-tab-panel="main-ranged"
                            v-model:model-show="weapon_select_model_show"
                            @open-weapon-select="weaponDefaultTab = '远程'"
                            wkey="ranged"
                            :char-build="charBuild"
                            :attributes="attributes"
                        />
                        <!-- 远程武器空槽：与已装备卡片一致的“点击名称+切换图标”换装入口 -->
                        <div
                            v-else-if="leftTabKey === 'main:ranged'"
                            data-char-tab-panel="main-ranged"
                            class="rounded-xs border border-dashed border-base-content/25 bg-base-100/40 backdrop-blur-sm shadow-sm p-3 space-y-3"
                        >
                            <SectionHeader no-animate compact>
                                <template #title>
                                    <div
                                        class="flex min-w-0 cursor-pointer items-center gap-1.5 text-[17px] font-semibold text-base-content/70 transition-colors duration-150 hover:text-primary"
                                        :title="$t('char-build.equip_weapon', { slot: $t('远程') })"
                                        @click="openWeaponSelectForSlot('远程')"
                                    >
                                        <span class="truncate">{{ $t("远程") }} · {{ $t("char-build.weapon_slot_not_equipped") }}</span>
                                        <Icon icon="ri:exchange-line" class="h-4 w-4 shrink-0 text-primary" />
                                    </div>
                                </template>
                            </SectionHeader>
                            <p class="text-xs text-base-content/50">{{ $t("char-build.weapon_slot_empty_desc") }}</p>
                        </div>
                        <WeaponTab
                            v-if="leftTabKey === 'main:skillweapon' && !skillWeaponInheritBaseEmpty"
                            data-char-tab-panel="main-skillweapon"
                            wkey="skill"
                            :char-build="charBuild"
                            :attributes="attributes"
                        />
                        <!-- 同律武器继承槽位为空：保持同卡片头部点击切换继承武器 -->
                        <div
                            v-else-if="leftTabKey === 'main:skillweapon'"
                            data-char-tab-panel="main-skillweapon"
                            class="rounded-xs border border-dashed border-base-content/25 bg-base-100/40 backdrop-blur-sm shadow-sm p-3 space-y-3"
                        >
                            <SectionHeader no-animate compact>
                                <template #title>
                                    <div
                                        class="flex min-w-0 cursor-pointer items-center gap-1.5 text-[17px] font-semibold text-base-content/70 transition-colors duration-150 hover:text-primary"
                                        :title="
                                        charBuild.skillWeapon?.inherit
                                            ? $t('char-build.equip_weapon', {
                                                  slot: $t(charBuild.skillWeapon.inherit === 'melee' ? '近战' : '远程'),
                                              })
                                            : undefined
                                    "
                                        @click="
                                        charBuild.skillWeapon?.inherit
                                            ? openWeaponSelectForSlot(charBuild.skillWeapon.inherit === 'melee' ? '近战' : '远程')
                                            : undefined
                                    "
                                    >
                                        <span class="truncate">{{ $t("同律") }} · {{ $t("char-build.weapon_slot_not_equipped") }}</span>
                                        <Icon
                                            v-if="charBuild.skillWeapon?.inherit"
                                            icon="ri:exchange-line"
                                            class="h-4 w-4 shrink-0 text-primary"
                                        />
                                    </div>
                                </template>
                            </SectionHeader>
                            <p class="text-xs text-base-content/50">{{ $t("char-build.skill_weapon_empty_desc") }}</p>
                        </div>

                        <!-- 主控额外精通（替代页签行尾的加号圆钮） -->
                        <CharExtraMasteryPanel
                            v-if="leftTabKey === 'main:extra'"
                            :char-id="charBuild.char.id"
                            :value="charSettings.extraMastery"
                            @update:value="charSettings.extraMastery = $event"
                        />

                        <!-- 协战一：角色 / 武器 / 额外精通 -->
                        <CharAssistPanel
                            v-if="leftTabKey === 'assist1:char'"
                            side="assist1"
                            :loadout="assistFacades.assist1"
                            :char-skills="activeAssistSkills"
                            :char-build="activeAssistBuild"
                            :attributes="activeAssistAttributes"
                            :resonance-gain="charSettings.resonanceGain"
                            :exclude-ids="getAssistExcludeIds('assist1')"
                            @update="updateAssistLoadout('assist1', $event)"
                            @select-char="selectAssistChar('assist1', $event)"
                            @import="openAssistImport('assist1')"
                        />
                        <CharAssistWeaponPanel
                            v-else-if="leftTabKey === 'assist1:weapon'"
                            :loadout="assistFacades.assist1"
                            :char-build="activeAssistBuild"
                            :attributes="activeAssistAttributes"
                            :resonance-gain="charSettings.resonanceGain"
                            @update="updateAssistLoadout('assist1', $event)"
                        />
                        <CharExtraMasteryPanel
                            v-else-if="leftTabKey === 'assist1:extra'"
                            :char-id="assistFacades.assist1.charId"
                            :value="assistFacades.assist1.extraMastery"
                            @update:value="updateAssistLoadout('assist1', { extraMastery: $event })"
                        />

                        <!-- 协战二：角色 / 武器 / 额外精通 -->
                        <CharAssistPanel
                            v-if="leftTabKey === 'assist2:char'"
                            side="assist2"
                            :loadout="assistFacades.assist2"
                            :char-skills="activeAssistSkills"
                            :char-build="activeAssistBuild"
                            :attributes="activeAssistAttributes"
                            :resonance-gain="charSettings.resonanceGain"
                            :exclude-ids="getAssistExcludeIds('assist2')"
                            @update="updateAssistLoadout('assist2', $event)"
                            @select-char="selectAssistChar('assist2', $event)"
                            @import="openAssistImport('assist2')"
                        />
                        <CharAssistWeaponPanel
                            v-else-if="leftTabKey === 'assist2:weapon'"
                            :loadout="assistFacades.assist2"
                            :char-build="activeAssistBuild"
                            :attributes="activeAssistAttributes"
                            :resonance-gain="charSettings.resonanceGain"
                            @update="updateAssistLoadout('assist2', $event)"
                        />
                        <CharExtraMasteryPanel
                            v-else-if="leftTabKey === 'assist2:extra'"
                            :char-id="assistFacades.assist2.charId"
                            :value="assistFacades.assist2.extraMastery"
                            @update:value="updateAssistLoadout('assist2', { extraMastery: $event })"
                        />

                        <!-- 目标函数卡：停靠左栏 / 浮动 / 吸附右侧第三栏三态，内容由 FloatingTargetCard 提供 -->
                        <FloatingTargetCard
                            v-if="targetDock === 'left' && targetSides && targetSideBuilds && charTeamSnapshot"
                            :sides="targetSides"
                            :side-builds="targetSideBuilds"
                            :snapshot="charTeamSnapshot"
                            :dock="targetDock"
                            :initial-side="targetInitialSide"
                            :draft-invalid="targetDraftInvalid"
                            @update:dock="targetDock = $event"
                            @update-loadout="onTargetPatch"
                            @recall="recallTargetCard"
                        />
                        <!-- 目标卡已浮动 / 已吸附：左栏留一行占位，点击召回 -->
                        <button
                            v-else-if="targetDock !== 'left'"
                            type="button"
                            data-target-recall-placeholder
                            data-tour="target-function"
                            data-agent="target-function"
                            :data-target-dock="targetDock"
                            class="flex w-full cursor-pointer items-center justify-between rounded-xs border border-dashed border-base-content/25 bg-base-100/40 px-3 py-2 text-left text-sm text-base-content/60 transition-colors duration-150 hover:border-primary/40 hover:text-primary"
                            @click="recallTargetCard"
                        >
                            <span class="truncate">
                                {{ targetDock === "right" ? $t("char-build.target_docked_hint") : $t("char-build.target_floating_hint") }}
                            </span>
                            <span class="flex shrink-0 items-center gap-1 text-xs">
                                <Icon icon="ri:arrow-left-line" class="size-3.5" />
                                {{ $t("char-build.target_recall") }}
                            </span>
                        </button>
                    </div>
                </ScrollArea>
                <!-- 正文 -->
                <ScrollArea
                    id="char-build-scroll2"
                    data-agent-scope="main"
                    data-char-column="main"
                    class="flex-none min-w-0"
                    :class="targetDock === 'right' ? '' : 'sm:flex-1'"
                >
                    <div class="p-2 space-y-4">
                        <!-- 配装分享 -->
                        <CollapsibleSection
                            number="01"
                            kicker="SHARE"
                            :title="$t('char-build.share_build')"
                            :is-open="!collapsedSections.share"
                            lazy
                            @toggle="toggleSection('share')"
                        >
                            <DOBBuildShow
                                :charId="charBuild.char.id"
                                ref="buildShow"
                                @use-build="applyLoadedSettings"
                            />
                        </CollapsibleSection>
                        <!-- 角色详情 -->
                        <CollapsibleSection
                            number="02"
                            kicker="PROFILE"
                            :title="$t('dna-role-detail.title')"
                            :is-open="!collapsedSections.detail"
                            lazy
                            @toggle="toggleSection('detail')"
                        >
                            <div class="space-y-2">
                                <CharTraceShow :char="charBuild.char" />
                                <CharSkillShow :char="charBuild.char" :model-value="SKILL_LEVEL_UI_MAX" :max="SKILL_LEVEL_UI_MAX" />
                                <CharCalamityWeaponShow :weapons="calamityWeaponCandidates" />
                            </div>
                        </CollapsibleSection>
                        <!-- 基本设置卡片 -->
                        <CollapsibleSection
                            number="03"
                            kicker="SETTINGS"
                            :title="$t('char-build.basic_settings')"
                            :is-open="!collapsedSections.basic"
                            lazy
                            @toggle="toggleSection('basic')"
                        >
                            <div class="flex flex-col gap-3 mt-2">
                                <div class="flex flex-col gap-2.5 rounded-xs border border-base-content/10 bg-base-200/40 p-2.5">
                                    <div class="flex items-center gap-3">
                                        <span class="text-[13px] font-semibold text-base-content/80">
                                            {{ $t("char-build.side_ally") }}
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap items-start gap-x-4 gap-y-2.5">
                                        <div>
                                            <div class="px-2 text-xs text-gray-400 mb-1">
                                                {{ $t("char-build.hp_percent") }}
                                            </div>
                                            <Select
                                                v-model="charSettings.hpPercent"
                                                variant="chip"
                                                class="w-32 min-w-0"
                                                @change="updateCharBuild"
                                            >
                                                <SelectItem v-for="hp in hpPercentOptions" :key="hp" :value="hp / 100">
                                                    {{ hp }}%
                                                </SelectItem>
                                            </Select>
                                        </div>
                                        <div>
                                            <div class="px-2 text-xs text-gray-400 mb-1">
                                                {{ $t("char-build.resonance_gain") }}
                                            </div>
                                            <Select
                                                v-model="charSettings.resonanceGain"
                                                variant="chip"
                                                class="w-32 min-w-0"
                                                @change="updateCharBuild"
                                            >
                                                <SelectItem v-for="rg in resonanceGainOptions" :key="rg" :value="rg">
                                                    {{ rg * 100 }}%
                                                </SelectItem>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                <div class="flex flex-col gap-2.5 rounded-xs border border-base-content/10 bg-base-200/40 p-2.5">
                                    <div class="flex items-center gap-3">
                                        <span class="text-[13px] font-semibold text-base-content/80">
                                            {{ $t("char-build.side_enemy") }}
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap items-start gap-x-4 gap-y-2.5">
                                        <div>
                                            <div class="px-2 text-xs text-gray-400 mb-1">
                                                {{ $t("char-build.enemy") }}
                                            </div>
                                            <button
                                                type="button"
                                                class="inline-flex w-32 min-w-0 cursor-pointer items-center justify-between gap-1.5 appearance-none rounded-xs border border-base-content/5 bg-base-content/5 px-2 py-1.5 text-xs backdrop-blur-xs transition-colors duration-150 hover:bg-base-content/10"
                                                @click="monster_select_model_show = true"
                                            >
                                                <span class="min-w-0 truncate text-left">{{ gt(enemyName) }}</span>
                                                <Icon icon="radix-icons:chevron-down" class="size-3.5 shrink-0 opacity-40" />
                                            </button>
                                        </div>
                                        <div>
                                            <div class="px-2 text-xs text-gray-400 mb-1">
                                                {{ $t("char-build.enemy_resistance") }}
                                            </div>
                                            <Select
                                                v-model="charSettings.enemyResistance"
                                                variant="chip"
                                                class="w-32 min-w-0"
                                                @change="updateCharBuild"
                                            >
                                                <SelectItem v-for="res in enemyResistanceOptions" :key="res" :value="res">
                                                    {{ res * 100 }}%
                                                </SelectItem>
                                            </Select>
                                        </div>
                                        <div>
                                            <div class="px-2 text-xs text-gray-400 mb-1">
                                                {{ $t("char-build.enemy_level") }}
                                            </div>
                                            <Select
                                                v-model="charSettings.enemyLevel"
                                                variant="chip"
                                                class="w-32 min-w-0"
                                                @change="updateCharBuild"
                                            >
                                                <SelectItem v-for="lv in enemyLevelOptions" :key="lv" :value="lv">{{ lv }}</SelectItem>
                                            </Select>
                                        </div>
                                        <div>
                                            <div class="px-2 text-xs text-gray-400 mb-1">
                                                {{ $t("失衡") }}
                                            </div>
                                            <div class="p-0.5">
                                                <input v-model="charSettings.imbalance" type="checkbox" class="toggle toggle-secondary" />
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-base-content/10 pt-2.5">
                                        <span class="flex items-baseline gap-1.5">
                                            <span class="text-[11px] font-semibold text-base-content/45">{{ $t("生命") }}</span>
                                            <span
                                                class="font-orbitron text-[11px] font-bold tabular-nums text-primary"
                                                :title="`${charBuild.enemy.hp}`"
                                            >
                                                {{ formatBigNumber(charBuild.enemy.hp) }}
                                            </span>
                                        </span>
                                        <span class="flex items-baseline gap-1.5">
                                            <span class="text-[11px] font-semibold text-base-content/45">{{ $t("防御") }}</span>
                                            <span class="font-orbitron text-[11px] font-bold tabular-nums text-primary">
                                                {{ charBuild.enemy.def }}
                                            </span>
                                        </span>
                                        <span class="flex items-baseline gap-1.5">
                                            <span class="text-[11px] font-semibold text-base-content/45">{{ $t("护盾") }}</span>
                                            <span
                                                class="font-orbitron text-[11px] font-bold tabular-nums text-primary"
                                                :title="`${charBuild.enemy.es || 0}`"
                                            >
                                                {{ formatBigNumber(charBuild.enemy.es || 0) }}
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-4">
                                <CharHPCurve :desperate="attributes.背水" :boost="attributes.昂扬" />
                                <CharHPCurveConv :desperate="attributes.背水" :boost="attributes.昂扬" />
                            </div>
                        </CollapsibleSection>

                        <!-- MOD配置区域 -->
                        <!-- 角色MOD -->
                        <CollapsibleSection
                            data-tour="char-mods"
                            number="04"
                            kicker="MODS"
                            :title="`${$t('魔之楔')} (${charBuild.getModCostMax(charTab)}/${charBuild.getModCap(charTab)})`"
                            :badge="$t('char-build.mod_count', { count: charBuild.getModCostTransfer(charTab).length })"
                            :is-open="!collapsedSections.mods"
                            lazy
                            @toggle="toggleSection('mods')"
                        >
                            <div class="mt-2">
                                <ModEditer
                                    v-if="charTab === '角色'"
                                    :mods="selectedCharMods"
                                    :mod-options="filterModOptionsBySlot('charMods')"
                                    :char-build="charBuild"
                                    :aura-mod="activeAuraMod"
                                    type="角色"
                                    :polset="charBuild.getModCostTransfer(charTab)"
                                    :variant-index="activeModVariant"
                                    :variant-count="modVariantCount"
                                    @remove-mod="removeMod($event, '角色')"
                                    @select-mod="selectMod('角色', $event[0], $event[1], $event[2])"
                                    @level-change="setModLevel('角色', $event[0], $event[1])"
                                    @select-aura-mod="setActiveAuraMod($event)"
                                    @swap-mods="(index1: number, index2: number) => swapMods(index1, index2, '角色')"
                                    @variant-select="selectModVariant"
                                    @variant-add="appendModVariant"
                                    @variant-remove="dropModVariant"
                                    @sync="syncModFromGame(charBuild.char.id, false)"
                                />

                                <!-- 近战武器MOD -->
                                <ModEditer
                                    v-if="
                                    (charTab === '近战' || (charTab === '同律' && charBuild.skillWeapon?.inherit === 'melee')) &&
                                    !meleeWeaponEmpty
                                "
                                    :mods="selectedMeleeMods"
                                    :mod-options="filterModOptionsBySlot('meleeMods')"
                                    :char-build="charBuild"
                                    type="近战"
                                    :polset="charBuild.getModCostTransfer(charTab)"
                                    :variant-index="activeModVariant"
                                    :variant-count="modVariantCount"
                                    @remove-mod="removeMod($event, '近战')"
                                    @select-mod="selectMod('近战', $event[0], $event[1], $event[2])"
                                    @level-change="setModLevel('近战', $event[0], $event[1])"
                                    @swap-mods="(index1: number, index2: number) => swapMods(index1, index2, '近战')"
                                    @variant-select="selectModVariant"
                                    @variant-add="appendModVariant"
                                    @variant-remove="dropModVariant"
                                    @sync="syncModFromGame(charBuild.meleeWeapon.id, true)"
                                />

                                <!-- 远程武器MOD -->
                                <ModEditer
                                    v-if="
                                    (charTab === '远程' || (charTab === '同律' && charBuild.skillWeapon?.inherit === 'ranged')) &&
                                    !rangedWeaponEmpty
                                "
                                    :mods="selectedRangedMods"
                                    :mod-options="filterModOptionsBySlot('rangedMods')"
                                    :char-build="charBuild"
                                    type="远程"
                                    :polset="charBuild.getModCostTransfer(charTab)"
                                    :variant-index="activeModVariant"
                                    :variant-count="modVariantCount"
                                    @remove-mod="removeMod($event, '远程')"
                                    @select-mod="selectMod('远程', $event[0], $event[1], $event[2])"
                                    @level-change="setModLevel('远程', $event[0], $event[1])"
                                    @swap-mods="(index1: number, index2: number) => swapMods(index1, index2, '远程')"
                                    @variant-select="selectModVariant"
                                    @variant-add="appendModVariant"
                                    @variant-remove="dropModVariant"
                                    @sync="syncModFromGame(charBuild.rangedWeapon.id, true)"
                                />

                                <!-- 同律武器MOD -->
                                <ModEditer
                                    v-if="charTab === '同律' && !charBuild.skillWeapon?.inherit"
                                    :mods="selectedSkillWeaponMods"
                                    :mod-options="filterModOptionsBySlot('skillMods')"
                                    :char-build="charBuild"
                                    type="同律"
                                    :polset="charBuild.getModCostTransfer(charTab)"
                                    :variant-index="activeModVariant"
                                    :variant-count="modVariantCount"
                                    @remove-mod="removeMod($event, '同律')"
                                    @select-mod="selectMod('同律', $event[0], $event[1], $event[2])"
                                    @level-change="setModLevel('同律', $event[0], $event[1])"
                                    @swap-mods="(index1: number, index2: number) => swapMods(index1, index2, '同律')"
                                    @variant-select="selectModVariant"
                                    @variant-add="appendModVariant"
                                    @variant-remove="dropModVariant"
                                    @sync="syncModFromGame(charBuild.char.id, false, true)"
                                />
                                <!-- 未装备武器时的MOD提示 -->
                                <p
                                    v-if="charTab === '近战' && meleeWeaponEmpty"
                                    class="rounded-xs border border-dashed border-base-content/15 px-3 py-2.5 text-xs text-base-content/50"
                                >
                                    {{ $t("char-build.mods_need_weapon", { slot: $t("近战") }) }}
                                </p>
                                <p
                                    v-if="charTab === '远程' && rangedWeaponEmpty"
                                    class="rounded-xs border border-dashed border-base-content/15 px-3 py-2.5 text-xs text-base-content/50"
                                >
                                    {{ $t("char-build.mods_need_weapon", { slot: $t("远程") }) }}
                                </p>
                                <p
                                    v-if="charTab === '同律' && skillWeaponInheritBaseEmpty"
                                    class="rounded-xs border border-dashed border-base-content/15 px-3 py-2.5 text-xs text-base-content/50"
                                >
                                    {{ $t("char-build.skill_weapon_mods_hint") }}
                                </p>
                            </div>
                        </CollapsibleSection>

                        <!-- 升华装备（头部 toggle 开启时才渲染；关闭即隐藏且不参与计算） -->
                        <CollapsibleSection
                            v-if="transcendEnabled"
                            data-transcend-section="gear"
                            number="05"
                            kicker="GEAR"
                            :title="$t('transcend-build.section_gear')"
                            :is-open="!collapsedSections.transcendGear"
                            lazy
                            @toggle="toggleSection('transcendGear')"
                        >
                            <div class="mt-2">
                                <TranscendGearSection
                                    :settings="transcendEditorSettings"
                                    :gain-context="transcendGainContext"
                                    @update-gear="onTranscendUpdateGear"
                                    @replace-gear="onTranscendReplaceGear"
                                    @select-gear-variant="onTranscendSelectGearVariant"
                                    @add-gear-variant="onTranscendAddGearVariant"
                                    @remove-gear-variant="onTranscendRemoveGearVariant"
                                />
                            </div>
                        </CollapsibleSection>

                        <!-- 升华天赋（仅主控生效） -->
                        <CollapsibleSection
                            v-if="transcendEnabled"
                            data-transcend-section="talent"
                            number="06"
                            kicker="TALENT"
                            :title="$t('transcend-build.section_talent')"
                            :is-open="!collapsedSections.transcendTalent"
                            lazy
                            @toggle="toggleSection('transcendTalent')"
                        >
                            <div class="mt-2">
                                <TranscendTalentEditor
                                    :settings="transcendEditorSettings"
                                    :include-unreleased-stages="includeUnreleasedStages"
                                    @update-talent-levels="onTranscendTalentLevels"
                                    @update-include-unreleased-stages="includeUnreleasedStages = $event"
                                    @toggle-all="onTranscendUnlockAll"
                                />
                            </div>
                        </CollapsibleSection>

                        <!-- MODBUFF列表 -->
                        <CollapsibleSection
                            v-if="charBuild.modsWithWeapons.some(v => v.buff)"
                            number="07"
                            kicker="EFFECTS"
                            :title="$t('char-build.special_effect_config')"
                            :badge="charBuild.modsWithWeapons.filter(v => v.buff).length"
                            :is-open="!collapsedSections.effects"
                            lazy
                            @toggle="toggleSection('effects')"
                        >
                            <template v-if="deferredSectionsMounted">
                            <div class="mt-2">
                                <EffectSettings
                                    :mods="charBuild.modsWithWeapons"
                                    :char-build="charBuild"
                                    :use-global="charSettings.useGlobal"
                                    :char-settings="charSettings"
                                    @update:use-global="charSettings.useGlobal = $event"
                                />
                            </div>
                            </template>
                        </CollapsibleSection>

                        <!-- BUFF列表 -->
                        <CollapsibleSection
                            number="08"
                            kicker="BUFFS"
                            :title="$t('char-build.buff_list')"
                            :badge="selectedBuffs.length"
                            :is-open="!collapsedSections.buffs"
                            lazy
                            @toggle="toggleSection('buffs')"
                        >
                            <template v-if="deferredSectionsMounted">
                            <!-- 与原构筑页共用同一份 buff 区（队伍 → 魔灵 → 潜质 → BUFF → 自定义 BUFF） -->
                            <BuffSectionBody
                                :char-settings="charSettings"
                                :char-build="charBuild"
                                :team1-options="groupedTeam1Options"
                                :team2-options="groupedTeam2Options"
                                :weapon-options="groupedTeamWeaponOptions"
                                :buff-options="buffOptions"
                                :selected-buffs="selectedBuffs"
                                :derived-buffs="derivedBuffs"
                                :trace-cards="traceCards"
                                :pet-cd="attributes.魔灵CD"
                                :pet-cd-reduce="attributes.魔灵CD缩减"
                                :pet-level="effectivePetLevel"
                                :pet-level-bonus="petLevelBonus"
                                @toggle-buff="toggleBuff"
                                @set-buff-lv="setBuffLv"
                                @set-buff-coverage="setBuffCoverage"
                                @toggle-trace="toggleTrace"
                                @set-trace-level="setTraceLevel"
                                @set-trace-coverage="setTraceCoverage"
                                @team-change="updateTeamBuff"
                                @pet-change="handlePetChange"
                                @select-trait="selectTrait"
                                @remove-trait="removeTrait"
                                @swap-traits="swapTraits"
                            />
                            </template>
                        </CollapsibleSection>

                        <!-- 动作序列 -->
                        <CollapsibleSection
                            number="09"
                            kicker="ACTIONS"
                            :title="$t('char-build.actions')"
                            :is-open="!collapsedSections.actions"
                            lazy
                            @toggle="toggleSection('actions')"
                        >
                            <template v-if="deferredSectionsMounted">
                            <CharActionEditor :char-name="selectedChar" :char-build="charBuild" />
                            </template>
                        </CollapsibleSection>

                        <!-- 装配预览 -->
                        <CollapsibleSection
                            number="10"
                            kicker="LOADOUT"
                            :title="$t('char-build.equipment_preview')"
                            :is-open="!collapsedSections.preview"
                            lazy
                            @toggle="toggleSection('preview')"
                        >
                            <template v-if="deferredSectionsMounted">
                            <EquipmentPreview
                                :char-build="charBuild"
                                :attributes="attributes"
                                :char-name="selectedChar"
                                :char-settings="charSettings"
                            />
                            </template>
                        </CollapsibleSection>

                        <!-- 评论 -->
                        <CollapsibleSection
                            number="11"
                            kicker="COMMENTS"
                            :title="$t('comment-section.comment')"
                            :badge="buildCommentCount"
                            :is-open="!collapsedSections.comments"
                            lazy
                            @toggle="toggleSection('comments')"
                        >
                            <template v-if="deferredSectionsMounted">
                            <div class="mt-2">
                                <CommentSection :target-id="buildCommentTargetId" @count="buildCommentCount = $event" />
                            </div>
                            </template>
                        </CollapsibleSection>
                    </div>
                </ScrollArea>
                <!-- 第三栏：吸附右侧的目标函数卡（1:2:1 的右侧 1 份） -->
                <ScrollArea
                    v-if="targetDock === 'right'"
                    data-agent-scope="target"
                    data-char-column="target"
                    class="flex-none min-w-0 border-base-content/10 lg:border-l"
                >
                    <div class="p-2">
                        <FloatingTargetCard
                            v-if="targetSides && targetSideBuilds && charTeamSnapshot"
                            :sides="targetSides"
                            :side-builds="targetSideBuilds"
                            :snapshot="charTeamSnapshot"
                            :dock="targetDock"
                            :initial-side="targetInitialSide"
                            :draft-invalid="targetDraftInvalid"
                            @update:dock="targetDock = $event"
                            @update-loadout="onTargetPatch"
                            @recall="recallTargetCard"
                        />
                    </div>
                </ScrollArea>
            </div>
        </div>

        <!-- 浮动态：窗口自身 Teleport 到 body，卡片位置 / 拖动由 FloatingWindow 负责 -->
        <FloatingTargetCard
            v-if="targetDock === 'floating' && targetSides && targetSideBuilds && charTeamSnapshot"
            :sides="targetSides"
            :side-builds="targetSideBuilds"
            :snapshot="charTeamSnapshot"
            :dock="targetDock"
            :initial-side="targetInitialSide"
            :draft-invalid="targetDraftInvalid"
            @update:dock="targetDock = $event"
            @update-loadout="onTargetPatch"
            @recall="recallTargetCard"
        />

        <!-- AI对话助手 -->
        <AIChatDialog v-if="setting.showAIChat" :char-build="charBuild" />

        <!-- 协战构筑导入（顶层 setting → 内嵌 setting） -->
        <CharAssistImportDialog
            v-if="assistImportSide && assistImportTarget"
            :open="!!assistImportSide"
            :side="assistImportSide"
            :char-id="assistImportTarget.charId"
            :weapon-id="assistImportTarget.weaponId"
            :linked-build-id="assistImportTarget.linkedBuildId"
            @update:open="assistImportSide = $event ? assistImportSide : null"
            @import="applyAssistImport"
        />
    </template>
</template>

<style>
.list-move,
.list-enter-active,
.list-leave-active {
    transition: all 0.5s ease;
}

.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateX(30px);
}

.list-leave-active {
    position: absolute;
}
</style>
