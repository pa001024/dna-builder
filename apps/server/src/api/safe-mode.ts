import { Cron } from "croner"
import { Elysia, t } from "elysia"
import type { JWTUser } from "../db/yoga"
import { fail, resolveUser } from "../util/auth"
import { isQuarkConfigured } from "../util/quark"
import {
    checkVaultConsistency,
    readVaultState,
    rotateVault,
    syncVaultScheduled,
    toVaultStatus,
    verifyVaultPassword,
} from "../util/safe-mode-vault"

/** 定时上传表达式，默认每天 04:00（上海时区）轮换解锁密码。 */
const VAULT_CRON = process.env.SAFE_MODE_VAULT_CRON || "0 4 * * *"

/** 管理员判定（与 MOD / 抽奖接口一致：roles 含 admin）。 */
function isAdmin(user: JWTUser): boolean {
    return Array.isArray(user.roles) && user.roles.includes("admin")
}

export const safeModePlugin = () => {
    const app = new Elysia({ prefix: "/api/safe-mode", name: "safe-mode-plugin" })

    app.get("/vault/status", async () => {
        const state = await readVaultState()
        return { success: true as const, configured: isQuarkConfigured(), status: state ? toVaultStatus(state) : null }
    })

    app.post(
        "/vault/verify",
        async ({ body, set }) => {
            const matched = await verifyVaultPassword(body.password ?? "")
            if (!matched) {
                return fail(set, 401, "解锁密码错误")
            }
            return { success: true as const }
        },
        { body: t.Object({ password: t.String() }) }
    )

    app.post("/vault/rotate", async ({ request, set }) => {
        const user = resolveUser(request.headers)
        if (!user) {
            return fail(set, 401, "未登录")
        }
        if (!isAdmin(user)) {
            return fail(set, 403, "仅管理员可手动轮换解锁密码")
        }
        if (!isQuarkConfigured()) {
            return fail(set, 503, "服务端未配置夸克令牌（QUARK_ACCESS_TOKEN）")
        }
        try {
            const { status } = await rotateVault()
            return { success: true as const, status }
        } catch (error) {
            return fail(set, 500, error instanceof Error ? error.message : "轮换解锁密码失败")
        }
    })

    const vaultJob = new Cron(VAULT_CRON, { timezone: "Asia/Shanghai" }, () => {
        void syncVaultScheduled()
    })

    app.onStart(() => {
        console.log(`[safe-mode-vault] 定时上传已注册（${VAULT_CRON}，Asia/Shanghai）：`, vaultJob.isRunning())
        // 启动检查（后台，不阻塞服务启动）：无状态则传一次；有状态则校验网盘文件与
        // 当前密码是否一致，对不上（缺失/解包失败/密码不符）就自动重传修复，网络异常则只记日志
        void (async () => {
            if (!isQuarkConfigured()) {
                return
            }
            const state = await readVaultState()
            if (!state) {
                await syncVaultScheduled()
                return
            }
            try {
                const result = await checkVaultConsistency()
                if (result.ok) {
                    console.log("[safe-mode-vault] 启动检查通过：网盘文件与当前密码一致")
                } else {
                    console.error(`[safe-mode-vault] 启动检查失败（${result.reason}），自动重传修复`)
                    await rotateVault()
                }
            } catch (error) {
                console.error("[safe-mode-vault] 启动检查异常（跳过自动修复）：", error instanceof Error ? error.message : error)
            }
        })()
    })
    app.onStop(() => {
        vaultJob.stop()
        console.log("[safe-mode-vault] 定时上传已注销：", vaultJob.isRunning())
    })

    return app
}
