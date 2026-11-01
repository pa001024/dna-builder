<script setup lang="ts">
import { t } from "i18next"
import { computed, ref, watch } from "vue"
import { LeveledWeaponHelper, weaponMap } from "@/data"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { getNodePorts } from "@/utils/nodeEditorPorts"
import BaseNode from "./BaseNode.vue"
import NodePortRow from "./NodePortRow.vue"
import NumberRowInput from "./NumberRowInput.vue"

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

/** 数值参数端口是否已有连线：连线后手动输入框禁用，取值由上游决定 */
function isDriven(handleId: string) {
    return store.edges.some(edge => edge.target === props.id && edge.targetHandle === handleId)
}

const ports = computed(() => getNodePorts(props.type, props.data))
const paramPorts = computed(() => ports.value.inputs)
const outputPort = computed(() => ports.value.outputs[0])

/** 精炼等级来自行输入组件，写回本地状态后提交节点 */
function setRefineLevel(value: number) {
    refineLevel.value = value
    commit()
}

/** 武器等级来自行输入组件，写回本地状态后提交节点 */
function setWeaponLevel(value: number) {
    weaponLevel.value = value
    commit()
}

function commit() {
    // 数字输入框清空时恢复默认值，避免把空串写进节点数据
    if (!Number.isFinite(refineLevel.value)) refineLevel.value = 5
    if (!Number.isFinite(weaponLevel.value)) weaponLevel.value = 80
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
        <template #ports>
            <!-- 展开时参数端口跟随各行，收起时回到端口区，保证收起后仍可接线 -->
            <NodePortRow :output="outputPort" />
            <template v-if="data.isCollapsed">
                <NodePortRow v-for="port in paramPorts" :key="port.id" :input="port" />
            </template>
        </template>
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

            <NumberRowInput
                :model-value="refineLevel"
                :label="$t(labels.refine)"
                handle-id="refine"
                :min="0"
                :max="5"
                :precision="0"
                :disabled="isDriven('refine')"
                :hint="isDriven('refine') ? '连线' : undefined"
                @update:model-value="setRefineLevel"
            />
            <NumberRowInput
                :model-value="weaponLevel"
                :label="$t(labels.level)"
                handle-id="level"
                :min="1"
                :max="90"
                :precision="0"
                :disabled="isDriven('level')"
                :hint="isDriven('level') ? '连线' : undefined"
                @update:model-value="setWeaponLevel"
            />
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
