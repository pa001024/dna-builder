import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path"
import { cpus } from "node:os"
import { spawn } from "node:child_process"
import { Matrix4, Quaternion, Vector3 } from "three"
import regionData from "../src/data/d/region.data"
import subRegionData from "../src/data/d/subregion.data"

interface ObjectReference {
    ObjectName?: string
    ObjectPath?: string
}

interface TransformVector {
    X?: number
    Y?: number
    Z?: number
}

interface TransformRotator {
    Pitch?: number
    Yaw?: number
    Roll?: number
}

interface TransformQuat {
    X?: number
    Y?: number
    Z?: number
    W?: number
}

interface TransformData {
    Rotation?: TransformQuat
    Translation?: TransformVector
    Scale3D?: TransformVector
}

interface UMapExportItem {
    Type?: string
    Name?: string
    Outer?: string
    Properties?: Record<string, unknown>
    PerInstanceSMData?: Array<{
        TransformData?: TransformData
    }>
}

interface SceneMeshManifest {
    id: string
    asset: string
}

interface SceneInstanceManifest {
    meshId: string
    p: [number, number, number]
    s: [number, number, number]
    r?: [number, number, number]
    q?: [number, number, number, number]
}

interface RegionSceneManifest {
    regionId: number
    regionName: string
    meshes: SceneMeshManifest[]
    instances: SceneInstanceManifest[]
}

interface SceneBundleHeader {
    manifest: RegionSceneManifest
    files: Array<{
        path: string
        offset: number
        size: number
    }>
}

interface MissingMeshReportItem {
    packagePath: string
    instanceCount: number
    sourceLayers: string[]
    candidates: string[]
    reason: string
}

interface ExtractedInstance {
    meshPackagePath: string
    position: [number, number, number]
    scale: [number, number, number]
    sourceLayer: string
    rotator?: [number, number, number]
    quaternion?: [number, number, number, number]
}

interface CliOptions {
    regionId: number
    exportsRoot: string
    umodelPath: string
    umodelCacheRoot: string
    gameTag: string
    outputPath: string
    outputDir: string
    force: boolean
    optimize: boolean
    limitChunks: number | null
    limitMeshes: number | null
    jobs: number
    textureSize: number
    textureWebpQuality: number
    textureWebpEffort: number
}

interface PackageFileIndex {
    byFileName: Map<string, string[]>
    byBaseName: Map<string, string[]>
}

interface BakedMaskedTextureResult {
    bakedTextureName: string
}

const GLOBAL_LAYER_DIRECTORIES = new Set(["Art_Data", "Deco_Data"])
const MAP_LAYER_DIRECTORIES = new Set(["Layout_Data", "Design_Data", "Effect_Data", "Gameplay_Data", "Sound_Data", "Task_Data"])
const SCENE_BUNDLE_MAGIC = "UMAPBND1"
const MESH_CACHE_ROOT = resolve(".umap-cache/meshopt-v6-material-channel-fix4")
const DEFAULT_UMODEL_CACHE_ROOT = resolve("D:/dev/dna-unpack/umodel_win32/UmodelExport")
const PACKAGE_ALIAS_MAP = new Map<string, string>()
const DEFAULT_EXPORT_JOBS = Math.min(Math.max(cpus().length - 1, 1), 6)
const DEFAULT_TEXTURE_SIZE = 1024
const DEFAULT_TEXTURE_WEBP_QUALITY = 68
const DEFAULT_TEXTURE_WEBP_EFFORT = 6

/**
 * 区域级导出入口。
 */
async function main() {
    const options = parseCliOptions(process.argv.slice(2))
    ensureDirectoryExists(options.exportsRoot, "exports-root")
    ensureFileExists(options.umodelPath, "umodel-path")
    mkdirSync(options.umodelCacheRoot, { recursive: true })

    const region = regionData.find(item => item.id === options.regionId)
    if (!region) {
        throw new Error(`未找到 regionId=${options.regionId}`)
    }

    const subRegions = subRegionData.filter(item => item.rid === options.regionId)
    if (subRegions.length === 0) {
        throw new Error(`regionId=${options.regionId} 没有关联的 subregion`)
    }

    const mapNames = Array.from(new Set(subRegions.map(item => item.map))).sort()
    const levelsRoot = resolve(join(options.exportsRoot, "EM/Content/Maps/Levels"))
    ensureDirectoryExists(levelsRoot, "maps-levels-root")
    const packageFileIndex = buildPackageFileIndex(options.exportsRoot)

    const allLevelJsonFiles = collectJsonFiles(levelsRoot)
    const searchRoot = resolveRegionSearchRoot(allLevelJsonFiles, mapNames)
    const sourceJsonFiles = collectRegionSourceFiles(searchRoot, mapNames, options.limitChunks)

    if (sourceJsonFiles.length === 0) {
        throw new Error(`区域 ${region.name} 未找到可导出的源 json`)
    }

    rmSync(options.outputDir, { recursive: true, force: true })
    if (options.force) {
        rmSync(options.outputPath, { force: true })
    }

    const webRoot = join(options.outputDir, "web")
    mkdirSync(webRoot, { recursive: true })
    mkdirSync(MESH_CACHE_ROOT, { recursive: true })

    console.log(`区域 ${region.name} 搜索根目录: ${searchRoot}`)
    console.log(`源文件数: ${sourceJsonFiles.length}`)

    const allInstances = sourceJsonFiles
        .flatMap(filePath => {
            console.log(`解析源文件: ${relative(searchRoot, filePath)}`)
            return extractInstancesFromSceneFile(filePath)
        })
        .filter(instance => !shouldSkipMeshPackagePath(instance.meshPackagePath))

    if (allInstances.length === 0) {
        throw new Error(`区域 ${region.name} 未提取到任何静态网格实例`)
    }

    const selectedMeshPackagePaths = selectMeshPackagePaths(allInstances, options.limitMeshes)
    const instanceStatsByMesh = buildInstanceStatsByMesh(allInstances)
    const meshIdMap = new Map<string, string>()
    const meshOutputMap = new Map<string, string>()
    const skippedMeshes: MissingMeshReportItem[] = []
    const concreteMeshCache = new Map<string, { meshId: string; outputRelativePath: string }>()

    await prepareConcreteMeshOutputs(
        selectedMeshPackagePaths,
        options,
        options.umodelCacheRoot,
        webRoot,
        options.exportsRoot,
        packageFileIndex
    )

    for (let index = 0; index < selectedMeshPackagePaths.length; index += 1) {
        const packagePath = selectedMeshPackagePaths[index]
        const meshId = `m${index + 1}`
        try {
            const concretePackagePath = resolveConcretePackagePath(packagePath, options.exportsRoot, packageFileIndex)
            if (shouldSkipConcretePackagePath(concretePackagePath)) {
                skippedMeshes.push(
                    buildMissingMeshReportItem(
                        packagePath,
                        instanceStatsByMesh,
                        packageFileIndex,
                        `按具体资源路径过滤: ${concretePackagePath}`
                    )
                )
                continue
            }
            const cachedConcreteMesh = concreteMeshCache.get(concretePackagePath)
            if (cachedConcreteMesh) {
                meshIdMap.set(packagePath, cachedConcreteMesh.meshId)
                meshOutputMap.set(packagePath, cachedConcreteMesh.outputRelativePath)
                continue
            }

            const outputRelativePath = resolveBuiltMeshOutput(concretePackagePath, options, webRoot)
            meshIdMap.set(packagePath, meshId)
            meshOutputMap.set(packagePath, outputRelativePath)
            concreteMeshCache.set(concretePackagePath, { meshId, outputRelativePath })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`跳过无法导出的 mesh: ${packagePath}`)
            console.warn(message)
            skippedMeshes.push(buildMissingMeshReportItem(packagePath, instanceStatsByMesh, packageFileIndex, message))
        }
    }

    const exportedInstances = allInstances.filter(instance => meshIdMap.has(instance.meshPackagePath))
    if (exportedInstances.length === 0) {
        throw new Error(`区域 ${region.name} 没有成功导出的 mesh，无法生成运行时场景`)
    }

    const manifest: RegionSceneManifest = {
        regionId: region.id,
        regionName: region.name,
        meshes: Array.from(
            new Map(
                Array.from(meshIdMap.entries()).map(([packagePath, id]) => [
                    id,
                    { id, asset: `web/${meshOutputMap.get(packagePath)!.replace(/\\/g, "/")}` },
                ])
            ).values()
        ),
        instances: exportedInstances.map(instance => {
            const base: SceneInstanceManifest = {
                meshId: meshIdMap.get(instance.meshPackagePath)!,
                p: instance.position,
                s: instance.scale,
            }

            if (instance.quaternion) {
                base.q = instance.quaternion
            } else if (instance.rotator) {
                base.r = instance.rotator
            }

            return base
        }),
    }
    sanitizeManifest(manifest)

    dedupeSceneTextureFiles(webRoot)
    writeFileSync(join(options.outputDir, "scene.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    const bundlePath = writeSceneBundle(options.outputDir, options.outputPath, manifest)
    cleanupIntermediateOutputs(options.outputDir)
    rmSync(options.outputDir, { recursive: true, force: true })

    console.log(`单文件包: ${bundlePath}`)
    console.log(`meshes=${manifest.meshes.length} instances=${manifest.instances.length}`)
    if (skippedMeshes.length > 0) {
        skippedMeshes.sort((left, right) => right.instanceCount - left.instanceCount || left.packagePath.localeCompare(right.packagePath))
        console.log(`skippedMeshes=${skippedMeshes.length}`)
    }
}

/**
 * 解析命令行参数。
 */
function parseCliOptions(argv: string[]): CliOptions {
    const argMap = new Map<string, string>()
    const flags = new Set<string>()

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index]
        if (!token.startsWith("--")) continue

        const [key, inlineValue] = token.split("=", 2)
        if (inlineValue !== undefined) {
            argMap.set(key, inlineValue)
            continue
        }

        const nextToken = argv[index + 1]
        if (!nextToken || nextToken.startsWith("--")) {
            flags.add(key)
            continue
        }

        argMap.set(key, nextToken)
        index += 1
    }

    const regionId = Number(resolveRequiredArg(argMap, "--region-id"))
    const outputPath = resolveCliOutputPath(argMap, regionId)
    const outputDir = resolveCliWorkspaceDir(outputPath)

    return {
        regionId,
        exportsRoot: resolve(argMap.get("--exports-root") || "D:/dev/dna-unpack/Fmodel/Output/Exports"),
        umodelPath: resolve(argMap.get("--umodel-path") || "D:/dev/dna-unpack/umodel_win32/umodel.exe"),
        umodelCacheRoot: resolve(argMap.get("--umodel-cache-root") || DEFAULT_UMODEL_CACHE_ROOT),
        gameTag: argMap.get("--game-tag") || "ue4.27",
        outputPath,
        outputDir,
        force: flags.has("--force"),
        optimize: !flags.has("--skip-optimize"),
        limitChunks: argMap.has("--limit-chunks") ? Number(argMap.get("--limit-chunks")) : null,
        limitMeshes: argMap.has("--limit-meshes") ? Number(argMap.get("--limit-meshes")) : null,
        jobs: Math.max(1, Number(argMap.get("--jobs") || DEFAULT_EXPORT_JOBS)),
        textureSize: Math.max(256, Number(argMap.get("--texture-size") || DEFAULT_TEXTURE_SIZE)),
        textureWebpQuality: Math.min(100, Math.max(1, Number(argMap.get("--texture-quality") || DEFAULT_TEXTURE_WEBP_QUALITY))),
        textureWebpEffort: Math.min(100, Math.max(0, Number(argMap.get("--texture-effort") || DEFAULT_TEXTURE_WEBP_EFFORT))),
    }
}

/**
 * 解析最终 `.umapscene` 输出路径。
 */
function resolveCliOutputPath(argMap: Map<string, string>, regionId: number): string {
    const explicitOutput = argMap.get("--output") || argMap.get("--output-file")
    if (explicitOutput) {
        return ensureSceneBundlePath(resolve(explicitOutput))
    }

    const legacyOutputDir = argMap.get("--output-dir")
    if (legacyOutputDir) {
        const legacyPath = resolve(legacyOutputDir)
        if (legacyPath.toLowerCase().endsWith(".umapscene")) {
            return legacyPath
        }
        return join(legacyPath, "scene.umapscene")
    }

    return resolve(join(".umap-export", `region-${regionId}.umapscene`))
}

/**
 * 为导出流程生成临时工作目录，最终仅保留单文件产物。
 */
function resolveCliWorkspaceDir(outputPath: string): string {
    const bundleBaseName = basename(outputPath, extname(outputPath))
    return join(dirname(outputPath), `.${bundleBaseName}.tmp`)
}

/**
 * 确保最终输出扩展名为 `.umapscene`。
 */
function ensureSceneBundlePath(outputPath: string): string {
    if (outputPath.toLowerCase().endsWith(".umapscene")) {
        return outputPath
    }
    return `${outputPath}.umapscene`
}

/**
 * 递归收集目录下的 json 文件。
 */
function collectJsonFiles(rootDirectory: string): string[] {
    const results: string[] = []
    const stack = [rootDirectory]

    while (stack.length > 0) {
        const current = stack.pop()!
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const fullPath = join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(fullPath)
                continue
            }
            if (!entry.name.endsWith(".json") || entry.name.endsWith("_BuiltData.json")) continue
            if (!isSceneChunkJsonFile(entry.name)) continue
            results.push(fullPath)
        }
    }

    return results.sort()
}

/**
 * 过滤掉关卡目录中混入的材质、贴图、网格等资源导出 json。
 */
function isSceneChunkJsonFile(fileName: string) {
    const fileBaseName = basename(fileName, ".json")
    return !/^(MI|M|MF|T|SM|SK|ABP|AnimBP|MaterialFunction)_/i.test(fileBaseName)
}

/**
 * 基于 subregion.map 命中结果推导该区域的搜索根目录。
 */
function resolveRegionSearchRoot(allLevelJsonFiles: string[], mapNames: string[]): string {
    const matchedFiles: string[] = []

    for (const mapName of mapNames) {
        const matches = allLevelJsonFiles.filter(filePath => basename(filePath, ".json").includes(mapName))
        if (matches.length === 0) {
            throw new Error(`未找到 map=${mapName} 对应的关卡 json`)
        }
        matchedFiles.push(...matches)
    }

    return commonAncestorDirectory(matchedFiles)
}

/**
 * 收集区域导出所需源文件。
 */
function collectRegionSourceFiles(searchRoot: string, mapNames: string[], limitChunks: number | null): string[] {
    const sourceFiles: string[] = []
    const allJsonFiles = collectJsonFiles(searchRoot)
    const matchedContainers = new Set<string>()

    for (const filePath of allJsonFiles) {
        const relativeFilePath = relative(searchRoot, filePath).replaceAll("\\", "/")
        const fileBaseName = basename(filePath, ".json")
        const hitsMap = mapNames.some(mapName => relativeFilePath.includes(mapName) || fileBaseName.includes(mapName))
        if (!hitsMap) continue
        matchedContainers.add(resolveLayerContainer(relativeFilePath))
    }

    for (const filePath of allJsonFiles) {
        const relativeFilePath = relative(searchRoot, filePath).replaceAll("\\", "/")
        const pathSegments = relativeFilePath.split("/")
        const layerDirectory = resolveLayerDirectory(pathSegments)
        const fileBaseName = basename(filePath, ".json")
        const isGlobalLayer = GLOBAL_LAYER_DIRECTORIES.has(layerDirectory)
        const isMapLayer = MAP_LAYER_DIRECTORIES.has(layerDirectory) || dirname(filePath) === searchRoot
        const hitsMap = mapNames.some(mapName => relativeFilePath.includes(mapName) || fileBaseName.includes(mapName))
        const container = resolveLayerContainer(relativeFilePath)

        if (isGlobalLayer && (hitsMap || matchedContainers.has(container))) {
            sourceFiles.push(filePath)
            continue
        }

        if (isMapLayer && hitsMap) {
            sourceFiles.push(filePath)
        }
    }

    const uniqueFiles = Array.from(new Set(sourceFiles)).sort()
    return limitChunks === null ? uniqueFiles : uniqueFiles.slice(0, limitChunks)
}

/**
 * 解析关卡分层文件所属的容器目录，用于关联共享的 Art_Data。
 */
function resolveLayerContainer(relativeFilePath: string) {
    const segments = relativeFilePath.split("/")
    if (segments.length >= 2 && isKnownLayerDirectory(segments[1])) {
        return segments[0]
    }
    return ""
}

/**
 * 解析分层目录名，兼容 `LevelRoot/Art_Data/*.json` 这类二级结构。
 */
function resolveLayerDirectory(pathSegments: string[]) {
    if (pathSegments[1] && isKnownLayerDirectory(pathSegments[1])) {
        return pathSegments[1]
    }
    return pathSegments[0] || ""
}

/**
 * 判断目录名是否属于关卡分层目录。
 */
function isKnownLayerDirectory(directoryName: string) {
    return GLOBAL_LAYER_DIRECTORIES.has(directoryName) || MAP_LAYER_DIRECTORIES.has(directoryName)
}

/**
 * 从单个 json 提取可直接用于运行时的网格实例。
 */
function extractInstancesFromSceneFile(filePath: string): ExtractedInstance[] {
    const items = JSON.parse(readFileSync(filePath, "utf8")) as UMapExportItem[]
    const sourceLayer = basename(dirname(filePath))
    const nameIndex = buildNameIndex(items)
    const actorTypeIndex = buildActorTypeIndex(items)
    const worldTransformCache = new Map<string, Matrix4>()
    const rootComponentCache = new Map<string, UMapExportItem | null>()

    const instances: ExtractedInstance[] = []
    const consumedStaticComponents = new Set<string>()

    for (const item of items) {
        if (item.Type !== "StaticMeshActor" || !item.Name) continue
        const rootComponent = resolveActorRootComponent(item, nameIndex)
        if (!rootComponent) continue

        const staticMeshRef = readStaticMeshReference(rootComponent)
        if (!isExportableMeshObjectPath(staticMeshRef?.ObjectPath)) continue

        const worldMatrix = resolveComponentWorldMatrix(rootComponent, nameIndex, worldTransformCache)
        const transform = decomposeWorldMatrix(worldMatrix)
        instances.push({
            meshPackagePath: normalizeObjectPathToPackagePath(staticMeshRef.ObjectPath),
            position: transform.position,
            scale: transform.scale,
            sourceLayer,
            rotator: transform.rotator,
        })
        consumedStaticComponents.add(makeComponentKey(rootComponent))
        rootComponentCache.set(item.Name, rootComponent)
    }

    for (const item of items) {
        if (!item.Name || item.Type !== "StaticMeshComponent") continue
        if (consumedStaticComponents.has(makeComponentKey(item))) continue

        const staticMeshRef = readStaticMeshReference(item)
        if (!isExportableMeshObjectPath(staticMeshRef?.ObjectPath)) continue

        if (item.Outer && actorTypeIndex.get(item.Outer) === "StaticMeshActor") {
            continue
        }

        const worldMatrix = resolveComponentWorldMatrix(item, nameIndex, worldTransformCache)
        const transform = decomposeWorldMatrix(worldMatrix)
        instances.push({
            meshPackagePath: normalizeObjectPathToPackagePath(staticMeshRef.ObjectPath),
            position: transform.position,
            scale: transform.scale,
            sourceLayer,
            rotator: transform.rotator,
        })
    }

    for (const item of items) {
        const staticMeshRef = readStaticMeshReference(item)
        const perInstanceData = item.PerInstanceSMData || (item.Properties?.PerInstanceSMData as UMapExportItem["PerInstanceSMData"])
        if (!isExportableMeshObjectPath(staticMeshRef?.ObjectPath) || !perInstanceData?.length) continue

        const componentWorldMatrix = resolveComponentWorldMatrix(item, nameIndex, worldTransformCache)
        for (const entry of perInstanceData) {
            const instanceMatrix = matrixFromTransformData(entry.TransformData)
            const worldMatrix = componentWorldMatrix.clone().multiply(instanceMatrix)
            const transform = decomposeWorldMatrix(worldMatrix)

            instances.push({
                meshPackagePath: normalizeObjectPathToPackagePath(staticMeshRef.ObjectPath),
                position: transform.position,
                scale: transform.scale,
                sourceLayer,
                quaternion: transform.quaternion,
            })
        }
    }

    return instances
}

/**
 * 按层级和覆盖率挑选要导出的 mesh。
 */
function selectMeshPackagePaths(instances: ExtractedInstance[], limitMeshes: number | null): string[] {
    const stats = new Map<string, { count: number; bestPriority: number }>()

    for (const instance of instances) {
        const existing = stats.get(instance.meshPackagePath) || { count: 0, bestPriority: Number.NEGATIVE_INFINITY }
        existing.count += 1
        existing.bestPriority = Math.max(existing.bestPriority, getMeshSelectionPriority(instance.meshPackagePath, instance.sourceLayer))
        stats.set(instance.meshPackagePath, existing)
    }

    const ordered = Array.from(stats.entries())
        .sort((left, right) => {
            if (right[1].bestPriority !== left[1].bestPriority) {
                return right[1].bestPriority - left[1].bestPriority
            }
            if (right[1].count !== left[1].count) {
                return right[1].count - left[1].count
            }
            return left[0].localeCompare(right[0])
        })
        .map(([packagePath]) => packagePath)

    return limitMeshes === null ? ordered : ordered.slice(0, limitMeshes)
}

/**
 * 统计每个 mesh 的实例数和来源层。
 */
function buildInstanceStatsByMesh(instances: ExtractedInstance[]) {
    const stats = new Map<string, { instanceCount: number; sourceLayers: Set<string> }>()
    for (const instance of instances) {
        const current = stats.get(instance.meshPackagePath) || { instanceCount: 0, sourceLayers: new Set<string>() }
        current.instanceCount += 1
        current.sourceLayers.add(instance.sourceLayer)
        stats.set(instance.meshPackagePath, current)
    }
    return stats
}

/**
 * 生成缺失 mesh 报告项。
 */
function buildMissingMeshReportItem(
    packagePath: string,
    statsByMesh: Map<string, { instanceCount: number; sourceLayers: Set<string> }>,
    packageFileIndex: PackageFileIndex,
    reason: string
): MissingMeshReportItem {
    const stats = statsByMesh.get(packagePath)
    const baseName = basename(packagePath, ".uasset")
    const candidates = (packageFileIndex.byBaseName.get(baseName) || []).slice(0, 8).map(filePath => filePath.replace(/\\/g, "/"))

    return {
        packagePath,
        instanceCount: stats?.instanceCount || 0,
        sourceLayers: Array.from(stats?.sourceLayers || []).sort(),
        candidates,
        reason,
    }
}

/**
 * 计算 mesh 选样优先级。
 */
function getMeshSelectionPriority(packagePath: string, sourceLayer: string): number {
    let priority = 0

    if (sourceLayer === "Layout_Data") priority += 1000
    else if (sourceLayer === "Art_Data") priority += 800
    else if (sourceLayer === "Effect_Data") priority += 500
    else if (sourceLayer === "Design_Data") priority += 300
    else priority += 100

    if (packagePath.includes("/Plants/")) priority -= 500
    if (packagePath.includes("BreakableItems")) priority -= 400
    if (packagePath.includes("BasicShapes")) priority -= 350
    if (packagePath.includes("/Game/LookDev/")) priority += 150
    if (packagePath.includes("/BH_Sew/")) priority += 120
    if (packagePath.includes("LandProxy")) priority += 250

    return priority
}

/**
 * 过滤明显的占位代理体，避免导出后出现覆盖整图的大方块。
 */
function shouldSkipMeshPackagePath(packagePath: string) {
    const normalizedPackagePath = packagePath.replace(/\\/g, "/")
    return (
        normalizedPackagePath.includes("/EN000_Special/Temple/Mesh/SM_Layout_") ||
        normalizedPackagePath.includes("/Mesh/SM_Layout_") ||
        normalizedPackagePath.includes("Engine/BasicShapes/Cube") ||
        normalizedPackagePath.includes("Engine/Content/BasicShapes/Cube") ||
        normalizedPackagePath.includes("LandProxy") ||
        normalizedPackagePath.includes("/Proxy/") ||
        normalizedPackagePath.includes("_Proxy") ||
        normalizedPackagePath.endsWith("/SM_Sew_LandProxy.uasset")
    )
}

/**
 * 针对解析后的真实资源路径做二次过滤，拦截 LookDev 回落到 Temple 布局模板的情况。
 */
function shouldSkipConcretePackagePath(packagePath: string) {
    const normalizedPackagePath = packagePath.replace(/\\/g, "/")
    return normalizedPackagePath.includes("/EN000_Special/Temple/Mesh/SM_Layout_")
}

/**
 * 生成按名称分组的索引。
 */
function buildNameIndex(items: UMapExportItem[]): Map<string, UMapExportItem[]> {
    const index = new Map<string, UMapExportItem[]>()
    for (const item of items) {
        if (!item.Name) continue
        const bucket = index.get(item.Name) || []
        bucket.push(item)
        index.set(item.Name, bucket)
    }
    return index
}

/**
 * 记录 Actor 名称与类型，便于过滤重复组件。
 */
function buildActorTypeIndex(items: UMapExportItem[]): Map<string, string> {
    const index = new Map<string, string>()
    for (const item of items) {
        if (!item.Name || !item.Type) continue
        index.set(item.Name, item.Type)
    }
    return index
}

/**
 * 读取组件上的静态网格引用。
 */
function readStaticMeshReference(item: UMapExportItem): ObjectReference | undefined {
    return (item.Properties?.StaticMesh as ObjectReference | undefined) || undefined
}

/**
 * 从 Actor 上解析根组件。
 */
function resolveActorRootComponent(item: UMapExportItem, nameIndex: Map<string, UMapExportItem[]>): UMapExportItem | null {
    const rootReference =
        (item.Properties?.RootComponent as ObjectReference | undefined) ||
        (item.Properties?.StaticMeshComponent as ObjectReference | undefined)
    return resolveObjectReference(rootReference, item.Name, nameIndex)
}

/**
 * 基于 ObjectReference 定位导出项。
 */
function resolveObjectReference(
    reference: ObjectReference | undefined,
    ownerName: string | undefined,
    nameIndex: Map<string, UMapExportItem[]>
): UMapExportItem | null {
    if (!reference?.ObjectName) return null
    const match = reference.ObjectName.match(/'([^']+)'/)
    if (!match) return null
    const referencePath = match[1]
    const referenceSegments = referencePath.split(".")
    const shortName = referenceSegments.at(-1)
    if (!shortName) return null
    const referencedOuterName = referenceSegments.at(-2)

    const candidates = nameIndex.get(shortName) || []
    return (
        candidates.find(item => item.Outer === referencedOuterName) ||
        candidates.find(item => item.Outer === ownerName) ||
        candidates[0] ||
        null
    )
}

/**
 * 递归解析组件世界矩阵。
 */
function resolveComponentWorldMatrix(
    item: UMapExportItem,
    nameIndex: Map<string, UMapExportItem[]>,
    cache: Map<string, Matrix4>,
    activeKeys = new Set<string>()
): Matrix4 {
    const cacheKey = makeComponentKey(item)
    const cached = cache.get(cacheKey)
    if (cached) return cached.clone()
    if (activeKeys.has(cacheKey)) {
        return matrixFromRelativeTransform(item.Properties || {})
    }

    activeKeys.add(cacheKey)

    const localMatrix = matrixFromRelativeTransform(item.Properties || {})
    const ownerActor = item.Outer ? (nameIndex.get(item.Outer) || []).find(candidate => candidate.Name === item.Outer) || null : null
    const attachParent = resolveObjectReference(item.Properties?.AttachParent as ObjectReference | undefined, item.Outer, nameIndex)
    const shouldIgnoreInstancedAttachParent =
        (item.Type === "InstancedStaticMeshComponent" || item.Type === "HierarchicalInstancedStaticMeshComponent") &&
        (attachParent?.Type === "InstancedStaticMeshComponent" || attachParent?.Type === "HierarchicalInstancedStaticMeshComponent")
    const ownerActorMatrix = ownerActor ? matrixFromRelativeTransform(ownerActor.Properties || {}) : new Matrix4().identity()
    const worldMatrix = attachParent
        ? shouldIgnoreInstancedAttachParent
            ? ownerActorMatrix.clone().multiply(localMatrix)
            : resolveComponentWorldMatrix(attachParent, nameIndex, cache, activeKeys).multiply(localMatrix)
        : ownerActorMatrix.clone().multiply(localMatrix)

    cache.set(cacheKey, worldMatrix.clone())
    activeKeys.delete(cacheKey)
    return worldMatrix
}

/**
 * 根据组件相对变换构建矩阵。
 */
function matrixFromRelativeTransform(properties: Record<string, unknown>): Matrix4 {
    const position = toTuple(properties.RelativeLocation as TransformVector | undefined, 0)
    const scale = toTuple(properties.RelativeScale3D as TransformVector | undefined, 1)
    const rotator = toRotatorTuple(properties.RelativeRotation as TransformRotator | undefined)
    const quaternion = quaternionFromRotator(rotator)
    return composeMatrix(position, quaternion, scale)
}

/**
 * 根据 PerInstanceSMData.TransformData 构建矩阵。
 */
function matrixFromTransformData(transformData: TransformData | undefined): Matrix4 {
    const position = toTuple(transformData?.Translation, 0)
    const scale = toTuple(transformData?.Scale3D, 1)
    const rotation = transformData?.Rotation || {}
    const quaternion: [number, number, number, number] = [
        Number(rotation.X || 0),
        Number(rotation.Y || 0),
        Number(rotation.Z || 0),
        Number(rotation.W ?? 1),
    ]
    return composeMatrix(position, quaternion, scale)
}

/**
 * 分解世界矩阵，生成运行时最小变换。
 */
function decomposeWorldMatrix(matrix: Matrix4): {
    position: [number, number, number]
    scale: [number, number, number]
    rotator: [number, number, number]
    quaternion: [number, number, number, number]
} {
    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3()
    matrix.decompose(position, quaternion, scale)

    return {
        position: [position.x, position.y, position.z],
        scale: [scale.x, scale.y, scale.z],
        rotator: rotatorFromQuaternion(quaternion),
        quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    }
}

/**
 * 组合位置、旋转、缩放矩阵。
 */
function composeMatrix(
    position: [number, number, number],
    quaternion: [number, number, number, number],
    scale: [number, number, number]
): Matrix4 {
    return new Matrix4().compose(
        new Vector3(position[0], position[1], position[2]),
        new Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]),
        new Vector3(scale[0], scale[1], scale[2])
    )
}

/**
 * Unreal Rotator 转四元数。
 */
function quaternionFromRotator([pitch, yaw, roll]: [number, number, number]): [number, number, number, number] {
    const pitchRad = degreesToRadians(pitch) / 2
    const yawRad = degreesToRadians(yaw) / 2
    const rollRad = degreesToRadians(roll) / 2

    const cp = Math.cos(pitchRad)
    const sp = Math.sin(pitchRad)
    const cy = Math.cos(yawRad)
    const sy = Math.sin(yawRad)
    const cr = Math.cos(rollRad)
    const sr = Math.sin(rollRad)

    return [sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy, cr * cp * cy + sr * sp * sy]
}

/**
 * 四元数转回 Unreal Rotator。
 */
function rotatorFromQuaternion(quaternion: Quaternion): [number, number, number] {
    const x = quaternion.x
    const y = quaternion.y
    const z = quaternion.z
    const w = quaternion.w

    const sinrCosp = 2 * (w * x + y * z)
    const cosrCosp = 1 - 2 * (x * x + y * y)
    const roll = Math.atan2(sinrCosp, cosrCosp)

    const sinp = 2 * (w * y - z * x)
    const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)

    const sinyCosp = 2 * (w * z + x * y)
    const cosyCosp = 1 - 2 * (y * y + z * z)
    const yaw = Math.atan2(sinyCosp, cosyCosp)

    return [radiansToDegrees(pitch), radiansToDegrees(yaw), radiansToDegrees(roll)]
}

/**
 * Unreal ObjectPath 归一化为包路径。
 */
function normalizeObjectPathToPackagePath(objectPath: string): string {
    const normalized = objectPath.replace(/\\/g, "/").replace(/\.[0-9]+$/, "")
    return normalized.endsWith(".uasset") ? normalized : `${normalized}.uasset`
}

/**
 * 判断 ObjectPath 是否指向真实可导出的静态网格资源。
 */
function isExportableMeshObjectPath(objectPath: string | undefined): objectPath is string {
    if (!objectPath) return false

    const normalizedObjectPath = objectPath.replace(/\\/g, "/")
    if (normalizedObjectPath.startsWith("EM/Content/Maps/Levels/")) {
        return false
    }
    if (normalizedObjectPath.includes("/Asset/Char/")) {
        return false
    }

    return true
}

/**
 * 包路径映射到相对 glTF / glb 路径。
 */
function normalizePackagePathToRelativeAssetPath(packagePath: string, extension: ".gltf" | ".glb"): string {
    const normalizedPackagePath = packagePath.replace(/\\/g, "/")
    const contentRelativePackagePath = normalizedPackagePath.replace(/^[^/]+\/Content\//i, "")
    return contentRelativePackagePath.replace(/\.uasset$/i, extension)
}

/**
 * 异步执行外部命令，并继承 stdout/stderr 便于观察导出进度。
 */
function runCommand(executablePath: string, args: string[]) {
    return new Promise<void>((resolvePromise, rejectPromise) => {
        const child = spawn(executablePath, args, { stdio: "inherit" })

        child.once("error", error => {
            rejectPromise(error)
        })

        child.once("close", exitCode => {
            if (exitCode === 0) {
                resolvePromise()
                return
            }
            rejectPromise(new Error(`命令执行失败(exit=${exitCode}): ${executablePath}`))
        })
    })
}

/**
 * 同步执行短命令，适合单个材质烘焙。
 */
function runCommandSync(executablePath: string, args: string[]) {
    const result = spawn(executablePath, args, { stdio: "inherit" })
    return new Promise<void>((resolvePromise, rejectPromise) => {
        result.once("error", error => {
            rejectPromise(error)
        })
        result.once("close", exitCode => {
            if (exitCode === 0) {
                resolvePromise()
                return
            }
            rejectPromise(new Error(`命令执行失败(exit=${exitCode}): ${executablePath}`))
        })
    })
}

/**
 * 解析当前环境可用的 Python 命令。
 */
function resolvePythonExecutable() {
    return process.platform === "win32" ? "python" : "python3"
}

/**
 * 按 mesh 模块目录使用 wildcard 调用 UModel，一次导出整个模块。
 */
async function exportMeshModuleWithUModel(moduleDirectory: string, options: CliOptions, rawRoot: string) {
    const args = [
        "-export",
        "-gltf",
        "-png",
        "-nooverwrite",
        `-game=${options.gameTag}`,
        `-out=${windowsPath(rawRoot)}`,
        `-path=${windowsPath(options.exportsRoot)}`,
        `${moduleDirectory.replace(/\\/g, "/")}/*.uasset`,
    ]

    console.log(`UModel 模块导出: ${moduleDirectory}`)
    await runCommand(options.umodelPath, args)
}

/**
 * 将别名包路径解析到导出目录中的真实资源包。
 */
function resolveConcretePackagePath(packagePath: string, exportsRoot: string, packageFileIndex: PackageFileIndex): string {
    const normalizedPackagePath = packagePath.replace(/\\/g, "/")
    if (normalizedPackagePath.startsWith("EM/Content/Maps/Levels/")) {
        return normalizedPackagePath
    }

    const aliasPackagePath = PACKAGE_ALIAS_MAP.get(normalizedPackagePath)
    if (aliasPackagePath) {
        const aliasFullPath = join(exportsRoot, aliasPackagePath)
        if (statSync(aliasFullPath, { throwIfNoEntry: false })?.isFile()) {
            return aliasPackagePath
        }
    }

    const directFullPath = join(exportsRoot, normalizedPackagePath)
    if (statSync(directFullPath, { throwIfNoEntry: false })?.isFile()) {
        return normalizedPackagePath
    }

    const baseName = basename(normalizedPackagePath, ".uasset")
    const exactMatches = packageFileIndex.byFileName.get(`${baseName}.uasset`) || []
    if (exactMatches.length > 0) {
        exactMatches.sort((left, right) => left.length - right.length)
        return exactMatches[0].replace(/\\/g, "/")
    }

    const fuzzyMatches = packageFileIndex.byBaseName.get(baseName) || []
    if (fuzzyMatches.length > 0) {
        fuzzyMatches.sort((left, right) => left.length - right.length)
        return fuzzyMatches[0].replace(/\\/g, "/")
    }

    return normalizedPackagePath
}

/**
 * 调用 glTF Transform 压缩导出结果。
 */
async function optimizeRawGltf(rawRelativePath: string, rawRoot: string, webRoot: string, options: CliOptions): Promise<string> {
    const optimizedRelativePath = rawRelativePath
    const inputPath = join(rawRoot, rawRelativePath)
    const outputPath = join(webRoot, optimizedRelativePath)
    const stagingId = createHash("sha1").update(optimizedRelativePath).digest("hex")
    const stagingRoot = join(webRoot, ".staging", stagingId)
    const optimizedStagePath = join(stagingRoot, "optimized.gltf")
    const resizedStagePath = join(stagingRoot, "resized.gltf")
    mkdirSync(dirname(outputPath), { recursive: true })
    mkdirSync(stagingRoot, { recursive: true })

    const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
    await runCommand(pnpmExecutable, [
        "exec",
        "gltf-transform",
        "optimize",
        windowsPath(inputPath),
        windowsPath(optimizedStagePath),
        "--compress",
        "meshopt",
        "--texture-compress",
        "false",
        "--palette",
        "false",
        "--texture-size",
        `${options.textureSize}`,
    ])
    await runCommand(pnpmExecutable, [
        "exec",
        "gltf-transform",
        "resize",
        windowsPath(optimizedStagePath),
        windowsPath(resizedStagePath),
        "--width",
        `${options.textureSize}`,
        "--height",
        `${options.textureSize}`,
    ])
    await runCommand(pnpmExecutable, [
        "exec",
        "gltf-transform",
        "webp",
        windowsPath(resizedStagePath),
        windowsPath(outputPath),
        "--quality",
        `${options.textureWebpQuality}`,
        "--effort",
        `${options.textureWebpEffort}`,
    ])
    rmSync(stagingRoot, { recursive: true, force: true })

    return optimizedRelativePath
}

/**
 * 在受限并发下执行一组异步任务。
 */
async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
    if (items.length === 0) return

    let nextIndex = 0
    const workerCount = Math.min(concurrency, items.length)

    await Promise.all(
        Array.from({ length: workerCount }, async () => {
            while (nextIndex < items.length) {
                const currentIndex = nextIndex
                nextIndex += 1
                await worker(items[currentIndex], currentIndex)
            }
        })
    )
}

/**
 * 将包路径按所属模块目录分组。
 */
function groupPackagePathsByModuleDirectory(packagePaths: string[]) {
    const grouped = new Map<string, string[]>()

    for (const packagePath of packagePaths) {
        const moduleDirectory = dirname(packagePath).replace(/\\/g, "/")
        const bucket = grouped.get(moduleDirectory) || []
        bucket.push(packagePath)
        grouped.set(moduleDirectory, bucket)
    }

    return grouped
}

/**
 * 为模块导出生成稳定的临时工作目录。
 */
function createModuleRawRoot(rawRoot: string, _moduleDirectory: string) {
    return rawRoot
}

/**
 * 判断模块内目标 mesh 是否都已存在于原始导出缓存。
 */
function hasCompleteModuleRawCache(modulePackagePaths: string[], rawRoot: string) {
    return modulePackagePaths.every(packagePath => {
        const rawRelativePath = normalizePackagePathToRelativeAssetPath(packagePath, ".gltf")
        return statSync(join(rawRoot, rawRelativePath), { throwIfNoEntry: false })?.isFile() || false
    })
}

/**
 * 批量构建缺失的 mesh 输出，并写入缓存。
 */
async function buildMissingMeshOutputs(concretePackagePaths: string[], options: CliOptions, rawRoot: string, webRoot: string) {
    const missingPackagePaths = concretePackagePaths.filter(packagePath => {
        const relativePath = normalizePackagePathToRelativeAssetPath(packagePath, ".gltf")
        return !statSync(join(MESH_CACHE_ROOT, relativePath), { throwIfNoEntry: false })?.isFile()
    })

    if (missingPackagePaths.length === 0) return

    const moduleGroups = Array.from(groupPackagePathsByModuleDirectory(missingPackagePaths).entries())
    await runWithConcurrency(moduleGroups, options.jobs, async ([moduleDirectory, modulePackagePaths]) => {
        const moduleRawRoot = createModuleRawRoot(rawRoot, moduleDirectory)
        if (!hasCompleteModuleRawCache(modulePackagePaths, moduleRawRoot)) {
            mkdirSync(moduleRawRoot, { recursive: true })
            await exportMeshModuleWithUModel(moduleDirectory, options, moduleRawRoot)
        }

        for (const packagePath of modulePackagePaths) {
            const rawRelativePath = resolveExportedRelativePath(moduleRawRoot, packagePath, ".gltf")
            await injectMaterialTexturesIntoRawGltf(rawRelativePath, moduleRawRoot)
            const builtRelativePath = options.optimize
                ? await optimizeRawGltf(rawRelativePath, moduleRawRoot, webRoot, options)
                : rawRelativePath
            if (!options.optimize) {
                copyRelativeFiles(moduleRawRoot, webRoot, collectAssetDependencyRelativePaths(moduleRawRoot, rawRelativePath))
            }
            cacheBuiltAssetOutput(builtRelativePath, webRoot)
        }
    })
}

/**
 * 基于导出根目录建立一次性包索引，避免后续每次全盘扫描。
 */
function buildPackageFileIndex(exportsRoot: string): PackageFileIndex {
    const byFileName = new Map<string, string[]>()
    const byBaseName = new Map<string, string[]>()
    const stack = [exportsRoot]

    while (stack.length > 0) {
        const current = stack.pop()!
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const fullPath = join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(fullPath)
                continue
            }
            if (!entry.name.endsWith(".uasset")) continue

            const relativePath = relative(exportsRoot, fullPath).replace(/\\/g, "/")
            const exactBucket = byFileName.get(entry.name) || []
            exactBucket.push(relativePath)
            byFileName.set(entry.name, exactBucket)

            const baseName = basename(entry.name, ".uasset")
            const prefixBucket = byBaseName.get(baseName) || []
            prefixBucket.push(relativePath)
            byBaseName.set(baseName, prefixBucket)
        }
    }

    return { byFileName, byBaseName }
}

/**
 * 预热未缓存的真实资源输出，减少首轮全量导出中的 umodel 冷启动次数。
 */
async function warmConcreteMeshOutputs(concretePackagePaths: string[], options: CliOptions, rawRoot: string, webRoot: string) {
    await buildMissingMeshOutputs(concretePackagePaths, options, rawRoot, webRoot)
}

/**
 * 预先构建真实资源缓存，再逐个映射回逻辑 mesh。
 */
async function prepareConcreteMeshOutputs(
    selectedMeshPackagePaths: string[],
    options: CliOptions,
    rawRoot: string,
    webRoot: string,
    exportsRoot: string,
    packageFileIndex: PackageFileIndex
) {
    const concretePackagePaths = Array.from(
        new Set(selectedMeshPackagePaths.map(packagePath => resolveConcretePackagePath(packagePath, exportsRoot, packageFileIndex)))
    ).filter(
        packagePath =>
            packagePathExists(exportsRoot, packagePath) ||
            statSync(join(MESH_CACHE_ROOT, normalizePackagePathToRelativeAssetPath(packagePath, ".gltf")), {
                throwIfNoEntry: false,
            })?.isFile()
    )

    await warmConcreteMeshOutputs(concretePackagePaths, options, rawRoot, webRoot)
}

/**
 * 根据已构建输出返回目标相对路径。
 */
function resolveBuiltMeshOutput(concretePackagePath: string, _options: CliOptions, webRoot: string): string {
    const builtRelativePath = normalizePackagePathToRelativeAssetPath(concretePackagePath, ".gltf")
    const builtFullPath = join(webRoot, builtRelativePath)
    const cachedFullPath = join(MESH_CACHE_ROOT, builtRelativePath)

    if (statSync(builtFullPath, { throwIfNoEntry: false })?.isFile()) {
        return builtRelativePath
    }

    if (statSync(cachedFullPath, { throwIfNoEntry: false })?.isFile()) {
        restoreBuiltAssetOutputFromCache(builtRelativePath, webRoot)
        return builtRelativePath
    }

    const targetFileName = `${basename(concretePackagePath, ".uasset")}.gltf`
    const webMatches = collectMatchingFiles(webRoot, targetFileName)
    if (webMatches.length > 0) {
        webMatches.sort((left, right) => left.length - right.length)
        return relative(webRoot, webMatches[0]).replace(/\\/g, "/")
    }

    const cacheMatches = collectMatchingFiles(MESH_CACHE_ROOT, targetFileName)
    if (cacheMatches.length > 0) {
        cacheMatches.sort((left, right) => left.length - right.length)
        const matchedRelativePath = relative(MESH_CACHE_ROOT, cacheMatches[0]).replace(/\\/g, "/")
        restoreBuiltAssetOutputFromCache(matchedRelativePath, webRoot)
        return matchedRelativePath
    }

    throw new Error(`缺少已构建输出: ${concretePackagePath}`)
}

/**
 * 将 umodel 导出的 .mat 与贴图文件回填到原始 glTF，避免 glTF 本身丢失纹理绑定。
 */
async function injectMaterialTexturesIntoRawGltf(rawRelativePath: string, rawRoot: string) {
    const gltfPath = join(rawRoot, rawRelativePath)
    const gltf = JSON.parse(readFileSync(gltfPath, "utf8")) as Record<string, any>
    const materials = Array.isArray(gltf.materials) ? gltf.materials : []
    if (materials.length === 0) return

    const gltfDirectory = dirname(gltfPath)
    const images = Array.isArray(gltf.images) ? gltf.images : []
    const textures = Array.isArray(gltf.textures) ? gltf.textures : []
    const imageIndexByUri = new Map(images.map((image: any, index: number) => [image.uri, index]))

    const ensureTextureIndex = (textureName: string) => {
        const imageFullPath = resolveExportedTexturePath(rawRoot, textureName)
        if (!imageFullPath) return null
        const imageUri = relative(gltfDirectory, imageFullPath).replace(/\\/g, "/")

        let imageIndex = imageIndexByUri.get(imageUri)
        if (imageIndex === undefined) {
            imageIndex = images.length
            images.push({ uri: imageUri })
            imageIndexByUri.set(imageUri, imageIndex)
        }

        const existingTextureIndex = textures.findIndex((texture: any) => texture.source === imageIndex)
        if (existingTextureIndex !== -1) return existingTextureIndex

        const textureIndex = textures.length
        textures.push({ source: imageIndex })
        return textureIndex
    }

    for (const material of materials) {
        const materialRelativePath = findMaterialFileRelativePath(rawRoot, rawRelativePath, material.name || "")
        const channels = parseMaterialChannels(join(rawRoot, materialRelativePath || ""))
        if (!channels) continue

        const baseColorTextureName = pickBaseColorTextureName(channels)
        const alphaTextureName = pickAlphaTextureName(channels)
        const normalTextureName = pickNormalTextureName(channels)
        const metallicRoughnessTextureName = pickMetallicRoughnessTextureName(channels)
        const bakedMaskedTexture = await buildMaskedPlantBakedTexture(rawRoot, rawRelativePath, material.name || "", channels)
        const baseColorTextureIndex = bakedMaskedTexture
            ? ensureTextureIndex(bakedMaskedTexture.bakedTextureName)
            : baseColorTextureName
              ? ensureTextureIndex(baseColorTextureName)
              : null
        const alphaTextureIndex = bakedMaskedTexture ? null : alphaTextureName ? ensureTextureIndex(alphaTextureName) : null
        const normalTextureIndex = normalTextureName ? ensureTextureIndex(normalTextureName) : null

        if (baseColorTextureIndex !== null) {
            material.pbrMetallicRoughness = material.pbrMetallicRoughness || {}
            material.pbrMetallicRoughness.baseColorFactor = bakedMaskedTexture
                ? [1, 1, 1, 1]
                : pickBaseColorFactor(channels, baseColorTextureName) || [1, 1, 1, 1]
            material.pbrMetallicRoughness.metallicFactor = 0
            material.pbrMetallicRoughness.roughnessFactor = 1
            material.pbrMetallicRoughness.baseColorTexture = { index: baseColorTextureIndex }
        }
        if (channels.BlendMode === "MASK") {
            material.alphaMode = "MASK"
            material.alphaCutoff = 0.3333
        } else if (channels.BlendMode === "BLEND") {
            material.alphaMode = "BLEND"
        }
        if (channels.TwoSided) {
            material.doubleSided = true
        }
        if (normalTextureIndex !== null) {
            material.normalTexture = { index: normalTextureIndex }
        }
        if (bakedMaskedTexture) {
            if (material.pbrMetallicRoughness?.metallicRoughnessTexture) {
                delete material.pbrMetallicRoughness.metallicRoughnessTexture
            }
        } else if (metallicRoughnessTextureName) {
            const ormTextureIndex = ensureTextureIndex(metallicRoughnessTextureName)
            if (ormTextureIndex === null) continue
            material.pbrMetallicRoughness = material.pbrMetallicRoughness || {}
            material.pbrMetallicRoughness.metallicRoughnessTexture = { index: ormTextureIndex }
        } else if (alphaTextureIndex !== null && shouldRouteAlphaTextureThroughOrmSlot(channels)) {
            material.pbrMetallicRoughness = material.pbrMetallicRoughness || {}
            material.pbrMetallicRoughness.metallicRoughnessTexture = { index: alphaTextureIndex }
        } else if (material.pbrMetallicRoughness?.metallicRoughnessTexture) {
            delete material.pbrMetallicRoughness.metallicRoughnessTexture
        }
    }

    if (images.length > 0) gltf.images = images
    if (textures.length > 0) gltf.textures = textures
    writeFileSync(gltfPath, `${JSON.stringify(gltf, null, 2)}\n`, "utf8")
}

/**
 * 解析 umodel 导出的 .mat 文本通道。
 */
function parseMaterialChannels(materialPath: string) {
    if (!materialPath || !statSync(materialPath, { throwIfNoEntry: false })?.isFile()) return null
    const content = readFileSync(materialPath, "utf8")
    const channels: {
        Diffuse?: string
        Normal?: string
        BaseTex?: string
        Other: string[]
        BlendMode?: "MASK" | "BLEND"
        TwoSided?: boolean
        VectorParameters: Array<[number, number, number, number]>
        TextureParameters: Record<string, string>
        ParentMaterial?: string
    } = { Other: [], VectorParameters: [] }
    channels.TextureParameters = {}

    for (const line of content.split(/\r?\n/)) {
        const diffuseMatch = line.match(/^Diffuse=(.+)$/)
        if (diffuseMatch) channels.Diffuse = diffuseMatch[1].trim()

        const normalMatch = line.match(/^Normal=(.+)$/)
        if (normalMatch) channels.Normal = normalMatch[1].trim()

        const otherMatch = line.match(/^Other\[(\d+)\]=(.+)$/)
        if (otherMatch) channels.Other[Number(otherMatch[1])] = otherMatch[2].trim()
    }

    const propsPath = materialPath.replace(/\.mat$/i, ".props.txt")
    if (statSync(propsPath, { throwIfNoEntry: false })?.isFile()) {
        const propsContent = readFileSync(propsPath, "utf8")
        const parentMatch = propsContent.match(/Parent\s*=\s*Material3'[^']*\.([^'.]+)'/)
        if (parentMatch) {
            channels.ParentMaterial = parentMatch[1].trim()
        }
        const parameterBlocks = propsContent.match(/TextureParameterValues\[\d+\]\s*=\s*\{[\s\S]*?\n\}/g) || []
        const vectorBlocks = propsContent.match(/VectorParameterValues\[\d+\]\s*=\s*\{[\s\S]*?\n\}/g) || []
        for (const block of parameterBlocks) {
            const nameMatch = block.match(/ParameterInfo\s*=\s*\{\s*Name=([^\s}]+)\s*\}/)
            const valueMatch = block.match(/ParameterValue\s*=\s*Texture2D'[^']*\.([^'.]+)'/)
            if (!nameMatch || !valueMatch) continue
            const parameterName = nameMatch[1].trim()
            const textureName = valueMatch[1].trim()
            channels.TextureParameters[parameterName] = textureName
            if (parameterName === "BaseTex") {
                channels.BaseTex = textureName
            } else if (/normal/i.test(parameterName)) {
                channels.Normal = textureName
            } else {
                channels.Other.push(textureName)
            }
        }
        for (const block of vectorBlocks) {
            const valueMatch = block.match(/ParameterValue\s*=\s*\{\s*R=([-\d.]+),\s*G=([-\d.]+),\s*B=([-\d.]+),\s*A=([-\d.]+)\s*\}/)
            if (!valueMatch) continue
            channels.VectorParameters.push([Number(valueMatch[1]), Number(valueMatch[2]), Number(valueMatch[3]), Number(valueMatch[4])])
        }

        if (/BlendMode\s*=\s*BLEND_Masked/i.test(propsContent)) {
            channels.BlendMode = "MASK"
        } else if (/BlendMode\s*=\s*BLEND_Translucent/i.test(propsContent)) {
            channels.BlendMode = "BLEND"
        }
        if (/TwoSided\s*=\s*true/i.test(propsContent)) {
            channels.TwoSided = true
        }
    }

    return channels
}

/**
 * 根据材质名定位导出的 .mat 文件。
 */
function findMaterialFileRelativePath(rawRoot: string, assetRelativePath: string, materialName: string) {
    if (!materialName) return null
    const matches = collectMatchingFiles(rawRoot, `${materialName}.mat`)
    if (matches.length === 0) return null
    const assetDirectory = dirname(assetRelativePath).replace(/\\/g, "/")
    matches.sort((left, right) => {
        const leftRelative = relative(rawRoot, left).replace(/\\/g, "/")
        const rightRelative = relative(rawRoot, right).replace(/\\/g, "/")
        const scoreDelta =
            countSharedPathSegments(dirname(rightRelative).replace(/\\/g, "/"), assetDirectory) -
            countSharedPathSegments(dirname(leftRelative).replace(/\\/g, "/"), assetDirectory)
        if (scoreDelta !== 0) return scoreDelta
        return leftRelative.length - rightRelative.length
    })
    return relative(rawRoot, matches[0]).replace(/\\/g, "/")
}

/**
 * 根据纹理名定位导出的 png 文件。
 */
function resolveExportedTexturePath(rawRoot: string, textureName: string) {
    const pngMatches = collectMatchingFiles(rawRoot, `${textureName}.png`)
    if (pngMatches.length > 0) {
        pngMatches.sort((left, right) => left.length - right.length)
        return pngMatches[0]
    }

    const jpgMatches = collectMatchingFiles(rawRoot, `${textureName}.jpg`)
    if (jpgMatches.length > 0) {
        jpgMatches.sort((left, right) => left.length - right.length)
        return jpgMatches[0]
    }

    return null
}

/**
 * 仅在贴图名明确属于 ORM 打包纹理时才绑定 metallicRoughness。
 */
function shouldUseAsMetallicRoughnessTexture(textureName: string) {
    return /(?:^|_)(orm|arm|occlusionroughnessmetallic)(?:$|_)/i.test(textureName)
}

/**
 * 过滤占位贴图名，只保留真实业务贴图。
 */
function isUsableTextureName(textureName: string | undefined) {
    if (!textureName) return false
    return !/^(defaultdiffuse|defaultnormal|black|white|debug|good\d+x\d+tilingnoisehighfreq|t_base(?:bc1_n|black|color)|t_linearwhite|t_mix)$/i.test(
        textureName
    )
}

/**
 * 从材质通道中挑选最可信的底色贴图。
 */
function pickBaseColorTextureName(channels: {
    Diffuse?: string
    Normal?: string
    BaseTex?: string
    Other: string[]
    BlendMode?: "MASK" | "BLEND"
    TextureParameters?: Record<string, string>
}) {
    const explicitBaseColorTexture =
        channels.TextureParameters?.BaseColor ||
        channels.TextureParameters?.$$$$ ||
        channels.Other.find(
            textureName => isUsableTextureName(textureName) && /(?:^|_)(d|bc|basecolor|albedo|col)(?:$|_)/i.test(textureName)
        )

    if (shouldTreatBaseTexAsAlphaMask(channels)) {
        if (explicitBaseColorTexture) {
            return explicitBaseColorTexture
        }
        if (channels.Diffuse) {
            return channels.Diffuse
        }
    } else if (isUsableTextureName(channels.BaseTex)) {
        return channels.BaseTex!
    }

    if (explicitBaseColorTexture) {
        return explicitBaseColorTexture
    }

    if (isUsableTextureName(channels.Diffuse)) {
        return channels.Diffuse!
    }

    return (
        channels.Other.find(
            textureName => isUsableTextureName(textureName) && /(?:^|_)(d|bc|basecolor|albedo|col)(?:$|_)/i.test(textureName)
        ) ||
        channels.Other.find(textureName => isUsableTextureName(textureName) && !/(?:^|_)(n|m|orm|arm|pos|rot)(?:$|_)/i.test(textureName)) ||
        null
    )
}

/**
 * 从材质通道中挑选最可信的法线贴图。
 */
function pickNormalTextureName(channels: { Diffuse?: string; Normal?: string; BaseTex?: string; Other: string[] }) {
    if (isUsableTextureName(channels.Normal)) {
        return channels.Normal!
    }

    return channels.Other.find(textureName => isUsableTextureName(textureName) && /(?:^|_)(n|nor|normal)(?:$|_)/i.test(textureName)) || null
}

/**
 * 仅在命名明确时才使用金属粗糙贴图，避免把任意 `_M` 当 ORM。
 */
function pickMetallicRoughnessTextureName(channels: { Diffuse?: string; Normal?: string; BaseTex?: string; Other: string[] }) {
    return channels.Other.find(textureName => isUsableTextureName(textureName) && shouldUseAsMetallicRoughnessTexture(textureName)) || null
}

/**
 * 植物卡片材质里 `BaseTex` 通常是遮罩，不能直接拿来做底色。
 */
function shouldTreatBaseTexAsAlphaMask(channels: { Diffuse?: string; BaseTex?: string; BlendMode?: "MASK" | "BLEND" }) {
    if (channels.BlendMode !== "MASK") return false
    if (!isUsableTextureName(channels.BaseTex) || !channels.Diffuse) return false
    return /basecolor/i.test(channels.Diffuse || "")
}

/**
 * 为遮罩材质挑选单独的 alpha 来源贴图。
 */
function pickAlphaTextureName(channels: { Diffuse?: string; BaseTex?: string; BlendMode?: "MASK" | "BLEND" }) {
    if (shouldTreatBaseTexAsAlphaMask(channels)) {
        return channels.BaseTex || null
    }
    return null
}

/**
 * 通用植被材质会用 2 组颜色参数调制 `T_Basecolor`，先取平均色作为近似。
 */
function pickBaseColorFactor(
    channels: { VectorParameters: Array<[number, number, number, number]> },
    baseColorTextureName?: string | null
) {
    if (!baseColorTextureName || !/basecolor/i.test(baseColorTextureName)) return null
    if (!channels.VectorParameters.length) return null

    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (const [vr, vg, vb, va] of channels.VectorParameters) {
        r += vr
        g += vg
        b += vb
        a += va
    }

    return [
        r / channels.VectorParameters.length,
        g / channels.VectorParameters.length,
        b / channels.VectorParameters.length,
        a / channels.VectorParameters.length,
    ]
}

/**
 * glTF 无独立 alpha 纹理槽时，先借用 ORM 槽把遮罩纹理带进运行时。
 */
function shouldRouteAlphaTextureThroughOrmSlot(channels: { Diffuse?: string; BaseTex?: string; BlendMode?: "MASK" | "BLEND" }) {
    return Boolean(pickAlphaTextureName(channels))
}

/**
 * 针对 `M_Plant_Vine` 材质烘焙单张 RGBA 贴图，避免运行时再猜通道语义。
 */
async function buildMaskedPlantBakedTexture(
    rawRoot: string,
    rawRelativePath: string,
    materialName: string,
    channels: {
        Diffuse?: string
        BaseTex?: string
        BlendMode?: "MASK" | "BLEND"
        ParentMaterial?: string
        TextureParameters: Record<string, string>
        VectorParameters: Array<[number, number, number, number]>
    }
): Promise<BakedMaskedTextureResult | null> {
    if (channels.ParentMaterial !== "M_Plant_Vine" || channels.BlendMode !== "MASK" || !channels.BaseTex) {
        return null
    }

    const maskTexturePath = resolveExportedTexturePath(rawRoot, channels.BaseTex)
    if (!maskTexturePath) return null

    const diffuseTextureName = channels.TextureParameters.BaseColor || channels.TextureParameters.$$$$ || channels.Diffuse
    const bakedOutputPath = join(dirname(maskTexturePath), "_baked", `${materialName || basename(rawRelativePath, ".gltf")}_Baked.png`)
    mkdirSync(dirname(bakedOutputPath), { recursive: true })

    const bakerScriptPath = resolve("tools/bake_masked_plant_texture.py")
    if (/basecolor/i.test(diffuseTextureName || "")) {
        const args = [
            bakerScriptPath,
            "--mode",
            "tint-mask",
            "--mask",
            windowsPath(maskTexturePath),
            "--output",
            windowsPath(bakedOutputPath),
        ]
        for (const vector of channels.VectorParameters.slice(0, 2)) {
            args.push("--color", vector.join(","))
        }
        if (channels.VectorParameters.length === 0) {
            args.push("--color", "1,1,1,1")
        }
        await runCommandSync(resolvePythonExecutable(), args)
        return { bakedTextureName: basename(bakedOutputPath, ".png") }
    }

    const diffuseTexturePath = diffuseTextureName ? resolveExportedTexturePath(rawRoot, diffuseTextureName) : null
    if (!diffuseTexturePath) return null

    await runCommandSync(resolvePythonExecutable(), [
        bakerScriptPath,
        "--mode",
        "diffuse-mask",
        "--mask",
        windowsPath(maskTexturePath),
        "--diffuse",
        windowsPath(diffuseTexturePath),
        "--output",
        windowsPath(bakedOutputPath),
    ])
    return { bakedTextureName: basename(bakedOutputPath, ".png") }
}

/**
 * 统计两个路径共有的前导段数量，用于就近匹配材质文件。
 */
function countSharedPathSegments(leftPath: string, rightPath: string) {
    const leftSegments = leftPath.split("/").filter(Boolean)
    const rightSegments = rightPath.split("/").filter(Boolean)
    const length = Math.min(leftSegments.length, rightSegments.length)
    let sharedCount = 0

    for (let index = 0; index < length; index += 1) {
        if (leftSegments[index] !== rightSegments[index]) break
        sharedCount += 1
    }

    return sharedCount
}

/**
 * 判断相对包路径在导出根目录中是否真实存在。
 */
function packagePathExists(exportsRoot: string, packagePath: string) {
    return statSync(join(exportsRoot, packagePath), { throwIfNoEntry: false })?.isFile() || false
}

/**
 * 根据 UModel 实际输出结果反查 gltf 路径。
 */
function resolveExportedRelativePath(rawRoot: string, packagePath: string, extension: ".gltf"): string {
    const expectedRelativePath = normalizePackagePathToRelativeAssetPath(packagePath, extension)
    const expectedFullPath = join(rawRoot, expectedRelativePath)
    if (statSync(expectedFullPath, { throwIfNoEntry: false })?.isFile()) {
        return expectedRelativePath
    }

    const targetFileName = `${basename(packagePath, ".uasset")}${extension}`
    const matches = collectMatchingFiles(rawRoot, targetFileName)
    if (matches.length === 0) {
        throw new Error(`未找到 UModel 导出结果: ${packagePath}`)
    }

    matches.sort((left, right) => left.length - right.length)
    return relative(rawRoot, matches[0]).replace(/\\/g, "/")
}

/**
 * 递归按文件名搜索。
 */
function collectMatchingFiles(rootDirectory: string, targetFileName: string): string[] {
    const results: string[] = []
    const stack = [rootDirectory]

    while (stack.length > 0) {
        const current = stack.pop()!
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const fullPath = join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(fullPath)
                continue
            }
            if (entry.name === targetFileName) {
                results.push(fullPath)
            }
        }
    }

    return results
}

/**
 * 收集单个 glTF 运行所需的外部依赖文件。
 */
function collectAssetDependencyRelativePaths(rootDirectory: string, assetRelativePath: string) {
    const normalizedAssetPath = assetRelativePath.replace(/\\/g, "/")
    const dependencyPaths = [normalizedAssetPath]

    if (!normalizedAssetPath.endsWith(".gltf")) {
        return dependencyPaths
    }

    const gltfPath = join(rootDirectory, normalizedAssetPath)
    const gltf = JSON.parse(readFileSync(gltfPath, "utf8")) as Record<string, any>
    const assetDirectory = dirname(normalizedAssetPath).replace(/\\/g, "/")
    const resourceUris = [
        ...(Array.isArray(gltf.buffers) ? gltf.buffers.map((buffer: any) => buffer?.uri) : []),
        ...(Array.isArray(gltf.images) ? gltf.images.map((image: any) => image?.uri) : []),
    ]

    for (const resourceUri of resourceUris) {
        if (typeof resourceUri !== "string" || resourceUri.startsWith("data:")) continue
        dependencyPaths.push(resolveRelativeBundlePath(assetDirectory, resourceUri))
    }

    return dependencyPaths
}

/**
 * 将已构建 mesh 与依赖文件整体写入缓存。
 */
function cacheBuiltAssetOutput(assetRelativePath: string, webRoot: string) {
    const dependencyPaths = collectAssetDependencyRelativePaths(webRoot, assetRelativePath)
    copyRelativeFiles(webRoot, MESH_CACHE_ROOT, dependencyPaths)
}

/**
 * 从缓存恢复 mesh 与依赖文件。
 */
function restoreBuiltAssetOutputFromCache(assetRelativePath: string, webRoot: string) {
    const dependencyPaths = collectAssetDependencyRelativePaths(MESH_CACHE_ROOT, assetRelativePath)
    copyRelativeFiles(MESH_CACHE_ROOT, webRoot, dependencyPaths)
}

/**
 * 按相对路径集合执行文件复制。
 */
function copyRelativeFiles(sourceRoot: string, targetRoot: string, relativePaths: string[]) {
    for (const relativePath of relativePaths) {
        const sourcePath = join(sourceRoot, relativePath)
        const targetPath = join(targetRoot, relativePath)
        mkdirSync(dirname(targetPath), { recursive: true })
        copyFileSync(sourcePath, targetPath)
    }
}

/**
 * 将重复贴图提升为共享文件，并回写 glTF 的图片引用。
 */
function dedupeSceneTextureFiles(webRoot: string) {
    const textureFiles = collectFilesByExtensions(webRoot, new Set([".png", ".jpg", ".jpeg", ".webp"]))
    if (textureFiles.length === 0) return

    const sharedRoot = join(webRoot, "_shared")
    mkdirSync(sharedRoot, { recursive: true })

    const canonicalTextureByHash = new Map<string, string>()
    const rewriteMap = new Map<string, string>()

    for (const textureFile of textureFiles) {
        const bytes = readFileSync(textureFile)
        const extension = extname(textureFile).toLowerCase()
        const hash = createHash("sha1").update(bytes).digest("hex")
        const hashKey = `${hash}${extension}`
        const canonicalTexturePath = join(sharedRoot, `${hash}${extension}`)

        if (!canonicalTextureByHash.has(hashKey)) {
            if (!statSync(canonicalTexturePath, { throwIfNoEntry: false })?.isFile()) {
                copyFileSync(textureFile, canonicalTexturePath)
            }
            canonicalTextureByHash.set(hashKey, canonicalTexturePath)
        }

        rewriteMap.set(textureFile, canonicalTextureByHash.get(hashKey)!)

        if (textureFile !== canonicalTextureByHash.get(hashKey)) {
            rmSync(textureFile, { force: true })
        }
    }

    const gltfFiles = collectFilesByExtensions(webRoot, new Set([".gltf"]))
    for (const gltfFile of gltfFiles) {
        const gltf = JSON.parse(readFileSync(gltfFile, "utf8")) as Record<string, any>
        const images = Array.isArray(gltf.images) ? gltf.images : []
        let dirty = false

        for (const image of images) {
            if (!image || typeof image.uri !== "string" || image.uri.startsWith("data:")) continue
            const currentTexturePath = join(dirname(gltfFile), image.uri)
            const canonicalTexturePath = rewriteMap.get(currentTexturePath)
            if (!canonicalTexturePath) continue

            const nextUri = relative(dirname(gltfFile), canonicalTexturePath).replace(/\\/g, "/")
            if (image.uri !== nextUri) {
                image.uri = nextUri
                dirty = true
            }
        }

        if (dirty) {
            writeFileSync(gltfFile, `${JSON.stringify(gltf, null, 2)}\n`, "utf8")
        }
    }

    removeUnreferencedTextureFiles(webRoot)
}

/**
 * 递归收集指定扩展名的文件。
 */
function collectFilesByExtensions(rootDirectory: string, extensions: Set<string>) {
    const results: string[] = []
    const stack = [rootDirectory]

    while (stack.length > 0) {
        const current = stack.pop()!
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const fullPath = join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(fullPath)
                continue
            }
            if (extensions.has(extname(entry.name).toLowerCase())) {
                results.push(fullPath)
            }
        }
    }

    return results
}

/**
 * 解析包内相对资源路径，得到规范化 bundle 路径。
 */
function resolveRelativeBundlePath(baseDirectory: string, resourcePath: string) {
    const segments = `${baseDirectory}/${resourcePath}`.split("/")
    const normalizedSegments: string[] = []

    for (const segment of segments) {
        if (!segment || segment === ".") continue
        if (segment === "..") {
            normalizedSegments.pop()
            continue
        }
        normalizedSegments.push(segment)
    }

    return normalizedSegments.join("/")
}

/**
 * 清理导出过程中的中间目录，只保留最终单文件包与缺失报告。
 */
function cleanupIntermediateOutputs(outputDirectory: string) {
    rmSync(join(outputDirectory, "web"), { recursive: true, force: true })
    rmSync(join(outputDirectory, "scene.manifest.json"), { force: true })
}

/**
 * 清理 web 目录中未再被任何 glTF 引用的孤儿贴图。
 */
function removeUnreferencedTextureFiles(webRoot: string) {
    const referencedTextures = new Set<string>()
    const gltfFiles = collectFilesByExtensions(webRoot, new Set([".gltf"]))

    for (const gltfFile of gltfFiles) {
        const gltf = JSON.parse(readFileSync(gltfFile, "utf8")) as Record<string, any>
        const images = Array.isArray(gltf.images) ? gltf.images : []
        for (const image of images) {
            if (!image || typeof image.uri !== "string" || image.uri.startsWith("data:")) continue
            referencedTextures.add(join(dirname(gltfFile), image.uri))
        }
    }

    const textureFiles = collectFilesByExtensions(webRoot, new Set([".png", ".jpg", ".jpeg", ".webp"]))
    for (const textureFile of textureFiles) {
        if (!referencedTextures.has(textureFile)) {
            rmSync(textureFile, { force: true })
        }
    }
}

/**
 * 将场景输出目录打包为单文件。
 */
function writeSceneBundle(outputDirectory: string, outputPath: string, manifest: RegionSceneManifest): string {
    const webRoot = join(outputDirectory, "web")
    const bundleFiles = collectFilesByPrefix(webRoot, "", "")
        .sort((left, right) => left.localeCompare(right))
        .map(filePath => ({
            path: relative(outputDirectory, filePath).replace(/\\/g, "/"),
            bytes: readFileSync(filePath),
        }))

    let payloadOffset = 0
    const header: SceneBundleHeader = {
        manifest,
        files: bundleFiles.map(file => {
            const entry = {
                path: file.path,
                offset: payloadOffset,
                size: file.bytes.byteLength,
            }
            payloadOffset += file.bytes.byteLength
            return entry
        }),
    }

    const headerBytes = Buffer.from(JSON.stringify(header), "utf8")
    const magicBytes = Buffer.from(SCENE_BUNDLE_MAGIC, "ascii")
    const lengthBytes = Buffer.allocUnsafe(4)
    lengthBytes.writeUInt32LE(headerBytes.byteLength, 0)

    const bundleBuffer = Buffer.concat([magicBytes, lengthBytes, headerBytes, ...bundleFiles.map(file => file.bytes)])
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, bundleBuffer)
    return outputPath
}

/**
 * 递归按文件名前缀搜索。
 */
function collectFilesByPrefix(rootDirectory: string, prefix: string, extension: string): string[] {
    const results: string[] = []
    const stack = [rootDirectory]

    while (stack.length > 0) {
        const current = stack.pop()!
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const fullPath = join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(fullPath)
                continue
            }
            if (entry.name.startsWith(prefix) && entry.name.endsWith(extension)) {
                results.push(fullPath)
            }
        }
    }

    return results
}

/**
 * 统一组件缓存键。
 */
function makeComponentKey(item: UMapExportItem): string {
    return `${item.Outer || ""}/${item.Name || ""}/${item.Type || ""}`
}

/**
 * 计算多路径共同祖先目录。
 */
function commonAncestorDirectory(paths: string[]): string {
    if (paths.length === 0) {
        throw new Error("无法从空路径列表计算共同祖先目录")
    }

    const splitPaths = paths.map(filePath => resolve(filePath).split(/[\\/]+/))
    const first = splitPaths[0]
    const shared: string[] = []

    for (let index = 0; index < first.length; index += 1) {
        const segment = first[index]
        if (splitPaths.every(parts => parts[index] === segment)) {
            shared.push(segment)
            continue
        }
        break
    }

    const ancestor = shared.join(sep)
    return statSync(ancestor).isDirectory() ? ancestor : dirname(ancestor)
}

/**
 * 将向量转换为三元组。
 */
function toTuple(value: TransformVector | undefined, fallback: number): [number, number, number] {
    return [Number(value?.X ?? fallback), Number(value?.Y ?? fallback), Number(value?.Z ?? fallback)]
}

/**
 * 读取 Rotator。
 */
function toRotatorTuple(value: TransformRotator | undefined): [number, number, number] {
    return [Number(value?.Pitch || 0), Number(value?.Yaw || 0), Number(value?.Roll || 0)]
}

/**
 * 角度转弧度。
 */
function degreesToRadians(value: number) {
    return (value * Math.PI) / 180
}

/**
 * 弧度转角度。
 */
function radiansToDegrees(value: number) {
    return (value * 180) / Math.PI
}

/**
 * 必填参数读取。
 */
function resolveRequiredArg(argMap: Map<string, string>, key: string): string {
    const value = argMap.get(key)
    if (!value) {
        throw new Error(`缺少参数 ${key}`)
    }
    return value
}

/**
 * 断言目录存在。
 */
function ensureDirectoryExists(pathValue: string, label: string) {
    if (!statSync(pathValue, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`${label} 目录不存在: ${pathValue}`)
    }
}

/**
 * 断言文件存在。
 */
function ensureFileExists(pathValue: string, label: string) {
    if (!statSync(pathValue, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`${label} 文件不存在: ${pathValue}`)
    }
}

/**
 * 规范 Windows 路径参数。
 */
function windowsPath(value: string) {
    return value.replace(/\//g, "\\")
}

/**
 * 在最终 manifest 层再次剔除占位几何，避免源路径漏网后进入页面。
 */
function sanitizeManifest(manifest: RegionSceneManifest) {
    const blockedMeshIds = new Set(
        manifest.meshes
            .filter(mesh => /BasicShapes\/(Cube|Plane|Cylinder)|LandProxy|\/Proxy\/|_Proxy/i.test(mesh.asset))
            .map(mesh => mesh.id)
    )

    if (blockedMeshIds.size === 0) return

    manifest.meshes = manifest.meshes.filter(mesh => !blockedMeshIds.has(mesh.id))
    manifest.instances = manifest.instances.filter(instance => !blockedMeshIds.has(instance.meshId))
}

main()
