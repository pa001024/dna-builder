import { invoke } from "@tauri-apps/api/core"
import { env } from "../env"
import { DNAAPI } from "dna-api"

export const MATERIALS = ["None", "Blur", "Acrylic", "Mica", "Mica_Dark", "Mica_Tabbed", "Mica_Tabbed_Dark"] as const
export async function applyMaterial(material: (typeof MATERIALS)[number]) {
    return (await invoke("apply_material", { material })) as string
}

export async function getOSVersion() {
    return await invoke<string>("get_os_version")
}

export async function getGameInstall() {
    return await invoke<string>("get_game_install")
}

export async function isGameRunning(isRun: boolean) {
    return await invoke<string>("is_game_running", { isRun })
}

export async function launchExe(path: string, params: string) {
    return await invoke<string>("launch_exe", { path, params })
}

export async function openExplorer(dir: string) {
    return await invoke<string>("launch_exe", { path: "explorer.exe", params: dir })
}

export async function importMod(gamebase: string, paths: string[]) {
    const data = await invoke<string>("import_mod", { gamebase, paths })
    return JSON.parse(data) as [string, number][]
}

export async function enableMod(srcdir: string, dstdir: string, files: string[]) {
    return await invoke<string>("enable_mod", { srcdir, dstdir, files })
}

export async function importPic(path: string) {
    return await invoke<string>("import_pic", { path })
}

class TauriResponse {
    readonly status: number
    readonly statusText: string
    readonly headers: Headers
    readonly ok: boolean
    readonly redirected: boolean
    readonly type: ResponseType
    readonly url: string
    readonly body: ReadableStream | null = null
    readonly bodyUsed: boolean = false
    private bodyText: string

    constructor(status: number, body: string) {
        this.status = status
        this.statusText = status >= 200 && status < 300 ? "OK" : "Error"
        this.headers = new Headers()
        this.ok = status >= 200 && status < 300
        this.redirected = false
        this.type = "basic"
        this.url = ""
        this.bodyText = body
    }

    async json(): Promise<any> {
        return JSON.parse(this.bodyText)
    }

    async text(): Promise<string> {
        return this.bodyText
    }

    async blob(): Promise<Blob> {
        throw new Error("blob() not implemented")
    }

    async formData(): Promise<FormData> {
        throw new Error("formData() not implemented")
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        const encoder = new TextEncoder()
        return encoder.encode(this.bodyText).buffer
    }

    async bytes(): Promise<Uint8Array<ArrayBuffer>> {
        const encoder = new TextEncoder()
        return encoder.encode(this.bodyText)
    }

    clone(): TauriResponse {
        return new TauriResponse(this.status, this.bodyText)
    }
}

export async function tauriFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
    if (!env.isApp) return await serverFetch(url, options)
    const method = options?.method ?? "GET"

    let body: string | undefined
    let multipart: [string, string | { filename: string; data: number[]; mime?: string }][] | undefined

    if (options?.body instanceof FormData) {
        multipart = []
        for (const [key, value] of options.body.entries()) {
            if (value instanceof File) {
                const arrayBuffer = await value.arrayBuffer()
                const data = Array.from(new Uint8Array(arrayBuffer))
                multipart.push([
                    key,
                    {
                        filename: value.name,
                        data,
                        mime: value.type || undefined,
                    },
                ])
            } else {
                multipart.push([key, value as string])
            }
        }
    } else {
        body = typeof options?.body === "string" ? options.body : options?.body?.toString()
    }

    const headers = options?.headers ? Object.entries(options.headers as Record<string, string>) : undefined
    const result = await invoke<string>("fetch", { url: url.toString(), method, body, headers, multipart })
    const parsed = JSON.parse(result) as { status: number; body: string }
    return new TauriResponse(parsed.status, parsed.body)
}

export async function serverFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
    if (options?.body instanceof FormData) {
        const formData = new FormData()
        formData.append("url", url.toString())
        if (options.method) formData.append("method", options.method)

        if (options.headers) {
            const headersData = JSON.stringify(Object.entries(options.headers as Record<string, string>))
            formData.append("headers", headersData)
        }

        for (const [key, value] of options.body.entries()) {
            formData.append(`body_${key}`, value)
        }

        return await fetch(env.endpoint + "/api/fetch", {
            method: "POST",
            body: formData,
        })
    } else {
        const body = JSON.stringify({
            url: url.toString(),
            ...options,
            body: typeof options?.body === "string" ? options.body : options?.body?.toString(),
        })
        return await fetch(env.endpoint + "/api/fetch", {
            method: "POST",
            body,
            headers: {
                "Content-Type": "application/json",
            },
        })
    }
}

export const getMapAPI = () => {
    return new DNAAPI("", "", { fetchFn: tauriFetch, is_h5: true })
}
