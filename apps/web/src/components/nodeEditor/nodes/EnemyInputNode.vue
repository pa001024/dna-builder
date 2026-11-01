<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { LeveledMonsterHelper, monsterMap } from "@/data"
import { MaxMonsterLevelLimit } from "@/data/d/const.data"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatBigNumber } from "@/util"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

const enemyResistanceOptions = [0, 0.5, -4]
const enemyLevelOptions = Array.from({ length: MaxMonsterLevelLimit }, (_, index) => index + 1)

const enemyId = ref<number>(props.data.enemyId || 0)
const enemyLevel = ref<number>(props.data.enemyLevel || 80)
const enemyResistance = ref<number>(props.data.enemyResistance || 0)
const imbalance = ref<boolean>(Boolean(props.data.imbalance))
const monsterDialogShow = ref(false)

watch(
    () => [props.data.enemyId, props.data.enemyLevel, props.data.enemyResistance, props.data.imbalance],
    () => {
        enemyId.value = props.data.enemyId || 0
        enemyLevel.value = props.data.enemyLevel || 80
        enemyResistance.value = props.data.enemyResistance || 0
        imbalance.value = Boolean(props.data.imbalance)
    }
)

const enemyName = computed(() => monsterMap.get(enemyId.value)?.n || "")

const context = computed(() => store.getBuildContext(props.id))
const enemyStats = computed(() => {
    const enemy = context.value?.charBuild?.enemy
    if (enemy) return { hp: enemy.hp, def: enemy.def, atk: enemy.atk, tn: enemy.tn, es: enemy.es || 0 }
    const fallback = LeveledMonsterHelper.fromId(enemyId.value, enemyLevel.value)
    return { hp: fallback.hp, def: fallback.def, atk: fallback.atk, tn: fallback.tn, es: 0 }
})

function commit() {
    store.updateNodeData(props.id, {
        enemyId: enemyId.value,
        enemyLevel: enemyLevel.value,
        enemyResistance: enemyResistance.value,
        imbalance: imbalance.value,
    })
}

function selectEnemy(id: number) {
    enemyId.value = id
    monsterDialogShow.value = false
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-85 max-w-full space-y-2">
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div class="min-w-0">
                    <div class="mb-0.5 text-[10px] text-base-content/45">{{ $t("char-build.enemy") }}</div>
                    <button
                        type="button"
                        class="inline-flex w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 appearance-none rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] transition-colors duration-150 hover:border-primary/50"
                        @click="monsterDialogShow = true"
                    >
                        <span class="min-w-0 truncate text-left">{{ enemyName || $t("node-editor.enemyInput.enemy") }}</span>
                        <Icon icon="radix-icons:chevron-down" class="size-3 shrink-0 opacity-40" />
                    </button>
                </div>
                <div class="min-w-0">
                    <div class="mb-0.5 text-[10px] text-base-content/45">{{ $t("char-build.enemy_resistance") }}</div>
                    <Select v-model="enemyResistance" variant="chip" class="w-full min-w-0" @change="commit">
                        <SelectItem v-for="res in enemyResistanceOptions" :key="res" :value="res">{{ res * 100 }}%</SelectItem>
                    </Select>
                </div>
                <div class="min-w-0">
                    <div class="mb-0.5 text-[10px] text-base-content/45">{{ $t("char-build.enemy_level") }}</div>
                    <Select v-model="enemyLevel" variant="chip" class="w-full min-w-0" @change="commit">
                        <SelectItem v-for="lv in enemyLevelOptions" :key="lv" :value="lv">{{ lv }}</SelectItem>
                    </Select>
                </div>
                <div class="min-w-0">
                    <div class="mb-0.5 text-[10px] text-base-content/45">{{ $t("失衡") }}</div>
                    <input v-model="imbalance" type="checkbox" class="toggle toggle-xs toggle-secondary nodrag" @change="commit" @pointerdown.stop @mousedown.stop />
                </div>
            </div>

            <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-base-content/10 pt-1.5">
                <span class="flex items-baseline gap-1.5">
                    <span class="text-[11px] font-semibold text-base-content/45">{{ $t("生命") }}</span>
                    <span class="font-orbitron text-[11px] font-bold tabular-nums text-primary" :title="`${enemyStats.hp}`">
                        {{ formatBigNumber(enemyStats.hp) }}
                    </span>
                </span>
                <span class="flex items-baseline gap-1.5">
                    <span class="text-[11px] font-semibold text-base-content/45">{{ $t("防御") }}</span>
                    <span class="font-orbitron text-[11px] font-bold tabular-nums text-primary">{{ enemyStats.def }}</span>
                </span>
                <span class="flex items-baseline gap-1.5">
                    <span class="text-[11px] font-semibold text-base-content/45">{{ $t("护盾") }}</span>
                    <span class="font-orbitron text-[11px] font-bold tabular-nums text-primary" :title="`${enemyStats.es}`">
                        {{ formatBigNumber(enemyStats.es) }}
                    </span>
                </span>
            </div>
        </div>

        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': monsterDialogShow }">
                <div class="modal-box bg-base-300 w-11/12 max-w-6xl p-0">
                    <MonsterListView v-if="monsterDialogShow" :selected-id="enemyId" :level="enemyLevel" @select="selectEnemy" />
                    <div class="modal-action">
                        <button class="btn" @click="monsterDialogShow = false">{{ $t("common.close") }}</button>
                    </div>
                </div>
                <div class="modal-backdrop" @click="monsterDialogShow = false" />
            </dialog>
        </Teleport>
    </BaseNode>
</template>
