<script setup lang="ts">
import { computed, ref } from "vue"
import { CharBuild } from "../data/CharBuild"
import { LeveledMod } from "../data/leveled"
import { copyText, pasteText } from "../util"
import { useInvStore } from "../store/inv"
import { t } from "i18next"

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
const auraModOptions = computed(() => {
    return props.modOptions.filter(option => option.ser === "羽蛇")
})
const sortedModOptions = computed(() => {
    // 获取已装备的互斥系列名称集合和非契约者MOD名称集合
    const equippedExclusiveSeries = new Set<string>()
    const equippedExclusiveNames = new Set<string>()
    const idCount = new Map<number, number>()

    if (props.mods && Array.isArray(props.mods)) {
        props.mods.forEach(mod => {
            if (mod) {
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
            }
        })
    }

    if (props.otherMods && Array.isArray(props.otherMods)) {
        props.otherMods.forEach(mod => {
            if (mod) {
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
            }
        })
    }

    // 过滤选项：如果mod属于已装备的互斥系列或同名非契约者MOD，则不显示
    const filteredOptions = props.modOptions.filter(option => {
        const mod = new LeveledMod(option.value, option.lv, option.bufflv)

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

    if (!sortByIncome.value) {
        return filteredOptions
    }

    // 按收益降序排序
    return filteredOptions
        .map(option => {
            const mod = new LeveledMod(option.value, option.lv, option.bufflv)
            const income = props.charBuild.calcIncome(mod)
            return {
                income,
                mod,
                option,
            }
        })
        .sort((a, b) => b.income - a.income)
        .map(item => item.option)
})

// 定义组件事件
const emit = defineEmits<{
    selectAuraMod: [id: number]
    removeMod: [index: number]
    selectMod: [indexAndId: [number, number, number]]
    swapMods: [index1: number, index2: number]
    levelChange: [indexAndLevel: [number, number]]
    sync: []
}>()

// 本地状态
const localSelectedSlot = ref(-1)
const draggedModIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)

// 方法
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

function handleSelectAuraMod(id: number) {
    emit("selectAuraMod", id)
}

function handleRemoveMod(index: number) {
    emit("removeMod", index)
}

function handleLevelChange(index: number, level: number) {
    emit("levelChange", [index, level])
}

function handleSelectMod(index: number, value: number, lv: number) {
    emit("selectMod", [index, value, lv])
    mod_model_show.value = false
}

function toggleSortByIncome() {
    sortByIncome.value = !sortByIncome.value
}

async function handleImportCode() {
    let charCode = ""
    try {
        charCode = (await pasteText()) || ""
    } catch (error) {
        charCode = prompt(t("modEditor.inputCode")) || ""
        console.error("导入代码失败:", error)
    }
    if (charCode) {
        const result = props.charBuild.importCode(charCode, props.type)
        if (result) {
            for (let i = 0; i < result.mods.length; i++) {
                if (result.mods[i]) {
                    emit("selectMod", [i, result.mods[i], inv.getModLv(result.mods[i], LeveledMod.getQuality(result.mods[i])) ?? 10])
                } else {
                    emit("removeMod", i)
                }
            }
            if (result.auraMod) {
                emit("selectAuraMod", result.auraMod)
            }
        }
    }
}

const aMod = computed(() => {
    return props.auraMod ? new LeveledMod(props.auraMod) : undefined
})
const mod_model_show = ref(false)
</script>
<template>
    <div>
        <Teleport v-if="mod_model_show" to="body">
            <dialog class="modal" :class="{ 'modal-open': mod_model_show }">
                <div class="modal-box max-w-11/12 h-11/12 relative">
                    <!-- 选择新MOD -->
                    <div class="flex">
                        <h4 class="text-sm font-medium mb-3 p-2">{{ $t("char-build.select_mod_slot") }} {{ localSelectedSlot + 1 }}</h4>

                        <!-- 关闭按钮 -->
                        <button class="ml-auto btn btn-ghost btn-sm btn-square" @click="mod_model_show = false">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </div>

                    <!-- 品质筛选 -->
                    <div class="tabs tabs-box bg-transparent">
                        <template v-for="quality in ['全部', '金', '紫', '蓝', '绿', '白']" :key="quality">
                            <input
                                type="radio"
                                :name="`mod_select_${type}`"
                                class="tab"
                                :aria-label="quality === '全部' ? $t('全部') : $t(quality + '色')"
                                :checked="quality === '全部'"
                            />
                            <div class="tab-content py-2">
                                <ScrollArea class="h-[calc(110vh/1.2-10.5rem)] w-full">
                                    <div class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
                                        <ModItem
                                            v-for="mod in sortedModOptions.filter(m => quality === '全部' || m.quality === quality)"
                                            :key="mod.value"
                                            :mod="new LeveledMod(mod.value, mod.lv, mod.bufflv)"
                                            :income="charBuild.calcIncome(new LeveledMod(mod.value, mod.lv, mod.bufflv))"
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
            <div class="ml-auto flex items-center gap-2">
                <ShowProps
                    v-if="aMod"
                    :props="aMod.getProperties()"
                    :title="`${$t(aMod.系列)}${$t(aMod.名称)}`"
                    :polarity="aMod.极性"
                    :cost="aMod.耐受"
                    :type="`${$t(aMod.类型)}${aMod.属性 ? `,${$t(aMod.属性 + '属性')}` : ''}${aMod.限定 ? `,${$t(aMod.限定)}` : ''}`"
                    :effdesc="aMod.效果"
                    :eff="charBuild?.checkModEffective(aMod, true)"
                >
                    <div class="flex">
                        <img :src="aMod.url" :alt="aMod.名称" class="w-8 h-8 inline-block" />
                        <Select
                            class="w-30 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                            :model-value="auraMod"
                            @update:model-value="handleSelectAuraMod($event)"
                        >
                            <SelectItem v-for="m in auraModOptions" :key="m.value" :value="m.value">
                                {{ $t(m.quality + "色") }} - {{ $t(m.label) }}
                            </SelectItem>
                        </Select>
                    </div>
                </ShowProps>
                <div v-if="type !== '同律'" class="btn btn-sm btn-primary" @click="$emit('sync')">
                    {{ $t("char-build.sync_game") }}
                </div>
                <div class="btn btn-sm btn-primary" @click="handleImportCode">
                    {{ $t("char-build.import_code") }}
                </div>
                <div class="btn btn-sm btn-primary" @click="copyText(charBuild.getCode(type))">
                    {{ $t("char-build.export_code") }}
                </div>
            </div>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-4">
            <ModItem
                v-for="(mod, index) in mods"
                :key="index"
                :mod="mod"
                :income="mod ? charBuild.calcIncome(mod, true) : 0"
                :index="index"
                :polset="polset?.includes(index)"
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
    </div>
</template>
