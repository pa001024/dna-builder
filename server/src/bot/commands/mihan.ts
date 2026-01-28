import type { BaseCommand, CommandContext } from "./interfaces"

/**
 * 测试命令
 */
export class TestCommand implements BaseCommand {
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
    async execute(context: CommandContext) {
        if (context.type !== "group") {
            return null
        }
        await context.client.sendGroupImageMessage("", context.groupId, "https://example.com/委托密函.jpg")
        return null
    }
}
