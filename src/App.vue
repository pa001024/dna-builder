<script setup lang="ts">
import { onMounted, watchEffect } from "vue"
import ResizeableWindow from "./components/ResizeableWindow.vue"
import { useSettingStore } from "./store/setting"
import { useUIStore } from "./store/ui"
import { useRoute } from "vue-router"
import { env } from "./env"
const setting = useSettingStore()
const ui = useUIStore()
const route = useRoute()
watchEffect(() => {
    document.body.setAttribute("data-theme", setting.theme)
    document.body.style.background = setting.windowTrasnparent ? "transparent" : "var(--color-base-300)"
    document.documentElement.style.setProperty("--uiscale", String(setting.uiScale))
})

if (env.isApp) {
    const font = new FontFace("SourceHanSansCN", "url(/fonts/SourceHanSansCN-VF.ttf)")
    document.fonts.add(font)
    font.load()
} else {
    onMounted(() => {
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
                public y: number,
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

                // let dx, dy, dist
                // // 绘制两个点之间的连线
                // for (var j = i + 1; j < particlesArray.length; j++) {
                //     dx = particlesArray[j].x - particlesArray[i].x
                //     dy = particlesArray[j].y - particlesArray[i].y
                //     dist = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2))
                //     if (dist < 100) {
                //         ctx.beginPath()
                //         ctx.strokeStyle = "rgba(55, 55, 255, " + (1 - dist / 100)
                //         ctx.moveTo(particlesArray[i].x, particlesArray[i].y)
                //         ctx.lineTo(particlesArray[j].x, particlesArray[j].y)
                //         ctx.closePath()
                //         ctx.lineWidth = 1
                //         ctx.stroke()
                //     }
                // }
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
</script>

<template>
    <canvas class="fixed w-full h-full z-0 bg-indigo-300" id="background" v-if="!env.isApp"></canvas>
    <ResizeableWindow :title="route.name === 'schat' ? ui.schatTitle : $t(`${String(route.name)}.title`)" darkable pinable id="main-window" :class="{ 'is-app': env.isApp }">
        <RouterView v-slot="{ Component, route }">
            <transition name="slide-right">
                <KeepAlive v-if="route.meta.keepAlive">
                    <Suspense>
                        <ErrorBoundary>
                            <component :is="Component" />
                        </ErrorBoundary>
                        <template #fallback>
                            <div class="w-full h-full flex justify-center items-center">
                                <span class="loading loading-spinner loading-md"></span>
                            </div>
                        </template>
                    </Suspense>
                </KeepAlive>
                <component :is="Component" :key="route.path" v-else />
            </transition>
        </RouterView>
        <template #sidebar>
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
