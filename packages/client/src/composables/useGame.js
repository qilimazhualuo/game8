import { ref, onUnmounted } from 'vue'
import * as THREE from 'three'
import { onWsMessage, onWsOpen, sendWsMessage, isWsConnected } from '@/common/ws.js'

const ITEM_COLORS = {
    ruby: 0xff2244,
    emerald: 0x22ff66,
    sapphire: 0x4488ff,
    gold: 0xffcc00,
    crystal: 0xaa88ff,
}

const PLAYER_COLORS = [0x55ffff, 0xff8844, 0x44ff88, 0xff55ff]

const PRIZE_X_MIN = -6
const PRIZE_X_MAX = 6
const PRIZE_Z_MIN = -6
const PRIZE_Z_MAX = 6

export function useGame(canvasRef, currentUserRef) {
    const tps = ref(0)
    const connected = ref(false)
    const score = ref(0)
    const clawStatus = ref('idle')
    const clawX = ref(0)
    const clawZ = ref(0)

    let renderer = null
    let scene = null
    let camera = null
    let animFrameId = null
    let cleanupGameState = null
    let cleanupWsOpen = null

    const playerMeshes = new Map()
    const playerNameLabels = new Map()
    const itemMeshes = new Map()
    const clawMeshes = new Map()

    const input = {
        move: { forward: false, backward: false, left: false, right: false },
        claw: { left: false, right: false, up: false, down: false },
    }
    let actionPending = false

    let ceilingGantry = null
    let myUserId = null
    let joined = false
    let myClawMarker = null

    // camera orbit
    let cameraAngle = 0
    const cameraRadius = 14
    const cameraHeight = 12

    // local claw position tracking (for position-based sync)
    let localClawX = 0
    let localClawZ = 0
    let lastClawSendTime = 0
    const CLAW_SEND_INTERVAL = 50

    // --- scene ---

    function animate() {
        animFrameId = requestAnimationFrame(animate)
        if (renderer && scene && camera) {
            renderer.render(scene, camera)
        }
    }

    function resizeRenderer() {
        if (!renderer || !canvasRef.value) return
        const canvas = canvasRef.value
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
    }

    function buildRoom() {
        const floorGeo = new THREE.PlaneGeometry(32, 32)
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a3e, roughness: 0.9, metalness: 0.1 })
        const floor = new THREE.Mesh(floorGeo, floorMat)
        floor.rotation.x = -Math.PI / 2
        floor.receiveShadow = true
        scene.add(floor)

        const pitGeo = new THREE.BoxGeometry(13, 0.3, 13)
        const pitMat = new THREE.MeshStandardMaterial({ color: 0x2a2a5e, roughness: 0.6, metalness: 0.3 })
        const pit = new THREE.Mesh(pitGeo, pitMat)
        pit.position.y = -0.15
        pit.receiveShadow = true
        scene.add(pit)

        const wallMat = new THREE.MeshStandardMaterial({ color: 0x444488, roughness: 0.5, metalness: 0.4 })
        const wallH = 0.4
        const half = 6.5
        for (const [dx, dz] of [[0, -half], [0, half], [-half, 0], [half, 0]]) {
            const w = Math.abs(dx) > 0 ? 0.15 : 13
            const d = Math.abs(dz) > 0 ? 0.15 : 13
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat)
            wall.position.set(dx, wallH / 2, dz)
            scene.add(wall)
        }

        const glassMat = new THREE.MeshStandardMaterial({ color: 0x222244, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
        for (const [dx, dz, w, d] of [[0, -16, 32, 0.3], [0, 16, 32, 0.3], [-16, 0, 0.3, 32], [16, 0, 0.3, 32]]) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), glassMat)
            wall.position.set(dx, 2.5, dz)
            scene.add(wall)
        }
    }

    function buildGantry() {
        const railMat = new THREE.MeshStandardMaterial({ color: 0x6666aa, roughness: 0.3, metalness: 0.7 })
        for (const xSign of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 15), railMat)
            rail.position.set(xSign * 7, 4, 0)
            scene.add(rail)
        }
        const beamMat = new THREE.MeshStandardMaterial({ color: 0x8888cc, roughness: 0.3, metalness: 0.7 })
        const beam = new THREE.Mesh(new THREE.BoxGeometry(15, 0.1, 0.1), beamMat)
        beam.position.y = 4
        ceilingGantry = beam
        scene.add(beam)
    }

    function createClawMesh(playerIndex) {
        const group = new THREE.Group()
        const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
        const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1), mat)
        box.position.y = -0.4
        group.add(box)

        const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.8 })
        const edge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 1.1), edgeMat)
        edge.position.y = -0.2
        group.add(edge)

        return group
    }

    function createPlayerMesh(playerIndex) {
        const group = new THREE.Group()
        const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.7), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
        body.position.y = 0.35
        body.castShadow = true
        group.add(body)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshStandardMaterial({ color: 0xeeeeee }))
        head.position.y = 0.75
        head.castShadow = true
        group.add(head)
        return group
    }

    function createItemMesh(type) {
        const color = ITEM_COLORS[type] || 0xffffff
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7, emissive: color, emissiveIntensity: 0.1 })
        let mesh
        switch (type) {
            case 'ruby':    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), mat); break
            case 'emerald': mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25), mat); break
            case 'sapphire':mesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.35), mat); break
            case 'gold':    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.15, 6), mat); break
            case 'crystal': mesh = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 6), mat); break
            default:        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2), mat)
        }
        mesh.castShadow = true
        return mesh
    }

    function createTextSprite(text) {
        const canvas = document.createElement('canvas')
        canvas.width = 128
        canvas.height = 48
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.beginPath()
        ctx.roundRect(0, 0, 128, 48, 8)
        ctx.fill()
        ctx.font = 'bold 20px "Courier New", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#55ffff'
        ctx.fillText(text, 64, 24)
        const tex = new THREE.CanvasTexture(canvas)
        tex.needsUpdate = true
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
        sprite.scale.set(1.5, 0.6, 1)
        return sprite
    }

    function getPlayerIndex(userId) {
        if (!userId) return 0
        let hash = 0
        for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash) + userId.charCodeAt(i)
        return Math.abs(hash)
    }

    function initScene() {
        const canvas = canvasRef.value
        if (!canvas) return

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
        renderer.setSize(canvas.clientWidth, canvas.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = true

        scene = new THREE.Scene()
        scene.background = new THREE.Color(0x0a0a1e)
        scene.fog = new THREE.Fog(0x0a0a1e, 20, 40)

        camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
        camera.position.set(0, cameraHeight, cameraRadius)
        camera.lookAt(0, 0, 0)

        scene.add(new THREE.AmbientLight(0x303050))

        const dir = new THREE.DirectionalLight(0xffeedd, 1.2)
        dir.position.set(5, 15, 5)
        dir.castShadow = true
        scene.add(dir)

        const fill = new THREE.DirectionalLight(0x4488ff, 0.4)
        fill.position.set(-5, 8, -5)
        scene.add(fill)

        buildRoom()
        buildGantry()

        // local claw marker — always visible, driven by joystick & server sync
        const markerMat = new THREE.MeshStandardMaterial({ color: 0x55ffff, emissive: 0x55ffff, emissiveIntensity: 1 })
        myClawMarker = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), markerMat)
        myClawMarker.position.set(0, 3.6, 0)
        scene.add(myClawMarker)

        animate()
    }

    // --- state sync ---

    function updateScene(state) {
        if (!state) return

        const statePlayers = new Set(state.players.map((p) => p.userId))
        const stateItemIds = new Set(state.items.filter((i) => !i.grabbed).map((i) => i.id))

        for (const p of state.players) {
            let mesh = playerMeshes.get(p.userId)
            if (!mesh) {
                mesh = createPlayerMesh(getPlayerIndex(p.userId))
                scene.add(mesh)
                playerMeshes.set(p.userId, mesh)
                const label = createTextSprite(p.userId.slice(0, 6) + '...')
                scene.add(label)
                playerNameLabels.set(p.userId, label)
            }
            mesh.position.set(p.x, 0, p.z)
            mesh.rotation.y = p.rotationY

            const label = playerNameLabels.get(p.userId)
            if (label) label.position.set(p.x, 1.1, p.z)

            let clawGroup = clawMeshes.get(p.userId)
            if (!clawGroup) {
                clawGroup = createClawMesh(getPlayerIndex(p.userId))
                scene.add(clawGroup)
                clawMeshes.set(p.userId, clawGroup)
            }
            clawGroup.position.set(p.clawX, 4 - p.clawY, p.clawZ)

            if (p.userId === myUserId) {
                score.value = p.score
                clawStatus.value = p.clawState
                clawX.value = p.clawX
                clawZ.value = p.clawZ

            }
        }

        for (const [userId, mesh] of playerMeshes) {
            if (!statePlayers.has(userId)) {
                scene.remove(mesh)
                playerMeshes.delete(userId)
                const label = playerNameLabels.get(userId)
                if (label) { scene.remove(label); playerNameLabels.delete(userId) }
                const claw = clawMeshes.get(userId)
                if (claw) { scene.remove(claw); clawMeshes.delete(userId) }
            }
        }

        for (const item of state.items) {
            let mesh = itemMeshes.get(item.id)
            if (!mesh) {
                mesh = createItemMesh(item.type)
                mesh.position.set(item.x, 0.15, item.z)
                scene.add(mesh)
                itemMeshes.set(item.id, mesh)
            }
            mesh.visible = !item.grabbed
            if (!item.grabbed) {
                mesh.position.x = item.x
                mesh.position.z = item.z
                mesh.position.y = 0.15 + Math.sin(state.tick * 0.05 + item.id) * 0.05
                mesh.rotation.y = state.tick * 0.01 + item.id
            }
        }

        for (const [id, mesh] of itemMeshes) {
            if (!stateItemIds.has(id)) {
                scene.remove(mesh)
                itemMeshes.delete(id)
            }
        }

        if (ceilingGantry && state.players.length > 0) {
            let avgZ = 0
            for (const p of state.players) avgZ += p.clawZ
            ceilingGantry.position.z = avgZ / state.players.length
        }
    }

    // --- input ---

    function sendRaw(move, claw, action) {
        if (!isWsConnected()) return
        sendWsMessage('game:input', {
            data: {
                move: { ...move },
                claw: { ...claw },
                action,
            },
        })
    }

    function dirToKeys(dir) {
        return {
            forward: dir.y < -0.3,
            backward: dir.y > 0.3,
            left: dir.x < -0.3,
            right: dir.x > 0.3,
        }
    }

    function sendClawPos(x, z) {
        if (!isWsConnected()) return
        sendWsMessage('game:input', {
            data: {
                clawPos: { x, z },
                action: false,
            },
        })
    }

    function setRotateInput(dir) {
        const sensitivity = 0.03
        cameraAngle -= (dir.x || 0) * sensitivity
        const cx = Math.sin(cameraAngle) * cameraRadius
        const cz = Math.cos(cameraAngle) * cameraRadius
        camera.position.set(cx, cameraHeight, cz)
        camera.lookAt(0, 0, 0)
    }

    function setClawInput(dir) {
        const now = Date.now()
        if (now - lastClawSendTime < CLAW_SEND_INTERVAL) return
        lastClawSendTime = now

        const step = 0.3
        const dx = dir.x || 0
        const dz = dir.y || 0
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < 0.1) return

        localClawX += (dx / dist) * step
        localClawZ += (dz / dist) * step
        localClawX = Math.min(PRIZE_X_MAX, Math.max(PRIZE_X_MIN, localClawX))
        localClawZ = Math.min(PRIZE_Z_MAX, Math.max(PRIZE_Z_MIN, localClawZ))

        if (myClawMarker) {
            myClawMarker.position.set(localClawX, 3.6, localClawZ)
        }

        sendClawPos(localClawX, localClawZ)
    }

    function triggerGrab() {
        if (!isWsConnected()) return
        sendWsMessage('game:input', {
            data: {
                clawPos: { x: localClawX, z: localClawZ },
                action: true,
            },
        })
    }

    function setupInput() {
        const onKeyDown = (e) => {
            switch (e.code) {
                case 'KeyW': input.move.forward = true; sendRaw(input.move, input.claw, false); break
                case 'KeyS': input.move.backward = true; sendRaw(input.move, input.claw, false); break
                case 'KeyA': input.move.left = true; sendRaw(input.move, input.claw, false); break
                case 'KeyD': input.move.right = true; sendRaw(input.move, input.claw, false); break
                case 'ArrowUp': input.claw.up = true; sendRaw(input.move, input.claw, false); break
                case 'ArrowDown': input.claw.down = true; sendRaw(input.move, input.claw, false); break
                case 'ArrowLeft': input.claw.left = true; sendRaw(input.move, input.claw, false); break
                case 'ArrowRight': input.claw.right = true; sendRaw(input.move, input.claw, false); break
                case 'Space':
                    e.preventDefault()
                    triggerGrab()
                    break
            }
        }
        const onKeyUp = (e) => {
            switch (e.code) {
                case 'KeyW': input.move.forward = false; sendRaw(input.move, input.claw, false); break
                case 'KeyS': input.move.backward = false; sendRaw(input.move, input.claw, false); break
                case 'KeyA': input.move.left = false; sendRaw(input.move, input.claw, false); break
                case 'KeyD': input.move.right = false; sendRaw(input.move, input.claw, false); break
                case 'ArrowUp': input.claw.up = false; sendRaw(input.move, input.claw, false); break
                case 'ArrowDown': input.claw.down = false; sendRaw(input.move, input.claw, false); break
                case 'ArrowLeft': input.claw.left = false; sendRaw(input.move, input.claw, false); break
                case 'ArrowRight': input.claw.right = false; sendRaw(input.move, input.claw, false); break
            }
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)

        const repeatInterval = setInterval(() => {
            sendRaw(input.move, input.claw, false)
        }, 100)

        return () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            clearInterval(repeatInterval)
        }
    }

    // --- lifecycle ---

    let cleanupInput = null

    function start() {
        myUserId = currentUserRef?.value?.id || null

        initScene()

        cleanupGameState = onWsMessage('game:state', (data) => {
            tps.value = data.tps
            connected.value = true

            // retry resolving userId if not set yet
            if (!myUserId) {
                myUserId = currentUserRef?.value?.id || null
            }

            // sync local claw position from authoritative server state
            if (myUserId) {
                const me = data.players.find((p) => p.userId === myUserId)
                if (me) {
                    localClawX = me.clawX
                    localClawZ = me.clawZ
                    if (myClawMarker) {
                        myClawMarker.position.set(me.clawX, 4 - me.clawY - 0.4, me.clawZ)
                    }
                }
            }
            updateScene(data)
        })

        cleanupWsOpen = onWsOpen(() => {
            sendWsMessage('game:join')
        })

        // if already connected, send join immediately
        if (isWsConnected()) {
            sendWsMessage('game:join')
        }

        cleanupInput = setupInput()
    }

    function stop() {
        if (animFrameId) cancelAnimationFrame(animFrameId)
        if (cleanupGameState) cleanupGameState()
        if (cleanupWsOpen) cleanupWsOpen()
        if (cleanupInput) cleanupInput()
        if (renderer) { renderer.dispose(); renderer = null }
        if (myClawMarker) { scene.remove(myClawMarker); myClawMarker = null }
        for (const m of playerMeshes.values()) scene.remove(m)
        playerMeshes.clear()
        for (const m of playerNameLabels.values()) scene.remove(m)
        playerNameLabels.clear()
        for (const m of clawMeshes.values()) scene.remove(m)
        clawMeshes.clear()
        for (const m of itemMeshes.values()) scene.remove(m)
        itemMeshes.clear()
    }

    onUnmounted(stop)

    return { tps, connected, score, clawStatus, clawX, clawZ, resizeRenderer, start, stop, setRotateInput, setClawInput, triggerGrab }
}
