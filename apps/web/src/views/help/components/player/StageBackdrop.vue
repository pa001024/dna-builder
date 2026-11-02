<script setup lang="ts">
withDefaults(defineProps<{ accent: string; variant?: "grid" | "spotlight" | "plain" }>(), {
    variant: "grid",
})
</script>

<template>
    <div class="help-backdrop" :style="{ '--accent': accent }" aria-hidden="true">
        <div class="help-backdrop__base" />
        <div class="help-backdrop__glow" />
        <div v-if="variant === 'grid'" class="help-backdrop__grid" />
        <div v-if="variant === 'spotlight'" class="help-backdrop__grid" style="opacity: 0.32; height: 52%" />
        <div class="help-backdrop__scan" />
        <div class="help-backdrop__vignette" />
        <div class="help-backdrop__grain" />
    </div>
</template>
