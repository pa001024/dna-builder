import { describe, expect, it } from "vitest"
import { createQrCode, type QrCodeData } from "./qr-code"
import { buildQrCodeShapes } from "./qr-code-render"

/**
 * 构造一个只含指定深色模块的测试矩阵。
 * @param rows 每行一个 "0"/"1" 字符串
 * @returns 二维码矩阵
 */
function makeQr(rows: string[]): QrCodeData {
    return {
        size: rows.length,
        modules: rows.map(row => [...row].map(char => char === "1")),
        version: 1,
        ecc: "M",
        mask: 0,
        finderOrigins: [],
        alignmentCenters: [],
    }
}

/** 统计路径中的子路径数量 */
function countSubPaths(path: string): number {
    return path.split("M").length - 1
}

describe("buildQrCodeShapes", () => {
    it("相邻深色模块连成一片、孤立模块保持独立", () => {
        const shapes = buildQrCodeShapes(makeQr(["110", "000", "000"]))

        // 两个横向相邻模块：各自向对方外扩 0.32，宽度同为 1.32，圆角 0.42
        expect(countSubPaths(shapes.modules)).toBe(2)
        expect(shapes.modules).toBe(
            "M0.42 0h0.48a0.42 0.42 0 0 1 0.42 0.42v0.16a0.42 0.42 0 0 1 -0.42 0.42h-0.48a0.42 0.42 0 0 1 -0.42 -0.42v-0.16a0.42 0.42 0 0 1 0.42 -0.42z" +
                "M1.1 0h0.48a0.42 0.42 0 0 1 0.42 0.42v0.16a0.42 0.42 0 0 1 -0.42 0.42h-0.48a0.42 0.42 0 0 1 -0.42 -0.42v-0.16a0.42 0.42 0 0 1 0.42 -0.42z"
        )
        expect(shapes.rings).toBe("")
    })

    it("孤立模块不外扩", () => {
        const shapes = buildQrCodeShapes(makeQr(["100", "000", "000"]))
        // 宽高都为 1，圆角 0.42 → 边长 0.48 的直段
        expect(shapes.modules).toBe(
            "M0.42 0h0.16a0.42 0.42 0 0 1 0.42 0.42v0.16a0.42 0.42 0 0 1 -0.42 0.42h-0.16a0.42 0.42 0 0 1 -0.42 -0.42v-0.16a0.42 0.42 0 0 1 0.42 -0.42z"
        )
    })

    it("外扩量与圆角被卡在可扫描的上限内", () => {
        const { modules } = buildQrCodeShapes(makeQr(["110", "000", "000"]), { merge: 0.9, moduleRadius: 0.9 })
        // merge 上限 0.49 → 宽 1.49、起点 x=0；圆角上限 0.5 → 直段 0.49
        expect(modules).toContain("M0.5 0h0.49a0.5 0.5")
        expect(modules).not.toContain("NaN")
    })

    it("定位图形与校正图形单独绘制成圆角方环", () => {
        const v3 = buildQrCodeShapes(createQrCode("https://dna-builder.cn/download"))
        // 每个功能图形 3 个子路径（外环 + 内环 + 内芯）；版本 3 有 3 个定位图形与 1 个校正图形
        expect(countSubPaths(v3.rings)).toBe((3 + 1) * 3)
        expect(v3.rings).not.toContain("NaN")

        // 版本 7：3 个定位图形 + 6 个校正图形
        const v7 = buildQrCodeShapes(createQrCode("a".repeat(130)))
        expect(v7.rings).not.toContain("NaN")
        expect(countSubPaths(v7.rings)).toBe((3 + 6) * 3)
    })

    it("定位图形内部不重复绘制数据模块", () => {
        const qr = createQrCode("https://dna-builder.cn/download")
        const { modules } = buildQrCodeShapes(qr)
        // 定位图形左上角首个深色模块若被当作数据模块，会出现以 "M0 0" 开头的子路径
        expect(modules.startsWith("M0 0")).toBe(false)
        expect(countSubPaths(modules)).toBeGreaterThan(50)
    })
})
