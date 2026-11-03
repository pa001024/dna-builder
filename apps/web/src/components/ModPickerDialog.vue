<script setup lang="ts">
import { t } from "i18next"
import { computed, ref, watch } from "vue"
import { requestBuildIncomes } from "@/composables/useBuildIncomeWorker"
import { type CharBuild, type LeveledMod, LeveledModHelper, RModTypeMap } from "@/data"
import { createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { useInvStore } from "@/store/inv"
import type { ModPickerOption } from "@/utils/modPicker"
import { getRaritySwatchClass } from "@/utils/rarity-utils"

/**
 * 魔之楔选择弹窗：构筑页的 ModEditer 与卡片节点共用。
 * 传入 charBuild / slotType / mods 时按构筑可装备口径过滤并计算收益；
 * 不传时退化为纯展示选择器，仍保留品质、属性筛选与搜索。
 */
const props = withDefaults(
    defineProps<{
        open: boolean
        modOptions: ModPickerOption[]
        charBuild?: CharBuild
        slotType?: string
        mods?: (LeveledMod | null)[]
        otherMods?: (LeveledMod | null)[]
        slotIndex?: number
        incomeMode?: "replace" | "append"
        title?: string
    }>(),
    { slotIndex: 0, incomeMode: "replace" }
)

const emit = defineEmits<{
    "update:open": [value: boolean]
    select: [option: ModPickerOption]
}>()

const inv = useInvStore()
const selectedProperty = ref("")
const selectedQuality = ref("金")
const sortByIncome = ref(true)
const incomeMap = ref<Record<string, number>>({})
let workerRequestId = 0

/** 与构筑页一致的可装备口径：槽位兼容、同系列互斥、库存数量 */
const equipableOptions = computed(() => {
    if (!props.charBuild || !props.slotType) return props.modOptions
    const key = RModTypeMap[props.slotType as keyof typeof RModTypeMap]
    const paired = props.modOptions.map(option => ({
        option,
        mod: LeveledModHelper.fromId(option.value, option.lv, option.bufflv),
    }))
    const allowed = new Set(
        props.charBuild.filterEquipableMods(
            paired.map(item => item.mod),
            key,
            {
                equipped: [props.mods ?? [], props.otherMods],
                getAvailableCount: mod => inv.getModCount(mod.id, mod.品质),
            }
        )
    )
    return paired.filter(item => allowed.has(item.mod)).map(item => item.option)
})

/** 当前品质下参与收益计算的候选项 */
const qualityOptions = computed(() =>
    equipableOptions.value.filter(option => selectedQuality.value === "全部" || option.quality === selectedQuality.value)
)

/** 属性文本筛选 + 收益排序后的展示列表 */
const visibleOptions = computed(() => {
    const filtered = qualityOptions.value.filter(option => {
        if (!selectedProperty.value) return true
        return JSON.stringify(LeveledModHelper.fromId(option.value, option.lv, option.bufflv)).includes(selectedProperty.value)
    })
    if (!sortByIncome.value) return filtered
    return filtered
        .map(option => ({ option, income: getIncome(option) }))
        .sort((left, right) => right.income - left.income)
        .map(item => item.option)
})

/**
 * 候选魔之楔的收益键。
 * @param option 候选项
 * @returns worker 收益键
 */
function getModIncomeKey(option: ModPickerOption) {
    return `mod:${option.value}:${option.lv ?? ""}:${option.bufflv ?? ""}`
}

/**
 * 读取候选魔之楔收益。
 * @param option 候选项
 * @returns 收益值
 */
function getIncome(option: ModPickerOption) {
    return incomeMap.value[getModIncomeKey(option)] ?? 0
}

/** 按当前构筑上下文刷新候选魔之楔收益 */
function refreshIncomes() {
    const charBuild = props.charBuild
    const slotType = props.slotType
    if (!props.open || !charBuild || !slotType) return
    const id = ++workerRequestId
    const payload = {
        build: createWorkerSnapshot(charBuild),
        mods: qualityOptions.value.map(option => {
            const mod = LeveledModHelper.fromId(option.value, option.lv, option.bufflv)
            return {
                key: getModIncomeKey(option),
                data: mod.originalModData,
                level: mod.等级,
                buffLv: mod.buffLv,
                effect: mod.buff?._originalBuffData,
            }
        }),
        equippedMods: (props.mods ?? []).flatMap((mod, index) =>
            mod ? [{ key: `equipped:${slotType}:${index}`, type: slotType, index }] : []
        ),
        ...(props.incomeMode === "replace" ? { replaceSlot: { type: slotType, index: props.slotIndex } } : {}),
    }
    requestBuildIncomes(JSON.parse(JSON.stringify(payload)))
        .then(result => {
            if (id !== workerRequestId) return
            incomeMap.value = result
        })
        .catch(error => console.error("MOD收益worker计算失败", error))
}

watch(
    () => [
        props.open,
        props.charBuild,
        props.slotType,
        props.mods,
        props.otherMods,
        props.slotIndex,
        props.incomeMode,
        selectedQuality.value,
        qualityOptions.value,
    ],
    () => refreshIncomes(),
    { immediate: true, deep: true }
)

/** 关闭弹窗 */
function close() {
    emit("update:open", false)
}

/**
 * 选中魔之楔。
 * @param option 候选项
 */
function pick(option: ModPickerOption) {
    emit("select", option)
    close()
}

const dialogTitle = computed(() => props.title ?? `${t("char-build.select_mod_slot")} ${props.slotIndex + 1}`)

const propertyOptions = ["攻击", "生命", "防御", "护盾", "威力", "耐久", "范围", "效益", "增伤"].map(prop => ({
    label: prop,
    value: prop,
}))
</script>

<template>
    <Teleport v-if="open" to="body">
        <dialog class="modal" :class="{ 'modal-open': open }">
            <div class="modal-box max-w-11/12 h-11/12 relative">
                <SectionHeader number="01" kicker="MOD" :title="dialogTitle" no-animate compact>
                    <template #trailing>
                        <button class="btn btn-ghost btn-sm btn-square" @click="close">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </template>
                </SectionHeader>

                <div class="tabs tabs-box bg-transparent">
                    <template v-for="quality in ['全部', '金', '紫', '蓝', '绿', '白']" :key="quality">
                        <label class="tab">
                            <input
                                v-model="selectedQuality"
                                type="radio"
                                :name="`mod_pick_${slotType ?? 'card'}`"
                                :value="quality"
                                :aria-label="quality === '全部' ? $t('common.all') : quality"
                            />
                            <span v-if="quality === '全部'">{{ $t("common.all") }}</span>
                            <span v-else :class="getRaritySwatchClass(quality)" :title="quality" />
                        </label>
                        <div v-if="selectedQuality === quality" class="tab-content py-2">
                            <ScrollArea class="h-[calc(110vh/1.2-10.5rem)] w-full">
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                                    <ModItem
                                        v-for="mod in visibleOptions"
                                        :key="mod.value"
                                        :mod="LeveledModHelper.fromId(mod.value, mod.lv, mod.bufflv)"
                                        :income="getIncome(mod)"
                                        :noremove="true"
                                        :char-build="charBuild"
                                        @click="pick(mod)"
                                    />
                                </div>
                            </ScrollArea>
                        </div>
                    </template>

                    <!-- 属性筛选下拉框 -->
                    <Combobox
                        v-model="selectedProperty"
                        class="w-40 mx-4"
                        placeholder="搜索属性/描述"
                        :options="propertyOptions"
                    />
                    <button
                        v-if="charBuild"
                        class="btn btn-sm"
                        :class="sortByIncome ? 'btn-secondary' : 'btn-outline'"
                        @click="sortByIncome = !sortByIncome"
                    >
                        {{ sortByIncome ? "收益排序：高→低" : "默认排序" }}
                    </button>
                </div>
            </div>
            <div class="modal-backdrop" @click="close" />
        </dialog>
    </Teleport>
</template>
