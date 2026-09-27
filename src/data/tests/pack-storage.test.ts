import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createPackDirectoryHandle,
    getPackStorageRoot,
    isPackStorageAvailable,
    PACK_STORAGE_BACKEND_KEY,
    type PackDirectoryHandle,
    type PackStorageRecord,
    type PackStorageStore,
    resetPackStorageBackendCache,
    resolvePackStorageBackend,
} from "../pack-storage"

/**
 * 被 mock 的 Dexie 记录表：表名 → (主键 → 行)。
 * 断言可以直接读它，确认数据确实经由 IndexedDB 实现落库。
 */
const dexieState = vi.hoisted(() => ({
    rows: new Map<string, Map<string, unknown>>(),
}))

vi.mock("dexie", () => {
    /** 满足 pack-storage 用到的表操作：get / put / bulkDelete / toCollection().primaryKeys() */
    class MockTable {
        constructor(private readonly name: string) {}

        private get rows(): Map<string, unknown> {
            let rows = dexieState.rows.get(this.name)
            if (!rows) {
                rows = new Map()
                dexieState.rows.set(this.name, rows)
            }
            return rows
        }

        async get(key: string): Promise<unknown> {
            return this.rows.get(key)
        }

        async put(row: { key: string }): Promise<void> {
            this.rows.set(row.key, row)
        }

        async bulkDelete(keys: string[]): Promise<void> {
            for (const key of keys) {
                this.rows.delete(key)
            }
        }

        toCollection(): { primaryKeys(): Promise<string[]> } {
            const rows = this.rows
            return {
                async primaryKeys() {
                    return [...rows.keys()]
                },
            }
        }
    }

    class MockDexie {
        [table: string]: unknown

        constructor(readonly dbName: string) {}

        version(): { stores(schema: Record<string, string>): void } {
            return {
                stores: schema => {
                    for (const tableName of Object.keys(schema)) {
                        this[tableName] = new MockTable(`${this.dbName}/${tableName}`)
                    }
                },
            }
        }

        async open(): Promise<void> {}
    }

    return { default: MockDexie }
})

/** 内存键值存储：替代 IndexedDB 实现，让句柄语义可以在 node 里直接测试 */
function createMemoryStore(): PackStorageStore {
    const records = new Map<string, PackStorageRecord>()

    return {
        async get(key) {
            return records.get(key) ?? null
        },
        async put(key, record) {
            records.set(key, record)
        },
        async remove(keys) {
            for (const key of keys) {
                records.delete(key)
            }
        },
        async listKeys() {
            return [...records.keys()]
        },
    }
}

/**
 * 构造内存版 OPFS 根目录（getDirectoryHandle/getFileHandle/removeEntry 全可写），
 * 用来模拟支持完整的浏览器（Chrome / Edge / WebView2）。
 * @returns 根目录句柄与内部文件表
 */
function createFakeOpfsRoot(): { root: unknown; files: Map<string, Uint8Array> } {
    const files = new Map<string, Uint8Array>()

    /**
     * 创建指定前缀的目录对象。
     * @param prefix 目录路径前缀
     * @returns 目录对象
     */
    function createDirectory(prefix: string) {
        return {
            async getDirectoryHandle(name: string) {
                return createDirectory(`${prefix}${name}/`)
            },
            async getFileHandle(name: string) {
                const key = `${prefix}${name}`
                return {
                    async createWritable() {
                        let bytes = new Uint8Array()
                        return {
                            async write(data: ArrayBuffer) {
                                bytes = new Uint8Array(data)
                            },
                            async close() {
                                files.set(key, bytes)
                            },
                        }
                    },
                    async getFile() {
                        return { size: files.get(key)?.byteLength ?? 0 }
                    },
                }
            },
            async removeEntry(name: string) {
                for (const key of [...files.keys()]) {
                    if (key.startsWith(`${prefix}${name}`)) {
                        files.delete(key)
                    }
                }
            },
        }
    }

    return { root: createDirectory(""), files }
}

/**
 * 构造「Safari 15.2 ~ 25」式 OPFS：目录/文件句柄都在，唯独没有 createWritable。
 * @returns 根目录句柄
 */
function createSafariLikeOpfsRoot(): unknown {
    return {
        async getDirectoryHandle() {
            return {
                async getFileHandle() {
                    return {
                        async getFile() {
                            return { size: 0 }
                        },
                    }
                },
            }
        },
        async removeEntry() {},
    }
}

/**
 * 写入一段文本，等价于 data-pack.ts 里的 writeTextFile。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @param content 文本内容
 */
async function writeText(directory: PackDirectoryHandle, fileName: string, content: string): Promise<void> {
    const handle = await directory.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(new TextEncoder().encode(content).buffer as ArrayBuffer)
    await writable.close()
}

/**
 * 读取一段文本。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @returns 文本内容
 */
async function readText(directory: PackDirectoryHandle, fileName: string): Promise<string> {
    const handle = await directory.getFileHandle(fileName, { create: false })
    return (await handle.getFile()).text()
}

describe("createPackDirectoryHandle", () => {
    let store: PackStorageStore
    let root: PackDirectoryHandle

    beforeEach(() => {
        store = createMemoryStore()
        root = createPackDirectoryHandle(store)
    })

    it("创建目录后只枚举直接子项", async () => {
        const pack = await root.getDirectoryHandle("dna-builder-data-pack", { create: true })
        const version = await pack.getDirectoryHandle("1.6.207.5", { create: true })
        const modules = await version.getDirectoryHandle("modules", { create: true })
        await writeText(version, "manifest.json", '{"version":"1.6.207.5"}')
        await writeText(modules, "char.data.msgpack", "bin")

        expect((await pack.entries().next()).done).toBe(false)
        await expect(collect(root)).resolves.toEqual([["dna-builder-data-pack", { kind: "directory" }]])
        await expect(collect(pack)).resolves.toEqual([["1.6.207.5", { kind: "directory" }]])
        await expect(collect(version)).resolves.toEqual([
            ["manifest.json", { kind: "file" }],
            ["modules", { kind: "directory" }],
        ])
        await expect(collect(modules)).resolves.toEqual([["char.data.msgpack", { kind: "file" }]])
    })

    it("create:false 时读取不存在的目录与文件会抛 NotFoundError", async () => {
        await expect(root.getDirectoryHandle("nope")).rejects.toMatchObject({ name: "NotFoundError" })
        await expect(root.getFileHandle("nope.txt")).rejects.toMatchObject({ name: "NotFoundError" })
        await expect(root.removeEntry("nope")).rejects.toMatchObject({ name: "NotFoundError" })
    })

    it("写入的文件可以读回内容、文件名与修改时间", async () => {
        const version = await root.getDirectoryHandle("v1", { create: true })
        await writeText(version, "installed.json", '{"version":"v1"}')

        expect(await readText(version, "installed.json")).toBe('{"version":"v1"}')

        const handle = await version.getFileHandle("installed.json", { create: false })
        const file = await handle.getFile()
        expect(handle.name).toBe("installed.json")
        expect(handle.kind).toBe("file")
        expect(file.name).toBe("installed.json")
        expect(file.size).toBe(16)
        expect(file.lastModified).toBeGreaterThan(0)
    })

    it("create:true 会立即落一个空文件（与 OPFS 一致）", async () => {
        const dir = await root.getDirectoryHandle("v1", { create: true })
        const handle = await dir.getFileHandle("package.zip", { create: true })

        expect((await handle.getFile()).size).toBe(0)
    })

    it("写入流按顺序合并分块，close 之后不可再写", async () => {
        const dir = await root.getDirectoryHandle("v1", { create: true })
        const writable = await (await dir.getFileHandle("a.txt", { create: true })).createWritable()
        await writable.write(new TextEncoder().encode("ab").buffer as ArrayBuffer)
        await writable.write("cd")
        await writable.close()
        await expect(writable.close()).resolves.toBeUndefined()
        await expect(writable.write("ef")).rejects.toThrow("写入流已关闭")

        expect(await readText(dir, "a.txt")).toBe("abcd")
    })

    it("同名目录与文件混用会抛 TypeMismatchError", async () => {
        const dir = await root.getDirectoryHandle("v1", { create: true })
        await dir.getDirectoryHandle("modules", { create: true })
        await writeText(dir, "installed.json", "{}")

        await expect(dir.getFileHandle("modules", { create: true })).rejects.toMatchObject({ name: "TypeMismatchError" })
        await expect(dir.getDirectoryHandle("installed.json", { create: true })).rejects.toMatchObject({ name: "TypeMismatchError" })
    })

    it("非空目录不能非递归删除，递归删除会清掉整棵子树", async () => {
        const pack = await root.getDirectoryHandle("dna-builder-data-pack", { create: true })
        const version = await pack.getDirectoryHandle("v1", { create: true })
        const modules = await version.getDirectoryHandle("modules", { create: true })
        await writeText(modules, "char.data.msgpack", "bin")

        await expect(pack.removeEntry("v1")).rejects.toMatchObject({ name: "InvalidModificationError" })
        await pack.removeEntry("v1", { recursive: true })

        await expect(collect(pack)).resolves.toEqual([])
        await expect(version.getFileHandle("modules")).rejects.toMatchObject({ name: "NotFoundError" })
        await expect(modules.getFileHandle("char.data.msgpack")).rejects.toMatchObject({ name: "NotFoundError" })
    })

    it("删除单个文件后目录与其它文件仍在", async () => {
        const version = await root.getDirectoryHandle("v1", { create: true })
        await writeText(version, "installed.json", "{}")
        await writeText(version, "package.zip", "zip")

        await version.removeEntry("installed.json")

        await expect(collect(version)).resolves.toEqual([["package.zip", { kind: "file" }]])
        await expect(root.getDirectoryHandle("v1")).resolves.toBeTruthy()
    })

    it("拒绝空名、相对路径与含分隔符的名字", async () => {
        await expect(root.getDirectoryHandle("")).rejects.toThrow(TypeError)
        await expect(root.getFileHandle("..")).rejects.toThrow(TypeError)
        await expect(root.getDirectoryHandle("a/b")).rejects.toThrow(TypeError)
    })

    it("asyncIterator 与 entries 结果一致", async () => {
        const dir = await root.getDirectoryHandle("v1", { create: true })
        await writeText(dir, "b.txt", "b")
        await writeText(dir, "a.txt", "a")
        await dir.getDirectoryHandle("modules", { create: true })

        const viaEntries: [string, { kind: string }][] = []
        for await (const entry of dir.entries()) {
            viaEntries.push(entry)
        }

        await expect(collect(dir)).resolves.toEqual(viaEntries)
        expect(viaEntries).toEqual([
            ["a.txt", { kind: "file" }],
            ["b.txt", { kind: "file" }],
            ["modules", { kind: "directory" }],
        ])
    })
})

describe("存储后端解析", () => {
    let backendStorage: Map<string, string>

    beforeEach(() => {
        resetPackStorageBackendCache()
        for (const rows of dexieState.rows.values()) {
            rows.clear()
        }
        backendStorage = new Map()
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => backendStorage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                backendStorage.set(key, value)
            },
        })
        vi.spyOn(console, "warn").mockImplementation(() => {})
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it("既没有 OPFS 也没有 IndexedDB 时判定为不可用", async () => {
        await expect(isPackStorageAvailable()).resolves.toBe(false)
        await expect(getPackStorageRoot()).rejects.toThrow("不支持数据包存储")
    })

    it("OPFS 完全可用时优先使用 OPFS 并记住该选择", async () => {
        const { root } = createFakeOpfsRoot()
        vi.stubGlobal("navigator", { storage: { getDirectory: async () => root } })
        vi.stubGlobal("indexedDB", {})

        await expect(resolvePackStorageBackend()).resolves.toBe("opfs")
        expect(backendStorage.get(PACK_STORAGE_BACKEND_KEY)).toBe("opfs")
        await expect(getPackStorageRoot()).resolves.toBeTruthy()
    })

    it("OPFS 有 API 但不能写入时回退 IndexedDB（Safari 场景）", async () => {
        vi.stubGlobal("navigator", { storage: { getDirectory: async () => createSafariLikeOpfsRoot() } })
        vi.stubGlobal("indexedDB", {})

        await expect(resolvePackStorageBackend()).resolves.toBe("indexeddb")
        expect(backendStorage.get(PACK_STORAGE_BACKEND_KEY)).toBe("indexeddb")
    })

    it("IndexedDB 后端把目录与文件写进记录表", async () => {
        vi.stubGlobal("navigator", { storage: { getDirectory: async () => createSafariLikeOpfsRoot() } })
        vi.stubGlobal("indexedDB", {})

        const root = await getPackStorageRoot()
        const pack = await root.getDirectoryHandle("dna-builder-data-pack", { create: true })
        const version = await pack.getDirectoryHandle("1.6.207.5", { create: true })
        await writeText(version, "installed.json", '{"version":"1.6.207.5"}')

        const rows = dexieState.rows.get("dna-builder-pack/records")
        expect([...(rows?.keys() ?? [])].sort()).toEqual([
            "dna-builder-data-pack",
            "dna-builder-data-pack/1.6.207.5",
            "dna-builder-data-pack/1.6.207.5/installed.json",
        ])
        expect(await readText(version, "installed.json")).toBe('{"version":"1.6.207.5"}')

        await pack.removeEntry("1.6.207.5", { recursive: true })
        expect([...(rows?.keys() ?? [])]).toEqual(["dna-builder-data-pack"])
    })

    it("localStorage 指定 indexeddb 时即使 OPFS 可用也走 IndexedDB", async () => {
        const { root, files } = createFakeOpfsRoot()
        backendStorage.set(PACK_STORAGE_BACKEND_KEY, "indexeddb")
        vi.stubGlobal("navigator", { storage: { getDirectory: async () => root } })
        vi.stubGlobal("indexedDB", {})

        await expect(resolvePackStorageBackend()).resolves.toBe("indexeddb")

        const storageRoot = await getPackStorageRoot()
        await writeText(await storageRoot.getDirectoryHandle("probe", { create: true }), "a.txt", "a")
        expect(files.size).toBe(0)
    })

    it("记住的后端不可用时回退到另一个后端", async () => {
        backendStorage.set(PACK_STORAGE_BACKEND_KEY, "opfs")
        vi.stubGlobal("navigator", { storage: { getDirectory: async () => createSafariLikeOpfsRoot() } })
        vi.stubGlobal("indexedDB", {})

        await expect(resolvePackStorageBackend()).resolves.toBe("indexeddb")
        expect(backendStorage.get(PACK_STORAGE_BACKEND_KEY)).toBe("indexeddb")
    })

    it("IndexedDB 不可用时仍使用可写的 OPFS", async () => {
        const { root } = createFakeOpfsRoot()
        backendStorage.set(PACK_STORAGE_BACKEND_KEY, "indexeddb")
        vi.stubGlobal("navigator", { storage: { getDirectory: async () => root } })

        await expect(resolvePackStorageBackend()).resolves.toBe("opfs")
        expect(backendStorage.get(PACK_STORAGE_BACKEND_KEY)).toBe("opfs")
    })
})

/**
 * 收集目录句柄的全部直接子项。
 * @param directory 目录句柄
 * @returns 子项列表
 */
async function collect(directory: PackDirectoryHandle): Promise<[string, { kind: string }][]> {
    const entries: [string, { kind: string }][] = []
    for await (const entry of directory) {
        entries.push(entry)
    }
    return entries
}
