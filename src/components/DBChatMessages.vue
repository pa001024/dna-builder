<script lang="ts" setup>
import type { Message } from "@/store/db"
import type { AgentChatMessage } from "@/utils/agent-chat"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"

/**
 * 资料库对话消息流。
 *
 * 呈现逻辑已抽到通用的 {@link AgentChatMessages}（与配装助手共用），
 * 这里只做数据形状适配与会话专属文案前缀的传递。
 */
const props = defineProps<{
    /** 当前会话的消息列表 */
    messages: Message[]
    /** 是否正在检索 */
    busy: boolean
    /** 流式思考内容（部分模型返回，不落库） */
    reasoning: string
    /**
     * 当前等待用户回答的提问（由 ask_user 触发）。
     * 挂在最后一条助手消息上渲染；为空表示没有挂起的提问。
     */
    pendingAsk?: AskUserRequest | null
}>()

/**
 * 事件：把挂载在消息流里的提问交互冒泡给页面。
 * - answer：用户作答（选项与自由文本都在这里）；
 * - skip：用户跳过，让模型基于已有信息继续检索。
 */
const emit = defineEmits<{
    answer: [response: AskUserResponse]
    skip: []
}>()

/**
 * 会话消息与通用渲染结构字段一致，直接透传；
 * 断言成数组是为了让 `Message[]` 的结构化字段（toolTraces 等）能被模板读取。
 */
const renderMessages = () => props.messages as unknown as AgentChatMessage[]
</script>

<template>
    <AgentChatMessages
        :messages="renderMessages()"
        :busy="props.busy"
        :reasoning="props.reasoning"
        :pending-ask="props.pendingAsk"
        i18n-prefix="dbAgent.ui"
        empty-kicker="Data Retrieval"
        @answer="emit('answer', $event)"
        @skip="emit('skip')"
    />
</template>
