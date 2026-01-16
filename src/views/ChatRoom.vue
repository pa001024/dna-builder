<script lang="ts" setup>
import { gql, useQuery, useSubscription } from "@urql/vue"
import { useScroll } from "@vueuse/core"
import { computed, onMounted, ref, watchEffect } from "vue"
import { onBeforeRouteLeave, useRoute } from "vue-router"
import { editMessageMutation, rtcJoinMutation, sendMessageMutation } from "@/api/mutation"
import { Msg, msgsQuery, rtcClientsQuery } from "@/api/query"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { copyHtmlContent, isImage, sanitizeHTML } from "@/utils/html"

const route = useRoute()
const roomId = computed(() => route.params.room as string)
const user = useUserStore()
const ui = useUIStore()
const newMsgTip = ref(true)
const newMsgJoin = ref(true)
const variables = computed(() => ({ roomId: roomId.value }))

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

useSubscription<{ newMessage: Msg }>(
    {
        query: gql`
            subscription ($roomId: String!) {
                newMessage(roomId: $roomId) {
                    id
                    edited
                    content
                    createdAt
                    user {
                        id
                        name
                        qq
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
                edited
                content
                createdAt
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

async function addMessage(msg: Msg) {
    console.debug("addMessage", msg)
    if (arrivedState.bottom) {
        await new Promise(resolve => setTimeout(resolve, 50))
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

async function sendMessage(e: Event) {
    if ((e as KeyboardEvent)?.shiftKey) {
        return
    }
    e.preventDefault()
    const html = input.value?.innerHTML
    if (!html) return
    const content = sanitizeHTML(html)
    if (!content) return
    input.value.innerHTML = ""
    input.value.focus()
    await sendMessageMutation({ content, roomId: roomId.value })
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
    fi.click()
    fi.onchange = async e => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = async e => {
            const data = e.target!.result as string
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
            const newVal = sanitizeHTML(el.innerHTML || "")
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
</script>

<template>
    <div class="w-full h-full bg-base-200/50 flex">
        <!-- 聊天窗口 -->
        <div v-if="isJoined && !loading" class="flex-1 flex flex-col overflow-hidden">
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
                    @loadref="r => (el = r)"
                >
                    <!-- 消息列表 -->
                    <div v-for="item in msgs" v-if="msgs" :key="item.id" class="group flex items-start gap-2">
                        <div v-if="!item.content && editId !== item.id" class="text-xs text-base-content/60 m-auto">
                            {{ $t("chat.retractedAMessage", { name: user.id === item.user.id ? $t("chat.you") : item.user?.name }) }}
                            <span class="text-xs text-primary underline cursor-pointer" @click="restoreMessage(item)">{{
                                $t("chat.restore")
                            }}</span>
                        </div>

                        <div v-else class="flex-1 flex items-start gap-2" :class="{ 'flex-row-reverse': user.id === item.user.id }">
                            <ContextMenu>
                                <QQAvatar class="mt-2 size-8" :qq="item.user.qq" :name="item.user?.name"></QQAvatar>

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
                            <ContextMenu class="flex items-start flex-col" :class="{ 'items-end': user.id === item.user.id }">
                                <div class="text-base-content/60 text-sm min-h-5">{{ item.user.name }}</div>
                                <div
                                    v-if="editId === item.id"
                                    ref="editInput"
                                    contenteditable
                                    class="safe-html rounded-lg bg-base-100 select-text inline-flex flex-col text-sm max-w-80 overflow-hidden gap-2"
                                    :class="{ 'p-2': !isImage(item.content), 'bg-primary text-base-100': user.id === item.user.id }"
                                    v-html="sanitizeHTML(item.content)"
                                ></div>
                                <div
                                    v-else
                                    class="safe-html rounded-lg bg-base-100 select-text inline-flex flex-col text-sm max-w-80 overflow-hidden gap-2"
                                    :class="{ 'p-2': !isImage(item.content), 'bg-primary text-base-100': user.id === item.user.id }"
                                    v-html="sanitizeHTML(item.content)"
                                ></div>

                                <template #menu>
                                    <ContextMenuItem
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                        @click="copyHtmlContent(item.content)"
                                    >
                                        <Icon class="size-4 mr-2" icon="ri:clipboard-line" />
                                        {{ $t("chat.copy") }}
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        v-if="user.id === item.user.id"
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                        @click="retractMessage(item)"
                                    >
                                        <Icon class="size-4 mr-2" icon="ri:reply-line" />
                                        {{ $t("chat.revert") }}
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        v-if="user.id === item.user.id"
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
            </div>
            <!-- 在线用户 -->
            <GQQuery v-slot="{ data: onlines }" :query="rtcClientsQuery" :variables="variables">
                <div v-if="onlines" class="flex items-center p-1 gap-1">
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
            <!-- 分割线 -->
            <div class="flex-none w-full relative">
                <div
                    v-h-resize-for="{ el: inputForm, min: 120, max: 400 }"
                    class="w-full absolute -mt-0.75 h-1.5 cursor-ns-resize z-100"
                ></div>
            </div>
            <!-- 输入 -->
            <form ref="inputForm" class="h-44 flex flex-col relative border-t border-base-300/50" @submit="sendMessage">
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
                    <Tooltip side="top" :tooltip="$t('chat.autoJoin')">
                        <div
                            class="btn btn-ghost btn-sm btn-square text-xl"
                            :class="{ 'text-primary': newMsgJoin }"
                            @click="newMsgJoin = !newMsgJoin"
                        >
                            A
                        </div>
                    </Tooltip>
                </div>
                <!-- 输入框 -->
                <RichInput
                    v-model="newMsgText"
                    mode="html"
                    :placeholder="$t('chat.chatPlaceholder')"
                    class="flex-1 overflow-hidden"
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
