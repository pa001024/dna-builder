// 更新委托信息工具
// 作为客户端，通过 GraphQL API 更新委托数据到远端服务器

import "dotenv/config"
import { fetch } from "bun"
import { Cron } from "croner"
import { getDNAAPI } from "./api/dna"

// 环境变量配置
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8887"
const API_TOKEN = process.env.API_TOKEN
const DEV_CODE = process.env.DEV_CODE
const USER_TOKEN = process.env.USER_TOKEN

if (!API_TOKEN || !DEV_CODE || !USER_TOKEN) {
    console.error("缺少必要的环境变量: API_TOKEN, DEV_CODE, USER_TOKEN")
    process.exit(1)
}

// 休眠函数
const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// 从 DNA API 获取委托数据
async function fetchMissionsFromDNA() {
    try {
        const dnaAPI = getDNAAPI()
        // 模拟别的请求 防止返回空值
        await Promise.all([dnaAPI.getCommonConfig(), dnaAPI.getMhSwitchStatus(), dnaAPI.home.isHaveSignin(), dnaAPI.getMine()])
        const res = await dnaAPI.defaultRoleForTool()
        if (res.is_success && res.data?.instanceInfo) {
            const missions = res.data.instanceInfo.map(item => item.instances.map(v => v.name))
            return missions
        } else {
            throw new Error(`DNA API 返回失败: ${res.msg}`)
        }
    } catch (error) {
        console.error("获取 DNA API 数据失败:", error)
        throw error
    }
}

// 通过 GraphQL mutation 更新委托
async function updateMissionsIngame(server: string, missions: string[][]) {
    const mutation = `
        mutation AddMissionsIngame($token: String!, $server: String!, $missions: [[String!]!]!) {
            addMissionsIngame(token: $token, server: $server, missions: $missions) {
                id
                server
                missions
                createdAt
            }
        }
    `

    try {
        const response = await fetch(`${API_BASE_URL}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: mutation,
                variables: {
                    token: API_TOKEN,
                    server,
                    missions,
                },
            }),
        })

        const result = await response.json()

        if (result.errors) {
            const duplicateError = result.errors.find((e: any) => e.message === "duplicate missions")
            if (duplicateError) {
                console.log(`${new Date().toLocaleString()} 数据未变化，跳过更新 - server: ${server}`)
                return null
            }
            throw new Error(result.errors.map((e: any) => e.message).join(", "))
        }

        console.log(`${new Date().toLocaleString()} 更新成功 - server: ${server}`)
        console.log(`ID: ${result.data.addMissionsIngame.id}, 委托数量: ${missions.length}`)
        return result.data.addMissionsIngame
    } catch (error) {
        console.error("GraphQL 请求失败:", error)
        throw error
    }
}

// 更新委托信息（带重试机制）
const updateMH = async (server: string = "cn", t: number = 10) => {
    console.log(`${new Date().toLocaleString()} 开始同步密函信息 - server: ${server}`)
    let is_success = false
    await sleep(20000)
    for (let i = 0; i < t; i++) {
        await sleep(5000)
        try {
            const missions = await fetchMissionsFromDNA()
            const result = await updateMissionsIngame(server, missions)
            if (result !== null) {
                is_success = true
            } else {
                // duplicate missions 视为成功
                is_success = true
            }
        } catch (e: any) {
            console.error(`${new Date().toLocaleString()} 同步失败: ${e.message} retry: ${i}`)
        }
        if (is_success) {
            console.log(`${new Date().toLocaleString()} 同步成功 - server: ${server}`)
            break
        }
    }
    // 重试都失败
    if (!is_success) {
        console.error(`${new Date().toLocaleString()} 同步失败：${t}次重试均未成功 - server: ${server}`)
        // process.exit(1)
    }
    console.log(`${new Date().toLocaleString()} 同步完成`)
}

// 获取下一次更新时间
const getNextUpdateTime = (t?: number) => {
    const now = t ?? Date.now()
    const oneHour = 60 * 60 * 1000
    return Math.ceil(now / oneHour) * oneHour
}

// 主函数
async function main() {
    const mode = process.argv[2] || "cron" // once: 执行一次, cron: 持续定时执行
    const server = process.argv[3] || "cn"

    console.log(`启动模式: ${mode}, 服务器: ${server}`)
    console.log(`GraphQL API: ${API_BASE_URL}`)

    if (mode === "cron") {
        // 持续定时执行（每小时）
        const updateTask = async () => {
            await updateMH(server, 10)
            const next = getNextUpdateTime()
            console.log(`下一次同步: ${new Date(next).toLocaleString()}`)
        }

        const syncMHJob = new Cron("@hourly", { timezone: "Asia/Shanghai" }, () => updateTask())
        console.log("Cron 任务已启动，每小时执行一次")
        console.log(`下一次执行: ${syncMHJob.nextRun()}`)

        // 立即执行一次
        await updateTask()

        // 保持进程运行
        process.on("SIGINT", () => {
            syncMHJob.stop()
            console.log("Cron 任务已停止")
            process.exit(0)
        })
    } else {
        // 执行一次
        await updateMH(server, 10)
        console.log(`${new Date().toLocaleString()} 更新完成`)
    }
}

// 执行主函数
main()
