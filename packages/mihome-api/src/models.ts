export interface DeviceInfo {
    did: string
    name: string
    model: string
    home_name: string
    room_name: string
    online: boolean
    spec_type: string
}

export interface EnumOption {
    value: unknown
    description: string
}

export interface PropInfo {
    name: string
    desc: string
    type: string
    readable: boolean
    writable: boolean
    range?: [number, number, number | null]
    value_list?: EnumOption[]
    siid: number
    piid: number
    service: string
}

export interface ActionInfo {
    name: string
    desc: string
}

export interface ServiceInfo {
    siid: number
    name: string
    class: string
}

export interface DeviceDetail {
    did: string
    name: string
    model: string
    props: PropInfo[]
    actions: ActionInfo[]
    services: ServiceInfo[]
}

export interface StatusExtra {
    air_quality?: string
    position?: number
}

export interface SceneInfo {
    scene_id: string
    name: string
    home_id: string
    home_name: string
}

export interface ConsumableItem {
    did: string
    name: string
    model: string
    description: string
    type_name: string
    value: number
    threshold?: number
    low: boolean
    updated: number
}

export function isSpeaker(device: DeviceInfo): boolean {
    return device.model.includes("wifispeaker")
}

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
export type JsonRecord = { [k: string]: Json }

export function entryStr(e: unknown, key: string): string {
    if (e === null || typeof e !== "object") return ""
    const v = (e as Record<string, unknown>)[key]
    if (typeof v === "string") return v
    if (typeof v === "number") return String(v)
    return ""
}

export function asArray(v: unknown): Json[] {
    return Array.isArray(v) ? (v as Json[]) : []
}

export function toSceneInfo(entry: unknown, homeId: string, homeName: string): SceneInfo {
    const name = entryStr(entry, "name")
    return {
        scene_id: entryStr(entry, "scene_id"),
        name: name === "" ? "未命名场景" : name,
        home_id: entryStr(entry, "home_id") === "" ? homeId : entryStr(entry, "home_id"),
        home_name: homeName,
    }
}

export function toDeviceInfo(entry: unknown, homeName: string, roomName: string): DeviceInfo {
    const did = entryStr(entry, "did")
    const name = entryStr(entry, "name")
    const e = entry as Record<string, unknown>
    return {
        did,
        name: name === "" ? did : name,
        model: entryStr(entry, "model"),
        home_name: homeName,
        room_name: roomName,
        online: e["isOnline"] === true,
        spec_type: entryStr(entry, "spec_type"),
    }
}
