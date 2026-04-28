<script setup lang="ts">
import forge from "node-forge"
import { onBeforeUnmount, onMounted } from "vue"
import { useRouter } from "vue-router"
import { useSettingStore } from "@/store/setting"
import { sha256 } from "@/utils/sha256"
import type { IconTypes } from "../components/Icon.vue"
import { env } from "../env"

const setting = useSettingStore()
const router = useRouter()
const items = [
    {
        name: "char-build",
        path: "/char",
        icon: "ri:hammer-line",
    },
    {
        name: "guides",
        path: "/guides",
        icon: "ri:book-line",
    },
    {
        name: "counter",
        path: "/counter",
        icon: "plus_one",
    },
    {
        name: "build-compare",
        path: "/char-build-compare",
        icon: "ri:table-view",
    },
    {
        name: "dna-home",
        path: "/dna",
        icon: "ri:chat-thread-line",
    },
    {
        name: "database",
        path: "/db",
        icon: "ri:book-line",
    },
    {
        name: "levelup",
        path: "/levelup",
        icon: "ri:calculator-line",
    },
    {
        name: "achievement",
        path: "/achievement",
        icon: "ri:trophy-line",
    },
    {
        name: "abyss-usage",
        path: "/abyss-usage",
        icon: "ri:bar-chart-line",
    },
    {
        name: "setting",
        path: "/setting",
        icon: "ri:settings-3-line",
    },
    {
        name: "game-launcher",
        path: "/game-launcher",
        icon: "ri:rocket-2-line",
    },
    {
        name: "chat",
        path: "/chat",
        icon: "ri:chat-3-line",
    },
    {
        name: "flow",
        path: "/flow",
        icon: "ri:node-tree",
    },
    {
        name: "inventory",
        path: "/inventory",
        icon: "ri:box-1-line",
    },
    {
        name: "timeline",
        path: "/timeline",
        icon: "ri:timeline-view",
    },
    {
        name: "help",
        path: "/help",
        icon: "ri:question-line",
    },
    {
        name: "game-accounts",
        path: "/game-accounts",
        icon: "ri:user-line",
        show: env.isApp,
    },
    {
        name: "unpack",
        path: "/unpack",
        icon: "ri:file-zip-line",
        show: env.isApp && !setting.safeMode,
    },
] satisfies { name: string; path: string; icon: IconTypes; show?: boolean }[]
// 卡片进入动画延迟
const getAnimationDelay = (index: number) => {
    return Math.min(index * 50, 500) // 最多延迟500ms
}

let hh: string[] = []

/**
 * 计算字符串的 SHA1。
 * @param input 输入字符串。
 * @returns 十六进制摘要。
 */
const sha1 = (input: string) => {
    const md = forge.md.sha1.create()
    md.update(input, "utf8")
    return md.digest().toHex()
}

/**
 * 生成当前输入序列的校验串。
 * @param history 最近 5 次输入。
 * @param input 当前输入字符。
 * @returns 校验串。
 */
const buildSignature = (history: string[], input: string) => {
    const signature = `${sha1(`0:${history[0] ?? ""}`)}${sha1(`1:${history[1] ?? ""}`)}${sha1(`2:${history[2] ?? ""}`)}${sha1(`3:${history[3] ?? ""}`)}${sha1(`4:${history[4] ?? ""}`)}${sha1(`5:${input}`)}`

    return sha256(signature)
}

const scriptSignature = "c43801e66e06857150b1930ae4a9831af5259aeb7d65ed7d73d83176adabec97"

/**
 * 处理 More 页面全局按键输入。
 * @param event 键盘事件。
 */
const handleKeydown = (event: KeyboardEvent) => {
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) {
        return
    }

    const input = event.key.toLowerCase()
    const history = hh.slice(-5)
    const signature = buildSignature(history, input)

    if (signature === scriptSignature) {
        router.push("/scripts")
        hh = []
        return
    }

    hh = [...history, input].slice(-5)
}

onMounted(() => {
    document.addEventListener("keydown", handleKeydown)
})

onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleKeydown)
})
</script>
<template>
    <ScrollArea class="h-full">
        <div class="flex justify-center items-center">
            <div class="p-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] w-full justify-items-center gap-4 max-w-7xl">
                <div
                    class="hover-3d w-full rounded-lg group"
                    v-for="(item, index) in items.filter(item => item.show !== false)"
                    :key="item.name"
                    :style="{ animation: `fade-in-up 0.5s ease-out ${getAnimationDelay(index)}ms both` }"
                >
                    <RouterLink
                        :to="item.path"
                        class="flex flex-col justify-center items-center p-6 gap-2 bg-base-100/50 hover:bg-base-100 rounded-lg"
                    >
                        <div class="group-hover:text-primary transition-colors duration-300">
                            <Icon :icon="item.icon" class="w-12 h-12" />
                        </div>
                        <div class="text-xl font-bold group-hover:text-primary transition-colors duration-300">
                            {{ $t(`${item.name}.title`) }}
                        </div>
                        <div class="text-sm text-gray-500">
                            {{ $t(`${item.name}.desc`) }}
                        </div>
                    </RouterLink>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
