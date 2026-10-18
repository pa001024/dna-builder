<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { LeveledWeaponHelper } from "@/data/leveled/LeveledHelpers"
import {
    type AbyssMissingWeaponSlot,
    type AbyssUploadOverrides,
    type AbyssWeaponSlotId,
    buildAbyssCalamityOverrides,
} from "@/utils/abyss-upload"

const props = defineProps<{
    slots: AbyssMissingWeaponSlot[]
}>()

const emit = defineEmits<{
    confirm: [overrides: AbyssUploadOverrides]
    cancel: []
}>()

const { t } = useTranslation()

const selected = ref<Partial<Record<AbyssWeaponSlotId, number>>>({})

watch(
    () => props.slots,
    slots => {
        const next: Partial<Record<AbyssWeaponSlotId, number>> = {}
        for (const slot of slots) {
            next[slot.slot] = slot.options[0]?.weaponId
        }
        selected.value = next
    },
    { immediate: true }
)

const open = computed(() => props.slots.length > 0)
const canConfirm = computed(() => props.slots.every(slot => (selected.value[slot.slot] ?? 0) > 0))

const SLOT_LABEL_KEYS: Record<AbyssWeaponSlotId, string> = {
    melee: "abyss-usage.meleeWeapon",
    ranged: "abyss-usage.rangedWeapon",
    support1: "abyss-usage.support1",
    support2: "abyss-usage.support2",
}

function isSupportSlot(slot: AbyssWeaponSlotId) {
    return slot === "support1" || slot === "support2"
}

function slotLabel(slot: AbyssWeaponSlotId) {
    const label = t(SLOT_LABEL_KEYS[slot])
    return isSupportSlot(slot) ? label : `${t("abyss-usage.slotMain")} · ${label}`
}

function optionTypeLabel(option: AbyssMissingWeaponSlot["options"][number]) {
    return t(option.weaponType === "melee" ? "abyss-usage.calamityTypeMelee" : "abyss-usage.calamityTypeRanged")
}

function confirm() {
    if (!canConfirm.value) {
        return
    }
    emit("confirm", buildAbyssCalamityOverrides(selected.value))
}
</script>

<template>
    <Teleport to="body">
        <dialog class="modal" :class="{ 'modal-open': open }">
            <div
                v-if="open"
                class="modal-box w-120 max-w-[92vw] rounded-xs border border-base-content/15 bg-base-100/90 p-0 shadow-lg backdrop-blur-md"
            >
                <div class="flex flex-col items-center gap-1 px-5 pt-5">
                    <Icon icon="ri:sword-line" class="size-6 text-primary" />
                    <h3 class="text-sm font-semibold">{{ $t("abyss-usage.calamityTitle") }}</h3>
                    <p class="text-center text-xs leading-relaxed text-base-content/60">
                        {{ $t("abyss-usage.calamityDesc") }}
                    </p>
                </div>

                <div class="space-y-3 px-5 py-4">
                    <div v-for="slot in slots" :key="slot.slot" class="space-y-1.5">
                        <div class="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-base-content/55">
                            <span>{{ slotLabel(slot.slot) }}</span>
                            <span v-if="isSupportSlot(slot.slot)" class="font-normal text-[10px] text-base-content/35">
                                {{ $t("abyss-usage.calamitySupportHint") }}
                            </span>
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="option in slot.options"
                                :key="option.weaponId"
                                type="button"
                                class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs border px-2 py-1 text-xs transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selected[slot.slot] === option.weaponId
                                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selected[slot.slot] = option.weaponId"
                            >
                                <img :src="LeveledWeaponHelper.idToUrl(option.weaponId)" alt="" class="size-5 object-contain" />
                                <span>{{ option.name }}</span>
                                <span
                                    v-if="isSupportSlot(slot.slot)"
                                    class="rounded-xs border border-base-content/25 px-1 text-[10px] font-normal opacity-70"
                                >
                                    {{ optionTypeLabel(option) }}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-end gap-2 border-t border-base-content/10 p-4">
                    <button type="button" class="btn btn-ghost btn-sm" @click="emit('cancel')">
                        {{ $t("abyss-usage.calamityCancel") }}
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" :disabled="!canConfirm" @click="confirm">
                        {{ $t("abyss-usage.calamityConfirm") }}
                    </button>
                </div>
            </div>
            <div class="modal-backdrop" />
        </dialog>
    </Teleport>
</template>
