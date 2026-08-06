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
 * @returns JWT 字符串。
 */
function createToken(id: string, name: string): string {
    return jwt.sign({ id, name }, jwtToken)
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
            expect(await first.json()).toEqual({ date: DATE, entries: [] })
            expect(await second.json()).toEqual({ date: DATE, entries: [] })
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
})
