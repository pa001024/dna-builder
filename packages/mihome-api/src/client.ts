import { AuthStore, type TokenStore } from "./auth"
import { decrypt, generateEncParams, genNonce, signedNonce } from "./crypto"
import { errorMessage, MiHomeError } from "./errors"
import { asArray, entryStr, type Json, type JsonRecord, type SceneInfo, toSceneInfo } from "./models"
import { type FetchFn, fetchSpecInfo, type SpecInfo } from "./spec"

export const API_BASE = "https://api.mijia.tech/app"
export const LOGIN_URL = "https://account.xiaomi.com/longPolling/loginUrl"
const TOTAL_TIMEOUT_MS = 30000
const QR_POLL_TIMEOUT_MS = 120000
const AVAILABLE_CACHE_SECS = 60

export interface QrLoginData {
    refreshed: boolean
    loginUrl: string
    qrImg: string
    lp: string
}

export type QrBeginResult = { already: true } | { already: false; login_url: string; lp: string }

function randomIndex(n: number): number {
    const g = globalThis.crypto
    if (g?.getRandomValues) {
        const b = new Uint8Array(4)
        g.getRandomValues(b)
        return (new DataView(b.buffer).getUint32(0) % n) | 0
    }
    return (Math.random() * n) | 0
}

function randAlnum(len: number, upperHex: boolean): string {
    const alphabet = upperHex ? "0123456789ABCDEF" : "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"
    let out = ""
    for (let i = 0; i < len; i++) out += alphabet[randomIndex(alphabet.length)]
    return out
}

function randHexLower(len: number): string {
    let out = ""
    for (let i = 0; i < len; i++) out += randomIndex(16).toString(16)
    return out
}

function detectLocale(): string {
    const lang = (typeof navigator !== "undefined" ? navigator.language : "") ?? ""
    if (lang.includes("-")) return lang.replace("-", "_")
    if (lang !== "") return lang
    return "zh_CN"
}

function tzInfo(): [string, string] {
    const offsetSecs = -new Date().getTimezoneOffset() * 60
    const sign = offsetSecs < 0 ? "-" : "+"
    const abs = Math.abs(offsetSecs)
    const pad = (n: number): string => String(n).padStart(2, "0")
    const zone = `GMT${sign}${pad(Math.floor(abs / 3600))}:${pad(Math.floor((abs % 3600) / 60))}`
    const id = offsetSecs === 28800 ? "Asia/Shanghai" : "UTC"
    return [id, zone]
}

function urlDecode(s: string): string {
    let out = ""
    let i = 0
    while (i < s.length) {
        const c = s[i]
        if (c === "+") {
            out += " "
            i++
        } else if (c === "%" && i + 2 < s.length && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
            out += String.fromCharCode(Number.parseInt(s.slice(i + 1, i + 3), 16))
            i += 3
        } else {
            out += c
            i++
        }
    }
    return out
}

function withTimeout(ms: number): AbortSignal {
    return AbortSignal.timeout(ms)
}

export class MiHomeClient {
    protected auth: AuthStore
    protected fetchFn: FetchFn
    protected locale: string
    protected serviceLoginUrl: string
    private availableCache: { ok: boolean; at: number } | null = null

    constructor(store: TokenStore, fetchFn?: FetchFn) {
        this.auth = new AuthStore(store)
        this.fetchFn = fetchFn ?? fetch
        this.locale = detectLocale()
        this.serviceLoginUrl = `https://account.xiaomi.com/pass/serviceLogin?_json=true&sid=mijia&_locale=${this.locale}`
    }

    async status(): Promise<boolean> {
        if (!this.auth.containsAll(["ua", "ssecurity", "userId", "cUserId", "serviceToken"])) return false
        if (this.availableCache !== null && Date.now() - this.availableCache.at < AVAILABLE_CACHE_SECS * 1000) {
            return this.availableCache.ok
        }
        try {
            await this.checkNewMsg()
        } catch {
            this.availableCache = null
            return false
        }
        this.availableCache = { ok: true, at: Date.now() }
        return true
    }

    async qrBegin(): Promise<QrBeginResult> {
        const data = await this.qrLoginData().catch(e => {
            throw MiHomeError.login(-1, `获取登录二维码失败: ${e instanceof Error ? e.message : String(e)}`)
        })
        if (data.refreshed) return { already: true }
        return { already: false, login_url: data.loginUrl, lp: data.lp }
    }

    async qrWait(loginUrl: string, lp: string): Promise<void> {
        await this.completeQrLogin({ refreshed: false, loginUrl, qrImg: "", lp }).catch(e => {
            if (e instanceof MiHomeError) throw e
            throw MiHomeError.login(-1, `扫码登录未完成: ${e instanceof Error ? e.message : String(e)}`)
        })
    }

    async logout(): Promise<void> {
        this.auth.clear()
        this.availableCache = null
    }

    async listScenes(): Promise<SceneInfo[]> {
        const homes = asArray(await this.homesList())
        const idToName = new Map<string, string>()
        for (const h of homes) idToName.set(entryStr(h, "id"), entryStr(h, "name"))
        const out: SceneInfo[] = []
        for (const h of homes) {
            const hid = entryStr(h, "id")
            if (hid === "") continue
            for (const s of asArray(await this.scenesList(hid))) {
                out.push(toSceneInfo(s, hid, idToName.get(entryStr(s, "home_id") || hid) ?? ""))
            }
        }
        return out
    }

    async runScene(sceneId: string, homeId: string): Promise<void> {
        const ok = await this.runSceneRaw(sceneId, homeId)
        if (!ok) throw MiHomeError.api(-1, "执行场景失败")
    }

    userAgent(): string {
        const saved = this.auth.getStr("ua")
        if (saved !== null) return saved
        const country = this.locale.split("_")[1] ?? "CN"
        const id1 = randAlnum(40, true)
        const id2 = randAlnum(32, true)
        const id3 = randAlnum(32, true)
        const id4 = randAlnum(40, true)
        const ua = `Android-15-11.0.701-Xiaomi-23046RP50C-OS2.0.212.0.VMYCNXM-${id1}-${country}-${id3}-${id2}-SmartHome-MI_APP_STORE-${id1}|${id4}|${this.passO()}-64`
        this.auth.set("ua", ua)
        return ua
    }

    deviceId(): string {
        const saved = this.auth.getStr("deviceId")
        if (saved !== null) return saved
        const id = randAlnum(16, false)
        this.auth.set("deviceId", id)
        return id
    }

    private passO(): string {
        const saved = this.auth.getStr("pass_o")
        if (saved !== null) return saved
        const p = randHexLower(16)
        this.auth.set("pass_o", p)
        return p
    }

    private sessionHeaders(): Record<string, string> {
        const ua = this.userAgent()
        const deviceId = this.deviceId()
        const cUser = this.auth.getStr("cUserId") ?? ""
        const token = this.auth.getStr("serviceToken") ?? ""
        const country = this.locale.split("_")[1] ?? "CN"
        const [tzId, tz] = tzInfo()
        return {
            "User-Agent": ua,
            "accept-encoding": "identity",
            "Content-Type": "application/x-www-form-urlencoded",
            "miot-accept-encoding": "GZIP",
            "miot-encrypt-algorithm": "ENCRYPT-RC4",
            "x-xiaomi-protocal-flag-cli": "PROTOCAL-HTTP2",
            Cookie: `cUserId=${cUser};yetAnotherServiceToken=${token};serviceToken=${token};timezone_id=${tzId};timezone=${tz};is_daylight=0;dst_offset=0;channel=MI_APP_STORE;countryCode=${country};PassportDeviceId=${deviceId};locale=${this.locale}`,
        }
    }

    private parseServiceRet(status: number, text: string): Json {
        const body = text.startsWith("&&&START&&&") ? text.slice("&&&START&&&".length) : text
        try {
            return JSON.parse(body) as Json
        } catch {
            throw MiHomeError.login(-1, `登录响应解析失败(HTTP ${status}，正文 ${text.length} 字节非 JSON)`)
        }
    }

    private async handleRet(resp: Response, verifyCode: boolean): Promise<Json> {
        if (!resp.ok) throw MiHomeError.login(resp.status, "HTTP 错误")
        const text = await resp.text()
        const data = this.parseServiceRet(resp.status, text)
        if (verifyCode) {
            const code = data !== null && typeof data === "object" && !Array.isArray(data) ? Number((data as JsonRecord)["code"] ?? -1) : -1
            if (code !== 0) {
                const desc = entryStr(data, "desc")
                throw MiHomeError.login(code, desc === "" ? "未知错误" : desc)
            }
        }
        return data
    }

    private captureCookies(resp: Response): Record<string, string> {
        const out: Record<string, string> = {}
        const getAll: (() => string[]) | undefined = (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.bind(
            resp.headers
        )
        const raws: string[] = getAll !== undefined ? getAll() : (resp.headers.get("set-cookie")?.split(/,(?=[^;,]+=)/) ?? [])
        for (const raw of raws) {
            const pair = raw.split(";")[0]
            const eq = pair.indexOf("=")
            if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
        }
        return out
    }

    private async getLocation(): Promise<Record<string, string> | null> {
        const ua = this.userAgent()
        const deviceId = this.deviceId()
        const passO = this.passO()
        const passToken = this.auth.getStr("passToken") ?? ""
        const userId = this.auth.getStr("userId") ?? ""
        const cUserId = this.auth.getStr("cUserId") ?? ""
        let resp: Response
        try {
            resp = await this.fetchFn(this.serviceLoginUrl, {
                headers: {
                    "User-Agent": ua,
                    Connection: "keep-alive",
                    "Content-Type": "application/x-www-form-urlencoded",
                    Cookie: `deviceId=${deviceId};pass_o=${passO};passToken=${passToken};userId=${userId};cUserId=${cUserId};uLocale=${this.locale};`,
                },
                credentials: "include",
                signal: withTimeout(TOTAL_TIMEOUT_MS),
            })
        } catch (e) {
            throw MiHomeError.http(e instanceof Error ? e.message : String(e))
        }
        const serviceData = await this.handleRet(resp, false)
        const location = entryStr(serviceData, "location")
        const code =
            serviceData !== null && typeof serviceData === "object" && !Array.isArray(serviceData)
                ? Number((serviceData as JsonRecord)["code"] ?? -1)
                : -1
        if (code === 0) {
            let ret: Response
            try {
                ret = await this.fetchFn(location, { credentials: "include", signal: withTimeout(TOTAL_TIMEOUT_MS) })
            } catch (e) {
                throw MiHomeError.http(e instanceof Error ? e.message : String(e))
            }
            const jar = this.captureCookies(ret)
            const body = await ret.text()
            if (ret.ok && body === "ok") {
                for (const [k, v] of Object.entries(jar)) this.auth.set(k, v)
                const ssec = (serviceData as JsonRecord)["ssecurity"] ?? null
                this.auth.set("ssecurity", ssec)
                return null
            }
        }
        const map: Record<string, string> = {}
        const q = location.includes("?") ? location.slice(location.indexOf("?") + 1) : ""
        for (const pair of q.split("&")) {
            if (pair === "") continue
            const eq = pair.indexOf("=")
            if (eq < 0) continue
            map[urlDecode(pair.slice(0, eq))] = urlDecode(pair.slice(eq + 1))
        }
        return map
    }

    private async refreshToken(): Promise<void> {
        if (await this.status()) return
        const loc = await this.getLocation()
        if (loc === null) {
            this.auth.save()
            return
        }
        throw MiHomeError.login(-1, "刷新Token失败，请重新登录")
    }

    async qrLoginData(): Promise<QrLoginData> {
        let location: Record<string, string> | null
        try {
            location = await this.getLocation()
        } catch (e) {
            throw MiHomeError.login(-1, `获取登录二维码失败: ${e instanceof Error ? e.message : String(e)}`)
        }
        if (location === null) {
            this.auth.save()
            return { refreshed: true, loginUrl: "", qrImg: "", lp: "" }
        }
        const ua = this.userAgent()
        const ts = AuthStore.saveTimeMs()
        const extra = Object.entries(location).map(([k, v]) => `${k}=${v}`)
        extra.push(`_dc=${ts}`)
        const url = `${LOGIN_URL}?theme=&bizDeviceType=&_hasLogo=false&_qrsize=240&_dc=${ts}&${extra.join("&")}`
        let resp: Response
        try {
            resp = await this.fetchFn(url, {
                headers: { "User-Agent": ua, "Content-Type": "application/x-www-form-urlencoded", Connection: "keep-alive" },
                credentials: "include",
                signal: withTimeout(TOTAL_TIMEOUT_MS),
            })
        } catch (e) {
            throw MiHomeError.login(-1, `获取登录二维码失败: ${e instanceof Error ? e.message : String(e)}`)
        }
        let data: Json
        try {
            data = await this.handleRet(resp, true)
        } catch (e) {
            throw MiHomeError.login(-1, `获取登录二维码失败: ${e instanceof Error ? e.message : String(e)}`)
        }
        return { refreshed: false, loginUrl: entryStr(data, "loginUrl"), qrImg: entryStr(data, "qr"), lp: entryStr(data, "lp") }
    }

    async completeQrLogin(data: QrLoginData): Promise<void> {
        const ua = this.userAgent()
        let resp: Response
        try {
            resp = await this.fetchFn(data.lp, {
                headers: { "User-Agent": ua, "Content-Type": "application/x-www-form-urlencoded", Connection: "keep-alive" },
                credentials: "include",
                signal: withTimeout(QR_POLL_TIMEOUT_MS),
            })
        } catch (e) {
            const timeout = e instanceof Error && e.name === "TimeoutError"
            throw MiHomeError.login(-1, timeout ? "超时，请重试" : `扫码登录未完成: ${e instanceof Error ? e.message : String(e)}`)
        }
        let lpData: Json
        try {
            lpData = await this.handleRet(resp, true)
        } catch (e) {
            throw MiHomeError.login(-1, `扫码登录未完成: ${e instanceof Error ? e.message : String(e)}`)
        }
        const rec = lpData as JsonRecord
        for (const key of ["psecurity", "nonce", "ssecurity", "passToken", "userId", "cUserId"]) {
            this.auth.set(key, rec[key] ?? null)
        }
        const callback = entryStr(lpData, "location")
        let cb: Response
        try {
            cb = await this.fetchFn(callback, {
                headers: { "User-Agent": ua },
                credentials: "include",
                signal: withTimeout(TOTAL_TIMEOUT_MS),
            })
        } catch (e) {
            throw MiHomeError.login(-1, `扫码登录未完成: ${e instanceof Error ? e.message : String(e)}`)
        }
        for (const [k, v] of Object.entries(this.captureCookies(cb))) this.auth.set(k, v)
        await cb.arrayBuffer().catch(() => null)
        this.auth.set("expireTime", Date.now() + 30 * 24 * 3600 * 1000)
        this.auth.save()
    }

    async request(uri: string, data: Json, refresh = true): Promise<Json> {
        if (refresh) await this.refreshToken()
        const ssecurity = this.auth.getStr("ssecurity") ?? ""
        const payload = JSON.stringify(data ?? {})
        const nonce = genNonce()
        const signed = signedNonce(ssecurity, nonce)
        const params: Array<[string, string]> = [["data", payload]]
        const form = generateEncParams(uri, "POST", signed, nonce, params, ssecurity)
        let text: string
        try {
            const resp = await this.fetchFn(`${API_BASE}${uri}`, {
                method: "POST",
                headers: this.sessionHeaders(),
                body: new URLSearchParams(form).toString(),
                credentials: "include",
                signal: withTimeout(TOTAL_TIMEOUT_MS),
            })
            text = await resp.text()
        } catch (e) {
            throw MiHomeError.http(e instanceof Error ? e.message : String(e))
        }
        let ret: Json
        try {
            ret = JSON.parse(text) as Json
        } catch {
            ret = null
        }
        const hasCode = ret !== null && typeof ret === "object" && !Array.isArray(ret) && "code" in ret
        const hasResult = ret !== null && typeof ret === "object" && !Array.isArray(ret) && "result" in ret
        if (!hasCode && !hasResult) {
            let dec: string
            try {
                dec = await decrypt(ssecurity, nonce, text)
            } catch (e) {
                throw MiHomeError.api(-1, `响应解密失败: ${e instanceof Error ? e.message : String(e)}`)
            }
            try {
                ret = JSON.parse(dec) as Json
            } catch (e) {
                throw MiHomeError.api(-1, `响应解析失败: ${e instanceof Error ? e.message : String(e)}`)
            }
        }
        const rec = ret as JsonRecord
        const code = Number(rec["code"] ?? 0)
        if (code === 0 && "result" in rec) return rec["result"] as Json
        const msg = typeof rec["message"] === "string" ? rec["message"] : typeof rec["desc"] === "string" ? rec["desc"] : "未知错误"
        throw MiHomeError.api(code, msg)
    }

    private async homeOwner(homeId: string): Promise<number> {
        const homes = asArray(await this.homesList())
        for (const h of homes) {
            if (entryStr(h, "id") === homeId) {
                const uid = (h as JsonRecord)["uid"]
                const n = typeof uid === "number" ? uid : Number.parseInt(String(uid ?? ""), 10)
                if (!Number.isNaN(n)) return n
                throw MiHomeError.api(-1, `未找到 home_id=${homeId} 的家庭信息`)
            }
        }
        throw MiHomeError.api(-1, `未找到 home_id=${homeId} 的家庭信息`)
    }

    async homesList(): Promise<Json> {
        const result = await this.request(
            "/v2/homeroom/gethome_merged",
            {
                fg: true,
                fetch_share: true,
                fetch_share_dev: true,
                fetch_cariot: true,
                limit: 300,
                app_ver: 7,
                plat_form: 0,
            },
            true
        )
        return (result as JsonRecord)["homelist"] ?? null
    }

    private async devicesListPage(homeId: string): Promise<Json[]> {
        const owner = await this.homeOwner(homeId)
        const homeInt = Number.parseInt(homeId, 10) || 0
        let startDid = ""
        const devices: Json[] = []
        for (;;) {
            const ret = (await this.request(
                "/home/home_device_list",
                {
                    home_owner: owner,
                    home_id: homeInt,
                    limit: 200,
                    start_did: startDid,
                    get_split_device: true,
                    support_smart_home: true,
                    get_cariot_device: true,
                    get_third_device: true,
                },
                true
            )) as JsonRecord
            const infos = asArray(ret["device_info"])
            if (infos.length === 0) break
            for (const d of infos) {
                ;(d as JsonRecord)["home_id"] = homeId
                devices.push(d)
            }
            const maxDid = entryStr(ret, "max_did")
            const hasMore = (ret["has_more"] as boolean) ?? false
            if (!(hasMore === true && maxDid !== "")) break
            startDid = maxDid
        }
        return devices
    }

    async devicesList(homeId?: string): Promise<Json> {
        if (homeId !== undefined) return await this.devicesListPage(homeId)
        const homes = asArray(await this.homesList())
        const out: Json[] = []
        for (const h of homes) {
            const hid = entryStr(h, "id")
            if (hid === "") continue
            out.push(...(await this.devicesListPage(hid)))
        }
        return out
    }

    async sharedDevicesList(): Promise<Json> {
        const ret = (await this.request(
            "/v2/home/device_list_page",
            {
                ssid: "<unknown ssid>",
                bssid: "02:00:00:00:00:00",
                getVirtualModel: true,
                getHuamiDevices: 1,
                get_split_device: true,
                support_smart_home: true,
                get_cariot_device: true,
                get_third_device: true,
                get_phone_device: true,
                get_miwear_device: true,
            },
            true
        )) as JsonRecord
        return asArray(ret["list"])
            .filter(d => (d as JsonRecord)["owner"] === true)
            .map(d => {
                ;(d as JsonRecord)["home_id"] = "shared"
                return d
            })
    }

    private async scenesPage(homeId: string): Promise<Json[]> {
        const owner = await this.homeOwner(homeId)
        const ret = (await this.request(
            "/appgateway/miot/appsceneservice/AppSceneService/GetSimpleSceneList",
            {
                app_version: 12,
                get_type: 2,
                home_id: homeId,
                owner_uid: owner,
            },
            true
        )) as JsonRecord
        return asArray(ret["manual_scene_info_list"]).map(s => {
            ;(s as JsonRecord)["home_id"] = homeId
            return s
        })
    }

    async scenesList(homeId?: string): Promise<Json> {
        if (homeId !== undefined) return await this.scenesPage(homeId)
        const homes = asArray(await this.homesList())
        const out: Json[] = []
        for (const h of homes) {
            const hid = entryStr(h, "id")
            if (hid === "") continue
            out.push(...(await this.scenesPage(hid)))
        }
        return out
    }

    private async runSceneRaw(sceneId: string, homeId: string): Promise<boolean> {
        const owner = await this.homeOwner(homeId)
        const ret = await this.request(
            "/appgateway/miot/appsceneservice/AppSceneService/NewRunScene",
            {
                scene_id: sceneId,
                scene_type: 2,
                phone_id: "null",
                home_id: homeId,
                owner_uid: owner,
            },
            true
        )
        return ret !== null && ret !== false
    }

    async consumables(homeId?: string): Promise<Json> {
        const page = async (hid: string): Promise<Json[]> => {
            const owner = await this.homeOwner(hid)
            const ret = (await this.request(
                "/v2/home/standard_consumable_items",
                {
                    home_id: Number.parseInt(hid, 10) || 0,
                    owner_id: owner,
                    filter_ignore: true,
                },
                true
            )) as JsonRecord
            const items = asArray(ret["items"])
            const first = items.length > 0 ? (items[0] as JsonRecord) : null
            const consumes = first !== null ? asArray(first["consumes_data"]) : []
            return consumes.map(item => {
                const rec = item as JsonRecord
                const details = rec["details"]
                if (Array.isArray(details) && details.length === 1) rec["details"] = details[0]
                rec["home_id"] = hid
                return item
            })
        }
        if (homeId !== undefined) return await page(homeId)
        const homes = asArray(await this.homesList())
        const out: Json[] = []
        for (const h of homes) {
            const hid = entryStr(h, "id")
            if (hid === "") continue
            out.push(...(await page(hid)))
        }
        return out
    }

    async propGet(params: Json): Promise<Json> {
        return this.request("/miotspec/prop/get", { params, datasource: 1 }, true)
    }

    async propGetSingle(query: Json): Promise<Json> {
        const ret = asArray(await this.propGet([query]))
        if (ret.length === 0) throw MiHomeError.api(-1, "属性读取无返回")
        return ret[0]
    }

    async propSet(params: Json): Promise<Json> {
        const ret = await this.request("/miotspec/prop/set", { params }, true)
        annotateCodes(ret)
        return ret
    }

    async propSetSingle(req: Json): Promise<Json> {
        const ret = asArray(await this.propSet([req]))
        return ret.length > 0 ? ret[0] : null
    }

    async action(params: Json): Promise<Json> {
        const list = Array.isArray(params) ? (params as Json[]) : [params]
        const out: Json[] = []
        for (const p of list) out.push(await this.request("/miotspec/action", { params: p }, true))
        const v: Json = out
        annotateCodes(v)
        if (!Array.isArray(params) && out.length > 0) return out[0]
        return v
    }

    async actionSingle(req: Json): Promise<Json> {
        return this.action(req)
    }

    async statistics(data: Json): Promise<Json> {
        const list = Array.isArray(data) ? (data as Json[]) : [data]
        const out: Json[] = []
        for (const p of list) out.push(await this.request("/v2/user/statistics", p, true))
        if (!Array.isArray(data)) return out[0] ?? null
        return out
    }

    async checkNewMsg(beginAt?: number): Promise<Json> {
        return this.request(
            "/v2/message/v2/check_new_msg",
            {
                begin_at: beginAt ?? Math.floor(Date.now() / 1000) - 3600,
            },
            false
        )
    }

    async specInfo(specType: string): Promise<SpecInfo> {
        return fetchSpecInfo(specType, this.fetchFn)
    }

    async iconUrl(model: string): Promise<string | null> {
        await this.refreshToken()
        const ssecurity = this.auth.getStr("ssecurity") ?? ""
        const uri = "/v2/productconfig/get_icon"
        const payload = JSON.stringify({ icon_name: "icon_real", model })
        const nonce = genNonce()
        const signed = signedNonce(ssecurity, nonce)
        const params: Array<[string, string]> = [["data", payload]]
        const form = generateEncParams(uri, "POST", signed, nonce, params, ssecurity)
        let resp: Response
        try {
            resp = await this.fetchFn(`${API_BASE}${uri}`, {
                method: "POST",
                headers: this.sessionHeaders(),
                body: new URLSearchParams(form).toString(),
                credentials: "include",
                redirect: "manual",
                signal: withTimeout(TOTAL_TIMEOUT_MS),
            })
        } catch (e) {
            throw MiHomeError.http(e instanceof Error ? e.message : String(e))
        }
        if (resp.status !== 302) return null
        return resp.headers.get("Location")
    }
}

export function annotateCodes(ret: Json): void {
    if (Array.isArray(ret)) {
        for (const item of ret) annotateOne(item)
        return
    }
    annotateOne(ret)
}

function annotateOne(item: Json): void {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return
    const rec = item as JsonRecord
    const code = Number(rec["code"] ?? -1)
    rec["message"] = code === 0 || code === 1 ? "成功" : errorMessage(code)
}
