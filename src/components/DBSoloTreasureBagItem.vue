<script lang="ts" setup>
import { computed } from "vue"
import type { ExtractionTreasureBag } from "@/data/d/solotreasure.data"

const props = defineProps<{
    bag: ExtractionTreasureBag
}>()

type BagItem = {
    height: number
    width: number
}

type BagPlacement = BagItem & {
    left: number
    top: number
}

type BagRow = {
    heightCells: number
    items: BagItem[]
    widthCells: number
}

type BagLayout = {
    height: number
    placements: BagPlacement[]
    width: number
}

const BAG_CELL_PX = 28
const BAG_ITEM_GAP_PX = 6
const BAG_ROW_GAP_PX = 6

const layout = computed(() => buildLayout(props.bag.shape))

/**
 * 按最大宽度换行，行内按输入顺序紧密排列，并让每一行在固定宽度内居中。
 * @param shape 背包形状数组。
 * @returns 布局结果。
 */
function buildLayout(shape: number[][]): BagLayout {
    const items = shape
        .map(([width, height]) => ({
            height: Math.max(1, height || 0),
            width: Math.max(1, width || 0),
        }))
        .filter(item => item.width > 0 && item.height > 0)

    if (!items.length) {
        return {
            height: 0,
            placements: [],
            width: 0,
        }
    }

    const maxRowWidth = Math.max(...items.map(item => item.width))
    const rows: BagRow[] = []
    let currentRow: BagRow | null = null

    /**
     * 结算当前行。
     */
    function flushRow(): void {
        if (!currentRow || !currentRow.items.length) {
            return
        }

        rows.push(currentRow)
        currentRow = null
    }

    items.forEach(item => {
        if (!currentRow) {
            currentRow = {
                heightCells: item.height,
                items: [item],
                widthCells: item.width,
            }
            return
        }

        const nextWidth = currentRow.widthCells + item.width
        if (nextWidth > maxRowWidth) {
            flushRow()
        }

        if (!currentRow) {
            currentRow = {
                heightCells: item.height,
                items: [item],
                widthCells: item.width,
            }
            return
        }

        currentRow.items.push(item)
        currentRow.widthCells += item.width
        currentRow.heightCells = Math.max(currentRow.heightCells, item.height)
    })

    flushRow()

    const width = Math.max(...rows.map(row => row.widthCells * BAG_CELL_PX + Math.max(0, row.items.length - 1) * BAG_ITEM_GAP_PX))
    const placements: BagPlacement[] = []
    let cursorTop = 0

    rows.forEach(row => {
        const rowWidthPx = row.widthCells * BAG_CELL_PX + Math.max(0, row.items.length - 1) * BAG_ITEM_GAP_PX
        const rowLeft = (width - rowWidthPx) / 2
        let cursorLeft = rowLeft

        row.items.forEach(item => {
            placements.push({
                height: item.height,
                left: cursorLeft,
                top: cursorTop,
                width: item.width,
            })
            cursorLeft += item.width * BAG_CELL_PX + BAG_ITEM_GAP_PX
        })

        cursorTop += row.heightCells * BAG_CELL_PX + BAG_ROW_GAP_PX
    })

    return {
        height: cursorTop - BAG_ROW_GAP_PX,
        placements,
        width,
    }
}
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-start justify-between gap-3">
            <div>
                <div class="font-medium">{{ bag.name }}</div>
            </div>
            <CopyID :id="bag.id" />
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="flex items-center justify-between rounded bg-base-200 p-2">
                <span>价格</span>
                <span class="text-primary">{{ bag.price }}</span>
            </div>
            <div class="flex items-center justify-between rounded bg-base-200 p-2">
                <span>容量</span>
                <span class="text-primary">{{ +bag.desc }}</span>
            </div>
            <div class="text-xs text-base-content/70">形状: {{ bag.shape.map(shape => shape.join("x")).join(" / ") }}</div>
        </div>
        <div class="flex justify-center">
            <div
                v-if="layout.width > 0 && layout.height > 0"
                class="relative overflow-hidden rounded bg-base-200"
                :style="{
                    width: `${layout.width}px`,
                    height: `${layout.height}px`,
                }"
            >
                <div
                    v-for="(item, index) in layout.placements"
                    :key="index"
                    class="absolute overflow-hidden rounded-[3px]"
                    :style="{
                        left: `${item.left}px`,
                        top: `${item.top}px`,
                        width: `${item.width * BAG_CELL_PX}px`,
                        height: `${item.height * BAG_CELL_PX}px`,
                    }"
                >
                    <div
                        class="grid h-full w-full"
                        :style="{
                            gridTemplateColumns: `repeat(${item.width}, ${BAG_CELL_PX}px)`,
                            gridTemplateRows: `repeat(${item.height}, ${BAG_CELL_PX}px)`,
                        }"
                    >
                        <div
                            v-for="cell in item.width * item.height"
                            :key="cell"
                            class="box-border border border-primary/35 bg-primary/80"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
