<script setup>
import { ref } from 'vue'

const emit = defineEmits(['move', 'claw', 'grab'])

const RADIUS = 60
const grabPressed = ref(false)

// --- movement joystick ---
const moveActive = ref(false)
const moveX = ref(0)
const moveY = ref(0)
let moveRect = null
let moveTouchId = null
const moveEl = ref(null)

function moveStart(e) {
    e.preventDefault()
    const el = moveEl.value
    if (!el) return
    moveRect = el.getBoundingClientRect()
    if (e.changedTouches) moveTouchId = e.changedTouches[0].identifier
    moveActive.value = true
    moveUpdate(e)
}
function moveUpdate(e) {
    if (!moveActive.value) return
    const pos = getPos(e, moveTouchId)
    if (!pos || !moveRect) return
    const dx = pos.clientX - (moveRect.left + moveRect.width / 2)
    const dy = pos.clientY - (moveRect.top + moveRect.height / 2)
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > RADIUS) {
        moveX.value = (dx / dist) * RADIUS
        moveY.value = (dy / dist) * RADIUS
    } else {
        moveX.value = dx
        moveY.value = dy
    }
    emit('rotate', { x: moveX.value / RADIUS })
}
function moveEnd(e) {
    e.preventDefault()
    if (!moveActive.value) return
    moveActive.value = false
    moveX.value = 0
    moveY.value = 0
    moveTouchId = null
    moveRect = null
}

// --- claw joystick ---
const clawActive = ref(false)
const clawX = ref(0)
const clawY = ref(0)
let clawRect = null
let clawTouchId = null
const clawEl = ref(null)

function clawStart(e) {
    e.preventDefault()
    const el = clawEl.value
    if (!el) return
    clawRect = el.getBoundingClientRect()
    if (e.changedTouches) clawTouchId = e.changedTouches[0].identifier
    clawActive.value = true
    clawUpdate(e)
}
function clawUpdate(e) {
    if (!clawActive.value) return
    const pos = getPos(e, clawTouchId)
    if (!pos || !clawRect) return
    const dx = pos.clientX - (clawRect.left + clawRect.width / 2)
    const dy = pos.clientY - (clawRect.top + clawRect.height / 2)
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > RADIUS) {
        clawX.value = (dx / dist) * RADIUS
        clawY.value = (dy / dist) * RADIUS
    } else {
        clawX.value = dx
        clawY.value = dy
    }
    emit('claw', { x: clawX.value / RADIUS, y: clawY.value / RADIUS })
}
function clawEnd(e) {
    e.preventDefault()
    if (!clawActive.value) return
    clawActive.value = false
    clawX.value = 0
    clawY.value = 0
    clawTouchId = null
    clawRect = null
    emit('claw', { x: 0, y: 0 })
}

function getPos(e, touchId) {
    if (e.touches) {
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === touchId) return e.touches[i]
        }
        if (touchId === null) return e.touches[0]
        return null
    }
    return e
}
</script>

<template>
    <div class="controls-overlay">
        <div class="joystick-area left">
            <div
                ref="moveEl"
                class="joystick-base"
                :class="{ active: moveActive }"
                @touchstart="moveStart"
                @touchmove="moveUpdate"
                @touchend="moveEnd"
                @touchcancel="moveEnd"
                @mousedown="moveStart"
                @mousemove="moveUpdate"
                @mouseup="moveEnd"
                @mouseleave="moveEnd"
            >
                <div class="joystick-label">移动</div>
                <div
                    class="joystick-thumb"
                    :style="{ transform: `translate(${moveX}px, ${moveY}px)` }"
                />
            </div>
        </div>

        <div class="joystick-area right">
            <div
                ref="clawEl"
                class="joystick-base"
                :class="{ active: clawActive }"
                @touchstart="clawStart"
                @touchmove="clawUpdate"
                @touchend="clawEnd"
                @touchcancel="clawEnd"
                @mousedown="clawStart"
                @mousemove="clawUpdate"
                @mouseup="clawEnd"
                @mouseleave="clawEnd"
            >
                <div class="joystick-label">抓钩</div>
                <div
                    class="joystick-thumb"
                    :style="{ transform: `translate(${clawX}px, ${clawY}px)` }"
                />
            </div>
            <button
                class="grab-btn"
                :class="{ pressed: grabPressed }"
                @touchstart.prevent="grabPressed = true; emit('grab')"
                @touchend.prevent="grabPressed = false"
                @touchcancel.prevent="grabPressed = false"
                @mousedown.prevent="grabPressed = true; emit('grab')"
                @mouseup="grabPressed = false"
                @mouseleave="grabPressed = false"
            >抓取</button>
        </div>
    </div>
</template>

<style scoped>
.controls-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
}
.joystick-area {
    position: absolute;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}
.joystick-area.left {
    bottom: 30px;
    left: 30px;
}
.joystick-area.right {
    bottom: 30px;
    right: 30px;
}
.joystick-base {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    border: 2px solid rgba(255, 255, 255, 0.12);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    transition: border-color 0.2s, background 0.2s;
}
.joystick-base.active {
    border-color: rgba(85, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.1);
}
.joystick-label {
    position: absolute;
    bottom: -22px;
    font-family: 'Courier New', 'Consolas', monospace;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
    pointer-events: none;
    white-space: nowrap;
}
.joystick-thumb {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(85, 255, 255, 0.5), rgba(85, 255, 255, 0.2));
    border: 2px solid rgba(85, 255, 255, 0.3);
    position: absolute;
    pointer-events: none;
    will-change: transform;
}
.grab-btn {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: 2px solid rgba(255, 136, 68, 0.4);
    background: radial-gradient(circle at 35% 35%, rgba(255, 136, 68, 0.3), rgba(255, 136, 68, 0.1));
    color: #ff8844;
    font-family: 'Courier New', 'Consolas', monospace;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    transition: transform 0.1s, background 0.1s;
}
.grab-btn.pressed {
    background: radial-gradient(circle at 35% 35%, rgba(255, 136, 68, 0.5), rgba(255, 136, 68, 0.2));
    transform: scale(0.92);
}
</style>
