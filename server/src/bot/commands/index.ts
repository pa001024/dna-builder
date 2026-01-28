import type { BaseCommand, CommandContext } from "./interfaces"
import { TestCommand } from "./test"

/**
 * 命令管理器
 */
export class CommandManager {
    private commands: Map<string, BaseCommand> = new Map()

    /**
     * 构造函数
     */
    constructor() {
        this.registerCommands()
    }

    /**
     * 注册所有命令
     */
    private registerCommands() {
        // 注册测试命令
        this.registerCommand(new TestCommand())

        // 可以在这里注册其他命令
    }

    /**
     * 注册单个命令
     */
    registerCommand(command: BaseCommand) {
        this.commands.set(command.name, command)
        console.info(`注册命令: ${command.name} - ${command.description}`)
    }

    /**
     * 查找命令
     */
    findCommand(name: string): BaseCommand | undefined {
        return this.commands.get(name)
    }

    /**
     * 执行命令
     */
    async executeCommand(name: string, context: CommandContext): Promise<string | null> {
        const command = this.findCommand(name)
        if (!command) {
            console.warn(`命令不存在: ${name}`)
            return null
        }

        try {
            return await command.execute(context)
        } catch (error) {
            console.error(`命令执行失败: ${name}`, error)
            return null
        }
    }

    /**
     * 获取所有命令
     */
    getCommands(): Map<string, BaseCommand> {
        return this.commands
    }
}

// 导出单例实例
export const commandManager = new CommandManager()
