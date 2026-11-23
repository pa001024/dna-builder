#!/usr/bin/env node
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, "../../../..")
const HARNESS = path.join(HERE, "ego-test.mjs")
const DEFAULT_BASE_URL = "http://localhost:1420"
const DEFAULT_TEST_DIR = path.join(REPO_ROOT, "apps", "web", "tests", "browser")

const options = parseArgs(process.argv.slice(2))
if (options.help) {
    printHelp()
    process.exit(0)
}

const egoBrowser = await findEgoBrowser()
if (!egoBrowser) {
    console.error("未找到 ego-browser。请先安装 ego lite 并完成 onboarding：https://lite.ego.app/")
    console.error("Windows 安装后若 PATH 未刷新，可设置 EGO_BROWSER_PATH 指向 ego-browser.exe。")
    process.exit(2)
}

const files = await collectTestFiles(options.targets.length > 0 ? options.targets : [DEFAULT_TEST_DIR])
if (files.length === 0) {
    console.error(`没有找到 *.test.mjs：${options.targets.length > 0 ? options.targets.join(", ") : DEFAULT_TEST_DIR}`)
    process.exit(2)
}

const runDir = path.join(REPO_ROOT, ".tmp", "ego-browser-test", stamp())
const screenshotDir = path.join(runDir, "screenshots")
await mkdir(runDir, { recursive: true })

const config = {
    tests: files.map(file => pathToFileURL(file).href),
    baseUrl: options.url,
    screenshotDir: screenshotDir.replaceAll("\\", "/"),
    resultDir: runDir.replaceAll("\\", "/"),
    keep: options.keep,
    screenshotOnPass: options.screenshotOnPass,
    viewport: options.viewport,
    ...(options.filter ? { filter: options.filter } : {}),
    ...(options.ignoreConsole.length > 0 ? { ignoreConsoleErrors: options.ignoreConsole } : {}),
}
const entry = path.join(runDir, "run.mjs")
await writeFile(
    entry,
    `import { run } from ${JSON.stringify(pathToFileURL(HARNESS).href)}\n\nawait run(${JSON.stringify(config, null, 4)})\n`,
    "utf8"
)

console.log(`[ego-browser-test] ${files.length} 个测试文件，地址 ${options.url}`)
console.log(`[ego-browser-test] 运行目录 ${runDir.replaceAll("\\", "/")}`)

const exitCode = await runEgoBrowser(egoBrowser, entry)
const summary = await readSummary(runDir)
if (exitCode !== 0 || !summary || summary.failed > 0) {
    if (!summary && exitCode !== 0) {
        console.error("[ego-browser-test] 未生成 result.json：请确认 ego lite 正在运行，且开发服务器可访问。")
    }
    process.exitCode = 1
}

async function runEgoBrowser(executable, entryFile) {
    const code = `await import(${JSON.stringify(pathToFileURL(entryFile).href)})`
    const child = spawn(executable, ["nodejs", "-e", code], { stdio: "inherit", windowsHide: true })
    return await new Promise(resolve => {
        child.on("error", error => {
            console.error(`无法启动 ego-browser: ${error.message}`)
            resolve(2)
        })
        child.on("close", code => resolve(code ?? 1))
    })
}

async function readSummary(runDir) {
    try {
        return JSON.parse(await readFile(path.join(runDir, "result.json"), "utf8"))
    } catch {
        return null
    }
}

async function findEgoBrowser() {
    if (process.env.EGO_BROWSER_PATH && existsSync(process.env.EGO_BROWSER_PATH)) {
        return process.env.EGO_BROWSER_PATH
    }

    for (const candidate of await whichEgoBrowser()) {
        if (existsSync(candidate)) return candidate
    }

    if (process.platform === "win32") {
        const bases = [
            path.join(process.env.ProgramFiles || "C:\\Program Files", "Citro Labs", "ego lite", "Application"),
            path.join(process.env.LOCALAPPDATA || "", "Programs", "ego lite"),
        ]
        for (const base of bases) {
            if (!existsSync(base)) continue
            const entries = await readdir(base, { withFileTypes: true }).catch(() => [])
            const versions = entries
                .filter(entry => entry.isDirectory())
                .map(entry => entry.name)
                .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
                .reverse()
            for (const version of versions) {
                const exe = path.join(base, version, "ego-browser.exe")
                if (existsSync(exe)) return exe
            }
        }
    }

    if (process.platform === "darwin") {
        const mac = "/Applications/ego lite.app/Contents/MacOS/ego-browser"
        if (existsSync(mac)) return mac
    }
    return null
}

async function whichEgoBrowser() {
    const command = process.platform === "win32" ? "where" : "which"
    return await new Promise(resolve => {
        const child = spawn(command, ["ego-browser"], { windowsHide: true })
        let stdout = ""
        child.stdout?.on("data", chunk => {
            stdout += chunk
        })
        child.on("error", () => resolve([]))
        child.on("close", code => resolve(code === 0 ? stdout.split(/\r?\n/).filter(Boolean) : []))
    })
}

async function collectTestFiles(targets) {
    const files = []
    for (const target of targets) {
        const absolute = path.resolve(target)
        const info = await stat(absolute).catch(() => null)
        if (!info) continue
        if (info.isDirectory()) {
            for (const entry of await readdir(absolute, { withFileTypes: true })) {
                if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
                const child = path.join(absolute, entry.name)
                if (entry.isDirectory()) files.push(...(await collectTestFiles([child])))
                else if (entry.isFile() && entry.name.endsWith(".test.mjs")) files.push(child)
            }
        } else if (info.isFile() && absolute.endsWith(".test.mjs")) {
            files.push(absolute)
        }
    }
    return [...new Set(files)].sort()
}

function parseArgs(argv) {
    const result = {
        targets: [],
        url: process.env.FRONTEND_TEST_URL || DEFAULT_BASE_URL,
        keep: false,
        screenshotOnPass: false,
        viewport: { width: 1440, height: 900 },
        filter: "",
        ignoreConsole: [],
        help: false,
    }
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]
        if (arg === "--") continue
        if (arg === "-h" || arg === "--help") result.help = true
        else if (arg === "--url" || arg === "--base-url") result.url = argv[++index] ?? result.url
        else if (arg === "--keep") result.keep = true
        else if (arg === "--screenshot-on-pass") result.screenshotOnPass = true
        else if (arg === "--viewport") result.viewport = parseViewport(argv[++index])
        else if (arg === "--filter") result.filter = argv[++index] ?? ""
        else if (arg === "--ignore-console") result.ignoreConsole.push(argv[++index] ?? "")
        else if (arg.startsWith("-")) {
            console.error(`未知参数: ${arg}`)
            printHelp()
            process.exit(2)
        } else result.targets.push(arg)
    }
    result.ignoreConsole = result.ignoreConsole.filter(Boolean)
    return result
}

function printHelp() {
    console.log(`ego-browser-test 运行器

用法:
  pnpm test:browser -- [选项] [测试文件/目录...]
  bun .agents/skills/ego-browser-test/scripts/run.mjs [选项] [测试文件/目录...]

默认运行 apps/web/tests/browser 下所有 *.test.mjs。

选项:
  --url <地址>              前端地址（默认 http://localhost:1420）
  --keep                    结束时保留 p1 页面供人工查看
  --screenshot-on-pass      通过用例也截图
  --viewport <宽x高>        视口尺寸（默认 1440x900）
  --filter <文本>           只运行名称包含该文本的用例
  --ignore-console <文本>   忽略包含该文本的控制台错误（可重复）
  -h, --help                显示帮助

环境变量:
  EGO_BROWSER_PATH          指定 ego-browser 可执行文件路径（PATH 未刷新时用）
  FRONTEND_TEST_URL         同 --url（优先级低于 --url）`)
}

function parseViewport(value) {
    const match = /^(\d+)x(\d+)$/i.exec(value ?? "")
    if (!match) {
        console.error(`无效的 --viewport: ${value}（期望如 1440x900）`)
        process.exit(2)
    }
    return { width: Number(match[1]), height: Number(match[2]) }
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, "-")
}
