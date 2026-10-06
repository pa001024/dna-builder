<script lang="ts" setup>
import { createEmptyHistoryState, registerHistory } from "@lexical/history"
import { registerPlainText } from "@lexical/plain-text"
import { useTranslation } from "i18next-vue"
import { $getRoot, COMMAND_PRIORITY_HIGH, createEditor, type EditorState, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND, type LexicalEditor } from "lexical"
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue"
import type { AgentContextUsageSnapshot } from "@/composables/useAgentChatCore"
import { scopedI18nKey } from "@/utils/agent-chat"
import { type ChatImage, type ChatSubmitPayload, chatImageDataUrl, fileToChatImage, isImageFile, MAX_CHAT_IMAGES } from "@/utils/chat-image"
import {
    $getCurrentTextNodeSelection,
    $getPromptMarkdown,
    $replaceActiveTriggerWithSkillMention,
    $replaceEditorContent,
    registerPromptClipboard,
    SkillMentionNode,
} from "@/utils/prompt-lexical"
import { type ActiveSkillTrigger, extractActiveSkillTrigger } from "@/utils/skill-mention"

const props = withDefaults(
    defineProps<{
        modelValue: string
        placeholder?: string
        hint?: string
        submitLabel?: string
        /** 检索进行中：发送按钮变为中断按钮，提交被忽略 */
        busy?: boolean
        /** 上下文检索增强（实验性，默认关闭）：开启后才建索引并允许服务端向量检索 */
        ragEnabled?: boolean
        /** 锁定上下文检索增强开关（当前会话已有消息）：本轮提示词与索引状态已固定，中途改动会与运行中的对话不一致 */
        ragLocked?: boolean
        /** 是否展示上下文检索增强开关（配装助手没有检索增强，关掉它只留发送区） */
        showRag?: boolean
        /** 文案键前缀（对应翻译里的命名空间，默认走资料库的一套） */
        i18nPrefix?: string
        /** 上下文容量快照：传入时在工具行（RAG 开关左侧）展示容量面板入口；浏览态等场景可不传 */
        contextUsage?: AgentContextUsageSnapshot | null
        /** 是否正在生成压缩摘要（容量面板压缩按钮的进行中状态） */
        compacting?: boolean
        /** 是否提供手动压缩入口 */
        canCompact?: boolean
    }>(),
    {
        placeholder: "",
        hint: "",
        submitLabel: "",
        busy: false,
        ragEnabled: false,
        ragLocked: false,
        showRag: true,
        i18nPrefix: "dbAgent.ui",
        contextUsage: null,
        compacting: false,
        canCompact: false,
    }
)

const emit = defineEmits<{
    "update:modelValue": [value: string]
    /** 提交一次提问：正文 + 本次附带的图片（图片为空数组表示纯文本提问） */
    submit: [payload: ChatSubmitPayload]
    /** 点击中断按钮：请求停止当前检索 */
    stop: []
    /**
     * 无输入时点击发送按钮：进入对话模式。
     * 输入框为空说明用户还没想好问什么，直接切到对话态（含历史会话列表）比什么都不发生更有用。
     */
    "enter-chat": []
    /** 切换上下文检索增强开关 */
    "update:ragEnabled": [value: boolean]
    /** 点击容量面板的「压缩历史」：压缩编排与边界落库由宿主完成 */
    compact: []
}>()

const { t } = useTranslation()

/**
 * 拼出当前 Agent 的文案键；本命名空间没有该键时回退到通用命名空间（见 scopedI18nKey）。
 * @param key 命名空间内的键名
 * @returns 可交给翻译函数解析的完整文案键
 */
function label(key: string): string {
    return scopedI18nKey(props.i18nPrefix, key, t)
}

/** Lexical 编辑器的根元素（contenteditable 由 Lexical 接管） */
const editorRootRef = ref<HTMLElement | null>(null)
/** 编辑器实例：Lexical 对象自身有状态，保持非响应式（包进 ref 会破坏内部更新） */
let editor: LexicalEditor | null = null
/** 组件卸载时统一注销的 Lexical 监听 / 命令 */
let unregisterFns: Array<() => void> = []
/** 隐藏的图片选择器 */
const fileInputRef = ref<HTMLInputElement | null>(null)
/** 编辑器当前是否为空（占位符显隐） */
const isEditorEmpty = ref(true)
/**
 * 光标前正在输入的技能提及（`$名称`）。
 *
 * 非 null 时展示技能面板；面板的上下键 / Enter / Esc 由 Lexical 命令高优先级转发接管。
 */
const activeSkillTrigger = ref<ActiveSkillTrigger | null>(null)
/** Esc 关闭面板时的触发签名：查询串未变化前不再重新唤起（对齐 ZCode 的 dismissal） */
const dismissedSignature = ref<string | null>(null)
/** 技能面板组件实例（键盘命令转发给它处理） */
const skillPanelRef = ref<{ handleKeydown: (event: KeyboardEvent) => boolean } | null>(null)
/**
 * 已附带、尚未发送的图片。
 *
 * 用 `shallowRef`：图片是纯数据，`ref` 会把每个元素包成 Proxy，而 IndexedDB 的
 * 结构化克隆**不认 Proxy**（`DataCloneError`），消息带着图片落库时会直接失败。
 * 代价是数组内部的变化不再自动触发，增删都要整体重新赋值。
 */
const pendingImages = shallowRef<ChatImage[]>([])
/** 是否有文件正拖在输入框上（仅用于高亮边框） */
const isDragOver = ref(false)

const canSubmit = computed(() => props.modelValue.trim().length > 0 || pendingImages.value.length > 0)

/** 还能再附几张图 */
const remainingSlots = computed(() => Math.max(MAX_CHAT_IMAGES - pendingImages.value.length, 0))

/** 「添加图片」按钮的悬浮提示：带上限说明，满额时提示已用完 */
const attachTitle = computed(() =>
    remainingSlots.value ? t(label("attachImage"), { count: MAX_CHAT_IMAGES }) : t(label("attachImageFull"), { count: MAX_CHAT_IMAGES })
)

/**
 * 上下文检索增强开关的悬浮提示：
 * 锁定态（对话已开始）说明「不可更改已开始的对话」，否则提示这是实验性功能。
 */
const ragToggleTitle = computed(() => (props.ragLocked ? t(label("ragLocked")) : t(label("ragToggle"))))

/**
 * 触发签名：面板的 dismissal 与「是否变化」判定都用它（对齐 ZCode 的 trigger signature）。
 * @param trigger 活动触发
 * @returns 签名（无触发时 null）
 */
function triggerSignature(trigger: ActiveSkillTrigger | null): string | null {
    return trigger ? `${trigger.trigger}:${trigger.query}` : null
}

/**
 * 编辑器状态更新（输入 / 选区变化 / 程序化重建）：
 * 刷新占位符显隐与技能面板活动触发；除程序化重建外把 prompt markdown 回传 v-model。
 * @param payload 更新载荷
 */
function handleEditorUpdate({ editorState, tags }: { editorState: EditorState; tags: Set<string> }) {
    editorState.read(() => {
        // chip 的展示文本是技能名，文本为空即视为空态（关闭占位符）
        isEditorEmpty.value = $getRoot().getTextContent() === ""

        const selectionState = $getCurrentTextNodeSelection()
        const trigger = selectionState ? extractActiveSkillTrigger(selectionState.textBeforeCursor) : null
        const signature = triggerSignature(trigger)

        // Esc 关闭后保持抑制，直到触发签名变化（输入了新字符）才允许重新唤起
        if (dismissedSignature.value && signature !== dismissedSignature.value) {
            dismissedSignature.value = null
        }

        activeSkillTrigger.value = trigger && signature !== dismissedSignature.value ? trigger : null
    })

    // 程序化重建（外部回填）走 watch 的回声比对，这里不回传，避免回路
    if (!tags.has("programmatic")) {
        emit("update:modelValue", editorState.read(() => $getPromptMarkdown()))
    }
}

/**
 * 创建编辑器并完成全部接线（一次性，onMounted 调用）。
 * @param root 根元素
 */
function setupEditor(root: HTMLElement) {
    const lexicalEditor = createEditor({
        namespace: "DBAskBox",
        theme: { paragraph: "m-0" },
        nodes: [SkillMentionNode],
        onError: error => {
            console.error("[DBAskBox] lexical editor error:", error)
        },
    })
    editor = lexicalEditor
    lexicalEditor.setRootElement(root)

    unregisterFns = [
        // 原生输入事件层：IME / 删除 / 纯文本粘贴 / 回车分段全部由 Lexical 接管
        registerPlainText(lexicalEditor),
        // 撤销栈（Ctrl+Z 对 chip 插入与普通输入同样生效）
        registerHistory(lexicalEditor, createEmptyHistoryState(), 1000),
        // 复制 / 剪切把选区写为 prompt markdown，相交 chip 视为整体
        registerPromptClipboard(lexicalEditor),
        // 图片粘贴捕获：在纯文本粘贴之前拦下（capture 阶段，对齐 ZCode 的 PasteCapturePlugin）
        registerImagePasteCapture(lexicalEditor),
        // 技能面板打开时接管上下键（面板消费返回 true，Lexical 不再做光标移动）
        lexicalEditor.registerCommand(KEY_ARROW_DOWN_COMMAND, event => forwardToSkillPanel(event), COMMAND_PRIORITY_HIGH),
        lexicalEditor.registerCommand(KEY_ARROW_UP_COMMAND, event => forwardToSkillPanel(event), COMMAND_PRIORITY_HIGH),
        // Esc 关闭面板并记录 dismissal
        lexicalEditor.registerCommand(
            KEY_ESCAPE_COMMAND,
            event => {
                if (!event || !activeSkillTrigger.value) {
                    return false
                }

                dismissedSignature.value = triggerSignature(activeSkillTrigger.value)
                activeSkillTrigger.value = null
                event.preventDefault()
                return true
            },
            COMMAND_PRIORITY_HIGH
        ),
        // Enter：面板打开时是「采用技能」，否则提交提问；修饰键组合放行给换行
        lexicalEditor.registerCommand(KEY_ENTER_COMMAND, handleEnterCommand, COMMAND_PRIORITY_HIGH),
        lexicalEditor.registerUpdateListener(handleEditorUpdate),
    ]

    if (props.modelValue) {
        lexicalEditor.update(() => $replaceEditorContent(props.modelValue), { tag: "programmatic" })
    }
}

/**
 * 键盘命令转发：面板打开时把按键交给面板导航，消费返回 true。
 * @param event 键盘事件
 * @returns 面板是否消费了该按键
 */
function forwardToSkillPanel(event: KeyboardEvent | null): boolean {
    if (!event || !activeSkillTrigger.value) {
        return false
    }

    return skillPanelRef.value?.handleKeydown(event) ?? false
}

/**
 * Enter 命令：面板打开时「采用技能」；否则提交提问；Shift / 修饰键组合放行换行
 * （plain-text 的默认行为：Shift + Enter 插 LineBreak，其余插新段落）。
 * @param event 键盘事件
 * @returns 是否消费
 */
function handleEnterCommand(event: KeyboardEvent | null): boolean {
    if (event && forwardToSkillPanel(event)) {
        return true
    }

    if (event && (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)) {
        return false
    }

    submit()
    return true
}

/**
 * 图片粘贴捕获：剪贴板里带图片时在 Lexical 纯文本粘贴之前就地附上
 * （capture 阶段监听，对齐 ZCode 的 PasteCapturePlugin）。
 * @param target Lexical 编辑器实例
 * @returns 注销函数
 */
function registerImagePasteCapture(target: LexicalEditor): () => void {
    const handlePaste = (event: ClipboardEvent) => {
        const files = Array.from(event.clipboardData?.files ?? [])

        if (!files.some(isImageFile)) {
            return
        }

        event.preventDefault()
        event.stopImmediatePropagation()
        void appendFiles(files)
    }

    return target.registerRootListener((rootElement, previousRootElement) => {
        previousRootElement?.removeEventListener("paste", handlePaste, true)
        rootElement?.addEventListener("paste", handlePaste, true)
    })
}

/**
 * 面板选中某个技能：把光标处活动的 `$查询串` 区间整体替换成 chip（token 节点）+ 尾随空格，
 * 光标落到空格之后，随后收起面板（对齐 ZCode 的 insertMentionItem）。替换与撤销都走 Lexical。
 * @param name 技能名
 */
function handleSkillSelect(name: string) {
    const lexicalEditor = editor

    if (!lexicalEditor) {
        return
    }

    activeSkillTrigger.value = null
    dismissedSignature.value = null

    lexicalEditor.update(() => {
        const selectionState = $getCurrentTextNodeSelection()
        const trigger = selectionState ? extractActiveSkillTrigger(selectionState.textBeforeCursor) : null

        if (!selectionState || !trigger) {
            return
        }

        $replaceActiveTriggerWithSkillMention(selectionState.selection, selectionState.node, selectionState.cursorOffset, trigger.query.length, name)
    })
}

/** 收起技能面板（失焦路径；Esc 的 dismissal 记录在命令处理里）。 */
function closeSkillPanel() {
    activeSkillTrigger.value = null
}

/**
 * 把若干文件里图片的部分读成附图并附上（超出张数上限的部分丢弃）。
 * @param files 待处理的文件列表
 */
async function appendFiles(files: readonly File[]) {
    const added: ChatImage[] = []

    for (const file of files.filter(isImageFile).slice(0, remainingSlots.value)) {
        try {
            added.push(await fileToChatImage(file))
        } catch (error) {
            console.warn("读取图片失败:", error)
        }
    }

    // shallowRef 不追踪数组内部变化：整体重新赋值才会刷新预览
    if (added.length) {
        pendingImages.value = [...pendingImages.value, ...added]
    }
}

/**
 * 拖放事件：与粘贴走同一条附图路径。
 * @param event 拖放事件
 */
function handleDrop(event: DragEvent) {
    isDragOver.value = false
    void appendFiles(Array.from(event.dataTransfer?.files ?? []))
}

/**
 * 图片选择器选中后的处理。
 * @param event 选择事件
 */
function handleFilePick(event: Event) {
    const input = event.target as HTMLInputElement
    void appendFiles(Array.from(input.files ?? []))
    // 清空 value，否则连续选同一个文件不会再触发 change
    input.value = ""
}

/**
 * 打开图片选择器。
 */
function openFilePicker() {
    fileInputRef.value?.click()
}

/**
 * 切换上下文检索增强开关：把输入框上的开关状态交给父组件（父组件负责持久化与建索引）。
 * @param event 复选框变化事件
 */
function handleRagToggle(event: Event) {
    emit("update:ragEnabled", (event.target as HTMLInputElement).checked)
}

/**
 * 移除一张已附带的图片。
 * @param index 图片下标
 */
function removeImage(index: number) {
    pendingImages.value = pendingImages.value.filter((_, item) => item !== index)
}

/**
 * 发送按钮的主行为。
 *
 * - 检索进行中：中断当前检索；
 * - 有输入或有附图：提交提问；
 * - 无输入：进入对话模式（用户还没想好问什么时，先把对话界面打开）。
 */
function handleAction() {
    if (props.busy) {
        emit("stop")
        return
    }

    if (canSubmit.value) {
        submit()
        return
    }

    emit("enter-chat")
}

/**
 * 发送按钮的悬浮提示：随按钮主行为变化。
 */
const actionTitle = computed(() => {
    if (props.busy) {
        return t(label("stopSearch"))
    }

    return canSubmit.value ? props.submitLabel : t(label("enterChat"))
})

/**
 * 发出提交事件（内容与附图都为空时不提交，检索进行中也不重复提交）。
 */
function submit() {
    const value = props.modelValue.trim()

    if ((!value && !pendingImages.value.length) || props.busy) {
        return
    }

    const images = [...pendingImages.value]
    pendingImages.value = []
    emit("submit", { text: value, images })
}

/**
 * 聚焦编辑器并把光标放到末尾，供父组件在需要时主动唤起输入。
 */
function focus() {
    editor?.focus()
}

watch(
    () => props.modelValue,
    value => {
        const lexicalEditor = editor

        if (!lexicalEditor) {
            return
        }

        // 自己 emit 出去的回声不动编辑器，否则每次键入都会重建内容、光标跳回末尾
        if (value === lexicalEditor.read(() => $getPromptMarkdown())) {
            return
        }

        // 外部写入（清空 / 预填）：canonical 提及还原成 chip
        lexicalEditor.update(() => $replaceEditorContent(value), { tag: "programmatic" })
    }
)

onMounted(() => {
    const root = editorRootRef.value

    if (root) {
        setupEditor(root)
    }
})

onBeforeUnmount(() => {
    for (const off of unregisterFns) {
        off()
    }

    unregisterFns = []
    editor?.setRootElement(null)
    editor = null
})

defineExpose({ focus })
</script>

<template>
    <!-- 输入框：无底色，仅保留 hairline 边框，让页面保持完全透明 -->
    <div
        class="db-ask-box relative border border-base-content/15 transition-colors duration-200 focus-within:border-primary/55 backdrop-blur-sm"
        :class="isDragOver ? 'border-primary/60' : ''"
        @dragover.prevent="isDragOver = true"
        @dragleave="isDragOver = false"
        @drop.prevent="handleDrop"
    >
        <!-- 待发送的附图：缩略图 + 移除按钮，与正文并列构成一条提问 -->
        <ul v-if="pendingImages.length" class="flex flex-wrap gap-2 px-4 pt-3">
            <li v-for="(image, index) in pendingImages" :key="index" class="relative">
                <img :src="chatImageDataUrl(image)" class="h-16 w-16 border border-base-content/15 object-cover" alt="" />
                <button
                    type="button"
                    class="absolute -top-1.5 -right-1.5 grid size-4 cursor-pointer place-items-center border border-base-content/25 bg-base-100 text-base-content/60 transition-colors duration-200 hover:border-error hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    :title="$t(label('removeImage'))"
                    :aria-label="$t(label('removeImage'))"
                    @click="removeImage(index)"
                >
                    <Icon icon="ri:close-line" class="h-2.5 w-2.5" />
                </button>
            </li>
        </ul>

        <!--
          多行富文本输入（Lexical，对齐 ZCode）：随内容增高，最多 6 行；技能提及以 chip
          原子节点（token）嵌入正文，序列化直接落 canonical markdown。contenteditable 由
          Lexical 接管，IME / 撤销 / 纯文本粘贴 / 选区映射都不在此层手工处理。
        -->
        <div class="relative">
            <div
                ref="editorRootRef"
                contenteditable="true"
                role="textbox"
                aria-multiline="true"
                :aria-placeholder="placeholder"
                class="db-ask-editor block w-full min-h-13 max-h-42 overflow-y-auto whitespace-pre-wrap wrap-break-word bg-transparent px-4 py-3.5 text-sm leading-6 text-base-content outline-none"
                @blur="closeSkillPanel"
            />
            <!-- 占位符：Lexical 空态会渲染段落节点，:empty 不成立，改为覆盖层 -->
            <p
                v-if="isEditorEmpty && placeholder"
                class="pointer-events-none absolute left-4 top-3.5 select-none text-sm leading-6 text-base-content/35"
                aria-hidden="true"
            >
                {{ placeholder }}
            </p>
        </div>

        <!-- 技能显式调用面板（`$` 触发）：锚定在输入框上方；选中后由 Lexical 替换成 chip -->
        <SkillMentionPanel
            ref="skillPanelRef"
            :open="!!activeSkillTrigger"
            :query="activeSkillTrigger?.query ?? ''"
            :i18n-prefix="props.i18nPrefix"
            @select="handleSkillSelect"
            @close="closeSkillPanel"
        />

        <!-- 工具行：左侧快捷键提示，右侧添加图片与发送 -->
        <div class="flex items-center justify-between gap-3 border-t border-base-content/10 px-3 py-2">
            <p v-if="hint" class="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-base-content/40">{{ hint }}</p>
            <span v-else class="min-w-0 flex-1" />

            <div class="flex shrink-0 items-center gap-3">
                <!--
                  上下文容量面板入口：位于 RAG 开关左侧（配装助手没有 RAG 开关时紧挨图片按钮）。
                  面板展开时锚定在输入框上方；压缩编排与边界落库由宿主完成。
                -->
                <AgentContextUsage
                    v-if="props.contextUsage"
                    :usage="props.contextUsage"
                    :compacting="props.compacting"
                    :can-compact="props.canCompact"
                    :i18n-prefix="props.i18nPrefix"
                    @compact="emit('compact')"
                />

                <!--
                  上下文检索增强开关（实验性，默认关闭）：关闭时不构建索引、不发起服务端向量检索请求。
                  开关状态由父组件持有（持久化与「开启即建索引」都在那里）；
                  当前会话已有内容后锁定——本轮提示词与索引状态已固定，中途改动会让二者不一致。
                  空白新对话不算「已开始」，开关仍可改。
                -->
                <label
                    v-if="props.showRag"
                    class="flex shrink-0 items-center gap-1.5"
                    :class="props.ragLocked ? 'cursor-not-allowed' : 'cursor-pointer'"
                    :title="ragToggleTitle"
                >
                    <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-base-content/40">RAG</span>
                    <input
                        type="checkbox"
                        class="toggle toggle-sm toggle-primary rounded-xs disabled:cursor-not-allowed disabled:opacity-45"
                        :checked="props.ragEnabled"
                        :disabled="props.ragLocked"
                        :aria-label="ragToggleTitle"
                        @change="handleRagToggle"
                    />
                </label>

                <button
                    type="button"
                    class="flex h-8 w-8 cursor-pointer items-center justify-center border border-base-content/25 text-base-content/55 transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-base-content/25 disabled:hover:text-base-content/55"
                    :title="attachTitle"
                    :aria-label="attachTitle"
                    :disabled="!remainingSlots"
                    @click="openFilePicker"
                >
                    <Icon icon="ri:image-add-line" class="h-4 w-4" />
                </button>

                <!--
                  按钮始终可用：有输入时提交、无输入时进入对话模式、检索中时中断。
                  仅有输入为空的浏览态用弱化配色暗示「这一步只是打开对话」。
                -->
                <button
                    type="button"
                    class="flex h-8 w-8 cursor-pointer items-center justify-center border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96]"
                    :class="
                        props.busy
                            ? 'border-base-content/35 text-base-content/70 hover:border-error hover:text-error'
                            : canSubmit
                              ? 'border-primary bg-primary text-primary-content'
                              : 'border-base-content/25 text-base-content/55 hover:border-primary hover:text-primary'
                    "
                    :title="actionTitle"
                    :aria-label="actionTitle"
                    @click="handleAction"
                >
                    <Icon :icon="props.busy ? 'ri:stop-circle-line' : 'ri:arrow-up-line'" class="h-4 w-4" />
                </button>
            </div>
        </div>

        <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFilePick" />
    </div>
</template>

<style scoped>
/*
 * chip 图标（ri:bard-line）走 CSS mask 装饰：TextNode 的 DOM 里不能塞图标节点
 * （会截断 Lexical 的选区映射），mask 数据源由 SkillMentionNode 在 createDOM 里写入
 * 的 --mention-mask 自定义属性提供（对齐 ZCode 的 promptMentionDecoration）。
 */
.db-ask-editor :deep(.db-skill-chip)::before {
    content: "";
    width: 0.75rem;
    height: 0.75rem;
    flex-shrink: 0;
    background: currentColor;
    mask: var(--mention-mask, none) center / contain no-repeat;
}
</style>
