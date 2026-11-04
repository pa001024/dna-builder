#!/usr/bin/env bun

/**
 * 本地更新服务器：托管 update-pack 生成的 feed 与 zip，支持 Range 以便验证断点续传。
 *
 *   bun tools/update-server.ts [dir] [port]
 *
 * 默认目录 `.tmp/update-server`、端口 8791。
 * 客户端联调时把更新源指向本地：
 *   DNA_BUILDER_UPDATE_FEED=http://127.0.0.1:8791/latest.json <app.exe> --update-cli --install
 */

import path from "node:path"

function main(): void {
    const dir = path.resolve(process.argv[2] ?? ".tmp/update-server")
    const port = Number(process.argv[3] ?? 8791)

    const server = Bun.serve({
        port,
        fetch(request) {
            const url = new URL(request.url)
            if (url.pathname === "/") {
                return new Response(`DNA Builder update server\n目录: ${dir}\nfeed: http://127.0.0.1:${port}/latest.json\n`)
            }

            const filePath = path.resolve(dir, `.${decodeURIComponent(url.pathname)}`)
            if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
                return new Response("forbidden", { status: 403 })
            }

            const file = Bun.file(filePath)
            const range = request.headers.get("range")
            console.log(`${request.method} ${url.pathname}${range ? ` (${range})` : ""}`)

            return serveFile(file, range)
        },
    })

    console.log(`🧪 本地更新服务器: http://127.0.0.1:${server.port}/latest.json`)
    console.log(`   目录: ${dir}`)
}

/**
 * 返回文件内容，按需处理单段 Range 请求。
 * @param file Bun 文件对象
 * @param range Range 请求头
 */
async function serveFile(file: ReturnType<typeof Bun.file>, range: string | null): Promise<Response> {
    if (!(await file.exists())) {
        return new Response("not found", { status: 404 })
    }
    const size = file.size
    if (!range) {
        return new Response(file, {
            headers: { "content-length": String(size), "accept-ranges": "bytes", "cache-control": "no-store" },
        })
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!match) {
        return new Response("invalid range", { status: 416, headers: { "content-range": `bytes */${size}` } })
    }
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } })
    }

    return new Response(file.slice(start, end + 1), {
        status: 206,
        headers: {
            "content-range": `bytes ${start}-${end}/${size}`,
            "content-length": String(end - start + 1),
            "accept-ranges": "bytes",
            "cache-control": "no-store",
        },
    })
}

if (import.meta.main) {
    main()
}
