import { spawn, spawnSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { LockHolder, LockWaitInfo } from "./i18n-io"
import { FileLockLostError, withFileLock, writeFileAtomic } from "./i18n-io"

const roots: string[] = []

async function makeRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "u142-io-"))
    roots.push(root)
    return root
}

afterEach(async () => {
    await Promise.all(
        roots.splice(0).map(async root => {
            await rm(root, { recursive: true, force: true })
        })
    )
})

/** 等待文件出现（锁创建后 fstat 可能需要几个事件循环） */
async function waitForFile(filePath: string): Promise<void> {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
        try {
            await stat(filePath)
            return
        } catch {
            await new Promise(resolve => setTimeout(resolve, 5))
        }
    }
    throw new Error(`等待文件超时：${filePath}`)
}

/** 等待锁文件内容属于当前进程（settle 用例需在其后顶替，避免与创建方写入交错） */
async function waitForOwnedLock(lockPath: string): Promise<void> {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
        try {
            const parsed = JSON.parse(await readFile(lockPath, "utf-8")) as Partial<LockHolder>
            if (parsed.pid === process.pid) return
        } catch {
            // 继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 2))
    }
    throw new Error(`等待本进程持锁超时：${lockPath}`)
}

/** 在指定路径持锁：等临界区真正开始后才返回，避免 release 尚未赋值就触发 */
async function holdLock(lockPath: string, command?: string): Promise<{ release: () => void; held: Promise<void> }> {
    let release: () => void = () => {}
    let markStarted: () => void = () => {}
    const started = new Promise<void>(resolve => (markStarted = resolve))
    const held = withFileLock(
        lockPath,
        () => {
            markStarted()
            return new Promise<void>(resolve => (release = resolve))
        },
        { command }
    )
    await started
    return { release: () => release(), held }
}

describe("withFileLock", () => {
    it("同一把锁的临界区按获取顺序串行执行", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "order.lock")
        const events: string[] = []

        const first = withFileLock(lockPath, async () => {
            events.push("first:start")
            await new Promise(resolve => setTimeout(resolve, 80))
            events.push("first:end")
        })
        await waitForFile(lockPath)

        const second = withFileLock(lockPath, async () => {
            events.push("second:start")
            events.push("second:end")
        })

        await Promise.all([first, second])
        expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"])
    })

    it("fn 抛错时仍释放锁，可再次获取", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "throw.lock")

        await expect(
            withFileLock(lockPath, () => {
                throw new Error("boom")
            })
        ).rejects.toThrow("boom")
        await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" })

        let ran = false
        await withFileLock(lockPath, () => {
            ran = true
        })
        expect(ran).toBe(true)
    })

    it("死进程持有的锁会被回收", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "dead.lock")
        const child = spawnSync(process.execPath, ["-e", "process.exit(0)"])
        expect(typeof child.pid).toBe("number")

        const holder: LockHolder = { pid: child.pid as number, command: "dead-proc", startedAt: new Date().toISOString() }
        await writeFile(lockPath, `${JSON.stringify(holder, null, 4)}\n`, "utf-8")

        const startedAt = Date.now()
        let ran = false
        await withFileLock(lockPath, () => {
            ran = true
        })
        expect(ran).toBe(true)
        expect(Date.now() - startedAt).toBeLessThan(1_500)
    })

    it("活进程但超过 10 分钟的锁会被回收", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "stale.lock")
        const holder: LockHolder = { pid: process.pid, command: "ancient", startedAt: new Date(Date.now() - 11 * 60_000).toISOString() }
        await writeFile(lockPath, `${JSON.stringify(holder, null, 4)}\n`, "utf-8")
        const old = new Date(Date.now() - 11 * 60_000)
        await utimes(lockPath, old, old)

        let ran = false
        await withFileLock(
            lockPath,
            () => {
                ran = true
            },
            { timeoutMs: 2_000 }
        )
        expect(ran).toBe(true)
    })

    it("空锁 5 秒内不回收，超过 5 秒才回收", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "empty.lock")
        await writeFile(lockPath, "", "utf-8")

        await expect(withFileLock(lockPath, () => undefined, { timeoutMs: 200 })).rejects.toThrow(/等待文件锁超时/)

        const old = new Date(Date.now() - 6_000)
        await utimes(lockPath, old, old)
        let ran = false
        await withFileLock(
            lockPath,
            () => {
                ran = true
            },
            { timeoutMs: 2_000 }
        )
        expect(ran).toBe(true)
    })

    it("超时错误包含锁路径与持锁信息", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "busy.lock")
        const holder = await holdLock(lockPath, "holder-cmd")

        const error = await withFileLock(lockPath, () => undefined, { timeoutMs: 200 }).catch((reason: unknown) => reason)
        expect(error).toBeInstanceOf(Error)
        const message = (error as Error).message
        expect(message).toContain(lockPath)
        expect(message).toContain(`pid=${process.pid}`)
        expect(message).toContain("holder-cmd")

        holder.release()
        await holder.held
    })

    it("等待超过 300ms 时 onWait 只触发一次", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "hint.lock")
        const holder = await holdLock(lockPath)

        const waits: LockWaitInfo[] = []
        const timer = setTimeout(holder.release, 700)
        await withFileLock(lockPath, () => undefined, { timeoutMs: 3_000, onWait: info => waits.push(info) })
        clearTimeout(timer)
        await holder.held

        expect(waits).toHaveLength(1)
        expect(waits[0].waitedMs).toBeGreaterThanOrEqual(300)
        expect(waits[0].holder?.pid).toBe(process.pid)
    })

    it("写入锁元数据并自动创建父目录", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "nested", "deep", "meta.lock")
        let meta: LockHolder | null = null

        await withFileLock(
            lockPath,
            async () => {
                meta = JSON.parse(await readFile(lockPath, "utf-8")) as LockHolder
            },
            { command: "i18n add demo.key" }
        )

        expect(meta).not.toBeNull()
        const holder = meta as unknown as LockHolder
        expect(holder.pid).toBe(process.pid)
        expect(holder.command).toBe("i18n add demo.key")
        expect(Number.isNaN(Date.parse(holder.startedAt))).toBe(false)
        await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" })
    })

    it("释放时只删除自己 PID 的锁", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "foreign.lock")
        const foreign: LockHolder = { pid: process.pid + 1, command: "other-process", startedAt: new Date().toISOString() }

        await withFileLock(lockPath, async () => {
            await writeFile(lockPath, `${JSON.stringify(foreign, null, 4)}\n`, "utf-8")
        })

        const remaining = JSON.parse(await readFile(lockPath, "utf-8")) as LockHolder
        expect(remaining.pid).toBe(foreign.pid)
    })

    it("assertOwned 在锁被接管时抛 FileLockLostError", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "owned.lock")
        const foreign: LockHolder = { pid: process.pid + 1, command: "intruder", startedAt: new Date().toISOString() }
        let error: unknown = null

        await withFileLock(lockPath, async lock => {
            await lock.assertOwned()
            await writeFile(lockPath, `${JSON.stringify(foreign, null, 4)}\n`, "utf-8")
            error = await lock.assertOwned().catch((reason: unknown) => reason)
        })

        expect(error).toBeInstanceOf(FileLockLostError)
        expect((error as Error).message).toContain("已被其它进程接管")
        expect((error as Error).message).toContain(`pid=${foreign.pid}`)
    })

    it("获取后被顶替会释放并重试，不进入临界区", async () => {
        const root = await makeRoot()
        const lockPath = join(root, "settle.lock")
        const intruder = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" })
        try {
            let ran = false
            const pending = withFileLock(
                lockPath,
                () => {
                    ran = true
                },
                { settleMs: 500, timeoutMs: 1_500, onWait: () => {} }
            )
            await waitForOwnedLock(lockPath)
            const holder: LockHolder = { pid: intruder.pid as number, command: "intruder", startedAt: new Date().toISOString() }
            await writeFile(lockPath, `${JSON.stringify(holder, null, 4)}\n`, "utf-8")

            await expect(pending).rejects.toThrow(/等待文件锁超时/)
            expect(ran).toBe(false)
        } finally {
            const closed = new Promise<void>(resolve => intruder.once("close", () => resolve()))
            intruder.kill()
            if (intruder.exitCode === null && intruder.signalCode === null) await closed
        }
    })
})

describe("writeFileAtomic", () => {
    it("内容逐字节一致并覆盖已有文件，成功后无临时文件残留", async () => {
        const root = await makeRoot()
        const target = join(root, "translation.json")
        const first = `{\n    "b": 2,\n    "a": 1\n}\n`
        await writeFileAtomic(target, first)
        expect(Buffer.from(await readFile(target)).equals(Buffer.from(first, "utf-8"))).toBe(true)

        const second = `{\n    "c": 3\n}\n`
        await writeFileAtomic(target, second)
        expect(await readFile(target, "utf-8")).toBe(second)
        expect((await readdir(root)).filter(name => name.endsWith(".tmp"))).toEqual([])
    })

    it("并发写同一文件后内容是其中一次的完整结果", async () => {
        const root = await makeRoot()
        const target = join(root, "same.json")
        const contents = Array.from({ length: 8 }, (_, index) => `value-${index}\n`)
        await Promise.all(contents.map(content => writeFileAtomic(target, content)))

        const text = await readFile(target, "utf-8")
        expect(contents).toContain(text)
        expect((await readdir(root)).filter(name => name.endsWith(".tmp"))).toEqual([])
    })

    it("rename 失败时清理临时文件并抛错", async () => {
        const root = await makeRoot()
        const target = join(root, "dir-target")
        await mkdir(target)

        await expect(writeFileAtomic(target, "x\n")).rejects.toBeInstanceOf(Error)
        expect((await readdir(root)).filter(name => name.endsWith(".tmp"))).toEqual([])
    })
})
