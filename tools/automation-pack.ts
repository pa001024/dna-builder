#!/usr/bin/env bun
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export interface PluginManifest {
    id: string
    version: string
    kind: "action" | "source"
    entry: string
    /** 插件展示名（原文呈现）。 */
    title: string
    /** 插件简介（可选，原文呈现，市场卡片展示用）。 */
    desc?: string
    /** 插件自定义设置界面（可选，插件目录内相对路径，如 "settings.vue"）。 */
    settings?: string
}

export interface PluginInfo extends PluginManifest {
    dirName: string
    files: string[]
}

export interface ManifestCheck {
    manifest: PluginManifest | null
    errors: string[]
    warnings: string[]
}

export interface CollectResult {
    plugins: PluginInfo[]
    errors: string[]
    warnings: string[]
}

export interface PackOptions {
    rootDir?: string
    check?: boolean
    upload?: boolean
}

export interface BuiltPlugin extends PluginInfo {
    /** 输出 JS 文件名（不含目录）。 */
    file: string
}

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const EXPORT_DEFAULT_PATTERN = /\bexport\s+default\b/
const KNOWN_FIELDS = new Set(["desc", "entry", "id", "kind", "settings", "title", "version"])
/** 宿主注入的模块：打包时一律 external（不 vendor），运行时由加载器提供。 */
export const HOST_MODULES = new Set(["@dob/host", "vue", "i18next-vue", "@vueuse/core", "@vueuse/shared"])
/** 随包打进 bundle 的工作区模块（源码级复用非运行时注入）。 */
export const BUNDLED_MODULES = new Set(["@pa001024/mihome-api"])
/** 纯类型导入不参与校验（编译即擦除）。 */
const TYPE_IMPORT_PATTERN = /^\s*import\s+type\b/

export function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** 校验单个 manifest 对象（纯函数，不碰文件系统）。 */
export function validateManifest(dirName: string, data: unknown): ManifestCheck {
    const errors: string[] = []
    const warnings: string[] = []
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
        return { manifest: null, errors: [`${dirName}: plugin.json 不是对象`], warnings }
    }
    const record = data as Record<string, unknown>
    for (const key of Object.keys(record).sort()) {
        if (!KNOWN_FIELDS.has(key)) warnings.push(`${dirName}: 未知字段 "${key}" 已忽略`)
    }
    let id = ""
    if (typeof record.id !== "string" || record.id === "") {
        errors.push(`${dirName}: 缺少 id`)
    } else if (!ID_PATTERN.test(record.id)) {
        errors.push(`${dirName}: id "${record.id}" 非 kebab-case`)
    } else if (record.id !== dirName) {
        errors.push(`${dirName}: id "${record.id}" 与目录名不一致`)
    } else {
        id = record.id
    }
    let version = ""
    if (typeof record.version !== "string" || record.version === "") {
        errors.push(`${dirName}: 缺少 version`)
    } else if (!SEMVER_PATTERN.test(record.version)) {
        errors.push(`${dirName}: version "${record.version}" 非 semver`)
    } else {
        version = record.version
    }
    const kind = record.kind
    if (kind !== "action" && kind !== "source") {
        errors.push(`${dirName}: kind 非法（应为 "action" 或 "source"）`)
    }
    const entry = record.entry
    if (typeof entry !== "string" || entry === "") {
        errors.push(`${dirName}: 缺少 entry`)
    } else if (entry.startsWith("/") || entry.includes("\\") || entry.split("/").includes("..")) {
        errors.push(`${dirName}: entry "${entry}" 必须为插件目录内相对路径`)
    }
    let title = ""
    if (typeof record.title !== "string" || record.title === "") {
        errors.push(`${dirName}: 缺少 title（原文呈现）`)
    } else {
        title = record.title
    }
    let desc: string | undefined
    if (record.desc !== undefined) {
        if (typeof record.desc !== "string" || record.desc === "") {
            errors.push(`${dirName}: desc 非空字符串才有效`)
        } else {
            desc = record.desc
        }
    }
    let settings: string | undefined
    if (record.settings !== undefined) {
        if (typeof record.settings !== "string" || record.settings === "") {
            errors.push(`${dirName}: settings 非空字符串才有效`)
        } else if (record.settings.startsWith("/") || record.settings.includes("\\") || record.settings.split("/").includes("..")) {
            errors.push(`${dirName}: settings "${record.settings}" 必须为插件目录内相对路径`)
        } else {
            settings = record.settings
        }
    }
    if (errors.length > 0) return { manifest: null, errors, warnings }
    return {
        manifest: { id, version, kind: kind as "action" | "source", entry: entry as string, title, desc, settings },
        errors,
        warnings,
    }
}

/** 校验入口源码：须有 export default，且须含 manifest id 命名空间下的字符串字面量。 */
export function validateEntrySource(dirName: string, id: string, kind: string, text: string): string[] {
    const errors: string[] = []
    if (!EXPORT_DEFAULT_PATTERN.test(text)) errors.push(`${dirName}: 入口缺少 export default`)
    if (!new RegExp(`["'\`][^"'\`]*${escapeRegExp(id)}[^"'\`]*["'\`]`).test(text)) {
        errors.push(`${dirName}: 入口未包含 ${kind} id 字符串 "${id}"（允许命名空间后缀，如 "${id}.xxx"）`)
    }
    return errors
}

const STATIC_IMPORT_PATTERN = /^[ \t]*import\s+(?!type\b)[^"']*["']([^"']+)["']/gm
const DYNAMIC_IMPORT_PATTERN = /import\s*\(\s*["']([^"']+)["']\s*\)/g

function collectSpecifiers(text: string): string[] {
    const out = new Set<string>()
    for (const pattern of [STATIC_IMPORT_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
        pattern.lastIndex = 0
        let hit: RegExpExecArray | null
        while ((hit = pattern.exec(text)) !== null) out.add(hit[1])
    }
    return [...out]
}

function isInsideDir(resolved: string, dir: string): boolean {
    const rel = path.relative(dir, resolved)
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}

/**
 * 校验插件源码的导入面：只允许插件内相对路径、宿主模块与 @pa001024/mihome-api（打进包），
 * 其余一律报错（插件不得自带第三方依赖，打包也不 vendor）。
 */

export function validateImports(dirName: string, dir: string, files: string[]): string[] {
    const errors: string[] = []
    for (const file of files) {
        if (!/\.(?:ts|tsx|mts|vue)$/.test(file) || file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue
        const text = fs.readFileSync(path.join(dir, file), "utf8")
        const lines = text.split("\n")
        for (const spec of collectSpecifiers(text)) {
            if (HOST_MODULES.has(spec) || BUNDLED_MODULES.has(spec)) continue
            if (spec.startsWith(".")) {
                const resolved = path.resolve(dir, spec)
                if (isInsideDir(resolved, dir)) continue
                errors.push(`${dirName}: ${file} 越界引用 "${spec}"，宿主模块请走 @dob/host`)
                continue
            }
            if (lines.some(line => line.includes(spec) && TYPE_IMPORT_PATTERN.test(line))) continue
            errors.push(`${dirName}: ${file} 引用了外部模块 "${spec}"，只允许 @dob/host、vue 系与 @pa001024/mihome-api`)
        }
    }
    return errors
}

/** 列出目录下全部文件（相对 posix 路径，已排序，确定性）。 */
export function listFilesSync(dir: string, base: string = dir): string[] {
    const out: string[] = []
    for (const name of fs.readdirSync(dir).sort()) {
        const abs = path.join(dir, name)
        if (fs.statSync(abs).isDirectory()) out.push(...listFilesSync(abs, base))
        else out.push(path.relative(base, abs).split(path.sep).join("/"))
    }
    return out
}

/** 扫描插件目录，返回合法插件（按 id 排序）与错误/告警。缺目录视为空（合法）。 */
export function collectPlugins(pluginsDir: string): CollectResult {
    const plugins: PluginInfo[] = []
    const errors: string[] = []
    const warnings: string[] = []
    if (!fs.existsSync(pluginsDir)) return { plugins, errors, warnings }
    const dirNames = fs
        .readdirSync(pluginsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .sort()
    for (const dirName of dirNames) {
        const dir = path.join(pluginsDir, dirName)
        const manifestPath = path.join(dir, "plugin.json")
        if (!fs.existsSync(manifestPath)) {
            errors.push(`${dirName}: 缺少 plugin.json，已跳过`)
            continue
        }
        let data: unknown
        try {
            data = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
        } catch {
            errors.push(`${dirName}: plugin.json 解析失败已跳过`)
            continue
        }
        const check = validateManifest(dirName, data)
        warnings.push(...check.warnings)
        if (!check.manifest) {
            errors.push(...check.errors.map(message => `${message}，已跳过`))
            continue
        }
        const entryPath = path.join(dir, check.manifest.entry)
        if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
            errors.push(`${dirName}: 入口文件 "${check.manifest.entry}" 不存在已跳过`)
            continue
        }
        const entryErrors = validateEntrySource(dirName, check.manifest.id, check.manifest.kind, fs.readFileSync(entryPath, "utf8"))
        if (entryErrors.length > 0) {
            errors.push(...entryErrors.map(message => `${message}，已跳过`))
            continue
        }
        if (check.manifest.settings) {
            const settingsPath = path.join(dir, check.manifest.settings)
            if (!fs.existsSync(settingsPath) || !fs.statSync(settingsPath).isFile()) {
                errors.push(`${dirName}: 设置界面 "${check.manifest.settings}" 不存在已跳过`)
                continue
            }
        }
        const importErrors = validateImports(dirName, dir, listFilesSync(dir))
        if (importErrors.length > 0) {
            errors.push(...importErrors.map(message => `${message}，已跳过`))
            continue
        }
        plugins.push({ ...check.manifest, dirName, files: listFilesSync(dir) })
    }
    plugins.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    return { plugins, errors, warnings }
}

function tryResolve(spec: string, paths: string[]): string | null {
    for (const base of paths) {
        for (const candidate of [path.join(base, spec), path.join(base, spec, "index.js"), `${path.join(base, spec)}.js`]) {
            if (fs.existsSync(candidate)) return candidate
        }
    }
    return null
}

/** 定位 @vue/compiler-sfc（vite 的依赖，pnpm 下藏在 .pnpm 里）。 */
export function resolveCompilerSfc(rootDir: string): string {
    const direct = tryResolve("@vue/compiler-sfc", [rootDir, path.join(rootDir, "apps", "web")])
    if (direct) return direct
    const pnpmDir = path.join(rootDir, "node_modules", ".pnpm")
    if (fs.existsSync(pnpmDir)) {
        const hit = fs
            .readdirSync(pnpmDir)
            .filter(name => name.startsWith("@vue+compiler-sfc@"))
            .sort()
            .at(-1)
        if (hit) {
            const candidate = path.join(pnpmDir, hit, "node_modules", "@vue", "compiler-sfc", "dist", "compiler-sfc.cjs.js")
            if (fs.existsSync(candidate)) return candidate
        }
    }
    throw new Error("找不到 @vue/compiler-sfc（settings.vue 编译需要，请先安装依赖）")
}

/** 定位 fflate（zip 打包用，复用 apps/web 的依赖）。 */
export function resolveFflate(rootDir: string): string {
    const { createRequire } = require("node:module") as typeof import("node:module")
    const req = createRequire(path.join(rootDir, "apps", "web", "package.json"))
    try {
        return req.resolve("fflate")
    } catch {
        throw new Error("找不到 fflate（zip 打包需要请先安装依赖）")
    }
}

/** 沙箱无全局组件注册：模板里用了但 script 没显式 import 的组件会编译成空壳，提前拦下。 */
export function findUnresolvedComponents(js: string): string[] {
    const names = new Set<string>()
    for (const match of js.matchAll(/_resolveComponent\("([^"]+)"\)/g)) names.add(match[1])
    return [...names].sort()
}

/** 编译 settings.vue 为可打包的 JS 模块（render 函数内联）。 */
export function compileSettingsVue(compilerPath: string, pluginDir: string, source: string, filename: string): string {
    const { parse, compileScript } = require(compilerPath) as typeof import("@vue/compiler-sfc")
    const { descriptor, errors } = parse(source, { filename })
    if (errors.length > 0) throw new Error(`SFC 解析失败: ${errors.map(e => String(e)).join("; ")}`)
    const compiled = compileScript(descriptor, { id: `dob-${filename.replace(/[^a-z0-9]/gi, "")}`, inlineTemplate: true })
    const plain = rewriteLocalImports(pluginDir, compiled.content)
    const js = new Bun.Transpiler({ loader: "ts" }).transformSync(plain)
    const unresolved = findUnresolvedComponents(js)
    if (unresolved.length > 0) {
        throw new Error(`${filename} 用了未导入的组件 ${unresolved.join("、")}（沙箱无全局注册，须从 @dob/host 显式 import）`)
    }
    return js
}

/**
 * 把编译产物里的插件内相对引用改写为绝对路径（bun build 才能收进同一个 bundle）。
 * 宿主相对路径（../../apps/...）保持原样走 external。
 */
export function rewriteLocalImports(pluginDir: string, code: string): string {
    return code.replace(/from\s+["'](\.[^"']*)["']/g, (full, spec: string) => {
        const resolved = path.resolve(pluginDir, spec)
        if (!isInsideDir(resolved, pluginDir)) return full
        return `from "${resolved.split(path.sep).join("/")}"`
    })
}

/** 拼虚拟入口：统一导出 { def, account?, settings? }，内部相对引用保持原样。 */
export function renderVirtualEntry(pluginDir: string, manifest: PluginManifest, compiledSettingsPath: string | null): string {
    const entryAbs = path.join(pluginDir, manifest.entry).split(path.sep).join("/")
    const lines = [`import def from "${entryAbs}";`, `import * as __dob_ns from "${entryAbs}";`]
    lines.push(`const { account } = __dob_ns as { account?: unknown };`)
    if (compiledSettingsPath) {
        const settingsAbs = compiledSettingsPath.split(path.sep).join("/")
        lines.push(`import __dob_settings from "${settingsAbs}";`)
        lines.push(`export const __dob_plugin = { def, account, settings: __dob_settings };`)
    } else {
        lines.push(`export const __dob_plugin = { def, account };`)
    }
    return `${lines.join("\n")}\n`
}

export interface BuildResult {
    js: string
    warnings: string[]
}

/**
 * 构建单个插件为 CJS bundle：只含插件自身代码，
 * @dob/host 与 vue 系全部 external（不 vendor），运行时由加载器注入。
 */
export async function buildPlugin(rootDir: string, plugin: PluginInfo, workDir: string): Promise<BuildResult> {
    const warnings: string[] = []
    const pluginDir = path.join(rootDir, "plugins", plugin.dirName)
    const pluginWorkDir = path.join(workDir, plugin.id)
    fs.mkdirSync(pluginWorkDir, { recursive: true })
    let compiledSettingsPath: string | null = null
    if (plugin.settings) {
        const source = fs.readFileSync(path.join(pluginDir, plugin.settings), "utf8")
        const compilerPath = resolveCompilerSfc(rootDir)
        compiledSettingsPath = path.join(pluginWorkDir, "settings.compiled.js")
        fs.writeFileSync(compiledSettingsPath, compileSettingsVue(compilerPath, pluginDir, source, `${plugin.id}-settings.vue`))
    }
    const entryPath = path.join(pluginWorkDir, "entry.ts")
    fs.writeFileSync(entryPath, renderVirtualEntry(pluginDir, plugin, compiledSettingsPath))
    const result = await Bun.build({
        entrypoints: [entryPath],
        outdir: pluginWorkDir,
        format: "cjs",
        target: "browser",
        minify: true,
        external: [...HOST_MODULES],
        alias: {
            "@dob/host": path.join(rootDir, "apps", "web", "src", "automation", "host.ts"),
            "@pa001024/mihome-api": path.join(rootDir, "packages", "mihome-api", "src", "index.ts"),
        },
        naming: "[name].js",
    })
    if (!result.success) {
        const detail = result.logs.map(log => (typeof log === "string" ? log : (log.text ?? log.message ?? JSON.stringify(log)))).join("\n")
        throw new Error(`${plugin.id}: 构建失败\n${detail}`)
    }
    let js = fs.readFileSync(path.join(pluginWorkDir, "entry.js"), "utf8")
    if (!js.includes("__dob_plugin")) throw new Error(`${plugin.id}: 产物未导出 __dob_plugin`)
    js = rewriteDynamicImports(plugin.id, js)
    return { js, warnings }
}

/** 动态 import(宿主模块) 在 CJS 沙箱里无法解析，改写为 require 包装。 */
export function rewriteDynamicImports(pluginId: string, code: string): string {
    return code.replace(/import\s*\(\s*["']([^"']+)["']\s*\)/g, (_full, spec: string) => {
        if (!HOST_MODULES.has(spec)) throw new Error(`${pluginId}: 动态 import 了非宿主模块 "${spec}"`)
        return `Promise.resolve().then(() => require("${spec}"))`
    })
}

export interface PluginIndexEntry {
    id: string
    version: string
    kind: string
    title: string
    desc?: string
    hasSettings: boolean
    file: string
    size: number
    sha256: string
    url?: string
}

function sha256Hex(data: Uint8Array): string {
    const { createHash } = require("node:crypto") as typeof import("node:crypto")
    return createHash("sha256").update(data).digest("hex")
}

/** 打 zip 包：<id>.js + plugin.json（发布与运行的唯一产物形态）。 */
export function zipPlugin(rootDir: string, plugin: BuiltPlugin, js: string): Uint8Array {
    const { zipSync } = require(resolveFflate(rootDir)) as typeof import("fflate")
    const manifest = JSON.stringify(
        { id: plugin.id, version: plugin.version, kind: plugin.kind, title: plugin.title, desc: plugin.desc },
        null,
        2
    )
    return zipSync({
        [`${plugin.id}.js`]: new TextEncoder().encode(js),
        "plugin.json": new TextEncoder().encode(manifest),
    })
}

/** 生成清单条目（含大小与哈希；upload 按端生成时传入该端的包地址）。 */
export function indexEntry(plugin: BuiltPlugin, zip: Uint8Array, url?: string): PluginIndexEntry {
    return {
        id: plugin.id,
        version: plugin.version,
        kind: plugin.kind,
        title: plugin.title,
        desc: plugin.desc,
        hasSettings: Boolean(plugin.settings),
        file: plugin.file,
        size: zip.length,
        sha256: sha256Hex(zip),
        ...(url ? { url } : {}),
    }
}

/** 写镜像目录：zip + plugins.json（mock 本地联调 / .tmp 暂存共用）。 */
export function writeMirror(dir: string, built: BuiltPlugin[], zipById: Map<string, Uint8Array>, index: PluginIndexEntry[]): void {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    for (const plugin of built) {
        fs.writeFileSync(path.join(dir, plugin.file), Buffer.from(zipById.get(plugin.id) ?? new Uint8Array()))
    }
    fs.writeFileSync(path.join(dir, "plugins.json"), `${JSON.stringify(index, null, 2)}\n`)
}

/**
 * 打包主流程：校验 → 构建 JS → 打 zip → 写 .tmp 暂存与 mock 镜像。
 * 线上运行时只从 CDN 拉取，不进应用包。
 * upload 模式额外上传 CDN 并在清单里写 url。无效插件跳过但计入 errors。
 */
export async function runPack(options: PackOptions = {}): Promise<CollectResult & { built?: BuiltPlugin[]; index?: PluginIndexEntry[] }> {
    const rootDir = options.rootDir ?? ROOT_DIR
    const result = collectPlugins(path.join(rootDir, "plugins"))
    if (options.check || result.errors.length > 0) return result
    const workDir = path.join(rootDir, ".tmp", "automation-pack")
    fs.rmSync(workDir, { recursive: true, force: true })
    const built: BuiltPlugin[] = []
    const zipById = new Map<string, Uint8Array>()
    for (const plugin of result.plugins) {
        try {
            const { js } = await buildPlugin(rootDir, plugin, workDir)
            const file = `${plugin.id}-${plugin.version}.zip`
            built.push({ ...plugin, file })
            zipById.set(plugin.id, zipPlugin(rootDir, built[built.length - 1], js))
        } catch (error) {
            result.errors.push(error instanceof Error ? error.message : String(error))
        }
    }
    if (result.errors.length > 0) return result
    const index = built.map(plugin => indexEntry(plugin, zipById.get(plugin.id) ?? new Uint8Array()))
    // 本地镜像永远不带 url（开发联调就近取 mock 包）；upload 的按端清单只写远端。
    if (options.upload) await uploadPlugins(rootDir, built, zipById)
    writeMirror(path.join(rootDir, ".tmp", "automation-pack", "out"), built, zipById, index)
    writeMirror(path.join(rootDir, "apps", "web", "mock", "plugins"), built, zipById, index)
    return { ...result, built, index }
}

const PLUGIN_CDN_PREFIX = "plugins"

/**
 * 上传 zip 与清单到对象存储（参考 deploy 的双端写法）。
 * zip 包内容与端点无关，一份双写所有端；plugins.json 按端分别生成，
 * 每端的 url 都指向该端自己的公开域名，任一端客户端都不跨端回源。
 */
export async function uploadPlugins(rootDir: string, built: BuiltPlugin[], zipById: Map<string, Uint8Array>): Promise<void> {
    const { assertStorageConfig, getActiveBackends, getPublicUrlOn, putFile, putGenerated } = await import("./object-storage")
    assertStorageConfig()
    const backends = getActiveBackends()
    if (backends.length === 0) throw new Error("对象存储未配置，无法上传")
    const tmpDir = path.join(rootDir, ".tmp", "automation-pack-upload")
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.mkdirSync(tmpDir, { recursive: true })
    for (const plugin of built) {
        const zip = zipById.get(plugin.id) ?? new Uint8Array()
        const localPath = path.join(tmpDir, plugin.file)
        fs.writeFileSync(localPath, Buffer.from(zip))
        const key = `${PLUGIN_CDN_PREFIX}/${plugin.file}`
        console.log(`📤 上传插件包: ${key}`)
        await putFile(key, localPath, "application/zip")
    }
    const indexKey = `${PLUGIN_CDN_PREFIX}/plugins.json`
    console.log(`📤 按端生成并上传插件清单: ${indexKey}`)
    await putGenerated(
        indexKey,
        backend =>
            `${JSON.stringify(
                built.map(plugin =>
                    indexEntry(
                        plugin,
                        zipById.get(plugin.id) ?? new Uint8Array(),
                        getPublicUrlOn(backend, `${PLUGIN_CDN_PREFIX}/${plugin.file}`)
                    )
                ),
                null,
                2
            )}\n`,
        "application/json"
    )
    for (const backend of backends) {
        console.log(`✅ [${backend.label}] 清单已上传: ${getPublicUrlOn(backend, indexKey)}`)
        for (const plugin of built) {
            console.log(`   [${backend.label}] ${plugin.file}: ${getPublicUrlOn(backend, `${PLUGIN_CDN_PREFIX}/${plugin.file}`)}`)
        }
    }
}

/** 打印 --help 用法与校验口径。 */
function printHelp(): void {
    console.log(`automation-pack — 自动化插件构建与发布打包

用法：
    bun tools/automation-pack.ts [build] [upload] [--check]
    bun tools/automation-pack.ts --help

校验规则（plugins/<dir>/plugin.json）：
    - id：kebab-case，且必须与目录名一致
    - version：semver（如 1.0.0）
    - kind："action" 或 "source"
    - entry：插件目录内相对路径，文件须存在；入口源码须含 export default，
      且须含 manifest id 命名空间下的字符串字面量（如 "webhook" 或 "webhook.post"）
    - settings（可选）：插件自定义设置界面相对路径（如 "settings.vue"），文件须存在
    - title：插件展示名（原文呈现）
    - desc（可选）：插件简介（原文呈现，市场卡片展示用）
    - 导入面：只允许插件内相对路径、@dob/host、vue 系与 @pa001024/mihome-api（后者打进包），
      其余一律报错（插件不得自带第三方依赖）
    - 未知字段：只告警，不报错

构建（默认 build 模式）：
    - 每个插件构建为单个 CJS bundle（js-only，无 vendor：@dob/host 与 vue 系全 external，@pa001024/mihome-api 打进包）
    - settings.vue 先编译为 JS 再一起打包；动态 import(宿主模块) 改写为 require 包装
    - <id>-<version>.zip：<id>.js + plugin.json（.tmp 暂存 + mock 镜像，不进 dist）
    - apps/web/mock/plugins/：同内容 zip + 清单镜像（仅开发联调；线上走 CDN，不进包）
    - plugins/ 缺失或为空时合法输出空索引
    - 无效插件会被跳过；只要有错误就非零退出

upload 模式：构建后把 zip 与清单上传到对象存储 plugins/ 前缀（参考 deploy 的双端写法：
zip 包一份双写所有端，plugins.json 按端分别生成、每端的 url 指向该端自己的公开域名）；
按端分开打日志

选项：
    build     构建 + 写本地镜像（默认）
    upload    构建 + 上传 CDN + 清单写 url
    --check   只校验不构建；有错误时非零退出（供 CI 用）
    --help    显示本帮助`)
}

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    if (args.includes("--help") || args.includes("-h")) {
        printHelp()
        return
    }
    const check = args.includes("--check")
    const upload = args.includes("upload")
    const build = args.includes("build") || (!check && !upload)
    const unknown = args.filter(arg => !["--check", "upload", "build"].includes(arg))
    if (unknown.length > 0) {
        console.error(`未知参数: ${unknown.join(" ")}（用 --help 查看用法）`)
        process.exit(1)
    }
    const result = await runPack({ rootDir: ROOT_DIR, check, upload: upload && !check })
    for (const message of result.warnings) console.warn(`warning: ${message}`)
    if (result.errors.length > 0) {
        for (const message of result.errors) console.error(`error: ${message}`)
        if (!check) console.error(`error: 无效插件已跳过`)
        process.exit(1)
    }
    if (check) {
        console.log(`校验通过：${result.plugins.length} 个插件合法`)
        return
    }
    if (upload) console.log(`已上传 ${result.plugins.length} 个插件到 CDN（见上方地址）`)
    else if (build) console.log(`已构建 ${result.plugins.length} 个插件 → mock 镜像`)
}

if (import.meta.main) await main()
