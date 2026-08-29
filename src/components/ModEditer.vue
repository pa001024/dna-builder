<script setup lang="ts">
import { t } from "i18next"
import { computed, onBeforeUnmount, type Ref, ref, shallowRef, watch } from "vue"
import { LeveledMod, LeveledModHelper } from "@/data"
import { CharBuild } from "@/data/CharBuild"
import { createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { useInvStore } from "@/store/inv"
import { copyText, pasteText } from "@/util"
import { formatModLimit } from "@/utils/mod-limit"

interface ModOption {
    value: number
    label: string
    type: string
    elm?: string
    quality: string
    ser?: string
    count?: number
    bufflv?: number
    lv?: number
}

interface Props {
    mods: (LeveledMod | null)[]
    otherMods?: (LeveledMod | null)[]
    modOptions: ModOption[]
    charBuild: CharBuild
    type: string
    auraMod?: number
    polset?: number[]
}

const props = defineProps<Props>()
const inv = useInvStore()

const sortByIncome = ref(true)
const selectedProperty = ref("")
const selectedQuality = ref("金")
const incomeMap = ref<Record<string, number>>({})
const workerRef = shallowRef<Worker>()
let workerRequestId = 0
const mod_model_show = ref(false)
// 方案兼容：第二套MOD（不参与数据计算，仅参与极性计算）
const compatMode = ref(false)
// 注意：显式标注 Ref<(LeveledMod | null)[]>，避免 Vue 的 UnwrapRef 将 LeveledMod 类映射为结构性类型
const secondMods: Ref<(LeveledMod | null)[]> = ref([])
const secondAuraMod = ref<number | undefined>(undefined)
// 当前为哪一套打开选MOD弹窗 / 拖拽（0=第一套，1=第二套）
const localSelectedSet = ref<0 | 1>(0)
const draggedSet = ref<0 | 1>(0)
const auraModOptions = computed(() => {
    const options = props.modOptions.filter(option => option.ser === "羽蛇")
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
const filteredModOptions = computed(() => {
    // 获取已装备的互斥系列名称集合和非契约者MOD名称集合
    const equippedExclusiveSeries = new Set<string>()
    const equippedExclusiveNames = new Set<string>()
    const idCount = new Map<number, number>()
    /**
     * 收集MOD集合的互斥系列/名称互斥/数量占用。
     * @param modList MOD列表
     */
    const collectExclusives = (modList: (LeveledMod | null)[] | undefined) => {
        ;(modList || []).forEach(mod => {
            if (!mod) return
            // 记录互斥系列
            if (CharBuild.exclusiveSeries.includes(mod.系列) || (mod.系列 === "囚狼" && mod.id > 100000)) {
                mod.excludeSeries.forEach(series => equippedExclusiveSeries.add(series))
            }
            // 记录非契约者MOD名称（用于名称互斥）
            if (mod.系列 !== "契约者") {
                equippedExclusiveNames.add(mod.名称)
            }
            // 记录MOD数量
            idCount.set(mod.id, (idCount.get(mod.id) || 0) + 1)
        })
    }

    // 仅收集当前正在编辑的套别的互斥信息：
    // - 第一套（A方案）：收集第一套 + otherMods；
    // - 第二套（兼容方案 B）：只收集第二套自身。两套为同一批槽位的备选方案，
    //   A方案中出现的MOD在B方案中应可用（系列/名称/数量互不限制）。
    if (localSelectedSet.value === 1) {
        collectExclusives(secondMods.value)
    } else {
        collectExclusives(props.mods)
        collectExclusives(props.otherMods)
    }

    // 过滤选项：如果mod属于已装备的互斥系列或同名非契约者MOD，则不显示
    return props.modOptions.filter(option => {
        const mod = LeveledModHelper.fromId(option.value, option.lv, option.bufflv)

        if (mod.系列 === "羽蛇") return false
        // 1. 过滤互斥系列的MOD
        if (equippedExclusiveSeries.has(mod.系列 == "囚狼" && mod.id > 100000 ? "囚狼1" : mod.系列)) {
            return false
        }

        // 2. 过滤同名的非契约者MOD（名称互斥）
        if (mod.系列 !== "契约者" && equippedExclusiveNames.has(mod.名称)) {
            return false
        }

        // 3. 过滤已装备的MOD数量超过最大允许数量的MOD
        if ((idCount.get(mod.id) || 0) >= inv.getModCount(mod.id, mod.品质)) {
            return false
        }

        // 4. 属性筛选
        if (selectedProperty.value) {
            // 获取mod的所有属性文本，包括描述、属性等
            const modText = JSON.stringify(mod)
            // 判断选择的属性是否在mod文本中
            if (!modText.includes(selectedProperty.value)) {
                return false
            }
        }

        return true
    })
})

/**
 * 获取待选魔之楔的 worker 收益键。
 * @param option 魔之楔选项
 * @returns 收益键
 */
function getModIncomeKey(option: ModOption) {
    return `mod:${option.value}:${option.lv ?? ""}:${option.bufflv ?? ""}`
}

/**
 * 获取已装备魔之楔的 worker 收益键。
 * @param index 槽位索引
 * @returns 收益键
 */
function getEquippedModIncomeKey(index: number) {
    return `equipped:${props.type}:${index}`
}

/**
 * 读取待选魔之楔收益。
 * @param option 魔之楔选项
 * @returns 收益值
 */
function getModIncome(option: ModOption) {
    return incomeMap.value[getModIncomeKey(option)] ?? 0
}

/**
 * 读取已装备魔之楔收益。
 * @param index 槽位索引
 * @returns 收益值
 */
function getEquippedModIncome(index: number) {
    return incomeMap.value[getEquippedModIncomeKey(index)] ?? 0
}

const sortedModOptions = computed(() => {
    const filteredOptions = filteredModOptions.value

    if (!sortByIncome.value) {
        return filteredOptions
    }

    // 按收益降序排序
    return filteredOptions
        .map(option => ({ income: getModIncome(option), option }))
        .sort((a, b) => b.income - a.income)
        .map(item => item.option)
})

const visibleModOptions = computed(() =>
    sortedModOptions.value.filter(option => selectedQuality.value === "全部" || option.quality === selectedQuality.value)
)

const workerModOptions = computed(() =>
    filteredModOptions.value.filter(option => selectedQuality.value === "全部" || option.quality === selectedQuality.value)
)

/**
 * 将 Vue proxy 与类实例快照转为 worker 可克隆的普通 JSON 数据。
 * @param value 原始数据
 * @returns 普通数据
 */
function cloneForWorker<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 刷新当前魔之楔收益。
 */
function refreshIncomes() {
    const worker = workerRef.value || new Worker(new URL("@/data/CharBuild.worker.ts", import.meta.url), { type: "module" })
    workerRef.value = worker
    const id = ++workerRequestId
    worker.onmessage = (event: MessageEvent<{ id: number; incomes?: Record<string, number>; error?: string }>) => {
        if (event.data.id !== workerRequestId) return
        if (event.data.error) {
            console.error("MOD收益worker计算失败", event.data.error)
            return
        }
        incomeMap.value = event.data.incomes || {}
    }
    const options = mod_model_show.value ? workerModOptions.value : []
    worker.postMessage(
        cloneForWorker({
            id,
            build: createWorkerSnapshot(props.charBuild),
            mods: options.map(option => {
                const mod = LeveledModHelper.fromId(option.value, option.lv, option.bufflv)
                return {
                    key: getModIncomeKey(option),
                    data: mod.originalModData,
                    level: mod.等级,
                    buffLv: mod.buffLv,
                    effect: mod.buff?._originalBuffData,
                }
            }),
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
}

watch(
    () => [props.charBuild, props.mods, props.type, mod_model_show.value, mod_model_show.value ? workerModOptions.value : []],
    () => refreshIncomes(),
    { immediate: true, deep: true }
)

onBeforeUnmount(() => {
    workerRef.value?.terminate()
})

// 定义组件事件
const emit = defineEmits<{
    selectAuraMod: [id: number]
    removeMod: [index: number]
    selectMod: [indexAndId: [number, number, number]]
    swapMods: [index1: number, index2: number]
    levelChange: [indexAndLevel: [number, number]]
    sync: []
    /** 从游戏同步魔之楔到方案B：父级获取游戏数据后通过回调写回本地第二套 */
    syncSecond: [apply: (mods: ([number, number] | null)[], auraMod?: number) => void]
}>()

// 本地状态
const localSelectedSlot = ref(-1)
const draggedModIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)

// 方法
/**
 * 点击MOD槽位打开选MOD弹窗。
 * @param index 槽位索引
 * @param set 套别（0=第一套，1=兼容第二套）
 */
function handleSlotClick(index: number, set: 0 | 1 = 0) {
    localSelectedSlot.value = index
    localSelectedSet.value = set
    mod_model_show.value = true
}

// 拖动开始
function handleDragStart(index: number, set: 0 | 1 = 0) {
    draggedModIndex.value = index
    draggedSet.value = set
}

// 拖动结束
function handleDragEnd(_e: MouseEvent, targetElement: Element | null) {
    if (draggedModIndex.value === null) return

    // 从目标元素向上查找包含 group 类和 data-index 属性的 ModItem
    let targetModItem = targetElement
    while (targetModItem && !targetModItem.hasAttribute("data-index")) {
        targetModItem = targetModItem.parentElement
    }

    // 如果找到了目标 ModItem，读取它的 data-index 与 data-set
    if (targetModItem) {
        const targetIndex = parseInt(targetModItem.getAttribute("data-index") || "-1")
        const targetSet = targetModItem.getAttribute("data-set") === "1" ? 1 : 0

        if (targetIndex !== -1 && draggedModIndex.value !== targetIndex) {
            const fromIndex = draggedModIndex.value
            const fromSet = draggedSet.value
            draggedModIndex.value = null
            dropTargetIndex.value = null

            if (fromSet === 1 && targetSet === 1) {
                // 第二套：本地交换
                const temp = secondMods.value[fromIndex]
                secondMods.value[fromIndex] = secondMods.value[targetIndex]
                secondMods.value[targetIndex] = temp
            } else if (fromSet === 0 && targetSet === 0) {
                // 发送交换事件
                emit("swapMods", fromIndex, targetIndex)
            }
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
 * @param set 套别（0=第一套，1=兼容第二套）
 */
function handleSelectAuraMod(id: number, set: 0 | 1 = 0) {
    if (set === 1) {
        secondAuraMod.value = id
    } else {
        emit("selectAuraMod", id)
    }
}

/**
 * 移除MOD。
 * @param index 槽位索引
 * @param set 套别
 */
function handleRemoveMod(index: number, set: 0 | 1 = 0) {
    if (set === 1) {
        secondMods.value[index] = null
    } else {
        emit("removeMod", index)
    }
}

/**
 * 修改MOD等级。
 * @param index 槽位索引
 * @param level 等级
 * @param set 套别
 */
function handleLevelChange(index: number, level: number, set: 0 | 1 = 0) {
    if (set === 1) {
        const mod = secondMods.value[index]
        if (mod) secondMods.value[index] = LeveledModHelper.fromId(mod.id, level, mod.buffLv)
    } else {
        emit("levelChange", [index, level])
    }
}

/**
 * 选MOD弹窗确认。
 * @param index 槽位索引
 * @param value MOD id
 * @param lv 等级
 */
function handleSelectMod(index: number, value: number, lv: number) {
    if (localSelectedSet.value === 1) {
        // 第二套：写入本地状态（不参与数据计算，仅参与极性计算）
        secondMods.value[index] = LeveledModHelper.fromId(value, lv, inv.getBuffLv(value))
    } else {
        emit("selectMod", [index, value, lv])
    }
    mod_model_show.value = false
}

/**
 * 切换"方案兼容"模式。
 */
function toggleCompatMode() {
    compatMode.value = !compatMode.value
    // 打开时按当前套槽位数初始化第二套（近战/远程/角色 8 槽，同律 4 槽）
    if (compatMode.value && secondMods.value.length !== props.mods.length) {
        secondMods.value = Array(props.mods.length).fill(null) as (LeveledMod | null)[]
    }
}

/**
 * 镜像：复制第一套MOD（含光环）到第二套，作为兼容方案的起点。
 */
function mirrorFirstToSecond() {
    secondMods.value = props.mods.map(mod => (mod ? mod.clone() : null))
    secondAuraMod.value = props.auraMod
}

/**
 * 同步游戏魔之楔到方案B（导入）：父级获取游戏数据后经回调写回本地第二套。
 */
function handleSyncSecond() {
    emit("syncSecond", (pairs, auraMod) => {
        secondMods.value = pairs
            .slice(0, props.mods.length)
            .map(pair => (pair ? LeveledModHelper.fromId(pair[0], pair[1], inv.getBuffLv(pair[0])) : null))
        secondAuraMod.value = auraMod
    })
}

function toggleSortByIncome() {
    sortByIncome.value = !sortByIncome.value
}

/**
 * 导入构筑代码到指定套别。
 * @param set 套别（0=第一套，1=兼容第二套）
 */
async function handleImportCode(set: 0 | 1 = 0) {
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
            if (set === 1) {
                if (i < secondMods.value.length) secondMods.value[i] = null
            } else {
                emit("removeMod", i)
            }
            continue
        }
        const lv = inv.getModLv(modId, LeveledModHelper.getQuality(modId)) ?? 10
        if (set === 1) {
            if (i < secondMods.value.length) {
                secondMods.value[i] = LeveledModHelper.fromId(modId, lv, inv.getBuffLv(modId))
            }
        } else {
            emit("selectMod", [i, modId, lv])
        }
    }
    if (result.auraMod) {
        if (set === 1) {
            secondAuraMod.value = result.auraMod
        } else {
            emit("selectAuraMod", result.auraMod)
        }
    }
}

/**
 * 导出兼容第二套的构筑代码（复用克隆构筑的 getCode 保证格式一致）。
 */
function handleExportSecondSetCode() {
    const clone = props.charBuild.clone()
    if (props.type === "角色") {
        clone.charMods = [...secondMods.value]
        clone.auraMod = secondAuraMod.value ? LeveledModHelper.fromId(secondAuraMod.value) : undefined
    } else if (props.type === "近战") {
        clone.meleeMods = [...secondMods.value]
    } else if (props.type === "远程") {
        clone.rangedMods = [...secondMods.value]
    } else if (props.type === "同律") {
        clone.skillMods = [...secondMods.value]
    }
    copyText(clone.getCode(props.type))
}

const aMod = computed(() => {
    return props.auraMod ? LeveledModHelper.fromId(props.auraMod) : undefined
})

const secondAMod = computed(() => {
    if (props.type !== "角色" || !secondAuraMod.value) return undefined
    return LeveledModHelper.fromId(secondAuraMod.value)
})

/**
 * 第二套MOD表（角色类型末尾追加光环MOD，光环可参与极化即光环极化）。
 * 仅在方案兼容模式下注入，不参与数据计算。
 */
const secondSetInjection = computed<(LeveledMod | null)[] | undefined>(() => {
    if (!compatMode.value) return undefined
    const mods = [...secondMods.value]
    if (props.type === "角色") {
        mods.push(secondAuraMod.value ? LeveledModHelper.fromId(secondAuraMod.value) : null)
    }
    return mods
})

/**
 * 共享极化方案：同一套方案（各极性极化槽数量 + 中枢极性）同时应用到两套MOD。
 * 第二套为空时返回 null（此时沿用第一套自身极化方案）。
 */
const compatPlan = computed(() => {
    if (!compatMode.value) return null
    if (!secondSetInjection.value?.some(mod => mod?.耐受)) return null
    return props.charBuild.getSharedPolarizationPlan(props.type, secondSetInjection.value)
})

/**
 * 合并两套MOD的极化槽位索引（第一套 0 起，第二套按偏移追加）。
 */
const combinedPolset = computed(() => {
    if (!compatPlan.value) return props.charBuild.getModCostTransfer(props.type)
    return [...compatPlan.value.first, ...compatPlan.value.second.map(index => setOffset.value + index)]
})

/**
 * 第一套在合并表中的长度（第二套索引偏移起点）。
 */
const setOffset = computed(() => props.charBuild.getMods(props.type).length)

/**
 * 判断第一套槽位是否需要极化。
 * @param index 第一套槽位索引
 * @returns 是否极化
 */
function isFirstSetPolset(index: number) {
    return combinedPolset.value.includes(index)
}

/**
 * 判断第二套槽位是否需要极化。
 * @param index 第二套槽位索引（0 起）
 * @returns 是否极化
 */
function isSecondSetPolset(index: number) {
    return combinedPolset.value.includes(setOffset.value + index)
}

/**
 * 判断第一套槽位是否受异极性惩罚（×1.5，显示红色）。
 * @param index 第一套槽位索引
 * @returns 是否受惩罚
 */
function isFirstSetPenalty(index: number) {
    return !!compatPlan.value?.firstPenalty.includes(index)
}

/**
 * 判断第二套槽位是否受异极性惩罚（×1.5，显示红色）。
 * @param index 第二套槽位索引（0 起）
 * @returns 是否受惩罚
 */
function isSecondSetPenalty(index: number) {
    return !!compatPlan.value?.secondPenalty.includes(index)
}

/**
 * 第一套光环槽是否受异极性惩罚。
 */
const firstAuraPenalized = computed(() => props.type === "角色" && !!compatPlan.value?.firstPenalty.includes(setOffset.value - 1))

/**
 * 第二套光环槽是否受异极性惩罚（第二套光环在 extra 中的索引为 secondMods.length）。
 */
const secondAuraPenalized = computed(() => props.type === "角色" && !!compatPlan.value?.secondPenalty.includes(secondMods.value.length))

/**
 * 第一套光环槽是否被极化（光环极化）。
 */
const firstAuraPolset = computed(() => props.type === "角色" && combinedPolset.value.includes(setOffset.value - 1))

/**
 * 第二套光环槽是否被极化（光环极化）。
 */
const secondAuraPolset = computed(() => props.type === "角色" && combinedPolset.value.includes(setOffset.value * 2 - 1))

/**
 * 两套MOD无法共存（共享极化方案无法同时满足两套），此时优先满足第一套。
 */
const compatFailed = computed(() => !!compatPlan.value && !compatPlan.value.ok)

/**
 * 方案兼容模式下第一套（A方案）的当前耐受显示。
 * 有共享方案时显示方案后耐受（cost1）；否则显示正常极化后耐受（与区块标题一致），而非原始耐受。
 */
const aTolerance = computed(() => {
    if (!compatMode.value) return null
    const cap = props.charBuild.getModCap(props.type)
    const cost = compatPlan.value ? compatPlan.value.cost1 : props.charBuild.getModCostMax(props.type)
    return { cost, cap }
})

/**
 * 第二套（B方案）自身原始耐受（不含第一套）。
 */
const bRawCost = computed(() => (secondSetInjection.value || []).reduce((sum, m) => sum + (m?.耐受 || 0), 0))

/**
 * 方案兼容模式下第二套（B方案）的当前耐受显示（共享方案后的耐受/上限；B为空时显示其自身耐受）。
 */
const bTolerance = computed(() => {
    if (!compatMode.value) return null
    const cap = props.charBuild.getModCap(props.type)
    const cost = compatPlan.value ? compatPlan.value.cost2 : bRawCost.value
    return { cost, cap }
})
</script>
<template>
    <div>
        <Teleport v-if="mod_model_show" to="body">
            <dialog class="modal" :class="{ 'modal-open': mod_model_show }">
                <div class="modal-box max-w-11/12 h-11/12 relative">
                    <!-- 选择新MOD -->
                    <SectionHeader
                        number="01"
                        kicker="MOD"
                        :title="
                            localSelectedSet === 1
                                ? `${$t('char-build.compat_scheme')} · ${$t('char-build.select_mod_slot')} ${localSelectedSlot + 1}`
                                : `${$t('char-build.select_mod_slot')} ${localSelectedSlot + 1}`
                        "
                        no-animate
                        compact
                    >
                        <template #trailing>
                            <!-- 关闭按钮 -->
                            <button class="btn btn-ghost btn-sm btn-square" @click="mod_model_show = false">
                                <Icon bold icon="codicon:chrome-close" />
                            </button>
                        </template>
                    </SectionHeader>

                    <!-- 品质筛选 -->
                    <div class="tabs tabs-box bg-transparent">
                        <template v-for="quality in ['全部', '金', '紫', '蓝', '绿', '白']" :key="quality">
                            <input
                                v-model="selectedQuality"
                                type="radio"
                                :name="`mod_select_${type}`"
                                :value="quality"
                                class="tab"
                                :aria-label="quality === '全部' ? $t('全部') : $t(quality + '色')"
                            />
                            <div v-if="selectedQuality === quality" class="tab-content py-2">
                                <ScrollArea class="h-[calc(110vh/1.2-10.5rem)] w-full">
                                    <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                                        <ModItem
                                            v-for="mod in visibleModOptions"
                                            :key="mod.value"
                                            :mod="LeveledModHelper.fromId(mod.value, mod.lv, mod.bufflv)"
                                            :income="getModIncome(mod)"
                                            :noremove="true"
                                            :char-build="charBuild"
                                            @click="handleSelectMod(localSelectedSlot, mod.value, mod.lv ?? 10)"
                                        />
                                    </div>
                                </ScrollArea>
                            </div>
                        </template>

                        <!-- 属性筛选下拉框 -->
                        <Combobox
                            v-model="selectedProperty"
                            class="ml-auto w-40 mr-4"
                            placeholder="搜索属性/描述"
                            :options="
                                ['攻击', '生命', '防御', '护盾', '威力', '耐久', '范围', '效益', '增伤'].map(prop => ({
                                    label: prop,
                                    value: prop,
                                }))
                            "
                        />
                        <button class="btn btn-sm" :class="sortByIncome ? 'btn-secondary' : 'btn-outline'" @click="toggleSortByIncome">
                            {{ sortByIncome ? "收益排序：高→低" : "默认排序" }}
                        </button>
                    </div>
                </div>
                <div class="modal-backdrop" @click="mod_model_show = false" />
            </dialog>
        </Teleport>
        <div class="flex items-center gap-2 mb-3">
            <!-- 方案兼容模式下左对齐展示当前耐受 -->
            <div v-if="aTolerance" class="flex items-center gap-1 text-xs">
                <span class="text-base-content/60">{{ $t("char-build.tolerance") }}</span>
                <span class="font-orbitron" :class="aTolerance.cost > aTolerance.cap ? 'text-error' : 'text-base-content/90'">
                    {{ aTolerance.cost }}/{{ aTolerance.cap }}
                </span>
            </div>
            <div class="ml-auto flex items-center gap-2">
                <!-- 方案兼容：输入第二套MOD，不参与数据计算，仅参与极性计算 -->
                <div
                    class="btn btn-sm border"
                    :class="compatMode ? 'btn-secondary' : 'btn-ghost border-base-content/15'"
                    :title="$t('char-build.compat_scheme_hint')"
                    @click="toggleCompatMode"
                >
                    方案兼容
                </div>
                <ShowProps
                    v-if="aMod"
                    :props="aMod.getProperties()"
                    :title="`${$t(aMod.系列)}${$t(aMod.名称)}`"
                    :polarity="aMod.极性"
                    :cost="aMod.耐受"
                    :type="`${$t(aMod.类型)}${aMod.属性 ? `,${$t(aMod.属性 + '属性')}` : ''}${aMod.限定 ? `,${$t(formatModLimit(aMod.限定))}` : ''}`"
                    :effdesc="aMod.效果"
                    :eff="charBuild?.checkModEffective(aMod, true)"
                >
                    <div class="flex items-center gap-2">
                        <img :src="aMod.url" :alt="aMod.名称" class="w-8 h-8 inline-block" />
                        <Select
                            class="w-30 input input-bordered input-sm"
                            :model-value="auraMod"
                            @update:model-value="handleSelectAuraMod($event, 0)"
                        >
                            <SelectItem v-for="m in auraModOptions" :key="m.value" :value="m.value">
                                {{ $t(m.quality + "色") }} - {{ $t(m.label) }}
                            </SelectItem>
                        </Select>
                        <!-- 光环槽：明显展示所极化的槽位类型（趋向图标）与半价/惩罚耐受 -->
                        <span
                            v-if="aMod.极性"
                            class="badge badge-sm gap-1"
                            :class="
                                firstAuraPenalized
                                    ? 'badge-error text-red-800'
                                    : firstAuraPolset
                                      ? 'badge-success text-green-800'
                                      : 'badge-soft text-base-content/80'
                            "
                        >
                            <Icon class="inline-block" :icon="`po-${aMod.极性}`" />
                            {{ firstAuraPenalized ? Math.ceil(aMod.耐受 * 1.5) : firstAuraPolset ? Math.ceil(aMod.耐受 / 2) : aMod.耐受 }}
                        </span>
                    </div>
                </ShowProps>
                <div v-if="type !== '同律'" class="btn btn-secondary btn-sm" @click="$emit('sync')">
                    {{ $t("char-build.sync_game") }}
                </div>
                <div class="btn btn-ghost btn-sm border border-base-content/15" @click="handleImportCode()">
                    {{ $t("char-build.import_code") }}
                </div>
                <div class="btn btn-ghost btn-sm border border-base-content/15" @click="copyText(charBuild.getCode(type))">
                    {{ $t("char-build.export_code") }}
                </div>
            </div>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-4">
            <ModItem
                v-for="(mod, index) in mods"
                :key="index"
                :mod="mod"
                :income="mod ? getEquippedModIncome(index) : 0"
                :index="index"
                data-set="0"
                :polset="isFirstSetPolset(index)"
                :penalized="isFirstSetPenalty(index)"
                control
                :char-build="charBuild"
                :selected="undefined"
                :class="{
                    'opacity-50': draggedModIndex === index && draggedSet === 0,
                    'border-2 border-primary': dropTargetIndex === index && draggedModIndex !== index && draggedSet === 0,
                }"
                @click="!mod && handleSlotClick(index)"
                @remove-mod="handleRemoveMod(index)"
                @drag-start="handleDragStart(index)"
                @drag-end="handleDragEnd"
                @mouseenter="draggedModIndex !== null && draggedSet === 0 && handleDragOver(index)"
                @lv-change="handleLevelChange(index, $event)"
            />
        </div>
        <!-- 方案兼容：第二套MOD（不参与数据计算，仅参与极性计算），布局与正常一致 -->
        <div v-if="compatMode" class="mt-4 rounded-xs border border-dashed border-primary/40 p-3">
            <div class="flex items-center gap-2 mb-3">
                <!-- 左对齐：当前耐受显示 -->
                <div v-if="bTolerance" class="flex items-center gap-1 text-xs">
                    <span class="text-base-content/60">{{ $t("char-build.tolerance") }}</span>
                    <span class="font-orbitron" :class="bTolerance.cost > bTolerance.cap ? 'text-error' : 'text-base-content/90'">
                        {{ bTolerance.cost }}/{{ bTolerance.cap }}
                    </span>
                </div>
                <div class="ml-auto flex items-center gap-2">
                    <!-- 镜像：复制第一套MOD到第二套（置于角色ShowProps左侧） -->
                    <div
                        class="btn btn-ghost btn-sm border border-base-content/15"
                        :title="$t('char-build.compat_scheme_mirror_hint')"
                        @click="mirrorFirstToSecond"
                    >
                        {{ $t("char-build.compat_scheme_mirror") }}
                    </div>
                    <template v-if="type === '角色'">
                        <ShowProps
                            v-if="secondAMod"
                            :props="secondAMod.getProperties()"
                            :title="`${$t(secondAMod.系列)}${$t(secondAMod.名称)}`"
                            :polarity="secondAMod.极性"
                            :cost="secondAMod.耐受"
                            :type="`${$t(secondAMod.类型)}${secondAMod.属性 ? `,${$t(secondAMod.属性 + '属性')}` : ''}${secondAMod.限定 ? `,${$t(formatModLimit(secondAMod.限定))}` : ''}`"
                            :effdesc="secondAMod.效果"
                            :eff="charBuild?.checkModEffective(secondAMod, true)"
                        >
                            <div class="flex items-center gap-2">
                                <img :src="secondAMod.url" :alt="secondAMod.名称" class="w-8 h-8 inline-block" />
                                <Select
                                    class="w-30 input input-bordered input-sm"
                                    :model-value="secondAuraMod"
                                    @update:model-value="handleSelectAuraMod($event, 1)"
                                >
                                    <SelectItem v-for="m in auraModOptions" :key="m.value" :value="m.value">
                                        {{ $t(m.quality + "色") }} - {{ $t(m.label) }}
                                    </SelectItem>
                                </Select>
                                <span
                                    v-if="secondAMod.极性"
                                    class="badge badge-sm gap-1"
                                    :class="
                                        secondAuraPenalized
                                            ? 'badge-error text-red-800'
                                            : secondAuraPolset
                                              ? 'badge-success text-green-800'
                                              : 'badge-soft text-base-content/80'
                                    "
                                >
                                    <Icon class="inline-block" :icon="`po-${secondAMod.极性}`" />
                                    {{
                                        secondAuraPenalized
                                            ? Math.ceil(secondAMod.耐受 * 1.5)
                                            : secondAuraPolset
                                              ? Math.ceil(secondAMod.耐受 / 2)
                                              : secondAMod.耐受
                                    }}
                                </span>
                            </div>
                        </ShowProps>
                        <Select
                            v-else
                            class="w-30 input input-bordered input-sm"
                            :model-value="secondAuraMod"
                            @update:model-value="handleSelectAuraMod($event, 1)"
                        >
                            <SelectItem v-for="m in auraModOptions" :key="m.value" :value="m.value">
                                {{ $t(m.quality + "色") }} - {{ $t(m.label) }}
                            </SelectItem>
                        </Select>
                    </template>
                    <!-- 同步游戏魔之楔到方案B（导入） -->
                    <div class="btn btn-secondary btn-sm" @click="handleSyncSecond">
                        {{ $t("char-build.sync_game") }}
                    </div>
                    <div class="btn btn-ghost btn-sm border border-base-content/15" @click="handleImportCode(1)">
                        {{ $t("char-build.import_code") }}
                    </div>
                    <div class="btn btn-ghost btn-sm border border-base-content/15" @click="handleExportSecondSetCode">
                        {{ $t("char-build.export_code") }}
                    </div>
                </div>
            </div>
            <!-- 共享极化方案摘要 -->
            <div v-if="compatPlan" class="mb-2 flex items-center gap-2 text-xs text-base-content/70">
                <span class="font-bold text-primary">{{ $t("char-build.compat_scheme_plan") }}</span>
                <template v-for="T in ['V', 'D', 'A', 'O'] as const" :key="T">
                    <span v-if="compatPlan.plan[T]" class="badge badge-sm badge-soft gap-1">
                        <Icon class="inline-block" :icon="`po-${T}`" />×{{ compatPlan.plan[T] }}
                    </span>
                </template>
                <span v-if="compatPlan.aura" class="badge badge-sm badge-soft gap-1">
                    <Icon class="inline-block" :icon="`po-${compatPlan.aura}`" />
                    <span class="text-base-content/50">{{ $t("char-build.compat_scheme_central") }}</span>
                </span>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-4">
                <ModItem
                    v-for="(mod, index) in secondMods"
                    :key="index"
                    :mod="mod"
                    :index="index"
                    data-set="1"
                    :polset="isSecondSetPolset(index)"
                    :penalized="isSecondSetPenalty(index)"
                    control
                    :char-build="charBuild"
                    :selected="undefined"
                    :class="{
                        'opacity-50': draggedModIndex === index && draggedSet === 1,
                        'border-2 border-primary': dropTargetIndex === index && draggedModIndex !== index && draggedSet === 1,
                    }"
                    @click="!mod && handleSlotClick(index, 1)"
                    @remove-mod="handleRemoveMod(index, 1)"
                    @drag-start="handleDragStart(index, 1)"
                    @drag-end="handleDragEnd"
                    @mouseenter="draggedModIndex !== null && draggedSet === 1 && handleDragOver(index)"
                    @lv-change="handleLevelChange(index, $event, 1)"
                />
            </div>
            <div v-if="compatFailed" class="mt-2 flex items-center gap-1 text-xs text-error">
                <Icon icon="ri:error-warning-line" class="inline-block" />
                {{ compatPlan?.reason === "aura" ? $t("char-build.compat_scheme_aura") : $t("char-build.compat_scheme_overcap") }}
            </div>
        </div>
    </div>
</template>
