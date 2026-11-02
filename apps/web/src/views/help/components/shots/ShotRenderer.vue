<script setup lang="ts">
import { computed } from "vue"
import type { Scene } from "../../content/types"
import BuildShot from "./BuildShot.vue"
import CalloutShot from "./CalloutShot.vue"
import CardsShot from "./CardsShot.vue"
import CodeShot from "./CodeShot.vue"
import CommunityShot from "./CommunityShot.vue"
import CompareShot from "./CompareShot.vue"
import DashboardShot from "./DashboardShot.vue"
import DatabaseShot from "./DatabaseShot.vue"
import GraphShot from "./GraphShot.vue"
import LauncherShot from "./LauncherShot.vue"
import MapShot from "./MapShot.vue"
import ModalShot from "./ModalShot.vue"
import PaletteShot from "./PaletteShot.vue"
import RecapShot from "./RecapShot.vue"
import SettingsShot from "./SettingsShot.vue"
import StepsShot from "./StepsShot.vue"
import TimelineShot from "./TimelineShot.vue"
import TitleShot from "./TitleShot.vue"

const props = defineProps<{ scene: Scene; time: number; duration: number }>()

const common = computed(() => ({ time: props.time, duration: props.duration }))
</script>

<template>
    <TitleShot v-if="scene.shot.type === 'title'" :shot="scene.shot" v-bind="common" />
    <StepsShot v-else-if="scene.shot.type === 'steps'" :shot="scene.shot" v-bind="common" />
    <CardsShot v-else-if="scene.shot.type === 'cards'" :shot="scene.shot" v-bind="common" />
    <BuildShot v-else-if="scene.shot.type === 'build'" :shot="scene.shot" v-bind="common" />
    <TimelineShot v-else-if="scene.shot.type === 'timeline'" :shot="scene.shot" v-bind="common" />
    <DatabaseShot v-else-if="scene.shot.type === 'database'" :shot="scene.shot" v-bind="common" />
    <MapShot v-else-if="scene.shot.type === 'map'" :shot="scene.shot" v-bind="common" />
    <GraphShot v-else-if="scene.shot.type === 'graph'" :shot="scene.shot" v-bind="common" />
    <LauncherShot v-else-if="scene.shot.type === 'launcher'" :shot="scene.shot" v-bind="common" />
    <DashboardShot v-else-if="scene.shot.type === 'dashboard'" :shot="scene.shot" v-bind="common" />
    <CommunityShot v-else-if="scene.shot.type === 'community'" :shot="scene.shot" v-bind="common" />
    <ModalShot v-else-if="scene.shot.type === 'modal'" :shot="scene.shot" v-bind="common" />
    <SettingsShot v-else-if="scene.shot.type === 'settings'" :shot="scene.shot" v-bind="common" />
    <PaletteShot v-else-if="scene.shot.type === 'palette'" :shot="scene.shot" v-bind="common" />
    <CodeShot v-else-if="scene.shot.type === 'code'" :shot="scene.shot" v-bind="common" />
    <CompareShot v-else-if="scene.shot.type === 'compare'" :shot="scene.shot" v-bind="common" />
    <CalloutShot v-else-if="scene.shot.type === 'callout'" :shot="scene.shot" v-bind="common" />
    <RecapShot v-else-if="scene.shot.type === 'recap'" :shot="scene.shot" v-bind="common" />
</template>
