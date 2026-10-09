<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import weaponData from "@/data/d/weapon.data"

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
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBWeaponDetailItem :weapon="weapon" />
        </div>
    </ScrollArea>
</template>
