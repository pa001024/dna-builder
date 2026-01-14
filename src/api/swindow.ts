import { getCurrentWindow } from "@tauri-apps/api/window"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"

export async function openSChat(path: string) {
    const app = getCurrentWindow()
    const pos = await app.outerPosition()
    const size = await app.innerSize()

    const win = new WebviewWindow("si", {
        url: location.origin + "/#" + path,
        x: pos.x,
        y: pos.y,
        minWidth: 447,
        minHeight: 392,
        width: size.width,
        height: size.height,
        decorations: false,
        transparent: true,
        title: "Chat",
    })
    win.once("initialized", () => {
        // win.
        console.log("win initialized")
    })
}
