import { describe, expect, it, vi } from "vitest"
import { normalizeHotUpdatePakFilesInfo, normalizeOptionalPatchSigns } from "./game-download"

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
