import { type APIRequestContext, type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"

type GuestSession = {
    name: string
    token: string
}

type RoomSummary = {
    id: string
    name: string
    type: string | null
    msgCount: number
}

type GraphQLResponse<T> = {
    data?: T
    errors?: { message?: string }[]
}

const backendUrl = process.env.E2E_BACKEND_URL || "http://localhost:8887/graphql"
const CHAT_STRICT_BOTTOM_TOLERANCE_PX = 1

/**
 * @description 向本地 GraphQL 服务发送真实请求，并在接口报错时给出明确失败信息。
 * @param request Playwright APIRequestContext。
 * @param query GraphQL 查询文本。
 * @param variables GraphQL 变量。
 * @param token 可选鉴权 token。
 * @returns GraphQL data 字段。
 */
async function requestGraphQL<TData>(
    request: APIRequestContext,
    query: string,
    variables?: Record<string, unknown>,
    token?: string
): Promise<TData> {
    const response = await request.post(backendUrl, {
        headers: {
            "content-type": "application/json",
            ...(token ? { token } : {}),
        },
        data: {
            query,
            variables,
        },
    })
    expect(response.ok()).toBeTruthy()

    const payload = (await response.json()) as GraphQLResponse<TData>
    if (payload.errors?.length) {
        throw new Error(payload.errors.map(error => error.message || "unknown graphql error").join("; "))
    }
    if (!payload.data) {
        throw new Error("GraphQL response missing data")
    }
    return payload.data
}

/**
 * @description 创建一个用于 e2e 的访客账号，避免依赖固定测试账号。
 * @param request Playwright APIRequestContext。
 * @param prefix 访客名前缀。
 * @returns 可直接注入前端 localStorage 的访客会话信息。
 */
async function createGuestSession(request: APIRequestContext, prefix: string): Promise<GuestSession> {
    const name = `${prefix}${Date.now().toString(36).slice(-4)}`
    const data = await requestGraphQL<{
        guest: {
            success: boolean
            message: string
            token?: string
        }
    }>(
        request,
        `
            mutation ($name: String!) {
                guest(name: $name) {
                    success
                    message
                    token
                }
            }
        `,
        { name }
    )

    if (!data.guest.success || !data.guest.token) {
        throw new Error(`创建访客失败: ${data.guest.message}`)
    }

    return {
        name,
        token: data.guest.token,
    }
}

/**
 * @description 读取本地服务当前可用的公开房间，确保 e2e 进入真实聊天页。
 * @param request Playwright APIRequestContext。
 * @param token 已登录 token。
 * @returns 一个可加入的公开房间。
 */
async function getJoinableRoom(request: APIRequestContext, token: string): Promise<RoomSummary> {
    const data = await requestGraphQL<{
        rooms: RoomSummary[]
    }>(
        request,
        `
            query {
                rooms(limit: 10) {
                    id
                    name
                    type
                    msgCount
                }
            }
        `,
        undefined,
        token
    )

    const room =
        data.rooms.find(item => (!item.type || item.type === "normal") && item.msgCount > 0) ||
        data.rooms.find(item => !item.type || item.type === "normal")
    if (!room) {
        throw new Error("本地服务没有可加入的公开房间，无法执行聊天 e2e")
    }
    return room
}

/**
 * @description 在浏览器上下文创建前注入登录态，保证页面首屏就以真实用户身份发起请求。
 * @param browser Playwright 浏览器实例。
 * @param token 用户 JWT。
 * @returns 已注入登录态的新上下文。
 */
async function createLoggedInContext(browser: Browser, token: string): Promise<BrowserContext> {
    const context = await browser.newContext()
    await context.addInitScript(value => {
        window.localStorage.setItem("jwt_token", value)
        window.localStorage.removeItem("user_profile")
        window.localStorage.removeItem("room_readed_count")
    }, token)
    return context
}

/**
 * @description 打开真实聊天房间页面，并等待输入区域可用。
 * @param page Playwright 页面对象。
 * @param roomId 房间 ID。
 */
async function openChatRoom(page: Page, roomId: string) {
    await page.goto(`/chat/${roomId}?hideUpdateInfo=1`)
    await expect(page.locator(".rich-input[contenteditable]")).toBeVisible()
}

/**
 * @description 轮询 rtcClients 查询，确认前端 websocket 已把用户真正加入房间。
 * @param request Playwright APIRequestContext。
 * @param roomId 房间 ID。
 * @param token 已登录 token。
 * @param expectedAtLeast 期望在线人数下限。
 */
async function waitForRtcClients(request: APIRequestContext, roomId: string, token: string, expectedAtLeast: number) {
    await expect
        .poll(
            async () => {
                const data = await requestGraphQL<{
                    rtcClients: { id: string; user: { id: string; name: string } }[]
                }>(
                    request,
                    `
                        query ($roomId: String!) {
                            rtcClients(roomId: $roomId) {
                                id
                                user {
                                    id
                                    name
                                }
                            }
                        }
                    `,
                    { roomId },
                    token
                )
                return data.rtcClients.length
            },
            {
                message: `等待房间 ${roomId} 的 websocket 在线人数达到 ${expectedAtLeast}`,
                timeout: 20000,
                intervals: [500, 1000, 1000],
            }
        )
        .toBeGreaterThanOrEqual(expectedAtLeast)
}

/**
 * @description 读取当前聊天消息 DOM 的纯文本序列，用于校验老消息仍在且新增消息追加顺序正确。
 * @param page Playwright 页面对象。
 * @returns 按页面顺序排列的消息文本数组。
 */
async function getRenderedMessageTexts(page: Page) {
    const texts = await page.locator(".safe-html").allTextContents()
    return texts.map(item => item.replace(/\s+/g, " ").trim()).filter(Boolean)
}

/**
 * @description 读取聊天消息滚动容器的滚动指标，用于校验是否自动贴底。
 * @param page Playwright 页面对象。
 * @returns 当前消息滚动容器的滚动信息；找不到时返回 null。
 */
async function getMessageViewportMetrics(page: Page) {
    return page.evaluate(() => {
        const firstMessage = document.querySelector(".safe-html")
        if (!(firstMessage instanceof HTMLElement)) return null

        let current: HTMLElement | null = firstMessage.parentElement
        while (current) {
            const style = window.getComputedStyle(current)
            const isScrollable = current.scrollHeight > current.clientHeight && ["auto", "scroll"].includes(style.overflowY)
            if (isScrollable) break
            current = current.parentElement
        }
        if (!(current instanceof HTMLElement)) return null

        return {
            scrollTop: current.scrollTop,
            clientHeight: current.clientHeight,
            scrollHeight: current.scrollHeight,
        }
    })
}

/**
 * @description 将聊天消息滚动容器滚动到最底部，作为“用户当前正在看最新消息”的前置状态。
 * @param page Playwright 页面对象。
 */
async function scrollChatToBottom(page: Page) {
    await page.evaluate(() => {
        const firstMessage = document.querySelector(".safe-html")
        if (!(firstMessage instanceof HTMLElement)) return

        let current: HTMLElement | null = firstMessage.parentElement
        while (current) {
            const style = window.getComputedStyle(current)
            const isScrollable = current.scrollHeight > current.clientHeight && ["auto", "scroll"].includes(style.overflowY)
            if (isScrollable) {
                current.scrollTop = current.scrollHeight
                return
            }
            current = current.parentElement
        }
    })
}

/**
 * @description 断言聊天消息列表当前已严格滚动到底部，仅允许极小的像素误差。
 * @param page Playwright 页面对象。
 */
async function expectChatStrictlyAtBottom(page: Page) {
    await expect
        .poll(
            async () => {
                const metrics = await getMessageViewportMetrics(page)
                if (!metrics) return Number.POSITIVE_INFINITY
                return metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop
            },
            {
                message: "等待聊天消息滚动到最底部",
                timeout: 15000,
                intervals: [200, 500, 1000],
            }
        )
        .toBeLessThanOrEqual(CHAT_STRICT_BOTTOM_TOLERANCE_PX)
}

test.describe("chat subscription e2e", () => {
    test("newMessage 会通过真实订阅链路更新接收端 DOM", async ({ browser, request }) => {
        const receiver = await createGuestSession(request, "E2EA")
        const sender = await createGuestSession(request, "E2EB")
        const room = await getJoinableRoom(request, receiver.token)
        const content = `playwright-e2e-${Date.now()}`

        const receiverContext = await createLoggedInContext(browser, receiver.token)
        const senderContext = await createLoggedInContext(browser, sender.token)
        const receiverPage = await receiverContext.newPage()
        const senderPage = await senderContext.newPage()

        try {
            await openChatRoom(receiverPage, room.id)
            await openChatRoom(senderPage, room.id)

            await waitForRtcClients(request, room.id, receiver.token, 2)

            const beforeTexts = await getRenderedMessageTexts(receiverPage)
            if (room.msgCount > 0) {
                expect(beforeTexts.length).toBeGreaterThan(0)
            }
            await scrollChatToBottom(receiverPage)
            await expectChatStrictlyAtBottom(receiverPage)

            const input = senderPage.locator(".rich-input[contenteditable]")
            await input.click()
            await input.fill(content)
            await senderPage.getByRole("button", { name: /发送|Send/i }).click()

            const receiverNewMessage = receiverPage.locator(".safe-html", { hasText: content })
            await expect(receiverNewMessage).toHaveCount(1)
            await expect(receiverNewMessage.first()).toBeVisible()

            await expect
                .poll(
                    async () => {
                        const texts = await getRenderedMessageTexts(receiverPage)
                        return texts.some(item => item.includes(content))
                    },
                    {
                        message: "等待接收端消息列表完成新旧消息合并",
                        timeout: 15000,
                        intervals: [500, 1000, 1000],
                    }
                )
                .toBe(true)

            const finalTexts = await getRenderedMessageTexts(receiverPage)
            const newMessageIndex = finalTexts.findIndex(item => item.includes(content))
            expect(newMessageIndex).toBeGreaterThanOrEqual(0)
            expect(newMessageIndex).toBe(finalTexts.length - 1)
            await expectChatStrictlyAtBottom(receiverPage)

            for (const oldText of beforeTexts) {
                const oldMessageIndex = finalTexts.findIndex(item => item.includes(oldText))
                expect(oldMessageIndex).toBeGreaterThanOrEqual(0)
                expect(oldMessageIndex).toBeLessThan(newMessageIndex)
            }
        } finally {
            await receiverContext.close().catch(() => undefined)
            await senderContext.close().catch(() => undefined)
        }
    })
})
