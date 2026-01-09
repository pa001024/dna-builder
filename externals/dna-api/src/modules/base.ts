import { TimeBasicResponse, RespCode } from "../TimeBasicResponse"
import { DNACommonConfigEntity } from "../type-generated"
import { build_signature, build_upload_signature, rsa_encrypt, RequestOptions, HeadersPayload, aesDecryptImageUrl } from "./utils"

export class DNABaseAPI {
    public fetchFn?: typeof fetch
    public is_h5 = false
    public RSA_PUBLIC_KEY =
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDGpdbezK+eknQZQzPOjp8mr/dP+QHwk8CRkQh6C6qFnfLH3tiyl0pnt3dePuFDnM1PUXGhCkQ157ePJCQgkDU2+mimDmXh0oLFn9zuWSp+U8uLSLX3t3PpJ8TmNCROfUDWvzdbnShqg7JfDmnrOJz49qd234W84nrfTHbzdqeigQIDAQAB"
    public BASE_URL = "https://dnabbs-api.yingxiong.com/"
    public uploadKey: string = ""
    public sign_api_urls = new Set<string>()

    constructor(
        public dev_code: string,
        public token = "",
        options: { fetchFn?: typeof fetch; is_h5?: boolean; rsa_public_key?: string } = {},
    ) {
        this.fetchFn = options.fetchFn
        if (options.is_h5 !== undefined) this.is_h5 = options.is_h5
        if (options.rsa_public_key !== undefined) this.RSA_PUBLIC_KEY = options.rsa_public_key
    }

    async fileUpload(url: string, data: FormData) {
        const res = await this._dna_request<string[]>(url, data, { sign: true })
        if (res.is_success && res.data) {
            res.data = res.data.map((url) => aesDecryptImageUrl(url, this.uploadKey))
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
        tokenSig?: boolean
        h5?: boolean
    }): Promise<HeadersPayload> {
        let { payload, exparams, dev_code = this.dev_code, refer, token = this.token, tokenSig, h5 } = options || {}

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
        const is_h5 = this.is_h5 || h5 || false
        const headers = { ...(is_h5 ? h5BaseHeader : iosBaseHeader) } as Record<string, any>
        if (dev_code) {
            headers.devCode = dev_code
        }
        if (refer || is_h5) {
            headers.origin = "https://dnabbs.yingxiong.com"
            headers.refer = "https://dnabbs.yingxiong.com/"
        }
        if (token) {
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

    async needSign(url: string): Promise<boolean> {
        if (this.sign_api_urls.size === 0) {
            try {
                await this.initializeSignConfig()
            } catch (error) {
                console.error("初始化签名配置失败:", error)
                this.sign_api_urls = new Set(
                    [
                        "/user/sdkLogin",
                        "/forum/postPublish",
                        "/forum/comment/createComment",
                        "/forum/comment/createReply",
                        "/user/getSmsCode",
                        "/role/defaultRoleForTool",
                        "/media/av/cfg/getVideos",
                        "/media/av/cfg/getAudios",
                        "/media/av/cfg/getImages",
                        "/encourage/signin/signin",
                    ].map((item) => item.replace(/^\/+/, "")),
                )
            }
        }
        return this.sign_api_urls.has(url)
    }

    async initializeSignConfig(): Promise<void> {
        try {
            const configRes = await this._dna_request<DNACommonConfigEntity>("config/getCommonConfig", undefined, { sign: false })
            if (configRes.is_success && configRes.data?.signApiConfigVo?.signApiList) {
                this.sign_api_urls = new Set(configRes.data.signApiConfigVo.signApiList.map((item) => item.replace(/^\/+/, "")))
            }
        } catch (error) {
            console.error("初始化签名配置失败:", error)
        }
    }

    public async _dna_request_h5<T = any>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>> {
        return await this._dna_request(url, data, { ...options, h5: true })
    }

    public async _dna_request<T = any>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>> {
        let { method = "POST", sign, h5, refer, params, max_retries = 3, retry_delay = 1, timeout = 10000, token, tokenSig } = options || {}

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
                token: token ? this.token : undefined,
                tokenSig,
                h5,
            })
            data = p
            headers = h
        } else {
            const { headers: h } = await this.getHeaders({ token: token ? this.token : undefined, refer, h5 })
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
                const fetchOptions: RequestInit = {
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
                const response = this.fetchFn
                    ? await this.fetchFn(`${this.BASE_URL}${url}`, initOptions)
                    : await fetch(`${this.BASE_URL}${url}`, initOptions)
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
                    } catch (e) {}
                }

                return new TimeBasicResponse<T>(raw_res)
            } catch (e) {
                console.error(`请求失败: ${(e as Error).message}`)
                if (attempt < max_retries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, retry_delay * Math.pow(2, attempt)))
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

    public async getHeaders(options?: {
        payload?: Record<string, any> | string | FormData
        exparams?: Record<string, any>
        dev_code?: string
        refer?: boolean
        token?: string
        tokenSig?: boolean
        h5?: boolean
    }): Promise<HeadersPayload> {
        return this._base.getHeaders(options)
    }
}
