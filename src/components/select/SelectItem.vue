<script setup lang="ts">
import { SelectItem, type SelectItemProps, SelectItemText, SelectItemIndicator } from "radix-vue"
import Icon from "../Icon.vue"

const props = defineProps<Omit<SelectItemProps, "value"> & { value: string | number }>()
</script>

<template>
    <SelectItem
        v-bind="props as any"
        class="px-3 py-2 text-sm flex items-center duration-100 rounded-btn transition-colors cursor-pointer data-[highlighted]:outline-none data-[highlighted]:bg-base-content/10 data-[highlighted]:text-base-content"
    >
        <SelectItemText>
            <slot />
        </SelectItemText>
        <SelectItemIndicator class="absolute left-1 inline-flex items-center justify-center opacity-50">
            <Icon icon="ri:checkbox-circle-fill" />
        </SelectItemIndicator>
    </SelectItem>
</template>
