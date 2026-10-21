import type { AgentTool } from "@/api/agent/tool"
import { getBuildApi, setBuildDeadline } from "@/utils/build-api"
import { runInBuildSandbox, SANDBOX_TIMEOUT_MS } from "@/utils/code-sandbox"

const MAX_CODE_LENGTH = 8000

const DESCRIPTION = [
    "在独立线程里执行一段 JavaScript，用它读取当前构筑、查游戏数据、跑计算、批量改动配置，必要时操作配装页控件。",
    "线程里只有一个全局对象 build（接口声明见系统提示词的接口契约），另有 Math / JSON / 数组与对象等基础内置对象；",
    "没有 window / document / DOM，也没有 fetch / localStorage，网络与开线程的入口都已摘掉。",
    "build 的所有方法都是异步的，一律 await：const s = await build.state(); await build.weapon({slot:'melee',name:'...'})。",
    "一次调用就能完成多步改动：把「换武器 → 换魔之楔 → 比伤害 → 挑最优」写在一段代码里，不必逐次对话。",
    "用 console.log 输出中间过程，用 return 返回要交给用户看的最终结论（返回值与日志都会回传）。",
    "改动立刻生效，await build.damage() 重算，可在循环里连续比较多种方案；别写无限循环——超时会直接终止线程。",
    "单次执行预算约 30 秒（含线程冷启动）：批量比对优先用 compute.build / simulate 在本地算，只把最优方案写回页面。",
    "典型用法：await build.data.mods({keyword:'炽灼'}) 查名字 → await build.mod({type:'角色',slot:0,name:'...'}) 装上 → await build.damage() 看结果。",
].join("\n")

export function createRunCodeTool(): AgentTool<never> {
    return {
        definition: {
            name: "run_code",
            description: DESCRIPTION,
            parameters: {
                type: "object",
                properties: {
                    code: {
                        type: "string",
                        description: "要执行的 JavaScript 代码，只能使用 build 对象与基础内置对象",
                    },
                },
                required: ["code"],
            },
        },

        async execute(args) {
            const code = typeof args.code === "string" ? args.code.trim() : ""

            if (!code) {
                return { content: JSON.stringify({ error: "code 不能为空" }), isError: true }
            }

            if (code.length > MAX_CODE_LENGTH) {
                return {
                    content: JSON.stringify({ error: `代码过长（${code.length}），请拆分后再执行` }),
                    isError: true,
                }
            }

            const api = getBuildApi()

            if (!api) {
                return {
                    content: JSON.stringify({ error: "配装页尚未就绪，暂不能执行代码" }),
                    isError: true,
                }
            }

            const result = await runInBuildSandbox(code, api, {
                timeoutMs: SANDBOX_TIMEOUT_MS,
                onDeadline: setBuildDeadline,
            })

            setBuildDeadline(0)

            const payload = {
                ok: result.ok,
                ...(result.value === undefined ? {} : { value: result.value }),
                logs: result.logs,
                ...(result.error ? { error: result.error } : {}),
                ms: result.ms,
            }

            return {
                content: JSON.stringify(payload, null, 2),
                summary: result.ok ? `执行代码 ${result.ms}ms` : "代码执行出错",
                ...(result.ok ? {} : { isError: true }),
            }
        },
    }
}

/**
 * 控制台调试入口：`await runcode("return await build.damage()")`。
 *
 * 与 Agent 工具走同一条执行链（同一预算、同一配装接口、同一常驻线程），方便在 console 里复现超时的代码。
 * 用法：`await runcode("const s = await build.state(); return s.damage")`，返回 { ok, value, logs, error, ms }。
 * 随配装助手 chunk 载入而挂载（打开一次 Build Agent 即可用）。
 */
if (typeof window !== "undefined") {
    const scope = window as unknown as Record<string, unknown>
    scope.runcode = async (code: string) => {
        const api = getBuildApi()

        if (!api) {
            throw new Error("配装页尚未就绪（buildApi 未注册），请先打开角色构筑页")
        }

        try {
            return await runInBuildSandbox(code, api, {
                timeoutMs: SANDBOX_TIMEOUT_MS,
                onDeadline: setBuildDeadline,
            })
        } finally {
            setBuildDeadline(0)
        }
    }
}
