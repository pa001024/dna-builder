<script setup lang="ts">
import { computed, ref } from "vue"
import { CharBuild, LeveledMod } from "@/data"
import { format100r } from "@/util"

/**
 * 根据品质返回右上角斜切楔形的背景色，用于区分稀有度。
 * @param quality 品质（金/紫/蓝/绿/白）
 * @returns 楔形背景色类名
 */
function getQualityWedgeColor(quality: string): string {
    switch (quality) {
        case "金":
            return "bg-yellow-400"
        case "紫":
            return "bg-purple-500"
        case "蓝":
            return "bg-blue-500"
        case "绿":
            return "bg-green-500"
        case "白":
            return "bg-gray-300"
        default:
            return "bg-base-content/30"
    }
}

/**
 * 根据品质返回卡片 hover 边框色（与角色列表卡片按元素强调一致，此处按稀有度）。
 * @param quality 品质（金/紫/蓝/绿/白）
 * @returns hover 边框类名
 */
function getQualityHoverBorder(quality: string): string {
    switch (quality) {
        case "金":
            return "hover:border-yellow-500/70"
        case "紫":
            return "hover:border-purple-500/70"
        case "蓝":
            return "hover:border-blue-500/70"
        case "绿":
            return "hover:border-green-500/70"
        case "白":
            return "hover:border-gray-400/70"
        default:
            return "hover:border-base-content/40"
    }
}

const props = defineProps<{
    mod: LeveledMod | null
    income?: number
    noremove?: boolean
    count?: number
    selected?: boolean
    control?: boolean
    nolv?: boolean
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
    <!-- 方形卡片：固定高度（aspect-square），底部信息半透明叠加，hover 无位移动画，避免闪烁 -->
    <div
        class="group relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-xs border bg-base-200/60 backdrop-blur-sm transition-colors duration-200"
        :class="[mod ? ['border-base-content/15', getQualityHoverBorder(mod.品质)] : 'border-dashed border-base-content/25']"
        :style="dragStyle"
        :data-index="index"
        @mousedown="handleMouseDown"
    >
        <ShowProps
            v-if="mod"
            :link="`/db/mod/${mod.id}`"
            :props="mod.getProperties()"
            :title="`${$t(mod.系列)}${$t(mod.名称)}`"
            :rarity="mod.品质"
            :polarity="mod.极性"
            :cost="mod.耐受"
            :type="`${$t(mod.类型)}${mod.属性 ? `,${$t(mod.属性 + '属性')}` : ''}${mod.限定 ? `,${$t(mod.限定)}` : ''}`"
            :effdesc="mod.效果"
            :eff="charBuild?.checkModEffective(mod) || mod.getCondition()"
        >
            <div class="relative h-full w-full overflow-hidden rounded-xs">
                <!-- MOD 图 -->
                <img class="h-full w-full object-cover" :src="mod.url" :alt="mod.名称" />
                <!-- 悬停遮罩 -->
                <div class="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/15" />
                <!-- 极性 + 耐受 -->
                <div class="pointer-events-none absolute top-2 left-2 z-10 flex items-center text-xs" :class="{ 'text-green-500': polset }">
                    <Icon v-if="mod.极性" class="inline-block" :icon="`po-${mod.极性 as 'A' | 'D' | 'V' | 'O'}`" />
                    {{ polset ? Math.ceil(mod.耐受 / 2) : mod.耐受 }}
                </div>

                <!-- 底部信息条：半透明叠加，固定高度（hover 等级控件原地覆盖，不撑高） -->
                <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-base-100/25 px-2 py-2 backdrop-blur-sm">
                    <!-- 名称 -->
                    <div class="flex items-center gap-1 text-sm leading-tight font-bold text-base-content/80">
                        <Icon v-if="selected" icon="ri:checkbox-circle-fill" class="shrink-0 text-green-500" />
                        <span class="truncate">{{ $t(mod.名称) }}</span>
                    </div>
                    <!-- 状态行：固定高度 -->
                    <div class="relative h-6 text-xs leading-8 text-base-content/80">
                        <div
                            class="absolute inset-0 flex items-center justify-between gap-1"
                            :class="
                                control && (selected || selected === undefined)
                                    ? 'transition-opacity duration-200 group-hover:opacity-0'
                                    : ''
                            "
                        >
                            <span class="truncate">
                                {{ control && selected === false && !nolv ? $t("未拥有") : `Lv.${mod.等级}` }}
                            </span>
                            <span v-if="income" class="shrink-0">{{ format100r(income, 1) }}</span>
                            <span v-if="count" class="shrink-0">×{{ count }}</span>
                        </div>
                    </div>
                </div>

                <!-- 悬停等级/数量输入：绝对定位叠加于底部，不撑高 -->
                <div
                    v-if="control && (selected || selected === undefined)"
                    class="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-0.5 bg-base-100/25 px-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                >
                    <NumberInput
                        v-if="!nolv"
                        class="scale-90"
                        :model-value="mod.等级"
                        :min="0"
                        :max="mod.maxLevel"
                        :step="1"
                        @update:model-value="emit('lvChange', $event)"
                    />
                    <NumberInput
                        v-if="count"
                        class="scale-90"
                        :model-value="count"
                        :min="1"
                        :max="8"
                        :step="1"
                        @update:model-value="emit('countChange', $event)"
                    />
                </div>
            </div>
        </ShowProps>

        <!-- 空槽位：虚线占位 -->
        <div v-else class="flex h-full w-full items-center justify-center text-base-content/40">
            <Icon icon="ri:add-line" class="h-8 w-8" />
        </div>

        <!-- 稀有度斜切楔形（右上角，颜色区分品质） -->
        <span
            v-if="mod"
            class="pointer-events-none absolute top-0 right-0 z-10 h-8 w-8 [clip-path:polygon(100%_0,100%_100%,0_0)]"
            :class="getQualityWedgeColor(mod.品质)"
            aria-hidden="true"
        />

        <!-- 删除判定区：比可视楔形更大的命中区，hover 时右上角变红，点击删除 -->
        <button
            v-if="mod && !noremove"
            type="button"
            class="group/rm absolute -top-3 -right-3 z-30 h-14 w-14 cursor-pointer"
            :title="$t('common.delete')"
            @click.stop="emit('removeMod')"
        >
            <!-- hover 时右上角变红（覆盖稀有度楔形） -->
            <span
                class="pointer-events-none absolute top-3 right-3 h-8 w-8 bg-red-500 opacity-0 transition-opacity duration-200 group-hover/rm:opacity-90 [clip-path:polygon(100%_0,100%_100%,0_0)]"
            />
            <Icon
                icon="ri:close-line"
                class="pointer-events-none absolute top-4 right-4 h-4 w-4 text-white opacity-0 transition-opacity duration-200 group-hover/rm:opacity-100"
            />
        </button>
    </div>
</template>
