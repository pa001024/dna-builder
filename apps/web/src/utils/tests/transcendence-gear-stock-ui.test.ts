import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * U97 / U97-fix 源码锚点：库存紧凑方形卡网格、与槽位一致的 hover 浮层（孔位 / 编辑 / 删除）、
 * 焦点归还、触屏常驻回退、官方图标角标口径。组件渲染依赖 Tauri / store，
 * 这里锁定模板契约（无 @vue/test-utils 环境）。
 */

/**
 * 读取 transcend-build 组件源码。
 * @param name 组件文件名
 * @returns 源码文本
 */
function componentSource(name: string): string {
    return readFileSync(fileURLToPath(new URL(`../../components/transcend-build/${name}`, import.meta.url)), "utf8")
}

/** 截取 `<template>` 之后的模板部分，避免脚本注释干扰断言 */
function templateOf(source: string): string {
    return source.slice(source.indexOf("<template>"))
}

describe("库存弹窗：紧凑方形卡网格", () => {
    const source = componentSource("TranscendGearInventoryDialog.vue")

    it("列表为 auto-fill 自适应方形卡网格，不再是两列行列表", () => {
        expect(source).toContain("grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2")
        expect(source).toContain("data-gear-stock-grid")
        expect(source).not.toContain("lg:grid-cols-2")
    })
})

describe("库存卡：hover / 焦点浮层（与槽位同范式）", () => {
    const source = componentSource("TranscendGearStockItem.vue")

    it("顶部浮层定位与隐藏态：opacity 切换 + inert + 按钮退出 Tab 序", () => {
        expect(source).toContain(
            "absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-1 bg-base-100/70 py-0.5 backdrop-blur-sm transition-opacity duration-150"
        )
        expect(source).toContain("actionsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'")
        expect(source).toContain(':inert="!actionsVisible"')
        expect(source.match(/:tabindex="actionsVisible \? undefined : -1"/g)?.length).toBeGreaterThanOrEqual(2)
        expect(source).toContain("data-gear-actions")
    })

    it("指针 / 焦点判定照抄槽位：忽略合成指针事件，焦点留在子树时保持可用", () => {
        expect(source.match(/event\.isTrusted/g)).toHaveLength(2)
        expect(source).toContain('@pointerenter="handlePointerEnter"')
        expect(source).toContain('@pointerleave="handlePointerLeave"')
        expect(source).toContain('@focusin="handleFocusIn"')
        expect(source).toContain('@focusout="handleFocusOut"')
        expect(source).toContain("event.target !== event.currentTarget")
        expect(source).toContain("root.contains(next)")
    })

    it("触屏 / 粗指针回退：无 hover 环境浮层常驻（不 inert、按钮保留 Tab / 点击）", () => {
        expect(source).toContain('window.matchMedia("(hover: none), (pointer: coarse)")')
        expect(source).toContain("touchFallback")
        expect(source).toContain("actionsVisible = computed(() => touchFallback.value || hovered.value || focusWithin.value)")
        expect(source).toContain('addEventListener("change", syncTouchFallback)')
        expect(source).toContain('removeEventListener("change", syncTouchFallback)')
    })

    it("编辑 / 删除两入口齐备，操作前先关闭预览；不单设孔位与宝石入口（在编辑表单内操作）", () => {
        for (const anchor of ["data-gear-stock-edit", "data-gear-stock-delete"]) {
            expect(source).toContain(anchor)
        }
        expect(source).not.toContain("data-gear-stock-sockets")
        expect(source).not.toContain("ri:sparkling-line")
        expect(source).toContain("cardRef.value?.close()")
        expect(source.match(/closeThen\(/g)?.length).toBeGreaterThanOrEqual(3)
    })

    it("无文字操作列与行头摘要（CopyID / 孔位计数移入悬浮预览或角标）", () => {
        expect(source).not.toContain("data-gear-stock-copy-id")
        expect(source).not.toContain("data-gear-stock-socket-state")
        expect(source).not.toContain('{{ $t("transcend-build.gear_stock_edit") }}')
        expect(source).not.toContain('{{ $t("transcend-build.gear_stock_delete") }}')
        expect(source).not.toContain("w-40")
    })
})

describe("库存弹窗：无独立孔位入口与编辑焦点归还", () => {
    const source = componentSource("TranscendGearInventoryDialog.vue")

    it("库存不接线独立孔位与宝石弹窗（编辑表单已含孔位操作）", () => {
        expect(source).not.toContain("TranscendGearSocketDialog")
        expect(source).not.toContain("openSockets")
        expect(source).not.toContain('@sockets="openSockets(row)"')
        expect(source).not.toContain("data-transcend-gear-socket")
    })

    it("关闭编辑归还焦点到行内卡片根（tabindex=0），不再聚焦 inert 浮层按钮", () => {
        expect(source).toContain('trigger.closest<HTMLElement>("[data-gear-stock-row]")')
        expect(source).toContain('querySelector<HTMLElement>("[data-gear-square-card]")?.focus()')
        expect(source).not.toContain("editTrigger")
        expect(source).not.toContain("editTrigger.value?.focus()")
    })
})

describe("方形卡：官方角标口径（U106 起 pips 全上下文）", () => {
    const source = componentSource("TranscendGearSquareCard.vue")
    const template = templateOf(source)

    it("右下角孔位指示：全上下文逐孔输出，已镶嵌带宝石图标，未知宝石有回退", () => {
        expect(source).toContain("data-gear-socket-pips")
        expect(source).toContain("getItemSocketLines")
        expect(source).not.toContain('props.context !== "stock"')
        expect(source).toContain("socketState.value.opened")
        expect(template).toContain('v-if="socketPips.length"')
        expect(template).toContain("data-gear-socket-pip-frame")
        expect(template).toContain("data-gear-socket-pip-gem")
        expect(template).toContain(":data-gear-socket-filled=\"pip.line ? '1' : undefined\"")
        expect(template).toContain("data-gear-socket-pip-fallback")
        expect(template).toContain("gear_type_gem")
    })

    it("两槽纵向、单槽单行；底栏上方定位、库存无底栏贴边", () => {
        expect(template).toContain("socketPips.length > 1 ? 'flex-col' : 'flex-row'")
        expect(template).toContain("context === 'stock' ? 'bottom-1' : 'bottom-16'")
    })

    it("库存上下文隐藏底部信息条，其余上下文显示 T/A/F 第二行", () => {
        expect(template).toContain("v-if=\"context !== 'stock'\"")
        expect(template).toContain("data-gear-strength")
        expect(template).toContain("data-gear-affixes")
        expect(template).toContain("data-gear-masterwork")
        expect(template).not.toContain("data-gear-socket-count")
    })

    it("预览 CopyID 语义不变：库存悬浮预览保留专属 CopyID，详情卡仍接受 showCopyId", () => {
        expect(template).toContain(":show-copy-id=\"context === 'stock'\"")
        expect(componentSource("TranscendGearItemCard.vue")).toContain("showCopyId")
    })

    it("图标角标只出太古，不再计算最终精锻黄点", () => {
        expect(template).not.toContain("finalIcon")
        expect(template).not.toContain(":final-masterwork")
        expect(source).not.toContain("isFinalMasterworkGearIconLine")
        expect(template).toContain('v-if="ancientIcon"')
    })
})

describe("最终精锻黄点从图标角标移除（词条行官方贴图保留）", () => {
    const iconMarks = componentSource("TranscendGearIconMarks.vue")
    const mark = componentSource("TranscendGearMark.vue")

    it("TranscendGearIconMarks 不再有 finalMasterwork prop / badge", () => {
        expect(iconMarks).not.toContain("finalMasterwork")
        expect(iconMarks).not.toContain('data-gear-mark="final-masterwork"')
        expect(iconMarks).toContain('kind="ancient"')
    })

    it("TranscendGearMark 只保留 line 变体的最终金星（官方贴图），badge 从类型上禁止", () => {
        expect(mark).not.toContain("bg-current text-warning")
        expect(mark).not.toContain("finalMasterworkStyle")
        expect(mark.match(/data-gear-mark="final-masterwork"/g)).toHaveLength(1)
        expect(mark).toContain('{ kind: "finalMasterwork"; variant: "line"; suppressTitle?: boolean }')
        expect(mark).toContain("kind === 'finalMasterwork' && markVariant === 'line'")
        expect(mark).toContain("TRANSCEND_LINE_MARKS.finalMasterwork.url")
    })

    it("槽位 / 预览卡 / 方形卡不再传 finalMasterwork", () => {
        for (const name of ["TranscendGearSlot.vue", "TranscendGearItemCard.vue", "TranscendGearSquareCard.vue"]) {
            const source = componentSource(name)
            expect(source, name).not.toContain("finalIcon")
            expect(source, name).not.toContain(":final-masterwork")
            expect(source, name).not.toContain("isFinalMasterworkGearIconLine")
        }
    })
})

describe("U97-fix P3 收口", () => {
    it("isFinalMasterworkGearIconLine 已删除（黄点移除后生产零引用）", () => {
        const source = readFileSync(fileURLToPath(new URL("../transcend-gear/display.ts", import.meta.url)), "utf8")
        expect(source).not.toContain("isFinalMasterworkGearIconLine")
    })
})

describe("U100：装备槽位 @container 响应式与 MOD 字号对齐", () => {
    const section = componentSource("TranscendGearSection.vue")
    const slot = componentSource("TranscendGearSlot.vue")
    const slotTemplate = templateOf(slot)
    const square = componentSource("TranscendGearSquareCard.vue")
    const squareTemplate = templateOf(square)

    it("槽位区自身即容器：主控 2/4/8 档、协战 2/4 档，@5xl 起两组协战并排一行", () => {
        expect(section).toContain('<div class="@container space-y-3">')
        expect(section).toContain('class="grid grid-cols-2 gap-2 @xs:grid-cols-4 @5xl:grid-cols-8"')
        expect(section).toContain('v-for="slot in mainGroup.slots"')
        expect(section).toContain('class="grid grid-cols-2 gap-2 @xs:grid-cols-4"')
        expect(section).toContain('class="border-t border-base-content/8 pt-3 @5xl:grid @5xl:grid-cols-2 @5xl:gap-2"')
        expect(section).toContain("'border-t border-base-content/8 pt-3 @5xl:border-t-0 @5xl:pt-0'")
        expect(section).toContain('v-for="(group, index) in assistGroups"')
        expect(section).not.toContain('class="grid grid-cols-4 gap-2"')
    })

    it("槽位卡名称 / 状态行与徽章类名对齐 ModItem 方形卡", () => {
        expect(slotTemplate).toContain("flex items-center gap-1 text-sm leading-tight font-bold text-base-content/80")
        expect(slotTemplate).toContain("relative h-6 text-xs leading-8 text-base-content/80")
        expect(slotTemplate).toContain("absolute inset-0 flex items-center justify-between gap-1")
        expect(slotTemplate).toContain("flex min-w-0 items-center gap-x-1 truncate tabular-nums")
        expect(slotTemplate).toContain("px-1 py-px text-xs leading-none text-warning/90")
        expect(slotTemplate).toContain('class="size-8"')
        expect(slotTemplate).not.toContain("text-[9px]")
        expect(slotTemplate).not.toContain("text-[10px]")
        expect(slotTemplate).not.toContain("sm:size-9")
    })

    it("槽位卡收益 / 强度：普通字体 + tabular-nums，不再 font-orbitron", () => {
        expect(slot).not.toContain("font-orbitron")
        expect(slotTemplate).toContain("T{{ item.equipBaseScore }}")
        expect(slotTemplate).not.toContain("ml-auto")
    })

    it("方形卡名称 / 状态行与徽章类名对齐 ModItem 方形卡", () => {
        expect(squareTemplate).toContain("flex items-center gap-1 text-sm leading-tight font-bold text-base-content/80")
        expect(squareTemplate).toContain("relative h-6 text-xs leading-8 text-base-content/80")
        expect(squareTemplate).toContain("absolute inset-0 flex items-center justify-between gap-1")
        expect(squareTemplate).toContain("flex min-w-0 items-center gap-x-1 truncate tabular-nums")
        expect(squareTemplate).toContain("px-1 py-px text-xs leading-none text-primary")
        expect(squareTemplate).not.toContain("text-[9px]")
        expect(squareTemplate).not.toContain("text-[10px]")
        expect(squareTemplate).not.toContain("text-[11px]")
    })

    it("方形卡收益 / 强度：普通字体 + tabular-nums，不再 font-orbitron", () => {
        expect(square).not.toContain("font-orbitron")
        expect(squareTemplate).toContain("T{{ item.equipBaseScore }}")
        expect(squareTemplate).not.toContain("ml-auto")
    })

    it("既有 data-gear-* 锚点保留（ego 脚本依赖）", () => {
        for (const anchor of [
            "data-gear-tooltip",
            "data-gear-slot",
            "data-gear-actions",
            "data-gear-add-to-stock",
            "data-gear-sockets",
            "data-gear-craft",
            "data-gear-unequip",
            "data-gear-gain",
            "data-gear-strength",
            "data-gear-affixes",
            "data-gear-masterwork",
        ]) {
            expect(slot, anchor).toContain(anchor)
        }
        for (const anchor of [
            "data-gear-tooltip",
            "data-gear-square-card",
            "data-gear-item",
            "data-gear-stock-card",
            "data-gear-picker-card",
            "data-gear-current-card",
            "data-gear-equipped",
            "data-gear-socket-pips",
            "data-gear-socket-pip",
            "data-gear-socket-filled",
            "data-gear-socket-pip-frame",
            "data-gear-socket-pip-gem",
            "data-gear-socket-pip-fallback",
            "data-gear-income",
            "data-gear-strength",
            "data-gear-affixes",
            "data-gear-masterwork",
        ]) {
            expect(square, anchor).toContain(anchor)
        }
    })
})

describe("U106：T/A/F 数值行与孔位右下标", () => {
    const slot = componentSource("TranscendGearSlot.vue")
    const slotTemplate = templateOf(slot)
    const square = componentSource("TranscendGearSquareCard.vue")
    const squareTemplate = templateOf(square)
    const itemCard = componentSource("TranscendGearItemCard.vue")
    const itemTemplate = templateOf(itemCard)

    it("两张卡第二行为 T / A / +F token，收益在行尾，颜色按正文 / 黄色", () => {
        for (const template of [slotTemplate, squareTemplate]) {
            expect(template).toContain("T{{ item.equipBaseScore }}")
            expect(template).toContain("A{{ affixTotal }}")
            expect(template).toContain("+{{ craftSummary.masterworkLevel }}F")
            expect(template).toContain('class="shrink-0 text-warning"')
            expect(template).toContain("relative h-6 text-xs leading-8 text-base-content/80")
        }
        expect(slotTemplate).toContain(":class=\"gain === null ? 'text-warning/80' : ''\"")
        expect(squareTemplate).toContain(":class=\"incomeFailed ? 'text-warning/80' : ''\"")
        for (const template of [slotTemplate, squareTemplate]) {
            expect(template).not.toContain("data-gear-socket-count")
        }
    })

    it("底部栏与 ModItem 方形卡逐类一致：容器 / 名称行 / 状态行", () => {
        for (const template of [slotTemplate, squareTemplate]) {
            expect(template).toContain("pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-base-100/25 px-2 py-2 backdrop-blur-sm")
            expect(template).toContain("flex items-center gap-1 text-sm leading-tight font-bold text-base-content/80")
            expect(template).toContain('class="truncate"')
            expect(template).toContain("relative h-6 text-xs leading-8 text-base-content/80")
            expect(template).toContain("absolute inset-0 flex items-center justify-between gap-1")
            expect(template).toContain("flex min-w-0 items-center gap-x-1 truncate tabular-nums")
        }
    })

    it("槽位卡补孔位状态：pips 全上下文、底栏上方、两槽纵向", () => {
        expect(slot).toContain("getItemSocketLines")
        expect(slot).toContain("getGearSocketState")
        expect(slotTemplate).toContain("data-gear-socket-pips")
        expect(slotTemplate).toContain("bottom-16")
        expect(slotTemplate).toContain("socketPips.length > 1 ? 'flex-col' : 'flex-row'")
    })

    it("详情卡保持原文字格式：强度 / 未记录强度 / 精锻文字 / CopyID / 孔位计数都不动，不出现缩写 token", () => {
        expect(itemTemplate).toContain('$t("transcend-build.gear_strength")')
        expect(itemTemplate).toContain("gear_strength_unset")
        expect(itemTemplate).toContain('{{ $t("transcend-build.gear_masterwork_level"')
        expect(itemTemplate).toContain("data-gear-socket-state")
        expect(itemTemplate).toContain("showCopyId")
        expect(itemTemplate).not.toContain("T{{ item.equipBaseScore }}")
        expect(itemTemplate).not.toContain("A{{ affixTotal }}")
        expect(itemTemplate).toContain("data-gear-groove")
    })

    it("内部预览 aside 与悬浮预览一致：ItemCard 统一 bare preview（预览不显示 CopyID / 键值行 / 档位）", () => {
        /** 多行属性写法归一为单行，仍逐项校验宿主传给 ItemCard 的完整 props */
        const compact = (source: string) => source.replace(/\s+/g, " ")
        expect(compact(templateOf(componentSource("TranscendGearCreate.vue")))).toContain(
            '<TranscendGearItemCard :item="previewItem" :slot-id="slotId" :char-id="rowCharId" bare preview :affix-income-source="affixIncomeSource" />'
        )
        expect(compact(templateOf(componentSource("TranscendGearCraftDialog.vue")))).toContain(
            '<TranscendGearItemCard :item="props.item" :slot-id="props.slot.slotId" :char-id="props.charId" bare preview :affix-income-source="affixIncomeSource" />'
        )
        expect(compact(slotTemplate)).toContain(
            '<TranscendGearItemCard :item="item" :slot-id="slot.slotId" :char-id="charId ?? 0" bare preview :affix-income-source="affixIncomeSource" />'
        )
        expect(compact(squareTemplate)).toContain(
            '<TranscendGearItemCard :item="item" :slot-id="slotId" :char-id="charId" bare preview :show-copy-id="context === \'stock\'" :affix-income-source="affixIncomeSource" />'
        )
    })
})
