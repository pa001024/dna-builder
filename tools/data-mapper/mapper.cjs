"use strict"

// tsc-rs-data-mapper: a tsc-rs content-mapper child process that serves
// cached declaration text (.d.ts) for data files, so the Rust compiler
// never parses the megabytes of data literals.
//
// Transport: JSON-RPC 2.0 with LSP Content-Length framing over stdio.
// The host spawns `node mapper.cjs` with cwd set to this package directory
// and speaks initialize / openProject / transform / closeProject.
//
// Which declaration file backs each source file comes from a manifest written
// by the lint driver next to the tsconfig the host opened
// (`<configDir>/data-decls.json`: absolute source path -> absolute decl path).
// A source file missing from the manifest (declaration generation failed)
// falls back to its real content with an identity span map, so diagnostics
// keep their true positions instead of being hidden as virtual-only.

const fs = require("node:fs")
const path = require("node:path")

const VERBATIM = 0
const projects = new Map()

function canonicalKey(fileName) {
    return process.platform === "win32" ? fileName.toLowerCase() : fileName
}

function loadManifest(configFileName) {
    const manifestPath = path.join(path.dirname(configFileName), "data-decls.json")
    try {
        const raw = fs.readFileSync(manifestPath, "utf8")
        const parsed = JSON.parse(raw)
        const entries = new Map()
        if (parsed && typeof parsed === "object") {
            for (const [source, decl] of Object.entries(parsed)) {
                if (typeof source === "string" && typeof decl === "string") {
                    entries.set(canonicalKey(source), decl)
                }
            }
        }
        return entries
    } catch {
        return new Map()
    }
}

function identityTuples(text) {
    return text.length === 0 ? [] : [[0, text.length, 0, text.length, VERBATIM]]
}

const handlers = {
    initialize(params) {
        const offered = params && Array.isArray(params.positionEncodings) ? params.positionEncodings : []
        const encoding = offered.includes("utf-16") ? "utf-16" : offered.includes("utf-8") ? "utf-8" : "utf-16"
        return { positionEncoding: encoding, diagnosticSource: "datadecl" }
    },
    openProject(params) {
        projects.set(params.projectHandle, { manifest: loadManifest(params.configFileName || "") })
        return {}
    },
    transform(params) {
        const state = projects.get(params.projectHandle)
        const declPath = state?.manifest.get(canonicalKey(params.fileName))
        if (declPath) {
            try {
                const text = fs.readFileSync(declPath, "utf8")
                return { text, extension: ".ts", mappings: [] }
            } catch {}
        }
        const text = params.content
        return { text, extension: ".ts", mappings: identityTuples(text) }
    },
    closeProject(params) {
        projects.delete(params.projectHandle)
        return null
    },
}

function writeMessage(obj) {
    const data = Buffer.from(JSON.stringify(obj), "utf8")
    process.stdout.write(`Content-Length: ${data.length}\r\n\r\n`)
    process.stdout.write(data)
}

let buffer = Buffer.alloc(0)

function tryParse() {
    while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n")
        if (headerEnd < 0) {
            return
        }
        const header = buffer.subarray(0, headerEnd).toString("ascii")
        const match = /Content-Length:\s*(\d+)/i.exec(header)
        if (!match) {
            console.error("[tsc-rs-data-mapper] missing Content-Length header, exiting")
            process.exit(1)
        }
        const length = Number(match[1])
        const total = headerEnd + 4 + length
        if (buffer.length < total) {
            return
        }
        const body = buffer.subarray(headerEnd + 4, total).toString("utf8")
        buffer = buffer.subarray(total)
        handleMessage(body)
    }
}

function handleMessage(body) {
    let msg
    try {
        msg = JSON.parse(body)
    } catch {
        return
    }
    if (msg.jsonrpc !== "2.0" || msg.id === undefined || msg.id === null) {
        return
    }
    const fn = handlers[msg.method]
    if (!fn) {
        writeMessage({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } })
        return
    }
    Promise.resolve()
        .then(() => fn(msg.params || {}))
        .then(
            result => writeMessage({ jsonrpc: "2.0", id: msg.id, result: result === undefined ? null : result }),
            err => writeMessage({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(err?.message || err) } })
        )
}

process.stdin.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk])
    tryParse()
})
process.stdin.on("end", () => process.exit(0))
process.stdin.on("close", () => process.exit(0))
process.stdin.resume()
