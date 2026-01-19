import { DNASubModule } from "./base"
import { DNA_GAME_ID } from "./types"

// 类型定义

export interface ServerType {
    id: number
    game_id: number
    name: string
    add_time: number
    add_admin: number
    is_del: number
    del_time: number
    del_admin: number
    is_allow: number
}
export interface ServerInfo {
    id: number // 29046
    gameId: number // 2277
    qId: number
    name: string
    addTime: number
    addAdmin: number
    isDel: number
    delTime: number
    delAdmin: number
    isAllow: number
    sync: number
    tbsttype3: number
    serverId: string // 10001
    banServiceId: number
    upAdmin: number
    upTime: number
    platform: number
    isTest: number
    lang: string
    CreatedUserName: string
    ServerName: string
    GameName: string
}

export interface RoleInfo {
    id: string
    role_id: string
    role_name: string
    totalpay: number
    q_id: number
    channel: string
    vip: string
    level: string
    f_id: number
    im_user_id: string
    game_id: number
    created_at: number
    is_del: number
    server_name: string
    server_type_name: string
    is_default: number
    from_sdk: number
    is_guest: number
    /** 重要:是否已游戏内邮件验证 */
    is_verified: number
}

export interface PropInfo {
    category_id: string
    category_name: string
    change: string
    name: string
    next_cursor: string
    product_id: string
    prop_name: string
    reason_id: string
    remark: string
    time: number
}

export interface PropCategory {
    id: string
    name: string
}

/**
 * 角色绑定和道具流模块
 * 实现bindRoles.js和propsFlow.js的功能
 */
export class KFAPI extends DNASubModule {
    base_param = {
        game_id: 2277,
        lang: "zh",
    }

    /**
     * 获取角色登录令牌
     * @param gameId 游戏ID
     */
    async getTokenForCs(gameId: string | number = DNA_GAME_ID) {
        return this._dna_request<{
            token: string
        }>(`/role/getTokenForCs?game_id=${gameId}`)
    }

    /**
     * SDK登录接口
     * @param token 登录令牌 getTokenForCs返回的token
     */
    async sdkMoyuLogin(token: string) {
        return this._dna_request_kf<{
            jumpUrl: string
            token: string
        }>(
            "/v1/public/login/sdkMoyuLogin",
            {
                ...this.base_param,
                token,
            },
            { method: "GET" }
        )
    }

    /**
     * 二合一SDK登录接口
     * @returns 登录成功返回用户信息, 失败返回错误信息
     */
    async sdkLogin() {
        const tokenCs = await this.getTokenForCs()
        if (tokenCs.data) {
            const moyu = await this.sdkMoyuLogin(tokenCs.data.token)
            if (moyu.data) {
                this.kf_token = moyu.data.token
            }
            return moyu
        }
        return tokenCs
    }

    /**
     * 获取用户信息
     */
    async getUserInfo() {
        return this._dna_request_kf<{
            id: string
            phone: string
            email: string
            login_type: number
        }>("/v1/frontend/login/getUserInfo", this.base_param, { method: "GET" })
    }
    //#region 流水查询

    /*
    流水查询流程说明:
    1. 调用getRole获取角色ID 并检查is_verified是否为1
    2. 如果is_verified为0, 则调用发送游戏内邮件验证码接口发送验证码
    3. 调用验证角色邮箱接口验证角色邮箱
    4. 调用查询道具流接口查询道具流
     */

    /**
     * 获取角色信息
     */
    async getRole() {
        return this._dna_request_kf<RoleInfo[]>("/v1/frontend/role/getRole", this.base_param, { method: "GET" })
    }

    /**
     * 发送游戏内邮件验证码
     * @param serverId 区服ID
     * @param roleId 角色ID
     */
    async sendGameMail(roleId: string | number, serverId: string | number = 29046) {
        return this._dna_request_kf("/v1/public/role/sendGameMail", {
            ...this.base_param,
            server_id: serverId,
            role: roleId,
        })
    }

    /**
     * 验证角色邮箱
     */
    async verifyRoleMailCode(mail_code: string) {
        return this._dna_request_kf("/v1/frontend/role/verify", { ...this.base_param, mail_code })
    }

    /**
     * 获取区服类型列表
     */
    async getServerType(game_id: string | number = 2277) {
        return this._dna_request_kf<ServerType[]>("/v1/public/select/serverType", { ...this.base_param, game_id }, { method: "GET" })
    }

    /**
     * 获取区服列表
     * @param server_type 区服类型ID
     */
    async getServerList(server_type: string | number = 230) {
        return this._dna_request_kf<ServerInfo[]>("/v1/public/select/getServerList", { ...this.base_param, server_type }, { method: "GET" })
    }

    /**
     * 获取道具分类
     */
    async getPropCategory() {
        return this._dna_request_kf<PropCategory[]>("/v1/public/selfService/getPropCategory", this.base_param, { method: "GET" })
    }

    /**
     * 查询道具流
     * @param date 日期 "2026-01-19"
     * @param name 道具名称
     * @param role 角色ID
     * @param category_id 道具分类ID
     * @param server_id 区服ID
     * @access 访问限制 1分钟一次
     */
    async queryFlow(date: string, name: string, role: string, category_id: string = "Resource", server_id: string | number = 29046) {
        return this._dna_request_kf<PropInfo[]>("/v1/frontend/selfService/queryFlow", {
            ...this.base_param,
            date,
            name,
            role,
            server_id,
            category_id,
        })
    }
    //#endregion
    //#region 其他
    /**
     * 绑定角色
     * @param serverId 区服ID
     * @param roleName 角色名称
     * @param mailCode 邮件验证码
     */
    async bindRole(serverId: string, roleName: string, mailCode?: string) {
        return this._dna_request_kf<RoleInfo>("/v1/frontend/role/bindRole", {
            server_id: serverId,
            role: roleName,
            mail_code: mailCode,
        })
    }

    /**
     * 绑定默认角色
     */
    async bindDefaultRole() {
        return this._dna_request_kf<RoleInfo>("/v1/public/role/default", this.base_param)
    }

    /**
     * 获取验证码
     */
    async getCode() {
        return this._dna_request_kf<any>("/v1/frontend/selfService/getCode")
    }

    /**
     * 获取手机验证码
     */
    async sendVerifyCode() {
        return this._dna_request_kf<any>("/v1/frontend/selfService/sendVerifyCode")
    }

    /**
     * 变更手机
     */
    async changePhone() {
        return this._dna_request_kf<any>("/v1/frontend/selfService/changePhone")
    }

    /**
     * 选择角色
     */
    async chooseRole() {
        return this._dna_request_kf<any>("/v1/frontend/role/chooseRole")
    }

    /**
     * 解码手机验证码
     * @param verifyCode 手机验证码
     */
    async decodePhone(verifyCode: string) {
        return this._dna_request_kf<any>("/v1/public/kf/decode", { verify_code: verifyCode })
    }

    /**
     * 获取登录验证码
     */
    async captcha() {
        return this._dna_request_kf("/v1/public/login/captcha", undefined, { method: "GET" })
    }
    //#endregion
}
