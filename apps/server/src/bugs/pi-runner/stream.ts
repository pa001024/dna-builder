import { assertModelUsable, type PiModelLike, type PiStreamFn } from "./agent"
import { type PiRunnerConfig, PiRunnerError } from "./config"

/** pi-ai 发布 API 的结构化子集；依赖未安装时本模块仍可被导入（加载发生在运行期）。 */
export type CredentialStoreLike = {
    read(providerId: string): Promise<unknown>
    list(): Promise<readonly unknown[]>
    modify(providerId: string, fn: (current: unknown) => Promise<unknown>): Promise<unknown>
    delete(providerId: string): Promise<void>
}

export type MutableModelsLike = {
    setProvider(provider: unknown): void
    getModel(provider: string, id: string): PiModelLike | undefined
    streamSimple: PiStreamFn
}

export type PiAiModule = {
    createModels(options?: { credentials?: CredentialStoreLike }): MutableModelsLike
    InMemoryCredentialStore: new () => CredentialStoreLike
}

export type PiProviderFactory = () => unknown
export type PiStreamSetup = { model: PiModelLike; streamFn: PiStreamFn; provider: string; modelId: string }

/** 每个 provider 单独加载其工厂，避免把全部内置 provider 与凭据解析面带进 Runner。 */
const PROVIDER_LOADERS: Record<string, { module: string; exportName: string }> = {
    anthropic: { module: "@earendil-works/pi-ai/providers/anthropic", exportName: "anthropicProvider" },
    openai: { module: "@earendil-works/pi-ai/providers/openai", exportName: "openaiProvider" },
    google: { module: "@earendil-works/pi-ai/providers/google", exportName: "googleProvider" },
    openrouter: { module: "@earendil-works/pi-ai/providers/openrouter", exportName: "openrouterProvider" },
    deepseek: { module: "@earendil-works/pi-ai/providers/deepseek", exportName: "deepseekProvider" },
}

function dependencyError(specifier: string, error: unknown): PiRunnerError {
    return new PiRunnerError("deps_missing", `无法加载 ${specifier}`, {
        detail: { error: error instanceof Error ? error.message : String(error) },
    })
}

async function loadPiAiModule(): Promise<PiAiModule> {
    const specifier = "@earendil-works/pi-ai"
    try {
        return (await import(specifier)) as PiAiModule
    } catch (error) {
        throw dependencyError(specifier, error)
    }
}

async function loadProviderFactory(provider: string): Promise<PiProviderFactory> {
    const entry = PROVIDER_LOADERS[provider]
    if (!entry) {
        throw new PiRunnerError("provider_not_allowed", `provider ${provider} 没有受控的装配入口`, { detail: { provider } })
    }
    try {
        const module = (await import(entry.module)) as Record<string, unknown>
        const factory = module[entry.exportName]
        if (typeof factory !== "function") {
            throw new PiRunnerError("deps_missing", `${entry.module} 未导出 ${entry.exportName}`)
        }
        return factory as PiProviderFactory
    } catch (error) {
        if (error instanceof PiRunnerError) throw error
        throw dependencyError(entry.module, error)
    }
}

/**
 * @description 装配 pi-ai：内存凭据存储 → createModels → 显式 setProvider → getModel，
 * 最后把 `models.streamSimple` 显式绑定为 streamFn。空 key、allowlist 外 provider、
 * 未知模型或不支持图片的模型都在此处 fail-closed。
 * @param config Runner 配置
 * @param deps 依赖注入（测试用假模块，不触网）
 */
export async function createPiStreamSetup(
    config: PiRunnerConfig,
    deps: { loadModule?: () => Promise<PiAiModule>; loadProvider?: (provider: string) => Promise<PiProviderFactory> } = {}
): Promise<PiStreamSetup> {
    if (!config.providerAllowlist.includes(config.provider)) {
        throw new PiRunnerError("provider_not_allowed", `provider ${config.provider} 不在 allowlist 内`, {
            detail: { allowlist: config.providerAllowlist },
        })
    }
    if (!config.apiKey.trim()) throw new PiRunnerError("config_invalid", "PI_API_KEY 不能为空")

    const module = await (deps.loadModule ?? loadPiAiModule)()
    const credentials = new module.InMemoryCredentialStore()
    await credentials.modify(config.provider, async () => ({ type: "api_key", key: config.apiKey }))

    const models = module.createModels({ credentials })
    const factory = await (deps.loadProvider ?? loadProviderFactory)(config.provider)
    models.setProvider(factory())

    const model = models.getModel(config.provider, config.model)
    assertModelUsable(model, { provider: config.provider, modelId: config.model })
    if (typeof models.streamSimple !== "function") throw new PiRunnerError("deps_missing", "pi-ai 未提供 streamSimple")

    return {
        model: model!,
        streamFn: models.streamSimple.bind(models) as PiStreamFn,
        provider: config.provider,
        modelId: config.model,
    }
}
