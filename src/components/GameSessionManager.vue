<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { useObservable } from "@vueuse/rxjs"
import { liveQuery } from "dexie"
import { t } from "i18next"
import { computed, onMounted, ref, watch } from "vue"
import { pathExists, readTextFile, writeTextFile } from "@/api/app"
import { db, type GameAccount } from "@/store/db"
import { useGameStore } from "@/store/game"
import { useUIStore } from "@/store/ui"

const game = useGameStore()
const ui = useUIStore()

// 账号列表（Dexie 持久化）与当前生效的账号 id
const accounts = useObservable<GameAccount[]>(liveQuery(() => db.gameAccounts.toArray()) as any)
const currentAccountId = useLocalStorage("game.current_account", "")

// 登录缓存文件路径：DNA Game\EM\Saved\PcUsdk\SaveGame\cachedLogin
const accountFilePath = computed(() => (game.path ? `${game.gameDir}EM\\Saved\\PcUsdk\\SaveGame\\cachedLogin` : ""))

const currentAccount = computed(() => accounts.value?.find(account => account.id === Number(currentAccountId.value)))

// 登录缓存文件是否存在（不存在时提示需要先在游戏内登录）
const loginFileExists = ref(false)
const loginFileChecked = ref(false)

// 账号命名对话框状态
const nameDialogVisible = ref(false)
const pendingAccountName = ref("")
const pendingAccountContent = ref("")

/**
 * 检查登录缓存文件是否存在。
 */
async function checkLoginFile() {
    loginFileChecked.value = false
    loginFileExists.value = false
    if (!game.path) return
    loginFileExists.value = await pathExists(accountFilePath.value).catch(() => false)
    loginFileChecked.value = true
}

// 组件挂载与游戏路径变化时检查登录缓存文件
onMounted(checkLoginFile)
watch(() => game.path, checkLoginFile)

/**
 * 从登录缓存内容中猜测账号名称（兼容常见 JSON 字段）。
 * @param content cachedLogin 文件内容
 * @returns 猜测到的账号名，无法识别时返回空字符串
 */
function guessAccountName(content: string): string {
    try {
        const data = JSON.parse(content)
        if (data && typeof data === "object") {
            for (const key of ["nickname", "name", "userName", "username", "displayName", "account", "userId", "uid", "uin"]) {
                const value = data[key]
                if (typeof value === "string" && value.trim()) return value.trim()
                if (typeof value === "number" && value) return String(value)
            }
        }
    } catch {
        // 非 JSON 内容，返回空名称
    }
    return ""
}

/**
 * 读取当前游戏登录缓存文件内容。
 * @returns 缓存内容，文件不存在或读取失败时返回空字符串
 */
async function readCurrentLoginContent(): Promise<string> {
    if (!game.path || !(await pathExists(accountFilePath.value))) return ""
    try {
        const content = await readTextFile(accountFilePath.value)
        return content.trim() ? content : ""
    } catch (error) {
        console.error("读取登录缓存失败:", error)
        return ""
    }
}

/**
 * 添加当前游戏账号到列表。
 */
async function addCurrentAccount() {
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGamePathFirst"))
        return
    }
    try {
        const content = await readCurrentLoginContent()
        if (!content) {
            ui.showErrorMessage(t("game-launcher.accountNoLoginFile"))
            return
        }
        // 内容已在列表中，直接切换为当前账号
        const existed = accounts.value?.find(account => account.content === content)
        if (existed) {
            await db.gameAccounts.update(existed.id, { lastUsed: Date.now() })
            currentAccountId.value = String(existed.id)
            ui.showSuccessMessage(t("game-launcher.accountAlreadyExists"))
            return
        }
        // 当前登录内容与已保存的当前账号不一致，说明已切换登录，解除旧绑定
        if (currentAccount.value && currentAccount.value.content !== content) {
            currentAccountId.value = ""
        }
        pendingAccountContent.value = content
        pendingAccountName.value = guessAccountName(content)
        nameDialogVisible.value = true
    } catch (error) {
        console.error("添加账号失败:", error)
        ui.showErrorMessage(t("game-launcher.accountAddFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}

/**
 * 确认添加账号。
 */
async function confirmAddAccount() {
    const name = pendingAccountName.value.trim() || t("game-launcher.accountDefaultName")
    const now = Date.now()
    const id = await db.gameAccounts.add({
        name,
        content: pendingAccountContent.value,
        addTime: now,
        lastUsed: now,
    })
    currentAccountId.value = String(id)
    nameDialogVisible.value = false
    ui.showSuccessMessage(t("game-launcher.accountAddSuccess"))
}

/**
 * 切换账号：先回写当前登录缓存到当前账号条目，再写入目标账号的登录缓存。
 * @param account 目标账号
 */
async function switchAccount(account: GameAccount) {
    if (!game.path) return
    // 游戏运行中切换可能被游戏退出时覆盖
    if (game.running) {
        const confirmed = await ui.showDialog(t("game-launcher.accountSwitch"), t("game-launcher.accountSwitchRunningWarning"))
        if (!confirmed) return
    }
    try {
        // 将当前登录缓存回写到当前账号条目，避免切换后丢失最新登录状态
        const liveContent = await readCurrentLoginContent()
        if (liveContent && currentAccount.value && currentAccount.value.id !== account.id) {
            await db.gameAccounts.update(currentAccount.value.id, { content: liveContent, lastUsed: Date.now() })
        }
        if (liveContent !== account.content) {
            await writeTextFile(accountFilePath.value, account.content)
        }
        currentAccountId.value = String(account.id)
        await db.gameAccounts.update(account.id, { lastUsed: Date.now() })
        ui.showSuccessMessage(t("game-launcher.accountSwitchSuccess", { name: account.name }))
    } catch (error) {
        console.error("切换账号失败:", error)
        ui.showErrorMessage(t("game-launcher.accountSwitchFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}

/**
 * 删除已保存的账号。
 * @param account 待删除账号
 */
async function removeAccount(account: GameAccount) {
    const confirmed = await ui.showDialog(t("game-launcher.accountDelete"), t("game-launcher.accountDeleteConfirm", { name: account.name }))
    if (!confirmed) return
    await db.gameAccounts.delete(account.id)
    if (currentAccountId.value === String(account.id)) {
        currentAccountId.value = ""
    }
}
</script>

<template>
    <div class="flex flex-col gap-4">
        <!-- 登录缓存文件缺失提示 -->
        <div
            v-if="loginFileChecked && !loginFileExists"
            class="flex items-center gap-2 rounded-xs border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
        >
            <Icon icon="ri:error-warning-line" class="size-4 flex-none" />
            {{ $t("game-launcher.accountNoLoginFile") }}
        </div>

        <!-- 添加账号入口 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ACCOUNT" :title="$t('game-launcher.accountManage')" />
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-content transition-opacity duration-150"
                    :class="{ 'pointer-events-none opacity-45': !game.path }"
                    @click="addCurrentAccount()"
                >
                    <Icon icon="ri:save-line" class="size-4" />
                    {{ $t("game-launcher.accountAdd") }}
                </button>
            </div>
        </section>

        <!-- 账号列表 -->
        <section v-if="accounts?.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LIST" :count="accounts.length" />
            <div class="flex flex-col gap-2">
                <div
                    v-for="account in accounts"
                    :key="account.id"
                    class="group animate-ef-rise motion-reduce:animate-none relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-xs border bg-base-100/60 p-2.5 backdrop-blur-sm transition-all duration-200 hover:border-primary/50"
                    :class="
                        account.id === Number(currentAccountId)
                            ? 'border-primary/70 bg-primary/10'
                            : 'border-base-content/15 hover:-translate-y-0.5'
                    "
                    :style="{ animationDelay: `${Math.min((accounts?.indexOf(account) ?? 0) * 40, 280)}ms` }"
                    @click="switchAccount(account)"
                >
                    <!-- 选中态主色竖条 -->
                    <span
                        class="absolute inset-y-0 left-0 w-[3px] bg-primary transition-opacity duration-200"
                        :class="account.id === Number(currentAccountId) ? 'opacity-100' : 'opacity-0'"
                        aria-hidden="true"
                    />
                    <div class="flex size-9 flex-none items-center justify-center rounded-xs bg-base-content/10 text-base-content/60">
                        <Icon icon="ri:user-line" class="size-5" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <span
                                class="truncate font-semibold"
                                :class="account.id === Number(currentAccountId) ? 'text-primary' : 'text-base-content/85'"
                                >{{ account.name }}</span
                            >
                            <span
                                v-if="account.id === Number(currentAccountId)"
                                class="shrink-0 whitespace-nowrap rounded-xs border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                            >
                                {{ $t("game-launcher.accountCurrent") }}
                            </span>
                        </div>
                        <div class="text-xs text-base-content/50">
                            {{ $t("game-launcher.accountAddTime") }}: {{ ui.timeDistancePassed(account.addTime) }}
                            <template v-if="account.lastUsed">
                                · {{ $t("game-launcher.accountLastUsed") }}: {{ ui.timeDistancePassed(account.lastUsed) }}
                            </template>
                        </div>
                    </div>
                    <button
                        type="button"
                        class="tooltip tooltip-bottom inline-flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-error/60 hover:text-error"
                        :data-tip="$t('game-launcher.accountDelete')"
                        @click.stop="removeAccount(account)"
                    >
                        <Icon icon="ri:delete-bin-6-line" class="size-4" />
                    </button>
                </div>
            </div>
        </section>
        <section
            v-else
            class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-6 text-center text-sm text-base-content/50 backdrop-blur-sm"
        >
            {{ $t("game-launcher.accountEmpty") }}
        </section>

        <!-- 账号命名对话框 -->
        <dialog id="account_name_modal" class="modal" :class="{ 'modal-open': nameDialogVisible }">
            <div class="modal-box">
                <h3 class="text-lg font-bold">{{ $t("game-launcher.accountAdd") }}</h3>
                <p class="py-4">
                    <input
                        v-model="pendingAccountName"
                        type="text"
                        :placeholder="$t('game-launcher.accountNamePlaceholder')"
                        class="input input-bordered input-md w-full rounded-xs"
                    />
                </p>
                <div class="modal-action">
                    <form method="dialog" class="space-x-2">
                        <button class="min-w-20 btn btn-primary" @click="confirmAddAccount()">{{ $t("setting.confirm") }}</button>
                        <button class="min-w-20 btn" @click="nameDialogVisible = false">{{ $t("setting.cancel") }}</button>
                    </form>
                </div>
            </div>
            <div class="modal-backdrop" @click="nameDialogVisible = false" />
        </dialog>
    </div>
</template>
