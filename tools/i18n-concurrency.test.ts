import { spawn, spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

/** 仓库根：本文件位于 `<root>/tools/` 下 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const LOCALES = ["en", "fr", "ja", "ko", "zh-CN", "zh-TW"]
/** 每个 add 传入的语言参数 → 期望写入值的前缀 */
const LANG_ARGS: Array<[flag: string, prefix: string]> = [
    ["-cn", "CN"],
    ["-tw", "TW"],
    ["-en", "EN"],
    ["-jp", "JP"],
    ["-kr", "KR"],
    ["-fr", "FR"],
]
const EXPECTED_PREFIX: Record<string, string> = { "zh-CN": "CN", "zh-TW": "TW", en: "EN", ja: "JP", ko: "KR", fr: "FR" }
const CONCURRENCY = 8

/** 夹具根目录：每个用例独立，避免并发用例互踩 */
const fixtures: string[] = []

afterEach(async () => {
    await Promise.all(
        fixtures.splice(0).map(async root => {
            await rm(root, { recursive: true, force: true })
        })
    )
})

/** 找到可用的 bun 可执行文件；找不到时并发用例整体跳过（显式 skip 而非静默通过） */
function findBun(): string | null {
    for (const candidate of [process.env.DNA_BUN, "bun", "bun.exe"]) {
        if (!candidate) continue
        const probe = spawnSync(candidate, ["--version"], { encoding: "utf-8" })
        if (!probe.error && probe.status === 0) return candidate
    }
    return null
}

const BUN = findBun()

/**
 * 创建黑盒夹具：临时根下复制 i18n.ts + i18n-io.ts，并铺六个语言文件。
 * 绝不触碰仓库真实的 apps/web/public/i18n。
 */
async function createFixture(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "u142-concurrency-"))
    fixtures.push(root)
    await mkdir(join(root, "tools"), { recursive: true })
    for (const name of ["i18n.ts", "i18n-io.ts"]) {
        await copyFile(join(REPO_ROOT, "tools", name), join(root, "tools", name))
    }
    const seed = `{\n    "seed": {\n        "value": "base",\n        "extra": "keep"\n    }\n}\n`
    for (const locale of LOCALES) {
        const dir = join(root, "apps", "web", "public", "i18n", locale)
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, "translation.json"), seed, "utf-8")
    }
    return root
}

function localePath(root: string, locale: string): string {
    return join(root, "apps", "web", "public", "i18n", locale, "translation.json")
}

function lockPathOf(root: string): string {
    return join(root, ".tmp", "i18n.lock")
}

/** 用当前（存活）进程 PID 预写锁，模拟「另一个进程正持锁」 */
async function holdExternalLock(root: string): Promise<void> {
    await mkdir(join(root, ".tmp"), { recursive: true })
    const holder = { pid: process.pid, command: "test-holder", startedAt: new Date().toISOString() }
    await writeFile(lockPathOf(root), `${JSON.stringify(holder, null, 4)}\n`, "utf-8")
}

async function releaseExternalLock(root: string): Promise<void> {
    await rm(lockPathOf(root), { force: true })
}

async function readLocale(root: string, locale: string): Promise<Record<string, any>> {
    return JSON.parse(await readFile(localePath(root, locale), "utf-8"))
}

interface RunResult {
    code: number | null
    stdout: string
    stderr: string
}

/** 启动一个 `bun <fixture>/tools/i18n.ts <args>` 子进程 */
function runCli(fixture: string, args: string[], env: Record<string, string> = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(BUN as string, [join(fixture, "tools", "i18n.ts"), ...args], {
            cwd: fixture,
            windowsHide: true,
            timeout: 60_000,
            env: { ...process.env, ...env },
            stdio: ["ignore", "pipe", "pipe"],
        })
        let stdout = ""
        let stderr = ""
        child.stdout?.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf-8")
        })
        child.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf-8")
        })
        child.on("error", reject)
        child.on("close", code => resolve({ code, stdout, stderr }))
    })
}

/** 启动一次 `add`（六语言齐全，ASCII 值便于断言） */
function runAdd(fixture: string, index: number, extraArgs: string[] = [], env: Record<string, string> = {}): Promise<RunResult> {
    const args = ["add", `__u142_concurrent_${index}`]
    for (const [flag, prefix] of LANG_ARGS) {
        args.push(flag, `${prefix}${index}`)
    }
    args.push(...extraArgs)
    return runCli(fixture, args, env)
}

/** 递归列出夹具内全部文件（用于检查 .tmp 残留） */
async function listFiles(dir: string, acc: string[] = []): Promise<string[]> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await listFiles(full, acc)
        else acc.push(full)
    }
    return acc
}

const suite = BUN === null ? describe.skip : describe

suite("i18n CLI 并发写", () => {
    it(`${CONCURRENCY} 个 add 并发后所有键齐全、JSON 合法、无锁/临时文件残留`, { timeout: 120_000 }, async () => {
        const root = await createFixture()
        const results = await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => runAdd(root, index)))
        for (const result of results) {
            expect(result.code, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
        }

        for (const locale of LOCALES) {
            const filePath = join(root, "apps", "web", "public", "i18n", locale, "translation.json")
            const data = JSON.parse(await readFile(filePath, "utf-8")) as Record<string, unknown>
            expect(data.seed).toEqual({ value: "base", extra: "keep" })
            for (let index = 0; index < CONCURRENCY; index++) {
                expect(data[`__u142_concurrent_${index}`]).toBe(`${EXPECTED_PREFIX[locale]}${index}`)
            }
        }

        await expect(stat(join(root, ".tmp", "i18n.lock"))).rejects.toMatchObject({ code: "ENOENT" })
        expect((await listFiles(root)).filter(file => file.endsWith(".tmp"))).toEqual([])
    })

    it("--dry-run 不建锁、不写文件", { timeout: 60_000 }, async () => {
        const root = await createFixture()
        const target = join(root, "apps", "web", "public", "i18n", "zh-CN", "translation.json")
        const before = await readFile(target, "utf-8")

        const result = await runAdd(root, 99, ["--dry-run"])
        expect(result.code, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)

        expect(await readFile(target, "utf-8")).toBe(before)
        await expect(stat(join(root, ".tmp"))).rejects.toMatchObject({ code: "ENOENT" })
    })

    it("外锁存在时 add 等待超时且不写文件，释放后成功", { timeout: 60_000 }, async () => {
        const root = await createFixture()
        await holdExternalLock(root)
        const before = await readFile(localePath(root, "zh-CN"), "utf-8")

        const timedOut = await runAdd(root, 7, [], { I18N_LOCK_TIMEOUT_MS: "400" })
        expect(timedOut.code).toBe(1)
        expect(timedOut.stderr).toContain("等待文件锁超时")
        // Windows 的 8.3 短路径（ADMINI~1）与子进程解析出的长路径是同一文件，用 realpath 归一化后比对
        expect(timedOut.stderr).toContain(await realpath(lockPathOf(root)))
        expect(timedOut.stderr).toContain(`pid=${process.pid}`)
        expect(timedOut.stderr).toContain("test-holder")
        expect(await readFile(localePath(root, "zh-CN"), "utf-8")).toBe(before)

        await releaseExternalLock(root)
        const ok = await runAdd(root, 7)
        expect(ok.code, `stdout: ${ok.stdout}\nstderr: ${ok.stderr}`).toBe(0)
        for (const locale of LOCALES) {
            expect((await readLocale(root, locale))[`__u142_concurrent_7`]).toBe(`${EXPECTED_PREFIX[locale]}7`)
        }
    })

    it("锁被持有期间 get 立即返回", { timeout: 60_000 }, async () => {
        const root = await createFixture()
        await holdExternalLock(root)
        try {
            const startedAt = Date.now()
            const result = await runCli(root, ["get", "seed.value", "--lang", "cn"], { I18N_LOCK_TIMEOUT_MS: "2000" })
            expect(result.code, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
            expect(result.stdout).toContain("base")
            expect(Date.now() - startedAt).toBeLessThan(10_000)
        } finally {
            await releaseExternalLock(root)
        }
    })

    it("rm 多 key 在锁内作为一个事务", { timeout: 60_000 }, async () => {
        const root = await createFixture()
        await holdExternalLock(root)

        const blocked = await runCli(root, ["rm", "seed.value", "seed.extra"], { I18N_LOCK_TIMEOUT_MS: "400" })
        expect(blocked.code).toBe(1)
        expect(blocked.stderr).toContain("等待文件锁超时")
        for (const locale of LOCALES) {
            expect(await readLocale(root, locale)).toEqual({ seed: { value: "base", extra: "keep" } })
        }

        await releaseExternalLock(root)
        const ok = await runCli(root, ["rm", "seed.value", "seed.extra"])
        expect(ok.code, `stdout: ${ok.stdout}\nstderr: ${ok.stderr}`).toBe(0)
        for (const locale of LOCALES) {
            const data = await readLocale(root, locale)
            expect(data.seed?.value).toBeUndefined()
            expect(data.seed?.extra).toBeUndefined()
        }
    })

    it("rm --dry-run 不建锁、不写文件", { timeout: 60_000 }, async () => {
        const root = await createFixture()
        const before = await readFile(localePath(root, "zh-CN"), "utf-8")

        const result = await runCli(root, ["rm", "seed.value", "--dry-run"])
        expect(result.code, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
        expect(result.stdout).toContain("[dry-run] 删除 seed.value")
        expect(await readFile(localePath(root, "zh-CN"), "utf-8")).toBe(before)
        await expect(stat(join(root, ".tmp"))).rejects.toMatchObject({ code: "ENOENT" })
    })

    it("import 的锁覆盖：外锁期间超时且保留 diff，释放后写入并删除 diff", { timeout: 60_000 }, async () => {
        const root = await createFixture()
        const diffPath = join(root, "tools", "i18n-diff.json")
        const diff = { __u142_import_key: { en: "Imported", "zh-CN": "导入键" } }
        const diffText = `${JSON.stringify(diff, null, 4)}\n`
        await writeFile(diffPath, diffText, "utf-8")
        await holdExternalLock(root)

        const blocked = await runCli(root, ["import"], { I18N_LOCK_TIMEOUT_MS: "400" })
        expect(blocked.code).toBe(1)
        expect(blocked.stderr).toContain("等待文件锁超时")
        expect(await readFile(diffPath, "utf-8")).toBe(diffText)
        expect((await readLocale(root, "zh-CN"))["__u142_import_key"]).toBeUndefined()

        await releaseExternalLock(root)
        const ok = await runCli(root, ["import"])
        expect(ok.code, `stdout: ${ok.stdout}\nstderr: ${ok.stderr}`).toBe(0)
        expect((await readLocale(root, "zh-CN"))["__u142_import_key"]).toBe("导入键")
        expect((await readLocale(root, "en"))["__u142_import_key"]).toBe("Imported")
        await expect(stat(diffPath)).rejects.toMatchObject({ code: "ENOENT" })
    })

    it("export 的锁覆盖：外锁期间超时不产出，释放后写出 diff", { timeout: 60_000 }, async () => {
        const root = await createFixture()
        const diffPath = join(root, "tools", "i18n-diff.json")
        await holdExternalLock(root)

        const blocked = await runCli(root, ["export"], { I18N_LOCK_TIMEOUT_MS: "400" })
        expect(blocked.code).toBe(1)
        expect(blocked.stderr).toContain("等待文件锁超时")
        await expect(stat(diffPath)).rejects.toMatchObject({ code: "ENOENT" })

        await releaseExternalLock(root)
        const ok = await runCli(root, ["export"])
        expect(ok.code, `stdout: ${ok.stdout}\nstderr: ${ok.stderr}`).toBe(0)
        expect(ok.stdout).toContain("差异已写入")
        expect(await readFile(diffPath, "utf-8")).toBe("{}\n")
    })
})
