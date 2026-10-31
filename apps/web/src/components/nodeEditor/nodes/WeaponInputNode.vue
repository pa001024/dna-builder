<script setup lang="ts">
import { t } from "i18next"
import { computed, ref, watch } from "vue"
import { LeveledWeaponHelper, weaponMap } from "@/data"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
    kind: "melee" | "ranged"
}>()

const store = useNodeEditorStore()

const weaponId = ref<number>(props.data.weapon || 0)
const refineLevel = ref<number>(props.data.refine ?? 5)
const weaponLevel = ref<number>(props.data.level || 80)
const weaponDialogShow = ref(false)

watch(
    () => [props.data.weapon, props.data.refine, props.data.level],
    () => {
        weaponId.value = props.data.weapon || 0
        refineLevel.value = props.data.refine ?? 5
        weaponLevel.value = props.data.level || 80
    }
)

const context = computed(() => store.getBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)
const settings = computed(() => context.value?.settings)

const isMelee = computed(() => props.kind === "melee")
const labels = computed(() =>
    isMelee.value
        ? {
              title: "node-editor.meleeWeaponInput.weapon",
              choose: "node-editor.meleeWeaponInput.chooseWeapon",
              refine: "node-editor.meleeWeaponInput.refineLevel",
              level: "node-editor.meleeWeaponInput.weaponLevel",
          }
        : {
              title: "node-editor.rangedWeaponInput.weapon",
              choose: "node-editor.rangedWeaponInput.chooseWeapon",
              refine: "node-editor.rangedWeaponInput.refineLevel",
              level: "node-editor.rangedWeaponInput.weaponLevel",
          }
)

const weapon = computed(() => weaponMap.get(weaponId.value))
const weaponName = computed(() => weapon.value?.名称 || "")
const weaponIcon = computed(() => (weapon.value ? LeveledWeaponHelper.idToUrl(weapon.value.id) : ""))
const weaponMeta = computed(() => {
    const item = weapon.value
    if (!item) return ""
    return [t(item.类型[0]), t(item.伤害类型)].filter(Boolean).join(" · ")
})
const meleeWeapon = computed(() => (isMelee.value ? weaponId.value : (settings.value?.meleeWeapon ?? 0)))
const rangedWeapon = computed(() => (isMelee.value ? (settings.value?.rangedWeapon ?? 0) : weaponId.value))

function commit() {
    store.updateNodeData(props.id, {
        weapon: weaponId.value,
        refine: refineLevel.value,
        level: weaponLevel.value,
    })
}

/**
 * 武器列表选择：只提交当前节点对应的槽位，另一槽位由各自节点维护。
 * @param melee 近战武器 id
 * @param ranged 远程武器 id
 */
function handleWeaponSelection(melee: number, ranged: number) {
    weaponId.value = isMelee.value ? melee : ranged
    weaponDialogShow.value = false
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-70 max-w-full space-y-1.5">
            <!-- 武器名片：图像区 + 名称/类型层级，点击打开武器选择 -->
            <button
                type="button"
                class="nodrag flex w-full min-w-0 items-stretch gap-2 border border-base-content/10 bg-base-100/60 p-1.5 text-left transition-colors duration-150 hover:border-primary/40"
                @click="weaponDialogShow = true"
            >
                <div class="relative h-14 w-14 shrink-0 overflow-hidden bg-base-content/4">
                    <img
                        v-if="weaponIcon"
                        :src="weaponIcon"
                        :alt="weaponName"
                        class="absolute inset-0 h-full w-full object-cover"
                    />
                    <div v-else class="grid h-full place-items-center text-base-content/25">
                        <Icon :icon="isMelee ? 'ri:sword-line' : 'ri:crosshair-line'" class="size-5" />
                    </div>
                    <span class="absolute left-0 top-0 bg-base-content px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-base-100">
                        WEAPON
                    </span>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-[13px] font-semibold" :class="weaponName ? 'text-base-content' : 'text-base-content/40'">
                        {{ weaponName ? $t(weaponName) : $t(labels.choose) }}
                    </div>
                    <div class="mt-1 truncate text-[10px] text-base-content/45">{{ weaponMeta || "—" }}</div>
                    <div class="mt-1 flex items-center gap-2 text-[10px] text-base-content/45">
                        <span>精炼 {{ refineLevel }}</span>
                        <span>Lv. {{ weaponLevel }}</span>
                    </div>
                </div>
                <Icon icon="radix-icons:chevron-right" class="mt-1 size-3.5 shrink-0 text-base-content/30" />
            </button>

            <div class="grid grid-cols-2 gap-2">
                <label class="block min-w-0">
                    <span class="mb-0.5 block text-[10px] text-base-content/45">{{ $t(labels.refine) }}</span>
                    <Select
                        v-model="refineLevel"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                        @change="commit"
                    >
                        <SelectItem v-for="lv in [0, 1, 2, 3, 4, 5]" :key="lv" :value="lv">{{ lv }}</SelectItem>
                    </Select>
                </label>
                <label class="block min-w-0">
                    <span class="mb-0.5 block text-[10px] text-base-content/45">{{ $t(labels.level) }}</span>
                    <input
                        v-model.number="weaponLevel"
                        type="number"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 font-mono text-[12px] tabular-nums text-base-content outline-none transition-colors duration-150 focus:border-primary"
                        placeholder="80"
                        min="1"
                        max="90"
                        @change="commit"
                    />
                </label>
            </div>
        </div>

        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': weaponDialogShow }">
                <div class="modal-box bg-base-300 w-11/12 max-w-6xl p-0">
                    <WeaponListView
                        v-if="weaponDialogShow"
                        :char-build="charBuild"
                        :default-tab="isMelee ? '近战' : '远程'"
                        :melee="meleeWeapon"
                        :ranged="rangedWeapon"
                        :use-global="settings?.useGlobal ?? true"
                        :char-settings="settings"
                        @change="handleWeaponSelection"
                    />
                    <div class="modal-action">
                        <button class="btn" @click="weaponDialogShow = false">{{ $t("common.close") }}</button>
                    </div>
                </div>
                <div class="modal-backdrop" @click="weaponDialogShow = false" />
            </dialog>
        </Teleport>
    </BaseNode>
</template>
