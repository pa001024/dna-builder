<script setup lang="ts" generic="T extends 'id' | '名称'">
import { groupBy } from "lodash-es"
import { charData, LeveledChar } from "@/data"

const props = defineProps<{
    mainKey?: T
}>()

const charOptions = charData.map(char => ({
    value: char[props.mainKey || "名称"],
    label: char.名称,
    elm: char.属性,
    icon: LeveledChar.url(char.icon),
}))
const model = defineModel<T extends "id" ? number : string>()
</script>
<template>
    <Select v-model="model" class="w-40 inline-flex justify-between input input-bordered input-sm">
        <template v-for="charWithElm in groupBy(charOptions, 'elm')" :key="charWithElm[0].elm">
            <SelectLabel class="p-2 text-sm font-semibold text-primary">
                {{ $t(charWithElm[0].elm) }}
            </SelectLabel>
            <SelectGroup>
                <SelectItem v-for="char in charWithElm" :key="char.value" :value="char.value">
                    <div class="flex items-center gap-2">
                        <ImageFallback :src="char.icon" alt="角色头像" class="size-6 rounded-full inline-block">
                            <img src="/imgs/webp/T_Head_Empty.webp" alt="角色头像" class="size-6 rounded-full inline-block" />
                        </ImageFallback>
                        {{ $t(char.label) }}
                    </div>
                </SelectItem>
            </SelectGroup>
        </template>
    </Select>
</template>
