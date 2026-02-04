import type {
    DNABlockBean,
    DNACanEditNickNameBean,
    DNACommonConfigEntity,
    DNAConfigSwitchBean,
    DNAEmojiConfigBean,
    DNAFollowGameIdBean,
    DNAGameConfigResponse,
    DNAGameNewHeadBean,
    DNAHaveOfficialRoleBean,
    DNAIsRedPointBean,
    DNAModeratorPermission,
    DNARecommendConfig,
    DNAScreenResponse,
    DNASplashResponse,
    DNATokenBean,
    DNAUserDataBean,
    DNAUserHeadResponse,
    DNAWikiVoEntity,
} from "../type-generated"
import { DNASubModule } from "./base"
import { FB_APP_ID, FB_CLIENT_TOKEN, generateEmailVerifyParams, hashPassword, TWITTER_KEY, TWITTER_SECRET } from "./oauth"
import { DNA_GAME_ID } from "./types"
import { rand_str2 } from "./utils"

export enum LoginType {
    EMAIL = 0x1,
    FACEBOOK = 0x1,
    FACEBOOK_TYPE = 0xb,
    GOOGLE = 0x2,
    X = 0x5,
}

export enum EmailWithPwd {
    CODE = "0",
    PWD = "1",
    EMAIL_TOKEN = "2",
}

export class UserAPI extends DNASubModule {
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

    async sendEmailVerifyCode(email: string) {
        const url = `https://hgsdkeu.herogame.com/hgsrv/v1/email/sendVerifyCode`
        const data = generateEmailVerifyParams({
            emailType: "updateCode",
            email,
            accessToken: "",
        })
        const res = await (this.fetchFn || fetch)(`${url}?${data}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        })

        return (await res.json()) as { code: number; msg: string }
    }
    async loginEmail(email: string, pwd: string, cUid: string, accessToken: string) {
        const data = {
            devCode: this.dev_code,
            loginType: LoginType.EMAIL,
            email,
            pwd: `${hashPassword(pwd)}\n`,
            cUid, //  from suid
            gameList: DNA_GAME_ID,
            accessToken,
        }
        const res = await this._dna_request<DNAUserDataBean>("user/login", data, { sign: true })
        if (res.is_success && res.data) {
            const data = res.data
            if (typeof data.token === "string") {
                this.token = data.token
            }
        }
        return res
    }

    /**
     * 邮箱验证码登录，返回 accessToken
     * @param email 邮箱地址
     * @param code 验证码
     * @returns accessToken
     */
    async emailVerify(email: string, code: string) {
        const url = `https://hgsdkeu.herogame.com/hgsrv/v2/email/login`
        // 使用 generateEmailVerifyParams 生成带签名的参数
        const queryString = generateEmailVerifyParams({
            email,
            code,
            emailWithPwd: "0",
            accessToken: "",
        })
        const response = await (this.fetchFn || fetch)(`${url}?${queryString}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "",
        })
        const result = (await response.json()) as {
            code: number
            bizCode: number
            msg: string
            accessToken: string
            uid: string
            suid: string
            status: number
            userType: number
            firstReg: boolean
            pwdStatus: number
            cuid: string
            logout: {
                subNo: string
                status: number
            }
            mailBind: number
            pwOrNameError: number
            emailToken: string
            agr: any[]
            pushAgr: {
                text: string
                agrUrls: string[]
                require: number
                type: string
                enable: number
            }[]
            regionCode: string
            usdkGid: number
            nickName: string
            subState: number
            emailPdLoginRisk: number
            emailPdRiskPass: boolean
        }

        return result
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

    /**
     * Facebook OAuth 登录
     * @param accessToken Facebook 访问令牌
     * @returns 登录结果
     */
    async facebookLogin(accessToken: string) {
        const data = {
            accessToken,
            devCode: this.dev_code,
            gameList: DNA_GAME_ID,
            loginType: LoginType.FACEBOOK,
        }
        const res = await this._dna_request<DNAUserDataBean>("user/sdkLogin", data, { sign: true })
        if (res.is_success && res.data) {
            const data = res.data
            if (typeof data.token === "string") {
                this.token = data.token
            }
        }
        return res
    }

    /**
     * Twitter OAuth 登录
     * @param accessToken Twitter 访问令牌
     * @param accessTokenSecret Twitter 访问令牌密钥
     * @returns 登录结果
     */
    async twitterLogin(accessToken: string, accessTokenSecret: string) {
        const data = {
            accessToken,
            accessTokenSecret,
            devCode: this.dev_code,
            gameList: DNA_GAME_ID,
            loginType: LoginType.X,
        }
        const res = await this._dna_request<DNAUserDataBean>("user/sdkLogin", data, { sign: true })
        if (res.is_success && res.data) {
            const data = res.data
            if (typeof data.token === "string") {
                this.token = data.token
            }
        }
        return res
    }

    /**
     * 获取 Facebook OAuth 访问令牌
     * @param code Facebook 授权码
     * @param redirectUri 重定向 URI
     * @returns Facebook 访问令牌
     */
    async getFacebookAccessToken(code: string, redirectUri: string) {
        const url = `https://graph.facebook.com/v19.0/oauth/access_token`
        const params = new URLSearchParams({
            client_id: FB_APP_ID,
            client_secret: FB_CLIENT_TOKEN,
            code,
            redirect_uri: redirectUri,
        })
        const response = await (this.fetchFn || fetch)(`${url}?${params.toString()}`)
        const result = await response.json()
        return result.access_token
    }

    /**
     * 获取 Twitter OAuth 访问令牌
     * @param oauthToken Twitter 请求令牌
     * @param oauthVerifier Twitter 验证码
     * @returns Twitter 访问令牌和密钥
     */
    async getTwitterAccessToken(oauthToken: string, oauthVerifier: string) {
        const url = "https://api.twitter.com/oauth/access_token"
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const nonce = rand_str2(32)

        const params = new URLSearchParams({
            oauth_consumer_key: TWITTER_KEY,
            oauth_nonce: nonce,
            oauth_signature_method: "HMAC-SHA1",
            oauth_timestamp: timestamp,
            oauth_token: oauthToken,
            oauth_verifier: oauthVerifier,
            oauth_version: "1.0",
        })

        const signatureBaseString = `POST&${encodeURIComponent(url)}&${encodeURIComponent(params.toString())}`
        const signingKey = `${encodeURIComponent(TWITTER_SECRET)}&`
        const signature = await this.generateHmacSha1Signature(signingKey, signatureBaseString)

        const authHeader = `OAuth oauth_consumer_key="${TWITTER_KEY}", oauth_nonce="${nonce}", oauth_signature="${encodeURIComponent(signature)}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${timestamp}", oauth_token="${oauthToken}", oauth_verifier="${oauthVerifier}", oauth_version="1.0"`

        const response = await (this.fetchFn || fetch)(url, {
            method: "POST",
            headers: {
                Authorization: authHeader,
            },
        })
        const result = await response.text()
        const urlParams = new URLSearchParams(result)
        return {
            accessToken: urlParams.get("oauth_token") || "",
            accessTokenSecret: urlParams.get("oauth_token_secret") || "",
            userId: urlParams.get("user_id") || "",
            screenName: urlParams.get("screen_name") || "",
        }
    }

    /**
     * 获取 Twitter 请求令牌
     * @param callbackUrl 回调 URL
     * @returns Twitter 请求令牌和密钥
     */
    async getTwitterRequestToken(callbackUrl: string) {
        const url = "https://api.twitter.com/oauth/request_token"
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const nonce = rand_str2(32)

        const params = new URLSearchParams({
            oauth_callback: callbackUrl,
            oauth_consumer_key: TWITTER_KEY,
            oauth_nonce: nonce,
            oauth_signature_method: "HMAC-SHA1",
            oauth_timestamp: timestamp,
            oauth_version: "1.0",
        })

        const signatureBaseString = `POST&${encodeURIComponent(url)}&${encodeURIComponent(params.toString())}`
        const signingKey = `${encodeURIComponent(TWITTER_SECRET)}&`
        const signature = await this.generateHmacSha1Signature(signingKey, signatureBaseString)

        const authHeader = `OAuth oauth_callback="${encodeURIComponent(callbackUrl)}", oauth_consumer_key="${TWITTER_KEY}", oauth_nonce="${nonce}", oauth_signature="${encodeURIComponent(signature)}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${timestamp}", oauth_version="1.0"`

        const response = await (this.fetchFn || fetch)(url, {
            method: "POST",
            headers: {
                Authorization: authHeader,
            },
        })
        const result = await response.text()
        const urlParams = new URLSearchParams(result)
        return {
            oauthToken: urlParams.get("oauth_token") || "",
            oauthTokenSecret: urlParams.get("oauth_token_secret") || "",
            oauthCallbackConfirmed: urlParams.get("oauth_callback_confirmed") === "true",
        }
    }

    /**
     * 生成 HMAC-SHA1 签名
     * @param key 签名密钥
     * @param data 待签名数据
     * @returns Base64 编码的签名
     */
    private async generateHmacSha1Signature(key: string, data: string): Promise<string> {
        const encoder = new TextEncoder()
        const keyData = encoder.encode(key)
        const dataData = encoder.encode(data)

        const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-1" }, false, ["sign"])

        const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataData)
        const signatureArray = Array.from(new Uint8Array(signature))
        const signatureBase64 = btoa(String.fromCharCode(...signatureArray))
        return signatureBase64
    }
}
