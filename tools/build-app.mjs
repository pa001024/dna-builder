#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const viteBin = path.resolve(rootDir, "node_modules/vite/bin/vite.js")

const result = spawnSync(process.execPath, [viteBin, "build"], {
    cwd: rootDir,
    env: {
        ...process.env,
        DNA_BUILDER_APP_BUILD: "1",
    },
    stdio: "inherit",
})

process.exit(result.status ?? 1)
