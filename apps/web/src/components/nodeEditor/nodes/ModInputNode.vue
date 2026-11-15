<script setup lang="ts">
import { computed, ref, watch } from "vue"
import CardEntityPickerDialog from "@/components/CardEntityPickerDialog.vue"
import type { ModSlotType, ModVariant } from "@/composables/useCharSettings"
import {
    type Char,
    charMap,
    LeveledChar,
    LeveledMod,
    LeveledModHelper,
    LeveledWeapon,
    type Mod,
    type ModTypeKey,
    ModTypeMap,
    modData,
    type SkillWeapon,
    type Weapon,
    weaponMap,
} from "@/data"
import { getModBuffLvFromSetting } from "@/data/effectLv"
import { useInvStore } from "@/store/inv"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { isModAllowedInSlot, type ModLimitContext, type ModLimitSlot } from "@/utils/mod-equip"
import { ensureNodeModSettings, type NodeModSettings } from "@/utils/nodeEditorBuild"
import type { ModNodeContext } from "../types"
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

/** 显式上下文对应的筛选来源 */
interface ModFilterSource {
    char?: Char
    weapon?: Weapon
    skillWeapon?: SkillWeapon
}

/** 页签 → 上下文槽位（同律的兼容性由角色的同律武器决定，因此共用角色上下文） */
const CONTEXT_KEYS: Record<ModSlotType, keyof ModNodeContext> = {
    角色: "char",
    近战: "melee",
    远程: "ranged",
    同律: "char",
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

/**
 * 读取持久化的激活页签，非法取值回退为角色槽。
 * @returns 初始页签
 */
function readActiveTab(): ModSlotType {
    const raw = props.data.activeModTab
    return (MOD_TABS as string[]).includes(raw) ? (raw as ModSlotType) : "角色"
}

const activeTab = ref<ModSlotType>(readActiveTab())

watch(
    () => props.data.activeModTab,
    next => {
        if ((MOD_TABS as string[]).includes(next) && next !== activeTab.value) activeTab.value = next as ModSlotType
    }
)

watch(
    () => props.data.modSettings,
    () => {
        modSettings.value = readModSettings()
    }
)

/**
 * 读取节点上的筛选上下文；非法 id 直接丢弃，保证旧图 / 手写 JSON 也能打开。
 * @returns 各页签已选的角色 / 武器 id
 */
function readModContext(): ModNodeContext {
    const raw = props.data.modContext
    const result: ModNodeContext = {}
    if (!raw || typeof raw !== "object") return result
    for (const key of ["char", "melee", "ranged"] as const) {
        const id = Number((raw as Record<string, unknown>)[key])
        if (Number.isFinite(id) && id > 0) result[key] = id
    }
    return result
}

const modContext = computed<ModNodeContext>(() => readModContext())

const contextKey = computed(() => CONTEXT_KEYS[activeTab.value])
const contextId = computed(() => modContext.value[contextKey.value])
const pickerKind = computed<"char" | "weapon">(() => (contextKey.value === "char" ? "char" : "weapon"))
const pickerWeaponType = computed(() => (contextKey.value === "char" ? undefined : activeTab.value))
const contextPickerShow = ref(false)

const context = computed(() => store.getBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)

/** 显式选中的角色（角色页签与同律页签共用同一个上下文） */
const contextChar = computed(() => charMap.get(modContext.value.char ?? 0))

/**
 * 同律页签是否可见：与接入构筑时同一口径——角色必须有可独立配装的同律武器。
 * 已接入构筑时完全按构筑角色决定；未接入时由显式角色上下文决定，
 * 两者都没有时默认隐藏，但当前正停在同律页签（例如贴入了 4 槽同律代码）时保留。
 */
const skillTabAvailable = computed(() => {
    const build = charBuild.value
    if (build) return !!build.skillWeapon && !build.skillWeapon.inherit
    const char = contextChar.value
    if (char) {
        const skillWeapon = char.同律武器?.[0]
        return !!skillWeapon && !skillWeapon.inherit
    }
    return activeTab.value === "同律"
})

/**
 * 当前页签的筛选来源：仅未接入构筑时使用显式上下文；
 * 已接入构筑时完全忽略上下文，筛选与导入导出都按构筑走。
 */
const contextSource = computed<ModFilterSource | null>(() => {
    if (charBuild.value) return null
    const id = contextId.value
    if (!id) return null
    const char = charMap.get(modContext.value.char ?? 0)
    if (contextKey.value === "char") {
        if (!char) return null
        return { char, skillWeapon: char.同律武器?.[0] }
    }
    const weapon = weaponMap.get(id)
    if (!weapon) return null
    return { char, weapon }
})

/** 当前页签要展示的角色 / 武器：接入构筑时取构筑，未接入时取显式上下文 */
const ownerInfo = computed(() => {
    const build = charBuild.value
    if (build) {
        if (activeTab.value === "同律") {
            const weapon = build.skillWeapon
            return weapon ? { name: weapon.名称, sub: weapon.类别 || weapon.伤害类型 || "", icon: weapon.url } : null
        }
        if (activeTab.value === "角色") {
            const char = build.char
            return { name: char.名称, sub: char.属性 ? `${char.属性}属性` : "", icon: char.url }
        }
        const weapon = activeTab.value === "近战" ? build.meleeWeapon : build.rangedWeapon
        if (!weapon || weapon.isEmpty) return { name: "char-build.weapon_slot_not_equipped", sub: "", icon: "" }
        return { name: weapon.名称, sub: weapon.类别 || weapon.伤害类型 || "", icon: weapon.url }
    }
    const source = contextSource.value
    if (!source) return null
    if (contextKey.value === "char") {
        const char = source.char
        return char ? { name: char.名称, sub: char.属性 ? `${char.属性}属性` : "", icon: LeveledChar.url(char.icon) } : null
    }
    const weapon = source.weapon
    return weapon ? { name: weapon.名称, sub: weapon.类型[1] ?? weapon.类型[0] ?? "", icon: LeveledWeapon.url(weapon.icon) } : null
})

const ownerChipClass = computed(() =>
    charBuild.value
        ? "cursor-default border-base-content/15 bg-base-100 text-base-content/65"
        : ownerInfo.value
          ? "cursor-pointer border-primary/40 bg-primary/10 text-primary"
          : "cursor-pointer border-dashed border-base-content/20 text-base-content/55 hover:border-primary/40 hover:text-primary"
)

const ownerChipTitle = computed(() =>
    charBuild.value ? "已接入构筑，筛选跟随构筑" : ownerInfo.value ? "更换当前页签的筛选上下文" : "选择筛选上下文：角色 / 武器"
)

function openContextPicker() {
    // 已接入构筑时选择框只读，不打开选择器
    if (charBuild.value) return
    contextPickerShow.value = true
}

/**
 * 提交筛选上下文到节点数据：本地状态与 store 同步更新。
 * @param next 新上下文
 */
function commitModContext(next: ModNodeContext) {
    store.updateNodeData(props.id, { modContext: { ...next } })
}

/**
 * 写入当前页签的筛选上下文；id 为 0 表示清空。
 * @param id 角色 / 武器 id
 */
function applyContext(id: number) {
    // 已接入构筑时上下文不参与任何逻辑，避免留下无效操作
    if (charBuild.value) return
    const key = contextKey.value
    const next = { ...modContext.value }
    if (id > 0) next[key] = id
    else delete next[key]
    commitModContext(next)
}

function clearContext() {
    applyContext(0)
}

/**
 * 导入码确认「替换」后写入代码持有者：角色页签写角色，近战 / 远程写对应武器；
 * 同律没有可选的武器上下文，忽略。
 * @param owner 导入码的持有者
 */
function applyImportedOwner(owner: { flag: "C" | "W"; id: number }) {
    // 接入构筑后筛选与代码持有者都以构筑为准，忽略导入码的替换请求
    if (charBuild.value) return
    if (owner.flag === "C") {
        if (activeTab.value === "角色" && charMap.has(owner.id)) applyContext(owner.id)
        return
    }
    if (!weaponMap.has(owner.id)) return
    if (activeTab.value === "近战" || activeTab.value === "远程") applyContext(owner.id)
}

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
    MOD_TABS.filter(name => name !== "同律" || skillTabAvailable.value).map(name => ({
        name,
        // 接入构筑时按构筑武器槽位决定可用性；未接入时全部可切换（上下文只影响候选筛选）
        disabled: charBuild.value
            ? name !== "角色" &&
              ((name === "近战" && charBuild.value.meleeWeapon.isEmpty) ||
                  (name === "远程" && charBuild.value.rangedWeapon.isEmpty))
            : false
    }))
)

function selectTab(name: ModSlotType) {
    activeTab.value = name
    if (props.data.activeModTab !== name) store.updateNodeData(props.id, { activeModTab: name })
}

watch(tabs, items => {
    const current = items.find(item => item.name === activeTab.value)
    // 页签被隐藏（如角色没有同律武器）或当前槽位不可用时回落到角色页签
    if (!current || current.disabled) selectTab("角色")
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

/** MOD 槽位类型 → 限定校验口径 */
const LIMIT_SLOTS: Record<ModTypeKey, ModLimitSlot> = {
    charMods: "角色",
    meleeMods: "近战",
    rangedMods: "远程",
    skillMods: "同律",
}

/**
 * 把原始武器数据转换为限定校验需要的类别 / 伤害类型。
 * @param weapon 武器数据
 * @param skill 同律武器的类别在类型数组第三段
 * @returns 限定校验用的武器描述；未提供时返回 null
 */
function weaponLimit(weapon?: Weapon | SkillWeapon, skill = false) {
    if (!weapon) return null
    return { 类别: skill ? weapon.类型[2] : weapon.类型[1], 伤害类型: weapon.伤害类型 }
}

/**
 * 构造显式上下文的限定校验上下文。
 * @param source 当前页签的筛选来源
 * @param key 槽位类型
 * @returns 限定校验上下文
 */
function buildLimitContext(source: ModFilterSource, key: ModTypeKey): ModLimitContext {
    const char = source.char
    return {
        charId: char?.id ?? 0,
        charName: char?.名称 ?? "",
        charElement: char?.属性 ?? "",
        melee: key === "meleeMods" ? weaponLimit(source.weapon) : null,
        ranged: key === "rangedMods" ? weaponLimit(source.weapon) : null,
        skill: weaponLimit(source.skillWeapon, true),
    }
}

/**
 * 按显式上下文判定槽位兼容：类型 / 光环排除 / 属性 / 限定。
 * @param mod 原始 MOD 数据
 * @param key 槽位类型
 * @param source 当前页签的筛选来源
 * @returns 是否可装入该槽位
 */
function isModSlotCompatibleWith(mod: Mod, key: ModTypeKey, source: ModFilterSource) {
    if (mod.系列 === "羽蛇") return false
    if (!isModTypeCompatible(mod.类型, key)) return false
    // 元素属性 MOD 仅限同属性角色；没有角色上下文时不限制属性
    if (source.char && mod.属性 && mod.属性 !== source.char.属性) return false
    return isModAllowedInSlot(mod, LIMIT_SLOTS[key], buildLimitContext(source, key))
}

/**
 * 按显式角色上下文判定中枢兼容。
 * @param mod 原始 MOD 数据
 * @param char 角色数据
 * @returns 是否可装入中枢槽
 */
function isAuraCompatibleWithChar(mod: Mod, char: Char) {
    if (mod.系列 !== "羽蛇") return false
    if (mod.类型 !== ModTypeMap.charMods) return false
    if (mod.属性 && mod.属性 !== char.属性) return false
    return isModAllowedInSlot(mod, "角色", { charId: char.id, charName: char.名称, charElement: char.属性 })
}

/**
 * 按槽位过滤 MOD 选项：显式上下文优先；否则与构筑页共用 `CharBuild.isModSlotCompatible` 口径。
 * 未接入构筑（节点未连线）且未选择上下文时，只按 MOD 类型 / 系列过滤。
 * @param key 槽位类型
 * @returns 可选 MOD
 */
function filterModOptionsBySlot(key: ModTypeKey) {
    const rawById = new Map(modData.map(mod => [mod.id, mod]))
    const build = charBuild.value
    const source = contextSource.value
    return modOptions.value.filter(option => {
        const raw = rawById.get(option.value)
        if (!raw) return false
        if (source) {
            if (raw.系列 === "羽蛇") return key === "charMods" && !!source.char && isAuraCompatibleWithChar(raw, source.char)
            return isModSlotCompatibleWith(raw, key, source)
        }
        if (raw.系列 === "羽蛇") return key === "charMods" && (!build || build.isAuraCompatible(raw))
        if (!build) return isModTypeCompatible(raw.类型, key)
        return build.isModSlotCompatible(raw, key)
    })
}

/**
 * 未接入构筑时按 MOD 类型判定槽位兼容（与 isModSlotCompatible 的类型分支同口径）。
 * @param modType MOD 的 `类型` 字段
 * @param key 槽位类型
 * @returns 是否可装入该槽位
 */
function isModTypeCompatible(modType: string, key: ModTypeKey) {
    return key === "skillMods" ? modType.startsWith("同律") : modType === ModTypeMap[key]
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

/** 当前页签显式上下文的代码持有者：仅未接入构筑时用于导入码导出 */
const codeOwner = computed(() => {
    // 接入构筑后导入导出跟随构筑，忽略显式上下文
    if (charBuild.value) return undefined
    const id = modContext.value[CONTEXT_KEYS[activeTab.value]]
    // 同律武器没有对应的社区代码，不提供导出
    if (!id || activeTab.value === "同律") return undefined
    return { flag: activeTab.value === "角色" ? ("C" as const) : ("W" as const), id }
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
                    @click="selectTab(item.name)"
                >
                    {{ $t(item.name) }}
                </button>
                <div class="ml-auto flex items-center gap-1">
                    <!-- 接入构筑时只读展示构筑实体；未接入时可点击选择筛选上下文 -->
                    <component
                        :is="charBuild ? 'div' : 'button'"
                        :type="charBuild ? undefined : 'button'"
                        class="nodrag flex h-6 max-w-52 items-center gap-1 border px-1 text-left transition-colors duration-150"
                        :class="ownerChipClass"
                        :title="ownerChipTitle"
                        @click="openContextPicker"
                    >
                        <span class="grid size-4 shrink-0 place-items-center overflow-hidden border border-base-content/20 bg-base-content/6">
                            <img v-if="ownerInfo?.icon" class="size-full object-cover object-top" :src="ownerInfo.icon" alt="" />
                            <Icon
                                v-else
                                :icon="activeTab === '角色' ? 'ri:user-line' : 'ri:sword-line'"
                                class="size-2.5 opacity-45"
                            />
                        </span>
                        <span class="min-w-0 truncate text-[10px] font-semibold">{{
                            ownerInfo ? $t(ownerInfo.name) : charBuild ? "—" : "未选择"
                        }}</span>
                        <span v-if="ownerInfo?.sub" class="shrink-0 text-[9px] text-base-content/45">{{ $t(ownerInfo.sub) }}</span>
                        <Icon v-if="!charBuild" icon="ri:exchange-line" class="size-3 shrink-0 opacity-40" />
                    </component>
                    <button
                        v-if="!charBuild && contextId"
                        type="button"
                        class="nodrag grid size-6 cursor-pointer place-items-center border border-base-content/10 text-base-content/45 transition-colors duration-150 hover:border-error/40 hover:text-error"
                        title="清空筛选上下文"
                        @click="clearContext"
                    >
                        <Icon icon="ri:close-line" class="size-3" />
                    </button>
                    <span v-if="modCost" class="font-mono text-[10px] tabular-nums text-base-content/40">
                        {{ modCost.used }}/{{ modCost.cap }}
                    </span>
                </div>
            </div>

            <CardEntityPickerDialog
                :open="contextPickerShow"
                :kind="pickerKind"
                :weapon-type="pickerWeaponType"
                :selected-id="contextId ?? 0"
                allow-clear
                hint="选择用于筛选当前页签 MOD 候选的角色 / 武器（仅未接入构筑时生效）"
                @update:open="contextPickerShow = $event"
                @select="applyContext"
            />

            <ModEditer
                :key="activeTab"
                :mods="mods"
                :mod-options="filterModOptionsBySlot(SLOT_TYPE_KEYS[activeTab])"
                :char-build="charBuild"
                :code-owner="codeOwner"
                :aura-mod="activeAuraMod"
                :type="activeTab"
                :polset="charBuild?.getModCostTransfer(activeTab) ?? []"
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
                @import-owner="applyImportedOwner"
            />
        </div>
    </BaseNode>
</template>
