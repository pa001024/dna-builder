<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import HelpCatalog from "./components/HelpCatalog.vue"
import HelpPlayer from "./components/HelpPlayer.vue"
import { provideHelpText } from "./content/locale"
import { HELP_TUTORIALS } from "./content/registry"
import "./help.css"

provideHelpText()

const route = useRoute()
const router = useRouter()
const activeId = ref<string | null>(null)

const activeTutorial = computed(() => HELP_TUTORIALS.find(tutorial => tutorial.id === activeId.value) ?? null)

function readRoute() {
    const id = typeof route.query.t === "string" ? route.query.t : null
    activeId.value = HELP_TUTORIALS.some(tutorial => tutorial.id === id) ? id : null
}

readRoute()
watch(() => route.query.t, readRoute)

function openTutorial(id: string) {
    activeId.value = id
    void router.replace({ query: { ...route.query, t: id } })
}

function closeTutorial() {
    activeId.value = null
    const query = { ...route.query }
    delete query.t
    void router.replace({ query })
}
</script>

<template>
    <div class="h-full min-h-0 bg-base-200/40">
        <Transition name="help-page" mode="out-in">
            <HelpCatalog v-if="!activeTutorial" key="catalog" @play="openTutorial" />
            <HelpPlayer v-else :key="activeTutorial.id" :tutorial="activeTutorial" @close="closeTutorial" />
        </Transition>
    </div>
</template>
