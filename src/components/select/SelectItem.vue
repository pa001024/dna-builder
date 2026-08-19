<script setup lang="ts">
import { SelectItem, SelectItemIndicator, type SelectItemProps, SelectItemText } from "reka-ui"
import Icon from "../Icon.vue"

const props = defineProps<Omit<SelectItemProps, "value"> & { value: any }>()
</script>

<template>
    <SelectItem
        v-bind="props as any"
        class="relative flex items-center gap-2 px-3 py-2 text-sm rounded-btn transition-colors duration-200 cursor-pointer select-none outline-none data-highlighted:bg-primary/10 data-highlighted:text-primary data-[state=checked]:text-primary data-[state=checked]:font-medium data-[state=checked]:shadow-[inset_2px_0_0_var(--color-primary)] data-disabled:opacity-40 data-disabled:pointer-events-none"
    >
        <SelectItemText class="min-w-0 flex-1 truncate">
            <slot />
        </SelectItemText>
        <SelectItemIndicator class="flex-none text-primary/70">
            <Icon icon="ri:checkbox-circle-fill" class="size-4" />
        </SelectItemIndicator>
    </SelectItem>
</template>
