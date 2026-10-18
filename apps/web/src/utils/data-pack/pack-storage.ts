/**
 * 数据包存储层：优先使用 OPFS，不可用时回退 IndexedDB。
 *
 * 「浏览器支持 OPFS」不能只看 `navigator.storage.getDirectory` 是否存在：
 * Safari 15.2 起就提供了该方法与目录/文件句柄，但 `FileSystemFileHandle.createWritable()`
 * 直到 Safari 26 才实现，于是 Safari 上「能建目录、写文件必抛错」，
 * 数据包（以及依赖它的全部游戏数据）直接不可用。
 *
 * 因此这里：
 * 1. 用一次真实写入做能力探测（而不是判断 API 存在性）；
 * 2. 探测失败时把同一套目录/文件语义实现在 IndexedDB 上，键为 "/" 分隔的完整路径，
 *    目录记录与文件记录同库存储；
 * 3. 对上层暴露与 `FileSystemDirectoryHandle` 同形的句柄，
 *    调用方（data-pack.ts）无需关心数据最终落在哪里。
 */

import type { Table } from "dexie"
import Dexie from "dexie"

/** 数据包存储后端 */
export type PackStorageBackend = "opfs" | "indexeddb"

/** 目录项类型（与 FileSystemHandle.kind 取值一致） */
export type PackEntryKind = "file" | "directory"

/** 目录迭代产出的子项 */
export interface PackDirectoryEntry {
    kind: PackEntryKind
}

/** 文件写入流（只用到 write/close，与 FileSystemWritableFileStream 同形） */
export interface PackFileWritable {
    write(data: ArrayBuffer | Blob | string): Promise<void>
    close(): Promise<void>
}

/** 文件句柄（与 FileSystemFileHandle 同形的最小集合） */
export interface PackFileHandle {
    readonly kind: "file"
    readonly name: string
    getFile(): Promise<File>
    createWritable(): Promise<PackFileWritable>
}

/** 目录句柄（与 FileSystemDirectoryHandle 同形的最小集合） */
export interface PackDirectoryHandle {
    readonly kind: "directory"
    readonly name: string
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<PackDirectoryHandle>
    getFileHandle(name: string, options?: { create?: boolean }): Promise<PackFileHandle>
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
    entries(): AsyncIterableIterator<[string, PackDirectoryEntry]>
    [Symbol.asyncIterator](): AsyncIterableIterator<[string, PackDirectoryEntry]>
}

/** 键值记录：目录只占位，文件额外保存内容与写入时间 */
export type PackStorageRecord = { kind: "directory" } | { kind: "file"; blob: Blob; updatedAt: number }

/**
 * 键值存储接口，目录/文件语义建立在这一层之上。
 * IndexedDB 实现与单测里的内存实现共用它，所以句柄逻辑无需真实数据库即可测试。
 */
export interface PackStorageStore {
    get(key: string): Promise<PackStorageRecord | null>
    put(key: string, record: PackStorageRecord): Promise<void>
    remove(keys: string[]): Promise<void>
    listKeys(): Promise<string[]>
}

/** IndexedDB 数据库名（与业务库 dna 分开，便于整体清理与容量排查） */
const INDEXEDDB_NAME = "dna-builder-pack"

/** IndexedDB 记录表名 */
const INDEXEDDB_TABLE = "records"

/** localStorage 中记录/覆盖存储后端的键，取值 "opfs" | "indexeddb" */
export const PACK_STORAGE_BACKEND_KEY = "dna-builder:pack-storage-backend"

/** OPFS 写入探测用的目录名前缀（后面拼随机串，避免多标签页互相删掉对方的探针） */
const OPFS_PROBE_DIR_PREFIX = ".dna-builder-storage-probe"

/** IndexedDB 写入探测用的记录键 */
const INDEXEDDB_PROBE_KEY = ".probe"

/** Dexie 记录行 */
interface PackRecordRow {
    key: string
    kind: PackEntryKind
    blob?: Blob
    updatedAt?: number
}

interface PackStorageDatabase extends Dexie {
    records: Table<PackRecordRow, string>
}

/** 数据库连接缓存（供同一次页面生命周期内复用） */
let databasePromise: Promise<PackStorageDatabase> | null = null

/** 探测结果缓存：同一次页面生命周期内只探测一次 */
let backendPromise: Promise<PackStorageBackend | null> | null = null
let opfsUsablePromise: Promise<boolean> | null = null
let indexedDbUsablePromise: Promise<boolean> | null = null

/**
 * 拼接父子路径（根路径为空串）。
 * @param parent 父路径
 * @param name 子项名
 * @returns 完整路径
 */
function joinPath(parent: string, name: string): string {
    return parent ? `${parent}/${name}` : name
}

/**
 * 校验路径片段。与 OPFS 一致，拒绝空名、"."、".." 与含分隔符的名字，
 * 避免上层拼出越界的键。
 * @param name 文件/目录名
 */
function assertValidName(name: string): void {
    if (!name || name === "." || name === ".." || name.includes("/")) {
        throw new TypeError(`非法的文件/目录名: ${name}`)
    }
}

/**
 * 构造错误；优先使用与 File System API 同名的 DOMException 名称，便于上层分辨。
 * @param message 错误信息
 * @param name DOMException 名称
 * @returns 错误对象
 */
function createStorageError(message: string, name: string): Error {
    return typeof DOMException === "function" ? new DOMException(message, name) : new Error(message)
}

/**
 * 打开（首次会创建）数据包存储数据库。
 * @returns 数据库连接
 */
function openPackDatabase(): Promise<PackStorageDatabase> {
    if (databasePromise) {
        return databasePromise
    }

    const pending = (async () => {
        const database = new Dexie(INDEXEDDB_NAME) as PackStorageDatabase
        database.version(1).stores({ [INDEXEDDB_TABLE]: "key" })
        await database.open()
        return database
    })()
    databasePromise = pending
    void pending.catch(() => {
        // 打开失败不缓存连接，下次调用可以重试（数据库被别人删除、连接被回收等情况）
        if (databasePromise === pending) {
            databasePromise = null
        }
    })

    return pending
}

/**
 * 用 Dexie 记录表实现键值存储接口。
 * @param database 数据库连接
 * @returns 存储后端
 */
function createIndexedDbStore(database: PackStorageDatabase): PackStorageStore {
    return {
        async get(key) {
            const row = await database.records.get(key)
            if (!row) {
                return null
            }
            if (row.kind !== "file") {
                return { kind: "directory" }
            }
            return { kind: "file", blob: row.blob ?? new Blob([]), updatedAt: row.updatedAt ?? Date.now() }
        },
        async put(key, record) {
            if (record.kind === "file") {
                await database.records.put({ key, kind: "file", blob: record.blob, updatedAt: record.updatedAt })
                return
            }
            await database.records.put({ key, kind: "directory" })
        },
        async remove(keys) {
            if (!keys.length) {
                return
            }
            await database.records.bulkDelete(keys)
        },
        async listKeys() {
            return database.records.toCollection().primaryKeys()
        },
    }
}

/**
 * 基于键值存储构造文件句柄。
 * @param store 存储后端
 * @param path 文件完整路径
 * @param name 文件名
 * @returns 文件句柄
 */
function createPackFileHandle(store: PackStorageStore, path: string, name: string): PackFileHandle {
    return {
        kind: "file",
        name,
        async getFile() {
            const record = await store.get(path)
            if (record?.kind !== "file") {
                throw createStorageError(`文件不存在: ${name}`, "NotFoundError")
            }
            // 返回 File 而不是 Blob：导出数据包需要 lastModified，也会直接 new File([file], ...) 包装
            return new File([record.blob], name, { lastModified: record.updatedAt })
        },
        async createWritable() {
            // 先攒在内存里、close 时一次性落库：数据包是十几 MB 的整包与模块，没必要为每次 write 各开一个事务
            const chunks: (ArrayBuffer | Blob | string)[] = []
            let closed = false

            return {
                async write(data) {
                    if (closed) {
                        throw new Error("写入流已关闭")
                    }
                    chunks.push(data)
                },
                async close() {
                    if (closed) {
                        return
                    }
                    closed = true
                    await store.put(path, { kind: "file", blob: new Blob(chunks), updatedAt: Date.now() })
                },
            }
        },
    }
}

/**
 * 基于键值存储构造目录句柄树。
 * @param store 存储后端
 * @param path 目录路径（根目录为空串）
 * @returns 目录句柄
 */
export function createPackDirectoryHandle(store: PackStorageStore, path = ""): PackDirectoryHandle {
    const name = path ? path.slice(path.lastIndexOf("/") + 1) : ""

    /**
     * 列出直接子项名（跳过更深层级），按名称排序保证结果稳定。
     * @returns 子项名列表
     */
    async function listChildNames(): Promise<string[]> {
        const prefix = path ? `${path}/` : ""
        const names = new Set<string>()
        for (const key of await store.listKeys()) {
            if (!key.startsWith(prefix)) {
                continue
            }
            const rest = key.slice(prefix.length)
            if (!rest || rest.includes("/")) {
                continue
            }
            names.add(rest)
        }
        return [...names].sort((left, right) => left.localeCompare(right))
    }

    /**
     * 列出目标路径下的全部后代键。
     * @param target 目标路径
     * @returns 后代键列表
     */
    async function listDescendantKeys(target: string): Promise<string[]> {
        const prefix = `${target}/`
        return (await store.listKeys()).filter(key => key.startsWith(prefix))
    }

    /**
     * 判断路径是否存在：既有可能是自身记录，也可能只剩后代（目录记录被删过的情况）。
     * @param target 目标路径
     * @returns 是否存在
     */
    async function entryExists(target: string): Promise<boolean> {
        if (await store.get(target)) {
            return true
        }
        return (await listDescendantKeys(target)).length > 0
    }

    const handle: PackDirectoryHandle = {
        kind: "directory",
        name,
        async getDirectoryHandle(childName, options) {
            assertValidName(childName)
            const child = joinPath(path, childName)
            const record = await store.get(child)
            if (record?.kind === "file") {
                throw createStorageError(`同名文件已存在: ${childName}`, "TypeMismatchError")
            }

            if (options?.create) {
                // 已存在时跳过写入：版本目录/模块目录会被反复获取，没必要每次都落一次记录
                if (!record) {
                    await store.put(child, { kind: "directory" })
                }
            } else if (!record && !(await entryExists(child))) {
                throw createStorageError(`目录不存在: ${childName}`, "NotFoundError")
            }

            return createPackDirectoryHandle(store, child)
        },
        async getFileHandle(childName, options) {
            assertValidName(childName)
            const child = joinPath(path, childName)
            const record = await store.get(child)
            if (record?.kind === "directory") {
                throw createStorageError(`同名目录已存在: ${childName}`, "TypeMismatchError")
            }

            if (options?.create) {
                // 与 OPFS 一致：create 会立即落一个空文件
                if (!record) {
                    await store.put(child, { kind: "file", blob: new Blob([]), updatedAt: Date.now() })
                }
            } else if (!record) {
                throw createStorageError(`文件不存在: ${childName}`, "NotFoundError")
            }

            return createPackFileHandle(store, child, childName)
        },
        async removeEntry(childName, options) {
            assertValidName(childName)
            const child = joinPath(path, childName)
            const record = await store.get(child)
            const descendants = await listDescendantKeys(child)

            if (record?.kind === "file") {
                // 文件下不应该有后代，真出现了也按文件删除处理
                await store.remove([child])
                return
            }

            if (!record && !descendants.length) {
                throw createStorageError(`目录或文件不存在: ${childName}`, "NotFoundError")
            }
            if (!options?.recursive && descendants.length) {
                throw createStorageError(`目录非空: ${childName}`, "InvalidModificationError")
            }

            await store.remove(record ? [child, ...descendants] : descendants)
        },
        async *entries() {
            for (const childName of await listChildNames()) {
                const record = await store.get(joinPath(path, childName))
                const entry: PackDirectoryEntry = { kind: record?.kind === "file" ? "file" : "directory" }
                yield [childName, entry]
            }
        },
        [Symbol.asyncIterator]() {
            return handle.entries()
        },
    }

    return handle
}

/**
 * 读取已记住/手工指定的存储后端。
 * @returns 后端类型；未指定或不可用时返回 null
 */
function readStoredBackend(): PackStorageBackend | null {
    try {
        if (typeof localStorage === "undefined") {
            return null
        }
        const value = localStorage.getItem(PACK_STORAGE_BACKEND_KEY)
        return value === "opfs" || value === "indexeddb" ? value : null
    } catch {
        return null
    }
}

/**
 * 记住本次使用的存储后端。
 *
 * 记住它是因为：环境支持的后端一旦变化（例如 Safari 26 补上了 createWritable），
 * 数据包会「换一个存储位置」而看起来像被清空；记下来可以让已有安装继续可用。
 * 同一把键也用于手工强制切换后端（改 localStorage 后刷新页面）。
 * @param backend 后端类型
 */
function writeStoredBackend(backend: PackStorageBackend): void {
    try {
        if (typeof localStorage === "undefined") {
            return
        }
        localStorage.setItem(PACK_STORAGE_BACKEND_KEY, backend)
    } catch {}
}

/**
 * 探测 OPFS 是否真的可写。
 *
 * 只判断 `navigator.storage.getDirectory` 存在是不够的：Safari 15.2 起就有该 API，
 * 但没有 `FileSystemFileHandle.createWritable()`。这里实际写入一个探针文件再读回来，
 * 顺带覆盖配额、隐私模式等只在写入阶段才暴露的失败。
 * @returns 是否可用
 */
async function probeOpfs(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
        return false
    }

    // 目录名带随机后缀：多个标签页同时探测时不会互删探针，读回来的大小也就不会假性不符
    const probeDirName = `${OPFS_PROBE_DIR_PREFIX}-${Math.random().toString(36).slice(2)}`

    try {
        const root = await navigator.storage.getDirectory()
        const probeDir = await root.getDirectoryHandle(probeDirName, { create: true })
        const handle = await probeDir.getFileHandle("probe.bin", { create: true })
        const writable = await handle.createWritable()
        await writable.write(new Uint8Array([1]))
        await writable.close()
        const size = (await handle.getFile()).size
        await root.removeEntry(probeDirName, { recursive: true }).catch(() => {})
        return size === 1
    } catch (error) {
        console.warn("数据包存储：OPFS 写入探测失败，改用 IndexedDB", error)
        return false
    }
}

/**
 * 探测 IndexedDB 是否真的可读写（Safari 无痕模式等场景会在写入阶段报错）。
 * @returns 是否可用
 */
async function probeIndexedDb(): Promise<boolean> {
    if (typeof indexedDB === "undefined") {
        return false
    }

    try {
        const store = createIndexedDbStore(await openPackDatabase())
        await store.put(INDEXEDDB_PROBE_KEY, { kind: "directory" })
        const record = await store.get(INDEXEDDB_PROBE_KEY)
        await store.remove([INDEXEDDB_PROBE_KEY])
        return Boolean(record)
    } catch (error) {
        console.warn("数据包存储：IndexedDB 探测失败", error)
        return false
    }
}

/**
 * OPFS 可用性（带缓存）。
 * @returns 是否可用
 */
function isOpfsUsable(): Promise<boolean> {
    if (!opfsUsablePromise) {
        opfsUsablePromise = probeOpfs()
    }
    return opfsUsablePromise
}

/**
 * IndexedDB 可用性（带缓存）。
 * @returns 是否可用
 */
function isIndexedDbUsable(): Promise<boolean> {
    if (!indexedDbUsablePromise) {
        indexedDbUsablePromise = probeIndexedDb()
    }
    return indexedDbUsablePromise
}

/**
 * 解析当前应当使用的存储后端，优先使用上次记住的那个。
 * @returns 后端类型；两者都不可用时返回 null
 */
export function resolvePackStorageBackend(): Promise<PackStorageBackend | null> {
    if (!backendPromise) {
        backendPromise = (async () => {
            const preferred = readStoredBackend()
            const candidates: PackStorageBackend[] = preferred === "indexeddb" ? ["indexeddb", "opfs"] : ["opfs", "indexeddb"]

            for (const candidate of candidates) {
                const usable = candidate === "opfs" ? await isOpfsUsable() : await isIndexedDbUsable()
                if (usable) {
                    if (preferred !== candidate) {
                        writeStoredBackend(candidate)
                    }
                    return candidate
                }
            }

            return null
        })()
    }

    return backendPromise
}

/**
 * 判断当前环境是否支持数据包存储（OPFS 或 IndexedDB 任一可用即可）。
 * @returns 是否可用
 */
export async function isPackStorageAvailable(): Promise<boolean> {
    return (await resolvePackStorageBackend()) !== null
}

/**
 * 获取数据包存储根目录。
 * @returns 目录句柄；没有可用后端时抛出
 */
export async function getPackStorageRoot(): Promise<PackDirectoryHandle> {
    const backend = await resolvePackStorageBackend()

    if (backend === "opfs") {
        // 真实 OPFS 句柄与 PackDirectoryHandle 同形（getDirectoryHandle/getFileHandle/removeEntry/entries）
        return (await navigator.storage.getDirectory()) as unknown as PackDirectoryHandle
    }

    if (backend === "indexeddb") {
        return createPackDirectoryHandle(createIndexedDbStore(await openPackDatabase()))
    }

    throw new Error("当前环境不支持数据包存储：OPFS 不可写，也没有可用的 IndexedDB")
}

/**
 * 清空探测缓存，让下次调用重新解析后端（仅供测试与调试使用）。
 */
export function resetPackStorageBackendCache(): void {
    backendPromise = null
    opfsUsablePromise = null
    indexedDbUsablePromise = null
}
