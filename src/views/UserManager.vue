<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue"
import { copyText } from "../util"
import { db } from "../store/db"
import type { DNAUser, UDNAUser } from "../store/db"
import { useUIStore } from "../store/ui"
import { useSettingStore } from "../store/setting"

const ui = useUIStore()
const setting = useSettingStore()
// 用户列表
const users = ref<DNAUser[]>([])
// 新增用户iframe状态
const isAddIframeOpen = ref(false)
// 新增用户通过token状态
const isAddByTokenOpen = ref(false)
// JSON输入
const jsonInput = ref("")

// 加载用户列表
const loadUsers = async () => {
    users.value = await db.dnaUsers.toArray()
    if (users.value.length > 0 && !setting.dnaUserId) {
        setting.dnaUserId = users.value[0].id
    }
}

// 添加用户
const addUser = async (data: { dev_code: string; user: import("dna-api").DNALoginRes }) => {
    const userData = {
        uid: data.user.userId,
        name: data.user.userName,
        dev_code: data.dev_code,
        token: data.user.token,
        refreshToken: data.user.refreshToken,
        pic: data.user.headUrl,
        status: data.user.status,
        isComplete: data.user.isComplete,
    } satisfies UDNAUser as UDNAUser
    if (data.user.isOfficial) userData.isOfficial = data.user.isOfficial
    if (data.user.isRegister) userData.isRegister = data.user.isRegister
    await db.dnaUsers.add(userData)
    await loadUsers()
    isAddIframeOpen.value = false
}

const addUserByToken = async () => {
    const rawdata = JSON.parse(jsonInput.value)
    const userData = {
        uid: rawdata.uid || rawdata.userId,
        name: rawdata.name || rawdata.userName,
        dev_code: rawdata.dev_code,
        token: rawdata.token,
        refreshToken: rawdata.refreshToken,
        pic: rawdata.pic || rawdata.headUrl,
        status: rawdata.status,
        isComplete: rawdata.isComplete,
    } satisfies UDNAUser as UDNAUser
    if (rawdata.isOfficial) userData.isOfficial = rawdata.isOfficial
    if (rawdata.isRegister) userData.isRegister = rawdata.isRegister
    await db.dnaUsers.add(userData)
    await loadUsers()
    isAddByTokenOpen.value = false
}

// 删除用户
const deleteUser = async (id: number) => {
    if (await ui.showDialog("确认删除", "确定要删除这个用户吗？")) {
        await db.dnaUsers.delete(id)
        await loadUsers()
        if (setting.dnaUserId === id) {
            setting.dnaUserId = users.value.length > 0 ? users.value[0].id : 0
        }
    }
}

// 切换用户
const switchUser = (id: number) => {
    setting.dnaUserId = id
}

// 复制用户JSON
const copyUser = (id: number) => {
    const user = users.value.find((u) => u.id === id)
    if (user) {
        const text = JSON.stringify(user, null, 2)
        copyText(text)
        ui.showSuccessMessage("复制成功")
    }
}

// 处理来自iframe的消息
const handleIframeMessage = (event: MessageEvent) => {
    if (event.data?.type === "LOGIN_SUCCESS") {
        addUser(event.data)
    }
}

// 组件挂载时加载用户列表并添加消息监听
onMounted(() => {
    loadUsers()
    window.addEventListener("message", handleIframeMessage)
})

// 组件卸载时移除消息监听
onBeforeUnmount(() => {
    window.removeEventListener("message", handleIframeMessage)
})
</script>

<template>
    <div class="w-full h-full bg-base-100 p-4 flex flex-col">
        <!-- 顶部操作栏 -->
        <div class="flex justify-between items-center mb-4">
            <h1 class="text-xl font-semibold text-base-content">账号管理</h1>
            <div class="join">
                <button @click="isAddIframeOpen = true" class="join-item btn btn-primary">
                    <Icon icon="ri:add-line" class="size-5 mr-1" />
                    <span> 添加账号 </span>
                </button>
                <Tooltip tooltip="通过JSON添加账号" side="bottom">
                    <button @click="((isAddByTokenOpen = true), (jsonInput = ''))" class="join-item btn btn-primary btn-square">
                        <Icon icon="ri:more-line" class="size-5" />
                    </button>
                </Tooltip>
            </div>
        </div>

        <!-- 用户列表卡片 -->
        <div class="flex-1 flex card bg-base-200 shadow-lg rounded-xl overflow-hidden">
            <!-- 卡片内容 -->
            <ScrollArea class="card-body p-0 h-full flex">
                <!-- 表格 -->
                <table class="table w-full">
                    <!-- 表头 -->
                    <thead class="sticky top-0 z-10">
                        <tr class="bg-base-100">
                            <th class="text-left text-base-content font-medium">名称</th>
                            <th class="text-left text-base-content font-medium">UID</th>
                            <th class="text-left text-base-content font-medium">状态</th>
                            <th class="text-right text-base-content font-medium">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="user in users"
                            :key="user.id"
                            class="border-b border-base-300 transition-colors hover:bg-base-100/50"
                            :class="{ 'bg-primary/10 hover:bg-primary/20': user.id === setting.dnaUserId }"
                        >
                            <!-- 名称 -->
                            <td class="py-3 px-4">
                                <div class="flex items-center">
                                    <!-- 用户头像 -->
                                    <div
                                        class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold mr-2"
                                    >
                                        <img :src="user.pic" alt="用户头像" class="w-full h-full rounded-full" />
                                    </div>
                                    <span class="text-base-content">{{ user.name }}</span>
                                </div>
                            </td>

                            <!-- 用户ID -->
                            <td class="py-3 px-4">
                                <span class="text-base-content/80 truncate max-w-[150px]">{{ user.uid }}</span>
                            </td>

                            <!-- 状态 -->
                            <td class="py-3 px-4">
                                <span class="badge badge-primary badge-sm">{{ user.isComplete ? "已绑定" : "未绑定" }}</span>
                                <span class="badge badge-primary badge-sm" v-if="user.isOfficial">官方</span>
                            </td>

                            <!-- 操作按钮 -->
                            <td class="py-3 px-4 text-right">
                                <div class="flex justify-end gap-2">
                                    <!-- 使用按钮 -->
                                    <button
                                        @click="switchUser(user.id)"
                                        class="btn btn-sm btn-primary"
                                        :disabled="user.id === setting.dnaUserId"
                                    >
                                        {{ user.id === setting.dnaUserId ? "当前" : "使用" }}
                                    </button>
                                    <!-- 复制按钮 -->
                                    <Tooltip tooltip="复制账号JSON" side="bottom">
                                        <button @click="copyUser(user.id)" class="btn btn-sm btn-square">
                                            <Icon icon="ri:clipboard-line" class="size-4" />
                                        </button>
                                    </Tooltip>
                                    <!-- 删除按钮 -->
                                    <button @click="deleteUser(user.id)" class="btn btn-sm btn-square btn-error">
                                        <Icon icon="ri:delete-bin-line" class="size-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>

                        <!-- 空状态 -->
                        <tr v-if="users.length === 0">
                            <td colspan="5" class="py-8 text-center">
                                <div class="text-center py-6">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-10 w-10 mx-auto mb-2 opacity-50 text-base-content"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="1.5"
                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                        />
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="1.5"
                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                        />
                                    </svg>
                                    <p class="text-base-content/60">暂无账号，请添加新账号</p>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>
        </div>

        <!-- 添加用户iframe模态框 -->
        <div class="modal" :class="{ 'modal-open': isAddIframeOpen }">
            <div class="modal-box bg-base-200 shadow-2xl rounded-xl p-0 w-114 h-116">
                <iframe ref="iframeRef" src="/login.html" class="w-full h-full border-0 rounded-lg"></iframe>
            </div>

            <!-- 模态框背景 -->
            <div class="modal-backdrop" @click="isAddIframeOpen = false"></div>
        </div>
        <!-- 添加用户iframe模态框 -->
        <div class="modal" :class="{ 'modal-open': isAddByTokenOpen }">
            <div class="modal-box bg-base-200 shadow-2xl rounded-xl p-0 w-114 h-116">
                <div class="w-full h-full card bg-base-200 shadow-xl overflow-hidden">
                    <form class="card-body p-6 gap-4">
                        <!-- 手机号输入 -->
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">JSON</legend>
                            <textarea v-model="jsonInput" required placeholder="请输入JSON字符串" class="input w-full p-2 h-68 text-md" />
                        </fieldset>
                        <!-- 登录按钮 -->
                        <button class="btn btn-primary btn-block" @click="addUserByToken" :disabled="!jsonInput.length">添加用户</button>

                        <!-- 辅助信息 -->
                        <div class="text-center text-sm text-base-content/70">
                            <p>导入JSON数据</p>
                        </div>
                    </form>
                </div>
            </div>

            <!-- 模态框背景 -->
            <div class="modal-backdrop" @click="isAddByTokenOpen = false"></div>
        </div>
    </div>
</template>
