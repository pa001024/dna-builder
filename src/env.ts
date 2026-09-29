export const env = {
    isApp: typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window),
    endpoint: "https://dna-builder.cn",
    /** 静态资源基址之一（阿里云 OSS）：图片、数据包、MOD、安装包与差分补丁都从这里取 */
    cdn: "https://cdn.dna-builder.cn",
    /**
     * 静态资源基址之二（Cloudflare R2）：与 cdn 内容互为冗余，两者都可作为读取源。
     * 启动时会按带宽对两个基址各测一次速，之后整体使用较快的那端（见 `src/utils/cdn.ts`）。
     */
    cdnBackup: "https://cdn.dobapp.cc",
    // apiEndpoint: import.meta.env.DEV ? "http://localhost:8887" : "https://api.dna-builder.cn",
    apiEndpoint: "https://api.dna-builder.cn",
}
