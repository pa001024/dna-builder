<script lang="ts" setup>
import { useImage } from "@vueuse/core"
import { computed } from "vue"

const props = defineProps<{
    qq: string | number
    name: string
}>()

const src = computed(() => (props.qq ? `//q2.qlogo.cn/headimg_dl?dst_uin=${props.qq}&spec=100` : ""))

const { isReady } = useImage({ src: src.value })
</script>

<template>
    <div class="avatar" :class="{ placeholder: !isReady }">
        <div class="rounded-full" :class="{ 'bg-base-300 text-sm': !isReady }">
            <img v-if="isReady && qq" :src="src" :alt="name" />
            <span v-else>{{ name.slice(0, 2) }}</span>
        </div>
    </div>
</template>
