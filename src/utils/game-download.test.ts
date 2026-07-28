import { describe, expect, it, vi } from "vitest"
import { tauriFetch } from "@/api/app"
import {
    getHotUpdateVersionList,
    getPreFullPackageInfo,
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
    it("应该使用 PreVersionManifest.json 获取预下载版本", async () => {
        vi.mocked(tauriFetch)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    latest_version: "16001",
                    latest_version_number: "1.6",
                    min_supported_version: "15002",
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
        expect(result?.downloadUrl).toBe(
            "https://cdn.example.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/1.6/16001/full_16001/full_16001.hdiff"
        )
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
