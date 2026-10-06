import { Elysia, t } from "elysia"
import { listSkills, readSkillPackage } from "./agent-skill-library"

/**
 * Agent 技能（远端 skill）的只读分发接口：清单与整包下载。
 *
 * 技能库是文件系统里的 `server/skills/<技能名>/`，由 git 管理版本——没有写入接口，
 * 新增 / 修改 / 删除技能都直接改目录提交。清单每次实时 stat 目录，改完即生效。
 */

/** 创建 Agent 技能接口插件（无鉴权：技能是提示词性质内容，任何客户端都可加载）。 */
export function agentSkillPlugin() {
    return (
        new Elysia({ prefix: "/api/v1/agent/skills" })
            // 公开：启用的技能清单（元数据；包体在下载接口实时打包）
            .get("/", async () => {
                const skills = await listSkills()

                return { success: true as const, skills: skills.filter(skill => skill.enabled) }
            })
            // 公开：下载技能 zip 包（按名，实时打包；URL 上的 sha 仅做内容寻址，不参与校验）
            .get(
                "/:name/package",
                async ({ params, set }) => {
                    const zip = await readSkillPackage(params.name.toLowerCase())

                    if (!zip) {
                        set.status = 404
                        return { success: false as const, error: "技能不存在或已停用" }
                    }

                    // 包按内容寻址（客户端在 URL 上带清单里的 sha）：内容不变时可安全走浏览器 / CDN 缓存，
                    // 换内容后 URL 变化自然绕过旧缓存；:name 之外的查询参数不参与校验
                    set.headers["content-type"] = "application/zip"
                    set.headers["cache-control"] = "public, max-age=300"

                    return new Response(new Blob([new Uint8Array(zip)], { type: "application/zip" }))
                },
                { params: t.Object({ name: t.String() }) }
            )
    )
}
