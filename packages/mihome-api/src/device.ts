import { errorMessage, MiHomeError } from "./errors"
import type { Json } from "./models"
import { type FetchFn, type SpecInfo, type SpecProp, serviceLabel } from "./spec"
import { applyFallback } from "./spec_zh"

export type PropTypeName = "bool" | "int" | "uint" | "float" | "string"

export function parsePropType(s: string): PropTypeName {
    if (s === "bool" || s === "int" || s === "uint" || s === "float" || s === "string") return s
    throw MiHomeError.invalidParam(`不支持的类型: ${s}, 可选类型: bool, int, uint, float, string`)
}

export interface DevProp {
    name: string
    desc: string
    propType: PropTypeName
    rw: string
    range?: [number, number, number | null]
    valueList: Array<{ value: Json; description: string }>
    siid: number
    piid: number
    service: string
}

export function devPropFromSpec(p: SpecProp, service: string): DevProp {
    const range =
        p.range !== undefined && p.range.length >= 2
            ? ([p.range[0], p.range[1], p.range.length >= 3 ? p.range[2] : null] as [number, number, number | null])
            : undefined
    return {
        name: p.name,
        desc: p.description,
        propType: parsePropType(p.type),
        rw: p.rw,
        range,
        valueList: (p.value_list ?? []).map(e => ({ value: e.value, description: e.description })),
        siid: p.siid,
        piid: p.piid,
        service,
    }
}

export function isReadable(prop: DevProp): boolean {
    return prop.rw.includes("r")
}

export function isWritable(prop: DevProp): boolean {
    return prop.rw.includes("w")
}

function valuesEqual(a: Json, b: Json): boolean {
    if (typeof a === "number" && typeof b === "number") return a === b
    return a === b
}

function checkRangeStep(prop: DevProp, v: number): void {
    if (prop.range === undefined) return
    const [min, max, step] = prop.range
    if (v < min || v > max) throw MiHomeError.invalidParam(`${v} 超出数值范围, 应该在 [${min}, ${max}] 之间`)
    if (step !== null && step !== 0) {
        const k = (v - min) / step
        if (Math.abs(k - Math.round(k)) > 1e-9) {
            throw MiHomeError.invalidParam(`无效的值: ${v}, 应该在范围 [${min}, ${max}] 内且步长为 ${step}`)
        }
    }
}

export function coercePropValue(prop: DevProp, value: Json): Json {
    const bad = (msg: string): MiHomeError => MiHomeError.invalidParam(msg)
    let coerced: Json
    switch (prop.propType) {
        case "bool": {
            if (typeof value === "boolean") coerced = value
            else if (value === 0 || value === "0" || (typeof value === "string" && value.toLowerCase() === "false")) coerced = false
            else if (value === 1 || value === "1" || (typeof value === "string" && value.toLowerCase() === "true")) coerced = true
            else throw bad(`无效布尔值: ${JSON.stringify(value)}`)
            break
        }
        case "int":
        case "uint": {
            let n: number | null = null
            if (typeof value === "number" && Number.isInteger(value)) n = value
            else if (typeof value === "number") n = Math.trunc(value)
            else if (typeof value === "string" && value.trim() !== "" && Number.isInteger(Number(value))) n = Number(value)
            if (n === null || Number.isNaN(n)) throw bad(`无效整数值: ${JSON.stringify(value)}`)
            if (prop.propType === "uint" && n < 0) throw bad(`无效值: ${n} (uint 不能为负)`)
            checkRangeStep(prop, n)
            coerced = n
            break
        }
        case "float": {
            let f: number | null = null
            if (typeof value === "number") f = value
            else if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) f = Number(value)
            if (f === null || Number.isNaN(f)) throw bad(`无效浮点值: ${JSON.stringify(value)}`)
            checkRangeStep(prop, f)
            coerced = Number.isFinite(f) ? f : null
            break
        }
        case "string": {
            if (typeof value !== "string") throw bad(`无效字符串值: ${JSON.stringify(value)}`)
            coerced = value
            break
        }
    }
    if (prop.valueList.length > 0 && !prop.valueList.some(e => valuesEqual(e.value, coerced))) {
        throw bad(`无效值: ${JSON.stringify(value)}, 请使用 ${JSON.stringify(prop.valueList)}`)
    }
    return coerced
}

export interface DevAction {
    name: string
    desc: string
    siid: number
    aiid: number
}

export interface DeviceHandle {
    did: string
    model: string
    name: string
    props: Map<string, DevProp>
    actions: Map<string, DevAction>
    services: SpecInfo["services"]
}

export function deviceFromSpec(did: string, model: string, name: string, spec: SpecInfo): DeviceHandle {
    const props = new Map<string, DevProp>()
    for (const p of spec.properties) {
        const prop = devPropFromSpec(p, serviceLabel(spec, p.siid))
        props.set(prop.name, prop)
        if (prop.name.includes("-")) props.set(prop.name.replace(/-/g, "_"), prop)
    }
    const actions = new Map<string, DevAction>()
    for (const a of spec.actions) {
        actions.set(a.name, { name: a.name, desc: a.description, siid: a.siid, aiid: a.aiid })
    }
    return { did, model, name, props, actions, services: spec.services }
}

export interface DeviceClient {
    devicesList(homeId?: string): Promise<Json>
    propGetSingle(query: Json): Promise<Json>
    propSetSingle(req: Json): Promise<Json>
    actionSingle(req: Json): Promise<Json>
    specInfo(specType: string): Promise<SpecInfo>
}

export async function openDevice(client: DeviceClient, did?: string, devName?: string): Promise<DeviceHandle> {
    if ((did === undefined || did === "") && (devName === undefined || devName === "")) {
        throw MiHomeError.invalidParam("必须提供 did 或 dev_name 参数之一")
    }
    const devices = client.devicesList()
    const arr = Array.isArray(await devices) ? ((await devices) as Json[]) : []
    const strOf = (d: Json, k: string): string => {
        if (d === null || typeof d !== "object" || Array.isArray(d)) return ""
        const v = (d as Record<string, Json>)[k]
        return typeof v === "string" ? v : ""
    }
    if (did !== undefined && did !== "") {
        const matches = arr.filter(d => strOf(d, "did") === did)
        if (matches.length === 0) throw MiHomeError.deviceNotFound(did)
        if (matches.length > 1) throw MiHomeError.multipleDevicesFound(`找到多个 did 为 '${did}' 的设备`)
        const m = matches[0]
        return openDeviceForEntry(client, strOf(m, "did"), strOf(m, "model"), strOf(m, "name"), m)
    }
    const name = devName ?? ""
    const matches = arr.filter(d => strOf(d, "name") === name)
    if (matches.length === 0) throw MiHomeError.deviceNotFound(name)
    if (matches.length > 1) {
        throw MiHomeError.multipleDevicesFound(`找到多个 dev_name 为 '${name}' 的设备，请使用 did 参数指定具体设备或者修改设备名称以区分`)
    }
    const m = matches[0]
    return openDeviceForEntry(client, strOf(m, "did"), strOf(m, "model"), strOf(m, "name"), m)
}

async function openDeviceForEntry(client: DeviceClient, did: string, model: string, name: string, entry: Json): Promise<DeviceHandle> {
    const specType =
        entry !== null && typeof entry === "object" && !Array.isArray(entry)
            ? String((entry as Record<string, Json>)["spec_type"] ?? "")
            : ""
    const spec = await client.specInfo(specType)
    applyFallback(spec)
    return deviceFromSpec(did, model, name === "" ? spec.name : name, spec)
}

const SLEEP_MS = 500
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

export function propKeys(dev: DeviceHandle): string[] {
    return [...dev.props.keys()].sort()
}

export async function deviceGet(dev: DeviceHandle, client: DeviceClient, name: string): Promise<Json> {
    const prop = dev.props.get(name)
    if (!prop) throw MiHomeError.invalidParam(`不支持的属性: ${name}, 可用属性: ${JSON.stringify(propKeys(dev))}`)
    if (!isReadable(prop)) throw MiHomeError.invalidParam(`属性 ${name} 不可读取`)
    const result = await client.propGetSingle({ did: dev.did, siid: prop.siid, piid: prop.piid })
    const code =
        result !== null && typeof result === "object" && !Array.isArray(result)
            ? Number((result as Record<string, Json>)["code"] ?? -1)
            : -1
    if (code !== 0) throw MiHomeError.deviceGet(dev.name, name, code, errorMessage(code))
    await sleep(SLEEP_MS)
    const v = (result as Record<string, Json>)["value"]
    return (v ?? null) as Json
}

export async function deviceSet(dev: DeviceHandle, client: DeviceClient, name: string, value: Json): Promise<void> {
    const prop = dev.props.get(name)
    if (!prop) throw MiHomeError.invalidParam(`不支持的属性: ${name}, 可用属性: ${JSON.stringify(propKeys(dev))}`)
    if (!isWritable(prop)) throw MiHomeError.invalidParam(`属性 ${name} 不可写入`)
    const coerced = coercePropValue(prop, value)
    const result = await client.propSetSingle({ did: dev.did, siid: prop.siid, piid: prop.piid, value: coerced })
    const item = result !== null && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, Json>) : {}
    const code = Number(item["code"] ?? -1)
    if (code !== 0 && code !== 1) throw MiHomeError.deviceSet(dev.name, name, code, errorMessage(code))
    await sleep(SLEEP_MS)
}

export async function deviceRunAction(
    dev: DeviceHandle,
    client: DeviceClient,
    name: string,
    value?: Json,
    extra: Array<[string, Json]> = []
): Promise<void> {
    const act = dev.actions.get(name)
    if (!act) {
        throw MiHomeError.invalidParam(`不支持的动作: ${name}, 可用动作: ${JSON.stringify([...dev.actions.keys()])}`)
    }
    const req: Record<string, Json> = { did: dev.did, siid: act.siid, aiid: act.aiid }
    if (value !== undefined) req["value"] = value
    for (const [k, v] of extra) {
        const key = k.startsWith("_") ? k.slice(1) : k
        if (["did", "siid", "aiid", "value"].includes(key)) throw MiHomeError.invalidParam(`无效的参数: ${k}`)
        req[key] = v
    }
    const result = await client.actionSingle(req)
    const item = result !== null && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, Json>) : {}
    const code = Number(item["code"] ?? -1)
    if (code !== 0 && code !== 1) throw MiHomeError.deviceAction(dev.name, name, code, errorMessage(code))
    await sleep(SLEEP_MS)
}

export type { FetchFn }
