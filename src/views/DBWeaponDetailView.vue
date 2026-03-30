<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import weaponData from "../data/d/weapon.data"

const route = useRoute()

const weapon = computed(() => {
    const id = Number(route.params.id)
    const foundWeapon = weaponData.find(w => w.id === id)
    if (!foundWeapon) {
        throw new Error(`Weapon with id ${id} not found`)
    }
    return foundWeapon
})
</script>

<template>
    <ScrollArea class="h-full flex flex-col">
        <DBWeaponDetailItem :weapon="weapon" class="flex-1" />
    </ScrollArea>
</template>
