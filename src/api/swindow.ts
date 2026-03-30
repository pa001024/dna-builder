import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"

/**
 * 打开聊天独立窗口。
 * @param path 聊天页面路由
 */
export async function openSChat(path: string, title = "DOB") {
    const app = getCurrentWindow()
    const pos = await app.outerPosition()
    const size = await app.innerSize()

    const win = new WebviewWindow("si", {
        url: `${location.origin}/#${path}`,
        x: pos.x + 20,
        y: pos.y + 20,
        minWidth: 447,
        minHeight: 392,
        width: size.width,
        height: size.height,
        decorations: false,
        transparent: true,
        title,
    })
    win.once("initialized", () => {
        // win.
        console.log("win initialized")
    })
}
