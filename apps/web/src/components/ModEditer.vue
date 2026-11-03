<script setup lang="ts">
import { t } from "i18next"
import { computed, ref, watch } from "vue"
import { requestBuildIncomes } from "@/composables/useBuildIncomeWorker"
import { MOD_VARIANT_LETTERS } from "@/composables/useCharSettings"
import { LeveledMod, LeveledModHelper } from "@/data"
import { CharBuild } from "@/data/CharBuild"
import { createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { useInvStore } from "@/store/inv"
import { copyText, pasteText } from "@/util"
import type { ModPickerOption } from "@/utils/modPicker"
import ModPickerDialog from "./ModPickerDialog.vue"

interface Props {
    mods: (LeveledMod | null)[]
    /** 同一生效配置下另一部分已装槽位（如对比页“基础已装 + 追加”）：同时生效才参与互斥；变体 A/B/C 是替代关系，绝不能传其他变体 */
    otherMods?: (LeveledMod | null)[]
    modOptions: ModPickerOption[]
    charBuild: CharBuild
    type: string
    auraMod?: number
    polset?: number[]
    /** 当前激活的 MOD 变体索引（0/1/2 ↔ 配置 A/B/C） */
    variantIndex?: number
    /** 已有变体数量（1-3）；不传则不展示变体切换（如构筑对比页的追加MOD区域） */
    variantCount?: number
    /**
     * 候选收益口径：`replace`（默认）按替换正在编辑的槽位计算，与装上后一致；
     * `append` 按额外附加计算，仅用于构筑对比页的追加 MOD 区域（追加槽本就是附加语义）。
     */
    incomeMode?: "replace" | "append"
}

const props = withDefaults(defineProps<Props>(), { variantIndex: 0, variantCount: 0, incomeMode: "replace" })
const inv = useInvStore()

const incomeMap = ref<Record<string, number>>({})
let workerRequestId = 0
const mod_model_show = ref(false)
// 当前打开选MOD弹窗的槽位索引
const localSelectedSlot = ref(-1)
// 养成开销估算面板是否展开（默认隐藏）
const showCostCalc = ref(false)
const auraModOptions = computed(() => {
    const options = props.modOptions.filter(option => {
        if (option.ser !== "羽蛇") return false
        try {
            return props.charBuild.isAuraCompatible(LeveledModHelper.fromId(option.value))
        } catch {
            return true
        }
    })
    /**
     * 兼容历史构筑或库存变更场景：若当前已选光环不在可选列表中，补入一条用于显示名称。
     */
    if (props.auraMod && !options.some(option => option.value === props.auraMod)) {
        try {
            const aura = LeveledModHelper.fromId(props.auraMod)
            options.unshift({
                value: aura.id,
                label: aura.名称,
                type: aura.类型,
                quality: aura.品质,
                ser: aura.系列,
                count: 0,
                bufflv: inv.getBuffLv(aura.id),
                lv: aura.等级,
            })
        } catch (error) {
            console.error("补充光环选项失败", error)
        }
    }
    return options
})
/**
 * 获取已装备魔之楔的 worker 收益键。
 * @param index 槽位索引
 * @returns 收益键
 */
function getEquippedModIncomeKey(index: number) {
    return `equipped:${props.type}:${index}`
}

/**
 * 读取已装备魔之楔收益。
 * @param index 槽位索引
 * @returns 收益值
 */
function getEquippedModIncome(index: number) {
    return incomeMap.value[getEquippedModIncomeKey(index)] ?? 0
}

/**
 * 将 Vue proxy 与类实例快照转为 worker 可克隆的普通 JSON 数据。
 * @param value 原始数据
 * @returns 普通数据
 */
function cloneForWorker<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

/** 刷新已装备魔之楔的收益（候选收益由选择弹窗自行计算） */
function refreshIncomes() {
    const id = ++workerRequestId
    requestBuildIncomes(
        cloneForWorker({
            build: createWorkerSnapshot(props.charBuild),
            mods: [],
            equippedMods: props.mods.flatMap((mod, index) =>
                mod
                    ? [
                          {
                              key: getEquippedModIncomeKey(index),
                              type: props.type,
                              index,
                          },
                      ]
                    : []
            ),
        })
    )
        .then(result => {
            if (id !== workerRequestId) return
            incomeMap.value = result
        })
        .catch(error => console.error("MOD收益worker计算失败", error))
}

watch(() => [props.charBuild, props.mods, props.type], () => refreshIncomes(), { immediate: true, deep: true })

// 定义组件事件
const emit = defineEmits<{
    selectAuraMod: [id: number]
    removeMod: [index: number]
    selectMod: [indexAndId: [number, number, number]]
    swapMods: [index1: number, index2: number]
    levelChange: [indexAndLevel: [number, number]]
    /** 切换激活的 MOD 变体（0/1/2 ↔ A/B/C） */
    variantSelect: [variantIndex: number]
    /** 追加一份 MOD 变体配置（按 A → B → C 顺序） */
    variantAdd: []
    /** 移除末尾的 MOD 变体配置 */
    variantRemove: []
    sync: []
}>()

const draggedModIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)

// 方法
/**
 * 点击MOD槽位打开选MOD弹窗。
 * @param index 槽位索引
 */
function handleSlotClick(index: number) {
    localSelectedSlot.value = index
    mod_model_show.value = true
}

// 拖动开始
function handleDragStart(index: number) {
    draggedModIndex.value = index
}

// 拖动结束
function handleDragEnd(_e: MouseEvent, targetElement: Element | null) {
    if (draggedModIndex.value === null) return

    // 从目标元素向上查找包含 group 类和 data-index 属性的 ModItem
    let targetModItem = targetElement
    while (targetModItem && !targetModItem.hasAttribute("data-index")) {
        targetModItem = targetModItem.parentElement
    }

    // 如果找到了目标 ModItem，读取它的 data-index
    if (targetModItem) {
        const targetIndex = parseInt(targetModItem.getAttribute("data-index") || "-1")

        if (targetIndex !== -1 && draggedModIndex.value !== targetIndex) {
            const fromIndex = draggedModIndex.value
            draggedModIndex.value = null
            dropTargetIndex.value = null

            // 发送交换事件
            emit("swapMods", fromIndex, targetIndex)
            localSelectedSlot.value = -1
            return
        }
    }

    // 如果没有有效的放置目标，清除状态
    draggedModIndex.value = null
    dropTargetIndex.value = null
}

// 处理拖动经过某个槽位
function handleDragOver(index: number) {
    if (draggedModIndex.value === null) return
    dropTargetIndex.value = index
}

/**
 * 选择光环MOD。
 * @param id 光环MOD id
 */
function handleSelectAuraMod(id: number) {
    emit("selectAuraMod", id)
}

/**
 * 移除MOD。
 * @param index 槽位索引
 */
function handleRemoveMod(index: number) {
    emit("removeMod", index)
}

/**
 * 修改MOD等级。
 * @param index 槽位索引
 * @param level 等级
 */
function handleLevelChange(index: number, level: number) {
    emit("levelChange", [index, level])
}

/**
 * 选MOD弹窗确认。
 * @param option 候选项
 */
function handleSelectMod(option: ModPickerOption) {
    emit("selectMod", [localSelectedSlot.value, option.value, option.lv ?? 10])
    mod_model_show.value = false
}

/**
 * 导入构筑代码。
 */
async function handleImportCode() {
    let charCode = ""
    try {
        charCode = (await pasteText()) || ""
    } catch (error) {
        charCode = prompt(t("modEditor.inputCode")) || ""
        console.error("导入代码失败:", error)
    }
    if (!charCode) return
    const result = props.charBuild.importCode(charCode, props.type)
    if (!result) return
    for (let i = 0; i < result.mods.length; i++) {
        const modId = result.mods[i]
        if (!modId) {
            emit("removeMod", i)
            continue
        }
        const lv = inv.getModLv(modId, LeveledModHelper.getQuality(modId)) ?? 10
        emit("selectMod", [i, modId, lv])
    }
    if (result.auraMod) {
        emit("selectAuraMod", result.auraMod)
    }
}

const aMod = computed(() => {
    return props.auraMod ? LeveledModHelper.fromId(props.auraMod) : undefined
})

/**
 * 需要极化的MOD槽位索引（半价削减耐受，含光环极化）。
 */
const polsetIndices = computed(() => props.charBuild.getModCostTransfer(props.type))

/**
 * 判断槽位是否需要极化。
 * @param index 槽位索引
 * @returns 是否极化
 */
function isPolset(index: number) {
    return polsetIndices.value.includes(index)
}

/**
 * 光环槽是否被极化（光环极化）。
 */
const auraPolset = computed(() => props.type === "角色" && polsetIndices.value.includes(props.charBuild.getMods(props.type).length - 1))
</script>
<template>
    <!-- @container：槽位列数按 ModEditer 自身宽度算，嵌入节点或构筑页都不受外层容器影响 -->
    <div class="@container">
        <ModPickerDialog
            :open="mod_model_show"
            :mod-options="modOptions"
            :char-build="charBuild"
            :slot-type="type"
            :mods="mods"
            :other-mods="otherMods"
            :slot-index="localSelectedSlot"
            :income-mode="incomeMode"
            @update:open="mod_model_show = $event"
            @select="handleSelectMod"
        />
        <!-- 顶部操作区：窄容器用图标替代文字，保证变体与操作按钮始终同一行 -->
        <div class="flex flex-wrap items-center gap-2 mb-3 @lg:flex-nowrap">
            <!-- MOD变体切换（左上角）：同一构筑可保存多份MOD配置（A/B/C），加号按顺序追加下一份；右侧中枢（光环）随变体一起切换 -->
            <div v-if="variantCount > 0" class="flex shrink-0 flex-wrap items-center gap-1.5" :title="$t('char-build.mod_variant')">
                <button
                    v-for="(letter, index) in MOD_VARIANT_LETTERS.slice(0, variantCount)"
                    :key="letter"
                    type="button"
                    class="btn btn-sm btn-square"
                    :class="index === variantIndex ? 'btn-secondary' : 'btn-ghost border border-base-content/15'"
                    :title="$t('char-build.mod_variant_switch', { letter })"
                    @click="emit('variantSelect', index)"
                >
                    {{ letter }}
                </button>
                <!-- 加号：A → A B → A B C，最多三份配置 -->
                <button
                    v-if="variantCount < MOD_VARIANT_LETTERS.length"
                    type="button"
                    class="btn btn-ghost btn-sm btn-square border border-dashed border-base-content/30 text-base-content/60"
                    :title="$t('char-build.mod_variant_add')"
                    @click="emit('variantAdd')"
                >
                    <Icon icon="ri:add-line" class="size-4" />
                </button>
                <!-- 移除：仅在激活的变体是最后一份（且非配置 A）时可用，避免误建变体后无法回退 -->
                <button
                    v-if="variantIndex > 0 && variantIndex === variantCount - 1"
                    type="button"
                    class="btn btn-ghost btn-sm btn-square border border-base-content/15 text-base-content/45"
                    :title="$t('char-build.mod_variant_remove')"
                    @click="emit('variantRemove')"
                >
                    <Icon icon="ri:close-line" class="size-4" />
                </button>
            </div>
            <div class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 @lg:flex-nowrap">
                <!-- 养成开销估算：点击展开/收起副本开销估算面板（默认隐藏） -->
                <div
                    class="btn btn-sm btn-square border"
                    :class="showCostCalc ? 'btn-secondary' : 'btn-ghost border-base-content/15'"
                    title="估算当前魔之楔养成所需的副本次数与时间，可一键跳转完整计算器"
                    @click="showCostCalc = !showCostCalc"
                >
                    <Icon icon="ri:calculator-line" class="size-4" />
                </div>
                <ShowProps v-if="aMod" :mod="aMod" :eff="charBuild?.checkModEffective(aMod, true)">
                    <div class="flex items-center gap-2">
                        <img :src="aMod.url" :alt="aMod.名称" class="w-8 h-8 inline-block" />
                        <Select
                            class="w-30 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            :model-value="auraMod"
                            @update:model-value="handleSelectAuraMod($event)"
                        >
                            <SelectItem v-for="m in auraModOptions" :key="m.value" :value="m.value">
                                {{ $t(m.quality) }} - {{ $t(m.label) }}
                            </SelectItem>
                        </Select>
                        <!-- 光环槽：明显展示所极化的槽位类型（趋向图标）与半价耐受 -->
                        <span
                            v-if="aMod.极性"
                            class="badge badge-sm gap-1"
                            :class="auraPolset ? 'badge-success text-green-800' : 'badge-soft text-base-content/80'"
                        >
                            <Icon class="inline-block" :icon="`po-${aMod.极性}`" />
                            {{ auraPolset ? Math.ceil(aMod.耐受 / 2) : aMod.耐受 }}
                        </span>
                    </div>
                </ShowProps>
                <!-- 导入/导出代码的三个按钮：与 A/B/C 一致使用 btn-square，文字走 title 提示 -->
                <div class="flex items-center gap-2">
                    <div
                        v-if="type !== '同律'"
                        class="btn btn-secondary btn-sm btn-square"
                        :title="$t('char-build.sync_game')"
                        @click="$emit('sync')"
                    >
                        <Icon icon="ri:download-cloud-2-line" class="size-4" />
                    </div>
                    <div
                        class="btn btn-ghost btn-sm btn-square border border-base-content/15"
                        :title="$t('char-build.import_code')"
                        @click="handleImportCode()"
                    >
                        <Icon icon="ri:import-line" class="size-4" />
                    </div>
                    <div
                        class="btn btn-ghost btn-sm btn-square border border-base-content/15"
                        :title="$t('char-build.export_code')"
                        @click="copyText(charBuild.getCode(type))"
                    >
                        <Icon icon="ri:file-copy-line" class="size-4" />
                    </div>
                </div>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4 @xs:grid-cols-4 @6xl:grid-cols-8">
            <ModItem
                v-for="(mod, index) in mods"
                :key="index"
                :mod="mod"
                :income="mod ? getEquippedModIncome(index) : 0"
                :index="index"
                :polset="isPolset(index)"
                control
                :char-build="charBuild"
                :selected="undefined"
                :class="{
                    'opacity-50': draggedModIndex === index,
                    'border-2 border-primary': dropTargetIndex === index && draggedModIndex !== index,
                }"
                @click="!mod && handleSlotClick(index)"
                @remove-mod="handleRemoveMod(index)"
                @drag-start="handleDragStart(index)"
                @drag-end="handleDragEnd"
                @mouseenter="draggedModIndex !== null && handleDragOver(index)"
                @lv-change="handleLevelChange(index, $event)"
            />
        </div>
        <!-- 养成开销估算：复用 LevelUpCalculator（worker 计算），展示副本估算时间并一键跳转完整计算器 -->
        <MiniCostCalculator v-if="showCostCalc" class="mt-3" :mods="mods" />
    </div>
</template>
