<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { iconticketData } from "@/data/d/iconticket.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedTicketId = useSearchParam<number>("id", 0)

const selectedTicket = computed(() => {
    return selectedTicketId.value ? iconticketData.find(ticket => ticket.id === selectedTicketId.value) || null : null
})

const filteredTickets = computed(() => {
    const query = searchKeyword.value.trim()
    if (!query) {
        return iconticketData
    }

    return iconticketData.filter(ticket => {
        if (`${ticket.id}`.includes(query) || ticket.name.includes(query)) {
            return true
        }

        return matchPinyin(ticket.name, query).match
    })
})

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedTicket }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        :placeholder="$t('iron-ticket.searchPlaceholder')"
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                        <div
                            v-for="ticket in filteredTickets"
                            :key="ticket.id"
                            class="p-3 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedTicketId === ticket.id }"
                            @click="selectedTicketId = ticket.id"
                        >
                            <div class="flex flex-col items-center gap-2 text-center">
                                <ImageFallback
                                    :src="`/imgs/res/${ticket.icon}.webp`"
                                    :alt="ticket.name"
                                    class="w-14 h-14 rounded shrink-0"
                                    :class="`bg-linear-15 ${getRarityGradientClass(ticket.rarity)}`"
                                >
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="ticket.name" class="w-14 h-14 rounded shrink-0" />
                                </ImageFallback>
                                <div class="min-w-0 w-full">
                                    <div class="font-medium truncate">{{ ticket.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">{{ $t("iron-ticket.id") }}: {{ ticket.id }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            <div
                v-if="selectedTicket"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedTicketId = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedTicket" class="flex-1">
                <DBIronTicketDetailItem :ticket="selectedTicket" class="flex-1" />
            </ScrollArea>
        </div>
    </div>
</template>
