<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { ModSlotType, ModVariant } from "@/composables/useCharSettings"
import { LeveledMod, LeveledModHelper, type ModTypeKey, modData } from "@/data"
import { getModBuffLvFromSetting } from "@/data/effectLv"
import { useInvStore } from "@/store/inv"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { ensureNodeModSettings, type NodeModSettings } from "@/utils/nodeEditorBuild"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const inv = useInvStore()

const MOD_TABS: ModSlotType[] = ["角色", "近战", "远程", "同律"]
const SLOT_KEYS: Record<ModSlotType, "charMods" | "meleeMods" | "rangedMods" | "skillWeaponMods"> = {
    角色: "charMods",
    近战: "meleeMods",
    远程: "rangedMods",
    同律: "skillWeaponMods",
}
const SLOT_TYPE_KEYS: Record<ModSlotType, ModTypeKey> = {
    角色: "charMods",
    近战: "meleeMods",
    远程: "rangedMods",
    同律: "skillMods",
}

/**
 * 读取节点上的 MOD 槽位；旧版 `mods` / `modLevels` 数据在这里就地迁移。
 * @returns 可编辑的槽位设置
 */
function readModSettings(): NodeModSettings {
    return ensureNodeModSettings({ ...props.data, modSettings: cloneModSettings(props.data.modSettings) })
}

/**
 * 深拷贝 MOD 设置，避免节点图与编辑器本地状态共享引用。
 * @param settings 原始设置
 * @returns 拷贝结果
 */
function cloneModSettings(settings?: NodeModSettings): NodeModSettings | undefined {
    return settings ? (JSON.parse(JSON.stringify(settings)) as NodeModSettings) : undefined
}

const modSettings = ref<NodeModSettings>(readModSettings())
const activeTab = ref<ModSlotType>("角色")

watch(
    () => props.data.modSettings,
    () => {
        modSettings.value = readModSettings()
    }
)

const context = computed(() => store.getBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)

/**
 * 读取 MOD 效果等级：与构筑页一致，关闭全局效果时取导入配置里的等级。
 * @param modId MOD id
 * @returns 效果等级
 */
function getBuffLv(modId: number) {
    const settings = context.value?.settings
    return !settings || settings.useGlobal ? inv.getBuffLv(modId) : getModBuffLvFromSetting(settings.effectConfig, modId)
}

/** 当前激活变体的槽位数组（可直接写入） */
function activeSlots(type: ModSlotType) {
    const settings = modSettings.value
    const variant = settings.modVariantIndex > 0 ? settings.modVariants[settings.modVariantIndex - 1] : undefined
    return variant?.[type] ?? settings[SLOT_KEYS[type]]
}

const variantCount = computed(() => 1 + modSettings.value.modVariants.length)
const activeAuraMod = computed(() => {
    const settings = modSettings.value
    const variant = settings.modVariantIndex > 0 ? settings.modVariants[settings.modVariantIndex - 1] : undefined
    return variant?.中枢 || settings.auraMod
})

const tabs = computed(() =>
    MOD_TABS.map(name => ({
        name,
        disabled:
            !charBuild.value ||
            (name === "近战" && charBuild.value.meleeWeapon.isEmpty) ||
            (name === "远程" && charBuild.value.rangedWeapon.isEmpty) ||
            (name === "同律" && (!charBuild.value.skillWeapon || Boolean(charBuild.value.skillWeapon.inherit))),
    }))
)

watch(tabs, items => {
    const current = items.find(item => item.name === activeTab.value)
    if (current?.disabled) activeTab.value = "角色"
})

const mods = computed<(LeveledMod | null)[]>(() =>
    activeSlots(activeTab.value).map(slot =>
        slot ? LeveledModHelper.optionalFromId(slot[0], slot[1], getBuffLv(slot[0])) : null
    )
)

const modOptions = computed(() => {
    return modData
        .map(mod => ({
            value: mod.id,
            label: mod.名称,
            quality: mod.品质,
            type: mod.类型,
            limit: mod.属性 || mod.限定,
            ser: mod.系列,
            count: Math.min(inv.getModCount(mod.id, mod.品质), mod.系列 !== "契约者" ? 8 : 1),
            bufflv: getBuffLv(mod.id),
            lv: inv.getModLv(mod.id, mod.品质),
        }))
        .filter(mod => mod.count)
})

/**
 * 按槽位过滤 MOD 选项：与构筑页共用 `CharBuild.isModSlotCompatible` 口径。
 * @param key 槽位类型
 * @returns 可选 MOD
 */
function filterModOptionsBySlot(key: ModTypeKey) {
    const rawById = new Map(modData.map(mod => [mod.id, mod]))
    return modOptions.value.filter(option => {
        const raw = rawById.get(option.value)
        if (!raw) return false
        if (key === "charMods" && raw.系列 === "羽蛇") return charBuild.value?.isAuraCompatible(raw) ?? false
        return charBuild.value?.isModSlotCompatible(raw, key) ?? false
    })
}

/** 写回节点数据并触发下游重算 */
function commit() {
    store.updateNodeData(props.id, { modSettings: cloneModSettings(modSettings.value) })
}

function removeMod(index: number) {
    activeSlots(activeTab.value)[index] = null
    commit()
}

function selectMod(index: number, id: number, lv: number) {
    activeSlots(activeTab.value)[index] = [id, lv]
    commit()
}

function setModLevel(index: number, lv: number) {
    const slot = activeSlots(activeTab.value)[index]
    if (!slot) return
    slot[1] = lv
    commit()
}

function swapMods(from: number, to: number) {
    const slots = activeSlots(activeTab.value)
    ;[slots[from], slots[to]] = [slots[to], slots[from]]
    commit()
}

function selectAuraMod(id: number) {
    const settings = modSettings.value
    const variant = settings.modVariantIndex > 0 ? settings.modVariants[settings.modVariantIndex - 1] : undefined
    if (variant) variant.中枢 = id
    else settings.auraMod = id
    commit()
}

function selectVariant(index: number) {
    modSettings.value.modVariantIndex = index
    commit()
}

function addVariant() {
    const settings = modSettings.value
    // 以当前激活变体为模板深拷贝槽位与中枢，避免变体之间共享引用
    const variant = { 中枢: activeAuraMod.value } as ModVariant
    MOD_TABS.forEach(type => {
        variant[type] = activeSlots(type).map(slot => (slot ? ([...slot] as [number, number]) : null))
    })
    settings.modVariants = [...settings.modVariants, variant]
    settings.modVariantIndex = settings.modVariants.length
    commit()
}

function removeVariant() {
    const settings = modSettings.value
    if (settings.modVariants.length === 0) return
    settings.modVariants = settings.modVariants.slice(0, -1)
    settings.modVariantIndex = Math.max(0, settings.modVariants.length)
    commit()
}

const modCost = computed(() => {
    const build = charBuild.value
    if (!build) return null
    return { used: build.getModCostTransfer(activeTab.value).length, cap: build.getModCap(activeTab.value) }
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-140 max-w-full space-y-2">
            <div class="flex flex-wrap items-center gap-1">
                <button
                    v-for="item in tabs"
                    :key="item.name"
                    type="button"
                    class="h-6 cursor-pointer border px-2 text-[10px] font-semibold transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                        item.name === activeTab
                            ? 'border-primary/40 bg-primary/15 text-primary'
                            : 'border-base-content/10 bg-base-100 text-base-content/60 hover:border-primary/30 hover:text-primary'
                    "
                    :disabled="item.disabled"
                    @click="activeTab = item.name"
                >
                    {{ $t(item.name) }}
                </button>
                <span v-if="modCost" class="ml-auto font-mono text-[10px] tabular-nums text-base-content/40">
                    {{ modCost.used }}/{{ modCost.cap }}
                </span>
            </div>

            <ModEditer
                v-if="charBuild"
                :key="activeTab"
                :mods="mods"
                :mod-options="filterModOptionsBySlot(SLOT_TYPE_KEYS[activeTab])"
                :char-build="charBuild"
                :aura-mod="activeAuraMod"
                :type="activeTab"
                :polset="charBuild.getModCostTransfer(activeTab)"
                :variant-index="modSettings.modVariantIndex"
                :variant-count="variantCount"
                @remove-mod="removeMod"
                @select-mod="selectMod($event[0], $event[1], $event[2])"
                @level-change="setModLevel($event[0], $event[1])"
                @swap-mods="swapMods"
                @select-aura-mod="selectAuraMod"
                @variant-select="selectVariant"
                @variant-add="addVariant"
                @variant-remove="removeVariant"
            />
            <div v-else class="text-[10px] text-yellow-500">{{ $t("node-editor.astExpression.missingCore") }}</div>
        </div>
    </BaseNode>
</template>
