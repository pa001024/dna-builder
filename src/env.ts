export const env = {
    isApp: "__TAURI__" in window || "__TAURI_INTERNALS__" in window,
    isTauri: "__TAURI__" in window || "__TAURI_INTERNALS__" in window,
    endpoint: "https://xn--chq26veyq.icu",
    // endpoint: "http://localhost:8887",
    // 平台检测
    get isWindows(): boolean {
        return navigator.platform.toLowerCase().includes("win")
    },
    get isMac(): boolean {
        return navigator.platform.toLowerCase().includes("mac")
    },
    get isLinux(): boolean {
        return navigator.platform.toLowerCase().includes("linux")
    },
}
