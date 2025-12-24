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
    icon: string
    ser?: string
    count?: number
    bufflv?: number
    lv?: number
}

interface Props {
    mods: (LeveledMod | null)[]
    modOptions: ModOption[]
    charBuild: CharBuild
    title: string
    type: string
    auraMod?: number
}

const props = defineProps<Props>()
const inv = useInvStore()

const sortByIncome = ref(true)
const selectedProperty = ref("")
const auraModOptions = computed(() => {
    return props.modOptions.filter((option) => option.ser === "羽蛇")
})
const sortedModOptions = computed(() => {
    // 获取已装备的互斥系列名称集合和非契约者MOD名称集合
    const equippedExclusiveSeries = new Set<string>()
    const equippedExclusiveNames = new Set<string>()
    const idCount = new Map<number, number>()

    if (props.mods && Array.isArray(props.mods)) {
        props.mods.forEach((mod) => {
            if (mod) {
                // 记录互斥系列
                if (CharBuild.exclusiveSeries.includes(mod.系列)) {
                    equippedExclusiveSeries.add(mod.系列)
                }
                // 记录非契约者MOD名称（用于名称互斥）
                if (mod.系列 !== "契约者") {
                    mod.excludeNames.forEach((name) => equippedExclusiveNames.add(name))
                }
                // 记录MOD数量
                idCount.set(mod.id, (idCount.get(mod.id) || 0) + 1)
            }
        })
    }

    // 过滤选项：如果mod属于已装备的互斥系列或同名非契约者MOD，则不显示
    const filteredOptions = props.modOptions.filter((option) => {
        const mod = new LeveledMod(option.value, option.lv, option.bufflv)

        if (mod.类型 === "羽蛇") return false
        // 1. 过滤互斥系列的MOD
        if (equippedExclusiveSeries.has(mod.系列)) {
            return false
        }

        // 2. 过滤同名的非契约者MOD（名称互斥）
        if (mod.系列 !== "契约者" && mod.excludeNames.some((name) => equippedExclusiveNames.has(name))) {
            return false
        }

        // 3. 过滤已装备的MOD数量超过最大允许数量的MOD
        if ((idCount.get(mod.id) || 0) >= inv.getModCount(mod.id, mod.品质)) {
            return false
        }

        // 4. 属性筛选
        if (selectedProperty.value !== "无") {
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
        .map((option) => {
            const mod = new LeveledMod(option.value, option.lv, option.bufflv)
            const income = props.charBuild.calcIncome(mod)
            return {
                income,
                mod,
                option,
            }
        })
        .sort((a, b) => b.income - a.income)
        .map((item) => item.option)
})

// 定义组件事件
const emit = defineEmits<{
    selectAuraMod: [id: number]
    removeMod: [index: number]
    selectMod: [indexAndId: [number, number, number]]
    swapMods: [index1: number, index2: number]
    levelChange: [indexAndLevel: [number, number]]
}>()

// 本地状态
const localSelectedSlot = ref(-1)

// 方法
function handleSlotClick(index: number) {
    localSelectedSlot.value = index
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
}

function closeSelection() {
    localSelectedSlot.value = -1
}

function toggleSortByIncome() {
    sortByIncome.value = !sortByIncome.value
}

// 拖拽交换位置
function handleDrop(index: number, event: DragEvent) {
    event.preventDefault()
    const fromIndex = parseInt(event.dataTransfer?.getData("modIndex") || "")
    if (fromIndex !== index && !isNaN(fromIndex)) {
        // 直接发送交换事件给父组件处理
        emit("swapMods", fromIndex, index)
        localSelectedSlot.value = -1
    }
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
                if (result.mods[i]) emit("selectMod", [i, result.mods[i], 10])
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
</script>
<template>
    <div class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
        <div class="flex items-center gap-2 mb-3">
            <SectionMarker />
            <h3 class="text-lg font-semibold">{{ title }}</h3>
            <div class="ml-auto flex items-center gap-2">
                <ShowProps
                    v-if="aMod"
                    :props="aMod.getProperties()"
                    :title="aMod.fullName"
                    :polarity="aMod.极性"
                    :cost="aMod.耐受"
                    :type="`${aMod.类型}${aMod.属性 ? `,${aMod.属性}属性` : ''}${aMod.限定 ? `,${aMod.限定}` : ''}`"
                >
                    <Select
                        class="w-30 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                        :model-value="auraMod"
                        @update:model-value="handleSelectAuraMod($event)"
                    >
                        <SelectItem v-for="m in auraModOptions" :key="m.value" :value="m.value">
                            {{ m.quality }} - {{ m.label }}
                        </SelectItem>
                    </Select>
                </ShowProps>
                <div class="btn btn-sm btn-primary" @click="handleImportCode">导入代码</div>
                <div class="btn btn-sm btn-primary" @click="copyText(charBuild.getCode(type))">复制代码</div>
            </div>
        </div>
        <div class="grid grid-cols-4 lg:grid-cols-8 gap-4">
            <ModItem
                v-for="(mod, index) in mods"
                :key="index"
                :mod="mod"
                :income="mod ? charBuild.calcIncome(mod, true) : 0"
                :index="index"
                @click="handleSlotClick(index)"
                @removeMod="handleRemoveMod(index)"
                @drop="handleDrop(index, $event)"
                control
                :charBuild="charBuild"
                :selected="undefined"
                @lv-change="handleLevelChange(index, $event)"
            />
        </div>
        <!-- MOD选择面板 -->
        <div v-if="localSelectedSlot != -1 && !mods[localSelectedSlot]" class="mt-4 bg-base-200 rounded-lg p-3">
            <!-- 选择新MOD -->
            <div>
                <div class="flex">
                    <h4 class="text-sm font-medium mb-3 p-2">选择MOD - 槽位 {{ localSelectedSlot + 1 }}</h4>

                    <!-- 关闭按钮 -->
                    <button class="ml-auto btn btn-ghost btn-sm btn-square" @click="closeSelection">
                        <Icon bold icon="codicon:chrome-close" />
                    </button>
                </div>

                <!-- 品质筛选 -->
                <div class="tabs tabs-box">
                    <template v-for="quality in ['全部', '金', '紫', '蓝', '绿', '白']" :key="quality">
                        <input
                            type="radio"
                            :name="`mod_select_${type}`"
                            class="tab"
                            :aria-label="quality === '全部' ? '全部' : `${quality}色`"
                            :checked="quality === '全部'"
                        />
                        <div class="tab-content py-2">
                            <ScrollArea class="h-80 w-full">
                                <div class="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
                                    <ModItem
                                        v-for="mod in sortedModOptions.filter((m) => quality === '全部' || m.quality === quality)"
                                        :key="mod.value"
                                        :mod="new LeveledMod(mod.value, mod.lv, mod.bufflv)"
                                        :income="charBuild.calcIncome(new LeveledMod(mod.value, mod.lv, mod.bufflv))"
                                        @click="handleSelectMod(localSelectedSlot, mod.value, mod.lv ?? 10)"
                                        :noremove="true"
                                    />
                                </div>
                            </ScrollArea>
                        </div>
                    </template>

                    <!-- 属性筛选下拉框 -->
                    <Combobox
                        class="ml-auto w-40 mr-4"
                        v-model="selectedProperty"
                        placeholder="搜索属性/描述"
                        :options="
                            ['攻击', '生命', '防御', '护盾', '威力', '耐久', '范围', '效益', '增伤'].map((prop) => ({
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
        </div>
    </div>
</template>
