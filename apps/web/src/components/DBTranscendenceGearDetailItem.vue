<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import {
    applyTranscendSkillReplacement,
    LeveledChar,
    LeveledSkill,
    mergeTranscendSkillReplacement,
    resolveAffixValue,
    type Skill,
    TRANSCEND_SKILL_REPLACEMENTS,
} from "@/data"
import { charMap, resourceMap, weaponMap } from "@/data/d"
import type { DnaSeasonAffix, DnaSeasonUniqueEquip } from "@/data/d/dnaseasonequip.data"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { getAffixSkillLevelInfo } from "@/utils/transcend-gear/display"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import {
    ASSIST_SLOT_IDS,
    formatAffixRange,
    formatModeledAffixValue,
    formatPlainRange,
    getAffixAttrs,
    getAffixEffectMeta,
    getAffixEffectText,
    getAffixInlays,
    getAffixModeledValues,
    getAffixModeling,
    getAffixNote,
    getAffixSlotIds,
    getAffixTargetLabelKey,
    getAffixTeammateMeta,
    getAffixTriggerLabelKey,
    getAffixUniqueEquips,
    getCoverageTokenKey,
    getMappingPartialHintKey,
    getModeledValueName,
    getPlanLabelKey,
    getPoolLabelKey,
    getSkillTypeLabelKey,
    getSlotName,
    isEffectOnlyAffix,
} from "@/utils/transcendence-gear"
import SkillFields from "./SkillFields.vue"
import TranscendRichText from "./transcend-build/TranscendRichText.vue"

const props = defineProps<{
    /** 当前词条 */
    affix: DnaSeasonAffix
    /** 从唯一装列表进入时附带的装备信息；词缀库内为空 */
    unique?: DnaSeasonUniqueEquip | null
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const attrs = computed(() => getAffixAttrs(props.affix))
const hasAttrs = computed(() => attrs.value.length > 0)
/** 显式技能类型（Plan 3）：标题口径保持 Skill1 / Skill2 / Passive */
const explicitSkillTypes = computed(() => props.affix.addSkillLevel?.skillTypes ?? [])
const explicitSkillTypeText = computed(() => explicitSkillTypes.value.map(type => t(getSkillTypeLabelKey(type))).join(" / "))
/** 技能等级目标：`skillTypes` 或 `skillIds` 统一解析（U58-fix），`skillIds` 复用数据层技能树映射 */
const skillInfo = computed(() => getAffixSkillLevelInfo(props.affix))
const skillTypes = computed(() => skillInfo.value.skillTypes)
const hasSkillLevel = computed(() => skillInfo.value.isSkillLevel)
/** 技能类型文案；标题已包含时不在效果区重复 */
const skillTypeText = computed(() => skillTypes.value.map(type => t(getSkillTypeLabelKey(type))).join(" / "))

/** 技能 id → 官方名称（角色技能表反查；取不到时模板回退 CopyID） */
const skillNameMap = computed(() => {
    const names = new Map<number, string>()
    const seenChars = new Set<number>()

    for (const char of charMap.values()) {
        if (seenChars.has(char.id)) {
            continue
        }

        seenChars.add(char.id)
        for (const skill of char.技能 ?? []) {
            if (skill.id !== undefined && skill.名称 && !names.has(skill.id)) {
                names.set(skill.id, skill.名称)
            }
        }
    }

    return names
})

/** 技能 id → 源技能数据（角色与武器技能）：替换字段展示用 */
const sourceSkillMap = computed(() => {
    const skills = new Map<number, Skill>()
    const seenChars = new Set<number>()

    for (const char of charMap.values()) {
        if (seenChars.has(char.id)) {
            continue
        }

        seenChars.add(char.id)
        for (const skill of char.技能 ?? []) {
            if (skill.id !== undefined && !skills.has(skill.id)) {
                skills.set(skill.id, skill)
            }
        }
    }

    for (const weapon of weaponMap.values()) {
        for (const skill of weapon.技能 ?? []) {
            if (skill.id !== undefined && !skills.has(skill.id)) {
                skills.set(skill.id, skill)
            }
        }
    }

    return skills
})

/** 激活技能行：名称优先取替换载荷，取不到名称的一侧由模板回退 CopyID */
const activateRows = computed(() =>
    Object.entries(props.affix.activateSkills ?? {}).map(([from, to]) => {
        const fromId = Number(from)
        const toId = Number(to)
        const replacementName = props.affix.skillReplacements?.[from]?.名称

        return {
            fromId,
            toId,
            fromName: gt(skillNameMap.value.get(fromId)),
            toName: gt(replacementName) || gt(skillNameMap.value.get(toId)),
        }
    }),
)

interface SkillReplacementRow {
    sourceId: number
    targetId: number
    name: string
    skill: LeveledSkill | null
    handwritten: boolean
    partial: boolean
    /** 手写表显式保留源字段（导出字段是原值镜像，不展开字段列表） */
    unchangedFields: boolean
}

/**
 * 技能替换明细：导出 + 手写兜底合并后应用到源技能；只展示有字段或手写兜底的行（纯名称替换已在激活技能行展示）。
 */
const replacementRows = computed<SkillReplacementRow[]>(() => {
    const exported = props.affix.skillReplacements
    const handwritten = TRANSCEND_SKILL_REPLACEMENTS[props.affix.id] ?? {}
    const sources = new Set([...Object.keys(exported ?? {}), ...Object.keys(handwritten)])
    const rows: SkillReplacementRow[] = []

    for (const key of sources) {
        const sourceId = Number(key)
        const payload = mergeTranscendSkillReplacement(props.affix.id, key, exported?.[key])
        if (!payload || !Number.isFinite(sourceId)) {
            continue
        }

        const source = sourceSkillMap.value.get(sourceId)
        const applied = source ? applyTranscendSkillReplacement(source, payload) : undefined
        const isHandwritten = Boolean(handwritten[key])
        const unchangedFields = handwritten[key]?.保留源字段 === true
        const hasFieldEdits = Boolean(payload.字段?.length || payload.字段改写 || payload.移除字段?.length)
        if (!hasFieldEdits && !isHandwritten) {
            continue
        }

        const targetId = payload.id ?? sourceId
        rows.push({
            sourceId,
            targetId,
            name: gt(payload.名称) || gt(skillNameMap.value.get(targetId)),
            skill: unchangedFields || !applied ? null : new LeveledSkill(applied),
            handwritten: isHandwritten,
            partial: isHandwritten,
            unchangedFields,
        })
    }

    return rows
})
const isPlan4 = computed(() => props.affix.plan === 4)

/** 手写建模数值：取自手写 BUFF 表，与普通属性同区块展示 */
const modeledValues = computed(() => getAffixModeledValues(props.affix.id))

/** 引用该词缀的唯一装：只进「关联来源」区，不再参与标题 */
const ownerEquips = computed(() => getAffixUniqueEquips(props.affix.id))

/** 头图：只有 unique 路由用装备图标，affix 路由回退通用词缀徽记 */
const headerEquip = computed(() => props.unique ?? null)

/** 专属 desc-only 的效果文本（先翻译再剥样式标签）；非 desc-only 为空串 */
const effectText = computed(() => getAffixEffectText(props.affix, gt))
/** 专属效果富文本（保留白名单标签）；非 desc-only 为空串 */
const effectMarkup = computed(() => (isEffectOnlyAffix(props.affix) ? gt(props.affix.desc) : ""))
const isEffectOnly = computed(() => isEffectOnlyAffix(props.affix))

/** 标题：唯一装名 > 专属效果文本 > 属性 / 建模属性 / 技能类型 > 方案名 */
const title = computed(() => {
    if (props.unique) {
        return gt(props.unique.name)
    }

    if (effectText.value) {
        return `${t("common.effect_label")}${effectText.value}`
    }

    if (hasAttrs.value) {
        return attrs.value.map(attr => gt(attr.attr)).join(" · ")
    }

    if (modeledValues.value.length) {
        return modeledValues.value.map(item => getModeledValueName(item, t, gt)).join(" · ")
    }

    if (explicitSkillTypes.value.length) {
        return explicitSkillTypeText.value
    }

    return t(getPlanLabelKey(props.affix.plan))
})

/** 标题已用技能类型时，效果区不再重复 */
const showSkillTypes = computed(() => skillTypes.value.length > 0 && title.value !== skillTypeText.value)

const desc = computed(() => cleanGameMarkup(gt(props.affix.desc)))
/** 描述区富文本（保留白名单标签） */
const descMarkup = computed(() => gt(props.affix.desc))

/** 描述区与标题二选一：affix 路由的 desc-only 标题已承载效果文本，不再重复描述 */
const showDesc = computed(() => Boolean(desc.value) && (!isEffectOnly.value || Boolean(props.unique)))

const planLabel = computed(() => t(getPlanLabelKey(props.affix.plan)))

/** 标题已承担方案名时不再重复展示方案徽章 */
const showPlanBadge = computed(() => planLabel.value !== title.value)

/** 详情卡自链接：统一指向列表 + `?id=`（列表已是页内分栏，旧详情路径仅保留重定向） */
const detailPath = computed(() =>
    props.unique ? `/db/transcendence/gear/unique?id=${props.unique.id}` : `/db/transcendence/gear/affix?id=${props.affix.id}`,
)

const poolLabel = computed(() => {
    const key = getPoolLabelKey(props.affix.pool)

    return key ? t(key) : ""
})

/** 可计算入口：有数据属性或技能等级词条 */
const canCalculate = computed(() => hasAttrs.value || hasSkillLevel.value)

/** 计算器可编辑项：没有档位与倍率函数时滑条/勾选框全部无效，数值已在属性区展示 */
const calculatorEditable = computed(
    () =>
        props.affix.totalValueLevel > 1 ||
        Boolean(props.affix.affixUpdatePerLvFunc) ||
        Boolean(props.affix.ancientFunc) ||
        Boolean(props.affix.maxAffixUpdateFunc),
)

/** 固定值词条不展示计算器 */
const showCalculator = computed(() => canCalculate.value && calculatorEditable.value)

/** 技能等级最终值（满档）：固定值词条没有计算器时在效果区直接展示 +N */
const skillLevelValue = computed(() =>
    Math.round(
        resolveAffixValue(props.affix, {
            affixId: props.affix.id,
            slotId: 0,
            rollLevel: Math.max(1, Math.round(props.affix.totalValueLevel || 1)),
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        }).final
    )
)
const showSkillLevelValue = computed(() => hasSkillLevel.value && !calculatorEditable.value)

/** 无属性块时（Plan 3 技能等级）直接展示原始下限/上限，非随机值只显示单值 */
const rawRangeText = computed(() => formatPlainRange(props.affix.minValue, props.affix.maxValue))

/** 手写建模口径：partial / included / excluded 均由手写 BUFF 表给出 */
const modeling = computed(() => getAffixModeling(props.affix.id))
const isPartial = computed(() => modeling.value?.partial === true)
/** 覆盖项 token → 当前语言文案；未登记的 token 回退游戏原文（未知项需在报告中登记） */
function coverageLabels(tokens: string[]): { token: string; label: string }[] {
    return tokens.map(token => {
        const key = getCoverageTokenKey(token)

        return { token, label: key ? t(key) : gt(token) }
    })
}

const includedTokens = computed(() => coverageLabels(modeling.value?.included ?? []))
const excludedTokens = computed(() => coverageLabels(modeling.value?.excluded ?? []))
const coverageText = computed(() => (modeling.value?.coverage === undefined ? "" : `${Math.round(modeling.value.coverage * 100)}%`))
/** 本地建模说明：只读展示，不参与计算 */
const noteText = computed(() => getAffixNote(props.affix.id))

/** 适用角色：上游精确 charIds，头像 + 名称，ID 不进正文 */
const applicableChars = computed(() =>
    (props.affix.charIds ?? []).map(id => {
        const char = charMap.get(id)

        return {
            id,
            name: char ? gt(char.名称) : "",
            iconUrl: LeveledChar.url(char?.icon),
        }
    }),
)

/** 手写数值的小标提示：只承载建模口径，不再单开「属性建模」区块 */
const modeledTooltip = computed(() => {
    const lines: string[] = []

    if (isPartial.value) {
        lines.push(t(getMappingPartialHintKey()))
    }

    if (includedTokens.value.length) {
        lines.push(`${t("db-transcendence.gear.included")}：${includedTokens.value.map(item => item.label).join(" / ")}`)
    }

    if (excludedTokens.value.length) {
        lines.push(`${t("db-transcendence.gear.excluded")}：${excludedTokens.value.map(item => item.label).join(" / ")}`)
    }

    if (coverageText.value) {
        lines.push(t("db-transcendence.gear.modeled_coverage", { value: coverageText.value }))
    }

    return lines.join("\n")
})

/** 属性块：普通数据行 + 手写建模行同区块展示；非随机属性只显示单值，建模行显示权威数值或表达式 */
const attrRows = computed(() => {
    const attrNames = new Set(attrs.value.map(attr => attr.attr))

    return [
        ...attrs.value.map(attr => ({
            key: `data-${attr.attr}`,
            name: gt(attr.attr),
            addTypeKey: attr.addType === "Rate" ? "db-transcendence.talent.add_type_rate" : "db-transcendence.talent.add_type_value",
            value: formatAffixRange(attr, props.affix.minValue, props.affix.maxValue),
            modeled: false,
            expression: false,
            partial: false,
            coverage: "",
            tooltip: "",
        })),
        ...modeledValues.value
            .filter(item => !attrNames.has(item.name))
            .map((item, index) => ({
                key: `modeled-${item.name}-${index}`,
                name: getModeledValueName(item, t, gt),
                addTypeKey: "",
                value: formatModeledAffixValue(item),
                modeled: true,
                expression: typeof item.value === "string",
                partial: isPartial.value,
                coverage: coverageText.value,
                tooltip: modeledTooltip.value,
            })),
    ]
})

/** 效果参数行：目标 / 触发 / 持续 / 概率 / 层数；无 `effect` 与 `team` 时整段不渲染 */
const effectRows = computed(() => {
    const effect = getAffixEffectMeta(props.affix.id)
    const team = getAffixTeammateMeta(props.affix.id)

    if (!effect && !team) {
        return []
    }

    const rows: { key: string; label: string; value: string }[] = []
    const target = team?.target ?? effect?.target
    const trigger = team?.trigger ?? effect?.trigger
    const duration = team?.duration ?? effect?.duration

    if (target) {
        rows.push({ key: "target", label: t("db-transcendence.gear.effect_target"), value: t(getAffixTargetLabelKey(target)) })
    }

    if (trigger) {
        rows.push({ key: "trigger", label: t("db-transcendence.gear.effect_trigger"), value: t(getAffixTriggerLabelKey(trigger)) })
    }

    if (duration !== undefined) {
        rows.push({
            key: "duration",
            label:
                duration === -1
                    ? t("db-transcendence.gear.effect_duration_infinite")
                    : t("db-transcendence.gear.effect_duration", { value: duration }),
            value: "",
        })
    }

    if (effect?.chance !== undefined) {
        rows.push({
            key: "chance",
            label: t("db-transcendence.gear.effect_chance", { value: +(effect.chance * 100).toFixed(2) }),
            value: "",
        })
    }

    if (effect?.maxLayers !== undefined) {
        rows.push({ key: "layers", label: t("db-transcendence.gear.effect_max_layers", { value: effect.maxLayers }), value: "" })
    }

    return rows
})

/** 槽型：名称与是否协战升华装备（装备位编号只在基础页展示） */
const slotRows = computed(() =>
    getAffixSlotIds(props.affix).map(slotId => ({
        id: slotId,
        name: gt(getSlotName(slotId)),
        assist: ASSIST_SLOT_IDS.has(slotId),
    }))
)

/** 关联来源：当前 unique 路由的装备不重复列，其余承载装备始终展示 */
const uniqueOwners = computed(() =>
    ownerEquips.value
        .filter(equip => equip.id !== props.unique?.id)
        .map(equip => ({ id: equip.id, name: gt(equip.name), icon: equip.icon, slot: gt(getSlotName(equip.slot)) }))
)
const inlaySources = computed(() =>
    getAffixInlays(props.affix.id).map(inlay => {
        const resource = resourceMap.get(inlay.id)
        const slotIds = inlay.affixIdsBySlot[String(props.affix.id)] ?? []

        return {
            id: inlay.id,
            name: resource ? gt(resource.name) : "",
            icon: resource ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp",
            slotNames: slotIds
                .map(slotId => gt(getSlotName(slotId)))
                .filter(Boolean)
                .join(" / "),
        }
    }),
)

/** 数值公式行：属性区已展示范围时不重复；技能等级的数值范围与 Roll 档位同值，只保留一行 */
const formulaRows = computed(() => {
    if (!canCalculate.value) {
        return []
    }

    const rows: { key: string; labelKey: string; value: string; mono?: boolean }[] = []

    if (!hasAttrs.value) {
        rows.push({ key: "range", labelKey: "db-transcendence.gear.value_range", value: rawRangeText.value })
    } else if (props.affix.totalValueLevel > 1) {
        rows.push({ key: "roll", labelKey: "db-transcendence.gear.roll_range", value: `1–${props.affix.totalValueLevel}` })
    }

    if (props.affix.affixUpdatePerLvFunc && !isIdentityFunc(props.affix.affixUpdatePerLvFunc)) {
        rows.push({
            key: "per-level",
            labelKey: "db-transcendence.gear.per_level",
            value: formatFunc(props.affix.affixUpdatePerLvFunc),
            mono: true,
        })
    }

    if (props.affix.ancientFunc && !isIdentityFunc(props.affix.ancientFunc)) {
        rows.push({ key: "ancient", labelKey: "db-transcendence.gear.ancient", value: formatFunc(props.affix.ancientFunc), mono: true })
    }

    if (props.affix.maxAffixUpdateFunc && !isIdentityFunc(props.affix.maxAffixUpdateFunc)) {
        rows.push({
            key: "final",
            labelKey: "db-transcendence.gear.final_masterwork",
            value: formatFunc(props.affix.maxAffixUpdateFunc),
            mono: true,
        })
    }

    return rows
})

/** 成长函数是否恒等（×1 + 0）：恒等函数不改变数值，公式行不展示 */
function isIdentityFunc(func: { Multi?: number; Add?: number }): boolean {
    return (func.Multi ?? 1) === 1 && (func.Add ?? 0) === 0
}

/** 倍率函数文本：Multi 为 1 或 Add 为 0 时省略对应项；恒等函数返回 — */
function formatFunc(func: { Multi?: number; Add?: number } | undefined): string {
    if (!func || isIdentityFunc(func)) {
        return "—"
    }

    const parts = [
        func.Multi !== undefined && func.Multi !== 1 ? `×${func.Multi}` : "",
        func.Add !== undefined && func.Add !== 0 ? `${func.Add > 0 ? "+" : ""}${func.Add}` : "",
    ].filter(Boolean)

    return parts.join(" ")
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 档案头：唯一装用装备图标，词缀用方案徽记 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <span class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]" aria-hidden="true" />
            <div class="relative flex items-center gap-3.5">
                <div v-if="headerEquip" class="relative size-16 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/5">
                    <ImageFallback :src="`/imgs/res/${headerEquip.icon}.webp`" :alt="gt(headerEquip.name)" class="size-16 object-cover">
                        <span class="flex size-16 items-center justify-center font-orbitron text-xl font-semibold text-primary/60">{{ headerEquip.name.slice(0, 1) }}</span>
                    </ImageFallback>
                </div>
                <div v-else class="flex size-16 shrink-0 items-center justify-center rounded-xs border border-primary/30 bg-primary/10">
                    <Icon icon="ri:magic-line" class="size-8 text-primary/70" />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        {{ unique ? "Gear File" : "Affix File" }}
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="detailPath"
                            class="group inline-flex min-w-0 items-center gap-1.5 text-xl leading-tight font-bold tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            <span class="wrap-break-word">
                                <TranscendRichText v-if="effectMarkup && !unique" :text="`${t('common.effect_label')}${effectMarkup}`" />
                                <template v-else>{{ title }}</template>
                            </span>
                        </SRouterLink>
                        <CopyID :id="unique ? unique.id : affix.id" />
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <span v-if="showPlanBadge" class="rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            {{ planLabel }}
                        </span>
                        <span v-if="poolLabel" class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/60">
                            {{ poolLabel }}
                        </span>
                        <span v-if="unique" class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/60">
                            {{ gt(getSlotName(unique.slot)) }}
                        </span>
                        <span v-if="unique && ASSIST_SLOT_IDS.has(unique.slot)" class="rounded-xs border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
                            {{ $t("db-transcendence.gear.assist_only") }}
                        </span>
                    </div>
                </div>
            </div>
        </header>

        <!-- 描述：Plan 4 被动与技能等级词条都有文案；desc-only 标题已承载效果文本时不再重复 -->
        <section v-if="showDesc" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('common.description')" />
            <p class="text-sm leading-relaxed text-base-content/80"><TranscendRichText :text="descMarkup" /></p>
        </section>

        <!-- 固定属性块：无属性数值与手写建模数值时不渲染 -->
        <section v-if="attrRows.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('db-transcendence.gear.attr_value')" />
            <div class="space-y-1.5">
                <div v-for="row in attrRows" :key="row.key" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="text-[13px] font-medium text-base-content/85">{{ row.name }}</span>
                        <span v-if="row.addTypeKey" class="rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 text-base-content/45">{{ $t(row.addTypeKey) }}</span>
                        <span v-if="row.value || row.modeled" class="ml-auto inline-flex flex-wrap items-center gap-1">
                            <span v-if="row.value" class="font-orbitron text-[13px] font-semibold text-base-content/60" :data-modeled-value="row.modeled ? row.value : undefined">{{ row.value }}</span>
                            <template v-if="row.modeled">
                                <span v-if="row.partial" class="rounded-xs border border-warning/40 bg-warning/10 px-1 text-[10px] leading-4 text-warning/80" :title="row.tooltip">
                                    {{ $t("db-transcendence.gear.modeled_tag") }}
                                </span>
                                <span v-else class="rounded-xs border border-success/40 bg-success/10 px-1 text-[10px] leading-4 text-success/80">
                                    {{ $t("db-transcendence.gear.modeled_exact") }}
                                </span>
                                <span v-if="row.partial" class="rounded-xs border border-warning/30 px-1 text-[10px] leading-4 text-warning/70" :title="row.tooltip">
                                    {{ $t("db-transcendence.gear.modeled_partial") }}
                                </span>
                                <span v-if="row.coverage" class="rounded-xs border border-base-content/20 px-1 text-[10px] leading-4 text-base-content/50" :title="row.tooltip">
                                    {{ $t("db-transcendence.gear.modeled_coverage", { value: row.coverage }) }}
                                </span>
                                <span v-if="row.expression" class="rounded-xs border border-base-content/20 px-1 text-[10px] leading-4 text-base-content/50">
                                    {{ $t("db-transcendence.gear.modeled_expression") }}
                                </span>
                            </template>
                        </span>
                    </div>
                </div>
            </div>
        </section>

        <!-- 效果参数：目标 / 触发 / 持续 / 概率 / 层数；无事件元数据时不渲染 -->
        <section v-if="effectRows.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="EFFECT PARAMS" :title="$t('db-transcendence.gear.effect_params')" />
            <div class="space-y-1.5">
                <div
                    v-for="row in effectRows"
                    :key="row.key"
                    class="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
                    :data-effect-param="row.key"
                >
                    <span class="text-[11px] text-base-content/60">{{ row.label }}</span>
                    <span v-if="row.value" class="font-orbitron text-[12px] font-semibold text-primary">{{ row.value }}</span>
                </div>
            </div>
        </section>

        <!-- 本地建模说明：只读展示，不参与计算 -->
        <p
            v-if="noteText"
            class="rounded-xs border border-base-content/20 bg-base-content/3 px-2.5 py-1.5 text-[11px] leading-relaxed text-base-content/55"
            data-affix-note
        >
            <span class="text-base-content/45">{{ $t("db-transcendence.gear.notes") }}：</span>{{ noteText }}
        </p>

        <!-- 被动信息：Plan 4 专属 -->
        <section
            v-if="(isPlan4 && (affix.passiveEffectId || activateRows.length || replacementRows.length)) || showSkillTypes || showSkillLevelValue"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="EFFECT" :title="$t('db-transcendence.gear.effect_info')" />
            <div class="space-y-1.5">
                <div
                    v-if="showSkillLevelValue"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
                    data-skill-level
                >
                    <span class="text-[11px] text-base-content/60">{{ $t("db-transcendence.gear.skill_level") }}</span>
                    <span class="font-orbitron text-[13px] font-semibold text-primary" data-skill-level-value>+{{ skillLevelValue }}</span>
                </div>
                <div v-if="affix.passiveEffectId" class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5">
                    <span class="text-[11px] text-base-content/60">{{ $t("db-transcendence.gear.passive_effect") }}</span>
                    <CopyID :id="affix.passiveEffectId" />
                </div>
                <div
                    v-for="row in activateRows"
                    :key="row.fromId"
                    class="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
                >
                    <span class="text-[11px] text-base-content/60">{{ $t("db-transcendence.gear.activate_skills") }}</span>
                    <span class="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-[12px] text-base-content/80">
                        <span v-if="row.fromName" class="max-w-40 truncate">{{ row.fromName }}</span>
                        <CopyID v-else :id="row.fromId" />
                        <span class="text-base-content/40" aria-hidden="true">→</span>
                        <span v-if="row.toName" class="max-w-40 truncate">{{ row.toName }}</span>
                        <CopyID v-else :id="row.toId" />
                    </span>
                </div>
                <div
                    v-for="row in replacementRows"
                    :key="`replacement-${row.sourceId}`"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
                    data-skill-replacement
                >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-[11px] text-base-content/60">{{ $t("db-transcendence.gear.skill_replacement") }}</span>
                        <span class="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-[12px] text-base-content/80">
                            <span v-if="row.name" class="max-w-40 truncate" data-skill-replacement-name>{{ row.name }}</span>
                            <CopyID v-else :id="row.targetId" />
                            <span
                                v-if="row.handwritten"
                                class="rounded-xs border border-warning/40 bg-warning/10 px-1 text-[10px] leading-4 text-warning/80"
                            >
                                {{ $t("db-transcendence.gear.modeled_tag") }}
                            </span>
                            <span v-if="row.partial" class="rounded-xs border border-warning/30 px-1 text-[10px] leading-4 text-warning/70">
                                {{ $t("db-transcendence.gear.modeled_partial") }}
                            </span>
                        </span>
                    </div>
                    <p
                        v-if="row.unchangedFields"
                        class="mt-1 text-[11px] leading-relaxed text-base-content/55"
                        data-skill-replacement-unchanged
                    >
                        {{ $t("db-transcendence.gear.skill_replacement_unchanged") }}
                    </p>
                    <p v-if="row.handwritten && excludedTokens.length" class="mt-1 text-[11px] leading-relaxed text-base-content/55">
                        {{ $t("db-transcendence.gear.excluded") }}：{{ excludedTokens.map(item => item.label).join(" / ") }}
                    </p>
                    <SkillFields v-if="row.skill" :skill="row.skill" />
                </div>
                <div
                    v-if="showSkillTypes"
                    class="flex flex-wrap items-center gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
                    data-skill-types
                >
                    <span class="mr-1 text-[11px] text-base-content/60">{{ $t("db-transcendence.gear.skill_types") }}</span>
                    <span
                        v-for="type in skillTypes"
                        :key="type"
                        class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/70"
                        data-skill-type-chip
                        :data-skill-type="type"
                    >
                        {{ $t(getSkillTypeLabelKey(type)) }}
                    </span>
                </div>
            </div>
        </section>

        <!-- 适用角色：头像 + 名称，ID 不进正文 -->
        <section v-if="applicableChars.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="CHARS" :title="$t('db-transcendence.gear.applicable_chars')" :count="applicableChars.length" />
            <div class="flex flex-wrap gap-2">
                <SRouterLink
                    v-for="char in applicableChars"
                    :key="char.id"
                    :to="`/db/char/${char.id}`"
                    class="group inline-flex items-center gap-2 rounded-xs border border-base-content/15 bg-base-content/3 py-1 pr-2.5 pl-1 transition-colors duration-150 hover:border-primary/50"
                >
                    <span class="size-6 shrink-0 overflow-hidden rounded-xs bg-linear-15" :class="getRarityGradientClass(5)">
                        <ImageFallback :src="char.iconUrl" :alt="char.name" class="size-6 object-cover object-top">
                            <img src="/imgs/webp/T_Head_Empty.webp" :alt="char.name" class="size-6 object-cover object-top" />
                        </ImageFallback>
                    </span>
                    <span v-if="char.name" class="text-[12px] text-base-content/75 transition-colors duration-150 group-hover:text-primary">{{ char.name }}</span>
                    <CopyID v-else :id="char.id" />
                </SRouterLink>
            </div>
        </section>

        <!-- 关联来源：所属唯一装与镶嵌物均可跳转 -->
        <section v-if="uniqueOwners.length || inlaySources.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCES" :title="$t('db-transcendence.gear.sources')" />
            <div class="space-y-2">
                <div v-if="uniqueOwners.length">
                    <p class="mb-1.5 text-[11px] text-base-content/50">{{ $t("db-transcendence.gear.unique_owners") }}</p>
                    <div class="flex flex-wrap gap-1.5">
                        <SRouterLink
                            v-for="owner in uniqueOwners"
                            :key="owner.id"
                            :to="`/db/transcendence/gear/unique?id=${owner.id}`"
                            class="group inline-flex items-center gap-2 rounded-xs border border-base-content/15 bg-base-content/3 py-1 pr-2.5 pl-1 transition-colors duration-150 hover:border-primary/50"
                        >
                            <ImageFallback :src="`/imgs/res/${owner.icon}.webp`" :alt="owner.name" class="size-6 shrink-0 overflow-hidden rounded-xs">
                                <span class="flex size-6 items-center justify-center rounded-xs border border-base-content/15 bg-base-content/5 text-[10px] text-base-content/45">{{ owner.name.slice(0, 1) }}</span>
                            </ImageFallback>
                            <span class="text-[12px] text-base-content/75 transition-colors duration-150 group-hover:text-primary">{{ owner.name }}</span>
                            <span class="text-[11px] text-base-content/40">{{ owner.slot }}</span>
                        </SRouterLink>
                    </div>
                </div>
                <div v-if="inlaySources.length">
                    <p class="mb-1.5 text-[11px] text-base-content/50">{{ $t("db-transcendence.gear.inlay_sources") }}</p>
                    <div class="flex flex-wrap gap-1.5">
                        <SRouterLink
                            v-for="source in inlaySources"
                            :key="source.id"
                            :to="`/db/resource/${source.id}`"
                            class="group inline-flex items-center gap-2 rounded-xs border border-base-content/15 bg-base-content/3 py-1 pr-2.5 pl-1 transition-colors duration-150 hover:border-primary/50"
                        >
                            <ImageFallback :src="source.icon" :alt="source.name" class="size-6 shrink-0 overflow-hidden rounded-xs">
                                <span class="size-6 shrink-0 rounded-xs bg-base-content/10" />
                            </ImageFallback>
                            <span v-if="source.name" class="text-[12px] text-base-content/75 transition-colors duration-150 group-hover:text-primary">{{ source.name }}</span>
                            <CopyID v-else :id="source.id" />
                            <span v-if="source.slotNames" class="text-[11px] text-base-content/40">{{ source.slotNames }}</span>
                        </SRouterLink>
                    </div>
                </div>
            </div>
        </section>

        <!-- 适用槽型：无映射时不渲染；装备位编号只在基础页展示 -->
        <section v-if="slotRows.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SLOTS" :title="$t('db-transcendence.gear.applicable_slots')" :count="slotRows.length" />
            <div class="flex flex-wrap gap-1.5">
                <span
                    v-for="slot in slotRows"
                    :key="slot.id"
                    class="inline-flex items-center gap-1.5 rounded-xs border border-base-content/15 bg-base-content/3 px-2 py-1 text-[11px] text-base-content/70"
                >
                    <template v-if="slot.name">{{ slot.name }}</template>
                    <CopyID v-else :id="slot.id" />
                    <span v-if="slot.assist" class="rounded-xs border border-warning/30 px-1 text-[10px] text-warning/80">{{ $t("db-transcendence.gear.assist_only") }}</span>
                </span>
            </div>
        </section>

        <!-- 数值公式：属性区已有范围时不重复；无可展示参数时整段不渲染 -->
        <section v-if="formulaRows.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="FORMULA" :title="$t('db-transcendence.gear.formula')" />
            <div class="grid gap-1.5 sm:grid-cols-2">
                <div
                    v-for="row in formulaRows"
                    :key="row.key"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
                >
                    <span class="text-[11px] text-base-content/60">{{ $t(row.labelKey) }}</span>
                    <span class="text-[12px] font-semibold" :class="row.mono ? 'font-mono text-base-content/80' : 'font-orbitron text-primary'">{{ row.value }}</span>
                </div>
            </div>
        </section>

        <!-- R7 计算器：无可计算数值或没有可编辑项时不渲染 -->
        <section v-if="showCalculator" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="CALCULATOR" :title="$t('db-transcendence.gear.calc')" />
            <DBTranscendenceAffixCalc :key="affix.id" :affix="affix" />
        </section>
    </div>
</template>
