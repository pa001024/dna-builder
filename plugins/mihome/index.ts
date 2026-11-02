import { type ActionDef, getRuntime, type PluginAccount } from "@dob/host"
import { MiHomeClient } from "@pa001024/mihome-api"
import { getMihomeStore } from "./fileStore"

/**
 * 插件内聚客户端：登录态走文件存储，网络走调用方注入的 fetch。
 */
async function pluginClient(fetchFn?: typeof fetch): Promise<MiHomeClient> {
    const store = getMihomeStore()
    await store.ready
    return new MiHomeClient(store, fetchFn ?? getRuntime().fetch)
}

/** 米家账号能力（登录 / 场景），由设置界面调用。 */
export const account: PluginAccount = {
    async status(fetchFn) {
        return (await pluginClient(fetchFn)).status()
    },
    async qrBegin(fetchFn) {
        return (await pluginClient(fetchFn)).qrBegin()
    },
    async qrWait(fetchFn, loginUrl, lp) {
        return (await pluginClient(fetchFn)).qrWait(loginUrl, lp)
    },
    async logout(fetchFn) {
        return (await pluginClient(fetchFn)).logout()
    },
    async listScenes(fetchFn) {
        return (await pluginClient(fetchFn)).listScenes()
    },
}

const action: ActionDef = {
    id: "mihome.run-scene",
    title: "执行米家场景",
    fields: [
        { key: "scene_id", label: "场景", type: "text", required: true },
        { key: "home_id", label: "家庭", type: "text", required: true },
    ],
    execute: async (config, ctx) => {
        const sceneId = String(config.scene_id ?? "")
        const homeId = String(config.home_id ?? "")
        if (sceneId === "" || homeId === "") return { ok: false, message: "缺少 scene_id/home_id" }
        try {
            await (await pluginClient(ctx.runtime.fetch)).runScene(sceneId, homeId)
            return { ok: true }
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
    },
}

export default action
