import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "../../..")
const TMP_ROOT = path.join(ROOT, ".tmp/skill-sim-tests")
const FIXTURE = "packages/skill-sim/fixtures/skill-asset-sample.json"
const PARITY = "packages/skill-sim/fixtures/parity-smoke.ts"
let outDir: string

beforeAll(async () => {
    await mkdir(TMP_ROOT, { recursive: true })
    outDir = await mkdtemp(path.join(TMP_ROOT, "cli-"))
})

afterAll(async () => {
    await rm(outDir, { recursive: true, force: true })
})

function run(args: string[]): { code: number | null; stdout: string; stderr: string } {
    const result = Bun.spawnSync({
        cmd: [process.execPath, "tools/skill-workflow.ts", ...args],
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
    })
    return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
}

describe("tools/skill-workflow.ts", () => {
    test("无参数 / 未知命令 → 退出码 2", () => {
        expect(run([]).code).toBe(2)
        expect(run(["nope"]).code).toBe(2)
        expect(run(["--help"]).code).toBe(0)
    })

    test("ingest → 0", () => {
        const result = run(["ingest", "--input", FIXTURE, "--json"])
        expect(result.code).toBe(0)
        const payload = JSON.parse(result.stdout)
        expect(payload.ok).toBe(true)
        expect(payload.counts).toMatchObject({ characters: 1, skills: 3, buffs: 7 })
    })

    test("build --strict → 0 且写出 manifest / coverage", async () => {
        const result = run(["build", "--input", FIXTURE, "--out", outDir, "--strict", "--json"])
        expect(result.code).toBe(0)
        const payload = JSON.parse(result.stdout)
        expect(payload.ok).toBe(true)
        expect(payload.coverageReport.nativeCallsUnknown).toEqual(["K2_PlayUnknownEffect"])
        const manifest = JSON.parse(await readFile(path.join(outDir, "manifest.json"), "utf8"))
        expect(manifest.schemaVersion).toBe(1)
        expect(manifest.generator.name).toBe("dna-builder-skill-sim")
        expect(Object.keys(manifest.skills)).toEqual(["410101", "410102", "410103"])
        const coverage = JSON.parse(await readFile(path.join(outDir, "coverage.json"), "utf8"))
        expect(coverage.coverage.skillsTotal).toBe(3)
    })

    test("check --simulated 角色 id → 0", () => {
        const result = run(["check", "--input", outDir, "--simulated", "4101", "--json"])
        expect(result.code).toBe(0)
        const payload = JSON.parse(result.stdout)
        expect(payload.ok).toBe(true)
        // 角色 id 展开主 E/Q，被动 P 不参与
        expect(payload.stats.simulatedSatisfied).toBe(2)
    })

    test("check --simulated 未知 id → 1", () => {
        const result = run(["check", "--input", outDir, "--simulated", "999999", "--json"])
        expect(result.code).toBe(1)
        const payload = JSON.parse(result.stdout)
        expect(payload.ok).toBe(false)
        expect(payload.errors.some((item: { code: string }) => item.code === "gate.missing-behavior")).toBe(true)
    })

    test("verify → 0（自比对 smoke）", () => {
        const result = run(["verify", "--manifest", path.join(outDir, "manifest.json"), "--fixtures", PARITY, "--json"])
        expect(result.code).toBe(0)
        const payload = JSON.parse(result.stdout)
        expect(payload.ok).toBe(true)
        expect(payload.results[0].drift).toBe(0)
    })

    test("输入不存在 → 1", () => {
        const result = run(["build", "--input", path.join(outDir, "missing.json"), "--out", outDir])
        expect(result.code).toBe(1)
    })
})
