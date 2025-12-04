<script lang="ts" setup>
import { useQuery, gql } from "@urql/vue"
import { nextTick, onMounted, reactive, ref } from "vue"
import { guestMutation, loginMutation, registerMutation, updatePasswordMutation, updateUserMetaMutation } from "../mod/api/mutation"
import { t } from "i18next"
import { useUserStore } from "../store/user"
import { useRoute, useRouter } from "vue-router"
const user = useUserStore()
const route = useRoute()
const router = useRouter()

const tip = ref(typeof route.query.tip === "string" ? route.query.tip || "" : "")

const { data, executeQuery: reloadMe } = useQuery({
    query: gql`
        {
            me {
                id
                name
                qq
            }
        }
    `,
    requestPolicy: "cache-only",
})

const nameEdit = reactive({
    active: false,
    name: "",
})
const qqEdit = reactive({
    active: false,
    name: "",
})
const nameEl = ref<HTMLSpanElement>()

const loginForm = reactive({
    open: false,
    error: "",
    email: "",
    password: "",
})
async function login() {
    const result = await loginMutation({ email: loginForm.email, password: loginForm.password })
    console.debug("login", result)
    if (result?.success) {
        loginForm.open = false
        user.token = result.token
        if (tip.value) {
            tip.value = ""
            router.back()
        }
    } else {
        loginForm.error = t("login.loginFailed", { err: result?.message! })
    }
}

const registerForm = reactive({
    open: false,
    error: "",
    name: "",
    qq: "",
    email: "",
    password: "",
})
async function register() {
    const result = await registerMutation({
        email: registerForm.email,
        name: registerForm.name,
        qq: registerForm.qq,
        password: registerForm.password,
    })
    if (result?.success) {
        registerForm.open = false
        user.token = result.token
        if (tip.value) {
            tip.value = ""
            router.back()
        }
    } else {
        registerForm.error = t("login.registerFailed", { err: result?.message! })
    }
}

const guestForm = reactive({
    open: false,
    error: "",
    name: "",
    qq: "",
})
async function guest() {
    const result = await guestMutation({
        name: guestForm.name,
        qq: guestForm.qq,
    })
    if (result?.success) {
        guestForm.open = false
        user.token = result.token
        if (tip.value) {
            tip.value = ""
            router.back()
        }
    } else {
        guestForm.error = t("login.guestFailed", { err: result?.message! })
    }
}

const updatePasswordForm = reactive({
    open: false,
    error: "",
    old_password: "",
    new_password: "",
})

async function updatePassword() {
    const result = await updatePasswordMutation({
        old_password: updatePasswordForm.old_password,
        new_password: updatePasswordForm.new_password,
    })
    if (result?.success) {
        updatePasswordForm.open = false
        user.token = result.token
    } else {
        updatePasswordForm.error = t("login.updatePasswordFailed")
    }
}

function reset(obj: any) {
    for (let key in obj) {
        if (Array.isArray(obj[key])) {
            obj[key] = []
        } else if (typeof obj[key] === "object") {
            reset(obj[key])
        } else if (typeof obj[key] === "string") {
            obj[key] = ""
        } else if (typeof obj[key] === "number") {
            obj[key] = 0
        } else if (typeof obj[key] === "boolean") {
            obj[key] = false
        }
    }
}

async function startNameEdit() {
    if (nameEdit.active) {
        nameEdit.active = false
        const result = await updateUserMetaMutation({ name: nameEdit.name })
        if (result?.success) {
            user.token = result.token
        } else {
            nameEl.value!.innerText = data.value?.me?.name!
        }
    } else {
        nameEdit.active = true
        nameEdit.name = data.value?.me?.name!
        await nextTick()
        const span = nameEl.value!
        span.focus()
        const selection = window.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(span)
        selection.removeAllRanges()
        selection.addRange(range)
    }
}
async function startQQEdit() {
    if (qqEdit.active) {
        qqEdit.active = false
        const result = await updateUserMetaMutation({ qq: qqEdit.name })
        if (result?.success) {
            user.token = result.token
        } else {
            nameEl.value!.innerText = data.value?.me?.qq!
        }
    } else {
        qqEdit.active = true
        qqEdit.name = data.value?.me?.qq!
        await nextTick()
        const span = nameEl.value!
        span.focus()
        const selection = window.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(span)
        selection.removeAllRanges()
        selection.addRange(range)
    }
}

onMounted(async () => {
    await reloadMe({ requestPolicy: "network-only" })
    if (!data.value) {
        user.logout()
    }
})
</script>

<template>
    <div class="w-full h-full">
        <div class="p-4 flex flex-col gap-4 max-w-xl m-auto">
            <div role="alert" class="alert shadow-lg" v-if="tip">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-info h-6 w-6 shrink-0">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                </svg>
                <div>
                    <h3 class="font-bold">{{ $t("user.need") }}</h3>
                    <div class="text-xs">{{ tip }}</div>
                </div>
                <button class="btn btn-sm" @click="tip = ''">{{ $t("common.dismiss") }}</button>
            </div>
            <div v-if="user.id" class="flex gap-4">
                <div class="flex-none">
                    <QQAvatar v-if="user.qq" :qq="user.qq" :name="user.name!" class="w-24 h-24 shadow-lg rounded-full" />
                </div>
                <div class="flex-1 p-2 flex flex-col gap-2">
                    <h1 class="text-2xl font-bold flex gap-2 items-center">
                        <span
                            v-if="nameEdit.active"
                            ref="nameEl"
                            G
                            @input="nameEdit.name = ($event.target as any)!.textContent"
                            class="select-text px-1 outline rounded-sm"
                            :contenteditable="nameEdit.active"
                            >{{ nameEdit.name }}</span
                        >
                        <span class="select-text px-1" v-else>{{ user.name }}</span>
                        <button class="btn btn-ghost btn-square btn-sm" @click="startNameEdit">
                            <Icon v-if="nameEdit.active" icon="la:check-solid" class="size-4" />
                            <Icon v-else icon="la:edit-solid" class="size-4" />
                        </button>
                    </h1>
                    <div class="text-sm flex gap-2 items-center">
                        <span
                            v-if="qqEdit.active"
                            ref="nameEl"
                            @input="qqEdit.name = ($event.target as any)!.textContent"
                            class="select-text px-1 outline rounded-sm"
                            :contenteditable="qqEdit.active"
                            >{{ qqEdit.name }}</span
                        >
                        <span class="select-text px-1" v-else-if="user.qq">{{ user.qq }}</span>
                        <span class="select-text px-1 text-base-content/50" v-else>{{ $t("user.qq") }}</span>
                        <button class="btn btn-ghost btn-square btn-xs" @click="startQQEdit">
                            <Icon v-if="qqEdit.active" icon="la:check-solid" />
                            <Icon v-else icon="la:edit-solid" />
                        </button>
                    </div>
                </div>
            </div>
            <article>
                <h2 v-if="user.id" class="text-sm font-bold m-2">{{ $t("user.welcome") }}</h2>
                <h2 v-else class="text-sm font-bold m-2">{{ $t("user.chooseLogin") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <div class="form-control" v-if="user.id ? !user.isGuest : true">
                        <div class="label flex-wrap">
                            <span class="grow label-text">
                                {{ $t("setting.login") }}
                                <div class="text-xs text-base-content/50">{{ $t("setting.loginTip") }}</div>
                            </span>
                            <div class="grow flex justify-between gap-2 min-w-56" v-if="user.id">
                                <div class="label grow text-sm">{{ user.email }}</div>
                                <div class="btn btn-sm grow" @click="user.logout(), reloadMe({ requestPolicy: 'network-only' })">
                                    {{ $t("setting.logout") }}
                                </div>
                            </div>
                            <div class="flex justify-between gap-2 min-w-56" v-else>
                                <Dialog
                                    class="btn btn-sm grow"
                                    :title="$t('login.login')"
                                    :description="$t('login.loginTip')"
                                    @submit="login()"
                                    @close="reset(loginForm)"
                                    v-model="loginForm.open"
                                    :error="loginForm.error"
                                >
                                    {{ $t("login.login") }}
                                    <template #content>
                                        <div class="form-control space-y-4">
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:envelope" class="w-4 h-4 opacity-70" />
                                                <input
                                                    v-model="loginForm.email"
                                                    type="email"
                                                    class="grow"
                                                    autocomplete="email"
                                                    :placeholder="$t('setting.email')"
                                                />
                                            </label>
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:key" class="w-4 h-4 opacity-70" />
                                                <input
                                                    v-model="loginForm.password"
                                                    type="password"
                                                    autocomplete="current-password"
                                                    class="grow"
                                                    @keydown.enter="login"
                                                    :placeholder="$t('setting.password')"
                                                />
                                            </label>
                                        </div>
                                    </template>
                                </Dialog>
                                <Dialog
                                    class="btn btn-sm grow"
                                    :title="$t('login.register')"
                                    @submit="register"
                                    @close="reset(registerForm)"
                                    v-model="registerForm.open"
                                    :error="registerForm.error"
                                >
                                    {{ $t("login.register") }}
                                    <template #content>
                                        <div class="form-control space-y-4">
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:envelope" class="w-4 h-4 opacity-70" />
                                                <input
                                                    v-model="registerForm.email"
                                                    type="email"
                                                    class="grow"
                                                    autocomplete="email"
                                                    :placeholder="$t('setting.email')"
                                                />
                                            </label>
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:user" class="w-4 h-4 opacity-70" />
                                                <input
                                                    v-model="registerForm.name"
                                                    type="text"
                                                    class="grow"
                                                    autocomplete="nickname"
                                                    :placeholder="$t('setting.nickname')"
                                                />
                                            </label>
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:qq" class="w-4 h-4 opacity-70" />
                                                <input v-model="registerForm.qq" type="text" class="grow" :placeholder="$t('user.qq')" />
                                            </label>
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:key" class="w-4 h-4 opacity-70" />
                                                <input
                                                    v-model="registerForm.password"
                                                    type="password"
                                                    class="grow"
                                                    autocomplete="new-password"
                                                    @keydown.enter="register"
                                                    :placeholder="$t('setting.password')"
                                                />
                                            </label>
                                            <LocalQQ
                                                @select="
                                                    (qq) => {
                                                        registerForm.email = `${qq.uin}@qq.com`
                                                        registerForm.qq = String(qq.uin)
                                                        registerForm.name = qq.nickname
                                                    }
                                                "
                                            />
                                        </div>
                                    </template>
                                </Dialog>
                            </div>
                        </div>
                    </div>
                    <div class="form-control" v-if="user.id ? user.isGuest : true">
                        <div class="label flex-wrap">
                            <span class="grow label-text">
                                {{ $t("setting.guest") }}
                                <div class="text-xs text-base-content/50">{{ $t("setting.guestTip") }}</div>
                            </span>
                            <div class="grow flex justify-betwe en gap-2 min-w-56" v-if="user.id">
                                <div class="label grow text-sm">{{ user.email }}</div>
                                <div class="btn btn-sm grow" @click="user.logout(), reloadMe({ requestPolicy: 'network-only' })">
                                    {{ $t("setting.logout") }}
                                </div>
                            </div>
                            <div class="flex justify-between gap-2 min-w-56" v-else>
                                <Dialog
                                    class="btn btn-sm grow"
                                    :title="$t('login.guestLogin')"
                                    :description="$t('login.guestLoginTip')"
                                    @submit="guest"
                                    @close="reset(guestForm)"
                                    v-model="guestForm.open"
                                    :error="guestForm.error"
                                >
                                    {{ $t("login.guestLogin") }}
                                    <template #content>
                                        <div class="form-control space-y-4">
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:user" class="w-4 h-4 opacity-70" />
                                                <input
                                                    v-model="guestForm.name"
                                                    type="text"
                                                    class="grow"
                                                    :placeholder="$t('setting.nickname')"
                                                />
                                            </label>
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:qq" class="w-4 h-4 opacity-70" />
                                                <input v-model="guestForm.qq" type="text" class="grow" :placeholder="$t('user.qq')" />
                                            </label>
                                            <LocalQQ
                                                @select="
                                                    (qq) => {
                                                        guestForm.qq = String(qq.uin)
                                                        guestForm.name = qq.nickname
                                                    }
                                                "
                                            />
                                        </div>
                                    </template>
                                </Dialog>
                            </div>
                        </div>
                    </div>
                    <div class="form-control" v-if="user.id ? !user.isGuest : false">
                        <label class="label flex-wrap">
                            <span class="grow label-text">
                                {{ $t("setting.password") }}
                            </span>
                            <div class="grow flex justify-between gap-2 min-w-56">
                                <Dialog
                                    class="btn btn-sm grow"
                                    :title="$t('login.updatePassword')"
                                    @submit="updatePassword()"
                                    @close="reset(updatePasswordForm)"
                                    v-model="updatePasswordForm.open"
                                    :error="updatePasswordForm.error"
                                >
                                    {{ $t("login.updatePassword") }}
                                    <template #content>
                                        <div class="form-control space-y-4">
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:envelope" class="w-4 h-4 opacity-70" />
                                                <input
                                                    v-model="updatePasswordForm.old_password"
                                                    type="password"
                                                    autocomplete="current-password"
                                                    class="grow"
                                                    :placeholder="$t('setting.old_password')"
                                                />
                                            </label>
                                            <label class="input input-bordered flex items-center gap-2">
                                                <Icon icon="fa6:user" class="w-4 h-4 opacity-70" />
                                                <input
                                                    v-model="updatePasswordForm.new_password"
                                                    type="password"
                                                    autocomplete="new-password"
                                                    class="grow"
                                                    :placeholder="$t('setting.new_password')"
                                                />
                                            </label>
                                        </div>
                                    </template>
                                </Dialog>
                            </div>
                        </label>
                    </div>
                </div>
            </article>
        </div>
    </div>
</template>
