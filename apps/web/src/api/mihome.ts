import { invoke } from "@tauri-apps/api/core"
import { env } from "@/env"

/**
 * 米家联动的 Tauri 命令封装（后端见 `src-tauri/src/commands/mihome.rs`）。
 *
 * 云协议是内嵌的 `mihome-api`（`crates/mihome-api`），扫码登录态落在
 * `<app_data>/mihome/auth.json`，不再依赖外部服务进程。
 * 因此本模块仅桌面端可用，浏览器里直接抛错，调用方负责前置判断。
 */

/** 手动场景（对应 mihome-api 的 `SceneInfo`，即米家 APP → 智能 → 手动控制）。 */
export interface MiHomeScene {
    scene_id: string
    name: string
    home_id: string
    home_name: string
}

/** 扫码登录的待扫数据（`login_url` 前端自行渲染二维码）。 */
export interface MiHomeQrBegin {
    /** 本地 token 仍有效，无需扫码。 */
    already: boolean
    login_url: string
    /** 长轮询地址，原样回传给 `mihomeQrWait`。 */
    lp: string
}

/**
 * 桌面端断言：非桌面端禁止调用。
 */
function assertApp() {
    if (!env.isApp) throw new Error("仅桌面端可用")
}

/**
 * 读取登录状态（token 有效会自动刷新）。
 * @returns 是否已登录
 */
export async function mihomeStatus() {
    assertApp()
    return await invoke<{ logged_in: boolean }>("mihome_status")
}

/**
 * 开始扫码登录：token 有效直接返回 `already`，否则返回待扫的 `login_url`。
 * @returns 待扫数据
 */
export async function mihomeQrBegin() {
    assertApp()
    return await invoke<MiHomeQrBegin>("mihome_qr_begin")
}

/**
 * 等待扫码结果（最长阻塞约 2 分钟，超时/失败直接抛错）。
 * @param payload `mihomeQrBegin` 回传的两个串
 */
export async function mihomeQrWait(payload: { login_url: string; lp: string }) {
    assertApp()
    await invoke("mihome_qr_wait", { payload })
}

/**
 * 退出登录：删掉本地登录态文件。
 */
export async function mihomeLogout() {
    assertApp()
    await invoke("mihome_logout")
}

/**
 * 手动场景列表。
 * @returns 场景列表
 */
export async function mihomeListScenes() {
    assertApp()
    return await invoke<MiHomeScene[]>("mihome_scenes")
}

/**
 * 执行一个手动场景。
 * @param scene 目标场景
 */
export async function mihomeRunScene(scene: Pick<MiHomeScene, "scene_id" | "home_id">) {
    assertApp()
    await invoke("mihome_run_scene", { sceneId: scene.scene_id, homeId: scene.home_id })
}
