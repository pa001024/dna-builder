<script setup lang="ts">
import { computed, ref } from "vue"
import { CharBuild, LeveledMod } from "../data"
import { format100r } from "../util"

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

const props = defineProps<{
    mod: LeveledMod | null
    income?: number
    noremove?: boolean
    count?: number
    selected?: boolean
    control?: boolean
    charBuild?: CharBuild
    index?: number
    polset?: boolean
}>()

const emit = defineEmits<{
    removeMod: []
    lvChange: [number]
    countChange: [number]
    dragStart: [event: MouseEvent, index: number]
    dragEnd: [event: MouseEvent, targetElement: Element | null]
}>()

// 拖动状态
const isDragging = ref(false)
const dragPosition = ref({ x: 0, y: 0 })
const dragOffset = ref({ x: 0, y: 0 })
const dragStartRect = ref({ left: 0, top: 0 })
const dragStartElement = ref<HTMLElement | null>(null)

// 计算拖动时的样式
const dragStyle = computed(() => {
    if (!isDragging.value) return {}
    return {
        transform: `translate(${dragPosition.value.x}px, ${dragPosition.value.y}px)`,
        zIndex: 1000,
        opacity: 0.8,
        cursor: "grabbing",
    }
})

// 鼠标按下开始拖动
function handleMouseDown(event: MouseEvent) {
    // 如果没有 mod 或者没有 index,不开始拖动
    if (!props.mod || props.index === undefined) return

    // 检查点击的目标是否是交互元素
    const target = event.target as HTMLElement
    if (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.closest("button") || target.closest("input")) {
        return
    }

    event.preventDefault()
    isDragging.value = true

    // 保存拖动开始的元素引用
    dragStartElement.value = event.currentTarget as HTMLElement

    // 记录元素的初始位置
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    dragStartRect.value = {
        left: rect.left,
        top: rect.top,
    }

    // 记录鼠标在元素内的偏移
    dragOffset.value = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    }

    // 初始位置为0
    dragPosition.value = { x: 0, y: 0 }

    // 触发拖动开始事件
    emit("dragStart", event, props.index)

    // 添加全局鼠标事件监听
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
}

// 鼠标移动
function handleMouseMove(event: MouseEvent) {
    if (!isDragging.value) return

    // 计算新位置 - 使用拖动开始时记录的初始位置
    dragPosition.value = {
        x: event.clientX - dragOffset.value.x - dragStartRect.value.left,
        y: event.clientY - dragOffset.value.y - dragStartRect.value.top,
    }
}

// 鼠标松开
function handleMouseUp(event: MouseEvent) {
    if (!isDragging.value) return

    isDragging.value = false

    // 临时隐藏拖动元素，以便检测下方的元素
    if (dragStartElement.value) {
        dragStartElement.value.style.pointerEvents = "none"
    }

    // 使用 elementFromPoint 检测鼠标位置下方的元素
    const element = document.elementFromPoint(event.clientX, event.clientY)

    // 恢复拖动元素的可见性
    if (dragStartElement.value) {
        dragStartElement.value.style.pointerEvents = ""
    }

    // 重置拖动状态
    dragPosition.value = { x: 0, y: 0 }

    // 触发拖动结束事件，传递目标元素
    emit("dragEnd", event, element)

    // 清除拖动开始元素引用
    dragStartElement.value = null

    // 移除全局事件监听
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
}
</script>
<template>
    <div
        class="aspect-square bg-base-200 rounded-lg border-2 flex items-center justify-center transition-colors cursor-pointer group"
        :class="[mod ? getQualityColor(mod.品质) : 'border-dashed border-gray-600', getQualityHoverBorder(mod?.品质!)]"
        :style="dragStyle"
        :data-index="index"
        @mousedown="handleMouseDown"
    >
        <div class="relative w-full h-full flex items-center justify-center">
            <ShowProps
                v-if="mod"
                :props="mod.getProperties()"
                :title="`${$t(mod.系列)}${$t(mod.名称)}`"
                :rarity="mod.品质"
                :polarity="mod.极性"
                :cost="mod.耐受"
                :type="`${$t(mod.类型)}${mod.属性 ? `,${$t(mod.属性 + '属性')}` : ''}${mod.限定 ? `,${$t(mod.限定)}` : ''}`"
                :effdesc="mod.效果"
                :eff="charBuild?.checkModEffective(mod) || mod.getCondition()"
            >
                <div class="w-full h-full flex items-center justify-center bg-opacity-30 rounded-lg overflow-hidden">
                    <!-- 背景 -->
                    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <img class="object-cover w-full h-full" :src="mod.url" :alt="mod.名称" />
                    </div>
                    <div class="absolute top-2 left-2 text-xs pointer-events-none flex items-center" :class="{ 'text-green-500': polset }">
                        <Icon v-if="mod.极性" class="inline-block" :icon="`po-${mod.极性 as 'A' | 'D' | 'V' | 'O'}`" />
                        {{ polset ? Math.ceil(mod.耐受 / 2) : mod.耐受 }}
                    </div>
                    <!-- MOD名称 -->
                    <div class="relative mt-auto w-full bg-base-content/30 z-10 text-left p-2">
                        <div class="text-base-100 text-sm font-bold mb-1 flex items-center">
                            <Icon v-if="selected" icon="ri:checkbox-circle-fill" class="inline-block mr-1 text-green-500" />
                            {{ $t(mod.名称) }}
                        </div>
                        <div class="relative">
                            <div
                                v-if="control && (selected || selected === undefined)"
                                class="text-base-300 text-xs pb-4"
                                :class="[count ? 'group-hover:pb-16' : 'group-hover:pb-8']"
                            >
                                <NumberInput
                                    class="absolute w-full max-h-0 group-hover:max-h-20"
                                    :model-value="mod.等级"
                                    :min="0"
                                    :max="mod.maxLevel"
                                    :step="1"
                                    @update:model-value="emit('lvChange', $event)"
                                />
                                <NumberInput
                                    v-if="count"
                                    class="absolute mt-8 w-full max-h-0 group-hover:max-h-20"
                                    :model-value="count"
                                    :min="1"
                                    :max="8"
                                    :step="1"
                                    @update:model-value="emit('countChange', $event)"
                                />
                                <div class="absolute w-full flex justify-between max-h-20 overflow-hidden group-hover:max-h-0">
                                    <div class="text-base-300 text-xs">Lv.{{ mod.等级 }}</div>
                                    <div v-if="income" class="text-base-300 text-xs">
                                        {{ format100r(income, 1) }}
                                    </div>
                                    <div v-if="count" class="text-base-300 text-xs">x {{ count }}</div>
                                </div>
                            </div>
                            <div v-else class="flex justify-between">
                                <div class="text-base-300 text-xs">
                                    {{ control && selected !== undefined ? $t("未拥有") : `Lv.${mod.等级}` }}
                                </div>
                                <div v-if="income" class="text-base-300 text-xs">
                                    {{ format100r(income, 1) }}
                                </div>
                                <div v-if="count" class="text-base-300 text-xs">x{{ count }}</div>
                            </div>
                        </div>
                    </div>
                    <!-- 删除按钮 -->
                    <button
                        v-if="!noremove"
                        class="absolute cursor-pointer -top-2 -right-2 w-5 h-5 bg-red-400 bg-opacity-50 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                        @click.stop="emit('removeMod')"
                    >
                        <span class="text-white text-xs">×</span>
                    </button>
                </div>
            </ShowProps>
            <div v-else class="text-gray-500">+</div>
        </div>
    </div>
</template>
