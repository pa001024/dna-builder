import type { TokenStore } from "./auth"
import { MiHomeClient as Client, type QrBeginResult } from "./client"
import type { FetchFn } from "./spec"

export interface MiHomeScene {
    scene_id: string
    name: string
    home_id: string
    home_name: string
}

export class MiHomeClient extends Client {
    constructor(store: TokenStore, fetchFn?: FetchFn) {
        super(store, fetchFn)
    }

    override async qrBegin(): Promise<QrBeginResult> {
        return super.qrBegin()
    }

    override async qrWait(login_url: string, lp: string): Promise<void> {
        return super.qrWait(login_url, lp)
    }

    override async logout(): Promise<void> {
        return super.logout()
    }

    override async listScenes(): Promise<MiHomeScene[]> {
        return super.listScenes()
    }

    override async runScene(scene_id: string, home_id: string): Promise<void> {
        return super.runScene(scene_id, home_id)
    }
}

export { AuthStore, InMemoryTokenStore, type TokenStore } from "./auth"
export { MiHomeClient as MiHomeClientBase } from "./client"
export {
    coercePropValue,
    type DevAction,
    type DeviceHandle,
    type DevProp,
    deviceFromSpec,
    deviceGet,
    deviceRunAction,
    deviceSet,
    openDevice,
    parsePropType,
} from "./device"
export { errorMessage, MiHomeError } from "./errors"
export {
    type ActionInfo,
    asArray,
    type ConsumableItem,
    type DeviceDetail,
    type DeviceInfo,
    entryStr,
    isSpeaker,
    type Json,
    type PropInfo,
    type SceneInfo,
    type ServiceInfo,
    type StatusExtra,
    toDeviceInfo,
    toSceneInfo,
} from "./models"
export { formatMetricsText, isSubDevice, MiHomeService } from "./service"
export {
    type FetchFn,
    fetchSpecInfo,
    parseSpecInstance,
    type SpecAction,
    type SpecInfo,
    type SpecProp,
    type SpecService,
    serviceLabel,
} from "./spec"
export { actionDescZh, actionZh, applyFallback, propDescZh, propertyZh, serviceZh } from "./spec_zh"
