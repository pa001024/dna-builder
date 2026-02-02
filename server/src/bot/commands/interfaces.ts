import type { Bot, GroupMessageEvent, GuildMessageEvent, PrivateMessageEvent } from "qq-official-bot"

/**
 * 命令上下文接口
 */
export type CommandContext =
    | {
          client: Bot
          type: "group"
          message: GroupMessageEvent
          content: string
          groupId: string
          userId: string
          messageId: string
      }
    | {
          client: Bot
          type: "c2c"
          message: PrivateMessageEvent
          content: string
          userId: string
          messageId: string
      }
    | {
          client: Bot
          type: "guild"
          message: GuildMessageEvent
          content: string
          channelId: string
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
