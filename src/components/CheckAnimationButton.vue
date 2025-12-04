<script lang="ts" setup>
import gsap from "gsap"
import type { IconTypes } from "./Icon.vue"
const props = defineProps<{ icon: IconTypes; noanimate?: boolean }>()
async function check_animation(el: any) {
    await gsap.fromTo(
        el,
        { "--v": "0%" },
        {
            duration: 0.3,
            ease: "power2.out",
            "--v": "-100%",
        }
    )
    gsap.to(el, { delay: 2, duration: 0.3, ease: "power2.in", "--v": "100%" })
}
async function handler(e: MouseEvent) {
    // if (props.click) await props.click()
    emit("click", e)
    if (!props.noanimate) check_animation(e.target)
}

const emit = defineEmits(["click"])
</script>

<template>
    <button class="btn btn-sm btn-ghost btn-square text-xl hover:text-primary" @click="handler" style="--v: 100%">
        <Icon class="pointer-events-none" style="mask: linear-gradient(to right, #000 var(--v), transparent var(--v))" :icon="icon" />
        <Icon
            class="pointer-events-none absolute text-success"
            style="opacity: calc(100% - var(--v)); mask: linear-gradient(to left, transparent calc(var(--v) + 100%), #000 calc(var(--v) + 100%))"
            icon="la:check-solid"
        />
    </button>
</template>
