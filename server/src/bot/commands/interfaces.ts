import type { QQBotClient } from "../client"
import type { QQBotEventC2CMessageCreate, QQBotEventGroupAtMessageCreate } from "../types"

/**
 * 命令上下文接口
 */
export type CommandContext =
    | {
          client: QQBotClient
          type: "group"
          message: QQBotEventGroupAtMessageCreate["d"]
          content: string
          groupId: string
          userId: string
          messageId: string
      }
    | {
          client: QQBotClient
          type: "c2c"
          message: QQBotEventC2CMessageCreate["d"]
          content: string
          userId: string
          messageId: string
      }

/**
 * 基础命令接口
 */
export interface BaseCommand {
    /**
     * 命令名称
     */
    name: string

    /**
     * 命令描述
     */
    description: string

    /**
     * 执行命令
     */
    execute(context: CommandContext): Promise<string | null>
}
