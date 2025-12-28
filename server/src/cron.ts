import { Elysia } from "elysia"
import { DNAAPI } from "dna-api"
import { Cron } from "croner"
import { desc, eq } from "drizzle-orm"
import { fetch } from "bun"
import { db, schema } from "./db"

export const cronPlugin = () => {
    const app = new Elysia({
        name: "cron-plugin",
    })
    if (!process.env.DEV_CODE || !process.env.USER_TOKEN) {
        console.error("未配置TOKEN 密函同步禁用")
        return app
    }
    const updateServerMH = async (server: string, missions: string[][]) => {
        // 同server最后一个值重复校验
        const lastMissionsIngame = await db.query.missionsIngame.findFirst({
            where: eq(schema.missionsIngame.server, server),
            orderBy: desc(schema.missionsIngame.id),
        })
        if (lastMissionsIngame && JSON.stringify(lastMissionsIngame.missions) === JSON.stringify(missions)) throw new Error("duplicate missions")

        const missionsIngame = await db
            .insert(schema.missionsIngame)
            .values({
                server,
                missions,
            })
            .returning()
        if (!missionsIngame.length) {
            throw new Error("failed to write db")
        }
    }
    const sleep = (ms: number) => {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }
    const updateMH = async (t = 10) => {
        const server = "cn"

        console.log(`${new Date().toLocaleString()} 开始同步密函信息 - server: ${server}`)
        let is_success = false
        for (let i = 0; i < t; i++) {
            await sleep(3000)
            try {
                const dnaAPI = new DNAAPI(process.env.DEV_CODE!, process.env.USER_TOKEN, { fetchFn: fetch })
                const res = await dnaAPI.getDefaultRoleForTool()
                if (res.is_success && res.data?.instanceInfo) {
                    const missions = res.data.instanceInfo.map((item) => item.instances.map((v) => v.name))
                    await updateServerMH(server, missions)
                    is_success = true
                }
            } catch (e) {
                // console.debug(`${new Date().toLocaleString()} 同步失败: ${e} retry: ${i}`)
            }
            if (is_success) {
                console.log(`${new Date().toLocaleString()} 同步成功 - server: ${server}`)
                break
            }
        }
        // 重试都失败
        if (!is_success) {
            console.error(`${new Date().toLocaleString()} 同步失败：${t}次重试均未成功 - server: ${server}`)
        }
        console.log(`${new Date().toLocaleString()} 同步完成 - next run: ${syncMHJob.nextRun()}`)
    }
    // every 1h
    const syncMHJob = new Cron("@hourly", { timezone: "Asia/Shanghai" }, () => updateMH())
    app.onStart(() => {
        console.log("Elysia 服务启动，cron 任务已注册：", syncMHJob.isRunning())
        updateMH(1)
    })
    app.onStop(() => {
        syncMHJob.stop()
        console.log("Elysia 服务停止，cron 任务已注销：", syncMHJob.isRunning())
    })

    return app
}
