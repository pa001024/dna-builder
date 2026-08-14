import { copyFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = resolve(root, "crates/charbuild-simd-wasm/target/wasm32-unknown-unknown/release/charbuild_simd_wasm.wasm")
const target = resolve(root, "public/wasm/charbuild_simd_wasm.wasm")

await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
console.log(`copied ${source} -> ${target}`)
