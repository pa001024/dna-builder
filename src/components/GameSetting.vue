<script setup lang="ts">
import { parse, stringify } from "js-ini"
import { debounce } from "lodash-es"
import { computed, onMounted, ref, watch } from "vue"
import { openExplorer, readTextFile, writeTextFile } from "../api/app"
import { useGameStore } from "../store/game"
import { type ConfigOption, engineConfigCategories, gameUserSettingsConfigCategories } from "../utils/game-config"

const game = useGameStore()
    ; (globalThis as any).__chapterCounter = 1
// 配置文件状态
const engineIni = ref<Record<string, any>>({})
const gameUserSettingsIni = ref<Record<string, any>>({})
const isLoading = ref(false)
const isSaving = ref(false)

// 保存原始的 [Core.System] 段内容（用于处理重复键）
const coreSystemRawContent = ref("")

// 计算配置文件路径
const configDir = computed(() => {
    if (!game.path) return ""
    return game.gameDir + "EM\\Saved\\Config\\WindowsNoEditor\\"
})

const engineIniPath = computed(() => configDir.value + "Engine.ini")
const gameUserSettingsIniPath = computed(() => configDir.value + "GameUserSettings.ini")

// 游戏设置分类（单独显示，不放在折叠框中）
const gameSettingsCategory = computed(() => gameUserSettingsConfigCategories[0])

// 引擎设置分类（放在折叠框中）
const engineCategories = computed(() => engineConfigCategories)

// 展开的分类
const expandedCategories = ref<Set<string>>(new Set())

// 切换分类展开状态
function toggleCategory(categoryName: string) {
    if (expandedCategories.value.has(categoryName)) {
        expandedCategories.value.delete(categoryName)
    } else {
        expandedCategories.value.add(categoryName)
    }
}

// 常见分辨率选项
const commonResolutions = [
    { label: "1280 x 720", width: 1280, height: 720 },
    { label: "1366 x 768", width: 1366, height: 768 },
    { label: "1600 x 900", width: 1600, height: 900 },
    { label: "1920 x 1080", width: 1920, height: 1080 },
    { label: "2560 x 1440", width: 2560, height: 1440 },
    { label: "3840 x 2160", width: 3840, height: 2160 },
]

// 自定义分辨率
const customResolution = ref({ width: 0, height: 0 })
const isCustomResolution = ref(false)

// 当前分辨率值（响应式）
const currentResolution = ref({ width: 1600, height: 900 })

/**
 * 设置分辨率
 */
function setResolution(width: number, height: number) {
    const section = "/Script/Engine.GameUserSettings"
    const iniFile = gameUserSettingsIni.value
    if (!iniFile[section]) {
        iniFile[section] = {}
    }
    iniFile[section]["ResolutionSizeX"] = width
    iniFile[section]["ResolutionSizeY"] = height
    iniFile[section]["LastUserConfirmedResolutionSizeX"] = width
    iniFile[section]["LastUserConfirmedResolutionSizeY"] = height
    currentResolution.value = { width, height }
    debouncedSave()
}

/**
 * 选择常见分辨率
 */
function selectResolution(width: number, height: number) {
    isCustomResolution.value = false
    customResolution.value = { width, height }
    setResolution(width, height)
}

/**
 * 应用自定义分辨率
 */
function applyCustomResolution() {
    if (customResolution.value.width > 0 && customResolution.value.height > 0) {
        setResolution(customResolution.value.width, customResolution.value.height)
    }
}

/**
 * 读取配置文件
 * @param filePath 文件路径
 * @returns 配置文件内容
 */
async function readConfigFile(filePath: string): Promise<string> {
    try {
        return await readTextFile(filePath)
    } catch (error) {
        console.error("读取配置文件失败:", error)
        return ""
    }
}

/**
 * 写入配置文件
 * @param filePath 文件路径
 * @param content 配置文件内容
 */
async function writeConfigFile(filePath: string, content: string): Promise<void> {
    try {
        await writeTextFile(filePath, content)
    } catch (error) {
        console.error("写入配置文件失败:", error)
        throw error
    }
}

/**
 * 解析 INI 文件，特殊处理 [Core.System] 段的重复键
 * @param content INI 文件内容
 * @returns 解析后的对象和原始 [Core.System] 内容
 */
function parseIniWithCoreSystem(content: string): { parsed: Record<string, any>; coreSystemRaw: string } {
    const lines = content.split(/\r?\n/)
    let currentSection = ""
    let inCoreSystem = false
    const coreSystemLines: string[] = []
    const parsed: Record<string, any> = {}

    for (const line of lines) {
        const trimmedLine = line.trim()

        // 跳过空行
        if (!trimmedLine) {
            continue
        }

        // 处理节
        const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/)
        if (sectionMatch) {
            currentSection = sectionMatch[1]
            inCoreSystem = currentSection === "Core.System"
            if (!parsed[currentSection]) {
                parsed[currentSection] = {}
            }
            continue
        }

        // 如果在 [Core.System] 段中，收集原始内容
        if (inCoreSystem) {
            coreSystemLines.push(line)
            // 同时解析键值对
            const keyValueMatch = trimmedLine.match(/^([^=]+)=(.*)$/)
            if (keyValueMatch) {
                const key = keyValueMatch[1].trim()
                const value = keyValueMatch[2].trim()
                // 对于重复键，存储为数组
                if (parsed[currentSection][key]) {
                    if (!Array.isArray(parsed[currentSection][key])) {
                        parsed[currentSection][key] = [parsed[currentSection][key]]
                    }
                    parsed[currentSection][key].push(value)
                } else {
                    parsed[currentSection][key] = value
                }
            }
        } else {
            // 处理其他节的键值对
            const keyValueMatch = trimmedLine.match(/^([^=]+)=(.*)$/)
            if (keyValueMatch && currentSection) {
                const key = keyValueMatch[1].trim()
                const value = keyValueMatch[2].trim()
                parsed[currentSection][key] = value
            }
        }
    }

    // 构建 [Core.System] 段的原始内容
    const coreSystemRaw = coreSystemLines.join("\n")

    return { parsed, coreSystemRaw }
}

/**
 * 序列化 INI 文件，特殊处理 [Core.System] 段的重复键
 * @param iniFile INI 文件对象
 * @param coreSystemRaw [Core.System] 段的原始内容
 * @returns INI 文件字符串
 */
function stringifyIniWithCoreSystem(iniFile: Record<string, any>, coreSystemRaw: string): string {
    const lines: string[] = []

    // 添加 [Core.System] 段的原始内容
    if (coreSystemRaw) {
        lines.push("[Core.System]")
        lines.push(coreSystemRaw)
        lines.push("")
    }

    // 添加其他节
    for (const [sectionName, sectionData] of Object.entries(iniFile)) {
        if (sectionName === "Core.System") {
            continue
        }
        lines.push(`[${sectionName}]`)
        if (sectionData && typeof sectionData === "object") {
            for (const [key, value] of Object.entries(sectionData)) {
                if (Array.isArray(value)) {
                    for (const v of value) {
                        lines.push(`${key}=${v}`)
                    }
                } else {
                    lines.push(`${key}=${value}`)
                }
            }
        }
        lines.push("")
    }

    return lines.join("\n")
}

/**
 * 加载所有配置文件
 */
async function loadConfigs() {
    if (!game.path) {
        return
    }

    isLoading.value = true
    try {
        const engineContent = await readConfigFile(engineIniPath.value)
        if (engineContent) {
            const { parsed, coreSystemRaw } = parseIniWithCoreSystem(engineContent)
            engineIni.value = parsed
            coreSystemRawContent.value = coreSystemRaw
        } else {
            engineIni.value = {}
            coreSystemRawContent.value = ""
        }

        const gameUserSettingsContent = await readConfigFile(gameUserSettingsIniPath.value)
        if (gameUserSettingsContent) {
            gameUserSettingsIni.value = parse(gameUserSettingsContent)
            console.log("加载 GameUserSettings.ini:", gameUserSettingsIni.value)
        } else {
            gameUserSettingsIni.value = {}
        }

        // 初始化当前分辨率值
        const section = "/Script/Engine.GameUserSettings"
        const iniFile = gameUserSettingsIni.value
        if (iniFile && iniFile[section]) {
            const width = Number(iniFile[section]["ResolutionSizeX"] || 1600)
            const height = Number(iniFile[section]["ResolutionSizeY"] || 900)
            currentResolution.value = { width, height }
        }
    } catch (error) {
        console.error("加载配置文件失败:", error)
    } finally {
        isLoading.value = false
    }
}

/**
 * 获取配置文件对象
 * @param section 节名称
 * @returns 配置文件对象
 */
function getIniFile(section: string): Record<string, any> {
    if (engineIni.value[section]) {
        return engineIni.value
    }
    if (gameUserSettingsIni.value[section]) {
        return gameUserSettingsIni.value
    }
    return engineIni.value
}

/**
 * 保存配置文件，只保存特定段，保留其他段的值
 */
async function saveConfigs() {
    if (!game.path || isSaving.value) {
        return
    }

    isSaving.value = true
    try {
        // 保存 Engine.ini，保留 Core.System 等段
        const engineContent = stringifyIniWithCoreSystem(engineIni.value, coreSystemRawContent.value)
        await writeConfigFile(engineIniPath.value, engineContent)

        const gameUserSettingsContent = stringify(gameUserSettingsIni.value)
        // console.log("保存 GameUserSettings.ini:", gameUserSettingsContent)
        await writeConfigFile(gameUserSettingsIniPath.value, gameUserSettingsContent)
    } catch (error) {
        console.error("保存配置文件失败:", error)
    } finally {
        isSaving.value = false
    }
}

const debouncedSave = debounce(saveConfigs, 500)

/**
 * 检查配置项是否启用（从配置文件中读取）
 * @param option 配置项
 * @returns 是否启用
 */
function isOptionEnabled(option: ConfigOption): boolean {
    const iniFile = getIniFile(option.section)
    const section = iniFile[option.section]
    if (!section) return false
    return section[option.key] !== undefined
}

/**
 * 切换配置项启用状态
 * @param option 配置项
 */
function toggleOptionEnabled(option: ConfigOption) {
    const iniFile = getIniFile(option.section)
    if (!iniFile[option.section]) {
        iniFile[option.section] = {}
    }

    if (isOptionEnabled(option)) {
        delete iniFile[option.section][option.key]
    } else {
        iniFile[option.section][option.key] = option.defaultValue
    }
    debouncedSave()
}

/**
 * 获取配置项的当前值
 * @param option 配置项
 * @returns 当前值
 */
function getOptionValue(option: ConfigOption): any {
    const iniFile = getIniFile(option.section)
    const section = iniFile[option.section]
    if (!section) return option.defaultValue
    const value = section[option.key]
    if (typeof option.defaultValue === "number") {
        return value !== undefined ? Number(value) : option.defaultValue
    }
    return value !== undefined ? value : option.defaultValue
}

/**
 * 设置配置项的值
 * @param option 配置项
 * @param value 新值
 */
function setOptionValue(option: ConfigOption, value: any) {
    const iniFile = getIniFile(option.section)
    if (!iniFile[option.section]) {
        iniFile[option.section] = {}
    }
    iniFile[option.section][option.key] = value
    debouncedSave()
}

/**
 * 重置配置项为默认值
 * @param option 配置项
 */
function resetOption(option: ConfigOption) {
    setOptionValue(option, option.defaultValue)
}

function resetConfig() {
    const coreSystemContent = engineIni.value["Core.System"]
    const accessibilityContent = engineIni.value["WindowsApplication.Accessibility"]

    engineIni.value = {}

    if (coreSystemContent) {
        engineIni.value["Core.System"] = coreSystemContent
    }
    if (accessibilityContent) {
        engineIni.value["WindowsApplication.Accessibility"] = accessibilityContent
    }
}
/**
 * 重置为默认配置，仅保留 [Core.System] 和 [WindowsApplication.Accessibility] 段
 */
function resetToDefault() {
    resetConfig()
    saveConfigs()
}

/**
 * 应用预设配置
 * @param preset 预设名称
 */
async function applyPreset(preset: "low" | "medium" | "high" | "ultra") {
    const commonOptions = `AudioThread.UseBackgroundThreadPool=1
MaterialBaking.RenderDocCapture=1
r.Streaming.PoolSize=0
r.Streaming.LimitPoolSizeToVRAM=1
r.Streaming.AmortizeCPUToGPUCopy=1
r.Streaming.Boost=2
r.Streaming.FullyLoadUsedTextures=1
r.Streaming.UseMipsFarAway=1
r.Streaming.FramesForFullUpdate=1
r.Streaming.DefragDynamicBounds=1
r.Streaming.MassiveEnvironmentPoolSizeMB=16000
r.Streaming.UsePerTextureBias=0
r.Streaming.MaxHiddenPrimitiveViewBoost=1
r.Streaming.UseBackgroundThreadPool=1
r.Streaming.UseAsyncRequestsForDDC=1
r.Streaming.AllowParallelStreamingRenderAssets=1
r.Streaming.MaxNumTexturesToStreamPerFrame=12
r.FastVRam.Tonemap=1
r.FastVRam.Bloom=1
r.FastVRam.Distortion=1
r.FastVRam.HZB=1
r.FastVRam.Histogram=1
r.FastVRam.ShadowPointLight=1
r.FastVRam.Upscale=1
r.FastVRam.ShadowCSM=1
r.FastVRam.CustomDepth=1
r.FastVRam.DBufferA=1
r.FastVRam.DBufferB=1
r.FastVRam.DBufferC=1
r.FastVRam.DBufferMask=1
r.FastVRam.GBufferA=1
r.FastVRam.GBufferB=1
r.FastVRam.GBufferC=1
r.FastVRam.GBufferD=1
r.FastVRam.GBufferE=1
r.FastVRam.GBufferF=1
r.AllowPrecomputedVisibility=1
r.AllowDepthBoundsTest=1
r.AsyncCreateLightPrimitiveInteractions=1
FX.AllowAsyncTick=1
fx.AllowFastPathFunctionLibrary=1
FX.EarlyScheduleAsync=1
tick.AllowAsyncComponentTicks=1
tick.AllowAsyncTickCleanup=1
tick.AllowAsyncTickDispatch=1
a.ForceParallelAnimUpdate=1
a.ParallelAnimUpdate=1
a.ParallelAnimEvaluation=1
a.ParallelBlendPhysics=1
r.ParallelTranslucency=1
r.MultithreadedLightmapEncode=1
r.MultithreadedShadowmapEncode=1
r.MeshDrawCommands.ParallelPassSetup=1
r.AOAsyncBuildQueue=1
r.AOGlobalDistanceFieldCacheMostlyStaticSeparately=1
s.AllowLevelRequestsWhileAsyncLoadingInMatch=1
r.EnableAsyncComputeTranslucencyLightingVolumeClear=1
r.TSR.AsyncCompute=3
r.TSR.16BitVALU=1
r.TSR.16BitVALU.AMD=0
r.TSR.16BitVALU.Intel=0
r.TSR.16BitVALU.Nvidia=1
r.TSR.AlphaChannel=0
r.TSR.History.ScreenPercentage=185
r.TSR.History.SampleCount=8
r.TSR.ShadingRejection.SampleCount=1.8
r.TSR.ShadingRejection.Flickering.Period=2
r.TranslucencyLightingVolumeDim=32
r.Translucency.HeterogeneousVolumes=1
r.TranslucencyVolumeBlur=0
r.HZBOcclusion=0
r.BloomQuality=4
r.Lumen.Reflections.Allow=0
r.Lumen.DiffuseIndirect.Allow=0
r.Lumen.ScreenProbeGather.Allow=0
r.Lumen.HardwareRayTracing.LightingMode=2
fx.Niagara.MaxParticles=62914560
fx.Niagara.AsyncCompute=1
Niagara.Ribbon.GpuInitMode=2
Niagara.GPUCulling.CPUToGPUThreshold=-1
Niagara.GPUSorting.CPUToGPUThreshold=0
FX.BatchAsync=1
FX.BatchAsyncBatchSize=8192
fx.NiagaraGPUDataBufferChunkSize=8192
FX.MaxCPUParticlesPerEmitter=8000
FX.MaxParticleTilePreAllocation=8000
fx.Niagara.Compilation.MaxActiveTaskCount=8192
fx.NiagaraBatcher.FreeBufferEarly=0
FX.NiagaraComponentPool.CleanTime=0.02
FX.NiagaraComponentPool.KillUnusedTime=0.2
fx.ParticleManagerAsyncBatchSize=8192
FX.ParticleSystemPool.CleanTime=0.02
FX.ParticleSystemPool.KillUnusedTime=0.2
fx.MaxNiagaraCPUParticlesPerEmitter=4000000
fx.MaxNiagaraGPUParticlesSpawnPerFrame=8000000
r.LightShaftBlurPasses=0
r.LightShaftNumSamples=0
r.LightShaftRenderToSeparateTranslucency=1
r.GenerateMeshDistanceFields=False
r.SupportHardwareRayTracing=True
r.RayTracing=0
r.ForceAllCoresForShaderCompiling=1
r.Shaders.Optimize=1
r.Shaders.ZeroInitialise=1
r.Shaders.FastMath=1
r.UseShaderPredraw=1
r.DFShadowScatterTileCulling=1
r.Shadow.CacheWholeSceneShadows=1
r.DistanceFieldShadowing=0
r.PostProcessing.DownsampleQuality=1
r.Emitter.FastPoolEnable=1
r.TriangleOrderOptimization=1
r.VolumetricFog=0
r.Fog=0
r.LocalFogVolume=0
r.DisableLODFade=1
r.OneFrameThreadLag=0
r.DontLimitOnBattery=1
r.GBufferFormat=5
r.VirtualTexture=1
r.StaticMeshLODDistanceScale=0.1
r.SceneColorFringeQuality=0
r.MotionBlurQuality=0
r.DepthOfFieldQuality=0
r.DepthOfField.FarBlur=0
r.FastBlurThreshold=0
r.SkinCaching=1
r.OptimizeForUAVPerformance=1
r.SkeletalMeshLODBias=-2
r.DFFullResolution=0
r.DFFarTransitionScale=0
landscape.BrushOptim=1
r.ForceSceneHasDecals=1
r.GeometryCollectionTripleBufferUploads=0
r.HDR.Display.ColorGamut=1
r.AOGlobalDistanceField=0
GeometryCache.OffloadUpdate=1
r.Nanite.MaterialBuffers.Defrag.Force=2
r.DistanceFieldAO=0
r.Nanite.ComputeRasterization=0
r.CustomDepth.Order=0
foliage.MaxOcclusionQueriesPerComponent=16
foliage.MinOcclusionQueriesPerComponent=2
foliage.MinInstancesPerOcclusionQuery=1024
foliage.ForceLOD=2
foliage.DitheredLOD=2
foliage.DiscardDataOnLoad=True
grass.DisableDynamicShadows=1
grass.GrassMap.UseAsyncFetch=1
grass.CullDistanceScale=16000
grass.CullSubsections=1
grass.UseHaltonDistribution=1
rhi.SyncInterval=0
rhi.UseSubmissionThread=0
r.Metal.IOSRHIThread=1
r.RHICmdAsyncRHIThreadDispatch=1
r.RHICmdFlushRenderThreadTasks=1
r.Vulkan.AllowAsyncCompute=1
r.Vulkan.AllowPresentOnComputeQueue=1
r.Vulkan.PipelineCacheFromShaderPipelineCache=1
r.Vulkan.PipelineCacheLoad=1
r.Vulkan.CPURHIThreadFramePacer=1
r.Vulkan.CPURenderthreadFramePacer=1
r.Vulkan.ExtensionFramePacer=1
r.pso.CreateOnRHIThread=1
r.PSOPrecache.DitheredLODFadingOutMaskPass=1
r.PSOPrecache.GlobalComputeShaders=1
r.PSOPrecache.TranslucencyAllPass=1
s.ForceGCAfterLevelStreamedOut=1
gc.AllowParallelGC=1
gc.IncrementalPurgeGarbage=1
gc.TimeBetweenPurgingMoreObjectsThanTheQuantum=0.004
gc.CreateGCClusters=1
gc.TimeBetweenPurgingPendingKillObjects=0.004
r.ShaderCodeLibrary.MaxShaderGroupSize=31457280
r.ShaderCodeLibrary.SeparateLoadingCache=1`.split("\n").reduce((acc, line) => {
        const [key, value] = line.split("=")
        acc[`SystemSettings|${key.trim()}`] = value
        return acc
    }, {} as Record<string, string>)

    const presets: Record<string, Record<string, any>> = {
        low: {
            ...commonOptions,
            "SystemSettings|r.PostProcessQuality": 0,
            "SystemSettings|r.ViewDistanceScale": 0.5,
            "SystemSettings|r.DefaultFeature.Bloom": 0,
            "SystemSettings|r.DefaultFeature.AmbientOcclusion": 0,
            "SystemSettings|r.DefaultFeature.MotionBlur": "False",
            "SystemSettings|r.Tonemapper.Quality": 0,
            "SystemSettings|r.LightShaftQuality": 0,
            "SystemSettings|r.Filter.SizeScale": 0.6,
            "SystemSettings|r.Tonemapper.GrainQuantization": 0,
            "SystemSettings|r.MaxAnisotropy": 0,
            "SystemSettings|r.TranslucencyVolumeBlur": 0,
            "SystemSettings|r.MaterialQualityLevel": 0,
            "SystemSettings|r.SSS.Scale": 0,
            "SystemSettings|r.SSS.SampleSet": 0,
            "SystemSettings|foliage.DiscardDataOnLoad": 1,
            "SystemSettings|foliage.MaxTrianglesToRender": 1,
            "SystemSettings|r.Shadow.MaxCSMResolution": 256,
            "SystemSettings|r.Shadow.CSM.MaxCascades": 1,
            "SystemSettings|r.ParticleLightQuality": 0,
            "SystemSettings|r.SkyLightingQuality": 0,
            "SystemSettings|fx.Niagara.QualityLevel": 0,
            // "SystemSettings|r.MipMapLODBias": 3,
            "SystemSettings|r.Streaming.MipBias": 2,
            "SystemSettings|r.Streaming.AmortizeCPUToGPUCopy": 1,
            "SystemSettings|r.Streaming.MaxNumTexturesToStreamPerFrame": 5,
            "SystemSettings|r.Streaming.Boost": 1,
            "SystemSettings|r.MaxQualityMode": 0,
            "SystemSettings|r.ViewDistanceScale.ApplySecondaryScale": 1,
            "SystemSettings|r.ViewDistanceScale.SecondaryScale": 0.5,
            "SystemSettings|r.SkeletalMeshLODBias": 3,
            "SystemSettings|r.StaticMeshLODDistanceScale": 4,
            "SystemSettings|r.SkeletalMesh.MinLodQualityLevel": 0,
            "SystemSettings|r.SkeletalMesh.StreamLODsEnabled": 0,
            "SystemSettings|r.DistanceFieldShadowing": 0,
            "SystemSettings|r.DistanceFieldAO": 0,
            "SystemSettings|r.DynamicGlobalIlluminationMethod": 0,
            "SystemSettings|r.ReflectionMethod": 0,
            "SystemSettings|r.Lumen.DiffuseIndirect.Allow": 0,
            "SystemSettings|r.Lumen.Reflections.Allow": 0,
            "SystemSettings|r.Lumen.ScreenProbeGather.Allow": 0,
            "SystemSettings|r.FinishCurrentFrame": 0,
            "SystemSettings|r.BasePassForceOutputsVelocity": 0,
            "SystemSettings|r.MotionBlurQuality": 0,
            "SystemSettings|r.AmbientOcclusionLevels": 0,
            "SystemSettings|r.GBufferFormat": 0,
            "SystemSettings|r.VirtualTexture": 0,
            "SystemSettings|r.LightFunctionQuality": 0,
            "SystemSettings|r.ShadowQuality": 0,
            "SystemSettings|r.Shadow.MaxResolution": 16,
            "SystemSettings|r.Shadow.RadiusThreshold": 0.03,
            "SystemSettings|r.Shadow.DistanceScale": 0.1,
            "SystemSettings|r.AllowLandscapeShadows": 0,
            "SystemSettings|ContactShadows": 0,
            "SystemSettings|r.LightShafts": 0,
            "SystemSettings|r.BloomQuality": 0,
            "SystemSettings|r.EyeAdaptationQuality": 0,
            "SystemSettings|r.TonemapperQuality": 0,
            "SystemSettings|r.AmbientOcclusionRadiusScale": 0,
            "SystemSettings|r.LensFlareQuality": 0,
            "SystemSettings|r.SceneColorFringeQuality": 0,
            "SystemSettings|r.DepthOfFieldQuality": 0,
            "SystemSettings|r.RenderTargetPoolMin": 100,
            "SystemSettings|r.Upscale.Quality": 0,
            "SystemSettings|r.TemporalAA.Upsampling": 0,
            "SystemSettings|r.PostProcessAAQuality": 0,
            "SystemSettings|r.ScreenPercentage": 50,
            "SystemSettings|r.RefractionQuality": 0,
            "SystemSettings|r.ReflectionEnvironment": 0,
            "SystemSettings|r.SSR.Quality": 0,
            "SystemSettings|r.SSR.Temporal": 0,
            "SystemSettings|r.SSR.HalfResSceneColor": 1,
            "SystemSettings|fx.MaxCPUParticlesPerEmitter": 10,
            "SystemSettings|r.EmitterSpawnRateScale": 0.1,
            "SystemSettings|r.FastBlurThreshold": 0,
            "SystemSettings|r.TranslucencyLightingVolumeDim": 1,
            "SystemSettings|foliage.DensityScale": 0,
            "SystemSettings|grass.DensityScale": 0,
            "SystemSettings|r.LODDistanceFactor": 3,
            "SystemSettings|r.DetailMode": 0,
            "SystemSettings|r.DefaultFeature.AutoExposure": "False",
            "SystemSettings|r.DefaultFeature.LensFlare": "False",
            "SystemSettings|r.DefaultFeature.LightUnits": 1,
            "SystemSettings|r.HZBOcclusion": 0,
            "SystemSettings|r.SceneColorFormat": 3,
            "SystemSettings|r.SupportSkyAtmosphere": 0,
            "SystemSettings|r.SupportLowQualityLightmaps": 1,
            "SystemSettings|r.SupportPointLightWholeSceneShadows": 0,
            "SystemSettings|r.SupportSkyLighting": 0,
            "SystemSettings|r.SupportStationarySkylight": 0,
            "SystemSettings|r.MobileHDR": 0,
            "SystemSettings|r.bForceCPUUpdateBoundingBoxes": 1,
            "SystemSettings|r.DisableLODFade": 1,
            "SystemSettings|r.Tessellation": 0,
            "SystemSettings|r.Occlusion.MaxPixelShaderDiffuseLuminance": 0.01,
            "SystemSettings|r.ForceLOD": 1,
            "SystemSettings|r.LightmapStreaming": 1,
            "SystemSettings|r.LightmapStreaming.MaxRequestedMipBias": 2,
            "SystemSettings|r.GTS.Async": 1,
            "SystemSettings|r.Streaming.FullyLoadUsedTextures": 0,
            "SystemSettings|r.Streaming.DefragDynamicBounds": 0,
            "SystemSettings|r.Streaming.UnloadDoneInManagerTick": 0,
            "SystemSettings|r.Streaming.UseMipsFarAway": 1,
            "SystemSettings|r.Streaming.FullyLoadLODs": 0,
            "SystemSettings|r.Streaming.MaxEffectiveSize": 100,
            "SystemSettings|r.Streaming.HiddenPrimitiveScale": 2,
            "SystemSettings|r.CustomDepth": 0,
            "SystemSettings|r.AllowGlobalClipPlane": 0,
            "SystemSettings|r.AllowCompaction": 1,
            "SystemSettings|r.Streaming.MaxTextureSize": 512,
            "SystemSettings|r.ForceReleaseTextureImmediately": 1,
            "SystemSettings|r.MSAACount": 1,
            "SystemSettings|r.HLOD": 1,
            "SystemSettings|r.HLOD.VisibilityQueryLODOffset": 2,
            "/Script/Engine.RendererSettings|r.Mobile.DisableVertexFog": "True",
            "/Script/Engine.RendererSettings|r.DefaultFeature.Bloom": "False",
            "/Script/Engine.RendererSettings|r.DefaultFeature.AmbientOcclusion": "False",
            "/Script/Engine.RendererSettings|r.DefaultFeature.AntiAliasing": 0,
            "/Script/Engine.RendererSettings|r.DefaultFeature.LensFlare": "False",
            "/Script/Engine.RendererSettings|r.DefaultFeature.LightUnits": 1,
            "/Script/Engine.RendererSettings|r.MobileHDR": "False",
            "/Script/Engine.RendererSettings|r.AllowOcclusionQueries": "True",
            "/Script/Engine.RendererSettings|r.SupportLowQualityLightmaps": "True",
            "/Script/Engine.RendererSettings|r.SupportStationarySkylight": "False",
            "/Script/Engine.RendererSettings|r.SupportSkyLighting": "False",
            "/Script/Engine.RendererSettings|r.SupportPointLightWholeSceneShadows": "False",
            "/Script/Engine.RendererSettings|r.Shadow.CSM.MaxCascades": 1,
            "/Script/Engine.RendererSettings|r.ReflectionEnvironment": "False",
            "/Script/Engine.RendererSettings|r.ReflectionCaptureResolution": 16,
            "/Script/Engine.RendererSettings|r.TranslucentSortPolicy": 0,
            "/Script/Engine.RendererSettings|r.DistanceFieldAO": "False",
            "/Script/Engine.RendererSettings|r.DistanceFieldShadowing": "False",
            "/Script/Engine.RendererSettings|r.RayTracing": "False",
            "ConsoleVariables|r.Streaming.MaxDynamicPoolSize": 100,
            "ConsoleVariables|r.Streaming.FramesForFullUpdate": 15,
            "ConsoleVariables|r.UseShaderCaching": 1,
            "ConsoleVariables|r.UseAsyncPrecompile": 1,
            "ConsoleVariables|r.UseAsyncPrecompileForFeatureLevelUpgrade": 1,
            "ConsoleVariables|r.TargetPrecompileFrameTime": 10,
            "ConsoleVariables|r.PrecompileShadersForFeatureLevel": 1,
            "ConsoleVariables|r.GPUCulling": 0,
            "ConsoleVariables|r.EarlyZPass": 2,
            "ConsoleVariables|r.ParallelSceneRendering": 1,
            "ConsoleVariables|fx.ParallelSystemEvaluation": 1,
            "ConsoleVariables|fx.MaxGPUParticlesSpawnCount": 512,
            "ConsoleVariables|r.DoParallelDepthPrepass": 1,
        },
        medium: {
            ...commonOptions,
            "SystemSettings|r.PostProcessQuality": 0,
            "SystemSettings|r.DefaultFeature.Bloom": 0,
            "SystemSettings|r.DefaultFeature.AmbientOcclusion": 0,
            "SystemSettings|r.DefaultFeature.MotionBlur": "False",
            "SystemSettings|r.Tonemapper.Quality": 0,
            "SystemSettings|r.LightShaftQuality": 0,
            "SystemSettings|r.Tonemapper.GrainQuantization": 0,
            "SystemSettings|r.TranslucencyVolumeBlur": 0,
            "SystemSettings|r.MaterialQualityLevel": 0,
            "SystemSettings|r.Shadow.MaxCSMResolution": 256,
            "SystemSettings|r.Shadow.CSM.MaxCascades": 1,
            "SystemSettings|r.ParticleLightQuality": 0,
            "SystemSettings|r.SkyLightingQuality": 0,
            "SystemSettings|fx.Niagara.QualityLevel": 0,
            "SystemSettings|r.MaxQualityMode": 0,
            "SystemSettings|r.ViewDistanceScale.ApplySecondaryScale": 1,
            "SystemSettings|r.SkeletalMeshLODBias": 3,
            "SystemSettings|r.SkeletalMesh.MinLodQualityLevel": 0,
            "SystemSettings|r.SkeletalMesh.StreamLODsEnabled": 0,
            "SystemSettings|r.DistanceFieldShadowing": 0,
            "SystemSettings|r.DistanceFieldAO": 0,
            "SystemSettings|r.DynamicGlobalIlluminationMethod": 0,
            "SystemSettings|r.ReflectionMethod": 0,
            "SystemSettings|r.Lumen.DiffuseIndirect.Allow": 0,
            "SystemSettings|r.Lumen.Reflections.Allow": 0,
            "SystemSettings|r.Lumen.ScreenProbeGather.Allow": 0,
            "SystemSettings|r.FinishCurrentFrame": 0,
            "SystemSettings|r.BasePassForceOutputsVelocity": 0,
            "SystemSettings|r.MotionBlurQuality": 0,
            "SystemSettings|r.AmbientOcclusionLevels": 0,
            "SystemSettings|r.GBufferFormat": 0,
            "SystemSettings|r.VirtualTexture": 0,
            "SystemSettings|r.LightFunctionQuality": 0,
            "SystemSettings|r.ShadowQuality": 0,
            "SystemSettings|r.Shadow.MaxResolution": 16,
            "SystemSettings|r.Shadow.RadiusThreshold": 0.03,
            "SystemSettings|r.Shadow.DistanceScale": 0.1,
            "SystemSettings|r.AllowLandscapeShadows": 0,
            "SystemSettings|r.LightShafts": 0,
            "SystemSettings|r.BloomQuality": 0,
            "SystemSettings|r.EyeAdaptationQuality": 0,
            "SystemSettings|r.TonemapperQuality": 0,
            "SystemSettings|r.AmbientOcclusionRadiusScale": 0,
            "SystemSettings|r.LensFlareQuality": 0,
            "SystemSettings|r.SceneColorFringeQuality": 0,
            "SystemSettings|r.DepthOfFieldQuality": 0,
            "SystemSettings|r.Upscale.Quality": 0,
            "SystemSettings|r.TemporalAA.Upsampling": 0,
            "SystemSettings|r.PostProcessAAQuality": 0,
            "SystemSettings|r.RefractionQuality": 0,
            "SystemSettings|r.ReflectionEnvironment": 0,
            "SystemSettings|fx.MaxCPUParticlesPerEmitter": 100000,
            "SystemSettings|r.EmitterSpawnRateScale": 0.1,
            "SystemSettings|r.FastBlurThreshold": 0,
            "SystemSettings|r.TranslucencyLightingVolumeDim": 1,
            "SystemSettings|foliage.DensityScale": 0,
            "SystemSettings|grass.DensityScale": 0,
            "SystemSettings|r.LODDistanceFactor": 3,
            "SystemSettings|r.DetailMode": 0,
            "SystemSettings|r.DefaultFeature.AutoExposure": "False",
            "SystemSettings|r.DefaultFeature.LensFlare": "False",
            "SystemSettings|r.DefaultFeature.LightUnits": 1,
            "SystemSettings|r.HZBOcclusion": 0,
            "SystemSettings|r.SceneColorFormat": 3,
            "SystemSettings|r.SupportSkyAtmosphere": 0,
            "SystemSettings|r.SupportLowQualityLightmaps": 1,
            "SystemSettings|r.SupportPointLightWholeSceneShadows": 0,
            "SystemSettings|r.SupportSkyLighting": 0,
            "SystemSettings|r.SupportStationarySkylight": 0,
            "SystemSettings|r.MobileHDR": 0,
            "SystemSettings|r.bForceCPUUpdateBoundingBoxes": 1,
            "SystemSettings|r.DisableLODFade": 1,
            "SystemSettings|r.Tessellation": 0,
            "SystemSettings|r.Occlusion.MaxPixelShaderDiffuseLuminance": 0.01,
            "SystemSettings|r.ForceLOD": 1,
            "SystemSettings|r.GTS.Async": 1,
            "SystemSettings|r.CustomDepth": 0,
            "SystemSettings|r.AllowGlobalClipPlane": 0,
            "SystemSettings|r.AllowCompaction": 1,
            "SystemSettings|r.ForceReleaseTextureImmediately": 1,
            "SystemSettings|r.MSAACount": 1,
            "SystemSettings|r.HLOD": 1,
            "SystemSettings|r.HLOD.VisibilityQueryLODOffset": 2,
            "/Script/Engine.RendererSettings|r.AllowOcclusionQueries": "True",
            "/Script/Engine.RendererSettings|r.SupportLowQualityLightmaps": "True",
            "/Script/Engine.RendererSettings|r.SupportStationarySkylight": "False",
            "/Script/Engine.RendererSettings|r.SupportSkyLighting": "False",
            "/Script/Engine.RendererSettings|r.SupportPointLightWholeSceneShadows": "False",
            "/Script/Engine.RendererSettings|r.ReflectionEnvironment": "False",
            "/Script/Engine.RendererSettings|r.ReflectionCaptureResolution": 16,
            "/Script/Engine.RendererSettings|r.TranslucentSortPolicy": 0,
            "/Script/Engine.RendererSettings|r.DistanceFieldAO": "False",
            "/Script/Engine.RendererSettings|r.DistanceFieldShadowing": "False",
            "/Script/Engine.RendererSettings|r.RayTracing": "False",
        },
        high: {
            ...commonOptions,
            "SystemSettings|foliage.DiscardDataOnLoad": 1,
            "SystemSettings|foliage.MaxTrianglesToRender": 1,
            "SystemSettings|r.Shadow.MaxCSMResolution": 256,
            "SystemSettings|r.Shadow.CSM.MaxCascades": 1,
            "SystemSettings|foliage.DensityScale": 0,
            "SystemSettings|grass.DensityScale": 0,
            "SystemSettings|r.DetailMode": 0,
            "SystemSettings|r.Lumen.DiffuseIndirect.Allow": 0,
            "SystemSettings|r.Lumen.Reflections.Allow": 0,
            "SystemSettings|r.Lumen.ScreenProbeGather.Allow": 0,
            "SystemSettings|r.FinishCurrentFrame": 0,
            "SystemSettings|r.BasePassForceOutputsVelocity": 0,
            "SystemSettings|r.MotionBlurQuality": 0,
            "SystemSettings|r.AmbientOcclusionLevels": 0,
            "SystemSettings|r.GBufferFormat": 0,
            "SystemSettings|r.VirtualTexture": 0,
            "SystemSettings|r.CustomDepth": 0,
            "SystemSettings|r.AllowGlobalClipPlane": 0,
            "SystemSettings|r.AllowCompaction": 1,
            "SystemSettings|r.ForceReleaseTextureImmediately": 1,
            "SystemSettings|r.MSAACount": 1,
            "SystemSettings|r.HLOD": 1,
            "SystemSettings|r.HLOD.VisibilityQueryLODOffset": 2,
            "/Script/Engine.RendererSettings|r.AllowOcclusionQueries": "True",
            "/Script/Engine.RendererSettings|r.SupportLowQualityLightmaps": "True",
            "/Script/Engine.RendererSettings|r.SupportStationarySkylight": "False",
            "/Script/Engine.RendererSettings|r.SupportSkyLighting": "False",
            "/Script/Engine.RendererSettings|r.SupportPointLightWholeSceneShadows": "False",
            "/Script/Engine.RendererSettings|r.ReflectionEnvironment": "False",
            "/Script/Engine.RendererSettings|r.ReflectionCaptureResolution": 16,
            "/Script/Engine.RendererSettings|r.TranslucentSortPolicy": 0,
            "/Script/Engine.RendererSettings|r.DistanceFieldAO": "False",
            "/Script/Engine.RendererSettings|r.DistanceFieldShadowing": "False",
            "/Script/Engine.RendererSettings|r.RayTracing": "False",
        },
        ultra: {
            ...commonOptions,
            "/Script/Engine.RendererSettings|r.AllowOcclusionQueries": "True",
            "/Script/Engine.RendererSettings|r.SupportLowQualityLightmaps": "True",
            "/Script/Engine.RendererSettings|r.SupportStationarySkylight": "False",
            "/Script/Engine.RendererSettings|r.SupportSkyLighting": "False",
            "/Script/Engine.RendererSettings|r.SupportPointLightWholeSceneShadows": "False",
            "/Script/Engine.RendererSettings|r.ReflectionEnvironment": "False",
            "/Script/Engine.RendererSettings|r.ReflectionCaptureResolution": 16,
            "/Script/Engine.RendererSettings|r.TranslucentSortPolicy": 0,
            "/Script/Engine.RendererSettings|r.DistanceFieldAO": "False",
            "/Script/Engine.RendererSettings|r.DistanceFieldShadowing": "False",
            "/Script/Engine.RendererSettings|r.RayTracing": "False",
        },
    }

    const presetValues = presets[preset]
    if (!presetValues) return
    resetConfig()
    for (const [sectionKey, value] of Object.entries(presetValues)) {
        const [section, key] = sectionKey.split("|")
        if (!section || !key) continue

        const iniFile = getIniFile(section)
        if (!iniFile[section]) {
            iniFile[section] = {}
        }
        iniFile[section][key] = value
    }
    await saveConfigs()
}

// 监听游戏路径变化
watch(
    () => game.path,
    () => {
        if (game.path) {
            loadConfigs()
        }
    }
)

// 组件挂载时加载配置
onMounted(() => {
    loadConfigs()
})

function openConfigDir() {
    if (configDir.value) {
        openExplorer(configDir.value)
    }
}
</script>

<template>
    <div class="p-4 flex flex-col gap-4">
        <!-- 配置文件路径显示 -->
        <div v-if="game.path" class="bg-base-200 p-2 rounded-lg text-sm">
            <div class="text-base-content/70">配置目录:</div>
            <div class="font-mono text-xs break-all hover:underline cursor-pointer" @click="openConfigDir">{{ configDir
            }}</div>
        </div>
        <div v-else class="bg-warning/10 p-2 rounded-lg text-sm text-warning">请先在游戏设置中配置游戏路径</div>

        <!-- 预设配置 -->
        <div v-if="game.path" class="bg-base-100 p-4 rounded-lg">
            <h3 class="text-sm font-bold mb-3">性能优化预设</h3>
            <div class="flex gap-2">
                <button class="btn btn-sm btn-outline" @click="resetToDefault">无优化</button>
                <button class="btn btn-sm btn-outline" @click="applyPreset('low')">极低</button>
                <button class="btn btn-sm btn-outline" @click="applyPreset('medium')">低</button>
                <button class="btn btn-sm btn-outline" @click="applyPreset('high')">中</button>
                <button class="btn btn-sm btn-outline" @click="applyPreset('ultra')">高</button>
            </div>
        </div>

        <!-- 游戏设置（单独显示，不放在折叠框中） -->
        <div v-if="game.path" class="bg-base-100 p-4 rounded-lg mb-4">
            <h3 class="text-sm font-bold mb-3">游戏设置</h3>
            <div v-if="gameSettingsCategory.description" class="text-xs text-base-content/50 my-3">
                {{ gameSettingsCategory.description }}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <!-- 分辨率设置 -->
                <div class="flex flex-col gap-2 p-3 bg-base-200 rounded md:col-span-2">
                    <div class="text-sm font-medium">分辨率</div>
                    <div class="text-xs text-base-content/50">游戏窗口分辨率</div>
                    <div class="flex flex-wrap gap-2 mt-2">
                        <button v-for="res in commonResolutions" :key="res.label" class="btn btn-sm" :class="{
                            'btn-primary':
                                !isCustomResolution && currentResolution.width === res.width && currentResolution.height === res.height,
                            'btn-outline':
                                isCustomResolution || currentResolution.width !== res.width || currentResolution.height !== res.height,
                        }" @click="selectResolution(res.width, res.height)">
                            {{ res.label }}
                        </button>
                        <button class="btn btn-sm" :class="{
                            'btn-primary': isCustomResolution,
                            'btn-outline': !isCustomResolution,
                        }" @click="isCustomResolution = true">
                            自定义
                        </button>
                    </div>
                    <!-- 自定义分辨率输入 -->
                    <div v-if="isCustomResolution" class="flex items-center gap-2 mt-2">
                        <input v-model.number="customResolution.width" type="number"
                            class="input input-bordered input-sm w-24" placeholder="宽度" />
                        <span class="text-base-content/50">x</span>
                        <input v-model.number="customResolution.height" type="number"
                            class="input input-bordered input-sm w-24" placeholder="高度" />
                        <button class="btn btn-sm btn-primary" @click="applyCustomResolution">应用</button>
                    </div>
                </div>

                <!-- 其他游戏设置选项 -->
                <div v-for="option in gameSettingsCategory.options.filter(opt => opt.key !== 'ResolutionSize')"
                    :key="option.key" class="flex flex-col gap-2 p-3 bg-base-200 rounded">
                    <!-- 标题和操作区 -->
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-sm font-medium">{{ option.label }}</span>
                        <button class="btn btn-ghost btn-xs text-base-content/50" title="重置为默认值"
                            @click="resetOption(option)">
                            <Icon icon="ri:refresh-line" />
                        </button>
                    </div>

                    <!-- 描述 -->
                    <div v-if="option.description" class="text-xs text-base-content/50">
                        {{ option.description }}
                    </div>

                    <!-- 配置项值输入区 -->
                    <div class="flex items-center gap-2">
                        <!-- 布尔值开关 -->
                        <div v-if="option.type === 'boolean'" class="flex-1">
                            <input :checked="getOptionValue(option)" type="checkbox" class="toggle toggle-secondary"
                                @change="setOptionValue(option, ($event.target as HTMLInputElement).checked)" />
                        </div>

                        <!-- 数字输入 -->
                        <div v-else-if="option.type === 'number'" class="flex-1">
                            <input :value="getOptionValue(option)" type="number"
                                class="input input-bordered input-sm w-full"
                                @input="setOptionValue(option, parseFloat(($event.target as HTMLInputElement).value))" />
                        </div>

                        <!-- 选择器 -->
                        <div v-else-if="option.type === 'select'" class="flex-1">
                            <Select :model-value="getOptionValue(option)"
                                class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-full"
                                @update:model-value="setOptionValue(option, $event)">
                                <SelectItem v-for="(opt, idx) in option.options" :key="idx" :value="opt.value">
                                    {{ opt.label }}
                                </SelectItem>
                            </Select>
                        </div>

                        <!-- 默认值显示 -->
                        <div class="text-xs text-base-content/50 whitespace-nowrap">默认: {{ option.defaultValue }}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 引擎设置分类（放在折叠框中） -->
        <div v-if="game.path" class="space-y-4">
            <CollapsibleSection v-for="category in engineCategories" :key="category.name" :title="category.label"
                :is-open="expandedCategories.has(category.name)" @toggle="toggleCategory(category.name)">
                <div v-if="category.description" class="text-xs text-base-content/50 my-3">
                    {{ category.description }}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div v-for="option in category.options" :key="option.key"
                        class="flex flex-col gap-2 p-3 bg-base-200 rounded">
                        <!-- 标题和操作区 -->
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <!-- 启用/禁用开关 -->
                                <input :checked="isOptionEnabled(option)" type="checkbox"
                                    class="toggle toggle-primary toggle-sm" @change="toggleOptionEnabled(option)" />
                                <span class="text-sm font-medium">{{ option.label }}</span>
                            </div>
                            <button class="btn btn-ghost btn-xs text-base-content/50" title="重置为默认值"
                                @click="resetOption(option)">
                                <Icon icon="ri:refresh-line" />
                            </button>
                        </div>

                        <!-- 描述 -->
                        <div v-if="option.description" class="text-xs text-base-content/50">
                            {{ option.description }}
                        </div>

                        <!-- 配置项值输入区 -->
                        <div class="flex items-center gap-2">
                            <!-- 布尔值开关 -->
                            <div v-if="option.type === 'boolean'" class="flex-1">
                                <input :checked="getOptionValue(option)" type="checkbox" class="toggle toggle-secondary"
                                    :disabled="!isOptionEnabled(option)"
                                    @change="setOptionValue(option, ($event.target as HTMLInputElement).checked)" />
                            </div>

                            <!-- 数字输入 -->
                            <div v-else-if="option.type === 'number'" class="flex-1">
                                <input :value="getOptionValue(option)" type="number"
                                    class="input input-bordered input-sm w-full" :disabled="!isOptionEnabled(option)"
                                    @input="setOptionValue(option, parseFloat(($event.target as HTMLInputElement).value))" />
                            </div>

                            <!-- 字符串输入 -->
                            <div v-else-if="option.type === 'string'" class="flex-1">
                                <input :value="getOptionValue(option)" type="text"
                                    class="input input-bordered input-sm w-full" :disabled="!isOptionEnabled(option)"
                                    @input="setOptionValue(option, ($event.target as HTMLInputElement).value)" />
                            </div>

                            <!-- 选择器 -->
                            <div v-else-if="option.type === 'select'" class="flex-1">
                                <Select :model-value="getOptionValue(option)"
                                    class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-full"
                                    :disabled="!isOptionEnabled(option)"
                                    @update:model-value="setOptionValue(option, $event)">
                                    <SelectItem v-for="(opt, idx) in option.options" :key="idx" :value="opt.value">
                                        {{ opt.label }}
                                    </SelectItem>
                                </Select>
                            </div>

                            <!-- 默认值显示 -->
                            <div class="text-xs text-base-content/50 whitespace-nowrap">默认: {{ option.defaultValue }}
                            </div>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>
        </div>
    </div>
</template>
