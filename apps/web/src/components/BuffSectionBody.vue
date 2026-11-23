<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue"
import type { CharSettings } from "@/composables/useCharSettings"
import { useGameText } from "@/composables/useGameText"
import { type CharBuild, charMap, type LeveledBuff, type TranscendAffixEffectMeta } from "@/data"
import type { TraitSlot } from "@/data/petTrait"
import { format100r, formatProp } from "@/util"
import { getElementDisplayName } from "@/utils/element-utils"
import { getDerivedBuffRenderKey, getDerivedBuffSlotName } from "@/utils/transcend-gear/gain-context"
import { getAffixTargetLabelKey, getAffixTriggerLabelKey } from "@/utils/transcendence-gear"

/**
 * 构筑页 §BUFF 共享区：原构筑页 §06 与升华页 §04 共用同一份 markup / class，
 * 直接复用 TeamEditor / PetEditor / TraitEditer / BuffEditer / CustomBuffEditor，
 * 不提供任何 `Transcend*` 版本。章节编号与标题由调用方的 `CollapsibleSection` 决定。
 *
 * `charSettings` 是可写投影：原构筑页传完整 `CharSettings`，升华页传 joint facade。
 * 组件只读写队伍 / 魔灵 / 潜质 / 自定义 BUFF 字段，其余字段不参与。
 */

/** 协战选择项（TeamEditor 的分组候选项，与 CharBuildView 的构造同形） */
export interface BuffSectionTeamOption {
    value: number | "-"
    label: string
    elm?: string
    type?: string
    icon: string
}

/** BuffEditer 的候选 BUFF（label 为名称，value 为等级化实例） */
export interface BuffSectionBuffOption {
    label: string
    value: LeveledBuff
    lv: number
    coverage?: number
    limit?: string | number
    description?: string
}

/** 共享 buff 区需要的可写配置投影 */
export interface BuffSectionSettings {
    team1: number | "-"
    team1Weapon: number | "-"
    team1Build: string
    team1BuildVariant: string
    team2: number | "-"
    team2Weapon: number | "-"
    team2Build: string
    team2BuildVariant: string
    petId: number
    petLevel: number
    petCoverage: number
    petAutoCoverage: boolean
    traits: TraitSlot[]
    customBuff: [string, number][]
}

/** buff 栏只读派生条目（升华装备 / 天赋 / 队友来源）：来源为构筑实例，不写回 `settings.buffs` */
export interface DerivedBuffView {
    name: string
    /** 来源标签 i18n 键（自身装备派生 / 天赋 / 主控 / 协战一 / 协战二） */
    labelKey: string
    sourceSide?: "main" | "assist1" | "assist2"
    /** 同名同来源的份数（不同来源各占一行） */
    stacks?: number
    coverage?: number
    /** 来源类型：天赋节点 / 装备（含宝石）/ 溯源（独立溯源区，不进本列表） */
    sourceKind?: "talent" | "gear" | "trace"
    /** 天赋节点 id（节点名会重名，渲染 key 必须带上它） */
    sourceId?: number
    /** 天赋效果下标：同一节点多条同名效果不合并 */
    effectIndex?: number
    affixId?: number
    sourceSlotId?: number
    sourceSocketIndex?: number
    /** 装备词条来源类（同 id 随机 / 淬炼双行分行用） */
    affixSourceClass?: "tempering" | "other"
    /** 调用方解析后的具体来源名（装备名 / 装备·宝石 / 天赋节点名） */
    sourceName?: string
    /** 加成属性（当前数值） */
    attributes?: { name: string; value: number }[]
    description?: string
    note?: string
    effect?: TranscendAffixEffectMeta
    limited?: string | number
    skill?: string
    tags?: string[]
}

/** 溯源条目（每侧每根源一行；收益取 worker 结果，未算出时为空） */
export interface TraceCardView {
    side: "main" | "assist1" | "assist2"
    root: number
    active: boolean
    /** 角色 id（段首归属标识） */
    charId: number
    /** 已翻译的角色名（段首头像旁展示） */
    charName: string
    /** 角色头像地址（`LeveledChar.url`） */
    charIcon: string
    /** 本地化根源名 i18n 键（`char-build.root_N`） */
    titleKey: string
    /** 已翻译的 `char.溯源[n-1]` 游戏原文 */
    description: string
    /** 展示用只读 BUFF（数值为当前上下文的建模值，`mx` > 1 时显示等级控件） */
    buff: LeveledBuff
    income: number
    /** 层数上限（该根源各效果 mx 的最大值；≤1 时不显示等级控件） */
    mx: number
    /** 当前生效等级（缺省 = mx） */
    level: number
    /** 是否有可缩放的数值属性（纯技能等级根源不显示覆盖率） */
    hasAttrs: boolean
    /** 当前覆盖率（0-1） */
    coverage: number
}

const props = defineProps<{
    charSettings: BuffSectionSettings
    /** 魔灵 / 潜质收益用的构筑实例（魔灵只挂主控，缺省时与 buffBuild 相同） */
    charBuild?: CharBuild
    /** BuffEditer 的收益基准构筑（缺省时用 charBuild） */
    buffBuild?: CharBuild
    team1Options: Record<string, BuffSectionTeamOption[]>
    team2Options: Record<string, BuffSectionTeamOption[]>
    weaponOptions: Record<string, BuffSectionTeamOption[]>
    buffOptions: BuffSectionBuffOption[]
    selectedBuffs: LeveledBuff[]
    /** 只读派生 BUFF（升华装备 / 天赋 / 队友限定）；无条目时不渲染 */
    derivedBuffs?: DerivedBuffView[]
    /** 溯源卡片（每侧每根源一张）；无条目时不渲染 */
    traceCards?: TraceCardView[]
    /** 角色属性「魔灵CD」（秒） */
    petCd: number
    /** 角色属性「魔灵CD缩减」（0 起始的比例） */
    petCdReduce: number
    /** 魔灵生效技能等级（突破等级 + 潜质加成） */
    petLevel: number
    /** 潜质带来的技能等级加成 */
    petLevelBonus: number
}>()

const emit = defineEmits<{
    toggleBuff: [buff: LeveledBuff]
    setBuffLv: [buff: LeveledBuff, level: number]
    setBuffCoverage: [buff: LeveledBuff, coverage: number]
    /** 切换某构筑位某根源的激活状态 */
    toggleTrace: [side: "main" | "assist1" | "assist2", root: number]
    /** 设置某构筑位某根源的生效等级 */
    setTraceLevel: [side: "main" | "assist1" | "assist2", root: number, level: number]
    /** 设置某构筑位某根源的覆盖率 */
    setTraceCoverage: [side: "main" | "assist1" | "assist2", root: number, coverage: number]
    teamChange: [newValue: number | "-", oldValue: number | "-"]
    petChange: []
    selectTrait: [index: number, bid: number, level: number]
    removeTrait: [index: number]
    swapTraits: [fromIndex: number, toIndex: number]
}>()

const TeamEditor = defineAsyncComponent(() => import("@/components/TeamEditor.vue"))
const PetEditor = defineAsyncComponent(() => import("@/components/PetEditor.vue"))
const TraitEditer = defineAsyncComponent(() => import("@/components/TraitEditer.vue"))
const BuffEditer = defineAsyncComponent(() => import("@/components/BuffEditer.vue"))
const CustomBuffEditor = defineAsyncComponent(() => import("@/components/CustomBuffEditor.vue"))

/**
 * TeamEditor / PetEditor 的 prop 类型是完整 `CharSettings`，两者只访问其中的队伍 / 魔灵字段；
 * 升华页传入的 joint facade 提供同形字段，因此这里做一次窄投影（节点编辑器同一先例）。
 */
const editorSettings = computed(() => props.charSettings as unknown as CharSettings)

/** 魔灵 / 潜质收益基准：魔灵只挂主控，缺省与 BuffEditer 共用同一构筑 */
const petBuildTyped = computed(() => (props.charBuild ?? props.buffBuild) as CharBuild)
const incomeBuild = computed(() => props.buffBuild ?? props.charBuild)

/** 勾选「自定义BUFF」后才出现编辑区（与原版条件一致） */
const showCustomBuff = computed(() => props.selectedBuffs.some(buff => buff.名称 === "自定义BUFF"))

/** 溯源列表按构筑位分组（main → assist1 → assist2），每组段首渲染角色头像与名称 */
const traceCardGroups = computed(() =>
    (["main", "assist1", "assist2"] as const)
        .map(side => {
            const cards = props.traceCards?.filter(card => card.side === side) ?? []
            const head = cards[0]
            return {
                side,
                cards,
                charName: head?.charName ?? "",
                charIcon: head?.charIcon ?? "",
            }
        })
        .filter(group => group.cards.length > 0)
)

/**
 * 根源编号补零为两位（01..07，与 root 序号一致）。
 * @param root 根源序号
 * @returns 两位编号
 */
function pad2(root: number): string {
    return String(root).padStart(2, "0")
}

const { gt } = useGameText()

/**
 * 派生条目渲染 key：名称 + 来源侧 + 完整来源身份（含天赋节点 id / 效果下标）。
 * @param buff 派生条目
 * @returns 唯一 key
 */
function derivedKey(buff: DerivedBuffView): string {
    return getDerivedBuffRenderKey(buff)
}

/**
 * 属性名展示：基础前缀单独翻译（与 ShowProps 同口径）。
 * @param name 属性名
 * @returns 当前语言文案
 */
function propText(name: string): string {
    return name.startsWith("基础") ? `${gt("基础")}${gt(name.slice(2))}` : gt(name)
}

/**
 * 限定（元素 / 角色）展示文本。
 * @param limited BUFF 限定字段
 * @returns 当前语言文案
 */
function limitedText(limited: string | number | undefined): string {
    if (limited === undefined || limited === "") return ""
    if (typeof limited === "number") return gt(charMap.get(limited)?.名称 ?? String(limited))
    return gt(String(limited))
}

/**
 * 装备位展示名：官方槽型名（头盔 / 护胸 / …），不渲染装备位编号。
 * @param slotId 装备位
 * @returns 当前语言名称；未知槽位为空串
 */
function slotNameText(slotId: number): string {
    return gt(getDerivedBuffSlotName(slotId))
}

/**
 * 字符串型 `限定` 是否元素名：旧存档可能存角色名，不能一律按元素展示。
 * @param limited BUFF 限定字段
 * @returns 是否为元素名
 */
function isElementLimited(limited: string | number | undefined): boolean {
    return typeof limited === "string" && getElementDisplayName(limited) !== ""
}

/**
 * 技能限定展示文本（多技能以 | 分隔）。
 * @param skill BUFF 技能限定字段
 * @returns 技能名列表
 */
function skillText(skill: string | undefined): string {
    return (skill || "")
        .split("|")
        .map(name => gt(name.trim()))
        .filter(Boolean)
        .join(" / ")
}

/**
 * 条件区是否有可展示内容。
 * @param buff 派生条目
 * @returns 是否有条件
 */
function hasConditions(buff: DerivedBuffView): boolean {
    const effect = buff.effect
    return !!(
        effect?.target ||
        effect?.trigger ||
        effect?.chance ||
        effect?.duration !== undefined ||
        effect?.maxLayers ||
        limitedText(buff.limited) ||
        skillText(buff.skill) ||
        buff.tags?.length
    )
}

/**
 * 转发队友 / 武器变更。
 * @param newValue 新值
 * @param oldValue 旧值
 */
function onTeamChange(newValue: number | "-", oldValue: number | "-"): void {
    emit("teamChange", newValue, oldValue)
}
</script>

<template>
    <div class="my-2">
        <TeamEditor
            :char-settings="editorSettings"
            :team1-options="team1Options"
            :team2-options="team2Options"
            :weapon-options="weaponOptions"
            @team-change="onTeamChange"
        />
    </div>
    <div class="my-2">
        <PetEditor
            :char-settings="editorSettings"
            :char-build="petBuildTyped"
            :pet-cd="petCd"
            :pet-cd-reduce="petCdReduce"
            :pet-level="petLevel"
            :pet-level-bonus="petLevelBonus"
            @pet-change="emit('petChange')"
        />
    </div>
    <div class="my-2">
        <TraitEditer
            :traits="charSettings.traits"
            :char-build="petBuildTyped"
            :pet-level="charSettings.petLevel"
            :pet-id="charSettings.petId"
            :pet-coverage="charSettings.petCoverage"
            :pet-auto-coverage="charSettings.petAutoCoverage"
            @select-trait="(index, bid, level) => emit('selectTrait', index, bid, level)"
            @remove-trait="index => emit('removeTrait', index)"
            @swap-traits="(fromIndex, toIndex) => emit('swapTraits', fromIndex, toIndex)"
        />
    </div>
    <BuffEditer
        :buff-options="buffOptions"
        :selected-buffs="selectedBuffs"
        :char-build="incomeBuild"
        @toggle-buff="buff => emit('toggleBuff', buff)"
        @set-buff-lv="(buff, level) => emit('setBuffLv', buff, level)"
        @set-buff-coverage="(buff, coverage) => emit('setBuffCoverage', buff, coverage)"
    />
    <template v-if="traceCards?.length">
        <div class="mt-4 mb-2 flex items-center gap-3">
            <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">
                {{ gt("溯源") }}
            </span>
            <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
        </div>
        <div class="flex flex-col gap-4" data-trace-cards>
            <section v-for="group in traceCardGroups" :key="group.side" class="min-w-0" :data-trace-group="group.side">
                <div class="mb-1 flex items-center gap-2 border-b border-base-content/15 pb-1.5" data-trace-char :data-trace-char-side="group.side">
                    <ImageFallback
                        :src="group.charIcon"
                        :alt="group.charName"
                        class="size-6 shrink-0 rounded-full border border-base-content/15 object-cover object-top"
                    >
                        <Icon icon="ri:user-line" class="size-4 text-base-content/40" />
                    </ImageFallback>
                    <span class="min-w-0 truncate text-xs font-semibold text-base-content/85">{{ group.charName }}</span>
                </div>
                <ul class="flex flex-col divide-y divide-base-content/10">
                    <ShowProps
                        v-for="card in group.cards"
                        :key="`${card.side}:${card.root}`"
                        side="top"
                        :props="card.buff.getProperties()"
                        :attr="card.buff.dynamicAttr"
                        :title="$t(card.titleKey)"
                    >
                        <li
                            data-trace-card
                            data-trace-row
                            :data-trace-side="card.side"
                            :data-trace-root="card.root"
                            :data-trace-active="card.active"
                            class="flex min-w-0 cursor-pointer items-start gap-3 py-2 transition-opacity hover:bg-base-200/50"
                            :class="{ 'opacity-45': !card.active }"
                            @click="emit('toggleTrace', card.side, card.root)"
                        >
                            <span class="w-6 shrink-0 pt-px text-right font-mono text-[11px] leading-5 tabular-nums text-base-content/35">
                                {{ pad2(card.root) }}
                            </span>
                            <div class="min-w-0 flex-1">
                                <div class="text-sm font-semibold leading-5">{{ $t(card.titleKey) }}</div>
                                <p v-if="card.description" class="mt-0.5 text-xs leading-5 whitespace-pre-line text-base-content/55">
                                    {{ card.description }}
                                </p>
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                                <div v-if="card.income" class="text-right" data-trace-income>
                                    <div class="text-[10px] tracking-[0.12em] text-base-content/40">{{ $t("char-build.income") }}</div>
                                    <div class="font-orbitron text-[13px] font-semibold leading-none text-primary tabular-nums">
                                        {{ format100r(card.income) }}
                                    </div>
                                </div>
                                <div v-if="card.mx > 1" class="flex items-center gap-1.5">
                                    <span class="font-orbitron text-[10px] tracking-wide text-base-content/40">Lv.</span>
                                    <NumberInput
                                        v-if="card.active"
                                        :model-value="card.level"
                                        :min="card.buff.lx || 0"
                                        :max="card.mx"
                                        @click.stop
                                        @keydown.stop
                                        @update:model-value="emit('setTraceLevel', card.side, card.root, $event)"
                                    />
                                    <span v-else class="font-orbitron text-xs font-medium text-base-content/70 tabular-nums">{{ card.level }}</span>
                                </div>
                                <span v-if="card.active && card.hasAttrs" class="contents" @keydown.stop>
                                    <CoverageDialog
                                        :coverage="card.coverage"
                                        :title="$t('char-build.coverage')"
                                        :hint="$t('char-build.set_buff_coverage')"
                                        @update-coverage="emit('setTraceCoverage', card.side, card.root, $event)"
                                    />
                                </span>
                                <input
                                    type="checkbox"
                                    class="toggle toggle-xs toggle-primary shrink-0"
                                    :checked="card.active"
                                    :aria-label="$t(card.titleKey)"
                                    data-trace-switch
                                    @click.stop
                                    @change="emit('toggleTrace', card.side, card.root)"
                                />
                            </div>
                        </li>
                    </ShowProps>
                </ul>
            </section>
        </div>
    </template>
    <template v-if="derivedBuffs?.length">
        <div class="mt-4 mb-2 flex items-center gap-3">
            <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">
                {{ $t("char-build.derived_buffs") }}
            </span>
            <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
        </div>
        <ul data-derived-buffs class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-1">
            <FullTooltip v-for="buff in derivedBuffs" :key="derivedKey(buff)" side="top">
                <template #tooltip>
                    <div class="flex w-64 flex-col gap-2" data-derived-buff-tooltip>
                        <div class="text-sm font-bold">{{ buff.name }}</div>
                        <div class="flex flex-col gap-0.5" data-derived-buff-tip-source>
                            <span class="text-[10px] tracking-wide text-base-content/45 uppercase">
                                {{ $t("char-build.derived_buffs_source") }}
                            </span>
                            <span class="text-xs text-base-content/80">
                                <template v-if="buff.sourceName">
                                    <template v-if="buff.sourceSide">{{ $t(buff.labelKey) }} · </template>{{ buff.sourceName }}
                                </template>
                                <template v-else>{{ $t(buff.labelKey) }}</template>
                            </span>
                            <span v-if="buff.sourceSlotId && slotNameText(buff.sourceSlotId)" class="text-[11px] text-base-content/55" data-derived-buff-slot>
                                {{ $t("char-build.derived_buffs_slot", { slot: slotNameText(buff.sourceSlotId) }) }}
                            </span>
                            <span v-if="buff.sourceSocketIndex !== undefined" class="text-[11px] text-base-content/55">
                                {{ $t("transcend-build.gear_socket_title") }} #{{ buff.sourceSocketIndex + 1 }}
                            </span>
                        </div>
                        <div v-if="buff.attributes?.length" class="flex flex-col gap-0.5" data-derived-buff-tip-attributes>
                            <span class="text-[10px] tracking-wide text-base-content/45 uppercase">
                                {{ $t("char-build.derived_buffs_attributes") }}
                            </span>
                            <div
                                v-for="attr in buff.attributes"
                                :key="attr.name"
                                class="flex items-center justify-between gap-2 text-xs"
                            >
                                <span class="text-base-content/70">{{ propText(attr.name) }}</span>
                                <span class="text-primary tabular-nums">{{ formatProp(attr.name, attr.value) }}</span>
                            </div>
                        </div>
                        <div v-if="hasConditions(buff)" class="flex flex-col gap-0.5" data-derived-buff-tip-conditions>
                            <span class="text-[10px] tracking-wide text-base-content/45 uppercase">
                                {{ $t("char-build.derived_buffs_conditions") }}
                            </span>
                            <div class="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-base-content/70">
                                <span v-if="buff.effect?.target">
                                    {{ $t("db-transcendence.gear.effect_target") }} · {{ $t(getAffixTargetLabelKey(buff.effect.target)) }}
                                </span>
                                <span v-if="buff.effect?.trigger">
                                    {{ $t("db-transcendence.gear.effect_trigger") }} · {{ $t(getAffixTriggerLabelKey(buff.effect.trigger)) }}
                                </span>
                                <span v-if="buff.effect?.chance">
                                    {{ $t("db-transcendence.gear.effect_chance", { value: Math.round(buff.effect.chance * 100) }) }}
                                </span>
                                <span v-if="buff.effect?.duration === -1">{{ $t("db-transcendence.gear.effect_duration_infinite") }}</span>
                                <span v-else-if="buff.effect?.duration !== undefined">
                                    {{ $t("db-transcendence.gear.effect_duration", { value: buff.effect.duration }) }}
                                </span>
                                <span v-if="buff.effect?.maxLayers">
                                    {{ $t("db-transcendence.gear.effect_max_layers", { value: buff.effect.maxLayers }) }}
                                </span>
                                <span v-if="limitedText(buff.limited) && isElementLimited(buff.limited)">
                                    {{ $t("char-build.elem") }} · {{ limitedText(buff.limited) }}
                                </span>
                                <span v-else-if="limitedText(buff.limited)">
                                    {{ $t("char-build.buff_applicable") }} {{ limitedText(buff.limited) }}
                                </span>
                                <span v-if="skillText(buff.skill)">
                                    {{ $t("char-build.buff_applicable") }} {{ skillText(buff.skill) }}
                                </span>
                                <span v-for="tag in buff.tags" :key="tag">{{ $t("char-build.tag") }} · {{ gt(tag) }}</span>
                            </div>
                        </div>
                        <div v-if="buff.description || buff.note" class="flex flex-col gap-0.5" data-derived-buff-tip-description>
                            <span class="text-[10px] tracking-wide text-base-content/45 uppercase">
                                {{ $t("char-build.derived_buffs_description") }}
                            </span>
                            <p v-if="buff.description" class="text-xs whitespace-pre-line text-base-content/70">
                                {{ gt(buff.description) }}
                            </p>
                            <p v-if="buff.note" class="text-[11px] text-warning/80">{{ buff.note }}</p>
                        </div>
                        <div v-if="(buff.coverage ?? 1) < 1" class="text-xs text-warning">
                            {{ $t("char-build.derived_buffs_coverage", { value: Math.round((buff.coverage ?? 1) * 100) }) }}
                        </div>
                    </div>
                </template>
                <li
                    data-derived-buff-chip
                    tabindex="0"
                    class="flex min-w-0 items-center gap-1.5 rounded-md bg-base-200/40 px-2 py-1 text-xs transition-colors hover:bg-base-200/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                >
                    <span class="min-w-0 truncate text-base-content/80">{{ buff.name }}</span>
                    <span data-derived-buff-source class="min-w-0 shrink truncate text-[10px] text-base-content/50">
                        {{ buff.sourceName || $t(buff.labelKey) }}
                    </span>
                    <span
                        v-if="buff.sourceName && buff.sourceSide"
                        data-derived-buff-side
                        class="ml-auto shrink-0 rounded bg-base-content/10 px-1 text-[10px] text-base-content/60"
                    >
                        {{ $t(buff.labelKey) }}
                    </span>
                    <span
                        v-if="(buff.coverage ?? 1) < 1"
                        data-derived-buff-coverage
                        class="shrink-0 rounded bg-warning/15 px-1 font-mono text-[10px] text-warning"
                    >
                        {{ $t("char-build.derived_buffs_coverage", { value: Math.round((buff.coverage ?? 1) * 100) }) }}
                    </span>
                    <span v-if="(buff.stacks ?? 1) > 1" class="shrink-0 rounded bg-base-content/10 px-1 font-mono text-[10px]">
                        ×{{ buff.stacks }}
                    </span>
                </li>
            </FullTooltip>
        </ul>
    </template>
    <template v-if="showCustomBuff">
        <div class="mt-4 mb-2 flex items-center gap-3">
            <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">
                {{ $t("char-build.custom_buff") }}
            </span>
            <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
        </div>
        <CustomBuffEditor :buffs="charSettings.customBuff" @submit="charSettings.customBuff = $event" />
    </template>
</template>
