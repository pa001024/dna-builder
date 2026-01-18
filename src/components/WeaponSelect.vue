<script setup lang="ts" generic="T extends 'id' | '名称'">
import { groupBy } from "lodash-es"
import { LeveledWeapon, weaponData } from "@/data"

const props = defineProps<{
    mainKey?: T
}>()
const weaponOptions = weaponData.map(weapon => ({
    value: weapon[props.mainKey || "名称"],
    label: weapon.名称,
    elm: weapon.类型[1],
    icon: LeveledWeapon.url(weapon.icon),
}))

const model = defineModel<T extends "id" ? number : string>()
</script>
<template>
    <Select v-model="model" class="w-40 inline-flex justify-between input input-bordered input-sm">
        <template v-for="weaponWithElm in groupBy(weaponOptions, 'elm')" :key="weaponWithElm[0].elm">
            <SelectLabel class="p-2 text-sm font-semibold text-primary">
                {{ $t(weaponWithElm[0].elm) }}
            </SelectLabel>
            <SelectGroup>
                <SelectItem v-for="weapon in weaponWithElm" :key="weapon.value" :value="weapon.value">
                    <div class="flex items-center gap-2">
                        <ImageFallback :src="weapon.icon" alt="武器头像" class="size-6 rounded-full inline-block">
                            <img src="/imgs/webp/T_Head_Empty.webp" alt="武器头像" class="size-6 rounded-full inline-block" />
                        </ImageFallback>
                        {{ $t(weapon.label) }}
                    </div>
                </SelectItem>
            </SelectGroup>
        </template>
    </Select>
</template>
