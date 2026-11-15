import { execFileSync } from "node:child_process"
import { copyFile, mkdir, rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const release = resolve(root, "crates/dob-calc-core/target/wasm32-unknown-unknown/release")
const source = resolve(release, "dob_calc_core.wasm")
const optimized = resolve(release, "dob_calc_core.opt.wasm")
const target = resolve(root, "apps", "web", "public", "wasm", "dob_calc_core.wasm")

// -Oz 只做体积收缩（已验证求值耗时在噪声内）；--all-features 供校验 Rust 默认启用的
// bulk-memory / nontrapping-float-to-int 等指令，输出不会新增宿主需要的特性。
// 产物含 tail-call 与 typed function references：浏览器/wasmtime 原生支持；
// Go SDK 的 wazero 需显式开启 experimental 特性（见 sdk/go/wasm.go），不因此降低优化档位。
execFileSync(process.execPath, [resolve(root, "node_modules/wasm-opt/dist/cli.js"), "-Oz", "--all-features", "-o", optimized, source], {
    stdio: "inherit",
})

await mkdir(dirname(target), { recursive: true })
await copyFile(optimized, target)
await rm(optimized)
console.log(`optimized ${source} -> ${target}`)
