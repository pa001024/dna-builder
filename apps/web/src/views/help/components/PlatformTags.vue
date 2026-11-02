<script setup lang="ts">
import { useHelpText } from "../content/locale"
import { L, type PlatformTag } from "../content/types"

defineProps<{ platforms: PlatformTag[]; compact?: boolean }>()
const tr = useHelpText()

const META: Record<PlatformTag, { icon: "ri:compass-3-line" | "ri:windows-fill" | "ri:login-box-line" | "ri:user-line"; label: ReturnType<typeof L> }> = {
    web: { icon: "ri:compass-3-line", label: L("网页端", "網頁端", "Web", "Web", "웹", "Web") },
    app: { icon: "ri:windows-fill", label: L("桌面端", "桌面端", "Desktop", "デスクトップ", "데스크톱", "Bureau") },
    login: { icon: "ri:login-box-line", label: L("需社区登录", "需社群登入", "Community login", "要ログイン", "커뮤니티 로그인", "Connexion requise") },
    dna: { icon: "ri:user-line", label: L("需皎皎角", "需皎皎角", "Jiaojiao account", "皎皎角が必要", "교교각 필요", "Compte Jiaojiao") },
}
</script>

<template>
    <div class="flex flex-wrap items-center gap-1">
        <span
            v-for="platform in platforms"
            :key="platform"
            class="inline-flex items-center gap-1 rounded-xs border border-base-content/12 bg-base-content/4 px-1.5 py-0.5 text-[10px] text-base-content/55"
            :class="{ 'px-1!': compact }"
        >
            <Icon :icon="META[platform].icon" class="size-3" />
            <span v-if="!compact">{{ tr(META[platform].label) }}</span>
        </span>
    </div>
</template>
