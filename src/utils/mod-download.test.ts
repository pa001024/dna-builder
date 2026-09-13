import { describe, expect, it } from "vitest"
import type { GameMod } from "@/api/gen/api-types"
import type { InstalledShareMod, Mod } from "@/store/db"
import {
    computeDownloadProgress,
    findInstalledLocalMod,
    isVersionInstalled,
    latestVersionLabel,
    modTaskKey,
    resolveModInstallState,
} from "./mod-download"

/**
 * @description 构造测试用分享发布（只填判定逻辑用到的字段）。
 * @param overrides 需要覆盖的字段。
 * @returns 分享发布对象。
 */
function makeMod(overrides: Partial<GameMod> = {}): GameMod {
    return {
        id: "mod-1",
        name: "测试MOD",
        category: "standalone",
        fileName: "demo.zip",
        fileSize: 1024,
        status: "approved",
        userId: "user-1",
        downloads: 0,
        views: 0,
        likes: 0,
        isActive: true,
        createdAt: 1,
        updateAt: 100,
        latestVersion: { id: "v2", version: "1.1.0", fileName: "demo-1.1.0.zip", fileSize: 2048, downloads: 0, createdAt: 200 },
        ...overrides,
    }
}

/**
 * @description 构造测试用本地安装记录。
 * @param overrides 需要覆盖的字段。
 * @returns 安装记录。
 */
function makeRecord(overrides: Partial<InstalledShareMod> = {}): InstalledShareMod {
    return {
        id: "mod-1",
        versionId: "v1",
        version: "1.0.0",
        fileSize: 1024,
        modUpdateAt: 100,
        localName: "测试MOD v1.0.0",
        entity: "独立",
        installedAt: 1,
        ...overrides,
    }
}

describe("modTaskKey", () => {
    it("最新版任务用发布 id，指定版本任务带版本 id", () => {
        expect(modTaskKey("mod-1")).toBe("mod-1")
        expect(modTaskKey("mod-1", "v2")).toBe("mod-1:v2")
        expect(modTaskKey("mod-1", null)).toBe("mod-1")
    })
})

describe("computeDownloadProgress", () => {
    it("按已下载字节数换算百分比并四舍五入", () => {
        expect(computeDownloadProgress(0, 200)).toBe(0)
        expect(computeDownloadProgress(50, 200)).toBe(25)
        expect(computeDownloadProgress(1, 3)).toBe(33)
    })

    it("超出总量时封顶 100（Content-Length 与实际字节略有出入时不越界）", () => {
        expect(computeDownloadProgress(300, 200)).toBe(100)
    })

    it("总量未知时返回 null，界面显示不确定进度", () => {
        expect(computeDownloadProgress(100, 0)).toBeNull()
        expect(computeDownloadProgress(100, -1)).toBeNull()
        expect(computeDownloadProgress(100, Number.NaN)).toBeNull()
    })
})

describe("resolveModInstallState", () => {
    it("没有安装记录时为未下载", () => {
        expect(resolveModInstallState(undefined, makeMod())).toBe("new")
    })

    it("安装版本与远端最新版一致时为已下载", () => {
        expect(resolveModInstallState(makeRecord({ versionId: "v2" }), makeMod())).toBe("installed")
    })

    it("安装版本落后于远端最新版时为可更新", () => {
        expect(resolveModInstallState(makeRecord({ versionId: "v1" }), makeMod())).toBe("outdated")
    })

    it("缺版本信息时用发布更新时间兜底判断", () => {
        const noVersions = makeMod({ latestVersion: null })
        expect(resolveModInstallState(makeRecord({ versionId: "", modUpdateAt: 100 }), noVersions)).toBe("installed")
        expect(resolveModInstallState(makeRecord({ versionId: "", modUpdateAt: 99 }), noVersions)).toBe("outdated")
    })

    it("记录缺版本 id（旧数据）时同样回落到更新时间比较", () => {
        expect(resolveModInstallState(makeRecord({ versionId: "" }), makeMod({ updateAt: 300 }))).toBe("outdated")
        expect(resolveModInstallState(makeRecord({ versionId: "" }), makeMod({ updateAt: 100 }))).toBe("installed")
    })
})

describe("isVersionInstalled", () => {
    it("仅在版本 id 与本地记录一致时为 true", () => {
        const record = makeRecord({ versionId: "v1" })
        expect(isVersionInstalled(record, "v1")).toBe(true)
        expect(isVersionInstalled(record, "v2")).toBe(false)
        expect(isVersionInstalled(undefined, "v1")).toBe(false)
    })
})

describe("latestVersionLabel", () => {
    it("返回最新版本号标签，缺失时为 undefined", () => {
        expect(latestVersionLabel(makeMod())).toBe("1.1.0")
        expect(latestVersionLabel(makeMod({ latestVersion: null }))).toBeUndefined()
    })
})

describe("findInstalledLocalMod", () => {
    const mods: Mod[] = [
        { id: 1, entity: "独立", name: "其他MOD", files: ["a.pak"], addTime: 1, size: 1, pic: "" },
        { id: 2, entity: "独立", name: "测试MOD v1.0.0", files: ["b.pak"], addTime: 2, size: 2, pic: "" },
        { id: 3, entity: "角色A", name: "测试MOD v1.0.0", files: ["c.pak"], addTime: 3, size: 3, pic: "" },
    ]

    it("按安装名称 + 实体匹配本地 MOD", () => {
        expect(findInstalledLocalMod(mods, makeRecord())?.id).toBe(2)
    })

    it("本地 MOD 已被手动删除时返回 undefined", () => {
        expect(findInstalledLocalMod(mods, makeRecord({ localName: "已删除MOD" }))).toBeUndefined()
        expect(findInstalledLocalMod(mods, undefined)).toBeUndefined()
    })
})
