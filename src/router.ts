import { RouteRecordRaw, createWebHashHistory, createRouter, createWebHistory } from "vue-router"

import Home from "./views/Home.vue"
import Setting from "./views/Setting.vue"
import SmallGame from "./views/SmallGame.vue"
import CharBuildView from "./views/CharBuildView.vue"
import InventoryEdit from "./views/InventoryEdit.vue"
import { env } from "./env"
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window"

let setMinSize = async (_w: number, _h: number) => {}

;(async () => {
    if (!env.isApp) return
    setMinSize = async (w: number, h: number) => {
        const win = getCurrentWindow()
        win.setMinSize(new LogicalSize(w, h))
        const size = await win.innerSize()
        const factor = await win.scaleFactor()
        const logicalSize = size.toLogical(factor)
        win.setSize(new LogicalSize(Math.max(w, logicalSize.width), Math.max(h, logicalSize.height)))
    }
})()

const routes: readonly RouteRecordRaw[] = [
    { name: "home", path: "/", component: Home, beforeEnter: () => setMinSize(367, 430) },
    // { name: "user", path: "/user", component: User, beforeEnter: () => setMinSize(367, 430) },
    { name: "setting", path: "/setting", component: Setting, beforeEnter: () => setMinSize(540, 430) },
    { name: "char-build", path: "/char-build", component: CharBuildView, beforeEnter: () => setMinSize(600, 600) },
    { name: "game", path: "/game", component: SmallGame, beforeEnter: () => setMinSize(600, 600) },
    { name: "inventory", path: "/inventory", component: InventoryEdit, beforeEnter: () => setMinSize(600, 600) },
]

export const router = createRouter({
    // edgeone.dev 域名下使用 history 模式，其他域名下使用 hash 模式
    history:
        location.host.endsWith("edgeone.dev") || location.host.endsWith("xn--chq26veyq.icu") ? createWebHistory() : createWebHashHistory(),
    routes,
})
