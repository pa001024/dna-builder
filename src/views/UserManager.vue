<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { env } from "@/env"
import type { DNAUser, UDNAUser } from "@/store/db"
import { db } from "@/store/db"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"
import { parseDnaUserImportJson } from "@/utils/dna-user-import"

const ui = useUIStore()
const setting = useSettingStore()
// 皎皎角账号列表
const users = ref<DNAUser[]>([])
// 新增皎皎角账号iframe状态
const isAddIframeOpen = ref(false)
// 新增皎皎角账号通过token状态
const isAddByTokenOpen = ref(false)
// JSON输入
const jsonInput = ref("")
// 登录 iframe，用于同步 UI 缩放
const iframeRef = ref<HTMLIFrameElement | null>(null)

// 将父页面 UI 缩放同步到 iframe 内部（iframe 是独立文档，不会继承 --uiscale）
// 同时强制同步父文档字号：iframe 视口较窄会命中 style.css 的
// @media (max-width: 40rem) → 13px 断点，与父页面 16px 不一致，导致 rem 布局错位
const applyIframeUiScale = () => {
    const doc = iframeRef.value?.contentDocument
    if (!doc) return
    doc.documentElement.style.setProperty("--uiscale", String(setting.uiScale))
    doc.documentElement.style.fontSize = getComputedStyle(document.documentElement).fontSize
}

watch(
    () => setting.uiScale,
    () => {
        if (isAddIframeOpen.value) applyIframeUiScale()
    }
)

// 加载皎皎角账号列表
const loadUsers = async () => {
    users.value = await db.dnaUsers.toArray()
    if (users.value.length > 0 && !setting.dnaUserId) {
        setting.dnaUserId = users.value[0].id
    }
}

// 添加皎皎角账号
const addUser = async (data: { dev_code: string; user: import("dna-api").DNAUserDataBean }) => {
    const userData: UDNAUser = {
        uid: data.user.userId,
        name: data.user.userName,
        dev_code: data.dev_code,
        token: data.user.token,
        server: data.user.registerLang ? "global" : "cn",
        kf_token: "",
        refreshToken: data.user.refreshToken,
        pic: data.user.headUrl,
        status: data.user.status,
        isComplete: data.user.isComplete,
    }
    if (data.user.isOfficial) userData.isOfficial = data.user.isOfficial
    if (data.user.isRegister) userData.isRegister = data.user.isRegister
    await db.dnaUsers.add(userData)
    await loadUsers()
    isAddIframeOpen.value = false
}

const jsonPlaceholder = `{
  "uid": "7...",
  "name": "...",
  "dev_code": "2...",
  "token": "ey...",
  "server": "cn",
  "kf_token": "",
  "refreshToken": "ey.....",
  "pic": "https://herobox-img.yingxiong.com/config/head/268_v2_15.png",
  "status": 0,
  "isComplete": 1,
  "isOfficial": 0,
  "isRegister": 0
}`
// 通过 JSON 添加皎皎角账号
const addUserByToken = async () => {
    try {
        const userData = parseDnaUserImportJson(jsonInput.value)
        await db.dnaUsers.add(userData)
        await loadUsers()
        isAddByTokenOpen.value = false
        ui.showSuccessMessage("添加账号成功")
    } catch (error) {
        console.error("导入皎皎角账号失败:", error)
        ui.showErrorMessage(error instanceof Error ? error.message : "账号 JSON 格式无效")
    }
}

// 删除皎皎角账号
const deleteUser = async (id: number) => {
    if (await ui.showDialog("确认删除", "确定要删除这个用户吗？")) {
        await db.dnaUsers.delete(id)
        await loadUsers()
        if (setting.dnaUserId === id) {
            setting.dnaUserId = users.value.length > 0 ? users.value[0].id : 0
        }
    }
}

// 切换皎皎角账号
const switchUser = (id: number) => {
    setting.dnaUserId = id
}

// 复制皎皎角账号JSON
const copyUser = (id: number) => {
    const user = users.value.find(u => u.id === id)
    if (user) {
        const text = JSON.stringify(user, null, 2)
        copyText(text)
        ui.showSuccessMessage("复制成功")
    }
}

// 处理来自iframe的皎皎角账号登录消息
const handleIframeMessage = (event: MessageEvent) => {
    if (event.data?.type === "LOGIN_SUCCESS") {
        addUser(event.data)
    }
}

// 组件挂载时加载皎皎角账号列表并添加消息监听
onMounted(() => {
    loadUsers()
    window.addEventListener("message", handleIframeMessage)
    if (!env.isApp) {
        setting.dnaUserId = 0
    }
})

// 组件卸载时移除消息监听
onBeforeUnmount(() => {
    window.removeEventListener("message", handleIframeMessage)
})
</script>

<template>
    <div class="relative flex h-full w-full flex-col">
        <!-- 网页端不可用遮罩 -->
        <div
            v-if="!env.isApp"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-base-100/85 backdrop-blur-md"
        >
            <div class="flex items-center gap-2.5 text-warning">
                <Icon icon="ri:error-warning-line" class="size-8" />
                <span class="text-sm font-semibold tracking-wide">网页端不可用</span>
            </div>
            <a
                href="/api/download"
                class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xs border border-primary bg-primary px-5 text-[13px] font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 active:scale-[0.97]"
            >
                <Icon icon="ri:download-2-line" class="size-4" />
                下载APP
            </a>
        </div>

        <!-- 页面标题行：kicker + hairline（子页面不做大标题 header） -->
        <div class="flex-none border-b border-base-content/15 px-4 pt-3 pb-3 stagger-rise">
            <SectionHeader no-animate compact kicker="ACCOUNTS" title="皎皎角账号管理">
                <template #trailing>
                    <div class="flex items-center gap-1.5">
                        <!-- 添加账号按钮 -->
                        <button
                            type="button"
                            class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-xs border border-primary bg-primary px-2.5 text-[12px] font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 active:scale-[0.97]"
                            @click="isAddIframeOpen = true"
                        >
                            <Icon icon="ri:add-line" class="size-3.5" />
                            添加账号
                        </button>
                        <!-- 通过JSON添加账号 -->
                        <Tooltip tooltip="通过JSON添加皎皎角账号(登录后可复制)" side="bottom">
                            <button
                                type="button"
                                class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary active:scale-[0.97]"
                                @click="((isAddByTokenOpen = true), (jsonInput = ''))"
                            >
                                <Icon icon="ri:more-line" class="size-4" />
                            </button>
                        </Tooltip>
                    </div>
                </template>
            </SectionHeader>
        </div>

        <!-- 账号列表区块卡 -->
        <div
            class="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm"
        >
            <ScrollArea class="flex-1">
                <div class="p-2.5">
                    <!-- 空状态 -->
                    <div
                        v-if="users.length === 0"
                        class="flex flex-col items-center justify-center px-4 py-16 text-center text-base-content/45"
                    >
                        <Icon icon="ri:user-line" class="mb-3 h-10 w-10 opacity-40" />
                        <p class="text-sm tracking-wide">暂无皎皎角账号，请添加新账号</p>
                    </div>

                    <!-- 账号列表 -->
                    <div v-else class="space-y-1.5">
                        <article
                            v-for="(user, index) in users"
                            :key="user.id"
                            class="group relative overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 animate-ef-rise motion-reduce:animate-none"
                            :class="
                                user.id === setting.dnaUserId
                                    ? 'usm-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                        >
                            <!-- 左侧主色强调条：当前账号时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="user.id === setting.dnaUserId ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex items-center gap-3 p-3">
                                <!-- 头像 -->
                                <div class="size-10 shrink-0 overflow-hidden rounded-xs bg-primary/15">
                                    <img :src="user.pic" :alt="user.name" class="h-full w-full object-cover" />
                                </div>

                                <!-- 名称 + 元信息 -->
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2">
                                        <span
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': user.id === setting.dnaUserId }"
                                        >
                                            {{ user.name }}
                                        </span>
                                    </div>
                                    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                        <!-- UID -->
                                        <CopyID :id="user.uid" name="UID" />
                                        <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                                        <!-- 服务器 -->
                                        <span
                                            class="rounded-xs border border-base-content/15 px-1.5 py-px text-[10px] tracking-wide text-base-content/55"
                                        >
                                            {{ user.server === "global" ? "国际服" : "国服" }}
                                        </span>
                                        <!-- 绑定状态 -->
                                        <span
                                            class="rounded-xs border px-1.5 py-px text-[10px] tracking-wide"
                                            :class="
                                                user.isComplete
                                                    ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                                                    : 'border-base-content/20 text-base-content/50'
                                            "
                                        >
                                            {{ user.isComplete ? "已绑定" : "未绑定" }}
                                        </span>
                                        <!-- 官方标记 -->
                                        <span
                                            v-if="user.isOfficial"
                                            class="rounded-xs border border-base-content/20 px-1.5 py-px text-[10px] tracking-wide text-base-content/55"
                                        >
                                            官方
                                        </span>
                                    </div>
                                </div>

                                <!-- 操作按钮 -->
                                <div class="flex shrink-0 items-center gap-1.5">
                                    <!-- 使用/当前 -->
                                    <button
                                        type="button"
                                        class="inline-flex h-7 cursor-pointer items-center rounded-xs border px-2.5 text-[12px] font-semibold transition-colors duration-150 active:scale-[0.97] disabled:cursor-default disabled:active:scale-100"
                                        :disabled="user.id === setting.dnaUserId"
                                        :class="
                                            user.id === setting.dnaUserId
                                                ? 'border-primary/30 bg-primary/10 text-primary/60'
                                                : 'border-primary bg-primary text-primary-content hover:bg-primary/90'
                                        "
                                        @click="switchUser(user.id)"
                                    >
                                        {{ user.id === setting.dnaUserId ? "当前" : "使用" }}
                                    </button>
                                    <!-- 复制按钮 -->
                                    <Tooltip tooltip="复制账号JSON" side="bottom">
                                        <button
                                            type="button"
                                            class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary active:scale-[0.97]"
                                            @click="copyUser(user.id)"
                                        >
                                            <Icon icon="ri:clipboard-line" class="size-3.5" />
                                        </button>
                                    </Tooltip>
                                    <!-- 删除按钮 -->
                                    <button
                                        type="button"
                                        class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-error/40 text-error/80 transition-colors duration-150 hover:bg-error/10 hover:text-error active:scale-[0.97]"
                                        @click="deleteUser(user.id)"
                                    >
                                        <Icon icon="ri:delete-bin-line" class="size-3.5" />
                                    </button>
                                </div>
                            </div>
                        </article>
                    </div>
                </div>
            </ScrollArea>

            <!-- 底部统计条 -->
            <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                <p class="text-[11px] tracking-wide text-base-content/50">
                    共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ users.length }}</b> 个账号
                </p>
            </div>
        </div>

        <!-- 添加皎皎角账号 iframe 模态框 -->
        <div class="modal" :class="{ 'modal-open': isAddIframeOpen }">
            <div class="modal-box w-114 h-110 rounded-xs border border-base-content/15 bg-base-100/85 p-0 shadow-lg backdrop-blur-md">
                <iframe ref="iframeRef" src="/login_jjj.html" class="h-full w-full rounded-xs border-0" @load="applyIframeUiScale" />
            </div>

            <!-- 模态框背景 -->
            <div class="modal-backdrop" @click="isAddIframeOpen = false" />
        </div>

        <!-- 通过 JSON 添加皎皎角账号模态框 -->
        <div class="modal" :class="{ 'modal-open': isAddByTokenOpen }">
            <div class="modal-box w-114 rounded-xs border border-base-content/15 bg-base-100/85 p-0 shadow-lg backdrop-blur-md">
                <div class="p-4">
                    <SectionHeader no-animate compact kicker="IMPORT" title="通过 JSON 导入账号" />
                    <form class="mt-1 space-y-3" @submit.prevent="addUserByToken">
                        <!-- JSON 输入 -->
                        <textarea
                            v-model="jsonInput"
                            required
                            :placeholder="jsonPlaceholder"
                            class="h-56 w-full rounded-xs border border-base-content/15 bg-base-content/3 p-2.5 text-xs leading-relaxed text-base-content/80 outline-none transition-colors duration-150 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <!-- 添加按钮 -->
                        <button
                            type="submit"
                            class="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-xs border border-primary bg-primary text-[13px] font-semibold text-primary-content transition-opacity duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                            :disabled="!jsonInput.length"
                        >
                            添加账号
                        </button>

                        <!-- 辅助信息 -->
                        <p class="text-center text-xs text-base-content/50">导入皎皎角账号JSON数据</p>
                    </form>
                </div>
            </div>

            <!-- 模态框背景 -->
            <div class="modal-backdrop" @click="isAddByTokenOpen = false" />
        </div>
    </div>
</template>
