<template>
    <div class="h-full">
        <div class="p-4 grid grid-cols-2 lg:grid-cols-4 w-full justify-items-center gap-4">
            <RouterLink
                to="/game"
                class="container flex flex-col justify-center items-center p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg"
            >
                <div class="text-primary">
                    <Icon icon="la:gamepad-solid" class="w-12 h-12" />
                </div>
                <div class="text-xl font-bold text-primary">
                    {{ $t("game.title") }}
                </div>
                <div class="text-sm text-gray-500">{{ $t("game.desc") }}</div>
            </RouterLink>
        </div>
    </div>
</template>
