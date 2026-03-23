import { config } from "./config.ts"
import { writeFrpcCompose } from "./frpc-compose.ts"
import { scheduleRun } from "./runner.ts"
import { startWebhookServer } from "./webhook.ts"

/**
 * CLI 入口：
 * - once: 执行一次扫描与处理
 * - loop: 按间隔循环执行
 */

const mode = process.argv[2] ?? "once"

if (import.meta.main) {
    if (mode !== "once" && mode !== "loop" && mode !== "serve" && mode !== "frpc-compose") {
        console.error("用法: bun apps/dob-bot/src/cli.ts once|loop|serve|frpc-compose")
        process.exitCode = 2
    } else {
        await main(mode)
    }
}

/**
 * @param {"once" | "loop" | "serve" | "frpc-compose"} m
 * @returns {Promise<void>}
 */
async function main(m: "once" | "loop" | "serve" | "frpc-compose"): Promise<void> {
    if (m === "once") {
        await scheduleRun("cli:once")
        return
    }

    if (m === "frpc-compose") {
        if (!config.frpcToken || !config.frpcTunnelIds) {
            throw new Error("缺少 DOB_BOT_FRPC_TOKEN 或 DOB_BOT_FRPC_TUNNEL_IDS")
        }
        const composePath = await writeFrpcCompose(process.cwd(), config.frpcTunnelIds, config.frpcToken)
        console.log(`frpc compose 已生成: ${composePath}`)
        return
    }

    if (m === "serve") {
        await startWebhookServer()
        return
    }

    while (true) {
        try {
            await scheduleRun("cli:loop")
        } catch (e) {
            console.error("dob-bot loop 执行失败:", e)
        }
        await sleep(config.intervalMs)
    }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
