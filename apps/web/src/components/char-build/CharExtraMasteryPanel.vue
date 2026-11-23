<script setup lang="ts">
import { computed } from "vue"
import { getTranscendExtraMasteryOptions, LeveledWeapon } from "@/data"

// 额外精通面板：主控与协战共用；只读写调用方传入的值，不直接访问构筑存档

const props = defineProps<{
    /** 该构筑位的角色 id（0 表示未选择） */
    charId: number
    /** 当前额外精通武器类型（空串表示未解锁） */
    value: string
}>()

const emit = defineEmits<{
    (event: "update:value", value: string): void
}>()

const options = computed(() => (props.charId > 0 ? getTranscendExtraMasteryOptions(props.charId) : []))

function toggle(item: string): void {
    emit("update:value", props.value === item ? "" : item)
}
</script>

<template>
    <div
        data-char-tab-panel="extra-mastery"
        :data-char-id="charId"
        class="rounded-xs border border-base-content/10 bg-base-100/70 p-3 shadow-sm backdrop-blur-sm space-y-3"
    >
        <SectionHeader :title="$t('UI_Armory_ExtraExcelWeponTitle')" no-animate compact>
            <template #trailing>
                <button
                    v-if="value"
                    type="button"
                    class="btn btn-ghost btn-xs"
                    :title="$t('char-build.extra_mastery_clear')"
                    data-extra-mastery-clear
                    @click="emit('update:value', '')"
                >
                    <Icon icon="ri:delete-bin-line" class="size-4" />
                </button>
            </template>
        </SectionHeader>
        <p class="text-xs text-base-content/55">{{ $t("char-build.extra_mastery_desc") }}</p>
        <div v-if="options.length" class="grid grid-cols-4 gap-2">
            <button
                v-for="item in options"
                :key="item"
                type="button"
                class="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xs border p-2.5 transition-colors duration-150 active:scale-[0.97]"
                :class="
                    value === item
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-base-content/20 text-base-content/70 hover:border-primary/60 hover:text-primary'
                "
                :data-extra-mastery-option="item"
                @click="toggle(item)"
            >
                <div class="size-9 shrink-0 bg-current" :style="{ mask: `url(${LeveledWeapon.typeUrl(item)}) no-repeat center/contain` }" />
                <span class="text-xs">{{ $t(item) }}</span>
            </button>
        </div>
        <p v-else class="rounded-xs border border-dashed border-base-content/15 px-3 py-2.5 text-xs text-base-content/50">
            {{ charId > 0 ? $t("transcend-build.extra_mastery_none") : $t("char-build.select_character") }}
        </p>
    </div>
</template>
