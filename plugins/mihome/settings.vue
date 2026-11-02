<script setup lang="ts">
import { env, getRuntime, QrCodeStyled, Select, SelectItem, useUIStore } from "@dob/host"
import type { MiHomeScene } from "@pa001024/mihome-api"
import { StorageSerializers, useLocalStorage } from "@vueuse/core"
import { computed, onMounted, ref } from "vue"
import { account } from "./index"

const props = defineProps<{
    modelValue: Record<string, unknown>
    /** 仅展示账号（登录 / 登出），隐藏场景选择。 */
    accountOnly?: boolean
}>()
const emit = defineEmits<{
    (e: "update:modelValue", value: Record<string, unknown>): void
}>()

const ui = useUIStore()

const sceneCache = useLocalStorage<MiHomeScene[]>("setting_mihome_scenes", [], {
    serializer: StorageSerializers.object,
    writeDefaults: false,
})

const loggedIn = ref<boolean | null>(null)
const qrUrl = ref("")
const qrLp = ref("")
const qrBusy = ref(false)
const loginBusy = ref(false)
const scenesBusy = ref(false)
const statusBusy = ref(false)
const lastError = ref("")
const liveScenes = ref<MiHomeScene[]>([])

const loginStatusText = computed(() => {
    if (loggedIn.value === true) return "已登录"
    if (loggedIn.value === false) return "未登录"
    return "未测试"
})

const effectiveScenes = computed(() => (liveScenes.value.length > 0 ? liveScenes.value : sceneCache.value))

const sceneOptions = computed(() =>
    effectiveScenes.value.map(scene => ({
        value: `${scene.scene_id}@@${scene.home_id}`,
        label: scene.home_name ? `${scene.name} · ${scene.home_name}` : scene.name,
    }))
)

const selectedSceneKey = computed({
    get() {
        const sceneId = String(props.modelValue.scene_id ?? "")
        const homeId = String(props.modelValue.home_id ?? "")
        return sceneId ? `${sceneId}@@${homeId}` : ""
    },
    set(key: string) {
        const [sceneId = "", homeId = ""] = key.split("@@")
        const hit = effectiveScenes.value.find(scene => scene.scene_id === sceneId && scene.home_id === (homeId ?? ""))
        emit("update:modelValue", {
            ...props.modelValue,
            scene_id: sceneId,
            home_id: homeId,
            sceneName: hit?.name ?? props.modelValue.sceneName ?? "",
        })
    },
})

function fetchFn() {
    return getRuntime().fetch
}

async function refreshStatus() {
    if (statusBusy.value) return loggedIn.value === true
    statusBusy.value = true
    lastError.value = ""
    try {
        loggedIn.value = await account.status(fetchFn())
        return loggedIn.value
    } catch (error) {
        lastError.value = error instanceof Error ? error.message : String(error)
        return false
    } finally {
        statusBusy.value = false
    }
}

async function refreshScenes() {
    if (scenesBusy.value) return effectiveScenes.value
    scenesBusy.value = true
    lastError.value = ""
    try {
        const list = await account.listScenes(fetchFn())
        liveScenes.value = list
        sceneCache.value = list
        loggedIn.value = true
        return list
    } catch (error) {
        lastError.value = error instanceof Error ? error.message : String(error)
        throw error
    } finally {
        scenesBusy.value = false
    }
}

async function beginQr() {
    if (qrBusy.value) return
    qrBusy.value = true
    lastError.value = ""
    try {
        const data = await account.qrBegin(fetchFn())
        if (data.already) {
            loggedIn.value = true
            qrUrl.value = ""
            qrLp.value = ""
            await refreshScenes()
            return
        }
        loggedIn.value = false
        qrUrl.value = data.login_url
        qrLp.value = data.lp
    } catch (error) {
        lastError.value = error instanceof Error ? error.message : String(error)
        throw error
    } finally {
        qrBusy.value = false
    }
}

async function waitQr() {
    if (loginBusy.value || !qrUrl.value) return
    loginBusy.value = true
    lastError.value = ""
    try {
        await account.qrWait(fetchFn(), qrUrl.value, qrLp.value)
        loggedIn.value = true
        qrUrl.value = ""
        qrLp.value = ""
        await refreshScenes()
    } catch (error) {
        lastError.value = error instanceof Error ? error.message : String(error)
        throw error
    } finally {
        loginBusy.value = false
    }
}

async function getQrAndWait() {
    if (qrBusy.value || loginBusy.value) return
    try {
        await beginQr()
    } catch (error) {
        ui.showErrorMessage(`登录失败：${error instanceof Error ? error.message : String(error)}`)
        return
    }
    if (!qrUrl.value) {
        ui.showSuccessMessage("登录成功")
        return
    }
    try {
        await waitQr()
        ui.showSuccessMessage("登录成功")
    } catch {
        cancelQr()
        ui.showErrorMessage("登录失败：" + lastError.value)
    }
}

function cancelQr() {
    qrUrl.value = ""
    qrLp.value = ""
}

async function logout() {
    lastError.value = ""
    try {
        await account.logout(fetchFn())
    } catch (error) {
        ui.showErrorMessage(`登录失败：${error instanceof Error ? error.message : String(error)}`)
        return
    }
    loggedIn.value = false
    liveScenes.value = []
    qrUrl.value = ""
    qrLp.value = ""
}

async function refreshOnly() {
    if (scenesBusy.value) return
    try {
        await refreshScenes()
    } catch (error) {
        ui.showErrorMessage("连接失败：" + (error instanceof Error ? error.message : String(error)))
    }
}

onMounted(() => {
    if (!env.isApp) return
    void (async () => {
        await refreshStatus()
        if (loggedIn.value && effectiveScenes.value.length === 0) {
            try {
                await refreshScenes()
            } catch {
                // 静默失败：用户点刷新时再看错误
            }
        }
    })()
})
</script>

<template>
    <div class="flex flex-col gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
        <div class="flex items-center gap-2">
            <span
                class="inline-block size-1.5 rounded-full"
                :class="loggedIn === true ? 'bg-success' : 'bg-base-content/25'"
                :title="loginStatusText"
            />
            <span class="text-[11px] text-base-content/55">{{ loginStatusText }}</span>
            <span v-if="lastError" class="text-xs text-error">{{ lastError }}</span>
            <span v-if="!env.isApp" class="text-xs text-warning">仅桌面端可用</span>
        </div>
        <div v-if="env.isApp">
            <div v-if="loggedIn !== true" class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-1.5">
                    <button type="button" class="btn btn-xs" :disabled="qrBusy || loginBusy" @click="getQrAndWait">
                        <span v-if="qrBusy" class="loading loading-spinner loading-xs" />
                        获取登录二维码
                    </button>
                    <span v-if="loginBusy" class="inline-flex items-center gap-1.5 text-[11px] text-base-content/55">
                        <span class="loading loading-spinner loading-xs" />
                        等待扫码…
                    </span>
                    <button v-if="qrUrl" type="button" class="btn btn-xs" @click="cancelQr">
                        取消
                    </button>
                </div>
                <div v-if="qrUrl" class="flex flex-wrap items-center gap-3">
                    <QrCodeStyled :value="qrUrl" :size="168" />
                    <p class="min-w-40 flex-1 text-[11px] leading-relaxed text-base-content/55">
                        用米家 APP 扫码登录，成功后自动继续
                    </p>
                </div>
                <p class="text-[11px] leading-relaxed text-base-content/45">登录后才能加载手动场景并触发执行</p>
            </div>
            <div v-else class="flex flex-wrap items-center gap-1.5">
                <button type="button" class="btn btn-xs" :disabled="scenesBusy" @click="refreshOnly">
                    <span v-if="scenesBusy" class="loading loading-spinner loading-xs" />
                    刷新场景
                </button>
                <button type="button" class="btn btn-xs" @click="logout">
                    退出登录
                </button>
                <span class="text-[11px] text-base-content/50">
                    {{
                        effectiveScenes.length > 0
                            ? `已加载 ${effectiveScenes.length} 个手动场景`
                            : "还没有手动场景"
                    }}
                </span>
            </div>
            <label v-if="!accountOnly" class="mt-2 flex flex-col gap-1">
                <span class="text-[11px] text-base-content/55">执行场景</span>
                <Select
                    v-model="selectedSceneKey"
                    class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                    placeholder="请选择手动场景"
                >
                    <SelectItem v-for="option in sceneOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </SelectItem>
                </Select>
            </label>
        </div>
    </div>
</template>
