import * as forge from "node-forge"
//#region const
enum RespCode {
    ERROR = -999,
    OK_ZERO = 0,
    OK_HTTP = 200,
    BAD_REQUEST = 400,
    SERVER_ERROR = 500,
}

const DNA_GAME_ID = 268
//#endregion

/**
 * DNA API类，用于与DNA游戏服务器交互
 */
export class DNAAPI {
    public fetchFn?: typeof fetch
    public is_h5 = false
    public RSA_PUBLIC_KEY =
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDGpdbezK+eknQZQzPOjp8mr/dP+QHwk8CRkQh6C6qFnfLH3tiyl0pnt3dePuFDnM1PUXGhCkQ157ePJCQgkDU2+mimDmXh0oLFn9zuWSp+U8uLSLX3t3PpJ8TmNCROfUDWvzdbnShqg7JfDmnrOJz49qd234W84nrfTHbzdqeigQIDAQAB"
    public BASE_URL = "https://dnabbs-api.yingxiong.com/"

    /**
     * 构造函数
     * @param dev_code 设备码
     * @param uid 用户ID
     * @param token 访问令牌
     * @param options 选项
     * @param options.fetchFn 自定义fetch函数
     * @param options.is_h5 是否为H5端
     * @param options.rsa_public_key RSA公钥(base64) 设为空字符串从服务器获取
     */
    constructor(
        public dev_code: string,
        public token = "",
        options: { fetchFn?: typeof fetch; is_h5?: boolean; rsa_public_key?: string } = {},
    ) {
        this.fetchFn = options.fetchFn
        if (options.is_h5 !== undefined) this.is_h5 = options.is_h5
        if (options.rsa_public_key !== undefined) this.RSA_PUBLIC_KEY = options.rsa_public_key
    }

    /**
     * 获取RSA公钥
     * @returns RSA公钥(base64)
     */
    async getRsaPublicKey() {
        if (this.RSA_PUBLIC_KEY) {
            return this.RSA_PUBLIC_KEY
        }
        const res = await this._dna_request<{ key: string }>("config/getRsaPublicKey")

        if (res.is_success && res.data) {
            const key = res.data.key
            if (typeof key === "string") {
                this.RSA_PUBLIC_KEY = key
            }
        }
        return this.RSA_PUBLIC_KEY
    }

    /**
     * 登录
     */
    async login(mobile: string, code: string) {
        const data = { mobile, code, gameList: DNA_GAME_ID }
        const res = await this._dna_request<DNALoginRes>("user/sdkLogin", data, { sign: true, refer: true })
        if (res.is_success && res.data) {
            const data = res.data
            if (typeof data.token === "string") {
                this.token = data.token
            }
        }
        return res
    }

    /**
     * 获取登录日志
     */
    async loginLog() {
        return await this._dna_request<DNALoginRes>("user/login/log")
    }

    /**
     * 获取角色列表
     */
    async getRoleList() {
        return await this._dna_request<DNARoleListRes>("role/list")
    }

    /**
     * 获取默认角色
     */
    async getDefaultRoleForTool() {
        const data = { type: 1 }
        return await this._dna_request<DNARoleForToolRes>("role/defaultRoleForTool", data, { sign: true, token: true, tokenSig: true })
    }

    /**
     * 获取角色详情
     */
    async getCharDetail(char_id: string, char_eid: string, otherUserId?: string) {
        const data = { charId: char_id, charEid: char_eid, type: 1, otherUserId } as any
        return await this._dna_request<DNACharDetailRes>("role/getCharDetail", data)
    }

    /**
     * 获取武器详情
     */
    async getWeaponDetail(weapon_id: string, weapon_eid: string, otherUserId?: string) {
        const data = { weaponId: weapon_id, weaponEid: weapon_eid, type: 1, otherUserId }
        return await this._dna_request<DNAWeaponDetailRes>("role/getWeaponDetail", data)
    }

    /**
     * 获取角色简讯
     */
    async getShortNoteInfo() {
        return await this._dna_request<DNARoleShortNoteRes>("role/getShortNoteInfo")
    }

    /**
     * 检查是否签到
     */
    async haveSignIn() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNAHaveSignInRes>("user/haveSignInNew", data)
    }

    /**
     * 签到日历
     */
    async signCalendar() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNACalendarSignRes>("encourage/signin/show", data)
    }

    /** ? */
    async soulTask() {
        return await this._dna_request("role/soul/task")
    }

    /**
     * 游戏签到
     */
    async gameSign(day_award_id: number, period: number) {
        const data = {
            dayAwardId: day_award_id,
            periodId: period,
            signinType: 1,
        }
        return await this._dna_request("encourage/signin/signin", data)
    }

    /**
     * 皎皎角签到
     */
    async bbsSign() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request("user/signIn", data)
    }

    /**
     * 获取任务进度
     */
    async getTaskProcess() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNATaskProcessRes>("encourage/level/getTaskProcess", data)
    }

    /**
     * 获取帖子列表
     * @param forumId 论坛ID
     * @param pageIndex 页码
     * @param pageSize 每页数量
     * @param searchType 搜索类型 1:最新 2:热门
     * @param timeType 时间类型 0:全部 1:今日 2:本周 3:本月
     * @returns 帖子列表
     */
    async getPostList(forumId: number = 48, pageIndex: number = 1, pageSize: number = 20, searchType: number = 1, timeType: number = 0) {
        const data = {
            forumId: forumId,
            gameId: DNA_GAME_ID,
            pageIndex: pageIndex,
            pageSize: pageSize,
            searchType: searchType, // 1:最新 2:热门
            timeType: timeType, // 0:全部 1:今日 2:本周 3:本月
        }
        return await this._dna_request<DNAPostListRes>("forum/list", data)
    }

    /** 管理员锁定帖子 */
    async lockPost(post: { postId: number; gameId?: number; gameForumId: number; operateType: number }) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            operateType: post.operateType,
        }
        return await this._dna_request("forum/moderator/postLock", data)
    }

    /** 管理员移动帖子 */
    async postDownOrUp(post: { postId: number; gameId?: number; gameForumId: number; operateType: number }) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            operateType: post.operateType,
        }
        return await this._dna_request("forum/moderator/postDownOrUp", data)
    }

    /** 管理员设精 */
    async postElite(post: { postId: number; gameId?: number; gameForumId: number; operateType: number }) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            operateType: post.operateType,
        }
        return await this._dna_request("forum/moderator/postElite", data)
    }

    /** 管理员隐藏帖子 */
    async postHide(post: { postId: number; gameId?: number; gameForumId: number; operateType: number }) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            operateType: post.operateType,
        }
        return await this._dna_request("forum/moderator/postHide", data)
    }

    /** 管理员设置权重 */
    async reRank(post: { postId: number; gameId?: number; gameForumId: number }, weight: number) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            weight: weight,
        }
        return await this._dna_request("forum/moderator/reRank", data)
    }

    /** 管理员设置强推 */
    async strongRecommend(post: { postId: number; gameId?: number; gameForumId: number }, operateType = 1) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            operateType: operateType,
        }
        return await this._dna_request("forum/moderator/setForceRecommend", data)
    }

    /** 管理员删帖 */
    async adminDelete(post: { postId: number; gameId?: number; gameForumId: number }, content: string, reasonCode: number) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            content: content,
            reasonCode: reasonCode,
        }
        return await this._dna_request("forum/moderator/postDelete", data)
    }
    /** 管理员移动帖子 */
    async adminMovePost(
        post: { postId: number; gameId?: number; gameForumId: number },
        newGameId: number,
        newForumId: number,
        newTopicIdStr: string,
    ) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            newGameId: newGameId,
            newForumId: newForumId,
            newTopicIdStr: newTopicIdStr,
        }
        return await this._dna_request("forum/moderator/postMove", data)
    }
    /** ? */
    async adminRefreshTime(post: { postId: number; gameId?: number; gameForumId: number }, refresh: number) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            refresh: refresh,
        }
        return await this._dna_request("forum/moderator/setRefresh", data)
    }

    /** 黑名单 */
    async blockList() {
        return await this._dna_request("user/block/list")
    }

    /** 拉黑 */
    async blockOther(blockPostId: number, blockUserId: string, type: number) {
        const data = {
            blockPostId: blockPostId,
            blockUserId: blockUserId,
            type: type,
        }
        return await this._dna_request("user/block/list", data)
    }

    /** ? */
    async viewCommunity() {
        return await this._dna_request("encourage/level/viewCommunity")
    }

    /** ? */
    async viewCount() {
        return await this._dna_request("forum/viewCount")
    }

    /** ? */
    async receiveLog(periodId: number, pageIndex: number, pageSize: number) {
        const data = {
            periodId: periodId,
            pageIndex: pageIndex,
            pageSize: pageSize,
        }
        return await this._dna_request("encourage/signin/receiveLog", data)
    }

    /** 收藏 */
    async collect(postId: number, toUserId: string, operateType = 1) {
        const data = {
            operateType: operateType,
            postId: postId,
            toUserId: toUserId,
        }
        return await this._dna_request("forum/collect", data)
    }

    /** 删除评论 */
    async commentDelete(
        comment: { id: number; gameId: number; gameForumId: number },
        entityType: number,
        content: string,
        reasonCode: number,
    ) {
        const data = {
            id: comment.id,
            gameId: comment.gameId,
            gameForumId: comment.gameForumId,
            entityType: entityType,
            content: content,
            reasonCode: reasonCode,
        }
        return await this._dna_request("forum/collect", data)
    }

    /** 推荐列表 */
    async recommendList(recIndex: number, newIndex: number, size: number, history: number, gameId = DNA_GAME_ID) {
        const data = {
            gameId: gameId,
            recIndex: recIndex,
            newIndex: newIndex,
            size: size,
            history: history,
        }
        return await this._dna_request("forum/recommend/list", data)
    }

    /** 举报 */
    async report(
        { commentId = 0, postId = 0, replyId = 0 }: { commentId?: number; postId?: number; replyId?: number },
        reportReason = 1,
        reportType = 1,
    ) {
        const data = {
            commentId: commentId,
            postId: postId,
            replyId: replyId,
            reportReason: reportReason,
            reportType: reportType,
        }
        return await this._dna_request<DNAPostListRes>("forum/recommend/list", data)
    }
    /** 搜索帖子 */
    async searchPost(keyword: number, pageIndex: number, pageSize: number, gameId = DNA_GAME_ID, searchType = 1) {
        const data = {
            gameId: gameId,
            keyword: keyword,
            pageIndex: pageIndex,
            pageSize: pageSize,
            searchType: searchType,
        }
        return await this._dna_request<DNAPostListRes>("forum/searchPost", data)
    }
    /** 搜索帖子 */
    async searchTopic(keyword: number, pageIndex: number, pageSize = 20, gameId = DNA_GAME_ID) {
        const data = {
            gameId: gameId,
            keyword: keyword,
            pageIndex: pageIndex,
            pageSize: pageSize,
        }
        return await this._dna_request<DNAPostListRes>("config/searchTopic", data)
    }

    /** 搜索帖子 */
    async searchUser(keyword: number, pageIndex: number, pageSize: number) {
        const data = {
            keyword: keyword,
            pageIndex: pageIndex,
            pageSize: pageSize,
        }
        return await this._dna_request<DNAPostListRes>("user/searchUser", data)
    }

    /**
     * 获取帖子列表
     * @param topicId 主题ID
     * @param pageIndex 页码
     * @param pageSize 每页数量
     * @param searchType 搜索类型 1:最新 2:热门
     * @param timeType 时间类型 0:全部 1:今日 2:本周 3:本月
     * @returns 帖子列表
     */
    async getPostsByTopic(
        topicId: number = 177,
        pageIndex: number = 1,
        pageSize: number = 20,
        searchType: number = 1,
        timeType: number = 0,
    ) {
        const data = {
            topicId: topicId,
            gameId: DNA_GAME_ID,
            pageIndex: pageIndex,
            pageSize: pageSize,
            searchType: searchType, // 1:最新 2:热门
            timeType: timeType, // 0:全部 1:今日 2:本周 3:本月
        }
        return await this._dna_request<DNAPostListRes>("forum/getPostByTopic", data)
    }

    /**
     * 获取帖子详情
     * @param post_id 帖子ID
     * @returns 帖子详情
     */
    async getPostDetail(post_id: string) {
        const data = { postId: post_id }
        return await this._dna_request<DNAPostDetailRes>("forum/getPostDetail", data)
    }

    /** 关注用户 */
    async doFollow(userId: string, unfollow?: boolean) {
        const data = {
            followUserId: userId,
            operateType: unfollow ? 0 : 1,
        }
        return await this._dna_request("user/followUser", data, { sign: true })
    }

    /** 获取关注状态 */
    async getFollowState(userId: string) {
        const data = {
            followUserId: userId,
        }
        return await this._dna_request("user/isFollow", data)
    }

    /**
     * 点赞帖子
     */
    async doLike(post: { gameForumId: string; postId: string; postType: string; userId: string }) {
        const data = {
            forumId: post.gameForumId,
            gameId: DNA_GAME_ID,
            likeType: "1",
            operateType: "1",
            postCommentId: "",
            postCommentReplyId: "",
            postId: post.postId,
            postType: post.postType,
            toUserId: post.userId,
        }
        return await this._dna_request("forum/like", data)
    }

    /** 分享帖子 */
    async doShare() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request("encourage/level/shareTask", data)
    }

    /** 回复帖子 */
    async createComment(post: { userId: string; postId: string; gameForumId: number }, content: string) {
        const content_json = JSON.stringify([
            {
                content,
                contentType: "1",
                imgHeight: 0,
                imgWidth: 0,
                url: "",
            },
        ])
        const data = {
            postId: post.postId,
            forumId: post.gameForumId,
            postType: "1",
            content: content_json,
        }

        return await this._dna_request("forum/comment/createComment", data, { sign: true, refer: true, params: { toUserId: post.userId } })
    }

    /** 回复评论 */
    async createReply(post: { userId: string; postId: string; postCommentId: string; gameForumId: number }, content: string) {
        const content_json = JSON.stringify([
            {
                content,
                contentType: "1",
                imgHeight: 0,
                imgWidth: 0,
                url: "",
            },
        ])
        const data = {
            content: content_json,
            forumId: post.gameForumId,
            postCommentId: post.postCommentId,
            postId: post.postId,
            postType: "1",
            toUserId: post.userId,
        }

        return await this._dna_request("forum/comment/createReply", data, { sign: true, refer: true, params: { toUserId: post.userId } })
    }

    /** 回复评论的评论 */
    async createReplyList(
        post: { userId: string; postId: string; postCommentId: string; postCommentReplyId: string; gameForumId: number },
        content: string,
    ) {
        const content_json = JSON.stringify([
            {
                content,
                contentType: "1",
                imgHeight: 0,
                imgWidth: 0,
                url: "",
            },
        ])
        const data = {
            content: content_json,
            forumId: post.gameForumId,
            postCommentId: post.postCommentId,
            postCommentReplyId: post.postCommentReplyId,
            postId: post.postId,
            postType: "1",
            toUserId: post.userId,
        }
        return await this._dna_request("forum/comment/createReply", data, { sign: true, refer: true, params: { toUserId: post.userId } })
    }

    /** 删 */
    async deletePost(deleteType: number, id: number) {
        return await this._dna_request("forum/more/delete", { deleteType, id }, { sign: true, refer: true })
    }

    /**
     * 获取用户信息
     * @returns 用户信息
     */
    async getOtherMine(userId = "709542994134436647") {
        const data = {
            otherUserId: userId,
            searchType: 1,
            type: 2,
        }
        return await this._dna_request<DNAMineRes>("user/mine", data)
    }

    /**
     * 获取用户信息
     * @returns 用户信息
     */
    async getMine() {
        return await this._dna_request<DNAMineRes>("user/mine")
    }

    async getGameConfig() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNAGameConfigRes[]>("config/getGameConfig", data)
    }

    async getHeaders(options?: {
        payload?: Record<string, any> | string
        exparams?: Record<string, any>
        dev_code?: string
        refer?: boolean
        token?: string
        tokenSig?: boolean
    }) {
        let { payload, exparams, dev_code = this.dev_code, refer, token = this.token, tokenSig } = options || {}

        const CONTENT_TYPE = "application/x-www-form-urlencoded; charset=utf-8"
        const iosBaseHeader = {
            version: "1.1.3",
            source: "ios",
            "Content-Type": CONTENT_TYPE,
            "User-Agent": "DoubleHelix/4 CFNetwork/3860.100.1 Darwin/25.0.0",
        }
        const h5BaseHeader = {
            version: "3.11.0",
            source: "h5",
            "Content-Type": CONTENT_TYPE,
            "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        }
        // 默认获取ios头
        const headers = { ...(this.is_h5 ? h5BaseHeader : iosBaseHeader) } as Record<string, any>
        if (dev_code) {
            headers.devCode = dev_code
        }
        if (refer) {
            headers.origin = "https://dnabbs.yingxiong.com"
            headers.refer = "https://dnabbs.yingxiong.com/"
        }
        if (token) {
            headers.token = token
        }
        if (typeof payload === "object") {
            const si = build_signature(payload, tokenSig ? token : "")
            Object.assign(payload, { sign: si.s, timestamp: si.t })
            if (exparams) {
                Object.assign(payload, exparams)
            }

            const params = new URLSearchParams()
            Object.entries(payload).forEach(([key, value]) => {
                params.append(key, String(value))
            })
            payload = params.toString()

            const rk = si.k
            const pk = await this.getRsaPublicKey()
            const ek = rsa_encrypt(rk, pk)
            if (this.is_h5) {
                headers.k = ek
            } else {
                headers.rk = rk
                headers.key = ek
            }
        }
        return { headers, payload }
    }

    private async _dna_request<T = any>(
        url: string,
        data?: any,
        options?: {
            method?: "GET" | "POST"
            sign?: boolean
            tokenSig?: boolean
            token?: boolean
            refer?: boolean
            params?: Record<string, any>
            max_retries?: number
            retry_delay?: number
            timeout?: number
        },
    ): Promise<DNAApiResponse<T>> {
        let { method = "POST", sign, refer, params, max_retries = 3, retry_delay = 1, timeout = 10000, token, tokenSig } = options || {}
        let headers: Record<string, any>
        if (sign) {
            const { payload: p, headers: h } = await this.getHeaders({
                payload: data,
                refer,
                exparams: params,
                token: token ? this.token : undefined,
                tokenSig,
            })
            data = p
            headers = h
        } else {
            const { headers: h } = await this.getHeaders({ token: token ? this.token : undefined })
            headers = h
        }

        for (let attempt = 0; attempt < max_retries; attempt++) {
            try {
                let body: string = data
                if (data && typeof data === "object") {
                    const p = new URLSearchParams()
                    Object.entries(data).forEach(([key, value]) => {
                        if (value !== undefined) p.append(key, String(value))
                    })
                    body = p.toString()
                }
                const fetchOptions: RequestInit = {
                    method,
                    headers,
                    body,
                }

                // 实现超时控制
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), timeout)

                const initOptions = {
                    ...fetchOptions,
                    signal: controller.signal,
                }
                const response = this.fetchFn
                    ? await this.fetchFn(`${this.BASE_URL}${url}`, initOptions)
                    : await fetch(`${this.BASE_URL}${url}`, initOptions)
                clearTimeout(timeoutId)

                // 获取响应头的 content-type
                const contentType = response.headers.get("content-type") || ""
                let raw_res: any

                // 根据 content-type 处理响应数据
                if (contentType.includes("text/")) {
                    const textData = await response.text()
                    raw_res = {
                        code: RespCode.ERROR,
                        data: textData,
                    }
                } else {
                    raw_res = await response.json()
                }

                if (typeof raw_res === "object" && raw_res !== null) {
                    try {
                        if (typeof raw_res.data === "string") {
                            raw_res.data = JSON.parse(raw_res.data)
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }

                return new DNAApiResponse<T>(raw_res)
            } catch (e) {
                console.error(`请求失败: ${(e as Error).message}`)
                if (attempt < max_retries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, retry_delay * Math.pow(2, attempt)))
                }
            }
        }

        return DNAApiResponse.err("请求服务器失败，已达最大重试次数")
    }
}

enum DNAInstanceMHType {
    "角色" = "role",
    "武器" = "weapon",
    "魔之楔" = "mzx",
    "role" = "角色",
    "weapon" = "武器",
    "mzx" = "魔之楔",
}

export function getDNAInstanceMHType(key: keyof typeof DNAInstanceMHType) {
    return DNAInstanceMHType[key]
}

//#region 接口定义

export interface DNAMineRes {
    mine: DNAMine
    postList: DNAPost[]
    hasNext: number
}

export interface DNAMine {
    /** 文章数量 */
    articleCount: number
    /** 收藏数量 */
    collectCount: number
    /** 评论数量 */
    commentCount: number
    /** 粉丝数量 */
    fansCount: number
    /** 新粉丝数量 */
    fansNewCount: number
    /** 关注数量 */
    followCount: number
    /** 性别 */
    gender: number
    /** 精华数量 */
    goldNum: number
    /** 头像 */
    headUrl: string
    /** 是否关注 */
    isFollow: number
    /** 是否登录用户 */
    isLoginUser: number
    /** 是否被禁言 */
    isMute: number
    /** 等级 */
    levelTotal: number
    /** 点赞数量 */
    likeCount: number
    /** 手机号 */
    mobile: string
    /** 管理员列表 */
    moderatorVos: any[]
    /** 帖子数量 */
    postCount: number
    /** 注册时间 */
    registerTime: string
    /** 状态 */
    status: number
    /** 趋势数量 */
    trendCount: number
    /** 用户ID */
    userId: string
    /** 用户名 */
    userName: string
}

export interface DNAGameConfigRes {
    /** 游戏所有板块列表 */
    gameAllForumList: GameForum[]
    /** 游戏ID */
    gameId: number
    /** 游戏板块图片列表 */
    gameForumPictureList: any[]
    /** 游戏板块列表 */
    gameForumList: GameForum[]
    /** 签到按钮图片 */
    signBtn: string
    sort: number
    /** 话题列表 */
    topicList: GameTopic[]
    /** 背景图片 */
    drawBackgroundUrl: string
    /** 是否默认游戏 */
    gameDefault: number
    /** 签到颜色 */
    signColor: string
    /** 游戏名称 */
    gameName: string
    /** CM图片2 意味不明 */
    drawListUrl: string
    /** 英文站点 */
    configTab: ConfigTab[]
}

export interface ConfigTab {
    name: string
    url: string
}

export interface GameTopic {
    /** 话题背景图片 */
    backgroundUrl: string
    gameId: number
    /** 话题图标 */
    topicIconUrl: string
    topicId: number
    /** 话题名称 */
    topicName: string
    sort: number
    /** 话题描述 */
    topicDesc: string
}

export interface GameForum {
    /** 全部=1 普通=3 */
    forumDataType: number
    /** 固定1 */
    forumUiType: number
    /** 小红点 */
    isTrend: number
    /** 夜间模式图标 */
    iconWhiteUrl: string
    /** 固定1 */
    forumType: number
    /** 板块名称 */
    name: string
    forumListShowType: number
    /** 图标 */
    iconUrl: string
    id: number
    sort: number
    /** 官方 */
    isOfficial: number
}

export interface UserGame {
    gameId: number // gameId
    gameName: string // gameName
}

export interface DNALoginRes {
    applyCancel?: number // applyCancel
    gender?: number // gender
    signature?: string // signature
    headUrl: string // headUrl
    userName: string // userName
    userId: string // userId
    isOfficial: number // isOfficial
    token: string // token
    userGameList: UserGame[] // userGameList
    isRegister: number // isRegister
    status: number // status
    /** 是否完成绑定 0: 未绑定, 1: 已绑定 */
    isComplete: number
    refreshToken: string // refreshToken
}

export interface DNARoleShowVo {
    roleId: string // roleId
    headUrl?: string // headUrl
    level?: number // level
    roleName?: string // roleName
    isDefault?: number // isDefault
    roleRegisterTime?: string // roleRegisterTime
    boundType?: number // boundType
    roleBoundId: string // roleBoundId
}

export interface DNARole {
    gameName: string // gameName
    showVoList: DNARoleShowVo[] // showVoList
    gameId: number // gameId
}

export interface DNARoleListRes {
    roles: DNARole[] // roles
}

/** 密函 */
export interface DNARoleForToolInstance {
    id: number
    /** 中文 */
    name: string
    /** 密函编码 */
    code: string
    /** 固定0 */
    on: number
}

export interface DNARoleForToolInstanceInfo {
    /** 密函列表 */
    instances: DNARoleForToolInstance[] // instances
}

export interface DraftDoingInfo {
    draftCompleteNum: number // draftCompleteNum
    draftDoingNum: number // draftDoingNum
    /** 结束时间 */
    endTime: string
    /** 产品id */
    productId?: number
    /** 产品名称 */
    productName: string
    /** 开始时间 */
    startTime: string
}

export interface DraftInfo {
    /** 正在做的锻造 */
    draftDoingInfo?: DraftDoingInfo[]
    /** 正在做的锻造数量 */
    draftDoingNum: number
    /** 最大锻造数量 */
    draftMaxNum: number
}

export interface DNARoleShortNoteRes {
    /** 迷津进度 */
    rougeLikeRewardCount: number
    /** 迷津总数 */
    rougeLikeRewardTotal: number
    /** 备忘手记进度 */
    currentTaskProgress: number
    /** 备忘手记总数 */
    maxDailyTaskProgress: number
    /** 梦魇进度 */
    hardBossRewardCount: number
    /** 梦魇总数 */
    hardBossRewardTotal: number
    /** 锻造信息 */
    draftInfo: DraftInfo
}

export interface DNARoleWeapon {
    weaponId: number
    weaponEid: string
    /** 武器类型图标 */
    elementIcon: string
    /** 武器图标 */
    icon: string
    /** 武器等级 */
    level: number
    /** 武器名称 */
    name: string
    /** 精炼等级 */
    skillLevel: number
    /** 是否解锁 */
    unLocked: boolean
}

export interface DNARoleChar {
    charId: number
    charEid: string
    /** 元素图标 */
    elementIcon: string
    /** 命座等级 */
    gradeLevel: number
    /** 角色图标 */
    icon: string
    /** 角色等级 */
    level: number
    /** 角色名称 */
    name: string
    /** 是否解锁 */
    unLocked: boolean
}

export interface DNARoleForToolRes {
    /** 角色信息 */
    roleInfo: DNARoleInfo
    /** 密函 */
    instanceInfo: DNARoleForToolInstanceInfo[]
}

export interface DNARoleShow {
    /** 角色列表 */
    roleChars: DNARoleChar[]
    /** 武器列表 */
    langRangeWeapons: DNARoleWeapon[]
    /** 武器列表 */
    closeWeapons: DNARoleWeapon[]
    /** 角色头像 */
    headUrl: string
    /** 等级 */
    level: number
    /** 成就列表 */
    params: DNARoleAchievement[]
    /** 角色id */
    roleId: string
    /** 角色名称 */
    roleName: string
    /** 迷津 */
    rougeLikeInfo: DNARougeLikeInfo
}

export interface DNARoleAchievement {
    paramKey: string // paramKey
    paramValue: string // paramValue
}

export interface DNARoleInfo {
    /** 深渊信息 */
    abyssInfo: DNAAbyssInfo
    /** 角色信息 */
    roleShow: DNARoleShow
}

export interface DNARougeLikeInfo {
    /** 最大通过等级 */
    maxPassed: number
    /** 最大通过等级名称 */
    maxPassedName: string
    /** 重置时间 */
    resetTime: string
    /** 奖励数量 */
    rewardCount: number
    /** 奖励总数 */
    rewardTotal: number
    /** 天赋信息 */
    talentInfo: DNARougeLikeTalentInfo[]
}

export interface DNARougeLikeTalentInfo {
    cur: string
    max: string
}

export interface DNAAbyssInfo {
    /** 阵容 */
    bestTimeVo1: DNABestTimeVo1
    /** 结束时间 */
    endTime: string
    /** 操作名称 */
    operaName: string
    /** 进度名称 */
    progressName: string
    /** 星级 */
    stars: string
    /** 开始时间 */
    startTime: string
}

/** 深渊阵容 */
export interface DNABestTimeVo1 {
    /** 角色图标 */
    charIcon: string
    /** 近战武器图标 */
    closeWeaponIcon: string
    /** 远程武器图标 */
    langRangeWeaponIcon: string
    /** 魔灵图标 */
    petIcon: string
    /** 协战角色图标1 */
    phantomCharIcon1: string
    /** 协战武器图标1 */
    phantomWeaponIcon1: string
    /** 协战角色图标2 */
    phantomCharIcon2: string
    /** 协战武器图标2 */
    phantomWeaponIcon2: string
}

/** 角色属性 */
export interface DNACharAttribute {
    /** 技能范围 */
    skillRange: string
    /** 强化值 */
    strongValue: string
    /** 技能威力 */
    skillIntensity: string
    /** 武器精通 */
    weaponTags: string[]
    /** 防御 */
    def: number
    /** 仇恨值 */
    enmityValue: string
    /** 技能效益 */
    skillEfficiency: string
    /** 技能耐久 */
    skillSustain: string
    /** 最大生命值 */
    maxHp: number
    /** 攻击 */
    atk: number
    /** 最大护盾 */
    maxES: number
    /** 最大神志 */
    maxSp: number
}

/** 角色技能 */
export interface DNARoleSkill {
    /** 技能id */
    skillId: number
    /** 技能图标 */
    icon: string
    /** 技能等级 */
    level: number
    /** 技能名称 */
    skillName: string
}

/** 溯源 */
export interface DNARoleTrace {
    /** 溯源图标 */
    icon: string
    /** 溯源描述 */
    description: string
}

/** 魔之楔 */
export interface DNARoleMod {
    /** id 没佩戴为-1 */
    id: number
    /** 图标 */
    icon?: string
    /** 质量 */
    quality?: number
    /** 名称 */
    name?: string
}

export interface DNACharDetail {
    charId: number
    /** 角色属性 */
    attribute: DNACharAttribute
    /** 角色技能 */
    skills: DNARoleSkill[]
    /** 立绘 */
    paint: string
    /** 角色名称 */
    charName: string
    /** 元素图标 */
    elementIcon: string
    /** 溯源 */
    traces: DNARoleTrace[]
    /** 当前魔之楔 */
    currentVolume: number
    /** 最大魔之楔 */
    sumVolume: number
    /** 角色等级 */
    level: number
    /** 角色头像 */
    icon: string
    /** 溯源等级 0-6 */
    gradeLevel: number
    /** 元素名称 */
    elementName: string
    /** 魔之楔列表 */
    modes: DNARoleMod[]
}

export interface DNACharDetailRes {
    /** 角色详情 */
    charDetail: DNACharDetail
}

export interface DNAWeaponDetailRes {
    /** 武器详情 */
    weaponDetail: DNAWeaponDetail
}

export interface DNAWeaponDetail {
    attribute: DNAWeaponAttribute
    currentVolume: number
    description: string
    elementIcon: string
    elementName: string
    icon: string
    id: number
    level: number
    modes: DNARoleMod[]
    name: string
    skillLevel: number
    sumVolume: number
}

export interface DNAWeaponAttribute {
    atk: number
    crd: number
    cri: number
    speed: number
    trigger: number
}

export interface DNADayAward {
    gameId: number // gameId
    periodId: number // periodId
    iconUrl: string // iconUrl
    id: number // id
    dayInPeriod: number // dayInPeriod
    updateTime: number // updateTime
    awardNum: number // awardNum
    thirdProductId: string // thirdProductId
    createTime: number // createTime
    awardName: string // awardName
}

export interface DNACaSignPeriod {
    gameId: number // gameId
    retryCos: number // retryCos
    endDate: number // endDate
    id: number // id
    startDate: number // startDate
    retryTimes: number // retryTimes
    overDays: number // overDays
    createTime: number // createTime
    name: string // name
}

export interface DNACaSignRoleInfo {
    headUrl: string // headUrl
    roleId: string // roleId
    roleName: string // roleName
    level: number // level
    roleBoundId: string // roleBoundId
}

export interface DNAHaveSignInRes {
    /** 已签到天数 */
    totalSignInDay: number
}

export interface DNACalendarSignRes {
    todaySignin: boolean // todaySignin
    userGoldNum: number // userGoldNum
    dayAward: DNADayAward[] // dayAward
    signinTime: number // signinTime
    period: DNACaSignPeriod // period
    roleInfo: DNACaSignRoleInfo // roleInfo
}

export interface DNABBSTask {
    /** 备注 */
    remark: string
    /** 完成次数 */
    completeTimes: number
    /** 需要次数 */
    times: number
    /** skipType */
    skipType: number
    /** 获取经验 */
    gainExp: number
    /** 进度 */
    process: number
    /** 获取金币 */
    gainGold: number
    /** 任务标识名 */
    markName?: string
}

export interface DNATaskProcessRes {
    dailyTask: DNABBSTask[] // dailyTask
}

export interface DNATopicPostListRes {
    postList: DNAPost[]
    topic: DNATopicDetail
    hasNext: number
}

export interface DNATopicDetail {
    backgroundUrl: string
    gameId: number
    sort: number
    topicDesc: string
    topicIconUrl: string
    topicId: number
    topicName: string
}

export interface DNAPost {
    browseCount: string
    collectionCount: number
    commentCount: number
    gameForumId: number
    gameId: number
    gameName: string
    imgContent: DNAPostImgContent[]
    imgCount: number
    isCollect: number
    isCreator: number
    isElite: number
    isFollow: number
    isLike: number
    isLock: number
    isOfficial: number
    isPublisher: number
    likeCount: number
    postContent: string
    postCover: string
    postCoverVo: DNAPostCoverVo
    postId: string
    postStatus: number
    postTitle: string
    postType: number
    showTime: string
    topics: DNATopicShort[]
    userHeadUrl: string
    userId: string
    userLevel: number
    userModeratorIdentity: number
    userName: string
}

export interface DNATopicShort {
    topicId: number
    topicName: string
}

export interface DNAPostCoverVo {
    imgHeight: number
    imgWidth: number
}

export interface DNAPostImgContent {
    imgHeight: number
    imgWidth: number
    url: string
    isAbnormal?: boolean
}

export interface DNAPostListRes {
    postList: DNAPost[] // posts
    topList: any[]
    hasNext: number
}

export interface DNAPostDetailRes {
    isHotCount: boolean
    gameId: number
    isFollow: number
    isLike: number
    postDetail: DNAPostDetail
    isCollect: number
    hasNext: number
    comment: DNAComment[]
}

export interface DNAPostDetail {
    auditStatus: number
    browseCount: string
    checkStatus: number
    collectionCount: number
    commentCount: number
    gameForumId: number
    gameForumVo: DNAGameForumVo
    gameId: number
    gameName: string
    headCodeUrl: string
    id: string
    isCreator: number
    isElite: number
    isForceRecommend: number
    isHide: number
    isLock: number
    isMine: number
    isOfficial: number
    isRecommend: number
    isTop: number
    lastEditorTime?: string
    likeCount: number
    postContent: DNAPostContent[]
    postH5Content: string
    postTime: string
    postTitle: string
    postType: number
    postUserId: string
    refreshHour: number
    score: number
    topics: DNATopicShort[]
    userHeadCode: string
    userLevel: number
    userModeratorIdentity: number
    userName: string
    whiteUrl: any[]
}

export interface DNAPostContent {
    contentType: PostContentType
    imgHeight: number
    imgWidth: number
    url?: string
    content?: string
    contentVideo?: DNAPostContentVideo
}

export interface DNAComment {
    checkStatus: number
    commentContent: DNAPostContent[]
    commentId: string
    commentTime: string
    contentTextStatus: number
    floor: number
    isCreator: number
    isLike: number
    isMine: number
    isOfficial: number
    isPublisher: number
    likeCount: number
    replyCount: number
    replyVos: DNAReplyVos[]
    userHeadCode?: string
    userHeadUrl: string
    userId: string
    userLevel: number
    userModeratorIdentity: number
    userName: string
}

export interface DNAReplyVos {
    checkStatus: number
    contentTextStatus: number
    createTime: number
    isCreator: number
    isLike: number
    isMine: number
    isOfficial: number
    isPublisher: number
    likeCount: number
    postCommentId: string
    postCommentReplayId: string
    replyContent: DNAPostContent[]
    replyContentStr: string
    replyId: string
    replyTime: string
    toUserIsCreator: number
    toUserModeratorIdentity: number
    toUserName: string
    userHeadCode?: string
    userHeadUrl: string
    userId: string
    userLevel: number
    userModeratorIdentity: number
    userName: string
}

export interface DNAGameForumVo {
    forumDataType: number
    forumListShowType: number
    forumType: number
    forumUiType: number
    iconUrl: string
    iconWhiteUrl: string
    id: number
    isOfficial: number
    isTrend: number
    name: string
    sort: number
}

export enum PostContentType {
    TEXT = 1,
    IMAGE = 2,
    VIDEO = 5,
}

export interface DNAPostContentVideo {
    videoUrl: string // videoUrl
    coverUrl?: string // coverUrl
}

class DNAApiResponse<T = any> {
    code: number = 0
    msg: string = ""
    success: boolean = false
    data?: T

    constructor(raw_data: any) {
        this.code = raw_data.code || 0
        this.msg = raw_data.msg || ""
        this.success = raw_data.success || false
        this.data = raw_data.data
    }

    // 判断是否成功
    get is_success() {
        return this.success && [RespCode.OK_ZERO, RespCode.OK_HTTP].includes(this.code)
    }

    // 错误响应静态方法
    static err<T = undefined>(msg: string, code: number = RespCode.ERROR): DNAApiResponse<T> {
        return new DNAApiResponse<T>({ code, msg, data: undefined, success: false })
    }
}
//#endregion

//#region utils

// RSA加密函数
function rsa_encrypt(text: string, public_key_b64: string): string {
    try {
        // 将base64公钥转换为PEM格式
        const lines: string[] = []
        for (let i = 0; i < public_key_b64.length; i += 64) {
            lines.push(public_key_b64.slice(i, i + 64))
        }
        const pem = `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`

        // 导入PEM格式的RSA公钥
        const publicKey = forge.pki.publicKeyFromPem(pem)

        // 执行PKCS1_v1_5加密
        const textBytes = forge.util.encodeUtf8(text)
        const encrypted = publicKey.encrypt(textBytes)

        return forge.util.encode64(encrypted)
    } catch (e) {
        throw new Error(`[DNA] RSA 加密失败: ${(e as Error).message}`)
    }
}

// 生成随机字符串
function rand_str(length: number = 16): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let result = ""
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

// MD5加密并转换为大写
function md5_upper(text: string): string {
    const md = forge.md.md5.create()
    md.update(text)
    return md.digest().toHex().toUpperCase()
}

// 签名哈希函数
function signature_hash(text: string): string {
    function swap_positions(text: string, positions: number[]): string {
        const chars = text.split("")
        for (let i = 1; i < positions.length; i += 2) {
            const p1 = positions[i - 1]
            const p2 = positions[i]
            if (p1 >= 0 && p1 < chars.length && p2 >= 0 && p2 < chars.length) {
                ;[chars[p1], chars[p2]] = [chars[p2], chars[p1]]
            }
        }
        return chars.join("")
    }
    return swap_positions(md5_upper(text), [1, 13, 5, 17, 7, 23])
}

// 签名函数
function sign_fI(data: Record<string, any>, secret: string): string {
    const pairs: string[] = []
    const sortedKeys = Object.keys(data).sort()
    for (const k of sortedKeys) {
        const v = data[k]
        if (v !== null && v !== undefined && v !== "") {
            pairs.push(`${k}=${v}`)
        }
    }
    const qs = pairs.join("&")
    return signature_hash(`${qs}&${secret}`)
}

// XOR编码函数
function xor_encode(text: string, key: string): string {
    const encoder = new TextEncoder()
    const tb = encoder.encode(text)
    const kb = encoder.encode(key)
    const out: string[] = []
    for (let i = 0; i < tb.length; i++) {
        const b = tb[i]
        const e = (b & 255) + (kb[i % kb.length] & 255)
        out.push(`@${e}`)
    }
    return out.join("")
}

// 构建签名
function build_signature(data: Record<string, any>, token?: string): Record<string, any> {
    const ts = Date.now()
    const sign_data = { ...data, timestamp: ts, token }
    const sec = rand_str(16)
    const sig = sign_fI(sign_data, sec)
    const enc = xor_encode(sig, sec)
    return { s: enc, t: ts, k: sec }
}
//#endregion
