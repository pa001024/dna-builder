<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, defineAsyncComponent, ref, watch } from "vue"
import TranscendAttrPanel from "@/components/transcend-build/TranscendAttrPanel.vue"
import { useAttrI18n } from "@/composables/useAttrI18n"
import { useExprDrag } from "@/composables/useExprDrag"
import { useGameText } from "@/composables/useGameText"
import { type CharAttr, type CharBuild, type TranscendSideLoadout, weaponMap } from "@/data"
import { format100, format100r, formatWeaponProp } from "@/util"
import { copyExprField } from "@/utils/expr-field-copy"
import { getDynamicWeaponDisplayValue, resolveSingleWeaponSelection } from "@/utils/transcend-build"
import { collectWeaponAttrSources, type WeaponAttrSource } from "@/utils/weapon-attr-sources"

/**
 * 左栏单槽武器面板：结构对齐原版 `WeaponTab`（名称 + 精炼 + Lv + 滑条 + 属性列表 + 攻击页签 + 当前类型字段）。
 * 面板只渲染当前槽位的武器：近战/远程由页签决定，协战单槽按已装备武器类型落位。
 */

const props = defineProps<{
    loadout: TranscendSideLoadout
    wkey: "melee" | "ranged"
    /** 该构筑位实例：武器属性与攻击页签的数值来源 */
    charBuild?: CharBuild | null
    /** 该构筑位的面板属性（SkillFields 用） */
    attributes?: CharAttr
    /** 和鸣增益（0-3）：属性面板显式传入，避免内部读 `useCharSettings` 写错协战存档 */
    resonanceGain: number
    /** 协战单槽：近战 / 远程二选一，切换时清空另一槽 */
    single?: boolean
}>()

const emit = defineEmits<{
    (event: "update", patch: Partial<TranscendSideLoadout>): void
}>()

const { t: translate } = useTranslation()
const { gt } = useGameText()
const { getAttrName, getAttrDesc } = useAttrI18n()
const { startExprDrag } = useExprDrag()

const WeaponListView = defineAsyncComponent(() => import("@/components/WeaponListView.vue"))

const weaponPickerOpen = ref(false)
const pendingMelee = ref(0)
const pendingRanged = ref(0)
/** 协战单槽：弹窗内最后一次改动的槽位（决定「应用」写入哪一个） */
const lastChangedSlot = ref<"" | "melee" | "ranged">("")

/** 当前展示的槽位：协战单槽按已装备武器类型落位，其余由页签决定 */
const effectiveWkey = computed<"melee" | "ranged">(() => {
    if (!props.single) return props.wkey
    return props.loadout.rangedWeapon > 0 && props.loadout.meleeWeapon <= 0 ? "ranged" : "melee"
})
const isMeleeSlot = computed(() => effectiveWkey.value === "melee")

/** 当前槽位展示信息 */
const slot = computed(() => {
    const isMelee = isMeleeSlot.value
    const weaponId = isMelee ? props.loadout.meleeWeapon : props.loadout.rangedWeapon
    const weapon = weaponMap.get(weaponId)
    const tab = isMelee ? "近战" : "远程"
    return {
        weaponId,
        name: weapon ? gt(weapon.名称) : `${translate(tab)} · ${translate("char-build.weapon_slot_not_equipped")}`,
        tab,
        level: isMelee ? props.loadout.meleeWeaponLevel : props.loadout.rangedWeaponLevel,
        refine: isMelee ? props.loadout.meleeWeaponRefine : props.loadout.rangedWeaponRefine,
        levelKey: (isMelee ? "meleeWeaponLevel" : "rangedWeaponLevel") as "meleeWeaponLevel" | "rangedWeaponLevel",
        refineKey: (isMelee ? "meleeWeaponRefine" : "rangedWeaponRefine") as "meleeWeaponRefine" | "rangedWeaponRefine",
    }
})

/** 当前槽位武器实例（与页签同源，避免近战/远程串位） */
const weapon = computed(() => (isMeleeSlot.value ? props.charBuild?.meleeWeapon : props.charBuild?.rangedWeapon) ?? null)

/** 武器面板属性（真实计算值） */
const weaponAttrs = computed(() =>
    props.charBuild && weapon.value && slot.value.weaponId > 0 ? (props.charBuild.calculateWeaponAttributes(weapon.value).weapon ?? null) : null
)

/** 武器属性行：过滤空值与近战不适用的多重 */
const weaponAttrRows = computed(() => {
    if (!weaponAttrs.value || !weapon.value) return []
    const melee = weapon.value.类型.includes("近战")
    return Object.entries(weaponAttrs.value).filter(([key, value]) => value && (!melee || key !== "多重"))
})

/** 当前武器槽的技能页签（攻击类型） */
const weaponSkills = computed(() => {
    if (!props.charBuild) return []
    return isMeleeSlot.value ? props.charBuild.meleeWeaponSkills : props.charBuild.rangedWeaponSkills
})

/** 当前选中的武器技能 */
const selectedWeaponSkill = computed(() => weaponSkills.value.find(skill => skill.名称 === props.loadout.baseName) ?? null)

/**
 * 武器属性行展示名：攻击行带武器伤害类型前缀（如「贯穿攻击」），其余属性原样。
 * @param key 武器属性键名
 * @returns 属性展示名（翻译键）
 */
function attrName(key: string): string {
    return getAttrName(key, key === "攻击" ? (weapon.value?.伤害类型 ?? "") : "")
}

/**
 * 武器属性行在表达式中使用的字段（近战::攻击! / 远程::触发!）。
 * @param key 武器属性键名
 * @returns 表达式字段文本
 */
function weaponAttrExpression(key: string): string {
    return `${isMeleeSlot.value ? "近战" : "远程"}::${key}!`
}

/**
 * 指针按下时抓起武器属性字段。
 * @param key 武器属性键名
 * @param event 指针按下事件
 */
function startWeaponAttrDrag(key: string, event: PointerEvent): void {
    startExprDrag({ expr: weaponAttrExpression(key), label: translate(attrName(key)) }, event)
}

/**
 * 双击武器属性行：复制该字段到剪贴板。
 * @param key 武器属性键名
 */
function handleWeaponAttrDblClick(key: string): void {
    void copyExprField(weaponAttrExpression(key))
}

/** 各属性行的上游属性说明 */
const weaponAttrDescMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const key of Object.keys(weaponAttrs.value ?? {})) {
        const desc = getAttrDesc(attrName(key))
        if (desc) map[key] = desc
    }
    return map
})

/** 各属性行的静态加成来源（角色加成 / 武器词条 / 武器效果 / BUFF） */
const weaponAttrSourceMap = computed<Record<string, WeaponAttrSource[]>>(() => {
    const map: Record<string, WeaponAttrSource[]> = {}
    const build = props.charBuild
    const current = weapon.value
    if (!build || !current) return map
    for (const key of Object.keys(weaponAttrs.value ?? {})) {
        map[key] = collectWeaponAttrSources(build, current.类型, key)
    }
    return map
})

/** 动态 BUFF（code 型）对武器面板的贡献：移除该 BUFF 后重算的差值 */
const dynamicWeaponAttrSourceMap = computed<Record<string, { sourceName: string; value: number }[]>>(() => {
    const map: Record<string, { sourceName: string; value: number }[]> = {}
    const build = props.charBuild
    if (!build) return map
    const epsilon = 1e-10
    build.dynamicBuffs.forEach((buff, buffIndex) => {
        const without = build.clone()
        without.dynamicBuffs = build.dynamicBuffs.filter((_, index) => index !== buffIndex).map(item => item.clone())
        const current = isMeleeSlot.value ? without.meleeWeapon : without.rangedWeapon
        if (!current) return
        const attrsWithout = without.calculateWeaponAttributes(current).weapon
        if (!attrsWithout) return
        for (const [key, value] of Object.entries(weaponAttrs.value ?? {})) {
            const withoutValue = attrsWithout[key as keyof typeof attrsWithout]
            if (typeof value !== "number" || typeof withoutValue !== "number") continue
            const delta = value - withoutValue
            if (Math.abs(delta) < epsilon) continue
            map[key] ||= []
            map[key].push({ sourceName: buff.名称, value: getDynamicWeaponDisplayValue(baseWeapon.value as unknown as Record<string, unknown>, key, delta) })
        }
    })
    return map
})

/** 武器基础字段（`基础攻击` / `基础暴击`…） */
const baseWeapon = computed(() => weapon.value)

/** 熔炉武器不显示精炼选择（对齐原版 `WeaponTab`） */
const isForgeWeapon = computed(() => Boolean(baseWeapon.value?._originalWeaponData?.熔炉))

/**
 * 武器精通是否生效（角色精通包含该武器类别）。
 * @returns 生效时为 true
 */
const masteryApplies = computed(() => {
    const current = weapon.value
    const build = props.charBuild
    if (!current || !build) return false
    return build.char.精通.includes(current.类别) || build.char.精通.includes("全部类型")
})

/** 精通倍率（普通武器 1.2） */
const masteryRatio = computed(() => (baseWeapon.value?.类型.startsWith("同律") ? 1.4 : 1.2))

/**
 * 武器属性行的取值格式：攻速/多重/弹匣等按基础攻击格式。
 * @param key 属性键名
 * @param value 数值
 * @returns 展示文本
 */
function formatAttrValue(key: string, value: number): string {
    return formatWeaponProp(["攻速", "多重", "弹匣", "装填", "弹药"].includes(key) ? "基础攻击" : key, value)
}

/** 打开武器选择弹窗（带上当前槽位草稿） */
function openWeaponPicker(): void {
    pendingMelee.value = props.loadout.meleeWeapon
    pendingRanged.value = props.loadout.rangedWeapon
    lastChangedSlot.value = ""
    weaponPickerOpen.value = true
}

/**
 * 武器弹窗回传：只记录本次草稿，点击「应用」时才写回设置。
 * 协战单槽按最后一次改动的槽位判定（弹窗可先后点近战/远程）。
 * @param melee 近战武器 id
 * @param ranged 远程武器 id
 */
function onWeaponChange(melee: number, ranged: number): void {
    if (props.single) {
        if (melee !== pendingMelee.value) lastChangedSlot.value = "melee"
        else if (ranged !== pendingRanged.value) lastChangedSlot.value = "ranged"
    }
    pendingMelee.value = melee
    pendingRanged.value = ranged
}

/** 应用武器选择并关闭弹窗 */
function applyWeaponSelection(): void {
    if (props.single) {
        emit("update", resolveSingleWeaponSelection(lastChangedSlot.value, pendingMelee.value, pendingRanged.value))
    } else {
        emit("update", { meleeWeapon: pendingMelee.value, rangedWeapon: pendingRanged.value })
    }
    weaponPickerOpen.value = false
}

/** 卸下当前槽位武器 */
function unequipWeapon(): void {
    if (props.single) {
        emit("update", { meleeWeapon: 0, rangedWeapon: 0 })
        return
    }
    emit("update", isMeleeSlot.value ? { meleeWeapon: 0 } : { rangedWeapon: 0 })
}

/** 单槽/协战模式的等级草稿：拖动只更新草稿与显示，松手（change）才写回，避免按帧重建协战构筑 */
const levelDraft = ref<number | null>(null)
watch(
    () => [slot.value.weaponId, slot.value.level],
    () => {
        levelDraft.value = null
    }
)

/**
 * 武器等级滑条输入：单槽模式只记草稿，其余模式保持即时写回。
 * @param value 滑条原始值
 */
function onLevelInput(value: string): void {
    const level = Math.max(1, Math.min(80, Math.round(Number(value) || 1)))
    if (props.single) {
        levelDraft.value = level
        return
    }
    emit("update", { [slot.value.levelKey]: level } as Partial<TranscendSideLoadout>)
}

/** 滑条松手：把单槽草稿提交为一次设置写入 */
function commitLevel(): void {
    if (!props.single || levelDraft.value === null) return
    emit("update", { [slot.value.levelKey]: levelDraft.value } as Partial<TranscendSideLoadout>)
    levelDraft.value = null
}

/**
 * 显示武器基础字段：`基础` + 属性键。
 * @param key 属性键名
 * @returns 基础值；不存在时为 undefined
 */
function baseValueOf(key: string): number | undefined {
    const base = baseWeapon.value as unknown as Record<string, unknown> | null
    const value = base?.[`基础${key}`]
    return typeof value === "number" ? value : undefined
}

/**
 * 基础字段展示文本。
 * @param key 属性键名
 * @param value 基础值
 * @returns 展示文本
 */
function formatBaseValue(key: string, value: number): string {
    return formatWeaponProp(key === "攻击" ? "基础攻击" : key, value)
}

/** 拖拽/双击时使用的 i18n 文案 */
const dragFieldHint = computed(() => translate("char-build.drag_field_hint"))
</script>

<template>
    <div
        class="rounded-xs border border-base-content/10 bg-base-100/70 p-3 shadow-sm backdrop-blur-sm"
        data-transcend-panel="weapon"
        :data-weapon-key="effectiveWkey"
        :data-single="single ? '1' : '0'"
    >
        <div class="space-y-3">
            <SectionHeader no-animate compact>
                <template #title>
                    <div class="flex min-w-0 flex-col gap-1" data-tour="weapon-select">
                        <div
                            class="flex cursor-pointer items-center gap-1.5 text-[17px] font-semibold text-base-content"
                            :title="$t('char-build.equip_weapon', { slot: $t(slot.tab) })"
                            @click="openWeaponPicker"
                        >
                            <span class="truncate">{{ slot.name }}</span>
                            <FullTooltip v-if="baseWeapon" side="bottom">
                                <template #tooltip>
                                    <WeaponTooltip :weapon="baseWeapon" bare />
                                </template>
                                <button type="button" class="inline-flex shrink-0 text-base-content/50 hover:text-primary" @click.stop>
                                    <Icon icon="ri:question-line" class="h-4 w-4" />
                                </button>
                            </FullTooltip>
                            <Icon icon="ri:exchange-line" class="h-4 w-4 shrink-0 text-primary" />
                        </div>
                        <Select
                            v-if="slot.weaponId > 0 && !isForgeWeapon"
                            :model-value="slot.refine"
                            hidebtn
                            class="text-sm text-primary"
                            @update:model-value="emit('update', { [slot.refineKey]: $event } as Partial<TranscendSideLoadout>)"
                        >
                            <SelectItem v-for="i in [0, 1, 2, 3, 4, 5]" :key="i" :value="i">{{ $t("char-build.refine") + i }}</SelectItem>
                        </Select>
                    </div>
                </template>
                <template #trailing>
                    <div v-if="slot.weaponId > 0" class="flex items-center gap-2">
                        <span class="shrink-0 font-orbitron text-sm font-semibold text-primary tabular-nums">Lv. {{ levelDraft ?? slot.level }}</span>
                        <button type="button" class="btn btn-ghost btn-xs" :title="$t('transcend-build.unequip')" @click="unequipWeapon">
                            <Icon icon="ri:delete-bin-line" class="size-4" />
                        </button>
                    </div>
                </template>
            </SectionHeader>
            <div v-if="slot.weaponId > 0" class="flex items-center gap-2 p-1 text-sm">
                <div class="flex-1">
                    <input
                        :value="levelDraft ?? slot.level"
                        type="range"
                        class="range range-primary range-xs w-full"
                        min="1"
                        max="80"
                        step="1"
                        @input="onLevelInput(($event.target as HTMLInputElement).value)"
                        @change="commitLevel"
                    />
                </div>
            </div>
            <div v-if="slot.weaponId > 0 && weaponAttrs && charBuild" class="space-y-1">
                <TranscendAttrPanel
                    :attributes="attributes!"
                    :char-build="charBuild"
                    :resonance-gain="resonanceGain"
                    :include-keys="['攻击']"
                />
                <FullTooltip v-for="[key, val] in weaponAttrRows" :key="key" side="bottom">
                    <template #tooltip>
                        <div class="flex flex-col gap-2">
                            <div class="text-xs text-base-content/50">{{ $t(attrName(key)) }}</div>
                            <div v-if="weaponAttrDescMap[key]" class="max-w-75 whitespace-pre-line text-xs text-base-content/60">
                                {{ weaponAttrDescMap[key] }}
                            </div>
                            <ul class="space-y-1">
                                <li v-if="baseValueOf(key) !== undefined" class="flex justify-between gap-8 text-sm text-primary">
                                    <div class="text-base-content/80">
                                        {{
                                            key === "攻击"
                                                ? $t("char-build.base_weapon_attack_label", { dmg: $t(weapon?.伤害类型 ?? "") })
                                                : $t("char-build.base_attr_label", { attr: $t(key) })
                                        }}
                                    </div>
                                    {{ formatBaseValue(key, baseValueOf(key)!) }}
                                </li>
                                <li v-if="key === '攻速'" class="flex justify-between gap-8 text-sm text-primary">
                                    <div class="text-base-content/80">{{ $t("char-build.base_attr_label", { attr: $t(key) }) }}</div>
                                    {{ formatWeaponProp("基础攻击", baseWeapon?.射速 ?? 1) }}
                                </li>
                                <li
                                    v-for="(source, index) in weaponAttrSourceMap[key] || []"
                                    :key="`${source.name}-${key}-${index}`"
                                    class="flex justify-between gap-8 text-sm text-primary"
                                >
                                    <div class="text-base-content/80">{{ gt(source.name) }}</div>
                                    {{ format100r(source.value) }}
                                </li>
                                <li
                                    v-for="(source, index) in dynamicWeaponAttrSourceMap[key] || []"
                                    :key="`dynamic-${source.sourceName}-${index}`"
                                    class="flex justify-between gap-8 text-sm text-primary"
                                >
                                    <div class="text-base-content/80">{{ gt(source.sourceName) }}</div>
                                    {{ format100r(source.value) }}
                                </li>
                                <li v-if="key === '攻击' && masteryApplies" class="flex justify-between gap-8 text-sm text-primary">
                                    <div class="text-base-content/80">{{ gt("武器精通") }}</div>
                                    *{{ format100(masteryRatio) }}
                                </li>
                            </ul>
                            <div class="text-xs text-base-content/50">{{ dragFieldHint }}</div>
                        </div>
                    </template>
                    <div
                        class="flex cursor-grab select-none items-center justify-between rounded-xs p-1 px-2 transition-all duration-200 hover:bg-base-100 hover:shadow-md active:cursor-grabbing"
                        @pointerdown="startWeaponAttrDrag(key, $event)"
                        @dblclick="handleWeaponAttrDblClick(key)"
                    >
                        <span class="text-sm text-base-content/80">{{ $t(attrName(key)) }}</span>
                        <span class="font-orbitron text-sm font-bold text-primary">{{ formatAttrValue(key, val) }}</span>
                    </div>
                </FullTooltip>
            </div>
            <template v-if="slot.weaponId > 0">
                <SkillTabs :skills="weaponSkills" :selected-skill-name="loadout.baseName" @select="emit('update', { baseName: $event })" />
                <SkillFields
                    v-if="selectedWeaponSkill"
                    :skill="selectedWeaponSkill"
                    :selected-identifiers="charBuild?.getIdentifierNames(charBuild.targetFunction) ?? []"
                    :char-build="charBuild ?? undefined"
                    :attributes="attributes"
                />
                <div v-else class="flex items-center justify-center text-sm opacity-60">{{ $t("char-build.select_skill_weapon") }}</div>
            </template>
        </div>

        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': weaponPickerOpen }" data-transcend-weapon-picker>
                <div class="modal-box flex h-11/12 w-11/12 max-w-6xl flex-col bg-base-300 p-0">
                    <div class="min-h-0 flex-1">
                        <WeaponListView
                            v-if="weaponPickerOpen"
                            :char-build="charBuild ?? undefined"
                            :default-tab="slot.tab"
                            :melee="loadout.meleeWeapon"
                            :ranged="loadout.rangedWeapon"
                            @change="onWeaponChange"
                        />
                    </div>
                    <div class="modal-action shrink-0 px-4 pb-3">
                        <button type="button" class="btn btn-primary" @click="applyWeaponSelection">{{ $t("transcend-build.craft_apply") }}</button>
                        <button type="button" class="btn" @click="weaponPickerOpen = false">{{ $t("transcend-build.craft_cancel") }}</button>
                    </div>
                </div>
                <div class="modal-backdrop" @click="weaponPickerOpen = false" />
            </dialog>
        </Teleport>
    </div>
</template>
