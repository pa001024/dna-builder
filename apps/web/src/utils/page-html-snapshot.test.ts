import { describe, expect, it } from "vitest"
import { normalizeSnapshotPath } from "@/utils/page-html-snapshot"

describe("页面快照路径收敛", () => {
    it("保留资料库路径与查询参数", () => {
        expect(normalizeSnapshotPath("/db/event/103036")).toBe("/db/event/103036")
        expect(normalizeSnapshotPath("  /db/damage?mode=weapon  ")).toBe("/db/damage?mode=weapon")
        expect(normalizeSnapshotPath("/db")).toBe("/db")
    })

    it("补齐前导斜杠并剥掉域名与 hash", () => {
        expect(normalizeSnapshotPath("db/hardboss/101")).toBe("/db/hardboss/101")
        expect(normalizeSnapshotPath("https://example.com/db/char/1001")).toBe("/db/char/1001")
        expect(normalizeSnapshotPath("#/db/char/1001")).toBe("/db/char/1001")
    })

    it("拒绝站内其它页面与非法输入", () => {
        expect(normalizeSnapshotPath("/setting")).toBeNull()
        expect(normalizeSnapshotPath("/dbx/char/1001")).toBeNull()
        expect(normalizeSnapshotPath("")).toBeNull()
        expect(normalizeSnapshotPath(undefined)).toBeNull()
    })
})
