import { beforeEach, describe, expect, it, vi } from "vitest"
import { tauriFetch } from "@/api/app"
import {
    buildDiffPackageDir,
    getDiffPackageInfo,
    getHotUpdateVersionList,
    getPreFullPackageInfo,
    isDiffPackageApplicable,
    normalizeFullPackageInfo,
    normalizeHotUpdatePakFilesInfo,
    normalizeOptionalPatchSigns,
    resolveGameVersion,
} from "./game-download"

vi.mock("@/api/app", () => ({
    getFileHash: vi.fn(),
    getFileSize: vi.fn(),
    tauriFetch: vi.fn(),
}))

describe("normalizeOptionalPatchSigns", () => {
    it("应该正确解析本地 OptionalPatchSigns.json", () => {
        const result = normalizeOptionalPatchSigns({
            optionalPatchInfos: {
                VoiceCN: {
                    state: "Downloaded",
                    version: 1210160,
                },
            },
        })

        expect(result.optionalPatchInfos.VoiceCN).toEqual({
            state: "Downloaded",
            version: 1210160,
        })
    })

    it("应该兼容大驼峰字段", () => {
        const result = normalizeOptionalPatchSigns({
            OptionalPatchInfos: {
                VoiceJP: {
                    State: "Downloaded",
                    Version: 1210157,
                },
            },
        })

        expect(result.optionalPatchInfos.VoiceJP).toEqual({
            state: "Downloaded",
            version: 1210157,
        })
    })
})

describe("normalizeHotUpdatePakFilesInfo", () => {
    it("应该正确解析语音包文件清单", () => {
        const result = normalizeHotUpdatePakFilesInfo({
            pakFilesMap: {
                WindowsNoEditor: {
                    pakFileInfos: [
                        {
                            fileName: "1.4.157.1_VoiceJP_WindowsNoEditor_1210157_P.pak",
                            hash: "abc",
                            pakOptionalSign: "VoiceJP",
                            fileSize: 100,
                            bExamineIgnore: false,
                        },
                    ],
                },
            },
        })

        expect(result.pakFilesMap.WindowsNoEditor.pakFileInfos).toEqual([
            {
                fileName: "1.4.157.1_VoiceJP_WindowsNoEditor_1210157_P.pak",
                hash: "abc",
                pakOptionalSign: "VoiceJP",
                fileSize: 100,
                bExamineIgnore: false,
            },
        ])
    })

    it("应该兼容大驼峰字段", () => {
        const result = normalizeHotUpdatePakFilesInfo({
            PakFilesMap: {
                WindowsNoEditor: {
                    PakFileInfos: [
                        {
                            FileName: "1.4.157.1_VoiceKR_WindowsNoEditor_1210157_P.pak",
                            Hash: "def",
                            PakOptionalSign: "VoiceKR",
                            FileSize: 200,
                            BExamineIgnore: false,
                        },
                    ],
                },
            },
        })

        expect(result.pakFilesMap.WindowsNoEditor.pakFileInfos[0]).toEqual({
            fileName: "1.4.157.1_VoiceKR_WindowsNoEditor_1210157_P.pak",
            hash: "def",
            pakOptionalSign: "VoiceKR",
            fileSize: 200,
            bExamineIgnore: false,
        })
    })
})

describe("normalizeFullPackageInfo", () => {
    it("应该解析完整包清单并生成下载地址", () => {
        const result = normalizeFullPackageInfo(
            {
                latest_version: "15002",
                latest_version_number: "1.5",
                min_supported_version: "15001",
            },
            {
                hdiff_file: {
                    name: "full_15002.hdiff",
                    md5: "1481c70e765f8bbbc36d1a1d1ad2e88c",
                    size: 25469095941,
                },
                new_size: 27984206398,
            },
            "http://pan01-1-hs.shyxhy.com",
            "PC_OBT_CN_Pub"
        )

        expect(result).toEqual({
            latestVersion: "15002",
            latestVersionNumber: "1.5",
            minSupportedVersion: "15001",
            fileName: "full_15002.hdiff",
            md5: "1481c70e765f8bbbc36d1a1d1ad2e88c",
            size: 25469095941,
            newSize: 27984206398,
            downloadUrl: "http://pan01-1-hs.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/1.5/15002/full_15002/full_15002.hdiff",
        })
    })

    it("清单字段不完整时应该拒绝继续", () => {
        expect(() => normalizeFullPackageInfo({}, {}, "https://example.com", "PC_OBT_CN_Pub")).toThrow("Invalid full package manifest")
    })
})

describe("getPreFullPackageInfo", () => {
    beforeEach(() => {
        vi.mocked(tauriFetch).mockReset()
    })

    it("应该解析 PreVersionManifest.json 的预下载字段并生成下载地址", async () => {
        vi.mocked(tauriFetch)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    pre_download_version: "16001",
                    pre_download_version_number: "1.6",
                    bOpen: true,
                }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    hdiff_file: {
                        name: "full_16001.hdiff",
                        md5: "abc",
                        size: 100,
                    },
                    new_size: 200,
                }),
            } as Response)

        const result = await getPreFullPackageInfo("https://cdn.example.com", "PC_OBT_CN_Pub")

        expect(vi.mocked(tauriFetch).mock.calls[0][0]).toBe(
            "https://cdn.example.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/PreVersionManifest.json"
        )
        expect(result).toMatchObject({
            latestVersion: "16001",
            latestVersionNumber: "1.6",
            fileName: "full_16001.hdiff",
            size: 100,
            newSize: 200,
            downloadUrl: "https://cdn.example.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/1.6/16001/full_16001/full_16001.hdiff",
        })
    })

    it("预下载清单不含 min_supported_version 时不应报错", async () => {
        vi.mocked(tauriFetch)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    pre_download_version: "16001",
                    pre_download_version_number: "1.6",
                    bOpen: true,
                }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    hdiff_file: {
                        name: "full_16001.hdiff",
                        md5: "abc",
                        size: 100,
                    },
                    new_size: 200,
                }),
            } as Response)

        const result = await getPreFullPackageInfo("https://cdn.example.com", "PC_OBT_CN_Pub")

        expect(result?.minSupportedVersion).toBeUndefined()
    })

    it("预下载未开放（bOpen=false）时应该返回 null", async () => {
        vi.mocked(tauriFetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                pre_download_version: "16001",
                pre_download_version_number: "1.6",
                bOpen: false,
            }),
        } as Response)

        const result = await getPreFullPackageInfo("https://cdn.example.com", "PC_OBT_CN_Pub")

        expect(result).toBeNull()
        expect(vi.mocked(tauriFetch)).toHaveBeenCalledTimes(1)
    })

    it("预下载清单无效时不应该抛出异常，而是返回 null", async () => {
        vi.mocked(tauriFetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        } as Response)

        const result = await getPreFullPackageInfo("https://cdn.example.com", "PC_OBT_CN_Pub")

        expect(result).toBeNull()
    })
})

describe("buildDiffPackageDir", () => {
    it("应该拼接为 v{旧版本}_to_v{新版本}", () => {
        expect(buildDiffPackageDir(15001, 16001)).toBe("v15001_to_v16001")
    })
})

describe("isDiffPackageApplicable", () => {
    it("本地版本不低于 min_supported_version 时可用", () => {
        expect(isDiffPackageApplicable(15001, "16001", "15001")).toBe(true)
        expect(isDiffPackageApplicable(15500, "16001", "15001")).toBe(true)
    })

    it("本地版本低于 min_supported_version 时不可用", () => {
        expect(isDiffPackageApplicable(14001, "16001", "15001")).toBe(false)
    })

    it("本地版本与目标版本相同或无效时不可用", () => {
        expect(isDiffPackageApplicable(16001, "16001", "15001")).toBe(false)
        expect(isDiffPackageApplicable(0, "16001", "15001")).toBe(false)
        expect(isDiffPackageApplicable(15001, "invalid", "15001")).toBe(false)
    })

    it("清单缺少 min_supported_version 时不限制下限", () => {
        expect(isDiffPackageApplicable(15001, "16001", undefined)).toBe(true)
    })
})

describe("getDiffPackageInfo", () => {
    const cdn = "https://pan01-1-eo.shyxhy.com"
    const fullPackage = {
        latestVersion: "16001",
        latestVersionNumber: "1.6",
        minSupportedVersion: "15001",
    }

    beforeEach(() => {
        vi.mocked(tauriFetch).mockReset()
    })

    it("应该按 v{本地版本}_to_v{目标版本} 拼接差分包地址并返回清单", async () => {
        vi.mocked(tauriFetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                hdiff_file: {
                    name: "v15001_to_v16001.hdiff",
                    md5: "a2de2a78bdb22a836154bf5f30339427",
                    size: 7205572177,
                },
                new_size: 32637146647,
            }),
        } as Response)

        const result = await getDiffPackageInfo(cdn, "PC_OBT_CN_Pub", fullPackage, 15001)

        expect(vi.mocked(tauriFetch)).toHaveBeenCalledWith(
            "https://pan01-1-eo.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/1.6/16001/v15001_to_v16001/HPatchDiffMd5.json"
        )
        expect(result).toEqual({
            fileName: "v15001_to_v16001.hdiff",
            md5: "a2de2a78bdb22a836154bf5f30339427",
            size: 7205572177,
            newSize: 32637146647,
            downloadUrl:
                "https://pan01-1-eo.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/1.6/16001/v15001_to_v16001/v15001_to_v16001.hdiff",
            diffDir: "v15001_to_v16001",
            fromVersion: 15001,
            toVersion: 16001,
        })
    })

    it("海外渠道应该使用 Global 资源目录", async () => {
        vi.mocked(tauriFetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ hdiff_file: { name: "v15001_to_v16001.hdiff", md5: "abc", size: 1 }, new_size: 2 }),
        } as Response)

        await getDiffPackageInfo(cdn, "PC_OBT_Global_Pub", fullPackage, 15001)

        expect(vi.mocked(tauriFetch).mock.calls[0][0]).toBe(
            "https://pan01-1-eo.shyxhy.com/Packages/Global/WindowsNoEditor/PC_OBT_Global_Pub/1.6/16001/v15001_to_v16001/HPatchDiffMd5.json"
        )
    })

    it("本地版本低于 min_supported_version 时不应该请求差分包", async () => {
        const result = await getDiffPackageInfo(cdn, "PC_OBT_CN_Pub", fullPackage, 14001)

        expect(result).toBeNull()
        expect(vi.mocked(tauriFetch)).not.toHaveBeenCalled()
    })

    it("本地版本已是目标版本时不应该请求差分包", async () => {
        const result = await getDiffPackageInfo(cdn, "PC_OBT_CN_Pub", fullPackage, 16001)

        expect(result).toBeNull()
        expect(vi.mocked(tauriFetch)).not.toHaveBeenCalled()
    })

    it("本地版本不可读（0）时不应该请求差分包", async () => {
        const result = await getDiffPackageInfo(cdn, "PC_OBT_CN_Pub", fullPackage, 0)

        expect(result).toBeNull()
        expect(vi.mocked(tauriFetch)).not.toHaveBeenCalled()
    })

    it("远端未提供差分包（非 2xx）时应该返回 null", async () => {
        vi.mocked(tauriFetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)

        expect(await getDiffPackageInfo(cdn, "PC_OBT_CN_Pub", fullPackage, 15001)).toBeNull()
    })

    it("清单字段不完整时应该返回 null", async () => {
        vi.mocked(tauriFetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)

        expect(await getDiffPackageInfo(cdn, "PC_OBT_CN_Pub", fullPackage, 15001)).toBeNull()
    })

    it("请求异常时应该返回 null 而不是抛出", async () => {
        vi.mocked(tauriFetch).mockRejectedValueOnce(new Error("network error"))

        expect(await getDiffPackageInfo(cdn, "PC_OBT_CN_Pub", fullPackage, 15001)).toBeNull()
    })
})

describe("getHotUpdateVersionList", () => {
    it("热更版本应该继续使用旧 VersionList.json", async () => {
        vi.mocked(tauriFetch)
            .mockReset()
            .mockResolvedValueOnce({
                json: async () => ({ versionList: {} }),
            } as Response)

        await getHotUpdateVersionList("https://cdn.example.com", "PC_OBT_CN_Pub")

        expect(vi.mocked(tauriFetch)).toHaveBeenCalledWith(
            "https://cdn.example.com/Patches/FinalPatch/CN/Default/WindowsNoEditor/PC_OBT_CN_Pub/VersionList.json"
        )
    })
})

describe("resolveGameVersion", () => {
    it("应该读取有效的游戏版本文件", () => {
        expect(resolveGameVersion('{"version":15002}')).toBe(15002)
    })

    it("应该拒绝无效版本文件", () => {
        expect(resolveGameVersion('{"version":"15002"}')).toBeNull()
        expect(resolveGameVersion('{"version":0}')).toBeNull()
        expect(resolveGameVersion("invalid json")).toBeNull()
    })
})
