<script setup lang="ts">
import { AIClient } from "../api/openai"
import { useSettingStore } from "../store/setting"

const setting = useSettingStore()

const client = new AIClient({
    api_key: setting.aiApiKey,
    base_url: setting.aiBaseUrl,
    default_temperature: setting.aiTemperature,
    default_max_tokens: setting.aiMaxTokens,
    default_model: setting.aiModelName,
})
</script>
<template>
    <div class="flex flex-col items-center justify-center">
        <h1 class="text-3xl font-bold mb-4">AIAgent</h1>
    </div>
</template>
