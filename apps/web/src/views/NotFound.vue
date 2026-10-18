<script lang="ts" setup></script>

<template>
    <div class="h-full flex flex-col items-center justify-center min-h-96">
        <div class="text-center space-y-6">
            <!-- 404 错误图标 -->
            <div class="text-primary">
                <Icon icon="ri:error-warning-line" class="w-32 h-32 sm:w-48 sm:h-48 mx-auto" />
            </div>

            <!-- 错误标题 -->
            <h1 class="text-6xl sm:text-8xl font-bold text-primary">404</h1>

            <!-- 错误描述 -->
            <p class="text-xl sm:text-2xl text-gray-500">{{ $t("notfound.title") }}</p>

            <!-- 返回首页按钮 -->
            <RouterLink to="/" class="btn btn-primary btn-lg">
                <Icon icon="ri:home-line" class="w-6 h-6" />
                <span>{{ $t("notfound.back_home") }}</span>
            </RouterLink>
        </div>
    </div>
</template>
