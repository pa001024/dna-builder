import { describe, it, expect, beforeEach, vi } from "vitest"
import { DNAAPI } from "../src/index"

describe("DNAAPI", () => {
    let api: DNAAPI
    const mockDevCode = "test-device-code"
    const mockToken = "test-token"

    beforeEach(() => {
        // Reset API instance before each test
        api = new DNAAPI(mockDevCode, mockToken)
    })

    describe("Constructor", () => {
        it("should create DNAAPI instance with required parameters", () => {
            expect(api).toBeInstanceOf(DNAAPI)
            expect(api.dev_code).toBe(mockDevCode)
            expect(api.token).toBe(mockToken)
        })

        it("should set default values for optional parameters", () => {
            expect(api.is_h5).toBe(false)
            expect(api.RSA_PUBLIC_KEY).toBeTruthy()
            expect(api.BASE_URL).toBe("https://dnabbs-api.yingxiong.com/")
        })

        it("should accept custom fetchFn option", () => {
            const customFetch = vi.fn()
            const customApi = new DNAAPI(mockDevCode, mockToken, { fetchFn: customFetch })
            expect(customApi.fetchFn).toBe(customFetch)
        })

        it("should accept is_h5 option", () => {
            const h5Api = new DNAAPI(mockDevCode, mockToken, { is_h5: true })
            expect(h5Api.is_h5).toBe(true)
        })

        it("should accept custom RSA public key", () => {
            const customKey = "custom-rsa-key"
            const customApi = new DNAAPI(mockDevCode, mockToken, { rsa_public_key: customKey })
            expect(customApi.RSA_PUBLIC_KEY).toBe(customKey)
        })

        it("should handle empty RSA public key to fetch from server", () => {
            const customApi = new DNAAPI(mockDevCode, mockToken, { rsa_public_key: "" })
            expect(customApi.RSA_PUBLIC_KEY).toBe("")
        })
    })

    describe("getHeaders", () => {
        it("should generate iOS headers by default", async () => {
            const { headers } = await api.getHeaders()
            expect(headers.version).toBe("1.1.3")
            expect(headers.source).toBe("ios")
            expect(headers["User-Agent"]).toContain("DoubleHelix")
        })

        it("should generate H5 headers when is_h5 is true", async () => {
            const h5Api = new DNAAPI(mockDevCode, mockToken, { is_h5: true })
            const { headers } = await h5Api.getHeaders()
            expect(headers.version).toBe("3.11.0")
            expect(headers.source).toBe("h5")
            expect(headers["User-Agent"]).toContain("Mozilla")
        })

        it("should include devCode in headers", async () => {
            const { headers } = await api.getHeaders({ dev_code: mockDevCode })
            expect(headers.devCode).toBe(mockDevCode)
        })

        it("should include token in headers when specified", async () => {
            const { headers } = await api.getHeaders({ token: mockToken })
            expect(headers.token).toBe(mockToken)
        })

        it("should include origin and refer when refer option is true", async () => {
            const { headers } = await api.getHeaders({ refer: true })
            expect(headers.origin).toBe("https://dnabbs.yingxiong.com")
            expect(headers.refer).toBe("https://dnabbs.yingxiong.com/")
        })

        it("should handle payload object and generate signature", async () => {
            const payload = { test: "value", number: 123 }
            const result = await api.getHeaders({ payload })
            expect(result.payload).toContain("test=value")
            expect(result.payload).toContain("number=123")
            expect(result.payload).toContain("sign=")
            expect(result.payload).toContain("timestamp=")
        })

        it("should handle string payload without modification", async () => {
            const payload = "already=encoded&data=test"
            const result = await api.getHeaders({ payload })
            expect(result.payload).toBe(payload)
        })

        it("should merge exparams with payload", async () => {
            const payload = { test: "value" }
            const exparams = { extra: "param" }
            const result = await api.getHeaders({ payload, exparams })
            expect(result.payload).toContain("test=value")
            expect(result.payload).toContain("extra=param")
        })
    })

    describe("getRsaPublicKey", () => {
        it("should return existing RSA public key if set", async () => {
            const key = await api.getRsaPublicKey()
            expect(key).toBeTruthy()
            expect(key).toBe(api.RSA_PUBLIC_KEY)
        })

        it("should fetch RSA public key from server if not set", async () => {
            const mockResponse = { code: 200, success: true, data: { key: "fetched-key" } }
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => mockResponse,
                headers: new Map([["content-type", "application/json"]]),
            })

            const emptyKeyApi = new DNAAPI(mockDevCode, mockToken, { 
                rsa_public_key: "", 
                fetchFn: mockFetch as any 
            })
            
            const key = await emptyKeyApi.getRsaPublicKey()
            expect(key).toBe("fetched-key")
            expect(emptyKeyApi.RSA_PUBLIC_KEY).toBe("fetched-key")
        })
    })

    describe("API Methods - Data Structure", () => {
        let mockFetch: any

        beforeEach(() => {
            mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ code: 200, success: true, data: {} }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch
        })

        it("login should send correct data structure", async () => {
            const mobile = "1234567890"
            const code = "123456"
            await api.login(mobile, code)

            expect(mockFetch).toHaveBeenCalled()
            const [url, options] = mockFetch.mock.calls[0]
            expect(url).toContain("user/sdkLogin")
            expect(options.body).toContain(`mobile=${mobile}`)
            expect(options.body).toContain(`code=${code}`)
            expect(options.body).toContain("gameList=268")
        })

        it("getPostList should use default parameters", async () => {
            await api.getPostList()

            expect(mockFetch).toHaveBeenCalled()
            const [url, options] = mockFetch.mock.calls[0]
            expect(url).toContain("forum/list")
            expect(options.body).toContain("forumId=48")
            expect(options.body).toContain("pageIndex=1")
            expect(options.body).toContain("pageSize=20")
        })

        it("getPostList should accept custom parameters", async () => {
            await api.getPostList(100, 2, 50, 2, 1)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("forumId=100")
            expect(options.body).toContain("pageIndex=2")
            expect(options.body).toContain("pageSize=50")
            expect(options.body).toContain("searchType=2")
            expect(options.body).toContain("timeType=1")
        })

        it("getCharDetail should send required parameters", async () => {
            await api.getCharDetail("char123", "eid456")

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("charId=char123")
            expect(options.body).toContain("charEid=eid456")
            expect(options.body).toContain("type=1")
        })

        it("getCharDetail should include otherUserId when provided", async () => {
            await api.getCharDetail("char123", "eid456", "user789")

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("otherUserId=user789")
        })

        it("getWeaponDetail should send correct data", async () => {
            await api.getWeaponDetail("weapon123", "weid456")

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("weaponId=weapon123")
            expect(options.body).toContain("weaponEid=weid456")
        })

        it("doFollow should handle follow action", async () => {
            await api.doFollow("user123", false)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("followUserId=user123")
            expect(options.body).toContain("operateType=1")
        })

        it("doFollow should handle unfollow action", async () => {
            await api.doFollow("user123", true)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("operateType=0")
        })

        it("doLike should format post data correctly", async () => {
            const post = {
                gameForumId: "forum1",
                postId: "post1",
                postType: "1",
                userId: "user1",
            }
            await api.doLike(post)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("forumId=forum1")
            expect(options.body).toContain("postId=post1")
            expect(options.body).toContain("toUserId=user1")
        })

        it("createComment should format content as JSON array", async () => {
            const post = { userId: "user1", postId: "post1", gameForumId: 48 }
            await api.createComment(post, "test comment")

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("postId=post1")
            expect(options.body).toContain("forumId=48")
            // Content should be JSON stringified array
            const decodedBody = decodeURIComponent(options.body)
            expect(decodedBody).toContain('"content":"test comment"')
            expect(decodedBody).toContain('"contentType":"1"')
        })

        it("lockPost should use default gameId when not provided", async () => {
            const post = { postId: 123, gameForumId: 48, operateType: 1 }
            await api.lockPost(post)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("gameId=268")
        })

        it("lockPost should use provided gameId", async () => {
            const post = { postId: 123, gameId: 999, gameForumId: 48, operateType: 1 }
            await api.lockPost(post)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("gameId=999")
        })
    })

    describe("Response Handling", () => {
        it("should handle successful JSON response", async () => {
            const mockData = { userId: "123", userName: "test" }
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ code: 200, success: true, data: mockData }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch

            const response = await api.getMine()
            expect(response.is_success).toBe(true)
            expect(response.data).toEqual(mockData)
        })

        it("should handle text response", async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                text: async () => "plain text response",
                headers: new Map([["content-type", "text/plain"]]),
            })
            api.fetchFn = mockFetch

            const response = await api.getMine()
            expect(response.data).toBe("plain text response")
        })

        it("should parse stringified JSON data in response", async () => {
            const mockData = { test: "value" }
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ 
                    code: 200, 
                    success: true, 
                    data: JSON.stringify(mockData) 
                }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch

            const response = await api.getMine()
            expect(response.data).toEqual(mockData)
        })

        it("should handle failed response", async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ code: 400, success: false, msg: "Bad Request" }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch

            const response = await api.getMine()
            expect(response.is_success).toBe(false)
            expect(response.code).toBe(400)
            expect(response.msg).toBe("Bad Request")
        })
    })

    describe("Token Management", () => {
        it("should update token after successful login", async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ 
                    code: 200, 
                    success: true, 
                    data: { token: "new-token-123" } 
                }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch

            expect(api.token).toBe(mockToken)
            await api.login("1234567890", "123456")
            expect(api.token).toBe("new-token-123")
        })

        it("should not update token on failed login", async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ code: 400, success: false, data: null }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch

            const originalToken = api.token
            await api.login("1234567890", "123456")
            expect(api.token).toBe(originalToken)
        })
    })

    describe("Error Handling and Retries", () => {
        it("should retry on network error", async () => {
            let callCount = 0
            const mockFetch = vi.fn().mockImplementation(() => {
                callCount++
                if (callCount < 2) {
                    return Promise.reject(new Error("Network error"))
                }
                return Promise.resolve({
                    json: async () => ({ code: 200, success: true, data: {} }),
                    headers: new Map([["content-type", "application/json"]]),
                })
            })
            api.fetchFn = mockFetch

            const response = await api.getMine()
            expect(mockFetch).toHaveBeenCalledTimes(2)
            expect(response.is_success).toBe(true)
        })

        it("should return error after max retries", async () => {
            const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"))
            api.fetchFn = mockFetch

            const response = await api.getMine()
            expect(mockFetch).toHaveBeenCalledTimes(3) // max_retries default is 3
            expect(response.is_success).toBe(false)
            expect(response.msg).toContain("请求服务器失败")
        })

        it("should handle timeout", async () => {
            const mockFetch = vi.fn().mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            json: async () => ({ code: 200, success: true }),
                            headers: new Map([["content-type", "application/json"]]),
                        })
                    }, 15000) // Longer than default timeout
                })
            })
            api.fetchFn = mockFetch

            const response = await api.getMine()
            // Should fail due to timeout
            expect(response.is_success).toBe(false)
        }, 12000)
    })

    describe("Special Method Tests", () => {
        let mockFetch: any

        beforeEach(() => {
            mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ code: 200, success: true, data: {} }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch
        })

        it("gameSign should send correct signin data", async () => {
            await api.gameSign(1, 100)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("dayAwardId=1")
            expect(options.body).toContain("periodId=100")
            expect(options.body).toContain("signinType=1")
        })

        it("searchPost should include all search parameters", async () => {
            await api.searchPost(123, 1, 20, 268, 2)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("keyword=123")
            expect(options.body).toContain("pageIndex=1")
            expect(options.body).toContain("searchType=2")
        })

        it("report should handle optional parameters", async () => {
            await api.report({ postId: 123 })

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("postId=123")
            expect(options.body).toContain("commentId=0")
            expect(options.body).toContain("replyId=0")
            expect(options.body).toContain("reportReason=1")
        })

        it("collect should use default operateType", async () => {
            await api.collect(123, "user456")

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("operateType=1")
        })

        it("collect should accept custom operateType", async () => {
            await api.collect(123, "user456", 0)

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("operateType=0")
        })

        it("adminMovePost should send all required parameters", async () => {
            const post = { postId: 123, gameForumId: 48 }
            await api.adminMovePost(post, 300, 50, "topic123")

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("newGameId=300")
            expect(options.body).toContain("newForumId=50")
            expect(options.body).toContain("newTopicIdStr=topic123")
        })

        it("getOtherMine should use default userId", async () => {
            await api.getOtherMine()

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("otherUserId=709542994134436647")
        })

        it("getOtherMine should accept custom userId", async () => {
            await api.getOtherMine("custom123")

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("otherUserId=custom123")
        })

        it("getPostsByTopic should use default topicId", async () => {
            await api.getPostsByTopic()

            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("topicId=177")
        })
    })

    describe("Edge Cases", () => {
        it("should handle undefined optional parameters", async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ code: 200, success: true, data: {} }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch

            await api.getCharDetail("char1", "eid1", undefined)
            
            const [, options] = mockFetch.mock.calls[0]
            // undefined should not be included in body
            expect(options.body).not.toContain("otherUserId=undefined")
        })

        it("should handle empty string parameters", async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ code: 200, success: true, data: {} }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch

            await api.getPostDetail("")
            
            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("postId=")
        })

        it("should handle zero values correctly", async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                json: async () => ({ code: 200, success: true, data: {} }),
                headers: new Map([["content-type", "application/json"]]),
            })
            api.fetchFn = mockFetch

            await api.gameSign(0, 0)
            
            const [, options] = mockFetch.mock.calls[0]
            expect(options.body).toContain("dayAwardId=0")
            expect(options.body).toContain("periodId=0")
        })
    })
})