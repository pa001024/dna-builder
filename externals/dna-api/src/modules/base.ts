import { RespCode, TimeBasicResponse } from "../TimeBasicResponse"
import type { DNACommonConfigEntity } from "../type-generated"
import { aesDecryptImageUrl, build_signature, build_upload_signature, type HeadersPayload, type RequestOptions } from "./utils"

export class DNABaseAPI {
    public fetchFn?: typeof fetch
    public is_h5 = false
    public RSA_PUBLIC_KEY =
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDGpdbezK+eknQZQzPOjp8mr/dP+QHwk8CRkQh6C6qFnfLH3tiyl0pnt3dePuFDnM1PUXGhCkQ157ePJCQgkDU2+mimDmXh0oLFn9zuWSp+U8uLSLX3t3PpJ8TmNCROfUDWvzdbnShqg7JfDmnrOJz49qd234W84nrfTHbzdqeigQIDAQAB"
    public BASE_URL = "https://dnabbs-api.yingxiong.com/"
    public KF_BASE_URL = "https://kf.yingxiong.com/"
    public uploadKey: string = ""
    public sign_api_urls = new Set<string>()

    public dev_code = ""
    public token = ""
    public kf_token = ""
    constructor(
        options: {
            dev_code?: string
            token?: string
            kf_token?: string
            fetchFn?: typeof fetch
            is_h5?: boolean
            rsa_public_key?: string
        } = {}
    ) {
        this.fetchFn = options.fetchFn
        if (options.is_h5 !== undefined) this.is_h5 = options.is_h5
        if (options.rsa_public_key !== undefined) this.RSA_PUBLIC_KEY = options.rsa_public_key
        if (options.dev_code !== undefined) this.dev_code = options.dev_code
        if (options.token !== undefined) this.token = options.token
        if (options.kf_token !== undefined) this.kf_token = options.kf_token
    }

    async fileUpload(url: string, data: FormData) {
        const res = await this._dna_request<string[]>(url, data, { sign: true })
        if (res.is_success && res.data) {
            res.data = res.data.map(url => aesDecryptImageUrl(url, this.uploadKey))
        }
        return res
    }

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

    public async getHeaders(options?: {
        payload?: Record<string, any> | string | FormData
        exparams?: Record<string, any>
        dev_code?: string
        refer?: boolean
        token?: string
        kf_token?: string
        h5?: boolean
        kf?: boolean
    }): Promise<HeadersPayload> {
        let {
            payload = {},
            exparams,
            dev_code = this.dev_code,
            refer,
            token = this.token,
            kf_token = this.kf_token,
            h5,
            kf,
        } = options || {}

        const CONTENT_TYPE = "application/x-www-form-urlencoded"
        const iosBaseHeader = {
            version: "1.2.0",
            source: "ios",
            "Content-Type": CONTENT_TYPE,
            "User-Agent": "DoubleHelix/3 CFNetwork/3860.300.31 Darwin/25.2.0",
        }
        const h5BaseHeader = {
            version: "3.11.0",
            source: "h5",
            "Content-Type": CONTENT_TYPE,
            "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        }
        const kfBaseHeader = {
            Authorization: kf_token,
            Referer: `https://kf.yingxiong.com/kf2.0/user-center?game_id=2277&herot=${Date.now()}`,
            "Content-Type": CONTENT_TYPE,
            "User-Agent":
                "Mozilla/5.0 (Linux; Android 16; PLQ110 Build/BP2A.250605.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/143.0.7499.192 Mobile Safari/537.36CP6.TgzO Hero/1.1.4",
        }
        const is_h5 = this.is_h5 || h5 || false
        const headers: Record<string, any> = kf ? kfBaseHeader : is_h5 ? h5BaseHeader : iosBaseHeader
        if (dev_code && !kf) {
            headers.devcode = dev_code
        }
        if (refer || is_h5) {
            headers.origin = "https://dnabbs.yingxiong.com"
            headers.refer = "https://dnabbs.yingxiong.com/"
        }
        if (token && !kf) {
            headers.token = token
        }
        if (payload instanceof FormData) {
            const pk = await this.getRsaPublicKey()
            const { signature, key } = build_upload_signature(pk)
            headers.t = signature
            this.uploadKey = key

            if (exparams) {
                for (const [key, value] of Object.entries(exparams)) {
                    payload.append(key, String(value))
                }
            }

            delete headers["Content-Type"]
        } else if (typeof payload === "object") {
            if (!kf) {
                const pk = await this.getRsaPublicKey()
                const { rk, tn, sa } = build_signature(pk, payload, token)

                // 更新 headers
                headers.rk = rk
                headers.tn = tn
                headers.sa = sa
            }

            if (exparams) {
                Object.assign(payload, exparams)
            }

            const params = new URLSearchParams()
            Object.entries(payload).forEach(([key, value]) => {
                params.append(key, String(value))
            })
            payload = params.toString()
        }
        return { headers, payload }
    }

    async needSign(url: string): Promise<boolean> {
        if (this.sign_api_urls.size === 0) {
            try {
                await this.initializeSignConfig()
            } catch (error) {
                console.error("初始化签名配置失败:", error)
            } finally {
                if (this.sign_api_urls.size === 0)
                    this.sign_api_urls = new Set(
                        [
                            "/user/sdkLogin",
                            "/user/getSmsCode",
                            "/role/defaultRoleForTool",
                            "/media/av/cfg/getVideos",
                            "/media/av/cfg/getAudios",
                            "/media/av/cfg/getImages",
                            "/encourage/signin/signin",
                            "/user/refreshToken",
                            "/user/signIn",
                            "/user/refreshToken",
                            "/role/defaultRole",
                            "/role/list",
                            "/role/getShortNoteInfo",
                            "/forum/like",
                            "/encourage/calendar/Activity/list",
                        ].map(item => item.replace(/^\/+/, ""))
                    )
            }
        }
        return this.sign_api_urls.has(url)
    }

    async initializeSignConfig(): Promise<void> {
        try {
            const configRes = await this._dna_request<DNACommonConfigEntity>("config/getCommonConfig", undefined, { sign: false })
            if (configRes.is_success && configRes.data?.signApiConfigVo?.signApiList) {
                this.sign_api_urls = new Set(configRes.data.signApiConfigVo.signApiList.map(item => item.replace(/^\/+/, "")))
            }
        } catch (error) {
            console.error("初始化签名配置失败:", error)
        }
    }

    public async _dna_request_h5<T = any>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>> {
        return await this._dna_request(url, data, { ...options, h5: true })
    }

    public async _dna_request_kf<T = any>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>> {
        return await this._dna_request(url, data, { ...options, kf: true })
    }

    public async _dna_request<T = any>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>> {
        let { method = "POST", sign, h5, kf, refer, params, max_retries = 3, retry_delay = 1, timeout = 10000 } = options || {}
        if (url.startsWith("/")) url = url.slice(1)

        // 如果未明确指定 sign，则根据 URL 自动判断
        if (sign === undefined && (await this.needSign(url))) {
            sign = true
        }
        let headers: Record<string, any>
        if (sign) {
            const { payload: p, headers: h } = await this.getHeaders({
                payload: data,
                refer,
                exparams: params,
                token: this.token,
                h5,
            })
            data = p
            headers = h
        } else {
            const { headers: h } = await this.getHeaders({ refer, h5, kf })
            headers = h
        }

        for (let attempt = 0; attempt < max_retries; attempt++) {
            try {
                let body: string | FormData | undefined = data
                if (data && typeof data === "object" && !(data instanceof FormData)) {
                    const p = new URLSearchParams()
                    Object.entries(data).forEach(([key, value]) => {
                        if (value !== undefined) p.append(key, String(value))
                    })
                    body = p.toString()
                }
                const fetchOptions: RequestInit =
                    method === "GET"
                        ? {
                              method,
                              headers,
                          }
                        : {
                              method,
                              headers,
                              body,
                          }

                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), timeout)

                const initOptions = {
                    ...fetchOptions,
                    signal: controller.signal,
                }
                const base = kf ? this.KF_BASE_URL : this.BASE_URL
                const fullUrl = method === "GET" ? `${base}${url}${body ? `?${body}` : ""}` : `${base}${url}`
                const response = this.fetchFn ? await this.fetchFn(fullUrl, initOptions) : await fetch(fullUrl, initOptions)
                clearTimeout(timeoutId)

                const contentType = response.headers.get("content-type") || ""
                let raw_res: any

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
                    } catch {}
                }

                return new TimeBasicResponse<T>(raw_res)
            } catch (e) {
                console.error(`请求失败: ${(e as Error).message}`)
                if (attempt < max_retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retry_delay * 2 ** attempt))
                }
            }
        }

        return TimeBasicResponse.err("请求服务器失败,已达最大重试次数")
    }
}

/**
 * 子模块基类，代理 DNABaseAPI 的方法和属性
 * 所有子模块都通过这个类代理到共享的 BaseAPI 实例
 */
export abstract class DNASubModule {
    protected _base: DNABaseAPI

    constructor(base: DNABaseAPI) {
        this._base = base
    }

    // 代理属性访问
    get dev_code(): string {
        return this._base.dev_code
    }

    get token(): string {
        return this._base.token
    }
    set token(value: string) {
        this._base.token = value
    }

    get kf_token(): string {
        return this._base.kf_token
    }
    set kf_token(value: string) {
        this._base.kf_token = value
    }

    get fetchFn(): typeof fetch | undefined {
        return this._base.fetchFn
    }

    get is_h5(): boolean {
        return this._base.is_h5
    }

    get RSA_PUBLIC_KEY(): string {
        return this._base.RSA_PUBLIC_KEY
    }

    get BASE_URL(): string {
        return this._base.BASE_URL
    }

    get uploadKey(): string {
        return this._base.uploadKey
    }

    // 代理方法
    async getRsaPublicKey(): Promise<string> {
        return this._base.getRsaPublicKey()
    }

    /**
     * 图片上传
     */
    async fileUpload(url: string, data: FormData) {
        return await this._base.fileUpload(url, data)
    }

    public async _dna_request<T = any>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>> {
        return this._base._dna_request(url, data, options)
    }

    public async _dna_request_h5<T = any>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>> {
        return this._base._dna_request_h5(url, data, options)
    }

    public async _dna_request_kf<T = any>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>> {
        return this._base._dna_request_kf(url, data, options)
    }

    public async getHeaders(options?: {
        payload?: Record<string, any> | string | FormData
        exparams?: Record<string, any>
        dev_code?: string
        refer?: boolean
        token?: string
        h5?: boolean
    }): Promise<HeadersPayload> {
        return this._base.getHeaders(options)
    }
}
