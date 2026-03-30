import fs from "node:fs/promises"
import path from "node:path"

/**
 * 生成 frpc 的 Docker Compose 配置。
 * 配置里使用官方文档推荐的 `-f <访问密钥>:<隧道ID>` 启动参数形式。
 */

/**
 * 写出 compose 文件。
 * @param {string} projectRoot
 * @param {string} tunnelIds
 * @param {string} token
 * @returns {Promise<string>}
 */
export async function writeFrpcCompose(projectRoot: string, tunnelIds: string, token: string): Promise<string> {
    const composePath = path.join(projectRoot, "docker-compose.frpc.yml")
    const content = [
        'version: "3.9"',
        "services:",
        "  dob-bot-frpc:",
        "    image: natfrp.com/frpc",
        "    restart: always",
        "    extra_hosts:",
        "      - host.docker.internal:host-gateway",
        "    command:",
        `      - --disable_log_color`,
        `      - -f`,
        `      - ${token}:${tunnelIds}`,
        "",
    ].join("\n")

    await fs.writeFile(composePath, content, "utf8")
    return composePath
}
