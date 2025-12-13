<script setup lang="ts">
interface Option {
    label: string // 选项名
    value: any // 选项值
    disabled?: boolean // 是否禁用选项
}
interface Props {
    options?: Option[] // 复选元素数据
    disabled?: boolean // 是否禁用所有复选框
    checked?: boolean // (v-model) 是否全选
}
withDefaults(defineProps<Props>(), {
    options: () => [],
    disabled: false,
    checked: false,
})
const model = defineModel()
</script>
<template>
    <div class="flex gap-2 flex-wrap">
        <label
            v-for="(option, index) in options"
            :key="index"
            class="inline-flex gap-2 items-center cursor-pointer text-sm"
            :disabled="disabled || option.disabled"
        >
            <input v-model="model" :value="option.value" type="checkbox" class="checkbox checkbox-secondary checkbox-sm" />
            <span>{{ option.label }}</span>
        </label>
    </div>
</template>
