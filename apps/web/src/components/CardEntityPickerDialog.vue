<script setup lang="ts">
import { t } from "i18next"
import { computed } from "vue"
import { charData, LeveledChar, LeveledWeapon, weaponData } from "@/data"

/** 卡片节点的角色 / 武器选择弹窗：弹窗结构与卡片网格参考 TeamEditor */
const props = defineProps<{
    open: boolean
    kind: "char" | "weapon"
    selectedId?: number
}>()

const emit = defineEmits<{
    "update:open": [value: boolean]
    select: [id: number]
}>()

interface EntityOption {
    value: number
    label: string
    group: string
    icon: string
}

const groups = computed(() => {
    const options: EntityOption[] =
        props.kind === "char"
            ? charData.map(char => ({ value: char.id, label: char.名称, group: char.属性, icon: LeveledChar.url(char.icon) }))
            : weaponData.map(weapon => ({
                  value: weapon.id,
                  label: weapon.名称,
                  group: weapon.类型[0] ?? "",
                  icon: LeveledWeapon.url(weapon.icon),
              }))

    const grouped = new Map<string, EntityOption[]>()
    for (const option of options) {
        const list = grouped.get(option.group)
        if (list) list.push(option)
        else grouped.set(option.group, [option])
    }
    return [...grouped].map(([key, items]) => ({
        key,
        label: key ? (props.kind === "char" ? t(`${key}属性`, key) : t(key)) : "",
        options: items,
    }))
})

const title = computed(() => (props.kind === "char" ? "选择角色" : "选择武器"))

function close() {
    emit("update:open", false)
}

/**
 * 选中条目。
 * @param id 角色 / 武器 id
 */
function pick(id: number) {
    emit("select", id)
    close()
}

/**
 * 候选项的选中态样式。
 * @param id 条目 id
 * @returns class 绑定
 */
function pickClass(id: number) {
    return id === props.selectedId
        ? "border-primary bg-primary/10 text-primary"
        : "border-base-content/20 text-base-content/70 hover:border-primary/60 hover:text-primary"
}
</script>

<template>
    <Teleport v-if="open" to="body">
        <dialog class="modal" :class="{ 'modal-open': open }">
            <div class="modal-box bg-base-300 w-11/12 max-w-3xl">
                <button type="button" class="btn btn-circle btn-ghost btn-sm absolute top-3 right-3" @click="close">
                    <Icon icon="ri:close-line" class="size-4" />
                </button>
                <h3 class="mb-1 text-lg font-bold">{{ title }}</h3>
                <p class="mb-4 text-xs text-base-content/60">点击卡片选择要展示的条目</p>

                <div class="max-h-[70vh] overflow-y-auto pr-1">
                    <div v-for="group in groups" :key="group.key" class="mb-3 last:mb-0">
                        <div v-if="group.label" class="mb-2 text-xs font-semibold text-primary">{{ group.label }}</div>
                        <div class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">
                            <button
                                v-for="option in group.options"
                                :key="option.value"
                                type="button"
                                class="flex flex-col items-center gap-1.5 rounded-xs border px-1.5 py-2 transition-[border-color,color,transform,scale] duration-150 ease-[ease] active:scale-[0.97]"
                                :class="pickClass(option.value)"
                                @click="pick(option.value)"
                            >
                                <span class="grid size-9 place-items-center overflow-hidden border border-base-content/22 bg-base-content/6">
                                    <img
                                        v-if="option.icon"
                                        class="size-full object-cover object-top"
                                        :src="option.icon"
                                        alt=""
                                    />
                                    <Icon
                                        v-else
                                        :icon="kind === 'char' ? 'ri:user-line' : 'ri:sword-line'"
                                        class="size-5 opacity-45"
                                    />
                                </span>
                                <span class="max-w-full truncate text-[11px]">{{ $t(option.label) }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop" @click="close" />
        </dialog>
    </Teleport>
</template>
