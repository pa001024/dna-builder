<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useBuildIncomeWorker } from "@/composables/useBuildIncomeWorker"
import type { CharBuild } from "@/data"
import { buffMap } from "@/data/d"
import { PET_SKILL_LEVEL_INDEX_MAX } from "@/data/leveled/LeveledPet"
import {
    calcPetBuffLevelIncome,
    calcPetCoverageIncome,
    getCoverageFromCdReduce,
    getPetTraitByLevel,
    getPetTraits,
    getTraitCdReduce,
    getTraitPetLevelBonus,
    getTraitProperties,
    type PetTrait,
    TRAIT_SLOT_COUNT,
    type TraitSlot,
} from "@/data/petTrait"

/**
 * 魔灵潜质编辑区——4 个互不相同的潜质槽位，交互与魔之楔槽位一致：
 * 点击空槽打开挑选器、点击已装备槽位即「更换」、按住卡片拖到其它槽位互换、右侧按钮移除，
 * 槽位常驻显示该潜质的边际收益（候选列表按收益降序展示，便于横向比较）。
 *
 * 两类潜质的收益算法不同：
 * 1. 绝大多数潜质以「魔灵潜质 BUFF」的形式注入构筑 —— 收益复用构筑的 BUFF 收益
 *    （候选 = 加入该 BUFF，已装备 = 移除该 BUFF），在 worker 中计算；
 * 2. 「老道」这类不改变角色属性、而是提升魔灵主动/被动技能等级的潜质 —— 只能靠克隆构筑并
 *    升降魔灵 BUFF 等级来求收益（见 calcPetSkillLevelIncome），这类潜质数量极少，直接在主线程算。
 */

/** 稀有度筛选页签（全部 + 金/紫/蓝 三档） */
const RARITY_TABS = ["全部", "金", "紫", "蓝"] as const

/** 稀有度 → 数据里的 r 值 */
const RARITY_VALUES: Record<string, number> = { 金: 5, 紫: 4, 蓝: 3 }

const props = defineProps<{
    /** 潜质槽位（[基础潜质 id, 等级]，null 表示空槽） */
    traits: TraitSlot[]
    charBuild: CharBuild
    /** 魔灵突破等级（技能数值索引的基数，与潜质加成叠加后取 0-4） */
    petLevel: number
    /** 已选魔灵 id（0 表示未选择） */
    petId: number
    /** 手动主动技覆盖率（0-1） */
    petCoverage: number
    /** 主动技覆盖率是否自动计算（按「持续时间 / 实际冷却」） */
    petAutoCoverage: boolean
}>()

const emit = defineEmits<{
    /** 选择潜质（槽位索引, 基础潜质 id, 等级） */
    selectTrait: [index: number, bid: number, level: number]
    /** 移除潜质（槽位索引） */
    removeTrait: [index: number]
    /** 交换两个槽位（来源索引, 目标索引） */
    swapTraits: [fromIndex: number, toIndex: number]
}>()

const pickerShow = ref(false)
const rarityTab = ref<string>("金")
/** 当前打开挑选器的槽位索引 */
const pickerSlot = ref(-1)
const { incomes, refresh } = useBuildIncomeWorker()

/** 槽位上的潜质档位（与槽位对齐，空槽为 null；槽位不足 4 个时补空位） */
const slotTraits = computed<(PetTrait | null)[]>(() =>
    Array.from({ length: TRAIT_SLOT_COUNT }, (_, index) => {
        const slot = props.traits[index]
        return slot ? (getPetTraitByLevel(slot[0], slot[1]) ?? null) : null
    })
)

/** 其它槽位已装备的基础潜质 id：同一潜质只允许占一个槽位，挑选器据此隐藏已占用项 */
const otherSlotBids = computed(() => {
    const bids = new Set<number>()
    props.traits.forEach((slot, index) => {
        if (slot && index !== pickerSlot.value) bids.add(slot[0])
    })
    return bids
})

/** 挑选器候选项：按稀有度页签过滤，并剔除其它槽位已占用的同潜质（当前槽位自身保留，便于切换等级） */
const visibleTraits = computed(() => {
    // 读取 charBuild 作为数据包换入的依赖：换包后潜质目录与 BUFF 关联需要重新取值
    void props.charBuild
    return getPetTraits()
        .filter(trait => rarityTab.value === "全部" || trait.r === RARITY_VALUES[rarityTab.value])
        .filter(trait => !otherSlotBids.value.has(trait.bid))
})

/** 是否存在需要按「魔灵技能等级」求收益的潜质（装备或候选中的「老道」这类潜质） */
const needsPetLevelIncome = computed(() =>
    [...slotTraits.value, ...(pickerShow.value ? visibleTraits.value : [])].some(trait => trait?.petSkillLevelBonus)
)

/** 生效技能等级上下限钳制 */
function clampPetLevel(level: number) {
    return Math.max(0, Math.min(PET_SKILL_LEVEL_INDEX_MAX, level))
}

/**
 * 等级类潜质的收益：`<基础潜质 id>:<等级>` → 收益。
 *
 * 按「不含该加成的等级 → 含该加成的等级」两个等级求差（见 calcPetBuffLevelIncome），
 * 装备槽位与挑选器共用同一数值：满突破时加成已被等级上限吃掉，两处都显示 0，不再出现
 * 「槽位有收益、挑选器里却是 0」这类不一致。
 */
const petLevelIncomes = computed<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    if (!needsPetLevelIncome.value) return result
    const totalBonus = getTraitPetLevelBonus(props.traits)
    getPetTraits()
        .filter(trait => trait.petSkillLevelBonus)
        .forEach(trait => {
            // 该潜质自身是否已装备：已装备时要把它自己从总加成里剔除，得到「不含它」的等级
            const equippedInSlot = slotTraits.value.some(slot => slot?.bid === trait.bid)
            const otherBonus = totalBonus - (equippedInSlot ? trait.petSkillLevelBonus : 0)
            const fromLevel = clampPetLevel(props.petLevel + otherBonus)
            const toLevel = clampPetLevel(fromLevel + trait.petSkillLevelBonus)
            result[`${trait.bid}:${trait.level}`] = calcPetBuffLevelIncome(props.charBuild, fromLevel, toLevel)
        })
    return result
})

/** 已装备潜质提供的魔灵CD缩减总和（用于折算覆盖率） */
const equippedCdReduce = computed(() => getTraitCdReduce(props.traits))

/** 是否存在需要按「主动技覆盖率」求收益的潜质（如「敏锐」：只给冷却缩减） */
const needsCoverageIncome = computed(() =>
    [...slotTraits.value, ...(pickerShow.value ? visibleTraits.value : [])].some(trait => trait && getTraitProperties(trait)["魔灵CD缩减"] > 0)
)

/**
 * 覆盖率类潜质的收益：`<基础潜质 id>:<等级>` → 收益。
 *
 * 按「不含该缩减 → 含该缩减」两个覆盖率求差（见 calcPetCoverageIncome）；
 * 装备槽位与挑选器共用同一数值，手动覆盖率下缩减不改变覆盖率、两处都显示 0。
 */
const coverageIncomes = computed<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    if (!needsCoverageIncome.value) return result
    getPetTraits()
        .filter(trait => trait && getTraitProperties(trait)["魔灵CD缩减"] > 0)
        .forEach(trait => {
            const traitReduce = getTraitProperties(trait)["魔灵CD缩减"]
            const equippedInSlot = slotTraits.value.some(slot => slot?.bid === trait.bid)
            const otherReduce = equippedCdReduce.value - (equippedInSlot ? traitReduce : 0)
            const fromCoverage = getCoverageFromCdReduce(
                props.petId,
                props.petLevel,
                otherReduce,
                props.petCoverage,
                props.petAutoCoverage
            )
            const toCoverage = getCoverageFromCdReduce(
                props.petId,
                props.petLevel,
                otherReduce + traitReduce,
                props.petCoverage,
                props.petAutoCoverage
            )
            result[`${trait.bid}:${trait.level}`] = calcPetCoverageIncome(props.charBuild, fromCoverage, toCoverage)
        })
    return result
})

/** 候选项按收益降序展示（收益尚未返回时保持数据源顺序） */
const sortedTraits = computed(() => [...visibleTraits.value].sort((a, b) => getTraitIncome(b) - getTraitIncome(a)))

/**
 * 候选潜质的收益键。
 * @param trait 潜质档位
 * @returns 收益键
 */
function getTraitIncomeKey(trait: PetTrait) {
    return `trait:${trait.id}`
}

/**
 * 已装备潜质的收益键。
 * @param index 槽位索引
 * @returns 收益键
 */
function getEquippedTraitIncomeKey(index: number) {
    return `equipped-trait:${index}`
}

/**
 * 读取候选潜质收益：属性类潜质取 worker 的「加入该 BUFF」收益，等级类潜质取魔灵技能等级加成收益。
 * @param trait 潜质档位
 * @returns 收益值
 */
function getTraitIncome(trait: PetTrait) {
    if (trait.petSkillLevelBonus) return petLevelIncomes.value[`${trait.bid}:${trait.level}`] ?? 0
    if (getTraitProperties(trait)["魔灵CD缩减"] > 0) return coverageIncomes.value[`${trait.bid}:${trait.level}`] ?? 0
    // 该潜质已装在当前槽位：按「移除该 BUFF」口径取值，避免显示成再叠一份的收益
    const equippedIndex = slotTraits.value.findIndex(slot => slot?.id === trait.id)
    if (equippedIndex !== -1) return getEquippedTraitIncome(equippedIndex)
    return incomes.value[getTraitIncomeKey(trait)] ?? 0
}

/**
 * 读取已装备潜质收益：属性类潜质取 worker 的「移除该 BUFF」收益，等级类潜质取移除等级加成的收益。
 * @param index 槽位索引
 * @returns 收益值
 */
function getEquippedTraitIncome(index: number) {
    const trait = slotTraits.value[index]
    if (trait?.petSkillLevelBonus) return petLevelIncomes.value[`${trait.bid}:${trait.level}`] ?? 0
    if (trait && getTraitProperties(trait)["魔灵CD缩减"] > 0) return coverageIncomes.value[`${trait.bid}:${trait.level}`] ?? 0
    return incomes.value[getEquippedTraitIncomeKey(index)] ?? 0
}

/**
 * 读取潜质关联的魔灵潜质 BUFF 原始数据（无属性潜质与等级类潜质返回 null）。
 * @param trait 潜质档位
 * @returns BUFF 原始数据
 */
function traitBuffData(trait: PetTrait) {
    return trait.buffName ? (buffMap.get(trait.buffName) ?? null) : null
}

/**
 * 刷新潜质收益：候选收益走「加入该 BUFF」，已装备收益走「移除该 BUFF」，均交给 worker 计算。
 */
function refreshIncomes() {
    // 仅在挑选器打开时计算候选收益，避免每次改动都白算一屏候选。
    // 这里必须用未排序的 visibleTraits：sortedTraits 读取收益，放进依赖会让收益回写再次触发计算。
    const candidates = pickerShow.value ? visibleTraits.value : []
    refresh(
        props.charBuild,
        {
            buffs: candidates.flatMap(trait => {
                const data = traitBuffData(trait)
                return data ? [{ key: getTraitIncomeKey(trait), data, level: trait.level, minus: false }] : []
            }),
            equippedBuffs: slotTraits.value.flatMap((trait, index) => {
                const data = trait ? traitBuffData(trait) : null
                return data ? [{ key: getEquippedTraitIncomeKey(index), data, level: trait!.level }] : []
            }),
        },
        "潜质收益"
    )
}

watch(
    () => [props.charBuild, props.traits, pickerShow.value, pickerShow.value ? visibleTraits.value : []],
    () => refreshIncomes(),
    { immediate: true, deep: true }
)

/**
 * 打开挑选器（空槽为「选择」，已装备槽位为「更换」）。
 * @param index 槽位索引
 */
function openPicker(index: number) {
    pickerSlot.value = index
    pickerShow.value = true
}

/**
 * 提交潜质选择并关闭挑选器。
 * @param trait 潜质档位
 */
function commitTrait(trait: PetTrait) {
    const index = pickerSlot.value
    pickerShow.value = false
    if (index < 0) return
    emit("selectTrait", index, trait.bid, trait.level)
}

const draggedIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)

/**
 * 拖动开始。
 * @param index 来源槽位索引
 */
function handleDragStart(index: number) {
    draggedIndex.value = index
}

/**
 * 拖动结束：从落点元素向上找带 data-index 的槽位卡片，落到不同槽位即请求互换。
 * @param _event 鼠标松开事件
 * @param targetElement 落点元素
 */
function handleDragEnd(_event: MouseEvent, targetElement: Element | null) {
    if (draggedIndex.value === null) return

    let targetSlot = targetElement
    while (targetSlot && !targetSlot.hasAttribute("data-index")) {
        targetSlot = targetSlot.parentElement
    }

    if (targetSlot) {
        const targetIndex = Number.parseInt(targetSlot.getAttribute("data-index") || "-1")
        if (targetIndex !== -1 && draggedIndex.value !== targetIndex) {
            const fromIndex = draggedIndex.value
            draggedIndex.value = null
            dropTargetIndex.value = null
            emit("swapTraits", fromIndex, targetIndex)
            return
        }
    }

    draggedIndex.value = null
    dropTargetIndex.value = null
}

/**
 * 拖过槽位时高亮作为放置目标。
 * @param index 槽位索引
 */
function handleDragOver(index: number) {
    if (draggedIndex.value === null) return
    dropTargetIndex.value = index
}
</script>

<template>
    <div>
        <div class="mb-1.5 text-[13px] font-semibold text-base-content/80">{{ $t("char-build.traits") }}</div>
        <!-- 4 个魔灵潜质槽位：扁平行式（左图标 / 中名称 / 右收益），可点击更换、拖动互换、右侧移除 -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <TraitItem
                v-for="(trait, index) in slotTraits"
                :key="index"
                :trait="trait"
                :index="index"
                :income="trait ? getEquippedTraitIncome(index) : 0"
                :char-build="charBuild"
                :class="{
                    'opacity-50': draggedIndex === index,
                    'border-2 border-primary': dropTargetIndex === index && draggedIndex !== index,
                }"
                @select="openPicker(index)"
                @remove-trait="emit('removeTrait', index)"
                @drag-start="handleDragStart(index)"
                @drag-end="handleDragEnd"
                @mouseenter="draggedIndex !== null && handleDragOver(index)"
            />
        </div>

        <!-- 挑选器：与魔之楔挑选器同一套交互，选中即写入并关闭 -->
        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': pickerShow }">
                <div class="modal-box max-w-11/12 h-11/12 relative">
                    <SectionHeader
                        number="01"
                        kicker="TRAIT"
                        :title="`${$t('char-build.select_trait_slot')} ${pickerSlot + 1}`"
                        no-animate
                        compact
                    >
                        <template #trailing>
                            <button class="btn btn-ghost btn-sm btn-square" @click="pickerShow = false">
                                <Icon bold icon="codicon:chrome-close" />
                            </button>
                        </template>
                    </SectionHeader>

                    <!-- 稀有度筛选 -->
                    <div class="tabs tabs-box bg-transparent">
                        <template v-for="rarity in RARITY_TABS" :key="rarity">
                            <input
                                v-model="rarityTab"
                                type="radio"
                                name="trait_select_rarity"
                                :value="rarity"
                                class="tab"
                                :aria-label="rarity === '全部' ? $t('common.all') : $t(rarity)"
                            />
                            <div v-if="rarityTab === rarity" class="tab-content py-2">
                                <ScrollArea class="h-[calc(110vh/1.2-10.5rem)] w-full">
                                    <div class="grid grid-cols-1 2xl:grid-cols-2 gap-2">
                                        <TraitItem
                                            v-for="trait in sortedTraits"
                                            :key="trait.id"
                                            :trait="trait"
                                            :income="getTraitIncome(trait)"
                                            :char-build="charBuild"
                                            noremove
                                            @select="commitTrait(trait)"
                                        />
                                    </div>
                                    <p v-if="!sortedTraits.length" class="py-4 text-center text-sm text-base-content/45">
                                        {{ $t("char-build.traits_empty") }}
                                    </p>
                                </ScrollArea>
                            </div>
                        </template>
                    </div>
                </div>
                <div class="modal-backdrop" @click="pickerShow = false" />
            </dialog>
        </Teleport>
    </div>
</template>
