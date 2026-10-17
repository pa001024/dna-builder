import { afterAll, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { QuarkClient } from "./quark"
import {
    buildVaultZip,
    checkVaultConsistency,
    crc32,
    createStoredZip,
    DEFAULT_VAULT_FILE_NAME,
    extractStoredZipEntry,
    generateVaultPassword,
    isInVaultDir,
    isVaultDuplicateName,
    parseVaultPasswordText,
    readVaultState,
    readVaultTargetConfig,
    removeExistingVaultFile,
    resolveVaultDirFid,
    rotateVault,
    VAULT_PASSWORD_ENTRY,
    verifyVaultPassword,
} from "./safe-mode-vault"

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** Bun 会自动加载 server/.env：先隔离上传目标两个变量，保证默认值断言稳定，跑完恢复。 */
const savedTargetEnv = { dir: process.env.SAFE_MODE_PASSWORD_DIR, file: process.env.SAFE_MODE_PASSWORD_FILE }
beforeEach(() => {
    // Bun 下 delete process.env 不生效，赋空串隔离（空串即视为未配置）
    process.env.SAFE_MODE_PASSWORD_DIR = ""
    process.env.SAFE_MODE_PASSWORD_FILE = ""
})
afterAll(() => {
    process.env.SAFE_MODE_PASSWORD_DIR = savedTargetEnv.dir ?? ""
    process.env.SAFE_MODE_PASSWORD_FILE = savedTargetEnv.file ?? ""
})

/** 从 zip 尾部定位 EOCD 并解析中央目录，返回条目摘要（校验结构完整性）。 */
function parseCentralDirectory(zip: Uint8Array): Array<{ name: string; crc: number; size: number }> {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    let eocd = -1
    for (let offset = zip.length - 22; offset >= 0; offset--) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            eocd = offset
            break
        }
    }
    if (eocd < 0) {
        throw new Error("缺少 EOCD 记录")
    }
    const count = view.getUint16(eocd + 10, true)
    let offset = view.getUint32(eocd + 16, true)
    const entries: Array<{ name: string; crc: number; size: number }> = []
    for (let index = 0; index < count; index++) {
        if (view.getUint32(offset, true) !== 0x02014b50) {
            throw new Error("中央目录签名错误")
        }
        const crc = view.getUint32(offset + 16, true)
        const size = view.getUint32(offset + 20, true)
        const nameLength = view.getUint16(offset + 28, true)
        const name = textDecoder.decode(zip.slice(offset + 46, offset + 46 + nameLength))
        entries.push({ name, crc, size })
        offset += 46 + nameLength
    }
    return entries
}

describe("generateVaultPassword", () => {
    it("格式为 4-4-4-4 分组且字符集无混淆字符", () => {
        const password = generateVaultPassword()
        expect(password).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
        expect(password).not.toMatch(/[01ILO]/)
    })

    it("每次生成均不同", () => {
        expect(generateVaultPassword()).not.toBe(generateVaultPassword())
    })
})

describe("crc32", () => {
    it("标准校验向量", () => {
        expect(crc32(textEncoder.encode("123456789"))).toBe(0xcbf43926)
    })
})

describe("createStoredZip", () => {
    it("中央目录与 CRC 一致，系统解包能还原内容", async () => {
        const payload = textEncoder.encode("password=K7QW-9M2X-6TFA-8HBD\n")
        const zip = createStoredZip([{ name: VAULT_PASSWORD_ENTRY, data: payload }])
        expect(zip[0]).toBe(0x50)
        expect(zip[1]).toBe(0x4b)

        const entries = parseCentralDirectory(zip)
        expect(entries).toHaveLength(1)
        expect(entries[0].name).toBe(VAULT_PASSWORD_ENTRY)
        expect(entries[0].size).toBe(payload.length)
        expect(entries[0].crc).toBe(crc32(payload))

        const dir = await mkdtemp(join(tmpdir(), "vault-zip-"))
        try {
            const zipPath = join(dir, "recovery.zip")
            await writeFile(zipPath, zip)
            const proc = Bun.spawnSync(["unzip", "-p", zipPath, VAULT_PASSWORD_ENTRY])
            if (proc.exitCode === 0) {
                expect(Buffer.from(proc.stdout).toString("utf-8")).toBe(Buffer.from(payload).toString("utf-8"))
            }
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})

describe("buildVaultZip", () => {
    it("包内写明本次密码", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-build-"))
        try {
            const zipPath = join(dir, "recovery.zip")
            await writeFile(zipPath, buildVaultZip("K7QW-9M2X-6TFA-8HBD", Date.now()))
            const proc = Bun.spawnSync(["unzip", "-p", zipPath, VAULT_PASSWORD_ENTRY])
            if (proc.exitCode === 0) {
                expect(Buffer.from(proc.stdout).toString("utf-8")).toContain("password=K7QW-9M2X-6TFA-8HBD")
            } else {
                const entries = parseCentralDirectory(buildVaultZip("K7QW-9M2X-6TFA-8HBD", Date.now()))
                expect(entries[0].name).toBe(VAULT_PASSWORD_ENTRY)
            }
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})

describe("readVaultTargetConfig / resolveVaultDirFid", () => {
    it("空目录回退根目录，空文件名回退默认值", () => {
        expect(readVaultTargetConfig({} as NodeJS.ProcessEnv)).toEqual({ dir: "", fileName: "密码.zip" })
        expect(readVaultTargetConfig({ SAFE_MODE_PASSWORD_DIR: "  ", SAFE_MODE_PASSWORD_FILE: "pw.zip" } as NodeJS.ProcessEnv)).toEqual({
            dir: "",
            fileName: "pw.zip",
        })
    })

    it("空与 0 解析为根目录 fid", async () => {
        const neverCalled = (() => {
            throw new Error("不应调用客户端")
        }) as unknown as QuarkClient
        await expect(resolveVaultDirFid(neverCalled, "")).resolves.toBe("0")
        await expect(resolveVaultDirFid(neverCalled, "0")).resolves.toBe("0")
    })

    it("32 位 hex 按 fid 直用", async () => {
        const neverCalled = (() => {
            throw new Error("不应调用客户端")
        }) as unknown as QuarkClient
        await expect(resolveVaultDirFid(neverCalled, "23833d7b215c492ab1091964d031100c")).resolves.toBe("23833d7b215c492ab1091964d031100c")
    })

    it("路径经 createDir 幂等建目录后拿 fid", async () => {
        const fakeClient = {
            createDir: async (dirPath: string) => {
                expect(dirPath).toBe("dna-builder/safe-mode")
                return { fid: "dir-9", full_path: "夸克网盘/dna-builder/safe-mode" }
            },
        } as unknown as QuarkClient
        await expect(resolveVaultDirFid(fakeClient, "/dna-builder/safe-mode")).resolves.toBe("dir-9")
    })
})

describe("extractStoredZipEntry / parseVaultPasswordText", () => {
    it("打包解包往返并解析出密码", () => {
        const zip = buildVaultZip("K7QW-9M2X-6TFA-8HBD", 1750000000000)
        const body = extractStoredZipEntry(zip, VAULT_PASSWORD_ENTRY)
        expect(parseVaultPasswordText(body)).toBe("K7QW-9M2X-6TFA-8HBD")
    })

    it("条目名不符或内容损坏时抛错", () => {
        const zip = buildVaultZip("K7QW-9M2X-6TFA-8HBD", 1750000000000)
        expect(() => extractStoredZipEntry(zip, "other.txt")).toThrow()
        const broken = Uint8Array.from(zip)
        broken[40] ^= 0xff
        expect(() => extractStoredZipEntry(broken, VAULT_PASSWORD_ENTRY)).toThrow()
        expect(() => parseVaultPasswordText(new TextEncoder().encode("no password here\n"))).toThrow()
    })
})

describe("isVaultDuplicateName / isInVaultDir", () => {
    it("精确同名与 (N) 改名副本均视为旧件", () => {
        expect(isVaultDuplicateName("密码.zip", "密码.zip")).toBe(true)
        expect(isVaultDuplicateName("密码(1).zip", "密码.zip")).toBe(true)
        expect(isVaultDuplicateName("密码(12).zip", "密码.zip")).toBe(true)
        expect(isVaultDuplicateName("密码1.zip", "密码.zip")).toBe(false)
        expect(isVaultDuplicateName("密码(1.zip", "密码.zip")).toBe(false)
        expect(isVaultDuplicateName("密码（1）.zip", "密码.zip")).toBe(false)
        expect(isVaultDuplicateName("其他.zip", "密码.zip")).toBe(false)
    })

    it("根目录严格匹配 parent 0，不再匹配全盘", () => {
        expect(isInVaultDir("0", "0")).toBe(true)
        expect(isInVaultDir("dir-other", "0")).toBe(false)
        expect(isInVaultDir("dir-9", "dir-9")).toBe(true)
        expect(isInVaultDir("dir-other", "dir-9")).toBe(false)
    })
})

describe("checkVaultConsistency", () => {
    it("远端包与本地一致时通过并回写校验结论", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-check-ok-"))
        const statePath = join(dir, "safe-mode-vault.json")
        try {
            let uploadedBytes: Uint8Array | null = null
            const fakeClient = {
                uploadBuffer: async (_name: string, data: Uint8Array) => {
                    uploadedBytes = data
                    return { fid: "fid-1", fileName: "pw.zip", size: data.length }
                },
                searchFiles: async () => [{ fid: "fid-1", filename: "pw.zip", parent_fid: "0", file_type: 1, size: 1 }],
                downloadFile: async () => {
                    if (!uploadedBytes) throw new Error("未上传")
                    return uploadedBytes
                },
            } as unknown as QuarkClient
            const { status } = await rotateVault(fakeClient, statePath)
            expect(status.fileName).toBe(DEFAULT_VAULT_FILE_NAME)
            const result = await checkVaultConsistency(
                {
                    ...fakeClient,
                    searchFiles: async () => [{ fid: "fid-1", filename: status.fileName, parent_fid: "0", file_type: 1, size: 1 }],
                } as unknown as QuarkClient,
                statePath
            )
            expect(result).toMatchObject({ ok: true, reason: "ok" })
            const state = await readVaultState(statePath)
            expect(state?.consistent).toBe(true)
            expect(typeof state?.lastCheckedAt).toBe("number")
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it("搜索排第一的是旧包时仍以落盘 fid 为准，不误报 password-mismatch", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-check-fid-"))
        const statePath = join(dir, "safe-mode-vault.json")
        try {
            let uploadedBytes: Uint8Array | null = null
            const seedClient = {
                uploadBuffer: async (_name: string, data: Uint8Array) => {
                    uploadedBytes = data
                    return { fid: "fid-new", fileName: "pw.zip", size: data.length }
                },
                searchFiles: async () => [],
                deleteFilesAndWait: async () => {},
            } as unknown as QuarkClient
            const { status } = await rotateVault(seedClient, statePath)
            const staleZip = buildVaultZip("AAAAAAAAAAAAAAAA", Date.now())
            const checkClient = {
                // 搜索把 10-15 旧包排在前面（复现线上 bug），fid 直下拿到的是本次新包
                searchFiles: async () => [
                    { fid: "fid-stale", filename: status.fileName, parent_fid: "0", file_type: 1, size: staleZip.length },
                    { fid: "fid-new", filename: status.fileName, parent_fid: "0", file_type: 1, size: 1 },
                ],
                downloadFile: async (fid: string) => {
                    if (fid === "fid-new") {
                        if (!uploadedBytes) throw new Error("未上传")
                        return uploadedBytes
                    }
                    return staleZip
                },
            } as unknown as QuarkClient
            const result = await checkVaultConsistency(checkClient, statePath)
            expect(result).toMatchObject({ ok: true, reason: "ok" })
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it("fid 文件被删后在多个同名候选中找到密码一致的包并修正指向", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-check-fallback-"))
        const statePath = join(dir, "safe-mode-vault.json")
        try {
            let uploadedBytes: Uint8Array | null = null
            const seedClient = {
                uploadBuffer: async (_name: string, data: Uint8Array) => {
                    uploadedBytes = data
                    return { fid: "fid-gone", fileName: "pw.zip", size: data.length }
                },
                searchFiles: async () => [],
                deleteFilesAndWait: async () => {},
            } as unknown as QuarkClient
            const { status } = await rotateVault(seedClient, statePath)
            if (!uploadedBytes) throw new Error("未上传")
            const goodBytes: Uint8Array = uploadedBytes
            const staleZip = buildVaultZip("AAAAAAAAAAAAAAAA", Date.now())
            const checkClient = {
                searchFiles: async () => [
                    { fid: "fid-stale", filename: status.fileName, parent_fid: "0", file_type: 1, size: staleZip.length },
                    { fid: "fid-moved", filename: status.fileName, parent_fid: "0", file_type: 1, size: goodBytes.length },
                ],
                downloadFile: async (fid: string) => {
                    if (fid === "fid-gone") throw new Error("文件已删除")
                    if (fid === "fid-moved") return goodBytes
                    return staleZip
                },
            } as unknown as QuarkClient
            const result = await checkVaultConsistency(checkClient, statePath)
            expect(result).toMatchObject({ ok: true, reason: "ok" })
            expect((await readVaultState(statePath))?.fid).toBe("fid-moved")
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it("远端密码对不上时报 password-mismatch", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-check-bad-"))
        const statePath = join(dir, "safe-mode-vault.json")
        try {
            const seedClient = {
                uploadBuffer: async () => ({ fid: "fid-1", fileName: "pw.zip", size: 1 }),
                searchFiles: async () => [],
                deleteFilesAndWait: async () => {},
            } as unknown as QuarkClient
            const { status } = await rotateVault(seedClient, statePath)
            const checkClient = {
                searchFiles: async () => [{ fid: "fid-1", filename: status.fileName, parent_fid: "0", file_type: 1, size: 1 }],
                downloadFile: async () => buildVaultZip("AAAAAAAAAAAAAAAA", Date.now()),
            } as unknown as QuarkClient
            const result = await checkVaultConsistency(checkClient, statePath)
            expect(result).toMatchObject({ ok: false, reason: "password-mismatch" })
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it("远端文件缺失时报 missing-remote", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-check-missing-"))
        const statePath = join(dir, "safe-mode-vault.json")
        try {
            const seedClient = {
                uploadBuffer: async () => ({ fid: "fid-1", fileName: "pw.zip", size: 1 }),
                searchFiles: async () => [],
                deleteFilesAndWait: async () => {},
            } as unknown as QuarkClient
            await rotateVault(seedClient, statePath)
            const checkClient = { searchFiles: async () => [] } as unknown as QuarkClient
            const result = await checkVaultConsistency(checkClient, statePath)
            expect(result).toMatchObject({ ok: false, reason: "missing-remote" })
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})

describe("removeExistingVaultFile", () => {
    it("同目录同名旧文件先删再传，避免网盘自动改名", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-overwrite-"))
        const statePath = join(dir, "safe-mode-vault.json")
        try {
            const deleted: string[][] = []
            const calls: string[] = []
            const fakeClient = {
                searchFiles: async () => [{ fid: "fid-old", filename: DEFAULT_VAULT_FILE_NAME, parent_fid: "0", file_type: 1, size: 10 }],
                deleteFilesAndWait: async (fidList: string[]) => {
                    deleted.push(fidList)
                },
                uploadBuffer: async () => {
                    calls.push(`upload-after-delete-${deleted.length}`)
                    return { fid: "fid-new", fileName: DEFAULT_VAULT_FILE_NAME, size: 1 }
                },
            } as unknown as QuarkClient
            await rotateVault(fakeClient, statePath)
            expect(deleted).toEqual([["fid-old"]])
            expect(calls).toEqual(["upload-after-delete-1"])
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it("目标目录内的 (N) 改名副本一并删除，其他目录的不动", async () => {
        const deleted: string[][] = []
        const fakeClient = {
            searchFiles: async () => [
                { fid: "fid-old", filename: DEFAULT_VAULT_FILE_NAME, parent_fid: "dir-9", file_type: 1, size: 10 },
                { fid: "fid-n1", filename: "密码(1).zip", parent_fid: "dir-9", file_type: 1, size: 10 },
                { fid: "fid-n2", filename: "密码(2).zip", parent_fid: "dir-9", file_type: 1, size: 10 },
                { fid: "fid-other", filename: DEFAULT_VAULT_FILE_NAME, parent_fid: "dir-other", file_type: 1, size: 10 },
                { fid: "fid-other-n", filename: "密码(1).zip", parent_fid: "dir-other", file_type: 1, size: 10 },
            ],
            deleteFilesAndWait: async (fidList: string[]) => {
                deleted.push(fidList)
            },
        } as unknown as QuarkClient
        await removeExistingVaultFile(fakeClient, { dirFid: "dir-9", fileName: DEFAULT_VAULT_FILE_NAME })
        expect(deleted).toEqual([["fid-old", "fid-n1", "fid-n2"]])
    })

    it("根目录只删 parent 为 0 的旧件，不删其他目录同名文件", async () => {
        const deleted: string[][] = []
        const fakeClient = {
            searchFiles: async () => [
                { fid: "fid-root", filename: DEFAULT_VAULT_FILE_NAME, parent_fid: "0", file_type: 1, size: 10 },
                { fid: "fid-root-n", filename: "密码(1).zip", parent_fid: "0", file_type: 1, size: 10 },
                { fid: "fid-other", filename: DEFAULT_VAULT_FILE_NAME, parent_fid: "dir-other", file_type: 1, size: 10 },
            ],
            deleteFilesAndWait: async (fidList: string[]) => {
                deleted.push(fidList)
            },
        } as unknown as QuarkClient
        await removeExistingVaultFile(fakeClient, { dirFid: "0", fileName: DEFAULT_VAULT_FILE_NAME })
        expect(deleted).toEqual([["fid-root", "fid-root-n"]])
    })

    it("不同目录的同名文件不删", async () => {
        let deleted = 0
        const fakeClient = {
            searchFiles: async () => [
                { fid: "fid-other-dir", filename: DEFAULT_VAULT_FILE_NAME, parent_fid: "dir-other", file_type: 1, size: 10 },
            ],
            deleteFilesAndWait: async () => {
                deleted++
            },
        } as unknown as QuarkClient
        await removeExistingVaultFile(fakeClient, { dirFid: "dir-9", fileName: DEFAULT_VAULT_FILE_NAME })
        expect(deleted).toBe(0)
    })

    it("无旧文件时直接上传", async () => {
        let deleted = 0
        const fakeClient = {
            searchFiles: async () => [],
            deleteFilesAndWait: async () => {
                deleted++
            },
        } as unknown as QuarkClient
        await removeExistingVaultFile(fakeClient, { dirFid: "0", fileName: DEFAULT_VAULT_FILE_NAME })
        expect(deleted).toBe(0)
    })

    it("搜索失败时不中断上传", async () => {
        const fakeClient = {
            searchFiles: async () => {
                throw new Error("网络异常")
            },
            deleteFilesAndWait: async () => {
                throw new Error("不应调用删除")
            },
        } as unknown as QuarkClient
        await removeExistingVaultFile(fakeClient, { dirFid: "0", fileName: DEFAULT_VAULT_FILE_NAME })
    })
})

describe("rotateVault / verifyVaultPassword", () => {
    it("轮换后正确密码通过、错误密码拒绝，且落盘无明文", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-state-"))
        const statePath = join(dir, "safe-mode-vault.json")
        const fakeClient = {
            uploadBuffer: async () => ({ fid: "fid-vault", fileName: "recovery.zip", size: 123 }),
            searchFiles: async () => [],
            deleteFilesAndWait: async () => {},
        } as unknown as QuarkClient

        const { password, status } = await rotateVault(fakeClient, statePath)
        expect(password).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
        expect(status.fid).toBe("fid-vault")

        await expect(verifyVaultPassword(password, statePath)).resolves.toBe(true)
        await expect(verifyVaultPassword("WRONG-PASSWORD", statePath)).resolves.toBe(false)

        const raw = await Bun.file(statePath).text()
        expect(raw).not.toContain(password)

        const state = await readVaultState(statePath)
        expect(state?.passwordHash).toMatch(/^\$2[aby]\$/)
    })

    it("无状态文件时校验返回 false", async () => {
        const dir = await mkdtemp(join(tmpdir(), "vault-empty-"))
        try {
            await expect(verifyVaultPassword("anything", join(dir, "missing.json"))).resolves.toBe(false)
            await expect(readVaultState(join(dir, "missing.json"))).resolves.toBeNull()
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})
