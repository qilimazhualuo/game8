const TARGET_TPS = 20
const TICK_MS = 1000 / TARGET_TPS

const WORLD_SIZE = 16
const PRIZE_ZONE = { xMin: -6, xMax: 6, zMin: -6, zMax: 6 }
const CLAW_SPEED = 6
const CLAW_DROP_SPEED = 4
const CLAW_RISE_SPEED = 3
const GRAB_RADIUS = 0.8
const ITEM_TYPES = ['ruby', 'emerald', 'sapphire', 'gold', 'crystal']
const ITEM_COUNT = 20
const RESPAWN_DELAY_TICKS = 120

let nextItemId = 1

function rand(min, max) {
    return Math.random() * (max - min) + min
}

function randItem() {
    return {
        id: nextItemId++,
        x: rand(PRIZE_ZONE.xMin + 0.5, PRIZE_ZONE.xMax - 0.5),
        z: rand(PRIZE_ZONE.zMin + 0.5, PRIZE_ZONE.zMax - 0.5),
        type: ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)],
        grabbed: false,
        grabbedBy: null,
        respawnTick: 0,
    }
}

export class GameEngine {
    constructor({ sendToUser, broadcast }) {
        this.sendToUser = sendToUser
        this.broadcast = broadcast
        this.players = new Map()
        this.items = []
        this.inputQueue = []
        this.tickCount = 0
        this.tps = 0
        this._tickTimer = null
        this._tpsTimer = null
        this._tickAccumulator = 0
    }

    start() {
        this.initItems()

        let lastTime = performance.now()

        this._tickTimer = setInterval(() => {
            const now = performance.now()
            const delta = now - lastTime
            lastTime = now

            this._tickAccumulator++
            this.processInputs()
            this.update(delta)
            this.tickCount++
            this.broadcastState()
        }, TICK_MS)

        this._tpsTimer = setInterval(() => {
            this.tps = this._tickAccumulator
            this._tickAccumulator = 0
        }, 1000)
    }

    stop() {
        if (this._tickTimer) clearInterval(this._tickTimer)
        if (this._tpsTimer) clearInterval(this._tpsTimer)
    }

    initItems() {
        for (let i = 0; i < ITEM_COUNT; i++) {
            this.items.push(randItem())
        }
    }

    addPlayer(userId) {
        if (this.players.has(userId)) return
        const angle = Math.random() * Math.PI * 2
        const radius = 2 + Math.random() * 3
        this.players.set(userId, {
            userId,
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
            rotationY: 0,
            moveInput: { forward: false, backward: false, left: false, right: false },
            clawInput: { left: false, right: false, up: false, down: false },
            action: false,
            clawX: 0,
            clawZ: 0,
            clawY: 0,
            clawState: 'idle',
            clawProgress: 0,
            score: 0,
        })
    }

    removePlayer(userId) {
        this.players.delete(userId)
    }

    queueInput(userId, data) {
        this.inputQueue.push({ userId, data })
    }

    processInputs() {
        for (const { userId, data } of this.inputQueue) {
            const player = this.players.get(userId)
            if (!player) continue
            if (data.move) {
                player.moveInput = { ...player.moveInput, ...data.move }
            }
            if (data.claw) {
                player.clawInput = { ...player.clawInput, ...data.claw }
            }
            if (data.action === true) {
                player.action = true
            }
            if (data.clawPos) {
                player.clawX = clamp(data.clawPos.x, PRIZE_ZONE.xMin, PRIZE_ZONE.xMax)
                player.clawZ = clamp(data.clawPos.z, PRIZE_ZONE.zMin, PRIZE_ZONE.zMax)
                player._clawPosReceived = true
            }
        }
        this.inputQueue.length = 0
    }

    update(delta) {
        const dt = delta / 1000
        const moveSpeed = 4 * dt
        const clawMoveSpeed = CLAW_SPEED * dt

        for (const player of this.players.values()) {
            // movement
            let mx = 0
            let mz = 0
            if (player.moveInput.forward) mz -= 1
            if (player.moveInput.backward) mz += 1
            if (player.moveInput.left) mx -= 1
            if (player.moveInput.right) mx += 1
            const len = Math.sqrt(mx * mx + mz * mz)
            if (len > 0) {
                mx = mx / len * moveSpeed
                mz = mz / len * moveSpeed
            }
            player.x = clamp(player.x + mx, -WORLD_SIZE, WORLD_SIZE)
            player.z = clamp(player.z + mz, -WORLD_SIZE, WORLD_SIZE)
            if (len > 0) {
                player.rotationY = Math.atan2(mx, mz)
            }

            // claw movement (only when idle, skip if position was set directly)
            if (player.clawState === 'idle' && !player._clawPosReceived) {
                let cx = 0
                let cz = 0
                if (player.clawInput.left) cx -= 1
                if (player.clawInput.right) cx += 1
                if (player.clawInput.up) cz -= 1
                if (player.clawInput.down) cz += 1
                const clen = Math.sqrt(cx * cx + cz * cz)
                if (clen > 0) {
                    cx = cx / clen * clawMoveSpeed
                    cz = cz / clen * clawMoveSpeed
                }
                player.clawX = clamp(player.clawX + cx, PRIZE_ZONE.xMin, PRIZE_ZONE.xMax)
                player.clawZ = clamp(player.clawZ + cz, PRIZE_ZONE.zMin, PRIZE_ZONE.zMax)
            }
            player._clawPosReceived = false

            // claw action
            if (player.action && player.clawState === 'idle') {
                player.clawState = 'dropping'
                player.clawProgress = 0
            }
            player.action = false

            // claw state machine
            if (player.clawState === 'dropping') {
                player.clawY += CLAW_DROP_SPEED * dt
                if (player.clawY >= 3) {
                    player.clawY = 3
                    // check grab
                    const grabbed = this.tryGrab(player)
                    player.clawState = grabbed ? 'grabbed' : 'rising'
                }
            } else if (player.clawState === 'grabbed') {
                player.clawY -= CLAW_RISE_SPEED * dt
                if (player.clawY <= 0) {
                    player.clawY = 0
                    player.clawState = 'idle'
                    player.score++
                }
            } else if (player.clawState === 'rising') {
                player.clawY -= CLAW_RISE_SPEED * dt
                if (player.clawY <= 0) {
                    player.clawY = 0
                    player.clawState = 'idle'
                }
            }
        }

        // respawn items
        for (const item of this.items) {
            if (item.grabbed && this.tickCount >= item.respawnTick) {
                item.x = rand(PRIZE_ZONE.xMin + 0.5, PRIZE_ZONE.xMax - 0.5)
                item.z = rand(PRIZE_ZONE.zMin + 0.5, PRIZE_ZONE.zMax - 0.5)
                item.grabbed = false
                item.grabbedBy = null
            }
        }
    }

    tryGrab(player) {
        for (const item of this.items) {
            if (item.grabbed) continue
            const dx = item.x - player.clawX
            const dz = item.z - player.clawZ
            if (dx * dx + dz * dz < GRAB_RADIUS * GRAB_RADIUS) {
                item.grabbed = true
                item.grabbedBy = player.userId
                item.respawnTick = this.tickCount + RESPAWN_DELAY_TICKS
                return true
            }
        }
        return false
    }

    getState() {
        const players = []
        for (const p of this.players.values()) {
            players.push({
                userId: p.userId,
                x: Number(p.x.toFixed(2)),
                z: Number(p.z.toFixed(2)),
                rotationY: Number(p.rotationY.toFixed(2)),
                clawX: Number(p.clawX.toFixed(2)),
                clawZ: Number(p.clawZ.toFixed(2)),
                clawY: Number(p.clawY.toFixed(2)),
                clawState: p.clawState,
                score: p.score,
            })
        }

        const items = []
        for (const item of this.items) {
            items.push({
                id: item.id,
                x: Number(item.x.toFixed(2)),
                z: Number(item.z.toFixed(2)),
                type: item.type,
                grabbed: item.grabbed,
            })
        }

        return { tick: this.tickCount, tps: this.tps, players, items }
    }

    broadcastState() {
        this.broadcast({ type: 'game:state', data: this.getState() })
    }
}

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v
}
