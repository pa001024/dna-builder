export { DNABaseAPI, DNASubModule } from "./modules/base"
export { GameAPI } from "./modules/game"
export * from "./modules/h5"
export { HomeAPI } from "./modules/home"
export { ProfileAPI } from "./modules/profile"
export { SettingAPI } from "./modules/setting"
export { TrendAPI } from "./modules/trend"
export * from "./modules/types"
export { UserAPI } from "./modules/user"
export { UserGrowingAPI } from "./modules/usergrowing"
export * from "./modules/utils"
export { RespCode, TimeBasicResponse } from "./TimeBasicResponse"
export * from "./type-generated"

import { DNABaseAPI } from "./modules/base"
import { GameAPI } from "./modules/game"
import { H5API } from "./modules/h5"
import { HomeAPI } from "./modules/home"
import { KFAPI } from "./modules/kf"
import { ProfileAPI } from "./modules/profile"
import { SettingAPI } from "./modules/setting"
import { TrendAPI } from "./modules/trend"
import { DNA_GAME_ID } from "./modules/types"
import { UserAPI } from "./modules/user"
import { UserGrowingAPI } from "./modules/usergrowing"

export * from "./modules/kf"

/**
 * DNA API类，用于与DNA游戏服务器交互
 */
export class DNAAPI extends DNABaseAPI {
    game: GameAPI
    home: HomeAPI
    profile: ProfileAPI
    setting: SettingAPI
    trend: TrendAPI
    user: UserAPI
    kf: KFAPI
    userGrowing: UserGrowingAPI
    h5: H5API

    constructor(
        options: {
            dev_code?: string
            token?: string
            kf_token?: string
            fetchFn?: typeof fetch
            is_h5?: boolean
            rsa_public_key?: string
            mode?: "android" | "ios"
            debug?: boolean
        } = {}
    ) {
        super(options)

        this.game = new GameAPI(this)
        this.home = new HomeAPI(this)
        this.profile = new ProfileAPI(this)
        this.setting = new SettingAPI(this)
        this.trend = new TrendAPI(this)
        this.user = new UserAPI(this)
        this.userGrowing = new UserGrowingAPI(this)
        this.h5 = new H5API(this)
        this.kf = new KFAPI(this)
    }

    /**
     * 手动初始化 API 配置（获取签名配置等）
     */
    async initialize(): Promise<void> {
        await this.initializeSignConfig()
    }

    get GAME_ID() {
        return DNA_GAME_ID
    }
    //#region Game 模块便捷方法
    async getMhSwitchStatus() {
        return await this.game.getMhSwitchStatus()
    }

    async updateMhSwitchStatus(config: string) {
        return await this.game.updateMhSwitchStatus(config)
    }

    async soulTask() {
        return await this.game.soulTask()
    }

    async defaultRoleForTool(type: number = 1, otherUserId?: string) {
        return await this.game.defaultRoleForTool(type, otherUserId)
    }

    async getRoleDetail(char_id: string | number, char_eid: string, otherUserId?: string) {
        return await this.game.getRoleDetail(char_id, char_eid, otherUserId)
    }

    async getWeaponDetail(weapon_id: string | number, weapon_eid: string, otherUserId?: string) {
        return await this.game.getWeaponDetail(weapon_id, weapon_eid, otherUserId)
    }

    async getShortNoteInfo() {
        return await this.game.getShortNoteInfo()
    }
    //#endregion
    //#region Home 模块便捷方法
    /**
     * 获取帖子列表
     * @param forumId 论坛ID，默认48（主论坛）46 全部
     * @param pageIndex 页码，默认1
     * @param pageSize 每页数量，默认20
     * @param searchType 搜索类型，默认1：最新  2:热门
     * @param timeType 时间类型，默认0（全部时间）
     * @returns 帖子列表响应
     */
    async getPostList(forumId: number = 48, pageIndex: number = 1, pageSize: number = 20, searchType: number = 1, timeType: number = 0) {
        return await this.home.getPostList(forumId, pageIndex, pageSize, searchType, timeType)
    }

    async getPostDetail(postId: string | number) {
        return await this.home.getPostDetail(postId)
    }

    async getPostByTopic(
        topicId: number = 177,
        pageIndex: number = 1,
        pageSize: number = 20,
        searchType: number = 1,
        timeType: number = 0
    ) {
        return await this.home.getPostByTopic(topicId, pageIndex, pageSize, searchType, timeType)
    }

    async getTaskProcess() {
        return await this.home.getTaskProcess()
    }

    async haveSignIn() {
        return await this.home.haveSignIn()
    }

    async signCalendar() {
        return await this.home.signCalendar()
    }

    async gameSign(dayAwardId: number, period: number) {
        return await this.home.gameSignIn(dayAwardId, period)
    }

    async bbsSign() {
        return await this.home.bbsSign()
    }

    async getRoleList() {
        return await this.profile.roleManager()
    }

    async adminAdjustScore(postId: number, gameForumId: number, weight: string) {
        return await this.home.adminAdjustScore(postId, gameForumId, weight)
    }

    async adminDelete(post: { postId: number; gameId?: number; gameForumId: number }, content: string, reasonCode: number) {
        return await this.home.adminDelete(post, content, reasonCode)
    }

    async adminMovePost(
        post: { postId: number; gameId?: number; gameForumId: number },
        newGameId: number,
        newForumId: number,
        newTopicIdStr: string
    ) {
        return await this.home.adminMovePost(post, newGameId, newForumId, newTopicIdStr)
    }

    async adminRefreshTime(post: { postId: number; gameId?: number; gameForumId: number }, refresh: number) {
        return await this.home.adminRefreshTime(post, refresh)
    }

    async blockList() {
        return await this.home.blockList()
    }

    async blockOther(blockPostId: number, blockUserId: string, type: number) {
        return await this.home.blockOther(blockPostId, blockUserId, type)
    }

    async collect(postId: number, toUserId: string, operateType = 1) {
        return await this.home.collect(postId, toUserId, operateType)
    }

    async commentDelete(
        comment: { id: number; gameId: number; gameForumId: number },
        entityType: number,
        content: string,
        reasonCode: number
    ) {
        return await this.home.commentDelete(comment, entityType, content, reasonCode)
    }

    async createComment(post: { userId: string; postId: string; gameForumId: number }, content: string) {
        return await this.home.createComment(post, content)
    }

    async createReply(post: { userId: string; postId: string; postCommentId: string; gameForumId: number }, content: string) {
        return await this.home.createReply(post, content)
    }

    async createReplyList(
        post: { userId: string; postId: string; postCommentId: string; postCommentReplyId: string; gameForumId: number },
        content: string
    ) {
        return await this.home.createReplyList(post, content)
    }

    async deletePost(deleteType: number, id: number) {
        return await this.home.deletePost(deleteType, id)
    }

    async followUser(followUserId: string, unfollow?: boolean) {
        return await this.home.followUser(followUserId, unfollow)
    }

    async getFollowState(followUserId: string) {
        return await this.home.getFollowState(followUserId)
    }

    async getDoujin(forumId: number) {
        return await this.home.getDoujin(forumId)
    }

    async getExchange(forumId: number) {
        return await this.home.getExchange(forumId)
    }

    async getGameBanner(gameId = DNA_GAME_ID) {
        return await this.home.getGameBanner(gameId)
    }

    async getPostCommentList(postId: number, pageIndex = 1, pageSize = 20, isOnlyPublisher = 0) {
        return await this.home.getPostCommentList(postId, pageIndex, pageSize, isOnlyPublisher)
    }

    async getRankList(forumId: number) {
        return await this.home.getRankList(forumId)
    }

    async getRecommendPosts(gameId = DNA_GAME_ID, pageIndex = 1, pageSize = 20) {
        return await this.home.getRecommendPosts(gameId, pageIndex, pageSize)
    }

    async getReplyList(postId: number, postCommentId: number, pageIndex = 1, pageSize = 20) {
        return await this.home.getReplyList(postId, postCommentId, pageIndex, pageSize)
    }

    async getStatistics(gameId = DNA_GAME_ID) {
        return await this.home.getStatistics(gameId)
    }

    async getTips() {
        return await this.home.getTips()
    }

    async getWalkthrough(forumId: number) {
        return await this.home.getWalkthrough(forumId)
    }

    async hotList(type = 1, gameId = DNA_GAME_ID) {
        return await this.home.hotList(type, gameId)
    }

    async isRedPoint() {
        return await this.home.isRedPoint()
    }

    async likePost(post: { gameForumId: string; postId: string; postType: string; userId: string }) {
        return await this.home.like(post)
    }

    async lockPost(post: { postId: number; gameId?: number; gameForumId: number }, operateType: number) {
        return await this.home.lockPost(post, operateType)
    }

    async postDownOrUp(post: { postId: number; gameId?: number; gameForumId: number }, operateType: number) {
        return await this.home.postDownOrUp(post, operateType)
    }

    async postElite(post: { postId: number; gameId?: number; gameForumId: number }, operateType: number) {
        return await this.home.postElite(post, operateType)
    }

    async postHide(post: { postId: number; gameId?: number; gameForumId: number }, operateType: number) {
        return await this.home.postHide(post, operateType)
    }

    async reRank(post: { postId: number; gameId?: number; gameForumId: number }, weight: number) {
        return await this.home.reRank(post, weight)
    }

    async receiveLog(periodId: number, pageIndex: number, pageSize: number) {
        return await this.home.receiveLog(periodId, pageIndex, pageSize)
    }

    async recommendList(recIndex: number, newIndex: number, size: number, history: string, gameId = DNA_GAME_ID) {
        return await this.home.recommendList(recIndex, newIndex, size, history, gameId)
    }

    async report(
        { commentId = 0, postId = 0, replyId = 0 }: { commentId?: number; postId?: number; replyId?: number },
        reportReason = 1,
        reportType = 1
    ) {
        return await this.home.report({ commentId, postId, replyId }, reportReason, reportType)
    }

    async searchPost(keyword: string, pageIndex: number, pageSize: number, gameId = DNA_GAME_ID, searchType = 1) {
        return await this.home.searchPost(keyword, pageIndex, pageSize, gameId, searchType)
    }

    async searchTopic(keyword: string, pageIndex: number, pageSize = 20, gameId = DNA_GAME_ID) {
        return await this.home.searchTopic(keyword, pageIndex, pageSize, gameId)
    }

    async searchUser(keyword: string, pageIndex: number, pageSize: number) {
        return await this.home.searchUser(keyword, pageIndex, pageSize)
    }

    async shareTask() {
        return await this.home.shareTask()
    }

    async strongRecommend(post: { postId: number; gameId?: number; gameForumId: number }, operateType = 1) {
        return await this.home.strongRecommend(post, operateType)
    }

    async viewCommunity() {
        return await this.home.viewCommunity()
    }

    async viewCount(postId: number, gameId = DNA_GAME_ID) {
        return await this.home.viewCount(postId, gameId)
    }
    //#endregion
    //#region User 模块便捷方法
    async loginLog() {
        return await this.user.loginLog()
    }

    async login(mobile: string, code: string) {
        return await this.user.login(mobile, code)
    }

    async getSmsCode(mobile: string, vJson: string) {
        return await this.user.sendSms(mobile, vJson, 1)
    }

    async getMine(userId = "", searchType = 1, type = 0) {
        return await this.profile.mine(userId, searchType, type)
    }

    async getOtherMine(userId = "709542994134436647", searchType = 1, type = 2) {
        return await this.profile.mine(userId, searchType, type)
    }

    async canEditNickName() {
        return await this.user.canEditNickName()
    }

    async cleanToken() {
        return await this.user.cleanToken()
    }

    async editGender(gender: number) {
        return await this.user.editGender(gender)
    }

    async editNickName(userName: string) {
        return await this.user.editNickName(userName)
    }

    async getCommonConfig() {
        return await this.user.getCommonConfig()
    }

    async getConfig() {
        return await this.user.getConfig()
    }

    async getConfigSwitch() {
        return await this.user.getConfigSwitch()
    }

    async getModeratorPermission() {
        return await this.user.getModeratorPermission()
    }

    async getOpenScreen() {
        return await this.user.getOpenScreen()
    }

    async getPublicKey() {
        return await this.user.getPublicKey()
    }

    async getUserGame() {
        return await this.user.getUserGame()
    }

    async getWikiData() {
        return await this.user.getWikiData()
    }

    async haveOfficialRole() {
        return await this.user.haveOfficialRole()
    }

    async oneTapLoginRestriction() {
        return await this.user.oneTapLoginRestriction()
    }

    async recommendConfig() {
        return await this.user.recommendConfig()
    }

    async refreshToken(refreshToken: string) {
        return await this.user.refreshToken(refreshToken)
    }

    async register(code: string, devCode: string, gameList: string, mobile: string, password: string) {
        return await this.user.register(code, devCode, gameList, mobile, password)
    }

    async saveUserInfo(gender: number | null, headCode: string, headUrl: string, userName: string) {
        return await this.user.saveUserInfo(gender, headCode, headUrl, userName)
    }

    async signature(newSignature: string) {
        return await this.user.signature(newSignature)
    }

    async updateHeadCode(headCode: string) {
        return await this.user.updateHeadCode(headCode)
    }

    async updateHeadUrl(headUrl: string) {
        return await this.user.updateHeadUrl(headUrl)
    }

    async updateProfileBg(bgUrl: string) {
        return await this.user.updateProfileBg(bgUrl)
    }

    async uploadHead(file: File) {
        return await this.user.uploadHead(file)
    }

    async uploadProfileBg(file: File) {
        return await this.user.uploadProfileBg(file)
    }

    async getEmoji() {
        return await this.user.getEmoji()
    }

    async getGameConfig() {
        return await this.user.getGameConfig()
    }

    async getGameHeadCode() {
        return await this.user.getGameHeadCode()
    }

    //#endregion
    //#region H5 模块便捷方法
    async getMapCategorizeList() {
        return await this.h5.getMapCategorizeList()
    }

    async getMapDetail(id: number) {
        return await this.h5.getMapDetail(id)
    }

    async getMapSiteDetail(id: number) {
        return await this.h5.getMapSiteDetail(id)
    }

    async getEmojiList() {
        return await this.h5.getEmojiList()
    }

    async getMapMatterCategorizeOptions() {
        return await this.h5.getMapMatterCategorizeOptions()
    }
    //#endregion
    //#region Profile 模块便捷方法
    async blackUser(toUserId: string, type: number) {
        return await this.profile.blackUser(toUserId, type)
    }

    async cleanFansNew(type: number, userFollowId: string) {
        return await this.profile.cleanFansNew(type, userFollowId)
    }

    async defaultRole(otherUserId?: string, type = 1) {
        return await this.profile.defaultRole(otherUserId, type)
    }

    async deleteRole(roleBoundId: string) {
        return await this.profile.deleteRole(roleBoundId)
    }

    async draftDelete(draftId: string) {
        return await this.profile.draftDelete(draftId)
    }

    async fans(otherUserId: string, pageNo: number, pageSize: number, type: number) {
        return await this.profile.fans(otherUserId, pageNo, pageSize, type)
    }

    async fastBind() {
        return await this.profile.fastBind()
    }

    async follow(otherUserId: string, pageNo: number, pageSize: number, type: number) {
        return await this.profile.follow(otherUserId, pageNo, pageSize, type)
    }

    async getApplyStatus() {
        return await this.profile.getApplyStatus()
    }

    async getDraftList(pageIndex: number, pageSize: number) {
        return await this.profile.getDraftList(pageIndex, pageSize)
    }

    async getMineComment(otherUserId: string, pageIndex: number, pageSize: number, type: number) {
        return await this.profile.getMineComment(otherUserId, pageIndex, pageSize, type)
    }

    async getMinePost(otherUserId: string, pageIndex: number, pageSize: number, searchType: number, type: number, postType?: number) {
        return await this.profile.getMinePost(otherUserId, pageIndex, pageSize, searchType, type, postType)
    }

    async getProfileNotifySwitch() {
        return await this.profile.getNotifySwitch()
    }

    async historyView(pageIndex: number, pageSize: number) {
        return await this.profile.historyView(pageIndex, pageSize)
    }

    async likeProfilePost(data: {
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
        return await this.profile.like(data)
    }

    async manualBound(roleId: string, type: number, code: string) {
        return await this.profile.manualBound(roleId, type, code)
    }

    async mine(otherUserId: string, searchType: number, type: number, postType?: number) {
        return await this.profile.mine(otherUserId, searchType, type, postType)
    }

    async mineV2(otherUserId: string) {
        return await this.profile.mineV2(otherUserId)
    }

    async moderatorByGame(gameId: number) {
        return await this.profile.moderatorByGame(gameId)
    }

    async muteCancel(toUserId: string) {
        return await this.profile.muteCancel(toUserId)
    }

    async muteUser(toUserId: string, gameIdStr: string, type: number, reason: number, content: string) {
        return await this.profile.muteUser(toUserId, gameIdStr, type, reason, content)
    }

    async resetDefault(roleBoundId: string) {
        return await this.profile.resetDefault(roleBoundId)
    }

    //#endregion
    //#region Setting 模块便捷方法
    async addAddress(receiverName: string, receiverMobile: string, receiverAddress: string) {
        return await this.setting.addAddress(receiverName, receiverMobile, receiverAddress)
    }

    async cancelCode(code: string) {
        return await this.setting.cancelCode(code)
    }

    async cancel(cancelType: number, operateType: number, position: string, cancelReason: number | null, reasonDetail: string) {
        return await this.setting.cancel(cancelType, operateType, position, cancelReason, reasonDetail)
    }

    async deleteAddress(addressId: number) {
        return await this.setting.deleteAddress(addressId)
    }

    async editAddress(addressId: number, receiverName: string, receiverMobile: string, receiverAddress: string) {
        return await this.setting.editAddress(addressId, receiverName, receiverMobile, receiverAddress)
    }

    async feedback(listPic: string, proDesc: string, mobile: string, isLogin: number) {
        return await this.setting.feedback(listPic, proDesc, mobile, isLogin)
    }

    async getCancelStatus() {
        return await this.setting.getCancelStatus()
    }

    async getPrivateSet() {
        return await this.setting.getPrivateSet()
    }

    async getUserAddress(userId: number, type: number) {
        return await this.setting.getUserAddress(userId, type)
    }

    async getUserBlackList(pageIndex: number, pageSize: number) {
        return await this.setting.getUserBlackList(pageIndex, pageSize)
    }

    async msgListDetail(pageNo: number, pageSize: number, type: number) {
        return await this.setting.msgListDetail(pageNo, pageSize, type)
    }

    async postListDetail(pageNo: number, pageSize: number, type: number) {
        return await this.setting.postListDetail(pageNo, pageSize, type)
    }

    async privateSet(operateType: number, option: number) {
        return await this.setting.privateSet(operateType, option)
    }

    async sendSms(mobile: string, timeStamp: string, type: number) {
        return await this.setting.sendSms(mobile, timeStamp, type)
    }

    async setDefaultAddress(addressId: number) {
        return await this.setting.setDefaultAddress(addressId)
    }

    async setNotifySwitch(operateType: number, switchType: number) {
        return await this.setting.setNotifySwitch(operateType, switchType)
    }

    async uploadFeedBack(file: File) {
        return await this.setting.uploadFeedBack(file)
    }

    //#endregion
    //#region Trend 模块便捷方法
    async draftSave(
        content: string,
        draftId: string,
        h5Content: string,
        postTitle: string,
        postType: number,
        gameId: number,
        videoReUpload: number
    ) {
        return await this.trend.draftSave(content, draftId, h5Content, postTitle, postType, gameId, videoReUpload)
    }

    async getConfigTopicByGameId(name: string, showType: number) {
        return await this.trend.getConfigTopicByGameId(name, showType)
    }

    async getPostPublishPage() {
        return await this.trend.getPostPublishPage()
    }

    async getRecommend(history: string, pageSize: number) {
        return await this.trend.getRecommend(history, pageSize)
    }

    async getVodToken(fileName: string, title: string) {
        return await this.trend.getVodToken(fileName, title)
    }

    async trendList(pageIndex: number, pageSize: number, userId: string) {
        return await this.trend.list(pageIndex, pageSize, userId)
    }

    async parseLink(link: string) {
        return await this.trend.parseLink(link)
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
        return await this.trend.posAdminEdit(content, gameForumId, h5Content, postId, postTitle, topics, postType, gameId, videoReUpload)
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
        return await this.trend.postEdit(content, gameForumId, h5Content, postId, postTitle, topics, postType, videoReUpload)
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
        return await this.trend.postPublish(content, draftId, gameForumId, gameId, h5Content, postTitle, postType, topics)
    }

    async safeCheck(url: string) {
        return await this.trend.safeCheck(url)
    }

    async uploadImage(file: File) {
        return await this.trend.uploadImage(file)
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
        return await this.trend.videoPostPublish(content, draftId, gameForumId, gameId, h5Content, postTitle, postType, topics)
    }

    //#endregion
    //#region UserGrowing 模块便捷方法
    async apply(
        type: number,
        id: number | null,
        concatWay: string,
        otherPlatform: string,
        otherPlatformUrl: string,
        otherPlatformFans: string,
        materialUrl: string,
        gameId: number | null
    ) {
        return await this.userGrowing.apply(type, id, concatWay, otherPlatform, otherPlatformUrl, otherPlatformFans, materialUrl, gameId)
    }

    async awardList(drawId: number) {
        return await this.userGrowing.awardList(drawId)
    }

    async awardWin(drawId: number, fullName: string, mobile: string, address: string) {
        return await this.userGrowing.awardWin(drawId, fullName, mobile, address)
    }

    async buyGold(drawId: number, count: number) {
        return await this.userGrowing.buyGold(drawId, count)
    }

    async buyProduct(address: string, fullName: string, mobile: string, productId: number) {
        return await this.userGrowing.buyProduct(address, fullName, mobile, productId)
    }

    async drawDetail(drawId: number) {
        return await this.userGrowing.drawDetail(drawId)
    }

    async getAliProductConfig() {
        return await this.userGrowing.getAliProductConfig()
    }

    async getAliProductList(gameId: number | null, pageIndex: number, pageSize: number) {
        return await this.userGrowing.getAliProductList(gameId, pageIndex, pageSize)
    }

    async getApplyPage() {
        return await this.userGrowing.getApplyPage()
    }

    async getExpLogsList(gameId: number, pageIndex: number, pageSize: number) {
        return await this.userGrowing.getExpLogsList(gameId, pageIndex, pageSize)
    }

    async getGameCreator() {
        return await this.userGrowing.getGameCreator()
    }

    async getGoldDetailList(pageIndex: number, pageSize: number, type: number, storeType: number) {
        return await this.userGrowing.getGoldDetailList(pageIndex, pageSize, type, storeType)
    }

    async getProductList(gameId: number | null, pageIndex: number, pageSize: number, storeType: number) {
        return await this.userGrowing.getProductList(gameId, pageIndex, pageSize, storeType)
    }

    async getTotalGold(type?: number) {
        return await this.userGrowing.getTotalGold(type)
    }

    async getUserGameLevel(gameId: number | null, ifProcess: number, otherUserId: number | null) {
        return await this.userGrowing.getUserGameLevel(gameId, ifProcess, otherUserId)
    }

    async getUserGameTaskProcess(gameId: number, userId: number) {
        return await this.userGrowing.getUserGameTaskProcess(gameId, userId)
    }

    async list(pageIndex: number, pageSize: number, queryType: number | null, gameId: number | null) {
        return await this.userGrowing.list(pageIndex, pageSize, queryType, gameId)
    }

    async page() {
        return await this.userGrowing.page()
    }

    async productDetail(productId: number) {
        return await this.userGrowing.productDetail(productId)
    }

    //#endregion
}
