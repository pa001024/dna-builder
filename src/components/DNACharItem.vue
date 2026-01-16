<script setup lang="ts">
import { DNARoleCharsBean } from "dna-api"
import { useUIStore } from "../store/ui"

defineProps<{
    char: DNARoleCharsBean
}>()

const ui = useUIStore()
const getAuraClass = (element: string) => {
    element = element.split(".").at(-2)!.split("/").at(-1)!
    switch (element) {
        case "4":
            return "aura-pulse-red"
        case "5":
            return "aura-pulse-purple"
        case "3":
            return "aura-pulse-blue"
        case "6":
            return "aura-pulse-green"
        case "2":
            return "aura-pulse-yellow"
        case "1":
            return "aura-pulse-dark"
        default:
            return ""
    }
}
</script>
<template>
    <div
        class="card"
        :class="{ 'opacity-60': !char.unLocked, 'cursor-pointer hover-3d': char.unLocked }"
        @click="char.unLocked ? $router.push(`/dna/char/${char.charId}/${char.charEid}`) : ui.showErrorMessage('角色未解锁')"
    >
        <div class="card-body bg-linear-30 from-indigo-300/50 to-indigo-600/50 rounded-2xl relative p-2">
            <div
                class="absolute inset-0 pointer-events-none mask-b-from-60%"
                :style="{
                    backgroundImage: `url(${char.icon})`,
                    backgroundSize: 'cover',
                }"
            ></div>
            <div class="absolute size-8 left-0" :class="[getAuraClass(char.elementIcon)]">
                <span class="aura-pulse-aura"></span>
                <img :src="char.elementIcon" alt="icon" class="z-2 w-full h-full object-contain" />
            </div>
            <div v-if="char.unLocked" class="absolute p-1 px-2 rounded-lg right-1" :class="[getAuraClass(char.elementIcon)]">
                <span class="aura-pulse-aura"></span>
                <span class="font-bold text-lg text-white aura-pulse-text">
                    {{ ["{}", "I", "II", "III", "IV", "V", "VI"][char.gradeLevel] }}</span
                >
            </div>
            <div class="flex flex-col items-center z-1 text-white text-shadow-md text-shadow-black/30">
                <div class="avatar mb-2">
                    <div class="h-32"></div>
                </div>
                <h4 class="font-medium text-center">
                    {{ char.name }}
                </h4>
                <div v-if="char.unLocked" class="text-xs">Lv. {{ char.level }}</div>
                <div v-else class="text-xs text-error">未解锁</div>
            </div>
        </div>
    </div>
</template>

<style lang="less">
.aura-pulse-red {
    --aura-color: #f43f5e;
}
.aura-pulse-purple {
    --aura-color: #c084fc;
}
.aura-pulse-blue {
    --aura-color: #81d4fa;
}
.aura-pulse-green {
    --aura-color: #84cc16;
}
.aura-pulse-yellow {
    --aura-color: #facc15;
}
.aura-pulse-dark {
    --aura-color: #374151;
}
.aura-pulse-aura {
    @size: 4px;
    position: absolute;
    top: -@size;
    left: -@size;
    right: -@size;
    bottom: -@size;
    border-radius: 50%;
    background: radial-gradient(
        circle,
        color-mix(in srgb, var(--aura-color), white 35%) 0%,
        color-mix(in srgb, var(--aura-color), white 25%) 30%,
        color-mix(in srgb, var(--aura-color), black 40%) 50%,
        transparent 20%
    );
    filter: blur(@size);
    opacity: 0.3;
    animation: aura-pulse 2.5s ease-in-out infinite;
}
.aura-pulse-text {
    position: relative;
    z-index: 2;
    text-shadow:
        0 0 5px color-mix(in srgb, var(--aura-color), white 25%),
        0 0 10px color-mix(in srgb, var(--aura-color), white 25%),
        0 0 20px var(--aura-color),
        0 0 40px color-mix(in srgb, var(--aura-color), black 40%);
    /* 绑定文字脉冲动画 */
    animation: text-pulse 2.5s ease-in-out infinite;
    font-family: serif;
}
@keyframes aura-pulse {
    0% {
        transform: scale(0.9);
        opacity: 0.3;
    }
    50% {
        transform: scale(1.1);
        opacity: 0.5;
    }
    100% {
        transform: scale(0.9);
        opacity: 0.3;
    }
}
@keyframes text-pulse {
    0% {
        text-shadow:
            0 0 5px color-mix(in srgb, var(--aura-color), white 25%),
            0 0 10px color-mix(in srgb, var(--aura-color), white 25%),
            0 0 20px var(--aura-color);
    }
    50% {
        text-shadow:
            0 0 10px color-mix(in srgb, var(--aura-color), white 25%),
            0 0 20px var(--aura-color),
            0 0 40px color-mix(in srgb, var(--aura-color), black 40%),
            0 0 80px color-mix(in srgb, var(--aura-color), black 50%),
            0 0 100px color-mix(in srgb, var(--aura-color), black 60%);
    }
    100% {
        text-shadow:
            0 0 5px color-mix(in srgb, var(--aura-color), white 25%),
            0 0 10px color-mix(in srgb, var(--aura-color), white 25%),
            0 0 20px var(--aura-color);
    }
}
</style>
