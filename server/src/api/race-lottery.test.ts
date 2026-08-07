import { describe, expect, it } from "bun:test"
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import jwt from "jsonwebtoken"
import { jwtToken } from "../db/yoga"
import { raceLotteryPlugin } from "./race-lottery"

const DATE = "2026-08-06"

/**
 * 创建测试用的临时存储目录和 API 实例。
 * @returns 临时目录与 Elysia API 实例。
 */
async function createTestApp() {
    const dataDir = await mkdtemp(join(tmpdir(), "race-lottery-test-"))
    return {
        dataDir,
        app: raceLotteryPlugin(dataDir),
    }
}

/**
 * 创建测试用户 JWT。
 * @param id 用户 ID。
 * @param name 用户名。
 * @param roles 用户角色（逗号分隔字符串）。
 * @returns JWT 字符串。
 */
function createToken(id: string, name: string, roles?: string): string {
    return jwt.sign({ id, name, roles }, jwtToken)
}

/**
 * 发送词条提交请求。
 * @param app 测试 API 实例。
 * @param token 登录 JWT。
 * @param playerId 选手 ID。
 * @param buffIds 三个状态位置的 buff ID。
 * @returns HTTP 响应。
 */
function postEntry(app: ReturnType<typeof raceLotteryPlugin>, token: string, playerId: number, buffIds: number[]) {
    return app.handle(
        new Request(`http://localhost/api/race-lottery/${DATE}/entries`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                token,
            },
            body: JSON.stringify({ playerId, buffIds }),
        })
    )
}

/**
 * 发送最终速度保存请求。
 * @param app 测试 API 实例。
 * @param token 登录 JWT。
 * @param date 日期。
 * @param finalSpeeds 各选手最终速度。
 * @returns HTTP 响应。
 */
function putFinalSpeeds(app: ReturnType<typeof raceLotteryPlugin>, token: string, date: string, finalSpeeds: Record<string, number>) {
    return app.handle(
        new Request(`http://localhost/api/race-lottery/${date}/final-speeds`, {
            method: "PUT",
            headers: {
                "content-type": "application/json",
                token,
            },
            body: JSON.stringify({ finalSpeeds }),
        })
    )
}

/**
 * 读取指定日期的有效最终速度。
 * @param app 测试 API 实例。
 * @param date 日期。
 * @returns HTTP 响应。
 */
function getFinalSpeeds(app: ReturnType<typeof raceLotteryPlugin>, date: string) {
    return app.handle(new Request(`http://localhost/api/race-lottery/${date}/final-speeds`))
}

/**
 * 向指定日期提交一条词条记录。
 * @param app 测试 API 实例。
 * @param token 登录 JWT。
 * @param date 日期。
 * @param playerId 选手 ID。
 * @param buffIds 三个状态位置的 buff ID。
 * @returns HTTP 响应。
 */
function postEntryOn(app: ReturnType<typeof raceLotteryPlugin>, token: string, date: string, playerId: number, buffIds: number[]) {
    return app.handle(
        new Request(`http://localhost/api/race-lottery/${date}/entries`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                token,
            },
            body: JSON.stringify({ playerId, buffIds }),
        })
    )
}

/**
 * 向指定日期与服务器提交一条词条记录。
 * @param app 测试 API 实例。
 * @param token 登录 JWT。
 * @param date 日期。
 * @param server 服务器。
 * @param playerId 选手 ID。
 * @param buffIds 三个状态位置的 buff ID。
 * @returns HTTP 响应。
 */
function postEntryOnServer(
    app: ReturnType<typeof raceLotteryPlugin>,
    token: string,
    date: string,
    server: string,
    playerId: number,
    buffIds: number[]
) {
    return app.handle(
        new Request(`http://localhost/api/race-lottery/${date}/entries?server=${server}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                token,
            },
            body: JSON.stringify({ playerId, buffIds }),
        })
    )
}

/**
 * 读取指定日期与服务器的公开词条。
 * @param app 测试 API 实例。
 * @param date 日期。
 * @param server 服务器。
 * @returns HTTP 响应。
 */
function getDailyOnServer(app: ReturnType<typeof raceLotteryPlugin>, date: string, server: string) {
    return app.handle(new Request(`http://localhost/api/race-lottery/${date}?server=${server}`))
}

describe("RaceLottery JSONL API", () => {
    it("按日期追加结构化词条并更新同一用户的重复提交", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const token = createToken("user-1", "测试用户")
            const first = await postEntry(app, token, 4013, [1004, 1002, 0])
            const second = await postEntry(app, token, 4013, [0, 0, 1003])
            const response = await app.handle(new Request(`http://localhost/api/race-lottery/${DATE}`, { headers: { token } }))
            const data = (await response.json()) as { entries: { buffIds: number[] }[] }
            const fileLines = (await readFile(join(dataDir, `${DATE}.jsonl`), "utf8"))
                .trim()
                .split("\n")
                .map(line => JSON.parse(line) as { buffIds: number[] })

            expect(first.status).toBe(200)
            expect(second.status).toBe(200)
            expect(response.status).toBe(200)
            expect(data.entries).toHaveLength(1)
            expect(data.entries[0].buffIds).toEqual([1003, 0, 0])
            expect(fileLines).toHaveLength(2)
            expect(fileLines[0].buffIds).toEqual([1004, 1002, 0])
            expect(fileLines[1].buffIds).toEqual([0, 0, 1003])
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("按最新提交记录的出现频次输出每个选手权重最高的三个词条", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const first = await postEntry(app, createToken("user-1", "用户一"), 4013, [1004, 1002, 0])
            const second = await postEntry(app, createToken("user-2", "用户二"), 4013, [0, 0, 1003])
            const response = await app.handle(new Request(`http://localhost/api/race-lottery/${DATE}`))
            const data = (await response.json()) as {
                entries: {
                    playerId: number
                    buffIds: number[]
                    submissionCount: number
                    lastUpdatedBy: string
                    isMine: boolean
                    myBuffIds: number[] | null
                }[]
            }

            expect(first.status).toBe(200)
            expect(second.status).toBe(200)
            expect(response.status).toBe(200)
            expect(data.entries).toEqual([
                {
                    playerId: 4013,
                    buffIds: [1004, 1002, 1003],
                    submissionCount: 2,
                    lastUpdatedBy: "用户二",
                    isMine: false,
                    myBuffIds: null,
                },
            ])
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("拒绝不是三个整数的 buff ID 数组", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const response = await postEntry(app, createToken("user-1", "测试用户"), 4013, [1004, 1002])
            expect(response.status).toBe(422)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("首次读取后使用内存缓存", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const token = createToken("user-1", "测试用户")
            const first = await app.handle(new Request(`http://localhost/api/race-lottery/${DATE}`, { headers: { token } }))
            await appendFile(
                join(dataDir, `${DATE}.jsonl`),
                `${JSON.stringify({
                    id: "external-entry",
                    playerId: 4013,
                    buffIds: [1004, 0, 0],
                    userId: "external-user",
                    userName: "外部用户",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                })}\n`,
                "utf8"
            )
            const second = await app.handle(new Request(`http://localhost/api/race-lottery/${DATE}`, { headers: { token } }))

            expect(first.status).toBe(200)
            expect(second.status).toBe(200)
            expect(await first.json()).toEqual({ date: DATE, server: "CN", baseSpeeds: {}, entries: [] })
            expect(await second.json()).toEqual({ date: DATE, server: "CN", baseSpeeds: {}, entries: [] })
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("允许匿名查看但拒绝匿名提交", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const response = await app.handle(
                new Request(`http://localhost/api/race-lottery/${DATE}/entries`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ playerId: 4013, buffIds: [1004, 0, 0] }),
                })
            )

            expect(response.status).toBe(401)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("管理员可保存最终速度并持久化到独立文件", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const adminToken = createToken("admin-1", "管理员", "admin")
            const saveResponse = await putFinalSpeeds(app, adminToken, DATE, { "4013": 1.32, "4073": 0.87 })
            const getResponse = await app.handle(new Request(`http://localhost/api/race-lottery/${DATE}/final-speeds`))
            const data = (await getResponse.json()) as { finalSpeeds: Record<string, number> }
            const fileContent = await readFile(join(dataDir, `${DATE}.final-speeds.json`), "utf8")

            expect(saveResponse.status).toBe(200)
            expect(data.finalSpeeds).toEqual({ "4013": 1.32, "4073": 0.87 })
            expect(fileContent).toContain('"4013":1.32')
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("非管理员无法保存最终速度", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const userToken = createToken("user-1", "测试用户")
            const response = await putFinalSpeeds(app, userToken, DATE, { "4013": 1.32 })

            expect(response.status).toBe(403)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("未登录无法保存最终速度", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const response = await putFinalSpeeds(app, "", DATE, { "4013": 1.32 })

            expect(response.status).toBe(401)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("日期接口返回前一天记录的最终速度作为基础速度", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const adminToken = createToken("admin-1", "管理员", "admin")
            await putFinalSpeeds(app, adminToken, "2026-08-06", { "4013": 1.32 })
            const response = await app.handle(new Request(`http://localhost/api/race-lottery/2026-08-07`))
            const data = (await response.json()) as { date: string; baseSpeeds: Record<string, number> }

            expect(response.status).toBe(200)
            expect(data.baseSpeeds).toEqual({ "4013": 1.32 })
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("无手动记录时按当日提交数据自动计算最终速度", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const token = createToken("user-1", "测试用户")
            await postEntryOn(app, token, DATE, 4013, [1001, 0, 0])
            const response = await getFinalSpeeds(app, DATE)
            const data = (await response.json()) as { isAuto: boolean; finalSpeeds: Record<string, number> }

            expect(response.status).toBe(200)
            expect(data.isAuto).toBe(true)
            // 基础速度默认 1，词条 1001 倍率 1.05。
            expect(data.finalSpeeds["4013"]).toBeCloseTo(1.05)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("自动计算的最终速度作为次日基础速度", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const token = createToken("user-1", "测试用户")
            await postEntryOn(app, token, "2026-08-06", 4013, [1001, 0, 0])
            const response = await app.handle(new Request(`http://localhost/api/race-lottery/2026-08-07`))
            const data = (await response.json()) as { baseSpeeds: Record<string, number> }

            expect(data.baseSpeeds["4013"]).toBeCloseTo(1.05)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("自动计算支持连续多日递推", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const token = createToken("user-1", "测试用户")
            // 8 月 1 日：基础 1 × 1.05 = 1.05
            await postEntryOn(app, token, "2026-08-01", 4013, [1001, 0, 0])
            // 8 月 2 日：基础 1.05 × 1.1 = 1.155
            await postEntryOn(app, token, "2026-08-02", 4013, [1002, 0, 0])
            const response = await getFinalSpeeds(app, "2026-08-02")
            const data = (await response.json()) as { isAuto: boolean; finalSpeeds: Record<string, number> }

            expect(data.isAuto).toBe(true)
            expect(data.finalSpeeds["4013"]).toBeCloseTo(1.05 * 1.1)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("手动记录优先于自动计算", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const token = createToken("user-1", "测试用户")
            await postEntryOn(app, token, DATE, 4013, [1001, 0, 0])
            const adminToken = createToken("admin-1", "管理员", "admin")
            await putFinalSpeeds(app, adminToken, DATE, { "4013": 0.88 })
            const response = await getFinalSpeeds(app, DATE)
            const data = (await response.json()) as { isAuto: boolean; finalSpeeds: Record<string, number> }

            expect(response.status).toBe(200)
            expect(data.isAuto).toBe(false)
            expect(data.finalSpeeds["4013"]).toBe(0.88)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("不同服务器的词条提交与查看互相隔离", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const token = createToken("user-1", "测试用户")
            // CN（默认）提交 1001。
            await postEntryOn(app, token, DATE, 4013, [1001, 0, 0])
            // EU 服务器提交 1002。
            await postEntryOnServer(app, token, DATE, "EU", 4013, [1002, 0, 0])

            const cnResponse = await getDailyOnServer(app, DATE, "CN")
            const cnData = (await cnResponse.json()) as { server: string; entries: { buffIds: number[] }[] }
            const euResponse = await getDailyOnServer(app, DATE, "EU")
            const euData = (await euResponse.json()) as { server: string; entries: { buffIds: number[] }[] }

            expect(cnData.server).toBe("CN")
            expect(cnData.entries).toHaveLength(1)
            expect(cnData.entries[0].buffIds).toEqual([1001, 0, 0])
            expect(euData.server).toBe("EU")
            expect(euData.entries).toHaveLength(1)
            expect(euData.entries[0].buffIds).toEqual([1002, 0, 0])
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })

    it("不同服务器的最终速度分开存储", async () => {
        const { app, dataDir } = await createTestApp()
        try {
            const adminToken = createToken("admin-1", "管理员", "admin")
            await putFinalSpeeds(app, adminToken, DATE, { "4013": 1.32 })
            const serverResponse = await app.handle(
                new Request(`http://localhost/api/race-lottery/${DATE}/final-speeds?server=ASIA`, {
                    method: "PUT",
                    headers: {
                        "content-type": "application/json",
                        token: adminToken,
                    },
                    body: JSON.stringify({ finalSpeeds: { "4013": 2.5 } }),
                })
            )
            const cnResponse = await getFinalSpeeds(app, DATE)
            const cnData = (await cnResponse.json()) as { server: string; finalSpeeds: Record<string, number> }
            const asiaResponse = await app.handle(new Request(`http://localhost/api/race-lottery/${DATE}/final-speeds?server=ASIA`))
            const asiaData = (await asiaResponse.json()) as { server: string; finalSpeeds: Record<string, number> }

            expect(serverResponse.status).toBe(200)
            expect(cnData.server).toBe("CN")
            expect(cnData.finalSpeeds["4013"]).toBe(1.32)
            expect(asiaData.server).toBe("ASIA")
            expect(asiaData.finalSpeeds["4013"]).toBe(2.5)
        } finally {
            await rm(dataDir, { recursive: true, force: true })
        }
    })
})
