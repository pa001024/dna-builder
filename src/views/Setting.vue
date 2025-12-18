<script lang="ts" setup>
import { watch } from "vue"
import { MATERIALS } from "../api/app"
import { useSettingStore } from "../store/setting"
import { env } from "../env"
import { i18nLanguages } from "../i18n"
import { db } from "../store/db"

const setting = useSettingStore()
const lightThemes = [
    "light",
    "lofi",
    "cupcake",
    "retro",
    "valentine",
    "garden",
    "aqua",
    "pastel",
    "wireframe",
    "winter",
    "cyberpunk",
    "corporate",
    "bumblebee",
    "emerald",
    "fantasy",
    "cmyk",
    "autumn",
    "acid",
    "lemonade",
]
const darkThemes = [
    "dark",
    "black",
    "curses",
    "matrix",
    "staffy",
    "synthwave",
    "halloween",
    "forest",
    "dracula",
    "business",
    "night",
    "coffee",
    //
]

watch(
    () => setting.winMaterial,
    (v) => setting.setWinMaterial(v),
)

// 首字母大写
function capitalize(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

function resetStorage() {
    localStorage.clear()
    db.delete()
    // 清除所有Service Worker
    clearServiceWorkers()
}

function openResetConfirmDialog() {
    const dialog = document.getElementById("reset-confirm-dialog")! as HTMLDialogElement
    dialog.show()
}

/**
 * 清除当前注册的所有Service Worker
 */
async function clearServiceWorkers(): Promise<void> {
    // 检查浏览器是否支持Service Worker
    if ("serviceWorker" in navigator) {
        try {
            // 获取所有注册的Service Worker
            const registrations = await navigator.serviceWorker.getRegistrations()

            // 取消注册所有Service Worker
            for (const registration of registrations) {
                await registration.unregister()
                console.log("Service Worker 已取消注册:", registration.scope)
            }

            // 清除所有缓存
            if ("caches" in window) {
                const cacheNames = await caches.keys()
                for (const cacheName of cacheNames) {
                    await caches.delete(cacheName)
                    console.log("缓存已清除:", cacheName)
                }
            }

            console.log("所有Service Worker和缓存已清除")
        } catch (error) {
            console.error("清除Service Worker失败:", error)
            throw error
        }
    } else {
        console.log("当前浏览器不支持Service Worker")
    }
}
</script>

<template>
    <div class="w-full h-full overflow-y-auto">
        <div class="p-4 flex flex-col gap-4 max-w-xl m-auto">
            <article>
                <h2 class="text-sm font-bold m-2">{{ $t("setting.appearance") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">{{ $t("setting.theme") }}</span>
                        <Select
                            class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-40"
                            v-model="setting.theme"
                            :placeholder="$t('setting.theme')"
                        >
                            <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                {{ $t("setting.lightTheme") }}
                            </SelectLabel>
                            <SelectGroup>
                                <SelectItem v-for="th in lightThemes" :key="th" :value="th">
                                    {{ capitalize(th) }}
                                </SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                {{ $t("setting.darkTheme") }}
                            </SelectLabel>
                            <SelectGroup>
                                <SelectItem v-for="th in darkThemes" :key="th" :value="th">
                                    {{ capitalize(th) }}
                                </SelectItem>
                            </SelectGroup>
                        </Select>
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">
                            {{ $t("setting.windowTrasnparent") }}
                            <div class="text-xs text-base-content/50">{{ $t("setting.windowTrasnparentTip") }}</div>
                        </span>
                        <input v-model="setting.windowTrasnparent" type="checkbox" class="toggle toggle-secondary" />
                    </div>
                    <div v-if="env.isApp" class="flex justify-between items-center p-2">
                        <span class="label-text">
                            {{ $t("setting.winMaterial") }}
                        </span>

                        <Select
                            class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-40"
                            v-model="setting.winMaterial"
                            :placeholder="$t('setting.winMaterial')"
                        >
                            <SelectItem v-for="th in MATERIALS" :key="th" :value="th">
                                {{ th }}
                            </SelectItem>
                        </Select>
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">
                            {{ $t("setting.lang") }}
                        </span>

                        <Select
                            class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-40"
                            :model-value="$i18next.language"
                            @update:model-value="$i18next.changeLanguage($event)"
                            :placeholder="$t('setting.lang')"
                        >
                            <SelectItem v-for="lang in i18nLanguages" :key="lang.code" :value="lang.code">
                                {{ lang.name }}
                            </SelectItem>
                        </Select>
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">{{ $t("setting.uiScale") }}</span>
                        <div class="min-w-56">
                            <input
                                :value="setting.uiScale"
                                @input="setting.uiScale = +($event.target as HTMLInputElement)!.value"
                                type="range"
                                class="range range-secondary"
                                min="0.8"
                                max="1.5"
                                step="0.1"
                            />
                            <div class="w-full flex justify-between text-xs px-1">
                                <span
                                    :class="{ 'text-secondary': setting.uiScale.toFixed(1) === (0.7 + i / 10).toFixed(1) }"
                                    v-for="i in 8"
                                    :key="i"
                                    >{{ (0.7 + i / 10).toFixed(1) }}</span
                                >
                            </div>
                        </div>
                    </div>
                </div>
            </article>

            <article>
                <h2 class="text-sm font-bold m-2">{{ $t("setting.other") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">
                            {{ $t("setting.reset") }}
                            <div class="text-xs text-base-content/50">{{ $t("setting.resetTip") }}</div>
                        </span>

                        <div class="btn btn-secondary w-40" @click="openResetConfirmDialog">{{ $t("setting.confirm") }}</div>
                    </div>
                </div>
            </article>
        </div>
        <dialog id="reset-confirm-dialog" class="modal">
            <div class="modal-box bg-base-300">
                <p class="text-lg font-bold">{{ $t("setting.resetConfirm") }}</p>
                <div class="modal-action">
                    <form class="flex justify-end gap-2" method="dialog">
                        <button class="min-w-20 btn btn-secondary" @click="resetStorage">{{ $t("setting.confirm") }}</button>
                        <button class="min-w-20 btn">{{ $t("setting.cancel") }}</button>
                    </form>
                </div>
            </div>
        </dialog>
    </div>
</template>
