<script lang="ts" setup>
import gsap from "gsap"
import { computed, onMounted, ref } from "vue"

const props = defineProps<{
    progress: number
}>()
const elm = ref<any>(null)
const pg = computed(() => Math.min(100, +(props.progress * 100).toFixed()))

onMounted(() => {
    if (elm.value)
        gsap.fromTo(
            elm.value,
            { "--value": 0 },
            {
                "--value": pg.value,
                duration: 1,
                onUpdate: () => {
                    if (elm.value) elm.value.textContent = ~~gsap.getProperty(elm.value, "--value") + "%"
                },
            }
        )
})
</script>

<template>
    <div ref="elm" class="flex-none radial-progress text-primary bg-base-300" :style="{ '--value': pg }" role="progressbar">{{ pg }}%</div>
</template>
