<script lang="ts" setup>
import { useImage } from "@vueuse/core"
import { computed } from "vue"

const props = defineProps<{
    qq: string | number | undefined | null
    name: string
}>()

const avatar = computed(() => ({
    src: props.qq ? `//q2.qlogo.cn/headimg_dl?dst_uin=${props.qq}&spec=100` : "/imgs/webp/T_GameReview_JiaoJiao.webp",
}))

const { isReady } = useImage(avatar)
</script>

<template>
    <div class="avatar" :class="{ placeholder: !isReady }">
        <div class="rounded-full" :class="{ 'bg-base-300 text-sm': !isReady }">
            <img v-if="isReady && qq" :src="avatar.src" :alt="name" />
            <span v-else>{{ name && name.slice(0, 2) }}</span>
        </div>
    </div>
</template>
