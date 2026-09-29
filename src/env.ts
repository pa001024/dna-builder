export const env = {
    isApp: typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window),
    endpoint: "https://dna-builder.cn",
    /** 静态资源基址（Cloudflare R2）：图片、数据包、MOD、安装包与差分补丁都从这里取，换存储只需改这一处 */
    cdn: "https://dl.dobapp.cc",
    // apiEndpoint: import.meta.env.DEV ? "http://localhost:8887" : "https://api.dna-builder.cn",
    apiEndpoint: "https://api.dna-builder.cn",
}
