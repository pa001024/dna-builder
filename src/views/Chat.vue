<script lang="ts" setup>
import { computed, onBeforeMount, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { t } from "i18next"
import { htmlToText } from "@/utils/html"
import { deleteRoomMutation } from "@/api/mutation"
import { useUserStore } from "@/store/user"

const user = useUserStore()
const router = useRouter()
const route = useRoute()
const search = ref("")
const actived = computed(() => route.params.room)
const variables = computed(() => ({ name_like: search.value.trim() || null }))

const Query = /* GraphQL */ `
    query ($name_like: String, $limit: Int, $offset: Int) {
        rooms(name_like: $name_like, limit: $limit, offset: $offset) {
            id
            name
            type
            updateAt
            maxUsers
            msgCount
            owner {
                id
                name
                qq
            }
            lastMsg {
                id
                content
                createdAt
                user {
                    id
                    name
                    qq
                }
            }
        }
    }
`

interface Room {
    id: string
    name: string
    type: string
    updateAt: string
    maxUsers: string
    owner: string
    msgs: any[]
}

function toLocaleTimeString(timestamp: number) {
    const date = new Date(timestamp)
    if (date.toLocaleDateString() !== new Date().toLocaleDateString()) {
        return date.toLocaleDateString()
    }
    return date.toLocaleTimeString().slice(0, -3)
}

const handle = ref<null | (() => Promise<void>)>(null)
async function reloadRooms() {
    await handle.value!()
}

async function enterRoom(room: Room) {
    router.push({ name: "room", params: { room: room.id } })
}
async function deleteRoom(room: Room) {
    if ((await confirm(t("chat.deleteRoomConfirm"))) && (await deleteRoomMutation({ id: room.id }))) {
        await reloadRooms()
    } else {
        alert(t("chat.deleteRoomFailed"))
    }
}

const toggleMenu = ref(true)

onBeforeMount(() => {
    if (!user.id) {
        router.push({ name: "user", query: { tip: t("chat.needLogin") } })
    }
})
</script>

<template>
    <div class="w-full h-full flex overflow-hidden">
        <transition name="slide-right">
            <div
                v-show="toggleMenu"
                class="flex flex-col flex-none overflow-hidden w-full sm:w-60 sm:shadow-md"
                :class="{ 'max-sm:hidden': actived }"
            >
                <div class="flex p-2 gap-2 bg-base-100/30">
                    <!-- 搜索 -->
                    <label class="text-base-content/70 flex-1 input input-ghost input-sm flex items-center gap-2 bg-base-200">
                        <Icon icon="ri:search-line" />
                        <input v-model="search" type="text" class="flex-1 w-8" :placeholder="$t('chat.search')" />
                    </label>
                    <Tooltip :tooltip="$t('chat.refresh')" side="bottom">
                        <div class="btn btn-square btn-sm" @click="reloadRooms">
                            <Icon icon="ri:refresh-line" />
                        </div>
                    </Tooltip>
                </div>
                <!-- 列表 -->
                <GQAutoPage
                    v-slot="{ data }"
                    class="flex-1 overflow-hidden"
                    :size="10"
                    :query="Query"
                    :variables="variables"
                    data-key="rooms"
                    @load="handle = $event"
                >
                    <ContextMenu v-for="r in data.rooms" v-if="data" :key="r.id">
                        <div
                            class="h-16 bg-base-100/50 p-4 flex flex-col justify-center group"
                            :class="{ 'active bg-primary': actived === r.id }"
                            @click="enterRoom(r)"
                        >
                            <!-- 房间名 -->
                            <div class="flex justify-between items-center group-[.active]:text-base-100 gap-2">
                                <div
                                    v-if="r.type && r.type !== 'normal'"
                                    class="whitespace-nowrap text-xs rounded-lg bg-primary text-base-100 px-2"
                                >
                                    {{ $t(`chat.${r.type}`) }}
                                </div>
                                <div class="whitespace-nowrap flex-1 overflow-hidden text-ellipsis text-sm">{{ r.name }}</div>
                                <div class="text-xs text-base-content/70 group-[.active]:text-base-100">
                                    {{ toLocaleTimeString(r.lastMsg?.createdAt || r.updateAt) }}
                                </div>
                            </div>
                            <!-- 最新消息 -->
                            <div class="flex justify-between group-[.active]:text-base-100 text-base-content/50 space-x-4">
                                <div v-if="r.lastMsg" class="whitespace-nowrap max-w-36 text-xs flex-1 overflow-hidden text-ellipsis">
                                    {{ r.lastMsg.user.name }}: {{ htmlToText(r.lastMsg.content) }}
                                </div>
                                <div
                                    v-if="r.msgCount - (user.roomReadedCount[r.id] || 0) > 0"
                                    class="whitespace-nowrap text-xs font-bold text-base-100 rounded-lg bg-primary px-2 group-[.active]:hidden"
                                >
                                    {{ r.msgCount - (user.roomReadedCount[r.id] || 0) }}
                                </div>
                            </div>
                        </div>

                        <template #menu>
                            <ContextMenuItem
                                :disabled="r.owner.id !== user.id && !user.isAdmin"
                                class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                @click="deleteRoom(r)"
                            >
                                <Icon class="size-4 mr-2" icon="ri:delete-bin-line" />
                                {{ $t("room.remove") }}
                            </ContextMenuItem>
                        </template>
                    </ContextMenu>
                </GQAutoPage>
            </div>
        </transition>
        <!-- 展开按钮 -->
        <div class="h-full flex flex-none relative items-center max-sm:hidden group">
            <div class="absolute z-10">
                <button
                    class="btn btn-ghost m-1 w-6 p-1 h-32 btn-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    @click="toggleMenu = !toggleMenu"
                >
                    <span
                        class="flex-none items-center justify-center text-lg text-base-content/50 swap swap-flip"
                        :class="{ 'swap-active': toggleMenu }"
                    >
                        <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                        <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
                    </span>
                </button>
            </div>
        </div>
        <div class="grow" :class="[actived ? 'max-sm:block' : 'max-sm:hidden']">
            <RouterView v-slot="{ Component, route: { path } }">
                <transition name="slide-right">
                    <Suspense>
                        <component :is="Component" :key="path" :room="actived" />
                        <template #fallback>
                            <div class="w-full h-full flex justify-center items-center">
                                <span class="loading loading-spinner loading-md"></span>
                            </div>
                        </template>
                    </Suspense>
                </transition>
            </RouterView>
        </div>
    </div>
</template>
