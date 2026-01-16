import { execSync } from "node:child_process"
import fs from "node:fs"

let extension = ""
if (process.platform === "win32") {
    extension = ".exe"
}

async function main() {
    const rustInfo = execSync("rustc -vV").toString()
    const targetTriple = /host: (\S+)/g.exec(rustInfo)[1]
    if (!targetTriple) {
        console.error("Failed to determine platform target triple")
    }
    fs.copyFileSync(`target/release/dna_mcp_server${extension}`, `../src-tauri/sidecar/dna_mcp_server-${targetTriple}${extension}`)
}

main().catch(e => {
    throw e
})
