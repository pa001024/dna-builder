<script setup lang="ts">
import { computed, ref } from "vue"
import { CharBuild } from "../data/CharBuild"
import { LeveledMod } from "../data/leveled"
import { copyText, format100, formatProp, pasteText } from "../util"

interface ModOption {
    value: number
    label: string
    type: string
    elm?: string
    quality: string
    icon: string
    ser?: string
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

const sortByIncome = ref(true)
const sortedModOptions = computed(() => {
    // 获取已装备的互斥系列名称集合和非契约者MOD名称集合
    const equippedExclusiveSeries = new Set<string>()
    const equippedExclusiveNames = new Set<string>()

    if (props.mods && Array.isArray(props.mods)) {
        props.mods.forEach((mod) => {
            if (mod) {
                // 记录互斥系列
                if (["百首", "狮鹫", "中庭蛇"].includes(mod.系列)) {
                    equippedExclusiveSeries.add(mod.系列)
                }
                // 记录非契约者MOD名称（用于名称互斥）
                if (mod.系列 !== "契约者") {
                    equippedExclusiveNames.add(mod.名称!)
                }
            }
        })
    }

    // 过滤选项：如果mod属于已装备的互斥系列或同名非契约者MOD，则不显示
    const filteredOptions = [...props.modOptions].filter((option) => {
        const mod = new LeveledMod(option.value)

        // 1. 过滤互斥系列的MOD
        if (equippedExclusiveSeries.has(mod.系列)) {
            return false
        }

        // 2. 过滤同名的非契约者MOD（名称互斥）
        if (mod.系列 !== "契约者" && equippedExclusiveNames.has(mod.名称)) {
            return false
        }

        return true
    })

    if (!sortByIncome.value) {
        return filteredOptions
    }

    // 按收益降序排序
    return filteredOptions
        .map((option) => {
            const mod = new LeveledMod(option.value)
            const income = props.charBuild.calcIncome(mod)
            return {
                ...option,
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
    selectMod: [indexAndId: [number, number]]
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

function handleSelectMod(index: number, value: number) {
    emit("selectMod", [index, value])
}

function closeSelection() {
    localSelectedSlot.value = -1
}

function toggleSortByIncome() {
    sortByIncome.value = !sortByIncome.value
}

// 这些方法需要从父组件传递或者在组件内部实现
// 暂时保留接口，具体实现可能需要调整
function getQualityColor(quality: string): string {
    // 实现根据品质返回颜色类名的逻辑
    switch (quality) {
        case "金":
            return "border-yellow-500"
        case "紫":
            return "border-purple-500"
        case "蓝":
            return "border-blue-500"
        case "绿":
            return "border-green-500"
        case "白":
            return "border-gray-400"
        default:
            return ""
    }
}

function getQualityHoverBorder(quality: string): string {
    // 实现根据品质返回 hover 边框颜色类名的逻辑
    switch (quality) {
        case "金":
            return "hover:border-yellow-400"
        case "紫":
            return "hover:border-purple-400"
        case "蓝":
            return "hover:border-blue-400"
        case "绿":
            return "hover:border-green-400"
        case "白":
            return "hover:border-gray-300"
        default:
            return "hover:border-gray-400"
    }
}

function getQualityLevel(quality: string): number {
    // 实现根据品质返回等级的逻辑
    switch (quality) {
        case "金":
            return 10
        case "紫":
            return 5
        case "蓝":
            return 5
        case "绿":
            return 3
        case "白":
            return 3
        default:
            return 1
    }
}

async function handleImportCode() {
    const charCode = (await pasteText()) || prompt("请输入角色或武器代码")
    if (charCode) {
        const result = props.charBuild.importCode(charCode, props.type)
        if (result) {
            for (let i = 0; i < result.mods.length; i++) {
                if (result.mods[i]) emit("selectMod", [i, result.mods[i]])
            }
            if (result.auraMod) {
                emit("selectAuraMod", result.auraMod)
            }
        }
    }
}

function handleAutoFillMaxIncome() {
    // 第一步：初始填充所有空槽位
    // 创建一个临时数组模拟当前已装备的MOD状态
    const tempMods = [...props.mods]
    // 创建一个集合记录已选择的互斥系列
    const selectedExclusiveSeries = new Set<string>()
    // 创建一个集合记录已选择的非契约者MOD名称（用于名称互斥）
    const selectedExclusiveNames = new Set<string>()
    // 创建一个集合记录用户初始选择的MOD ID，这些MOD不应该在迭代优化中被替换
    const userSelectedModSlots = new Set<number>()
    // 黑名单
    const blacklist = new Set<string>(["蛮勇", "决断·冥想(没出)", "决断·刹那(没出)", "陷阵", "不息"])

    // 记录用户初始选择的MOD ID
    props.mods.forEach((mod, i) => {
        if (mod) {
            userSelectedModSlots.add(i)
        }
    })

    // 首先检查已装备的MOD，记录已选择的互斥系列和非契约者MOD名称
    tempMods.forEach((mod) => {
        if (mod) {
            // 记录互斥系列
            if (["百首", "狮鹫", "中庭蛇"].includes(mod.系列)) {
                selectedExclusiveSeries.add(mod.系列!)
            }
            // 记录非契约者MOD名称（用于名称互斥）
            if (mod.系列 !== "契约者") {
                selectedExclusiveNames.add(mod.名称!)
            }
        }
    })

    // 复制一份所有可选MOD选项
    const allModOptions = [...props.modOptions]
    // 为每次添加重新计算收益
    const localCB = props.charBuild.clone()

    // 遍历所有槽位，为每个空槽位填充收益最高的MOD
    tempMods.forEach((mod, index) => {
        // 如果槽位已有MOD，则跳过
        if (mod !== null) return

        // 计算当前所有可选MOD的收益，并过滤掉已被排除的互斥系列MOD和同名非契约者MOD
        const availableMods = allModOptions
            .filter((option) => {
                const mod = new LeveledMod(option.value)

                // 1. 过滤互斥系列的MOD
                if (selectedExclusiveSeries.has(mod.系列)) {
                    return false
                }

                // 2. 过滤同名的非契约者MOD（名称互斥）
                if (mod.系列 !== "契约者" && selectedExclusiveNames.has(mod.名称)) {
                    return false
                }

                // 3. 过滤黑名单中的MOD
                if (blacklist.has(mod.名称)) {
                    return false
                }

                return true
            })
            .map((option) => {
                const mod = new LeveledMod(option.value)
                const income = localCB.calcIncome(mod)

                return {
                    ...option,
                    income,
                    mod,
                    option,
                }
            })

        // 如果没有可用的MOD，则跳过
        if (availableMods.length === 0) return

        // 按收益降序排序
        availableMods.sort((a, b) => b.income - a.income)

        // 选择收益最高的MOD
        const selectedMod = availableMods[0]

        // 如果选中的MOD属于互斥系列，则将其系列添加到已选择的互斥系列集合中
        if (["百首", "狮鹫", "中庭蛇"].includes(selectedMod.mod.系列)) {
            selectedExclusiveSeries.add(selectedMod.mod.系列)
        }
        // 如果是同名非契约者MOD，更新名称互斥集合
        if (selectedMod.mod.系列 !== "契约者") {
            selectedExclusiveNames.add(selectedMod.mod.名称)
        }

        // 更新临时数组和发出选择MOD事件
        tempMods[index] = selectedMod.mod
        localCB.mods.push(selectedMod.mod)
        emit("selectMod", [index, selectedMod.option.value])
    })

    // 第二步：迭代优化，通过替换MOD来获得更高的总收益
    let hasImprovement = true
    let iterations = 0
    const maxIterations = 100 // 设置最大迭代次数，避免无限循环

    while (hasImprovement && iterations < maxIterations) {
        hasImprovement = false
        iterations++

        // 计算当前所有已装备MOD的收益
        const modIncomes = tempMods
            .map((mod, index) => {
                if (!mod) return { index, income: 0, mod: null }
                // 排除用户初始选择的MOD
                if (userSelectedModSlots.has(index)) return { index, income: -1, mod: null }
                // 直接使用props.charBuild计算收益
                const income = localCB.calcIncome(mod, true)
                return { index, income, mod }
            })
            .filter((item) => item.mod !== null)

        // 如果所有MOD都是用户初始选择的，则无法优化
        if (modIncomes.length === 0) break

        // 按收益升序排序非用户选择的MOD
        modIncomes.sort((a, b) => a.income - b.income)
        const lowestIncomeMod = modIncomes[0]
        const lowestModIndex = lowestIncomeMod.index
        const removedMod = lowestIncomeMod.mod

        // 移除这个MOD并更新互斥系列集合和名称互斥集合
        const tempSelectedExclusiveSeries = new Set(selectedExclusiveSeries)
        const tempSelectedExclusiveNames = new Set(selectedExclusiveNames)

        if (["百首", "狮鹫", "中庭蛇"].includes(removedMod.系列)) {
            tempSelectedExclusiveSeries.delete(removedMod.系列)
        }
        // 如果是同名非契约者MOD，也从名称互斥集合中移除
        if (removedMod.系列 !== "契约者") {
            tempSelectedExclusiveNames.delete(removedMod.名称)
        }

        // 重新计算当前所有已装备MOD的互斥系列和非契约者MOD名称
        tempMods.forEach((mod, idx) => {
            if (idx !== lowestModIndex && mod) {
                // 重新添加互斥系列
                if (["百首", "狮鹫", "中庭蛇"].includes(mod.系列)) {
                    tempSelectedExclusiveSeries.add(mod.系列)
                }
                // 如果是非契约者MOD，重新添加到名称互斥集合
                if (mod.系列 !== "契约者") {
                    tempSelectedExclusiveNames.add(mod.名称)
                }
            }
        })

        // 计算当前所有可选MOD的收益，并过滤掉已被排除的互斥系列MOD和同名非契约者MOD
        const availableMods = allModOptions
            .filter((option) => {
                const mod = new LeveledMod(option.value)
                // 1. 过滤互斥系列的MOD
                if (tempSelectedExclusiveSeries.has(mod.系列)) {
                    return false
                }
                // 2. 过滤同名的非契约者MOD（名称互斥）
                if (mod.系列 !== "契约者" && tempSelectedExclusiveNames.has(mod.名称)) {
                    return false
                }
                // 3. 过滤黑名单中的MOD
                if (blacklist.has(mod.名称)) {
                    return false
                }

                // 4. 确保不是当前已装备的其他MOD
                return !tempMods.some((m, idx) => idx !== lowestModIndex && m && m.id === mod.id)
            })
            .map((option) => {
                const mod = new LeveledMod(option.value)
                const income = localCB.calcIncome(mod)

                return {
                    ...option,
                    income,
                    mod,
                    option,
                }
            })

        // 如果没有可用的MOD，则跳过
        if (availableMods.length === 0) continue

        // 按收益降序排序
        availableMods.sort((a, b) => b.income - a.income)

        // 选择收益最高的MOD
        const selectedMod = availableMods[0]

        // 如果新MOD的收益比移除的MOD高，且不是同一个MOD，则替换
        if (selectedMod.income > lowestIncomeMod.income && (!removedMod || selectedMod.mod.id !== removedMod.id)) {
            // 计算替换后的总收益是否提高
            const currentTotalIncome = modIncomes.reduce((sum, item) => sum + item.income, 0)
            const newTotalIncome = currentTotalIncome - lowestIncomeMod.income + selectedMod.income

            if (newTotalIncome > currentTotalIncome) {
                // 替换MOD
                tempMods[lowestModIndex] = selectedMod.mod
                localCB.mods[localCB.mods.findIndex((m) => m.id === removedMod.id)] = selectedMod.mod
                emit("selectMod", [lowestModIndex, selectedMod.option.value])

                // 更新互斥系列集合和名称互斥集合
                selectedExclusiveSeries.clear()
                selectedExclusiveNames.clear()
                tempMods.forEach((mod) => {
                    if (mod && ["百首", "狮鹫", "中庭蛇"].includes(mod.系列)) {
                        selectedExclusiveSeries.add(mod.系列)
                    }
                    // 如果是非契约者MOD，更新名称互斥集合
                    if (mod && mod.系列 !== "契约者") {
                        selectedExclusiveNames.add(mod.名称)
                    }
                })

                hasImprovement = true
            }
        }
    }
}
</script>
<template>
    <div class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
        <div class="flex items-center gap-2 mb-3">
            <SectionMarker />
            <h3 class="text-lg font-semibold">{{ title }}</h3>
            <div class="ml-auto flex items-center gap-2">
                <Select
                    v-if="type === '角色'"
                    class="w-30 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                    :model-value="auraMod"
                    @update:model-value="handleSelectAuraMod($event as any)"
                >
                    <SelectItem v-for="m in sortedModOptions.filter((item) => item.ser === '羽蛇')" :key="m.value" :value="m.value">
                        {{ m.label }}
                    </SelectItem>
                </Select>
                <div class="btn btn-sm btn-primary" @click="handleAutoFillMaxIncome">自动填充</div>
                <div class="btn btn-sm btn-primary" @click="handleImportCode">导入代码</div>
                <div class="btn btn-sm btn-primary" @click="copyText(charBuild.getCode(type))">复制代码</div>
            </div>
        </div>
        <div class="grid grid-cols-4 lg:grid-cols-8 gap-4">
            <div
                v-for="(mod, index) in mods"
                :key="index"
                @click="handleSlotClick(index)"
                class="aspect-square bg-base-200 rounded-lg border-2 flex items-center justify-center transition-colors cursor-pointer"
                :class="[mod ? getQualityColor(mod.品质) : 'border-dashed border-gray-600', getQualityHoverBorder(mod?.品质!)]"
            >
                <div class="relative w-full h-full flex items-center justify-center">
                    <ShowProps v-if="mod" :props="mods[index]!.getProperties()">
                        <div class="w-full h-full flex items-center justify-center bg-opacity-30 rounded-lg overflow-hidden">
                            <!-- 背景 -->
                            <div class="absolute inset-0 flex items-center justify-center">
                                <img :src="mod.url" :alt="mod.名称" />
                            </div>
                            <!-- MOD名称 -->
                            <div class="relative mt-auto w-full bg-black/50 z-10 text-left p-2">
                                <div class="text-base-100 text-sm font-bold mb-1">{{ mod.名称 }}</div>
                                <div class="flex justify-between">
                                    <div class="text-base-300 text-xs">Lv.{{ mod.等级 }}</div>
                                    <div class="text-base-300 text-xs">{{ formatProp("", charBuild.calcIncome(mod)) }}</div>
                                </div>
                            </div>
                            <!-- 关闭按钮 -->
                            <button
                                @click.stop="handleRemoveMod(index)"
                                class="absolute cursor-pointer -top-2 -right-2 w-5 h-5 bg-red-400 bg-opacity-50 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                            >
                                <span class="text-white text-xs">×</span>
                            </button>
                        </div>
                    </ShowProps>
                    <div v-else class="text-gray-500">+</div>
                </div>
            </div>
        </div>
        <!-- MOD选择面板 -->
        <div v-if="localSelectedSlot != -1" class="mt-4 bg-base-200 rounded-lg p-3">
            <!-- MOD信息 -->
            <div v-if="mods[localSelectedSlot]">
                <div class="flex">
                    <h4 class="text-sm font-medium mb-3 p-2">已选择的 MOD - 槽位 {{ localSelectedSlot + 1 }}</h4>

                    <!-- 关闭按钮 -->
                    <button class="ml-auto btn btn-ghost btn-sm btn-square" @click="closeSelection">
                        <Icon bold icon="codicon:chrome-close" />
                    </button>
                </div>
                <!-- MOD详细信息 -->
                <div class="flex flex-col gap-2">
                    <div class="text-sm font-medium p-2 bg-primary/10 border border-primary/30 rounded-lg flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full bg-primary"></div>
                        {{ mods[localSelectedSlot]!.名称 }}
                    </div>
                    <div class="text-sm font-medium p-2 flex items-center gap-2">
                        <span>等级:</span>
                        <NumberInput
                            :model-value="mods[localSelectedSlot]!.等级"
                            @update:model-value="handleLevelChange(localSelectedSlot, $event)"
                            :min="1"
                            :max="10"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div
                            v-for="(val, prop) in mods[localSelectedSlot]!.getProperties()"
                            :key="prop"
                            class="text-sm p-2 bg-base-100/50 border border-base-200 rounded-lg"
                        >
                            <div class="text-xs text-neutral-500 mb-1">{{ prop }}</div>
                            <div class="font-medium text-primary">{{ formatProp(prop, val) }}</div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- 选择新MOD -->
            <div v-else>
                <div class="flex">
                    <h4 class="text-sm font-medium mb-3 p-2">选择MOD - 槽位 {{ localSelectedSlot + 1 }}</h4>

                    <!-- 关闭按钮 -->
                    <button class="ml-auto btn btn-ghost btn-sm btn-square" @click="closeSelection">
                        <Icon bold icon="codicon:chrome-close" />
                    </button>
                </div>

                <!-- 品质筛选 -->
                <div class="tabs tabs-box">
                    <template v-for="quality in '金紫蓝绿白'" :key="quality">
                        <input type="radio" name="mod_select" class="tab" :aria-label="`${quality}色`" :checked="quality === '金'" />
                        <div class="tab-content py-2">
                            <ScrollArea class="h-80 w-full">
                                <div class="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
                                    <ShowProps
                                        v-for="mod in sortedModOptions.filter((m) => m.quality === quality)"
                                        :key="mod.value"
                                        :props="new LeveledMod(mod.value).getProperties()"
                                    >
                                        <div
                                            class="border aspect-square rounded-md cursor-pointer transition-colors relative flex overflow-hidden"
                                            :class="[getQualityColor(mod.quality), getQualityHoverBorder(mod.quality)]"
                                            @click="handleSelectMod(localSelectedSlot, mod.value)"
                                        >
                                            <!-- MOD背景图 -->
                                            <div class="absolute inset-0 opacity-50 rounded-md">
                                                <img :src="mod.icon" alt="MOD背景" class="w-full h-full object-cover rounded-md" />
                                            </div>

                                            <!-- MOD内容 -->
                                            <div class="relative p-3 z-10 mt-auto w-full bg-black/50 text-left text-base-100">
                                                <div class="text-sm font-medium truncate mb-1">{{ mod.label }}</div>
                                                <div class="flex items-center justify-between">
                                                    <div class="text-xs">Lv.{{ getQualityLevel(mod.quality) }}</div>
                                                </div>
                                                <div class="flex items-center justify-between">
                                                    <div class="text-xs">收益: {{ format100(charBuild.calcIncome(new LeveledMod(mod.value))) }}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </ShowProps>
                                </div>
                            </ScrollArea>
                        </div>
                    </template>

                    <button class="ml-auto btn btn-sm" :class="sortByIncome ? 'btn-secondary' : 'btn-outline'" @click="toggleSortByIncome">
                        {{ sortByIncome ? "收益排序：高→低" : "默认排序" }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
