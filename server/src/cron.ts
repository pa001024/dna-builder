import { Cron } from "croner"
import { desc, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { getDNAAPI } from "./api/dna"
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
        if (lastMissionsIngame && JSON.stringify(lastMissionsIngame.missions) === JSON.stringify(missions))
            throw new Error("duplicate missions")

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
        return new Promise(resolve => setTimeout(resolve, ms))
    }
    const updateMH = async (t = 10) => {
        const server = "cn"

        console.log(`${new Date().toLocaleString()} 开始同步密函信息 - server: ${server}`)
        let is_success = false
        for (let i = 0; i < t; i++) {
            await sleep(3000)
            try {
                const dnaAPI = getDNAAPI()
                const res = await dnaAPI.defaultRoleForTool()
                if (res.is_success && res.data?.instanceInfo) {
                    const missions = res.data.instanceInfo.map(item => item.instances.map(v => v.name))
                    await updateServerMH(server, missions)
                    is_success = true
                } else {
                    console.error(`${new Date().toLocaleString()} 同步失败: ${res.msg} retry: ${i}`)
                }
            } catch (e: any) {
                if (e.message === "duplicate missions") {
                    console.error(`${new Date().toLocaleString()} 重复值 - server: ${server}`)
                } else {
                    // console.log(`${new Date().toLocaleString()} 同步失败: ${e} retry: ${i}`)
                }
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

    const initMH = async (server: string = "cn") => {
        // 同server最后一个值重复校验
        const lastMissionsIngame = await db.query.missionsIngame.findFirst({
            where: eq(schema.missionsIngame.server, server),
            orderBy: desc(schema.missionsIngame.id),
        })
        const last = lastMissionsIngame?.createdAt ? Date.parse(lastMissionsIngame.createdAt) : 0
        const getNextUpdateTime = (t?: number) => {
            const now = t ?? Date.now()
            const oneHour = 60 * 60 * 1000
            return Math.ceil(now / oneHour) * oneHour
        }
        const next = getNextUpdateTime(last)
        if (next <= Date.now()) {
            await updateMH(1)
        } else {
            console.log(`${new Date().toLocaleString()} 下一次同步密函信息 - server: ${server} - next: ${new Date(next).toLocaleString()}`)
        }
    }
    // every 1h
    const syncMHJob = new Cron("@hourly", { timezone: "Asia/Shanghai" }, () => updateMH())
    app.onStart(() => {
        console.log("Elysia 服务启动，cron 任务已注册：", syncMHJob.isRunning())
        initMH()
    })
    app.onStop(() => {
        syncMHJob.stop()
        console.log("Elysia 服务停止，cron 任务已注销：", syncMHJob.isRunning())
    })

    return app
}
