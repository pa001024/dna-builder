<template>
    <div class="game-container w-full h-full mx-auto font-sans bg-gray-900 text-white overflow-y-auto flex flex-col">
        <!-- 顶部状态栏 -->
        <div class="bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center">
            <h1 class="text-xl font-bold text-primary flex items-center">
                <span class="mr-2">🧬</span>
                二重螺旋自走棋
            </h1>
            <div class="flex items-center space-x-3">
                <button
                    class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition-colors"
                    @click="openSettings"
                    aria-label="设置"
                >
                    <span class="text-base">⚙️</span>
                </button>
            </div>
        </div>
        <!-- 游戏状态栏 -->
        <div class="grid grid-cols-4 gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
            <!-- 等级与经验 -->
            <div class="bg-gray-700 rounded-md p-2 flex flex-col items-center justify-center">
                <div class="text-xs text-gray-400 mb-1">等级 / 经验</div>
                <div class="text-lg font-bold">{{ playerLevel }}</div>
                <div class="w-full bg-gray-600 rounded-full h-1 mt-1 overflow-hidden">
                    <div class="bg-blue-500 h-full transition-all duration-300 ease-in-out" :style="{ width: xpPercentage + '%' }"></div>
                </div>
            </div>

            <!-- 金币信息 -->
            <div class="bg-gray-700 rounded-md p-2 flex flex-col items-center justify-center">
                <div class="text-xs text-gray-400 mb-1">金币 / 收益</div>
                <div class="text-lg font-bold text-yellow-400 flex items-center"><span class="mr-1">🪙</span>{{ playerGold }}</div>
            </div>

            <!-- 生命值信息 -->
            <div class="bg-gray-700 rounded-md p-2 flex flex-col items-center justify-center">
                <div class="text-xs text-gray-400 mb-1">生命值</div>
                <div class="text-lg font-bold text-red-400 flex items-center"><span class="mr-1">❤️</span>{{ playerHealth }}</div>
            </div>

            <!-- 回合信息 -->
            <div class="bg-gray-700 rounded-md p-2 flex flex-col items-center justify-center">
                <div class="text-xs text-gray-400 mb-1">回合 / 阶段</div>
                <div class="text-lg font-bold text-purple-400">{{ currentRound }}</div>
            </div>
        </div>

        <!-- 商店区域 -->
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-4 transition-all duration-300 shadow-lg hover:shadow-xl">
            <h3 class="text-blue-400 border-b border-gray-700 pb-2 mb-3 font-semibold flex justify-between items-center">
                <span class="text-sm">招募系统 - 等级 {{ playerLevel }}</span>
                <button
                    class="btn bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-3 py-1 rounded-md transition-all duration-300"
                    :disabled="playerGold < 2"
                    :class="{ 'opacity-50 cursor-not-allowed': playerGold < 2 }"
                    @click="refreshShop"
                >
                    <span class="mr-1">🔄</span> 刷新 (2🪙)
                </button>
            </h3>
            <div class="grid grid-cols-5 gap-2 transition-all duration-300">
                <div
                    v-for="(shopItem, index) in shopItems"
                    :key="index"
                    class="cursor-pointer transition-all duration-200 hover:-translate-y-1.5 hover:shadow-lg hover:z-10"
                    :class="{
                        'opacity-50 cursor-not-allowed': playerGold < getCost(shopItem),
                        'hover:scale-105 hover:shadow-xl hover:shadow-blue-900/30': playerGold >= getCost(shopItem) && !inBattle,
                    }"
                    @click="playerGold >= getCost(shopItem) && buyCharacter(shopItem)"
                >
                    <div
                        class="bg-gray-700 border border-gray-600 rounded-md p-1.5 h-full flex flex-col justify-center items-center relative overflow-hidden transition-all duration-300 hover:border-blue-500 hover:-translate-y-1 hover:shadow-xl"
                    >
                        <!-- 角色或武器头像 -->
                        <div
                            class="relative w-16 h-16 mb-1.5 overflow-hidden bg-gray-800 rounded-md border border-gray-600 flex items-center justify-center"
                        >
                            <img
                                v-if="shopItem.character || shopItem.weapon"
                                :src="getCharacterImage(shopItem.character?.name || shopItem.weapon?.name || '')"
                                :alt="shopItem.character?.name || shopItem.weapon?.name || ''"
                                class="w-full h-full object-cover transition-all duration-300 hover:scale-110 animate-scaleIn"
                            />
                            <div v-else class="text-gray-500 text-xl">?</div>
                            <div
                                class="absolute inset-0 bg-[rgba(79,70,229,0.1)] opacity-0 hover:opacity-100 transition-opacity duration-300"
                            ></div>
                            <!-- 物品类型指示器 -->
                            <div
                                v-if="shopItem.weapon"
                                class="absolute top-0 right-0 bg-purple-500 text-white text-[10px] px-1 py-0.5 rounded-bl"
                            >
                                武器
                            </div>
                            <!-- 费用指示 -->
                            <div
                                class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900 to-transparent py-1 px-0.5 flex justify-center"
                            >
                                <span class="text-yellow-400 font-bold text-xs flex items-center">
                                    <span class="mr-0.5">🪙</span>{{ getCost(shopItem) }}</span
                                >
                            </div>
                        </div>

                        <!-- 物品名称 -->
                        <div class="text-center w-full">
                            <h4 class="text-[10px] text-white font-medium truncate">
                                {{ shopItem.character?.name || shopItem.weapon?.name }}
                            </h4>
                            <p v-if="shopItem.character?.attribute" class="text-xs text-gray-400 mt-0.5">
                                {{ shopItem.character.attribute }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 敌方阵容区域 -->
        <div
            class="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-4 transition-all duration-300 shadow-md hover:shadow-lg"
            v-if="enemyTeam.length > 0"
        >
            <h3 class="text-red-400 border-b border-gray-700 pb-2 mb-3 font-semibold text-sm text-center">敌方阵容</h3>
            <div class="grid grid-cols-3 md:grid-cols-9 gap-1.5 p-2 bg-gray-700 rounded-lg mx-auto">
                <div
                    v-for="(enemy, index) in enemyTeam"
                    :key="index"
                    class="aspect-square bg-gray-800 border border-red-900/40 rounded-md p-1 flex flex-col justify-center items-center relative overflow-hidden transition-all duration-300 hover:border-red-500"
                    :style="{
                        filter: enemy.currentHealth === 0 ? 'grayscale(100%)' : 'grayscale(0%)',
                        opacity: enemy.currentHealth === 0 ? '0.6' : '1',
                    }"
                >
                    <div
                        class="relative w-10 h-10 mb-0.5 overflow-hidden bg-gray-700 rounded border border-red-900/30 flex items-center justify-center"
                    >
                        <img :src="getCharacterImage(enemy.name)" :alt="enemy.name" class="w-full h-full object-cover" />
                        <div class="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent opacity-50"></div>
                        <div class="absolute bottom-0 left-0 right-0 py-0.5 px-1 flex justify-center">
                            <span class="text-yellow-400 text-xs font-bold">⭐ {{ enemy.starLevel }}</span>
                        </div>
                    </div>
                    <div class="character-info text-center w-full">
                        <h4 class="text-xs text-white truncate font-medium">
                            {{ enemy.name }}

                            <span v-if="enemy.attribute" class="text-xs text-gray-400">{{ enemy.attribute }}</span>
                        </h4>

                        <!-- 血量条 -->
                        <div class="health-bar-container w-full h-[3px] bg-gray-900 rounded-full mt-1 overflow-hidden">
                            <div
                                class="health-bar h-full transition-all duration-300"
                                :style="{
                                    width: `${calculateHealthPercentage(enemy)}%`,
                                    backgroundColor: getHealthColor(enemy),
                                }"
                            ></div>
                        </div>
                    </div>
                </div>
                <div
                    v-for="n in 9 - enemyTeam.length"
                    :key="'empty-' + n"
                    class="aspect-square bg-gray-800 border border-dashed border-gray-600/50 rounded-md flex items-center justify-center"
                >
                    <div class="text-gray-500 text-xs">?</div>
                </div>
            </div>
        </div>

        <!-- 棋盘区域 -->
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-4 transition-all duration-300 shadow-md hover:shadow-lg">
            <h3 class="text-green-400 border-b border-gray-700 pb-2 mb-3 font-semibold text-sm text-center">我的阵容</h3>
            <div class="grid grid-cols-3 md:grid-cols-9 gap-2 p-2 bg-gray-700 rounded-lg mx-auto">
                <div
                    v-for="(slot, index) in boardSlots"
                    :key="index"
                    class="aspect-square bg-gray-800 border border-gray-600/50 rounded-md cursor-pointer transition-all duration-200 hover:bg-gray-700 flex items-center justify-center relative overflow-hidden"
                    @click="selectedCharacterIndex !== -1 ? placeCharacter(index) : slot ? retrieveCharacter(index) : null"
                    @dragover="allowDrop($event)"
                    @drop="dropCharacter(index, $event)"
                    :class="{ 'border-2 border-blue-500 bg-blue-900/10': selectedCharacterIndex !== -1 && !slot }"
                >
                    <div
                        v-if="slot"
                        class="character-container w-full h-full bg-gray-700 border border-gray-600/50 rounded-md p-1 flex flex-col justify-center items-center relative overflow-hidden transition-all duration-300 hover:shadow-lg"
                        :data-character-id="slot.uniqueId"
                    >
                        <div class="relative w-10 h-10 mb-1">
                            <img
                                :src="getCharacterImage(slot.name)"
                                :alt="slot.name"
                                class="w-full h-full aspect-square object-cover rounded-md bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-500/30"
                            />
                            <!-- 物品类型指示器 -->
                            <div class="absolute -top-1 -left-1 bg-gray-900 text-[#e2e8f0] text-[8px] px-1 rounded border border-gray-600">
                                {{ slot.attribute }}
                            </div>
                            <!-- 费用指示 -->
                            <div
                                class="absolute -top-1 -right-1 bg-[#ffc107] text-black text-[8px] font-bold px-1 rounded border border-gray-600"
                            >
                                ⭐{{ slot.starLevel }}
                            </div>
                        </div>
                        <!-- 物品名称和血量条 -->
                        <div class="character-info text-center w-full">
                            <h4 class="text-xs text-[#e2e8f0] font-medium truncate">
                                {{ slot.name }}

                                <span class="text-xs text-gray-400">{{ slot.attribute }}</span>
                            </h4>

                            <!-- 血量条 -->
                            <div class="health-bar-container w-full h-[3px] bg-gray-900 rounded-full mt-0.5 overflow-hidden">
                                <div
                                    class="health-bar h-full transition-all duration-300"
                                    :style="{
                                        width: `${calculateHealthPercentage(slot)}%`,
                                        backgroundColor: getHealthColor(slot),
                                    }"
                                ></div>
                            </div>

                            <p v-if="slot.equippedWeapon" class="text-xs text-cyan-400">🗡️ {{ slot.equippedWeapon.name }}</p>
                        </div>
                        <div class="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                        <div
                            class="retrieve-hint absolute bottom-1 left-1/2 transform -translate-x-1/2 text-[10px] text-[#6c757d] opacity-0 hover:opacity-100 transition-opacity"
                        >
                            点击撤回
                        </div>
                    </div>
                    <div v-else class="text-[#555] text-center">
                        {{ selectedCharacterIndex !== -1 ? "放置角色" : index + 1 }}
                    </div>
                </div>
            </div>
        </div>

        <!-- 备战区 -->
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-4 transition-all duration-300 shadow-md hover:shadow-lg">
            <h3 class="text-yellow-400 border-b border-gray-700 pb-2 mb-3 font-semibold text-sm text-center">备战区</h3>
            <div class="grid grid-cols-3 md:grid-cols-9 gap-2">
                <div
                    v-for="(benchItem, index) in benchItems"
                    :key="index"
                    :data-index="index"
                    class="cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:z-10"
                    :class="{ 'ring-2 ring-[#4a9eff] rounded-lg p-0.5': selectedCharacterIndex === index }"
                    @click="selectCharacterForPlacement(benchItem, index)"
                    @doubleclick="equipWeapon(index)"
                    draggable="true"
                    @dragstart="startDragCharacter(benchItem, index, $event)"
                    @dragover="allowWeaponDrop($event)"
                    @drop="equipWeaponWithDrag(index, $event)"
                >
                    <div
                        class="bg-gray-700 border border-gray-600/50 rounded-md p-2 h-full flex flex-col justify-center items-center relative overflow-hidden shadow-md transition-all duration-300 hover:bg-gray-600"
                        :data-character-id="benchItem.uniqueId"
                    >
                        <div class="relative aspect-square w-10 h-10 mb-1 flex items-center justify-center">
                            <img
                                :src="getCharacterImage(benchItem.name)"
                                :alt="benchItem.name"
                                class="w-full h-full object-cover rounded-md bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-500/30"
                            />
                            <!-- 物品类型指示器 -->
                            <div class="absolute -top-1 -left-1 bg-gray-900 text-[#e2e8f0] text-[8px] px-1 rounded border border-gray-600">
                                {{ benchItem.attribute }}
                            </div>
                            <!-- 费用指示 -->
                            <div
                                class="absolute -top-1 -right-1 bg-[#ffc107] text-black text-[8px] font-bold px-1 rounded border border-gray-600"
                            >
                                ⭐{{ benchItem.starLevel }}
                            </div>
                        </div>
                        <div class="character-info text-center w-full">
                            <h4 class="text-xs text-[#e2e8f0] font-medium truncate">
                                {{ benchItem.name }}

                                <span class="text-xs text-gray-400">{{ benchItem.attribute }}</span>
                            </h4>
                            <p
                                v-if="benchItem.count > 1"
                                class="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded"
                            >
                                {{ benchItem.count }}/3
                            </p>
                            <p v-if="benchItem.equippedWeapon" class="text-xs text-cyan-400">🗡️ {{ benchItem.equippedWeapon.name }}</p>
                        </div>
                        <div class="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 武器栏 -->
        <div class="weapon-inventory">
            <h3>武器栏</h3>
            <div class="weapon-items">
                <div
                    v-for="(weapon, index) in weaponsInventory"
                    :key="index"
                    class="weapon-item bg-gray-800 border border-gray-700 hover:border-gray-500 p-2 rounded-md transition-all duration-200 hover:shadow-md flex items-center gap-2 cursor-pointer"
                    :class="{ 'ring-2 ring-blue-500 bg-blue-900/10': selectedWeaponIndex === index }"
                    @click="selectWeapon(weapon, index)"
                    draggable="true"
                    @dragstart="startDragWeapon(weapon, index, $event)"
                >
                    <div class="weapon-icon text-xl">🗡️</div>
                    <div class="weapon-info">
                        <div class="name text-white font-medium text-sm">{{ weapon.name }}</div>
                        <div class="type text-gray-400 text-xs">{{ weapon.type }} {{ weapon.category }}</div>
                        <div class="stats flex gap-2 text-xs">
                            <span class="attack text-orange-400">⚔️ {{ weapon.基础攻击 }}</span>
                            <span class="crit text-blue-400">💎 {{ weapon.基础暴击 }}</span>
                            <span class="crit-dmg text-purple-400">💥 {{ weapon.基础暴伤 }}x</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="tip text-gray-400 text-xs italic mt-2">提示: 选择武器后双击角色进行装备，或直接拖动武器到角色上</div>
        </div>

        <!-- 战斗控制区 -->
        <div class="flex flex-wrap gap-3 justify-center my-5">
            <button
                class="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-2 rounded-md font-bold text-white transition-all duration-200 hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30"
                @click="startBattle"
                :disabled="inBattle"
            >
                开始战斗
            </button>
            <button
                class="bg-gradient-to-r from-yellow-600 to-yellow-500 px-6 py-2 rounded-md font-bold text-white transition-all duration-200 hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg shadow-yellow-900/30"
                @click="levelUp"
            >
                升级 ({{ playerLevel }}金币)
            </button>
            <button
                class="bg-gradient-to-r from-red-600 to-red-500 px-6 py-2 rounded-md font-bold text-white transition-all duration-200 hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg shadow-red-900/30"
                @click="endTurn"
            >
                结束回合
            </button>
            <button
                class="bg-gradient-to-r from-purple-600 to-purple-500 px-6 py-2 rounded-md font-bold text-white transition-all duration-200 hover:scale-105 shadow-lg shadow-purple-900/30"
                @click="saveGame"
            >
                保存游戏
            </button>
            <button
                class="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-2 rounded-md font-bold text-white transition-all duration-200 hover:scale-105 shadow-lg shadow-indigo-900/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600"
                :disabled="!hasSavedGame()"
                @click="loadGame"
            >
                加载游戏
            </button>
            <button
                class="bg-gradient-to-r from-green-600 to-green-500 px-6 py-2 rounded-md font-bold text-white transition-all duration-200 hover:scale-105 shadow-lg shadow-green-900/30"
                v-if="gameOver"
                @click="restartGame"
            >
                重新开始
            </button>
        </div>

        <!-- 游戏结束遮罩 -->
    </div>

    <!-- 武器类型匹配提示 -->
    <div
        v-if="showWeaponTip"
        class="fixed bg-gray-800 text-white text-xs px-3 py-2 rounded-md shadow-xl z-50 pointer-events-none border border-gray-700 animate-fadeIn"
        :style="{ left: `${weaponTipPosition.x}px`, top: `${weaponTipPosition.y}px` }"
    >
        {{ weaponTipMessage }}
    </div>

    <!-- 游戏设置面板 -->
    <div v-if="showSettings" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fadeIn">
        <div
            class="bg-gray-800 border-2 border-gray-700 rounded-lg p-6 max-w-md w-full mx-4 transform transition-all duration-300 animate-slideIn shadow-xl"
        >
            <h2 class="text-xl text-center text-blue-400 font-bold mb-6 pb-3 border-b border-gray-700">游戏设置</h2>

            <div class="mb-5">
                <label class="block text-[#e2e8f0] mb-2 font-medium">音效开关</label>
                <div class="flex items-center bg-gray-700 rounded-md p-3 transition-all duration-200 hover:bg-gray-650">
                    <input type="checkbox" v-model="gameSettings.soundEnabled" class="mr-3 h-5 w-5 accent-blue-500" />
                    <span class="text-[#e2e8f0]">{{ gameSettings.soundEnabled ? "开启" : "关闭" }}</span>
                </div>
            </div>

            <div class="mb-5">
                <label class="block text-[#e2e8f0] mb-2 font-medium">战斗动画速度</label>
                <select
                    v-model="gameSettings.battleSpeed"
                    class="bg-gray-700 text-[#e2e8f0] border border-gray-600 rounded-md w-full p-3 transition-all duration-200 hover:border-blue-500/50 focus:outline-none focus:border-blue-500"
                >
                    <option value="slow">慢速</option>
                    <option value="normal">正常</option>
                    <option value="fast">快速</option>
                </select>
            </div>

            <div class="mb-6">
                <label class="block text-[#e2e8f0] mb-2 font-medium">显示战斗日志</label>
                <div class="flex items-center bg-gray-700 rounded-md p-3 transition-all duration-200 hover:bg-gray-650">
                    <input type="checkbox" v-model="gameSettings.showBattleLog" class="mr-3 h-5 w-5 accent-blue-500" />
                    <span class="text-[#e2e8f0]">{{ gameSettings.showBattleLog ? "显示" : "隐藏" }}</span>
                </div>
            </div>

            <button
                class="bg-gradient-to-r from-blue-600 to-blue-500 text-white w-full py-3 rounded-md font-bold transition-all duration-300 hover:shadow-lg hover:shadow-blue-900/30"
                @click="closeSettings"
            >
                关闭设置
            </button>
        </div>
    </div>

    <div v-if="gameOver" class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 animate-fadeIn">
        <div
            class="bg-gray-800 border-2 border-orange-500 rounded-lg p-6 max-w-md w-full mx-4 transform transition-all duration-300 animate-slideIn shadow-2xl"
        >
            <h2 class="text-2xl text-center text-orange-400 font-bold mb-6 pb-3 border-b border-gray-700">游戏结束</h2>
            <div class="mb-6 space-y-3">
                <p class="text-[#e2e8f0] text-center font-medium">你坚持了 {{ currentRound }} 回合</p>
                <p class="text-[#e2e8f0] text-center font-medium">最高连胜: {{ consecutiveWins }} 场</p>
                <p class="text-[#e2e8f0] text-center font-medium">最终阵容强度: {{ calculatePlayerPower() }}</p>
            </div>
            <button
                class="bg-gradient-to-r from-green-600 to-green-500 text-white w-full py-3 rounded-md font-bold transition-all duration-300 hover:shadow-lg hover:shadow-green-900/30"
                @click="restartGame"
            >
                重新开始
            </button>
        </div>
    </div>

    <!-- 战斗日志 -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-5 transition-all duration-300 hover:shadow-lg">
        <h3 class="text-purple-400 border-b border-gray-700 pb-2 mb-3 font-semibold text-sm flex justify-between items-center">
            <span>战斗日志</span>
            <button class="text-xs text-gray-400 hover:text-gray-300 transition-colors" @click="battleLogs.length = 0">清除</button>
        </h3>
        <div class="h-40 overflow-y-auto custom-scrollbar bg-gray-700/50 rounded-md p-2">
            <p
                v-for="(log, index) in battleLogs"
                :key="index"
                class="text-sm text-[#e2e8f0] mb-1.5 last:mb-0 pb-1.5 border-b border-gray-700/50 last:border-0"
            >
                {{ log }}
            </p>
            <div v-if="battleLogs.length === 0" class="h-full flex items-center justify-center text-gray-500 text-sm">暂无战斗记录</div>
        </div>

        <!-- 伤害数字层 -->
        <div class="damage-numbers-container">
            <transition-group name="damage-number">
                <div
                    v-for="number in damageNumbers"
                    :key="number.id"
                    class="damage-number"
                    :class="`damage-${number.type}`"
                    :style="{
                        left: `${number.x}px`,
                        top: `${number.y}px`,
                        transform: `translate(-50%, -50%)`,
                    }"
                >
                    {{ number.text }}
                </div>
            </transition-group>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from "vue"
import gsap from "gsap"
import gameData from "../data/data.json"

// 类型定义
// 生成唯一ID的辅助函数
function generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

interface Character {
    name: string
    attribute: string
    基础攻击: number
    基础生命: number
    基础防御: number
    基础神智: number // 新增属性，用于判断攻击优先级
    近战: string
    远程: string
    starLevel: number
    count: number
    equippedWeapon?: Weapon
    skills?: Skill[]
    // 战斗相关属性
    currentHealth?: number
    maxHealth?: number
    animatedHealth?: number
    position?: number
    // 唯一标识，用于定位特定角色实例
    uniqueId: string
    // 所属团队标识
    team?: string // player或enemy
}

interface Weapon {
    name: string
    type: string // "近战" 或 "远程"
    category: string
    基础攻击: number
    基础暴击: number
    基础暴伤: number
    // 添加额外属性
    effects?: WeaponEffect[]
    description?: string
}

interface Skill {
    name: string
    description: string
    damage?: number
    cooldown?: number
    type: "主动" | "被动"
    targetType: "单体" | "群体" | "自身"
}

interface WeaponEffect {
    type: string
    value: number
    targetAttribute: string
    description: string
}

interface ShopItem {
    character?: Character
    weapon?: Weapon
    cost: number
    rarity: "普通" | "精英" | "传说"
}

// interface BattleLogEntry {
//     message: string
//     timestamp: number
//     type: "system" | "combat" | "item" | "error"
// }

interface GameSettings {
    soundEnabled: boolean
    battleSpeed: "slow" | "normal" | "fast"
    showBattleLog: boolean
}

// 完整的游戏存档数据结构
interface GameSaveData {
    version: string
    timestamp: number
    playerState: {
        level: number
        xp: number
        gold: number
        health: number
        consecutiveWins: number
        consecutiveLosses: number
    }
    gameProgress: {
        currentRound: number
        enemyTeam: any[]
    }
    gameBoard: {
        boardSlots: (Character | null)[]
        benchItems: Character[]
    }
    inventory: {
        weaponsInventory: Weapon[]
    }
    settings: GameSettings
}

// 游戏状态
// interface GameState {
//     playerLevel: number
//     playerXp: number
//     playerGold: number
//     playerHealth: number
//     currentRound: number
//     consecutiveWins: number
//     consecutiveLosses: number
// }

// interface BattleEvent {
//     type: "attack" | "skill" | "death" | "victory" | "defeat"
//     message: string
//     timestamp: number
// }

// 游戏状态
const playerLevel = ref(1)
const playerXp = ref(0)
const playerGold = ref(10)
const playerHealth = ref(100)
const currentRound = ref(1)
const inBattle = ref(false)
const selectedCharacterIndex = ref(-1)
const consecutiveWins = ref(0)
const consecutiveLosses = ref(0)
const gameOver = ref(false)
const damageNumbers = ref<
    { id: number; text: string; x: number; y: number; type: "normal" | "critical" | "heal"; scale?: number; opacity?: number }[]
>([])
// let damageIdCounter = 0 // 未使用的变量已注释

// 武器类型匹配提示
const showWeaponTip = ref(false)
const weaponTipMessage = ref("")
const weaponTipPosition = reactive({ x: 0, y: 0 })

// 游戏设置
const showSettings = ref(false)
const gameSettings = ref<GameSettings>({
    soundEnabled: true,
    battleSpeed: "normal",
    showBattleLog: true,
})
const enemyTeam = ref<any[]>([]) // 敌方阵容

// 棋盘和备战区
const boardSlots = ref<(Character | null)[]>([null, null, null, null, null, null, null, null, null])
const benchItems = ref<Character[]>([])
const shopItems = ref<ShopItem[]>([])
const battleLogs = ref<string[]>([])
// const battleHistory = ref<BattleEvent[]>([]) // 暂未使用的变量

// 武器库和物品栏
const weaponsInventory = ref<Weapon[]>([])
const selectedWeaponIndex = ref(-1)

// 计算属性
const xpNeededForNextLevel = computed(() => playerLevel.value * 10)
const xpPercentage = computed(() => (playerXp.value / xpNeededForNextLevel.value) * 100)

// 缓存当前棋盘角色数量
const currentBoardCharacterCount = computed(() => boardSlots.value.filter((slot) => slot !== null).length)

// 缓存玩家团队数据（用于战斗计算）
const playerTeamForBattle = computed(() =>
    boardSlots.value
        .filter((slot) => slot !== null)
        .map((char) => ({
            ...char,
            currentHealth: char.基础生命,
            maxHealth: char.基础生命,
            alive: true,
        })),
)

// 缓存商店可用物品
// const availableShopItems = computed(() => shopItems.value.filter((item) => item && playerGold.value >= item.cost))

// 缓存可用武器列表
// const availableWeapons = computed(() => weaponsInventory.value.filter((weapon) => weapon))

// 缓存敌人等级
const currentEnemyLevel = computed(() => Math.min(9, Math.floor(currentRound.value / 3) + 1))

// 缓存当前回合金币奖励
// const currentRoundGoldReward = computed(() => 5 + Math.floor(currentRound.value / 5) + Math.min(3, Math.floor(consecutiveWins.value / 3)))

// 缓存利息收入
const currentInterest = computed(() => Math.min(5, Math.floor(playerGold.value / 10)))

// 游戏设置控制函数
function openSettings() {
    showSettings.value = true
}

function closeSettings() {
    showSettings.value = false
}

// 根据游戏设置获取延迟时间
function getBattleDelay(ms: number): number {
    const speedMap = {
        slow: 1.5, // 慢速：1.5倍时间
        normal: 1, // 正常：原始时间
        fast: 0.5, // 快速：0.5倍时间
    }
    return ms * speedMap[gameSettings.value.battleSpeed]
}

// 播放音效（预留接口）
function playSound(soundType: string) {
    if (gameSettings.value.soundEnabled) {
        // 这里可以添加实际的音效播放逻辑
        console.log(`播放音效: ${soundType}`)
    }
}

// 保存游戏到localStorage
function saveGame() {
    try {
        const saveData: GameSaveData = {
            version: "1.0",
            timestamp: Date.now(),
            playerState: {
                level: playerLevel.value,
                xp: playerXp.value,
                gold: playerGold.value,
                health: playerHealth.value,
                consecutiveWins: consecutiveWins.value,
                consecutiveLosses: consecutiveLosses.value,
            },
            gameProgress: {
                currentRound: currentRound.value,
                enemyTeam: enemyTeam.value,
            },
            gameBoard: {
                boardSlots: JSON.parse(JSON.stringify(boardSlots.value)),
                benchItems: JSON.parse(JSON.stringify(benchItems.value)),
            },
            inventory: {
                weaponsInventory: JSON.parse(JSON.stringify(weaponsInventory.value)),
            },
            settings: JSON.parse(JSON.stringify(gameSettings.value)),
        }

        localStorage.setItem("dnaBuilderGameSave", JSON.stringify(saveData))
        addBattleLog("游戏保存成功！")
        playSound("save")
    } catch (error) {
        console.error("保存游戏失败:", error)
        addBattleLog("保存游戏失败！")
    }
}

// 从localStorage加载游戏
function loadGame() {
    try {
        const saveDataString = localStorage.getItem("dnaBuilderGameSave")
        if (!saveDataString) {
            addBattleLog("没有找到保存的游戏！")
            return false
        }

        const saveData: GameSaveData = JSON.parse(saveDataString)

        // 恢复玩家状态
        playerLevel.value = saveData.playerState.level
        playerXp.value = saveData.playerState.xp
        playerGold.value = saveData.playerState.gold
        playerHealth.value = saveData.playerState.health
        consecutiveWins.value = saveData.playerState.consecutiveWins
        consecutiveLosses.value = saveData.playerState.consecutiveLosses

        // 恢复游戏进度
        currentRound.value = saveData.gameProgress.currentRound
        enemyTeam.value = saveData.gameProgress.enemyTeam

        // 恢复棋盘和备战区
        boardSlots.value = saveData.gameBoard.boardSlots
        benchItems.value = saveData.gameBoard.benchItems

        // 恢复物品栏
        weaponsInventory.value = saveData.inventory.weaponsInventory

        // 恢复游戏设置
        gameSettings.value = saveData.settings

        // 重置战斗状态
        inBattle.value = false
        gameOver.value = false

        // 重新生成商店物品
        initializeShop()

        addBattleLog("游戏加载成功！")
        playSound("load")
        return true
    } catch (error) {
        console.error("加载游戏失败:", error)
        addBattleLog("加载游戏失败！")
        return false
    }
}

// 检查是否有保存的游戏
function hasSavedGame(): boolean {
    return localStorage.getItem("dnaBuilderGameSave") !== null
}

// 添加回delay函数定义，使用window.Promise确保兼容性
function delay(ms: number) {
    // 根据游戏设置调整延迟时间
    const actualDelay = getBattleDelay(ms)
    return new (window.Promise || Promise)((resolve: any) => {
        setTimeout(resolve, actualDelay)
    })
}

// 获取角色图片（使用默认图片，因为实际图片路径需要确认）
function getCharacterImage(name: string): string {
    // 检查public/imgs目录下是否有对应图片
    // 由于无法动态检查文件存在性，使用try-catch和默认图片策略
    const imagePath = `/imgs/${encodeURIComponent(name)}.png`
    return imagePath
}

// 获取角色招募费用 - 接受任何类型，解决类型兼容性问题
function getCost(characterOrWeapon: any): number {
    // 提取属性值而不修改参数类型
    let attack = 0
    let health = 0

    if (characterOrWeapon.character) {
        attack = characterOrWeapon.character.基础攻击
        health = characterOrWeapon.character.基础生命
    } else if (characterOrWeapon.weapon) {
        // 武器只考虑攻击力
        attack = characterOrWeapon.weapon.基础攻击
    }

    // 根据属性确定费用
    if (attack > 300 || health > 2000) {
        return 5
    } else if (attack > 250 || health > 1500) {
        return 4
    } else if (attack > 200 || health > 1200) {
        return 3
    } else if (attack > 150) {
        return 2
    }
    return 1
}

// 获取武器费用
function getWeaponCost(weaponData: Weapon): number {
    if (weaponData.基础攻击 > 300) return 5
    if (weaponData.基础攻击 > 250) return 4
    if (weaponData.基础攻击 > 200) return 3
    if (weaponData.基础攻击 > 150) return 2
    return 1
}

// 计算金币利息
function calculateGoldInterest(): number {
    // 每10金币获得1利息，最高5利息
    // 使用缓存的计算属性
    return currentInterest.value
}

// 初始化商店
function initializeShop() {
    const availableCharacters = gameData.char || []
    const availableWeapons = gameData.weapon || []
    const newShopItems: ShopItem[] = []

    // 随机选择商店内容，70%概率是角色，30%概率是武器
    for (let i = 0; i < 5; i++) {
        const isCharacter = Math.random() < 0.7

        if (isCharacter && availableCharacters.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableCharacters.length)
            const charData = availableCharacters[randomIndex]
            const character: Character = {
                name: charData.名称,
                attribute: charData.属性,
                基础攻击: charData.基础攻击,
                基础生命: charData.基础生命,
                基础防御: charData.基础防御,
                基础神智: charData.基础神智 || 50,
                近战: charData.近战,
                远程: charData.远程,
                starLevel: 1,
                count: 1,
                skills: undefined, // 暂时设为undefined避免类型错误
                uniqueId: generateUniqueId(),
            }

            newShopItems.push({
                character,
                cost: getCost(character),
                rarity: "普通",
            })
        } else if (availableWeapons.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableWeapons.length)
            const weaponData = availableWeapons[randomIndex]
            const weapon: Weapon = {
                name: weaponData.名称,
                type: weaponData.类型,
                category: weaponData.类别,
                基础攻击: weaponData.基础攻击,
                基础暴击: weaponData.基础暴击,
                基础暴伤: weaponData.基础暴伤,
            }

            newShopItems.push({
                weapon,
                cost: getWeaponCost(weapon),
                rarity: "普通",
            })
        }
    }

    shopItems.value = newShopItems
}

// 刷新商店
function refreshShop() {
    if (playerGold.value >= 2) {
        playerGold.value -= 2
        initializeShop()
        addBattleLog("刷新了商店！消耗2金币")
    }
}

// 升级等级
function levelUp() {
    const cost = playerLevel.value
    if (playerGold.value >= cost && playerLevel.value < 9) {
        // 播放升级音效
        playSound("level_up")
        playerGold.value -= cost
        playerLevel.value += 1
        addBattleLog(`花费${cost}金币升级到等级${playerLevel.value}！`)
    }
}

// 购买商店物品 - 模板中实际调用的是buyCharacter
function buyCharacter(shopItem: ShopItem) {
    // 由于buyCharacter在模板中被调用但只传了一个参数，我们创建一个简化版本
    if (playerGold.value < shopItem.cost) return
    // 播放购买音效
    playSound("purchase")

    playerGold.value -= shopItem.cost

    // 找到当前shopItem在shopItems数组中的索引
    const index = shopItems.value.findIndex(
        (item) =>
            (item.character?.name === shopItem.character?.name && item.character?.starLevel === shopItem.character?.starLevel) ||
            item.weapon?.name === shopItem.weapon?.name,
    )

    if (shopItem.character) {
        const character = { ...shopItem.character, uniqueId: generateUniqueId() }

        // 检查是否可以升级已有的相同角色
        const existingCharacterIndex = benchItems.value.findIndex((item) => item.name === character.name)

        if (existingCharacterIndex !== -1) {
            const existingChar = benchItems.value[existingCharacterIndex]
            // 3个相同角色可以合成更高星级
            if (existingChar.starLevel < 3 && existingChar.count >= 2) {
                existingChar.starLevel += 1
                existingChar.count = 1
                // 升级后提升属性
                existingChar.基础攻击 = Math.floor(existingChar.基础攻击 * 1.8)
                existingChar.基础生命 = Math.floor(existingChar.基础生命 * 1.8)
                addBattleLog(`${character.name}升级到了${existingChar.starLevel}星！属性大幅提升！`)
            } else {
                existingChar.count += 1
                addBattleLog(`获得了1个${character.name}！当前数量: ${existingChar.count}/3`)
            }
        } else if (benchItems.value.length < 8) {
            // 添加新角色到备战区
            benchItems.value.push(character)
            addBattleLog(`招募了${character.name}！`)

            // 添加购买成功动画效果
            if (index !== -1) playBuyAnimation(index)
        } else {
            addBattleLog("备战区已满！无法购买更多角色")
            playerGold.value += shopItem.cost // 返还金币
            return
        }
    } else if (shopItem.weapon) {
        // 购买武器
        weaponsInventory.value.push({ ...shopItem.weapon })
        addBattleLog(`购买了武器${shopItem.weapon.name}！`)

        // 添加购买成功动画效果
        if (index !== -1) playBuyAnimation(index)
    }

    // 从商店移除已购买物品并刷新空位
    if (index !== -1) refreshShopItem(index)
}

// 购买动画效果
function playBuyAnimation(index: number) {
    const element = document.querySelector(`.shop-item:nth-child(${index + 1})`)
    if (element) {
        element.classList.add("fade-out")
        setTimeout(() => {
            element.classList.remove("fade-out")
        }, 300)
    }
}

// 刷新单个商店物品
function refreshShopItem(index: number) {
    const availableCharacters = gameData.char || []
    const availableWeapons = gameData.weapon || []
    const isCharacter = Math.random() < 0.7

    if (isCharacter && availableCharacters.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableCharacters.length)
        const charData = availableCharacters[randomIndex]
        const character: Character = {
            name: charData.名称,
            attribute: charData.属性,
            基础攻击: charData.基础攻击,
            基础生命: charData.基础生命,
            基础防御: charData.基础防御,
            基础神智: charData.基础神智 || 50,
            近战: charData.近战,
            远程: charData.远程,
            starLevel: 1,
            uniqueId: generateUniqueId(),
            count: 1,
            skills: undefined,
        }

        shopItems.value[index] = {
            character,
            cost: getCost(character),
            rarity: "普通", // 添加默认稀有度属性
        }
    } else if (availableWeapons.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableWeapons.length)
        const weaponData = availableWeapons[randomIndex]
        const weapon: Weapon = {
            name: weaponData.名称,
            type: weaponData.类型,
            category: weaponData.类别,
            基础攻击: weaponData.基础攻击,
            基础暴击: weaponData.基础暴击,
            基础暴伤: weaponData.基础暴伤,
        }

        shopItems.value[index] = {
            weapon,
            cost: getWeaponCost(weapon),
            rarity: "普通", // 添加默认稀有度属性
        }
    }
}

// 选择备战区角色
function selectCharacterForPlacement(_character: Character, index: number) {
    // 使用下划线前缀表示未使用的参数
    // 如果当前选中的是武器，则取消武器选择
    if (selectedWeaponIndex.value !== -1) {
        selectedWeaponIndex.value = -1
    }

    selectedCharacterIndex.value = selectedCharacterIndex.value === index ? -1 : index
}

// 开始拖动角色
function startDragCharacter(_character: Character, index: number, event: DragEvent) {
    // 如果当前选中的是武器，则取消武器选择
    if (selectedWeaponIndex.value !== -1) {
        selectedWeaponIndex.value = -1
    }

    // 设置拖动数据
    if (event.dataTransfer) {
        // 存储角色在备战区的索引
        event.dataTransfer.setData("application/json", JSON.stringify({ index }))
        // 设置拖动时的视觉效果
        event.dataTransfer.effectAllowed = "copy"
    }

    // 选中该角色
    selectedCharacterIndex.value = index
}

// 拖动经过棋盘插槽
function allowDrop(event: DragEvent) {
    // 阻止默认行为以允许放置
    if (event) {
        event.preventDefault()
        // 设置视觉反馈
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy"
        }
    }
}

// 放置角色到棋盘
function dropCharacter(slotIndex: number, event: DragEvent) {
    if (event) {
        event.preventDefault()

        // 获取拖动的数据
        try {
            const dragData = JSON.parse(event.dataTransfer?.getData("application/json") || "{}")
            const benchIndex = dragData.index

            // 确保有角色被拖动且目标插槽有效
            if (benchIndex !== undefined && benchItems.value[benchIndex]) {
                // 调用现有的放置逻辑
                placeCharacterWithDrag(benchIndex, slotIndex)
            }
        } catch (e) {
            console.error("Failed to parse drag data:", e)
        }
    }
}

// 带拖放的角色放置逻辑
function placeCharacterWithDrag(benchIndex: number, slotIndex: number) {
    // 确保目标插槽为空
    if (!boardSlots.value[slotIndex]) {
        // 检查棋盘是否已满（根据等级限制）
        const currentBoardCount = currentBoardCharacterCount.value
        if (currentBoardCount >= playerLevel.value) {
            addBattleLog(`等级${playerLevel.value}只能放置${playerLevel.value}个角色在棋盘上！`)
            return
        }

        // 将备战区角色移到棋盘
        boardSlots.value[slotIndex] = {
            ...benchItems.value[benchIndex],
        }

        // 从备战区移除
        benchItems.value.splice(benchIndex, 1)
        selectedCharacterIndex.value = -1

        addBattleLog("放置了一个角色到棋盘！")
    }
}

// 选择武器
function selectWeapon(_weapon: Weapon, index: number) {
    // 使用下划线前缀表示未使用的参数
    // 如果当前选中的是角色，则取消角色选择
    if (selectedCharacterIndex.value !== -1) {
        selectedCharacterIndex.value = -1
    }

    selectedWeaponIndex.value = selectedWeaponIndex.value === index ? -1 : index
}

// 开始拖动武器
function startDragWeapon(_weapon: Weapon, index: number, event: DragEvent): void {
    if (event.dataTransfer) {
        // 设置拖动数据
        event.dataTransfer.setData("weaponIndex", index.toString())
        event.dataTransfer.effectAllowed = "move"

        // 添加拖动开始的视觉效果
        if (event.target instanceof HTMLElement) {
            event.target.classList.add("dragging")
            // 拖动结束后移除样式
            setTimeout(() => {
                if (event.target instanceof HTMLElement) {
                    event.target.classList.remove("dragging")
                }
            }, 0)
        }
    }
}

// 允许武器拖放到角色上
function allowWeaponDrop(event: DragEvent): void {
    event.preventDefault()

    // 获取武器索引和角色索引
    const weaponIndexStr = event.dataTransfer?.getData("weaponIndex")
    const characterCard = event.currentTarget as HTMLElement
    const characterIndex = parseInt(characterCard.dataset.index || "0")

    // 移除之前的拖放样式
    document.querySelectorAll(".bench-item").forEach((el) => {
        el.classList.remove("drag-over", "drag-over-invalid")
    })

    // 隐藏之前的提示
    showWeaponTip.value = false

    if (weaponIndexStr !== null) {
        const weaponIndex = parseInt(weaponIndexStr || "0")
        const weapon = weaponsInventory.value[weaponIndex]
        const character = benchItems.value[characterIndex]

        if (weapon && character) {
            // 检查武器类型是否匹配
            const isMatch = checkWeaponTypeMatch(weapon, character)

            if (isMatch) {
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move"
                }
                characterCard.classList.add("drag-over")
            } else {
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "none"
                }
                characterCard.classList.add("drag-over-invalid")

                // 显示不匹配提示
                showWeaponMatchTip(`武器类型不匹配！${character.name}无法装备${weapon.name}`, event)
            }
        }
    }
}

// 通过拖放装备武器
function equipWeaponWithDrag(characterIndex: number, event: DragEvent): void {
    event.preventDefault()

    // 移除所有拖放样式
    document.querySelectorAll(".bench-item").forEach((el) => {
        el.classList.remove("drag-over", "drag-over-invalid")
    })

    // 隐藏提示
    showWeaponTip.value = false

    if (event.dataTransfer) {
        const weaponIndex = parseInt(event.dataTransfer.getData("weaponIndex"))
        if (!isNaN(weaponIndex) && weaponsInventory.value[weaponIndex]) {
            // 设置选中的武器索引
            selectedWeaponIndex.value = weaponIndex
            // 调用现有的装备武器函数
            equipWeapon(characterIndex)
        }
    }
}

// 检查武器类型是否匹配
function checkWeaponTypeMatch(weapon: Weapon, character: Character): { matched: boolean; reason: string } {
    // 处理string类型的近战/远程属性
    const canUseMelee =
        character.近战 === "true" || character.近战 === "是" || character.近战 === "近战" || character.近战 === "1" || !!character.近战
    const canUseRanged =
        character.远程 === "true" || character.远程 === "是" || character.远程 === "远程" || character.远程 === "1" || !!character.远程

    const isMeleeMatch = weapon.type === "近战" && canUseMelee
    const isRangedMatch = weapon.type === "远程" && canUseRanged

    if (isMeleeMatch) {
        return { matched: true, reason: "近战武器匹配成功" }
    } else if (isRangedMatch) {
        return { matched: true, reason: "远程武器匹配成功" }
    } else if (weapon.type === "近战" && !canUseMelee) {
        return { matched: false, reason: "该角色无法使用近战武器" }
    } else if (weapon.type === "远程" && !canUseRanged) {
        return { matched: false, reason: "该角色无法使用远程武器" }
    } else {
        return { matched: false, reason: "武器类型不匹配" }
    }
}

// 显示武器匹配提示
function showWeaponMatchTip(message: string, event: DragEvent) {
    weaponTipMessage.value = message
    if (event.clientX && event.clientY) {
        weaponTipPosition.x = event.clientX
        weaponTipPosition.y = event.clientY - 40
    }
    showWeaponTip.value = true

    // 3秒后自动隐藏提示
    setTimeout(() => {
        showWeaponTip.value = false
    }, 3000)
}

// 装备武器
function equipWeapon(characterIndex: number): { success: boolean; message: string } {
    if (selectedWeaponIndex.value !== -1 && benchItems.value[characterIndex]) {
        const character = benchItems.value[characterIndex]
        const weapon = weaponsInventory.value[selectedWeaponIndex.value]

        // 使用统一的类型匹配检查函数
        const matchResult = checkWeaponTypeMatch(weapon, character)

        if (matchResult.matched) {
            // 如果角色已有武器，先移除旧武器
            if (character.equippedWeapon) {
                weaponsInventory.value.push(character.equippedWeapon)
            }

            character.equippedWeapon = weapon
            weaponsInventory.value.splice(selectedWeaponIndex.value, 1)
            selectedWeaponIndex.value = -1
            addBattleLog(`${character.name}装备了${weapon.name}！`)
            return { success: true, message: `${character.name}装备了${weapon.name}！` }
        } else {
            // 添加更详细的不匹配提示
            const canUseMelee =
                character.近战 === "true" ||
                character.近战 === "是" ||
                character.近战 === "近战" ||
                character.近战 === "1" ||
                !!character.近战
            const canUseRanged =
                character.远程 === "true" ||
                character.远程 === "是" ||
                character.远程 === "远程" ||
                character.远程 === "1" ||
                !!character.远程

            let compatibleTypes = []
            if (canUseMelee) compatibleTypes.push("近战")
            if (canUseRanged) compatibleTypes.push("远程")

            const message = `${character.name}只能装备${compatibleTypes.join("/") || "未知"}武器，无法装备${weapon.name}！`
            addBattleLog(message)
            return { success: false, message }
        }
    } else if (selectedWeaponIndex.value === -1) {
        addBattleLog("请先选择要装备的武器！")
        return { success: false, message: "请先选择要装备的武器！" }
    }
    // 默认返回值
    return { success: false, message: "操作无效" }
}

// 放置角色到棋盘 (保留原功能，兼容点击方式)
function placeCharacter(slotIndex: number) {
    if (selectedCharacterIndex.value !== -1) {
        // 调用新的拖放逻辑函数，但使用当前选中的角色索引
        placeCharacterWithDrag(selectedCharacterIndex.value, slotIndex)
    }
}

// 从棋盘取回角色
function retrieveCharacter(slotIndex: number) {
    if (boardSlots.value[slotIndex] && benchItems.value.length < 8) {
        // 将棋盘角色移回备战区
        benchItems.value.push({ ...boardSlots.value[slotIndex]! })

        // 清空棋盘位置
        boardSlots.value[slotIndex] = null

        addBattleLog("将角色撤回备战区！")
    } else if (benchItems.value.length >= 8) {
        addBattleLog("备战区已满！无法撤回角色")
    }
}

// 开始战斗
function startBattle() {
    if (inBattle.value || gameOver.value) return
    // 播放战斗开始音效
    playSound("battle_start")

    // 检查棋盘是否有角色
    const hasCharacters = boardSlots.value.some((slot) => slot !== null)
    if (!hasCharacters) {
        addBattleLog("棋盘上没有角色！请先放置角色")
        return
    }

    inBattle.value = true
    addBattleLog("准备战斗...")

    // 添加战斗准备动画延迟，使用setTimeout替代await
    setTimeout(() => {
        // 生成敌人阵容
        const enemyTeam = generateEnemyTeam()

        // 模拟战斗过程
        simulateBattle(enemyTeam).then((battleResult) => {
            // 战斗结束后的处理
            currentRound.value += 1

            // 基础奖励
            // 基础奖励
            let goldReward = 5 + Math.floor(currentRound.value / 5)

            if (battleResult.victory) {
                // 胜利奖励
                consecutiveWins.value += 1
                consecutiveLosses.value = 0

                // 连胜奖励
                if (consecutiveWins.value >= 3) {
                    // 添加连胜奖励
                    goldReward += Math.min(3, Math.floor(consecutiveWins.value / 3))
                }

                addBattleLog(`战斗胜利！获得${goldReward}金币！连胜${consecutiveWins.value}场`)
            } else {
                // 失败惩罚
                consecutiveLosses.value += 1
                consecutiveWins.value = 0

                // 失败惩罚
                const damage = Math.max(5, 10 - consecutiveLosses.value)
                playerHealth.value = Math.max(0, playerHealth.value - damage)

                // 连败补偿
                if (consecutiveLosses.value >= 3) {
                    goldReward += 1
                }

                addBattleLog(`战斗失败！失去${damage}生命值！获得${goldReward}金币补偿`)
            }

            // 发放金币奖励
            playerGold.value += goldReward

            // 发放经验
            playerXp.value += 5 + battleResult.kills

            // 计算利息
            const interest = calculateGoldInterest()
            if (interest > 0) {
                // 使用缓存的利息计算
                playerGold.value += currentInterest.value
                addBattleLog(`获得${interest}金币利息`)
            }

            // 检查是否升级
            checkLevelUp()

            // 检查游戏是否结束
            if (playerHealth.value <= 0) {
                gameOver.value = true
                addBattleLog("游戏结束！你的生命值降至0！")
            }

            // 战斗结果显示延迟
            setTimeout(() => {
                inBattle.value = false

                // 重置棋盘角色状态（恢复生命值等）
                resetBoardCharacters()
            }, 1500)
        })
    }, 1000)
}

// 生成敌人阵容
function generateEnemyTeam() {
    // 使用缓存的敌人等级
    const enemyLevel = currentEnemyLevel.value
    const availableCharacters = gameData.char || []
    const newEnemyTeam = []

    // 根据回合数生成敌人阵容强度
    // 计算敌人强度倍数
    const enemyPowerMultiplier = 1 + currentRound.value * 0.1

    // 随机选择敌人角色
    for (let i = 0; i < enemyLevel && i < 9; i++) {
        if (availableCharacters.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableCharacters.length)
            const charData = availableCharacters[randomIndex]

            // 随机星级（1-2，后期可能有3星）
            const starLevel = Math.min(3, Math.floor(Math.random() * 2) + 1 + Math.floor(currentRound.value / 10))

            const enemyHealth = Math.floor(charData.基础生命 * enemyPowerMultiplier)
            const enemyCharacter = {
                name: charData.名称,
                attribute: charData.属性,
                基础攻击: Math.floor(charData.基础攻击 * enemyPowerMultiplier),
                基础生命: enemyHealth,
                基础防御: Math.floor(charData.基础防御 * enemyPowerMultiplier),
                基础神智: Math.floor((charData.基础神智 || 50) * enemyPowerMultiplier), // 添加基础神智属性，用于攻击优先级判定
                currentHealth: enemyHealth,
                maxHealth: enemyHealth,
                animatedHealth: enemyHealth,
                starLevel,
                skills: charData.技能,
                uniqueId: generateUniqueId(),
            }

            newEnemyTeam.push(enemyCharacter)
        }
    }

    // 更新敌方阵容数据供UI展示
    enemyTeam.value = newEnemyTeam
    return newEnemyTeam
}

// 重置棋盘角色状态
function resetBoardCharacters() {
    boardSlots.value.forEach((slot) => {
        if (slot) {
            ;(slot as any).currentHealth = slot.基础生命
            ;(slot as any).maxHealth = slot.基础生命
            ;(slot as any).animatedHealth = slot.基础生命
        }
    })
}

// 计算角色血量百分比
function calculateHealthPercentage(character: Character): number {
    if (!character.maxHealth || !character.currentHealth) return 100
    return Math.max(0, Math.min(100, (character.currentHealth / character.maxHealth) * 100))
}
// 根据角色血量百分比返回不同颜色
function getHealthColor(character: Character): string {
    const percentage = calculateHealthPercentage(character)

    if (percentage > 70) {
        return "#4caf50" // 绿色
    } else if (percentage > 40) {
        return "#ff9800" // 橙色
    } else {
        return "#f44336" // 红色
    }
}

// 血量变化动画函数 - 使用GSAP实现
function animateHealthChange(character: Character, oldHealth: number, newHealth: number) {
    // 如果没有animatedHealth属性，初始化它
    if (character.animatedHealth === undefined) {
        character.animatedHealth = oldHealth
    }

    // 根据血量变化幅度动态计算动画持续时间
    const healthDifference = Math.abs(newHealth - oldHealth)
    const duration = Math.min(600, Math.max(250, healthDifference * 8)) / 1000 // 转换为秒并动态调整：变化越大，时间越长

    // 使用GSAP实现平滑动画
    gsap.to(character, {
        animatedHealth: newHealth,
        duration: duration,
        ease: "power3.out", // 使用GSAP的power3.out缓动函数，类似之前的easeOutCubic
        onComplete: () => {
            // 确保最终值准确
            character.animatedHealth = newHealth
        },
    })
}
// 模拟战斗
async function simulateBattle(enemyTeam: any[]) {
    const battleRounds = 10 // 最多10回合战斗
    // 使用缓存的玩家团队数据
    let playerTeam = playerTeamForBattle.value.map((char) => ({
        ...char,
        // 确保currentHealth正确设置
        currentHealth: char.基础生命,
        team: "player", // 标识玩家团队
    }))

    // 为敌人添加团队标识
    enemyTeam.forEach((enemy) => {
        enemy.team = "enemy"
    })

    let enemyAlive = enemyTeam.length
    let playerAlive = playerTeam.length
    let kills = 0

    // 添加战斗开始日志
    addBattleLog("战斗开始！")

    // 战斗过程 - 按照速度顺序行动
    for (let round = 1; round <= battleRounds && enemyAlive > 0 && playerAlive > 0; round++) {
        addBattleLog(`第${round}回合开始`)

        // 创建包含所有单位的数组，添加team标识并过滤只保留存活单位
        const allUnits: Character[] = []

        // 添加存活的玩家角色
        for (let i = 0; i < playerTeam.length; i++) {
            const char = playerTeam[i]
            if (char.currentHealth && char.currentHealth > 0) {
                allUnits.push(char)
            }
        }

        // 添加存活的敌人
        for (let i = 0; i < enemyTeam.length; i++) {
            const enemy = enemyTeam[i]
            if (enemy.currentHealth && enemy.currentHealth > 0) {
                allUnits.push(enemy)
            }
        }

        // 根据基础神智属性排序，速度高的先攻击
        for (let i = 0; i < allUnits.length - 1; i++) {
            for (let j = i + 1; j < allUnits.length; j++) {
                const unit1 = allUnits[i]
                const unit2 = allUnits[j]
                if ((unit1.基础神智 || 0) < (unit2.基础神智 || 0)) {
                    // 交换位置
                    const temp = allUnits[i]
                    allUnits[i] = allUnits[j]
                    allUnits[j] = temp
                }
            }
        }

        // 让每个单位按照排序顺序进行攻击
        for (const attacker of allUnits) {
            // 跳过已死亡的单位
            if (!attacker.currentHealth || attacker.currentHealth <= 0) continue

            // 根据攻击者的团队确定目标团队
            const targetTeam = attacker.team === "player" ? enemyTeam : playerTeam
            const hasAliveTargetTeam = attacker.team === "player" ? enemyAlive > 0 : playerAlive > 0

            if (hasAliveTargetTeam) {
                // 动画延迟，让战斗过程更可视化
                await delay(300)

                // 寻找一个活着的目标
                let target = null
                for (let i = 0; i < targetTeam.length; i++) {
                    const potentialTarget = targetTeam[i]
                    if (potentialTarget.currentHealth && potentialTarget.currentHealth > 0) {
                        target = potentialTarget
                        break
                    }
                }

                if (target) {
                    let damage = 0
                    let isCritical = false

                    // 根据攻击者是玩家还是敌人计算伤害
                    if (attacker.team === "player") {
                        const result = calculateDamageWithCrit(attacker)
                        damage = result.damage
                        isCritical = result.isCritical
                    } else {
                        // 敌人伤害计算，考虑防御
                        damage = Math.max(1, (attacker.基础攻击 || 1) - (target.基础防御 || 0) * 0.1)
                    }

                    const oldHealth = target.currentHealth || 0
                    const newHealth = Math.max(0, oldHealth - damage)
                    target.currentHealth = newHealth

                    // 如果是玩家角色被攻击，更新UI显示
                    if (target.team === "player") {
                        // 同步更新boardSlots中对应角色的血量，确保UI正确更新
                        for (let i = 0; i < boardSlots.value.length; i++) {
                            const slot = boardSlots.value[i]
                            if (slot && slot.name === target.name && slot.starLevel === target.starLevel) {
                                slot.currentHealth = target.currentHealth
                                break
                            }
                        }
                    }

                    // 播放攻击动画，传递目标信息
                    if (attacker.name) {
                        playAttackAnimation(attacker, target)
                    }

                    // 延迟添加受击动画和显示伤害数字，模拟攻击过程
                    setTimeout(() => {
                        // 血量动画效果
                        animateHealthChange(target, oldHealth, target.currentHealth || 0)

                        // 添加战斗伤害动画类到对应角色容器
                        flashCharacterDamage(target)

                        // 显示伤害数字动画
                        showDamageNumber(target, damage, attacker.team === "player" && isCritical ? "critical" : "normal")
                    }, 200)

                    // 添加战斗日志
                    if (attacker.team === "player" && isCritical) {
                        addBattleLog(`${attacker.name}对${target.name}造成了${damage}点暴击伤害！`)
                    } else {
                        addBattleLog(`${attacker.name}对${target.name}造成了${damage}点伤害`)
                    }

                    // 处理目标死亡
                    if (target.currentHealth === 0) {
                        if (target.team === "enemy") {
                            enemyAlive--
                            kills++
                            addBattleLog(`${attacker.name}击败了${target.name}！`)
                        } else {
                            playerAlive--
                            addBattleLog(`${attacker.name}击败了${target.name}！`)
                        }
                    }

                    // 如果某一方全灭，提前结束回合
                    if (enemyAlive === 0 || playerAlive === 0) {
                        break
                    }
                }
            }
        }
    }

    // 添加战斗结束日志
    await delay(500)

    // 判断胜负
    const victory = enemyAlive === 0
    if (victory) {
        addBattleLog("战斗胜利！")
        // 给所有存活角色添加胜利动画
        addVictoryAnimation()
    } else {
        addBattleLog("战斗失败！")
    }

    return { victory, kills }
}

// 计算角色伤害，包含暴击判断
function calculateDamageWithCrit(character: Character): { damage: number; isCritical: boolean } {
    let damage = character.基础攻击 * character.starLevel
    let isCritical = false

    // 如果有装备武器，增加攻击力
    if (character.equippedWeapon) {
        damage += character.equippedWeapon.基础攻击

        // 计算暴击几率
        const critChance = character.equippedWeapon.基础暴击 || 0
        if (Math.random() < critChance) {
            isCritical = true
            const critDamageMultiplier = character.equippedWeapon.基础暴伤 || 2
            damage *= critDamageMultiplier
        }
    }

    return { damage: Math.floor(damage), isCritical }
}

// 添加角色伤害闪烁动画 - 增强版 (使用GSAP)
function flashCharacterDamage(character: Character) {
    const element = document.querySelector(`[data-character-id="${character.uniqueId}"]`)
    if (element) {
        // 同时运行两个GSAP动画

        // 1. 摇晃动画
        gsap.fromTo(
            element,
            { x: 0 },
            {
                x: 5,
                duration: 0.05,
                yoyo: true,
                repeat: 3,
                ease: "power1.inOut",
            },
        )

        // 2. 受击闪烁效果
        gsap.fromTo(
            element,
            { filter: "brightness(1)" },
            {
                filter: "brightness(0.7) invert(30%)",
                duration: 0.25,
                yoyo: true,
                repeat: 1,
                ease: "power2.inOut",
            },
        )
    }
}

// 治疗效果动画 - 预留功能
// @ts-ignore - 预留功能，暂时未使用
function flashHealEffect(character: Character) {
    // 使用uniqueId来精确选择特定角色实例
    const element = document.querySelector(`[data-character-id="${character.uniqueId}"]`)
    if (element) {
        // 添加治疗绿色光晕效果
        const healEffect = document.createElement("div")
        healEffect.className = "heal-effect"
        healEffect.style.position = "absolute"
        healEffect.style.top = "-10px"
        healEffect.style.left = "-10px"
        healEffect.style.width = "120%"
        healEffect.style.height = "120%"
        healEffect.style.borderRadius = "50%"
        healEffect.style.backgroundColor = "rgba(72, 219, 105, 0.3)"
        healEffect.style.zIndex = "50"

        element.appendChild(healEffect)

        // 使用GSAP实现治疗脉冲动画
        gsap.fromTo(
            healEffect,
            { scale: 0.8, opacity: 0.8 },
            {
                scale: 1.2,
                opacity: 0,
                duration: 1,
                ease: "power2.out",
                onComplete: () => {
                    try {
                        element.removeChild(healEffect)
                    } catch (e) {
                        // 忽略DOM移除错误
                    }
                },
            },
        )
    }
}

// 攻击动画效果 - 改进版：角色向目标移动并返回
function playAttackAnimation(character: Character, target?: Character) {
    // 使用uniqueId来精确选择特定角色实例
    const element = document.querySelector(`[data-character-id="${character.uniqueId}"]`)
    if (element) {
        // 先清除所有可能残留的样式属性，确保正确还原
        gsap.set(element, { clearProps: "all" })

        // 如果有目标，实现向目标移动的动画
        if (target) {
            const targetElement = document.querySelector(`[data-character-id="${target.uniqueId}"]`)
            if (targetElement) {
                // 获取攻击者和目标的位置信息
                const attackerRect = element.getBoundingClientRect()
                const targetRect = targetElement.getBoundingClientRect()
                const parentRect = element.parentElement?.getBoundingClientRect()

                if (parentRect) {
                    // 计算移动方向和距离
                    const attackerCenterX = attackerRect.left - parentRect.left + attackerRect.width / 2
                    const attackerCenterY = attackerRect.top - parentRect.top + attackerRect.height / 2
                    const targetCenterX = targetRect.left - parentRect.left + targetRect.width / 2
                    const targetCenterY = targetRect.top - parentRect.top + targetRect.height / 2

                    // 计算移动向量
                    const dx = targetCenterX - attackerCenterX
                    const dy = targetCenterY - attackerCenterY
                    const distance = Math.sqrt(dx * dx + dy * dy)

                    // 确定移动距离为两者距离的70%（不直接碰撞）
                    const moveDistance = distance * 0.7
                    const moveX = (dx / distance) * moveDistance
                    const moveY = (dy / distance) * moveDistance

                    // 使用GSAP实现移动攻击动画
                    gsap.fromTo(
                        element,
                        { x: 0, y: 0, scale: 1, filter: "brightness(1)" },
                        {
                            x: moveX,
                            y: moveY,
                            scale: 1.1,
                            filter: "brightness(1.3)",
                            duration: 0.2,
                            ease: "power2.out",
                            onComplete: () => {
                                // 攻击动画完成后返回原位
                                gsap.fromTo(
                                    element,
                                    { x: moveX, y: moveY, scale: 1.1, filter: "brightness(1.3)" },
                                    {
                                        x: 0,
                                        y: 0,
                                        scale: 1,
                                        filter: "brightness(1)",
                                        duration: 0.2,
                                        ease: "power2.in",
                                        onComplete: () => {
                                            // 确保完全还原到初始状态
                                            gsap.set(element, { clearProps: "all" })
                                        },
                                    },
                                )
                            },
                        },
                    )
                    return // 有目标的动画已处理，提前返回
                }
            }
        }

        // 如果没有目标或无法计算移动，使用默认的攻击动画
        gsap.fromTo(
            element,
            { scale: 1, filter: "brightness(1)" },
            {
                scale: 1.1,
                filter: "brightness(1.3)",
                duration: 0.15,
                yoyo: true,
                repeat: 1,
                ease: "power2.inOut",
                onComplete: () => {
                    // 确保完全还原到初始状态，移除forceSet属性
                    gsap.set(element, { clearProps: "all" })
                },
            },
        )
    }
}

// 显示伤害数字动画 - 增强版 (使用GSAP)
function showDamageNumber(character: Character, damage: number, type: "normal" | "critical" | "heal" = "normal") {
    // 使用uniqueId来精确选择特定角色实例
    const element = document.querySelector(`[data-character-id="${character.uniqueId}"]`)
    if (element) {
        const rect = element.getBoundingClientRect()
        const parentRect = element.parentElement?.getBoundingClientRect()
        if (parentRect) {
            // 创建伤害数字元素
            const damageNumberElement = document.createElement("div")
            damageNumberElement.style.position = "absolute"
            damageNumberElement.style.pointerEvents = "none"
            damageNumberElement.style.zIndex = "100"
            damageNumberElement.style.fontWeight = "bold"
            damageNumberElement.style.textAlign = "center"

            // 添加微小随机偏移，使多个数字动画看起来更自然
            const randomOffset = (Math.random() - 0.5) * 20
            const x = rect.left - parentRect.left + rect.width / 2 + randomOffset
            const y = rect.top - parentRect.top + rect.height / 4

            damageNumberElement.style.left = `${x}px`
            damageNumberElement.style.top = `${y}px`
            damageNumberElement.style.transform = "translate(-50%, -50%)"

            // 设置文本内容和颜色
            if (type === "heal") {
                damageNumberElement.textContent = `+${damage}`
                damageNumberElement.style.color = "#4ade80" // 绿色
            } else {
                damageNumberElement.textContent = damage.toString()
                damageNumberElement.style.color = type === "critical" ? "#fb923c" : "#ef4444" // 橙色/红色
            }

            // 将伤害数字元素添加到角色的父元素中
            element.parentElement?.appendChild(damageNumberElement)

            // 根据伤害类型设置不同的动画参数
            let initialScale = 1
            // let initialOpacity = 1 // 未使用的变量已注释
            let duration = 1

            if (type === "critical") {
                initialScale = 1.5 // 暴击初始更大
                duration = 1.2 // 暴击动画持续更长
                damageNumberElement.style.fontSize = "1.5rem"
            } else if (type === "heal") {
                initialScale = 1.2 // 治疗也有一些特殊效果
                duration = 0.9
                damageNumberElement.style.fontSize = "1.2rem"
            } else {
                damageNumberElement.style.fontSize = "1.1rem"
            }

            // 使用GSAP实现动画
            gsap.fromTo(
                damageNumberElement,
                {
                    scale: initialScale,
                    opacity: 1,
                },
                {
                    scale: 1,
                    opacity: 0,
                    y: "-30px",
                    duration: duration,
                    ease: "power2.out",
                    onComplete: () => {
                        // 动画结束后移除元素
                        try {
                            damageNumberElement.remove()
                        } catch (e) {
                            // 忽略DOM移除错误
                        }
                    },
                },
            )
        }
    }
}

// 添加胜利动画到所有存活角色 (使用GSAP)
function addVictoryAnimation() {
    const aliveCharacters = document.querySelectorAll(".character-container")
    aliveCharacters.forEach((element) => {
        // 使用GSAP实现胜利庆祝动画
        gsap.fromTo(
            element,
            { y: 0, scale: 1, filter: "brightness(1)" },
            {
                y: -10, // 向上弹跳
                scale: 1.1, // 稍微放大
                filter: "brightness(1.3) saturate(1.2)", // 变亮变饱和
                duration: 0.3,
                yoyo: true,
                repeat: 4, // 重复多次
                ease: "power1.inOut",
                onComplete: () => {
                    // 动画结束后清除所有通过GSAP添加的样式属性，恢复元素原始状态
                    gsap.set(element, { clearProps: "all" })
                },
            },
        )
    })
}

// 计算玩家阵容强度
function calculatePlayerPower(): number {
    let totalPower = 0

    boardSlots.value.forEach((slot) => {
        if (slot) {
            let power = slot.基础攻击 * slot.starLevel

            // 武器加成
            if (slot.equippedWeapon) {
                power += slot.equippedWeapon.基础攻击
            }

            totalPower += power
        }
    })

    return totalPower
}

// 检查升级
function checkLevelUp() {
    while (playerXp.value >= xpNeededForNextLevel.value) {
        playerXp.value -= xpNeededForNextLevel.value
        playerLevel.value += 1
        addBattleLog(`升级了！当前等级：${playerLevel.value}`)

        // 添加升级动画效果
        const levelElement = document.querySelector(".game-status")
        if (levelElement) {
            levelElement.classList.add("level-up-glow")
            setTimeout(() => {
                levelElement.classList.remove("level-up-glow")
            }, 1000)
        }
    }
}

// 结束回合
function endTurn() {
    if (inBattle.value || gameOver.value) return

    // 自动开始战斗
    startBattle()
}

// 添加战斗日志
function addBattleLog(message: string) {
    // 根据设置决定是否添加日志
    if (gameSettings.value.showBattleLog) {
        battleLogs.value.unshift(`[${new Date().toLocaleTimeString()}] ${message}`)

        // 限制日志数量
        if (battleLogs.value.length > 15) {
            battleLogs.value.pop()
        }

        // 自动滚动到最新日志
        setTimeout(() => {
            const logElement = document.querySelector(".battle-log")
            if (logElement) {
                logElement.scrollTop = 0
            }
        }, 100)
    }
}

// 重新开始游戏
function restartGame() {
    // 播放重启音效
    playSound("restart")
    // 重置所有游戏状态
    playerLevel.value = 1
    playerXp.value = 0
    playerGold.value = 10
    playerHealth.value = 100
    currentRound.value = 1
    consecutiveWins.value = 0
    consecutiveLosses.value = 0
    gameOver.value = false

    // 清空棋盘和备战区
    boardSlots.value = [null, null, null, null, null, null, null, null, null]
    benchItems.value = []
    weaponsInventory.value = []
    battleLogs.value = []

    // 重置选择状态
    selectedCharacterIndex.value = -1
    selectedWeaponIndex.value = -1

    // 重新初始化商店
    initializeShop()
    addBattleLog("游戏重新开始！")
}

// 初始化游戏
onMounted(() => {
    initializeShop()
    addBattleLog("游戏开始！欢迎来到二重螺旋自走棋！")
    addBattleLog("每回合可以招募角色、购买武器，然后与敌人战斗！")
})
</script>

<style scoped>
/* 战斗动画效果增强 */
@keyframes critical-bounce {
    0%,
    100% {
        transform: translate(-50%, -50%) scale(1);
    }
    25% {
        transform: translate(-50%, -60%) scale(1.2);
    }
    50% {
        transform: translate(-50%, -45%) scale(1.1);
    }
    75% {
        transform: translate(-50%, -55%) scale(1.15);
    }
}
@keyframes damageFlash {
    0% {
        opacity: 1;
    }
    50% {
        opacity: 0.6;
        filter: brightness(1.8) saturate(1.5);
    }
    100% {
        opacity: 1;
    }
}

@keyframes critical-bounce {
    0%,
    100% {
        transform: translateY(0) scale(1);
    }
    25% {
        transform: translateY(-15px) scale(1.2);
    }
    50% {
        transform: translateY(-10px) scale(1.1);
    }
    75% {
        transform: translateY(-5px) scale(1.05);
    }
}

@keyframes attackPulse {
    0% {
        transform: scale(1);
        filter: brightness(1);
    }
    50% {
        transform: scale(1.1);
        filter: brightness(1.3);
    }
    100% {
        transform: scale(1);
        filter: brightness(1);
    }
}

@keyframes healPulse {
    0% {
        transform: scale(0.8);
        opacity: 0.7;
    }
    50% {
        transform: scale(1.2);
        opacity: 0.4;
    }
    100% {
        transform: scale(1.4);
        opacity: 0;
    }
}

@keyframes hitStagger {
    0% {
        transform: translateX(0);
    }
    30% {
        transform: translateX(3px);
    }
    60% {
        transform: translateX(-2px);
    }
    100% {
        transform: translateX(0);
    }
}

.attacking {
    animation: attackPulse 0.3s ease-out;
}

.hit-stagger {
    animation: hitStagger 0.2s ease-out;
}

.damaged {
    animation: damageFlash 0.5s ease-out;
}
.small-game-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: "Arial", sans-serif;
    background-color: #0f1217;
    color: #e2e8f0;
    min-height: 100vh;
    overflow: hidden;
}

/* 全局动画类 */
.fade-enter-active,
.fade-leave-active {
    transition:
        opacity 0.3s,
        transform 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: translateY(10px);
}

.slide-enter-active,
.slide-leave-active {
    transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
    opacity: 0;
    transform: translateX(-10px);
}

/* 战斗伤害动画 */
@keyframes damageFlash {
    0% {
        background-color: rgba(255, 0, 0, 0.3);
    }
    100% {
        background-color: transparent;
    }
}

.damage-flash {
    animation: damageFlash 0.5s;
}

/* 暴击动画 */
@keyframes criticalHit {
    0% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.2);
    }
    100% {
        transform: scale(1);
    }
}

.critical-hit {
    animation: criticalHit 0.5s;
    color: #ff9800;
}

/* 伤害数字动画 */
.damage-numbers-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 100;
}

.damage-number {
    position: absolute;
    font-size: 18px;
    font-weight: bold;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
    pointer-events: none;
    z-index: 101;
}

.damage-normal {
    color: #ff6b6b;
}

.damage-critical {
    color: #ff9800;
    font-size: 22px;
    text-shadow: 0 0 6px rgba(255, 152, 0, 0.6);
}

.damage-heal {
    color: #4caf50;
}

.damage-number-enter-active,
.damage-number-leave-active {
    transition: all 1s cubic-bezier(0.215, 0.61, 0.355, 1);
}

.damage-number-enter-from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.5);
}

.damage-number-enter-to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
}

.damage-number-leave-from {
    opacity: 1;
    transform: translate(-50%, -50%);
}

.damage-number-leave-to {
    opacity: 0;
    transform: translate(-50%, -120%);
}

.damage-critical.damage-number-enter-active {
    animation: critical-bounce 0.6s ease-out;
}

/* 角色升级闪光效果 */
@keyframes levelUpGlow {
    0% {
        box-shadow: 0 0 5px #4caf50;
    }
    50% {
        box-shadow:
            0 0 20px #4caf50,
            0 0 30px #4caf50;
    }
    100% {
        box-shadow: 0 0 5px #4caf50;
    }
}

.level-up-glow {
    animation: levelUpGlow 1s infinite;
}

h1 {
    text-align: center;
    color: #e2e8f0;
    margin-bottom: 30px;
}

h3 {
    color: #e2e8f0;
    border-bottom: 1px solid #333;
    padding-bottom: 8px;
}

/* 游戏状态栏 */
.game-status {
    display: flex;
    justify-content: space-around;
    background: #1e2129;
    padding: 15px;
    border-radius: 10px;
    margin-bottom: 20px;
    border: 1px solid #333;
}

.status-item {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.xp-bar {
    width: 100px;
    height: 8px;
    background: #2a2e38;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 5px;
}

.xp-fill {
    height: 100%;
    background: #4caf50;
    transition: width 0.3s ease;
}

/* 商店区域 */
.shop-section {
    background: #1e2129;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 20px;
    transition:
        transform 0.2s,
        box-shadow 0.2s;
}

.shop-section:hover {
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.shop-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin: 15px 0;
    transition: all 0.3s ease;
}

.shop-item {
    cursor: pointer;
    transition:
        transform 0.2s,
        box-shadow 0.2s;
    position: relative;
}

.shop-item:hover:not(.disabled) {
    transform: translateY(-5px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    z-index: 10;
}

.shop-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transition: all 0.3s ease;
}

.shop-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.refresh-button {
    background: #6c757d;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
}

.refresh-button:hover:not(:disabled) {
    background: #5a6268;
}

.refresh-button:disabled {
    background: #4a4f5a;
    cursor: not-allowed;
}

/* 棋盘区域 */
.board-section {
    background: #1e2129;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 20px;
    transition: box-shadow 0.3s ease;
}

.board-section:hover {
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.game-board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 15px;
    margin: 15px auto;
    aspect-ratio: 1;
    max-width: 600px;
    background-color: #16181e;
    padding: 15px;
    border-radius: 8px;
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
}

.board-slot {
    background-color: #2a2e38;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
    position: relative;
    overflow: hidden;
}

.board-slot::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.1), transparent);
    transition: left 0.5s;
}

.board-slot:hover::before {
    left: 100%;
}

.board-slot:hover {
    background-color: #353a46;
}

.empty-slot {
    color: #555;
    font-size: 24px;
}

/* 棋盘角色容器 */
.character-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: all 0.3s ease;
}

.character-container:hover {
    transform: scale(1.05);
}

.character-container.damaged {
    animation: damageFlash 0.3s;
}

.character-container.victory {
    animation: victoryJump 1s;
}

@keyframes victoryJump {
    0%,
    100% {
        transform: translateY(0);
    }
    25% {
        transform: translateY(-10px);
    }
    50% {
        transform: translateY(0);
    }
    75% {
        transform: translateY(-5px);
    }
}

.retrieve-hint {
    position: absolute;
    bottom: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    color: #6c757d;
    opacity: 0;
    transition: opacity 0.2s;
}

.character-container:hover .retrieve-hint {
    opacity: 1;
}

/* 备战区 */
.bench-section {
    background: #1e2129;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 20px;
}

.bench-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 15px 0;
}

.bench-item {
    cursor: pointer;
    transition: all 0.3s ease-out;
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 2px;
}

.bench-item:hover {
    transform: translateY(-5px) scale(1.03);
    box-shadow: 0 8px 25px rgba(74, 158, 255, 0.2);
}

.bench-item.selected {
    border: 2px solid #4a9eff;
    border-radius: 8px;
    transform: scale(1.05);
    box-shadow: 0 0 20px rgba(74, 158, 255, 0.4);
    animation: pulse-border 1.5s infinite;
}

@keyframes pulse-border {
    0%,
    100% {
        box-shadow: 0 0 15px rgba(74, 158, 255, 0.4);
    }
    50% {
        box-shadow: 0 0 25px rgba(74, 158, 255, 0.7);
    }
}

/* 武器系统样式 */
.weapon-inventory {
    background: linear-gradient(135deg, #1e2129, #2d3142);
    border: 1px solid #4a5568;
    border-radius: 12px;
    padding: 15px;
    margin-bottom: 20px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.weapon-items {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    max-height: 250px;
    overflow-y: auto;
    padding: 5px;
}

/* 美化滚动条 */
.weapon-items::-webkit-scrollbar {
    width: 6px;
}

.weapon-items::-webkit-scrollbar-track {
    background: #2d3142;
    border-radius: 3px;
}

.weapon-items::-webkit-scrollbar-thumb {
    background: #4a5568;
    border-radius: 3px;
}

.weapon-items::-webkit-scrollbar-thumb:hover {
    background: #718096;
}

.weapon-item {
    background-color: #2a2e38;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition:
        all 0.2s ease,
        box-shadow 0.2s ease;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 2px solid transparent;
    position: relative;
    overflow: hidden;
}

.weapon-item:hover {
    background-color: #353a46;
    transform: translateX(5px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.weapon-item::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.15), transparent);
    transition: left 0.3s ease;
}

.weapon-item:hover::before {
    left: 100%;
}

.weapon-item.selected {
    border: 2px solid #4a9eff;
    background-color: #313e50;
    box-shadow: 0 0 15px rgba(74, 158, 255, 0.3);
}

/* 拖放视觉反馈样式 */
.weapon-item[draggable="true"] {
    cursor: grab;
}

.weapon-item[draggable="true"]:active {
    cursor: grabbing;
    opacity: 0.8;
}

.weapon-item.dragging {
    opacity: 0.6;
    transform: scale(1.05);
}

/* 角色卡片拖放悬停效果 */
.bench-item.drag-over {
    border: 2px dashed #4a9eff !important;
    background-color: rgba(74, 158, 255, 0.2);
    transform: scale(1.05);
    box-shadow: 0 0 25px rgba(74, 158, 255, 0.5);
    transition: all 0.2s ease;
}

.bench-item.drag-over-invalid {
    border: 2px dashed #ff4a4a !important;
    background-color: rgba(255, 74, 74, 0.2);
    transform: scale(1.02);
    box-shadow: 0 0 20px rgba(255, 74, 74, 0.4);
    transition: all 0.2s ease;
}

.weapon-item.dragging {
    opacity: 0.6;
    transform: scale(1.05) rotate(5deg);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
    transition: all 0.2s ease;
}

.weapon-icon {
    font-size: 24px;
}

.weapon-info {
    flex: 1;
}

.weapon-info .name {
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 2px;
}

.weapon-info .type {
    font-size: 12px;
    opacity: 0.8;
    margin-bottom: 2px;
}

.weapon-info .stats {
    display: flex;
    gap: 8px;
    font-size: 12px;
}

.weapon-equipped {
    font-size: 12px;
    color: #4ecdc4;
    margin-top: 2px;
    font-weight: bold;
}

.tip {
    margin-top: 10px;
    font-size: 12px;
    color: #6c757d;
    text-align: center;
}

/* 角色卡片 */
.character-card {
    background-color: #2a2e38;
    border-radius: 8px;
    padding: 10px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    /* 添加微妙的背景渐变提升质感 */
    background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.05));
    /* 添加边框装饰 */
    border: 1px solid rgba(99, 102, 241, 0.2);
}

.character-card:hover {
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 7px 20px rgba(0, 0, 0, 0.3);
}

.character-card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 70%);
    pointer-events: none;
    transition: opacity 0.3s ease;
}

.character-card:hover::after {
    opacity: 0.7;
    animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
    0% {
        background-position: -100% -100%;
    }
    100% {
        background-position: 200% 200%;
    }
}

.character-card.placed {
    background-color: #2a3e2e;
    animation: place-character 0.4s ease-out;
}

@keyframes place-character {
    0% {
        transform: scale(1.2);
        opacity: 0.8;
    }
    50% {
        transform: scale(0.95);
    }
    100% {
        transform: scale(1);
        opacity: 1;
    }
}

.character-image {
    width: 60%;
    height: 60%;
    object-fit: cover;
    border-radius: 50%;
    margin-bottom: 8px;
    background-color: #1a1e28;
}

.character-info {
    text-align: center;
    width: 100%;
}

.character-info h4 {
    margin: 5px 0;
    font-size: 14px;
    color: #e2e8f0;
}

.character-attribute {
    margin: 3px 0;
    font-size: 12px;
    color: #aaa;
}

.character-cost,
.character-level {
    margin: 3px 0;
    font-size: 12px;
    font-weight: bold;
    color: #ffc107;
}

.character-count {
    position: absolute;
    top: 5px;
    left: 5px;
    background-color: rgba(0, 0, 0, 0.7);
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 10px;
}

/* 战斗控制区 */
.battle-controls {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

/* 增强按钮交互效果 */
.btn {
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.2);
    transform: translate(-50%, -50%);
    transition:
        width 0.6s,
        height 0.6s;
    z-index: 0;
}

.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.btn:active::before {
    width: 300px;
    height: 300px;
}

.btn:disabled {
    transition: all 0.2s ease;
    opacity: 0.7;
}

.btn:not(:disabled) span {
    position: relative;
    z-index: 1;
}

.battle-button,
.end-turn-button,
.restart-btn {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    z-index: 1;
}

.battle-button::before,
.end-turn-button::before,
.restart-btn::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s;
    z-index: -1;
}

.battle-button:hover::before,
.end-turn-button:hover::before,
.restart-btn:hover::before {
    left: 100%;
}

.battle-button:hover:not(:disabled),
.end-turn-button:hover:not(:disabled),
.restart-btn:hover {
    transform: translateY(-3px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.battle-button {
    background: #28a745;
    color: white;
}

.battle-button:hover:not(:disabled) {
    background: #218838;
}

.battle-button:disabled {
    background: #6c757d;
    cursor: not-allowed;
}

.end-turn-button {
    background: #dc3545;
    color: white;
}

.end-turn-button:hover:not(:disabled) {
    background: #c82333;
}

.restart-btn {
    background-color: #17a2b8;
    color: white;
}

.restart-btn:hover {
    background-color: #138496;
}

/* 战斗日志 */
.battle-log {
    background: #16181e;
    color: white;
    border-radius: 10px;
    padding: 15px;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #333;
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
    position: relative;
}

.log-messages p {
    margin: 8px 0;
    font-size: 14px;
    color: #ecf0f1;
    transition: all 0.3s ease;
    animation: fadeIn 0.5s ease-out;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateX(-10px) translateY(5px);
    }
    to {
        opacity: 1;
        transform: translateX(0) translateY(0);
    }
}

.log-messages p.damage {
    color: #ff6b6b;
    animation: damage-pulse 0.8s ease-out;
}

@keyframes damage-pulse {
    0% {
        transform: scale(1);
        color: #ff6b6b;
    }
    50% {
        transform: scale(1.05);
        color: #ff4757;
    }
    100% {
        transform: scale(1);
        color: #ff6b6b;
    }
}

.log-messages p.victory {
    color: #4ecdc4;
    font-weight: bold;
    animation: victory-glow 1s ease-out;
}

@keyframes victory-glow {
    0% {
        text-shadow: 0 0 5px rgba(78, 205, 196, 0.5);
    }
    50% {
        text-shadow: 0 0 20px rgba(78, 205, 196, 0.8);
    }
    100% {
        text-shadow: 0 0 5px rgba(78, 205, 196, 0.5);
    }
}

.log-messages p.critical {
    color: #ff9800;
    font-weight: bold;
    animation: critical-flash 0.6s ease-out;
}

@keyframes critical-flash {
    0%,
    100% {
        color: #ff9800;
    }
    50% {
        color: #ffeb3b;
        text-shadow: 0 0 15px #ffeb3b;
    }
}

/* 游戏状态变化动画 */
.character-container.damaged {
    animation: damaged-flash 0.3s ease-out;
}

@keyframes damaged-flash {
    0%,
    100% {
        filter: brightness(1);
        transform: scale(1);
    }
    50% {
        filter: brightness(1.5) hue-rotate(180deg);
        transform: scale(1.05);
    }
}

.character-container.victory {
    animation: victory-bounce 1s ease-out infinite;
}

@keyframes victory-bounce {
    0%,
    100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-10px);
    }
}

/* 回合切换动画 */
.turn-indicator {
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%,
    100% {
        transform: scale(1);
        opacity: 1;
    }
    50% {
        transform: scale(1.05);
        opacity: 0.8;
    }
}

/* 资源变化动画 */
.gold-change,
.exp-change {
    position: absolute;
    font-size: 16px;
    font-weight: bold;
    pointer-events: none;
    z-index: 100;
    animation: float-up-fade 1s ease-out;
}

@keyframes float-up-fade {
    0% {
        opacity: 1;
        transform: translateY(0);
    }
    100% {
        opacity: 0;
        transform: translateY(-30px);
    }
}

.gold-change {
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
}

.exp-change {
    color: #4ecdc4;
    text-shadow: 0 0 10px rgba(78, 205, 196, 0.5);
}

.battle-log h3 {
    margin-top: 0;
    border-bottom: 1px solid #333;
    padding-bottom: 10px;
}

.log-messages p {
    margin: 5px 0;
    font-size: 14px;
    color: #ecf0f1;
}

/* 游戏结束遮罩 */
.game-over-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    animation: fadeIn 0.5s ease-out;
}

.game-over-dialog {
    background-color: #1e2129;
    border-radius: 12px;
    padding: 30px;
    text-align: center;
    border: 2px solid #4a9eff;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    animation: slideIn 0.5s ease-out;
}

@keyframes slideIn {
    from {
        transform: translateY(-50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.game-over-dialog {
    background-color: #1e2129;
    border-radius: 12px;
    padding: 30px;
    text-align: center;
    border: 2px solid #4a9eff;
    max-width: 400px;
    width: 90%;
}

.game-over-dialog h2 {
    color: #4a9eff;
    margin-top: 0;
    margin-bottom: 20px;
    font-size: 28px;
}

.game-over-dialog p {
    margin-bottom: 10px;
    font-size: 16px;
    color: #e2e8f0;
}

.game-over-dialog button {
    margin-top: 20px;
    padding: 12px 24px;
    font-size: 16px;
    background-color: #4a9eff;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.game-over-dialog button:hover {
    background-color: #3a8eef;
}

/* 动画效果 */
@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slideIn {
    from {
        transform: translateY(-20px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

@keyframes scaleIn {
    from {
        transform: scale(0.9);
        opacity: 0;
    }
    to {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes bounce {
    0%,
    20%,
    50%,
    80%,
    100% {
        transform: translateY(0);
    }
    40% {
        transform: translateY(-10px);
    }
    60% {
        transform: translateY(-5px);
    }
}

@keyframes pulse {
    0% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.05);
    }
    100% {
        transform: scale(1);
    }
}

@keyframes glow {
    0% {
        box-shadow: 0 0 5px rgba(74, 158, 255, 0.5);
    }
    50% {
        box-shadow:
            0 0 20px rgba(74, 158, 255, 0.8),
            0 0 30px rgba(74, 158, 255, 0.5);
    }
    100% {
        box-shadow: 0 0 5px rgba(74, 158, 255, 0.5);
    }
}

/* 应用动画类 */
.animate-fadeIn {
    animation: fadeIn 0.3s ease-in-out;
}

.animate-slideIn {
    animation: slideIn 0.3s ease-out;
}

.animate-scaleIn {
    animation: scaleIn 0.2s ease-out;
}

.animate-bounce {
    animation: bounce 1s ease-in-out;
}

.animate-pulse {
    animation: pulse 2s infinite;
}

.animate-glow {
    animation: glow 2s infinite;
}

/* 响应式设计 */
/* 超大屏幕 */
@media (max-width: 1200px) {
    .game-status {
        padding: 12px;
    }

    .status-item {
        margin: 0 5px;
    }
}

/* 大屏幕 */
@media (max-width: 992px) {
    .game-board {
        max-width: 600px;
    }

    .shop-grid {
        grid-template-columns: repeat(4, 1fr);
    }

    .bench-grid {
        grid-template-columns: repeat(4, 1fr);
    }
}

/* 中等屏幕 */
@media (max-width: 768px) {
    .game-board {
        max-width: 400px;
    }

    .shop-grid {
        grid-template-columns: repeat(3, 1fr);
    }

    .bench-grid {
        grid-template-columns: repeat(3, 1fr);
    }

    .battle-controls {
        flex-direction: column;
        align-items: center;
        gap: 10px;
    }

    .battle-controls button {
        width: 200px;
    }

    .game-status {
        flex-direction: column;
        gap: 10px;
    }

    .status-item {
        flex-direction: row;
        justify-content: space-between;
        width: 100%;
    }

    .xp-bar {
        width: 80px;
    }

    h1 {
        font-size: 1.5rem;
    }
}

/* 小屏幕 */
@media (max-width: 576px) {
    .game-board {
        max-width: 320px;
    }

    .shop-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }

    .bench-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }

    .character-container {
        padding: 4px;
    }

    .character-info h4 {
        font-size: 12px;
    }

    .character-attribute,
    .character-cost,
    .character-level {
        font-size: 10px;
    }

    .battle-controls button {
        width: 180px;
        padding: 8px 16px;
        font-size: 14px;
    }

    .game-over-dialog,
    .settings-dialog {
        margin: 10px;
        padding: 20px;
    }

    .game-over-dialog h2,
    .settings-dialog h2 {
        font-size: 1.5rem;
    }
}

/* 超小屏幕 */
@media (max-width: 360px) {
    .game-board {
        max-width: 280px;
    }

    .shop-section,
    .board-section,
    .bench-section {
        padding: 10px;
    }

    .battle-controls button {
        width: 160px;
        font-size: 12px;
    }
}
</style>
