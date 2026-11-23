import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
    TRANSCEND_ANCIENT_TOTAL_EM,
    TRANSCEND_GROOVE_MARKS,
    TRANSCEND_LINE_MARKS,
    TRANSCEND_MARK_BASE_FONT_SIZE,
    TRANSCEND_MARK_BORDER_CSS,
    TRANSCEND_MARK_BORDER_EM,
    TRANSCEND_MARK_ICONS,
    TRANSCEND_MARK_PADDING_TOP_EM,
    TRANSCEND_MARK_SLOT_EM,
    TRANSCEND_MARK_TEXT_OFFSET_EM,
    TRANSCEND_MARK_TEXT_PULL_EM,
    TRANSCEND_SLOT_ICONS,
    transcendIconMaskStyle,
    transcendSlotIcon,
} from "@/utils/transcendence-icon"

/** 官方贴图名（槽型按中文槽名 + slotType 映射，不按英文槽名 Belt/CrystalBall/Shield 反推） */
const SLOT_ICON_BASENAMES: Record<number, string> = {
    1: "T_Season_Equipment_IconHead",
    2: "T_Season_Equipment_IconBody",
    3: "T_Season_Equipment_IconHand",
    4: "T_Season_Equipment_IconFoot",
    5: "T_Season_Equipment_IconEar",
    6: "T_Season_Equipment_IconNeck",
    7: "T_Season_Equipment_IconRing",
    8: "T_Season_Equipment_IconPendant",
    9: "T_Season_Equipment_IconSeal",
    10: "T_Season_Equipment_IconBook",
    11: "T_Season_Equipment_IconPattern",
}

/** 研究表 maskSize（137/143/137/123/137/125/145/125/123/116/136%） */
const SLOT_MASK_SIZES: Record<number, string> = {
    1: "137%",
    2: "143%",
    3: "137%",
    4: "123%",
    5: "137%",
    6: "125%",
    7: "145%",
    8: "125%",
    9: "123%",
    10: "116%",
    11: "136%",
}

describe("transcendence-icon：槽型 → 官方贴图映射", () => {
    it("11 个槽型全部指向官方 T_Season_Equipment_Icon* webp", () => {
        for (const [slotType, basename] of Object.entries(SLOT_ICON_BASENAMES)) {
            const icon = transcendSlotIcon(Number(slotType))
            expect(icon.url).toBe(`/imgs/webp/${basename}.webp`)
        }
    })

    it("易漂移的四个槽位锁死：8 Pendant / 9 Seal / 10 Book / 11 Pattern", () => {
        expect(transcendSlotIcon(8).url).toBe("/imgs/webp/T_Season_Equipment_IconPendant.webp")
        expect(transcendSlotIcon(9).url).toBe("/imgs/webp/T_Season_Equipment_IconSeal.webp")
        expect(transcendSlotIcon(10).url).toBe("/imgs/webp/T_Season_Equipment_IconBook.webp")
        expect(transcendSlotIcon(11).url).toBe("/imgs/webp/T_Season_Equipment_IconPattern.webp")
    })

    it("maskSize 与研究表一致", () => {
        for (const [slotType, maskSize] of Object.entries(SLOT_MASK_SIZES)) {
            expect(transcendSlotIcon(Number(slotType)).maskSize).toBe(maskSize)
        }
    })

    it("未知槽型回退纹饰（与替换前 v-else 分支一致）", () => {
        expect(transcendSlotIcon(0)).toBe(TRANSCEND_SLOT_ICONS[11])
        expect(transcendSlotIcon(12)).toBe(TRANSCEND_SLOT_ICONS[11])
        expect(transcendSlotIcon(99)).toBe(TRANSCEND_SLOT_ICONS[11])
    })
})

describe("transcendence-icon：标记贴图映射", () => {
    it("太古红星 Point_02 / 专属菱 Point_03，均 100%", () => {
        expect(TRANSCEND_MARK_ICONS.ancient).toEqual({ url: "/imgs/webp/T_Season_Tips_Point_02.webp", maskSize: "100%" })
        expect(TRANSCEND_MARK_ICONS.unique).toEqual({ url: "/imgs/webp/T_Season_Tips_Point_03.webp", maskSize: "100%" })
    })

    it("图标角标不再有最终精锻贴图（U97：官方无黄点，最终金星只保留词条行）", () => {
        expect("finalMasterwork" in TRANSCEND_MARK_ICONS).toBe(false)
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.url).toBe("/imgs/webp/T_Season_Tips_Point_01.webp")
    })
})

/**
 * 读取 WebP（RIFF）画布尺寸：无损用 VP8L，含扩展块时用 VP8X。
 * @param bytes 文件字节
 * @returns 画布宽高与是否无损
 */
function readWebpSize(bytes: Uint8Array): { width: number; height: number; lossless: boolean } {
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
    if (ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") throw new Error("not a WebP file")
    const chunk = ascii(12, 16)
    if (chunk === "VP8L") {
        if (bytes[20] !== 0x2f) throw new Error("bad VP8L signature")
        const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, lossless: true }
    }
    if (chunk === "VP8X") {
        return {
            width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
            height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
            lossless: false,
        }
    }
    return { width: 0, height: 0, lossless: false }
}

describe("transcendence-icon：1.8 pak 重导的标记贴图（U66a）", () => {
    /** 1.8 客户端原尺寸：Point_01 32 / Point_02 太古 56 / Point_03 40 */
    const EXPECTED = { "01": 32, "02": 56, "03": 40 } as const

    it("三张 webp 为无损 VP8L，画布 32/56/40 与 1.8 设计尺寸一致", () => {
        for (const [suffix, size] of Object.entries(EXPECTED)) {
            const file = fileURLToPath(new URL(`../../../public/imgs/webp/T_Season_Tips_Point_${suffix}.webp`, import.meta.url))
            expect(readWebpSize(new Uint8Array(readFileSync(file))), suffix).toEqual({ width: size, height: size, lossless: true })
        }
    })

    it("太古 Point_02 为 1.8 红色多刺星原图（SHA-256 锁定）", () => {
        const file = fileURLToPath(new URL("../../../public/imgs/webp/T_Season_Tips_Point_02.webp", import.meta.url))
        const bytes = readFileSync(file)
        // 1.8 pak 导出的红色多刺星（高光 / 主体 / 暗部与游戏截图逐色一致），改图需同步取证
        expect(createHash("sha256").update(bytes).digest("hex")).toBe("f0eb0c3ba8a34e77cdfece0f75238a785d3db6b5f36c96373af9922da0dd6e83")
        expect(TRANSCEND_LINE_MARKS.ancient.url).toBe("/imgs/webp/T_Season_Tips_Point_02.webp")
    })
})

describe("transcendence-icon：太古星渲染契约（只出原图，不染色）", () => {
    /** 组件源码：`<template>` 之外允许注释提「mask」，渲染分支必须保持单张原色 img */
    const source = () =>
        readFileSync(fileURLToPath(new URL("../../components/transcend-build/TranscendGearAncientStar.vue", import.meta.url)), "utf8")

    it("模板只有一张 <img>（Point_02 原图），无包裹 span / style 块", () => {
        const text = source()
        const template = text.slice(text.indexOf("<template>"))
        expect(template.match(/<img\b/g)).toHaveLength(1)
        expect(template).not.toMatch(/<span\b|<div\b|<picture\b/)
        expect(template).toContain(':src="TRANSCEND_LINE_MARKS.ancient.url"')
        expect(text).not.toMatch(/<style\b/)
    })

    it("模板无 filter / mask / mix-blend-mode / grayscale / currentColor 染色路径", () => {
        const text = source()
        const template = text.slice(text.indexOf("<template>"))
        expect(template).not.toMatch(/style="[^"]*(filter|mask|mix-blend)/i)
        expect(template).not.toMatch(/\bfilter\s*:|\bmask(-image)?\s*:|\bmix-blend-mode\s*:|\bgrayscale\b/i)
        expect(template).not.toMatch(/text-error|bg-current|currentColor|opacity-/)
    })
})

describe("transcendence-icon：Tips 顶部太古总数条（U66b）", () => {
    it("单颗星 1.2em：13px 名称行派生 15.6px，对齐游戏截图星 / 名称 ≈ 15 / 16", () => {
        expect(TRANSCEND_ANCIENT_TOTAL_EM).toBe(1.2)
        expect(TRANSCEND_ANCIENT_TOTAL_EM * 13).toBeCloseTo(15.6, 1)
        // 总数条小于行首太古星（行首按 1.8667em 溢出 1.6em 槽），两者不共用尺寸
        expect(TRANSCEND_ANCIENT_TOTAL_EM).toBeLessThan(TRANSCEND_LINE_MARKS.ancient.em)
    })
})

describe("transcendence-icon：词条行标记规格（WBP 控件名与素材编号错位）", () => {
    it("语义 → 素材：太古 Point_02 红星 / 最终 Point_01 金星 / 专属 Point_03 橙星", () => {
        expect(TRANSCEND_LINE_MARKS.ancient.url).toBe("/imgs/webp/T_Season_Tips_Point_02.webp")
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.url).toBe("/imgs/webp/T_Season_Tips_Point_01.webp")
        expect(TRANSCEND_LINE_MARKS.unique.url).toBe("/imgs/webp/T_Season_Tips_Point_03.webp")
    })

    it("控件名错位锁死：Point_02 控件用 Point_02、Point_03 控件用 Point_01、Effect 用 Point_03", () => {
        expect(TRANSCEND_LINE_MARKS.ancient.control).toBe("Point_02")
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.control).toBe("Point_03")
        expect(TRANSCEND_LINE_MARKS.unique.control).toBe("Effect")
        // 控件名不得用于反推素材：Point_03 控件实际指向 Point_01 贴图
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.control).not.toBe("Point_01")
    })

    it("设计尺寸（4K 设计值）：灰 8 / 太古 56 / 最终 32 / 淬炼 14 / 附魔 14 / 专属 40 / 空孔 36；运行时有效减半", () => {
        expect(TRANSCEND_LINE_MARKS.random.size).toBe(8)
        expect(TRANSCEND_LINE_MARKS.ancient.size).toBe(56)
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.size).toBe(32)
        expect(TRANSCEND_LINE_MARKS.tempering.size).toBe(14)
        expect(TRANSCEND_LINE_MARKS.enchant.size).toBe(14)
        expect(TRANSCEND_LINE_MARKS.unique.size).toBe(40)
        expect(TRANSCEND_LINE_MARKS.emptyGroove.size).toBe(36)
    })

    it("z 顺序（下 → 上）：太古 → 最终 → 淬炼 → 附魔", () => {
        expect(TRANSCEND_LINE_MARKS.ancient.z).toBeLessThan(TRANSCEND_LINE_MARKS.finalMasterwork.z)
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.z).toBeLessThan(TRANSCEND_LINE_MARKS.tempering.z)
        expect(TRANSCEND_LINE_MARKS.tempering.z).toBeLessThan(TRANSCEND_LINE_MARKS.enchant.z)
    })

    it("纯色块：灰 #99FFFFFF + 0.6；淬炼 #EB774E / 附魔 #A34EEB + 2px 黑描边", () => {
        expect(TRANSCEND_LINE_MARKS.random).toMatchObject({ colorHex: "#99FFFFFF", color: "rgba(255, 255, 255, 0.6)", opacity: 0.6 })
        expect(TRANSCEND_LINE_MARKS.tempering).toMatchObject({ color: "#EB774E", border: 2 })
        expect(TRANSCEND_LINE_MARKS.enchant).toMatchObject({ color: "#A34EEB", border: 2 })
    })
})

describe("transcendence-icon：em 缩放模型（上游 15 号字 + 4K 图减半）", () => {
    /** 上游有效尺寸 / 基准 15：56/32/40/14/14/8/36 减半后为 28/16/20/7/7/4/18 */
    const EM: Record<string, number> = {
        ancient: 1.8667,
        finalMasterwork: 1.0667,
        unique: 1.3333,
        tempering: 0.4667,
        enchant: 0.4667,
        random: 0.2667,
        emptyGroove: 1.2,
    }

    it("em 比值：太古 1.8667 / 最终 1.0667 / 专属 1.3333 / 淬炼附魔 0.4667 / 灰点 0.2667 / 空孔 1.2", () => {
        for (const [key, em] of Object.entries(EM)) {
            expect(TRANSCEND_LINE_MARKS[key as keyof typeof TRANSCEND_LINE_MARKS].em).toBeCloseTo(em, 4)
        }
    })

    it("em = 设计尺寸 / 2 / 基准字号（禁止按 4K 设计值直接渲染）", () => {
        expect(TRANSCEND_MARK_BASE_FONT_SIZE).toBe(15)
        for (const key of Object.keys(EM) as Array<keyof typeof TRANSCEND_LINE_MARKS>) {
            const spec = TRANSCEND_LINE_MARKS[key]
            expect(spec.em).toBeCloseTo(spec.size / 2 / TRANSCEND_MARK_BASE_FONT_SIZE, 4)
        }
    })

    it("11px 宿主派生 px：槽 17.6 / 太古 20.53 / 最终 11.73 / 专属 14.67 / 淬炼 5.13 / 灰点 2.93", () => {
        expect(TRANSCEND_MARK_SLOT_EM * 11).toBeCloseTo(17.6, 2)
        expect(TRANSCEND_LINE_MARKS.ancient.em * 11).toBeCloseTo(20.53, 2)
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.em * 11).toBeCloseTo(11.73, 2)
        expect(TRANSCEND_LINE_MARKS.unique.em * 11).toBeCloseTo(14.67, 2)
        expect(TRANSCEND_LINE_MARKS.tempering.em * 11).toBeCloseTo(5.13, 2)
        expect(TRANSCEND_LINE_MARKS.enchant.em * 11).toBeCloseTo(5.13, 2)
        expect(TRANSCEND_LINE_MARKS.random.em * 11).toBeCloseTo(2.93, 2)
    })

    it("10px dense 宿主派生 px：槽 16 / 太古 18.67 / 最终 10.67 / 专属 13.33 / 淬炼 4.67 / 灰点 2.67", () => {
        expect(TRANSCEND_MARK_SLOT_EM * 10).toBeCloseTo(16, 2)
        expect(TRANSCEND_LINE_MARKS.ancient.em * 10).toBeCloseTo(18.67, 2)
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.em * 10).toBeCloseTo(10.67, 2)
        expect(TRANSCEND_LINE_MARKS.unique.em * 10).toBeCloseTo(13.33, 2)
        expect(TRANSCEND_LINE_MARKS.tempering.em * 10).toBeCloseTo(4.67, 2)
        expect(TRANSCEND_LINE_MARKS.random.em * 10).toBeCloseTo(2.67, 2)
    })

    it("文本偏移 / 负偏移 / 顶部内边距 / 描边常量与上游一致", () => {
        expect(TRANSCEND_MARK_SLOT_EM).toBe(1.6)
        expect(TRANSCEND_MARK_TEXT_OFFSET_EM).toBe(1.4667)
        expect(TRANSCEND_MARK_TEXT_PULL_EM).toBe(0.1333)
        expect(TRANSCEND_MARK_SLOT_EM - TRANSCEND_MARK_TEXT_OFFSET_EM).toBeCloseTo(TRANSCEND_MARK_TEXT_PULL_EM, 4)
        expect(TRANSCEND_MARK_PADDING_TOP_EM).toBe(0.0667)
        expect(TRANSCEND_MARK_BORDER_EM).toBe(0.0667)
        expect(TRANSCEND_MARK_BORDER_CSS).toBe("max(1px, 0.0667em)")
    })

    it("最终 / 专属不溢出 1.6em 槽；太古 56 设计值（运行时 28）按上游 SizeBox_Point 居中溢出、不裁剪", () => {
        expect(TRANSCEND_LINE_MARKS.finalMasterwork.em).toBeLessThan(TRANSCEND_MARK_SLOT_EM)
        expect(TRANSCEND_LINE_MARKS.unique.em).toBeLessThan(TRANSCEND_MARK_SLOT_EM)
        expect(TRANSCEND_LINE_MARKS.ancient.em).toBeGreaterThan(TRANSCEND_MARK_SLOT_EM)
        // 太古运行时 28 > 槽 24（运行像素），总差 4 px = 0.2667em，居中后两侧各 2 px（0.1333em）
        expect(TRANSCEND_LINE_MARKS.ancient.em - TRANSCEND_MARK_SLOT_EM).toBeCloseTo((56 / 2 - 24) / TRANSCEND_MARK_BASE_FONT_SIZE, 4)
    })
})

describe("transcendence-icon：插槽行空孔 / 镶嵌映射（PointStyle 3/4）", () => {
    it("空孔：PointStyle 3 / 36×36 官方 EmptyGroove webp / 1.2em / <EmptyGroove> 40% 米金", () => {
        expect(TRANSCEND_GROOVE_MARKS.emptyGroove).toMatchObject({
            pointStyle: 3,
            size: 36,
            em: 1.2,
            control: "Groove_Empty",
            url: "/imgs/webp/T_Season_Tips_EmptyGroove.webp",
            colorHex: "#66C6BDAC",
            color: "rgba(198, 189, 172, 0.4)",
            labelKey: "transcend-build.gear_socket_empty",
        })
        expect(TRANSCEND_LINE_MARKS.emptyGroove).toMatchObject({
            size: 36,
            em: 1.2,
            url: "/imgs/webp/T_Season_Tips_EmptyGroove.webp",
            colorHex: "#66C6BDAC",
        })
    })

    it("已镶嵌：PointStyle 4 / 36px 槽内 28px 动态图标 / 1.2em（宝石无上游尺寸证据，与空孔同比）", () => {
        expect(TRANSCEND_GROOVE_MARKS.occupiedGroove).toMatchObject({
            pointStyle: 4,
            size: 36,
            iconSize: 28,
            em: 1.2,
            iconEm: 1.2,
            control: "Groove",
            colorHex: "#C6BDAC",
            color: "#c6bdac",
            textClass: "text-affix-title",
        })
    })

    it("插槽行 1.6em 槽 + 1.2em 空孔 / 宝石（11px 宿主为 17.6 / 13.2）", () => {
        expect(TRANSCEND_MARK_SLOT_EM * 11).toBeCloseTo(17.6, 2)
        expect(TRANSCEND_GROOVE_MARKS.emptyGroove.em * 11).toBeCloseTo(13.2, 2)
        expect(TRANSCEND_GROOVE_MARKS.occupiedGroove.iconEm * 11).toBeCloseTo(13.2, 2)
    })

    it("空孔 36 设计值与词条太古 56 设计值分表，不共用尺寸", () => {
        expect(TRANSCEND_GROOVE_MARKS.emptyGroove.size).toBe(36)
        expect(TRANSCEND_GROOVE_MARKS.occupiedGroove.size).toBe(36)
        expect(TRANSCEND_LINE_MARKS.emptyGroove.size).toBe(36)
        expect(TRANSCEND_LINE_MARKS.ancient.size).not.toBe(TRANSCEND_GROOVE_MARKS.emptyGroove.size)
    })
})

describe("transcendence-icon：mask 样式", () => {
    it("同时输出标准属性与 Webkit 前缀，居中不重复", () => {
        const style = transcendIconMaskStyle("/imgs/webp/T_Season_Equipment_IconHead.webp", "137%")
        expect(style.maskImage).toBe('url("/imgs/webp/T_Season_Equipment_IconHead.webp")')
        expect(style.WebkitMaskImage).toBe(style.maskImage)
        expect(style.maskSize).toBe("137%")
        expect(style.WebkitMaskSize).toBe("137%")
        expect(style.maskRepeat).toBe("no-repeat")
        expect(style.WebkitMaskRepeat).toBe("no-repeat")
        expect(style.maskPosition).toBe("center")
        expect(style.WebkitMaskPosition).toBe("center")
    })
})
