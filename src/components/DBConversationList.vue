<script lang="ts" setup>
import { computed } from "vue"
import type { Conversation } from "@/store/db"

/**
 * 资料库对话左侧会话列表。
 * 数据来自 Dexie 的 conversations 表（与其它 AI 功能共用），这里只负责展示与交互。
 */
const props = defineProps<{
    /** 会话列表（按更新时间倒序） */
    conversations: Conversation[]
    /** 当前选中的会话 id */
    activeId: number
    /** 检索进行中时禁止切换会话 */
    busy: boolean
}>()

const emit = defineEmits<{
    /** 新建会话 */
    "new-chat": []
    /** 切换会话 */
    select: [conversation: Conversation]
    /** 删除会话 */
    remove: [conversation: Conversation]
    /** 退出对话，回到资料库浏览态 */
    exit: []
}>()

/**
 * 会话时间的紧凑展示：当天显示时分，更早显示日期。
 * @param timestamp 更新时间戳
 * @returns 展示文本
 */
function formatTime(timestamp: number): string {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
        return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    }

    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/** 当前是否没有历史会话 */
const isEmpty = computed(() => props.conversations.length === 0)
</script>

<template>
    <!-- 会话侧栏：无背景无分隔线，仅靠留白与 hairline 边框区分 -->
    <aside class="flex h-full w-52 shrink-0 flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
            <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-base-content/40">Chats</p>
            <button
                type="button"
                class="inline-flex cursor-pointer items-center gap-1 text-[11px] text-base-content/45 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="busy"
                title="返回资料库"
                @click="emit('exit')"
            >
                <Icon icon="ri:arrow-left-line" class="h-3.5 w-3.5" />
                资料库
            </button>
        </div>

        <button
            type="button"
            class="flex cursor-pointer items-center justify-center gap-1.5 border border-base-content/15 px-3 py-2 text-xs text-base-content/70 transition-colors duration-200 hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busy"
            @click="emit('new-chat')"
        >
            <Icon icon="ri:add-line" class="h-3.5 w-3.5" />
            新对话
        </button>

        <p v-if="isEmpty" class="px-1 text-[11px] leading-5 text-base-content/35">还没有对话记录，提问后会保存在这里。</p>

        <div v-else class="db-chat-scroll min-h-0 flex-1 overflow-y-auto pr-1">
            <ul class="flex flex-col gap-1">
                <li v-for="conversation in props.conversations" :key="conversation.id" class="group relative">
                    <button
                        type="button"
                        class="w-full cursor-pointer border px-2.5 py-2 pr-7 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
                        :class="
                            conversation.id === props.activeId
                                ? 'border-primary/60 text-primary'
                                : 'border-transparent text-base-content/65 hover:border-base-content/15 hover:text-base-content'
                        "
                        :disabled="props.busy"
                        @click="emit('select', conversation)"
                    >
                        <span class="block truncate text-xs font-medium">{{ conversation.name }}</span>
                        <span class="mt-0.5 block font-mono text-[10px] tabular-nums text-base-content/35">
                            {{ formatTime(conversation.updatedAt) }}
                        </span>
                    </button>

                    <button
                        type="button"
                        class="absolute right-1.5 top-1.5 cursor-pointer p-0.5 text-base-content/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:text-error focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
                        :disabled="props.busy"
                        title="删除对话"
                        @click="emit('remove', conversation)"
                    >
                        <Icon icon="ri:delete-bin-line" class="h-3 w-3" />
                    </button>
                </li>
            </ul>
        </div>
    </aside>
</template>

<style scoped>
/* 会话列表滚动条：细、无轨道，避免打断极简排布 */
.db-chat-scroll {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-base-content) 22%, transparent) transparent;
}

.db-chat-scroll::-webkit-scrollbar {
    width: 6px;
}

.db-chat-scroll::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-base-content) 20%, transparent);
}

.db-chat-scroll::-webkit-scrollbar-track {
    background: transparent;
}
</style>
