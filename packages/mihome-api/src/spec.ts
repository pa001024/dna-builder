import { MiHomeError } from "./errors"
import type { Json } from "./models"

export const SPEC_CACHE_VERSION = 2
export const SERVICES_VERSION = 1
const SPEC_INSTANCE_URL = "https://miot-spec.org/miot-spec-v2/instance"

export interface EnumItem {
    value: Json
    description: string
    desc_zh_cn?: string
}

export interface SpecProp {
    name: string
    description: string
    type: string
    rw: string
    range?: number[]
    value_list?: EnumItem[]
    siid: number
    piid: number
}

export interface SpecAction {
    name: string
    description: string
    siid: number
    aiid: number
}

export interface SpecService {
    siid: number
    class: string
    name: string
    desc_zh: string
}

export interface SpecInfo {
    version: number
    name: string
    spec_type: string
    properties: SpecProp[]
    actions: SpecAction[]
    services: SpecService[]
    services_v: number
}

export function serviceLabel(info: SpecInfo, siid: number): string {
    const s = info.services.find(x => x.siid === siid)
    if (!s) return ""
    if (s.desc_zh !== "") return s.desc_zh
    if (s.name !== "") return s.name
    return s.class
}

function strOf(doc: unknown, key: string): string {
    if (doc === null || typeof doc !== "object") return ""
    const v = (doc as Record<string, unknown>)[key]
    return typeof v === "string" ? v : ""
}

function arrOf(doc: unknown, key: string): Json[] {
    if (doc === null || typeof doc !== "object") return []
    const v = (doc as Record<string, unknown>)[key]
    return Array.isArray(v) ? (v as Json[]) : []
}

function urnPart(urn: string, idx: number): string {
    return urn.split(":")[idx] ?? ""
}

function joinDesc(desc: string, comment: string): string {
    return comment === "" ? desc : `${desc} / ${comment}`
}

export function parseSpecInstance(specType: string, doc: unknown): SpecInfo {
    if (specType === "") throw MiHomeError.missingSpecType()
    const description = strOf(doc, "description")
    const services = arrOf(doc, "services")
    if (description === "" || services.length === 0) throw MiHomeError.getDeviceInfo(specType)
    const info: SpecInfo = {
        version: SPEC_CACHE_VERSION,
        name: description,
        spec_type: specType,
        properties: [],
        actions: [],
        services: [],
        services_v: SERVICES_VERSION,
    }
    for (const svc of services) {
        const svcType = strOf(svc, "type")
        if (urnPart(svcType, 3) === "device-information") continue
        const siid = typeof (svc as Record<string, unknown>)["iid"] === "number" ? ((svc as Record<string, unknown>)["iid"] as number) : 0
        info.services.push({
            siid,
            class: urnPart(svcType, 3),
            name: strOf(svc, "description"),
            desc_zh: strOf(svc, "comment"),
        })
        for (const prop of arrOf(svc, "properties")) {
            const p = prop as Record<string, unknown>
            const piid = typeof p["iid"] === "number" ? (p["iid"] as number) : 0
            const format = typeof p["format"] === "string" ? (p["format"] as string) : "string"
            const type = format.startsWith("int") ? "int" : format.startsWith("uint") ? "uint" : format
            const access = arrOf(prop, "access").filter((v): v is string => typeof v === "string")
            const rw = `${access.includes("read") ? "r" : ""}${access.includes("write") ? "w" : ""}`
            const rangeArr = arrOf(prop, "value-range").filter((v): v is number => typeof v === "number")
            const valueList = arrOf(prop, "value-list").map(e => {
                const item = e as Record<string, unknown>
                const comment = typeof item["comment"] === "string" ? (item["comment"] as string) : undefined
                return {
                    value: (item["value"] ?? null) as Json,
                    description: typeof item["description"] === "string" ? (item["description"] as string) : "",
                    desc_zh_cn: comment,
                }
            })
            info.properties.push({
                name: urnPart(strOf(prop, "type"), 3),
                description: joinDesc(strOf(prop, "description"), strOf(prop, "comment")),
                type,
                rw,
                range: rangeArr.length > 0 ? rangeArr : undefined,
                value_list: valueList.length > 0 ? valueList : undefined,
                siid,
                piid,
            })
        }
        for (const act of arrOf(svc, "actions")) {
            const a = act as Record<string, unknown>
            info.actions.push({
                name: urnPart(strOf(act, "type"), 3),
                description: joinDesc(strOf(act, "description"), strOf(act, "comment")),
                siid,
                aiid: typeof a["iid"] === "number" ? (a["iid"] as number) : 0,
            })
        }
    }
    deduplicatePropNames(info.properties)
    deduplicateActionNames(info.actions)
    return info
}

function deduplicatePropNames(props: SpecProp[]): void {
    for (const pass of ["siid", "piid"] as const) {
        const counts = new Map<string, number>()
        for (const p of props) counts.set(p.name, (counts.get(p.name) ?? 0) + 1)
        for (const p of props) {
            if ((counts.get(p.name) ?? 0) > 1) p.name = `${p.name}-${pass === "siid" ? p.siid : p.piid}`
        }
    }
}

function deduplicateActionNames(actions: SpecAction[]): void {
    for (const pass of ["siid", "aiid"] as const) {
        const counts = new Map<string, number>()
        for (const a of actions) counts.set(a.name, (counts.get(a.name) ?? 0) + 1)
        for (const a of actions) {
            if ((counts.get(a.name) ?? 0) > 1) a.name = `${a.name}-${pass === "siid" ? a.siid : a.aiid}`
        }
    }
}

export type FetchFn = typeof fetch

export async function fetchSpecInfo(specType: string, fetchFn: FetchFn = fetch, cache?: Map<string, SpecInfo>): Promise<SpecInfo> {
    if (specType === "") throw MiHomeError.missingSpecType()
    const hit = cache?.get(specType)
    if (hit) return hit
    let resp: Response
    try {
        resp = await fetchFn(`${SPEC_INSTANCE_URL}?type=${encodeURIComponent(specType)}`, {
            headers: { "User-Agent": "mijiaAPI/5.0.0" },
        })
    } catch (e) {
        throw MiHomeError.http(e instanceof Error ? e.message : String(e))
    }
    if (!resp.ok) throw MiHomeError.getDeviceInfo(specType)
    let doc: unknown
    try {
        doc = await resp.json()
    } catch (e) {
        throw MiHomeError.json(e instanceof Error ? e.message : String(e))
    }
    const info = parseSpecInstance(specType, doc)
    cache?.set(specType, info)
    return info
}
