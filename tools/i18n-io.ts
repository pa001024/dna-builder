#!/usr/bin/env bun
/**
 * i18n-io.ts — i18n 工具的跨进程文件锁与原子写（仅依赖 node 内置模块）。
 *
 * `withFileLock` 用 `open(..., "wx")` 抢独占锁文件，持锁进程崩溃后可按「PID 已退出 /
 * 锁超龄 / 空锁超过 5 秒」回收；`writeFileAtomic` 先写同目录临时文件再 rename 覆盖，
 * 保证读者要么读到旧版、要么读到新版完整文件。
 *
 * 陈旧锁回收的「二次校验 → unlink」并非原子操作，强杀/并发回收者可能删掉他人刚重建的活锁。
 * 因此获取成功后先 settle 再回读确认所有权，并通过临界区上下文 `assertOwned()` 在提交前复核。
 */

import { randomBytes } from "node:crypto"
import { mkdir, open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

/** 锁文件内容：供等待方诊断与陈旧回收判定 */
export interface LockHolder {
    /** 持锁进程 PID */
    pid: number
    /** 触发本次加锁的命令描述（默认取当前进程 argv） */
    command: string
    /** 加锁时间（ISO 字符串） */
    startedAt: string
}

/** 等待提示回调的入参 */
export interface LockWaitInfo {
    /** 锁文件绝对路径 */
    lockPath: string
    /** 已等待毫秒数 */
    waitedMs: number
    /** 当前锁内容；无法解析时为 null */
    holder: LockHolder | null
}

/** 临界区上下文：供写命令在落盘前复核锁仍归本进程所有 */
export interface FileLockContext {
    /** 立即回读锁文件并校验 pid；已被其它进程接管时抛 FileLockLostError（不得继续写） */
    assertOwned: () => Promise<void>
}

export interface FileLockOptions {
    /** 等待上限（毫秒），默认 60s；超时抛错而不是继续写 */
    timeoutMs?: number
    /** 等待提示回调，默认向 stderr 打印一次；测试可覆盖 */
    onWait?: (info: LockWaitInfo) => void
    /** 写入锁文件的命令描述，默认 `process.argv.slice(2).join(" ")` */
    command?: string
    /** 创建成功后回读确认前的 settle 时长（毫秒），默认 15；测试可覆盖 */
    settleMs?: number
}

/** 默认等待上限：足够覆盖一次完整 add/import，又不至于让并发方无限阻塞 */
const DEFAULT_TIMEOUT_MS = 60_000
/** 获取后 settle 时长：给并发回收者「删除旧锁 → 重建」的窗口暴露出来 */
const DEFAULT_SETTLE_MS = 15
/** 等待超过该时长才向用户提示，避免轻微争用也刷屏 */
const HINT_AFTER_MS = 300
/** 锁文件超过该年龄一律视为陈旧的兜底阈值 */
const STALE_LOCK_MS = 10 * 60 * 1000
/** 空 / 不可解析锁的回收阈值（给创建方写完元数据留出时间） */
const STALE_INVALID_MS = 5 * 1000
/** 抢锁重试的退避区间（毫秒），抖动避免多进程同步轮询 */
const POLL_MIN_MS = 25
const POLL_MAX_MS = 100
/** Windows 上目标文件被占用时 rename / unlink 的小步重试 */
const FS_RETRY_COUNT = 5
const FS_RETRY_MS = 20

interface LockSnapshot {
    /** 解析出的锁内容；空 / 非法 JSON / 缺 pid 时为 null */
    holder: LockHolder | null
    /** 锁文件修改时间（毫秒） */
    mtimeMs: number
}

/** 休眠指定毫秒 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/** 随机退避时长（含抖动的闭区间） */
function randomPollMs(): number {
    return POLL_MIN_MS + Math.floor(Math.random() * (POLL_MAX_MS - POLL_MIN_MS + 1))
}

/** 判断 PID 是否存活；EPERM 表示进程存在但无权限，视为存活 */
function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH"
    }
}

/** 读取锁文件快照；文件不存在或读取期间被删除时返回 null */
async function readLockSnapshot(lockPath: string): Promise<LockSnapshot | null> {
    let raw: string
    let mtimeMs: number
    try {
        const [text, info] = await Promise.all([readFile(lockPath, "utf-8"), stat(lockPath)])
        raw = text
        mtimeMs = info.mtimeMs
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ENOENT") return null
        throw error
    }
    let holder: LockHolder | null = null
    try {
        const parsed = JSON.parse(raw) as Partial<LockHolder>
        if (parsed && typeof parsed.pid === "number") {
            holder = {
                pid: parsed.pid,
                command: typeof parsed.command === "string" ? parsed.command : "",
                startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
            }
        }
    } catch {
        holder = null
    }
    return { holder, mtimeMs }
}

/** 判定锁是否陈旧；返回原因文本，仍然有效时返回 null */
function staleReason(snapshot: LockSnapshot): string | null {
    const ageMs = Date.now() - snapshot.mtimeMs
    if (snapshot.holder !== null) {
        if (!isProcessAlive(snapshot.holder.pid)) return `持锁进程 ${snapshot.holder.pid} 已不存在`
        if (ageMs > STALE_LOCK_MS) return `锁文件已超过 ${Math.round(STALE_LOCK_MS / 60_000)} 分钟未更新`
        return null
    }
    return ageMs > STALE_INVALID_MS ? `锁文件为空或无法解析且已超过 ${STALE_INVALID_MS / 1000} 秒` : null
}

/** 锁文件当前是否仍归本进程所有 */
async function isOwnedByCurrentProcess(lockPath: string): Promise<boolean> {
    const snapshot = await readLockSnapshot(lockPath)
    return snapshot?.holder?.pid === process.pid
}

/** 默认等待提示：只提示一次，说明当前持锁方 */
function defaultWaitHint(info: LockWaitInfo): void {
    const holder =
        info.holder === null
            ? "锁内容无法解析"
            : `持锁进程 pid=${info.holder.pid}${info.holder.command ? `，命令：${info.holder.command}` : ""}`
    console.error(`[i18n] 正在等待文件锁 ${info.lockPath}（已等待 ${Math.round(info.waitedMs)}ms，${holder}）`)
}

/** 以独占方式创建锁文件并写入元数据；已存在时返回 false */
async function tryCreateLock(lockPath: string, command: string | undefined): Promise<boolean> {
    let handle: FileHandle
    try {
        handle = await open(lockPath, "wx")
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false
        throw error
    }
    const holder: LockHolder = {
        pid: process.pid,
        command: command ?? process.argv.slice(2).join(" "),
        startedAt: new Date().toISOString(),
    }
    let failure: unknown = null
    try {
        await handle.writeFile(`${JSON.stringify(holder, null, 4)}\n`, "utf-8")
    } catch (error) {
        failure = error
    }
    try {
        await handle.close()
    } catch {
        // 关闭失败不影响后续清理：下面会尝试删掉自己刚建的锁
    }
    if (failure !== null) {
        await unlink(lockPath).catch(() => {})
        throw failure
    }
    return true
}

/**
 * 尝试回收陈旧锁。先复核快照未被他人替换，再删除，避免误删刚重建的活锁。
 *
 * @returns 锁已消失或成功删除时返回 true
 */
async function reclaimStaleLock(lockPath: string, observed: LockSnapshot): Promise<boolean> {
    const again = await readLockSnapshot(lockPath)
    if (again === null) return true
    if (again.mtimeMs !== observed.mtimeMs || again.holder?.pid !== observed.holder?.pid) return false
    try {
        await unlink(lockPath)
        return true
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT"
    }
}

/** 释放锁：只删除内容 PID 仍为自己的锁，避免误删他人锁 */
async function releaseLock(lockPath: string): Promise<void> {
    let raw: string
    try {
        raw = await readFile(lockPath, "utf-8")
    } catch {
        return
    }
    let pid: number | undefined
    try {
        const parsed = JSON.parse(raw) as Partial<LockHolder>
        pid = typeof parsed.pid === "number" ? parsed.pid : undefined
    } catch {
        pid = undefined
    }
    if (pid !== process.pid) return
    for (let attempt = 0; attempt < FS_RETRY_COUNT; attempt++) {
        try {
            await unlink(lockPath)
            return
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code === "ENOENT") return
            const retryable = code === "EPERM" || code === "EACCES" || code === "EBUSY"
            if (!retryable || attempt === FS_RETRY_COUNT - 1) throw error
            await sleep(FS_RETRY_MS)
        }
    }
}

/** 超时错误：带上锁路径与持锁信息，便于直接定位是哪个进程卡住 */
function lockTimeoutError(lockPath: string, timeoutMs: number, holder: LockHolder | null): Error {
    const detail =
        holder === null
            ? "锁内容无法解析（可能是刚创建的锁），稍后重试或手动删除该文件"
            : `持锁进程 pid=${holder.pid}${holder.command ? `（${holder.command}）` : ""}，开始于 ${holder.startedAt || "未知时间"}`
    return new Error(`等待文件锁超时（${timeoutMs}ms）：${lockPath}\n  ${detail}\n  若确认持锁进程已退出，可删除该锁文件后重试。`)
}

/** 锁在临界区内被其它进程接管：立即中止写入，避免并发覆盖 */
export class FileLockLostError extends Error {
    constructor(lockPath: string, holder: LockHolder | null) {
        const detail = holder === null ? "锁文件已不存在" : `当前持锁进程 pid=${holder.pid}${holder.command ? `（${holder.command}）` : ""}`
        super(`文件锁已被其它进程接管：${lockPath}\n  ${detail}\n  为避免并发覆盖，本次操作已中止，请重试。`)
        this.name = "FileLockLostError"
    }
}

/**
 * 在跨进程独占锁内执行 `fn`；`fn` 抛错也会释放锁。
 *
 * @param lockPath 锁文件路径（父目录自动创建）
 * @param fn 临界区；接收 `assertOwned` 上下文，应在落盘前调用
 * @param options 超时 / 等待提示 / settle / 锁内命令描述
 * @returns `fn` 的返回值
 */
export async function withFileLock<T>(
    lockPath: string,
    fn: (lock: FileLockContext) => T | Promise<T>,
    options: FileLockOptions = {}
): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS
    const onWait = options.onWait ?? defaultWaitHint
    const startedAt = Date.now()
    let hinted = false
    let holder: LockHolder | null = null

    await mkdir(dirname(lockPath), { recursive: true })

    for (;;) {
        if (await tryCreateLock(lockPath, options.command)) {
            // settle 后回读：并发回收者可能在「二次校验 → unlink」之间删掉本进程刚建的活锁
            if (settleMs > 0) await sleep(settleMs)
            if (await isOwnedByCurrentProcess(lockPath)) break
            // 所有权已丢失：只删自己 PID 的锁（此时通常已被他人顶替，不会被误删），然后重试
            await releaseLock(lockPath).catch(() => {})
            const snapshot = await readLockSnapshot(lockPath)
            holder = snapshot?.holder ?? holder
        } else {
            const snapshot = await readLockSnapshot(lockPath)
            if (snapshot !== null) {
                holder = snapshot.holder
                if (staleReason(snapshot) !== null && (await reclaimStaleLock(lockPath, snapshot))) {
                    continue
                }
            }
        }

        const waitedMs = Date.now() - startedAt
        if (waitedMs >= timeoutMs) throw lockTimeoutError(lockPath, timeoutMs, holder)
        if (!hinted && waitedMs >= HINT_AFTER_MS) {
            hinted = true
            onWait({ lockPath, waitedMs, holder })
        }
        await sleep(randomPollMs())
    }

    const context: FileLockContext = {
        assertOwned: async () => {
            if (await isOwnedByCurrentProcess(lockPath)) return
            const snapshot = await readLockSnapshot(lockPath)
            throw new FileLockLostError(lockPath, snapshot?.holder ?? null)
        },
    }

    let result: T
    try {
        result = await fn(context)
    } catch (error) {
        await releaseLock(lockPath).catch(() => {})
        throw error
    }
    await releaseLock(lockPath)
    return result
}

/** rename 覆盖；Windows 上目标被短暂占用时报 EPERM/EACCES/EBUSY，小步重试 */
async function renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 0; attempt < FS_RETRY_COUNT; attempt++) {
        try {
            await rename(from, to)
            return
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            const retryable = code === "EPERM" || code === "EACCES" || code === "EBUSY"
            if (!retryable || attempt === FS_RETRY_COUNT - 1) throw error
            await sleep(FS_RETRY_MS)
        }
    }
}

/**
 * 原子写文件：同目录临时文件 → rename 覆盖；失败时清理临时文件。
 *
 * @param filePath 目标文件绝对路径（目录须已存在）
 * @param content 原样写入的内容（字符串按 UTF-8，不追加换行）
 */
export async function writeFileAtomic(filePath: string, content: string | Uint8Array): Promise<void> {
    const tempPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`)
    try {
        await writeFile(tempPath, content)
        await renameWithRetry(tempPath, filePath)
    } catch (error) {
        await rm(tempPath, { force: true }).catch(() => {})
        throw error
    }
}
