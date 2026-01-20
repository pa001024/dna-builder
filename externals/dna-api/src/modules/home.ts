import type {
    DNABlockBean,
    DNACommentListResponse,
    DNACreateCommentResponse,
    DNADiscussAreaResponse,
    DNAFollowBean,
    DNAFraternityResponse,
    DNAGameBannerBean,
    DNAGameSignInResultBean,
    DNAGameSignInShowDataBean,
    DNAHomeOffWaterResponse,
    DNAIsRedPointBean,
    DNAPostDetailResponse,
    DNAPostListBean,
    DNAReceiveRecord,
    DNARecommendBean,
    DNAReplayCommentResponse,
    DNAReplyListResponse,
    DNASearchPostBean,
    DNASearchTopicBean,
    DNASearchUserBean,
    DNASignCenterBean,
    DNASignInBean,
    DNASoulTaskBean,
    DNAStatisticsBean,
    DNATipsBean,
    DNATopicListResponse,
    DNAUserTaskProcessEntity,
} from "../type-generated"
import { DNASubModule } from "./base"

const DNA_GAME_ID = 268

export class HomeAPI extends DNASubModule {
    async adminAdjustScore(postId: number, gameForumId: number, weight: string, gameId: number = DNA_GAME_ID) {
        const data = { postId, gameId: gameId ?? DNA_GAME_ID, gameForumId, weight }
        return await this._dna_request("forum/moderator/setPostWeight", data)
    }

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

    async adminMovePost(
        post: { postId: number; gameId?: number; gameForumId: number },
        newGameId: number,
        newForumId: number,
        newTopicIdStr: string
    ) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            newGameId,
            newForumId,
            newTopicIdStr,
        }
        return await this._dna_request("forum/moderator/postMove", data)
    }

    async adminRefreshTime(post: { postId: number; gameId?: number; gameForumId: number }, refresh: number) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            refresh,
        }
        return await this._dna_request("forum/moderator/setRefresh", data)
    }

    async blockList() {
        return await this._dna_request<DNABlockBean>("user/block/list")
    }

    async blockOther(blockPostId: number, blockUserId: string, type: number) {
        return await this._dna_request("user/block/other", { blockPostId, blockUserId, type })
    }

    async collect(postId: number, toUserId: string, operateType = 1) {
        const data = { operateType, postId, toUserId }
        return await this._dna_request("forum/collect", data)
    }

    async commentDelete(
        comment: { id: number; gameId: number; gameForumId: number },
        entityType: number,
        content: string,
        reasonCode: number
    ) {
        const data = { id: comment.id, gameId: comment.gameId, gameForumId: comment.gameForumId, entityType, content, reasonCode }
        return await this._dna_request("forum/commentReplyDelete", data)
    }

    async createComment(post: { userId: string; postId: string; gameForumId: number }, content: string) {
        const content_json = JSON.stringify([
            {
                content,
                contentType: "1",
            },
        ])
        const data = { postId: post.postId, forumId: post.gameForumId, postType: "1", content: content_json }
        return await this._dna_request<DNACreateCommentResponse>("forum/comment/createComment", data, {
            sign: true,
            params: { toUserId: post.userId },
        })
    }

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
        return await this._dna_request<DNAReplayCommentResponse>("forum/comment/createReply", data, {
            sign: true,
            params: { toUserId: post.userId },
        })
    }

    async createReplyList(
        post: { userId: string; postId: string; postCommentId: string; postCommentReplyId: string; gameForumId: number },
        content: string
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
        return await this._dna_request<DNAReplayCommentResponse>("forum/comment/createReply", data, {
            sign: true,
            params: { toUserId: post.userId },
        })
    }

    async deletePost(deleteType: number, id: number) {
        return await this._dna_request("forum/more/delete", { deleteType, id }, { sign: true, refer: true })
    }

    async followUser(followUserId: string, unfollow?: boolean) {
        const data = { followUserId, operateType: unfollow ? 0 : 1 }
        return await this._dna_request("user/followUser", data, { sign: true })
    }

    async getFollowState(followUserId: string) {
        const data = { followUserId }
        return await this._dna_request<DNAFollowBean>("user/isFollow", data)
    }

    async gameSignIn(dayAwardId: number, period: number) {
        const data = { dayAwardId, periodId: period, signinType: 1 }
        return await this._dna_request<DNAGameSignInResultBean>("encourage/signin/signin", data, { sign: true })
    }

    async getDoujin(forumId: number) {
        return await this._dna_request<DNADiscussAreaResponse>("forum/discuss/getDoujin", { forumId })
    }

    async getExchange(forumId: number) {
        return await this._dna_request<DNADiscussAreaResponse>("forum/discuss/getExchange", { forumId })
    }

    async getGameBanner(gameId = DNA_GAME_ID) {
        return await this._dna_request<DNAGameBannerBean>("forum/gameBanner", { gameId })
    }

    async getPostByTopic(
        topicId: number = 177,
        pageIndex: number = 1,
        pageSize: number = 20,
        searchType: number = 1,
        timeType: number = 0
    ) {
        const data = {
            topicId,
            gameId: DNA_GAME_ID,
            pageIndex,
            pageSize,
            searchType,
            timeType,
        }
        return await this._dna_request<DNATopicListResponse>("forum/getPostByTopic", data)
    }

    async getPostCommentList(postId: number, pageIndex: number = 1, pageSize: number = 20, isOnlyPublisher: number = 0) {
        return await this._dna_request<DNACommentListResponse>("forum/comment/getPostCommentList", {
            postId,
            pageIndex,
            pageSize,
            isOnlyPublisher,
        })
    }

    async getPostDetail(postId: string | number) {
        return await this._dna_request<DNAPostDetailResponse>("forum/getPostDetail", { postId })
    }

    async getPostList(forumId: number = 48, pageIndex: number = 1, pageSize: number = 20, searchType: number = 1, timeType: number = 0) {
        const data = {
            forumId: forumId,
            gameId: DNA_GAME_ID,
            pageIndex: pageIndex,
            pageSize: pageSize,
            searchType: searchType,
            timeType: timeType,
        }
        return await this._dna_request<DNADiscussAreaResponse>("forum/list", data)
    }

    async getRankList(forumId: number) {
        return await this._dna_request<DNAFraternityResponse>("forum/discuss/getRank", { forumId })
    }

    async getRecommendPosts(gameId = DNA_GAME_ID, pageIndex: number = 1, pageSize: number = 20) {
        return await this._dna_request<DNAHomeOffWaterResponse>("forum/getRecommendPosts", { gameId, pageIndex, pageSize })
    }

    async getReplyList(postId: number, postCommentId: number, pageIndex: number = 1, pageSize: number = 20) {
        return await this._dna_request<DNAReplyListResponse>("forum/comment/getReplyList", { postId, postCommentId, pageIndex, pageSize })
    }

    async getStatistics(gameId = DNA_GAME_ID) {
        return await this._dna_request<DNAStatisticsBean>("forum/statistics", { gameId })
    }

    async getTips() {
        return await this._dna_request<DNATipsBean>("config/getTips")
    }

    async getWalkthrough(forumId: number) {
        return await this._dna_request<DNADiscussAreaResponse>("forum/discuss/getWalkthrough", { forumId })
    }

    async hotList(type: number = 1, gameId = DNA_GAME_ID) {
        return await this._dna_request<DNAPostListBean[]>("forum/hot/ranking/list", { gameId, type })
    }

    async haveSignIn() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNASignInBean>("user/haveSignInNew", data)
    }

    async isHaveSignin() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNASignCenterBean>("encourage/signin/isHaveSignin", data)
    }

    async isRedPoint() {
        return await this._dna_request<DNAIsRedPointBean>("forum/dynamic/isRedPoint")
    }

    async signCalendar() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNAGameSignInShowDataBean>("encourage/signin/show", data)
    }

    async like(post: { gameForumId: string; postId: string; postType: string; userId: string }) {
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

    async lockPost(post: { postId: number; gameId?: number; gameForumId: number }, operateType: number) {
        const data = { postId: post.postId, gameId: post.gameId ?? DNA_GAME_ID, gameForumId: post.gameForumId, operateType }
        return await this._dna_request("forum/moderator/postLock", data)
    }

    async postDownOrUp(post: { postId: number; gameId?: number; gameForumId: number }, operateType: number) {
        const data = { postId: post.postId, gameId: post.gameId ?? DNA_GAME_ID, gameForumId: post.gameForumId, operateType }
        return await this._dna_request("forum/moderator/postDownOrUp", data)
    }

    async postElite(post: { postId: number; gameId?: number; gameForumId: number }, operateType: number) {
        const data = { postId: post.postId, gameId: post.gameId ?? DNA_GAME_ID, gameForumId: post.gameForumId, operateType }
        return await this._dna_request("forum/moderator/postElite", data)
    }

    async postHide(post: { postId: number; gameId?: number; gameForumId: number }, operateType: number) {
        const data = { postId: post.postId, gameId: post.gameId ?? DNA_GAME_ID, gameForumId: post.gameForumId, operateType }
        return await this._dna_request("forum/moderator/postHide", data)
    }

    async reRank(post: { postId: number; gameId?: number; gameForumId: number }, weight: number) {
        const data = { postId: post.postId, gameId: post.gameId ?? DNA_GAME_ID, gameForumId: post.gameForumId, weight }
        return await this._dna_request("forum/moderator/reRank", data)
    }

    async receiveLog(periodId: number, pageIndex: number, pageSize: number) {
        const data = { periodId, pageIndex, pageSize }
        return await this._dna_request<DNAReceiveRecord>("encourage/signin/receiveLog", data)
    }

    async recommendList(recIndex: number, newIndex: number, size: number, history: string, gameId = DNA_GAME_ID) {
        const data = { gameId, recIndex, newIndex, size, history }
        return await this._dna_request<DNARecommendBean>("forum/recommend/list", data)
    }

    async report(
        { commentId = 0, postId = 0, replyId = 0 }: { commentId?: number; postId?: number; replyId?: number },
        reportReason = 1,
        reportType = 1
    ) {
        const data = { commentId, postId, replyId, reportReason, reportType }
        return await this._dna_request("forum/more/report", data)
    }

    async searchPost(keyword: string, pageIndex: number, pageSize: number, gameId = DNA_GAME_ID, searchType = 1) {
        const data = { gameId, keyword, pageIndex, pageSize, searchType }
        return await this._dna_request<DNASearchPostBean>("forum/searchPost", data)
    }

    async searchTopic(keyword: string, pageIndex: number, pageSize = 20, gameId = DNA_GAME_ID) {
        const data = { gameId, keyword, pageIndex, pageSize }
        return await this._dna_request<DNASearchTopicBean>("forum/searchPost", data)
    }

    async searchUser(keyword: string, pageIndex: number, pageSize: number) {
        const data = { keyword, pageIndex, pageSize }
        return await this._dna_request<DNASearchUserBean>("forum/searchPost", data)
    }

    async shareTask() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request("encourage/level/shareTask", data)
    }

    async bbsSign() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNASignInBean>("user/signIn", data)
    }

    async strongRecommend(post: { postId: number; gameId?: number; gameForumId: number }, operateType = 1) {
        const data = {
            postId: post.postId,
            gameId: post.gameId ?? DNA_GAME_ID,
            gameForumId: post.gameForumId,
            operateType: operateType,
        }
        return await this._dna_request("forum/moderator/setForceRecommend", data)
    }

    async viewCommunity() {
        return await this._dna_request("encourage/level/viewCommunity")
    }

    async viewCount(postId: number, gameId = DNA_GAME_ID) {
        return await this._dna_request("forum/viewCount", { gameId, postId })
    }

    async getTaskProcess() {
        const data = { gameId: DNA_GAME_ID }
        return await this._dna_request<DNAUserTaskProcessEntity>("encourage/level/getTaskProcess", data)
    }

    async soulTask() {
        return await this._dna_request<DNASoulTaskBean>("role/soul/task")
    }
}
