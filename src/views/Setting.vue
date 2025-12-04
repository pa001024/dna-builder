<script lang="ts" setup>
import { watch } from "vue"
import Select, { SelectGroup, SelectLabel, SelectSeparator, SelectItem } from "../components/select"
import { MATERIALS } from "../api/app"
import { useSettingStore } from "../store/setting"

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
    (v) => setting.setWinMaterial(v)
)

// 首字母大写
function capitalize(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
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
                        <input v-model="setting.windowTrasnparent" type="checkbox" class="toggle toggle-secondary" checked />
                    </div>
                    <div class="flex justify-between items-center p-2">
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
                <h2 class="text-sm font-bold m-2">{{ $t("setting.counter") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">{{ $t("setting.autoCount") }}</span>
                        <input v-model="setting.autoCount" type="checkbox" class="toggle toggle-secondary" checked />
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text"
                            >{{ $t("setting.minCountInterval") }}
                            <div class="text-xs text-base-content/50">{{ $t("setting.minCountIntervalTip") }}</div>
                        </span>
                        <div class="min-w-56">
                            <input
                                :value="setting.minCountInterval"
                                @input="setting.minCountInterval = Math.max(35, Math.min(60, +($event.target as HTMLInputElement)!.value))"
                                type="range"
                                class="range range-secondary"
                                min="35"
                                max="60"
                                step="5"
                            />
                            <div class="w-full flex justify-between text-xs px-2">
                                <span :class="{ 'text-secondary': setting.minCountInterval === 35 }">35</span>
                                <span :class="{ 'text-secondary': setting.minCountInterval === 40 }">40</span>
                                <span :class="{ 'text-secondary': setting.minCountInterval === 45 }">45</span>
                                <span :class="{ 'text-secondary': setting.minCountInterval === 50 }">50</span>
                                <span :class="{ 'text-secondary': setting.minCountInterval === 55 }">55</span>
                                <span :class="{ 'text-secondary': setting.minCountInterval === 60 }">60</span>
                            </div>
                        </div>
                    </div>
                </div>
            </article>
        </div>
    </div>
</template>
