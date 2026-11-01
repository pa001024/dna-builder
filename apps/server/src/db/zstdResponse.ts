export const ZSTD_THRESHOLD_BYTES = 4 * 1024

export function clientAcceptsZstd(request: Request): boolean {
    const header = request.headers.get("accept-encoding")
    if (!header) return false
    let wildcardQ: number | null = null
    let explicitDeny = false
    let explicitAllow = false
    for (const part of header.split(",")) {
        const segments = part
            .trim()
            .toLowerCase()
            .split(";")
            .map(s => s.trim())
        const encoding = segments[0]
        let q = 1
        for (const param of segments.slice(1)) {
            if (param.startsWith("q=")) {
                const parsed = Number.parseFloat(param.slice(2))
                if (!Number.isNaN(parsed)) q = parsed
            }
        }
        if (encoding === "zstd") {
            if (q === 0) explicitDeny = true
            else explicitAllow = true
        } else if (encoding === "*" || encoding === "zstd*") {
            wildcardQ = q
        }
    }
    if (explicitDeny) return false
    if (explicitAllow) return true
    return wildcardQ !== null && wildcardQ > 0
}

export async function maybeCompressGraphqlResponse(request: Request, response: Response): Promise<Response> {
    if (request.method === "HEAD") return response
    if (response.status === 204 || response.status === 304) return response
    if (response.headers.get("content-encoding")) return response
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("json")) return response
    if (!clientAcceptsZstd(request)) return response
    if (response.body === null) return response

    const raw = Buffer.from(await response.arrayBuffer())
    if (raw.length <= ZSTD_THRESHOLD_BYTES) {
        return new Response(raw, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        })
    }

    const compressed = await Bun.zstdCompress(raw)
    const headers = new Headers(response.headers)
    headers.set("content-encoding", "zstd")
    headers.set("content-length", String(compressed.length))
    const vary = headers.get("vary")
    if (!vary) headers.set("vary", "Accept-Encoding")
    else if (
        !vary
            .toLowerCase()
            .split(",")
            .map(v => v.trim())
            .includes("accept-encoding")
    )
        headers.set("vary", `${vary}, Accept-Encoding`)
    return new Response(compressed, {
        status: response.status,
        statusText: response.statusText,
        headers,
    })
}
