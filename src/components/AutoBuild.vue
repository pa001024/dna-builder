<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { CharBuild, ModTypeKey } from "../data"
import { useInvStore } from "../store/inv"
import { computed } from "vue"
// 用户库存
const inv = useInvStore()

const autoBuildSetting = useLocalStorage("autobuild.setting", {
    useInv: false, // 使用用户库存
    includeTypes: [] as ModTypeKey[], // 包含的MOD类型
    preserveTypes: [] as ModTypeKey[], // 保留的MOD类型
    includeMelee: false, // 包含近战武器
    includeRanged: false, // 包含远程武器
})
const props = defineProps<{
    charBuild: CharBuild
    update?: boolean
}>()

function buildMods() {
    const useInv = autoBuildSetting.value.useInv
    const includeMelee = autoBuildSetting.value.includeMelee
    const includeRanged = autoBuildSetting.value.includeRanged
    // 自动构筑
    const {
        newBuild,
        log: buildLog,
        iter,
    } = props.charBuild.autoBuild({
        includeTypes: autoBuildSetting.value.includeTypes,
        preserveTypes: autoBuildSetting.value.preserveTypes,
        fixedMelee: !includeMelee,
        fixedRanged: !includeRanged,
        modOptions: inv.getModsWithCount(useInv, autoBuildSetting.value.includeTypes),
        meleeOptions: inv.getMeleeWeapons(useInv),
        rangedOptions: inv.getRangedWeapons(useInv),
        enableLog: true,
    })
    return {
        newBuild,
        buildLog,
        iter,
    }
}

const emit = defineEmits<{
    change: [CharBuild]
}>()

let lastBuild = { newBuild: props.charBuild, buildLog: "", iter: 0 }

const autoBuild = computed(() => (props.update ? ((lastBuild = buildMods()), emit("change", lastBuild.newBuild), lastBuild) : lastBuild))
</script>
<template>
    <div>
        <div class="text-base-content/60 text-sm">根据当前MOD配置自动构建最优MOD组合</div>
        <!-- 设置 -->
        <div class="flex flex-col gap-4 py-4">
            <div class="flex items-center gap-2 text-sm">
                <label class="cursor-pointer flex gap-2 items-center">
                    <input type="checkbox" class="toggle toggle-secondary" v-model="autoBuildSetting.useInv" />
                    使用用户库存
                </label>
                <label class="cursor-pointer flex gap-2 items-center">
                    <input type="checkbox" class="toggle toggle-secondary" v-model="autoBuildSetting.includeMelee" />
                    自动更换近战
                </label>
                <label class="cursor-pointer flex gap-2 items-center">
                    <input type="checkbox" class="toggle toggle-secondary" v-model="autoBuildSetting.includeRanged" />
                    自动更换远程
                </label>
            </div>
            <div class="flex items-center gap-2 text-sm">
                <div class="label">包含MOD类型</div>
                <CheckBoxGroup
                    v-model="autoBuildSetting.includeTypes"
                    :options="[
                        { label: '角色', value: 'charMods' },
                        { label: '近战', value: 'meleeMods' },
                        { label: '远程', value: 'rangedMods' },
                        { label: '同律', value: 'skillWeaponMods' },
                    ]"
                />
            </div>
            <div class="flex items-center gap-2 text-sm">
                <div class="label">保留当前MOD</div>
                <CheckBoxGroup
                    v-model="autoBuildSetting.preserveTypes"
                    :options="[
                        { label: '角色', value: 'charMods' },
                        { label: '近战', value: 'meleeMods' },
                        { label: '远程', value: 'rangedMods' },
                        { label: '同律', value: 'skillWeaponMods' },
                    ]"
                />
            </div>
        </div>
        <div class="flex flex-col gap-2 py-4">
            <span class="text-sm">{{ $t(`char-build.weapon`) }}</span>
            <div class="grid grid-cols-2 gap-4">
                <BuildWeaponCard :weapon="autoBuild.newBuild.meleeWeapon" />
                <BuildWeaponCard :weapon="autoBuild.newBuild.rangedWeapon" />
            </div>
        </div>
        <div class="flex flex-col gap-2 py-4" v-for="key in autoBuildSetting.includeTypes" :key="key">
            <span class="text-sm">{{ $t(`autobuild.${key}`) }}</span>
            <div class="grid grid-cols-4 lg:grid-cols-8 gap-4">
                <ModItem
                    v-for="(mod, index) in autoBuild.newBuild[key]"
                    :key="index"
                    :mod="mod"
                    :income="autoBuild.newBuild.calcIncome(mod, true)"
                    noremove
                />
            </div>
        </div>
        <div class="collapse">
            <input type="checkbox" />
            <div class="collapse-title font-semibold">日志</div>
            <div class="collapse-content overflow-auto max-h-32">
                <pre class="text-base-content/60 text-xs font-mona">{{ autoBuild.buildLog }}</pre>
            </div>
        </div>
    </div>
</template>
