import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"

export async function openSChat(path: string) {
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
        title: "Chat",
    })
    win.once("initialized", () => {
        // win.
        console.log("win initialized")
    })
}
