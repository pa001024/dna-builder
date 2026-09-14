<script setup lang="ts">
import { computed, ref } from "vue"
import type { CharBuild } from "@/data"
import { getTraitProperties, type PetTrait } from "@/data/petTrait"
import { format100r } from "@/util"

/**
 * 魔灵潜质槽位卡片——扁平行式布局（左图标 / 中名称与效果 / 右收益），交互与魔之楔槽位一致：
 * 点击槽位打开挑选器（已装备即「更换」）、按住拖到其它槽位互换、右侧按钮移除。
 * 差异仅在数据来源（魔灵潜质而非魔之楔）与展示字段。
 */

/**
 * 按稀有度返回左侧强调色（r3/r4/r5 对应 蓝/紫/金）。
 * @param rarity 稀有度 3/4/5
 * @returns 左侧描边类名
 */
function getRarityAccent(rarity: number): string {
    switch (rarity) {
        case 5:
            return "border-l-yellow-400"
        case 4:
            return "border-l-purple-500"
        case 3:
            return "border-l-blue-500"
        default:
            return "border-l-base-content/30"
    }
}

/**
 * 按稀有度返回卡片 hover 边框色（与魔之楔卡片按品质强调一致）。
 * @param rarity 稀有度 3/4/5
 * @returns hover 边框类名
 */
function getRarityHoverBorder(rarity: number): string {
    switch (rarity) {
        case 5:
            return "hover:border-yellow-500/70"
        case 4:
            return "hover:border-purple-500/70"
        case 3:
            return "hover:border-blue-500/70"
        default:
            return "hover:border-base-content/40"
    }
}

/**
 * 稀有度对应的品质名（供 ShowProps 的稀有度标签使用）。
 * @param rarity 稀有度 3/4/5
 * @returns 品质名（蓝/紫/金）
 */
function rarityQuality(rarity: number): string {
    return { 5: "金", 4: "紫", 3: "蓝" }[rarity] ?? ""
}

const props = defineProps<{
    /** 槽位上的潜质档位（null 表示空槽） */
    trait: PetTrait | null
    /** 槽位索引，拖拽互换时由父级据此定位 */
    index?: number
    /** 该槽位的边际收益（已装备槽位）或候选收益（挑选器中） */
    income?: number
    /** 挑选器卡片：不显示移除按钮 */
    noremove?: boolean
    charBuild?: CharBuild
}>()

const emit = defineEmits<{
    /** 点击槽位（父级据此打开挑选器，已装备槽位即「更换」） */
    select: []
    removeTrait: []
    dragStart: [event: MouseEvent, index: number]
    dragEnd: [event: MouseEvent, targetElement: Element | null]
}>()

/** 潜质 BUFF 的属性数值（无属性潜质为空对象） */
const properties = computed<Record<string, number>>(() => (props.trait ? getTraitProperties(props.trait) : {}))

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

/**
 * 鼠标按下开始拖动（空槽与按下交互元素时不启动）。
 * @param event 鼠标按下事件
 */
function handleMouseDown(event: MouseEvent) {
    // 没有潜质或没有槽位索引时不开始拖动（挑选器卡片、空槽位只响应点击）
    if (!props.trait || props.index === undefined) return

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

/**
 * 拖动跟随鼠标移动。
 * @param event 鼠标移动事件
 */
function handleMouseMove(event: MouseEvent) {
    if (!isDragging.value) return

    // 计算新位置 - 使用拖动开始时记录的初始位置
    dragPosition.value = {
        x: event.clientX - dragOffset.value.x - dragStartRect.value.left,
        y: event.clientY - dragOffset.value.y - dragStartRect.value.top,
    }
}

/**
 * 松开鼠标结束拖动，并把落点元素交给父级判定互换目标。
 * @param event 鼠标松开事件
 */
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
    <!-- 扁平行：左图标 / 中名称与效果 / 右收益；左侧色条标稀有度 -->
    <div
        class="group relative flex w-full cursor-pointer items-center gap-2 rounded-xs border border-l-2 border-base-content/15 bg-base-200/60 px-2 py-1.5 backdrop-blur-sm transition-colors duration-200"
        :class="[trait ? getRarityHoverBorder(trait.r) : 'border-dashed border-base-content/25', trait ? getRarityAccent(trait.r) : '']"
        :style="dragStyle"
        :data-index="index"
        @mousedown="handleMouseDown"
        @click="emit('select')"
    >
        <ShowProps
            v-if="trait"
            :link="`/db/pet?id=${trait.id}&tp=999`"
            :props="properties"
            :title="trait.buffName ? `${$t(trait.name)} Lv.${trait.level}` : $t(trait.name)"
            :rarity="rarityQuality(trait.r)"
            :desc="trait.desc"
        >
            <div class="flex min-w-0 flex-1 items-center gap-2">
                <img class="size-8 shrink-0 rounded-xs object-cover" :src="trait.url" :alt="trait.name" />
                <div class="flex min-w-0 flex-col">
                    <div class="flex items-center gap-1">
                        <span class="truncate text-sm leading-tight font-semibold text-base-content/85">{{ $t(trait.name) }}</span>
                        <span v-if="trait.buffName" class="shrink-0 text-[10px] tabular-nums text-base-content/45">
                            Lv.{{ trait.level }}
                        </span>
                    </div>
                    <div class="truncate text-[11px] leading-tight text-base-content/55">{{ trait.desc }}</div>
                </div>
            </div>
        </ShowProps>

        <!-- 空槽位：虚线占位 + 提示文案 -->
        <div v-else class="flex min-w-0 flex-1 items-center gap-2 text-base-content/40">
            <span class="grid size-8 shrink-0 place-items-center rounded-xs border border-dashed border-base-content/25">
                <Icon icon="ri:add-line" class="size-4" />
            </span>
            <span class="truncate text-xs">{{ $t("char-build.traits_empty_slot") }}</span>
        </div>

        <!-- 收益：与魔之楔槽位一致，靠右对齐 -->
        <span v-if="trait && income" class="shrink-0 font-orbitron text-xs tabular-nums text-base-content/80">
            {{ format100r(income, 1) }}
        </span>

        <!-- 移除按钮：命中区略大于可视范围，hover 变红 -->
        <button
            v-if="trait && !noremove"
            type="button"
            class="group/rm relative size-6 shrink-0 cursor-pointer rounded-xs text-base-content/35 transition-colors duration-150 hover:text-red-500"
            :title="$t('common.delete')"
            @click.stop="emit('removeTrait')"
        >
            <Icon icon="ri:close-line" class="absolute inset-0 m-auto size-4 group-hover/rm:text-red-500" />
        </button>
    </div>
</template>
