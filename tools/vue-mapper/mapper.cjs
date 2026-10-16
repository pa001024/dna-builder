"use strict"

// tsc-rs-vue-mapper: a tsc-rs content-mapper child process that turns Vue
// SFCs (.vue) into virtual TypeScript for the Rust compiler.
//
// Transport: JSON-RPC 2.0 with LSP Content-Length framing over stdio.
// The host spawns `node mapper.cjs` with cwd set to this package directory
// and speaks initialize / openProject / transform / closeProject.
//
// Positions use the negotiated encoding; we select utf-16, which matches
// the string offsets @vue/language-core reports.

const { transformFile, createProjectState } = require("./transform.cjs")

let ts
let bundledCore
try {
    ts = require("typescript")
} catch {
    console.error(`[tsc-rs-vue-mapper] requires a "typescript" dependency in ${__dirname}`)
    process.exit(1)
}
try {
    bundledCore = require("@vue/language-core")
} catch {
    console.error(`[tsc-rs-vue-mapper] requires an "@vue/language-core" dependency in ${__dirname}`)
    process.exit(1)
}

const projects = new Map()

function dirnameOf(fileName) {
    const idx = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"))
    return idx < 0 ? process.cwd() : fileName.slice(0, idx) || "/"
}

function resolveCore(configFileName) {
    if (process.env.VUE_MAPPER_PROJECT_CORE && configFileName) {
        try {
            const resolved = require.resolve("@vue/language-core", { paths: [dirnameOf(configFileName)] })
            if (resolved) {
                return require(resolved)
            }
        } catch {}
    }
    return bundledCore
}

function resolveVueOptions(core, configFileName, entryOptions) {
    let fileOptions
    try {
        fileOptions = configFileName
            ? core.createParsedCommandLine(ts, ts.sys, configFileName).vueOptions
            : core.createParsedCommandLineByJson(ts, ts.sys, process.cwd(), {}).vueOptions
    } catch {
        fileOptions = undefined
    }
    return { ...(fileOptions || {}), ...(entryOptions || {}) }
}

function toCompilerOptions(raw) {
    if (!raw || typeof raw !== "object") {
        return {}
    }
    return raw
}

const handlers = {
    initialize(params) {
        const offered = params && Array.isArray(params.positionEncodings) ? params.positionEncodings : []
        const encoding = offered.includes("utf-16") ? "utf-16" : offered.includes("utf-8") ? "utf-8" : "utf-16"
        return { positionEncoding: encoding, diagnosticSource: "vue" }
    },
    openProject(params) {
        const handle = params.projectHandle
        const core = resolveCore(params.configFileName)
        const vueOptions = resolveVueOptions(core, params.configFileName, params.options)
        const compilerOptions = toCompilerOptions(params.compilerOptions)
        projects.set(handle, createProjectState(ts, core, compilerOptions, vueOptions))
        return {}
    },
    transform(params) {
        const state = projects.get(params.projectHandle)
        if (!state) {
            throw new Error(`unknown projectHandle ${params.projectHandle}`)
        }
        const out = transformFile(state, params.fileName, params.content)
        return { text: out.text, extension: out.extension, mappings: out.mappings }
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
            console.error("[tsc-rs-vue-mapper] missing Content-Length header, exiting")
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
