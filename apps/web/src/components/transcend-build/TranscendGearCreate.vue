<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import {
    type DnaSeasonAffix,
    getGearCraftState,
    getGearFinalMasterworkTargets,
    getGearItemSocketCount,
    getMasterworkMax,
    getSlotMaxInlayCount,
    normalizeGearItem,
    TRANSCEND_EQUIP_BASE_SCORE_MAX,
    TRANSCEND_EQUIP_BASE_SCORE_MIN,
    TRANSCEND_RARITY_IDS,
    TRANSCEND_UNIQUE_RARITY_ID,
    type TranscendGearAffixRoll,
    type TranscendGearAffixSource,
    type TranscendGearEnchantSnapshot,
    type TranscendGearItemConfig,
    type TranscendGearSocket,
} from "@/data"
import {
    canUseUniqueRarity,
    getBaseNameById,
    getBaseNameOptions,
    getGearDisplayName,
    getGearRarity,
    getGearRarityAffixCount,
    getNamePrefix,
    getShowRarityClass,
    getUniqueEquipById,
    getUniqueEquipOptions,
    isUniqueRarity,
} from "@/utils/transcend-gear/catalog"
import { clampCraftRestore } from "@/utils/transcend-gear/craft"
import {
    type GearAffixLine,
    getAffixFinalValueText,
    getAffixSource,
    getItemAffixLines,
    getItemSocketLines,
} from "@/utils/transcend-gear/display"
import {
    applyStrengthToAffixes,
    buildGearItem,
    canAffixBeAncient,
    createAffixRoll,
    getAffixRollRange,
    getBaseAffix,
    getGearRandomAffixPool,
    getGearSlot,
    getRandomAffixState,
    isGearDraftValid,
    type TranscendGearDraft,
} from "@/utils/transcend-gear/generation"
import type { GearAffixIncomeSource } from "@/utils/transcend-gear/income"
import { canToggleGearSocket, resolveInitialSocketCount, toggleGearSocketCount } from "@/utils/transcend-gear/sockets"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import { getAffixById, getAffixEffectText, getAffixSummaryParts } from "@/utils/transcendence-gear"
import TranscendGearAffixRow from "./TranscendGearAffixRow.vue"
import TranscendGearCraftPanel from "./TranscendGearCraftPanel.vue"
import TranscendGearItemCard from "./TranscendGearItemCard.vue"
import TranscendGearLineMark from "./TranscendGearLineMark.vue"

/**
 * 升华装备独立新建 / 编辑组件：品质（只定随机词缀条数）、锁定部位、主体（普通 3 选 1 / 暗金）、
 * 强度 1-50、基础 + Plan 2 随机词缀（池 / 排斥 / 重复 / 上限 / roll 范围 / 太古）、
 * 装备改造 5 tab（回收 / 镶嵌 / 精锻 / 附魔 / 淬炼）、最终属性预览。
 * 不提供「生成组」选择器：生成组是掉落 / 奖励分组键，不是玩家配方。
 */

const props = withDefaults(
    defineProps<{
        /** 物品固有槽型（外部传入并锁定） */
        slotType: number
        /** 展示用装备位（预览解析用） */
        slotId?: number
        /** 当前角色 id（过滤角色专属随机词缀 / 校验） */
        charId?: number
        /** 词条行角色门控用的角色 id（缺省同 `charId`；库存无确定构筑位时传 0 不划线） */
        gatingCharId?: number
        mode?: "create" | "edit"
        initial?: TranscendGearItemConfig | null
        /** 数据包缺失 / 安全模式时禁用提交 */
        disabled?: boolean
        /** 允许「当前 roll 的池外词缀」通过校验（OCR 导入按截图保留，仅放宽槽位池一条） */
        allowOutOfPoolAffixes?: boolean
        /** 随机源（测试可注入；缺省 Math.random） */
        rng?: () => number
        /** 逐词条收益上下文（具备完整构筑时传入；缺省不显示单条收益） */
        affixIncomeSource?: GearAffixIncomeSource | null
    }>(),
    {
        slotId: 0,
        charId: 0,
        gatingCharId: undefined,
        mode: "create",
        initial: null,
        disabled: false,
        allowOutOfPoolAffixes: false,
        rng: undefined,
        affixIncomeSource: null,
    }
)

const emit = defineEmits<{
    (event: "submit", item: TranscendGearItemConfig): void
}>()

const { t, i18next } = useTranslation()
const { gt } = useGameText()

const isEdit = computed(() => props.mode === "edit" && Boolean(props.initial))
const slot = computed(() => getGearSlot(props.slotType))
const baseAffix = computed(() => getBaseAffix(props.slotType))
const baseOptions = computed(() => getBaseNameOptions(props.slotType))
const prefix = computed(() => getNamePrefix(props.slotType))
const uniqueOptions = computed(() => getUniqueEquipOptions(props.slotType))

/** 编辑初值：库存 / 已装备物品先按库存口径归一化，未知词条与未知最终目标不得被静默丢弃 */
const seedItem = props.initial ? (normalizeGearItem(props.initial, undefined, { preserveUnknown: true }) ?? props.initial) : null
const seedCraft = getGearCraftState(seedItem, undefined, { preserveUnknown: true })

/** 初始普通词缀：排除基础词条与专属词条，保留淬炼 / 附魔来源与养成状态（旧物品按 craft 索引回退） */
function initialRandomAffixes(item: TranscendGearItemConfig | null | undefined): TranscendGearAffixRoll[] {
    if (!item) return []
    const baseAffixId = baseAffix.value?.id
    const uniqueAffixId = item.uniqueAffix?.affixId
    const craft = getGearCraftState(item, undefined, { preserveUnknown: true })
    return [...item.affixes.entries()]
        .filter(([, roll]) => roll.affixId !== baseAffixId && roll.affixId !== uniqueAffixId)
        .map(([index, roll]) => ({ ...roll, source: getAffixSource(roll, item.slotType, craft, index) }))
}

const rarityId = ref<number>(seedItem?.rarityId ?? (props.mode === "edit" ? 0 : 1))
const strength = ref<number>(seedItem?.equipBaseScore ?? (props.mode === "edit" ? 0 : TRANSCEND_EQUIP_BASE_SCORE_MAX))
const uniqueId = ref<number | null>(seedItem?.kind === "unique" ? (seedItem.uniqueId ?? null) : null)
const iconId = ref<number | null>(seedItem?.iconId ?? (props.mode === "create" ? (baseOptions.value[0]?.id ?? null) : null))
const randomAffixes = ref<TranscendGearAffixRoll[]>(initialRandomAffixes(seedItem))
const sockets = ref<TranscendGearSocket[]>(seedItem?.sockets?.map(socket => ({ ...socket })) ?? [])
const maxInlay = computed(() => getSlotMaxInlayCount(props.slotType))
const minSocketCount = computed(() => sockets.value.reduce((max, socket) => Math.max(max, socket.socketIndex + 1), 0))
const socketCount = ref<number>(
    resolveInitialSocketCount(
        seedItem ? getGearItemSocketCount(seedItem) : null,
        minSocketCount.value,
        maxInlay.value
    )
)
const seasonId = ref<number | undefined>(seedItem?.seasonId)

/** 装备级精锻 / 最终精锻 / 淬炼 / 附魔状态（写入 item 的唯一来源） */
const masterworkLevel = ref<number>(seedCraft.masterworkLevel)
const finalAffixId = ref<number | undefined>(
    seedCraft.finalMasterworkAffixIndex !== undefined ? seedItem?.affixes[seedCraft.finalMasterworkAffixIndex]?.affixId : undefined
)
const temperingCount = ref<number>(seedCraft.temperingCount)
const enchantCount = ref<number>(seedCraft.enchantCount)
const enchantSnapshot = ref<TranscendGearEnchantSnapshot | undefined>(seedCraft.enchantSnapshot)
/** 添加词缀 SearchSelect 的临时值（0 = 未选择） */
const newAffixId = ref(0)

/** 精锻等级 / 最终目标的撤销栈（只记录 craft 状态变化，不记录词缀 / 孔位编辑） */
interface CraftHistoryEntry {
    level: number
    finalAffixId?: number
}
const craftHistory = ref<CraftHistoryEntry[]>([])
const canUndoCraft = computed(() => craftHistory.value.length > 0)
const MAX_CRAFT_HISTORY = 30

/** 记录当前精锻等级 / 最终目标，供撤销 */
function pushCraftHistory(): void {
    craftHistory.value = [...craftHistory.value, { level: masterworkLevel.value, finalAffixId: finalAffixId.value }].slice(
        -MAX_CRAFT_HISTORY
    )
}

const isUnique = computed(() => isUniqueRarity(rarityId.value))
const maxRandom = computed(() => getGearRarityAffixCount(rarityId.value))
const masterworkMax = computed(() => getMasterworkMax())
/** 随机词缀行：淬炼词条在改造区单独展示、不占随机名额；附魔替换随机词条，计入随机名额与上限 */
const randomOnlyAffixes = computed(() => randomAffixes.value.filter(roll => roll.source !== "tempering"))
const selectedIds = computed(() => randomOnlyAffixes.value.map(roll => roll.affixId))
const uniqueEquip = computed(() => getUniqueEquipById(uniqueId.value ?? undefined))
const uniqueAffix = computed(() => (uniqueEquip.value ? getAffixById(uniqueEquip.value.affixId) : undefined))

/** 品质切换：暗金互斥、随机词缀按新上限截断（附魔计入名额、淬炼不计），并清掉新品质不可用的 craft 状态 */
watch(rarityId, value => {
    // 品质变化会剪掉旧品质不可用的 craft 状态，旧撤销点不再合法
    craftHistory.value = []
    if (!isUniqueRarity(value)) uniqueId.value = null
    const max = getGearRarityAffixCount(value)
    let kept = 0
    randomAffixes.value = randomAffixes.value.filter(roll => {
        if (roll.source === "tempering") return true
        if (kept >= max) return false
        kept += 1
        return true
    })
    if (value > 0) pruneCraftForRarity(value)
    // 截断可能删掉当前最终目标行：以最终草稿的预览 craft 状态为准重同步，不残留幽灵目标
    syncCraft(previewItem.value)
})

/**
 * 清掉该品质 `craftTypes` 不允许的 craft 状态（白 / 蓝品质只保留 5/6/7）。
 * @param value 品质 id
 */
function pruneCraftForRarity(value: number): void {
    const allowed = new Set(getGearRarity(value)?.craftTypes ?? [])
    if (!allowed.has(1)) {
        masterworkLevel.value = 0
        finalAffixId.value = undefined
    }
    if (!allowed.has(3)) {
        randomAffixes.value = randomAffixes.value.filter(roll => roll.source !== "tempering")
        temperingCount.value = 0
    }
    if (!allowed.has(4)) {
        randomAffixes.value = randomAffixes.value.filter(roll => roll.source !== "enchant")
        enchantCount.value = 0
        enchantSnapshot.value = undefined
    }
}

/** 强度变化：随机词缀 roll 钳制到新范围、基础词条档位同步 */
watch(strength, value => {
    if (value > 0) randomAffixes.value = applyStrengthToAffixes(randomAffixes.value, props.slotType, value)
})

/**
 * 设置已开孔数（已镶嵌所需数..上限）：宝石占用的孔位不可通过缩孔删掉。
 * @param value 目标已开孔数
 */
function applySocketCount(value: number): void {
    socketCount.value = Math.max(minSocketCount.value, Math.min(maxInlay.value, Math.round(Number(value) || 0)))
}

/**
 * 点击初始孔位卡片切换开孔数：未解锁孔位解锁到该槽，已解锁的空孔位收起；
 * 已镶嵌孔位只读（no-op）；含宝石的孔位仍由 `minSocketCount` 兜底，不会被缩掉。
 * @param index 孔位下标
 */
function toggleSocket(index: number): void {
    if (!canToggleGearSocket(createSocketPhase(index))) return
    applySocketCount(toggleGearSocketCount(socketCount.value, index, minSocketCount.value, maxInlay.value))
}

/** 可选择的随机词缀池（Plan 2 + 槽位淬炼池 + slotTypes 命中该槽型的 Plan 3；宝石 / 专属除外） */
/** 词条行门控角色：缺省跟随 `charId`，库存编辑显式传 0（无确定构筑位，不划线） */
const rowCharId = computed(() => props.gatingCharId ?? props.charId)

const poolAffixes = computed(() =>
    getGearRandomAffixPool(props.slotType).filter(
        affix => props.charId <= 0 || !affix.charIds?.length || affix.charIds.includes(props.charId)
    )
)

/** 表单草稿（基础词条由组件自动补入；craft 状态按 affixId 锚定，编辑保存不丢） */
const draft = computed<TranscendGearDraft>(() => ({
    rarityId: rarityId.value,
    equipBaseScore: strength.value,
    iconId: iconId.value ?? undefined,
    uniqueId: uniqueId.value ?? undefined,
    randomAffixes: randomAffixes.value,
    masterworkLevel: masterworkLevel.value,
    finalMasterworkAffixId: finalAffixId.value,
    temperingCount: temperingCount.value,
    enchantCount: enchantCount.value,
    enchantSnapshot: enchantSnapshot.value,
    sockets: sockets.value.length ? sockets.value : undefined,
    socketCount: socketCount.value,
    seasonId: seasonId.value,
}))

/** 预览物品：按当前草稿真实组装（含快照与 craft 状态），编辑路径按库存口径保留未知最终目标 */
const previewItem = computed<TranscendGearItemConfig>(() =>
    buildGearItem(props.slotType, draft.value, { preserveUnknown: isEdit.value })
)

/** 槽位随机池 id（与校验层同源；判定初值是否自带池外词缀） */
const randomPoolIds = computed(() => new Set(getGearRandomAffixPool(props.slotType).map(affix => affix.id)))

/**
 * 初值是否自带池外 Plan 2 词缀：已入库的 OCR 导入物品（如背水 1018）再编辑时放行保存。
 * 只统计 `initial` 带入的词缀；用户后续新增仍只能从池内选，未知词缀不算池外。
 */
const initialHasOutOfPoolAffix = computed(() =>
    initialRandomAffixes(seedItem).some(roll => {
        const affix = getAffixById(roll.affixId)
        return affix?.plan === 2 && !randomPoolIds.value.has(affix.id)
    })
)

const canSubmit = computed(
    () =>
        !props.disabled &&
        isGearDraftValid(props.slotType, draft.value, props.charId, {
            allowOutOfPool: props.allowOutOfPoolAffixes || initialHasOutOfPoolAffix.value,
        })
)

/** 预览物品的装备级 craft 状态（权威读取，preserveUnknown 与库存写入口径一致） */
const craftState = computed(() => getGearCraftState(previewItem.value, undefined, { preserveUnknown: true }))

/** 附魔快照原词缀 id：随机池 / 淬炼池保留该词缀会让重置附魔失效 */
const snapshotAffixId = computed(() => craftState.value.enchantSnapshot?.roll.affixId)

/** 可承载最终精锻的现存词缀 id（与 craft 2 的目标口径一致） */
const finalTargetAffixIds = computed(() => {
    const ids = new Set<number>()
    for (const index of getGearFinalMasterworkTargets(previewItem.value, undefined, { preserveUnknown: isEdit.value })) {
        const affixId = previewItem.value.affixes[index]?.affixId
        if (affixId !== undefined) ids.add(affixId)
    }
    return ids
})

/**
 * 把 apply 结果中的装备级 craft 状态同步回表单（不改词条列表）。
 * @param item apply 返回的物品
 */
function syncCraft(item: TranscendGearItemConfig): void {
    const state = getGearCraftState(item, undefined, { preserveUnknown: true })
    masterworkLevel.value = state.masterworkLevel
    temperingCount.value = state.temperingCount
    enchantCount.value = state.enchantCount
    enchantSnapshot.value = state.enchantSnapshot
    finalAffixId.value = state.finalMasterworkAffixIndex !== undefined ? item.affixes[state.finalMasterworkAffixIndex]?.affixId : undefined
    markFinalMasterworkFlag(finalAffixId.value)
}

/** 只保留指定词缀的最终精锻标记（undefined = 全部清除），避免 legacy 标记把已清除目标重新选回 */
function markFinalMasterworkFlag(affixId: number | undefined): void {
    randomAffixes.value = randomAffixes.value.map(roll => ({ ...roll, finalMasterwork: affixId !== undefined && roll.affixId === affixId }))
}

/**
 * 把做装 tab 产出的物品同步回表单：词条（含来源）/ 孔位 / craft 状态 / 附魔快照。
 * 精锻等级或最终目标变化时记录撤销点；最终目标与太古可叠加。
 * @param item tab 产出的物品
 */
function syncFromItem(item: TranscendGearItemConfig): void {
    const nextState = getGearCraftState(item, undefined, { preserveUnknown: true })
    const nextFinalAffixId =
        nextState.finalMasterworkAffixIndex !== undefined ? item.affixes[nextState.finalMasterworkAffixIndex]?.affixId : undefined
    if (nextState.masterworkLevel !== masterworkLevel.value || nextFinalAffixId !== finalAffixId.value) pushCraftHistory()
    const uniqueAffixId = item.uniqueAffix?.affixId
    randomAffixes.value = item.affixes
        .filter(roll => roll.affixId !== baseAffix.value?.id && roll.affixId !== uniqueAffixId)
        .map(roll => ({
            ...roll,
            finalMasterwork: nextFinalAffixId !== undefined && roll.affixId === nextFinalAffixId,
        }))
    sockets.value = item.sockets?.map(socket => ({ ...socket })) ?? []
    socketCount.value = Math.min(maxInlay.value, Math.max(minSocketCount.value, getGearItemSocketCount(item)))
    syncCraft(item)
}

/** 撤销上一份精锻等级 / 最终目标；恢复前按当前物品复检，非法状态被剪掉 */
function undoCraft(): void {
    const entry = craftHistory.value.at(-1)
    if (!entry) return
    craftHistory.value = craftHistory.value.slice(0, -1)
    masterworkLevel.value = entry.level
    finalAffixId.value = entry.finalAffixId
    const restored = clampCraftRestore(previewItem.value, entry, { preserveUnknown: isEdit.value })
    masterworkLevel.value = restored.level
    finalAffixId.value = restored.finalAffixId
    markFinalMasterworkFlag(finalAffixId.value)
    syncCraft(previewItem.value)
}

/** 预览词缀行：编辑器行与右侧预览同源，数值 / 区间 / 标记不分叉 */
const previewLines = computed(() => getItemAffixLines(previewItem.value, props.slotId))

/** 预览物品的孔位行（初始孔位卡片展示宝石名 / 图标） */
const createSocketLines = computed(() => getItemSocketLines(previewItem.value))

/**
 * 某初始孔位已镶嵌的宝石行。
 * @param index 孔位下标
 * @returns 宝石行；空孔或未开孔时 undefined
 */
function createSocketLine(index: number) {
    return createSocketLines.value.find(line => line.socketIndex === index)
}

/**
 * 初始孔位卡片三态：未开孔 / 空孔位 / 已镶嵌。
 * @param index 孔位下标
 * @returns 状态
 */
function createSocketPhase(index: number): "locked" | "opened" | "inlaid" {
    if (index >= socketCount.value) return "locked"
    return createSocketLine(index) ? "inlaid" : "opened"
}

/**
 * 初始孔位卡片名称。
 * @param index 孔位下标
 * @returns 宝石名 / 空孔位 / 未开孔
 */
function createSocketName(index: number): string {
    const line = createSocketLine(index)
    if (line) return line.unknownGem ? t("transcend-build.gear_unknown_gem") : gt(line.name)
    return index < socketCount.value ? t("transcend-build.gear_socket_empty") : t("transcend-build.gear_socket_locked")
}

/**
 * 编辑器行的展示数据：优先复用预览行；数据缺失时回退占位行（标记仍按来源给出）。
 * @param roll 草稿词条
 * @param source 词条来源
 * @returns 词缀行
 */
function editorLine(roll: TranscendGearAffixRoll, source: TranscendGearAffixSource): GearAffixLine {
    const affix = getAffixById(roll.affixId)
    const preview =
        previewLines.value.find(line => line.roll.affixId === roll.affixId && line.source === source) ??
        previewLines.value.find(line => line.roll.affixId === roll.affixId)
    if (preview) return preview
    return {
        roll,
        affix,
        source,
        summaryParts: affix ? getAffixSummaryParts(affix) : [],
        valueText: affix ? getAffixFinalValueText(affix, roll, props.slotId) : t("transcend-build.gear_readonly"),
        rollText: "",
        rangeText: "",
        ancient: roll.ancient,
        finalMasterwork: false,
    }
}

/** 基础词缀行（编辑器基础卡） */
const baseAffixLine = computed<GearAffixLine | null>(() => {
    const affix = baseAffix.value
    if (!affix) return null
    const roll: TranscendGearAffixRoll = {
        affixId: affix.id,
        rollLevel: Math.max(1, strength.value),
        masterworkLevel: masterworkLevel.value,
        ancient: false,
        finalMasterwork: false,
        source: "base",
    }
    return editorLine(roll, "base")
})

/** 专属词缀行（编辑器专属卡） */
const uniqueEditorLine = computed<GearAffixLine | null>(() => {
    const affix = uniqueAffix.value
    if (!affix) return null
    const roll: TranscendGearAffixRoll = previewItem.value.uniqueAffix ?? {
        affixId: affix.id,
        rollLevel: 1,
        masterworkLevel: 0,
        ancient: false,
        finalMasterwork: false,
        source: "unique",
    }
    return editorLine(roll, "unique")
})

/** 词缀摘要：专属 desc-only 只显示「效果:<描述>」，其余摘要分段 / 描述回退（剥样式标签）。
 * @param affix 词缀
 * @returns 展示文本
 */
function affixTitle(affix: DnaSeasonAffix | undefined): string {
    if (!affix) return t("transcend-build.gear_unknown")
    const effect = getAffixEffectText(affix, gt)
    if (effect) return `${t("common.effect_label")}${effect}`
    const parts = getAffixSummaryParts(affix).map(part => gt(part)).filter(Boolean)
    return parts.length ? parts.join(" · ") : cleanGameMarkup(gt(affix.desc))
}

/**
 * 随机词缀的 roll 范围（强度对应 Plan 2 档位）。
 * @param roll 词缀 roll
 * @returns 范围
 */
function rollRange(roll: TranscendGearAffixRoll) {
    const affix = getAffixById(roll.affixId)
    return affix ? getAffixRollRange(affix, Math.max(1, strength.value)) : { min: 1, max: 1 }
}

/** 池外词缀标记（下拉选项后缀；短文案，完整说明仍由 OCR 警告列表展示） */
const outOfPoolTag = computed(() => t("transcend-build.gear_affix_out_of_pool_tag"))

/**
 * 某行词缀可选的 SearchSelect 选项：保留当前词缀，其余只列可用（未选 / 未满 / 不互斥 / 非快照）。
 * 当前 roll 不在池内时（OCR 导入的池外词缀）也补进选项并标注，避免下拉框显示空白。
 * @param roll 当前行
 * @returns SearchSelect 选项
 */
function affixOptionsFor(roll: TranscendGearAffixRoll) {
    const others = randomOnlyAffixes.value.filter(item => item.affixId !== roll.affixId).map(item => item.affixId)
    const options = poolAffixes.value
        .filter(
            affix =>
                affix.id === roll.affixId ||
                (affix.id !== snapshotAffixId.value && getRandomAffixState(affix, others, maxRandom.value) === "available")
        )
        .map(affix => ({ value: affix.id, label: affixTitle(affix) }))
    if (!options.some(option => option.value === roll.affixId)) {
        const affix = getAffixById(roll.affixId)
        if (affix) options.unshift({ value: affix.id, label: `${affixTitle(affix)} · ${outOfPoolTag.value}` })
    }
    return options
}

/** 新增词缀 SearchSelect 选项（当前条数未满、未选、不互斥、非快照） */
const addAffixOptions = computed(() =>
    poolAffixes.value
        .filter(affix => affix.id !== snapshotAffixId.value && getRandomAffixState(affix, selectedIds.value, maxRandom.value) === "available")
        .map(affix => ({ value: affix.id, label: affixTitle(affix) }))
)

/**
 * 替换某行随机词缀（SearchSelect 0 = 移除）。
 * 按行对象定位：同 affixId 的淬炼行不能被这里覆盖。
 * @param target 目标随机行
 * @param value 新词缀 id
 */
function replaceRandomAffix(target: TranscendGearAffixRoll, value: string | number): void {
    const affixId = Math.round(Number(value))
    if (!affixId) {
        removeRandomAffix(target)
        return
    }
    if (affixId === target.affixId) return
    if (target.source === "tempering" || target.source === "enchant") return
    if (!affixOptionsFor(target).some(option => option.value === affixId)) return
    const affix = getAffixById(affixId)
    if (!affix) return
    randomAffixes.value = randomAffixes.value.map(roll =>
        roll === target ? createAffixRoll(affix, "random", Math.max(1, strength.value)) : roll
    )
    syncCraft(previewItem.value)
}

/**
 * 从 SearchSelect 添加一条随机词缀。
 * @param value 词缀 id
 */
function addAffix(value: string | number): void {
    const affixId = Math.round(Number(value))
    if (!affixId) return
    if (!addAffixOptions.value.some(option => option.value === affixId)) return
    const affix = getAffixById(affixId)
    if (!affix) return
    randomAffixes.value = [...randomAffixes.value, createAffixRoll(affix, "random", Math.max(1, strength.value))]
    newAffixId.value = 0
}

/**
 * 某词缀是否可设为最终精锻目标（数据层 `MaxAffixUpdateFunc` 口径）。
 * @param affixId 词缀 id
 * @returns 可设为 true
 */
function canSetFinalMasterwork(affixId: number): boolean {
    return finalTargetAffixIds.value.has(affixId)
}

/**
 * 设置 / 清除最终精锻目标（单件只能一个）；太古可同时保留，二者不互斥。
 * @param affixId 词缀 id
 * @param checked 是否选中
 */
function setFinalMasterwork(affixId: number, checked: boolean): void {
    if (checked) {
        if (masterworkLevel.value < masterworkMax.value) return
        if (!finalTargetAffixIds.value.has(affixId)) return
        if (finalAffixId.value === affixId) return
        pushCraftHistory()
        finalAffixId.value = affixId
        markFinalMasterworkFlag(affixId)
    } else {
        if (finalAffixId.value !== affixId) return
        pushCraftHistory()
        finalAffixId.value = undefined
        markFinalMasterworkFlag(undefined)
    }
    syncCraft(previewItem.value)
}

/**
 * 移除一条随机词缀（淬炼 / 附魔词条只能在改造区替换，不能从这里移除）。
 * 按行对象定位：同 affixId 的淬炼行不会被一并删掉。
 * 删除的若是当前最终目标，按预览 craft 状态重同步，避免残留幽灵目标 / 重新加回时静默恢复。
 * @param target 目标随机行
 */
function removeRandomAffix(target: TranscendGearAffixRoll): void {
    if (target.source === "tempering" || target.source === "enchant") return
    randomAffixes.value = randomAffixes.value.filter(roll => roll !== target)
    syncCraft(previewItem.value)
}

/**
 * 更新随机词缀 roll / 太古；太古与最终精锻可叠加，互不清除。
 * 按行对象定位：同 affixId 的淬炼行保持原值。
 * @param target 目标随机行
 * @param patch 变更字段
 */
function updateRandomAffix(target: TranscendGearAffixRoll, patch: Partial<Pick<TranscendGearAffixRoll, "rollLevel" | "ancient">>): void {
    if (patch.ancient === true && !canAffixBeAncient(getAffixById(target.affixId))) return
    randomAffixes.value = randomAffixes.value.map(roll => (roll === target ? { ...roll, ...patch } : roll))
    syncCraft(previewItem.value)
}

/**
 * 选择品质。
 * @param id 品质 id
 */
function chooseRarity(id: number): void {
    if (isUniqueRarity(id) && !canUseUniqueRarity(props.slotType)) return
    rarityId.value = id
}

/**
 * 提交草稿（新建「添加并装备」/ 编辑「保存」由上层决定后续动作）。
 */
function submit(): void {
    if (!canSubmit.value) return
    emit("submit", previewItem.value)
}

/**
 * 普通装备的名称预览（本地化拼接）；按基底 id 各自计算，供每张基底卡片独立展示。
 * @param baseId 基底 id；缺省时无预览
 * @returns 本地化展示名
 */
function namePreviewForBase(baseId: number | null | undefined): string {
    const base = getBaseNameById(baseId ?? undefined)
    if (!base) return ""
    return getGearDisplayName(
        { kind: "normal", slotType: props.slotType, affixes: [], iconId: base.id, nameId: prefix.value?.id },
        gt,
        i18next.language
    )
}

/** 当前选中基底的名称预览（底部「名称预览」行跟随选中项） */
const normalNamePreview = computed(() => namePreviewForBase(iconId.value))

/** 是否有词缀启用太古（展示「非游戏真实概率」提示） */
const hasAncient = computed(() => randomOnlyAffixes.value.some(roll => roll.ancient && canAffixBeAncient(getAffixById(roll.affixId))))
/** 已选随机词缀中是否存在可太古项（提供勾选框前就展示概率说明） */
const hasAncientCapable = computed(() => randomOnlyAffixes.value.some(roll => canAffixBeAncient(getAffixById(roll.affixId))))
</script>

<template>
    <div class="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]" data-transcend-gear-create :data-char-id="charId">
        <ScrollArea class="h-[calc(92vh-11rem)] pr-1">
            <div class="space-y-4">
                <section class="space-y-2" data-create-section="rarity">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.gear_rarity") }}</span>
                        <span class="text-[10px] text-base-content/40">{{ $t("transcend-build.gear_rarity_note") }}</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="id in TRANSCEND_RARITY_IDS"
                            :key="id"
                            type="button"
                            class="flex items-center gap-2 rounded-xs border px-2.5 py-1.5 text-left transition-colors duration-150"
                            :class="
                                rarityId === id
                                    ? 'border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-35'
                            "
                            :disabled="id === TRANSCEND_UNIQUE_RARITY_ID && !canUseUniqueRarity(slotType)"
                            :data-rarity-id="id"
                            @click="chooseRarity(id)"
                        >
                            <span :class="getShowRarityClass(getGearRarity(id)?.showRarityId ?? 1)" />
                            <span class="text-[11px] text-base-content/75">{{ gt(getGearRarity(id)?.name) }}</span>
                            <span class="font-mono text-[10px] text-base-content/40">{{ $t("transcend-build.gear_affix_count_short", { count: getGearRarityAffixCount(id) }) }}</span>
                        </button>
                    </div>
                    <p v-if="rarityId === TRANSCEND_UNIQUE_RARITY_ID && !canUseUniqueRarity(slotType)" class="text-[10px] text-warning/80">
                        {{ $t("transcend-build.gear_no_unique_for_slot") }}
                    </p>
                </section>

                <section class="flex flex-wrap items-center gap-2" data-create-section="slot">
                    <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.gear_slot_label") }}</span>
                    <span class="border border-base-content/20 px-1.5 py-0.5 text-[11px] text-base-content/70">{{ gt(slot?.name) }}</span>
                    <span class="text-[10px] text-base-content/40">{{ $t("transcend-build.gear_slot_locked") }}</span>
                    <span class="ml-auto text-[10px] text-base-content/40">{{ $t("transcend-build.gear_strength") }} · 1–{{ TRANSCEND_EQUIP_BASE_SCORE_MAX }}</span>
                </section>

                <section class="space-y-2" data-create-section="subject">
                    <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.gear_subject") }}</span>
                    <template v-if="isUnique">
                        <div v-if="uniqueOptions.length" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <button
                                v-for="equip in uniqueOptions"
                                :key="equip.id"
                                type="button"
                                class="flex items-start gap-2 rounded-xs border p-2 text-left transition-colors duration-150"
                                :class="
                                    uniqueId === equip.id
                                        ? 'border-warning/70 bg-warning/10'
                                        : 'border-base-content/15 hover:border-warning/50 hover:bg-warning/5'
                                "
                                :data-unique-id="equip.id"
                                @click="uniqueId = equip.id"
                            >
                                <ImageFallback :src="`/imgs/res/${equip.icon}.webp`" :alt="gt(equip.name)" class="size-9 shrink-0 overflow-hidden rounded-xs">
                                    <Icon icon="ri:sword-line" class="size-6 text-base-content/35" />
                                </ImageFallback>
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-[12px] font-medium text-base-content/85">{{ gt(equip.name) }}</span>
                                    <span class="mt-0.5 block text-[10px] text-base-content/40">{{ $t("transcend-build.gear_kind_unique") }}</span>
                                </span>
                                <Icon v-if="uniqueId === equip.id" icon="ri:checkbox-circle-fill" class="size-4 shrink-0 text-warning" />
                            </button>
                        </div>
                        <p v-else class="text-[11px] text-base-content/40">{{ $t("transcend-build.gear_no_unique_for_slot") }}</p>
                        <div v-if="uniqueAffix" class="space-y-1 rounded-xs border border-warning/30 bg-warning/5 p-2.5" data-create-unique-affix>
                            <div class="flex flex-wrap items-center">
                                <TranscendGearAffixRow v-if="uniqueEditorLine" :line="uniqueEditorLine" :slot-id="slotId" :char-id="rowCharId" :show-roll="false" class="min-w-0 flex-1" />
                                <span v-if="uniqueAffix.passiveEffectId" class="ml-auto"><CopyID :id="uniqueAffix.passiveEffectId" compact /></span>
                            </div>
                        </div>
                        <p v-else-if="!uniqueId" class="text-[10px] text-warning/80">{{ $t("transcend-build.gear_unique_required") }}</p>
                    </template>
                    <template v-else>
                        <div class="grid gap-2 sm:grid-cols-3">
                            <button
                                v-for="base in baseOptions"
                                :key="base.id"
                                type="button"
                                class="flex items-start gap-2 rounded-xs border p-2 text-left transition-colors duration-150"
                                :class="
                                    iconId === base.id
                                        ? 'border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 hover:border-primary/50 hover:bg-primary/5'
                                "
                                :data-base-name-id="base.id"
                                @click="iconId = base.id"
                            >
                                <ImageFallback :src="base.icon ? `/imgs/res/${base.icon}.webp` : ''" :alt="gt(base.name)" class="size-9 shrink-0 overflow-hidden rounded-xs">
                                    <TranscendGearSlotIcon :slot-type="slotType" class="size-6 text-base-content/35" />
                                </ImageFallback>
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-[12px] font-medium text-base-content/85">{{ gt(base.name) }}</span>
                                    <span class="mt-0.5 block truncate text-[10px] text-base-content/40" :data-base-preview-id="base.id">{{ namePreviewForBase(base.id) }}</span>
                                </span>
                                <Icon v-if="iconId === base.id" icon="ri:checkbox-circle-fill" class="size-4 shrink-0 text-primary" />
                            </button>
                        </div>
                        <p v-if="!baseOptions.length" class="text-[11px] text-base-content/40">{{ $t("transcend-build.gear_no_base_names") }}</p>
                    </template>
                    <div class="flex items-center gap-2 text-[11px] text-base-content/55">
                        <span class="text-base-content/40">{{ $t("transcend-build.gear_name_preview") }}</span>
                        <span class="font-medium text-base-content/80" data-name-preview="true">{{ isUnique ? gt(uniqueEquip?.name) : normalNamePreview }}</span>
                    </div>
                </section>

                <section class="space-y-2" data-create-section="strength">
                    <div class="flex items-center gap-2">
                        <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.gear_strength") }}</span>
                        <b class="font-orbitron text-[15px] font-semibold text-primary">{{ strength || "—" }}</b>
                    </div>
                    <input
                        :value="strength"
                        type="range"
                        :min="TRANSCEND_EQUIP_BASE_SCORE_MIN"
                        :max="TRANSCEND_EQUIP_BASE_SCORE_MAX"
                        step="1"
                        class="range range-primary range-sm w-full"
                        data-create-strength
                        @input="strength = Number(($event.target as HTMLInputElement).value)"
                    />
                </section>

                <section v-if="maxInlay > 0" class="space-y-2" data-create-section="sockets">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.craft_initial_sockets") }}</span>
                        <b class="font-orbitron text-[15px] font-semibold text-primary" :data-create-socket-count="socketCount">{{ socketCount }} / {{ maxInlay }}</b>
                        <span class="text-[10px] text-base-content/45">
                            {{ $t("transcend-build.gear_socket_used") }} {{ sockets.length }}
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-1.5" data-create-socket-cards>
                        <button
                            v-for="index in maxInlay"
                            :key="index"
                            type="button"
                            class="flex min-w-32 flex-1 items-center gap-2 rounded-xs border p-2 text-left transition-colors duration-150"
                            :class="
                                createSocketPhase(index - 1) === 'locked'
                                    ? 'border-dashed border-base-content/15 opacity-60 hover:border-primary/40'
                                    : index <= socketCount
                                      ? 'border-primary/70 bg-primary/10'
                                      : 'border-base-content/15 hover:border-primary/50'
                            "
                            :data-create-socket-index="index - 1"
                            :data-create-socket-state="createSocketPhase(index - 1)"
                            @click="toggleSocket(index - 1)"
                        >
                            <ImageFallback
                                :src="createSocketLine(index - 1)?.iconSrc ?? ''"
                                :alt="createSocketName(index - 1)"
                                class="size-8 shrink-0 overflow-hidden rounded-xs border border-base-content/15"
                            >
                                <span class="flex size-8 items-center justify-center text-base-content/30">
                                    <Icon
                                        :icon="
                                            createSocketPhase(index - 1) === 'locked'
                                                ? 'ri:lock-line'
                                                : createSocketPhase(index - 1) === 'inlaid'
                                                  ? 'ri:sparkling-line'
                                                  : 'ri:add-line'
                                        "
                                    />
                                </span>
                            </ImageFallback>
                            <span class="min-w-0 flex-1">
                                <span class="block font-orbitron text-[9px] text-base-content/40">{{ index - 1 }}</span>
                                <span class="block truncate text-[11px] text-base-content/75">{{ createSocketName(index - 1) }}</span>
                            </span>
                        </button>
                    </div>
                    <p class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_initial_sockets_pick") }}</p>
                    <p class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_initial_sockets_note") }}</p>
                </section>

                <section class="space-y-2" data-create-section="affixes">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.gear_affixes") }}</span>
                        <span class="text-[10px] text-base-content/45">{{ $t("transcend-build.gear_random_affix_count", { current: randomOnlyAffixes.length, max: maxRandom }) }}</span>
                    </div>

                    <div v-if="baseAffixLine" class="rounded-xs border border-base-content/12 bg-base-100/50 p-2" data-create-base-affix>
                        <TranscendGearAffixRow :line="baseAffixLine" :char-id="rowCharId" :show-roll="false" />
                    </div>
                    <p v-else class="text-[11px] text-warning/80">{{ $t("transcend-build.gear_base_affix_missing") }}</p>

                    <div
                        v-for="roll in randomOnlyAffixes"
                        :key="roll.affixId"
                        class="space-y-1.5 rounded-xs border border-base-content/12 bg-base-100/50 p-2"
                        data-create-random-affix
                        :data-random-affix-id="roll.affixId"
                    >
                        <div class="flex items-center gap-1.5">
                            <span
                                v-if="roll.source !== 'enchant'"
                                class="flex size-5 shrink-0 items-center justify-center text-[11px]"
                                data-random-affix-marks
                            >
                                <TranscendGearLineMark :line="editorLine(roll, roll.source ?? 'random')" />
                            </span>
                            <SearchSelect
                                v-if="roll.source !== 'enchant'"
                                class="min-w-0 flex-1"
                                :model-value="roll.affixId"
                                :options="affixOptionsFor(roll)"
                                :label="$t('transcend-build.gear_affix_pick')"
                                :clear-value="0"
                                :clear-title="$t('transcend-build.gear_remove')"
                                data-random-affix-select
                                @update:model-value="value => replaceRandomAffix(roll, value)"
                            />
                            <TranscendGearAffixRow v-else :line="editorLine(roll, roll.source ?? 'random')" :char-id="rowCharId" :show-roll="false" class="min-w-0 flex-1" />
                        </div>
                        <template v-if="roll.source !== 'enchant' && getAffixById(roll.affixId)">
                            <label class="flex items-center gap-2 text-[10px] text-base-content/45">
                                <span class="shrink-0">{{ $t("transcend-build.gear_roll") }} {{ rollRange(roll).min }}–{{ rollRange(roll).max }}</span>
                                <input
                                    :value="roll.rollLevel"
                                    type="range"
                                    :min="rollRange(roll).min"
                                    :max="rollRange(roll).max"
                                    step="1"
                                    class="range range-primary range-xs min-w-0 flex-1"
                                    :disabled="roll.ancient"
                                    @input="updateRandomAffix(roll, { rollLevel: Number(($event.target as HTMLInputElement).value) })"
                                />
                                <b class="w-8 shrink-0 text-right font-orbitron text-[11px] text-primary">{{ roll.rollLevel }}</b>
                            </label>
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                                <label v-if="canAffixBeAncient(getAffixById(roll.affixId))" class="inline-flex items-center gap-1 text-[11px] text-base-content/65">
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-primary checkbox-xs"
                                        :checked="roll.ancient"
                                        :data-ancient-affix-id="roll.affixId"
                                        @change="updateRandomAffix(roll, { ancient: ($event.target as HTMLInputElement).checked })"
                                    />
                                    {{ $t("transcend-build.gear_ancient") }}
                                </label>
                                <label
                                    v-if="canSetFinalMasterwork(roll.affixId)"
                                    class="inline-flex items-center gap-1 text-[11px] text-base-content/65"
                                    :title="masterworkLevel < masterworkMax ? $t('transcend-build.craft_gate_masterwork_required') : undefined"
                                >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-primary checkbox-xs"
                                        :checked="finalAffixId === roll.affixId"
                                        :disabled="masterworkLevel < masterworkMax"
                                        :data-final-masterwork-affix-id="roll.affixId"
                                        @change="setFinalMasterwork(roll.affixId, ($event.target as HTMLInputElement).checked)"
                                    />
                                    {{ $t("transcend-build.craft_final_masterwork") }}
                                </label>
                                <span v-if="roll.ancient" class="text-warning/80">{{ $t("transcend-build.gear_ancient_roll_ignored") }}</span>
                            </div>
                        </template>
                    </div>

                    <p
                        v-if="hasAncientCapable"
                        class="rounded-xs border border-warning/30 bg-warning/5 px-2 py-1 text-[10px] leading-relaxed text-warning/80"
                        :class="{ 'opacity-60': !hasAncient }"
                    >
                        {{ $t("transcend-build.gear_ancient_warning") }}
                    </p>

                    <div v-if="maxRandom > 0" class="space-y-1.5 border-t border-base-content/10 pt-2" data-create-affix-add>
                        <span class="block text-[11px] font-medium text-base-content/60">{{ $t("transcend-build.gear_affix_add") }}</span>
                        <SearchSelect
                            v-if="randomOnlyAffixes.length < maxRandom"
                            :model-value="newAffixId"
                            :options="addAffixOptions"
                            :label="$t('transcend-build.gear_affix_add')"
                            :clear-value="0"
                            data-affix-add-select
                            @update:model-value="addAffix"
                        />
                        <p v-else class="text-[10px] text-base-content/40">{{ $t("transcend-build.gear_affix_full") }}</p>
                        <p v-if="!addAffixOptions.length && randomOnlyAffixes.length < maxRandom" class="text-[10px] text-base-content/35">
                            {{ $t("transcend-build.gear_no_affix_candidates") }}
                        </p>
                    </div>
                    <p v-else class="text-[10px] text-base-content/40">{{ $t("transcend-build.gear_rarity_no_random") }}</p>
                </section>

                <TranscendGearCraftPanel
                    :item="previewItem"
                    :slot-id="slotId"
                    :char-id="charId"
                    :preserve-unknown="isEdit"
                    :rng="rng"
                    :can-undo="canUndoCraft"
                    @apply="syncFromItem"
                    @undo="undoCraft"
                />
            </div>
        </ScrollArea>

        <aside class="flex h-[calc(92vh-11rem)] min-h-0 flex-col gap-2 border-t border-base-content/10 pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-3" data-create-preview>
            <div class="flex flex-wrap items-center gap-2">
                <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.gear_final_preview") }}</span>
            </div>
            <ScrollArea class="min-h-0 flex-1">
                <div class="space-y-2 pr-1">
                    <TranscendGearItemCard :item="previewItem" :slot-id="slotId" :char-id="rowCharId" bare preview :affix-income-source="affixIncomeSource" />
                    <p v-if="strength <= 0" class="text-[10px] text-warning/80">{{ $t("transcend-build.gear_strength_required") }}</p>
                    <p v-if="rarityId <= 0" class="text-[10px] text-warning/80">{{ $t("transcend-build.gear_rarity_required") }}</p>
                    <p v-if="disabled" class="text-[10px] text-warning/80">{{ $t("transcend-build.gear_data_missing") }}</p>
                    <p class="text-[10px] leading-relaxed text-base-content/35">{{ $t("transcend-build.gear_generate_group_note") }}</p>
                </div>
            </ScrollArea>
            <button type="button" class="btn btn-primary w-full" :disabled="!canSubmit" data-create-submit @click="submit">
                {{ isEdit ? $t("transcend-build.gear_save_changes") : $t("transcend-build.gear_add_equip") }}
            </button>
        </aside>
    </div>
</template>
