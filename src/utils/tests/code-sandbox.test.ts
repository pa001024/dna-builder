import { describe, expect, it } from "vitest"
import { createDefaultCharSettings, normalizeCharSettings } from "@/composables/useCharSettings"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { createSandboxRuntime, type SandboxInbound, type SandboxOutbound } from "@/utils/build-sandbox-runtime"

interface RunResult {
    ok: boolean
    value?: string
    error?: string
    logs: string[]
}

/**
 * 用假主线程跑一遍 worker 侧运行时：rpc 就地派发到传入的接口对象上。
 * @param code 用户代码
 * @param api 假接口对象
 * @returns 执行结果
 */
function run(code: string, api: Record<string, unknown>): Promise<RunResult> {
    const logs: string[] = []

    return new Promise<RunResult>(resolve => {
        const runtime = createSandboxRuntime((message: SandboxOutbound) => {
            if (message.type === "log") {
                logs.push(message.text)
                return
            }

            if (message.type === "rpc") {
                void (async () => {
                    try {
                        let parent: unknown = api

                        for (let index = 0; index < message.path.length - 1; index += 1) {
                            parent = (parent as Record<string, unknown> | undefined)?.[message.path[index]]
                        }

                        const method = (parent as Record<string, unknown> | undefined)?.[message.path[message.path.length - 1]]

                        if (typeof method !== "function") {
                            throw new Error(`build.${message.path.join(".")} 不存在`)
                        }

                        const value = await (method as (...args: unknown[]) => unknown).apply(parent, message.args)
                        runtime.onMessage({ type: "rpc:result", id: message.id, ok: true, value: value ?? null })
                    } catch (error) {
                        runtime.onMessage({
                            type: "rpc:result",
                            id: message.id,
                            ok: false,
                            error: error instanceof Error ? error.message : String(error),
                        })
                    }
                })()
                return
            }

            resolve({ ok: message.ok, value: message.value, error: message.error, logs })
        })

        runtime.onMessage({ type: "run", code } satisfies SandboxInbound)
    })
}

describe("createSandboxRuntime", () => {
    it("能 await build 上的方法并 return", async () => {
        const result = await run("return await build.damage()", { damage: async () => 12345 })
        expect(result.ok).toBe(true)
        expect(result.value).toBe("12345")
    })

    it("收集 console.log 输出", async () => {
        const result = await run("console.log('伤害', await build.damage()); return 'done'", { damage: async () => 12345 })
        expect(result.ok).toBe(true)
        expect(result.value).toBe("done")
        expect(result.logs.join("\n")).toContain("伤害 12345")
    })

    it("阻断浏览器与网络入口", async () => {
        for (const key of ["window", "document", "fetch", "localStorage"]) {
            const result = await run(`return ${key}`, {})
            expect(result.ok).toBe(false)
            expect(result.error).toContain(key)
        }
    })

    it("未声明的标识符直接报错", async () => {
        const result = await run("return notDefinedAnywhere", {})
        expect(result.ok).toBe(false)
        expect(result.error).toContain("notDefinedAnywhere")
    })

    it("循环里连续 await 多条调用", async () => {
        const calls: string[] = []
        const api = {
            mods: async (input: { name: string }) => {
                calls.push(input.name)
                return { ok: true }
            },
            damage: async () => calls.length * 10,
        }
        const result = await run(
            "for (const name of ['甲','乙','丙']) { await build.mods({name}); console.log(await build.damage()) } return await build.damage()",
            api
        )
        expect(result.ok).toBe(true)
        expect(calls).toEqual(["甲", "乙", "丙"])
        expect(result.logs).toEqual(["10", "20", "30"])
    })

    it("主线程回传的构筑快照会在本地重建成可查数值的视图", async () => {
        const build = createCharBuildFromSettings(3104, normalizeCharSettings({ ...createDefaultCharSettings(), baseName: "潜入夜色" }))

        const result = await run("const v = await build.current(); return [await v.damage(), (await v.weapons()).近战]", {
            current: async () => ({ __view: true, snapshot: createWorkerSnapshot(build) }),
        })

        expect(result.ok).toBe(true)
        expect(JSON.parse(result.value ?? "[]")[0]).toBe(build.calculate())
        expect(JSON.parse(result.value ?? "[]")[1]).toBe(build.meleeWeapon.名称)
    })
})
