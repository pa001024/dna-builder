export const env = {
    isApp: "__TAURI__" in window || "__TAURI_INTERNALS__" in window,
    // endpoint: import.meta.env.DEV ? "http://localhost:8887" : "https://api.dna-builder.cn",
    endpoint: "https://api.dna-builder.cn",
}
