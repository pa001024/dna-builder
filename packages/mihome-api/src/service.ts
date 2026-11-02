import type { TokenStore } from "./auth"
import { MiHomeClient } from "./client"
import { type DeviceHandle, deviceFromSpec, deviceGet, deviceRunAction, deviceSet, openDevice } from "./device"
import { MiHomeError } from "./errors"
import {
    asArray,
    type DeviceDetail,
    type DeviceInfo,
    type EnumOption,
    entryStr,
    isSpeaker,
    type Json,
    type JsonRecord,
    type SceneInfo,
    type StatusExtra,
    toDeviceInfo,
} from "./models"
import { type FetchFn, fetchSpecInfo, type SpecInfo, serviceLabel } from "./spec"
import { actionDescZh, applyFallback, propDescZh } from "./spec_zh"

const BATCH_SIZE = 20

export function isSubDevice(did: string): number | null {
    const idx = did.lastIndexOf(".s")
    if (idx < 0) return null
    const tail = did.slice(idx + 2)
    if (tail === "" || !/^\d+$/.test(tail)) return null
    return Number.parseInt(tail, 10)
}

function switchTarget(did: string): string {
    if (isSubDevice(did) !== null) {
        const cut = did.lastIndexOf(".")
        return did.slice(0, cut)
    }
    return did
}

function findOnMethod(info: SpecInfo, did?: string): [number, number] | null {
    const props = info.properties.filter(
        p => p.type === "bool" && p.rw.includes("w") && (p.name === "on" || p.name.replace(/_/g, "-").startsWith("on-"))
    )
    if (props.length === 0) return null
    if (did !== undefined) {
        const gang = isSubDevice(did)
        if (gang !== null) {
            for (const p of props) {
                if (p.siid === gang) return [p.siid, p.piid]
            }
            const fallback = props[gang - 2]
            if (fallback !== undefined) return [fallback.siid, fallback.piid]
        }
    }
    return [props[0].siid, props[0].piid]
}

function formatTemp(v: number): string {
    const t = Math.abs(v) > 60 ? v / 10 : v
    return `${t.toFixed(1)}°C`
}

function formatHumidity(v: number): string {
    const h = v > 100 ? v / 10 : v
    return `${h.toFixed(0)}%`
}

export function formatMetricsText(temp?: number, hum?: number): string | null {
    const parts: string[] = []
    if (temp !== undefined) parts.push(formatTemp(temp))
    if (hum !== undefined) parts.push(formatHumidity(hum))
    return parts.length > 0 ? parts.join(" ") : null
}

const TEXT_ACTIONS = ["execute-text-directive", "play-text", "play-music", "play-radio"]

export class MiHomeService {
    readonly client: MiHomeClient
    private readonly fetchFn: FetchFn
    private deviceCache = new Map<string, DeviceHandle>()
    private deviceIndex = new Map<string, [string, string, string]>()
    private specCache = new Map<string, SpecInfo | null>()
    private iconCache = new Map<string, string | null>()
    private homeIds: Map<string, string> | null = null

    constructor(store: TokenStore, fetchFn?: FetchFn) {
        this.fetchFn = fetchFn ?? fetch
        this.client = new MiHomeClient(store, this.fetchFn)
    }

    async loginStatus(): Promise<boolean> {
        return this.client.status()
    }

    async qrLoginBegin(): Promise<{ refreshed: true } | { refreshed: false; login_url: string; lp: string; qr_img: string }> {
        const data = await this.client.qrLoginData()
        if (data.refreshed) return { refreshed: true }
        return { refreshed: false, login_url: data.loginUrl, lp: data.lp, qr_img: data.qrImg }
    }

    async qrLoginWait(loginUrl: string, lp: string): Promise<void> {
        await this.client.qrWait(loginUrl, lp)
    }

    async listDevices(): Promise<DeviceInfo[]> {
        const homes = asArray(await this.client.homesList())
        const devices = asArray(await this.client.devicesList())
        const shared = asArray(await this.client.sharedDevicesList())
        const location = new Map<string, [string, string]>()
        for (const home of homes) {
            const homeName = entryStr(home, "name")
            for (const room of asArray((home as JsonRecord)["roomlist"])) {
                const roomName = entryStr(room, "name")
                for (const did of asArray((room as JsonRecord)["dids"])) {
                    const id = typeof did === "string" ? did : typeof did === "number" ? String(did) : null
                    if (id !== null) location.set(id, [homeName, roomName])
                }
            }
        }
        const out = [...devices, ...shared].map(d => {
            const did = entryStr(d, "did")
            const [homeName, roomName] = location.get(did) ?? ["未知", "未知"]
            return toDeviceInfo(d, homeName, roomName)
        })
        out.sort((a, b) =>
            a.home_name < b.home_name
                ? -1
                : a.home_name > b.home_name
                  ? 1
                  : a.room_name < b.room_name
                    ? -1
                    : a.room_name > b.room_name
                      ? 1
                      : a.name < b.name
                        ? -1
                        : a.name > b.name
                          ? 1
                          : 0
        )
        return out
    }

    private async refreshDeviceIndex(): Promise<void> {
        const all = [...asArray(await this.client.devicesList()), ...asArray(await this.client.sharedDevicesList())]
        for (const d of all) {
            this.deviceIndex.set(entryStr(d, "did"), [entryStr(d, "model"), entryStr(d, "spec_type"), entryStr(d, "name")])
        }
    }

    private async specsFor(dids: string[]): Promise<Map<string, SpecInfo | null>> {
        if (dids.some(d => !this.deviceIndex.has(d))) await this.refreshDeviceIndex()
        const result = new Map<string, SpecInfo | null>()
        const missing: string[] = []
        for (const did of dids) {
            const specType = this.deviceIndex.get(did)?.[1] ?? ""
            if (specType === "") {
                result.set(did, null)
            } else if (this.specCache.has(specType)) {
                result.set(did, this.specCache.get(specType) ?? null)
            } else {
                missing.push(specType)
            }
        }
        for (const specType of [...new Set(missing)]) {
            try {
                const info = await fetchSpecInfo(specType, this.fetchFn)
                applyFallback(info)
                this.specCache.set(specType, info)
            } catch {
                this.specCache.set(specType, null)
            }
        }
        for (const did of dids) {
            if (!result.has(did)) {
                const specType = this.deviceIndex.get(did)?.[1] ?? ""
                result.set(did, this.specCache.get(specType) ?? null)
            }
        }
        return result
    }

    private async getDevice(did: string): Promise<DeviceHandle> {
        const hit = this.deviceCache.get(did)
        if (hit !== undefined) return hit
        if (!this.deviceIndex.has(did)) await this.refreshDeviceIndex()
        const entry = this.deviceIndex.get(did) ?? ["", "", ""]
        if (entry[0] !== "" && entry[1] === "") throw new Error("该设备无公开的功能规格（常见于仅蓝牙连接的产品），无法提供控制面板")
        let dev: DeviceHandle
        try {
            dev = await openDevice(this.client, did)
        } catch (e) {
            if (e instanceof MiHomeError && (e.kind === "device-not-found" || e.kind === "get-device-info")) {
                dev = await this.buildSharedDevice(did)
            } else if (e instanceof MiHomeError && e.kind === "missing-spec-type") {
                throw new Error("该设备无公开的功能规格（常见于仅蓝牙连接的产品），无法提供控制面板")
            } else {
                throw e
            }
        }
        for (const p of dev.props.values()) p.desc = propDescZh(p.name, p.desc)
        for (const a of dev.actions.values()) a.desc = actionDescZh(a.name, a.desc)
        this.deviceCache.set(did, dev)
        return dev
    }

    private async buildSharedDevice(did: string): Promise<DeviceHandle> {
        if (!this.deviceIndex.has(did)) await this.refreshDeviceIndex()
        const [model, specType, name] = this.deviceIndex.get(did) ?? ["", "", ""]
        if (model === "") throw new Error(`未找到设备 ${did}`)
        if (specType === "") throw new Error("该设备无公开的功能规格（常见于仅蓝牙连接的产品），无法提供控制面板")
        const spec = await fetchSpecInfo(specType, this.fetchFn).catch(() => {
            throw new Error("该设备无公开的功能规格（常见于仅蓝牙连接的产品），无法提供控制面板")
        })
        applyFallback(spec)
        return deviceFromSpec(did, model, name === "" ? spec.name : name, spec)
    }

    async deviceDetail(did: string): Promise<DeviceDetail> {
        const dev = await this.getDevice(did)
        const props: DeviceDetail["props"] = []
        for (const [key, prop] of dev.props) {
            if (key.includes("_") && dev.props.has(key.replace(/_/g, "-"))) continue
            props.push({
                name: prop.name,
                desc: prop.desc === "" ? prop.name : prop.desc,
                type: prop.propType,
                readable: prop.rw.includes("r"),
                writable: prop.rw.includes("w"),
                range: prop.range,
                value_list:
                    prop.valueList.length > 0 ? prop.valueList.map(e => ({ value: e.value, description: e.description })) : undefined,
                siid: prop.siid,
                piid: prop.piid,
                service: prop.service,
            })
        }
        props.sort((a, b) => (a.name < b.name ? -1 : 1))
        const actions = [...dev.actions.values()]
            .map(a => ({ name: a.name, desc: a.desc === "" ? a.name : a.desc }))
            .sort((a, b) => (a.name < b.name ? -1 : 1))
        const services: DeviceDetail["services"] = dev.services
            .filter(s => props.some(p => p.siid === s.siid) || [...dev.actions.values()].some(a => a.siid === s.siid))
            .map(s => ({
                siid: s.siid,
                name: s.desc_zh !== "" ? s.desc_zh : s.name !== "" ? s.name : s.class,
                class: s.class,
            }))
        for (const p of props) {
            if (p.siid > 0 && !services.some(s => s.siid === p.siid)) {
                services.push({ siid: p.siid, name: p.service, class: "" })
            }
        }
        return { did: dev.did, name: dev.name, model: dev.model, props, actions, services }
    }

    async readProp(did: string, name: string): Promise<Json> {
        return deviceGet(await this.getDevice(did), this.client, name)
    }

    async readProps(did: string, names: string[]): Promise<Map<string, Json | null>> {
        const dev = await this.getDevice(did)
        const queries: Json[] = []
        const keyToName = new Map<string, string>()
        for (const name of names) {
            const prop = dev.props.get(name)
            if (prop?.rw.includes("r") !== true) continue
            queries.push({ did: dev.did, siid: prop.siid, piid: prop.piid })
            keyToName.set(`${prop.siid}:${prop.piid}`, name)
        }
        const result = new Map<string, Json | null>()
        for (const name of keyToName.values()) result.set(name, null)
        for (let i = 0; i < queries.length; i += BATCH_SIZE) {
            const rets = asArray(await this.client.propGet(queries.slice(i, i + BATCH_SIZE)))
            for (const item of rets) {
                const rec = item as JsonRecord
                const name = keyToName.get(`${Number(rec["siid"] ?? -1)}:${Number(rec["piid"] ?? -1)}`)
                if (name !== undefined) result.set(name, Number(rec["code"] ?? -1) === 0 ? ((rec["value"] ?? null) as Json) : null)
            }
        }
        return result
    }

    async writeProp(did: string, name: string, value: Json): Promise<void> {
        await deviceSet(await this.getDevice(did), this.client, name, value)
    }

    async runAction(did: string, name: string, params?: Json): Promise<void> {
        const dev = await this.getDevice(did)
        if (TEXT_ACTIONS.includes(name)) {
            if (params === undefined) {
                if (name === "execute-text-directive" || name === "play-text") throw new Error(`动作 ${name} 需要文本参数`)
                await deviceRunAction(dev, this.client, name)
                return
            }
            let inVal: Json
            if (Array.isArray(params)) {
                const arr = params as Json[]
                inVal = name === "execute-text-directive" && arr.length === 1 ? [...arr, 0] : arr
            } else {
                inVal = name === "execute-text-directive" ? [params, 0] : [params]
            }
            await deviceRunAction(dev, this.client, name, undefined, [["_in", inVal]])
            return
        }
        if (params === undefined) await deviceRunAction(dev, this.client, name)
        else if (Array.isArray(params)) await deviceRunAction(dev, this.client, name, params as Json)
        else await deviceRunAction(dev, this.client, name, [params])
    }

    async powerState(did: string): Promise<boolean | null> {
        return (await this.powerStates([did])).get(did) ?? null
    }

    async togglePower(did: string, current?: boolean): Promise<boolean> {
        const known = current ?? (await this.powerState(did)) ?? null
        if (known === null) throw new Error("设备不支持开关控制或已离线")
        await this.setPowerState(did, !known)
        return !known
    }

    async setPowerState(did: string, state: boolean): Promise<void> {
        const specs = await this.specsFor([did])
        const method = specs.get(did) ? findOnMethod(specs.get(did) as SpecInfo, did) : null
        if (method === null) throw new Error("设备不支持开关控制")
        const target = switchTarget(did)
        const ret = asArray(await this.client.propSet([{ did: target, siid: method[0], piid: method[1], value: state }]))
        for (const item of ret) {
            if (item === null || typeof item !== "object" || Array.isArray(item)) continue
            const rec = item as JsonRecord
            const code = Number(rec["code"] ?? -1)
            if (code === 0 || code === 1) continue
            throw new Error(`设置失败（${String(rec["message"] ?? "未知错误")}，错误码 ${code}）`)
        }
    }

    async powerStates(dids: string[]): Promise<Map<string, boolean | null>> {
        const specs = await this.specsFor(dids)
        const queries: Json[] = []
        const owners: string[] = []
        const methodOf = new Map<string, [number, number]>()
        const targetOf = new Map<string, string>()
        const result = new Map<string, boolean | null>()
        for (const did of dids) {
            const info = specs.get(did) ?? null
            const method = info ? findOnMethod(info, did) : null
            if (method === null) {
                result.set(did, null)
                continue
            }
            methodOf.set(did, method)
            const target = switchTarget(did)
            targetOf.set(did, target)
            queries.push({ did: target, siid: method[0], piid: method[1] })
            owners.push(did)
        }
        for (let i = 0; i < queries.length; i += BATCH_SIZE) {
            const chunk = queries.slice(i, i + BATCH_SIZE)
            const ownerChunk = owners.slice(i, i + BATCH_SIZE)
            const rets = asArray(await this.client.propGet(chunk))
            const byKey = new Map<string, Json>()
            for (const item of rets) {
                const rec = item as JsonRecord
                byKey.set(`${String(rec["did"] ?? "")}:${Number(rec["siid"] ?? -1)}`, item)
            }
            ownerChunk.forEach((owner, idx) => {
                const item = byKey.get(`${targetOf.get(owner)}:${methodOf.get(owner)?.[0]}`) ?? rets[idx] ?? null
                const rec = item as JsonRecord | null
                if (rec !== null && Number(rec["code"] ?? -1) === 0) {
                    result.set(owner, (rec["value"] as boolean) ?? false)
                }
            })
        }
        return result
    }

    async readMetrics(dids: string[]): Promise<Map<string, string | null>> {
        const specs = await this.specsFor(dids)
        const queries: Json[] = []
        const roleOf = new Map<string, [string, string]>()
        const result = new Map<string, string | null>()
        for (const did of dids) {
            const info = specs.get(did) ?? null
            const found = new Map<string, [number, number]>()
            if (info) {
                for (const p of info.properties) {
                    const metric =
                        p.name === "temperature"
                            ? "temperature"
                            : p.name === "relative-humidity" || p.name === "humidity"
                              ? "humidity"
                              : null
                    if (metric !== null && p.rw.includes("r") && !found.has(metric)) found.set(metric, [p.siid, p.piid])
                }
            }
            if (found.size === 0) result.set(did, null)
            for (const [metric, [siid, piid]] of found) {
                queries.push({ did, siid, piid })
                roleOf.set(`${did}:${siid}:${piid}`, [did, metric])
            }
        }
        const temps = new Map<string, number>()
        const hums = new Map<string, number>()
        for (let i = 0; i < queries.length; i += BATCH_SIZE) {
            let rets: Json[]
            try {
                rets = asArray(await this.client.propGet(queries.slice(i, i + BATCH_SIZE)))
            } catch {
                for (const did of dids) if (!result.has(did)) result.set(did, null)
                break
            }
            for (const item of rets) {
                const rec = item as JsonRecord
                const role = roleOf.get(`${String(rec["did"] ?? "")}:${Number(rec["siid"] ?? -1)}:${Number(rec["piid"] ?? -1)}`)
                if (!role || Number(rec["code"] ?? -1) !== 0) continue
                const v = rec["value"]
                const f = typeof v === "number" ? v : null
                if (f === null) continue
                if (role[1] === "temperature") temps.set(role[0], f)
                else hums.set(role[0], f)
            }
        }
        for (const did of dids) {
            if (!result.has(did)) result.set(did, formatMetricsText(temps.get(did), hums.get(did)) ?? null)
        }
        return result
    }

    async readStatusExtras(dids: string[]): Promise<Map<string, StatusExtra>> {
        const specs = await this.specsFor(dids)
        const queries: Json[] = []
        const roles = new Map<string, [string, boolean, EnumOption[]]>()
        const out = new Map<string, StatusExtra>()
        for (const did of dids) {
            const info = specs.get(did) ?? null
            if (!info) continue
            const readable = (name: string): SpecInfo["properties"][number] | undefined =>
                info.properties.find(p => p.name === name && p.rw.includes("r"))
            const position = readable("current-position") ?? readable("target-position")
            const cands: Array<[SpecInfo["properties"][number] | undefined, boolean]> = [
                [readable("air-quality"), true],
                [position, false],
            ]
            for (const [prop, isAir] of cands) {
                if (!prop) continue
                const labels: EnumOption[] = isAir
                    ? (prop.value_list ?? []).map(e => ({
                          value: e.value,
                          description: e.desc_zh_cn !== undefined && e.desc_zh_cn !== "" ? e.desc_zh_cn : e.description,
                      }))
                    : []
                queries.push({ did, siid: prop.siid, piid: prop.piid })
                roles.set(`${did}:${prop.siid}:${prop.piid}`, [did, isAir, labels])
            }
        }
        for (let i = 0; i < queries.length; i += BATCH_SIZE) {
            let rets: Json[]
            try {
                rets = asArray(await this.client.propGet(queries.slice(i, i + BATCH_SIZE)))
            } catch {
                break
            }
            for (const item of rets) {
                const rec = item as JsonRecord
                if (Number(rec["code"] ?? -1) !== 0) continue
                const role = roles.get(`${String(rec["did"] ?? "")}:${Number(rec["siid"] ?? -1)}:${Number(rec["piid"] ?? -1)}`)
                if (!role || !("value" in rec)) continue
                const [did, isAir, labels] = role
                const entry = out.get(did) ?? {}
                if (isAir) {
                    const label = labels.find(e => JSON.stringify(e.value) === JSON.stringify(rec["value"]))
                    if (label) entry.air_quality = label.description
                } else if (typeof rec["value"] === "number" && Number.isInteger(rec["value"])) {
                    entry.position = rec["value"] as number
                }
                out.set(did, entry)
            }
        }
        return out
    }

    private async homeIdsMap(): Promise<Map<string, string>> {
        if (this.homeIds === null) {
            this.homeIds = new Map()
            for (const h of asArray(await this.client.homesList())) {
                this.homeIds.set(entryStr(h, "name"), entryStr(h, "id"))
            }
        }
        return this.homeIds
    }

    async sceneList(homeName?: string): Promise<SceneInfo[]> {
        const ids = await this.homeIdsMap()
        let homeId: string | undefined
        if (homeName !== undefined) {
            const hit = ids.get(homeName)
            if (hit === undefined) return []
            homeId = hit
        }
        const scenes = asArray(await this.client.scenesList(homeId))
        const idToName = new Map([...ids].map(([k, v]) => [v, k]))
        return scenes.map(s => {
            const hid = entryStr(s, "home_id") === "" ? (homeId ?? "") : entryStr(s, "home_id")
            const name = entryStr(s, "name")
            return {
                scene_id: entryStr(s, "scene_id"),
                name: name === "" ? "未命名场景" : name,
                home_id: hid,
                home_name: idToName.get(hid) ?? "",
            }
        })
    }

    async speak(text: string, did?: string, quiet = false): Promise<void> {
        const t = text.trim()
        if (t === "") throw new Error("指令文本不能为空")
        let target = did !== undefined && did !== "" ? did : ""
        if (target === "") {
            const next = (await this.listDevices()).filter(d => d.online && d.model.includes("wifispeaker")).map(d => d.did)[0]
            if (next === undefined) throw new Error("没有在线的小爱音箱")
            target = next
        }
        await this.runAction(target, "execute-text-directive", [t, quiet ? 1 : 0])
    }

    async runScene(scene: SceneInfo): Promise<void> {
        await this.client.runScene(scene.scene_id, scene.home_id)
    }

    async consumables(): Promise<Json[]> {
        const raw = asArray(await this.client.consumables())
        const out: Json[] = []
        for (const item of raw) {
            const rec = item as JsonRecord
            if (rec["is_ignore"] === true) continue
            const detail = (rec["details"] ?? null) as JsonRecord | null
            if (detail === null) continue
            const num = (v: unknown): number | null => {
                if (typeof v === "number") return v
                if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v)
                return null
            }
            const value = num(detail["value"])
            if (value === null) continue
            let threshold: number | undefined
            if (typeof detail["inadeq"] === "string") {
                try {
                    const parsed = JSON.parse(detail["inadeq"]) as JsonRecord
                    const n = num(parsed["val"])
                    if (n !== null) threshold = n
                } catch {
                    // ignore malformed threshold payloads
                }
            }
            out.push({
                did: entryStr(item, "did"),
                name: entryStr(item, "name"),
                model: entryStr(item, "model"),
                description: typeof detail["description"] === "string" ? detail["description"] : "",
                type_name: typeof detail["type_name"] === "string" ? detail["type_name"] : "",
                value,
                threshold: threshold ?? null,
                low: threshold !== undefined ? value < threshold : false,
                updated: typeof detail["update_time"] === "number" ? detail["update_time"] : 0,
            })
        }
        return out
    }

    async iconUrls(models: string[]): Promise<Map<string, string>> {
        const out = new Map<string, string>()
        if (models.length === 0) return out
        for (const m of models) {
            if (!this.iconCache.has(m)) {
                const url = await this.client.iconUrl(m).catch(() => null)
                this.iconCache.set(m, url)
            }
            const hit = this.iconCache.get(m)
            if (hit) out.set(m, hit)
        }
        return out
    }

    devicesWithoutFunctions(dids: string[]): string[] {
        return dids.filter(did => {
            const specs = this.specCache.get(this.deviceIndex.get(did)?.[1] ?? "")
            if (specs === undefined) return false
            return specs === null || specs.properties.length === 0
        })
    }

    isSpeakerDevice(device: DeviceInfo): boolean {
        return isSpeaker(device)
    }

    serviceLabelOf(info: SpecInfo, siid: number): string {
        return serviceLabel(info, siid)
    }
}
