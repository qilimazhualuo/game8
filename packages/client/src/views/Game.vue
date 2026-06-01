<script setup>
import { inject, onMounted, onUnmounted, ref } from 'vue'
import GameChat from '@/components/GameChat.vue'
import GameControls from '@/components/GameControls.vue'
import { useGame } from '@/composables/useGame.js'

const canvasRef = ref(null)
const currentUser = inject('currentUser')
const { tps, connected, score, clawStatus, clawX, clawZ, resizeRenderer, start, setRotateInput, setClawInput, triggerGrab } = useGame(canvasRef, currentUser)

onMounted(() => {
    resizeRenderer()
    window.addEventListener('resize', resizeRenderer)
    start()
})

onUnmounted(() => {
    window.removeEventListener('resize', resizeRenderer)
})
</script>

<template>
    <div class="game-root">
        <canvas ref="canvasRef" class="game-canvas" />
        <div class="game-hud">
            <div class="hud-top-right">
                <div class="hud-item tps" :class="{ connected }">TPS: {{ tps }}</div>
                <div class="hud-item score">得分: {{ score }}</div>
                <div class="hud-item claw-status">抓钩: {{ clawStatus }}</div>
                <div class="hud-item claw-pos">坐标: ({{ clawX }}, {{ clawZ }})</div>
            </div>
        </div>
        <GameControls
            @rotate="setRotateInput"
            @claw="setClawInput"
            @grab="triggerGrab"
        />
        <GameChat />
    </div>
</template>

<style scoped>
.game-root {
    height: 100%;
    position: relative;
    background: #0a0a1e;
    overflow: hidden;
}
.game-canvas {
    display: block;
    width: 100%;
    height: 100%;
}
.game-hud {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
}
.hud-top-right {
    position: absolute;
    top: 12px;
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.hud-item {
    font-family: 'Courier New', 'Consolas', monospace;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    background: rgba(0, 0, 0, 0.4);
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
}
.tps.connected {
    color: #55ffff;
}
.score {
    color: #ffcc00;
}
.claw-status {
    color: #ff8844;
    text-transform: capitalize;
}
</style>
