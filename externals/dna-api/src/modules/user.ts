import { DNASubModule, DNABaseAPI } from "./base"
import {
    DNABlockBean,
    DNACanEditNickNameBean,
    DNACommonConfigEntity,
    DNAConfigSwitchBean,
    DNAFollowGameIdBean,
    DNAHaveOfficialRoleBean,
    DNAIsRedPointBean,
    DNARecommendConfig,
    DNAScreenResponse,
    DNASplashResponse,
    DNATokenBean,
    DNAUserHeadResponse,
    DNAWikiVoEntity,
    DNAModeratorPermission,
    DNAUserDataBean,
    DNAGameConfigResponse,
    DNAGameNewHeadBean,
    DNAEmojiConfigBean,
} from "../type-generated"
import { aesDecryptImageUrl } from "./utils"
import { DNA_GAME_ID } from "./types"

export class UserAPI extends DNASubModule {
    constructor(base: DNABaseAPI) {
        super(base)
    }
    // 检查登录
    async loginLog() {
        return await this._dna_request("user/login/log")
    }

    async blockList() {
        return await this._dna_request<DNABlockBean>("user/block/list")
    }

    async canEditNickName() {
        return await this._dna_request<DNACanEditNickNameBean>("user/canUpdateNameTimes")
    }

    async cancel(cancelType: number, operateType: number, position: string, cancelReason: number | null, reasonDetail: string) {
        return await this._dna_request("user/more/cancel", { cancelType, operateType, position, cancelReason, reasonDetail })
    }

    async cleanToken() {
        return await this._dna_request("user/cleanToken")
    }

    async editGender(gender: number) {
        return await this._dna_request("user/editGender", { gender })
    }

    async editNickName(userName: string) {
        return await this._dna_request<DNACanEditNickNameBean>("user/updateName", { userName })
    }

    async getCommonConfig() {
        return await this._dna_request<DNACommonConfigEntity>("config/getCommonConfig")
    }

    async getConfig() {
        return await this._dna_request<DNASplashResponse>("config/getConfig")
    }

    async getConfigSwitch() {
        return await this._dna_request<DNAConfigSwitchBean>("config/switchAll")
    }

    async getModeratorPermission() {
        return await this._dna_request<DNAModeratorPermission>("user/moderator/getModeratorPermission")
    }

    async getOpenScreen() {
        return await this._dna_request<DNAScreenResponse>("config/getOpenScreen")
    }

    async getPublicKey() {
        return await this._dna_request<{ key: string }>("config/getRsaPublicKey")
    }

    async getUserGame() {
        return await this._dna_request<DNAFollowGameIdBean>("user/getUserGame")
    }

    async getWikiData() {
        return await this._dna_request<DNAWikiVoEntity>("config/getGameWiki")
    }

    async haveOfficialRole() {
        return await this._dna_request<DNAHaveOfficialRoleBean>("role/haveOfficialRole")
    }

    async isRedPoint() {
        return await this._dna_request<DNAIsRedPointBean>("forum/dynamic/isRedPoint")
    }

    async login(mobile: string, code: string) {
        const data = { code: code, devCode: this.dev_code, gameList: DNA_GAME_ID, loginType: 1, mobile: mobile }
        const res = await this._dna_request<DNAUserDataBean>("user/sdkLogin", data, { sign: true })
        if (res.is_success && res.data) {
            const data = res.data
            if (typeof data.token === "string") {
                this.token = data.token
            }
        }
        return res
    }

    async oneTapLoginRestriction() {
        return await this._dna_request("user/oneTapLoginRestriction")
    }

    async recommendConfig() {
        return await this._dna_request<DNARecommendConfig>("forum/recommend/config")
    }

    async refreshToken(refreshToken: string) {
        return await this._dna_request<DNATokenBean>("user/refreshToken", { refreshToken })
    }

    async register(code: string, devCode: string, gameList: string, mobile: string, password: string) {
        return await this._dna_request<DNAUserDataBean>("user/register", { code, devCode, gameList, mobile, password })
    }

    async saveUserInfo(gender: number | null, headCode: string, headUrl: string, userName: string) {
        return await this._dna_request<DNAUserHeadResponse>("user/saveUserInfo", { gender, headCode, headUrl, userName })
    }

    async sendSms(mobile: string, vJson: string, isCaptcha: number | null) {
        return await this._dna_request("user/getSmsCode", { mobile, isCaptcha, vJson })
    }

    async signature(newSignature: string) {
        return await this._dna_request("user/edit/signature", { newSignature })
    }

    async updateHeadCode(headCode: string) {
        return await this._dna_request<DNAUserHeadResponse>("user/updateHeadCode", { headCode })
    }

    async updateHeadUrl(headUrl: string) {
        return await this._dna_request("user/updateHeadUrl", { headUrl })
    }

    async updateProfileBg(bgUrl: string) {
        return await this._dna_request("user/updateBg", { bgUrl })
    }

    async uploadHead(file: File) {
        const data = new FormData()
        data.append("parts", file)
        return await this.fileUpload("user/img/uploadHead", data)
    }

    async uploadProfileBg(file: File) {
        const data = new FormData()
        data.append("parts", file)
        return await this.fileUpload("user/img/uploadMineBg", data)
    }

    async getEmoji() {
        return await this._dna_request<DNAEmojiConfigBean[]>("config/getEmoji")
    }

    async getGameConfig() {
        return await this._dna_request<DNAGameConfigResponse[]>("config/getGameConfig")
    }

    async getGameHeadCode() {
        return await this._dna_request<DNAGameNewHeadBean[]>("user/getGameHeadCode")
    }
}
