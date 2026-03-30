import type { BaseCommand, CommandContext } from "./interfaces"

/**
 * 测试命令
 */
export class TestCommand implements BaseCommand {
    /**
     * 命令名称
     */
    name: string = "测试"

    /**
     * 命令描述
     */
    description: string = "测试命令，回复输入的内容"

    /**
     * 执行命令
     */
    async execute(context: CommandContext): Promise<string | null> {
        // 提取命令参数
        const args = context.content.trim()

        console.info(`执行测试命令，参数: ${args}`)

        // 返回参数内容
        return args || "测试命令执行成功"
    }
}
