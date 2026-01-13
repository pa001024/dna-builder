<script setup lang="ts">
import { ref } from "vue"

const open = ref(false)
const eventDateRef = ref(new Date())
const timerRef = ref(0)

function oneWeekAway() {
    const now = new Date()
    const inOneWeek = now.setDate(now.getDate() + 7)
    return new Date(inOneWeek)
}

function prettyDate(date: Date) {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" }).format(date)
}

function handleClick() {
    open.value = false
    window.clearTimeout(timerRef.value)
    timerRef.value = window.setTimeout(() => {
        eventDateRef.value = oneWeekAway()
        open.value = true
    }, 100)
}
</script>

<template>
    <ToastProvider>
        <button
            class="inline-flex items-center justify-center rounded font-medium text-[15px] px-3.75 leading-8.75 h-8.75 bg-white text-grass11 shadow-[0_2px_10px] shadow-blackA7 outline-none hover:bg-mauve3 focus:shadow-[0_0_0_2px] focus:shadow-black"
            @click="handleClick"
        >
            Add to calendar
        </button>

        <ToastRoot
            v-model:open="open"
            class="bg-white rounded-md shadow-[hsl(206_22%_7%/35%)_0px_10px_38px_-10px,hsl(206_22%_7%/20%)_0px_10px_20px_-15px] p-3.75 grid [grid-template-areas:'title_action'_'description_action'] grid-cols-[auto_max-content] gap-x-3.75 items-center data-[state=open]:animate-slideIn data-[state=closed]:animate-hide data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[transform_200ms_ease-out] data-[swipe=end]:animate-swipeOut"
        >
            <ToastTitle class="[grid-area:title] mb-1.25 font-medium text-slate12 text-[15px]"> Scheduled: Catch up </ToastTitle>
            <ToastDescription as-child>
                <time class="[grid-area:description] m-0 text-slate11 text-[13px] leading-[1.3]" :dateTime="eventDateRef.toISOString()">
                    {{ prettyDate(eventDateRef) }}
                </time>
            </ToastDescription>
            <ToastAction class="[grid-area:action]" as-child alt-text="Goto schedule to undo">
                <button
                    class="inline-flex items-center justify-center rounded font-medium text-xs px-2.5 leading-6.25 h-6.25 bg-green2 text-green11 shadow-[inset_0_0_0_1px] shadow-green7 hover:shadow-[inset_0_0_0_1px] hover:shadow-green8 focus:shadow-[0_0_0_2px] focus:shadow-green8"
                >
                    Undo
                </button>
            </ToastAction>
        </ToastRoot>
        <ToastViewport
            class="[--viewport-padding:25px] fixed bottom-0 right-0 flex flex-col p-(--viewport-padding) gap-2.5 w-97.5 max-w-[100vw] m-0 list-none z-2147483647 outline-none"
        />
    </ToastProvider>
</template>
