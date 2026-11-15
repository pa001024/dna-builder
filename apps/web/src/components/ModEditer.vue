<script setup lang="ts">
import { t } from "i18next"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { requestBuildIncomes } from "@/composables/useBuildIncomeWorker"
import { MOD_VARIANT_LETTERS } from "@/composables/useCharSettings"
import { charMap, LeveledMod, LeveledModHelper, weaponMap } from "@/data"
import { CharBuild } from "@/data/CharBuild"
import { createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { useInvStore } from "@/store/inv"
import { useUIStore } from "@/store/ui"
import { copyText, pasteText } from "@/util"
import { encodeModCode, type ParsedModCode, parseModCode } from "@/utils/modCode"
import type { ModPickerOption } from "@/utils/modPicker"
import ModPickerDialog from "./ModPickerDialog.vue"

interface Props {
    mods: (LeveledMod | null)[]
    /** 同一生效配置下另一部分已装槽位（如对比页“基础已装 + 追加”）：同时生效才参与互斥；变体 A/B/C 是替代关系，绝不能传其他变体 */
    otherMods?: (LeveledMod | null)[]
    modOptions: ModPickerOption[]
    /** 构筑上下文；节点未接入构筑时不传，此时槽位仍可编辑但无法按角色过滤 */
    charBuild?: CharBuild
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
    /**
     * 未接入构筑时的代码持有者：节点上显式选择的角色 / 武器。
     * 有值时导入导出改用当前槽位数据直接编解码，不再依赖 CharBuild。
     */
    codeOwner?: { flag: "C" | "W"; id: number }
}

const props = withDefaults(defineProps<Props>(), { variantIndex: 0, variantCount: 0, incomeMode: "replace" })
const inv = useInvStore()
const ui = useUIStore()

const incomeMap = ref<Record<string, number>>({})
let workerRequestId = 0
const mod_model_show = ref(false)
// 中枢（光环）选择弹窗是否打开
const auraDialogShow = ref(false)
// 当前打开选MOD弹窗的槽位索引
const localSelectedSlot = ref(-1)
// 养成开销估算面板是否展开（默认隐藏）
const showCostCalc = ref(false)
const auraModOptions = computed(() => {
    const options = props.modOptions.filter(option => {
        if (option.ser !== "羽蛇") return false
        // 未接入构筑（节点未连线）时没有角色属性，中枢候选只按系列筛选
        if (!props.charBuild) return true
        try {
            return props.charBuild.isAuraCompatible(LeveledModHelper.fromId(option.value))
        } catch (error) {
            // 兼容性未知时保留候选，避免已装光环从列表消失
            console.error("光环兼容性判断失败", error)
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
    // 未接入构筑时没有收益口径，清空旧值避免显示过期数据
    if (!props.charBuild) {
        incomeMap.value = {}
        return
    }
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
    /** 导入码确认替换后，把节点上的角色 / 武器上下文换成代码持有者 */
    importOwner: [owner: { flag: "C" | "W"; id: number }]
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
 * 按槽位顺序把解析结果写入当前页签：空槽移除、有 id 的槽位按库存等级装上。
 * @param mods 代码中按槽位顺序还原的 MOD id
 */
function applyImportedMods(mods: number[]) {
    for (let index = 0; index < props.mods.length; index++) {
        const modId = mods[index] ?? 0
        if (!modId) {
            emit("removeMod", index)
            continue
        }
        const lv = inv.getModLv(modId, LeveledModHelper.getQuality(modId)) ?? 10
        emit("selectMod", [index, modId, lv])
    }
}

/** 导入码持有者与当前选择不一致时的三选一结果 */
type OwnerConflictChoice = "replace" | "keep" | "cancel"

/** 不一致弹窗的展示信息；null 表示未打开 */
const ownerConflict = ref<{ current: string; incoming: string } | null>(null)
let ownerConflictResolve: ((choice: OwnerConflictChoice) => void) | null = null

/**
 * 取角色 / 武器的展示名；数据表查不到时退回 id。
 * @param flag 代码类型
 * @param id 角色 / 武器 id
 * @returns 展示名
 */
function ownerLabel(flag: "C" | "W", id: number) {
    const name = flag === "C" ? charMap.get(id)?.名称 : weaponMap.get(id)?.名称
    return name ? t(name) : `#${id}`
}

/**
 * 打开「导入码持有者与当前选择不一致」弹窗，等待用户选择。
 * @param current 当前选择的角色 / 武器名
 * @param incoming 导入码归属的角色 / 武器名
 * @returns 替换 / 保留 / 取消
 */
function askOwnerConflict(current: string, incoming: string) {
    return new Promise<OwnerConflictChoice>(resolve => {
        ownerConflict.value = { current, incoming }
        ownerConflictResolve = resolve
    })
}

function resolveOwnerConflict(choice: OwnerConflictChoice) {
    ownerConflict.value = null
    const resolve = ownerConflictResolve
    ownerConflictResolve = null
    resolve?.(choice)
}

// 组件卸载时按取消处理，避免导入流程悬在一个永不 resolve 的 Promise 上
onBeforeUnmount(() => resolveOwnerConflict("cancel"))

/**
 * 判断导入码是否属于当前页签。
 * 角色码只能进角色页签；近战 / 远程码按武器大类精确匹配（远程码不能贴进近战页签）；
 * 同律接受任意武器码——继承型同律使用的就是被继承的近战 / 远程武器代码。
 * @param parsed 解析后的导入码
 * @returns 是否与当前页签匹配
 */
function codeMatchesCurrentTab(parsed: ParsedModCode) {
    if (props.type === "角色") return parsed.flag === "C"
    if (parsed.flag !== "W") return false
    if (props.type === "同律") return true
    return weaponMap.get(parsed.ownerId)?.类型[0] === props.type
}

/**
 * 导入构筑代码。
 * 未接入构筑时直接解析代码写回当前页签；代码持有者与当前选择不一致时让用户三选一。
 * 代码的角色 / 武器类型必须与当前页签匹配。
 */
async function handleImportCode() {
    // 上一次导入的选择弹窗还没结束时不再叠一个
    if (ownerConflict.value) return
    let charCode = ""
    try {
        charCode = (await pasteText()) || ""
    } catch (error) {
        charCode = prompt(t("modEditor.inputCode")) || ""
        console.error("导入代码失败:", error)
    }
    const compact = charCode.replace(/\s+/g, "")
    if (!compact) return
    const parsed = parseModCode(compact)
    if (!parsed) {
        ui.showErrorMessage(t("char-build.import_format_invalid"))
        return
    }
    if (!codeMatchesCurrentTab(parsed)) {
        ui.showErrorMessage(t("modEditor.typeMismatch"))
        return
    }
    if (!props.charBuild) {
        const current = props.codeOwner
        if (current && current.id !== parsed.ownerId) {
            const choice = await askOwnerConflict(
                ownerLabel(current.flag, current.id),
                ownerLabel(parsed.flag, parsed.ownerId)
            )
            if (choice === "cancel") return
            if (choice === "replace") emit("importOwner", { flag: parsed.flag, id: parsed.ownerId })
        } else if (!current) {
            // 没有选择任何角色 / 武器：按“替换”路径直接写入代码持有者
            emit("importOwner", { flag: parsed.flag, id: parsed.ownerId })
        }
    }
    const imported = props.charBuild ? props.charBuild.importCode(compact, props.type) : parsed
    if (!imported) return
    applyImportedMods(imported.mods)
    if (imported.auraMod) emit("selectAuraMod", imported.auraMod)
}

/** 导出当前页签的社区代码：显式上下文优先，其次才用已接入的构筑；同律没有上下文即不可导出 */
const canExportCode = computed(() => !!props.codeOwner || !!props.charBuild)

/**
 * 复制当前页签的导入码。
 * 有显式上下文时按节点的槽位数据编码。
 */
async function handleExportCode() {
    if (props.codeOwner) {
        const slots = props.mods.map(mod => (mod ? ([mod.id, mod.等级] as [number, number]) : null))
        await copyText(encodeModCode(props.codeOwner.flag, props.codeOwner.id, slots, props.auraMod ?? 0))
        return
    }
    if (props.charBuild) await copyText(props.charBuild.getCode(props.type))
}

const aMod = computed(() => {
    return props.auraMod ? LeveledModHelper.fromId(props.auraMod) : undefined
})

/**
 * 需要极化的MOD槽位索引（半价削减耐受，含光环极化）。
 */
const polsetIndices = computed(() => props.charBuild?.getModCostTransfer(props.type) ?? [])

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
const auraPolset = computed(
    () => props.type === "角色" && !!props.charBuild && polsetIndices.value.includes(props.charBuild.getMods(props.type).length - 1)
)
</script>
<template>
    <!-- @container：槽位列数按 ModEditer 自身宽度算，嵌入节点或构筑页都不受外层容器影响 -->
    <div class="@container">
        <!-- 导入码持有者与当前选择不一致：是 = 替换选择并粘贴，否 = 保留选择只粘贴 MOD，取消 = 不粘贴 -->
        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': !!ownerConflict }">
                <div class="modal-box bg-base-300 max-w-md">
                    <h3 class="text-base font-bold">{{ t("modEditor.ownerMismatchTitle") }}</h3>
                    <p class="mt-2 text-sm leading-relaxed text-base-content/70">
                        {{
                            t("modEditor.ownerMismatchMessage", {
                                current: ownerConflict?.current,
                                incoming: ownerConflict?.incoming,
                            })
                        }}
                    </p>
                    <div class="modal-action">
                        <button type="button" class="btn btn-sm btn-ghost" @click="resolveOwnerConflict('cancel')">
                            {{ t("modEditor.ownerMismatchCancel") }}
                        </button>
                        <button type="button" class="btn btn-sm" @click="resolveOwnerConflict('keep')">
                            {{ t("modEditor.ownerMismatchNo") }}
                        </button>
                        <button type="button" class="btn btn-sm btn-primary" @click="resolveOwnerConflict('replace')">
                            {{ t("modEditor.ownerMismatchYes") }}
                        </button>
                    </div>
                </div>
                <div class="modal-backdrop" @click="resolveOwnerConflict('cancel')" />
            </dialog>
        </Teleport>
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
                <!-- 中枢（光环）槽：与其他槽位一致的卡片 + 弹窗交互，未装备时显示虚线空槽；宽度随内容自适应 -->
                <div
                    v-if="type === '角色'"
                    class="nodrag nopan flex max-w-40 shrink-0 cursor-pointer select-none items-stretch"
                    :title="$t('char-build.simple_aura')"
                    @click="auraDialogShow = true"
                >
                    <ModItem
                        variant="bar"
                        size="sm"
                        :mod="aMod ?? null"
                        :polset="auraPolset"
                        :char-build="charBuild"
                        :noremove="true"
                    />
                </div>
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
                        :class="{ 'pointer-events-none opacity-40': !canExportCode }"
                        :title="$t('char-build.export_code')"
                        @click="handleExportCode()"
                    >
                        <Icon icon="ri:file-copy-line" class="size-4" />
                    </div>
                </div>
            </div>
        </div>
        <!-- 中枢选择弹窗：与普通槽位的选 MOD 弹窗同构，卸载也在这里完成 -->
        <ModPickerDialog
            v-model:open="auraDialogShow"
            :mod-options="auraModOptions"
            :char-build="charBuild"
            slot-type="角色"
            aura-only
            :equipped-aura="auraMod"
            :mods="mods"
            :title="$t('char-build.simple_aura')"
            @select="handleSelectAuraMod($event.value)"
        />
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
