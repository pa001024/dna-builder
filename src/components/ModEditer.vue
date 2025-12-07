<script setup lang="ts">
import { ref } from "vue"
import { CharBuild } from "../data/CharBuild"
import { LeveledMod } from "../data/leveled"

interface ModOption {
    value: number
    label: string
    type: string
    elm?: string
    quality: string
    icon: string
}

interface Props {
    mods: (LeveledMod | null)[]
    modOptions: ModOption[]
    charBuild: CharBuild
    title: string
}

const props = defineProps<Props>()

// 定义组件事件
const emit = defineEmits<{
    (e: "update:mods", value: (LeveledMod | null)[]): void
    (e: "removeMod", index: number): void
    (e: "selectMod", indexAndId: [number, number]): void
    (e: "levelChange", indexAndLevel: [number, number]): void
}>()

// 本地状态
const localSelectedSlot = ref(-1)

// 方法
function handleSlotClick(index: number) {
    localSelectedSlot.value = index
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

function formatProp(prop: string, val: any): string {
    // 实现属性格式化的逻辑
    if (typeof val !== "number") return String(val)
    if (prop === "攻击范围") return String(val)
    return +(val * 100).toFixed(1) + "%"
}
</script>
<template>
    <div class="bg-base-300 rounded-xl p-4 shadow-lg mb-6">
        <div class="flex items-center gap-2 mb-3">
            <SectionMarker />
            <h3 class="text-lg font-semibold">{{ title }}</h3>
        </div>
        <div class="grid grid-cols-4 md:grid-cols-8 gap-4">
            <div
                @click="handleSlotClick(index)"
                v-for="(mod, index) in mods"
                :key="index"
                class="aspect-square bg-base-200 rounded-lg border-2 flex items-center justify-center transition-colors cursor-pointer"
                :class="[mod ? getQualityColor(mod.品质) : 'border-dashed border-gray-600', getQualityHoverBorder(mod?.品质!)]"
            >
                <div class="relative w-full h-full flex items-center justify-center">
                    <div v-if="mod" class="w-full h-full flex items-center justify-center bg-opacity-30 rounded-lg overflow-hidden">
                        <!-- 背景 -->
                        <div class="absolute inset-0 flex items-center justify-center">
                            <img :src="mod.url" :alt="mod.名称" />
                        </div>
                        <!-- MOD名称 -->
                        <div class="relative mt-auto w-full bg-black/50 z-10 text-left p-2">
                            <div class="text-base-100 text-sm font-bold mb-1">{{ mod.名称 }}</div>
                            <div class="flex justify-between">
                                <div class="text-base-300 text-xs">Lv.{{ mod.等级 }}</div>
                                <div class="text-base-300 text-xs">+{{ formatProp("", charBuild.calcIncome(mod)) }}</div>
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
                                    <div
                                        v-for="mod in props.modOptions.filter((m) => m.quality === quality)"
                                        :key="mod.value"
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
                                                <div class="text-xs">
                                                    收益: {{ formatProp("", charBuild.calcIncome(new LeveledMod(mod.value))) }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>
