<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import type { CharSettings } from "@/composables/useCharSettings"
import { buffData, charData, charMap, LeveledBuff, LeveledChar, LeveledWeapon, weaponData } from "@/data"
import { createBuffSelectContext, isBuffSelectable } from "@/data/buffFilter"
import { createBuffFromSettings } from "@/data/CharBuildHelper"
import { isPetRelatedBuffName } from "@/data/petTrait"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { clonePlain, deriveTeamBuffs, readNodeBuffEntries, reconcileTeamBuffs } from "@/utils/nodeEditorBuild"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

/** 读取节点 BUFF 条目并按值拷贝，避免与节点数据共享数组引用 */
function readBuffs(): [string, number, number?][] {
    return readNodeBuffEntries(props.data).map(buff => [...buff] as [string, number, number?])
}

const buffs = ref<[string, number, number?][]>(readBuffs())
const customBuff = ref<[string, number][]>(clonePlain(props.data.customBuff ?? []))

watch(
    () => props.data.buffs,
    () => {
        buffs.value = readBuffs()
    },
    { deep: true }
)
watch(
    () => props.data.customBuff,
    () => {
        customBuff.value = clonePlain(props.data.customBuff ?? [])
    },
    { deep: true }
)

// 队友配置与 BUFF 合并在一起：BUFF 候选依赖队友角色/武器过滤
const team = reactive({
    team1: props.data.team1 ?? "-",
    team1Weapon: props.data.team1Weapon ?? "-",
    team1Build: props.data.team1Build ?? "-",
    team1BuildVariant: props.data.team1BuildVariant ?? "A",
    team2: props.data.team2 ?? "-",
    team2Weapon: props.data.team2Weapon ?? "-",
    team2Build: props.data.team2Build ?? "-",
    team2BuildVariant: props.data.team2BuildVariant ?? "A",
})

const teamBuffs = computed(() => deriveTeamBuffs([team.team1, team.team2, team.team1Weapon, team.team2Weapon]))

watch(
    () => [
        props.data.team1,
        props.data.team1Weapon,
        props.data.team1Build,
        props.data.team1BuildVariant,
        props.data.team2,
        props.data.team2Weapon,
        props.data.team2Build,
        props.data.team2BuildVariant,
    ],
    () => {
        team.team1 = props.data.team1 ?? "-"
        team.team1Weapon = props.data.team1Weapon ?? "-"
        team.team1Build = props.data.team1Build ?? "-"
        team.team1BuildVariant = props.data.team1BuildVariant ?? "A"
        team.team2 = props.data.team2 ?? "-"
        team.team2Weapon = props.data.team2Weapon ?? "-"
        team.team2Build = props.data.team2Build ?? "-"
        team.team2BuildVariant = props.data.team2BuildVariant ?? "A"
    }
)

/** 写回队友配置，并把助战 BUFF 作为普通 BUFF 增删（与构筑页的队友选择一致） */
function commitTeam() {
    const same =
        props.data.team1 === team.team1 &&
        props.data.team1Weapon === team.team1Weapon &&
        props.data.team1Build === team.team1Build &&
        props.data.team1BuildVariant === team.team1BuildVariant &&
        props.data.team2 === team.team2 &&
        props.data.team2Weapon === team.team2Weapon &&
        props.data.team2Build === team.team2Build &&
        props.data.team2BuildVariant === team.team2BuildVariant
    if (same) return
    const nextBuffs = reconcileTeamBuffs(
        buffs.value,
        [props.data.team1, props.data.team1Weapon, props.data.team2, props.data.team2Weapon],
        [team.team1, team.team1Weapon, team.team2, team.team2Weapon]
    )
    const patch: Record<string, any> = {
        team1: team.team1,
        team1Weapon: team.team1Weapon,
        team1Build: team.team1Build,
        team1BuildVariant: team.team1BuildVariant,
        team2: team.team2,
        team2Weapon: team.team2Weapon,
        team2Build: team.team2Build,
        team2BuildVariant: team.team2BuildVariant,
    }
    if (JSON.stringify(nextBuffs) !== JSON.stringify(buffs.value)) {
        buffs.value = nextBuffs
        patch.buffs = nextBuffs.map(buff => [...buff])
    }
    store.updateNodeData(props.id, patch)
}

watch(team, commitTeam, { deep: true })

const context = computed(() => store.getBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)
const mainCharId = computed(() => charBuild.value?.char.id)
const hasCustomBuff = computed(() => buffs.value.some(buff => buff[0] === "自定义BUFF"))

const charOptions = computed(() =>
    charData.map(char => ({
        value: char.id,
        label: char.名称,
        elm: char.属性,
        icon: LeveledChar.url(char.icon),
    }))
)

const team1Options = computed(() => [
    { value: "-" as number | "-", label: "无", elm: "", icon: "/imgs/1.png" },
    ...charOptions.value.filter(char => char.value !== mainCharId.value && char.value !== team.team2),
])

const team2Options = computed(() => [
    { value: "-" as number | "-", label: "无", elm: "", icon: "/imgs/1.png" },
    ...charOptions.value.filter(char => char.value !== mainCharId.value && char.value !== team.team1),
])

const teamWeaponOptions = computed(() => [
    { value: "-" as number | "-", label: "无", type: "", icon: "/imgs/1.png" },
    ...weaponData
        .filter(weapon => weapon.类型[0] === "近战" || weapon.类型[0] === "远程")
        .map(weapon => ({
            value: weapon.id,
            label: weapon.名称,
            type: weapon.类型[1],
            icon: LeveledWeapon.url(weapon.icon),
        })),
])

function groupByKey<T extends Record<string, unknown>>(list: T[], key: keyof T): Record<string, T[]> {
    const map = new Map<string, T[]>()
    for (const item of list) {
        const k = String(item[key] ?? "")
        const group = map.get(k)
        if (group) group.push(item)
        else map.set(k, [item])
    }
    return Object.fromEntries(map)
}

const groupedTeam1Options = computed(() => groupByKey(team1Options.value, "elm"))
const groupedTeam2Options = computed(() => groupByKey(team2Options.value, "elm"))
const groupedTeamWeaponOptions = computed(() => groupByKey(teamWeaponOptions.value, "type"))
const teamSettings = computed(() => team as unknown as CharSettings)

const selectedBuffs = computed<LeveledBuff[]>(() => {
    return buffs.value.map(buff => {
        try {
            return createBuffFromSettings(buff[0], buff[1], customBuff.value, buff[2])
        } catch (error) {
            console.warn("节点 BUFF 实例化失败", buff[0], error)
            return new LeveledBuff({ 名称: buff[0], 等级: buff[1], mx: buff[1], lx: 1, 描述: "" } as any, buff[1])
        }
    })
})

const buffOptions = computed(() => {
    const build = charBuild.value
    // 队友配置直接取自当前节点，保证切换队友后候选 BUFF 立即按队友来源过滤
    const ctx = createBuffSelectContext({
        charElm: build?.char.属性 ?? "",
        mainIds: [build?.char.id, build?.meleeWeapon?.id, build?.rangedWeapon?.id].filter(
            (id): id is number => typeof id === "number" && id > 0
        ),
        phantomIds: [
            charMap.get(team.team1)?.id,
            charMap.get(team.team2)?.id,
            team.team1Weapon,
            team.team2Weapon,
        ].filter((id): id is number => typeof id === "number"),
    })
    return buffData
        .filter(buff => !isPetRelatedBuffName(buff.名称))
        .filter(buff => isBuffSelectable(buff, ctx))
        .map(buff => {
            const selected = buffs.value.find(item => item[0] === buff.名称)
            const lv = selected?.[1] ?? buff.mx ?? 1
            const coverage = selected?.[2] ?? 1
            const value = createBuffFromSettings(buff.名称, lv, customBuff.value, coverage)
            return {
                value,
                label: buff.名称,
                limit: buff.限定,
                description: buff.描述,
                lv,
                coverage,
                buff,
            }
        })
})

/** 写回节点数据并触发下游重算 */
function commit(nextBuffs: [string, number, number?][] = buffs.value, nextCustomBuff: [string, number][] = customBuff.value) {
    store.updateNodeData(props.id, {
        buffs: nextBuffs.map(buff => [...buff]),
        customBuff: clonePlain(nextCustomBuff),
    })
}

function toggleBuff(buff: LeveledBuff) {
    const index = buffs.value.findIndex(item => item[0] === buff.名称)
    if (index >= 0) buffs.value.splice(index, 1)
    else buffs.value.push([buff.名称, buff.等级])
    commit()
}

function setBuffLv(buff: LeveledBuff, lv: number) {
    const item = buffs.value.find(entry => entry[0] === buff.名称)
    if (!item) return
    item[1] = lv
    commit()
}

/**
 * 设置 BUFF 覆盖率：100% 时回退为两元素条目，其余追加第三元素。
 * @param buff 目标 BUFF
 * @param coverage 覆盖率（0-1）
 */
function setBuffCoverage(buff: LeveledBuff, coverage: number) {
    const item = buffs.value.find(entry => entry[0] === buff.名称)
    if (!item) return
    if (coverage >= 1) item.splice(2, 1)
    else item[2] = coverage
    commit()
}

function replaceBuffs(nextBuffs: [string, number][]) {
    buffs.value = nextBuffs.map(buff => [...buff] as [string, number])
    commit()
}

function replaceCustomBuff(nextCustomBuff: [string, number][]) {
    customBuff.value = clonePlain(nextCustomBuff)
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-140 max-w-full space-y-2">
            <div class="flex items-center gap-3">
                <span class="text-[10px] font-semibold tracking-[0.3em] text-base-content/45 uppercase">队友</span>
                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
            </div>
            <TeamEditor
                :char-settings="teamSettings"
                :team1-options="groupedTeam1Options"
                :team2-options="groupedTeam2Options"
                :weapon-options="groupedTeamWeaponOptions"
            />
            <div v-if="teamBuffs.length > 0" class="text-[10px] text-base-content/45">
                计入助战 BUFF：{{ teamBuffs.map(([name]) => name).join("、") }}
            </div>
            <div class="flex items-center gap-3">
                <span class="text-[10px] font-semibold tracking-[0.3em] text-base-content/45 uppercase">BUFF</span>
                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
            </div>
            <BuffEditer
                :buff-options="buffOptions"
                :selected-buffs="selectedBuffs"
                :char-build="charBuild"
                @toggle-buff="toggleBuff"
                @set-buff-lv="setBuffLv"
                @set-buff-coverage="setBuffCoverage"
                @replace-buffs="replaceBuffs"
                @replace-custom-buff="replaceCustomBuff"
            />
            <template v-if="hasCustomBuff">
                <div class="flex items-center gap-3">
                    <span class="text-[10px] font-semibold tracking-[0.3em] text-base-content/45 uppercase">
                        {{ $t("char-build.custom_buff") }}
                    </span>
                    <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                </div>
                <CustomBuffEditor :buffs="customBuff" @submit="replaceCustomBuff" />
            </template>
        </div>
    </BaseNode>
</template>
