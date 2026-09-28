<script setup lang="ts">
import { computed } from "vue"
import { useAuthStore } from "@/store/auth"
import { useUserStore } from "@/store/user"

const props = withDefaults(
    defineProps<{
        /** 按钮尺寸。 */
        size?: "xs" | "sm" | "md" | "lg"
        /** 按钮样式变体。 */
        variant?: "primary" | "secondary" | "outline" | "ghost"
        /** 按钮文案，缺省为「登录」。 */
        label?: string
        /** 是否展示前置图标。 */
        icon?: boolean
    }>(),
    { size: "sm", variant: "primary", label: "", icon: true }
)

const user = useUserStore()
const auth = useAuthStore()

/** 是否展示登录入口：已登录后按钮自动隐藏。 */
const visible = computed(() => !user.jwtToken)
</script>

<template>
    <button v-if="visible" type="button" class="btn" :class="[`btn-${props.variant}`, `btn-${props.size}`]" @click="auth.openLogin()">
        <Icon v-if="icon" icon="ri:login-box-line" :class="size === 'xs' ? 'size-3.5' : 'size-4'" />
        {{ label || $t('dob-account.login') }}
    </button>
</template>
