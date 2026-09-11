/**
 * export-title-frame-shaders —— 导出称号框用到的全部材质着色器（DXBC + 反编译 HLSL）。
 *
 * 称号框图层来自约 20 个基础材质，每个基础材质在 ShaderArchive 里对应一个 shader map。
 * 本脚本把这条链路固化成可重跑的一步：
 *
 *   1. 从 `import-title-frame.ts` 的材质缓存里取出所有 MaterialInstance 的父材质；
 *   2. `material-shader` 拿到 ResourceHash、shader 列表与 uniform 参数表；
 *   3. `export-shader-map` 按 ResourceHash 一次导出该 map 的全部字节码（归档 600MB，只读一次）；
 *   4. 用 HLSLDecompiler 把指令数最多的像素着色器反编译成 HLSL；
 *   5. 写 manifest，记录每个材质的 shader 槽位、主 PS 与参数表。
 *
 * 用法：
 *   bun tools/export-title-frame-shaders.ts            # 增量（已导出过就跳过）
 *   bun tools/export-title-frame-shaders.ts --force    # 全部重导
 *   bun tools/export-title-frame-shaders.ts --only M_UIBasic
 *
 * 产物落在 .tmp/title-frame-shaders/（未提交，随时可重跑）。
 */

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const ROOT_DIR = path.resolve(import.meta.dir, "..")
const CLI = process.env.FMODEL_CLI ?? "D:/dev/fmodel-mcp/Cli/bin/Debug/net10.0/fmodel-cli.exe"
const DECOMPILER = process.env.HLSL_DECOMPILER ?? "D:/dev/fmodel-mcp/.tools/HLSLDecompiler-v0.6/extracted/HLSLDecompiler.exe"
const MI_CACHE = process.env.TITLE_FRAME_CACHE ?? path.join(ROOT_DIR, ".tmp", "titleframe-cache")
const OUT_DIR = path.join(ROOT_DIR, ".tmp", "title-frame-shaders")

/** 首选分块归档，找不到再退到 Global。 */
const ARCHIVES = [
    "EM/Content/ShaderArchive-EM_Chunk0-PCD3D_SM5.ushaderbytecode",
    "EM/Content/ShaderArchive-Global-PCD3D_SM5.ushaderbytecode",
]

const args = process.argv.slice(2)
const FORCE = args.includes("--force")
const onlyIndex = args.indexOf("--only")
const ONLY = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined

/**
 * 调用 fmodel-cli 并解析 stdout JSON。
 * @param cliArgs 子命令与参数
 * @returns 解析后的 JSON
 */
function runCli(cliArgs: string[]): Record<string, any> {
    const result = spawnSync(CLI, cliArgs, { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 })
    if (result.error) throw result.error
    const stdout = (result.stdout ?? "").trim()
    if (!stdout) throw new Error(`fmodel-cli ${cliArgs.join(" ")} 无输出：${result.stderr ?? ""}`)
    const parsed = JSON.parse(stdout) as Record<string, any>
    if (parsed.ok !== true) throw new Error(`fmodel-cli ${cliArgs.join(" ")} 失败：${JSON.stringify(parsed).slice(0, 300)}`)
    return parsed
}

/**
 * 从材质实例缓存里收集所有基础材质包路径。
 * @returns 基础材质包路径列表
 */
function collectBaseMaterials(): string[] {
    const result = new Set<string>()
    for (const file of fs.readdirSync(MI_CACHE)) {
        if (!file.startsWith("mi__")) continue
        const summary = JSON.parse(fs.readFileSync(path.join(MI_CACHE, file), "utf8"))
        const parent = String(summary.parent ?? "").replace(/\.\d+$/, "")
        if (parent) result.add(parent)
    }
    return [...result].sort()
}

/** 材质短名，用于文件名。 */
function shortName(pkg: string): string {
    return path.posix.basename(pkg)
}

/**
 * 主流程：逐个基础材质导出并反编译主像素着色器。
 */
function main(): void {
    if (!fs.existsSync(CLI)) throw new Error(`未找到 fmodel-cli：${CLI}`)
    fs.mkdirSync(OUT_DIR, { recursive: true })

    const materials = collectBaseMaterials().filter(pkg => !ONLY || pkg.includes(ONLY))
    console.log(`基础材质 ${materials.length} 个`)

    const manifest: Record<string, any> = {}
    for (const pkg of materials) {
        const name = shortName(pkg)
        const dir = path.join(OUT_DIR, name)
        const manifestFile = path.join(dir, "manifest.json")
        const existing = !FORCE && fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : null
        if (existing?.mainPixelShader?.hlsl) {
            manifest[name] = existing
            console.log(`  · ${name} 已有产物，跳过`)
            continue
        }

        const info = runCli(["material-shader", pkg])
        const resource = info.objects?.[0]?.materialResources?.[0]
        if (!resource?.resourceHash) {
            console.log(`  ! ${name} 没有 shader map，跳过`)
            continue
        }

        // 主像素着色器 = 指令数最多的那个（其余是 depth/velocity 等辅助 permutation）
        const pixelShaders: any[] = (resource.shaders ?? []).filter((shader: any) => shader.frequency === "SF_Pixel")
        const main = pixelShaders.reduce(
            (best: any, shader: any) => (shader.numInstructions > (best?.numInstructions ?? -1) ? shader : best),
            null
        )

        fs.mkdirSync(dir, { recursive: true })
        const hasDxbc = fs.readdirSync(dir).some(file => file.endsWith(".dxbc"))
        let archive = existing?.archive ?? ""
        let shaders: any[] = existing?.exportedShaders ?? []
        if (FORCE || !hasDxbc) {
            archive = ""
            for (const candidate of ARCHIVES) {
                try {
                    const exported = runCli(["export-shader-map", candidate, resource.resourceHash, dir])
                    archive = candidate
                    shaders = exported.shaders ?? []
                    break
                } catch {
                    // 该归档里没有这个 map，换下一个
                }
            }
        }
        if (!archive) {
            console.log(`  ! ${name} ResourceHash ${resource.resourceHash} 在两个归档里都没找到`)
            continue
        }

        // resourceIndex 是 shader map 内的槽位，导出文件名用的是归档全局索引，需要经 slot 换算
        const mainSlot = main?.resourceIndex
        const mainFile = shaders.find((shader: any) => shader.slot === mainSlot)?.file as string | undefined

        // 反编译全部像素着色器，主 PS 单独再存一份便于阅读
        let mainHlsl: string | null = null
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith("_f3.dxbc")) continue
            const dxbc = path.join(dir, file)
            const hlsl = dxbc.replace(/\.dxbc$/, ".hlsl")
            if (FORCE || !fs.existsSync(hlsl)) {
                spawnSync(DECOMPILER, [dxbc, "-dxbc", hlsl], { encoding: "utf8" })
            }
            if (mainFile && file === mainFile) mainHlsl = path.basename(hlsl)
        }

        const entry = {
            package: pkg,
            resourceHash: resource.resourceHash,
            shaderPlatform: resource.shaderPlatform,
            archive,
            shaderMapId: resource.shaderMapId,
            pixelShaderCount: pixelShaders.length,
            mainPixelShader: main
                ? {
                      resourceIndex: main.resourceIndex,
                      slot: mainSlot,
                      typeHash: main.typeHash,
                      numInstructions: main.numInstructions,
                      hlsl: mainHlsl,
                  }
                : null,
            uniforms: resource.uniforms,
            exportedShaders: shaders,
        }
        fs.writeFileSync(manifestFile, JSON.stringify(entry, null, 4), "utf8")
        manifest[name] = entry
        console.log(
            `  · ${name} hash=${resource.resourceHash.slice(0, 12)} PS=${pixelShaders.length} ` +
                `main=${main?.numInstructions ?? "?"} 指令 → ${mainHlsl}`
        )
    }

    fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(manifest, null, 4), "utf8")
    console.log(`已写入 ${path.relative(ROOT_DIR, path.join(OUT_DIR, "index.json"))}`)
}

main()
