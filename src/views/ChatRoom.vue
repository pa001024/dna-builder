<script lang="ts" setup>
import { gql, useQuery, useSubscription } from "@urql/vue"
import { useScroll } from "@vueuse/core"
import { useSound } from "@vueuse/sound"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from "vue"
import { onBeforeRouteLeave, useRoute } from "vue-router"
import { editMessageMutation, Msg, msgsQuery, roomQuery, rtcClientsQuery, rtcJoinMutation, sendMessageMutation } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { copyHtmlContent, isImage, sanitizeHTML } from "@/utils/html"
import { fileToDataUrlWithRealMime, normalizeInlineImageDataUrlMime } from "@/utils/image-data-url"

const route = useRoute()
const roomId = computed(() => route.params.room as string)
const user = useUserStore()
const ui = useUIStore()
const newMsgTip = ref(false)
const variables = computed(() => ({ roomId: roomId.value }))
const sfx = useSound("/sfx/notice.mp3")

//#region RTC
const loading = ref(true)
watchEffect(async () => {
    loading.value = true
    await rtcJoinMutation({
        roomId: roomId.value,
    })
    loading.value = false
})

useSubscription<{
    newRoomUser: {
        id: string
        end: boolean
        user: {
            id: string
            name: string
            qq: string
        }
    }
}>({
    query: gql`
        subscription ($roomId: String!) {
            newRoomUser(roomId: $roomId) {
                id
                end
                user {
                    id
                    name
                    qq
                }
            }
        }
    `,
    variables,
})
//#endregion

const el = ref<HTMLElement | null>(null)

const { arrivedState } = useScroll(el, { offset: { left: 0, top: 20, right: 0, bottom: 200 } })

const { data: roomData } = useQuery<{
    room: {
        id: string
        name: string
        maxUsers: number
        msgCount: number
    }
}>({
    query: gql`
        query ($roomId: String!) {
            room(id: $roomId) {
                id
                name
                maxUsers
                msgCount
            }
        }
    `,
    variables,
    requestPolicy: "cache-first",
})

const isJoined = computed(() => !!roomData.value?.room || false)
const msgCount = computed(() => roomData.value?.room?.msgCount || 0)
const title = computed(() => roomData.value?.room?.name || "")
const maxUsers = computed(() => roomData.value?.room?.maxUsers || 0)

watchEffect(() => {
    if (msgCount.value) user.setRoomReadedCount(roomId.value, msgCount.value)
    if (title.value) ui.title = maxUsers.value ? `${title.value} (${maxUsers.value})` : `${title.value}`
})

onBeforeRouteLeave(() => {
    ui.title = ""
})

onMounted(async () => {
    if (msgCount.value > 0) user.setRoomReadedCount(roomId.value, msgCount.value)
})

const isSyncingLatestMessages = ref(false)

/**
 * @description 计算消息分页中“最新页”的偏移量。
 * @param total 总消息数。
 * @param limit 每页条数。
 * @returns 最新页 offset。
 */
function getLatestPageOffset(total: number, limit = 20) {
    if (total <= 0) return 0
    return total - (total % limit || limit)
}

/**
 * @description 在网络恢复或页面回到前台时，强制从服务端同步最新消息页，补齐断线期间可能漏掉的数据。
 */
async function syncLatestMessagesFromServer() {
    if (!roomId.value) return
    if (!navigator.onLine) return
    if (isSyncingLatestMessages.value) return

    isSyncingLatestMessages.value = true
    try {
        const room = await roomQuery(
            {
                id: roomId.value,
            },
            {
                requestPolicy: "network-only",
            }
        )
        const latestCount = room?.msgCount || 0
        if (!latestCount) return

        await msgsQuery(
            {
                roomId: roomId.value,
                limit: 20,
                offset: getLatestPageOffset(latestCount, 20),
            },
            {
                requestPolicy: "network-only",
            }
        )
    } catch (error) {
        console.error("同步最新消息失败", error)
    } finally {
        isSyncingLatestMessages.value = false
    }
}

/**
 * @description 浏览器网络恢复时触发服务端补同步。
 */
function handleOnline() {
    void syncLatestMessagesFromServer()
}

/**
 * @description 页面重新可见时触发服务端补同步，兜底处理后台恢复场景。
 */
function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
        void syncLatestMessagesFromServer()
    }
}

onMounted(() => {
    window.addEventListener("online", handleOnline)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    void syncLatestMessagesFromServer()
})

onBeforeUnmount(() => {
    window.removeEventListener("online", handleOnline)
    document.removeEventListener("visibilitychange", handleVisibilityChange)
})

useSubscription<{ newMessage: Msg }>(
    {
        query: gql`
            subscription ($roomId: String!) {
                newMessage(roomId: $roomId) {
                    id
                    roomId
                    userId
                    edited
                    content
                    createdAt
                    updateAt
                    replyToMsgId
                    replyToUserId
                    user {
                        id
                        name
                        qq
                    }
                    replyTo {
                        id
                        content
                        user {
                            id
                            name
                            qq
                        }
                    }
                    reactions {
                        id
                        count
                        users {
                            id
                            name
                            qq
                        }
                        createdAt
                    }
                }
            }
        `,
        variables,
    },
    (_, data) => {
        if (data.newMessage) {
            addMessage(data.newMessage)
        }
        return data
    }
)

useSubscription<{ msgEdited: Msg }>({
    query: gql`
        subscription ($roomId: String!) {
            msgEdited(roomId: $roomId) {
                id
                roomId
                userId
                edited
                content
                createdAt
                replyToMsgId
                replyToUserId
                user {
                    id
                    name
                    qq
                }
                replyTo {
                    id
                    content
                    user {
                        id
                        name
                        qq
                    }
                }
            }
        }
    `,
    variables,
})

async function addMessage(msg: Msg) {
    console.debug("addMessage", msg)
    if (msg.user!.id !== user.id) {
        sfx.play()
    }
    if (arrivedState.bottom) {
        await nextTick()
        el.value?.scrollTo({
            top: el.value.scrollHeight,
            left: 0,
            behavior: "smooth",
        })
    }
}

const input = ref<HTMLDivElement>(null as any)
const inputForm = ref<HTMLDivElement>(null as any)
const newMsgText = ref("")
const replyingTo = ref<Msg | null>(null)

async function sendMessage(e: Event) {
    if ((e as KeyboardEvent)?.shiftKey) {
        return
    }
    e.preventDefault()
    const html = input.value?.innerHTML
    if (!html) return
    const content = sanitizeHTML(normalizeInlineImageDataUrlMime(html))
    if (!content) return
    input.value.innerHTML = ""
    newMsgText.value = ""
    input.value.focus()
    await sendMessageMutation({
        content,
        roomId: roomId.value,
        replyToMsgId: replyingTo.value?.id,
    })
    replyingTo.value = null
    await nextTick()
    el.value?.scrollTo({
        top: el.value.scrollHeight,
        left: 0,
        behavior: "smooth",
    })
}

function insertEmoji(text: string) {
    const el = input.value
    el.focus()
    const sel = window.getSelection()!
    const range = sel.getRangeAt(0)
    const node = document.createElement("div")
    node.innerText = text
    let frag = document.createDocumentFragment()
    while (node.firstChild) frag.appendChild(node.firstChild)
    range.deleteContents()
    range.insertNode(frag)
    range.collapse(false)
}

async function insertImage() {
    const fi = document.createElement("input")
    fi.type = "file"
    fi.accept = "image/png,image/jpeg,image/gif,image/webp"
    fi.click()
    fi.onchange = async e => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const data = await fileToDataUrlWithRealMime(file)
        const el = input.value
        el.focus()
        const sel = window.getSelection()!
        const range = sel.getRangeAt(0)
        const node = document.createElement("div")
        node.innerHTML = `<img src="${data}" />`
        let frag = document.createDocumentFragment()
        while (node.firstChild) frag.appendChild(node.firstChild)
        range.deleteContents()
        range.insertNode(frag)
        range.collapse(false)
    }
}

const editId = ref("")
const editInput = ref<HTMLDivElement[] | null>(null)
const retractCache = new Map<string, string>()
async function retractMessage(msg: Msg) {
    retractCache.set(msg.id, msg.content)
    await editMessageMutation({ content: "", msgId: msg.id })
    msg.content = ""
}
async function restoreMessage(msg: Msg) {
    const content = retractCache.get(msg.id)
    msg.content = content || msg.content
    startEdit(msg)
}
async function startEdit(msg: Msg) {
    editId.value = msg.id
    await new Promise(resolve => setTimeout(resolve, 50))
    if (editInput.value?.[0]) {
        let el = editInput.value[0]
        el.focus()
        el.onblur = async () => {
            const newVal = sanitizeHTML(normalizeInlineImageDataUrlMime(el.innerHTML || ""))
            if (msg.content === newVal) return
            await editMessageMutation({ content: newVal, msgId: editId.value })
            msg.content = newVal
            msg.edited = 1
            editId.value = ""
            el.onblur = null
            el.onkeydown = null
        }
        el.onkeydown = (e: KeyboardEvent) => {
            if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "Enter") {
                e.preventDefault()
                el.blur()
            }
        }
    }
}

/**
 * @description 从消息 HTML 提取简短预览文本，优先保留可读文本；纯图片消息返回占位。
 * @param content 消息 HTML 内容。
 * @returns 预览文本。
 */
function getMessagePreview(content: string) {
    const wrapper = document.createElement("div")
    wrapper.innerHTML = content
    const text = (wrapper.textContent || "").replace(/\s+/g, " ").trim()
    if (text) {
        return text.length > 60 ? `${text.slice(0, 60)}...` : text
    }
    if (wrapper.querySelector("img")) return "[图片]"
    return "[消息]"
}

/**
 * @description 设置当前正在回复的消息，并聚焦输入框。
 * @param msg 目标消息。
 */
function startReply(msg: Msg) {
    replyingTo.value = msg
    input.value?.focus()
}

/**
 * @description 取消当前回复状态。
 */
function cancelReply() {
    replyingTo.value = null
}
</script>

<template>
    <div class="w-full h-full bg-base-200/50 flex">
        <!-- 聊天窗口 -->
        <div v-if="isJoined && !loading" class="flex-1 flex flex-col">
            <!-- 主内容区 -->
            <div class="flex-1 flex flex-col overflow-hidden relative">
                <GQAutoPage
                    v-if="msgCount"
                    v-slot="{ data: msgs }"
                    direction="top"
                    class="flex-1 overflow-hidden"
                    inner-class="flex w-full h-full flex-col gap-2 p-4"
                    :limit="20"
                    :offset="msgCount"
                    :query="msgsQuery"
                    :variables="variables"
                    request-policy="cache-first"
                    @loadref="r => (el = r)"
                >
                    <!-- 消息列表 -->
                    <div v-for="item in msgs" v-if="msgs" :key="item.id" class="group flex items-start gap-2">
                        <div v-if="!item.content && editId !== item.id" class="text-xs text-base-content/60 m-auto">
                            {{
                                $t("chat.retractedAMessage", {
                                    name: user.id === item.user!.id ? $t("chat.you") : item.user!.name,
                                })
                            }}
                            <span class="text-xs text-primary underline cursor-pointer" @click="restoreMessage(item)">{{
                                $t("chat.restore")
                            }}</span>
                        </div>

                        <div v-else class="flex-1 flex items-start gap-2" :class="{ 'flex-row-reverse': user.id === item.user!.id }">
                            <ContextMenu>
                                <QQAvatar class="mt-2 size-8" :qq="item.user!.qq" :name="item.user!.name"></QQAvatar>

                                <template #menu>
                                    <ContextMenuItem
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                    >
                                        <Icon class="size-4 mr-2" icon="ri:eye-line" />
                                        {{ $t("chat.block") }}
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                    >
                                        <Icon class="size-4 mr-2" icon="ri:glasses-line" />
                                        {{ $t("chat.follow") }}
                                    </ContextMenuItem>
                                </template>
                            </ContextMenu>
                            <ContextMenu class="flex items-start flex-col" :class="{ 'items-end': user.id === item.user!.id }">
                                <div class="text-base-content/60 text-sm min-h-5">{{ item.user!.name }}</div>
                                <div
                                    v-if="item.replyTo"
                                    class="rounded-t-lg border-b border-base-300/40 bg-base-300/50 px-2 py-1 text-xs text-base-content/70 max-w-80"
                                >
                                    <span class="font-medium">{{ item.replyTo.user?.name || $t("chat.you") }}</span>
                                    <span class="mx-1">:</span>
                                    <span>{{ getMessagePreview(item.replyTo.content || "") }}</span>
                                </div>
                                <div
                                    v-if="editId === item.id"
                                    ref="editInput"
                                    contenteditable
                                    class="safe-html rounded-lg bg-base-100 select-text inline-flex flex-col text-sm max-w-80 overflow-hidden gap-2"
                                    :class="{ 'p-2': !isImage(item.content), 'bg-primary text-base-100': user.id === item.user!.id }"
                                    v-html="sanitizeHTML(item.content)"
                                ></div>
                                <div
                                    v-else
                                    class="safe-html rounded-lg bg-base-100 select-text inline-flex flex-col text-sm max-w-80 overflow-hidden gap-2"
                                    :class="{ 'p-2': !isImage(item.content), 'bg-primary text-base-100': user.id === item.user!.id }"
                                    v-html="sanitizeHTML(item.content)"
                                ></div>

                                <template #menu>
                                    <ContextMenuItem
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                        @click="startReply(item)"
                                    >
                                        <Icon class="size-4 mr-2" icon="ri:reply-line" />
                                        {{ $t("chat.reply") }}
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                        @click="copyHtmlContent(item.content)"
                                    >
                                        <Icon class="size-4 mr-2" icon="ri:clipboard-line" />
                                        {{ $t("chat.copy") }}
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        v-if="user.id === item.user?.id"
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                        @click="retractMessage(item)"
                                    >
                                        <Icon class="size-4 mr-2" icon="ri:reply-line" />
                                        {{ $t("chat.revert") }}
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        v-if="user.id === item.user?.id"
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                        @click="startEdit(item)"
                                    >
                                        <Icon class="size-4 mr-2" icon="ri:edit-line" />
                                        {{ $t("chat.edit") }}
                                    </ContextMenuItem>
                                </template>
                            </ContextMenu>
                            <div v-if="item.edited" class="text-xs text-base-content/60 self-end">{{ $t("chat.edited") }}</div>
                            <div class="flex-1"></div>
                            <div class="hidden group-hover:block p-1 text-xs text-base-content/60">{{ item.createdAt }}</div>
                        </div>
                    </div>
                </GQAutoPage>
                <div v-else class="flex-1 flex flex-col items-center justify-center">
                    <div class="flex-1 flex flex-col items-center justify-center">
                        <div class="flex p-4 font-bold text-lg text-base-content/60">{{ $t("chat.newRoomBanner") }}</div>
                        <div class="flex btn btn-primary" @click="sendMessageMutation({ content: $t('chat.hello'), roomId })">
                            {{ $t("chat.sayHello") }}
                        </div>
                    </div>
                </div>

                <!-- 在线用户 -->
                <GQQuery v-slot="{ data: onlines }" :query="rtcClientsQuery" :variables="variables">
                    <div v-if="onlines" class="flex items-center p-1 gap-1 absolute bottom-0">
                        <div class="flex group bg-primary items-center rounded-full px-1">
                            <QQAvatar class="size-6 my-1" :name="user.name!" :qq="user.qq!" />
                            <div
                                class="flex text-sm text-base-100 max-w-0 group-hover:max-w-24 group-hover:mx-1 overflow-hidden transition-all duration-500 whitespace-nowrap"
                            >
                                {{ user.name }}
                            </div>
                        </div>
                        <div
                            v-for="item in onlines.filter(v => v.user.id !== user.id)"
                            :key="item.id"
                            class="flex group bg-primary items-center rounded-full px-1"
                        >
                            <QQAvatar class="size-6 my-1" :name="item.user.name" :qq="item.user.qq" />
                            <div
                                class="flex text-sm text-base-100 max-w-0 group-hover:max-w-24 group-hover:mx-1 overflow-hidden transition-all duration-500 whitespace-nowrap"
                            >
                                {{ item.user.name }}
                            </div>
                        </div>
                    </div>
                </GQQuery>
            </div>
            <!-- 分割线 -->
            <div class="flex-none w-full relative">
                <div
                    v-h-resize-for="{ el: inputForm, min: 120, max: 400 }"
                    class="w-full absolute -mt-0.75 h-1.5 cursor-ns-resize z-100"
                ></div>
            </div>
            <!-- 输入 -->
            <form ref="inputForm" class="h-44 flex flex-col relative border-t border-base-300/50" @submit="sendMessage">
                <div v-if="replyingTo" class="flex-none px-3 pt-2">
                    <div class="flex items-center gap-2 rounded-lg bg-base-300/60 px-2 py-1.5 text-xs text-base-content/80">
                        <Icon icon="ri:reply-line" class="text-base-content/60" />
                        <div class="min-w-0 flex-1 truncate">
                            <span class="font-medium">{{ replyingTo.user?.name || $t("chat.you") }}</span>
                            <span class="mx-1">:</span>
                            <span>{{ getMessagePreview(replyingTo.content || "") }}</span>
                        </div>
                        <button type="button" class="btn btn-ghost btn-xs" @click="cancelReply">{{ $t("chat.cancelReply") }}</button>
                    </div>
                </div>
                <!-- 工具栏 -->
                <div class="flex-none p-1 px-2 border-t border-base-300/50 flex items-center gap-2">
                    <!-- 表情 -->
                    <Popover side="top">
                        <div class="btn btn-ghost btn-sm btn-square text-xl hover:text-primary">
                            <Icon icon="ri:chat-smile-line" />
                        </div>
                        <template #content>
                            <EmojiSelect @select="insertEmoji" />
                        </template>
                    </Popover>
                    <Tooltip side="top" :tooltip="$t('chat.insertImage')">
                        <div class="btn btn-ghost btn-sm btn-square text-xl hover:text-primary" @click="insertImage">
                            <Icon icon="ri:image-line" />
                        </div>
                    </Tooltip>
                    <Tooltip side="top" :tooltip="$t('chat.sound')">
                        <div
                            class="btn btn-ghost btn-sm btn-square text-xl"
                            :class="{ 'text-primary': newMsgTip }"
                            @click="newMsgTip = !newMsgTip"
                        >
                            <Icon icon="ri:volume-up-line" />
                        </div>
                    </Tooltip>
                </div>
                <!-- 输入框 -->
                <RichInput
                    v-model="newMsgText"
                    mode="html"
                    :placeholder="$t('chat.chatPlaceholder')"
                    class="flex-1 overflow-hidden"
                    inner-class="min-h-20"
                    @loadref="r => (input = r)"
                    @enter="sendMessage"
                />
                <!-- 操作栏 -->
                <div class="flex p-2">
                    <div class="flex-1"></div>
                    <button class="btn btn-sm btn-primary px-6">{{ $t("chat.send") }}</button>
                </div>
            </form>
        </div>
        <div v-else class="flex-1 flex flex-col gap-2 items-center justify-center">
            <span class="loading loading-spinner loading-md"></span>
        </div>
    </div>
</template>
<style>
.safe-html img {
    border-radius: 0.3rem;
}
</style>
