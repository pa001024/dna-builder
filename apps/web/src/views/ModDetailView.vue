<template>
    <!-- 独立详情页（窗口栏已提供返回按钮，页面内不再重复） -->
    <div class="h-full w-full max-w-4xl mx-auto px-3 py-3 flex flex-col min-h-0">
        <GameModDetail :mod-id="String($route.params.id)" class="flex-1 min-h-0" />
    </div>
</template>
