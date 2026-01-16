import type {
    DNACommonBooleanBean,
    DNAParseLinkBean,
    DNAPostPublishPageBean,
    DNAPublishPostResponse,
    DNARecomdBean,
    DNATipsBean,
    DNATopicListBean,
    DNATrendPostBean,
    DNAVodTokenBean,
} from "../type-generated"
import { DNASubModule } from "./base"

export class TrendAPI extends DNASubModule {
    async draftSave(
        content: string,
        draftId: string,
        h5Content: string,
        postTitle: string,
        postType: number,
        gameId: number,
        videoReUpload: number
    ) {
        return await this._dna_request("forum/draftSave", { content, draftId, h5Content, postTitle, postType, gameId, videoReUpload })
    }

    async followUser(followUserId: string, operateType: number) {
        return await this._dna_request("user/followUser", { followUserId, operateType })
    }

    async getConfigTopicByGameId(name: string, showType: number) {
        return await this._dna_request<DNATopicListBean[]>("config/getConfigTopicByGameId", { name, showType })
    }

    async getPostPublishPage() {
        return await this._dna_request<DNAPostPublishPageBean>("forum/getPostPublishPage")
    }

    async getRecommend(history: string, pageSize: number) {
        return await this._dna_request<DNARecomdBean>("user/getRecommend", { history, pageSize })
    }

    async getTips() {
        return await this._dna_request<DNATipsBean>("config/getTips")
    }

    async getVodToken(fileName: string, title: string) {
        return await this._dna_request<DNAVodTokenBean>("forum/getVodToken", { fileName, title })
    }

    async like(
        forumId: number,
        gameId: number,
        likeType: number,
        operateType: number,
        postCommentId: number,
        postCommentReplyId: number,
        postId: number,
        postType: number,
        toUserId: string
    ) {
        return await this._dna_request("forum/like", {
            forumId,
            gameId,
            likeType,
            operateType,
            postCommentId,
            postCommentReplyId,
            postId,
            postType,
            toUserId,
        })
    }

    async list(pageIndex: number, pageSize: number, userId: string) {
        return await this._dna_request<DNATrendPostBean>("forum/dynamic/list", { pageIndex, pageSize, userId })
    }

    async parseLink(link: string) {
        return await this._dna_request<DNAParseLinkBean>("forum/parseLink", { link })
    }

    async posAdminEdit(
        content: string,
        gameForumId: number,
        h5Content: string,
        postId: string,
        postTitle: string,
        topics: string,
        postType: number,
        gameId: number,
        videoReUpload: number
    ) {
        return await this._dna_request<DNAPublishPostResponse>("forum/moderator/postEdit", {
            content,
            gameForumId,
            h5Content,
            postId,
            postTitle,
            topics,
            postType,
            gameId,
            videoReUpload,
        })
    }

    async postEdit(
        content: string,
        gameForumId: number,
        h5Content: string,
        postId: string,
        postTitle: string,
        topics: string,
        postType: number,
        videoReUpload: number
    ) {
        return await this._dna_request<DNAPublishPostResponse>("forum/postEdit", {
            content,
            gameForumId,
            h5Content,
            postId,
            postTitle,
            topics,
            postType,
            videoReUpload,
        })
    }

    async postPublish(
        content: string,
        draftId: string,
        gameForumId: number,
        gameId: number,
        h5Content: string,
        postTitle: string,
        postType: number,
        topics: string
    ) {
        return await this._dna_request<DNAPublishPostResponse>("forum/postPublish", {
            content,
            draftId,
            gameForumId,
            gameId,
            h5Content,
            postTitle,
            postType,
            topics,
        })
    }

    async safeCheck(url: string) {
        return await this._dna_request<DNACommonBooleanBean>("forum/more/safeCheck", { url })
    }

    /**
     * 图片上传
     */
    async uploadImage(file: File) {
        const data = new FormData()
        data.append("files", file)
        data.append("type", "post")
        return await this.fileUpload("config/img/upload", data)
    }

    async videoPostPublish(
        content: string,
        draftId: string,
        gameForumId: number,
        gameId: number,
        h5Content: string,
        postTitle: string,
        postType: number,
        topics: string
    ) {
        return await this._dna_request<DNAPublishPostResponse>("forum/moderator/postPublish", {
            content,
            draftId,
            gameForumId,
            gameId,
            h5Content,
            postTitle,
            postType,
            topics,
        })
    }

    async viewCount(gameId: number, postId: number) {
        return await this._dna_request("forum/viewCount", { gameId, postId })
    }
}
