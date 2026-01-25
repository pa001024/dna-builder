<script setup lang="ts">
import { provideClient } from "@urql/vue"
import { onMounted, watchEffect } from "vue"
import { gqClient } from "./api/graphql"
import Updater from "./components/Updater.vue"
import { env } from "./env"
import { useSettingStore } from "./store/setting"
import { useUIStore } from "./store/ui"

const setting = useSettingStore()
const ui = useUIStore()
watchEffect(() => {
    document.body.setAttribute("data-theme", setting.theme)
    document.body.style.background = setting.windowTrasnparent ? "transparent" : "var(--color-base-300)"
    document.documentElement.style.setProperty("--uiscale", String(setting.uiScale))
})
provideClient(gqClient)
if (env.isApp) {
    // 自动签到
    if (setting.autoSign) {
        setting.startAutoSign()
    }
} else {
    onMounted(() => {
        if (!setting.windowTrasnparent) return
        const app = document.getElementById("main-window")!
        app.style.backdropFilter = "blur(1px)"
        // 获取canvas对象
        const canvas = document.getElementById("background")! as HTMLCanvasElement
        // 获取画笔
        const ctx = canvas.getContext("2d")!

        // 设置canvas宽高
        canvas.height = innerHeight
        canvas.width = innerWidth

        // 定义一个粒子数组
        const particlesArray: Particle[] = []
        // 定义页面内粒子的数量
        const count = ~~((canvas.width / 80) * (canvas.height / 80))

        const angle = (72 / 180) * Math.PI
        // 定义粒子类
        class Particle {
            // x，y轴的移动速度  -0.5 -- 0.5
            directionX: number
            directionY: number
            size: number
            constructor(
                public x: number,
                public y: number
            ) {
                const speed = 0.5 + Math.random() * 1.5
                this.directionX = Math.cos(angle) * speed
                this.directionY = Math.sin(angle) * speed
                this.size = 1 + Math.random() * 1
            }

            // 更新点的坐标
            update() {
                this.x += this.directionX
                this.y += this.directionY
            }

            // 绘制粒子
            draw() {
                ctx.beginPath()
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
                ctx.closePath()
                ctx.fillStyle = "white"
                ctx.fill()
            }
        }

        // 创建粒子
        function createParticle() {
            // 计算当前角度下粒子出现的位置
            const random = Math.random()
            // 计算在垂直于角度方向平面上的投影长度
            const xProjection = Math.sin(angle) * innerWidth
            const yProjection = Math.cos(angle) * innerHeight
            const totalWeight = xProjection + yProjection
            let x, y
            // 粒子出现在画布的左边和上边
            if (angle >= 0 && angle < Math.PI / 2) {
                if (random < yProjection / totalWeight) {
                    // 粒子落在左边界
                    x = 0
                    y = innerHeight - (random * totalWeight) / Math.cos(angle) // 左边界的随机位置
                } else {
                    // 粒子落在上边界
                    x = (random * totalWeight) / Math.sin(angle) // 上边界的随机位置
                    y = 0
                }
            } else {
                x = 0
                y = 0
            }
            particlesArray.push(new Particle(x, y))
        }

        // 处理粒子
        // 先更新坐标，再绘制出来
        function handleParticle() {
            for (var i = 0; i < particlesArray.length; i++) {
                var particle = particlesArray[i]
                particle.update()
                particle.draw()
                // 超出范围就将这个粒子删除
                if (particle.x < 0 || particle.x > canvas.width || particle.y < 0 || particle.y > canvas.height) {
                    particlesArray.splice(i, 1)
                }
            }
        }

        function draw() {
            // 首先清空画布
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            // 如果粒子数量小于规定数量，就生成新的粒子
            if (particlesArray.length < count) {
                createParticle()
            }

            // 处理粒子
            handleParticle()
        }

        // setInterval(draw, 1000 / 60)
        requestAnimationFrame(function drawLoop() {
            draw()
            requestAnimationFrame(drawLoop)
        })
    })
}

onMounted(() => {
    ui.setLoginState(setting.dnaUserId !== 0)
    ui.startTimer()
})
</script>

<template>
    <canvas v-if="setting.windowTrasnparent && !env.isApp" id="background" class="fixed w-full h-full z-0 bg-indigo-300" />
    <Updater />
    <ResizeableWindow
        id="main-window"
        :title="ui.title || $t(`${String($route.name)}.title`, '')"
        darkable
        pinable
        :class="{ 'is-app': env.isApp }"
    >
        <RouterView v-slot="{ Component, route }">
            <transition name="slide-right">
                <KeepAlive v-if="route.meta.keepAlive">
                    <Suspense>
                        <component :is="Component" />
                        <template #fallback>
                            <div class="w-full h-full flex justify-center items-center">
                                <span class="loading loading-spinner loading-md" />
                            </div>
                        </template>
                    </Suspense>
                </KeepAlive>
                <div v-else :key="$route.path" class="w-full h-full overflow-hidden">
                    <ErrorBoundary>
                        <component :is="Component" />
                    </ErrorBoundary>
                </div>
            </transition>
        </RouterView>
        <template v-if="!$route.meta.noSidebar" #sidebar>
            <Sidebar />
        </template>
    </ResizeableWindow>
</template>

<style>
.slide-right-enter-active {
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-right-leave-active {
    transition: all 0.2s cubic-bezier(0.6, -0.28, 0.73, 0.04);
}

.slide-right-enter-from {
    opacity: 0;
    transform: translateX(-2rem);
}
.slide-right-leave-to {
    opacity: 0;
    transform: translateX(2rem);
}
</style>
