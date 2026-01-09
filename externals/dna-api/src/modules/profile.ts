import { DNASubModule, DNABaseAPI } from "./base"
import {
    DNARoleEntityForTrend,
    DNARoleListBean,
    DNAMineFansBean,
    DNAMineFollowBean,
    DNADraftBean,
    DNAFastBindResultBean,
    DNABindStatus,
    DNAProfileResponse,
    DNAProfileLoadResponse,
    DNANotifySwitchEntity,
    DNAHistoryBean,
    DNAAcewarBean,
    DNAModeratorByGame,
} from "../type-generated"

export class ProfileAPI extends DNASubModule {
    constructor(base: DNABaseAPI) {
        super(base)
    }
    async blackUser(toUserId: string, type: number) {
        return await this._dna_request("user/blackUser", { toUserId, type })
    }

    async cleanFansNew(type: number, userFollowId: string) {
        return await this._dna_request("user/cleanFansNew", { type, userFollowId })
    }

    async collect(postId: number, toUserId: string, operateType = 1) {
        return await this._dna_request("forum/collect", { operateType, postId, toUserId })
    }

    async defaultRole(otherUserId?: string, type: number = 1) {
        return await this._dna_request<DNARoleEntityForTrend>("user/defaultRole", { otherUserId, type })
    }

    async deleteRole(roleBoundId: string) {
        return await this._dna_request<DNARoleListBean>("role/remove", { roleBoundId })
    }

    async draftDelete(draftId: string) {
        return await this._dna_request("forum/more/draftDelete", { draftId })
    }

    async fans(otherUserId: string, pageNo: number, pageSize: number, type: number) {
        return await this._dna_request<DNAMineFansBean>("user/fans", { otherUserId, pageNo, pageSize, type })
    }

    async fastBind() {
        return await this._dna_request<DNAFastBindResultBean>("role/quickBound")
    }

    async follow(otherUserId: string, pageNo: number, pageSize: number, type: number) {
        return await this._dna_request<DNAMineFollowBean>("user/follow", { otherUserId, pageNo, pageSize, type })
    }

    async followUser(followUserId: string, unfollow?: boolean) {
        return await this._dna_request("user/followUser", { followUserId, operateType: unfollow ? 0 : 1 })
    }

    async getApplyStatus() {
        return await this._dna_request<DNABindStatus>("user/creator/getApplyStatus")
    }

    async getDraftList(pageIndex: number, pageSize: number) {
        return await this._dna_request<DNADraftBean>("forum/getDraftList", { pageIndex, pageSize })
    }

    async getMineComment(otherUserId: string, pageIndex: number, pageSize: number, type: number) {
        return await this._dna_request<DNAProfileResponse>("user/notice/mine", { otherUserId, pageIndex, pageSize, type })
    }

    async getMinePost(otherUserId: string, pageIndex: number, pageSize: number, searchType: number, type: number, postType?: number) {
        return await this._dna_request<DNAProfileLoadResponse>("forum/getMinePost", {
            otherUserId,
            pageIndex,
            pageSize,
            searchType,
            type,
            postType,
        })
    }

    async getNotifySwitch() {
        return await this._dna_request<DNANotifySwitchEntity>("user/push/getSwitchStatus")
    }

    async historyView(pageIndex: number, pageSize: number) {
        return await this._dna_request<DNAHistoryBean>("forum/historyView", { pageIndex, pageSize })
    }

    async like(data: {
        forumId: number
        gameId: number
        likeType: number
        operateType: number
        postCommentId: number
        postCommentReplyId: number
        postId: number
        postType: number
        toUserId: string
    }) {
        return await this._dna_request("forum/like", data)
    }

    async manualBound(roleId: string, type: number, code: string) {
        return await this._dna_request<DNAAcewarBean>("role/manualBound", { roleId, type, code })
    }

    async mine(otherUserId: string, searchType: number, type: number, postType?: number) {
        const data: Record<string, any> = { otherUserId, searchType, type, postType }
        if (!otherUserId) {
            delete data.otherUserId
        }
        return await this._dna_request<DNAProfileResponse>("user/mine", data)
    }

    async mineV2(otherUserId: string) {
        return await this._dna_request<DNAProfileResponse>("user/mineV2", { otherUserId })
    }

    async moderatorByGame(gameId: number) {
        return await this._dna_request<DNAModeratorByGame>("user/moderator/getModeratorByGame", { gameId })
    }

    async muteCancel(toUserId: string) {
        return await this._dna_request("forum/moderator/muteCancel", { toUserId })
    }

    async muteUser(toUserId: string, gameIdStr: string, type: number, reason: number, content: string) {
        return await this._dna_request("forum/moderator/muteUser", { toUserId, gameIdStr, type, reason, content })
    }

    async resetDefault(roleBoundId: string) {
        return await this._dna_request<DNARoleListBean>("role/resetDefault", { roleBoundId })
    }

    async roleManager() {
        return await this._dna_request<DNARoleListBean>("role/list")
    }
}
