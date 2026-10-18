import { env } from "../env"

/**
 * Agent 技能的 REST 接口封装（服务端见 `server/src/api/agent-skill.ts`）。
 *
 * 技能库是服务端 `server/skills/<技能名>/` 下的普通目录，由 git 管理版本——接口只有清单与
 * 整包下载两个只读能力，新增 / 修改 / 删除技能都直接改文件提交，没有管理写入接口。
 */

/** 技能元数据（清单返回，不含包体） */
export interface AgentSkillMeta {
    /** 技能标识（目录名 kebab-case，技能清单与 `skill` 工具都用它引用） */
    name: string
    description: string
    whenToUse: string | null
    version: string | null
    enabled: boolean
    sortOrder: number
    /** 技能目录内容的 zip 摘要（hex），完整性校验与落盘缓存键 */
    packageSha: string
    /** zip 包大小（字节） */
    packageSize: number
    /** 目录内文件数 */
    fileCount: number
    /** 目录内容最后修改时间（毫秒） */
    updateAt: number
}

/** 服务端返回的错误结构 */
interface AgentSkillFailure {
    success: false
    error: string
}

const BASE_URL = `${env.apiEndpoint.replace(/\/$/, "")}/api/v1/agent/skills`

/** 列出启用的技能元数据（公开接口）。 */
export async function listAgentSkills(): Promise<{ skills: AgentSkillMeta[] }> {
    const response = await fetch(`${BASE_URL}/`)

    let payload: unknown = null
    try {
        payload = await response.json()
    } catch {
        // 网关返回的非 JSON 错误体，交给下面的状态码分支
    }

    const failure = payload as AgentSkillFailure | null
    if (!response.ok || failure?.success === false) {
        throw new Error(failure?.error || `请求失败（HTTP ${response.status}）`)
    }

    return payload as { skills: AgentSkillMeta[] }
}

/**
 * 下载技能的 zip 资源包（公开接口；调用方自行校验 sha256 后解压）。
 * URL 带上清单里的 sha 做内容寻址：内容更新后 URL 随之变化，避免浏览器 / CDN 继续命中旧包的 HTTP 缓存。
 */
export async function downloadAgentSkillPackage(name: string, packageSha?: string | null): Promise<Uint8Array> {
    const query = packageSha ? `?sha=${packageSha}` : ""
    const response = await fetch(`${BASE_URL}/${encodeURIComponent(name)}/package${query}`)
    if (!response.ok) {
        throw new Error(`下载技能包失败（HTTP ${response.status}）`)
    }

    return new Uint8Array(await response.arrayBuffer())
}
