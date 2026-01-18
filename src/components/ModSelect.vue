<script setup lang="ts" generic="T extends 'id'">
import { useTranslation } from "i18next-vue"
import { groupBy } from "lodash-es"
import { LeveledMod, modData } from "@/data"

const { t: translate } = useTranslation()
const modOptions = modData
    .map(mod => ({
        value: mod.id,
        label: LeveledMod.fullName(mod, translate),
        elm: mod.类型,
        icon: LeveledMod.url(mod.icon),
    }))
    .sort((a, b) => b.value - a.value)

const model = defineModel<T extends "id" ? number : string>()
</script>
<template>
    <Select v-model="model" class="w-40 inline-flex justify-between input input-bordered input-sm">
        <template v-for="modWithElm in groupBy(modOptions, 'elm')" :key="modWithElm[0].elm">
            <SelectLabel class="p-2 text-sm font-semibold text-primary">
                {{ $t(modWithElm[0].elm) }}
            </SelectLabel>
            <SelectGroup>
                <SelectItem v-for="mod in modWithElm" :key="mod.value" :value="mod.value">
                    <div class="flex items-center gap-2">
                        <!-- <ImageFallback :src="mod.icon" alt="MOD头像" class="size-6 rounded-full inline-block">
                            <img src="/imgs/webp/T_Head_Empty.webp" alt="MOD头像" class="size-6 rounded-full inline-block" />
                        </ImageFallback> -->
                        {{ $t(mod.label) }}
                    </div>
                </SelectItem>
            </SelectGroup>
        </template>
    </Select>
</template>
