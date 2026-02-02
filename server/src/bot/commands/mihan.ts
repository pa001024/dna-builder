import { desc, eq } from "drizzle-orm"
import { db, schema } from "../../db"
import type { BaseCommand, CommandContext } from "./interfaces"

/**
 * 委托命令
 */
export class MihanCommand implements BaseCommand {
    /**
     * 命令名称
     */
    name: string = "委托"

    /**
     * 命令描述
     */
    description: string = "获取委托密函信息"

    /**
     * 执行命令
     */
    async execute(_context: CommandContext) {
        const next = (t?: number) => {
            const now = t ?? Date.now()
            const oneHour = 60 * 60 * 1000
            return Math.ceil(now / oneHour) * oneHour
        }
        const missionsIngame = await db.query.missionsIngame.findFirst({
            where: eq(schema.missionsIngame.server, "cn"),
            orderBy: desc(schema.missionsIngame.id),
        })
        if (!missionsIngame) return "数据异常"
        const nextHour = next(new Date(missionsIngame.createdAt ?? 0).getTime())
        if (nextHour <= Date.now()) {
            return "数据过期"
        }
        return `角色: ${missionsIngame.missions[0].map(v => v.replace("/无尽", "")).join(" | ")}
武器: ${missionsIngame.missions[1].map(v => v.replace("/无尽", "")).join(" | ")}
魔之楔: ${missionsIngame.missions[2].map(v => v.replace("/无尽", "")).join(" | ")}

下次刷新 ${new Date(nextHour).toLocaleString()}`
    }
}
